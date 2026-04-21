"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, Environment } from "@react-three/drei";
import * as THREE from "three";
import { useRouter } from "next/navigation";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { getDefaultPersonas } from "@/lib/interview/personaGenerator";
import { getApiKey, generateWithRetry } from "@/lib/ai/gemini";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
type Message = { role: "user" | "assistant"; content: string };

interface AvatarSignal {
  isSpeaking: boolean;
  amplitude: number;
  viseme: string;
}

// ─────────────────────────────────────────────────────
// Interview-type configs
// ─────────────────────────────────────────────────────
const INTERVIEW_CONFIGS: Record<string, {
  label: string;
  openingQuestion: (role: string) => string;
  systemPrompt: (role: string, history: string) => string;
}> = {
  technical: {
    label: "Technical",
    openingQuestion: (role) =>
      `Hi! Let's begin your ${role || "engineering"} technical interview. What's your primary programming language, and roughly how many years have you been using it?`,
    systemPrompt: (role, history) => `You are a senior ${role || "Software Engineer"} conducting a technical interview.

Interview type: TECHNICAL
Focus areas (in priority order):
1. Language-specific concepts (syntax, type system, memory, concurrency)
2. Data structures and algorithms
3. Problem-solving and code reasoning
4. Debugging and code quality
5. Frameworks and tooling specific to the role

Conversation so far:
${history}

Rules:
- Ask ONE short-answer or concept question (e.g. "What's the difference between X and Y?", "How does Z work?", "What would you use X for?")
- Prefer conceptual/short-answer questions over coding or design questions (80% short-answer, 20% scenario)
- NEVER ask system design questions (no "design Twitter", "design a URL shortener", etc.)
- NEVER ask open-ended "tell me about a project" questions
- If the candidate's last answer was incomplete or incorrect, give a brief 1-sentence correction then ask next question
- Keep your ENTIRE response under 40 words
- Do NOT add filler, preamble, or pleasantries

Your response:`,
  },

  hr: {
    label: "HR",
    openingQuestion: (role) =>
      `Hi! Welcome to your HR round for ${role || "this position"}. In two sentences, why are you looking for a new opportunity?`,
    systemPrompt: (role, history) => `You are an HR interviewer conducting a behavioral screening round for a ${role || "professional"} role.

Interview type: HR
Focus areas (in priority order):
1. Motivation and career goals
2. Communication and teamwork
3. Strengths and weaknesses
4. Culture fit and values
5. Salary expectations and availability

Conversation so far:
${history}

Rules:
- Ask ONE focused question at a time
- Prefer short direct questions (e.g. "What's your biggest strength?", "Where do you see yourself in 3 years?")
- Avoid multi-part questions
- Keep your ENTIRE response under 35 words
- No filler or pleasantries

Your response:`,
  },

  system: {
    label: "System Design",
    openingQuestion: (role) =>
      `Hi! Let's start your system design interview for ${role || "this role"}. Before we dive in — what's your preferred tech stack?`,
    systemPrompt: (role, history) => `You are a staff engineer conducting a system design interview for a ${role || "Software Engineer"} role.

Interview type: SYSTEM DESIGN
Focus areas (in priority order):
1. Clarifying requirements (start here)
2. High-level architecture components
3. Scalability and bottlenecks
4. Data modeling and storage choices
5. Trade-offs and alternatives

Conversation so far:
${history}

Rules:
- Ask ONE focused question that advances the design discussion
- Prefer short-answer clarification questions early (e.g. "What's the expected read/write ratio?", "Do we need real-time updates?")
- Save open-ended design questions for after requirements are clear
- Give brief feedback (1 sentence max) before your question
- Keep your ENTIRE response under 45 words

Your response:`,
  },

  behavioral: {
    label: "Behavioral",
    openingQuestion: (role) =>
      `Hi! Let's begin your behavioral interview for ${role || "this role"}. Briefly — what's a recent project you're most proud of?`,
    systemPrompt: (role, history) => `You are an engineering manager conducting a behavioral (STAR-method) interview for a ${role || "professional"} role.

Interview type: BEHAVIORAL
Focus areas (in priority order):
1. Conflict resolution and teamwork
2. Leadership and ownership
3. Handling failure and learning
4. Prioritization under pressure
5. Cross-functional collaboration

Conversation so far:
${history}

Rules:
- Ask ONE behavioral question using STAR framing (situation/task/action/result)
- Prefer targeted short-answer follow-ups when a candidate gives a vague answer (e.g. "What was the outcome?", "Who was involved?")
- Only ask full STAR-style questions every 3rd turn
- Keep your ENTIRE response under 40 words
- No filler or pleasantries

Your response:`,
  },
};

// ─────────────────────────────────────────────────────
// Phoneme → viseme helper
// ─────────────────────────────────────────────────────
function charToViseme(ch: string): string {
  if (/[aæ]/i.test(ch)) return "aa";
  if (/[eɛ]/i.test(ch)) return "E";
  if (/[iɪ]/i.test(ch)) return "I";
  if (/[oɔ]/i.test(ch)) return "O";
  if (/[uʊ]/i.test(ch)) return "U";
  if (/[pb]/i.test(ch)) return "PP";
  if (/[fv]/i.test(ch)) return "FF";
  if (/[td]/i.test(ch)) return "DD";
  if (/[kg]/i.test(ch)) return "kk";
  if (/[sz]/i.test(ch)) return "SS";
  if (/[nm]/i.test(ch)) return "nn";
  if (/[r]/i.test(ch)) return "RR";
  return "sil";
}

const VISEME_MORPH_CANDIDATES: Record<string, string[]> = {
  aa:  ["viseme_aa", "mouthOpen", "jawOpen", "Mouth_Open"],
  E:   ["viseme_E",  "mouthSmile", "Mouth_Smile"],
  I:   ["viseme_I",  "mouthSmileLeft", "mouthSmileRight"],
  O:   ["viseme_O",  "mouthFunnel", "Mouth_O"],
  U:   ["viseme_U",  "mouthPucker", "Mouth_U"],
  PP:  ["viseme_PP", "mouthClose", "Mouth_Close"],
  FF:  ["viseme_FF", "mouthLowerDownLeft"],
  DD:  ["viseme_DD", "mouthUpperUpLeft"],
  kk:  ["viseme_kk", "jawForward"],
  SS:  ["viseme_SS", "mouthShrugUpper"],
  nn:  ["viseme_nn", "mouthShrugLower"],
  RR:  ["viseme_RR", "mouthRollLower"],
  sil: ["viseme_sil"],
};

const BLINK_CANDIDATES = [
  "eyeBlinkLeft", "eyeBlinkRight",
  "EyeBlink_L", "EyeBlink_R",
  "blink", "Blink",
  "eye_close_L", "eye_close_R",
];

// ─────────────────────────────────────────────────────
// 3D Avatar
// ─────────────────────────────────────────────────────
function Avatar({ signal }: { signal: React.MutableRefObject<AvatarSignal> }) {
  const { scene, animations } = useGLTF("/avatars/model.glb");
  const groupRef = useRef<THREE.Group>(null);

  const morphMeshes = useRef<THREE.SkinnedMesh[]>([]);
  const headBone = useRef<THREE.Object3D | null>(null);

  const blinkTimer = useRef(0);
  const blinkPhase = useRef<"idle" | "closing" | "opening">("idle");
  const blinkProgress = useRef(0);
  const nextBlink = useRef(2 + Math.random() * 3);
  const idleT = useRef(Math.random() * 100);

  useEffect(() => {
    scene.traverse((child) => {
      const sm = child as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && sm.morphTargetDictionary) {
        morphMeshes.current.push(sm);
      }
      if (child.name === "Head") headBone.current = child;
    });
  }, [scene]);

  useFrame((_, delta) => {
    idleT.current += delta;
    const t = idleT.current;
    const amp = signal.current.isSpeaking ? signal.current.amplitude : 0;

    if (headBone.current) {
      headBone.current.rotation.x = THREE.MathUtils.lerp(
        headBone.current.rotation.x,
        0.032 + Math.sin(t * 0.35) * 0.015,
        0.05
      );
      headBone.current.rotation.y = THREE.MathUtils.lerp(
        headBone.current.rotation.y,
        Math.sin(t * 0.28) * 0.04 + Math.sin(t * 1.6) * 0.02 * amp,
        0.05
      );
      headBone.current.rotation.z = THREE.MathUtils.lerp(
        headBone.current.rotation.z,
        Math.sin(t * 0.22) * 0.012,
        0.05
      );
    }

    blinkTimer.current += delta;
    if (blinkPhase.current === "idle" && blinkTimer.current >= nextBlink.current) {
      blinkPhase.current = "closing";
      blinkProgress.current = 0;
      blinkTimer.current = 0;
    }
    let blinkValue = 0;
    if (blinkPhase.current !== "idle") {
      blinkProgress.current += delta / 0.07;
      blinkValue = Math.min(1, blinkProgress.current);
      if (blinkPhase.current === "opening") blinkValue = 1 - blinkValue;
      if (blinkProgress.current >= 1) {
        if (blinkPhase.current === "closing") { blinkPhase.current = "opening"; blinkProgress.current = 0; }
        else { blinkPhase.current = "idle"; nextBlink.current = 2 + Math.random() * 3; blinkValue = 0; }
      }
    }

    morphMeshes.current.forEach((mesh) => {
      const dict = mesh.morphTargetDictionary!;
      const inf = mesh.morphTargetInfluences!;

      BLINK_CANDIDATES.forEach((name) => {
        const idx = dict[name];
        if (idx !== undefined) inf[idx] = THREE.MathUtils.lerp(inf[idx], blinkValue, 0.4);
      });

      Object.values(VISEME_MORPH_CANDIDATES).flat().forEach((name) => {
        const idx = dict[name];
        if (idx !== undefined) inf[idx] = THREE.MathUtils.lerp(inf[idx], 0, 0.35);
      });

      const { isSpeaking, amplitude, viseme } = signal.current;
      if (isSpeaking && amplitude > 0.05) {
        const candidates = VISEME_MORPH_CANDIDATES[viseme] || VISEME_MORPH_CANDIDATES["aa"];
        candidates.forEach((name) => {
          const idx = dict[name];
          if (idx !== undefined) inf[idx] = THREE.MathUtils.lerp(inf[idx], amplitude, 0.55);
        });
      }
    });
  });

  return (
    <group ref={groupRef} position={[0, -1.55, 0]} rotation={[0, 0, 0]} scale={1}>
      <primitive object={scene} />
    </group>
  );
}

// ─────────────────────────────────────────────────────
// Avatar tile card
// ─────────────────────────────────────────────────────
function AvatarTile({
  name,
  title,
  signal,
  speaking,
}: {
  name: string;
  title: string;
  signal: React.MutableRefObject<AvatarSignal>;
  speaking: boolean;
}) {
  return (
    <div style={{
      position: "relative", borderRadius: "16px", overflow: "hidden",
      background: "linear-gradient(145deg, #0e1520 0%, #131c2b 100%)",
      border: speaking ? "1.5px solid rgba(82,196,255,0.7)" : "1.5px solid rgba(255,255,255,0.07)",
      boxShadow: speaking ? "0 0 20px rgba(82,196,255,0.2)" : "0 4px 24px rgba(0,0,0,0.4)",
      transition: "border 0.3s ease, box-shadow 0.3s ease",
      height: "100%", minHeight: "260px",
    }}>
      {speaking && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: "16px",
          border: "2px solid rgba(82,196,255,0.3)",
          animation: "speakRing 1.8s ease-in-out infinite",
          pointerEvents: "none", zIndex: 5,
        }} />
      )}

      <Canvas
        shadows
        camera={{ position: [0, 0.15, 1.7], fov: 15 }}
        gl={{ antialias: true, alpha: true }}
        style={{ height: "100%", width: "100%", background: "transparent" }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[1.5, 3, 2]} intensity={1.4} />
        <directionalLight position={[-2, 1, -1]} intensity={0.3} color="#6ab4ff" />
        <pointLight position={[0, 1.5, 1.5]} intensity={0.4} color="#52c4ff" />
        <Environment preset="studio" />
        <Suspense fallback={null}>
          <Avatar signal={signal} />
        </Suspense>
      </Canvas>

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "28px 14px 12px",
        background: "linear-gradient(to top, rgba(6,10,16,0.9) 0%, transparent 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {speaking && (
            <div style={{ display: "flex", gap: "2px", alignItems: "flex-end", height: "14px" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: "3px", height: "100%", borderRadius: "2px", background: "#52c4ff",
                  animation: "bar 0.55s ease-in-out infinite",
                  animationDelay: `${i * 0.12}s`,
                }} />
              ))}
            </div>
          )}
          <span style={{ color: "#fff", fontSize: "13px", fontWeight: 600, letterSpacing: "0.02em" }}>{name}</span>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", marginLeft: "auto" }}>{title}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main Client Component
// ─────────────────────────────────────────────────────
export default function InterviewRoomClient() {
  const router = useRouter();
  const { speak, stop } = useTextToSpeech();
  const { start, stop: stopSTT, transcript: liveText, finalTranscript } = useSpeechToText();

  const [config, setConfig] = useState({
    role: "", type: "technical", interviewerCount: 2, duration: 20,
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lipSyncAlive = useRef(false);

  const signalRefs = useRef<React.MutableRefObject<AvatarSignal>[]>([
    { current: { isSpeaking: false, amplitude: 0, viseme: "sil" } },
    { current: { isSpeaking: false, amplitude: 0, viseme: "sil" } },
    { current: { isSpeaking: false, amplitude: 0, viseme: "sil" } },
  ]);

  // ── Config ──
  useEffect(() => {
    try {
      const s = localStorage.getItem("interviewConfig");
      if (s) setConfig(JSON.parse(s));
    } catch {}
  }, []);

  const personas = getDefaultPersonas(config.interviewerCount);

  // ── Timer ──
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      lipSyncAlive.current = false;
      speechSynthesis.cancel();
    };
  }, []);

  // ── Auto-scroll transcript ──
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcriptLines]);

  // ── Camera ──
  useEffect(() => {
    if (isCameraOn && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraOn]);

  // ── Lip sync driver ──
  const startLipSync = useCallback((speakerIdx: number, text: string) => {
    lipSyncAlive.current = false;
    setTimeout(() => {
      lipSyncAlive.current = true;
      setActiveSpeaker(speakerIdx);
      setIsSpeaking(true);

      signalRefs.current.forEach((ref) => {
        ref.current.isSpeaking = false;
        ref.current.amplitude = 0;
        ref.current.viseme = "sil";
      });
      signalRefs.current[speakerIdx].current.isSpeaking = true;

      const words = text.trim().split(/\s+/);
      const estimatedMs = words.length * 430;

      let useOscillation = true;

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const currentUtter = (window as any).__currentUtterance;
        if (currentUtter) {
          useOscillation = false;
          currentUtter.onboundary = (event: any) => {
            const char = event.utterance.text.charAt(event.charIndex);
            if (char) {
              signalRefs.current[speakerIdx].current.viseme = charToViseme(char);
              signalRefs.current[speakerIdx].current.amplitude = Math.random() * 0.5 + 0.5;
            }
          };
        }
      }

      if (useOscillation) {
        const startTime = Date.now();
        let phase = 0;
        const tick = () => {
          if (!lipSyncAlive.current) return;
          const elapsed = Date.now() - startTime;
          if (elapsed >= estimatedMs) {
            signalRefs.current[speakerIdx].current.isSpeaking = false;
            signalRefs.current[speakerIdx].current.amplitude = 0;
            signalRefs.current[speakerIdx].current.viseme = "sil";
            setIsSpeaking(false);
            return;
          }
          phase += 0.33;
          const vowels = ["aa", "O", "E", "I", "U"];
          const openness = Math.abs(Math.sin(phase * Math.PI));
          signalRefs.current[speakerIdx].current.amplitude = 0.3 + openness * 0.6;
          signalRefs.current[speakerIdx].current.viseme =
            openness > 0.5 ? vowels[Math.floor(phase) % vowels.length] : "sil";
          setTimeout(tick, 100);
        };
        tick();
      }
    }, 10);
  }, []);

  // ── First question ──
  useEffect(() => {
    if (!config.role && !config.type) return;
    const interviewType = config.type in INTERVIEW_CONFIGS ? config.type : "technical";
    const interviewCfg = INTERVIEW_CONFIGS[interviewType];
    const q = interviewCfg.openingQuestion(config.role);

    const utter = new SpeechSynthesisUtterance(q);
    (window as any).__currentUtterance = utter;
    speechSynthesis.speak(utter);
    startLipSync(0, q);
    setMessages([{ role: "assistant", content: q }]);
    setTranscriptLines([`Interviewer: ${q}`]);
  }, [config.role, config.type]);

  // ── Camera toggle ──
  const toggleCamera = useCallback(async () => {
    if (!isCameraOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        setIsCameraOn(true);
      } catch {
        setError("Camera access denied");
      }
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsCameraOn(false);
    }
  }, [isCameraOn]);

  // ── AI response ──
  const handleUserMessage = useCallback(async (userText: string) => {
    if (!userText.trim()) return;
    setError(null);

    const apiKey = getApiKey();
    if (!apiKey) {
      setError("Please configure your Gemini API key in Settings first.");
      return;
    }

    const updated: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(updated);
    setTranscriptLines((t) => [...t, `You: ${userText}`]);

    const nextSpeaker = (activeSpeaker + 1) % Math.min(personas.length, 3);

    // Build compact conversation history (last 6 turns only)
    const history = updated.slice(-6)
      .map((m) => `${m.role === "user" ? "Candidate" : "Interviewer"}: ${m.content}`)
      .join("\n");

    // Use interview-type specific prompt
    const interviewType = config.type in INTERVIEW_CONFIGS ? config.type : "technical";
    const prompt = INTERVIEW_CONFIGS[interviewType].systemPrompt(config.role, history);

    let aiText = "";
    try {
      aiText = await generateWithRetry(prompt);
    } catch (err: any) {
      setError(`AI error: ${err.message}`);
      return;
    }

    // Strip any accidental preamble like "Interviewer:" prefix the model may add
    aiText = aiText.replace(/^(Interviewer|AI|Assistant):\s*/i, "").trim();

    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(aiText);
    (window as any).__currentUtterance = utter;
    speechSynthesis.speak(utter);
    speak(aiText);
    startLipSync(nextSpeaker, aiText);
    setActiveSpeaker(nextSpeaker);
    setMessages([...updated, { role: "assistant", content: aiText }]);
    setTranscriptLines((t) => [...t, `Interviewer: ${aiText}`]);
  }, [messages, activeSpeaker, config, personas, speak, startLipSync]);

  const handleMic = useCallback(() => {
    if (!isRecording) {
      start();
      setIsRecording(true);
    } else {
      stopSTT();
      setIsRecording(false);
      const text = finalTranscript || liveText;
      if (text.trim()) handleUserMessage(text);
    }
  }, [isRecording, start, stopSTT, finalTranscript, liveText, handleUserMessage]);

  const handleEnd = useCallback(() => {
    lipSyncAlive.current = false;
    stop();
    speechSynthesis.cancel();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    router.push("/");
  }, [stop, router]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const interviewerCount = Math.min(personas.length, 3);
  const interviewLabel = INTERVIEW_CONFIGS[config.type]?.label ?? config.type;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Syne', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        @keyframes speakRing {
          0%,100% { opacity:0.4; transform:scale(1); }
          50% { opacity:0.9; transform:scale(1.008); }
        }
        @keyframes bar {
          0%,100% { transform:scaleY(0.25); }
          50% { transform:scaleY(1); }
        }
        @keyframes recPulse {
          0%,100% { box-shadow:0 0 0 0 rgba(239,68,68,0.45); }
          50% { box-shadow:0 0 0 8px rgba(239,68,68,0); }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(5px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>

      <div style={{
        height: "100vh", display: "flex", overflow: "hidden", color: "#fff",
        background: "radial-gradient(ellipse at 15% 15%, #0b1624 0%, #07090f 55%, #040508 100%)",
        fontFamily: "'Syne', sans-serif",
      }}>

        {/* ══ LEFT: Avatars + user cam ══ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px", gap: "12px", minWidth: 0 }}>

          {/* Top bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#52c4ff", boxShadow: "0 0 8px #52c4ff" }} />
              <span className="mono" style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" }}>Live Interview</span>
            </div>
            <div className="mono" style={{ display: "flex", gap: "20px", fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
              <span>{config.role || "Software Engineer"} · {interviewLabel}</span>
              <span style={{ color: elapsed > config.duration * 60 * 0.8 ? "#fb923c" : "#52c4ff" }}>
                {fmt(elapsed)} / {String(config.duration).padStart(2, "0")}:00
              </span>
            </div>
          </div>

          {/* Avatar grid */}
          <div style={{
            flex: 1, display: "grid", gap: "12px",
            gridTemplateColumns: interviewerCount === 1 ? "1fr" : "1fr 1fr",
            gridTemplateRows: interviewerCount <= 2 ? "1fr" : "1fr 1fr",
          }}>
            {personas.slice(0, interviewerCount).map((p, i) => (
              <AvatarTile
                key={p.id}
                name={p.name}
                title={p.role || "Interviewer"}
                signal={signalRefs.current[i]}
                speaking={isSpeaking && activeSpeaker === i}
              />
            ))}

            {/* User tile */}
            <div style={{
              position: "relative", borderRadius: "16px", overflow: "hidden",
              background: "linear-gradient(145deg, #0e1520 0%, #131c2b 100%)",
              border: "1.5px solid rgba(255,255,255,0.07)",
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: "200px",
            }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: "100%", height: "100%", objectFit: "cover",
                  transform: "scaleX(-1)",
                  display: isCameraOn ? "block" : "none",
                }}
              />
              {!isCameraOn && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px" }}>👤</div>
                  <span className="mono" style={{ color: "rgba(255,255,255,0.2)", fontSize: "11px" }}>Camera off</span>
                </div>
              )}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                padding: "24px 14px 10px",
                background: "linear-gradient(to top, rgba(4,6,10,0.9) 0%, transparent 100%)",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>You</span>
                {isRecording && (
                  <span className="mono" style={{ marginLeft: "auto", fontSize: "10px", padding: "2px 8px", borderRadius: "20px", background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>● REC</span>
                )}
              </div>
            </div>
          </div>

          {/* Live transcript preview */}
          {isRecording && liveText && (
            <div className="mono" style={{
              padding: "10px 14px", borderRadius: "10px", fontSize: "12px",
              color: "rgba(255,255,255,0.65)",
              background: "rgba(82,196,255,0.07)",
              border: "1px solid rgba(82,196,255,0.18)",
              animation: "fadeUp 0.25s ease",
            }}>
              {liveText}
            </div>
          )}
        </div>

        {/* ══ RIGHT: Transcript panel ══ */}
        <div style={{
          width: "300px", display: "flex", flexDirection: "column",
          borderLeft: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(5,8,14,0.7)",
          backdropFilter: "blur(16px)",
        }}>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>Transcript</span>
            <span className="mono" style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "20px", background: "rgba(82,196,255,0.1)", color: "#52c4ff" }}>
              {transcriptLines.length}
            </span>
          </div>

          {error && (
            <div className="mono" style={{ margin: "8px 12px 0", padding: "8px 12px", borderRadius: "8px", fontSize: "11px", background: "rgba(239,68,68,0.08)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)" }}>
              {error}
            </div>
          )}

          <div ref={transcriptRef} style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {transcriptLines.map((line, i) => {
              const isAI = line.startsWith("Interviewer:");
              return (
                <div key={i} style={{
                  padding: "10px 12px", borderRadius: "10px", fontSize: "12px", lineHeight: "1.55",
                  background: isAI ? "rgba(82,196,255,0.06)" : "rgba(255,255,255,0.03)",
                  borderLeft: `2px solid ${isAI ? "rgba(82,196,255,0.45)" : "rgba(255,255,255,0.12)"}`,
                  color: isAI ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.55)",
                  animation: "fadeUp 0.25s ease",
                }}>
                  <div className="mono" style={{ fontSize: "9px", fontWeight: 500, letterSpacing: "0.1em", color: isAI ? "#52c4ff" : "rgba(255,255,255,0.28)", marginBottom: "4px", textTransform: "uppercase" }}>
                    {isAI ? "Interviewer" : "You"}
                  </div>
                  {line.replace(/^(Interviewer|You): /, "")}
                </div>
              );
            })}
          </div>

          <div style={{ padding: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: "8px" }}>
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && textInput.trim()) { handleUserMessage(textInput); setTextInput(""); } }}
              placeholder="Type a response..."
              style={{ flex: 1, padding: "9px 12px", borderRadius: "10px", fontSize: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.85)", outline: "none", fontFamily: "'Syne', sans-serif" }}
            />
            <button
              onClick={() => { if (textInput.trim()) { handleUserMessage(textInput); setTextInput(""); } }}
              style={{ padding: "9px 14px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "rgba(82,196,255,0.12)", color: "#52c4ff", border: "1px solid rgba(82,196,255,0.25)", cursor: "pointer", fontFamily: "'Syne', sans-serif" }}
            >Send</button>
          </div>
        </div>

        {/* ══ FLOATING CONTROLS ══ */}
        <div style={{
          position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 18px", borderRadius: "18px", zIndex: 50,
          background: "rgba(5,8,14,0.88)", backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 8px 48px rgba(0,0,0,0.65)",
        }}>
          <button onClick={handleMic} title={isRecording ? "Stop" : "Speak"} style={{
            width: "50px", height: "50px", borderRadius: "50%", fontSize: "18px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isRecording ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.06)",
            border: `1.5px solid ${isRecording ? "rgba(239,68,68,0.55)" : "rgba(255,255,255,0.1)"}`,
            cursor: "pointer", transition: "all 0.2s",
            animation: isRecording ? "recPulse 1s ease infinite" : "none",
          }}>🎤</button>

          <button onClick={toggleCamera} title={isCameraOn ? "Camera off" : "Camera on"} style={{
            width: "50px", height: "50px", borderRadius: "50%", fontSize: "18px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isCameraOn ? "rgba(82,196,255,0.15)" : "rgba(255,255,255,0.06)",
            border: `1.5px solid ${isCameraOn ? "rgba(82,196,255,0.5)" : "rgba(255,255,255,0.1)"}`,
            cursor: "pointer", transition: "all 0.2s",
          }}>📷</button>

          <div style={{ width: "1px", height: "32px", background: "rgba(255,255,255,0.07)" }} />

          <button onClick={() => { stop(); router.push("/interview-prep/chat"); }} style={{
            height: "50px", padding: "0 16px", borderRadius: "25px", fontSize: "13px", fontWeight: 500,
            display: "flex", alignItems: "center", gap: "6px",
            background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.55)", cursor: "pointer", transition: "all 0.2s",
            fontFamily: "'Syne', sans-serif",
          }}>💬 Chat</button>

          <button onClick={handleEnd} style={{
            height: "50px", padding: "0 16px", borderRadius: "25px", fontSize: "13px", fontWeight: 600,
            display: "flex", alignItems: "center", gap: "6px",
            background: "rgba(239,68,68,0.14)", border: "1.5px solid rgba(239,68,68,0.38)",
            color: "#f87171", cursor: "pointer", transition: "all 0.2s",
            fontFamily: "'Syne', sans-serif",
          }}>✕ End</button>
        </div>
      </div>
    </>
  );
}

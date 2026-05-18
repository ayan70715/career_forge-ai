"use client";


import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";
import { useRouter } from "next/navigation";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { generatePersonas, getDefaultPersonas } from "@/lib/interview/personaGenerator";
import type { InterviewerPersona } from "@/lib/interview/personaGenerator";
import { getApiKey, generateWithRetry } from "@/lib/ai/gemini";

// ─────────────────────────────────────────────────────
// Puter.js fallback — used when Gemini quota is exceeded
// puter is loaded via CDN script tag (window.puter), no npm install needed
// ─────────────────────────────────────────────────────
async function generateWithPuter(prompt: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puter = (window as any).puter;
  if (!puter?.ai?.chat) throw new Error("Puter not available");
  const response = await puter.ai.chat(prompt, { model: "gpt-4o-mini" });
  // puter.ai.chat returns either a string or {message:{content:string}}
  if (typeof response === "string") return response;
  return response?.message?.content ?? response?.content ?? String(response);
}

// Tries Gemini first; on quota/rate-limit errors falls back to puter.js
async function generateWithFallback(prompt: string): Promise<string> {
  try {
    return await generateWithRetry(prompt);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Quota exceeded (429) or any Gemini error → try puter
    console.warn("[AI] Gemini failed, trying puter.js fallback:", msg);
    return await generateWithPuter(prompt);
  }
}

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
type Message = { role: "user" | "assistant"; speakerIndex: number; content: string };

interface AvatarSignal {
  isSpeaking: boolean;
  amplitude: number;
  viseme: string;
}

interface InterviewConfig {
  role: string;
  type: string;
  interviewerCount: number;
  duration: number;
  resumeText: string | null;
}

// Model paths mapped by 0-based index
const MODEL_PATHS = [
  "/avatars/model1.glb",
  "/avatars/model2.glb",
  "/avatars/model3.glb",
];

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
// 3D Avatar — loads the model at the given path
// ─────────────────────────────────────────────────────
function Avatar({
  signal,
  modelPath,
}: {
  signal: React.MutableRefObject<AvatarSignal>;
  modelPath: string;
}) {
  const { scene } = useGLTF(modelPath);
  const groupRef = useRef<THREE.Group>(null);
  const morphMeshes = useRef<THREE.SkinnedMesh[]>([]);
  const headBone = useRef<THREE.Object3D | null>(null);
  const blinkTimer = useRef(0);
  const blinkPhase = useRef<"idle" | "closing" | "opening">("idle");
  const blinkProgress = useRef(0);
  const nextBlink = useRef(2 + Math.random() * 3);
  const idleT = useRef(Math.random() * 100);

  useEffect(() => {
    morphMeshes.current = [];
    headBone.current = null;
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
        -0.35 + Math.sin(t * 0.35) * 0.015, 
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
        if (blinkPhase.current === "closing") {
          blinkPhase.current = "opening";
          blinkProgress.current = 0;
        } else {
          blinkPhase.current = "idle";
          nextBlink.current = 2 + Math.random() * 3;
          blinkValue = 0;
        }
      }
    }

    morphMeshes.current.forEach((mesh) => {
      const dict = mesh.morphTargetDictionary!;
      const inf = mesh.morphTargetInfluences!;

      BLINK_CANDIDATES.forEach((name) => {
        const idx = dict[name];
        if (idx !== undefined) inf[idx] = THREE.MathUtils.lerp(inf[idx], blinkValue, 0.4);
      });

      const { isSpeaking, amplitude, viseme } = signal.current;
      const activeVisemeMorphs = new Set(
        (VISEME_MORPH_CANDIDATES[viseme] ?? VISEME_MORPH_CANDIDATES["aa"])
      );

      // Decay all viseme morphs toward 0 — but skip the currently active ones
      // so the decay lerp doesn't fight the drive lerp on the same frame
      Object.values(VISEME_MORPH_CANDIDATES).flat().forEach((name) => {
        if (isSpeaking && activeVisemeMorphs.has(name)) return; // driven below
        const idx = dict[name];
        if (idx !== undefined) inf[idx] = THREE.MathUtils.lerp(inf[idx], 0, 0.25);
      });

      // Drive the active viseme morph targets toward the current amplitude
      if (isSpeaking && amplitude > 0.02) {
        activeVisemeMorphs.forEach((name) => {
          const idx = dict[name];
          if (idx !== undefined) {
            inf[idx] = THREE.MathUtils.lerp(inf[idx], amplitude, 0.45);
          }
        });
      }
    });
  });

  return (
    <group ref={groupRef} position={[0, -1.65, 0]} rotation={[0, 0, 0]} scale={1}>
      <primitive object={scene} />
    </group>
  );
}

// ─────────────────────────────────────────────────────
// Avatar tile — loads the correct model per index
// ─────────────────────────────────────────────────────
function AvatarTile({
  name,
  title,
  signal,
  speaking,
  modelIndex,
}: {
  name: string;
  title: string;
  signal: React.MutableRefObject<AvatarSignal>;
  speaking: boolean;
  modelIndex: number;
}) {
  const modelPath = MODEL_PATHS[modelIndex] ?? MODEL_PATHS[0];

  return (
    <div style={{
      position: "relative", borderRadius: "16px", overflow: "hidden",
      background: "var(--interview-surface)",
      border: speaking ? "1.5px solid rgba(82,196,255,0.7)" : "1.5px solid var(--interview-border)",
      boxShadow: speaking ? "0 0 20px rgba(82,196,255,0.2)" : "0 4px 24px rgba(0,0,0,0.4)",
      transition: "border 0.3s ease, box-shadow 0.3s ease",
      height: "100%",
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
        camera={{ position: [0, 0.28, 0.69], fov: 23 }} 
        gl={{ antialias: true, alpha: true }}
        style={{ height: "100%", width: "100%", background: "transparent" }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[1.5, 3, 2]} intensity={1.4} />
        <directionalLight position={[-2, 1, -1]} intensity={0.3} color="#6ab4ff" />
        <pointLight position={[0, 1.5, 1.5]} intensity={0.4} color="#52c4ff" />
        <Environment preset="studio" />
        <Suspense fallback={null}>
          <Avatar signal={signal} modelPath={modelPath} />
        </Suspense>
      </Canvas>

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "28px 14px 12px",
        background: "var(--interview-avatar-overlay)",
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
          <span style={{ color: "var(--interview-text)", fontSize: "13px", fontWeight: 600, letterSpacing: "0.02em" }}>{name}</span>
          <span style={{ color: "var(--interview-text-dim)", fontSize: "11px", marginLeft: "auto" }}>{title}</span>
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
  const { stop } = useTextToSpeech();
  const { start, stop: stopSTT, transcript: liveText, finalTranscript } = useSpeechToText();

  const [config, setConfig] = useState<InterviewConfig>({
    role: "", type: "technical", interviewerCount: 2, duration: 20, resumeText: null,
  });

  // Personas start as defaults, get replaced by Gemini-generated ones after mount
  const [personas, setPersonas] = useState<InterviewerPersona[]>(() =>
    getDefaultPersonas(2)
  );
  const [personasReady, setPersonasReady] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isThinking, setIsThinking] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lipSyncAlive = useRef(false);
  const interviewStarted = useRef(false);
  // Tracks how many interviewer questions have been asked (used for difficulty + question-type scheduling)
  const questionCount = useRef(0);
  // AbortController for any in-flight AI request — cancelled on unmount/exit
  const aiAbortRef = useRef<AbortController | null>(null);
  // Flag flipped to true the moment we start leaving — prevents any post-exit AI callbacks from firing
  const isExiting = useRef(false);

  const signalRefs = useRef<React.MutableRefObject<AvatarSignal>[]>([
    { current: { isSpeaking: false, amplitude: 0, viseme: "sil" } },
    { current: { isSpeaking: false, amplitude: 0, viseme: "sil" } },
    { current: { isSpeaking: false, amplitude: 0, viseme: "sil" } },
  ]);

  // ── Load config + generate Gemini personas ──
  useEffect(() => {
    let stored: InterviewConfig = {
      role: "", type: "technical", interviewerCount: 2, duration: 20, resumeText: null,
    };
    try {
      const s = localStorage.getItem("interviewConfig");
      if (s) stored = JSON.parse(s);
    } catch {}
    setConfig(stored);

    const count = Math.min(stored.interviewerCount || 2, 3);

    // Generate role-aware personas from Gemini
    generatePersonas(stored.role, stored.type, count)
      .then((generated) => {
        setPersonas(generated);
        setPersonasReady(true);
      })
      .catch(() => {
        setPersonas(getDefaultPersonas(count));
        setPersonasReady(true);
      });
  }, []);

  // ── Timer ──
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Load puter.js CDN for AI fallback ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).puter) return; // already loaded
    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // ── Full teardown — stored in a ref so it is always stable (no dependency churn) ──
  // We keep stop/stopSTT in their own refs so teardown can always call the latest version
  // without needing them in its dependency array (which would make teardown unstable).
  const stopRef = useRef(stop);
  const stopSTTRef = useRef(stopSTT);
  useEffect(() => { stopRef.current = stop; }, [stop]);
  useEffect(() => { stopSTTRef.current = stopSTT; }, [stopSTT]);

  const teardown = useCallback(() => {
    isExiting.current = true;
    lipSyncAlive.current = false;
    // Cancel any in-flight AI request so its callback never fires
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    // Kill all speech immediately
    if (typeof window !== "undefined") speechSynthesis.cancel();
    stopRef.current?.(); // TTS hook cleanup
    // Silence all avatar signals
    signalRefs.current.forEach((ref) => {
      ref.current.isSpeaking = false;
      ref.current.amplitude = 0;
      ref.current.viseme = "sil";
    });
    // Stop microphone
    stopSTTRef.current?.();
    // Stop camera stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []); // stable — no deps, reads everything through refs

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => { teardown(); };
  }, [teardown]);

  // ── Intercept browser back / navigate away (client-side only) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => { teardown(); };
    const handleBeforeUnload = () => { teardown(); };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [teardown]); // teardown is now stable so this runs exactly once

  // ── Auto-scroll transcript ──
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcriptLines]);

  // ── Camera srcObject assignment ──
  useEffect(() => {
    if (isCameraOn && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraOn]);

  // ── Lip sync driver ──
  // Strategy: ALWAYS run the oscillation loop for smooth continuous mouth movement.
  // Use onboundary ONLY to update the viseme shape — not as the sole animation driver,
  // since boundary events are sparse (word-level) and unreliable in Chrome.
  const startLipSync = useCallback((speakerIdx: number, text: string) => {
    // Kill any previous oscillation loop
    lipSyncAlive.current = false;

    // Silence ALL avatars before activating the new speaker
    signalRefs.current.forEach((ref) => {
      ref.current.isSpeaking = false;
      ref.current.amplitude = 0;
      ref.current.viseme = "sil";
    });

    setActiveSpeaker(speakerIdx);
    setIsSpeaking(true);
    signalRefs.current[speakerIdx].current.isSpeaking = true;
    signalRefs.current[speakerIdx].current.viseme = "aa";

    const sig = signalRefs.current[speakerIdx];
    let speechEndedVia = false;

    // Attach boundary handler to update viseme shape from real speech
    const currentUtter = (window as unknown as Record<string, unknown>)
      .__currentUtterance as SpeechSynthesisUtterance | undefined;

    if (currentUtter) {
      currentUtter.onboundary = (event: SpeechSynthesisEvent) => {
        if (!sig.current.isSpeaking) return;
        const char = event.utterance.text.charAt(event.charIndex);
        if (char) sig.current.viseme = charToViseme(char);
      };
      currentUtter.onend = () => { speechEndedVia = true; };
      currentUtter.onerror = () => { speechEndedVia = true; };
    }

    // Oscillation loop — always runs to keep mouth moving smoothly between boundaries
    lipSyncAlive.current = true;
    const words = text.trim().split(/\s+/);
    const estimatedMs = Math.max(words.length * 420, 800);
    const startTime = Date.now();
    let phase = 0;

    const tick = () => {
      if (!lipSyncAlive.current) return;
      if (!sig.current.isSpeaking) return;

      const elapsedMs = Date.now() - startTime;
      if (speechEndedVia || elapsedMs >= estimatedMs) {
        sig.current.isSpeaking = false;
        sig.current.amplitude = 0;
        sig.current.viseme = "sil";
        setIsSpeaking(false);
        return;
      }

      phase += 0.38;
      const vowels: string[] = ["aa", "O", "E", "I", "U"];
      const openness = Math.abs(Math.sin(phase * Math.PI));
      sig.current.amplitude = 0.12 + openness * 0.25;
      if (openness > 0.45) {
        sig.current.viseme = vowels[Math.floor(phase * 0.5) % vowels.length];
      } else {
        sig.current.viseme = "sil";
      }
      setTimeout(tick, 80);
    };
    tick();
  }, []);

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

  // ── Speak helper — speaks text as persona[speakerIdx] ──
  // Only uses speechSynthesis directly — the useTextToSpeech speak() call was removed
  // because it queued a second competing utterance that broke boundary events.
  const speakAs = useCallback((speakerIdx: number, text: string) => {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    // Must be set BEFORE startLipSync so the boundary handler can be attached to it
    (window as unknown as Record<string, unknown>).__currentUtterance = utter;
    startLipSync(speakerIdx, text);
    // Small defer so cancel() has fully flushed before enqueueing the new utterance
    setTimeout(() => speechSynthesis.speak(utter), 50);
  }, [startLipSync]);

  // ── Generate opening question from Gemini once personas are ready ──
  useEffect(() => {
    if (!personasReady || interviewStarted.current) return;
    interviewStarted.current = true;

    const firstPersona = personas[0];
    const resumeContext = config.resumeText
      ? `\n\nCandidate's resume for context:\n${config.resumeText.slice(0, 1500)}`
      : "";

    const prompt = `You are ${firstPersona.name}, a ${firstPersona.role}.
Your interviewing style: ${firstPersona.style}
You are opening a ${config.type} interview for the role of "${config.role || "Software Engineer"}".${resumeContext}

Generate a natural, professional opening statement and first question appropriate for your role and style.
Keep it to 2-3 sentences. Be specific to the role and interview type. Do NOT say "certainly" or "sure".

QUESTION RULES (this is question #1 — the very start of the interview):
- Type: short-answer conceptual (e.g. "What is X?" or "Define Y in one line.") — no coding, no essays
- Difficulty: absolute beginner level — a basic definition or "what does X stand for?" style question
- The candidate should be able to answer in a single sentence
- Do NOT ask a multi-part or compound question

Respond with just the spoken text, nothing else.`;

    generateWithFallback(prompt)
      .then((openingText) => {
        if (isExiting.current) return; // navigated away before opening finished
        speakAs(0, openingText);
        setMessages([{ role: "assistant", speakerIndex: 0, content: openingText }]);
        setTranscriptLines([`${firstPersona.name}: ${openingText}`]);
      })
      .catch(() => {
        if (isExiting.current) return;
        // Fallback opening if Gemini fails
        const fallback = `Hi, welcome to your ${config.type} interview for the ${config.role || "Software Engineer"} role. Let's start — can you briefly introduce yourself?`;
        speakAs(0, fallback);
        setMessages([{ role: "assistant", speakerIndex: 0, content: fallback }]);
        setTranscriptLines([`${firstPersona.name}: ${fallback}`]);
      });
  }, [personasReady, personas, config, speakAs]);

  // ── Handle candidate message — Gemini decides next speaker + generates response ──
  const handleUserMessage = useCallback(async (userText: string) => {
    if (!userText.trim()) return;
    setError(null);
    setIsThinking(true);

    const apiKey = getApiKey();
    if (!apiKey) {
      setError("Please configure your Gemini API key in Settings first.");
      setIsThinking(false);
      return;
    }

    const updatedMessages: Message[] = [...messages, { role: "user", speakerIndex: -1, content: userText }];
    setMessages(updatedMessages);
    setTranscriptLines((t) => [...t, `You: ${userText}`]);

    const interviewerCount = Math.min(personas.length, 3);
    const resumeContext = config.resumeText
      ? `\nCandidate resume context: ${config.resumeText.slice(0, 800)}`
      : "";

    const personaDescriptions = personas.slice(0, interviewerCount).map((p, i) =>
      `Interviewer ${i} — ${p.name} (${p.role}): ${p.style}`
    ).join("\n");

    const history = updatedMessages.slice(-8)
      .map((m) => {
        if (m.role === "user") return `Candidate: ${m.content}`;
        const p = personas[m.speakerIndex];
        return `${p?.name ?? "Interviewer"} (${p?.role ?? ""}): ${m.content}`;
      })
      .join("\n");

    const lastSpeakerIdx = updatedMessages.filter(m => m.role === "assistant").slice(-1)[0]?.speakerIndex ?? -1;
    const nextInRotation = (lastSpeakerIdx + 1) % interviewerCount;

    // ── Determine question type and difficulty based on question count ──
    const qNum = questionCount.current + 1; // 1-based number of the question about to be asked
    const isCodingQuestion   = qNum % 3 === 0;          // every 3rd  → coding
    const isDescriptiveQuestion = qNum % 5 === 0 && !isCodingQuestion; // every 5th (non-coding) → descriptive

    // Difficulty tier: ramps up gradually every 3 questions
    const difficultyTier = Math.min(Math.floor((qNum - 1) / 3), 4); // 0–4
    const difficultyLabel = ["very easy — basic definitions only", "easy — simple conceptual", "medium — requires some depth", "hard — edge cases and trade-offs", "advanced — system design or deep internals"][difficultyTier];

    const questionTypeInstruction = isCodingQuestion
      ? `QUESTION TYPE: Live coding / pseudocode. Ask the candidate to write or trace through a small, focused piece of code relevant to the role. Keep the problem short enough to solve in ~5 minutes.`
      : isDescriptiveQuestion
      ? `QUESTION TYPE: Descriptive / explanatory. Ask the candidate to explain a concept, process, or design decision in a short paragraph (3–5 sentences). Encourage them to give reasoning, not just facts.`
      : `QUESTION TYPE: Short-answer conceptual. The candidate should be able to answer in ONE sentence or a very short phrase. Ask for a definition, a quick comparison, or a factual "what/why/when" question. Do NOT ask for elaboration or examples unless critical.`;

    const prompt = `You are coordinating a ${config.type} interview panel for the role of "${config.role || "Software Engineer"}".${resumeContext}

The interview panel consists of:
${personaDescriptions}

Conversation so far:
${history}

The last interviewer who spoke was index ${lastSpeakerIdx}. The next interviewer in rotation is index ${nextInRotation}.

─── QUESTION SCHEDULING (strictly enforce) ───
This is question #${qNum} in the interview.
Difficulty level: ${difficultyLabel}
${questionTypeInstruction}

─── SPEAKER SELECTION ───
1. DEFAULT: Follow round-robin rotation — next speaker is index ${nextInRotation}.
2. EXCEPTION: Override ONLY if the candidate's answer strongly demands a specific interviewer's expertise. Max 1 override per 4 turns.

─── RESPONSE RULES ───
- Ask exactly ONE question — no compound or multi-part questions
- 1–2 sentences max (question only, no preamble unless naturally transitioning)
- Do NOT repeat any previous question
- Stay in character as the chosen interviewer
- Do NOT say "certainly", "great answer", "sure", or similar filler

Respond ONLY in this exact JSON format (no markdown, no code blocks):
{
  "speakerIndex": <0, 1, or 2>,
  "response": "The interviewer's spoken response here"
}`;

    // Create a fresh AbortController for this request; store it so teardown can cancel it
    const controller = new AbortController();
    aiAbortRef.current = controller;

    try {
      let text = (await generateWithFallback(prompt)).trim();

      // If we exited while the request was in-flight, drop the result silently
      if (isExiting.current || controller.signal.aborted) return;

      text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      const data = JSON.parse(text) as { speakerIndex: number; response: string };

      const nextIdx = Math.max(0, Math.min(data.speakerIndex, interviewerCount - 1));
      const aiText = data.response || "Could you elaborate on that?";
      const speaker = personas[nextIdx];

      questionCount.current += 1; // advance the counter so the next question uses the correct type/difficulty
      setIsThinking(false);
      speakAs(nextIdx, aiText);
      setMessages([...updatedMessages, { role: "assistant", speakerIndex: nextIdx, content: aiText }]);
      setTranscriptLines((t) => [...t, `${speaker.name}: ${aiText}`]);
    } catch (err: unknown) {
      if (isExiting.current) return; // swallow errors that fire after exit
      setIsThinking(false);
      const message = err instanceof Error ? err.message : "AI error";
      setError(message);
    }
  }, [messages, config, personas, speakAs]);

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
    // Save data first, then teardown so transcriptLines is still intact
    localStorage.setItem("interviewRawData", JSON.stringify({
      transcript: transcriptLines.join("\n"),
      config,
      elapsed,
    }));
    localStorage.removeItem("interviewReport");
    teardown();
    router.push("/interview-prep/report");
  }, [teardown, router, transcriptLines, config, elapsed]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const interviewerCount = Math.min(personas.length, 3);

  return (
    <>

      {/* Theme-aware CSS variables for interview room */}
      <style>{`
        :root {
          --interview-bg: #f8fafc;
          --interview-surface: #f1f5f9;
          --interview-panel: rgba(248,250,252,0.85);
          --interview-panel-solid: rgba(248,250,252,0.95);
          --interview-border: rgba(0,0,0,0.1);
          --interview-text: #0f172a;
          --interview-text-muted: #334155;
          --interview-text-dim: #64748b;
          --interview-input-bg: #f1f5f9;
          --interview-btn-bg: rgba(0,0,0,0.05);
          --interview-avatar-overlay: linear-gradient(to top, rgba(230,236,242,0.92) 0%, transparent 100%);
        }
        .dark {
          --interview-bg: radial-gradient(ellipse at 15% 15%, #0b1624 0%, #07090f 55%, #040508 100%);
          --interview-surface: linear-gradient(145deg, #0e1520 0%, #131c2b 100%);
          --interview-panel: rgba(5,8,14,0.7);
          --interview-panel-solid: rgba(5,8,14,0.88);
          --interview-border: rgba(255,255,255,0.07);
          --interview-text: rgba(255,255,255,0.9);
          --interview-text-muted: rgba(255,255,255,0.75);
          --interview-text-dim: rgba(255,255,255,0.45);
          --interview-input-bg: rgba(255,255,255,0.05);
          --interview-btn-bg: rgba(255,255,255,0.06);
          --interview-avatar-overlay: linear-gradient(to top, rgba(6,10,16,0.9) 0%, transparent 100%);
        }
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Syne', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(127,127,127,0.2); border-radius: 2px; }
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
        @keyframes thinkPulse {
          0%,100% { opacity:0.3; }
          50% { opacity:1; }
        }
      `}</style>

      <div style={{
        height: "100vh", display: "flex", overflow: "hidden", color: "var(--interview-text)",
        background: "var(--interview-bg)",
        fontFamily: "'Syne', sans-serif",
      }}>

        {/* ══ LEFT: Avatars + user cam ══ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 16px 80px", gap: "12px", minWidth: 0, overflow: "hidden" }}>

          {/* Top bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#52c4ff", boxShadow: "0 0 8px #52c4ff" }} />
              <span className="mono" style={{ color: "var(--interview-text-dim)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" }}>Live Interview</span>
              {isThinking && (
                <span className="mono" style={{ fontSize: "10px", color: "#52c4ff", animation: "thinkPulse 1s ease infinite" }}>
                  ··· thinking
                </span>
              )}
            </div>
            <div className="mono" style={{ display: "flex", gap: "20px", fontSize: "11px", color: "var(--interview-text-dim)" }}>
              <span>{config.role || "Software Engineer"} · {config.type}</span>
              <span style={{ color: elapsed > config.duration * 60 * 0.8 ? "#fb923c" : "#52c4ff" }}>
                {fmt(elapsed)} / {String(config.duration).padStart(2, "0")}:00
              </span>
            </div>
          </div>

          {/* Avatar grid
              1 interviewer  → 1 col stacked vertically, centered, wider  (interviewer on top, user below)
              2 interviewers → 2 cols × 2 rows (3 tiles)
              3 interviewers → 2 cols × 2 rows (4 tiles)
          */}
          <div style={{
            flex: 1,
            display: "grid",
            gap: "12px",
            minHeight: 0,
            overflow: "hidden",
            // 1 interviewer: single column, constrained width, centered
            // 2/3 interviewers: two columns, slightly inset so tiles aren't edge-to-edge
            // Change gridTemplateColumns and maxWidth logic
            gridTemplateColumns: interviewerCount === 1 ? "1fr" : "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            maxWidth: interviewerCount === 1 ? "480px" : "80%", // Increased from 460px, decreased from 92%
            width: "100%",
            margin: "0 auto", // Center it for all modes
            alignSelf: "stretch",
          }}>
            {personas.slice(0, interviewerCount).map((p, i) => (
              <AvatarTile
                key={p.id}
                name={p.name}
                title={p.role}
                signal={signalRefs.current[i]}
                speaking={isSpeaking && activeSpeaker === i}
                modelIndex={i}
              />
            ))}

            {/* User tile */}
            <div style={{
              position: "relative", borderRadius: "16px", overflow: "hidden",
              background: "var(--interview-surface)",
              border: "1.5px solid var(--interview-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              
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
                  <span className="mono" style={{ color: "var(--interview-text-dim)", fontSize: "11px" }}>Camera off</span>
                </div>
              )}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                padding: "24px 14px 10px",
                background: "var(--interview-avatar-overlay)",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--interview-text)" }}>You</span>
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
              color: "var(--interview-text-muted)",
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
          borderLeft: "1px solid var(--interview-border)",
          background: "var(--interview-panel)",
          backdropFilter: "blur(16px)",
        }}>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--interview-border)" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--interview-text)" }}>Transcript</span>
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
              const isAI = !line.startsWith("You:");
              const speakerName = isAI ? line.split(":")[0] : "You";
              return (
                <div key={i} style={{
                  padding: "10px 12px", borderRadius: "10px", fontSize: "12px", lineHeight: "1.55",
                  background: isAI ? "rgba(82,196,255,0.08)" : "var(--interview-btn-bg)",
                  borderLeft: `2px solid ${isAI ? "rgba(82,196,255,0.45)" : "var(--interview-border)"}`,
                  color: "var(--interview-text-muted)",
                  animation: "fadeUp 0.25s ease",
                }}>
                  <div className="mono" style={{ fontSize: "9px", fontWeight: 500, letterSpacing: "0.1em", color: isAI ? "#52c4ff" : "var(--interview-text-dim)", marginBottom: "4px", textTransform: "uppercase" }}>
                    {speakerName}
                  </div>
                  {line.replace(/^[^:]+: /, "")}
                </div>
              );
            })}
            {isThinking && (
              <div style={{
                padding: "10px 12px", borderRadius: "10px", fontSize: "12px",
                background: "rgba(82,196,255,0.04)",
                borderLeft: "2px solid rgba(82,196,255,0.2)",
                animation: "thinkPulse 1s ease infinite",
              }}>
                <div className="mono" style={{ fontSize: "9px", color: "#52c4ff", marginBottom: "4px" }}>INTERVIEWER</div>
                <span style={{ color: "var(--interview-text-dim)" }}>···</span>
              </div>
            )}
          </div>

          <div style={{ padding: "12px", borderTop: "1px solid var(--interview-border)", display: "flex", gap: "8px" }}>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.shiftKey && textInput.trim() && !isThinking) {
                  e.preventDefault();
                  handleUserMessage(textInput);
                  setTextInput("");
                }
                // plain Enter = new line (default textarea behavior)
              }}
              placeholder={"Type a response...\nShift+Enter to send"}
              disabled={isThinking}
              rows={2}
              style={{ flex: 1, padding: "9px 12px", borderRadius: "10px", fontSize: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--interview-text)", outline: "none", fontFamily: "'Syne', sans-serif", opacity: isThinking ? 0.5 : 1, resize: "none", lineHeight: "1.5" }}
            />
            <button
              onClick={() => { if (textInput.trim() && !isThinking) { handleUserMessage(textInput); setTextInput(""); } }}
              disabled={isThinking}
              style={{ padding: "9px 14px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "rgba(82,196,255,0.12)", color: "#52c4ff", border: "1px solid rgba(82,196,255,0.25)", cursor: isThinking ? "not-allowed" : "pointer", fontFamily: "'Syne', sans-serif", opacity: isThinking ? 0.5 : 1 }}
            >Send</button>
          </div>
        </div>

        {/* ══ FLOATING CONTROLS ══ */}
        <div style={{
          position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 18px", borderRadius: "18px", zIndex: 50,
          background: "var(--interview-panel-solid)", backdropFilter: "blur(20px)",
          border: "1px solid var(--interview-border)",
          boxShadow: "0 8px 48px rgba(0,0,0,0.65)",
        }}>
          <button onClick={handleMic} title={isRecording ? "Stop" : "Speak"} disabled={isThinking} style={{
            width: "50px", height: "50px", borderRadius: "50%", fontSize: "18px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isRecording ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.06)",
            border: `1.5px solid ${isRecording ? "rgba(239,68,68,0.55)" : "rgba(255,255,255,0.1)"}`,
            cursor: isThinking ? "not-allowed" : "pointer", transition: "all 0.2s",
            animation: isRecording ? "recPulse 1s ease infinite" : "none",
            opacity: isThinking ? 0.5 : 1,
          }}>🎤</button>

          <button onClick={toggleCamera} title={isCameraOn ? "Camera off" : "Camera on"} style={{
            width: "50px", height: "50px", borderRadius: "50%", fontSize: "18px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isCameraOn ? "rgba(82,196,255,0.15)" : "rgba(255,255,255,0.06)",
            border: `1.5px solid ${isCameraOn ? "rgba(82,196,255,0.5)" : "rgba(255,255,255,0.1)"}`,
            cursor: "pointer", transition: "all 0.2s",
          }}>📷</button>

          <div style={{ width: "1px", height: "32px", background: "var(--interview-border)" }} />

          <button onClick={() => { teardown(); router.push("/interview-prep/chat"); }} style={{
            height: "50px", padding: "0 16px", borderRadius: "25px", fontSize: "13px", fontWeight: 500,
            display: "flex", alignItems: "center", gap: "6px",
            background: "var(--interview-btn-bg)", border: "1.5px solid var(--interview-border)",
            color: "var(--interview-text-dim)", cursor: "pointer", transition: "all 0.2s",
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

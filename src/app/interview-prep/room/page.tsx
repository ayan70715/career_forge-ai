"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { getDefaultPersonas } from "@/lib/interview/personaGenerator";
import { useRouter } from "next/navigation";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations, OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Message = {
  role: "user" | "assistant";
  content: string;
};

// ─────────────────────────────────────────────
// RPM Preset Avatar URLs (public GLB)
// These are preset avatars from Ready Player Me public CDN.
// Swap these URLs with your own RPM avatar URLs if needed.
// ─────────────────────────────────────────────
const RPM_AVATAR_URLS = [
  "https://models.readyplayer.me/64f2f3dc5c55f5001e9d4d78.glb?morphTargets=ARKit,Oculus Visemes&textureAtlas=none&lod=0",
  "https://models.readyplayer.me/638df693d72bffc6fa17943c.glb?morphTargets=ARKit,Oculus Visemes&textureAtlas=none&lod=0",
  "https://models.readyplayer.me/6437ecbc46b4301b2d5c6d5c.glb?morphTargets=ARKit,Oculus Visemes&textureAtlas=none&lod=0",
];

// ─────────────────────────────────────────────
// Oculus Viseme Map (phoneme → morph target index)
// RPM models include Oculus OVR visemes as morph targets
// ─────────────────────────────────────────────
const VISEME_MAP: Record<string, string> = {
  // Oculus OVR viseme morph targets included in RPM models
  sil: "viseme_sil",
  PP: "viseme_PP",
  FF: "viseme_FF",
  TH: "viseme_TH",
  DD: "viseme_DD",
  kk: "viseme_kk",
  CH: "viseme_CH",
  SS: "viseme_SS",
  nn: "viseme_nn",
  RR: "viseme_RR",
  aa: "viseme_aa",
  E: "viseme_E",
  I: "viseme_I",
  O: "viseme_O",
  U: "viseme_U",
};

// Simple phoneme → viseme mapping for Web Speech API words
const PHONEME_TO_VISEME: Array<{ regex: RegExp; viseme: string }> = [
  { regex: /[aæɑ]/i, viseme: "aa" },
  { regex: /[eɛ]/i, viseme: "E" },
  { regex: /[iɪ]/i, viseme: "I" },
  { regex: /[oɔ]/i, viseme: "O" },
  { regex: /[uʊ]/i, viseme: "U" },
  { regex: /[pb]/i, viseme: "PP" },
  { regex: /[fv]/i, viseme: "FF" },
  { regex: /[θð]/i, viseme: "TH" },
  { regex: /[td]/i, viseme: "DD" },
  { regex: /[kg]/i, viseme: "kk" },
  { regex: /[tʃdʒʃʒ]/i, viseme: "CH" },
  { regex: /[sz]/i, viseme: "SS" },
  { regex: /[nm]/i, viseme: "nn" },
  { regex: /[r]/i, viseme: "RR" },
];

function getVisemeFromChar(char: string): string {
  for (const { regex, viseme } of PHONEME_TO_VISEME) {
    if (regex.test(char)) return viseme;
  }
  return "sil";
}

// ─────────────────────────────────────────────
// Shared speaking state (ref-based, no re-render)
// ─────────────────────────────────────────────
interface AvatarControls {
  isSpeaking: boolean;
  amplitude: number; // 0–1 audio amplitude for mouth
  currentViseme: string;
}

// ─────────────────────────────────────────────
// 3D Avatar Component
// ─────────────────────────────────────────────
interface AvatarProps {
  url: string;
  controlsRef: React.MutableRefObject<AvatarControls>;
  isActive: boolean; // true = this interviewer is currently speaking
}

function Avatar({ url, controlsRef, isActive }: AvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(url);
  const meshRef = useRef<THREE.SkinnedMesh | null>(null);

  // Blinking state
  const blinkTimer = useRef(0);
  const blinkDuration = useRef(0);
  const isBlinking = useRef(false);
  const nextBlinkIn = useRef(Math.random() * 3 + 2); // 2–5 sec

  // Head movement
  const headBone = useRef<THREE.Bone | null>(null);
  const idleTime = useRef(Math.random() * 100);

  // Mouth morph targets
  const morphMeshes = useRef<THREE.SkinnedMesh[]>([]);

  useEffect(() => {
    const meshes: THREE.SkinnedMesh[] = [];
    scene.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = child as THREE.SkinnedMesh;
        meshes.push(sm);
        if (sm.name.toLowerCase().includes("wolf3d_head") || sm.name.toLowerCase().includes("head")) {
          meshRef.current = sm;
        }
      }
      if (child.type === "Bone" && child.name.toLowerCase().includes("head")) {
        headBone.current = child as THREE.Bone;
      }
    });
    morphMeshes.current = meshes;
  }, [scene]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    idleTime.current += delta;

    // ── Idle head movement ──────────────────────────
    if (headBone.current) {
      const t = idleTime.current;
      // Gentle nod + slight yaw
      headBone.current.rotation.x = Math.sin(t * 0.4) * 0.04;
      headBone.current.rotation.y = Math.sin(t * 0.3) * 0.06;
      headBone.current.rotation.z = Math.sin(t * 0.25) * 0.02;

      // When speaking: slightly more active head movement
      if (isActive && controlsRef.current.isSpeaking) {
        headBone.current.rotation.x += Math.sin(t * 2.5) * 0.03 * controlsRef.current.amplitude;
        headBone.current.rotation.y += Math.sin(t * 1.8) * 0.04 * controlsRef.current.amplitude;
      }
    }

    // ── Blinking ────────────────────────────────────
    blinkTimer.current += delta;
    if (!isBlinking.current && blinkTimer.current >= nextBlinkIn.current) {
      isBlinking.current = true;
      blinkDuration.current = 0;
    }
    if (isBlinking.current) {
      blinkDuration.current += delta;
      const blinkProgress = blinkDuration.current / 0.15; // 150ms blink
      const blinkValue = blinkProgress < 0.5
        ? blinkProgress * 2
        : 2 - blinkProgress * 2;
      const clamped = Math.max(0, Math.min(1, blinkValue));

      morphMeshes.current.forEach((mesh) => {
        if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
        const leftIdx = mesh.morphTargetDictionary["eyeBlinkLeft"];
        const rightIdx = mesh.morphTargetDictionary["eyeBlinkRight"];
        if (leftIdx !== undefined) mesh.morphTargetInfluences[leftIdx] = clamped;
        if (rightIdx !== undefined) mesh.morphTargetInfluences[rightIdx] = clamped;
      });

      if (blinkDuration.current >= 0.15) {
        isBlinking.current = false;
        blinkTimer.current = 0;
        nextBlinkIn.current = Math.random() * 3 + 2;
      }
    }

    // ── Lip Sync (only for active/speaking avatar) ──
    if (isActive) {
      const { isSpeaking, amplitude, currentViseme } = controlsRef.current;

      morphMeshes.current.forEach((mesh) => {
        if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

        // Reset all visemes
        Object.values(VISEME_MAP).forEach((name) => {
          const idx = mesh.morphTargetDictionary![name];
          if (idx !== undefined) {
            mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(
              mesh.morphTargetInfluences![idx],
              0,
              0.3
            );
          }
        });

        if (isSpeaking && amplitude > 0.01) {
          const visemeName = VISEME_MAP[currentViseme] || VISEME_MAP["aa"];
          const idx = mesh.morphTargetDictionary![visemeName];
          if (idx !== undefined) {
            mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(
              mesh.morphTargetInfluences![idx],
              amplitude,
              0.4
            );
          }
        }
      });
    }
  });

  return (
    <group ref={groupRef} position={[0, -1.6, 0]} scale={1.8}>
      <primitive object={scene} />
    </group>
  );
}

// ─────────────────────────────────────────────
// Avatar Card (Canvas wrapper)
// ─────────────────────────────────────────────
interface AvatarCardProps {
  name: string;
  role: string;
  avatarUrl: string;
  controlsRef: React.MutableRefObject<AvatarControls>;
  isActive: boolean;
  isSpeaking: boolean;
}

function AvatarCard({ name, role, avatarUrl, controlsRef, isActive, isSpeaking }: AvatarCardProps) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #0d1117 0%, #161b22 100%)",
        border: isSpeaking && isActive
          ? "2px solid rgba(99, 210, 255, 0.8)"
          : "2px solid rgba(255,255,255,0.06)",
        boxShadow: isSpeaking && isActive
          ? "0 0 24px rgba(99, 210, 255, 0.3), inset 0 0 40px rgba(0,0,0,0.5)"
          : "inset 0 0 40px rgba(0,0,0,0.5)",
        transition: "border 0.3s, box-shadow 0.3s",
      }}
    >
      {/* Speaking indicator pulse ring */}
      {isSpeaking && isActive && (
        <div
          className="absolute inset-0 rounded-2xl z-10 pointer-events-none"
          style={{
            animation: "speakPulse 1.5s ease-in-out infinite",
            border: "2px solid rgba(99,210,255,0.4)",
          }}
        />
      )}

      {/* 3D Canvas */}
      <div className="w-full" style={{ height: "240px" }}>
        <Canvas
          camera={{ position: [0, 0.2, 2.2], fov: 35 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[2, 4, 3]} intensity={1.2} />
          <directionalLight position={[-2, 2, -2]} intensity={0.4} color="#8ab4f8" />
          <pointLight position={[0, 2, 2]} intensity={0.5} color="#63d2ff" />
          <Environment preset="city" />
          <Suspense fallback={null}>
            <Avatar url={avatarUrl} controlsRef={controlsRef} isActive={isActive} />
          </Suspense>
        </Canvas>
      </div>

      {/* Name tag */}
      <div
        className="absolute bottom-0 left-0 right-0 px-3 py-2"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center gap-2">
          {isSpeaking && isActive && (
            <div className="flex gap-0.5 items-end h-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-0.5 rounded-full"
                  style={{
                    background: "#63d2ff",
                    animation: `soundBar 0.6s ease-in-out infinite`,
                    animationDelay: `${i * 0.1}s`,
                    height: "100%",
                  }}
                />
              ))}
            </div>
          )}
          <span className="text-white text-sm font-semibold tracking-wide">{name}</span>
          <span className="text-xs text-white/50 ml-auto">{role}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function InterviewRoomPage() {
  const router = useRouter();
  const { speak, stop } = useTextToSpeech();
  const { start, stop: stopSTT, transcript: liveText, finalTranscript } = useSpeechToText();

  const [config, setConfig] = useState({
    role: "",
    type: "technical",
    interviewerCount: 2,
    duration: 20,
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geminiFailed, setGeminiFailed] = useState(false);
  const [activeSpeakerIdx, setActiveSpeakerIdx] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  // One controls ref per interviewer (up to 3)
  const avatarControls = useRef<AvatarControls[]>([
    { isSpeaking: false, amplitude: 0, currentViseme: "sil" },
    { isSpeaking: false, amplitude: 0, currentViseme: "sil" },
    { isSpeaking: false, amplitude: 0, currentViseme: "sil" },
  ]);

  // ── Config ──
  useEffect(() => {
    const stored = localStorage.getItem("interviewConfig");
    if (stored) setConfig(JSON.parse(stored));
  }, []);

  // ── Timer ──
  useEffect(() => {
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Puter fallback ──
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const personas = getDefaultPersonas(config.interviewerCount);

  // ── Lip sync via Web Audio API (analyser on speechSynthesis output) ──
  // We hook into the audio output stream via AudioContext destination capture.
  // On supported browsers, speechSynthesis audio goes through the audio graph.
  const startLipSync = (speakerIdx: number, text: string) => {
    setActiveSpeakerIdx(speakerIdx);
    setIsSpeaking(true);

    // Reset all
    avatarControls.current.forEach((c) => {
      c.isSpeaking = false;
      c.amplitude = 0;
      c.currentViseme = "sil";
    });

    avatarControls.current[speakerIdx].isSpeaking = true;

    // Animate amplitude based on text character stream (fallback since
    // direct audio capture of speechSynthesis is restricted cross-browser)
    let charIdx = 0;
    const chars = text.split("");

    const tick = () => {
      if (charIdx >= chars.length) {
        avatarControls.current[speakerIdx].isSpeaking = false;
        avatarControls.current[speakerIdx].amplitude = 0;
        avatarControls.current[speakerIdx].currentViseme = "sil";
        setIsSpeaking(false);
        return;
      }

      const char = chars[charIdx];
      const viseme = getVisemeFromChar(char);
      const isVowel = /[aeiou]/i.test(char);
      const isSpace = char === " ";

      avatarControls.current[speakerIdx].currentViseme = viseme;
      avatarControls.current[speakerIdx].amplitude = isSpace
        ? 0
        : isVowel
          ? 0.6 + Math.random() * 0.4
          : 0.3 + Math.random() * 0.3;

      charIdx++;
      // ~120 wpm average = ~10 chars/sec
      const delay = isSpace ? 80 : 55 + Math.random() * 40;
      setTimeout(tick, delay);
    };

    tick();
  };

  const stopLipSync = () => {
    avatarControls.current.forEach((c) => {
      c.isSpeaking = false;
      c.amplitude = 0;
      c.currentViseme = "sil";
    });
    setIsSpeaking(false);
  };

  // ── First question ──
  useEffect(() => {
    let first = "Tell me about yourself.";
    if (config.type === "technical") {
      first = `Hi, let's begin your ${config.role || "technical"} interview. Can you briefly introduce yourself and your technical background?`;
    } else if (config.type === "hr") {
      first = `Hi, let's begin your HR round for ${config.role}. Tell me about yourself and your motivations.`;
    } else if (config.type === "system") {
      first = `Let's start your system design interview for ${config.role}. Can you walk me through a system you've built?`;
    } else if (config.type === "behavioral") {
      first = `Let's start your behavioral interview. Tell me about a challenging situation you handled.`;
    }

    speak(first);
    startLipSync(0, first);
    setMessages([{ role: "assistant", content: first }]);
    setTranscript([`Interviewer: ${first}`]);
  }, [config]);

  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
      stopLipSync();
    };
  }, []);

  // ── Camera ──
  const toggleCamera = async () => {
    if (!isCameraOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setIsCameraOn(true);
      } catch {
        setError("Camera denied");
      }
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsCameraOn(false);
    }
  };

  // ── AI Response ──
  const handleUserMessage = async (userText: string) => {
    if (!userText.trim()) return;
    setError(null);

    const updated: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(updated);
    setTranscript((t) => [...t, `You: ${userText}`]);

    // Rotate speakers
    const nextSpeaker = (activeSpeakerIdx + 1) % Math.min(personas.length, RPM_AVATAR_URLS.length);

    const history = updated
      .slice(-6)
      .map((m) => `${m.role === "user" ? "Candidate" : "Interviewer"}: ${m.content}`)
      .join("\n");

    const prompt = `You are a professional interviewer.\nRole: ${config.role || "Software Engineer"}\nInterview Type: ${config.type}\nConversation:\n${history}\nRules:\n- Do NOT repeat questions\n- Ask ONE question only\n- If candidate asks → answer first\n- Match difficulty based on type\n- Be realistic interviewer\nRespond:`;

    let aiText = "";

    if (!geminiFailed) {
      try {
        const res = await fetch("/api/interview/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: updated, persona: personas[nextSpeaker] }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        aiText = data.text;
      } catch (err: any) {
        setGeminiFailed(true);
        try {
          aiText = await (window as any).puter.ai.chat(prompt);
          setError(`⚠️ Gemini failed: ${err.message}`);
        } catch {
          setError("AI failed");
          return;
        }
      }
    } else {
      try {
        aiText = await (window as any).puter.ai.chat(prompt);
      } catch {
        setError("Fallback failed");
        return;
      }
    }

    speechSynthesis.cancel();
    speak(aiText);
    startLipSync(nextSpeaker, aiText);

    setMessages([...updated, { role: "assistant", content: aiText }]);
    setTranscript((t) => [...t, `Interviewer: ${aiText}`]);
  };

  const handleMic = () => {
    if (!isRecording) {
      start();
      setIsRecording(true);
    } else {
      stopSTT();
      setIsRecording(false);
      const text = finalTranscript || liveText;
      handleUserMessage(text);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const interviewerCount = Math.min(personas.length, RPM_AVATAR_URLS.length);

  return (
    <>
      {/* Global keyframe animations */}
      <style>{`
        @keyframes speakPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.01); }
        }
        @keyframes soundBar {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes recordPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
        }
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');
        
        * { font-family: 'DM Sans', sans-serif; }
        .mono { font-family: 'Space Mono', monospace; }
        
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      <div
        className="h-screen flex overflow-hidden text-white"
        style={{
          background: "radial-gradient(ellipse at 20% 20%, #0d1b2a 0%, #060a10 60%, #000 100%)",
        }}
      >
        {/* ── LEFT: Avatar Grid + User Cam ── */}
        <div className="flex-1 flex flex-col p-4 gap-3 min-w-0">

          {/* Header bar */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: "#63d2ff", boxShadow: "0 0 8px #63d2ff" }}
              />
              <span className="text-white/60 text-xs mono uppercase tracking-widest">
                Live Interview
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-white/40 mono">
              <span>{config.role || "Software Engineer"} · {config.type}</span>
              <span
                style={{
                  color: elapsedSeconds > config.duration * 60 * 0.8 ? "#f97316" : "#63d2ff",
                }}
              >
                {formatTime(elapsedSeconds)} / {config.duration}:00
              </span>
            </div>
          </div>

          {/* Interviewer avatars */}
          <div
            className="grid gap-3 flex-1"
            style={{
              gridTemplateColumns: interviewerCount === 1 ? "1fr" : "repeat(2, 1fr)",
              gridTemplateRows: interviewerCount <= 2 ? "1fr" : "repeat(2, 1fr)",
            }}
          >
            {personas.slice(0, interviewerCount).map((p, i) => (
              <AvatarCard
                key={p.id}
                name={p.name}
                role={p.role || "Interviewer"}
                avatarUrl={RPM_AVATAR_URLS[i]}
                controlsRef={{ current: avatarControls.current[i] }}
                isActive={i === activeSpeakerIdx}
                isSpeaking={isSpeaking && i === activeSpeakerIdx}
              />
            ))}

            {/* User camera tile */}
            <div
              className="relative rounded-2xl overflow-hidden flex items-center justify-center"
              style={{
                background: "linear-gradient(160deg, #0d1117 0%, #161b22 100%)",
                border: "2px solid rgba(255,255,255,0.06)",
                minHeight: "200px",
              }}
            >
              {isCameraOn ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }} // mirror
                />
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    👤
                  </div>
                  <span className="text-white/30 text-xs mono">Camera off</span>
                </div>
              )}
              <div
                className="absolute bottom-0 left-0 right-0 px-3 py-2"
                style={{
                  background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)",
                }}
              >
                <span className="text-white text-sm font-medium">You</span>
                {isRecording && (
                  <span
                    className="ml-2 text-xs px-2 py-0.5 rounded-full mono"
                    style={{ background: "rgba(239,68,68,0.2)", color: "#f87171" }}
                  >
                    ● REC
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Live transcript preview */}
          {isRecording && liveText && (
            <div
              className="px-4 py-2 rounded-xl text-sm text-white/70 mono"
              style={{
                background: "rgba(99,210,255,0.08)",
                border: "1px solid rgba(99,210,255,0.2)",
                animation: "fadeIn 0.3s ease",
              }}
            >
              {liveText}
            </div>
          )}
        </div>

        {/* ── RIGHT: Transcript Panel ── */}
        <div
          className="flex flex-col"
          style={{
            width: "320px",
            borderLeft: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(6,10,16,0.6)",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* Panel header */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <span className="text-white/80 text-sm font-semibold tracking-wide">Transcript</span>
            <span
              className="text-xs px-2 py-0.5 rounded-full mono"
              style={{ background: "rgba(99,210,255,0.1)", color: "#63d2ff" }}
            >
              {transcript.length} messages
            </span>
          </div>

          {error && (
            <div
              className="mx-3 mt-2 px-3 py-2 rounded-lg text-xs mono"
              style={{ background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              {error}
            </div>
          )}

          {/* Transcript messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {transcript.map((t, i) => {
              const isInterviewer = t.startsWith("Interviewer:");
              return (
                <div
                  key={i}
                  className="px-3 py-2 rounded-xl text-xs leading-relaxed"
                  style={{
                    background: isInterviewer
                      ? "rgba(99,210,255,0.07)"
                      : "rgba(255,255,255,0.04)",
                    borderLeft: isInterviewer
                      ? "2px solid rgba(99,210,255,0.4)"
                      : "2px solid rgba(255,255,255,0.1)",
                    animation: "fadeIn 0.3s ease",
                    color: isInterviewer ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.6)",
                  }}
                >
                  <span
                    className="mono uppercase text-xs font-bold block mb-1"
                    style={{ color: isInterviewer ? "#63d2ff" : "rgba(255,255,255,0.35)", fontSize: "0.65rem", letterSpacing: "0.08em" }}
                  >
                    {isInterviewer ? "Interviewer" : "You"}
                  </span>
                  {t.replace(/^(Interviewer|You): /, "")}
                </div>
              );
            })}
          </div>

          {/* Text input */}
          <div
            className="p-3 flex gap-2"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleUserMessage(textInput);
                  setTextInput("");
                }
              }}
              className="flex-1 px-3 py-2 rounded-xl text-sm outline-none placeholder-white/20"
              placeholder="Type a response..."
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.9)",
              }}
            />
            <button
              onClick={() => { handleUserMessage(textInput); setTextInput(""); }}
              className="px-3 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: "rgba(99,210,255,0.15)",
                color: "#63d2ff",
                border: "1px solid rgba(99,210,255,0.3)",
              }}
            >
              Send
            </button>
          </div>
        </div>

        {/* ── FLOATING CONTROLS ── */}
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 px-5 py-3 rounded-2xl z-50"
          style={{
            background: "rgba(6,10,16,0.85)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          }}
        >
          {/* Mic */}
          <button
            onClick={handleMic}
            className="w-13 h-13 rounded-full flex items-center justify-center text-lg transition-all duration-200 active:scale-90"
            style={{
              width: "52px",
              height: "52px",
              background: isRecording
                ? "rgba(239,68,68,0.2)"
                : "rgba(255,255,255,0.07)",
              border: isRecording
                ? "1.5px solid rgba(239,68,68,0.6)"
                : "1.5px solid rgba(255,255,255,0.1)",
              animation: isRecording ? "recordPulse 1s ease infinite" : "none",
            }}
            title={isRecording ? "Stop recording" : "Start recording"}
          >
            🎤
          </button>

          {/* Camera */}
          <button
            onClick={toggleCamera}
            className="w-13 h-13 rounded-full flex items-center justify-center text-lg transition-all duration-200 active:scale-90"
            style={{
              width: "52px",
              height: "52px",
              background: isCameraOn
                ? "rgba(99,210,255,0.15)"
                : "rgba(255,255,255,0.07)",
              border: isCameraOn
                ? "1.5px solid rgba(99,210,255,0.5)"
                : "1.5px solid rgba(255,255,255,0.1)",
            }}
            title={isCameraOn ? "Turn off camera" : "Turn on camera"}
          >
            📷
          </button>

          {/* Divider */}
          <div style={{ width: "1px", background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />

          {/* Chat mode */}
          <button
            onClick={() => { stop(); router.push("/interview-prep/chat"); }}
            className="flex items-center gap-2 px-4 rounded-full text-sm font-medium transition-all duration-200 active:scale-90"
            style={{
              height: "52px",
              background: "rgba(255,255,255,0.07)",
              border: "1.5px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            💬 <span>Chat</span>
          </button>

          {/* End */}
          <button
            onClick={() => {
              stop();
              speechSynthesis.cancel();
              stopLipSync();
              streamRef.current?.getTracks().forEach((t) => t.stop());
              router.push("/");
            }}
            className="flex items-center gap-2 px-4 rounded-full text-sm font-semibold transition-all duration-200 active:scale-90"
            style={{
              height: "52px",
              background: "rgba(239,68,68,0.15)",
              border: "1.5px solid rgba(239,68,68,0.4)",
              color: "#f87171",
            }}
          >
            ✕ <span>End</span>
          </button>
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { getDefaultPersonas } from "@/lib/interview/personaGenerator";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
type Message = { role: "user" | "assistant"; content: string };

// Shared ref object updated every frame — no re-renders
interface AvatarSignal {
  isSpeaking: boolean;
  amplitude: number;   // 0–1
  viseme: string;      // e.g. "aa", "O", "sil"
}

// ─────────────────────────────────────────────────────
// CSS Placeholder Avatar Tile (no Three.js / no GLB)
// Swap this out for the real AvatarTile when model.glb is ready
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
  // Drive a simple mouth-open CSS animation from the signal
  const mouthRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      if (mouthRef.current) {
        const h = speaking ? 2 + signal.current.amplitude * 10 : 2;
        mouthRef.current.style.height = `${h}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking, signal]);

  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{
      position: "relative", borderRadius: "16px", overflow: "hidden",
      background: "linear-gradient(145deg, #0e1520 0%, #131c2b 100%)",
      border: speaking ? "1.5px solid rgba(82,196,255,0.7)" : "1.5px solid rgba(255,255,255,0.07)",
      boxShadow: speaking ? "0 0 20px rgba(82,196,255,0.2)" : "0 4px 24px rgba(0,0,0,0.4)",
      transition: "border 0.3s ease, box-shadow 0.3s ease",
      height: "100%", minHeight: "260px",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    }}>
      {/* Pulse ring */}
      {speaking && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: "16px",
          border: "2px solid rgba(82,196,255,0.3)",
          animation: "speakRing 1.8s ease-in-out infinite",
          pointerEvents: "none", zIndex: 5,
        }} />
      )}

      {/* Avatar illustration */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: "0",
        animation: speaking ? "headBob 1.8s ease-in-out infinite" : "idleFloat 4s ease-in-out infinite",
      }}>
        {/* Head */}
        <div style={{
          width: "80px", height: "88px", borderRadius: "50% 50% 45% 45%",
          background: "linear-gradient(160deg, #c8a882 0%, #b8926a 100%)",
          position: "relative", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}>
          {/* Eyes */}
          <div style={{ position: "absolute", top: "36px", left: "18px", display: "flex", gap: "20px" }}>
            {[0, 1].map((i) => (
              <div key={i} style={{
                width: "10px", height: "10px", borderRadius: "50%",
                background: "#2d1a0e",
                animation: `blink ${3 + i * 0.7}s ease-in-out infinite`,
                animationDelay: `${i * 0.15}s`,
              }} />
            ))}
          </div>
          {/* Mouth */}
          <div ref={mouthRef} style={{
            position: "absolute", bottom: "18px", left: "50%", transform: "translateX(-50%)",
            width: "22px", height: "2px", borderRadius: "4px",
            background: "#7a4a2a",
            transition: "height 0.05s ease",
          }} />
          {/* Hair */}
          <div style={{
            position: "absolute", top: "-8px", left: "-4px", right: "-4px", height: "36px",
            borderRadius: "50% 50% 0 0",
            background: "linear-gradient(180deg, #2c1a0a 0%, #3d2510 100%)",
          }} />
          {/* Initials fallback badge */}
          <div style={{
            position: "absolute", top: "8px", right: "-8px",
            width: "22px", height: "22px", borderRadius: "50%",
            background: "rgba(82,196,255,0.15)",
            border: "1px solid rgba(82,196,255,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "8px", fontWeight: 700, color: "#52c4ff",
            fontFamily: "'JetBrains Mono', monospace",
          }}>{initials}</div>
        </div>

        {/* Neck */}
        <div style={{
          width: "26px", height: "18px",
          background: "linear-gradient(180deg, #b8926a 0%, #a07858 100%)",
        }} />

        {/* Shoulders / suit */}
        <div style={{
          width: "120px", height: "60px",
          borderRadius: "0 0 8px 8px",
          background: "linear-gradient(160deg, #1a2540 0%, #111827 100%)",
          position: "relative", overflow: "hidden",
        }}>
          {/* Shirt / tie */}
          <div style={{
            position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
            width: "28px", height: "60px",
            background: "linear-gradient(180deg, #e8e8e8 0%, #d0d0d0 100%)",
          }} />
          <div style={{
            position: "absolute", top: "8px", left: "50%", transform: "translateX(-50%)",
            width: "8px", height: "36px", borderRadius: "2px 2px 4px 4px",
            background: "linear-gradient(180deg, #c0392b 0%, #922b21 100%)",
          }} />
        </div>
      </div>

      {/* Name badge */}
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
                  width: "3px", height: "100%", borderRadius: "2px",
                  background: "#52c4ff",
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
  const {
    start, stop: stopSTT,
    transcript: liveText,
    finalTranscript,
  } = useSpeechToText();

  const [config, setConfig] = useState({
    role: "", type: "technical", interviewerCount: 2, duration: 20,
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geminiFailed, setGeminiFailed] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lipSyncAlive = useRef(false);

  // One signal ref per interviewer slot (up to 3)
  const signals = useRef<AvatarSignal[]>([
    { isSpeaking: false, amplitude: 0, viseme: "sil" },
    { isSpeaking: false, amplitude: 0, viseme: "sil" },
    { isSpeaking: false, amplitude: 0, viseme: "sil" },
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

  // ── Puter fallback ──
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://js.puter.com/v2/";
    s.async = true;
    document.body.appendChild(s);
    return () => { document.body.removeChild(s); };
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

  // ── Lip sync driver ──
  const startLipSync = useCallback((speakerIdx: number, text: string) => {
    lipSyncAlive.current = false; // kill previous
    setTimeout(() => {
      lipSyncAlive.current = true;
      setActiveSpeaker(speakerIdx);
      setIsSpeaking(true);

      signals.current.forEach((s) => { s.isSpeaking = false; s.amplitude = 0; s.viseme = "sil"; });
      signals.current[speakerIdx].isSpeaking = true;

      const chars = text.split("");
      let i = 0;

      const tick = () => {
        if (!lipSyncAlive.current || i >= chars.length) {
          signals.current[speakerIdx].isSpeaking = false;
          signals.current[speakerIdx].amplitude = 0;
          signals.current[speakerIdx].viseme = "sil";
          setIsSpeaking(false);
          return;
        }
        const ch = chars[i++];
        const isSpace = ch === " " || ch === "," || ch === ".";
        const isVowel = /[aeiou]/i.test(ch);
        signals.current[speakerIdx].viseme = "sil";
        signals.current[speakerIdx].amplitude = isSpace ? 0 : isVowel
          ? 0.55 + Math.random() * 0.45
          : 0.25 + Math.random() * 0.3;

        const delay = isSpace ? 90 : 50 + Math.random() * 35;
        setTimeout(tick, delay);
      };
      tick();
    }, 10);
  }, []);

  // ── First question ──
  useEffect(() => {
    if (!config.role && !config.type) return;
    let q = "Tell me about yourself.";
    if (config.type === "technical")
      q = `Hi, let's begin your ${config.role || "technical"} interview. Can you briefly introduce yourself and your technical background?`;
    else if (config.type === "hr")
      q = `Hi, let's begin your HR round for ${config.role}. Tell me about yourself and your motivations.`;
    else if (config.type === "system")
      q = `Let's start your system design interview for ${config.role}. Can you walk me through a system you've built?`;
    else if (config.type === "behavioral")
      q = `Let's start your behavioral interview. Tell me about a challenging situation you handled.`;

    speak(q);
    startLipSync(0, q);
    setMessages([{ role: "assistant", content: q }]);
    setTranscriptLines([`Interviewer: ${q}`]);
  }, [config.role, config.type]);

  // ── Camera ──
  const toggleCamera = useCallback(async () => {
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

    const updated: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(updated);
    setTranscriptLines((t) => [...t, `You: ${userText}`]);

    const nextSpeaker = (activeSpeaker + 1) % Math.min(personas.length, 3);

    const history = updated.slice(-6)
      .map((m) => `${m.role === "user" ? "Candidate" : "Interviewer"}: ${m.content}`)
      .join("\n");

    const prompt = `You are a professional interviewer.\nRole: ${config.role || "Software Engineer"}\nInterview Type: ${config.type}\nConversation:\n${history}\nRules:\n- Do NOT repeat questions\n- Ask ONE question only\n- If candidate asks → answer first\n- Be realistic interviewer\nRespond:`;

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
          setError(`⚠️ Gemini failed — using fallback`);
        } catch {
          setError("AI unavailable. Please try again.");
          return;
        }
      }
    } else {
      try {
        aiText = await (window as any).puter.ai.chat(prompt);
      } catch {
        setError("Fallback AI failed.");
        return;
      }
    }

    speechSynthesis.cancel();
    speak(aiText);
    startLipSync(nextSpeaker, aiText);
    setMessages([...updated, { role: "assistant", content: aiText }]);
    setTranscriptLines((t) => [...t, `Interviewer: ${aiText}`]);
  }, [messages, activeSpeaker, geminiFailed, config, personas, speak, startLipSync]);

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
        @keyframes blink {
          0%,92%,100% { transform:scaleY(1); }
          95% { transform:scaleY(0.08); }
        }
        @keyframes idleFloat {
          0%,100% { transform:translateY(0px) rotate(0deg); }
          50% { transform:translateY(-6px) rotate(0.5deg); }
        }
        @keyframes headBob {
          0%,100% { transform:translateY(0px) rotate(-0.5deg); }
          50% { transform:translateY(-3px) rotate(0.5deg); }
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
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
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
              <div style={{
                width: "7px", height: "7px", borderRadius: "50%",
                background: "#52c4ff", boxShadow: "0 0 8px #52c4ff",
              }} />
              <span className="mono" style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Live Interview
              </span>
            </div>
            <div className="mono" style={{ display: "flex", gap: "20px", fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
              <span>{config.role || "Software Engineer"} · {config.type}</span>
              <span style={{ color: elapsed > config.duration * 60 * 0.8 ? "#fb923c" : "#52c4ff" }}>
                {fmt(elapsed)} / {String(config.duration).padStart(2, "0")}:00
              </span>
            </div>
          </div>

          {/* Avatar grid */}
          <div style={{
            flex: 1,
            display: "grid",
            gap: "12px",
            gridTemplateColumns: interviewerCount === 1 ? "1fr" : "1fr 1fr",
            gridTemplateRows: interviewerCount <= 2 ? "1fr" : "1fr 1fr",
          }}>
            {personas.slice(0, interviewerCount).map((p, i) => (
              <AvatarTile
                key={p.id}
                name={p.name}
                title={p.role || "Interviewer"}
                signal={{ current: signals.current[i] }}
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
              {isCameraOn ? (
                <video ref={videoRef} autoPlay muted playsInline
                  style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "56px", height: "56px", borderRadius: "50%",
                    background: "rgba(255,255,255,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "22px",
                  }}>👤</div>
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
                  <span className="mono" style={{
                    marginLeft: "auto", fontSize: "10px", padding: "2px 8px", borderRadius: "20px",
                    background: "rgba(239,68,68,0.15)", color: "#f87171",
                    border: "1px solid rgba(239,68,68,0.3)",
                  }}>● REC</span>
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
          {/* Panel header */}
          <div style={{
            padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>Transcript</span>
            <span className="mono" style={{
              fontSize: "10px", padding: "2px 8px", borderRadius: "20px",
              background: "rgba(82,196,255,0.1)", color: "#52c4ff",
            }}>
              {transcriptLines.length}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="mono" style={{
              margin: "8px 12px 0", padding: "8px 12px", borderRadius: "8px", fontSize: "11px",
              background: "rgba(239,68,68,0.08)", color: "#fca5a5",
              border: "1px solid rgba(239,68,68,0.2)",
            }}>
              {error}
            </div>
          )}

          {/* Messages */}
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
                  <div className="mono" style={{
                    fontSize: "9px", fontWeight: 500, letterSpacing: "0.1em",
                    color: isAI ? "#52c4ff" : "rgba(255,255,255,0.28)",
                    marginBottom: "4px", textTransform: "uppercase",
                  }}>
                    {isAI ? "Interviewer" : "You"}
                  </div>
                  {line.replace(/^(Interviewer|You): /, "")}
                </div>
              );
            })}
          </div>

          {/* Input */}
          <div style={{ padding: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: "8px" }}>
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && textInput.trim()) {
                  handleUserMessage(textInput);
                  setTextInput("");
                }
              }}
              placeholder="Type a response..."
              style={{
                flex: 1, padding: "9px 12px", borderRadius: "10px", fontSize: "12px",
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.85)", outline: "none",
                fontFamily: "'Syne', sans-serif",
              }}
            />
            <button
              onClick={() => { if (textInput.trim()) { handleUserMessage(textInput); setTextInput(""); } }}
              style={{
                padding: "9px 14px", borderRadius: "10px", fontSize: "12px", fontWeight: 600,
                background: "rgba(82,196,255,0.12)", color: "#52c4ff",
                border: "1px solid rgba(82,196,255,0.25)", cursor: "pointer",
                fontFamily: "'Syne', sans-serif",
              }}
            >
              Send
            </button>
          </div>
        </div>

        {/* ══ FLOATING CONTROLS ══ */}
        <div style={{
          position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 18px", borderRadius: "18px", zIndex: 50,
          background: "rgba(5,8,14,0.88)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 8px 48px rgba(0,0,0,0.65)",
        }}>

          {/* Mic */}
          <button onClick={handleMic} title={isRecording ? "Stop" : "Speak"} style={{
            width: "50px", height: "50px", borderRadius: "50%", fontSize: "18px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isRecording ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.06)",
            border: `1.5px solid ${isRecording ? "rgba(239,68,68,0.55)" : "rgba(255,255,255,0.1)"}`,
            cursor: "pointer", transition: "all 0.2s",
            animation: isRecording ? "recPulse 1s ease infinite" : "none",
          }}>🎤</button>

          {/* Camera */}
          <button onClick={toggleCamera} title={isCameraOn ? "Camera off" : "Camera on"} style={{
            width: "50px", height: "50px", borderRadius: "50%", fontSize: "18px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: isCameraOn ? "rgba(82,196,255,0.15)" : "rgba(255,255,255,0.06)",
            border: `1.5px solid ${isCameraOn ? "rgba(82,196,255,0.5)" : "rgba(255,255,255,0.1)"}`,
            cursor: "pointer", transition: "all 0.2s",
          }}>📷</button>

          <div style={{ width: "1px", height: "32px", background: "rgba(255,255,255,0.07)" }} />

          {/* Chat */}
          <button onClick={() => { stop(); router.push("/interview-prep/chat"); }} style={{
            height: "50px", padding: "0 16px", borderRadius: "25px", fontSize: "13px", fontWeight: 500,
            display: "flex", alignItems: "center", gap: "6px",
            background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.55)", cursor: "pointer", transition: "all 0.2s",
            fontFamily: "'Syne', sans-serif",
          }}>💬 Chat</button>

          {/* End */}
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

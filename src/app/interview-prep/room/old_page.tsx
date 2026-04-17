"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { getDefaultPersonas } from "@/lib/interview/personaGenerator";
import { useRouter } from "next/navigation";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function InterviewRoomPage() {
  const router = useRouter();

  const { speak, stop } = useTextToSpeech();
  const { start, stop: stopSTT, transcript: liveText, finalTranscript } =
    useSpeechToText();

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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ✅ Load config
  useEffect(() => {
    const stored = localStorage.getItem("interviewConfig");
    if (stored) {
      setConfig(JSON.parse(stored));
    }
  }, []);

  const personas = getDefaultPersonas(config.interviewerCount);

  // 🔇 Cleanup
  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
    };
  }, []);

  // 🤖 Load Puter fallback
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // 🎤 First question (dynamic now)
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
    setMessages([{ role: "assistant", content: first }]);
    setTranscript([`Interviewer: ${first}`]);
  }, [config]);

  // 🎥 Camera
  const toggleCamera = async () => {
    if (!isCameraOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });

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

  // 🧠 MAIN AI LOGIC
  const handleUserMessage = async (userText: string) => {
    if (!userText.trim()) return;

    setError(null);

    const updated: Message[] = [
      ...messages,
      { role: "user", content: userText },
    ];

    setMessages(updated);
    setTranscript((t) => [...t, `You: ${userText}`]);

    const history = updated
      .slice(-6)
      .map((m) =>
        `${m.role === "user" ? "Candidate" : "Interviewer"}: ${m.content}`
      )
      .join("\n");

    const prompt = `
You are a professional interviewer.
Role: ${config.role || "Software Engineer"}
Interview Type: ${config.type}
Conversation:
${history}
Rules:
- Do NOT repeat questions
- Ask ONE question only
- If candidate asks → answer first
- Match difficulty based on type
- Be realistic interviewer
Respond:
`;

    let aiText = "";

    if (!geminiFailed) {
      try {
        const res = await fetch("/api/interview/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updated,
            persona: personas[0],
          }),
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

  return (
    <div className="h-screen flex bg-black text-white relative">
      {/* LEFT - Video/Personas */}
      <div className="flex-1 grid grid-cols-2 gap-4 p-4">
        {personas.map((p) => (
          <div key={p.id} className="bg-zinc-900 rounded-xl flex items-center justify-center">
            {p.name}
          </div>
        ))}

        <div className="bg-zinc-900 rounded-xl overflow-hidden">
          {isCameraOn ? (
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full">Camera Off</div>
          )}
        </div>
      </div>

      {/* RIGHT - Transcript/Chat */}
      <div className="w-80 border-l border-zinc-800 flex flex-col">
        <div className="p-3 text-sm font-semibold border-bottom border-zinc-800">
          {config.role} • {config.type} • {config.duration} min
        </div>

        {error && <div className="bg-red-500 p-2 text-xs">{error}</div>}

        <div className="flex-1 overflow-y-auto p-3 text-xs space-y-2">
          {transcript.map((t, i) => (
            <div key={i} className="p-1 rounded bg-zinc-900/50">{t}</div>
          ))}
        </div>

        <div className="p-2 flex gap-2 border-t border-zinc-800">
          <input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (handleUserMessage(textInput), setTextInput(""))}
            className="flex-1 bg-zinc-800 px-2 py-1 rounded text-sm outline-none"
            placeholder="Type a message..."
          />
          <Button
            size="sm"
            onClick={() => {
              handleUserMessage(textInput);
              setTextInput("");
            }}
          >
            Send
          </Button>
        </div>
      </div>

      {/* FLOATING CONTROLS */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 bg-zinc-900/90 px-4 py-2 rounded-xl border border-zinc-700 shadow-2xl z-50">
        {/* 🎤 Mic */}
        <Button
          onClick={handleMic}
          className={`w-14 h-14 rounded-full text-xl transition-all duration-200 active:scale-90 ${
            isRecording ? "bg-red-500 hover:bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"
          }`}
        >
          🎤
        </Button>

        {/* 📷 Camera */}
        <Button
          onClick={toggleCamera}
          className={`w-14 h-14 rounded-full text-xl transition-all duration-200 active:scale-90 ${
            isCameraOn ? "bg-green-500 hover:bg-green-600" : "bg-zinc-800 hover:bg-zinc-700"
          }`}
        >
          📷
        </Button>

        {/* ❌ End */}
        <Button
          onClick={() => {
            stop();
            speechSynthesis.cancel();
            streamRef.current?.getTracks().forEach((t) => t.stop());
            router.push("/");
          }}
          className="w-14 h-14 rounded-full text-xl bg-red-600 hover:bg-red-700 transition-all duration-200 active:scale-90"
        >
          ❌
        </Button>

        {/* 💬 Chat */}
        <Button
          onClick={() => {
            stop();
            router.push("/interview-prep/chat");
          }}
          className="w-14 h-14 rounded-full text-xl bg-zinc-800 hover:bg-zinc-700 transition-all duration-200 active:scale-90"
        >
          💬
        </Button>
      </div>
    </div>
  );
}

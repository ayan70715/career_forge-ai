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
  const personas = getDefaultPersonas();
  const { speak } = useTextToSpeech();
  const { start, stop, transcript: liveText, finalTranscript } =
    useSpeechToText();

  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geminiFailed, setGeminiFailed] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 🎥 Camera
  useEffect(() => {
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        console.log("Camera not available");
      }
    }
    initCamera();
  }, []);

  // 🤖 Load Puter fallback
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // 🤖 First question
  useEffect(() => {
    const first = "Tell me about yourself.";

    speak(first);

    setMessages([{ role: "assistant", content: first }]);
    setTranscript([`Interviewer: ${first}`]);
  }, []);

  // 🧠 Handle message
  const handleUserMessage = async (userText: string) => {
    if (!userText.trim()) return;

    setError(null);

    const updated: Message[] = [
      ...messages,
      { role: "user", content: userText },
    ];

    setMessages(updated);
    setTranscript((t) => [...t, `You: ${userText}`]);

    let aiText = "";
    const persona = personas[0];

    if (!geminiFailed) {
      try {
        const res = await fetch("/api/interview/respond", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: updated,
            persona,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error);
        }

        aiText = data.text;
      } catch (err: any) {
        console.error("Gemini failed:", err);

        setGeminiFailed(true);

        try {
          aiText = await (window as any).puter.ai.chat(
            `You are a technical interviewer.\nCandidate said: ${userText}\nAsk the next relevant interview question.`
          );

          setError(`⚠️ Gemini disabled: ${err.message}`);
        } catch {
          setError("Both AI systems failed");
          return;
        }
      }
    } else {
      // 🚀 direct fallback (no delay)
      try {
        aiText = await (window as any).puter.ai.chat(
          `You are a technical interviewer.\nCandidate said: ${userText}\nAsk the next relevant interview question.`
        );
      } catch {
        setError("Fallback AI failed");
        return;
      }
    }

    setMessages([
      ...updated,
      { role: "assistant", content: aiText },
    ]);

    setTranscript((t) => [...t, `Interviewer: ${aiText}`]);

    speak(aiText);
  };

  // 🎤 Mic toggle
  const handleMic = () => {
    if (!isRecording) {
      start();
      setIsRecording(true);
    } else {
      stop();
      setIsRecording(false);

      const text = finalTranscript || liveText;
      handleUserMessage(text);
    }
  };

  return (
    <div className="h-screen flex bg-black text-white relative">
      {/* LEFT - Video grid */}
      <div className="flex-1 grid grid-cols-2 gap-4 p-4">
        {personas.map((p) => (
          <div
            key={p.id}
            className="bg-zinc-900 rounded-xl flex flex-col items-center justify-center"
          >
            <div className="w-20 h-20 rounded-full bg-purple-500 mb-2" />
            <span>{p.name}</span>
          </div>
        ))}

        {/* User camera */}
        <div className="bg-zinc-900 rounded-xl overflow-hidden relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            className="w-full h-full object-cover"
          />
          <span className="absolute bottom-2 left-2 text-xs">
            You
          </span>
        </div>
      </div>

      {/* RIGHT - Transcript */}
      <div className="w-80 border-l border-zinc-800 flex flex-col">
        <div className="p-3 text-sm font-semibold">
          Transcript
        </div>

        {error && (
          <div className="bg-red-500 text-white text-xs p-2 m-2 rounded">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 text-xs space-y-2">
          {transcript.map((t, i) => (
            <div key={i}>{t}</div>
          ))}
        </div>

        {/* Text input */}
        <div className="border-t border-zinc-800 p-2 flex gap-2">
          <input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type your answer..."
            className="flex-1 px-3 py-2 bg-transparent border border-zinc-700 rounded-md text-sm"
          />

          <Button
            onClick={() => {
              handleUserMessage(textInput);
              setTextInput("");
            }}
          >
            Send
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 bg-zinc-900/80 backdrop-blur px-4 py-2 rounded-xl border border-zinc-700">
        {/* Mic */}
        <Button
          onClick={handleMic}
          className={`rounded-full w-12 h-12 ${
            isRecording ? "bg-red-500" : "bg-zinc-800"
          } active:scale-90 transition`}
        >
          Mic
        </Button>

        {/* End */}
        <Button
          variant="destructive"
          className="rounded-full w-12 h-12 active:scale-90 transition"
          onClick={() => window.location.reload()}
        >
          End
        </Button>

        {/* Chat */}
        <Button
          variant="outline"
          className="rounded-full w-12 h-12 active:scale-90 transition"
          onClick={() => router.push("/interview-prep/chat")}
        >
          Chat Mode
        </Button>
      </div>
    </div>
  );
}

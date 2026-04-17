"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { getDefaultPersonas } from "@/lib/interview/personaGenerator";

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

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 🎥 CAMERA SETUP
  useEffect(() => {
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.log("Camera error", err);
      }
    }

    initCamera();
  }, []);

  // 🤖 AI STARTS INTERVIEW
  useEffect(() => {
    const startInterview = async () => {
      const persona = personas[0];

      const res = await fetch("/api/interview/respond", {
        method: "POST",
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content:
                "Start interview. Ask first question only.",
            },
          ],
          persona,
        }),
      });

      const data = await res.json();
      const aiText = data.text || "Tell me about yourself.";

      speak(aiText);

      setMessages([{ role: "assistant", content: aiText }]);
      setTranscript([`Interviewer: ${aiText}`]);
    };

    startInterview();
  }, []);

  // 🧠 HANDLE MESSAGE
  const handleUserMessage = async (userText: string) => {
    if (!userText.trim()) return;

    const updated = [
      ...messages,
      { role: "user", content: userText },
    ];

    setMessages(updated);
    setTranscript((t) => [...t, `You: ${userText}`]);

    const persona =
      Math.random() > 0.5 ? personas[0] : personas[1];

    const res = await fetch("/api/interview/respond", {
      method: "POST",
      body: JSON.stringify({
        messages: updated,
        persona,
      }),
    });

    const data = await res.json();
    const aiText = data.text || "Please continue.";

    speak(aiText);

    setMessages([
      ...updated,
      { role: "assistant", content: aiText },
    ]);

    setTranscript((t) => [
      ...t,
      `Interviewer: ${aiText}`,
    ]);
  };

  // 🎤 MIC TOGGLE
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

  // 📞 END CALL
  const endInterview = () => {
    router.push("/interview-prep");
  };

  return (
    <div className="h-screen flex bg-black text-white relative">
      {/* LEFT: VIDEO GRID */}
      <div className="flex-1 grid grid-cols-2 gap-4 p-4">
        {/* AI Tiles */}
        {personas.map((p) => (
          <div
            key={p.id}
            className="bg-zinc-900 rounded-xl flex flex-col items-center justify-center"
          >
            <div className="w-20 h-20 rounded-full bg-purple-500 mb-2" />
            <span className="text-sm">{p.name}</span>
          </div>
        ))}

        {/* USER CAMERA */}
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

      {/* RIGHT: TRANSCRIPT */}
      <div className="w-80 border-l border-zinc-800 flex flex-col">
        <div className="p-3 text-sm font-semibold">
          Transcript
        </div>

        <div className="flex-1 overflow-y-auto p-3 text-xs space-y-2">
          {transcript.map((t, i) => (
            <div key={i}>{t}</div>
          ))}
        </div>

        {/* INPUT */}
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

      {/* 🎮 CONTROLS */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
        <Button
          onClick={handleMic}
          className={isRecording ? "bg-red-500" : ""}
        >
          🎤
        </Button>

        <Button variant="destructive" onClick={endInterview}>
          📞
        </Button>
      </div>
    </div>
  );
}

"use client";

import AvatarGrid from "@/components/interview/AvatarGrid";
import Avatar from "@/components/interview/Avatar";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { getDefaultPersonas } from "@/lib/interview/personaGenerator";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type AvatarState = "idle" | "listening" | "thinking" | "speaking";

export default function InterviewRoomPage() {
  const personas = getDefaultPersonas();

  const { state: sttState, transcript: liveText, start, stop } =
    useSpeechToText();
  const { speak } = useTextToSpeech();

  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [currentSpeakerId, setCurrentSpeakerId] =
    useState<string>("idle");
  const [speakingIntensity, setSpeakingIntensity] = useState(0);

  // 🎭 Avatar mapping (FIXED TYPE)
  const mappedInterviewers = personas.map((p) => ({
    id: p.id,
    name: p.name,
    state:
      currentSpeakerId === "thinking"
        ? ("thinking" as AvatarState)
        : currentSpeakerId === p.id
        ? ("speaking" as AvatarState)
        : ("idle" as AvatarState),
  }));

  // 🔊 Voice mapping
  const voiceMap: Record<string, string> = {
    Amit: "Google UK English Male",
    Riya: "Google UK English Female",
  };

  // 📡 API call
  async function getAIResponse(
    updatedMessages: Message[],
    persona: any
  ) {
    const res = await fetch("/api/interview/respond", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: updatedMessages,
        persona,
      }),
    });

    const data = await res.json();
    return data.text;
  }

  // 🎤 Start speaking
  const handleStartSpeaking = () => {
    speechSynthesis.cancel();
    setCurrentSpeakerId("you");
    start();
  };

  // 🛑 Stop speaking
  const handleStopSpeaking = async () => {
    stop();

    if (!liveText.trim()) return;

    const userText = liveText;

    const updatedMessages: Message[] = [
      ...messages,
      { role: "user", content: userText },
    ];

    setMessages(updatedMessages);
    setTranscript((t) => [...t, `You: ${userText}`]);

    setCurrentSpeakerId("thinking");

    const persona =
      Math.random() > 0.5 ? personas[0] : personas[1];

    const aiText = await getAIResponse(updatedMessages, persona);

    let running = true;

    const animate = () => {
      if (!running) return;

      setSpeakingIntensity(
        (prev) => prev * 0.6 + Math.random() * 0.4
      );

      requestAnimationFrame(animate);
    };

    animate();

    setCurrentSpeakerId(persona.id);

    speak(
      aiText,
      voiceMap[persona.name],
      () => {
        running = false;
        setSpeakingIntensity(0);
        setCurrentSpeakerId("idle");
      }
    );

    setMessages([
      ...updatedMessages,
      { role: "assistant", content: aiText },
    ]);

    setTranscript((t) => [
      ...t,
      `${persona.name}: ${aiText}`,
    ]);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Top */}
      <div className="flex justify-between px-6 py-3 border-b border-glass-border">
        <span className="text-sm font-medium">
          AI Interview Room
        </span>
        <span className="text-xs text-muted-foreground">
          Live
        </span>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left */}
        <div className="flex-1 flex flex-col items-center justify-center gap-10 p-6">
          <AvatarGrid
            interviewers={mappedInterviewers}
            speakingIntensity={speakingIntensity}
          />

          {/* Candidate */}
          <div className="flex flex-col items-center gap-2">
            <Avatar
              name="You"
              state={
                currentSpeakerId === "you"
                  ? "speaking"
                  : "listening"
              }
              intensity={
                currentSpeakerId === "you"
                  ? speakingIntensity
                  : 0
              }
            />
            <span className="text-xs text-muted-foreground">
              You
            </span>
          </div>
        </div>

        {/* Right */}
        <div className="w-80 border-l border-glass-border p-4 flex flex-col">
          <h2 className="text-sm font-medium mb-3">
            Transcript
          </h2>

          <div className="flex-1 overflow-y-auto text-xs space-y-2 pr-2">
            {transcript.map((line, i) => (
              <div key={i} className="text-muted-foreground">
                {line}
              </div>
            ))}

            {sttState === "listening" && (
              <div className="text-primary italic">
                You (live): {liveText || "..."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-glass-border p-4 flex justify-center gap-4">
        <Button
          variant="outline"
          onMouseDown={handleStartSpeaking}
          onMouseUp={handleStopSpeaking}
          disabled={
            currentSpeakerId !== "idle" &&
            currentSpeakerId !== "you"
          }
        >
          🎤 Hold to Speak
        </Button>

        <Button variant="destructive">
          End Interview
        </Button>
      </div>
    </div>
  );
}

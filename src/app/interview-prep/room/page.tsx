"use client";

import AvatarGrid from "@/components/interview/AvatarGrid";
import Avatar from "@/components/interview/Avatar";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { getDefaultPersonas } from "@/lib/interview/personaGenerator";
import { useRouter } from "next/navigation";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type AvatarState = "idle" | "listening" | "thinking" | "speaking";

export default function InterviewRoomPage() {
  const router = useRouter();
  const personas = getDefaultPersonas();

  const { state: sttState, transcript: liveText, start, stop } =
    useSpeechToText();
  const { speak } = useTextToSpeech();

  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [currentSpeakerId, setCurrentSpeakerId] =
    useState<string>("idle");
  const [speakingIntensity, setSpeakingIntensity] = useState(0);

  const [config, setConfig] = useState<any>(null);
  const [started, setStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // ✅ Load config
  useEffect(() => {
    const stored = localStorage.getItem("interviewConfig");
    if (stored) setConfig(JSON.parse(stored));
  }, []);

  // ✅ AI starts interview
  useEffect(() => {
    if (!config || started) return;

    const startInterview = async () => {
      setStarted(true);
      setCurrentSpeakerId("thinking");

      const persona = personas[0];

      const prompt = `Start an interview for:
Role: ${config.role}
Company: ${config.company}
Type: ${config.type}
Difficulty: ${config.difficulty}

Ask the first question only.`;

      const res = await fetch("/api/interview/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          persona,
          config,
        }),
      });

      const data = await res.json();
      const aiText =
        data.text || "Let's begin. Tell me about yourself.";

      let running = true;
      const animate = () => {
        if (!running) return;
        setSpeakingIntensity(Math.random());
        requestAnimationFrame(animate);
      };
      animate();

      setCurrentSpeakerId(persona.id);

      speak(aiText, undefined, () => {
        running = false;
        setSpeakingIntensity(0);
        setCurrentSpeakerId("idle");
      });

      setMessages([{ role: "assistant", content: aiText }]);
      setTranscript([`${persona.name}: ${aiText}`]);
    };

    startInterview();
  }, [config]);

  // 🎤 Toggle mic
  const handleMicToggle = async () => {
    if (!isRecording) {
      speechSynthesis.cancel();
      setCurrentSpeakerId("you");
      start();
      setIsRecording(true);
    } else {
      stop();
      setIsRecording(false);

      // ⏳ wait for STT finalize
      setTimeout(async () => {
        if (!liveText.trim()) {
          console.warn("No speech detected");
          return;
        }

        console.log("Captured speech:", liveText);

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

        const res = await fetch("/api/interview/respond", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: updatedMessages,
            persona,
            config,
          }),
        });

        const data = await res.json();

        const aiText =
          data.text || "Could you please repeat that?";

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

        speak(aiText, undefined, () => {
          running = false;
          setSpeakingIntensity(0);
          setCurrentSpeakerId("idle");
        });

        setMessages([
          ...updatedMessages,
          { role: "assistant", content: aiText },
        ]);

        setTranscript((t) => [
          ...t,
          `${persona.name}: ${aiText}`,
        ]);
      }, 300);
    }
  };

  // 🛑 End interview
  const handleEndInterview = () => {
    speechSynthesis.cancel();
    stop();
    router.push("/interview-prep");
  };

  // 🎭 Avatar mapping
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

  return (
    <div className="h-screen flex flex-col">
      {/* Top */}
      <div className="flex justify-between px-6 py-3 border-b border-glass-border">
        <span className="text-sm font-medium">
          AI Interview Room
        </span>
        <span className="text-xs text-muted-foreground">
          {config?.role || "Live"}
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
              <div key={i}>{line}</div>
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
          onClick={handleMicToggle}
          className={`transition-all ${
            isRecording ? "scale-95 bg-red-500" : ""
          }`}
        >
          {isRecording ? "🛑 Stop" : "🎤 Speak"}
        </Button>

        <Button
          variant="destructive"
          onClick={handleEndInterview}
          className="active:scale-95"
        >
          End Interview
        </Button>

        <Button
          variant="outline"
          onClick={() =>
            router.push("/interview-prep/chat")
          }
          className="active:scale-95"
        >
          💬 Chat
        </Button>
      </div>
    </div>
  );
}

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

  const {
    state: sttState,
    transcript: liveText,
    finalTranscript,
    start,
    stop,
  } = useSpeechToText();

  const { speak } = useTextToSpeech();

  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [currentSpeakerId, setCurrentSpeakerId] =
    useState<string>("idle");
  const [speakingIntensity, setSpeakingIntensity] = useState(0);

  const [config, setConfig] = useState<any>(null);
  const [started, setStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const [textInput, setTextInput] = useState("");

  const isSTTSupported =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window ||
      "SpeechRecognition" in window);

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

  // ✅ Shared handler (voice + text)
  const handleUserMessage = async (userText: string) => {
    if (!userText.trim()) return;

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
    const aiText = data.text || "Could you repeat that?";

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
  };

  // 🎤 Toggle mic
  const handleMicToggle = () => {
    if (!isRecording) {
      speechSynthesis.cancel();
      setCurrentSpeakerId("you");
      start();
      setIsRecording(true);
    } else {
      stop();
      setIsRecording(false);

      const userText = finalTranscript || liveText;
      handleUserMessage(userText);
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
        <div className="flex flex-col items-center justify-center gap-10 p-6 flex-1">
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
      <div className="border-t border-glass-border p-4 flex flex-col items-center gap-3">
        {/* Mic */}
        {isSTTSupported && (
          <Button
            onClick={handleMicToggle}
            className={`transition ${
              isRecording ? "scale-95 bg-red-500" : ""
            }`}
          >
            {isRecording ? "🛑 Stop" : "🎤 Speak"}
          </Button>
        )}

        {/* Text fallback */}
        {!isSTTSupported && (
          <>
            <div className="text-xs text-yellow-500">
              🎤 Voice not supported — using text mode
            </div>

            <div className="flex gap-2 w-full max-w-xl">
              <input
                value={textInput}
                onChange={(e) =>
                  setTextInput(e.target.value)
                }
                placeholder="Type your answer..."
                className="flex-1 px-3 py-2 rounded-md border bg-transparent text-sm"
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
          </>
        )}

        {/* Other buttons */}
        <div className="flex gap-4">
          <Button
            variant="destructive"
            onClick={handleEndInterview}
          >
            End Interview
          </Button>

          <Button
            variant="outline"
            onClick={() =>
              router.push("/interview-prep/chat")
            }
          >
            💬 Chat
          </Button>
        </div>
      </div>
    </div>
  );
}

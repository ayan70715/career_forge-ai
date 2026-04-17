"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  MicOff,
  Send,
  Loader2,
  Play,
  Square,
  RotateCcw,
  Settings,
  MessageSquare,
  Volume2,
  User,
  Bot,
} from "lucide-react";
import { getApiKey, generateWithRetry } from "@/lib/ai/gemini";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";

interface Message {
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

const interviewTypes = [
  { id: "technical", label: "Technical Interview", description: "DSA, System Design, Coding" },
  { id: "behavioral", label: "Behavioral Interview", description: "STAR method, Leadership" },
  { id: "system-design", label: "System Design", description: "Architecture, Scalability" },
  { id: "hr", label: "HR Round", description: "Culture fit, Salary negotiation" },
  { id: "custom", label: "Custom Topic", description: "Specify your own topic" },
];

export default function InterviewPrepPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [interviewType, setInterviewType] = useState("technical");
  const [targetRole, setTargetRole] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [difficulty, setDifficulty] = useState("medium");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !synthRef.current) return;

    synthRef.current.cancel();
    // Clean markdown for speech
    const cleanText = text
      .replace(/[#*`_~\[\]()]/g, "")
      .replace(/\n+/g, ". ")
      .slice(0, 1000);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synthRef.current.speak(utterance);
  }, [voiceEnabled]);

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  const startListening = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Speech recognition is not supported in this browser. Please use Chrome.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const getSystemPrompt = () => {
    const type = interviewTypes.find((t) => t.id === interviewType);
    const topic = interviewType === "custom" ? customTopic : type?.label;

    return `You are an expert interview coach conducting a live ${topic} interview simulation for a ${targetRole || "software engineering"} position.

Difficulty: ${difficulty}

Your behavior:
- Act as a real interviewer — professional, conversational, and adaptive
- Ask ONE question at a time
- After the candidate responds, provide brief constructive feedback
- Then ask a follow-up or new question
- Adjust difficulty based on responses
- For technical questions, test understanding not just memorization
- For behavioral, expect STAR format answers
- Be encouraging but honest about areas for improvement
- Keep responses concise (2-3 paragraphs max)

If this is the first message, start by:
1. Briefly introducing yourself as the interviewer
2. Asking an ice-breaker or first interview question appropriate to the type

Current conversation context will be provided. Continue naturally from where we left off.`;
  };

  const sendMessage = async (overrideText?: string) => {
    const text = overrideText || input.trim();
    if (!text) return;

    const key = getApiKey();
    if (!key) {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: "Please configure your Gemini API key in Settings first.",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    const userMessage: Message = { role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const history = messages
        .map((m) => `${m.role === "user" ? "Candidate" : "Interviewer"}: ${m.content}`)
        .join("\n\n");

      const prompt = `${getSystemPrompt()}

CONVERSATION SO FAR:
${history}

Candidate: ${text}

Interviewer:`;

      const aiText = await generateWithRetry(prompt);

      const aiMessage: Message = { role: "ai", content: aiText, timestamp: new Date() };
      setMessages((prev) => [...prev, aiMessage]);

      // Speak the response
      if (voiceEnabled) {
        speak(aiText);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to get response";
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: `Error: ${message}`, timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const startInterview = () => {
    setInterviewStarted(true);
    setMessages([]);
    // Send a trigger message to start
    sendMessage("Hello, I'm ready for the interview. Let's begin.");
  };

  const resetInterview = () => {
    setInterviewStarted(false);
    setMessages([]);
    setInput("");
    stopSpeaking();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!interviewStarted) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="max-w-5xl mx-auto">
        <PageHeader
          icon={Mic}
          title="Live Interview Prep"
          subtitle="Practice with AI interviewer using voice or text"
          gradient="from-rose-500 to-pink-600"
        />

        <div className="space-y-5">
          {/* Target Role */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-9 w-9 rounded-lg bg-linear-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                  <Settings className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">Interview Configuration</h2>
                  <p className="text-[11px] text-muted-foreground">Set up your practice session</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Target Role</label>
                <Input
                  placeholder="e.g., Senior Software Engineer, Product Manager"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Interview Type — Horizontal Ribbon */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block px-1">Interview Type</label>
            <div className="flex gap-2 p-1.5 rounded-2xl bg-surface-1 border border-glass-border">
              {interviewTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setInterviewType(t.id)}
                  className={`flex-1 px-4 py-3 rounded-xl transition-all duration-300 text-center ${
                    interviewType === t.id
                      ? "bg-primary/10 border border-primary/30 shadow-[0_0_20px_rgba(139,92,246,0.12)]"
                      : "border border-transparent hover:bg-surface-2"
                  }`}
                >
                  <div className={`text-xs font-semibold ${interviewType === t.id ? "text-foreground" : "text-muted-foreground"}`}>
                    {t.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
          </div>

          {interviewType === "custom" && (
            <div className="space-y-1.5 px-1">
              <label className="text-xs font-medium text-muted-foreground">Custom Topic</label>
              <Input
                placeholder="e.g., React Performance Optimization, AWS Services"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
              />
            </div>
          )}

          {/* Difficulty & Voice — side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5">
                <label className="text-xs font-medium text-muted-foreground mb-3 block">Difficulty Level</label>
                <div className="flex gap-2">
                  {["easy", "medium", "hard"].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-semibold capitalize transition-all duration-300 ${
                        difficulty === d
                          ? d === "easy"
                            ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                            : d === "medium"
                              ? "bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                              : "bg-red-500/10 border border-red-500/30 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                          : "bg-surface-1 border border-glass-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <label className="text-xs font-medium text-muted-foreground mb-3 block">Voice Response</label>
                <button
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 ${
                    voiceEnabled
                      ? "bg-success/10 border border-success/30 text-success shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                      : "bg-surface-1 border border-glass-border text-muted-foreground"
                  }`}
                >
                  <Volume2 className="h-4 w-4" />
                  {voiceEnabled ? "Voice Enabled" : "Voice Disabled"}
                </button>
              </CardContent>
            </Card>
          </div>

          {/* Start Button */}
          <Button
            onClick={startInterview}
            variant="glow"
            className="w-full gap-3 py-7 text-lg bg-linear-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700"
          >
            <Play className="h-6 w-6" /> Start Interview
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4 shrink-0 p-3 rounded-2xl border border-glass-border bg-glass-bg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-linear-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-[0_0_12px_rgba(244,63,94,0.3)]">
            <Mic className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold">Live Interview</h1>
            <p className="text-[11px] text-muted-foreground">
              {interviewTypes.find((t) => t.id === interviewType)?.label} • {targetRole || "General"} • <span className="capitalize">{difficulty}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={voiceEnabled ? "outline" : "ghost"}
            size="icon"
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`h-8 w-8 ${voiceEnabled ? "border-success/30 text-success" : "text-muted-foreground"}`}
            title={voiceEnabled ? "Voice On" : "Voice Off"}
          >
            <Volume2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={resetInterview} className="gap-1.5 text-xs h-8">
            <RotateCcw className="h-3 w-3" /> End
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                msg.role === "user"
                  ? "bg-linear-to-br from-emerald-500 to-teal-600 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                  : "bg-linear-to-br from-indigo-500 to-purple-600 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
              }`}
            >
              {msg.role === "user" ? (
                <User className="w-3.5 h-3.5 text-white" />
              ) : (
                <Bot className="w-3.5 h-3.5 text-white" />
              )}
            </div>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"
              }`}
            >
              <div className="markdown-content text-sm">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
              <div className="text-[10px] text-muted-foreground/40 mt-1.5">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </motion.div>
        ))}

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_10px_rgba(99,102,241,0.2)]">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="chat-bubble-ai rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
              </div>
            </div>
          </motion.div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Speaking Indicator */}
      {isSpeaking && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2.5 bg-primary/10 border border-primary/20 rounded-xl backdrop-blur-sm shadow-[0_0_15px_rgba(139,92,246,0.1)]">
          <Volume2 className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-xs text-primary font-medium">AI is speaking...</span>
          <button
            onClick={stopSpeaking}
            className="ml-auto px-2.5 py-1 text-xs bg-primary/20 rounded-lg text-primary hover:bg-primary/30 transition-colors"
          >
            Stop
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="shrink-0 p-3 rounded-2xl border border-glass-border bg-glass-bg backdrop-blur-md">
        <div className="flex items-end gap-3">
          <Button
            variant={isListening ? "destructive" : "outline"}
            size="icon"
            onClick={isListening ? stopListening : startListening}
            className={`shrink-0 h-10 w-10 rounded-xl ${isListening ? "animate-pulse-glow" : ""}`}
            title={isListening ? "Stop listening" : "Start voice input"}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>

          <textarea
            className="flex-1 bg-surface-2 border border-glass-border rounded-xl px-4 py-3 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/30 focus-visible:shadow-[0_0_15px_rgba(139,92,246,0.1)] resize-none min-h-[44px] max-h-32 transition-all"
            placeholder={isListening ? "Listening... speak now" : "Type your answer or click the mic..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            rows={1}
          />

          <Button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            title="Send message"
            size="icon"
            className="shrink-0 h-10 w-10 rounded-xl"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {isListening && (
          <div className="flex items-center gap-2 mt-2 px-2">
            <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-xs text-destructive font-medium">Recording...</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

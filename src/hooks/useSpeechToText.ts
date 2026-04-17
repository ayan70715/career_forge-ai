"use client";

import { useEffect, useRef, useState } from "react";

type STTState = "idle" | "listening" | "error";

export function useSpeechToText() {
  const [state, setState] = useState<STTState>("idle");

  // 🟡 Live (interim) text while speaking
  const [transcript, setTranscript] = useState("");

  // 🟢 Final confirmed speech
  const [finalTranscript, setFinalTranscript] = useState("");

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setState("error");
      return;
    }

    const recognition = new SpeechRecognition();

    // ✅ CONFIG
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // 🎤 Start
    recognition.onstart = () => {
      setState("listening");
      setTranscript("");
      setFinalTranscript(""); // 🔥 reset each session
    };

    // 🧠 Result handling (FIXED)
    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }

      // 🟢 accumulate final
      if (final) {
        setFinalTranscript((prev) => prev + final);
      }

      // 🟡 update live text
      setTranscript(interim);
    };

    // ❌ Error
    recognition.onerror = (err: any) => {
      console.error("STT Error:", err);
      setState("error");
    };

    // 🛑 End
    recognition.onend = () => {
      setState("idle");
    };

    recognitionRef.current = recognition;
  }, []);

  const start = () => {
    try {
      recognitionRef.current?.start();
    } catch {
      console.warn("Mic already started");
    }
  };

  const stop = () => {
    recognitionRef.current?.stop();
  };

  return {
    state,
    transcript,       // 🟡 live text
    finalTranscript,  // 🟢 final text (USE THIS)
    start,
    stop,
  };
}

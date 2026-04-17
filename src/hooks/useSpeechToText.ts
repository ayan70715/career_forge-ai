"use client";

import { useEffect, useRef, useState } from "react";

type STTState = "idle" | "listening" | "error";

export function useSpeechToText() {
  const [state, setState] = useState<STTState>("idle");
  const [transcript, setTranscript] = useState("");
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

    // ✅ FIXED CONFIG
    recognition.continuous = true;        // keeps listening
    recognition.interimResults = true;    // live updates
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setState("listening");
      setTranscript(""); // reset each time mic starts
    };

    recognition.onresult = (event: any) => {
      let text = "";

      // ✅ FIXED LOOP (important)
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }

      setTranscript(text);
    };

    recognition.onerror = (err: any) => {
      console.error("STT Error:", err);
      setState("error");
    };

    recognition.onend = () => {
      setState("idle");
    };

    recognitionRef.current = recognition;
  }, []);

  const start = () => {
    try {
      recognitionRef.current?.start();
    } catch (e) {
      console.warn("Mic already started");
    }
  };

  const stop = () => {
    recognitionRef.current?.stop();
  };

  return { state, transcript, start, stop };
}

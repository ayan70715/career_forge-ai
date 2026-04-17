"use client";

import { useEffect, useState } from "react";

export function useTextToSpeech() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      if (v.length) setVoices(v);
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const speak = (text: string, voiceName?: string) => {
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);

    // 🎭 Pick voice
    const voice =
      voices.find((v) => v.name.includes(voiceName || "")) ||
      voices[0];

    if (voice) utterance.voice = voice;

    utterance.rate = 1;
    utterance.pitch = 1;

    speechSynthesis.speak(utterance);
  };

  const stop = () => {
    speechSynthesis.cancel();
  };

  return { speak, stop };
}

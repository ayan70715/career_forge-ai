"use client";

import { useEffect, useState } from "react";

type AvatarState = "idle" | "listening" | "thinking" | "speaking";

interface AvatarProps {
  name?: string;
  state?: AvatarState;
  intensity?: number; // 0–1 (driven from TTS)
}

export default function Avatar({
  name = "Interviewer",
  state = "idle",
  intensity = 0,
}: AvatarProps) {
  const [blink, setBlink] = useState(false);

  // 👁️ Blink animation
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 120);
    }, 2500 + Math.random() * 2000);

    return () => clearInterval(interval);
  }, []);

  // 🎯 State visuals (ring color)
  const ringColor =
    state === "listening"
      ? "ring-blue-400"
      : state === "thinking"
      ? "ring-yellow-400 animate-pulse"
      : state === "speaking"
      ? "ring-green-400"
      : "ring-muted";

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative w-24 h-24 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center ring-4 ${ringColor} transition-all`}
      >
        {/* Face */}
        <div className="relative w-14 h-14">
          {/* Eyes */}
          <div className="absolute top-3 left-2 w-2 h-2 bg-white rounded-full overflow-hidden">
            <div
              className={`w-full h-full bg-black transition-all ${
                blink ? "scale-y-0" : "scale-y-100"
              } origin-center`}
            />
          </div>

          <div className="absolute top-3 right-2 w-2 h-2 bg-white rounded-full overflow-hidden">
            <div
              className={`w-full h-full bg-black transition-all ${
                blink ? "scale-y-0" : "scale-y-100"
              } origin-center`}
            />
          </div>

          {/* 👄 Mouth (audio-driven) */}
          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white rounded-full transition-all"
            style={{
              width: "12px",
              height: `${6 + Math.min(intensity, 0.8) * 17}px`,
            }}
          />
        </div>

        {/* 🤔 Thinking dots */}
        {state === "thinking" && (
          <div className="absolute bottom-[-18px] flex gap-1">
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" />
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce delay-100" />
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce delay-200" />
          </div>
        )}
      </div>

      {/* Name */}
      <div className="text-xs text-muted-foreground">{name}</div>
    </div>
  );
}

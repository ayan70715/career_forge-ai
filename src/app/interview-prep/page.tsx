"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function InterviewSetupPage() {
  const router = useRouter();

  const [interviewerCount, setInterviewerCount] = useState(2);
  const [duration, setDuration] = useState(20);

  const startInterview = () => {
    localStorage.setItem(
      "interviewConfig",
      JSON.stringify({
        interviewerCount,
        duration,
      })
    );

    router.push("/interview-prep/room");
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">
            Interview Setup
          </h1>
          <p className="text-sm text-zinc-400">
            Customize your AI interview experience
          </p>
        </div>

        {/* Interviewer Count */}
        <div className="space-y-3">
          <label className="text-sm text-zinc-300">
            Number of Interviewers
          </label>

          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((num) => (
              <button
                key={num}
                onClick={() => setInterviewerCount(num)}
                className={`py-3 rounded-lg border transition ${
                  interviewerCount === num
                    ? "bg-purple-600 border-purple-500"
                    : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-3">
          <label className="text-sm text-zinc-300">
            Interview Duration
          </label>

          <div className="grid grid-cols-3 gap-3">
            {[10, 20, 30].map((time) => (
              <button
                key={time}
                onClick={() => setDuration(time)}
                className={`py-3 rounded-lg border transition ${
                  duration === time
                    ? "bg-blue-600 border-blue-500"
                    : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                }`}
              >
                {time} min
              </button>
            ))}
          </div>
        </div>

        {/* Start Button */}
        <Button
          onClick={startInterview}
          className="w-full py-3 text-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition"
        >
          ▶ Start Interview
        </Button>
        <Button
          variant="outline"
          className="w-full py-3"
          onClick={() => router.push("/interview-prep/chat")}
        >
          💬 Use Classic Chat Mode
        </Button>
      </div>
    </div>
  );
}

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
    <div className="h-screen flex flex-col items-center justify-center gap-6">
      <h1 className="text-xl font-semibold">Setup Interview</h1>

      {/* Interviewers */}
      <div className="flex flex-col gap-2">
        <label>Number of Interviewers</label>
        <select
          value={interviewerCount}
          onChange={(e) => setInterviewerCount(Number(e.target.value))}
          className="border p-2 rounded"
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </div>

      {/* Duration */}
      <div className="flex flex-col gap-2">
        <label>Duration (minutes)</label>
        <select
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="border p-2 rounded"
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={30}>30</option>
        </select>
      </div>

      <Button onClick={startInterview}>
        ▶ Start Interview
      </Button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function InterviewSetupPage() {
  const router = useRouter();

  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState("technical");
  const [difficulty, setDifficulty] = useState("medium");
  const [interviewers, setInterviewers] = useState(2);
  const [duration, setDuration] = useState(20);

  const startInterview = () => {
    // later we can persist this in localStorage or global store
    const config = {
      role,
      company,
      type,
      difficulty,
      interviewers,
      duration,
    };

    localStorage.setItem("interviewConfig", JSON.stringify(config));

    router.push("/interview-prep/room");
  };

  return (
    <div className="min-h-screen px-6 py-10 max-w-3xl mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        Live Interview Setup
      </h1>

      {/* Role */}
      <div className="flex flex-col gap-2">
        <label className="text-sm">Target Role</label>
        <Input
          placeholder="e.g. Software Engineer"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
      </div>

      {/* Company */}
      <div className="flex flex-col gap-2">
        <label className="text-sm">Company</label>
        <Input
          placeholder="e.g. Google"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      {/* Type */}
      <div className="flex flex-col gap-2">
        <label className="text-sm">Interview Type</label>
        <select
          className="p-2 rounded-md bg-background border"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="technical">Technical</option>
          <option value="hr">HR</option>
          <option value="behavioral">Behavioral</option>
          <option value="mixed">Mixed</option>
        </select>
      </div>

      {/* Difficulty */}
      <div className="flex flex-col gap-2">
        <label className="text-sm">Difficulty</label>
        <select
          className="p-2 rounded-md bg-background border"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {/* Interviewers */}
      <div className="flex flex-col gap-2">
        <label className="text-sm">Number of Interviewers</label>
        <select
          className="p-2 rounded-md bg-background border"
          value={interviewers}
          onChange={(e) => setInterviewers(Number(e.target.value))}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </div>

      {/* Duration */}
      <div className="flex flex-col gap-2">
        <label className="text-sm">Duration (minutes)</label>
        <select
          className="p-2 rounded-md bg-background border"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        >
          <option value={15}>15</option>
          <option value={20}>20</option>
          <option value={30}>30</option>
        </select>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3 mt-4">
        <Button onClick={startInterview}>
          ▶ Start Live Interview
        </Button>

        <Button
          variant="outline"
          onClick={() => router.push("/interview-prep/chat")}
        >
          💬 Switch to Chat Interview
        </Button>
      </div>
    </div>
  );
}

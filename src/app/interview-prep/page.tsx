"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  extractTextFromSupportedResumeFile,
  getSupportedResumeFileType,
  MAX_RESUME_FILE_SIZE_BYTES,
} from "@/lib/resume/textExtraction";

const FILE_SIZE_LIMIT_MB = Math.round(MAX_RESUME_FILE_SIZE_BYTES / (1024 * 1024));

export default function InterviewSetupPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [role, setRole] = useState("");
  const [type, setType] = useState("technical");
  const [interviewerCount, setInterviewerCount] = useState(2);
  const [duration, setDuration] = useState(20);
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [fileError, setFileError] = useState("");

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError("");
    setExtracting(true);

    if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
      setFileError(`File too large. Max ${FILE_SIZE_LIMIT_MB}MB.`);
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const supportedType = getSupportedResumeFileType(file);
    if (!supportedType) {
      setFileError("Unsupported file type. Please upload PDF, DOCX, or text files.");
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const extracted = await extractTextFromSupportedResumeFile(file);
      if (!extracted.text.trim()) {
        setFileError("Could not extract text. Try pasting manually.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setResumeFileName(file.name);
      setResumeText(extracted.text);
    } catch {
      setFileError("Failed to read file. Try another file.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setExtracting(false);
    }
  };

  const clearResume = () => {
    setResumeFileName(null);
    setResumeText("");
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startInterview = () => {
    localStorage.setItem(
      "interviewConfig",
      JSON.stringify({
        role,
        type,
        interviewerCount,
        duration,
        resumeText: resumeText || null,
      })
    );
    router.push("/interview-prep/room");
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">Interview Setup</h1>
          <p className="text-sm text-zinc-400">Customize your AI interview experience</p>
        </div>

        {/* Role */}
        <div className="space-y-2">
          <label className="text-sm text-zinc-300">Target Role</label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Software Engineer, Product Manager"
            className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        {/* Interview Type */}
        <div className="space-y-3">
          <label className="text-sm text-zinc-300">Interview Type</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "technical", label: "Technical" },
              { key: "behavioral", label: "Behavioral" },
              { key: "system", label: "System Design" },
              { key: "hr", label: "HR Round" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setType(item.key)}
                className={`py-3 rounded-lg border transition ${
                  type === item.key
                    ? "bg-purple-600 border-purple-500"
                    : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interviewers */}
        <div className="space-y-3">
          <label className="text-sm text-zinc-300">Number of Interviewers</label>
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
          <label className="text-sm text-zinc-300">Duration</label>
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

        {/* Resume Upload (optional) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-zinc-300">Resume <span className="text-zinc-500">(optional — gives interviewers context)</span></label>
          </div>

          {fileError && (
            <p className="text-xs text-red-400">{fileError}</p>
          )}

          {resumeFileName ? (
            <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-800 border border-green-700/50">
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-sm">✓</span>
                <span className="text-sm text-zinc-300 truncate max-w-[260px]">{resumeFileName}</span>
              </div>
              <button onClick={clearResume} className="text-zinc-500 hover:text-red-400 text-xs transition ml-2">✕ Remove</button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={extracting}
                className="w-full py-3 rounded-lg border border-dashed border-zinc-600 hover:border-purple-500 bg-zinc-800/50 hover:bg-zinc-800 text-sm text-zinc-400 hover:text-zinc-200 transition disabled:opacity-50"
              >
                {extracting ? "⏳ Extracting..." : "📄 Upload Resume PDF or DOCX"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.text,.md"
                onChange={handleResumeUpload}
                className="hidden"
              />
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Or paste resume text here..."
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:border-purple-500 text-sm text-zinc-300 placeholder:text-zinc-600 resize-none transition"
              />
            </div>
          )}
        </div>

        {/* Start */}
        <Button
          onClick={startInterview}
          className="w-full py-3 text-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
        >
          ▶ Start Interview
        </Button>

        {/* Chat Mode */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.push("/interview-prep/chat")}
        >
          💬 Use Classic Chat Mode
        </Button>
      </div>
    </div>
  );
}

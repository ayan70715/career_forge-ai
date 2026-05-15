"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mic, Users, Clock, FileText, Upload, X, Play, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  extractTextFromSupportedResumeFile,
  getSupportedResumeFileType,
  MAX_RESUME_FILE_SIZE_BYTES,
} from "@/lib/resume/textExtraction";

const FILE_SIZE_LIMIT_MB = Math.round(MAX_RESUME_FILE_SIZE_BYTES / (1024 * 1024));

const INTERVIEW_TYPES = [
  { key: "technical", label: "Technical", desc: "DSA, system concepts, coding" },
  { key: "behavioral", label: "Behavioral", desc: "STAR method, soft skills" },
  { key: "system", label: "System Design", desc: "Architecture, scalability" },
  { key: "hr", label: "HR Round", desc: "Culture fit, motivations" },
];

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
    localStorage.setItem("interviewConfig", JSON.stringify({
      role, type, interviewerCount, duration,
      resumeText: resumeText || null,
    }));
    router.push("/interview-prep/room");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="relative max-w-2xl mx-auto pb-10"
    >
      <PageHeader
        icon={Mic}
        title="Interview Setup"
        subtitle="Configure your AI-powered mock interview session with 3D avatar interviewers"
        gradient="from-rose-500 to-pink-600"
      />

      <div className="space-y-5">

        {/* Role */}
        <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Target Role</h2>
            </div>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Software Engineer, Product Manager, Data Scientist"
              className="w-full px-4 py-3 rounded-lg bg-surface-2 border border-glass-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary transition"
            />
          </CardContent>
        </Card>

        {/* Interview Type */}
        <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Interview Type</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {INTERVIEW_TYPES.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setType(item.key)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    type === item.key
                      ? "bg-primary/15 border-primary/50 text-foreground"
                      : "bg-surface-2 border-glass-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Interviewers + Duration */}
        <div className="grid grid-cols-2 gap-5">
          <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Interviewers</h2>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3].map((num) => (
                  <button
                    key={num}
                    onClick={() => setInterviewerCount(num)}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      interviewerCount === num
                        ? "bg-primary/15 border-primary/50 text-foreground"
                        : "bg-surface-2 border-glass-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Duration</h2>
              </div>
              <div className="flex gap-2">
                {[10, 20, 30].map((time) => (
                  <button
                    key={time}
                    onClick={() => setDuration(time)}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      duration === time
                        ? "bg-primary/15 border-primary/50 text-foreground"
                        : "bg-surface-2 border-glass-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {time}m
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Resume */}
        <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Resume</h2>
                <Badge variant="secondary" className="text-xs">Optional</Badge>
              </div>
              <span className="text-xs text-muted-foreground">Gives interviewers context</span>
            </div>

            {fileError && (
              <p className="text-xs text-destructive">{fileError}</p>
            )}

            {resumeFileName ? (
              <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-success/10 border border-success/25">
                <div className="flex items-center gap-2">
                  <span className="text-success text-sm">✓</span>
                  <span className="text-sm text-foreground truncate max-w-[260px]">{resumeFileName}</span>
                </div>
                <button onClick={clearResume} className="text-muted-foreground hover:text-destructive transition ml-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={extracting}
                  className="w-full py-3 rounded-lg border border-dashed border-glass-border hover:border-primary/50 bg-surface-2/50 hover:bg-surface-2 text-sm text-muted-foreground hover:text-foreground transition disabled:opacity-50"
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
                  className="w-full px-4 py-3 rounded-lg bg-surface-2 border border-glass-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none transition"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <Button
            onClick={startInterview}
            className="w-full py-6 text-base gap-2 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white border-0"
          >
            <Play className="h-5 w-5" />
            Start Interview
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push("/interview-prep/chat")}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Use Classic Chat Mode
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Trophy, CheckCircle2, AlertTriangle, XCircle, RotateCcw, BarChart3, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";

// ─────────────────────────────────────────────────────
// Puter.js — same fallback pattern used in InterviewRoomClient
// CDN script is injected once on mount; generateReport() uses it as fallback
// ─────────────────────────────────────────────────────
async function generateWithPuter(prompt: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puter = (window as any).puter;
  if (!puter?.ai?.chat) throw new Error("Puter not available");
  const response = await puter.ai.chat(prompt, { model: "gpt-4o-mini" });
  if (typeof response === "string") return response;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response as any)?.message?.content ?? (response as any)?.content ?? String(response);
}

// Tries Gemini first; falls back to puter.js on any error (quota, network, etc.)
async function generateReportText(prompt: string): Promise<string> {
  try {
    const { generateWithRetry } = await import("@/lib/ai/gemini");
    return await generateWithRetry(prompt);
  } catch (err) {
    console.warn("[Report] Gemini failed, trying puter.js fallback:", err);
    return await generateWithPuter(prompt);
  }
}

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
interface InterviewReport {
  overallScore: number;
  communicationScore: number;
  technicalScore: number;
  confidenceScore: number;
  structureScore: number;
  strengths: string[];
  improvements: string[];
  questionFeedback: { question: string; answer: string; feedback: string; score: number }[];
  summary: string;
  hiringVerdict: "Strong Hire" | "Hire" | "Borderline" | "No Hire";
  role: string;
  type: string;
  duration: number;
  totalQuestions: number;
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 80) return "text-success";
  if (s >= 60) return "text-warning";
  return "text-danger";
}

function scoreBg(s: number) {
  if (s >= 80) return "bg-success/10 border-success/25";
  if (s >= 60) return "bg-warning/10 border-warning/25";
  return "bg-danger/10 border-danger/25";
}

function scoreHex(s: number) {
  if (s >= 80) return "#22d3a0";
  if (s >= 60) return "#f59e0b";
  return "#f43f5e";
}

// ─────────────────────────────────────────────────────
// Score ring (SVG — uses hex for stroke, works in both themes)
// ─────────────────────────────────────────────────────
function ScoreRing({
  score, size = 120, strokeWidth = 10, label, animating,
}: {
  score: number; size?: number; strokeWidth?: number; label: string; animating: boolean;
}) {
  const [displayed, setDisplayed] = useState(0);
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const color = scoreHex(score);

  useEffect(() => {
    if (!animating) return;
    let frame = 0;
    const total = 60;
    const tick = () => {
      frame++;
      setDisplayed(Math.round((frame / total) * score));
      if (frame < total) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [score, animating]);

  const offset = circ - (displayed / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor"
            strokeWidth={strokeWidth} className="text-muted/20" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.02s linear" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold leading-none ${size > 100 ? "text-3xl" : "text-lg"} ${scoreColor(displayed)}`}>
            {displayed}
          </span>
          <span className="text-[9px] text-muted-foreground font-mono">/100</span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground font-mono tracking-wide text-center uppercase">
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Verdict badge
// ─────────────────────────────────────────────────────
function VerdictBadge({ verdict }: { verdict: InterviewReport["hiringVerdict"] }) {
  const cfg = {
    "Strong Hire": { icon: <Trophy className="h-4 w-4" />, cls: "bg-success/10 border-success/30 text-success", label: "Strong Hire" },
    "Hire":        { icon: <CheckCircle2 className="h-4 w-4" />, cls: "bg-primary/10 border-primary/30 text-primary", label: "Hire" },
    "Borderline":  { icon: <AlertTriangle className="h-4 w-4" />, cls: "bg-warning/10 border-warning/30 text-warning", label: "Borderline" },
    "No Hire":     { icon: <XCircle className="h-4 w-4" />, cls: "bg-danger/10 border-danger/30 text-danger", label: "No Hire" },
  }[verdict];

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${cfg.cls}`}>
      {cfg.icon}
      <div>
        <div className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">Hiring Verdict</div>
        <div className="text-sm font-bold">{cfg.label}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────
export default function InterviewReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [animated, setAnimated] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Analysing your interview...");
  const [error, setError] = useState("");

  // ── Load puter.js CDN for AI fallback (mirrors InterviewRoomClient) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).puter) return; // already loaded
    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const msgs = [
      "Analysing your interview...",
      "Evaluating communication skills...",
      "Scoring technical depth...",
      "Generating personalised feedback...",
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % msgs.length;
      setLoadingMsg(msgs[i]);
    }, 1800);

    // Try cached report first
    const stored = localStorage.getItem("interviewReport");
    if (stored) {
      try {
        setReport(JSON.parse(stored));
        setLoading(false);
        clearInterval(interval);
        setTimeout(() => setAnimated(true), 300);
        return;
      } catch {}
    }

    const rawData = localStorage.getItem("interviewRawData");
    if (!rawData) {
      setLoading(false);
      clearInterval(interval);
      return;
    }

    const { transcript, config, elapsed } = JSON.parse(rawData);

    const prompt = `You are an expert interview evaluator. Analyse this interview transcript and return ONLY valid JSON.

INTERVIEW DETAILS:
- Role: ${config.role || "Software Engineer"}
- Type: ${config.type}
- Duration: ${Math.floor(elapsed / 60)} minutes

TRANSCRIPT:
${transcript.slice(0, 4000)}

Return ONLY this JSON (no markdown, no backticks):
{
  "overallScore": <0-100>,
  "communicationScore": <0-100>,
  "technicalScore": <0-100>,
  "confidenceScore": <0-100>,
  "structureScore": <0-100>,
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<area 1>", "<area 2>", "<area 3>"],
  "questionFeedback": [
    {
      "question": "<interviewer question>",
      "answer": "<candidate answer summary in 1 sentence>",
      "feedback": "<specific constructive feedback>",
      "score": <0-100>
    }
  ],
  "summary": "<2-3 sentence honest overall assessment>",
  "hiringVerdict": "Strong Hire" | "Hire" | "Borderline" | "No Hire"
}

SCORING RULES:
- Be honest — do not inflate scores
- technicalScore: depth of technical knowledge demonstrated
- communicationScore: clarity, articulation, coherence
- confidenceScore: assertiveness, directness, avoiding filler words
- structureScore: STAR method, organised answers
- questionFeedback: up to 5 most important Q&A pairs
- hiringVerdict: reflect overall performance honestly`;

    // generateReportText tries Gemini first, then puter.js — same prompt goes to both
    generateReportText(prompt)
      .then((raw) => {
        const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        const full: InterviewReport = {
          ...parsed,
          role: config.role || "Software Engineer",
          type: config.type,
          duration: Math.floor(elapsed / 60),
          totalQuestions: parsed.questionFeedback?.length || 0,
        };
        localStorage.setItem("interviewReport", JSON.stringify(full));
        clearInterval(interval);
        setReport(full);
        setLoading(false);
        setTimeout(() => setAnimated(true), 300);
      })
      .catch(() => {
        clearInterval(interval);
        setError("Failed to generate report. Please try again.");
        setLoading(false);
      });

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="relative max-w-4xl mx-auto pb-10"
    >
      <PageHeader
        icon={BarChart3}
        title="Interview Report"
        subtitle="AI-generated analysis of your mock interview performance"
        gradient="from-rose-500 to-purple-600"
      />

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-6">
          <div className="relative w-16 h-16">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground font-mono animate-pulse">{loadingMsg}</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 mb-6 text-sm">
          {error}
          <Button variant="outline" size="sm" className="ml-4" onClick={() => router.push("/interview-prep")}>
            Try Again
          </Button>
        </div>
      )}

      {/* No data */}
      {!loading && !report && !error && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <span className="text-5xl">🤷</span>
          <p className="text-muted-foreground text-sm">No interview data found.</p>
          <Button onClick={() => router.push("/interview-prep")}>Start an Interview</Button>
        </div>
      )}

      {/* Report */}
      {!loading && report && (
        <div className="space-y-5">

          {/* Header card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
              <CardContent className="p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-foreground">{report.role} Interview</h2>
                    <div className="flex gap-3 mt-2 flex-wrap">
                      <Badge variant="secondary" className="font-mono text-xs uppercase">{report.type}</Badge>
                      <span className="text-xs text-muted-foreground font-mono">{report.duration} min</span>
                      <span className="text-xs text-muted-foreground font-mono">{report.totalQuestions} questions</span>
                    </div>
                  </div>
                  <VerdictBadge verdict={report.hiringVerdict} />
                </div>
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{report.summary}</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Score cards */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold text-foreground mb-5">Performance Scores</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-6 items-center justify-items-center">
                  <ScoreRing score={report.overallScore} size={120} label="Overall" animating={animated} />
                  {[
                    { score: report.communicationScore, label: "Communication" },
                    { score: report.technicalScore, label: "Technical" },
                    { score: report.confidenceScore, label: "Confidence" },
                    { score: report.structureScore, label: "Structure" },
                  ].map((item) => (
                    <ScoreRing key={item.label} score={item.score} size={80} strokeWidth={7} label={item.label} animating={animated} />
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Strengths + Improvements */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-5"
          >
            <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
              <CardContent className="p-6">
                <h3 className="text-xs font-semibold text-success font-mono tracking-widest uppercase mb-4">✦ Strengths</h3>
                <div className="space-y-3">
                  {report.strengths.map((s, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="w-1.5 h-1.5 rounded-full bg-success mt-1.5 shrink-0" />
                      <p className="text-sm text-foreground leading-relaxed">{s}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
              <CardContent className="p-6">
                <h3 className="text-xs font-semibold text-warning font-mono tracking-widest uppercase mb-4">⚠ Areas to Improve</h3>
                <div className="space-y-3">
                  {report.improvements.map((s, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 shrink-0" />
                      <p className="text-sm text-foreground leading-relaxed">{s}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Q&A Feedback */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
              <CardContent className="p-6">
                <h3 className="text-xs font-semibold text-primary font-mono tracking-widest uppercase mb-5">🔍 Question-by-Question Analysis</h3>
                <div className="space-y-4">
                  {report.questionFeedback.map((item, i) => (
                    <div key={i} className={`p-4 rounded-xl border ${scoreBg(item.score)}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-sm font-semibold text-foreground leading-snug flex-1">
                          Q{i + 1}. {item.question}
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${item.score}%`, background: scoreHex(item.score) }}
                            />
                          </div>
                          <span className={`text-xs font-bold font-mono ${scoreColor(item.score)}`}>{item.score}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mb-2 leading-relaxed">
                        Your answer: {item.answer}
                      </p>
                      <p className="text-xs text-foreground/70 leading-relaxed border-l-2 border-primary/30 pl-3">
                        {item.feedback}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <Button
              className="flex-1 gap-2 bg-gradient-to-r from-rose-500 to-purple-600 hover:from-rose-600 hover:to-purple-700 text-white border-0"
              onClick={() => {
                localStorage.removeItem("interviewReport");
                localStorage.removeItem("interviewRawData");
                router.push("/interview-prep/room");
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Retry Interview
            </Button>
            <Button variant="outline" className="flex-1 gap-2" onClick={() => router.push("/job-analyse")}>
              <BarChart3 className="h-4 w-4" />
              Analyse Job Fit
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => router.push("/interview-prep")}>
              ← Back to Setup
            </Button>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

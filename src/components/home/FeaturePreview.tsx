"use client";

import { useEffect, useState } from "react";

/* ── Resume Builder: Animated typing lines ── */
export function ResumePreview() {
  return (
    <div className="space-y-2 p-1">
      {/* Mini resume mockup */}
      <div className="rounded-lg border border-glass-border bg-surface-1 p-3 space-y-2">
        <div className="h-2.5 w-24 rounded-full bg-primary/30 animate-shimmer" />
        <div className="h-1.5 w-32 rounded-full bg-surface-6" />
        <div className="mt-3 space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-surface-5 animate-[shimmer_3s_ease-in-out_infinite]" />
          <div className="h-1.5 w-[85%] rounded-full bg-surface-4 animate-[shimmer_3s_ease-in-out_0.2s_infinite]" />
          <div className="h-1.5 w-[70%] rounded-full bg-surface-3 animate-[shimmer_3s_ease-in-out_0.4s_infinite]" />
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-2 w-20 rounded-full bg-violet-500/20" />
          <div className="h-1.5 w-full rounded-full bg-surface-4" />
          <div className="h-1.5 w-[90%] rounded-full bg-surface-3" />
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-2 w-16 rounded-full bg-violet-500/20" />
          <div className="h-1.5 w-[80%] rounded-full bg-surface-4" />
          <div className="h-1.5 w-full rounded-full bg-surface-3" />
        </div>
      </div>
    </div>
  );
}

/* ── AI Enhance: Shimmer transformation ── */
export function EnhancePreview() {
  return (
    <div className="relative p-1">
      <div className="rounded-lg border border-glass-border bg-surface-1 p-3 space-y-2">
        {/* "Before" text fading out */}
        <div className="space-y-1.5 opacity-40">
          <div className="h-1.5 w-full rounded-full bg-surface-6" />
          <div className="h-1.5 w-[75%] rounded-full bg-surface-5" />
        </div>
        {/* Shimmer sweep line */}
        <div className="h-px w-full bg-linear-to-r from-transparent via-amber-400/40 to-transparent animate-shimmer" />
        {/* "After" text brighter */}
        <div className="space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-amber-400/20 animate-[shimmer_2.5s_ease-in-out_infinite]" />
          <div className="h-1.5 w-[85%] rounded-full bg-amber-400/15 animate-[shimmer_2.5s_ease-in-out_0.3s_infinite]" />
        </div>
      </div>
    </div>
  );
}

/* ── ATS Checker: Animated gauge ── */
export function ATSPreview() {
  const [score, setScore] = useState(0);
  const target = 92;

  useEffect(() => {
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        setScore((prev) => {
          if (prev >= target) {
            clearInterval(interval);
            return target;
          }
          return prev + 1;
        });
      }, 20);
      return () => clearInterval(interval);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex items-center justify-center p-2">
      <div className="relative">
        <svg width="90" height="90" viewBox="0 0 90 90" className="-rotate-90">
          <circle
            cx="45"
            cy="45"
            r="36"
            fill="none"
            stroke="var(--surface-5)"
            strokeWidth="5"
          />
          <circle
            cx="45"
            cy="45"
            r="36"
            fill="none"
            stroke="url(#atsGradient)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.1s ease" }}
          />
          <defs>
            <linearGradient id="atsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-emerald-400">{score}%</span>
        </div>
      </div>
    </div>
  );
}

/* ── CV Generator: Document preview ── */
export function CVPreview() {
  return (
    <div className="p-1">
      <div className="rounded-lg border border-glass-border bg-surface-1 p-3 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-2 w-2 rounded-full bg-cyan-400/40" />
          <div className="h-1.5 w-20 rounded-full bg-cyan-400/20" />
        </div>
        <div className="space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-surface-5" />
          <div className="h-1.5 w-[90%] rounded-full bg-surface-4" />
          <div className="h-1.5 w-[70%] rounded-full bg-surface-3" />
        </div>
        <div className="mt-2 h-px w-full bg-glass-border" />
        <div className="space-y-1.5">
          <div className="h-1.5 w-[80%] rounded-full bg-surface-4" />
          <div className="h-1.5 w-full rounded-full bg-surface-3" />
          <div className="h-1.5 w-[60%] rounded-full bg-surface-2" />
        </div>
      </div>
    </div>
  );
}

/* ── Interview Prep: Video Conference Animation ── */
export function InterviewPreview() {
  const [speaking, setSpeaking] = useState<"ai" | "user" | null>("ai");
  const [bars, setBars] = useState([3, 5, 2, 7, 4, 6, 3, 5]);

  // Cycle speaking turns
  useEffect(() => {
    const sequence = ["ai", null, "user", null, "ai"] as const;
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % sequence.length;
      setSpeaking(sequence[idx]);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  // Animate waveform bars when speaking
  useEffect(() => {
    if (!speaking) return;
    const interval = setInterval(() => {
      setBars((prev) =>
        prev.map(() => Math.floor(Math.random() * 7) + 1)
      );
    }, 150);
    return () => clearInterval(interval);
  }, [speaking]);

  return (
    <div className="p-1 space-y-1.5">
      {/* Video grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {/* AI interviewer tile */}
        <div
          className={`relative rounded-lg bg-surface-2 border overflow-hidden transition-all duration-300 ${
            speaking === "ai"
              ? "border-violet-500/60 shadow-[0_0_8px_rgba(139,92,246,0.4)]"
              : "border-glass-border"
          }`}
          style={{ aspectRatio: "4/3" }}
        >
          {/* Avatar */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 rounded-full bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2z"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </div>
          </div>
          {/* Speaking indicator ring */}
          {speaking === "ai" && (
            <div className="absolute inset-0 rounded-lg border-2 border-violet-500/50 animate-[pulse_1s_ease-in-out_infinite]" />
          )}
          {/* Label */}
          <div className="absolute bottom-1 left-1 bg-black/40 backdrop-blur-sm rounded px-1 py-0.5">
            <span className="text-[9px] text-white/80 font-medium">AI Interviewer</span>
          </div>
          {/* Mic icon */}
          <div className="absolute top-1 right-1">
            <div className={`h-3.5 w-3.5 rounded-full flex items-center justify-center ${speaking === "ai" ? "bg-violet-500/80" : "bg-surface-4"}`}>
              <svg className="h-2 w-2 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
                <path d="M5 10a7 7 0 0 0 14 0"/>
              </svg>
            </div>
          </div>
        </div>

        {/* User tile */}
        <div
          className={`relative rounded-lg bg-surface-2 border overflow-hidden transition-all duration-300 ${
            speaking === "user"
              ? "border-rose-500/60 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
              : "border-glass-border"
          }`}
          style={{ aspectRatio: "4/3" }}
        >
          {/* Avatar */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 rounded-full bg-linear-to-br from-rose-500 to-pink-600 flex items-center justify-center">
              <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
          </div>
          {speaking === "user" && (
            <div className="absolute inset-0 rounded-lg border-2 border-rose-500/50 animate-[pulse_1s_ease-in-out_infinite]" />
          )}
          <div className="absolute bottom-1 left-1 bg-black/40 backdrop-blur-sm rounded px-1 py-0.5">
            <span className="text-[9px] text-white/80 font-medium">You</span>
          </div>
          <div className="absolute top-1 right-1">
            <div className={`h-3.5 w-3.5 rounded-full flex items-center justify-center ${speaking === "user" ? "bg-rose-500/80" : "bg-surface-4"}`}>
              <svg className="h-2 w-2 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
                <path d="M5 10a7 7 0 0 0 14 0"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Waveform / toolbar row */}
      <div className="rounded-lg border border-glass-border bg-surface-1 px-2 py-1.5 flex items-center justify-between gap-2">
        {/* Animated waveform */}
        <div className="flex items-center gap-[2px] h-4">
          {bars.map((h, i) => (
            <div
              key={i}
              className={`w-[3px] rounded-full transition-all duration-150 ${
                speaking ? "bg-linear-to-t from-rose-500 to-violet-500 opacity-80" : "bg-surface-5 opacity-40"
              }`}
              style={{ height: speaking ? `${h * 2}px` : "4px" }}
            />
          ))}
        </div>
        {/* Control icons */}
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 rounded-full bg-surface-3 flex items-center justify-center">
            <svg className="h-2 w-2 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v12a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm4 1A.5.5 0 0 1 10 7v10a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5zm4 0A.5.5 0 0 1 14 7v10a.5.5 0 0 1-1 0V7a.5.5 0 0 1 .5-.5zm4-2A.5.5 0 0 1 18 5v14a.5.5 0 0 1-1 0V5a.5.5 0 0 1 .5-.5z"/>
            </svg>
          </div>
          <div className="h-4 w-4 rounded-full bg-rose-500/20 flex items-center justify-center">
            <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Resume Verifier: Mixed test signal ── */
export function ResumeVerifierPreview() {
  return (
    <div className="space-y-2 p-1">
      <div className="rounded-lg border border-glass-border bg-surface-1 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="h-1.5 w-20 rounded-full bg-indigo-400/30" />
          <div className="h-5 w-9 rounded-md border border-indigo-400/20 bg-indigo-400/10" />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-md border border-glass-border bg-surface-2 h-5" />
          <div className="rounded-md border border-glass-border bg-surface-2 h-5" />
          <div className="rounded-md border border-glass-border bg-surface-2 h-5" />
        </div>

        <div className="rounded-md border border-glass-border bg-code-bg p-2">
          <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-2">
            <div className="space-y-1">
              <div className="h-1.5 rounded-full bg-surface-4" />
              <div className="h-1.5 rounded-full bg-surface-4" />
              <div className="h-1.5 rounded-full bg-surface-4" />
            </div>
            <div className="space-y-1">
              <div className="h-1.5 w-[85%] rounded-full bg-indigo-400/25" />
              <div className="h-1.5 w-full rounded-full bg-indigo-400/18" />
              <div className="h-1.5 w-[70%] rounded-full bg-indigo-400/12" />
            </div>
          </div>
        </div>

        <div className="h-1.5 w-[62%] rounded-full bg-emerald-400/30" />
      </div>
    </div>
  );
}

/* ── Project Analyser: Animated strength & uniqueness bars ── */
export function ProjectAnalysePreview() {
  const [progress, setProgress] = useState([0, 0, 0, 0]);
  const targets = [88, 74, 92, 61];

  const labels = ["Strength", "Originality", "Complexity", "Impact"];
  const colors = [
    "from-fuchsia-500 to-indigo-500",
    "from-violet-500 to-fuchsia-400",
    "from-indigo-500 to-fuchsia-500",
    "from-purple-500 to-indigo-400",
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      const intervals: ReturnType<typeof setInterval>[] = [];
      targets.forEach((target, i) => {
        const delay = i * 200;
        const t = setTimeout(() => {
          const interval = setInterval(() => {
            setProgress((prev) => {
              const next = [...prev];
              if (next[i] >= target) {
                clearInterval(interval);
              } else {
                next[i] = Math.min(next[i] + 2, target);
              }
              return next;
            });
          }, 18);
          intervals.push(interval);
        }, delay);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="p-1">
      <div className="rounded-lg border border-glass-border bg-surface-1 p-3 space-y-2.5">
        {/* Scanning line animation at top */}
        <div className="relative h-1 w-full rounded-full overflow-hidden bg-surface-3">
          <div className="absolute inset-y-0 left-0 w-1/3 bg-linear-to-r from-transparent via-fuchsia-400/60 to-transparent animate-[shimmer_2s_ease-in-out_infinite]" />
        </div>

        {/* Metric bars */}
        {labels.map((label, i) => (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="h-1.5 rounded-full bg-surface-5" style={{ width: `${label.length * 6}px` }} />
              <span className="text-[9px] font-mono text-fuchsia-400/70">{progress[i]}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
              <div
                className={`h-full rounded-full bg-linear-to-r ${colors[i]} transition-all duration-75`}
                style={{ width: `${progress[i]}%` }}
              />
            </div>
          </div>
        ))}

        {/* Bottom tag row */}
        <div className="flex gap-1 pt-0.5">
          <div className="h-3.5 w-10 rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10" />
          <div className="h-3.5 w-8 rounded-full border border-indigo-500/20 bg-indigo-500/10" />
          <div className="h-3.5 w-12 rounded-full border border-violet-500/20 bg-violet-500/10" />
        </div>
      </div>
    </div>
  );
}

/* ── Job Analyser: Skeleton of the real Job Analyse page ── */
export function JobAnalysePreview() {
  const [score, setScore] = useState(0);
  const [salaryPos, setSalaryPos] = useState(0);
  const [gapsVisible, setGapsVisible] = useState(false);
  const [questionsVisible, setQuestionsVisible] = useState(false);
  const targetScore = 68;

  useEffect(() => {
    // Animate score gauge
    const scoreTimer = setTimeout(() => {
      const interval = setInterval(() => {
        setScore((prev) => {
          if (prev >= targetScore) { clearInterval(interval); return targetScore; }
          return prev + 2;
        });
      }, 30);
      return () => clearInterval(interval);
    }, 300);

    // Animate salary thumb sliding in
    const salaryTimer = setTimeout(() => {
      setSalaryPos(45);
    }, 800);

    // Reveal gap alerts
    const gapTimer = setTimeout(() => setGapsVisible(true), 1200);

    // Reveal interview questions
    const qTimer = setTimeout(() => setQuestionsVisible(true), 1600);

    return () => {
      clearTimeout(scoreTimer);
      clearTimeout(salaryTimer);
      clearTimeout(gapTimer);
      clearTimeout(qTimer);
    };
  }, []);

  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (score / 100) * circumference;

  const gaps = [
    { label: "React", priority: "MUST HAVE", color: "text-rose-400 border-rose-500/30 bg-rose-500/10" },
    { label: "AWS", priority: "IMPORTANT", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
    { label: "Docker", priority: "IMPORTANT", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  ];

  return (
    <div className="p-1 space-y-1.5">
      {/* ── Top row: Score + Salary ── */}
      <div className="grid grid-cols-2 gap-1.5">

        {/* Compatibility Score */}
        <div className="rounded-lg border border-glass-border bg-surface-1 p-2 space-y-1.5">
          <div className="h-[9px] w-20 rounded-full bg-sky-500/20" />
          <div className="flex items-center gap-2">
            {/* Mini gauge */}
            <div className="relative shrink-0">
              <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
                <circle cx="26" cy="26" r="22" fill="none" stroke="var(--surface-4)" strokeWidth="4" />
                <circle
                  cx="26" cy="26" r="22"
                  fill="none"
                  stroke="url(#jobGauge)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  style={{ transition: "stroke-dashoffset 0.08s ease" }}
                />
                <defs>
                  <linearGradient id="jobGauge" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#f97316" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] font-bold text-amber-400 leading-none">{score}</span>
                <span className="text-[7px] text-muted-foreground leading-none mt-0.5">MATCH</span>
              </div>
            </div>
            {/* Skill tags */}
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex gap-1 flex-wrap">
                <div className="h-3.5 w-10 rounded-sm border border-emerald-500/30 bg-emerald-500/10" />
                <div className="h-3.5 w-12 rounded-sm border border-emerald-500/30 bg-emerald-500/10" />
              </div>
              <div className="flex gap-1 flex-wrap">
                <div className="h-3.5 w-14 rounded-sm border border-emerald-500/30 bg-emerald-500/10" />
                <div className="h-3.5 w-8 rounded-sm border border-emerald-500/30 bg-emerald-500/10" />
              </div>
            </div>
          </div>
        </div>

        {/* Salary Benchmark */}
        <div className="rounded-lg border border-glass-border bg-surface-1 p-2 space-y-1.5">
          <div className="h-[9px] w-24 rounded-full bg-blue-500/20" />
          {/* Salary range labels */}
          <div className="flex justify-between">
            <span className="text-[8px] text-muted-foreground">₹6L</span>
            <span className="text-[8px] text-blue-400 font-mono">₹12L</span>
            <span className="text-[8px] text-muted-foreground">₹24L</span>
          </div>
          {/* Slider track */}
          <div className="relative h-1.5 w-full rounded-full bg-surface-3 overflow-visible">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-blue-600 to-indigo-400 transition-all duration-700 ease-out"
              style={{ width: `${salaryPos}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-rose-400 border border-white/20 shadow-[0_0_6px_rgba(244,63,94,0.6)] transition-all duration-700 ease-out"
              style={{ left: `${salaryPos}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px] text-muted-foreground">
            <span>Entry</span>
            <span>Senior</span>
          </div>
          {/* Benchmark note */}
          <div className="h-[9px] w-full rounded-full bg-surface-3" />
        </div>
      </div>

      {/* ── Bottom row: Gap Alerts + Interview Sheet ── */}
      <div className="grid grid-cols-2 gap-1.5">

        {/* Critical Gap Alerts */}
        <div className="rounded-lg border border-glass-border bg-surface-1 p-2 space-y-1.5">
          <div className="flex items-center gap-1 mb-1">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <div className="h-[9px] w-20 rounded-full bg-amber-500/20" />
          </div>
          <div className="space-y-1">
            {gaps.map((gap, i) => (
              <div
                key={gap.label}
                className={`flex items-center justify-between rounded px-1.5 py-1 border transition-all duration-300 ${
                  gapsVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
                }`}
                style={{ transitionDelay: `${i * 120}ms`, borderColor: "rgba(255,255,255,0.06)", background: "var(--surface-2)" }}
              >
                <div className="h-[9px] rounded-full bg-surface-5" style={{ width: `${gap.label.length * 5}px` }} />
                <div className={`text-[7px] font-bold px-1 py-0.5 rounded border ${gap.color}`}>
                  {gap.priority === "MUST HAVE" ? "MUST" : "IMP"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interview Cheat Sheet */}
        <div className="rounded-lg border border-glass-border bg-surface-1 p-2 space-y-1.5">
          <div className="flex items-center gap-1 mb-1">
            <div className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-[pulse_1.5s_ease-in-out_infinite]" />
            <div className="h-[9px] w-20 rounded-full bg-rose-500/20" />
          </div>
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`space-y-0.5 transition-all duration-300 ${
                  questionsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                }`}
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                <div className="h-[9px] w-full rounded-full bg-surface-5" />
                <div className="h-[9px] w-[80%] rounded-full bg-surface-4" />
                <div className="h-[8px] w-full rounded-full bg-surface-3 opacity-50" />
                <div className="h-[8px] w-[70%] rounded-full bg-surface-3 opacity-40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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

/* ── Interview Prep: Chat bubbles ── */
export function InterviewPreview() {
  return (
    <div className="space-y-2 p-1">
      {/* AI bubble */}
      <div className="flex gap-2 items-start">
        <div className="h-5 w-5 rounded-full bg-linear-to-br from-violet-500 to-purple-500 shrink-0" />
        <div className="rounded-lg rounded-tl-none border border-primary/20 bg-primary/5 px-2.5 py-1.5 max-w-[80%]">
          <div className="space-y-1">
            <div className="h-1.5 w-28 rounded-full bg-surface-6" />
            <div className="h-1.5 w-20 rounded-full bg-surface-5" />
          </div>
        </div>
      </div>
      {/* User bubble */}
      <div className="flex gap-2 items-start justify-end">
        <div className="rounded-lg rounded-tr-none border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 max-w-[75%]">
          <div className="space-y-1">
            <div className="h-1.5 w-24 rounded-full bg-surface-6" />
          </div>
        </div>
        <div className="h-5 w-5 rounded-full bg-linear-to-br from-emerald-500 to-teal-500 shrink-0" />
      </div>
      {/* AI typing */}
      <div className="flex gap-2 items-start">
        <div className="h-5 w-5 rounded-full bg-linear-to-br from-violet-500 to-purple-500 shrink-0" />
        <div className="rounded-lg rounded-tl-none border border-primary/20 bg-primary/5 px-2.5 py-1.5">
          <div className="flex gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-[pulse_1s_ease-in-out_infinite]" />
            <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-[pulse_1s_ease-in-out_0.2s_infinite]" />
            <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-[pulse_1s_ease-in-out_0.4s_infinite]" />
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

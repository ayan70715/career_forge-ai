"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
// Circular score gauge
// ─────────────────────────────────────────────────────
function ScoreRing({
  score,
  size = 120,
  strokeWidth = 10,
  label,
  color,
  animating,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  color: string;
  animating: boolean;
}) {
  const [displayed, setDisplayed] = useState(0);
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;

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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.02s linear" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: size > 100 ? "28px" : "18px", fontWeight: 700, color, lineHeight: 1 }}>{displayed}</span>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace" }}>/100</span>
        </div>
      </div>
      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", textAlign: "center" }}>
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Verdict badge
// ─────────────────────────────────────────────────────
function VerdictBadge({ verdict }: { verdict: InterviewReport["hiringVerdict"] }) {
  const config = {
    "Strong Hire": { color: "#22d3a0", bg: "rgba(34,211,160,0.12)", border: "rgba(34,211,160,0.3)", icon: "🚀" },
    "Hire": { color: "#63d2ff", bg: "rgba(99,210,255,0.12)", border: "rgba(99,210,255,0.3)", icon: "✅" },
    "Borderline": { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", icon: "⚖️" },
    "No Hire": { color: "#f43f5e", bg: "rgba(244,63,94,0.12)", border: "rgba(244,63,94,0.3)", icon: "❌" },
  }[verdict];

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "10px",
      padding: "10px 20px", borderRadius: "12px",
      background: config.bg, border: `1.5px solid ${config.border}`,
    }}>
      <span style={{ fontSize: "20px" }}>{config.icon}</span>
      <div>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em" }}>HIRING VERDICT</div>
        <div style={{ fontSize: "16px", fontWeight: 700, color: config.color }}>{verdict}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main Report Page
// ─────────────────────────────────────────────────────
export default function InterviewReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [animated, setAnimated] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Analysing your interview...");

  useEffect(() => {
    const msgs = [
      "Analysing your interview...",
      "Evaluating communication skills...",
      "Scoring technical depth...",
      "Generating feedback...",
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % msgs.length;
      setLoadingMsg(msgs[i]);
    }, 1800);

    const stored = localStorage.getItem("interviewReport");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        clearInterval(interval);
        setReport(parsed);
        setLoading(false);
        setTimeout(() => setAnimated(true), 300);
        return;
      } catch {}
    }

    // If no report yet — try generating from raw data
    const rawData = localStorage.getItem("interviewRawData");
    if (!rawData) {
      setLoading(false);
      return;
    }

    const { transcript, config, elapsed } = JSON.parse(rawData);

    const prompt = `
You are an expert interview evaluator. Analyse this interview transcript and return ONLY valid JSON.

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
      "feedback": "<specific feedback on this answer>",
      "score": <0-100>
    }
  ],
  "summary": "<2-3 sentence overall performance summary>",
  "hiringVerdict": "Strong Hire" | "Hire" | "Borderline" | "No Hire"
}

SCORING RULES:
- Be honest and specific — do not inflate scores
- technicalScore: depth of technical knowledge shown
- communicationScore: clarity, articulation, coherence
- confidenceScore: assertiveness, avoiding filler words, directness
- structureScore: STAR method usage, organized answers
- questionFeedback: include up to 5 most important Q&A pairs
- hiringVerdict: based on overall performance
`;

    import("@/lib/ai/gemini").then(async ({ generateWithRetry }) => {
      try {
        let raw = await generateWithRetry(prompt);
        raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        const parsed = JSON.parse(raw);
        const fullReport: InterviewReport = {
          ...parsed,
          role: config.role || "Software Engineer",
          type: config.type,
          duration: Math.floor(elapsed / 60),
          totalQuestions: parsed.questionFeedback?.length || 0,
        };
        localStorage.setItem("interviewReport", JSON.stringify(fullReport));
        clearInterval(interval);
        setReport(fullReport);
        setLoading(false);
        setTimeout(() => setAnimated(true), 300);
      } catch {
        // Fallback to Puter
        try {
          const raw = await (window as any).puter.ai.chat(prompt);
          const text = typeof raw === "string" ? raw : (raw as any)?.message?.content ?? JSON.stringify(raw);
          const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
          const parsed = JSON.parse(cleaned);
          const fullReport: InterviewReport = {
            ...parsed,
            role: config.role || "Software Engineer",
            type: config.type,
            duration: Math.floor(elapsed / 60),
            totalQuestions: parsed.questionFeedback?.length || 0,
          };
          localStorage.setItem("interviewReport", JSON.stringify(fullReport));
          clearInterval(interval);
          setReport(fullReport);
          setLoading(false);
          setTimeout(() => setAnimated(true), 300);
        } catch {
          clearInterval(interval);
          setLoading(false);
        }
      }
    });

    return () => clearInterval(interval);
  }, []);

  const scoreColor = (s: number) => s >= 80 ? "#22d3a0" : s >= 60 ? "#f59e0b" : "#f43f5e";

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .card { animation: fadeUp 0.5s ease forwards; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 15% 0%, #0b1a2e 0%, #060a10 50%, #040508 100%)",
        color: "#fff", fontFamily: "'Syne', sans-serif",
      }}>

        {/* ── NAV ── */}
        <nav style={{
          padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(4,6,12,0.7)", backdropFilter: "blur(12px)",
          position: "sticky", top: 0, zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, #f43f5e 0%, #a855f7 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>🎯</div>
            <span style={{ fontWeight: 700, fontSize: "16px" }}>CareerForge</span>
            <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "20px", background: "rgba(244,63,94,0.1)", color: "#f43f5e", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", border: "1px solid rgba(244,63,94,0.2)" }}>INTERVIEW REPORT</span>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => router.push("/interview-prep")}
              style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontFamily: "'Syne', sans-serif" }}
            >
              Practice Again
            </button>
            <button
              onClick={() => router.push("/")}
              style={{ padding: "8px 16px", borderRadius: "8px", fontSize: "13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: "'Syne', sans-serif" }}
            >
              ← Home
            </button>
          </div>
        </nav>

        {/* ── LOADING ── */}
        {loading && (
          <div style={{ minHeight: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px" }}>
            <div style={{ position: "relative", width: "80px", height: "80px" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "#f43f5e", animation: "spin 1s linear infinite" }} />
              <div style={{ position: "absolute", inset: "10px", borderRadius: "50%", border: "2px solid transparent", borderTopColor: "#a855f7", animation: "spin 1.5s linear infinite reverse" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>📊</div>
            </div>
            <p style={{ fontSize: "13px", color: "#a855f7", fontFamily: "'JetBrains Mono', monospace", animation: "pulse 1.5s ease-in-out infinite", letterSpacing: "0.06em" }}>{loadingMsg}</p>
          </div>
        )}

        {/* ── NO DATA ── */}
        {!loading && !report && (
          <div style={{ minHeight: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
            <span style={{ fontSize: "48px" }}>🤷</span>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>No interview data found.</p>
            <button onClick={() => router.push("/interview-prep")} style={{ padding: "10px 24px", borderRadius: "10px", background: "rgba(244,63,94,0.15)", color: "#f43f5e", border: "1px solid rgba(244,63,94,0.3)", cursor: "pointer", fontFamily: "'Syne', sans-serif", fontSize: "13px" }}>
              Start an Interview
            </button>
          </div>
        )}

        {/* ── REPORT ── */}
        {!loading && report && (
          <div style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 24px 80px" }}>

            {/* Header */}
            <div className="card" style={{ marginBottom: "32px", animationDelay: "0s" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <h1 style={{ fontSize: "26px", fontWeight: 800, marginBottom: "6px" }}>
                    {report.role} Interview
                  </h1>
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    {[
                      { label: report.type.toUpperCase(), color: "#63d2ff" },
                      { label: `${report.duration} MIN`, color: "rgba(255,255,255,0.4)" },
                      { label: `${report.totalQuestions} QUESTIONS`, color: "rgba(255,255,255,0.4)" },
                    ].map((tag) => (
                      <span key={tag.label} style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: tag.color, letterSpacing: "0.08em" }}>{tag.label}</span>
                    ))}
                  </div>
                </div>
                <VerdictBadge verdict={report.hiringVerdict} />
              </div>

              {/* Summary */}
              <div style={{ marginTop: "20px", padding: "16px 20px", borderRadius: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.65)", lineHeight: 1.7 }}>{report.summary}</p>
              </div>
            </div>

            {/* Score cards row */}
            <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "16px", marginBottom: "20px", animationDelay: "0.1s" }}>
              {/* Overall — larger */}
              <div style={{ gridColumn: "span 1", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                <ScoreRing score={report.overallScore} size={120} label="OVERALL" color={scoreColor(report.overallScore)} animating={animated} />
              </div>

              {[
                { score: report.communicationScore, label: "COMMUNICATION" },
                { score: report.technicalScore, label: "TECHNICAL" },
                { score: report.confidenceScore, label: "CONFIDENCE" },
                { score: report.structureScore, label: "STRUCTURE" },
              ].map((item) => (
                <div key={item.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <ScoreRing score={item.score} size={80} strokeWidth={7} label={item.label} color={scoreColor(item.score)} animating={animated} />
                </div>
              ))}
            </div>

            {/* Strengths + Improvements */}
            <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px", animationDelay: "0.2s" }}>
              {/* Strengths */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "24px" }}>
                <div style={{ fontSize: "11px", color: "#22d3a0", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: "16px" }}>✦ STRENGTHS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {report.strengths.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22d3a0", marginTop: "6px", flexShrink: 0 }} />
                      <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>{s}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Improvements */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "24px" }}>
                <div style={{ fontSize: "11px", color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: "16px" }}>⚠ AREAS TO IMPROVE</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {report.improvements.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#f59e0b", marginTop: "6px", flexShrink: 0 }} />
                      <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Question-by-question feedback */}
            <div className="card" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "24px", animationDelay: "0.3s" }}>
              <div style={{ fontSize: "11px", color: "#a855f7", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: "20px" }}>🔍 QUESTION-BY-QUESTION ANALYSIS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {report.questionFeedback.map((item, i) => (
                  <div key={i} style={{ padding: "16px", borderRadius: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                      <p style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.9)", lineHeight: 1.4, flex: 1 }}>Q{i + 1}. {item.question}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                        <div style={{ width: "40px", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${item.score}%`, background: scoreColor(item.score), borderRadius: "3px", transition: "width 1s ease" }} />
                        </div>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: scoreColor(item.score), fontFamily: "'JetBrains Mono', monospace" }}>{item.score}</span>
                      </div>
                    </div>
                    <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace", marginBottom: "8px", lineHeight: 1.5 }}>
                      Your answer: {item.answer}
                    </p>
                    <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", lineHeight: 1.6, borderLeft: "2px solid rgba(168,85,247,0.4)", paddingLeft: "10px" }}>
                      {item.feedback}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="card" style={{ marginTop: "24px", display: "flex", gap: "12px", justifyContent: "center", animationDelay: "0.4s" }}>
              <button
                onClick={() => {
                  localStorage.removeItem("interviewReport");
                  localStorage.removeItem("interviewRawData");
                  router.push("/interview-prep/room");
                }}
                style={{ padding: "12px 28px", borderRadius: "12px", fontSize: "14px", fontWeight: 600, background: "linear-gradient(135deg, #f43f5e 0%, #a855f7 100%)", border: "none", color: "#fff", cursor: "pointer", fontFamily: "'Syne', sans-serif" }}
              >
                🔄 Retry Interview
              </button>
              <button
                onClick={() => router.push("/job-analyse")}
                style={{ padding: "12px 28px", borderRadius: "12px", fontSize: "14px", fontWeight: 600, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontFamily: "'Syne', sans-serif" }}
              >
                📊 Analyse Job Fit
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

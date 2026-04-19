"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getApiKey, generateWithRetry } from "@/lib/ai/gemini";
import {
  extractTextFromSupportedResumeFile,
  getSupportedResumeFileType,
  MAX_RESUME_FILE_SIZE_BYTES,
} from "@/lib/resume/textExtraction";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
interface AnalysisResult {
  compatibilityScore: number;
  salaryMin: number;
  salaryMax: number;
  userSalaryEstimate: number;
  missingSkills: { skill: string; urgency: "critical" | "important" | "nice" }[];
  matchedSkills: string[];
  cheatSheet: { question: string; hint: string }[];
  roleTitle: string;
  city: string;
  totalJobs: number;
  summary: string;
}

const INDIAN_CITIES = [
  "Bangalore", "Mumbai", "Delhi", "Hyderabad", "Chennai",
  "Pune", "Kolkata", "Ahmedabad", "Noida", "Gurgaon",
];

const POPULAR_ROLES = [
  "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "Data Scientist", "Machine Learning Engineer", "DevOps Engineer",
  "Product Manager", "UI/UX Designer", "Android Developer", "iOS Developer",
  "Cloud Architect", "Cybersecurity Analyst",
];

// ─────────────────────────────────────────────────────
// Circular gauge
// ─────────────────────────────────────────────────────
function CircularGauge({ score, animating }: { score: number; animating: boolean }) {
  const r = 72;
  const circ = 2 * Math.PI * r;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (!animating) { setDisplayed(0); return; }
    let frame = 0;
    const total = 80;
    const tick = () => {
      frame++;
      setDisplayed(Math.round((frame / total) * score));
      if (frame < total) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [score, animating]);

  const color = displayed >= 80 ? "#22d3a0" : displayed >= 60 ? "#f59e0b" : "#f43f5e";
  const offset = circ - (displayed / 100) * circ;

  return (
    <div style={{ position: "relative", width: "180px", height: "180px" }}>
      <svg width="180" height="180" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle cx="90" cy="90" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.02s linear, stroke 0.5s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "36px", fontWeight: 700, color, fontFamily: "'Syne', sans-serif", lineHeight: 1 }}>{displayed}</span>
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>MATCH</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Salary slider
// ─────────────────────────────────────────────────────
function SalarySlider({ min, max, userVal, animating }: { min: number; max: number; userVal: number; animating: boolean }) {
  const [pos, setPos] = useState(0);
  const pct = Math.max(0, Math.min(100, ((userVal - min) / (max - min)) * 100));

  useEffect(() => {
    if (!animating) { setPos(0); return; }
    let frame = 0;
    const total = 60;
    const tick = () => {
      frame++;
      setPos(Math.round((frame / total) * pct));
      if (frame < total) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [pct, animating]);

  const color = pos > 66 ? "#22d3a0" : pos > 33 ? "#f59e0b" : "#f43f5e";

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace" }}>₹{min}L</span>
        <span style={{ fontSize: "13px", fontWeight: 700, color, fontFamily: "'Syne', sans-serif" }}>₹{userVal}L estimated</span>
        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace" }}>₹{max}L</span>
      </div>
      <div style={{ position: "relative", height: "8px", borderRadius: "4px", background: "rgba(255,255,255,0.07)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pos}%`, borderRadius: "4px", background: `linear-gradient(90deg, #3b82f6 0%, ${color} 100%)`, transition: "width 0.02s linear" }} />
        <div style={{ position: "absolute", top: "50%", left: `${pos}%`, transform: "translate(-50%, -50%)", width: "18px", height: "18px", borderRadius: "50%", background: color, border: "3px solid #0a0f1a", boxShadow: `0 0 12px ${color}`, transition: "left 0.02s linear, background 0.5s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace" }}>Entry</span>
        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace" }}>Senior</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────
export default function JobAnalyserPage() {
  const router = useRouter();
  const [step, setStep] = useState<"input" | "loading" | "result">("input");
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState("");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("Bangalore");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [animated, setAnimated] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
      setError(`File too large. Max ${Math.round(MAX_RESUME_FILE_SIZE_BYTES / (1024 * 1024))}MB.`);
      return;
    }
    const supportedType = getSupportedResumeFileType(file);
    if (!supportedType) {
      setError("Unsupported file type. Please upload PDF, DOCX, or TXT.");
      return;
    }
    setExtracting(true);
    try {
      const extracted = await extractTextFromSupportedResumeFile(file);
      if (!extracted.text.trim()) { setError("Could not extract text. Try pasting manually."); return; }
      setResume(extracted.text);
      setResumeFileName(file.name);
    } catch {
      setError("Failed to read file. Try another file or paste manually.");
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const runAnalysis = async () => {
    const LOADING_MSGS = [
      "Fetching live market data from Adzuna India...",
      "Scanning active job listings...",
      "Running Gemini AI analysis...",
      "Mapping your skills to market demand...",
      "Calculating salary positioning...",
      "Generating your report...",
    ];
    // ── 1. Check user's Gemini API key ──
    const apiKey = getApiKey();
    if (!apiKey) {
      setError("Please configure your Gemini API key in Settings first.");
      return;
    }
    if (!resume.trim()) { setError("Please paste your resume."); return; }
    if (!jd.trim() && !role.trim()) { setError("Please paste a JD or select a role."); return; }

    setError(null);
    setStep("loading");
    setAnimated(false);

    let msgIdx = 0;
    setLoadingMsg(LOADING_MSGS[0]);
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MSGS.length;
      setLoadingMsg(LOADING_MSGS[msgIdx]);
    }, 1800);

    try {
      const targetRole = role.trim() || "Software Engineer";
      const targetCity = city.trim() || "Bangalore";

      // ── 2. Fetch Adzuna data from server route (needs secret keys) ──
      let salaryMin = 6, salaryMax = 24, totalJobs = 0, trendingSkills: string[] = [];

      try {
        const adzunaRes = await fetch("/api/job-analyse/adzuna", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: targetRole, city: targetCity }),
        });
        if (adzunaRes.ok) {
          const adzunaData = await adzunaRes.json();
          salaryMin = adzunaData.salaryMin ?? 6;
          salaryMax = adzunaData.salaryMax ?? 24;
          totalJobs = adzunaData.totalJobs ?? 0;
          trendingSkills = adzunaData.trendingSkills ?? [];
        }
      } catch {
        // Graceful degradation — Gemini still runs with fallback salary data
      }

      // ── 3. Run Gemini analysis client-side using user's API key ──
      const prompt = `
You are a career analyst specialising in the Indian tech job market.

ROLE: ${targetRole}
CITY: ${targetCity}
LIVE MARKET DATA:
- ${totalJobs} active listings found on Adzuna India
- Salary range: ₹${salaryMin}L – ₹${salaryMax}L per annum
- Top trending skills in market: ${trendingSkills.length > 0 ? trendingSkills.join(", ") : "React, Node.js, Python, AWS, Docker, TypeScript, Kubernetes, System Design"}

CANDIDATE RESUME:
${resume.slice(0, 3000)}

JOB DESCRIPTION (if provided):
${jd ? jd.slice(0, 2000) : "Not provided — analyse against role generally"}

TASK: Analyse the candidate's fit and return ONLY valid JSON (no markdown, no backticks, no code fences):
{
  "compatibilityScore": <0-100 integer>,
  "userSalaryEstimate": <integer in LPA within the ${salaryMin}–${salaryMax} range>,
  "matchedSkills": [<up to 8 skills from their resume that match market demand>],
  "missingSkills": [
    { "skill": "<skill name>", "urgency": "critical" | "important" | "nice" }
  ],
  "cheatSheet": [
    { "question": "<likely interview question for this role>", "hint": "<2 sentence answer hint>" },
    { "question": "...", "hint": "..." },
    { "question": "...", "hint": "..." }
  ],
  "summary": "<2 sentence honest assessment of candidate fit>"
}

Rules:
- compatibilityScore must reflect resume vs JD/role match HONESTLY
- missingSkills must only list skills genuinely absent from the resume
- userSalaryEstimate must be between ${salaryMin} and ${salaryMax}
- cheatSheet questions must be specific to ${targetRole} in ${targetCity}
- Return ONLY the JSON object, nothing else, no markdown
`;

      let raw = await generateWithRetry(prompt);
      // Strip any markdown fences Gemini might add
      raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      const geminiResult = JSON.parse(raw);

      clearInterval(msgInterval);

      setResult({
        compatibilityScore: geminiResult.compatibilityScore,
        salaryMin,
        salaryMax,
        userSalaryEstimate: geminiResult.userSalaryEstimate,
        matchedSkills: geminiResult.matchedSkills || [],
        missingSkills: geminiResult.missingSkills || [],
        cheatSheet: geminiResult.cheatSheet || [],
        summary: geminiResult.summary || "",
        roleTitle: targetRole,
        city: targetCity,
        totalJobs,
      });

      setStep("result");
      setTimeout(() => setAnimated(true), 200);

    } catch (e: any) {
      clearInterval(msgInterval);
      setError(e.message || "Analysis failed. Please try again.");
      setStep("input");
    }
  };

  const launchInterview = () => {
    if (!result) return;
    localStorage.setItem("interviewConfig", JSON.stringify({
      role: result.roleTitle,
      type: "technical",
      interviewerCount: 2,
      duration: 20,
    }));
    router.push("/interview-prep/room");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Syne', sans-serif; background: #060a10; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        textarea { resize: none; }
        textarea::placeholder, input::placeholder { color: rgba(255,255,255,0.2); }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .card-in { animation: fadeUp 0.5s ease forwards; }
        .hover-chip:hover { background: rgba(99,210,255,0.15) !important; border-color: rgba(99,210,255,0.4) !important; color: #63d2ff !important; cursor: pointer; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(99,210,255,0.3); }
        .btn-primary:active { transform: translateY(0); }
      `}</style>

      <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at 10% 0%, #0d1f35 0%, #060a10 50%, #04060c 100%)", color: "#fff", fontFamily: "'Syne', sans-serif" }}>

        {/* ── NAV ── */}
        <nav style={{ padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(4,6,12,0.6)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 50 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, #63d2ff 0%, #3b82f6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>⚡</div>
            <span style={{ fontWeight: 700, fontSize: "16px" }}>CareerForge</span>
            <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "20px", background: "rgba(99,210,255,0.1)", color: "#63d2ff", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>JOB ANALYSER</span>
          </div>
          <button onClick={() => router.push("/")} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", padding: "6px 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontFamily: "'Syne', sans-serif" }}>← Back</button>
        </nav>

        {/* ── INPUT STEP ── */}
        {step === "input" && (
          <div style={{ maxWidth: "900px", margin: "0 auto", padding: "48px 24px" }}>

            {/* Hero */}
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <div style={{ display: "inline-block", fontSize: "11px", padding: "4px 14px", borderRadius: "20px", background: "rgba(99,210,255,0.08)", color: "#63d2ff", marginBottom: "16px", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", border: "1px solid rgba(99,210,255,0.2)" }}>POWERED BY ADZUNA + GEMINI</div>
              <h1 style={{ fontSize: "36px", fontWeight: 800, lineHeight: 1.15, marginBottom: "16px" }}>
                Know Exactly Where<br />You Stand in the Market
              </h1>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "16px", maxWidth: "480px", margin: "0 auto" }}>
                Real-time salary data · AI gap analysis · Interview prep — in 30 seconds.
              </p>
            </div>

            {error && (
              <div style={{ padding: "12px 16px", borderRadius: "10px", marginBottom: "24px", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", color: "#fda4af", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace" }}>{error}</div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

              {/* Role + City */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "24px" }}>
                <div style={{ fontSize: "11px", color: "#63d2ff", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: "16px" }}>TARGET ROLE</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
                  {POPULAR_ROLES.map((r) => (
                    <button key={r} className="hover-chip" onClick={() => setRole(r)} style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", cursor: "pointer", background: role === r ? "rgba(99,210,255,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${role === r ? "rgba(99,210,255,0.4)" : "rgba(255,255,255,0.08)"}`, color: role === r ? "#63d2ff" : "rgba(255,255,255,0.5)", fontFamily: "'Syne', sans-serif", transition: "all 0.15s" }}>{r}</button>
                  ))}
                </div>
                <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Or type a custom role..." style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", outline: "none", fontFamily: "'Syne', sans-serif", marginBottom: "16px" }} />
                <div style={{ fontSize: "11px", color: "#63d2ff", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: "10px" }}>CITY</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {INDIAN_CITIES.map((c) => (
                    <button key={c} className="hover-chip" onClick={() => setCity(c)} style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", cursor: "pointer", background: city === c ? "rgba(99,210,255,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${city === c ? "rgba(99,210,255,0.4)" : "rgba(255,255,255,0.08)"}`, color: city === c ? "#63d2ff" : "rgba(255,255,255,0.5)", fontFamily: "'Syne', sans-serif", transition: "all 0.15s" }}>{c}</button>
                  ))}
                </div>
              </div>

              {/* Resume + JD */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "20px", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ fontSize: "11px", color: "#63d2ff", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em" }}>YOUR RESUME *</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {resumeFileName && (
                        <span style={{ fontSize: "10px", color: "#22d3a0", fontFamily: "'JetBrains Mono', monospace", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✓ {resumeFileName}</span>
                      )}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={extracting}
                        style={{ padding: "4px 10px", borderRadius: "8px", fontSize: "11px", cursor: extracting ? "not-allowed" : "pointer", background: "rgba(99,210,255,0.1)", border: "1px solid rgba(99,210,255,0.25)", color: "#63d2ff", fontFamily: "'Syne', sans-serif", opacity: extracting ? 0.6 : 1 }}
                      >
                        {extracting ? "Reading..." : "📎 Upload PDF/DOCX"}
                      </button>
                      <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={handleFileUpload} style={{ display: "none" }} />
                    </div>
                  </div>
                  <textarea value={resume} onChange={(e) => { setResume(e.target.value); setResumeFileName(null); }} placeholder="Paste your resume text here — or upload a PDF/DOCX above..." rows={7} style={{ width: "100%", padding: "12px", borderRadius: "10px", fontSize: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", outline: "none", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6 }} />
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "20px" }}>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: "10px" }}>JOB DESCRIPTION (optional)</div>
                  <textarea value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste a specific job description for targeted analysis..." rows={4} style={{ width: "100%", padding: "12px", borderRadius: "10px", fontSize: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", outline: "none", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6 }} />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center", marginTop: "32px" }}>
              <button className="btn-primary" onClick={runAnalysis} style={{ padding: "16px 48px", borderRadius: "14px", fontSize: "16px", fontWeight: 700, background: "linear-gradient(135deg, #63d2ff 0%, #3b82f6 100%)", border: "none", color: "#060a10", cursor: "pointer", fontFamily: "'Syne', sans-serif", transition: "all 0.2s ease", boxShadow: "0 4px 24px rgba(99,210,255,0.25)" }}>
                ⚡ Analyse My Market Position
              </button>
            </div>
          </div>
        )}

        {/* ── LOADING STEP ── */}
        {step === "loading" && (
          <div style={{ minHeight: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "32px" }}>
            <div style={{ position: "relative", width: "120px", height: "120px" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(99,210,255,0.15)" }} />
              <div style={{ position: "absolute", inset: "15px", borderRadius: "50%", border: "2px solid rgba(99,210,255,0.1)" }} />
              <div style={{ position: "absolute", inset: "30px", borderRadius: "50%", border: "2px solid rgba(99,210,255,0.08)" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid transparent", borderTopColor: "#63d2ff", animation: "spin 1s linear infinite" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px" }}>📡</div>
            </div>
            <p style={{ fontSize: "14px", color: "#63d2ff", fontFamily: "'JetBrains Mono', monospace", animation: "pulse 1.5s ease-in-out infinite", letterSpacing: "0.05em" }}>{loadingMsg}</p>
          </div>
        )}

        {/* ── RESULT STEP ── */}
        {step === "result" && result && (
          <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 24px 80px" }}>

            {/* Header */}
            <div style={{ marginBottom: "32px", animation: "fadeUp 0.4s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h2 style={{ fontSize: "24px", fontWeight: 800 }}>{result.roleTitle}</h2>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace", marginTop: "4px" }}>
                    {result.city} · {result.totalJobs > 0 ? `${result.totalJobs.toLocaleString()} active listings analysed` : "Market analysis complete"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={() => setStep("input")} style={{ padding: "10px 18px", borderRadius: "10px", fontSize: "13px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontFamily: "'Syne', sans-serif" }}>← Re-analyse</button>
                  <button onClick={launchInterview} style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "linear-gradient(135deg, #63d2ff 0%, #3b82f6 100%)", border: "none", color: "#060a10", cursor: "pointer", fontFamily: "'Syne', sans-serif" }}>🎯 Practice Interview</button>
                </div>
              </div>
            </div>

            {/* Top row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>

              {/* Compatibility Score */}
              <div className="card-in" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "28px", animationDelay: "0s" }}>
                <div style={{ fontSize: "11px", color: "#63d2ff", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: "20px" }}>COMPATIBILITY SCORE</div>
                <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                  <CircularGauge score={result.compatibilityScore} animating={animated} />
                  <div>
                    <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: "12px" }}>{result.summary}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {result.matchedSkills.slice(0, 5).map((s) => (
                        <span key={s} style={{ padding: "3px 9px", borderRadius: "20px", fontSize: "11px", background: "rgba(34,211,160,0.1)", color: "#22d3a0", border: "1px solid rgba(34,211,160,0.25)", fontFamily: "'JetBrains Mono', monospace" }}>✓ {s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Salary Benchmark */}
              <div className="card-in" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "28px", animationDelay: "0.1s" }}>
                <div style={{ fontSize: "11px", color: "#63d2ff", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: "20px" }}>SALARY BENCHMARK · {result.city.toUpperCase()}</div>
                <SalarySlider min={result.salaryMin} max={result.salaryMax} userVal={result.userSalaryEstimate} animating={animated} />
                <div style={{ marginTop: "20px", padding: "12px 14px", borderRadius: "10px", background: "rgba(99,210,255,0.06)", border: "1px solid rgba(99,210,255,0.15)" }}>
                  <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {result.totalJobs > 0 ? `Based on ${result.totalJobs.toLocaleString()} live listings on Adzuna India` : "Based on market benchmarks for this role"}
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

              {/* Gap Alerts */}
              <div className="card-in" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "28px", animationDelay: "0.2s" }}>
                <div style={{ fontSize: "11px", color: "#f43f5e", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: "20px" }}>⚠ CRITICAL GAP ALERTS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {result.missingSkills.map(({ skill, urgency }) => {
                    const colors = {
                      critical: { bg: "rgba(244,63,94,0.1)", border: "rgba(244,63,94,0.3)", text: "#f43f5e", label: "MUST HAVE" },
                      important: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", text: "#f59e0b", label: "IMPORTANT" },
                      nice: { bg: "rgba(99,210,255,0.08)", border: "rgba(99,210,255,0.2)", text: "#63d2ff", label: "NICE TO HAVE" },
                    }[urgency];
                    return (
                      <div key={skill} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "10px", background: colors.bg, border: `1px solid ${colors.border}` }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>{skill}</span>
                        <span style={{ fontSize: "9px", padding: "2px 7px", borderRadius: "20px", background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em" }}>{colors.label}</span>
                      </div>
                    );
                  })}
                  {result.missingSkills.length === 0 && <p style={{ color: "#22d3a0", fontSize: "14px" }}>🎉 No critical gaps found!</p>}
                </div>
              </div>

              {/* Cheat Sheet */}
              <div className="card-in" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "28px", animationDelay: "0.3s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                  <div style={{ fontSize: "11px", color: "#a78bfa", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em" }}>🎯 INTERVIEW CHEAT SHEET</div>
                  <button onClick={launchInterview} style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "11px", background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)", cursor: "pointer", fontFamily: "'Syne', sans-serif" }}>Practice →</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {result.cheatSheet.map((item, i) => (
                    <div key={i} style={{ padding: "14px", borderRadius: "12px", background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)" }}>
                      <p style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: "6px", lineHeight: 1.4 }}>Q{i + 1}. {item.question}</p>
                      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>💡 {item.hint}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

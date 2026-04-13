"use client";

import { useEffect, useRef, useState } from "react";
import {
  ScanSearch,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BarChart3,
  FileText,
  Target,
  Upload,
  Save,
  X,
} from "lucide-react";
import { getApiKey, generateWithRetry } from "@/lib/ai/gemini";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  extractTextFromSupportedResumeFile,
  getSupportedResumeFileType,
  MAX_RESUME_FILE_SIZE_BYTES,
  type SupportedResumeFileType,
} from "@/lib/resume/textExtraction";

interface ATSResult {
  overallScore: number;
  sections: {
    name: string;
    score: number;
    status: "good" | "warning" | "critical";
    feedback: string;
  }[];
  keywordAnalysis: {
    found: string[];
    missing: string[];
  };
  detailedFeedback: string;
  aiSummary: string;
  topStrengths: string[];
  criticalRisks: string[];
  priorityFixes: string[];
}

type AnalysisDepth = "standard" | "advanced";

interface ATSCheckerDraft {
  resumeText: string;
  jobDescription: string;
  resumeSourceType: SupportedResumeFileType | "paste";
  jdSourceType: SupportedResumeFileType | "paste";
  resumeFileName: string | null;
  jdFileName: string | null;
  targetRole: string;
  analysisDepth: AnalysisDepth;
  savedAt: number;
}

const FILE_SIZE_LIMIT_MB = Math.round(MAX_RESUME_FILE_SIZE_BYTES / (1024 * 1024));
const ATS_CHECKER_DRAFT_STORAGE_KEY = "ats_checker_draft_v1";
const DEFAULT_ATS_SECTION_NAMES = [
  "Formatting & Structure",
  "Keyword Optimization",
  "Content Quality",
  "Action Verbs & Impact",
  "Section Completeness",
  "ATS Parseability",
];
const ATS_HEADING_TOKENS = [
  "professional summary",
  "summary",
  "profile",
  "objective",
  "work experience",
  "experience",
  "education",
  "technical skills",
  "skills",
  "projects",
  "certifications",
  "achievements",
  "internship",
  "publications",
  "contact",
];

function sourceLabel(type: SupportedResumeFileType | "paste"): string {
  if (type === "pdf") return "PDF";
  if (type === "docx") return "DOCX";
  if (type === "text") return "Text File";
  return "Pasted Text";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function insertSectionBreaks(text: string): string {
  let result = text;

  for (const token of ATS_HEADING_TOKENS) {
    const pattern = new RegExp(`\\s+(${escapeRegExp(token)})(?=\\s|:)`, "gi");
    result = result.replace(pattern, "\n\n$1");
  }

  return result;
}

function isLikelyFlattenedText(text: string): boolean {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return false;

  const longLines = lines.filter((line) => line.length > 180).length;
  return (lines.length <= 3 && text.length > 350) || longLines / lines.length > 0.65;
}

function normalizeAtsInputText(input: string): string {
  let text = input
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00A0]/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();

  if (!text) return "";

  if (isLikelyFlattenedText(text)) {
    text = insertSectionBreaks(text);
    text = text.replace(/\s+[•*]\s+/g, "\n- ");
    text = text.replace(/[ ]{2,}/g, " ");
  }

  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function clampScore(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return Math.round(numeric);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function normalizeSectionStatus(value: unknown, score: number): "good" | "warning" | "critical" {
  if (value === "good" || value === "warning" || value === "critical") {
    return value;
  }

  if (score >= 80) return "good";
  if (score >= 60) return "warning";
  return "critical";
}

function normalizeAtsResult(raw: unknown): ATSResult | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;

  const parsedSections = Array.isArray(payload.sections)
    ? payload.sections
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;

          const typed = entry as Record<string, unknown>;
          const name = String(typed.name || "").trim();
          if (!name) return null;

          const score = clampScore(typed.score);
          return {
            name,
            score,
            status: normalizeSectionStatus(typed.status, score),
            feedback: String(typed.feedback || "No specific feedback provided.").trim(),
          };
        })
        .filter((section): section is ATSResult["sections"][number] => section !== null)
    : [];

  const sections = parsedSections.length > 0
    ? parsedSections
    : DEFAULT_ATS_SECTION_NAMES.map((name) => ({
        name,
        score: 0,
        status: "critical" as const,
        feedback: "Section analysis unavailable from AI response.",
      }));

  const keywordRaw = payload.keywordAnalysis && typeof payload.keywordAnalysis === "object"
    ? (payload.keywordAnalysis as Record<string, unknown>)
    : {};

  return {
    overallScore: clampScore(payload.overallScore),
    sections,
    keywordAnalysis: {
      found: toStringArray(keywordRaw.found),
      missing: toStringArray(keywordRaw.missing),
    },
    detailedFeedback: String(payload.detailedFeedback || "").trim(),
    aiSummary: String(payload.aiSummary || "").trim(),
    topStrengths: toStringArray(payload.topStrengths),
    criticalRisks: toStringArray(payload.criticalRisks),
    priorityFixes: toStringArray(payload.priorityFixes),
  };
}

export default function ATSCheckerPage() {
  const resumeFileInputRef = useRef<HTMLInputElement>(null);
  const jdFileInputRef = useRef<HTMLInputElement>(null);

  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeSourceType, setResumeSourceType] = useState<SupportedResumeFileType | "paste">("paste");
  const [jdSourceType, setJdSourceType] = useState<SupportedResumeFileType | "paste">("paste");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [jdFileName, setJdFileName] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [analysisDepth, setAnalysisDepth] = useState<AnalysisDepth>("advanced");
  const [extractingResume, setExtractingResume] = useState(false);
  const [extractingJD, setExtractingJD] = useState(false);
  const [result, setResult] = useState<ATSResult | null>(null);
  const [rawFeedback, setRawFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ATS_CHECKER_DRAFT_STORAGE_KEY);
      if (!raw) return;

      const draft = JSON.parse(raw) as Partial<ATSCheckerDraft>;

      if (typeof draft.resumeText === "string") {
        setResumeText(draft.resumeText);
      }

      if (typeof draft.jobDescription === "string") {
        setJobDescription(draft.jobDescription);
      }

      if (
        draft.resumeSourceType === "paste"
        || draft.resumeSourceType === "pdf"
        || draft.resumeSourceType === "docx"
        || draft.resumeSourceType === "text"
      ) {
        setResumeSourceType(draft.resumeSourceType);
      }

      if (
        draft.jdSourceType === "paste"
        || draft.jdSourceType === "pdf"
        || draft.jdSourceType === "docx"
        || draft.jdSourceType === "text"
      ) {
        setJdSourceType(draft.jdSourceType);
      }

      if (typeof draft.resumeFileName === "string") {
        setResumeFileName(draft.resumeFileName);
      } else if (draft.resumeFileName === null) {
        setResumeFileName(null);
      }

      if (typeof draft.jdFileName === "string") {
        setJdFileName(draft.jdFileName);
      } else if (draft.jdFileName === null) {
        setJdFileName(null);
      }

      if (typeof draft.targetRole === "string") {
        setTargetRole(draft.targetRole);
      }

      if (draft.analysisDepth === "advanced" || draft.analysisDepth === "standard") {
        setAnalysisDepth(draft.analysisDepth);
      }

      setSaveNotice("Progress restored from saved draft.");
      const timer = setTimeout(() => setSaveNotice(""), 2500);
      return () => clearTimeout(timer);
    } catch {
      // Ignore malformed local draft.
    }
  }, []);

  const clearResumeUpload = () => {
    setResumeFileName(null);
    setResumeSourceType("paste");
    if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
  };

  const clearJDUpload = () => {
    setJdFileName(null);
    setJdSourceType("paste");
    if (jdFileInputRef.current) jdFileInputRef.current.value = "";
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setExtractingResume(true);

    if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
      setError(`Resume file is too large. Please upload files up to ${FILE_SIZE_LIMIT_MB}MB.`);
      setExtractingResume(false);
      if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
      return;
    }

    const supportedType = getSupportedResumeFileType(file);
    if (!supportedType) {
      if (file.name.toLowerCase().endsWith(".doc")) {
        setError("Legacy .doc files are not supported. Please save the resume as .docx and upload again.");
      } else {
        setError("Unsupported resume file type. Please upload PDF, DOCX, or text files.");
      }
      setExtractingResume(false);
      if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
      return;
    }

    try {
      const extracted = await extractTextFromSupportedResumeFile(file);
      if (!extracted.text.trim()) {
        setError("Could not extract readable text from the resume file. If this is a scanned PDF, paste text manually.");
        setResumeFileName(null);
        if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
        return;
      }

      setResumeFileName(file.name);
      setResumeSourceType(extracted.type);
      setResumeText(normalizeAtsInputText(extracted.text));
    } catch {
      setError("Failed to read resume file. Please try another file or paste text manually.");
      setResumeFileName(null);
      if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
    } finally {
      setExtractingResume(false);
    }
  };

  const handleJDUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setExtractingJD(true);

    if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
      setError(`Job description file is too large. Please upload files up to ${FILE_SIZE_LIMIT_MB}MB.`);
      setExtractingJD(false);
      if (jdFileInputRef.current) jdFileInputRef.current.value = "";
      return;
    }

    const supportedType = getSupportedResumeFileType(file);
    if (!supportedType) {
      if (file.name.toLowerCase().endsWith(".doc")) {
        setError("Legacy .doc files are not supported. Please save the job description as .docx and upload again.");
      } else {
        setError("Unsupported job description file type. Please upload PDF, DOCX, or text files.");
      }
      setExtractingJD(false);
      if (jdFileInputRef.current) jdFileInputRef.current.value = "";
      return;
    }

    try {
      const extracted = await extractTextFromSupportedResumeFile(file);
      if (!extracted.text.trim()) {
        setError("Could not extract readable text from the job description file. If this is a scanned PDF, paste text manually.");
        setJdFileName(null);
        if (jdFileInputRef.current) jdFileInputRef.current.value = "";
        return;
      }

      setJdFileName(file.name);
      setJdSourceType(extracted.type);
      setJobDescription(normalizeAtsInputText(extracted.text));
    } catch {
      setError("Failed to read job description file. Please try another file or paste text manually.");
      setJdFileName(null);
      if (jdFileInputRef.current) jdFileInputRef.current.value = "";
    } finally {
      setExtractingJD(false);
    }
  };

  const checkATS = async () => {
    const finalResumeText = normalizeAtsInputText(resumeText);
    const finalJobDescription = normalizeAtsInputText(jobDescription);
    const finalTargetRole = targetRole.trim();

    const key = getApiKey();
    if (!key) {
      setError("Please configure your Gemini API key in Settings first.");
      return;
    }
    if (extractingResume || extractingJD) {
      setError("Please wait for file extraction to finish before analyzing.");
      return;
    }
    if (!finalResumeText) {
      setError("Please upload your resume file (PDF/DOCX) or paste resume text.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setRawFeedback("");

    try {

      const prompt = `You are an expert ATS (Applicant Tracking System) analyzer. Analyze this resume for ATS compatibility and provide a detailed assessment.

    INPUT CONTEXT:
    - Resume source: ${sourceLabel(resumeSourceType)}
    - Job description source: ${finalJobDescription ? sourceLabel(jdSourceType) : "Not provided"}
    - Analysis depth: ${analysisDepth}
    - Target role: ${finalTargetRole || "Not explicitly provided"}

    ANALYSIS RULES:
    - Prioritize content quality, impact, clarity, keywords, and ATS readability.
    - Do NOT penalize section ordering by itself if key content is present and understandable.
    - Text may come from PDF/DOCX extraction and lose some visual layout; do NOT assign severe formatting penalties solely due to line wrapping/spacing artifacts.
    - Score formatting based on parseability cues (headings, role/company/date clarity, bullet structure, chronology cues), not visual design cosmetics.
    - Give advanced, actionable, and specific improvement suggestions.
    - Focus recommendations for ${finalTargetRole || "the apparent target role inferred from the resume and JD"}.
    - If analysis depth is "advanced", provide deeper tactical guidance and role-fit insights.

RESUME:
${finalResumeText}

${finalJobDescription ? `JOB DESCRIPTION:\n${finalJobDescription}` : "No specific job description provided - do a general ATS assessment."}

Respond in EXACTLY this JSON format (no markdown, no code blocks, just pure JSON):
{
  "overallScore": <number 0-100>,
  "sections": [
    {
      "name": "Formatting & Structure",
      "score": <number 0-100>,
      "status": "<good|warning|critical>",
      "feedback": "<specific feedback>"
    },
    {
      "name": "Keyword Optimization",
      "score": <number 0-100>,
      "status": "<good|warning|critical>",
      "feedback": "<specific feedback>"
    },
    {
      "name": "Content Quality",
      "score": <number 0-100>,
      "status": "<good|warning|critical>",
      "feedback": "<specific feedback>"
    },
    {
      "name": "Action Verbs & Impact",
      "score": <number 0-100>,
      "status": "<good|warning|critical>",
      "feedback": "<specific feedback>"
    },
    {
      "name": "Section Completeness",
      "score": <number 0-100>,
      "status": "<good|warning|critical>",
      "feedback": "<specific feedback>"
    },
    {
      "name": "ATS Parseability",
      "score": <number 0-100>,
      "status": "<good|warning|critical>",
      "feedback": "<specific feedback>"
    }
  ],
  "keywordAnalysis": {
    "found": ["keyword1", "keyword2"],
    "missing": ["keyword3", "keyword4"]
  },
  "detailedFeedback": "<comprehensive markdown feedback with specific suggestions for improvement, at least 200 words>",
  "aiSummary": "<2-4 sentence strategic summary of current ATS readiness>",
  "topStrengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "criticalRisks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "priorityFixes": ["<priority fix 1>", "<priority fix 2>", "<priority fix 3>"]
}

Score guidelines:
- 90-100: Excellent ATS compatibility
- 70-89: Good, minor improvements needed
- 50-69: Fair, significant improvements recommended
- Below 50: Needs major overhaul

Be thorough and specific in your analysis.`;

      let text = (await generateWithRetry(prompt)).trim();

      // Clean up response
      text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

      try {
        const parsed = normalizeAtsResult(JSON.parse(text));
        if (!parsed) {
          setRawFeedback(text);
          return;
        }

        setResult(parsed);
        setRawFeedback(parsed.detailedFeedback || text);
      } catch {
        // If JSON parsing fails, show raw text
        setRawFeedback(text);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "ATS check failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProgress = () => {
    try {
      const draft: ATSCheckerDraft = {
        resumeText,
        jobDescription,
        resumeSourceType,
        jdSourceType,
        resumeFileName,
        jdFileName,
        targetRole,
        analysisDepth,
        savedAt: Date.now(),
      };

      localStorage.setItem(ATS_CHECKER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setSaveNotice("Progress saved locally. It will remain after refresh.");
    } catch {
      setSaveNotice("Could not save progress. Please try again.");
    } finally {
      setTimeout(() => setSaveNotice(""), 2500);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-danger";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-success";
    if (score >= 60) return "bg-warning";
    return "bg-danger";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "good": return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-warning" />;
      case "critical": return <XCircle className="w-4 h-4 text-danger" />;
      default: return null;
    }
  };

  const resumeWordCount = resumeText.split(/\s+/).filter(Boolean).length;
  const resumeReady = resumeText.trim().length > 0;
  const hasJD = jobDescription.trim().length > 0;
  const jdReady = hasJD;
  const hasTargetRole = targetRole.trim().length > 0;
  const strategyReady = hasTargetRole || hasJD;
  const workflowProgress = Math.round((((resumeReady ? 1 : 0) + (jdReady ? 1 : 0) + (strategyReady ? 1 : 0)) / 3) * 100);
  const analysisLabel = analysisDepth === "advanced" ? "Deep AI" : "Standard AI";
  const extractionStatus = extractingResume
    ? "Extracting resume file..."
    : extractingJD
      ? "Extracting job description file..."
      : null;

  const scoreLabel = result
    ? result.overallScore >= 80
      ? "Strong ATS readiness"
      : result.overallScore >= 60
        ? "Good base, needs optimization"
        : "Major rewrites recommended"
    : "";

  const workflowSummary = extractionStatus
    ? extractionStatus
    : resumeText
      ? `${resumeWordCount} words from ${sourceLabel(resumeSourceType)}${hasJD ? ` + JD (${sourceLabel(jdSourceType)})` : ""}${hasTargetRole ? ` • ${targetRole.trim()}` : ""}`
      : "Add resume text or upload a file to start";

  const resultsPanel = result ? (
    <div className="space-y-4">
      <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_20px_45px_var(--shadow-heavy)] overflow-hidden">
        <CardContent className="p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">ATS Decision Command</p>
              <h3 className="text-xl font-semibold mt-1">{scoreLabel}</h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                {result.aiSummary || "AI summary is unavailable for this run. Re-run analysis for refreshed insights."}
              </p>
            </div>
            <Badge variant={analysisDepth === "advanced" ? "success" : "warning"} className="text-[10px] uppercase tracking-[0.14em]">
              {analysisLabel}
            </Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px] md:items-end">
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <span className={`text-5xl font-bold leading-none ${getScoreColor(result.overallScore)}`}>{result.overallScore}</span>
                <span className="text-sm text-muted-foreground mb-1">/100</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-4 overflow-hidden">
                <div className={`h-full transition-all duration-500 ${getScoreBg(result.overallScore)}`} style={{ width: `${result.overallScore}%` }} />
              </div>
            </div>

            <div className="grid gap-2 text-[10px]">
              <Badge variant="outline" className="justify-center">Resume: {sourceLabel(resumeSourceType)}</Badge>
              <Badge variant="outline" className="justify-center">JD: {hasJD ? sourceLabel(jdSourceType) : "None"}</Badge>
              <Badge variant="outline" className="justify-center">Mode: {analysisLabel}</Badge>
              <Badge variant="outline" className="justify-center">Role: {hasTargetRole ? targetRole.trim() : "General"}</Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-glass-border bg-surface-2/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Top Strengths</p>
              <p className="text-lg font-semibold mt-1 text-success">{result.topStrengths.length}</p>
            </div>
            <div className="rounded-xl border border-glass-border bg-surface-2/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Critical Risks</p>
              <p className="text-lg font-semibold mt-1 text-danger">{result.criticalRisks.length}</p>
            </div>
            <div className="rounded-xl border border-glass-border bg-surface-2/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Missing Keywords</p>
              <p className="text-lg font-semibold mt-1 text-warning">{result.keywordAnalysis.missing.length}</p>
            </div>
            <div className="rounded-xl border border-glass-border bg-surface-2/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Priority Fixes</p>
              <p className="text-lg font-semibold mt-1 text-primary">{result.priorityFixes.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-glass-border/80 bg-surface-1/95">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ScanSearch className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Action Board</h3>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-success/25 bg-success/10 p-3">
              <div className="text-[11px] font-semibold text-success mb-2">Strength Stack</div>
              {result.topStrengths.length > 0 ? (
                <ul className="space-y-1">
                  {result.topStrengths.map((item, index) => (
                    <li key={`strength-${index}`} className="text-xs text-muted-foreground">- {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No strengths detected.</p>
              )}
            </div>

            <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3">
              <div className="text-[11px] font-semibold text-destructive mb-2">Risk Stack</div>
              {result.criticalRisks.length > 0 ? (
                <ul className="space-y-1">
                  {result.criticalRisks.map((item, index) => (
                    <li key={`risk-${index}`} className="text-xs text-muted-foreground">- {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No major risks identified.</p>
              )}
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
              <div className="text-[11px] font-semibold text-primary mb-2">Execution Queue</div>
              {result.priorityFixes.length > 0 ? (
                <ul className="space-y-1">
                  {result.priorityFixes.map((item, index) => (
                    <li key={`fix-${index}`} className="text-xs text-muted-foreground">{index + 1}. {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No action queue generated.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-glass-border/80 bg-surface-1/95">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Section Scoreboard</h3>
          </div>

          <div className="space-y-3">
            {result.sections
              .slice()
              .sort((left, right) => right.score - left.score)
              .map((section, index) => (
                <div key={section.name} className="rounded-xl border border-glass-border bg-surface-2/70 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[10px] px-1.5">#{index + 1}</Badge>
                      {getStatusIcon(section.status)}
                      <span className="text-xs font-medium truncate">{section.name}</span>
                    </div>
                    <span className={`text-xs font-bold ${getScoreColor(section.score)}`}>{section.score}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-4 overflow-hidden">
                    <div className={`h-full transition-all duration-500 ${getScoreBg(section.score)}`} style={{ width: `${section.score}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{section.feedback}</p>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-glass-border/80 bg-surface-1/95">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold">Keyword Intelligence</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-success/20 bg-success/10 p-3">
              <h4 className="text-xs font-semibold text-success mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3" /> Found Keywords
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {result.keywordAnalysis.found.length > 0 ? (
                  result.keywordAnalysis.found.map((kw) => (
                    <Badge key={kw} variant="success" className="text-xs">{kw}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No matched keywords found.</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3">
              <h4 className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1.5">
                <XCircle className="h-3 w-3" /> Missing Keywords
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {result.keywordAnalysis.missing.length > 0 ? (
                  result.keywordAnalysis.missing.map((kw) => (
                    <Badge key={kw} variant="destructive" className="text-xs">{kw}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No critical gaps found.</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {rawFeedback && (
        <Card className="border-glass-border/80 bg-surface-1/95">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold mb-3">Advisor Notes</h3>
            <div className="markdown-content text-sm max-h-80 overflow-y-auto pr-1">
              <ReactMarkdown>{rawFeedback}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  ) : rawFeedback ? (
    <Card className="border-glass-border/80 bg-surface-1/95">
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold mb-3">ATS Analysis</h3>
        <div className="markdown-content text-sm max-h-160 overflow-y-auto pr-1">
          <ReactMarkdown>{rawFeedback}</ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  ) : (
    <Card className="border-glass-border/80 bg-surface-1/95 min-h-90 flex items-center justify-center">
      <CardContent className="p-6 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl border border-glass-border bg-surface-2 flex items-center justify-center mb-4">
          <ScanSearch className="h-7 w-7 opacity-30" />
        </div>
        <h3 className="text-lg font-semibold">Analysis board is waiting</h3>
        <p className="text-xs text-muted-foreground mt-2 max-w-65 mx-auto leading-relaxed">
          Complete the left workflow steps, then run ATS simulation to populate this board with score, risks, and fixes.
        </p>
      </CardContent>
    </Card>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="relative max-w-380 mx-auto pb-3"
    >
      <PageHeader
        icon={ScanSearch}
        title="ATS Command Studio"
        subtitle="Completely remapped workflow: source ingest, role tuning, and decision-ready ATS diagnostics"
        gradient="from-emerald-500 to-cyan-500"
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <section className="space-y-5 min-w-0">
          <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
            <CardContent className="p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Input Workflow Matrix</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Build your ATS simulation in sequence: resume source, role lens, then strategy depth.
                  </p>
                </div>
                <Badge variant={workflowProgress >= 67 ? "success" : "warning"} className="text-[10px] uppercase tracking-[0.12em]">
                  {workflowProgress}% Workflow Ready
                </Badge>
              </div>

              <div className="h-2.5 rounded-full bg-surface-4 overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-emerald-500 via-teal-500 to-cyan-500 transition-all duration-500"
                  style={{ width: `${workflowProgress}%` }}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-glass-border bg-surface-2/70 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-[10px] font-semibold text-primary">01</span>
                    <Badge variant={resumeReady ? "success" : "warning"} className="text-[10px]">{resumeReady ? "Ready" : "Pending"}</Badge>
                  </div>
                  <p className="text-xs font-semibold">Resume Source</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {resumeReady ? `${resumeWordCount} words captured from ${sourceLabel(resumeSourceType)}.` : "Upload or paste resume content to initialize ATS scoring."}
                  </p>
                </div>

                <div className="rounded-xl border border-glass-border bg-surface-2/70 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-[10px] font-semibold text-primary">02</span>
                    <Badge variant={jdReady ? "success" : "outline"} className="text-[10px]">{jdReady ? "Linked" : "Optional"}</Badge>
                  </div>
                  <p className="text-xs font-semibold">JD Lens</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {jdReady ? `Role alignment enabled using ${sourceLabel(jdSourceType)} JD.` : "Attach a JD for stronger keyword and requirement gap analysis."}
                  </p>
                </div>

                <div className="rounded-xl border border-glass-border bg-surface-2/70 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-primary/35 bg-primary/10 text-[10px] font-semibold text-primary">03</span>
                    <Badge variant={strategyReady ? "success" : "warning"} className="text-[10px]">{strategyReady ? "Ready" : "Tune"}</Badge>
                  </div>
                  <p className="text-xs font-semibold">Strategy Framing</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {hasTargetRole ? `Target role set to ${targetRole.trim()}.` : "Set a target role or add JD context for sharper strategic feedback."}
                  </p>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-glass-border/80 bg-surface-2/60 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" /> Resume Workspace
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-1">Primary source for ATS parseability and content scoring.</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{sourceLabel(resumeSourceType)}</Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => resumeFileInputRef.current?.click()}
                      disabled={extractingResume}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-60"
                    >
                      {extractingResume ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting...</>
                      ) : (
                        <><Upload className="h-3.5 w-3.5" /> Upload Resume PDF or DOCX</>
                      )}
                    </button>
                    <input
                      ref={resumeFileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.text,.md"
                      onChange={handleResumeUpload}
                      className="hidden"
                      title="Upload resume"
                    />

                    {resumeFileName && (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success">
                        {resumeFileName}
                        <button
                          onClick={clearResumeUpload}
                          className="text-danger/70 hover:text-danger"
                          title="Clear uploaded resume file"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}

                    <span className="text-[10px] text-muted-foreground">PDF, DOCX, TXT, MD up to {FILE_SIZE_LIMIT_MB}MB</span>
                  </div>

                  <Textarea
                    className="min-h-[220px] resize-none bg-surface-1/80 border-glass-border"
                    placeholder="Paste your complete resume text here, or upload a PDF/DOCX above..."
                    value={resumeText}
                    onChange={(e) => {
                      setResumeText(e.target.value);
                      setResumeSourceType("paste");
                      setResumeFileName(null);
                      if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
                    }}
                  />

                  <div className="text-[11px] text-muted-foreground">{resumeReady ? `${resumeWordCount} words captured` : "No resume text captured yet"}</div>
                </div>

                <div className="rounded-2xl border border-glass-border/80 bg-surface-2/60 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Target className="h-4 w-4 text-primary" /> Job Description Workspace
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-1">Optional context to compare role demand against your resume.</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{hasJD ? sourceLabel(jdSourceType) : "Optional"}</Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => jdFileInputRef.current?.click()}
                      disabled={extractingJD}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-60"
                    >
                      {extractingJD ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting...</>
                      ) : (
                        <><Upload className="h-3.5 w-3.5" /> Upload JD PDF or DOCX</>
                      )}
                    </button>
                    <input
                      ref={jdFileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.text,.md"
                      onChange={handleJDUpload}
                      className="hidden"
                      title="Upload job description"
                    />

                    {jdFileName && (
                      <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success">
                        {jdFileName}
                        <button
                          onClick={clearJDUpload}
                          className="text-danger/70 hover:text-danger"
                          title="Clear uploaded job description file"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </div>

                  <Textarea
                    className="min-h-[220px] resize-none bg-surface-1/80 border-glass-border"
                    placeholder="Paste the target job description here, or upload a PDF/DOCX above..."
                    value={jobDescription}
                    onChange={(e) => {
                      setJobDescription(e.target.value);
                      setJdSourceType("paste");
                      setJdFileName(null);
                      if (jdFileInputRef.current) jdFileInputRef.current.value = "";
                    }}
                  />

                  <div className="text-[11px] text-muted-foreground">{hasJD ? "JD context linked" : "No JD linked (general ATS check mode)"}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-glass-border/80 bg-surface-2/60 p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <ScanSearch className="h-4 w-4 text-primary" /> AI Strategy Lane
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-1">Tune role framing and depth before launching simulation.</p>
                  </div>
                  <Badge variant={analysisDepth === "advanced" ? "success" : "warning"} className="text-[10px] uppercase tracking-[0.12em]">
                    {analysisLabel}
                  </Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Target Role (optional)</label>
                    <Input
                      placeholder="e.g., Frontend Developer Intern, SDE-1, Data Analyst"
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      className="bg-surface-1/80"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Analysis Depth</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setAnalysisDepth("standard")}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          analysisDepth === "standard"
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-glass-border bg-surface-1/80 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Standard AI
                      </button>
                      <button
                        onClick={() => setAnalysisDepth("advanced")}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          analysisDepth === "advanced"
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : "border-glass-border bg-surface-1/80 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Deep AI
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-glass-border bg-surface-1/80 p-3 text-[11px] text-muted-foreground leading-relaxed">
                  Uses Gemini from your Settings API key. Deep AI mode applies stronger role-fit reasoning and tactical rewrite guidance.
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-4 z-20">
            {saveNotice && (
              <div className="mb-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                {saveNotice}
              </div>
            )}
            <Card className="border-glass-border/80 bg-sticky-bg backdrop-blur-xl shadow-[0_14px_34px_var(--shadow-heavy)]">
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-linear-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shrink-0">
                        <ScanSearch className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="text-sm font-semibold">Launch ATS Simulation</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{workflowSummary}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {resumeText && <Badge variant="outline" className="text-[10px]">Resume Ready</Badge>}
                      {hasJD && <Badge variant="outline" className="text-[10px]">JD Linked</Badge>}
                      <Badge variant={analysisDepth === "advanced" ? "success" : "warning"} className="text-[10px]">
                        {analysisDepth === "advanced" ? "Deep AI" : "Standard AI"}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full md:w-auto">
                    <Button
                      onClick={handleSaveProgress}
                      variant="outline"
                      className="gap-2 px-4 py-5 text-sm w-full sm:w-auto"
                      title="Save current progress locally"
                    >
                      <Save className="h-4 w-4" /> Save Progress
                    </Button>
                    <Button
                      onClick={checkATS}
                      disabled={loading || extractingResume || extractingJD}
                      variant="glow"
                      className="gap-2 px-7 py-5 text-sm bg-linear-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shrink-0 w-full sm:w-auto md:w-auto"
                    >
                      {loading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</>
                      ) : (
                        <><ScanSearch className="h-4 w-4" /> {analysisDepth === "advanced" ? "Run Deep Simulation" : "Run ATS Check"}</>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1 scrollbar-thin">
          {resultsPanel}
        </aside>
      </div>
    </motion.div>
  );
}

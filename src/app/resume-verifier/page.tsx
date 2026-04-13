"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  ClipboardCheck,
  Loader2,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  X,
} from "lucide-react";
import { getApiKey, generateWithRetry } from "@/lib/ai/gemini";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  extractTextFromSupportedResumeFile,
  getSupportedResumeFileType,
  MAX_RESUME_FILE_SIZE_BYTES,
  type SupportedResumeFileType,
} from "@/lib/resume/textExtraction";
import {
  generateExamAttemptId,
  saveExamSession,
  type ExamMode,
} from "@/lib/resume-verifier/examSession";

type CandidateBand = "fresher" | "experienced";
type QuestionType = "mcq" | "short" | "project" | "coding";
type Difficulty = "easy" | "medium" | "hard";
type VerifierSection = "skills" | "projects" | "experience" | "problem-solving" | "communication";

type VerificationQuestion = {
  id: string;
  type: QuestionType;
  section: VerifierSection;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  expectedFocus: string[];
  timeHintMinutes: number;
};

type GeneratedTestPayload = {
  candidateBand: CandidateBand;
  candidateSummary: string;
  extractedSignals: {
    skills: string[];
    tools: string[];
    projects: string[];
    experienceYears: number;
    highlights: string[];
  };
  examMeta: {
    title: string;
    durationMinutes: number;
    randomSeed: string;
    generatedAt: string;
  };
  questions: VerificationQuestion[];
};

type AnswerState = {
  text: string;
  selectedOptionIndex: number | null;
  codeLanguage: string;
};

type QuestionEvaluation = {
  questionId: string;
  score: number;
  maxScore: number;
  strengths: string[];
  gaps: string[];
  feedback: string;
};

type SectionScore = {
  name: string;
  score: number;
  status: "good" | "warning" | "critical";
  feedback: string;
};

type VerificationReport = {
  overallScore: number;
  summary: string;
  strengths: string[];
  weakAreas: string[];
  nextSteps: string[];
  integrityNotes: string[];
  sectionScores: SectionScore[];
  questionEvaluations: QuestionEvaluation[];
  candidateBand: CandidateBand;
};

type VerifierStage = "upload" | "extraction-review" | "locked-exam" | "evaluated";

type ViolationType = "tab-switch" | "copy-attempt" | "paste-attempt" | "contextmenu-attempt" | "shortcut-attempt";

type TestViolation = {
  type: ViolationType;
  severity: "warning" | "critical";
  message: string;
  timestamp: number;
};

type ExtractionReviewDraft = {
  candidateSummary: string;
  skills: string;
  tools: string;
  projects: string;
  highlights: string;
  experienceYears: number;
};

type ResumeVerifierDraft = {
  resumeText: string;
  roleContext: string;
  examMode: ExamMode;
  resumeSourceType: SupportedResumeFileType | "paste";
  resumeFileName: string | null;
  testData: GeneratedTestPayload | null;
  answers: Record<string, AnswerState>;
  activeQuestionIndex: number;
  remainingSeconds: number;
  isTimerRunning: boolean;
  stage: VerifierStage;
  reviewDraft: ExtractionReviewDraft | null;
  violations: TestViolation[];
  isDisqualified: boolean;
  report: VerificationReport | null;
  savedAt: number;
};

const FILE_SIZE_LIMIT_MB = Math.round(MAX_RESUME_FILE_SIZE_BYTES / (1024 * 1024));
const RESUME_VERIFIER_DRAFT_STORAGE_KEY = "resume_verifier_draft_v1";
const MIN_RESUME_LENGTH = 160;

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "MCQ",
  short: "Concept",
  project: "Project",
  coding: "Coding",
};

const SECTION_LABELS: Record<VerifierSection, string> = {
  skills: "Skills Verification",
  projects: "Project Defense",
  experience: "Experience Validation",
  "problem-solving": "Problem Solving",
  communication: "Communication",
};

const LANGUAGE_OPTIONS = ["javascript", "python", "java", "cpp"];
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "your",
  "have",
  "has",
  "into",
  "using",
  "worked",
  "work",
  "project",
  "projects",
  "experience",
  "skills",
  "role",
  "team",
]);

const MONTH_LOOKUP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const WORK_CONTEXT_KEYWORDS = [
  "experience",
  "employment",
  "intern",
  "internship",
  "developer",
  "engineer",
  "analyst",
  "consultant",
  "full time",
  "part time",
  "freelance",
  "role",
  "position",
  "worked",
  "company",
  "organization",
  "job",
];

const EDUCATION_CONTEXT_KEYWORDS = [
  "education",
  "bachelor",
  "master",
  "college",
  "university",
  "school",
  "cgpa",
  "gpa",
  "semester",
  "course",
  "coursework",
  "project",
  "capstone",
  "thesis",
];

function sourceLabel(type: SupportedResumeFileType | "paste"): string {
  if (type === "pdf") return "PDF";
  if (type === "docx") return "DOCX";
  if (type === "text") return "Text File";
  return "Pasted Text";
}

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:json|text|md|markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

function parseJsonObject(raw: string): unknown {
  const cleaned = stripCodeFence(raw);

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Invalid JSON response");
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function clampScore(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric < 0) return 0;
  if (numeric > 100) return 100;
  return Math.round(numeric);
}

function getStatusFromScore(score: number): "good" | "warning" | "critical" {
  if (score >= 80) return "good";
  if (score >= 60) return "warning";
  return "critical";
}

function normalizeDifficulty(value: unknown): Difficulty {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }
  return "medium";
}

function normalizeQuestionType(value: unknown): QuestionType {
  if (value === "mcq" || value === "short" || value === "project" || value === "coding") {
    return value;
  }
  return "short";
}

function normalizeSection(value: unknown): VerifierSection {
  if (
    value === "skills"
    || value === "projects"
    || value === "experience"
    || value === "problem-solving"
    || value === "communication"
  ) {
    return value;
  }
  return "skills";
}

function buildRandomSeed(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function normalizeResumeText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00A0]/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type YearMonthPoint = {
  year: number;
  month: number;
};

type CareerInterval = {
  startMonthIndex: number;
  endMonthIndex: number;
};

function parseYearMonthToken(token: string, now: Date): YearMonthPoint | null {
  const lower = token.trim().toLowerCase();
  if (!lower) return null;

  if (/(present|current|now|till\s+date|till\s+now)/.test(lower)) {
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
    };
  }

  const yearMatch = lower.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return null;

  const year = Number(yearMatch[0]);
  const monthKey = Object.keys(MONTH_LOOKUP).find((entry) => lower.includes(entry));

  return {
    year,
    month: monthKey ? MONTH_LOOKUP[monthKey] : 0,
  };
}

function classifyContextWindow(windowText: string): "work" | "education" | "unknown" {
  const lower = windowText.toLowerCase();
  const workHits = WORK_CONTEXT_KEYWORDS.reduce((sum, keyword) => sum + (lower.includes(keyword) ? 1 : 0), 0);
  const eduHits = EDUCATION_CONTEXT_KEYWORDS.reduce((sum, keyword) => sum + (lower.includes(keyword) ? 1 : 0), 0);

  if (workHits > eduHits && workHits > 0) return "work";
  if (eduHits > workHits && eduHits > 0) return "education";
  return "unknown";
}

function mergeIntervals(intervals: CareerInterval[]): CareerInterval[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a.startMonthIndex - b.startMonthIndex);
  const merged: CareerInterval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.startMonthIndex <= last.endMonthIndex + 1) {
      last.endMonthIndex = Math.max(last.endMonthIndex, current.endMonthIndex);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function inferExperienceYearsFromText(text: string): number {
  const now = new Date();
  const lower = text.toLowerCase();
  const monthPattern = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const dateRangeRegex = new RegExp(
    `\\b((?:${monthPattern}\\s+)?(?:19|20)\\d{2})\\s*(?:-|–|—|to)\\s*(present|current|now|till\\s+date|till\\s+now|(?:${monthPattern}\\s+)?(?:19|20)\\d{2})\\b`,
    "gi"
  );

  const intervals: CareerInterval[] = [];
  let match: RegExpExecArray | null;

  while ((match = dateRangeRegex.exec(lower)) !== null) {
    const startRaw = match[1] || "";
    const endRaw = match[2] || "";
    const start = parseYearMonthToken(startRaw, now);
    const end = parseYearMonthToken(endRaw, now);
    if (!start || !end) continue;

    const startMonthIndex = start.year * 12 + start.month;
    const endMonthIndex = end.year * 12 + end.month;
    if (endMonthIndex < startMonthIndex) continue;

    const aroundStart = Math.max(0, (match.index || 0) - 100);
    const aroundEnd = Math.min(lower.length, (match.index || 0) + match[0].length + 100);
    const contextWindow = lower.slice(aroundStart, aroundEnd);
    const classification = classifyContextWindow(contextWindow);

    if (classification === "education") continue;
    if (classification === "unknown") continue;

    intervals.push({
      startMonthIndex,
      endMonthIndex,
    });
  }

  const mergedIntervals = mergeIntervals(intervals);
  const totalMonths = mergedIntervals.reduce(
    (sum, interval) => sum + (interval.endMonthIndex - interval.startMonthIndex + 1),
    0
  );

  const intervalYears = totalMonths > 0 ? totalMonths / 12 : 0;
  const explicitYearsMatch = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs)\s+(?:of\s+)?experience/i);
  const explicitYears = explicitYearsMatch ? Number(explicitYearsMatch[1]) : 0;

  const resolvedYears = intervalYears > 0 ? intervalYears : explicitYears;
  const safeYears = Math.max(0, Math.min(40, resolvedYears));
  return Math.round(safeYears * 10) / 10;
}

function inferCandidateBand(text: string): CandidateBand {
  const lower = text.toLowerCase();
  const experienceYears = inferExperienceYearsFromText(text);

  if (experienceYears >= 2) return "experienced";

  const experiencedSignals = ["senior", "lead", "manager", "architect", "stakeholder", "production owner"];
  if (experiencedSignals.some((signal) => lower.includes(signal))) {
    return "experienced";
  }

  return "fresher";
}

function pickResumeKeywords(resumeText: string, count: number): string[] {
  const words = resumeText
    .toLowerCase()
    .replace(/[^a-z0-9+.#\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  const unique: string[] = [];
  for (const word of words) {
    if (!unique.includes(word)) {
      unique.push(word);
    }
    if (unique.length >= count) break;
  }

  return unique;
}

function buildFallbackTest(resumeText: string, roleContext: string, randomSeed: string): GeneratedTestPayload {
  const candidateBand = inferCandidateBand(resumeText);
  const experienceYears = inferExperienceYearsFromText(resumeText);
  const keywords = pickResumeKeywords(resumeText, 10);

  const baseSkillA = keywords[0] || "problem solving";
  const baseSkillB = keywords[1] || "data structures";
  const baseProject = keywords[2] || "your recent project";
  const baseTool = keywords[3] || "testing";

  const questionPool: VerificationQuestion[] = [
    {
      id: "q-fallback-1",
      type: "mcq",
      section: "skills",
      difficulty: "easy",
      prompt: `Which practice best demonstrates strong ${baseSkillA} capability in real delivery?`,
      options: [
        "Giving only theory without implementation context",
        "Linking concepts to measurable implementation outcomes",
        "Avoiding trade-off discussion",
        "Relying only on memorized definitions",
      ],
      expectedFocus: [baseSkillA, "practical reasoning"],
      timeHintMinutes: 2,
    },
    {
      id: "q-fallback-2",
      type: "short",
      section: "experience",
      difficulty: candidateBand === "experienced" ? "medium" : "easy",
      prompt: "Explain one challenge you faced in your experience and how your decisions improved the final result.",
      options: [],
      expectedFocus: ["ownership", "impact", "decision quality"],
      timeHintMinutes: 4,
    },
    {
      id: "q-fallback-3",
      type: "project",
      section: "projects",
      difficulty: "medium",
      prompt: `Deep dive on ${baseProject}: What was your exact contribution, architecture choices, and measurable outcome?`,
      options: [],
      expectedFocus: ["contribution clarity", "architecture", "result"],
      timeHintMinutes: 5,
    },
    {
      id: "q-fallback-4",
      type: "coding",
      section: "problem-solving",
      difficulty: candidateBand === "experienced" ? "hard" : "medium",
      prompt: `Write a function that validates whether a candidate's ${baseSkillB} explanation contains required checkpoints and returns a score map.`,
      options: [],
      expectedFocus: ["clean code", "edge cases", "time complexity"],
      timeHintMinutes: 10,
    },
    {
      id: "q-fallback-5",
      type: "mcq",
      section: "communication",
      difficulty: "easy",
      prompt: "In a project review, what communication style best builds trust with stakeholders?",
      options: [
        "Hide unknowns to look confident",
        "Give transparent status, risks, and mitigation clearly",
        "Share updates only when asked",
        "Focus only on technical details, no business impact",
      ],
      expectedFocus: ["clarity", "stakeholder alignment"],
      timeHintMinutes: 2,
    },
    {
      id: "q-fallback-6",
      type: "project",
      section: "projects",
      difficulty: "medium",
      prompt: `If ${baseProject} had to scale 10x users, what would you redesign first and why?`,
      options: [],
      expectedFocus: ["scalability", "prioritization", "trade-offs"],
      timeHintMinutes: 6,
    },
    {
      id: "q-fallback-7",
      type: "coding",
      section: "skills",
      difficulty: candidateBand === "experienced" ? "hard" : "medium",
      prompt: `Implement a utility in your preferred language to compare expected vs observed metrics and flag significant regressions for ${baseTool}.`,
      options: [],
      expectedFocus: ["data handling", "robustness", "readability"],
      timeHintMinutes: 10,
    },
    {
      id: "q-fallback-8",
      type: "short",
      section: "experience",
      difficulty: "medium",
      prompt: "How do you decide when to ship fast versus improve quality first? Give one real decision framework.",
      options: [],
      expectedFocus: ["judgment", "trade-offs", "delivery thinking"],
      timeHintMinutes: 4,
    },
  ];

  const questions = shuffle(questionPool);

  return {
    candidateBand,
    candidateSummary: `Auto-generated verification round for a ${candidateBand} profile${roleContext.trim() ? ` targeting ${roleContext.trim()}` : ""}.`,
    extractedSignals: {
      skills: keywords.slice(0, 6),
      tools: keywords.slice(6, 10),
      projects: [baseProject],
      experienceYears,
      highlights: [
        "Fallback generation used due to malformed AI output.",
        "Question set still enforces mixed-format verification.",
      ],
    },
    examMeta: {
      title: "Resume Verifier Round",
      durationMinutes: candidateBand === "experienced" ? 38 : 30,
      randomSeed,
      generatedAt: new Date().toISOString(),
    },
    questions,
  };
}

function normalizeGeneratedTest(
  raw: unknown,
  resumeText: string,
  roleContext: string,
  randomSeed: string
): GeneratedTestPayload {
  if (!raw || typeof raw !== "object") {
    return buildFallbackTest(resumeText, roleContext, randomSeed);
  }

  const payload = raw as Record<string, unknown>;
  const inferredWorkYears = inferExperienceYearsFromText(resumeText);
  const candidateBand = payload.candidateBand === "experienced" || payload.candidateBand === "fresher"
    ? payload.candidateBand
    : inferCandidateBand(resumeText);

  const typedSignals = payload.extractedSignals && typeof payload.extractedSignals === "object"
    ? (payload.extractedSignals as Record<string, unknown>)
    : {};

  const questions = Array.isArray(payload.questions)
    ? payload.questions
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") return null;
          const typed = entry as Record<string, unknown>;

          const type = normalizeQuestionType(typed.type);
          const options = type === "mcq"
            ? toStringArray(typed.options).slice(0, 6)
            : [];

          if (type === "mcq" && options.length < 4) {
            return null;
          }

          const prompt = String(typed.prompt || "").trim();
          if (!prompt) return null;

          return {
            id: String(typed.id || `q-${index + 1}-${randomSeed.slice(-4)}`),
            type,
            section: normalizeSection(typed.section),
            difficulty: normalizeDifficulty(typed.difficulty),
            prompt,
            options,
            expectedFocus: toStringArray(typed.expectedFocus).slice(0, 6),
            timeHintMinutes: Math.min(15, Math.max(1, Number(typed.timeHintMinutes) || 4)),
          } satisfies VerificationQuestion;
        })
        .filter((question): question is VerificationQuestion => question !== null)
    : [];

  if (questions.length < 6) {
    return buildFallbackTest(resumeText, roleContext, randomSeed);
  }

  const typedMeta = payload.examMeta && typeof payload.examMeta === "object"
    ? (payload.examMeta as Record<string, unknown>)
    : {};

  const durationMinutes = Math.min(60, Math.max(20, Number(typedMeta.durationMinutes) || (candidateBand === "experienced" ? 40 : 30)));

  return {
    candidateBand,
    candidateSummary: String(payload.candidateSummary || "Resume claims analyzed and converted into an adaptive verification round.").trim(),
    extractedSignals: {
      skills: toStringArray(typedSignals.skills).slice(0, 12),
      tools: toStringArray(typedSignals.tools).slice(0, 10),
      projects: toStringArray(typedSignals.projects).slice(0, 8),
      experienceYears: inferredWorkYears,
      highlights: toStringArray(typedSignals.highlights).slice(0, 8),
    },
    examMeta: {
      title: String(typedMeta.title || "Resume Verifier Round").trim(),
      durationMinutes,
      randomSeed: String(typedMeta.randomSeed || randomSeed),
      generatedAt: String(typedMeta.generatedAt || new Date().toISOString()),
    },
    questions: shuffle(questions),
  };
}

function isQuestionAnswered(question: VerificationQuestion, answer: AnswerState | undefined): boolean {
  if (!answer) return false;

  if (question.type === "mcq") {
    return answer.selectedOptionIndex !== null;
  }

  if (question.type === "coding") {
    return answer.text.trim().length >= 20;
  }

  return answer.text.trim().length >= 10;
}

function defaultAnswerState(): AnswerState {
  return {
    text: "",
    selectedOptionIndex: null,
    codeLanguage: "javascript",
  };
}

function initializeAnswers(testData: GeneratedTestPayload): Record<string, AnswerState> {
  const next: Record<string, AnswerState> = {};
  testData.questions.forEach((question) => {
    next[question.id] = defaultAnswerState();
  });
  return next;
}

function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60).toString().padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toReviewDraft(testData: GeneratedTestPayload): ExtractionReviewDraft {
  return {
    candidateSummary: testData.candidateSummary,
    skills: testData.extractedSignals.skills.join("\n"),
    tools: testData.extractedSignals.tools.join("\n"),
    projects: testData.extractedSignals.projects.join("\n"),
    highlights: testData.extractedSignals.highlights.join("\n"),
    experienceYears: Math.max(0, Math.round((testData.extractedSignals.experienceYears || 0) * 10) / 10),
  };
}

function mergeReviewDraftIntoTestData(testData: GeneratedTestPayload, reviewDraft: ExtractionReviewDraft): GeneratedTestPayload {
  return {
    ...testData,
    candidateSummary: reviewDraft.candidateSummary.trim() || testData.candidateSummary,
    extractedSignals: {
      ...testData.extractedSignals,
      skills: linesToArray(reviewDraft.skills),
      tools: linesToArray(reviewDraft.tools),
      projects: linesToArray(reviewDraft.projects),
      highlights: linesToArray(reviewDraft.highlights),
      experienceYears: Math.max(0, Math.round((reviewDraft.experienceYears || 0) * 10) / 10),
    },
  };
}

function buildDisqualificationReport(
  testData: GeneratedTestPayload,
  violations: TestViolation[]
): VerificationReport {
  return {
    overallScore: 0,
    summary: "Assessment disqualified due to exam policy violations.",
    strengths: [],
    weakAreas: ["Integrity concern: tab switching during locked exam"],
    nextSteps: [
      "Retry with a stable connection and single focused browser tab.",
      "Keep the exam tab active until submission is complete.",
    ],
    integrityNotes: violations.map((entry) => {
      const when = new Date(entry.timestamp).toLocaleTimeString();
      return `${entry.severity.toUpperCase()}: ${entry.message} at ${when}`;
    }),
    sectionScores: [],
    questionEvaluations: [],
    candidateBand: testData.candidateBand,
  };
}

function buildFallbackEvaluation(testData: GeneratedTestPayload, answers: Record<string, AnswerState>): VerificationReport {
  const questionEvaluations: QuestionEvaluation[] = testData.questions.map((question) => {
    const answer = answers[question.id];
    const answered = isQuestionAnswered(question, answer);
    const answerLength = answer?.text.trim().length || 0;

    const baseScore = answered
      ? Math.min(92, Math.max(45, Math.round(48 + answerLength * 0.35)))
      : 18;

    return {
      questionId: question.id,
      score: clampScore(baseScore),
      maxScore: 100,
      strengths: answered ? ["Attempt submitted", "Context relevance present"] : [],
      gaps: answered ? [] : ["No meaningful answer submitted"],
      feedback: answered
        ? "Answer captured. Manual AI fallback scoring applied because structured grading response was unavailable."
        : "This question was unanswered or too short for verification.",
    };
  });

  const sectionBuckets = new Map<VerifierSection, number[]>();
  testData.questions.forEach((question) => {
    if (!sectionBuckets.has(question.section)) {
      sectionBuckets.set(question.section, []);
    }

    const evaluation = questionEvaluations.find((entry) => entry.questionId === question.id);
    sectionBuckets.get(question.section)?.push(evaluation?.score || 0);
  });

  const sectionScores: SectionScore[] = Array.from(sectionBuckets.entries()).map(([section, scores]) => {
    const avg = scores.length > 0
      ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
      : 0;

    return {
      name: SECTION_LABELS[section],
      score: avg,
      status: getStatusFromScore(avg),
      feedback: avg >= 75
        ? "Claims are mostly verifiable with strong answer confidence."
        : avg >= 55
          ? "Some claims are partially verifiable; depth and specifics can improve."
          : "Verification confidence is low. Revisit claim depth and practical evidence.",
    };
  });

  const overallScore = sectionScores.length > 0
    ? Math.round(sectionScores.reduce((sum, section) => sum + section.score, 0) / sectionScores.length)
    : 0;

  const weakAreas = sectionScores.filter((section) => section.score < 60).map((section) => section.name);
  const strengths = sectionScores.filter((section) => section.score >= 75).map((section) => section.name);

  return {
    overallScore,
    summary: "Fallback scoring was used due to non-structured AI grading output. Results still reflect answer completeness and topical relevance.",
    strengths,
    weakAreas,
    nextSteps: [
      "Add more concrete metrics and outcome details to project explanations.",
      "Practice explaining decision trade-offs with clear constraints.",
      "Improve coding answer structure: assumptions, solution, and edge cases.",
    ],
    integrityNotes: [
      "Fallback evaluation mode applied.",
      "Run another verification round for full AI-graded detail.",
    ],
    sectionScores,
    questionEvaluations,
    candidateBand: testData.candidateBand,
  };
}

function normalizeEvaluationReport(
  raw: unknown,
  testData: GeneratedTestPayload,
  answers: Record<string, AnswerState>
): VerificationReport {
  if (!raw || typeof raw !== "object") {
    return buildFallbackEvaluation(testData, answers);
  }

  const payload = raw as Record<string, unknown>;

  const questionEvaluations = Array.isArray(payload.questionEvaluations)
    ? payload.questionEvaluations
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const typed = entry as Record<string, unknown>;
          const questionId = String(typed.questionId || "").trim();
          if (!questionId) return null;

          return {
            questionId,
            score: clampScore(typed.score),
            maxScore: clampScore(typed.maxScore || 100) || 100,
            strengths: toStringArray(typed.strengths).slice(0, 5),
            gaps: toStringArray(typed.gaps).slice(0, 5),
            feedback: String(typed.feedback || "No detailed feedback returned.").trim(),
          } satisfies QuestionEvaluation;
        })
        .filter((entry): entry is QuestionEvaluation => entry !== null)
    : [];

  if (questionEvaluations.length === 0) {
    return buildFallbackEvaluation(testData, answers);
  }

  const questionEvalMap = new Map(questionEvaluations.map((entry) => [entry.questionId, entry]));
  const sectionBuckets = new Map<VerifierSection, number[]>();

  testData.questions.forEach((question) => {
    if (!sectionBuckets.has(question.section)) {
      sectionBuckets.set(question.section, []);
    }

    const evaluation = questionEvalMap.get(question.id);
    sectionBuckets.get(question.section)?.push(evaluation?.score || 0);
  });

  const sectionScores = Array.isArray(payload.sectionScores)
    ? payload.sectionScores
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const typed = entry as Record<string, unknown>;
          const name = String(typed.name || "").trim();
          if (!name) return null;
          const score = clampScore(typed.score);

          return {
            name,
            score,
            status: getStatusFromScore(score),
            feedback: String(typed.feedback || "No section feedback returned.").trim(),
          } satisfies SectionScore;
        })
        .filter((entry): entry is SectionScore => entry !== null)
    : [];

  const resolvedSectionScores = sectionScores.length > 0
    ? sectionScores
    : Array.from(sectionBuckets.entries()).map(([section, scores]) => {
        const avg = scores.length > 0
          ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
          : 0;

        return {
          name: SECTION_LABELS[section],
          score: avg,
          status: getStatusFromScore(avg),
          feedback: "Section score derived from per-question evaluations.",
        } satisfies SectionScore;
      });

  const overallScoreFromSections = resolvedSectionScores.length > 0
    ? Math.round(resolvedSectionScores.reduce((sum, section) => sum + section.score, 0) / resolvedSectionScores.length)
    : 0;

  return {
    overallScore: clampScore(payload.overallScore) || overallScoreFromSections,
    summary: String(payload.summary || "Verification completed with mixed-format answer analysis.").trim(),
    strengths: toStringArray(payload.strengths).slice(0, 8),
    weakAreas: toStringArray(payload.weakAreas).slice(0, 8),
    nextSteps: toStringArray(payload.nextSteps).slice(0, 8),
    integrityNotes: toStringArray(payload.integrityNotes).slice(0, 6),
    sectionScores: resolvedSectionScores,
    questionEvaluations,
    candidateBand: payload.candidateBand === "experienced" || payload.candidateBand === "fresher"
      ? payload.candidateBand
      : testData.candidateBand,
  };
}

function buildGenerationPrompt(resumeText: string, roleContext: string, randomSeed: string): string {
  const boundedResume = resumeText.slice(0, 12000);
  const boundedContext = roleContext.trim().slice(0, 3500);

  return `You are an AI Resume Verifier Interview Engine.

OBJECTIVE:
- Verify whether the resume claims are genuine and interview-defensible.
- Auto-detect profile band: fresher or experienced.
- Generate a VARIABLE interview test every run. Do not produce a static template.
- Use randomization seed ${randomSeed} to vary question framing, sequence, and scenario emphasis.

MANDATORY TEST DESIGN RULES:
- Questions must be mixed-format and claim-linked.
- Include all these types in each round:
  1) MCQ
  2) Concept short-answer
  3) Project deep-dive question
  4) Coding question
- Do not focus on one topic only.
- Ask from skills, projects, work experience depth, and decision-making.
- For fresher: emphasize fundamentals + project ownership clarity.
- For experienced: emphasize architecture trade-offs, leadership impact, and production judgment.

QUESTION COUNT + DURATION:
- Variable total question count between 10 and 18.
- Variable duration between 25 and 50 minutes.
- Include at least 2 coding questions, at least 3 MCQs, and at least 2 project deep dives.

OUTPUT FORMAT:
Return ONLY valid JSON with this schema (no markdown, no code fences):
{
  "candidateBand": "fresher|experienced",
  "candidateSummary": "string",
  "extractedSignals": {
    "skills": ["string"],
    "tools": ["string"],
    "projects": ["string"],
    "experienceYears": 0,
    "highlights": ["string"]
  },
  "examMeta": {
    "title": "string",
    "durationMinutes": 30,
    "randomSeed": "${randomSeed}",
    "generatedAt": "ISO-8601"
  },
  "questions": [
    {
      "id": "q-1",
      "type": "mcq|short|project|coding",
      "section": "skills|projects|experience|problem-solving|communication",
      "difficulty": "easy|medium|hard",
      "prompt": "string",
      "options": ["string"],
      "expectedFocus": ["string"],
      "timeHintMinutes": 3
    }
  ]
}

NOTES:
- options must be non-empty only for MCQ, and must contain 4 options.
- expectedFocus should be concise and practical checkpoints.
- Ensure coding prompts are realistic and role-relevant.
- experienceYears must represent summed work/internship duration only; do not infer from education timelines.

RESUME TEXT:
${boundedResume}

${boundedContext ? `OPTIONAL ROLE / JOB CONTEXT:\n${boundedContext}` : "No extra role context supplied."}`;
}

function buildEvaluationPrompt(
  testData: GeneratedTestPayload,
  answers: Record<string, AnswerState>,
  resumeText: string,
  roleContext: string
): string {
  const boundedResume = resumeText.slice(0, 10000);
  const boundedContext = roleContext.trim().slice(0, 3000);

  const answerPayload = testData.questions.map((question) => {
    const answer = answers[question.id] || defaultAnswerState();
    const selectedOption = question.type === "mcq" && answer.selectedOptionIndex !== null
      ? question.options[answer.selectedOptionIndex] || ""
      : "";

    return {
      questionId: question.id,
      questionType: question.type,
      section: question.section,
      prompt: question.prompt,
      expectedFocus: question.expectedFocus,
      answerText: answer.text,
      selectedOption,
      codeLanguage: answer.codeLanguage,
    };
  });

  return `You are an AI Resume Verification Evaluator.

GOAL:
Evaluate whether the candidate's answers genuinely support resume claims.

PROFILE BAND: ${testData.candidateBand}
EVALUATION MODE:
- Fresher: evaluate fundamentals, ownership clarity, and practical understanding.
- Experienced: evaluate depth, decision-making, architecture trade-offs, and impact realism.

GRADING RULES:
- Score each question 0-100.
- For coding answers, evaluate in context of the exact prompt on:
  1) correctness of approach,
  2) edge-case awareness,
  3) clarity/readability,
  4) practical relevance.
- Penalize vague, generic, contradictory, or likely inflated answers.
- Reward concrete reasoning, measurable impact, and precise technical articulation.

OUTPUT FORMAT:
Return ONLY valid JSON with this schema (no markdown, no code fences):
{
  "overallScore": 0,
  "summary": "string",
  "candidateBand": "${testData.candidateBand}",
  "strengths": ["string"],
  "weakAreas": ["string"],
  "nextSteps": ["string"],
  "integrityNotes": ["string"],
  "sectionScores": [
    {
      "name": "string",
      "score": 0,
      "feedback": "string"
    }
  ],
  "questionEvaluations": [
    {
      "questionId": "string",
      "score": 0,
      "maxScore": 100,
      "strengths": ["string"],
      "gaps": ["string"],
      "feedback": "string"
    }
  ]
}

TEST QUESTIONS + ANSWERS JSON:
${JSON.stringify(answerPayload, null, 2)}

RESUME CONTEXT:
${boundedResume}

${boundedContext ? `ROLE / JOB CONTEXT:\n${boundedContext}` : "No extra role context supplied."}`;
}

function CodeEditorPanel({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const lineCount = Math.max(8, value.split("\n").length);

  return (
    <div className="rounded-xl border border-glass-border bg-code-bg overflow-hidden">
      <div className="grid grid-cols-[48px_minmax(0,1fr)]">
        <div className="border-r border-glass-border bg-surface-2/70 text-[11px] leading-6 font-mono text-muted-foreground text-right px-2 py-2 select-none">
          {Array.from({ length: lineCount }, (_, idx) => (
            <div key={`line-${idx + 1}`}>{idx + 1}</div>
          ))}
        </div>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="min-h-[280px] w-full resize-y bg-transparent p-3 text-xs leading-6 font-mono text-foreground focus:outline-none"
          placeholder="Write your solution here..."
        />
      </div>
    </div>
  );
}

export default function ResumeVerifierPage() {
  const router = useRouter();
  const resumeFileInputRef = useRef<HTMLInputElement>(null);
  const lockedExamScopeRef = useRef<HTMLDivElement>(null);

  const [resumeText, setResumeText] = useState("");
  const [roleContext, setRoleContext] = useState("");
  const [examMode, setExamMode] = useState<ExamMode>("official");
  const [resumeSourceType, setResumeSourceType] = useState<SupportedResumeFileType | "paste">("paste");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [extractingResume, setExtractingResume] = useState(false);

  const [testData, setTestData] = useState<GeneratedTestPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [stage, setStage] = useState<VerifierStage>("upload");
  const [reviewDraft, setReviewDraft] = useState<ExtractionReviewDraft | null>(null);
  const [violations, setViolations] = useState<TestViolation[]>([]);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [warningNotice, setWarningNotice] = useState("");
  const [report, setReport] = useState<VerificationReport | null>(null);

  const [generatingTest, setGeneratingTest] = useState(false);
  const [evaluatingTest, setEvaluatingTest] = useState(false);
  const [launchingExam, setLaunchingExam] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [error, setError] = useState("");

  const totalQuestions = testData?.questions.length || 0;

  const answeredCount = useMemo(() => {
    if (!testData) return 0;
    return testData.questions.filter((question) => isQuestionAnswered(question, answers[question.id])).length;
  }, [answers, testData]);

  const completionPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const activeQuestion = testData?.questions[activeQuestionIndex] || null;
  const isLockedExamActive = stage === "locked-exam" && !report;
  const tabSwitchCount = useMemo(
    () => violations.filter((entry) => entry.type === "tab-switch").length,
    [violations]
  );
  const canAdvanceInLockedMode = Boolean(
    isLockedExamActive
    && activeQuestion
    && activeQuestionIndex < totalQuestions - 1
    && isQuestionAnswered(activeQuestion, answers[activeQuestion.id])
  );

  const workflowSummary = launchingExam
    ? "Launching dedicated exam interface..."
    : extractingResume
    ? "Extracting resume file..."
    : stage === "extraction-review"
      ? "Review extracted profile and approve to start locked exam"
      : isLockedExamActive
        ? "Locked exam is active. Do not switch tabs."
        : resumeText
          ? `${resumeText.split(/\s+/).filter(Boolean).length} words from ${sourceLabel(resumeSourceType)}`
          : "Upload or paste resume to start";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESUME_VERIFIER_DRAFT_STORAGE_KEY);
      if (!raw) return;

      const draft = JSON.parse(raw) as Partial<ResumeVerifierDraft>;

      if (typeof draft.resumeText === "string") {
        setResumeText(draft.resumeText);
      }

      if (typeof draft.roleContext === "string") {
        setRoleContext(draft.roleContext);
      }

      if (draft.examMode === "official" || draft.examMode === "practice") {
        setExamMode(draft.examMode);
      }

      if (
        draft.resumeSourceType === "paste"
        || draft.resumeSourceType === "pdf"
        || draft.resumeSourceType === "docx"
        || draft.resumeSourceType === "text"
      ) {
        setResumeSourceType(draft.resumeSourceType);
      }

      if (typeof draft.resumeFileName === "string") {
        setResumeFileName(draft.resumeFileName);
      } else if (draft.resumeFileName === null) {
        setResumeFileName(null);
      }

      if (draft.testData && typeof draft.testData === "object") {
        const restored = draft.testData as GeneratedTestPayload;
        if (Array.isArray(restored.questions) && restored.questions.length > 0) {
          setTestData(restored);
        }
      }

      if (draft.answers && typeof draft.answers === "object") {
        setAnswers(draft.answers as Record<string, AnswerState>);
      }

      if (typeof draft.activeQuestionIndex === "number" && Number.isFinite(draft.activeQuestionIndex)) {
        setActiveQuestionIndex(Math.max(0, draft.activeQuestionIndex));
      }

      if (typeof draft.remainingSeconds === "number" && Number.isFinite(draft.remainingSeconds)) {
        setRemainingSeconds(Math.max(0, draft.remainingSeconds));
      }

      setIsTimerRunning(false);
      setReport(null);
      setViolations([]);
      setIsDisqualified(false);

      const stageFromDraft = draft.stage;
      if (stageFromDraft === "upload" || stageFromDraft === "extraction-review") {
        setStage(stageFromDraft);
      } else if (draft.testData) {
        setStage("extraction-review");
      } else {
        setStage("upload");
      }

      if (draft.reviewDraft && typeof draft.reviewDraft === "object") {
        setReviewDraft(draft.reviewDraft as ExtractionReviewDraft);
      } else if (draft.testData && typeof draft.testData === "object") {
        const restored = draft.testData as GeneratedTestPayload;
        if (Array.isArray(restored.questions) && restored.questions.length > 0) {
          setReviewDraft(toReviewDraft(restored));
        }
      }

      setViolations([]);
      setIsDisqualified(false);

      setSaveNotice("Progress restored from saved draft.");
      const timer = setTimeout(() => setSaveNotice(""), 2600);
      return () => clearTimeout(timer);
    } catch {
      // Ignore malformed local drafts.
    }
  }, []);

  useEffect(() => {
    try {
      const draft: ResumeVerifierDraft = {
        resumeText,
        roleContext,
        examMode,
        resumeSourceType,
        resumeFileName,
        testData,
        answers,
        activeQuestionIndex,
        remainingSeconds,
        isTimerRunning,
        stage,
        reviewDraft,
        violations,
        isDisqualified,
        report,
        savedAt: Date.now(),
      };

      localStorage.setItem(RESUME_VERIFIER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Best effort autosave only.
    }
  }, [
    resumeText,
    roleContext,
    examMode,
    resumeSourceType,
    resumeFileName,
    testData,
    answers,
    activeQuestionIndex,
    remainingSeconds,
    isTimerRunning,
    stage,
    reviewDraft,
    violations,
    isDisqualified,
    report,
  ]);

  useEffect(() => {
    if (
      !isTimerRunning
      || stage !== "locked-exam"
      || remainingSeconds <= 0
      || evaluatingTest
      || report
      || !testData
      || isDisqualified
    ) {
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isTimerRunning, stage, remainingSeconds, evaluatingTest, report, testData, isDisqualified]);

  async function evaluateSubmission(trigger: "manual" | "timer" | "disqualified" = "manual") {
    if (!testData || evaluatingTest) return;

    if (isDisqualified) {
      setIsTimerRunning(false);
      setStage("evaluated");
      setReport(buildDisqualificationReport(testData, violations));
      setSaveNotice("Submission disqualified due to exam policy violations.");
      setTimeout(() => setSaveNotice(""), 2600);
      return;
    }

    const key = getApiKey();
    if (!key) {
      setError("Please configure your Gemini API key in Settings first.");
      return;
    }

    setEvaluatingTest(true);
    setIsTimerRunning(false);
    setError("");

    try {
      const prompt = buildEvaluationPrompt(testData, answers, resumeText, roleContext);
      const rawText = await generateWithRetry(prompt);
      const parsed = parseJsonObject(rawText);
      const normalized = normalizeEvaluationReport(parsed, testData, answers);
      if (violations.length > 0) {
        const mapped = violations.map((entry) => {
          const when = new Date(entry.timestamp).toLocaleTimeString();
          return `${entry.severity.toUpperCase()}: ${entry.message} at ${when}`;
        });
        normalized.integrityNotes = [...mapped, ...normalized.integrityNotes];
      }
      setStage("evaluated");
      setReport(normalized);
      setSaveNotice(
        trigger === "timer"
          ? "Time ended. Submission auto-verified."
          : trigger === "disqualified"
            ? "Submission completed from disqualification flow."
            : "Answers verified successfully."
      );
    } catch {
      const fallback = buildFallbackEvaluation(testData, answers);
      if (violations.length > 0) {
        const mapped = violations.map((entry) => {
          const when = new Date(entry.timestamp).toLocaleTimeString();
          return `${entry.severity.toUpperCase()}: ${entry.message} at ${when}`;
        });
        fallback.integrityNotes = [...mapped, ...fallback.integrityNotes];
      }
      setStage("evaluated");
      setReport(fallback);
      setError("AI grading response was not fully structured. Fallback scoring was applied.");
    } finally {
      setEvaluatingTest(false);
      setTimeout(() => setSaveNotice(""), 2600);
    }
  }

  useEffect(() => {
    if (!isTimerRunning || stage !== "locked-exam" || !testData || report || evaluatingTest || isDisqualified) return;
    if (remainingSeconds !== 0) return;

    void evaluateSubmission("timer");
  }, [isTimerRunning, stage, remainingSeconds, testData, report, evaluatingTest, isDisqualified]);

  useEffect(() => {
    if (!isDisqualified || stage !== "locked-exam" || report || evaluatingTest || !testData) return;
    void evaluateSubmission("disqualified");
  }, [isDisqualified, stage, report, evaluatingTest, testData]);

  useEffect(() => {
    if (!isLockedExamActive || !isTimerRunning || report || evaluatingTest || isDisqualified) return;

    const handleVisibility = () => {
      if (!document.hidden) return;

      setViolations((prev) => {
        const nextCount = prev.filter((entry) => entry.type === "tab-switch").length + 1;
        const violation: TestViolation = {
          type: "tab-switch",
          severity: nextCount >= 2 ? "critical" : "warning",
          message: "Tab switch detected during locked exam",
          timestamp: Date.now(),
        };

        if (nextCount >= 2) {
          setWarningNotice("Disqualified: second tab switch detected.");
          setIsTimerRunning(false);
          setIsDisqualified(true);
        } else {
          setWarningNotice("Warning: tab switch detected. One more switch will disqualify this attempt.");
          setTimeout(() => setWarningNotice(""), 3500);
        }

        return [...prev, violation];
      });
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isLockedExamActive, isTimerRunning, report, evaluatingTest, isDisqualified]);

  useEffect(() => {
    if (!isLockedExamActive || !isTimerRunning || report || evaluatingTest || isDisqualified) return;

    const scope = lockedExamScopeRef.current;
    if (!scope) return;

    const warn = (message: string, type: ViolationType, event: Event) => {
      event.preventDefault();
      setWarningNotice(message);
      setTimeout(() => setWarningNotice(""), 2200);
      setViolations((prev) => [
        ...prev,
        {
          type,
          severity: "warning",
          message,
          timestamp: Date.now(),
        },
      ]);
    };

    const onCopy = (event: ClipboardEvent) => warn("Copy is disabled in locked exam mode.", "copy-attempt", event);
    const onPaste = (event: ClipboardEvent) => warn("Paste is disabled in locked exam mode.", "paste-attempt", event);
    const onContextMenu = (event: MouseEvent) => warn("Context menu is disabled in locked exam mode.", "contextmenu-attempt", event);
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blockedCombo = (event.ctrlKey || event.metaKey) && ["c", "v", "x", "a", "s", "p"].includes(key);
      const blockedKey = key === "f12" || key === "printscreen";
      if (blockedCombo || blockedKey) {
        warn("Shortcut blocked in locked exam mode.", "shortcut-attempt", event);
      }
    };

    scope.addEventListener("copy", onCopy);
    scope.addEventListener("paste", onPaste);
    scope.addEventListener("contextmenu", onContextMenu);
    scope.addEventListener("keydown", onKeyDown);

    return () => {
      scope.removeEventListener("copy", onCopy);
      scope.removeEventListener("paste", onPaste);
      scope.removeEventListener("contextmenu", onContextMenu);
      scope.removeEventListener("keydown", onKeyDown);
    };
  }, [isLockedExamActive, isTimerRunning, report, evaluatingTest, isDisqualified]);

  const clearResumeUpload = () => {
    if (isLockedExamActive) return;
    setResumeFileName(null);
    setResumeSourceType("paste");
    if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
  };

  const resetRound = () => {
    setTestData(null);
    setReviewDraft(null);
    setAnswers({});
    setActiveQuestionIndex(0);
    setRemainingSeconds(0);
    setIsTimerRunning(false);
    setStage("upload");
    setViolations([]);
    setIsDisqualified(false);
    setWarningNotice("");
    setReport(null);
    setLaunchingExam(false);
    setError("");
  };

  const handleSaveProgress = () => {
    if (isLockedExamActive) {
      setSaveNotice("Save is disabled during locked exam mode.");
      setTimeout(() => setSaveNotice(""), 2200);
      return;
    }

    try {
      const draft: ResumeVerifierDraft = {
        resumeText,
        roleContext,
        examMode,
        resumeSourceType,
        resumeFileName,
        testData,
        answers,
        activeQuestionIndex,
        remainingSeconds,
        isTimerRunning,
        stage,
        reviewDraft,
        violations,
        isDisqualified,
        report,
        savedAt: Date.now(),
      };
      localStorage.setItem(RESUME_VERIFIER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setSaveNotice("Progress saved locally. It will remain after refresh.");
    } catch {
      setSaveNotice("Could not save progress. Please try again.");
    } finally {
      setTimeout(() => setSaveNotice(""), 2600);
    }
  };

  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
        setError("Legacy .doc files are not supported. Please save as .docx and upload again.");
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
        setError("Could not extract readable text from this resume. If scanned, paste text manually.");
        setResumeFileName(null);
        if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
        return;
      }

      setResumeFileName(file.name);
      setResumeSourceType(extracted.type);
      setResumeText(normalizeResumeText(extracted.text));
      resetRound();
    } catch {
      setError("Failed to read resume file. Try another file or paste the text manually.");
      setResumeFileName(null);
      if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
    } finally {
      setExtractingResume(false);
    }
  };

  const generateVerificationRound = async () => {
    const key = getApiKey();
    if (!key) {
      setError("Please configure your Gemini API key in Settings first.");
      return;
    }

    if (extractingResume) {
      setError("Please wait for resume extraction to finish before generating the round.");
      return;
    }

    if (resumeText.trim().length < MIN_RESUME_LENGTH) {
      setError(`Please provide a richer resume input (at least ${MIN_RESUME_LENGTH} characters).`);
      return;
    }

    setGeneratingTest(true);
    setError("");
    setWarningNotice("");
    setViolations([]);
    setIsDisqualified(false);
    setReport(null);

    const randomSeed = buildRandomSeed();

    try {
      const prompt = buildGenerationPrompt(resumeText, roleContext, randomSeed);
      const rawText = await generateWithRetry(prompt);
      const parsed = parseJsonObject(rawText);
      const normalized = normalizeGeneratedTest(parsed, resumeText, roleContext, randomSeed);

      setTestData(normalized);
      setReviewDraft(toReviewDraft(normalized));
      setAnswers(initializeAnswers(normalized));
      setActiveQuestionIndex(0);
      setRemainingSeconds(normalized.examMeta.durationMinutes * 60);
      setStage("extraction-review");
      setIsTimerRunning(false);
      setSaveNotice("Extraction ready. Review and approve to start the locked exam.");
      setTimeout(() => setSaveNotice(""), 2600);
    } catch {
      const fallback = buildFallbackTest(resumeText, roleContext, randomSeed);
      setTestData(fallback);
      setReviewDraft(toReviewDraft(fallback));
      setAnswers(initializeAnswers(fallback));
      setActiveQuestionIndex(0);
      setRemainingSeconds(fallback.examMeta.durationMinutes * 60);
      setStage("extraction-review");
      setIsTimerRunning(false);
      setError("AI output format varied. A fallback variable round was generated successfully.");
    } finally {
      setGeneratingTest(false);
    }
  };

  const finalizeReviewedExtractionAndLock = () => {
    if (!testData || !reviewDraft) return;

    const merged = mergeReviewDraftIntoTestData(testData, reviewDraft);

    try {
      const attemptId = generateExamAttemptId();
      saveExamSession({
        attemptId,
        mode: examMode,
        resumeText,
        roleContext,
        testData: merged,
        createdAt: Date.now(),
      });

      setLaunchingExam(true);
      router.push(`/resume-verifier/exam?attempt=${encodeURIComponent(attemptId)}`);
    } catch {
      setLaunchingExam(false);
      setError("Could not open exam session. Please try final approval again.");
    }
  };

  const updateAnswer = (questionId: string, updater: (prev: AnswerState) => AnswerState) => {
    setAnswers((prev) => {
      const current = prev[questionId] || defaultAnswerState();
      return {
        ...prev,
        [questionId]: updater(current),
      };
    });
  };

  const progressCards = testData ? (
    <Card className="border-glass-border/80 bg-surface-1/95">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Round Progress</h3>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-glass-border bg-surface-2/70 p-3">
            <div className="text-[11px] text-muted-foreground">Answered</div>
            <div className="text-lg font-semibold mt-1">{answeredCount}/{totalQuestions}</div>
          </div>
          <div className="rounded-lg border border-glass-border bg-surface-2/70 p-3">
            <div className="text-[11px] text-muted-foreground">Coverage</div>
            <div className="text-lg font-semibold mt-1">{completionPercent}%</div>
          </div>
          <div className="rounded-lg border border-glass-border bg-surface-2/70 p-3">
            <div className="text-[11px] text-muted-foreground">Time Left</div>
            <div className={`text-lg font-semibold mt-1 ${remainingSeconds < 180 ? "text-danger" : ""}`}>
              {formatTime(remainingSeconds)}
            </div>
          </div>
        </div>

        <div className="h-2 rounded-full bg-surface-4 overflow-hidden">
          <div className="h-full bg-linear-to-r from-primary to-cyan-500 transition-all duration-500" style={{ width: `${completionPercent}%` }} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant={testData.candidateBand === "experienced" ? "warning" : "success"} className="text-[10px]">
            {testData.candidateBand === "experienced" ? "Experienced Track" : "Fresher Track"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{testData.examMeta.durationMinutes} min</Badge>
          <Badge variant="outline" className="text-[10px]">Seed: {testData.examMeta.randomSeed.slice(-6)}</Badge>
        </div>
      </CardContent>
    </Card>
  ) : null;

  const questionPalette = testData && stage !== "locked-exam" ? (
    <Card className="border-glass-border/80 bg-surface-1/95">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CircleHelp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Question Navigator</h3>
        </div>

        <div className="grid grid-cols-6 gap-2">
          {testData.questions.map((question, index) => {
            const answered = isQuestionAnswered(question, answers[question.id]);
            const isActive = index === activeQuestionIndex;

            return (
              <button
                key={question.id}
                onClick={() => setActiveQuestionIndex(index)}
                className={`h-8 rounded-md border text-[11px] font-medium transition-colors ${
                  isActive
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : answered
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-glass-border bg-surface-2/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  ) : null;

  const extractionReviewPanel = stage === "extraction-review" && testData && reviewDraft ? (
    <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_20px_45px_var(--shadow-heavy)]">
      <CardContent className="p-6 space-y-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Pre-Exam Verification Gate</p>
          <h3 className="text-lg font-semibold mt-1">Review extracted profile before locked exam</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Edit any extracted field if needed, then click Final Approve to start the one-attempt locked round.
          </p>
        </div>

        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-warning">Locked exam policy</p>
          <p>1. Exam starts only after Final Approve.</p>
          <p>2. First tab switch triggers warning, second tab switch disqualifies.</p>
          <p>3. Copy, paste, context menu, and common shortcuts are blocked during locked mode.</p>
          <p>4. Screenshot blocking is not technically enforceable in web browsers; policy still prohibits it.</p>
          <p>5. Questions are one-way: next remains blocked until current question is answered.</p>
        </div>

        <div className="rounded-xl border border-glass-border bg-surface-2/70 p-3 space-y-2">
          <p className="text-xs font-semibold">Exam Mode</p>
          <p className="text-[11px] text-muted-foreground">
            Official mode requires camera permission before exam start. Practice mode allows exam without camera.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setExamMode("official")}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                examMode === "official"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-glass-border bg-surface-1 text-muted-foreground hover:text-foreground"
              }`}
            >
              Official (Camera Required)
            </button>
            <button
              onClick={() => setExamMode("practice")}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                examMode === "practice"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-glass-border bg-surface-1 text-muted-foreground hover:text-foreground"
              }`}
            >
              Practice (Camera Optional)
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium">Candidate Summary</label>
          <Textarea
            className="min-h-[120px] resize-y bg-surface-2/70 border-glass-border"
            value={reviewDraft.candidateSummary}
            onChange={(event) => {
              setReviewDraft((prev) => (prev
                ? { ...prev, candidateSummary: event.target.value }
                : prev));
            }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium">Skills (one per line)</label>
            <Textarea
              className="min-h-[130px] resize-y bg-surface-2/70 border-glass-border"
              value={reviewDraft.skills}
              onChange={(event) => {
                setReviewDraft((prev) => (prev
                  ? { ...prev, skills: event.target.value }
                  : prev));
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Tools (one per line)</label>
            <Textarea
              className="min-h-[130px] resize-y bg-surface-2/70 border-glass-border"
              value={reviewDraft.tools}
              onChange={(event) => {
                setReviewDraft((prev) => (prev
                  ? { ...prev, tools: event.target.value }
                  : prev));
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Projects (one per line)</label>
            <Textarea
              className="min-h-[130px] resize-y bg-surface-2/70 border-glass-border"
              value={reviewDraft.projects}
              onChange={(event) => {
                setReviewDraft((prev) => (prev
                  ? { ...prev, projects: event.target.value }
                  : prev));
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">Highlights (one per line)</label>
            <Textarea
              className="min-h-[130px] resize-y bg-surface-2/70 border-glass-border"
              value={reviewDraft.highlights}
              onChange={(event) => {
                setReviewDraft((prev) => (prev
                  ? { ...prev, highlights: event.target.value }
                  : prev));
              }}
            />
          </div>
        </div>

        <div className="space-y-2 max-w-[220px]">
          <label className="text-xs font-medium">Experience Years</label>
          <Input
            type="number"
            min={0}
            max={40}
            step="0.1"
            className="bg-surface-2/70"
            value={String(reviewDraft.experienceYears)}
            onChange={(event) => {
              const next = Number(event.target.value);
              setReviewDraft((prev) => (prev
                ? { ...prev, experienceYears: Number.isFinite(next) ? Math.max(0, next) : 0 }
                : prev));
            }}
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={finalizeReviewedExtractionAndLock}
            disabled={evaluatingTest || generatingTest || launchingExam}
            variant="glow"
            className="gap-2 px-6 py-5 text-sm bg-linear-to-r from-indigo-500 to-sky-500 hover:from-indigo-600 hover:to-sky-600"
          >
            <ShieldCheck className="h-4 w-4" />
            {launchingExam ? "Opening Exam Interface..." : "Final Approve and Start Locked Exam"}
          </Button>
        </div>
      </CardContent>
    </Card>
  ) : null;

  const reportPanel = report ? (
    <div className="space-y-4">
      <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_20px_45px_var(--shadow-heavy)]">
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Verification Verdict</p>
              <h3 className="text-xl font-semibold mt-1">
                {report.overallScore >= 80
                  ? "Claims strongly defensible"
                  : report.overallScore >= 60
                    ? "Partially defensible, needs sharpening"
                    : "High claim-risk detected"}
              </h3>
            </div>
            <Badge variant={report.candidateBand === "experienced" ? "warning" : "success"} className="text-[10px] uppercase tracking-[0.14em]">
              {report.candidateBand === "experienced" ? "Experienced" : "Fresher"}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-end">
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <span className={`text-5xl font-bold leading-none ${
                  report.overallScore >= 80 ? "text-success" : report.overallScore >= 60 ? "text-warning" : "text-danger"
                }`}>{report.overallScore}</span>
                <span className="text-sm text-muted-foreground mb-1">/100</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-4 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    report.overallScore >= 80 ? "bg-success" : report.overallScore >= 60 ? "bg-warning" : "bg-danger"
                  }`}
                  style={{ width: `${report.overallScore}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{report.summary}</p>
            </div>

            <div className="grid gap-2 text-[10px]">
              <Badge variant="outline" className="justify-center">Q: {totalQuestions}</Badge>
              <Badge variant="outline" className="justify-center">Answered: {answeredCount}</Badge>
              <Badge variant="outline" className="justify-center">Mode: AI Verified</Badge>
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
            {report.sectionScores.map((section) => (
              <div key={section.name} className="rounded-xl border border-glass-border bg-surface-2/70 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{section.name}</span>
                  <span className={`text-xs font-bold ${
                    section.status === "good" ? "text-success" : section.status === "warning" ? "text-warning" : "text-danger"
                  }`}>{section.score}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-4 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      section.status === "good" ? "bg-success" : section.status === "warning" ? "bg-warning" : "bg-danger"
                    }`}
                    style={{ width: `${section.score}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{section.feedback}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-glass-border/80 bg-surface-1/95">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold">Strengths vs Weak Areas</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-success/20 bg-success/10 p-3">
              <h4 className="text-xs font-semibold text-success mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3" /> Verified Strengths
              </h4>
              <ul className="space-y-1">
                {report.strengths.length > 0
                  ? report.strengths.map((item, idx) => <li key={`strength-${idx}`} className="text-xs text-muted-foreground">- {item}</li>)
                  : <li className="text-xs text-muted-foreground">- No strong areas captured.</li>}
              </ul>
            </div>

            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3">
              <h4 className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" /> Weak Areas
              </h4>
              <ul className="space-y-1">
                {report.weakAreas.length > 0
                  ? report.weakAreas.map((item, idx) => <li key={`weak-${idx}`} className="text-xs text-muted-foreground">- {item}</li>)
                  : <li className="text-xs text-muted-foreground">- No major weak areas detected.</li>}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-glass-border bg-surface-2/70 p-3">
            <h4 className="text-xs font-semibold mb-2">Recommended Next Steps</h4>
            <ul className="space-y-1">
              {report.nextSteps.length > 0
                ? report.nextSteps.map((item, idx) => <li key={`step-${idx}`} className="text-xs text-muted-foreground">{idx + 1}. {item}</li>)
                : <li className="text-xs text-muted-foreground">No follow-up plan generated.</li>}
            </ul>
          </div>

          {report.integrityNotes.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-3">
              <h4 className="text-xs font-semibold text-warning mb-1">Integrity Notes</h4>
              <ul className="space-y-1">
                {report.integrityNotes.map((item, idx) => (
                  <li key={`integrity-${idx}`} className="text-xs text-muted-foreground">- {item}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  ) : null;

  const questionPanel = activeQuestion && testData && isLockedExamActive ? (
    <div ref={lockedExamScopeRef}>
      <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_20px_45px_var(--shadow-heavy)]">
      <CardContent className="p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">Question {activeQuestionIndex + 1} / {totalQuestions}</Badge>
              <Badge variant={activeQuestion.type === "coding" ? "warning" : "success"} className="text-[10px]">{QUESTION_TYPE_LABELS[activeQuestion.type]}</Badge>
              <Badge variant="outline" className="text-[10px]">{activeQuestion.difficulty}</Badge>
            </div>
            <h3 className="text-base font-semibold">{activeQuestion.prompt}</h3>
            <p className="text-xs text-muted-foreground">Section: {SECTION_LABELS[activeQuestion.section]} • Suggested time: {activeQuestion.timeHintMinutes} min</p>
          </div>
        </div>

        {activeQuestion.type === "mcq" && (
          <div className="grid gap-2">
            {activeQuestion.options.map((option, index) => {
              const selectedIndex = answers[activeQuestion.id]?.selectedOptionIndex ?? null;
              const selected = selectedIndex === index;

              return (
                <button
                  key={`${activeQuestion.id}-opt-${index}`}
                  onClick={() => {
                    updateAnswer(activeQuestion.id, (prev) => ({
                      ...prev,
                      selectedOptionIndex: index,
                      text: option,
                    }));
                  }}
                  className={`text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selected
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-glass-border bg-surface-2/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="font-medium mr-2">{String.fromCharCode(65 + index)}.</span>
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {(activeQuestion.type === "short" || activeQuestion.type === "project") && (
          <Textarea
            className="min-h-[220px] resize-y bg-surface-2/70 border-glass-border"
            placeholder={activeQuestion.type === "project"
              ? "Answer with your exact contribution, design decisions, constraints, and measurable impact..."
              : "Write your reasoning clearly and concisely..."}
            value={answers[activeQuestion.id]?.text || ""}
            onChange={(event) => {
              updateAnswer(activeQuestion.id, (prev) => ({
                ...prev,
                text: event.target.value,
              }));
            }}
          />
        )}

        {activeQuestion.type === "coding" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Language:</span>
              {LANGUAGE_OPTIONS.map((language) => {
                const selected = (answers[activeQuestion.id]?.codeLanguage || "javascript") === language;
                return (
                  <button
                    key={`${activeQuestion.id}-${language}`}
                    onClick={() => {
                      updateAnswer(activeQuestion.id, (prev) => ({
                        ...prev,
                        codeLanguage: language,
                      }));
                    }}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      selected
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-glass-border bg-surface-2/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {language}
                  </button>
                );
              })}
            </div>

            <CodeEditorPanel
              value={answers[activeQuestion.id]?.text || ""}
              onChange={(value) => {
                updateAnswer(activeQuestion.id, (prev) => ({
                  ...prev,
                  text: value,
                }));
              }}
            />

            <p className="text-[11px] text-muted-foreground">
              AI checks your code in context of this exact question for correctness, reasoning depth, and implementation quality.
            </p>
          </div>
        )}

        {activeQuestion.expectedFocus.length > 0 && (
          <div className="rounded-lg border border-glass-border bg-surface-2/70 p-3">
            <div className="text-[11px] font-semibold mb-1">What this question verifies</div>
            <div className="flex flex-wrap gap-1.5">
              {activeQuestion.expectedFocus.map((focus) => (
                <Badge key={`${activeQuestion.id}-${focus}`} variant="outline" className="text-[10px]">{focus}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (isLockedExamActive) return;
              setActiveQuestionIndex((prev) => Math.max(0, prev - 1));
            }}
            disabled={activeQuestionIndex === 0 || isLockedExamActive}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              if (isLockedExamActive && !canAdvanceInLockedMode) {
                setWarningNotice("Answer the current question before moving to the next one.");
                setTimeout(() => setWarningNotice(""), 2200);
                return;
              }
              setActiveQuestionIndex((prev) => Math.min(totalQuestions - 1, prev + 1));
            }}
            disabled={isLockedExamActive ? !canAdvanceInLockedMode : activeQuestionIndex >= totalQuestions - 1}
            className="gap-1"
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
      </Card>
    </div>
  ) : null;

  const emptyAssessment = !testData ? (
    <Card className="border-glass-border/80 bg-surface-1/95 min-h-[420px] flex items-center justify-center">
      <CardContent className="p-6 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl border border-glass-border bg-surface-2 flex items-center justify-center mb-4">
          <ShieldCheck className="h-7 w-7 opacity-30" />
        </div>
        <h3 className="text-lg font-semibold">Verification arena is ready</h3>
        <p className="text-xs text-muted-foreground mt-2 max-w-[280px] mx-auto leading-relaxed">
          Upload or paste your resume, then generate a variable interview-style verification round with coding, MCQ, and project defense questions.
        </p>
      </CardContent>
    </Card>
  ) : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="relative max-w-[1520px] mx-auto pb-3">
      <PageHeader
        icon={ShieldCheck}
        title="Resume Verifier"
        subtitle="Variable interview-style claim validation with coding, MCQ, and project defense rounds"
        gradient="from-indigo-500 to-sky-500"
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {warningNotice && (
        <div className="bg-warning/10 border border-warning/30 text-warning rounded-xl px-4 py-3 mb-6 text-sm">
          {warningNotice}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="space-y-5 min-w-0">
          <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
            <CardContent className="p-6 space-y-5">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary">01</div>
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Upload className="h-4.5 w-4.5 text-primary" /> Resume Intake
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">Upload resume file or paste text. AI will extract and validate skills, projects, and experience claims.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => resumeFileInputRef.current?.click()}
                  disabled={extractingResume || isLockedExamActive}
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
                      disabled={isLockedExamActive}
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
                className="min-h-[220px] resize-none bg-surface-2/70 border-glass-border"
                placeholder="Paste your complete resume text here, or upload a PDF/DOCX above..."
                value={resumeText}
                disabled={isLockedExamActive}
                onChange={(event) => {
                  if (testData || report || stage !== "upload") {
                    resetRound();
                  }
                  setResumeText(normalizeResumeText(event.target.value));
                  setResumeSourceType("paste");
                  setResumeFileName(null);
                  if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
                  setReport(null);
                }}
              />

              <div className="text-[11px] text-muted-foreground">Resume source: {sourceLabel(resumeSourceType)}</div>
            </CardContent>
          </Card>

          <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_14px_34px_var(--shadow-heavy)]">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary">02</div>
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" /> Role Context (Optional)
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">Add target role or job context so the verifier asks role-aligned interview questions.</p>
                </div>
              </div>

              <Input
                placeholder="e.g., SDE Intern, Backend Engineer, Data Analyst"
                value={roleContext}
                disabled={isLockedExamActive}
                onChange={(event) => setRoleContext(event.target.value)}
                className="bg-surface-2/70"
              />

              <div className="rounded-lg border border-glass-border bg-surface-2/70 p-3 text-[11px] text-muted-foreground leading-relaxed">
                Each round is variable by design. Questions are mixed across coding, MCQ, project deep-dive, and experience validation.
              </div>
            </CardContent>
          </Card>

          {progressCards}
          {questionPalette}

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
                      <div className="h-8 w-8 rounded-lg bg-linear-to-br from-indigo-500 to-sky-500 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="text-sm font-semibold">
                        {report ? "Verification Complete" : testData ? "Resume Verification In Progress" : "Launch Resume Verifier"}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{workflowSummary}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {resumeText && <Badge variant="outline" className="text-[10px]">Resume Ready</Badge>}
                      {roleContext.trim() && <Badge variant="outline" className="text-[10px]">Role Context Linked</Badge>}
                      {testData && !report && <Badge variant="warning" className="text-[10px]">Live Round</Badge>}
                      {report && <Badge variant="success" className="text-[10px]">Scored</Badge>}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full md:w-auto">
                    {stage !== "locked-exam" && (
                      <Button
                        onClick={handleSaveProgress}
                        variant="outline"
                        className="gap-2 px-4 py-5 text-sm w-full sm:w-auto"
                        title="Save current progress locally"
                      >
                        <Save className="h-4 w-4" /> Save Progress
                      </Button>
                    )}

                    {stage === "locked-exam" && !report ? (
                      <Button
                        onClick={() => void evaluateSubmission("manual")}
                        disabled={evaluatingTest || generatingTest || isDisqualified}
                        variant="glow"
                        className="gap-2 px-7 py-5 text-sm bg-linear-to-r from-indigo-500 to-sky-500 hover:from-indigo-600 hover:to-sky-600 w-full sm:w-auto"
                      >
                        {evaluatingTest ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</>
                        ) : (
                          <><ClipboardCheck className="h-4 w-4" /> Submit For Verification</>
                        )}
                      </Button>
                    ) : stage === "extraction-review" ? (
                      <Button
                        onClick={finalizeReviewedExtractionAndLock}
                        disabled={generatingTest || evaluatingTest}
                        variant="glow"
                        className="gap-2 px-7 py-5 text-sm bg-linear-to-r from-indigo-500 to-sky-500 hover:from-indigo-600 hover:to-sky-600 w-full sm:w-auto"
                      >
                        <ShieldCheck className="h-4 w-4" /> Final Approve and Start Locked Exam
                      </Button>
                    ) : (
                      <Button
                        onClick={() => void generateVerificationRound()}
                        disabled={generatingTest || extractingResume || isLockedExamActive}
                        variant="glow"
                        className="gap-2 px-7 py-5 text-sm bg-linear-to-r from-indigo-500 to-sky-500 hover:from-indigo-600 hover:to-sky-600 w-full sm:w-auto"
                      >
                        {generatingTest ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                        ) : (
                          <><Play className="h-4 w-4" /> {report ? "Generate New Variable Round" : "Generate Verification Round"}</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1 scrollbar-thin">
          {reportPanel || extractionReviewPanel || questionPanel || emptyAssessment}

          {isLockedExamActive && (
            <Card className="border-glass-border/80 bg-surface-1/95">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Locked Round Controls</h3>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  This attempt is locked. Pause, reset, save, and backward navigation are disabled.
                  Timer auto-submits at 00:00.
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Tab switch policy: first switch warns, second switch disqualifies.
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Detected tab switches in this locked attempt: {tabSwitchCount}
                </p>
              </CardContent>
            </Card>
          )}

          {report && (
            <Card className="border-glass-border/80 bg-surface-1/95">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Question-Level Insights</h3>
                </div>

                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {testData?.questions.map((question, index) => {
                    const evaluation = report.questionEvaluations.find((item) => item.questionId === question.id);
                    const score = evaluation?.score ?? 0;
                    return (
                      <div key={`insight-${question.id}`} className="rounded-lg border border-glass-border bg-surface-2/70 p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium truncate">Q{index + 1} • {QUESTION_TYPE_LABELS[question.type]}</div>
                          <div className={`text-xs font-bold ${score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-danger"}`}>{score}%</div>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{evaluation?.feedback || "No granular feedback returned."}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </motion.div>
  );
}

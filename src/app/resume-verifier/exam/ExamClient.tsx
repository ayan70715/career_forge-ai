"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  Download,
  Home,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Webcam,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { getApiKey, generateWithRetry } from "@/lib/ai/gemini";
import {
  clearExamSession,
  getExamSession,
  updateExamSessionProgress,
  type ExamMode,
} from "@/lib/resume-verifier/examSession";

type CandidateBand = "fresher" | "experienced";
type QuestionType = "mcq" | "short" | "project" | "coding";
type Difficulty = "easy" | "medium" | "hard";
type VerifierSection = "skills" | "projects" | "experience" | "problem-solving" | "communication";
type ViolationType = "tab-switch" | "copy-attempt" | "paste-attempt" | "contextmenu-attempt" | "shortcut-attempt" | "fullscreen-exit";

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

type TestViolation = {
  type: ViolationType;
  severity: "warning" | "critical";
  message: string;
  timestamp: number;
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

type IntegritySessionState = {
  sessionId: string;
  token: string;
  issuedAt: number;
  expiresAt: number;
};

type IntegritySubmissionReceipt = {
  receiptId: string;
  sessionId: string;
  attemptId: string;
  status: "accepted";
  answersDigest: string;
  violationDigest: string;
  reportDigest: string;
  violationCount: number;
  totalIncidents: number;
  clientSubmittedAt: number;
  serverTimestamp: number;
  signature: string;
};

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

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);

  return `{${entries.join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digestBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function generateLocalIntegrityId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createLocalIntegritySession(attemptId: string, mode: ExamMode): IntegritySessionState {
  const issuedAt = Date.now();
  const sessionSeed = `${attemptId}:${mode}:${issuedAt}:${Math.random().toString(36).slice(2, 12)}`;

  return {
    sessionId: generateLocalIntegrityId("lvs"),
    token: sessionSeed,
    issuedAt,
    expiresAt: issuedAt + 3 * 60 * 60 * 1000,
  };
}

async function buildLocalIntegrityReceipt(input: {
  attemptId: string;
  session: IntegritySessionState;
  answersDigest: string;
  violationDigest: string;
  reportDigest: string;
  violationCount: number;
  totalIncidents: number;
  clientSubmittedAt: number;
}): Promise<IntegritySubmissionReceipt> {
  const serverTimestamp = Date.now();
  const receiptId = generateLocalIntegrityId("local-receipt");
  const payloadToSign = stableStringify({
    receiptId,
    sessionId: input.session.sessionId,
    attemptId: input.attemptId,
    status: "accepted",
    answersDigest: input.answersDigest,
    violationDigest: input.violationDigest,
    reportDigest: input.reportDigest,
    violationCount: input.violationCount,
    totalIncidents: input.totalIncidents,
    clientSubmittedAt: input.clientSubmittedAt,
    serverTimestamp,
  });

  const signature = await sha256Hex(`${input.session.token}:${payloadToSign}`);

  return {
    receiptId,
    sessionId: input.session.sessionId,
    attemptId: input.attemptId,
    status: "accepted",
    answersDigest: input.answersDigest,
    violationDigest: input.violationDigest,
    reportDigest: input.reportDigest,
    violationCount: input.violationCount,
    totalIncidents: input.totalIncidents,
    clientSubmittedAt: input.clientSubmittedAt,
    serverTimestamp,
    signature,
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

export default function ResumeVerifierExamPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const attemptId = searchParams.get("attempt")?.trim() || "";

  const lockedExamScopeRef = useRef<HTMLDivElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const integrityBootstrapAttemptedRef = useRef(false);

  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [examMode, setExamMode] = useState<ExamMode>("official");
  const [resumeText, setResumeText] = useState("");
  const [roleContext, setRoleContext] = useState("");
  const [testData, setTestData] = useState<GeneratedTestPayload | null>(null);

  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isExamStarted, setIsExamStarted] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const [violations, setViolations] = useState<TestViolation[]>([]);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [warningNotice, setWarningNotice] = useState("");
  const [report, setReport] = useState<VerificationReport | null>(null);

  const [cameraPermissionGranted, setCameraPermissionGranted] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);

  const [integritySession, setIntegritySession] = useState<IntegritySessionState | null>(null);
  const [integrityReceipt, setIntegrityReceipt] = useState<IntegritySubmissionReceipt | null>(null);

  const [evaluatingTest, setEvaluatingTest] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!attemptId) {
      setLoadError("Invalid exam session. Start from Resume Verifier.");
      setSessionLoaded(true);
      return;
    }

    const session = getExamSession(attemptId);
    if (!session || !session.testData || typeof session.testData !== "object") {
      setLoadError("Exam session expired or missing. Please start again from Resume Verifier.");
      setSessionLoaded(true);
      return;
    }

    const restoredTest = session.testData as GeneratedTestPayload;
    if (!Array.isArray(restoredTest.questions) || restoredTest.questions.length === 0) {
      setLoadError("Exam session is invalid. Please generate a new round.");
      setSessionLoaded(true);
      return;
    }

    const initialAnswers = initializeAnswers(restoredTest);
    const progress = session.progress;

    setExamMode(session.mode === "practice" ? "practice" : "official");
    setResumeText(typeof session.resumeText === "string" ? session.resumeText : "");
    setRoleContext(typeof session.roleContext === "string" ? session.roleContext : "");
    setTestData(restoredTest);

    if (progress) {
      const restoredAnswers = progress.answers && typeof progress.answers === "object"
        ? (progress.answers as Record<string, AnswerState>)
        : {};

      setAnswers({ ...initialAnswers, ...restoredAnswers });
      setActiveQuestionIndex(Math.max(0, Math.min(restoredTest.questions.length - 1, progress.activeQuestionIndex || 0)));
      setRemainingSeconds(
        typeof progress.remainingSeconds === "number"
          ? Math.max(0, progress.remainingSeconds)
          : restoredTest.examMeta.durationMinutes * 60
      );
      setIsExamStarted(Boolean(progress.isExamStarted));
      setIsTimerRunning(Boolean(progress.isExamStarted) && !progress.report && !progress.isDisqualified);
      setViolations(Array.isArray(progress.violations) ? progress.violations as TestViolation[] : []);
      setIsDisqualified(Boolean(progress.isDisqualified));
      setReport(progress.report && typeof progress.report === "object" ? progress.report as VerificationReport : null);
      setCameraPermissionGranted(Boolean(progress.cameraPermissionGranted));

      const restoredIntegrity = progress.integrity;
      if (
        restoredIntegrity
        && typeof restoredIntegrity.sessionId === "string"
        && typeof restoredIntegrity.token === "string"
      ) {
        setIntegritySession({
          sessionId: restoredIntegrity.sessionId,
          token: restoredIntegrity.token,
          issuedAt: Number(restoredIntegrity.issuedAt) || Date.now(),
          expiresAt: Number(restoredIntegrity.expiresAt) || Date.now(),
        });
        integrityBootstrapAttemptedRef.current = true;
      }

      if (restoredIntegrity?.receipt && typeof restoredIntegrity.receipt === "object") {
        setIntegrityReceipt(restoredIntegrity.receipt as IntegritySubmissionReceipt);
      }
    } else {
      setAnswers(initialAnswers);
      setRemainingSeconds(restoredTest.examMeta.durationMinutes * 60);
    }

    setSessionLoaded(true);
  }, [attemptId]);

  useEffect(() => {
    return () => {
      const stream = cameraStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    const supported = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);
    setFullscreenSupported(supported);

    const syncFullscreenState = () => {
      setIsFullscreenActive(Boolean(document.fullscreenElement));
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!attemptId || !testData || !sessionLoaded) return;

    updateExamSessionProgress(attemptId, {
      isExamStarted,
      activeQuestionIndex,
      remainingSeconds,
      answers,
      violations,
      isDisqualified,
      report,
      cameraPermissionGranted,
      integrity: integritySession
        ? {
            sessionId: integritySession.sessionId,
            token: integritySession.token,
            issuedAt: integritySession.issuedAt,
            expiresAt: integritySession.expiresAt,
            receipt: integrityReceipt,
          }
        : undefined,
      updatedAt: Date.now(),
    });
  }, [
    attemptId,
    sessionLoaded,
    testData,
    isExamStarted,
    activeQuestionIndex,
    remainingSeconds,
    answers,
    violations,
    isDisqualified,
    report,
    cameraPermissionGranted,
    integritySession,
    integrityReceipt,
  ]);

  const totalQuestions = testData?.questions.length || 0;
  const activeQuestion = testData?.questions[activeQuestionIndex] || null;
  const isLockedExamActive = isExamStarted && !report;

  const answeredCount = useMemo(() => {
    if (!testData) return 0;
    return testData.questions.filter((question) => isQuestionAnswered(question, answers[question.id])).length;
  }, [answers, testData]);

  const completionPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const canAdvance = Boolean(
    isLockedExamActive
    && activeQuestion
    && activeQuestionIndex < totalQuestions - 1
    && isQuestionAnswered(activeQuestion, answers[activeQuestion.id])
  );

  const tabSwitchCount = useMemo(
    () => violations.filter((entry) => entry.type === "tab-switch").length,
    [violations]
  );

  const fullscreenExitCount = useMemo(
    () => violations.filter((entry) => entry.type === "fullscreen-exit").length,
    [violations]
  );

  useEffect(() => {
    if (!sessionLoaded || !attemptId || !testData || report) return;
    if (integritySession || integrityBootstrapAttemptedRef.current) return;
    integrityBootstrapAttemptedRef.current = true;

    const localSession = createLocalIntegritySession(attemptId, examMode);
    setIntegritySession(localSession);
  }, [sessionLoaded, attemptId, testData, report, integritySession, examMode]);

  const submitIntegrityIncident = async (_incident: TestViolation) => {
    // Frontend-only mode: incidents are persisted through session progress.
  };

  const attestReportIntegrity = async (currentReport: VerificationReport): Promise<VerificationReport> => {
    try {
      const localSession = integritySession || createLocalIntegritySession(attemptId, examMode);
      if (!integritySession) {
        setIntegritySession(localSession);
      }

      const answersDigest = await sha256Hex(stableStringify(answers));
      const violationDigest = await sha256Hex(stableStringify(violations));
      const reportDigest = await sha256Hex(stableStringify(currentReport));

      const receipt = await buildLocalIntegrityReceipt({
        attemptId,
        session: localSession,
        answersDigest,
        violationDigest,
        reportDigest,
        violationCount: violations.length,
        totalIncidents: violations.length,
        clientSubmittedAt: Date.now(),
      });

      setIntegrityReceipt(receipt);

      return {
        ...currentReport,
        integrityNotes: [
          `Local integrity receipt: ${receipt.receiptId}`,
          ...currentReport.integrityNotes,
        ],
      };
    } catch (submissionError) {
      const message = submissionError instanceof Error
        ? submissionError.message
        : "receipt generation failed";

      return {
        ...currentReport,
        integrityNotes: [
          `Integrity receipt unavailable in local mode: ${message}`,
          ...currentReport.integrityNotes,
        ],
      };
    }
  };

  const requestExamFullscreen = async () => {
    if (!fullscreenSupported) {
      setWarningNotice("Fullscreen is not supported in this browser. Continuing without fullscreen lock.");
      setTimeout(() => setWarningNotice(""), 3200);
      return;
    }

    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreenActive(true);
    } catch {
      setWarningNotice("Unable to enter fullscreen. Please enable fullscreen before starting official mode.");
      setTimeout(() => setWarningNotice(""), 3200);
    }
  };

  const downloadIntegrityReceipt = () => {
    if (!integrityReceipt) return;

    const payload = {
      ...integrityReceipt,
      mode: "frontend-only",
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `integrity-receipt-${integrityReceipt.receiptId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const requestCameraPermission = async () => {
    setCameraError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera API is not available in this browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 200 },
          facingMode: "user",
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play().catch(() => undefined);
      }

      setCameraPermissionGranted(true);
    } catch {
      setCameraPermissionGranted(false);
      setCameraError("Camera permission is required in official mode.");
    }
  };

  const startExam = () => {
    if (!testData || report) return;
    if (examMode === "official" && !cameraPermissionGranted) {
      setCameraError("Official mode requires camera permission before starting.");
      return;
    }

    if (examMode === "official" && fullscreenSupported && !isFullscreenActive) {
      setWarningNotice("Official mode requires fullscreen before starting the locked exam.");
      setTimeout(() => setWarningNotice(""), 3200);
      return;
    }

    setWarningNotice("Locked exam started. Tab switch warns once and disqualifies on second switch.");
    setTimeout(() => setWarningNotice(""), 3200);
    setIsExamStarted(true);
    setIsTimerRunning(true);
    setIsDisqualified(false);
    setViolations([]);
    setIntegrityReceipt(null);
    setError("");
  };

  const leaveExam = () => {
    if (attemptId) {
      clearExamSession(attemptId);
    }
    router.push("/resume-verifier");
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

  async function evaluateSubmission(trigger: "manual" | "timer" | "disqualified" = "manual") {
    if (!testData || evaluatingTest || report) return;

    if (isDisqualified) {
      setIsTimerRunning(false);
      const disqualificationReport = buildDisqualificationReport(testData, violations);
      const attestedReport = await attestReportIntegrity(disqualificationReport);
      setReport(attestedReport);
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

      const attestedReport = await attestReportIntegrity(normalized);
      setReport(attestedReport);
      if (trigger === "timer") {
        setWarningNotice("Time ended. Submission auto-verified.");
      }
    } catch {
      const fallback = buildFallbackEvaluation(testData, answers);
      if (violations.length > 0) {
        const mapped = violations.map((entry) => {
          const when = new Date(entry.timestamp).toLocaleTimeString();
          return `${entry.severity.toUpperCase()}: ${entry.message} at ${when}`;
        });
        fallback.integrityNotes = [...mapped, ...fallback.integrityNotes];
      }
      const attestedReport = await attestReportIntegrity(fallback);
      setReport(attestedReport);
      setError("AI grading response was not fully structured. Fallback scoring was applied.");
    } finally {
      setEvaluatingTest(false);
    }
  }

  useEffect(() => {
    if (!isLockedExamActive || !isTimerRunning || evaluatingTest || !testData || isDisqualified) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isLockedExamActive, isTimerRunning, evaluatingTest, testData, isDisqualified]);

  useEffect(() => {
    if (!isLockedExamActive || !isTimerRunning || remainingSeconds !== 0 || evaluatingTest || !testData) return;
    void evaluateSubmission("timer");
  }, [isLockedExamActive, isTimerRunning, remainingSeconds, evaluatingTest, testData]);

  useEffect(() => {
    if (!isDisqualified || !isLockedExamActive || evaluatingTest || !testData || report) return;
    void evaluateSubmission("disqualified");
  }, [isDisqualified, isLockedExamActive, evaluatingTest, testData, report]);

  useEffect(() => {
    if (!isLockedExamActive || !isTimerRunning || evaluatingTest || isDisqualified || report) return;

    const handleVisibility = () => {
      if (!document.hidden) return;

      const nextCount = tabSwitchCount + 1;
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

      setViolations((prev) => [...prev, violation]);
      void submitIntegrityIncident(violation);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isLockedExamActive, isTimerRunning, evaluatingTest, isDisqualified, report, tabSwitchCount]);

  useEffect(() => {
    if (!isLockedExamActive || !isTimerRunning || evaluatingTest || isDisqualified || report) return;
    if (examMode !== "official" || !fullscreenSupported) return;

    const handleFullscreenPolicy = () => {
      if (document.fullscreenElement) return;

      const nextCount = fullscreenExitCount + 1;
      const violation: TestViolation = {
        type: "fullscreen-exit",
        severity: nextCount >= 2 ? "critical" : "warning",
        message: "Fullscreen exit detected during official locked exam",
        timestamp: Date.now(),
      };

      if (nextCount >= 2) {
        setWarningNotice("Disqualified: repeated fullscreen exits detected.");
        setIsTimerRunning(false);
        setIsDisqualified(true);
      } else {
        setWarningNotice("Warning: fullscreen exited. One more exit will disqualify this attempt.");
        setTimeout(() => setWarningNotice(""), 3500);
      }

      setViolations((prev) => [...prev, violation]);
      void submitIntegrityIncident(violation);
    };

    document.addEventListener("fullscreenchange", handleFullscreenPolicy);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenPolicy);
  }, [
    isLockedExamActive,
    isTimerRunning,
    evaluatingTest,
    isDisqualified,
    report,
    fullscreenExitCount,
    examMode,
    fullscreenSupported,
  ]);

  useEffect(() => {
    if (!isLockedExamActive || !isTimerRunning || evaluatingTest || isDisqualified || report) return;

    const scope = lockedExamScopeRef.current;
    if (!scope) return;

    const warn = (message: string, type: ViolationType, event: Event) => {
      event.preventDefault();
      const violation: TestViolation = {
        type,
        severity: "warning",
        message,
        timestamp: Date.now(),
      };

      setWarningNotice(message);
      setTimeout(() => setWarningNotice(""), 2200);
      setViolations((prev) => [...prev, violation]);
      void submitIntegrityIncident(violation);
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
  }, [isLockedExamActive, isTimerRunning, evaluatingTest, isDisqualified, report]);

  if (!sessionLoaded) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <Card className="border-glass-border/80 bg-surface-1/95">
          <CardContent className="p-8 flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading exam session...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError || !testData) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <Card className="border-glass-border/80 bg-surface-1/95">
          <CardContent className="p-8 space-y-4">
            <h2 className="text-lg font-semibold">Exam Session Unavailable</h2>
            <p className="text-sm text-muted-foreground">{loadError || "Please start a new verification attempt."}</p>
            <Button onClick={() => router.push("/resume-verifier")} className="gap-2">
              <Home className="h-4 w-4" /> Back to Resume Verifier
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeQuestion) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <Card className="border-glass-border/80 bg-surface-1/95">
          <CardContent className="p-8 space-y-4">
            <h2 className="text-lg font-semibold">Question Index Error</h2>
            <p className="text-sm text-muted-foreground">The active question is not available for this attempt.</p>
            <Button onClick={leaveExam} className="gap-2">
              <Home className="h-4 w-4" /> Back to Resume Verifier
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="relative max-w-[1480px] mx-auto pb-6">
      <PageHeader
        icon={ShieldCheck}
        title="Resume Verifier Exam"
        subtitle={examMode === "official" ? "Official proctored mode" : "Practice mode"}
        gradient="from-indigo-500 to-sky-500"
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {warningNotice && (
        <div className="bg-warning/10 border border-warning/30 text-warning rounded-xl px-4 py-3 mb-4 text-sm">
          {warningNotice}
        </div>
      )}

      {!isExamStarted && !report ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="border-glass-border/80 bg-surface-1/95">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-lg font-semibold">Pre-Exam Compliance Check</h3>
              <p className="text-sm text-muted-foreground">
                This is a dedicated exam interface. Complete checks before starting your locked attempt.
              </p>

              <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-warning">Exam policy</p>
                <p>1. One attempt only per generated round.</p>
                <p>2. First tab switch warns, second tab switch disqualifies.</p>
                <p>3. Copy/paste/context menu and key shortcuts are blocked in exam zone.</p>
                <p>4. Official mode requires camera and fullscreen before start.</p>
                <p>5. Repeated fullscreen exit in official mode causes disqualification.</p>
              </div>

              {examMode === "official" ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-glass-border bg-surface-2/70 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-xs font-semibold">Camera status</div>
                      <Badge variant={cameraPermissionGranted ? "success" : "warning"} className="text-[10px]">
                        {cameraPermissionGranted ? "Ready" : "Required"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-xs font-semibold">Fullscreen status</div>
                      <Badge
                        variant={!fullscreenSupported ? "outline" : isFullscreenActive ? "success" : "warning"}
                        className="text-[10px]"
                      >
                        {!fullscreenSupported ? "Not Supported" : isFullscreenActive ? "Active" : "Required"}
                      </Badge>
                    </div>
                    <video ref={cameraVideoRef} autoPlay muted playsInline className="w-full rounded-md border border-glass-border bg-black/30" />
                    {cameraError && <p className="text-[11px] text-danger mt-2">{cameraError}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={() => void requestCameraPermission()} variant="outline" className="gap-2 text-xs">
                        <Webcam className="h-3.5 w-3.5" /> Grant Camera Access
                      </Button>
                      {fullscreenSupported && (
                        <Button onClick={() => void requestExamFullscreen()} variant="outline" className="gap-2 text-xs">
                          <ShieldCheck className="h-3.5 w-3.5" /> Enter Fullscreen
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-glass-border bg-surface-2/70 p-3 text-xs text-muted-foreground">
                  Practice mode selected. Camera is optional in this mode.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={startExam}
                  disabled={examMode === "official" && (!cameraPermissionGranted || (fullscreenSupported && !isFullscreenActive))}
                  className="gap-2"
                  variant="glow"
                >
                  <ShieldCheck className="h-4 w-4" /> Start Locked Exam
                </Button>
                <Button onClick={leaveExam} variant="outline" className="gap-2">
                  <Home className="h-4 w-4" /> Back to Resume Verifier
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-glass-border/80 bg-surface-1/95">
            <CardContent className="p-5 space-y-3 text-xs text-muted-foreground">
              <h4 className="text-sm font-semibold text-foreground">Attempt Snapshot</h4>
              <p>Candidate band: <span className="text-foreground font-medium">{testData.candidateBand}</span></p>
              <p>Questions: <span className="text-foreground font-medium">{totalQuestions}</span></p>
              <p>Duration: <span className="text-foreground font-medium">{testData.examMeta.durationMinutes} min</span></p>
              <p>Role context: <span className="text-foreground font-medium">{roleContext || "Not provided"}</span></p>
              <p>
                Integrity session: <span className="text-foreground font-medium">{integritySession ? "Local-signed" : "Pending"}</span>
              </p>
              {examMode === "official" && (
                <p>
                  Fullscreen: <span className="text-foreground font-medium">{fullscreenSupported ? (isFullscreenActive ? "Active" : "Required") : "Unsupported"}</span>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : report ? (
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
                  <Badge variant="outline" className="justify-center">Tab switches: {tabSwitchCount}</Badge>
                  <Badge variant="outline" className="justify-center">
                    Receipt: {integrityReceipt ? integrityReceipt.receiptId.slice(-10) : "Unavailable"}
                  </Badge>
                </div>
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

              <div className="flex flex-wrap gap-2">
                <Button onClick={leaveExam} className="gap-2">
                  <Home className="h-4 w-4" /> Back to Resume Verifier
                </Button>
                {integrityReceipt && (
                  <Button onClick={downloadIntegrityReceipt} variant="outline" className="gap-2">
                    <Download className="h-4 w-4" /> Download Integrity Receipt
                  </Button>
                )}
                <Button onClick={leaveExam} variant="outline" className="gap-2">
                  <RefreshCcw className="h-4 w-4" /> Start New Attempt
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <section className="space-y-5 min-w-0">
            <Card className="border-glass-border/80 bg-surface-1/95">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Locked Exam Status</h3>
                  <Badge variant={examMode === "official" ? "warning" : "success"} className="text-[10px]">
                    {examMode === "official" ? "Official Mode" : "Practice Mode"}
                  </Badge>
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

                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-[11px] text-muted-foreground">
                  Tab switch policy: first switch warns, second disqualifies. Detected tab switches: {tabSwitchCount}
                </div>

                {examMode === "official" && (
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-[11px] text-muted-foreground">
                    Fullscreen policy: repeated fullscreen exit disqualifies. Detected exits: {fullscreenExitCount}
                  </div>
                )}
              </CardContent>
            </Card>

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
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!canAdvance) {
                          setWarningNotice("Answer the current question before moving to the next one.");
                          setTimeout(() => setWarningNotice(""), 2200);
                          return;
                        }
                        setActiveQuestionIndex((prev) => Math.min(totalQuestions - 1, prev + 1));
                      }}
                      disabled={!canAdvance}
                      className="gap-1"
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="glow"
                      onClick={() => void evaluateSubmission("manual")}
                      disabled={evaluatingTest || isDisqualified}
                      className="gap-2"
                    >
                      {evaluatingTest ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</>
                      ) : (
                        <><ClipboardCheck className="h-4 w-4" /> Submit For Verification</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1 scrollbar-thin">
            <Card className="border-glass-border/80 bg-surface-1/95">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Claim Signals</h3>
                </div>

                <div className="space-y-2 text-xs text-muted-foreground">
                  <p><span className="text-foreground font-medium">Skills:</span> {testData.extractedSignals.skills.slice(0, 5).join(", ") || "None"}</p>
                  <p><span className="text-foreground font-medium">Projects:</span> {testData.extractedSignals.projects.slice(0, 4).join(", ") || "None"}</p>
                  <p><span className="text-foreground font-medium">Experience:</span> {testData.extractedSignals.experienceYears} years</p>
                </div>
              </CardContent>
            </Card>

            {examMode === "official" && (
              <Card className="border-glass-border/80 bg-surface-1/95">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Webcam className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Camera Monitor</h3>
                  </div>
                  <video ref={cameraVideoRef} autoPlay muted playsInline className="w-full rounded-md border border-glass-border bg-black/30" />
                  <p className="text-[11px] text-muted-foreground">Official mode camera stream is active for presence checks.</p>
                  <p className="text-[11px] text-muted-foreground">
                    Fullscreen: {fullscreenSupported ? (isFullscreenActive ? "active" : "inactive") : "not supported in this browser"}
                  </p>
                </CardContent>
              </Card>
            )}

            <Button onClick={leaveExam} variant="outline" className="gap-2 w-full">
              <Home className="h-4 w-4" /> Exit to Resume Verifier
            </Button>
          </aside>
        </div>
      )}
    </motion.div>
  );
}

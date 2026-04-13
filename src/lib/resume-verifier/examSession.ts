export type ExamMode = "official" | "practice";

export type StoredExamSession = {
  attemptId: string;
  mode: ExamMode;
  resumeText: string;
  roleContext: string;
  testData: unknown;
  createdAt: number;
  progress?: {
    isExamStarted: boolean;
    activeQuestionIndex: number;
    remainingSeconds: number;
    answers: Record<string, unknown>;
    violations: unknown[];
    isDisqualified: boolean;
    report: unknown | null;
    cameraPermissionGranted?: boolean;
    integrity?: {
      sessionId: string;
      token: string;
      issuedAt: number;
      expiresAt: number;
      receipt: unknown | null;
    };
    updatedAt: number;
  };
};

const EXAM_SESSION_PREFIX = "resume_verifier_exam_session_v1_";

export function generateExamAttemptId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function examSessionStorageKey(attemptId: string): string {
  return `${EXAM_SESSION_PREFIX}${attemptId}`;
}

export function saveExamSession(session: StoredExamSession): void {
  sessionStorage.setItem(examSessionStorageKey(session.attemptId), JSON.stringify(session));
}

export function getExamSession(attemptId: string): StoredExamSession | null {
  const raw = sessionStorage.getItem(examSessionStorageKey(attemptId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredExamSession;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.attemptId !== "string" || !parsed.attemptId.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function updateExamSessionProgress(
  attemptId: string,
  progress: StoredExamSession["progress"]
): void {
  const existing = getExamSession(attemptId);
  if (!existing) return;

  saveExamSession({
    ...existing,
    progress,
  });
}

export function clearExamSession(attemptId: string): void {
  sessionStorage.removeItem(examSessionStorageKey(attemptId));
}

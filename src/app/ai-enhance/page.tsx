"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  ArrowRight,
  Zap,
  Target,
  Rocket,
  Crown,
  Copy,
  CheckCircle,
  Download,
  Upload,
  Save,
  X,
  FileText,
} from "lucide-react";
import { getApiKey, generateWithRetry } from "@/lib/ai/gemini";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  extractTextFromSupportedResumeFile,
  getSupportedResumeFileType,
  MAX_RESUME_FILE_SIZE_BYTES,
  type SupportedResumeFileType,
} from "@/lib/resume/textExtraction";

type DetectedSection = {
  section: string;
  content: string;
};

type EnhancedSection = {
  section: string;
  original: string;
  polished: string;
  changesMade: string[];
};

type StructuredEnhancementResult = {
  summary: string;
  sections: EnhancedSection[];
};

type SectionViewMode = "diff" | "split";

type DiffLineType = "context" | "add" | "remove";

type DiffLine = {
  type: DiffLineType;
  text: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
};

type DiffHunk = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
};

type DiffComputationResult = {
  status: "ok" | "unchanged" | "too-large" | "empty";
  hunks: DiffHunk[];
  added: number;
  removed: number;
};

type AIEnhanceDraft = {
  resumeText: string;
  targetRole: string;
  selectedLevel: string;
  inputType: SupportedResumeFileType | "paste";
  uploadedFileName: string | null;
  savedAt: number;
};

const SECTION_DETECTION_MAP: Array<{ section: string; keywords: string[] }> = [
  { section: "Summary", keywords: ["summary", "profile", "professional summary", "objective", "about"] },
  { section: "Experience", keywords: ["experience", "work experience", "employment", "professional experience", "internship"] },
  { section: "Education", keywords: ["education", "academics", "academic background", "qualification"] },
  { section: "Skills", keywords: ["skills", "technical skills", "core skills", "competencies", "skill set"] },
  { section: "Projects", keywords: ["projects", "key projects", "project experience"] },
  { section: "Certifications", keywords: ["certification", "certifications", "licenses"] },
  { section: "Awards", keywords: ["awards", "achievements", "honors"] },
  { section: "Publications", keywords: ["publications", "research", "papers"] },
  { section: "Leadership", keywords: ["leadership", "positions of responsibility", "activities", "extra curricular", "extracurricular"] },
  { section: "Contact", keywords: ["contact", "contact details", "personal details"] },
];

const FILE_SIZE_LIMIT_MB = Math.round(MAX_RESUME_FILE_SIZE_BYTES / (1024 * 1024));
const DIFF_CONTEXT_LINES = 1;
const MAX_DIFF_SECTION_LINES = 800;
const AI_ENHANCE_DRAFT_STORAGE_KEY = "ai_enhance_draft_v1";

const enhancementLevels = [
  {
    id: "basic",
    label: "Basic Polish",
    icon: Zap,
    color: "from-blue-500 to-cyan-500",
    description: "Grammar and clarity polish while preserving the original structure.",
    prompt: `You are an expert resume editor. Polish this resume with BASIC improvements:
- Fix all grammar, spelling, and punctuation errors
- Improve sentence structure and clarity
- Ensure consistent tense usage
- Fix any awkward phrasing
- Keep the same order, line structure, and bullet layout

Keep the same content and layout. Output the improved resume text.`,
  },
  {
    id: "intermediate",
    label: "Professional Upgrade",
    icon: Target,
    color: "from-amber-500 to-orange-500",
    description: "Stronger action verbs and ATS keywords without changing layout.",
    prompt: `You are a professional resume writer. Enhance this resume at an INTERMEDIATE level:
- Replace weak verbs with powerful action verbs (Led, Architected, Spearheaded, etc.)
- Add quantified achievements only when clearly supported by the source text
- Optimize for ATS with industry-standard keywords
- Make each point impactful and specific
- Ensure professional tone throughout
- Keep the exact section order and do not change bullet count or overall layout

Maintain the person's actual experience but present it more compellingly in-place. Output the improved resume text.`,
  },
  {
    id: "advanced",
    label: "Executive Polish",
    icon: Rocket,
    color: "from-purple-500 to-pink-500",
    description: "Executive-level language polish while preserving original structure.",
    prompt: `You are an elite executive resume strategist. Perform an ADVANCED polish of this resume:
- Use executive-level language and strategic positioning
- Strengthen bullets with measurable outcomes only when grounded in source text
- Optimize keyword density for ATS systems
- Ensure every bullet demonstrates value and business impact
- Keep section order, headings, bullet count, and overall layout unchanged

This should read like a resume that would get callbacks from top companies, without reformatting layout. Output the improved resume text.`,
  },
  {
    id: "targeted",
    label: "Role-Targeted",
    icon: Crown,
    color: "from-emerald-500 to-teal-500",
    description: "Tailor wording for a target role while preserving existing layout.",
    prompt: `You are an expert career strategist. Perform a TARGETED enhancement of this resume for the specified role:
- Mirror the language and keywords from the job requirements
- Highlight transferable skills that match the role
- Adjust phrasing within each existing section for this specific position
- Add industry-specific terminology
- Make it clear why this person is a perfect fit for this role
- Keep section order, bullet count, and overall layout unchanged

Output the enhanced resume text optimized for the target role without reformatting.`,
  },
];

function normalizeHeading(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 64) return false;
  if (/^[-*•\d]/.test(trimmed)) return false;
  if (/[.!?]$/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/);
  if (words.length > 8) return false;

  const alphaOnly = trimmed.replace(/[^A-Za-z]/g, "");
  const uppercaseChars = alphaOnly.replace(/[^A-Z]/g, "").length;
  const uppercaseRatio = alphaOnly.length > 0 ? uppercaseChars / alphaOnly.length : 0;

  const hasColonSuffix = /[:\-]$/.test(trimmed);
  const titleCaseLike = words.every((word) => {
    const cleaned = word.replace(/[^A-Za-z0-9&/+.-]/g, "");
    if (!cleaned) return true;
    const lower = cleaned.toLowerCase();
    if (lower === "and" || lower === "or" || lower === "of") return true;
    return /^[A-Z0-9][A-Za-z0-9&/+.-]*$/.test(cleaned);
  });

  return hasColonSuffix || uppercaseRatio >= 0.65 || titleCaseLike;
}

function mapHeadingToSection(line: string): string | null {
  if (!isLikelyHeadingLine(line)) return null;

  const normalized = normalizeHeading(line.replace(/[:\-]+$/, ""));
  if (!normalized) return null;

  for (const entry of SECTION_DETECTION_MAP) {
    const matches = entry.keywords.some((keyword) => {
      const normalizedKeyword = normalizeHeading(keyword);
      return normalized === normalizedKeyword || normalized.includes(normalizedKeyword);
    });

    if (matches) {
      return entry.section;
    }
  }

  return null;
}

function detectResumeSections(resumeText: string): DetectedSection[] {
  const cleanedText = resumeText.replace(/\r/g, "").trim();
  if (!cleanedText) return [];

  const lines = cleanedText.split("\n");
  const parsedSections: DetectedSection[] = [];
  let currentSection = "Summary";
  let currentLines: string[] = [];
  let detectedHeadingCount = 0;

  const pushSection = () => {
    const content = currentLines.join("\n").trim();
    if (!content) return;
    parsedSections.push({ section: currentSection, content });
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const detected = mapHeadingToSection(line);

    if (detected) {
      detectedHeadingCount += 1;
      pushSection();
      currentSection = detected;
      currentLines = [];
      continue;
    }

    currentLines.push(rawLine);
  }

  pushSection();

  if (detectedHeadingCount === 0 || parsedSections.length === 0) {
    return [{ section: "Resume", content: cleanedText }];
  }

  const mergedContent = new Map<string, string[]>();
  const order: string[] = [];

  for (const section of parsedSections) {
    if (!mergedContent.has(section.section)) {
      mergedContent.set(section.section, []);
      order.push(section.section);
    }
    mergedContent.get(section.section)!.push(section.content);
  }

  return order.map((sectionName) => ({
    section: sectionName,
    content: mergedContent.get(sectionName)!.join("\n\n").trim(),
  }));
}

function cleanAiText(rawText: string): string {
  return rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

function extractJsonPayload(rawText: string): string {
  const cleaned = cleanAiText(rawText);
  if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
    return cleaned;
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }

  return cleaned;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function parseStructuredEnhancement(rawText: string, detectedSections: DetectedSection[]): StructuredEnhancementResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(rawText));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const payload = parsed as {
    summary?: unknown;
    sections?: unknown;
  };

  if (!Array.isArray(payload.sections)) {
    return null;
  }

  const originalBySection = new Map<string, string>(
    detectedSections.map((entry) => [entry.section.toLowerCase(), entry.content])
  );

  const sectionRows = payload.sections
    .map((rawSection) => {
      if (!rawSection || typeof rawSection !== "object") return null;

      const typedSection = rawSection as {
        section?: unknown;
        original?: unknown;
        polished?: unknown;
        changesMade?: unknown;
      };

      const sectionName = String(typedSection.section || "").trim();
      const polished = String(typedSection.polished || "").trim();

      if (!sectionName || !polished) return null;

      const knownOriginal = originalBySection.get(sectionName.toLowerCase()) || "";
      const original = String(typedSection.original || knownOriginal).trim() || knownOriginal;
      const changesMade = toStringArray(typedSection.changesMade);

      return {
        section: sectionName,
        original,
        polished,
        changesMade,
      } satisfies EnhancedSection;
    })
    .filter((section): section is EnhancedSection => section !== null);

  if (sectionRows.length === 0) {
    return null;
  }

  return {
    summary: typeof payload.summary === "string" ? payload.summary.trim() : "",
    sections: sectionRows,
  };
}

function buildSectionExport(summary: string, sections: EnhancedSection[]): string {
  const blocks: string[] = [];

  if (summary) {
    blocks.push(`OVERVIEW\n${summary.trim()}`);
  }

  for (const section of sections) {
    const sectionBlock: string[] = [];
    sectionBlock.push(`SECTION: ${section.section}`);
    sectionBlock.push("ORIGINAL:");
    sectionBlock.push(section.original.trim() || "(No source text)");
    sectionBlock.push("");
    sectionBlock.push("POLISHED:");
    sectionBlock.push(section.polished.trim());

    if (section.changesMade.length > 0) {
      sectionBlock.push("");
      sectionBlock.push("CHANGES MADE:");
      section.changesMade.forEach((change) => {
        sectionBlock.push(`- ${change}`);
      });
    }

    blocks.push(sectionBlock.join("\n"));
  }

  return blocks.join("\n\n==============================\n\n");
}

function sourceLabel(type: SupportedResumeFileType | "paste"): string {
  if (type === "pdf") return "PDF";
  if (type === "docx") return "DOCX";
  if (type === "text") return "Text File";
  return "Pasted Text";
}

function buildSectionKey(sectionName: string, index: number): string {
  return `${index}-${sectionName.toLowerCase().replace(/\s+/g, "-")}`;
}

function normalizeLayoutForComparison(input: string): string {
  return input.replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
}

function splitDiffUnits(input: string): string[] {
  const normalized = input.replace(/\r\n?/g, "\n");
  const lineUnits = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lineUnits.length > 2) {
    return lineUnits;
  }

  const compressed = normalizeLayoutForComparison(input);
  if (!compressed) return [];

  const sentenceUnits = compressed
    .split(/(?<=[.!?])\s+|(?<=:)\s+(?=[A-Z0-9])/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentenceUnits.length > lineUnits.length) {
    return sentenceUnits;
  }

  return lineUnits.length > 0 ? lineUnits : [compressed];
}

function buildRawDiffLines(original: string[], polished: string[]): DiffLine[] {
  const originalComparable = original.map((line) => line.trimEnd());
  const polishedComparable = polished.map((line) => line.trimEnd());

  const n = original.length;
  const m = polished.length;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (originalComparable[i] === polishedComparable[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diffLines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldLine = 1;
  let newLine = 1;

  while (i < n && j < m) {
    if (originalComparable[i] === polishedComparable[j]) {
      diffLines.push({
        type: "context",
        text: original[i],
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      i += 1;
      j += 1;
      oldLine += 1;
      newLine += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      diffLines.push({
        type: "remove",
        text: original[i],
        oldLineNumber: oldLine,
        newLineNumber: null,
      });
      i += 1;
      oldLine += 1;
    } else {
      diffLines.push({
        type: "add",
        text: polished[j],
        oldLineNumber: null,
        newLineNumber: newLine,
      });
      j += 1;
      newLine += 1;
    }
  }

  while (i < n) {
    diffLines.push({
      type: "remove",
      text: original[i],
      oldLineNumber: oldLine,
      newLineNumber: null,
    });
    i += 1;
    oldLine += 1;
  }

  while (j < m) {
    diffLines.push({
      type: "add",
      text: polished[j],
      oldLineNumber: null,
      newLineNumber: newLine,
    });
    j += 1;
    newLine += 1;
  }

  return diffLines;
}

function mergeRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = merged[merged.length - 1];

    if (current.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
}

function firstDefinedLineNumber(lines: DiffLine[], key: "oldLineNumber" | "newLineNumber"): number {
  const found = lines.find((line) => line[key] !== null)?.[key];
  return found ?? 0;
}

function countDefinedLineNumbers(lines: DiffLine[], key: "oldLineNumber" | "newLineNumber"): number {
  return lines.reduce((count, line) => count + (line[key] !== null ? 1 : 0), 0);
}

function computeSectionDiff(originalText: string, polishedText: string): DiffComputationResult {
  const originalComparable = normalizeLayoutForComparison(originalText);
  const polishedComparable = normalizeLayoutForComparison(polishedText);

  if (!originalComparable && !polishedComparable) {
    return { status: "empty", hunks: [], added: 0, removed: 0 };
  }

  if (originalComparable === polishedComparable) {
    return { status: "unchanged", hunks: [], added: 0, removed: 0 };
  }

  const originalLines = splitDiffUnits(originalText);
  const polishedLines = splitDiffUnits(polishedText);

  if (originalLines.length === 0 && polishedLines.length === 0) {
    return { status: "empty", hunks: [], added: 0, removed: 0 };
  }

  if (originalLines.length > MAX_DIFF_SECTION_LINES || polishedLines.length > MAX_DIFF_SECTION_LINES) {
    return { status: "too-large", hunks: [], added: 0, removed: 0 };
  }

  const rawDiffLines = buildRawDiffLines(originalLines, polishedLines);
  const changedIndexes = rawDiffLines
    .map((line, index) => (line.type === "context" ? -1 : index))
    .filter((index) => index >= 0);

  if (changedIndexes.length === 0) {
    return { status: "unchanged", hunks: [], added: 0, removed: 0 };
  }

  const ranges = changedIndexes.map((index) => ({
    start: Math.max(0, index - DIFF_CONTEXT_LINES),
    end: Math.min(rawDiffLines.length - 1, index + DIFF_CONTEXT_LINES),
  }));

  const hunks = mergeRanges(ranges).map((range) => {
    const lines = rawDiffLines.slice(range.start, range.end + 1);

    return {
      oldStart: firstDefinedLineNumber(lines, "oldLineNumber"),
      oldCount: countDefinedLineNumbers(lines, "oldLineNumber"),
      newStart: firstDefinedLineNumber(lines, "newLineNumber"),
      newCount: countDefinedLineNumbers(lines, "newLineNumber"),
      lines,
    } satisfies DiffHunk;
  });

  return {
    status: "ok",
    hunks,
    added: rawDiffLines.filter((line) => line.type === "add").length,
    removed: rawDiffLines.filter((line) => line.type === "remove").length,
  };
}

export default function AIEnhancePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resumeText, setResumeText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("basic");
  const [resultSummary, setResultSummary] = useState("");
  const [enhancedSections, setEnhancedSections] = useState<EnhancedSection[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [inputType, setInputType] = useState<SupportedResumeFileType | "paste">("paste");
  const [extractingFile, setExtractingFile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [sectionViewModes, setSectionViewModes] = useState<Record<string, SectionViewMode>>({});
  const [saveNotice, setSaveNotice] = useState("");

  const detectedSections = useMemo(() => detectResumeSections(resumeText), [resumeText]);

  const sectionDiffs = useMemo(() => {
    const diffMap: Record<string, DiffComputationResult> = {};
    enhancedSections.forEach((section, index) => {
      diffMap[buildSectionKey(section.section, index)] = computeSectionDiff(section.original, section.polished);
    });
    return diffMap;
  }, [enhancedSections]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AI_ENHANCE_DRAFT_STORAGE_KEY);
      if (!raw) return;

      const draft = JSON.parse(raw) as Partial<AIEnhanceDraft>;

      if (typeof draft.resumeText === "string") {
        setResumeText(draft.resumeText);
      }

      if (typeof draft.targetRole === "string") {
        setTargetRole(draft.targetRole);
      }

      if (
        typeof draft.selectedLevel === "string"
        && enhancementLevels.some((level) => level.id === draft.selectedLevel)
      ) {
        setSelectedLevel(draft.selectedLevel);
      }

      if (
        draft.inputType === "paste"
        || draft.inputType === "pdf"
        || draft.inputType === "docx"
        || draft.inputType === "text"
      ) {
        setInputType(draft.inputType);
      }

      if (typeof draft.uploadedFileName === "string") {
        setUploadedFileName(draft.uploadedFileName);
      } else if (draft.uploadedFileName === null) {
        setUploadedFileName(null);
      }

      setSaveNotice("Progress restored from saved draft.");
      const timer = setTimeout(() => setSaveNotice(""), 2500);
      return () => clearTimeout(timer);
    } catch {
      // Ignore malformed local draft.
    }
  }, []);

  const initializeSectionViewModes = (sections: EnhancedSection[]) => {
    const initialModes: Record<string, SectionViewMode> = {};
    sections.forEach((section, index) => {
      initialModes[buildSectionKey(section.section, index)] = "diff";
    });
    setSectionViewModes(initialModes);
  };

  const resetOutput = () => {
    setResultSummary("");
    setEnhancedSections([]);
    setSectionViewModes({});
    setCopiedAll(false);
    setCopiedSection(null);
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setExtractingFile(true);

    if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
      setError(`File is too large. Please upload files up to ${FILE_SIZE_LIMIT_MB}MB.`);
      setExtractingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const supportedType = getSupportedResumeFileType(file);
    if (!supportedType) {
      if (file.name.toLowerCase().endsWith(".doc")) {
        setError("Legacy .doc files are not supported. Please save it as .docx and upload again.");
      } else {
        setError("Unsupported file type. Please upload PDF, DOCX, or text files.");
      }
      setExtractingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const extracted = await extractTextFromSupportedResumeFile(file);
      if (!extracted.text.trim()) {
        setError("Could not extract readable text from this file. If this is a scanned PDF, paste the text manually.");
        setUploadedFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setUploadedFileName(file.name);
      setInputType(extracted.type);
      setResumeText(extracted.text.trim());
      resetOutput();
    } catch {
      setError("Failed to read file. Please try another file or paste the text manually.");
      setUploadedFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setExtractingFile(false);
    }
  };

  const clearUploadedFile = () => {
    setUploadedFileName(null);
    setInputType("paste");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const enhance = async () => {
    const key = getApiKey();
    if (!key) {
      setError("Please configure your Gemini API key in Settings first.");
      return;
    }
    if (!resumeText.trim()) {
      setError("Please upload your resume file or paste your resume text first.");
      return;
    }
    if (selectedLevel === "targeted" && !targetRole.trim()) {
      setError("Please enter the target role for Role-Targeted enhancement.");
      return;
    }

    setLoading(true);
    setError("");
    resetOutput();

    try {
      const level = enhancementLevels.find((l) => l.id === selectedLevel)!;
      const sectionsPayload = detectedSections.length > 0
        ? detectedSections
        : [{ section: "Resume", content: resumeText.trim() }];

      const prompt = `You are an expert resume writer and editor.

ENHANCEMENT MODE:
${level.prompt}

TASK:
Polish each resume section independently and return structured output.

STRICT RULES:
- Keep facts truthful and do not invent employers, dates, skills, metrics, degrees, or achievements.
- Preserve the section names from input.
- Preserve section order, line flow, and bullet layout as much as possible.
- Do not add or remove sections, and do not reformat into a new layout/template.
- Keep polished content concise, ATS-friendly, and easy to copy.
- Return valid JSON only (no markdown code fences or additional prose).

${selectedLevel === "targeted" ? `TARGET ROLE: ${targetRole.trim()}\n` : ""}INPUT SECTIONS (JSON ARRAY):
${JSON.stringify(sectionsPayload, null, 2)}

Return exactly this JSON schema:
{
  "summary": "<2-3 sentence overview of improvements>",
  "sections": [
    {
      "section": "<same input section name>",
      "original": "<original section text>",
      "polished": "<polished section text>",
      "changesMade": ["<short bullet>", "<short bullet>"]
    }
  ]
}`;

      const raw = await generateWithRetry(prompt);
      const parsed = parseStructuredEnhancement(raw, sectionsPayload);

      if (parsed) {
        setResultSummary(parsed.summary);
        setEnhancedSections(parsed.sections);
        initializeSectionViewModes(parsed.sections);
      } else {
        const fallbackText = cleanAiText(raw);
        const fallbackSections = [
          {
            section: "Enhanced Resume",
            original: resumeText.trim(),
            polished: fallbackText,
            changesMade: ["AI returned plain text instead of strict JSON; showing full polished response."],
          },
        ] satisfies EnhancedSection[];
        setResultSummary("Structured parsing fallback applied.");
        setEnhancedSections(fallbackSections);
        initializeSectionViewModes(fallbackSections);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Enhancement failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const copySection = (section: EnhancedSection) => {
    navigator.clipboard.writeText(section.polished);
    setCopiedSection(section.section);
    setTimeout(() => setCopiedSection(null), 1800);
  };

  const copyAllResults = () => {
    const exportText = buildSectionExport(resultSummary, enhancedSections);
    navigator.clipboard.writeText(exportText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const downloadResult = () => {
    const exportText = buildSectionExport(resultSummary, enhancedSections);
    const blob = new Blob([exportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "enhanced_resume_by_section.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveProgress = () => {
    try {
      const draft: AIEnhanceDraft = {
        resumeText,
        targetRole,
        selectedLevel,
        inputType,
        uploadedFileName,
        savedAt: Date.now(),
      };

      localStorage.setItem(AI_ENHANCE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setSaveNotice("Progress saved locally. It will remain after refresh.");
    } catch {
      setSaveNotice("Could not save progress. Please try again.");
    } finally {
      setTimeout(() => setSaveNotice(""), 2500);
    }
  };

  const currentLevel = enhancementLevels.find((l) => l.id === selectedLevel)!;
  const wordCount = resumeText.split(/\s+/).filter(Boolean).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="max-w-360 mx-auto">
      <PageHeader
        icon={Sparkles}
        title="AI Resume Enhancer"
        subtitle="Multi-level AI improvements for your resume"
        gradient="from-amber-500 to-orange-600"
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Enhancement Level Ribbon */}
      <div className="flex gap-2 p-1.5 rounded-2xl bg-surface-1 border border-glass-border mb-6 overflow-x-auto">
        {enhancementLevels.map((level) => (
          <button
            key={level.id}
            onClick={() => setSelectedLevel(level.id)}
            className={`flex items-center gap-3 px-5 py-3 rounded-xl transition-all duration-300 whitespace-nowrap flex-1 min-w-0 ${
              selectedLevel === level.id
                ? "bg-primary/10 border border-primary/30 shadow-[0_0_20px_rgba(139,92,246,0.12)]"
                : "border border-transparent hover:bg-surface-2"
            }`}
          >
            <div className={`h-9 w-9 rounded-lg bg-linear-to-br ${level.color} flex items-center justify-center shrink-0 ${
              selectedLevel === level.id ? "shadow-lg" : ""
            }`}>
              <level.icon className="h-4 w-4 text-white" />
            </div>
            <div className="text-left min-w-0">
              <div className={`text-xs font-semibold truncate ${selectedLevel === level.id ? "text-foreground" : "text-muted-foreground"}`}>
                {level.label}
              </div>
              <div className="text-[10px] text-muted-foreground/60 truncate hidden sm:block">{level.description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Main Content: 3-column layout */}
      <div className="flex gap-6">
        {/* Left: Input Panel */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Active level description banner */}
          <div className="flex items-center gap-3 p-3 rounded-xl border border-glass-border bg-glass-bg">
            <div className={`h-8 w-8 rounded-lg bg-linear-to-br ${currentLevel.color} flex items-center justify-center shrink-0`}>
              <currentLevel.icon className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold">{currentLevel.label}</div>
              <div className="text-[10px] text-muted-foreground">{currentLevel.description}</div>
            </div>
          </div>

          {selectedLevel === "targeted" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Target Role</label>
              <Input
                placeholder="e.g., Senior Software Engineer at Google"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
              />
            </div>
          )}

          <Card className="flex flex-col flex-1">
            <CardContent className="p-5 flex flex-col flex-1">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Resume Input</span>
                </h2>
                <div className="flex items-center gap-2">
                  {resumeText && (
                    <span className="text-[10px] text-muted-foreground bg-surface-2 px-2 py-1 rounded-lg">
                      {wordCount} words
                    </span>
                  )}
                  {uploadedFileName && (
                    <span className="text-[10px] text-primary bg-primary/10 border border-primary/25 px-2 py-1 rounded-lg">
                      {sourceLabel(inputType)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={extractingFile}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-60"
                >
                  {extractingFile ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting...</>
                  ) : (
                    <><Upload className="h-3.5 w-3.5" /> Upload PDF or DOCX</>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.text,.md"
                  onChange={handleResumeUpload}
                  className="hidden"
                  title="Upload resume"
                />

                {uploadedFileName && (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success">
                    {uploadedFileName}
                    <button
                      onClick={clearUploadedFile}
                      className="text-danger/70 hover:text-danger"
                      title="Clear uploaded file"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}

                <span className="text-[10px] text-muted-foreground">
                  Supports PDF, DOCX, and text files up to {FILE_SIZE_LIMIT_MB}MB.
                </span>
              </div>

              <Textarea
                className="flex-1 resize-none min-h-100"
                placeholder={"Paste your entire resume text here, or upload a PDF/DOCX above...\n\nInclude all sections: summary, experience, education, skills, projects, etc."}
                value={resumeText}
                onChange={(e) => {
                  setResumeText(e.target.value);
                  setInputType("paste");
                  setUploadedFileName(null);
                  resetOutput();
                }}
              />

              {detectedSections.length > 0 && (
                <div className="mt-3 text-[11px] text-muted-foreground">
                  Auto-detected sections: {detectedSections.map((section) => section.section).join(", ")}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sticky enhance bar */}
          <div className="sticky bottom-4 z-20">
            {saveNotice && (
              <div className="mb-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                {saveNotice}
              </div>
            )}
            <div className="p-3 rounded-2xl border border-glass-border bg-sticky-bg backdrop-blur-xl shadow-[0_-8px_30px_var(--shadow-heavy)]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className={`h-8 w-8 rounded-lg bg-linear-to-br ${currentLevel.color} flex items-center justify-center shrink-0`}>
                    <currentLevel.icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{currentLevel.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {resumeText ? `${wordCount} words ready from ${sourceLabel(inputType)}` : "Upload or paste resume to begin"}
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleSaveProgress}
                  variant="outline"
                  className="gap-2 px-4 py-5 text-sm shrink-0"
                  title="Save current progress locally"
                >
                  <Save className="h-4 w-4" /> Save Progress
                </Button>
                <Button
                  onClick={enhance}
                  disabled={loading}
                  variant="glow"
                  className="gap-2 px-6 py-5 text-sm bg-linear-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shrink-0"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Enhancing...</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> Enhance <ArrowRight className="h-3.5 w-3.5" /></>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Output Section — Full Width Below Form */}
      {enhancedSections.length > 0 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-amber-500/40 to-transparent" />
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-lg bg-linear-to-br ${currentLevel.color} flex items-center justify-center`}>
                    <currentLevel.icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">Enhanced Result</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {currentLevel.label} enhancement applied across {enhancedSections.length} section{enhancedSections.length > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyAllResults} className="gap-1.5 text-xs">
                    {copiedAll ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedAll ? "Copied!" : "Copy All"}
                  </Button>
                  <Button size="sm" onClick={downloadResult} className="gap-1.5 text-xs">
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              </div>

              {resultSummary && (
                <div className="mb-4 rounded-lg border border-glass-border bg-glass-bg p-4">
                  <div className="text-xs font-semibold mb-1">Overview</div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{resultSummary}</p>
                </div>
              )}

              <div className="space-y-4 max-h-190 overflow-y-auto pr-1">
                {enhancedSections.map((section, index) => (
                  <div key={`${section.section}-${index}`} className="border border-glass-border rounded-xl bg-code-bg/60 p-4">
                    {(() => {
                      const sectionKey = buildSectionKey(section.section, index);
                      const activeView = sectionViewModes[sectionKey] ?? "diff";
                      const diffResult = sectionDiffs[sectionKey] ?? {
                        status: "empty",
                        hunks: [],
                        added: 0,
                        removed: 0,
                      } satisfies DiffComputationResult;
                      const showSplitView = activeView === "split" || diffResult.status !== "ok";

                      return (
                        <>
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <h4 className="text-sm font-semibold">{section.section}</h4>

                            <div className="flex items-center gap-2">
                              <div className="inline-flex items-center rounded-lg border border-glass-border bg-surface-1 p-1">
                                <button
                                  onClick={() => setSectionViewModes((prev) => ({ ...prev, [sectionKey]: "diff" }))}
                                  className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                                    activeView === "diff"
                                      ? "bg-primary/10 text-primary"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Diff View
                                </button>
                                <button
                                  onClick={() => setSectionViewModes((prev) => ({ ...prev, [sectionKey]: "split" }))}
                                  className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                                    activeView === "split"
                                      ? "bg-primary/10 text-primary"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Split View
                                </button>
                              </div>

                              <Button
                                size="sm"
                                variant="outline"
                                className="text-[11px] gap-1.5"
                                onClick={() => copySection(section)}
                              >
                                {copiedSection === section.section ? (
                                  <><CheckCircle className="h-3.5 w-3.5 text-success" /> Copied</>
                                ) : (
                                  <><Copy className="h-3.5 w-3.5" /> Copy Polished</>
                                )}
                              </Button>
                            </div>
                          </div>

                          {activeView === "diff" && diffResult.status === "ok" ? (
                            <div className="rounded-lg border border-glass-border bg-surface-1 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Inline Diff</div>
                                <div className="text-[11px] text-muted-foreground">
                                  <span className="text-success">+{diffResult.added}</span>
                                  <span className="mx-1">/</span>
                                  <span className="text-danger">-{diffResult.removed}</span>
                                </div>
                              </div>

                              <div className="space-y-2">
                                {diffResult.hunks.map((hunk, hunkIdx) => (
                                  <div key={`${sectionKey}-hunk-${hunkIdx}`} className="rounded-md border border-glass-border overflow-hidden">
                                    <div className="bg-surface-2 px-3 py-1.5 text-[11px] text-muted-foreground font-mono">
                                      @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
                                    </div>

                                    {hunk.lines.map((line, lineIdx) => {
                                      const rowStyle =
                                        line.type === "add"
                                          ? "bg-success/10"
                                          : line.type === "remove"
                                            ? "bg-danger/10"
                                            : "bg-surface-1";
                                      const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";

                                      return (
                                        <div
                                          key={`${sectionKey}-hunk-${hunkIdx}-line-${lineIdx}`}
                                          className={`grid grid-cols-[42px_42px_1fr] gap-2 px-2 py-1 text-[11px] font-mono ${rowStyle}`}
                                        >
                                          <span className="text-muted-foreground text-right select-none">{line.oldLineNumber ?? ""}</span>
                                          <span className="text-muted-foreground text-right select-none">{line.newLineNumber ?? ""}</span>
                                          <span className="whitespace-pre-wrap wrap-break-word leading-relaxed">{prefix}{line.text || " "}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {activeView === "diff" && diffResult.status === "unchanged" ? (
                            <div className="rounded-lg border border-glass-border bg-surface-1 p-3 text-xs text-muted-foreground">
                              No content changes detected for this section (layout-only differences are ignored).
                            </div>
                          ) : null}

                          {activeView === "diff" && diffResult.status === "too-large" ? (
                            <div className="rounded-lg border border-glass-border bg-surface-1 p-3 text-xs text-muted-foreground">
                              Diff view is unavailable for large sections. Showing split view instead.
                            </div>
                          ) : null}

                          {showSplitView ? (
                            <div className="grid gap-3 lg:grid-cols-2 mt-3">
                              <div className="rounded-lg border border-glass-border bg-surface-1 p-3">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Original</div>
                                <p className="text-xs whitespace-pre-wrap leading-relaxed">
                                  {section.original || "No original text captured."}
                                </p>
                              </div>

                              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                                <div className="text-[11px] uppercase tracking-wide text-primary mb-2">Polished</div>
                                <p className="text-xs whitespace-pre-wrap leading-relaxed">{section.polished}</p>
                              </div>
                            </div>
                          ) : null}

                          {section.changesMade.length > 0 && (
                            <div className="mt-3 rounded-lg border border-glass-border bg-surface-1 p-3">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Changes Made</div>
                              <ul className="space-y-1">
                                {section.changesMade.map((change, changeIdx) => (
                                  <li key={`${section.section}-change-${changeIdx}`} className="text-xs text-muted-foreground">
                                    - {change}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}
    </motion.div>
  );
}

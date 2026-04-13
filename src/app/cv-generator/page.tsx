"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mail,
  Loader2,
  Copy,
  CheckCircle,
  Download,
  FileText,
  GraduationCap,
  Briefcase,
  Upload,
  Save,
  X,
} from "lucide-react";
import { getApiKey, generateWithRetry } from "@/lib/ai/gemini";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  extractTextFromSupportedResumeFile,
  getSupportedResumeFileType,
  MAX_RESUME_FILE_SIZE_BYTES,
  type SupportedResumeFileType,
} from "@/lib/resume/textExtraction";
import type { CoverLetterDraftPayload, CoverLetterPdfPayload } from "@/lib/pdf/coverLetterHtmlTemplates";

type DocType = "cover-letter" | "academic-cv" | "email-intro";
type CVFormData = {
  name: string;
  targetRole: string;
  company: string;
  jobDescription: string;
  resumeText: string;
  additionalInfo: string;
};

type CVGeneratorDraft = {
  docType: DocType;
  formData: CVFormData;
  resumeSourceType: SupportedResumeFileType | "paste";
  jdSourceType: SupportedResumeFileType | "paste";
  resumeFileName: string | null;
  jdFileName: string | null;
  savedAt: number;
};

const docTypes: { id: DocType; label: string; icon: typeof Mail; description: string; color: string }[] = [
  {
    id: "cover-letter",
    label: "Cover Letter",
    icon: Mail,
    description: "Professional cover letter tailored to a specific job application",
    color: "from-cyan-500 to-blue-600",
  },
  {
    id: "academic-cv",
    label: "Academic CV",
    icon: GraduationCap,
    description: "Comprehensive academic curriculum vitae with research and publications",
    color: "from-violet-500 to-purple-600",
  },
  {
    id: "email-intro",
    label: "Networking Email",
    icon: Briefcase,
    description: "Professional networking or cold email introduction for job inquiries",
    color: "from-rose-500 to-pink-600",
  },
];

const FILE_SIZE_LIMIT_MB = Math.round(MAX_RESUME_FILE_SIZE_BYTES / (1024 * 1024));
const CV_GENERATOR_DRAFT_STORAGE_KEY = "cv_generator_draft_v1";

const defaultFormData: CVFormData = {
  name: "",
  targetRole: "",
  company: "",
  jobDescription: "",
  resumeText: "",
  additionalInfo: "",
};

function sourceLabel(type: SupportedResumeFileType | "paste"): string {
  if (type === "pdf") return "PDF";
  if (type === "docx") return "DOCX";
  if (type === "text") return "Text File";
  return "Pasted Text";
}

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:json|text|md|markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

function normalizeLine(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeParagraphs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeLine(entry)).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n{2,}/)
      .map((entry) => normalizeLine(entry))
      .filter(Boolean);
  }

  return [];
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

function buildCoverLetterPreview(draft: CoverLetterDraftPayload): string {
  const lines: string[] = [];

  if (draft.subjectLine.trim()) {
    lines.push(`Subject: ${draft.subjectLine.trim()}`, "");
  }

  lines.push(draft.salutation.trim() || "Dear Hiring Manager,", "");

  if (draft.openingParagraph.trim()) {
    lines.push(draft.openingParagraph.trim(), "");
  }

  draft.bodyParagraphs.forEach((paragraph) => {
    if (paragraph.trim()) {
      lines.push(paragraph.trim(), "");
    }
  });

  draft.achievementBullets.forEach((bullet) => {
    if (bullet.trim()) {
      lines.push(`- ${bullet.trim()}`);
    }
  });

  if (draft.achievementBullets.length > 0) {
    lines.push("");
  }

  if (draft.closingParagraph.trim()) {
    lines.push(draft.closingParagraph.trim(), "");
  }

  lines.push(draft.signOff.trim() || "Sincerely,");
  lines.push(draft.signatureName.trim());

  return lines.join("\n").trim();
}

function fallbackCoverLetterDraftFromText(text: string, formData: CVFormData): CoverLetterDraftPayload {
  const normalized = text.replace(/\r/g, "").trim();
  const chunks = normalized
    .split(/\n{2,}/)
    .map((chunk) => normalizeLine(chunk))
    .filter(Boolean);

  const opening = chunks[0]
    || `I am writing to express my interest in the ${formData.targetRole || "position"} role at ${formData.company || "your organization"}.`;
  const bodyParagraphs = chunks.slice(1, 3);
  const closing = chunks[chunks.length - 1] || "Thank you for your time and consideration. I would welcome the opportunity to discuss my fit for this role.";

  return {
    subjectLine: `${formData.targetRole || "Application"} Position`,
    salutation: "Dear Hiring Manager,",
    openingParagraph: opening,
    bodyParagraphs,
    achievementBullets: [],
    closingParagraph: closing,
    signOff: "Sincerely,",
    signatureName: formData.name.trim() || "Candidate",
  };
}

function normalizeCoverLetterDraft(raw: unknown, formData: CVFormData): CoverLetterDraftPayload {
  const payload = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const bodyParagraphs = normalizeParagraphs(payload.bodyParagraphs).slice(0, 2);
  const bullets = normalizeParagraphs(payload.achievementBullets)
    .map((entry) => entry.replace(/^[-*\u2022]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 2);

  const draft: CoverLetterDraftPayload = {
    subjectLine: normalizeLine(payload.subjectLine) || `${formData.targetRole || "Application"} Position`,
    salutation: normalizeLine(payload.salutation) || "Dear Hiring Manager,",
    openingParagraph: normalizeLine(payload.openingParagraph),
    bodyParagraphs,
    achievementBullets: bullets,
    closingParagraph: normalizeLine(payload.closingParagraph),
    signOff: normalizeLine(payload.signOff) || "Sincerely,",
    signatureName: normalizeLine(payload.signatureName) || formData.name.trim() || "Candidate",
  };

  if (!draft.openingParagraph && draft.bodyParagraphs.length === 0) {
    return fallbackCoverLetterDraftFromText("", formData);
  }

  if (!draft.openingParagraph && draft.bodyParagraphs.length > 0) {
    draft.openingParagraph = draft.bodyParagraphs[0];
    draft.bodyParagraphs = draft.bodyParagraphs.slice(1);
  }

  return draft;
}

function buildCoverLetterPdfPayload(formData: CVFormData, draft: CoverLetterDraftPayload): CoverLetterPdfPayload {
  return {
    form: {
      name: formData.name.trim() || "Candidate",
      targetRole: formData.targetRole.trim() || "Professional Role",
      company: formData.company.trim(),
      senderEmail: "",
      senderPhone: "",
      senderLocation: "",
      senderLinkedin: "",
      recipientName: "Hiring Manager",
      recipientTitle: "",
      recipientAddress: "",
      letterDate: new Date().toISOString().slice(0, 10),
    },
    draft,
  };
}

export default function CVGeneratorPage() {
  const resumeFileInputRef = useRef<HTMLInputElement>(null);
  const jdFileInputRef = useRef<HTMLInputElement>(null);

  const [docType, setDocType] = useState<DocType>("cover-letter");
  const [formData, setFormData] = useState<CVFormData>(defaultFormData);
  const [coverLetterDraft, setCoverLetterDraft] = useState<CoverLetterDraftPayload | null>(null);
  const [resumeSourceType, setResumeSourceType] = useState<SupportedResumeFileType | "paste">("paste");
  const [jdSourceType, setJdSourceType] = useState<SupportedResumeFileType | "paste">("paste");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [jdFileName, setJdFileName] = useState<string | null>(null);
  const [extractingResume, setExtractingResume] = useState(false);
  const [extractingJD, setExtractingJD] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [latexCode, setLatexCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showLatex, setShowLatex] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CV_GENERATOR_DRAFT_STORAGE_KEY);
      if (!raw) return;

      const draft = JSON.parse(raw) as Partial<CVGeneratorDraft>;

      if (draft.docType === "cover-letter" || draft.docType === "academic-cv" || draft.docType === "email-intro") {
        setDocType(draft.docType);
      }

      if (draft.formData && typeof draft.formData === "object") {
        const typedForm = draft.formData as Partial<CVFormData>;
        setFormData({
          name: typeof typedForm.name === "string" ? typedForm.name : defaultFormData.name,
          targetRole: typeof typedForm.targetRole === "string" ? typedForm.targetRole : defaultFormData.targetRole,
          company: typeof typedForm.company === "string" ? typedForm.company : defaultFormData.company,
          jobDescription: typeof typedForm.jobDescription === "string" ? typedForm.jobDescription : defaultFormData.jobDescription,
          resumeText: typeof typedForm.resumeText === "string" ? typedForm.resumeText : defaultFormData.resumeText,
          additionalInfo: typeof typedForm.additionalInfo === "string" ? typedForm.additionalInfo : defaultFormData.additionalInfo,
        });
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

      setSaveNotice("Progress restored from saved draft.");
      const timer = setTimeout(() => setSaveNotice(""), 2500);
      return () => clearTimeout(timer);
    } catch {
      // Ignore malformed local draft.
    }
  }, []);

  const update = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProgress = () => {
    try {
      const draft: CVGeneratorDraft = {
        docType,
        formData,
        resumeSourceType,
        jdSourceType,
        resumeFileName,
        jdFileName,
        savedAt: Date.now(),
      };

      localStorage.setItem(CV_GENERATOR_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setSaveNotice("Progress saved locally. It will remain after refresh.");
    } catch {
      setSaveNotice("Could not save progress. Please try again.");
    } finally {
      setTimeout(() => setSaveNotice(""), 2500);
    }
  };

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
        setError("Legacy .doc files are not supported. Please save the file as .docx and upload again.");
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
      setFormData((prev) => ({ ...prev, resumeText: extracted.text.trim() }));
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
        setError("Legacy .doc files are not supported. Please save the file as .docx and upload again.");
      } else {
        setError("Unsupported JD file type. Please upload PDF, DOCX, or text files.");
      }
      setExtractingJD(false);
      if (jdFileInputRef.current) jdFileInputRef.current.value = "";
      return;
    }

    try {
      const extracted = await extractTextFromSupportedResumeFile(file);
      if (!extracted.text.trim()) {
        setError("Could not extract readable text from the JD file. If this is a scanned PDF, paste text manually.");
        setJdFileName(null);
        if (jdFileInputRef.current) jdFileInputRef.current.value = "";
        return;
      }

      setJdFileName(file.name);
      setJdSourceType(extracted.type);
      setFormData((prev) => ({ ...prev, jobDescription: extracted.text.trim() }));
    } catch {
      setError("Failed to read job description file. Please try another file or paste text manually.");
      setJdFileName(null);
      if (jdFileInputRef.current) jdFileInputRef.current.value = "";
    } finally {
      setExtractingJD(false);
    }
  };

  const generate = async () => {
    const key = getApiKey();
    if (!key) {
      setError("Please configure your Gemini API key in Settings first.");
      return;
    }

    if (extractingResume || extractingJD) {
      setError("Please wait for file extraction to finish before generating.");
      return;
    }

    setLoading(true);
    setError("");
    setGeneratedText("");
    setLatexCode("");
    setCoverLetterDraft(null);

    try {
      let prompt = "";

      if (docType === "cover-letter") {
        prompt = `You are a professional career writer. Draft a REAL one-page cover letter (not a resume summary dump).

CRITICAL RULES:
- Keep total length between 220 and 320 words.
- Focus only on the top 2-3 most relevant qualifications for the target role.
- Do NOT list every skill, project, or resume section.
- Use concise, natural, professional business language.
- The result MUST fit on one page in a standard professional layout.
- Do not include placeholders like [Your Name].

Return ONLY valid JSON with this exact schema (no markdown, no code blocks):
{
  "subjectLine": "string",
  "salutation": "string",
  "openingParagraph": "string (45-75 words)",
  "bodyParagraphs": [
    "string (45-75 words)",
    "string (45-75 words)"
  ],
  "achievementBullets": ["string", "string"],
  "closingParagraph": "string (35-60 words)",
  "signOff": "string",
  "signatureName": "string"
}

Use at most 2 bullet points, each short and impact-focused.

APPLICATION DETAILS:
Applicant Name: ${formData.name || "Not provided"}
Target Role: ${formData.targetRole || "Not provided"}
Company: ${formData.company || "Not provided"}
${formData.jobDescription ? `Job Description:\n${formData.jobDescription}` : ""}
${formData.resumeText ? `Resume/Background:\n${formData.resumeText}` : ""}
${formData.additionalInfo ? `Additional Details:\n${formData.additionalInfo}` : ""}`;

        const response = await generateWithRetry(prompt);
        const cleaned = stripCodeFence(response);

        let draft: CoverLetterDraftPayload;
        try {
          const parsed = parseJsonObject(cleaned);
          draft = normalizeCoverLetterDraft(parsed, formData);
        } catch {
          draft = fallbackCoverLetterDraftFromText(cleaned, formData);
        }

        setCoverLetterDraft(draft);
        setGeneratedText(buildCoverLetterPreview(draft));
        setLatexCode("");
        setShowLatex(false);
        return;
      }

      if (docType === "academic-cv") {
        prompt = `Generate a comprehensive academic CV (curriculum vitae) for the following person. Academic CVs are longer than resumes and include research, publications, teaching, and academic service.

Name: ${formData.name || "Not provided"}
Field/Department: ${formData.targetRole || "Not provided"}
Institution: ${formData.company || "Not provided"}
${formData.resumeText ? `Background/Current CV:\n${formData.resumeText}` : ""}
${formData.additionalInfo ? `Additional Info:\n${formData.additionalInfo}` : ""}

Include sections for:
- Contact Information
- Education
- Research Interests
- Publications (if mentioned)
- Teaching Experience
- Awards & Fellowships
- Conference Presentations
- Professional Service
- Skills
- References

Output the CV text first.

Then output a separator line: ---LATEX---

Then output ONLY the complete LaTeX code (compilable with pdflatex). Do not wrap in code blocks.`;
      } else {
        prompt = `Write a professional networking/cold email for the following scenario. The email should be concise, professional, and create interest.

Sender Name: ${formData.name || "Not provided"}
Target Role/Interest: ${formData.targetRole || "Not provided"}
Target Company/Person: ${formData.company || "Not provided"}
${formData.resumeText ? `Background:\n${formData.resumeText}` : ""}
${formData.additionalInfo ? `Context:\n${formData.additionalInfo}` : ""}

Write a professional email that:
1. Has a compelling subject line
2. Brief, personal introduction
3. Clear value proposition
4. Specific ask or call to action
5. Professional sign-off

Keep it under 200 words.

Output the email text only (no LaTeX needed for emails).`;
      }

      const text = await generateWithRetry(prompt);

      if (text.includes("---LATEX---")) {
        const parts = text.split("---LATEX---");
        setGeneratedText(parts[0].trim());
        let latex = parts[1].trim();
        latex = latex.replace(/^```(?:latex|tex)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        setLatexCode(latex);
      } else {
        setGeneratedText(text);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const copyText = () => {
    navigator.clipboard.writeText(showLatex ? latexCode : generatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadText = () => {
    const content = showLatex ? latexCode : generatedText;
    const ext = showLatex ? "tex" : "txt";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docType}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async () => {
    setDownloadingPdf(true);
    setError("");

    if (docType === "cover-letter") {
      try {
        const draft = coverLetterDraft ?? fallbackCoverLetterDraftFromText(generatedText, formData);
        if (!draft.openingParagraph.trim() && draft.bodyParagraphs.length === 0) {
          throw new Error("Generate a cover letter first before downloading PDF.");
        }

        const payload = buildCoverLetterPdfPayload(formData, draft);
        const response = await fetch("/api/cover-letter-html-to-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Cover letter PDF export failed");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cover-letter.pdf";
        a.click();
        URL.revokeObjectURL(url);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Cover letter PDF download failed";
        setError(message);
      } finally {
        setDownloadingPdf(false);
      }
      return;
    }

    if (!latexCode) {
      setDownloadingPdf(false);
      return;
    }

    const isCompilerUnavailable = (message: string) => {
      const lower = message.toLowerCase();
      return (
        lower.includes("pdflatex") &&
        (lower.includes("not installed") || lower.includes("not in path") || lower.includes("compiler not found"))
      );
    };

    const attemptCompile = async (code: string): Promise<Blob> => {
      const response = await fetch("/api/latex-to-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: code }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "PDF conversion failed");
      }
      return response.blob();
    };

    try {
      let blob: Blob;
      try {
        blob = await attemptCompile(latexCode);
      } catch (firstErr: unknown) {
        const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);

        if (isCompilerUnavailable(errMsg)) {
          throw new Error(errMsg);
        }

        setError("Compilation failed — auto-fixing LaTeX code (attempt 1)...");

        try {
          const fixPrompt = `The following LaTeX code failed to compile with pdflatex. Fix ALL errors and return ONLY the corrected LaTeX code, nothing else. Do NOT wrap in markdown code blocks.

COMMON FIX RULES:
- If error mentions pgfutil or pgf internal macros: simplify ALL tikz code, wrap every \\clip in a scope environment, remove \\foreach loops
- If error mentions undefined control sequence: check package imports
- Always wrap \\clip inside \\begin{scope}...\\end{scope}

COMPILATION ERRORS:
${errMsg}

ORIGINAL LATEX CODE:
${latexCode}`;
          let fixedCode = await generateWithRetry(fixPrompt);
          fixedCode = fixedCode.replace(/^```(?:latex|tex)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
          setLatexCode(fixedCode);
          setError("");
          blob = await attemptCompile(fixedCode);
        } catch (fixErr: unknown) {
          const errMsg2 = fixErr instanceof Error ? fixErr.message : String(fixErr);
          setError("Auto-fix attempt 1 failed — trying aggressive simplification (attempt 2)...");

          try {
            const fixPrompt2 = `The following LaTeX STILL fails after a first fix attempt. Apply AGGRESSIVE fixes — return ONLY corrected LaTeX:
1. REMOVE all \\foreach loops
2. REMOVE all \\pgfmath* commands
3. Wrap every \\clip in \\begin{scope}...\\end{scope}
4. Replace complex tikz with simple \\colorbox or \\rule
5. If tikz is causing issues, remove decorative tikz entirely

ERRORS: ${errMsg2}

FAILING CODE:
${latexCode}`;
            let fixedCode2 = await generateWithRetry(fixPrompt2);
            fixedCode2 = fixedCode2.replace(/^```(?:latex|tex)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
            setLatexCode(fixedCode2);
            setError("");
            blob = await attemptCompile(fixedCode2);
          } catch (fixErr2: unknown) {
            const fixMsg = fixErr2 instanceof Error ? fixErr2.message : "PDF conversion failed after auto-fix";
            throw new Error(`Auto-fix failed after 2 attempts: ${fixMsg}`);
          }
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${docType}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "PDF download failed";
      setError(message);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const currentDocType = docTypes.find((d) => d.id === docType)!;
  const extractionStatus = extractingResume
    ? "Extracting resume file..."
    : extractingJD
      ? "Extracting job description file..."
      : null;
  const stickyDescription = extractionStatus
    ? extractionStatus
    : docType === "cover-letter"
      ? `Resume: ${sourceLabel(resumeSourceType)}${formData.jobDescription.trim() ? ` • JD: ${sourceLabel(jdSourceType)}` : ""}`
      : `Resume source: ${sourceLabel(resumeSourceType)}`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="max-w-[1440px] mx-auto">
      <PageHeader
        icon={Mail}
        title="CV & Cover Letter Generator"
        subtitle="Generate professional documents with AI"
        gradient="from-cyan-500 to-blue-600"
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Doc Type Selector — Horizontal Ribbon */}
      <div className="flex gap-2 p-1.5 rounded-2xl bg-surface-1 border border-glass-border mb-6">
        {docTypes.map((dt) => (
          <button
            key={dt.id}
            onClick={() => {
              setDocType(dt.id);
              setShowLatex(false);
            }}
            className={`flex items-center gap-3 px-5 py-3 rounded-xl transition-all duration-300 flex-1 ${
              docType === dt.id
                ? "bg-primary/10 border border-primary/30 shadow-[0_0_20px_rgba(139,92,246,0.12)]"
                : "border border-transparent hover:bg-surface-2"
            }`}
          >
            <div className={`h-9 w-9 rounded-lg bg-linear-to-br ${dt.color} flex items-center justify-center shrink-0 ${
              docType === dt.id ? "shadow-lg" : ""
            }`}>
              <dt.icon className="h-4 w-4 text-white" />
            </div>
            <div className="text-left min-w-0">
              <div className={`text-xs font-semibold ${docType === dt.id ? "text-foreground" : "text-muted-foreground"}`}>
                {dt.label}
              </div>
              <div className="text-[10px] text-muted-foreground/60 truncate hidden sm:block">{dt.description}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Left: Form */}
        <div className="flex-1 min-w-0 space-y-4">
          <Card>
            <CardContent className="p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2.5">
                  <currentDocType.icon className="h-5 w-5 text-primary" />
                  <span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">{currentDocType.label} Details</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Fill in the details for your {currentDocType.label.toLowerCase()}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Your Name</label>
                  <Input
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {docType === "academic-cv" ? "Field / Department" : "Target Role"}
                  </label>
                  <Input
                    placeholder={docType === "academic-cv" ? "e.g., Computer Science" : "e.g., Senior Software Engineer"}
                    value={formData.targetRole}
                    onChange={(e) => update("targetRole", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {docType === "academic-cv" ? "Institution" : "Company Name"}
                </label>
                <Input
                  placeholder={docType === "academic-cv" ? "e.g., MIT" : "e.g., Google"}
                  value={formData.company}
                  onChange={(e) => update("company", e.target.value)}
                />
              </div>

              {docType === "cover-letter" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-medium text-muted-foreground">Job Description</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => jdFileInputRef.current?.click()}
                        disabled={extractingJD}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-60"
                      >
                        {extractingJD ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Extracting...</>
                        ) : (
                          <><Upload className="h-3 w-3" /> Upload JD</>
                        )}
                      </button>
                      <input
                        ref={jdFileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt,.text,.md"
                        onChange={handleJDUpload}
                        className="hidden"
                        title="Upload job description"
                      />

                      {jdFileName && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success">
                          {jdFileName}
                          <button
                            onClick={clearJDUpload}
                            className="text-danger/70 hover:text-danger"
                            title="Clear uploaded JD"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground">Supports PDF, DOCX, and text files up to {FILE_SIZE_LIMIT_MB}MB.</p>

                  <Textarea
                    placeholder="Paste the job description..."
                    rows={4}
                    value={formData.jobDescription}
                    onChange={(e) => {
                      update("jobDescription", e.target.value);
                      setJdSourceType("paste");
                      setJdFileName(null);
                      if (jdFileInputRef.current) jdFileInputRef.current.value = "";
                    }}
                  />

                  <div className="text-[11px] text-muted-foreground">Job Description source: {sourceLabel(jdSourceType)}</div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Resume / Background</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => resumeFileInputRef.current?.click()}
                      disabled={extractingResume}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-60"
                    >
                      {extractingResume ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Extracting...</>
                      ) : (
                        <><Upload className="h-3 w-3" /> Upload Resume</>
                      )}
                    </button>
                    <input
                      ref={resumeFileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.text,.md"
                      onChange={handleResumeUpload}
                      className="hidden"
                      title="Upload resume"
                    />

                    {resumeFileName && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success">
                        {resumeFileName}
                        <button
                          onClick={clearResumeUpload}
                          className="text-danger/70 hover:text-danger"
                          title="Clear uploaded resume"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground">Supports PDF, DOCX, and text files up to {FILE_SIZE_LIMIT_MB}MB.</p>

                <Textarea
                  placeholder="Paste your resume or background info (helps AI personalize the output)"
                  rows={5}
                  value={formData.resumeText}
                  onChange={(e) => {
                    update("resumeText", e.target.value);
                    setResumeSourceType("paste");
                    setResumeFileName(null);
                    if (resumeFileInputRef.current) resumeFileInputRef.current.value = "";
                  }}
                />

                <div className="text-[11px] text-muted-foreground">Resume source: {sourceLabel(resumeSourceType)}</div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Additional Instructions</label>
                <Textarea
                  placeholder="Any additional details or special instructions..."
                  rows={3}
                  value={formData.additionalInfo}
                  onChange={(e) => update("additionalInfo", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Sticky generate bar */}
          <div className="sticky bottom-4 z-20">
            {saveNotice && (
              <div className="mb-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                {saveNotice}
              </div>
            )}
            <div className="p-3 rounded-2xl border border-glass-border bg-sticky-bg backdrop-blur-xl shadow-[0_-8px_30px_var(--shadow-heavy)]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className={`h-8 w-8 rounded-lg bg-linear-to-br ${currentDocType.color} flex items-center justify-center shrink-0`}>
                    <currentDocType.icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{currentDocType.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{stickyDescription}</div>
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
                  onClick={generate}
                  disabled={loading || extractingResume || extractingJD}
                  variant="glow"
                  className="gap-2 px-6 py-5 text-sm bg-linear-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shrink-0"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                  ) : extractionStatus ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Extracting...</>
                  ) : (
                    <><FileText className="h-4 w-4" /> Generate</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Output Panel (sticky) */}
        <div className="hidden lg:block w-[480px] shrink-0">
          <div className="sticky top-24">
            <Card className="flex flex-col h-[calc(100vh-8rem)] relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-cyan-500/40 to-transparent" />
              <CardContent className="p-5 flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <div className="flex gap-2">
                    {latexCode && (
                      <>
                        <Button
                          variant={!showLatex ? "default" : "outline"}
                          size="sm"
                          onClick={() => setShowLatex(false)}
                          className="text-xs"
                        >
                          Preview
                        </Button>
                        <Button
                          variant={showLatex ? "default" : "outline"}
                          size="sm"
                          onClick={() => setShowLatex(true)}
                          className="text-xs"
                        >
                          LaTeX Code
                        </Button>
                      </>
                    )}
                  </div>
                  {generatedText && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={copyText} className="gap-1.5 text-xs">
                        {copied ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? "Copied!" : "Copy"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={downloadText} className="gap-1.5 text-xs">
                        <Download className="h-3.5 w-3.5" /> Save
                      </Button>
                      {(docType === "cover-letter" ? Boolean(generatedText) : Boolean(latexCode)) && (
                        <Button size="sm" onClick={downloadPDF} disabled={downloadingPdf} className="gap-1.5 text-xs">
                          {downloadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          PDF
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {generatedText ? (
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {showLatex ? (
                      <pre className="latex-code">{latexCode}</pre>
                    ) : (
                      <div className="markdown-content text-sm">
                        <ReactMarkdown>{generatedText}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                    <div className="text-center">
                      <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-surface-2 border border-glass-border flex items-center justify-center">
                        <Mail className="h-8 w-8 opacity-20" />
                      </div>
                      <p className="font-medium text-foreground/50">Ready to generate</p>
                      <p className="text-xs mt-1.5 opacity-50 max-w-[200px] mx-auto leading-relaxed">
                        Fill in the details and click Generate
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Mobile output */}
      <div className="lg:hidden mt-6">
        {generatedText && (
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-cyan-500/40 to-transparent" />
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                  {latexCode && (
                    <>
                      <Button variant={!showLatex ? "default" : "outline"} size="sm" onClick={() => setShowLatex(false)} className="text-xs">Preview</Button>
                      <Button variant={showLatex ? "default" : "outline"} size="sm" onClick={() => setShowLatex(true)} className="text-xs">LaTeX</Button>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyText} className="gap-1.5 text-xs">
                    {copied ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadText} className="gap-1.5 text-xs">
                    <Download className="h-3.5 w-3.5" /> Save
                  </Button>
                  {(docType === "cover-letter" ? Boolean(generatedText) : Boolean(latexCode)) && (
                    <Button size="sm" onClick={downloadPDF} disabled={downloadingPdf} className="gap-1.5 text-xs">
                      {downloadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      PDF
                    </Button>
                  )}
                </div>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                {showLatex ? <pre className="latex-code">{latexCode}</pre> : <div className="markdown-content text-sm"><ReactMarkdown>{generatedText}</ReactMarkdown></div>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </motion.div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FileText,
  Wand2,
  Download,
  Copy,
  Loader2,
  User,
  Briefcase,
  GraduationCap,
  Code,
  Trophy,
  CheckCircle,
  ImagePlus,
  X,
  Layout,
  Camera,
  Plus,
  Trash2,
  Upload,
  Save,
  GripVertical,
} from "lucide-react";
import { getApiKey, generateWithRetry } from "@/lib/ai/gemini";
import { RESUME_TEMPLATES, getTemplateById } from "@/lib/data/templates";
import { extractTextFromPdf } from "@/lib/resume/textExtraction";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";

interface EducationEntry {
  id: string;
  degree: string;
  fieldOfStudy: string;
  institution: string;
  startYear: string;
  endYear: string;
  gradeType: "GPA" | "CGPA" | "Percentage" | "Grade";
  gradeValue: string;
  gradeScale: string;
  coursework: string;
}

interface ExperienceEntry {
  id: string;
  role: string;
  company: string;
  duration: string;
  location: string;
  points: string;
}

interface ProjectEntry {
  id: string;
  name: string;
  link: string;
  points: string;
}

interface SkillRatingEntry {
  id: string;
  name: string;
  rating: number;
}

interface SkillsEntry {
  technical: string;
  soft: string;
  technicalRatings: SkillRatingEntry[];
  softRatings: SkillRatingEntry[];
}

interface TemplateHoverPreviewPosition {
  x: number;
  y: number;
  placement: "top" | "bottom";
}

type SkillsEntryField = "technical" | "soft";
type SkillRatingGroup = "technicalRatings" | "softRatings";

type ResumeSectionKey =
  | "summary"
  | "education"
  | "skills"
  | "projects"
  | "experience"
  | "certificate"
  | "awards"
  | "publications"
  | "affiliations";

const DEFAULT_RESUME_SECTION_ORDER: ResumeSectionKey[] = [
  "summary",
  "education",
  "skills",
  "projects",
  "experience",
  "certificate",
  "awards",
  "publications",
  "affiliations",
];

const SECTION_ORDER_LABELS: Record<ResumeSectionKey, string> = {
  summary: "Summary",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  experience: "Experience",
  certificate: "Certificate",
  awards: "Awards",
  publications: "Publications",
  affiliations: "Affiliations",
};

const emptyEducation = (): EducationEntry => ({
  id: crypto.randomUUID(),
  degree: "",
  fieldOfStudy: "",
  institution: "",
  startYear: "",
  endYear: "",
  gradeType: "CGPA",
  gradeValue: "",
  gradeScale: "10",
  coursework: "",
});

const emptyExperience = (): ExperienceEntry => ({
  id: crypto.randomUUID(),
  role: "",
  company: "",
  duration: "",
  location: "",
  points: "",
});

const emptyProject = (): ProjectEntry => ({
  id: crypto.randomUUID(),
  name: "",
  link: "",
  points: "",
});

const emptySkillRating = (): SkillRatingEntry => ({
  id: crypto.randomUUID(),
  name: "",
  rating: 3,
});

const gradeTypes = [
  { value: "GPA", label: "GPA", defaultScale: "4.0" },
  { value: "CGPA", label: "CGPA", defaultScale: "10" },
  { value: "Percentage", label: "Percentage", defaultScale: "100" },
  { value: "Grade", label: "Grade (A/B/C)", defaultScale: "" },
];

function formatEducationsToString(educations: EducationEntry[]): string {
  return educations
    .filter((e) => e.degree || e.institution)
    .map((e) => {
      const parts: string[] = [];
      const degreeLine = [e.degree, e.fieldOfStudy].filter(Boolean).join(" in ");
      if (degreeLine) parts.push(degreeLine);
      if (e.institution) parts.push(`Institution: ${e.institution}`);
      const years = [e.startYear, e.endYear].filter(Boolean).join(" - ");
      if (years) parts.push(`Duration: ${years}`);
      if (e.gradeValue) {
        if (e.gradeType === "Grade") {
          parts.push(`Grade: ${e.gradeValue}`);
        } else {
          parts.push(`${e.gradeType}: ${e.gradeValue}${e.gradeScale ? `/${e.gradeScale}` : ""}`);
        }
      }
      if (e.coursework) parts.push(`Relevant Coursework: ${e.coursework}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

function formatExperiencesToString(experiences: ExperienceEntry[]): string {
  return experiences
    .filter((e) => e.role || e.company || e.points)
    .map((e) => {
      const parts: string[] = [];
      if (e.role) parts.push(`Role: ${e.role}`);
      if (e.company) parts.push(`Company: ${e.company}`);
      if (e.duration) parts.push(`Duration: ${e.duration}`);
      if (e.location) parts.push(`Location: ${e.location}`);

      const bullets = e.points
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^[-•*]\s*/, ""));

      if (bullets.length > 0) {
        parts.push("Description Points:");
        parts.push(...bullets.map((b) => `- ${b}`));
      }

      return parts.join("\n");
    })
    .join("\n\n");
}

function formatProjectsToString(projects: ProjectEntry[]): string {
  return projects
    .filter((p) => p.name || p.points || p.link)
    .map((p) => {
      const parts: string[] = [];
      if (p.name) parts.push(`Project Name: ${p.name}`);
      if (p.link) parts.push(`Project Link: ${p.link}`);

      const bullets = p.points
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^[-•*]\s*/, ""));

      if (bullets.length > 0) {
        parts.push("Description Points:");
        parts.push(...bullets.map((b) => `- ${b}`));
      }

      return parts.join("\n");
    })
    .join("\n\n");
}

function formatSkillsToString(skills: SkillsEntry): string {
  const joinRatedSkillNames = (entries: SkillRatingEntry[]) =>
    entries
      .map((entry) => entry.name.trim())
      .filter(Boolean)
      .join(", ");

  const parts: string[] = [];
  const technicalSkills = skills.technical.trim() || joinRatedSkillNames(skills.technicalRatings);
  const softSkills = skills.soft.trim() || joinRatedSkillNames(skills.softRatings);

  if (technicalSkills) parts.push(`Technical Skills: ${technicalSkills}`);
  if (softSkills) parts.push(`Soft Skills: ${softSkills}`);

  return parts.join("\n");
}

interface ResumeForm {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  targetRole: string;
  jobDescription: string;
  summary: string;
  education: string;
  experience: string;
  projects: string;
  skills: string;
  achievements: string;
}

interface ResumeDraft {
  form: ResumeForm;
  selectedTemplate: string;
  activeSection: string;
  photoBase64: string | null;
  educations: EducationEntry[];
  experiences: ExperienceEntry[];
  projects: ProjectEntry[];
  skillsEntry: SkillsEntry;
  sectionOrder: ResumeSectionKey[];
  savedAt: number;
}

const RESUME_DRAFT_STORAGE_KEY = "resume_builder_draft_v1";

const defaultForm: ResumeForm = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  github: "",
  targetRole: "",
  jobDescription: "",
  summary: "",
  education: "",
  experience: "",
  projects: "",
  skills: "",
  achievements: "",
};

const defaultSkillsEntry: SkillsEntry = {
  technical: "",
  soft: "",
  technicalRatings: [],
  softRatings: [],
};

export default function ResumeBuilderPage() {
  const [form, setForm] = useState<ResumeForm>(defaultForm);
  const [latexCode, setLatexCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState("template");
  const [selectedTemplate, setSelectedTemplate] = useState("modern-professional");
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [educations, setEducations] = useState<EducationEntry[]>([emptyEducation()]);
  const [experiences, setExperiences] = useState<ExperienceEntry[]>([emptyExperience()]);
  const [projects, setProjects] = useState<ProjectEntry[]>([emptyProject()]);
  const [skillsEntry, setSkillsEntry] = useState<SkillsEntry>(defaultSkillsEntry);
  const [sectionOrder, setSectionOrder] = useState<ResumeSectionKey[]>(DEFAULT_RESUME_SECTION_ORDER);
  const [draggingSection, setDraggingSection] = useState<ResumeSectionKey | null>(null);
  const [jdFileName, setJdFileName] = useState<string | null>(null);
  const [jdLoading, setJdLoading] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [hoverPreviewTemplateId, setHoverPreviewTemplateId] = useState<string | null>(null);
  const [hoverPreviewPosition, setHoverPreviewPosition] = useState<TemplateHoverPreviewPosition | null>(null);
  const [desktopHoverEnabled, setDesktopHoverEnabled] = useState(false);
  const [templatePreviewImageErrors, setTemplatePreviewImageErrors] = useState<Record<string, boolean>>({});
  const hoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jdFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const syncHoverCapability = () => {
      setDesktopHoverEnabled(mediaQuery.matches);
    };

    syncHoverCapability();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncHoverCapability);
      return () => mediaQuery.removeEventListener("change", syncHoverCapability);
    }

    mediaQuery.addListener(syncHoverCapability);
    return () => mediaQuery.removeListener(syncHoverCapability);
  }, []);

  useEffect(() => {
    if (!desktopHoverEnabled) {
      setHoverPreviewTemplateId(null);
      setHoverPreviewPosition(null);
    }
  }, [desktopHoverEnabled]);

  useEffect(() => {
    if (activeSection !== "template") {
      setHoverPreviewTemplateId(null);
      setHoverPreviewPosition(null);
    }
  }, [activeSection]);

  useEffect(() => {
    return () => {
      if (hoverOpenTimerRef.current) {
        clearTimeout(hoverOpenTimerRef.current);
        hoverOpenTimerRef.current = null;
      }
      if (hoverCloseTimerRef.current) {
        clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = null;
      }
    };
  }, []);

  const sanitizeSectionOrder = (rawOrder: unknown): ResumeSectionKey[] => {
    const allowed = new Set<ResumeSectionKey>(DEFAULT_RESUME_SECTION_ORDER);
    const normalized: ResumeSectionKey[] = [];

    if (Array.isArray(rawOrder)) {
      for (const item of rawOrder) {
        if (typeof item !== "string") continue;
        if (!allowed.has(item as ResumeSectionKey)) continue;
        if (normalized.includes(item as ResumeSectionKey)) continue;
        normalized.push(item as ResumeSectionKey);
      }
    }

    for (const key of DEFAULT_RESUME_SECTION_ORDER) {
      if (!normalized.includes(key)) {
        normalized.push(key);
      }
    }

    return normalized;
  };

  const clampRating = (value: unknown): number => {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) return 3;
    return Math.min(5, Math.max(1, Math.round(parsed)));
  };

  const sanitizeRatingGroup = (rawGroup: unknown): SkillRatingEntry[] => {
    if (!Array.isArray(rawGroup)) return [];

    return rawGroup
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;

        const candidate = entry as Partial<SkillRatingEntry>;
        const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
        if (!name) return null;

        return {
          id: typeof candidate.id === "string" && candidate.id ? candidate.id : crypto.randomUUID(),
          name,
          rating: clampRating(candidate.rating),
        };
      })
      .filter((entry): entry is SkillRatingEntry => Boolean(entry));
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESUME_DRAFT_STORAGE_KEY);
      if (!raw) return;

      const draft = JSON.parse(raw) as Partial<ResumeDraft>;

      let nextForm: ResumeForm = {
        ...defaultForm,
        ...(draft.form || {}),
      };

      let nextEducations: EducationEntry[] = [emptyEducation()];
      if (Array.isArray(draft.educations) && draft.educations.length > 0) {
        nextEducations = draft.educations.map((edu) => ({
          ...emptyEducation(),
          ...edu,
          id: edu.id || crypto.randomUUID(),
        }));
        nextForm = {
          ...nextForm,
          education: formatEducationsToString(nextEducations),
        };
      }

      setForm(nextForm);
      setEducations(nextEducations);

      let nextExperiences: ExperienceEntry[] = [emptyExperience()];
      if (Array.isArray(draft.experiences) && draft.experiences.length > 0) {
        nextExperiences = draft.experiences.map((exp) => ({
          ...emptyExperience(),
          ...exp,
          id: exp.id || crypto.randomUUID(),
        }));
      }
      setExperiences(nextExperiences);
      nextForm = {
        ...nextForm,
        experience: formatExperiencesToString(nextExperiences),
      };

      let nextProjects: ProjectEntry[] = [emptyProject()];
      if (Array.isArray(draft.projects) && draft.projects.length > 0) {
        nextProjects = draft.projects.map((proj) => ({
          ...emptyProject(),
          ...proj,
          id: proj.id || crypto.randomUUID(),
        }));
      }
      setProjects(nextProjects);
      nextForm = {
        ...nextForm,
        projects: formatProjectsToString(nextProjects),
      };

      const restoredSkills: SkillsEntry = {
        technical: draft.skillsEntry?.technical || "",
        soft: draft.skillsEntry?.soft || "",
        technicalRatings: sanitizeRatingGroup(draft.skillsEntry?.technicalRatings),
        softRatings: sanitizeRatingGroup(draft.skillsEntry?.softRatings),
      };
      setSkillsEntry(restoredSkills);
      nextForm = {
        ...nextForm,
        skills: formatSkillsToString(restoredSkills),
      };
      setForm(nextForm);

      if (
        typeof draft.selectedTemplate === "string" &&
        draft.selectedTemplate &&
        RESUME_TEMPLATES.some((template) => template.id === draft.selectedTemplate)
      ) {
        setSelectedTemplate(draft.selectedTemplate);
      }
      if (typeof draft.activeSection === "string" && draft.activeSection) {
        setActiveSection(draft.activeSection);
      }
      if (typeof draft.photoBase64 === "string" && draft.photoBase64) {
        setPhotoBase64(draft.photoBase64);
        setPhotoPreview(draft.photoBase64);
      }
      setSectionOrder(sanitizeSectionOrder(draft.sectionOrder));

      setSaveNotice("Progress restored from saved draft.");
      const timer = setTimeout(() => setSaveNotice(""), 2500);
      return () => clearTimeout(timer);
    } catch {
      // Ignore malformed local draft.
    }
  }, []);

  const updateEducation = (id: string, field: keyof EducationEntry, value: string) => {
    setEducations((prev) => {
      const updated = prev.map((e) => (e.id === id ? { ...e, [field]: value } : e));
      // sync to form.education
      setForm((f) => ({ ...f, education: formatEducationsToString(updated) }));
      return updated;
    });
  };

  const addEducation = () => {
    setEducations((prev) => [...prev, emptyEducation()]);
  };

  const removeEducation = (id: string) => {
    setEducations((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      const remaining = updated.length > 0 ? updated : [emptyEducation()];
      setForm((f) => ({ ...f, education: formatEducationsToString(remaining) }));
      return remaining;
    });
  };

  const updateForm = (field: keyof ResumeForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateExperience = (id: string, field: keyof ExperienceEntry, value: string) => {
    setExperiences((prev) => {
      const updated = prev.map((e) => (e.id === id ? { ...e, [field]: value } : e));
      setForm((f) => ({ ...f, experience: formatExperiencesToString(updated) }));
      return updated;
    });
  };

  const addExperience = () => {
    setExperiences((prev) => {
      const updated = [...prev, emptyExperience()];
      setForm((f) => ({ ...f, experience: formatExperiencesToString(updated) }));
      return updated;
    });
  };

  const removeExperience = (id: string) => {
    setExperiences((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      const remaining = updated.length > 0 ? updated : [emptyExperience()];
      setForm((f) => ({ ...f, experience: formatExperiencesToString(remaining) }));
      return remaining;
    });
  };

  const updateProject = (id: string, field: keyof ProjectEntry, value: string) => {
    setProjects((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, [field]: value } : p));
      setForm((f) => ({ ...f, projects: formatProjectsToString(updated) }));
      return updated;
    });
  };

  const addProject = () => {
    setProjects((prev) => {
      const updated = [...prev, emptyProject()];
      setForm((f) => ({ ...f, projects: formatProjectsToString(updated) }));
      return updated;
    });
  };

  const removeProject = (id: string) => {
    setProjects((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      const remaining = updated.length > 0 ? updated : [emptyProject()];
      setForm((f) => ({ ...f, projects: formatProjectsToString(remaining) }));
      return remaining;
    });
  };

  const syncSkillsToForm = (nextSkills: SkillsEntry) => {
    setForm((f) => ({ ...f, skills: formatSkillsToString(nextSkills) }));
  };

  const updateSkillsEntry = (field: SkillsEntryField, value: string) => {
    setSkillsEntry((prev) => {
      const next = { ...prev, [field]: value };
      syncSkillsToForm(next);
      return next;
    });
  };

  const addRatedSkill = (group: SkillRatingGroup) => {
    setSkillsEntry((prev) => {
      const next: SkillsEntry = {
        ...prev,
        [group]: [...prev[group], emptySkillRating()],
      };
      syncSkillsToForm(next);
      return next;
    });
  };

  const updateRatedSkill = (group: SkillRatingGroup, id: string, field: "name" | "rating", value: string | number) => {
    setSkillsEntry((prev) => {
      const nextGroup = prev[group].map((skill) => {
        if (skill.id !== id) return skill;

        if (field === "name") {
          return {
            ...skill,
            name: String(value),
          };
        }

        return {
          ...skill,
          rating: clampRating(value),
        };
      });

      const next: SkillsEntry = {
        ...prev,
        [group]: nextGroup,
      };
      syncSkillsToForm(next);
      return next;
    });
  };

  const removeRatedSkill = (group: SkillRatingGroup, id: string) => {
    setSkillsEntry((prev) => {
      const next: SkillsEntry = {
        ...prev,
        [group]: prev[group].filter((skill) => skill.id !== id),
      };
      syncSkillsToForm(next);
      return next;
    });
  };

  const handleJDUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setJdFileName(file.name);
    setError("");
    setJdLoading(true);

    const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    try {
      if (isPDF) {
        const text = await extractTextFromPdf(file);
        if (!text.trim()) {
          setError("Could not extract text from this PDF. It may be image-based. Try copy-pasting the text instead.");
          setJdFileName(null);
          return;
        }
        updateForm("jobDescription", text.trim());
      } else {
        // Plain text files (.txt, .md, etc.)
        const text = await file.text();
        updateForm("jobDescription", text);
      }
    } catch {
      setError("Failed to read file. Please try a different file or paste the text directly.");
      setJdFileName(null);
    } finally {
      setJdLoading(false);
    }
  };

  const clearJDFile = () => {
    setJdFileName(null);
    updateForm("jobDescription", "");
    if (jdFileInputRef.current) jdFileInputRef.current.value = "";
  };

  const moveSection = (fromKey: ResumeSectionKey, toKey: ResumeSectionKey) => {
    if (fromKey === toKey) return;
    setSectionOrder((prev) => {
      const next = [...prev];
      const fromIndex = next.indexOf(fromKey);
      const toIndex = next.indexOf(toKey);
      if (fromIndex < 0 || toIndex < 0) return prev;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, fromKey);
      return next;
    });
  };

  const handleSectionDragStart = (key: ResumeSectionKey) => {
    setDraggingSection(key);
  };

  const handleSectionDrop = (targetKey: ResumeSectionKey) => {
    if (!draggingSection) return;
    moveSection(draggingSection, targetKey);
    setDraggingSection(null);
  };

  const handleSectionDragEnd = () => {
    setDraggingSection(null);
  };

  const resetSectionOrder = () => {
    setSectionOrder(DEFAULT_RESUME_SECTION_ORDER);
  };

  const handleSaveProgress = () => {
    try {
      const draft: ResumeDraft = {
        form: {
          ...form,
          education: formatEducationsToString(educations),
          experience: formatExperiencesToString(experiences),
          projects: formatProjectsToString(projects),
          skills: formatSkillsToString(skillsEntry),
        },
        selectedTemplate,
        activeSection,
        photoBase64,
        educations,
        experiences,
        projects,
        skillsEntry,
        sectionOrder,
        savedAt: Date.now(),
      };

      localStorage.setItem(RESUME_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setSaveNotice("Progress saved locally. It will remain after refresh.");
    } catch {
      setSaveNotice("Could not save progress. Please try again.");
    } finally {
      setTimeout(() => setSaveNotice(""), 2500);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be less than 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPhotoBase64(result);
      setPhotoPreview(result);
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhotoBase64(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Sanitize LaTeX to fix known tikz/pgf issues before compilation
  const sanitizeLatex = (code: string): string => {
    let result = code;

    // Fix bare \clip not inside a scope — wrap in scope
    // Match \clip that is NOT preceded by \begin{scope} (within the same tikzpicture)
    result = result.replace(
      /(\\begin\{tikzpicture\}[^\n]*\n)([\s\S]*?)(\\clip\s)/g,
      (match, start, between, clip) => {
        // Only add scope if there isn't one already
        if (!between.includes('\\begin{scope}')) {
          // Find the corresponding \node and closing \end{tikzpicture}
          return `${start}${between}\\begin{scope}\n    ${clip}`;
        }
        return match;
      }
    );

    // If we added \begin{scope} for clip, add \end{scope} after the \node line
    // This is a best-effort fix
    result = result.replace(
      /(\\begin\{scope\}\s*\n\s*\\clip[^;]*;\s*\n\s*\\node[^;]*;\s*\n)(\s*)(\\end\{tikzpicture\})/g,
      '$1$2\\end{scope}\n$2$3'
    );

    // Remove problematic \pgfutil commands
    result = result.replace(/\\pgfutil@[a-zA-Z]+/g, '');

    // Remove \foreach loops (they often cause pgf issues) — replace with comment
    result = result.replace(/\\foreach\s+\\[^{]*\s+in\s+\{[^}]*\}\s*\{[^}]*\}/g, '% foreach removed for compatibility');

    return result;
  };

  const stripInvisibleUnicode = (input: string): string => {
    return input
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/[\u2028\u2029]/g, "\n");
  };

  const escapeLatex = (input: string): string => {
    const normalized = stripInvisibleUnicode(input.normalize("NFKC"));
    return normalized
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/&/g, "\\&")
      .replace(/%/g, "\\%")
      .replace(/\$/g, "\\$")
      .replace(/#/g, "\\#")
      .replace(/_/g, "\\_")
      .replace(/{/g, "\\{")
      .replace(/}/g, "\\}")
      .replace(/~/g, "\\textasciitilde{}")
      .replace(/\^/g, "\\textasciicircum{}");
  };

  const normalizeLatexForCompile = (code: string): string => {
    return stripInvisibleUnicode(code).replace(/\r\n/g, "\n");
  };

  const getErrorMessage = (value: unknown, fallback = "Unknown error"): string => {
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    const maybeMessage = (value as { message?: unknown } | null)?.message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }

    if (value === undefined || value === null) {
      return fallback;
    }

    return String(value);
  };

  const toItemize = (text: string): string => {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-•*]\s*/, ""));

    if (lines.length === 0) return "";

    return [
      "\\begin{itemize}[leftmargin=*,nosep]",
      ...lines.map((line) => `\\item ${escapeLatex(line)}`),
      "\\end{itemize}",
    ].join("\n");
  };

  const buildSafeLatexFallback = (): string => {
    const contactParts = [
      form.email?.trim(),
      form.phone?.trim(),
      form.location?.trim(),
      form.linkedin?.trim(),
      form.github?.trim(),
    ].filter(Boolean) as string[];

    const section = (title: string, body: string) => {
      if (!body.trim()) return "";
      return `\\section*{${title}}\n${body}\n`;
    };

    const summaryBody = form.summary.trim() ? `${escapeLatex(form.summary.trim())}\n` : "";
    const educationBody = form.education.trim() ? toItemize(form.education) : "";
    const experienceBody = form.experience.trim() ? toItemize(form.experience) : "";
    const projectsBody = form.projects.trim() ? toItemize(form.projects) : "";
    const skillsBody = form.skills.trim() ? `${escapeLatex(form.skills.trim())}\n` : "";
    const achievementsBody = form.achievements.trim() ? toItemize(form.achievements) : "";

    return `\\documentclass[a4paper,11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{enumitem,hyperref}
\\setcounter{secnumdepth}{0}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{4pt}
\\begin{document}

{\\LARGE\\textbf{${escapeLatex(form.fullName.trim() || "Candidate")}}}\\
{\\large ${escapeLatex(form.targetRole.trim() || "Professional")}}\\
${contactParts.length > 0 ? `${contactParts.map((c) => escapeLatex(c)).join(" \\textbar{} ")}\\\n` : ""}
\\vspace{4pt}\\hrule\\vspace{8pt}

${section("Professional Summary", summaryBody)}
${section("Education", educationBody)}
${section("Experience", experienceBody)}
${section("Projects", projectsBody)}
${section("Skills", skillsBody)}
${section("Achievements", achievementsBody)}

\\end{document}`;
  };

  const formatDateRange = (startYear?: string, endYear?: string): string => {
    const start = (startYear || "").trim();
    const end = (endYear || "").trim();
    if (start && end) return `${escapeLatex(start)} - ${escapeLatex(end)}`;
    if (start) return escapeLatex(start);
    if (end) return escapeLatex(end);
    return "";
  };

  const buildFaangpathLatex = (): string => {
    const fullName = escapeLatex(form.fullName.trim() || "Candidate");
    const role = escapeLatex(form.targetRole.trim() || "Professional");

    const phone = form.phone.trim();
    const location = form.location.trim();
    const email = form.email.trim();
    const linkedin = form.linkedin.trim();
    const github = form.github.trim();

    const addressLine1Parts = [phone, location].filter(Boolean).map((v) => escapeLatex(v));
    const addressLine1 = addressLine1Parts.length > 0 ? addressLine1Parts.join(" \\\\ ") : "";

    const normalizeUrl = (url: string): string => {
      if (!url) return "";
      if (/^https?:\/\//i.test(url)) return url;
      return `https://${url}`;
    };

    const contactLinks: string[] = [];
    if (email) {
      const safeEmail = escapeLatex(email);
      contactLinks.push(`\\href{mailto:${email}}{${safeEmail}}`);
    }
    if (linkedin) {
      const link = normalizeUrl(linkedin);
      contactLinks.push(`\\href{${link}}{${escapeLatex(linkedin)}}`);
    }
    if (github) {
      const link = normalizeUrl(github);
      contactLinks.push(`\\href{${link}}{${escapeLatex(github)}}`);
    }
    const addressLine2 = contactLinks.join(" \\\\ ");

    const objectiveText = form.summary.trim()
      ? escapeLatex(form.summary.trim())
      : `${role} focused candidate seeking relevant opportunities.`;

    const educationEntries = educations.filter((e) => e.degree.trim() || e.institution.trim());
    const educationSection = educationEntries.length > 0
      ? `\\begin{rSection}{Education}
${educationEntries
  .map((e) => {
    const degree = [e.degree.trim(), e.fieldOfStudy.trim()].filter(Boolean).join(" in ");
    const institution = e.institution.trim();
    const dateRange = formatDateRange(e.startYear, e.endYear);
    const gradeText = e.gradeValue.trim()
      ? e.gradeType === "Grade"
        ? `Grade: ${escapeLatex(e.gradeValue.trim())}`
        : `${escapeLatex(e.gradeType)}: ${escapeLatex(e.gradeValue.trim())}${e.gradeScale.trim() ? `/${escapeLatex(e.gradeScale.trim())}` : ""}`
      : "";
    const coursework = e.coursework.trim() ? `Relevant Coursework: ${escapeLatex(e.coursework.trim())}.` : "";

    const firstLineLeft = [degree, institution].filter(Boolean).map((v) => escapeLatex(v)).join(", ");
    const firstLine = dateRange
      ? `{\\bf ${firstLineLeft}} \\hfill {${dateRange}}`
      : `{\\bf ${firstLineLeft}}`;

    return [firstLine, gradeText, coursework].filter(Boolean).join("\\n") + "\\n";
  })
  .join("\\n")}
\\end{rSection}`
      : "";

    const skillLines = form.skills
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const skillRows = skillLines
      .map((line) => {
        if (line.includes(":")) {
          const [k, ...rest] = line.split(":");
          return `\\textbf{${escapeLatex(k.trim())}} & ${escapeLatex(rest.join(":").trim())}\\\\`;
        }
        return `\\textbf{Technical Skills} & ${escapeLatex(line)}\\\\`;
      })
      .join("\n");
    const skillsSection = skillRows
      ? `\\begin{rSection}{SKILLS}
\\begin{tabular}{@{}ll}
${skillRows}
\\end{tabular}\\
\\end{rSection}`
      : "";

    const experienceBullets = form.experience
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-•*]\s*/, ""));
    const experienceSection = experienceBullets.length > 0
      ? `\\begin{rSection}{EXPERIENCE}
\\textbf{${role}}\\
\\begin{itemize}
${experienceBullets.map((b) => `\\item ${escapeLatex(b)}`).join("\n")}
\\end{itemize}
\\end{rSection}`
      : "";

    const projectBullets = form.projects
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-•*]\s*/, ""));
    const projectsSection = projectBullets.length > 0
      ? `\\begin{rSection}{PROJECTS}
\\vspace{-1.0em}
${projectBullets.map((p) => `\\item \\textbf{Project.} {${escapeLatex(p)}}`).join("\n")}
\\end{rSection}`
      : "";

    const achievementBullets = form.achievements
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-•*]\s*/, ""));
    const achievementsSection = achievementBullets.length > 0
      ? `\\begin{rSection}{Extra-Curricular Activities}
\\begin{itemize}
${achievementBullets.map((a) => `\\item ${escapeLatex(a)}`).join("\n")}
\\end{itemize}
\\end{rSection}`
      : "";

    return `\\documentclass{resume}
\\usepackage[left=0.4in,top=0.4in,right=0.4in,bottom=0.4in]{geometry}
\\newcommand{\\tab}[1]{\\hspace{.2667\\textwidth}\\rlap{#1}}
\\newcommand{\\itab}[1]{\\hspace{0em}\\rlap{#1}}
\\name{${fullName}}
${addressLine1 ? `\\address{${addressLine1}}` : ""}
${addressLine2 ? `\\address{${addressLine2}}` : ""}

\\begin{document}

\\begin{rSection}{OBJECTIVE}
{${objectiveText}}
\\end{rSection}

${educationSection}
${skillsSection}
${experienceSection}
${projectsSection}
${achievementsSection}

\\end{document}`;
  };

  type TechMeta = {
    technical: string[];
    subjectsOfInterest: string[];
    additionalSkills: string[];
    additionalDetails: string[];
    declaration: string;
  };

  const splitInlineValues = (text: string): string[] => {
    return text
      .split(/[;,|]/g)
      .map((v) => v.trim())
      .filter(Boolean);
  };

  const splitLines = (value: string): string[] => {
    return stripInvisibleUnicode(value)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*•]\s*/, ""));
  };

  const parseTechMeta = (): TechMeta => {
    const parsed: TechMeta = {
      technical: [],
      subjectsOfInterest: [],
      additionalSkills: [],
      additionalDetails: [],
      declaration: "",
    };

    const processLine = (line: string, source: "skills" | "achievements") => {
      const cleaned = stripInvisibleUnicode(line).trim();
      if (!cleaned) return;

      const subjectMatch = cleaned.match(/^subjects?\s+of\s+interest\s*:\s*(.+)$/i);
      if (subjectMatch) {
        parsed.subjectsOfInterest.push(...splitInlineValues(subjectMatch[1]));
        return;
      }

      const addSkillMatch = cleaned.match(/^additional\s+skills?\s*:\s*(.+)$/i);
      if (addSkillMatch) {
        parsed.additionalSkills.push(...splitInlineValues(addSkillMatch[1]));
        return;
      }

      const addDetailsMatch = cleaned.match(/^additional\s+details?\s*:\s*(.+)$/i);
      if (addDetailsMatch) {
        parsed.additionalDetails.push(addDetailsMatch[1].trim());
        return;
      }

      const declarationMatch = cleaned.match(/^declaration\s*:\s*(.+)$/i);
      if (declarationMatch) {
        parsed.declaration = declarationMatch[1].trim();
        return;
      }

      if (source === "skills") {
        parsed.technical.push(cleaned);
      } else {
        parsed.additionalSkills.push(cleaned);
      }
    };

    splitLines(form.skills).forEach((line) => processLine(line, "skills"));
    splitLines(form.achievements).forEach((line) => processLine(line, "achievements"));

    return parsed;
  };

  const buildTechDeveloperLatex = (): string => {
    const meta = parseTechMeta();

    const section = (title: string, body: string) => {
      if (!body.trim()) return "";
      return `\\section*{${title}}\n${body}\n`;
    };

    const bullet = (lines: string[]) => {
      if (lines.length === 0) return "";
      return [
        "\\begin{itemize}[leftmargin=*,nosep]",
        ...lines.map((line) => `\\item ${escapeLatex(line)}`),
        "\\end{itemize}",
      ].join("\n");
    };

    const objectiveText = form.summary.trim() || `${form.targetRole || "Professional"} candidate seeking suitable opportunities.`;
    const educationBody = form.education.trim() ? bullet(splitLines(form.education)) : "";
    const technicalBody = meta.technical.length
      ? meta.technical
          .map((line) => {
            if (line.includes(":")) {
              const [k, ...rest] = line.split(":");
              return `\\textbf{${escapeLatex(k.trim())}}: ${escapeLatex(rest.join(":").trim())}\\\\`;
            }
            return `\\textbf{Technical Skills}: ${escapeLatex(line)}\\\\`;
          })
          .join("\n")
      : "";

    const contacts = [form.email.trim(), form.phone.trim(), form.location.trim(), form.linkedin.trim(), form.github.trim()]
      .filter(Boolean)
      .map((v) => escapeLatex(v))
      .join(" | ");

    return `\\documentclass[a4paper,11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=0.55in]{geometry}
\\usepackage{enumitem,hyperref}
\\setcounter{secnumdepth}{0}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{4pt}
\\begin{document}

\\begin{center}
{\\LARGE\\textbf{${escapeLatex(form.fullName || "Candidate")}}}\\
{\\normalsize ${escapeLatex(form.targetRole || "Professional")}}\\
${contacts ? `${contacts}\\\n` : ""}
\\end{center}
\\hrule\\vspace{6pt}

${section("CAREER OBJECTIVE", `${escapeLatex(objectiveText)}\n`)}
${section("EDUCATION", educationBody)}
${section("TECHNICAL SKILLS", technicalBody)}
${section("SUBJECTS OF INTEREST", bullet(meta.subjectsOfInterest))}
${section("EXPERIENCE", bullet(splitLines(form.experience)))}
${section("PROJECTS", bullet(splitLines(form.projects)))}
${section("ADDITIONAL SKILLS", bullet(meta.additionalSkills))}
${section("ADDITIONAL DETAILS", bullet(meta.additionalDetails))}
${section("DECLARATION", meta.declaration ? `${escapeLatex(meta.declaration)}\n` : "")}

\\end{document}`;
  };

  const getThemeViolations = (code: string, templateId: string, expectsPhoto: boolean): string[] => {
    const violations: string[] = [];
    const lower = code.toLowerCase();

    if (!code.includes("\\documentclass")) violations.push("Missing \\documentclass declaration");
    if (!code.includes("\\setcounter{secnumdepth}{0}")) violations.push("Missing secnumdepth=0 (unnumbered sections)");
    if (!code.includes("\\pagestyle{empty}")) violations.push("Missing \\pagestyle{empty}");
    if (/\\section\{/.test(code)) violations.push("Uses numbered \\section{} instead of unnumbered headings");
    if (/(lorem ipsum|your name|placeholder|sample text)/i.test(lower)) {
      violations.push("Contains placeholder/filler text");
    }

    if (!expectsPhoto && /photo\.jpg/i.test(code)) {
      violations.push("References photo.jpg even though no photo is uploaded");
    }

    if (!code.includes("\\begin{itemize}")) {
      violations.push("Missing bullet structure for content sections");
    }

    if (templateId === "modern-professional") {
      const minipageCount = (code.match(/\\begin\{minipage\}/g) || []).length;
      if (minipageCount < 2) violations.push("Modern Professional must use a two-column minipage layout");
      if (!/\\definecolor\{primary\}/.test(code)) violations.push("Modern Professional missing primary color definition");
    }

    if (templateId === "classic-elegant" || templateId === "minimal-clean") {
      if (/\\begin\{tikzpicture\}/.test(code)) {
        violations.push("Classic/Minimal templates should not use tikz graphics");
      }
    }

    if ((templateId === "tech-developer" || templateId === "creative-modern" || templateId === "executive-premium") && !/\\definecolor\{accent\}|\\definecolor\{gold\}/.test(code)) {
      violations.push("Template accent color tokens are missing");
    }

    return violations;
  };

  const generateResume = async () => {
    if (!form.fullName || !form.targetRole) {
      setError("Please fill in at least your name and target role.");
      return;
    }

    setLoading(true);
    setError("");

    if (selectedTemplate === "faangpath-simple") {
      try {
        const text = buildFaangpathLatex();
        setLatexCode(text);
      } catch {
        setError("Could not build FAANGPath template from provided data.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (selectedTemplate === "tech-developer") {
      try {
        const text = buildTechDeveloperLatex();
        setLatexCode(text);
      } catch {
        setError("Could not build Tech Developer template from provided data.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const key = getApiKey();
    if (!key) {
      setError("Please configure your Gemini API key in Settings first.");
      setLoading(false);
      return;
    }

    const template = getTemplateById(selectedTemplate);
    const hasPhoto = template.hasPhoto && photoBase64;

    try {
      const prompt = `Generate a professional, ATS-optimized LaTeX resume using the following SPECIFIC template design.

=== TEMPLATE: ${template.name} ===
${template.promptInstructions}

=== ABSOLUTE RULES (MUST FOLLOW) ===
- Output ONLY the complete LaTeX code — nothing else before or after
- Do NOT wrap in markdown code blocks (\`\`\`)
- Must compile with pdflatex WITHOUT errors on first try
- Do NOT use any packages that require XeLaTeX or LuaLaTeX
- Use ONLY user-provided content. Do NOT invent placeholders, fake companies, fake projects, fake achievements, or filler text.
- If a section has no user input, OMIT that section completely.
- The page background MUST be WHITE — do NOT use dark backgrounds, colored page fills, or dark themes
- Sidebar/column accent colors are fine but the main page/paper color must stay white
- Text color must be dark (black/dark gray) for readability on white paper
- NEVER use numbered sections — always use \\setcounter{secnumdepth}{0} in preamble and \\pagestyle{empty}
- Section headings must NEVER show numbers like "1 Summary" or "2.1 Experience"
- Use \\begin{itemize}[leftmargin=*,nosep] for compact bullet points
- Escape special LaTeX characters in user data: & % $ # _ { } ~ ^
- Keep to 1 page (max 2 if extensive experience provided)
- ALL content must be properly aligned — no overlapping text
- For two-column layouts use minipage or paracol — NOT multicols with tikz absolute positioning
- If a contact field value is "Not provided", do not print that line in the resume.

=== VISUAL QUALITY CONTRACT ===
- Must look like a real modern resume template, not raw LaTeX notes.
- Apply a clear hierarchy: Name > Section Titles > Role/Project Titles > Bullet text.
- Ensure section spacing is consistent (tight but readable), avoid large random gaps.
- Avoid excessive decorative elements; prioritize clean alignment and scannability.
- Keep line lengths balanced; avoid overfull boxes and broken alignment.
- Use a consistent header pattern and consistent section divider style for the selected template.

=== TIKZ SAFETY RULES (CRITICAL — prevents pgf/tikz compilation errors) ===
- ALWAYS wrap \\clip operations inside a \\begin{scope}...\\end{scope}
- NEVER use \\clip directly inside tikzpicture without a scope
- Correct photo pattern:
  \\begin{tikzpicture}
    \\begin{scope}
      \\clip (0,0) circle (1.25cm);
      \\node at (0,0) {\\includegraphics[width=2.5cm]{photo.jpg}};
    \\end{scope}
  \\end{tikzpicture}
- Do NOT use \\foreach loops in tikz — expand manually instead
- Do NOT use pgfmath or \\pgfmathresult
- Do NOT use \\pgfutil or any pgf internal macros
- Keep tikzpicture environments SIMPLE — use basic \\fill, \\draw, \\node only
- For colored background rectangles use:
  \\begin{tikzpicture}[remember picture,overlay]
    \\fill[color] (current page.north west) rectangle ([xshift=Xcm]current page.south west);
  \\end{tikzpicture}
- For skill pills prefer \\colorbox{color}{\\small text} over tikz nodes
- Test: if a tikz construct looks complex, simplify it or use basic LaTeX instead
${hasPhoto ? `- INCLUDE profile photo with this EXACT code (scope is mandatory):
  \\begin{tikzpicture}
    \\begin{scope}
      \\clip (0,0) circle (1.25cm);
      \\node at (0,0) {\\includegraphics[width=2.5cm]{photo.jpg}};
    \\end{scope}
  \\end{tikzpicture}
- The file "photo.jpg" exists in the same directory` : "- Do NOT include any photo/image/\\includegraphics in this resume"}

=== PERSON DETAILS ===
Name: ${form.fullName}
Email: ${form.email || "Not provided"}
Phone: ${form.phone || "Not provided"}
Location: ${form.location || "Not provided"}
LinkedIn: ${form.linkedin || "Not provided"}
GitHub: ${form.github || "Not provided"}
Target Role: ${form.targetRole}

${form.jobDescription ? `=== JOB DESCRIPTION (tailor resume to match this) ===\n${form.jobDescription}` : ""}
${form.summary ? `=== PROFESSIONAL SUMMARY ===\n${form.summary}` : ""}
${form.education ? `=== EDUCATION ===\n${form.education}` : ""}
${form.experience ? `=== WORK EXPERIENCE ===\n${form.experience}` : ""}
${form.projects ? `=== PROJECTS ===\n${form.projects}` : ""}
${form.skills ? `=== SKILLS ===\n${form.skills}` : ""}
${form.achievements ? `=== ACHIEVEMENTS ===\n${form.achievements}` : ""}

Strict omission rule:
- Include WORK EXPERIENCE section only when the WORK EXPERIENCE block is present above.
- Include PROJECTS section only when the PROJECTS block is present above.
- Include SKILLS section only when the SKILLS block is present above.
- Include ACHIEVEMENTS section only when the ACHIEVEMENTS block is present above.
- Do not add any additional sections that were not provided.

Generate the complete LaTeX code now:`;

      let text = await generateWithRetry(prompt);
      text = text.replace(/^```(?:latex|tex)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      text = sanitizeLatex(text);

      const initialViolations = getThemeViolations(text, template.id, Boolean(hasPhoto));
      if (initialViolations.length > 0) {
        const refinePrompt = `You are fixing a LaTeX resume to strictly match a template design system.

TEMPLATE: ${template.name}
${template.promptInstructions}

CURRENT VIOLATIONS (fix all):
${initialViolations.map((v, i) => `${i + 1}. ${v}`).join("\n")}

NON-NEGOTIABLE RULES:
- Return ONLY corrected LaTeX code.
- Keep all user-provided content unchanged in meaning.
- Do NOT add placeholder/fake content.
- Keep sections unnumbered and visually clean.
- Ensure pdflatex compatibility.
${hasPhoto ? "- Keep photo block only if photo.jpg is referenced correctly." : "- Remove all photo references and any includegraphics for photo.jpg."}

LATEX TO FIX:
${text}`;

        try {
          let refined = await generateWithRetry(refinePrompt);
          refined = refined.replace(/^```(?:latex|tex)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
          text = sanitizeLatex(refined);
        } catch {
          // Keep initial generated output if refinement cannot complete.
        }
      }

      setLatexCode(text);
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Generation failed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!latexCode) return;
    setDownloading(true);
    setError("");

    const attemptHtmlTemplatePdf = async (): Promise<Blob> => {
      const response = await fetch("/api/resume-html-to-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate,
          form,
          educations,
          photoBase64,
          sectionOrder,
          ratedSkills: {
            technical: skillsEntry.technicalRatings
              .map((skill) => ({
                name: skill.name.trim(),
                level: Math.min(5, Math.max(1, Math.round(skill.rating))),
              }))
              .filter((skill) => skill.name.length > 0),
            soft: skillsEntry.softRatings
              .map((skill) => ({
                name: skill.name.trim(),
                level: Math.min(5, Math.max(1, Math.round(skill.rating))),
              }))
              .filter((skill) => skill.name.length > 0),
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message = typeof data?.error === "string" ? data.error : "HTML template PDF generation failed";
        throw new Error(message);
      }

      return response.blob();
    };

    const stripPhotoReferencesIfMissing = (code: string): string => {
      if (photoBase64) return code;

      let sanitized = code;
      // Remove entire photo tikz blocks if they contain photo.jpg
      sanitized = sanitized.replace(
        /\\begin\{tikzpicture\}[\s\S]*?photo\.jpg[\s\S]*?\\end\{tikzpicture\}/gi,
        "% photo block removed (no photo uploaded)"
      );
      // Remove direct includegraphics usage of photo.jpg if still present
      sanitized = sanitized.replace(/\\includegraphics(?:\[[^\]]*\])?\{photo\.jpg\}/gi, "");
      return sanitized;
    };

    const isCompilerUnavailable = (message: string) => {
      const lower = message.toLowerCase();
      return (
        lower.includes("pdflatex") &&
        (lower.includes("not installed") || lower.includes("not in path") || lower.includes("compiler not found"))
      );
    };

    const isQuotaError = (message: string) => {
      const lower = message.toLowerCase();
      return lower.includes("quota") || lower.includes("429") || lower.includes("resource_exhausted") || lower.includes("too many requests");
    };

    const attemptCompile = async (code: string): Promise<Blob> => {
      const safeCode = normalizeLatexForCompile(code);
      const body: Record<string, string> = { latex: safeCode };
      if (photoBase64) body.photo = photoBase64;

      const response = await fetch("/api/latex-to-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errorText = typeof data?.error === "string" ? data.error : "PDF conversion failed";
        const logText = typeof data?.log === "string" ? data.log : "";
        const combined = logText
          ? `${errorText}\n\nCompiler log excerpt:\n${logText.slice(-1500)}`
          : errorText;
        throw new Error(combined);
      }

      return response.blob();
    };

    try {
      try {
        const htmlBlob = await attemptHtmlTemplatePdf();
        const htmlUrl = URL.createObjectURL(htmlBlob);
        const htmlLink = document.createElement("a");
        htmlLink.href = htmlUrl;
        htmlLink.download = `${form.fullName.replace(/\s+/g, "_") || "resume"}.pdf`;
        htmlLink.click();
        URL.revokeObjectURL(htmlUrl);
        return;
      } catch (htmlErr: unknown) {
        const htmlMessage = getErrorMessage(htmlErr, "HTML template PDF generation failed");
        setError(`HTML template PDF generation failed:\n${htmlMessage.slice(0, 320)}`);
        return;
      }

      let blob: Blob;
      let compileBaseCode = normalizeLatexForCompile(stripPhotoReferencesIfMissing(latexCode));
      if (compileBaseCode !== latexCode) {
        setLatexCode(compileBaseCode);
      }

      try {
        blob = await attemptCompile(compileBaseCode);
      } catch (firstErr: unknown) {
        // Auto-fix attempt 1: ask Gemini to fix the LaTeX errors
        const errMsg = getErrorMessage(firstErr, "PDF conversion failed");

        if (isCompilerUnavailable(errMsg)) {
          throw new Error(errMsg);
        }

        setError("Compilation failed — auto-fixing LaTeX code (attempt 1)...");

        let fixedCode = "";
        try {
          const fixPrompt = `The following LaTeX resume code failed to compile with pdflatex. Fix ALL errors and return ONLY the corrected LaTeX code, nothing else. Do NOT wrap in markdown code blocks.

COMMON FIX RULES:
- If error mentions pgfutil or pgf internal macros: simplify ALL tikz code, wrap every \\clip in a scope environment, remove \\foreach loops, avoid pgfmath
- If error mentions undefined control sequence: check package imports
- If error mentions missing }: check brace matching
- Always wrap \\clip inside \\begin{scope}...\\end{scope}
- Replace complex tikz nodes for skill pills with simple \\colorbox{color}{text}
- Keep tikzpicture environments minimal: only \\fill, \\draw, \\node, \\clip (in scope)

COMPILATION ERRORS:
${errMsg}

ORIGINAL LATEX CODE:
${compileBaseCode}`;

          fixedCode = await generateWithRetry(fixPrompt);
          fixedCode = fixedCode.replace(/^\`\`\`(?:latex|tex)?\s*\n?/i, "").replace(/\n?\`\`\`\s*$/i, "").trim();
          // Sanitize known problematic tikz patterns
          fixedCode = sanitizeLatex(fixedCode);
          setLatexCode(fixedCode);
          setError("");

          blob = await attemptCompile(fixedCode);
        } catch (fixErr: unknown) {
          // Auto-fix attempt 2: aggressive simplification
          const fixMsg2 = getErrorMessage(fixErr, "PDF conversion failed after auto-fix");

          if (isQuotaError(fixMsg2)) {
            setError("Auto-fix skipped due API quota. Building a compile-safe PDF layout from your data...");
            const fallbackLatex = normalizeLatexForCompile(buildSafeLatexFallback());
            setLatexCode(fallbackLatex);
            try {
              blob = await attemptCompile(fallbackLatex);
            } catch (fallbackErr: unknown) {
              const fallbackMsg = getErrorMessage(fallbackErr, "Fallback compile failed");
              throw new Error(`Auto-fix failed due API quota: ${fixMsg2}\n\nFallback compile also failed: ${fallbackMsg}`);
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${form.fullName.replace(/\s+/g, "_") || "resume"}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            return;
          }

          setError("Auto-fix attempt 1 failed — trying aggressive simplification (attempt 2)...");

          try {
            const fixPrompt2 = `The following LaTeX resume STILL fails to compile even after a first fix attempt. The TikZ code is causing problems.

APPLY THESE AGGRESSIVE FIXES — return ONLY the corrected LaTeX code:
1. REMOVE all \\foreach loops entirely — expand them manually or remove
2. REMOVE all \\pgfmathresult, \\pgfutil, \\pgfmath* commands
3. Replace ALL tikz skill bars/pills with simple \\colorbox{color}{\\strut\\small text} 
4. Wrap EVERY \\clip inside \\begin{scope}...\\end{scope}
5. For sidebar backgrounds, use a single simple \\fill rectangle — nothing complex
6. If tikzpicture causes issues, consider removing decorative tikz entirely and use basic LaTeX (\\rule, \\colorbox, etc.)
7. Do NOT use tikz libraries (no calc, no positioning, no decorations)

COMPILATION ERRORS:
${fixMsg2}

FAILING LATEX CODE:
${fixedCode}`;

            let fixedCode2 = await generateWithRetry(fixPrompt2);
            fixedCode2 = fixedCode2.replace(/^\`\`\`(?:latex|tex)?\s*\n?/i, "").replace(/\n?\`\`\`\s*$/i, "").trim();
            fixedCode2 = sanitizeLatex(fixedCode2);
            setLatexCode(fixedCode2);
            setError("");

            blob = await attemptCompile(fixedCode2);
          } catch (fixErr2: unknown) {
            const fixMsg = getErrorMessage(fixErr2, "PDF conversion failed after auto-fix");
            setError("Auto-fix failed. Building a compile-safe PDF layout from your data...");

            const fallbackLatex = normalizeLatexForCompile(buildSafeLatexFallback());
            setLatexCode(fallbackLatex);

            try {
              blob = await attemptCompile(fallbackLatex);
            } catch (fallbackErr: unknown) {
              const fallbackMsg = getErrorMessage(fallbackErr, "Fallback compile failed");
              throw new Error(`Auto-fix failed after 2 attempts: ${fixMsg}\n\nFallback compile also failed: ${fallbackMsg}`);
            }
          }
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.fullName.replace(/\s+/g, "_") || "resume"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Download failed");
      setError(message);
    } finally {
      setDownloading(false);
    }
  };

  const copyLatex = () => {
    navigator.clipboard.writeText(latexCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sections = [
    { id: "template", label: "Template", icon: Layout },
    { id: "personal", label: "Personal Info", icon: User },
    { id: "photo", label: "Photo", icon: Camera },
    { id: "role", label: "Target Role", icon: Briefcase },
    { id: "education", label: "Education", icon: GraduationCap },
    { id: "experience", label: "Experience", icon: Briefcase },
    { id: "projects", label: "Projects", icon: Code },
    { id: "skills", label: "Skills & More", icon: Trophy },
  ];

  const currentTemplate = getTemplateById(selectedTemplate);
  const hoveredTemplate =
    desktopHoverEnabled && hoverPreviewTemplateId
      ? RESUME_TEMPLATES.find((template) => template.id === hoverPreviewTemplateId) || null
      : null;
  const hasName = form.fullName.trim().length > 0;
  const hasTargetRole = form.targetRole.trim().length > 0;
  const canGenerate = hasName && hasTargetRole;
  const isCreativeTemplate = selectedTemplate === "creative-modern";

  const markTemplatePreviewImageError = (templateId: string) => {
    setTemplatePreviewImageErrors((prev) => {
      if (prev[templateId]) return prev;
      return { ...prev, [templateId]: true };
    });
  };

  const getTemplatePreviewPosition = (target: HTMLElement): TemplateHoverPreviewPosition => {
    const rect = target.getBoundingClientRect();
    const previewWidth = Math.min(352, window.innerWidth - 32);
    const previewHeight = 410;
    const verticalGap = 12;
    const viewportPadding = 12;
    const half = previewWidth / 2;
    const edgeGap = 16;

    const centeredX = rect.left + rect.width / 2;
    const clampedX = Math.min(window.innerWidth - edgeGap - half, Math.max(edgeGap + half, centeredX));
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldRenderAbove =
      spaceAbove >= previewHeight + verticalGap + viewportPadding ||
      (spaceAbove > spaceBelow && spaceBelow < previewHeight);

    const proposedY = shouldRenderAbove
      ? rect.top - previewHeight - verticalGap
      : rect.bottom + verticalGap;
    const clampedY = Math.min(
      window.innerHeight - previewHeight - viewportPadding,
      Math.max(viewportPadding, proposedY)
    );

    return {
      x: clampedX,
      y: clampedY,
      placement: shouldRenderAbove ? "top" : "bottom",
    };
  };

  const showTemplatePreview = (templateId: string, target: HTMLElement, immediate = false) => {
    if (!desktopHoverEnabled) return;

    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }

    const nextPosition = getTemplatePreviewPosition(target);
    const apply = () => {
      setHoverPreviewTemplateId(templateId);
      setHoverPreviewPosition(nextPosition);
    };

    if (immediate) {
      if (hoverOpenTimerRef.current) {
        clearTimeout(hoverOpenTimerRef.current);
        hoverOpenTimerRef.current = null;
      }
      apply();
      return;
    }

    if (hoverOpenTimerRef.current) {
      clearTimeout(hoverOpenTimerRef.current);
    }

    hoverOpenTimerRef.current = setTimeout(() => {
      apply();
      hoverOpenTimerRef.current = null;
    }, 70);
  };

  const hideTemplatePreview = () => {
    if (!desktopHoverEnabled) return;

    if (hoverOpenTimerRef.current) {
      clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current);
    }

    hoverCloseTimerRef.current = setTimeout(() => {
      setHoverPreviewTemplateId(null);
      setHoverPreviewPosition(null);
      hoverCloseTimerRef.current = null;
    }, 110);
  };

  const renderRatedSkillGroup = (
    group: SkillRatingGroup,
    title: string,
    addButtonLabel: string,
    fillClassName: string
  ) => {
    const entries = skillsEntry[group];

    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">{title}</label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 h-7 px-2.5 text-[11px]"
            onClick={() => addRatedSkill(group)}
          >
            <Plus className="h-3.5 w-3.5" /> {addButtonLabel}
          </Button>
        </div>

        {entries.length === 0 && (
          <p className="text-[11px] text-muted-foreground">Add skills to render rating bars in the Creative Modern template.</p>
        )}

        <div className="space-y-2.5">
          {entries.map((entry) => {
            const widthClassByRating: Record<number, string> = {
              1: "w-1/5",
              2: "w-2/5",
              3: "w-3/5",
              4: "w-4/5",
              5: "w-full",
            };
            const progressClass = widthClassByRating[entry.rating] || "w-3/5";

            return (
              <div key={entry.id} className="rounded-xl border border-glass-border bg-surface-1 p-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    placeholder="Skill name"
                    value={entry.name}
                    onChange={(e) => updateRatedSkill(group, entry.id, "name", e.target.value)}
                    className="sm:flex-1"
                  />

                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => updateRatedSkill(group, entry.id, "rating", level)}
                        className={`h-7 w-7 rounded-md border text-[11px] font-semibold transition-all ${
                          entry.rating >= level
                            ? "border-primary/50 bg-primary/15 text-primary"
                            : "border-glass-border bg-surface-2 text-muted-foreground"
                        }`}
                        title={`Set rating to ${level}`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRatedSkill(group, entry.id)}
                    className="gap-1 h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </Button>
                </div>

                <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <div className={`h-full rounded-full ${fillClassName} ${progressClass}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="max-w-[1440px] mx-auto"
    >
      <PageHeader
        icon={FileText}
        title="Resume Builder"
        subtitle="Choose a template, add your details & photo, AI generates a professional LaTeX resume"
        gradient="from-violet-500 to-purple-600"
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 mb-6 text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      <div className="flex gap-6">
        {/* Left: Vertical Step Nav */}
        <div className="hidden lg:flex flex-col gap-1 w-48 shrink-0 sticky top-24 self-start">
          {sections.map((s, i) => {
            const isActive = activeSection === s.id;
            const sectionIndex = sections.findIndex((sec) => sec.id === activeSection);
            const isPast = i < sectionIndex;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-300 ${
                  isActive
                    ? "bg-primary/10 border border-primary/30 shadow-[0_0_20px_rgba(139,92,246,0.12)]"
                    : isPast
                      ? "border border-transparent hover:bg-surface-2"
                      : "border border-transparent hover:bg-surface-2"
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300 ${
                    isActive
                      ? "bg-primary text-white shadow-[0_0_12px_rgba(139,92,246,0.4)]"
                      : isPast
                        ? "bg-primary/20 text-primary"
                        : "bg-surface-4 text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {isPast ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <s.icon className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <span
                    className={`text-xs font-medium block transition-colors ${
                      isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">Step {i + 1}</span>
                </div>
              </button>
            );
          })}

          {/* Vertical progress line */}
          <div className="mt-4 mx-auto w-px h-8 bg-linear-to-b from-primary/30 to-transparent" />

          {/* Template info mini card at bottom of stepper */}
          <div className="mt-2 p-3 rounded-xl border border-glass-border bg-glass-bg">
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`h-7 w-7 rounded-md bg-linear-to-br ${currentTemplate.color} flex items-center justify-center text-sm shrink-0`}>
                {currentTemplate.preview}
              </div>
              <span className="text-[11px] font-semibold truncate">{currentTemplate.name}</span>
            </div>
            {photoPreview && currentTemplate.hasPhoto && (
              <div className="flex items-center gap-2 mt-1">
                <img src={photoPreview} alt="" className="h-5 w-5 rounded-full object-cover ring-1 ring-primary/30" />
                <span className="text-[10px] text-muted-foreground">Photo attached</span>
              </div>
            )}
          </div>
        </div>

        {/* Mobile: Horizontal tabs (only visible on small screens) */}
        <div className="lg:hidden flex flex-wrap gap-2 mb-4 p-1 rounded-xl bg-surface-1 border border-glass-border w-full">
          {sections.map((s) => (
            <Button
              key={s.id}
              variant={activeSection === s.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveSection(s.id)}
              className={`gap-1.5 text-xs rounded-lg transition-all duration-200 ${
                activeSection === s.id
                  ? "shadow-[0_0_15px_rgba(139,92,246,0.3)] bg-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </Button>
          ))}
        </div>

        {/* Center: Form Content */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Template Selection */}
          {activeSection === "template" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2.5">
                    <Layout className="h-5 w-5 text-primary" />
                    <span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Choose Your Template</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">Select the style that best fits your target role</p>
                </div>
              </div>

              <AnimatePresence>
                {desktopHoverEnabled && hoveredTemplate && hoverPreviewPosition && (
                  <motion.div
                    id="template-hover-preview"
                    role="status"
                    aria-live="polite"
                    initial={{
                      opacity: 0,
                      scale: 0.95,
                      y: hoverPreviewPosition.placement === "top" ? 8 : -8,
                    }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      scale: 0.96,
                      y: hoverPreviewPosition.placement === "top" ? 6 : -6,
                    }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="pointer-events-none fixed z-50 w-[min(22rem,calc(100vw-2rem))]"
                    style={{
                      left: hoverPreviewPosition.x,
                      top: hoverPreviewPosition.y,
                    }}
                  >
                    <div
                      className="relative -translate-x-1/2 overflow-hidden rounded-2xl border border-white/15 bg-[#0b1020]/95 p-2 shadow-[0_18px_48px_rgba(2,6,23,0.65)] backdrop-blur-xl"
                    >
                      <div className="relative h-80 overflow-hidden rounded-xl border border-white/10 bg-slate-950">
                        {hoveredTemplate.previewImageUrl && !templatePreviewImageErrors[hoveredTemplate.id] ? (
                          <img
                            src={hoveredTemplate.previewImageUrl}
                            alt={hoveredTemplate.previewImageAlt || `${hoveredTemplate.name} preview`}
                            className="h-full w-full object-contain object-top"
                            onError={() => markTemplatePreviewImageError(hoveredTemplate.id)}
                          />
                        ) : (
                          <div className={`absolute inset-0 bg-linear-to-br ${hoveredTemplate.color} flex items-center justify-center`}>
                            <span className="text-5xl">{hoveredTemplate.preview}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-2 px-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">Template Preview</p>
                        <div className="mt-1 flex items-start justify-between gap-2">
                          <h4 className="text-xs font-semibold leading-tight text-white">{hoveredTemplate.name}</h4>
                          <div className={`h-7 w-7 shrink-0 rounded-lg bg-linear-to-br ${hoveredTemplate.color} flex items-center justify-center text-sm shadow-lg`}>
                            {hoveredTemplate.preview}
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{hoveredTemplate.description}</p>
                      </div>

                      <div
                        className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-[#0b1020]/95 ${
                          hoverPreviewPosition.placement === "top"
                            ? "-bottom-1 border-r border-b border-white/15"
                            : "-top-1 border-l border-t border-white/15"
                        }`}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {RESUME_TEMPLATES.map((t) => (
                  <div key={t.id} className="relative">
                    <button
                      onClick={() => setSelectedTemplate(t.id)}
                      onMouseEnter={(e) => showTemplatePreview(t.id, e.currentTarget)}
                      onMouseLeave={hideTemplatePreview}
                      onFocus={(e) => showTemplatePreview(t.id, e.currentTarget, true)}
                      onBlur={hideTemplatePreview}
                      aria-describedby={
                        desktopHoverEnabled && hoverPreviewTemplateId === t.id
                          ? "template-hover-preview"
                          : undefined
                      }
                      className={`group text-left p-4 rounded-2xl border transition-all duration-300 relative overflow-hidden w-full ${
                        selectedTemplate === t.id
                          ? "border-primary/40 bg-primary/10 shadow-[0_0_30px_rgba(139,92,246,0.15)] ring-1 ring-primary/20"
                          : "border-glass-border bg-glass-bg hover:border-[rgba(139,92,246,0.2)] hover:bg-surface-3 hover:shadow-[0_0_20px_rgba(139,92,246,0.06)]"
                      }`}
                    >
                      {selectedTemplate === t.id && (
                        <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />
                      )}
                      <div className="flex items-start justify-between mb-3">
                        <div className={`h-12 w-12 rounded-xl bg-linear-to-br ${t.color} flex items-center justify-center text-xl shadow-lg`}>
                          {t.preview}
                        </div>
                        {selectedTemplate === t.id && (
                          <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-[0_0_10px_rgba(139,92,246,0.4)]">
                            <CheckCircle className="h-3.5 w-3.5 text-white" />
                          </div>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold mb-1">{t.name}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
                      <div className="mt-3 flex gap-2">
                        {t.hasPhoto && (
                          <Badge variant="secondary" className="text-[10px] px-2 py-0.5">📷 Photo</Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5">LaTeX</Badge>
                      </div>
                    </button>
                  </div>
                ))}
              </div>

              <Card>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Customize Section Order</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Drag and drop sections to control generated resume order.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs" onClick={resetSectionOrder}>
                      Reset
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {sectionOrder.map((key, idx) => {
                      const isDragging = draggingSection === key;
                      return (
                        <div
                          key={key}
                          draggable
                          onDragStart={() => handleSectionDragStart(key)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleSectionDrop(key)}
                          onDragEnd={handleSectionDragEnd}
                          title="Drag to reorder"
                          className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all duration-150 ${
                            isDragging
                              ? "border-primary/40 bg-primary/10"
                              : "border-glass-border bg-surface-1 hover:bg-surface-2"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium">{SECTION_ORDER_LABELS[key]}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">{idx + 1}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Photo Upload */}
          {activeSection === "photo" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2.5">
                      <Camera className="h-5 w-5 text-primary" />
                      <span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Profile Photo</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">Add a professional headshot for photo-compatible templates</p>
                  </div>
              
                  {!currentTemplate.hasPhoto && (
                    <div className="bg-warning/10 border border-warning/30 text-warning rounded-xl px-4 py-3 text-xs">
                      ⚠️ The &ldquo;{currentTemplate.name}&rdquo; template doesn&apos;t support photos. Choose a photo-compatible template.
                    </div>
                  )}

                  <div className="flex items-start gap-8">
                    <div className="flex-1">
                      <div
                        onClick={() => currentTemplate.hasPhoto && fileInputRef.current?.click()}
                        className={`border border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ${
                          currentTemplate.hasPhoto
                            ? "border-primary/30 hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_0_25px_rgba(139,92,246,0.1)]"
                            : "border-glass-border opacity-50 cursor-not-allowed"
                        }`}
                      >
                        <div className="h-14 w-14 mx-auto mb-3 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <ImagePlus className="w-7 h-7 text-primary/60" />
                        </div>
                        <p className="text-sm font-medium text-foreground/80">Click to upload photo</p>
                        <p className="text-xs text-muted-foreground/60 mt-1.5">JPG, PNG — Max 5MB</p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/jpg"
                        onChange={handlePhotoUpload}
                        className="hidden"
                        disabled={!currentTemplate.hasPhoto}
                        title="Upload profile photo"
                      />
                    </div>

                    {photoPreview && (
                      <div className="relative">
                        <div className="rounded-full p-1 bg-linear-to-br from-primary/40 to-violet-500/40 shadow-[0_0_25px_rgba(139,92,246,0.2)]">
                          <img
                            src={photoPreview}
                            alt="Profile preview"
                            className="w-32 h-32 rounded-full object-cover"
                          />
                        </div>
                        <button
                          onClick={removePhoto}
                          title="Remove photo"
                          className="absolute -top-1 -right-1 w-7 h-7 bg-danger text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {photoBase64 && (
                    <div className="bg-success/10 border border-success/30 text-success rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5" /> Photo uploaded successfully. It will be included in your resume.
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Personal Info */}
          {activeSection === "personal" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2.5">
                      <User className="h-5 w-5 text-primary" />
                      <span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Personal Information</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">Your contact details for the resume header</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Full Name *</label>
                      <Input
                        placeholder="John Doe"
                        value={form.fullName}
                        onChange={(e) => updateForm("fullName", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Email</label>
                      <Input
                        placeholder="john@example.com"
                        value={form.email}
                        onChange={(e) => updateForm("email", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Phone</label>
                      <Input
                        placeholder="+1 (555) 123-4567"
                        value={form.phone}
                        onChange={(e) => updateForm("phone", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Location</label>
                      <Input
                        placeholder="San Francisco, CA"
                        value={form.location}
                        onChange={(e) => updateForm("location", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">LinkedIn URL</label>
                      <Input
                        placeholder="linkedin.com/in/johndoe"
                        value={form.linkedin}
                        onChange={(e) => updateForm("linkedin", e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">GitHub URL</label>
                      <Input
                        placeholder="github.com/johndoe"
                        value={form.github}
                        onChange={(e) => updateForm("github", e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Target Role */}
          {activeSection === "role" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2.5">
                      <Briefcase className="h-5 w-5 text-primary" />
                      <span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Target Role</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">Define your target position — AI will tailor the resume</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Role Title *</label>
                    <Input
                      placeholder="Senior Software Engineer"
                      value={form.targetRole}
                      onChange={(e) => updateForm("targetRole", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">Job Description (optional — helps AI tailor your resume)</label>
                      <div className="flex items-center gap-2">
                        {jdFileName && !jdLoading && (
                          <span className="flex items-center gap-1.5 text-xs text-success bg-success/10 border border-success/20 px-2 py-1 rounded-lg">
                            <CheckCircle className="w-3 h-3" /> {jdFileName}
                            <button onClick={clearJDFile} title="Clear job description" className="text-danger/60 hover:text-danger ml-1">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        )}
                        {jdLoading && (
                          <span className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg">
                            <Loader2 className="w-3 h-3 animate-spin" /> Extracting text...
                          </span>
                        )}
                        <button
                          onClick={() => jdFileInputRef.current?.click()}
                          disabled={jdLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/30 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-all disabled:opacity-50"
                        >
                          <Upload className="h-3.5 w-3.5" /> Upload File
                        </button>
                        <input
                          ref={jdFileInputRef}
                          type="file"
                          accept=".txt,.text,.md,.pdf"
                          onChange={handleJDUpload}
                          className="hidden"
                          title="Upload job description file"
                        />
                      </div>
                    </div>
                    <Textarea
                      placeholder="Paste the job description here, or upload a file above..."
                      rows={6}
                      value={form.jobDescription}
                      onChange={(e) => {
                        updateForm("jobDescription", e.target.value);
                        if (jdFileName) setJdFileName(null);
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Professional Summary</label>
                    <Textarea
                      placeholder="Write a brief summary or leave blank for AI to generate one"
                      rows={3}
                      value={form.summary}
                      onChange={(e) => updateForm("summary", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Education */}
          {activeSection === "education" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2.5">
                    <GraduationCap className="h-5 w-5 text-primary" />
                    <span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Education</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">Add your educational background</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addEducation}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Entry
                </Button>
              </div>

              {educations.map((edu, idx) => (
                <Card key={edu.id}>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-primary/15 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-primary">{idx + 1}</span>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">Education Entry</span>
                      </div>
                      {educations.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeEducation(edu.id)}
                          className="gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-7"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">Degree</label>
                        <Input
                          placeholder="B.Tech, B.Sc, MBA..."
                          value={edu.degree}
                          onChange={(e) => updateEducation(edu.id, "degree", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">Field of Study</label>
                        <Input
                          placeholder="Computer Science"
                          value={edu.fieldOfStudy}
                          onChange={(e) => updateEducation(edu.id, "fieldOfStudy", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground">Institution</label>
                      <Input
                        placeholder="University Name"
                        value={edu.institution}
                        onChange={(e) => updateEducation(edu.id, "institution", e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">Start Year</label>
                        <Input
                          type="number"
                          placeholder="2020"
                          min={1970}
                          max={2040}
                          value={edu.startYear}
                          onChange={(e) => updateEducation(edu.id, "startYear", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">End Year (or Expected)</label>
                        <Input
                          type="number"
                          placeholder="2024"
                          min={1970}
                          max={2040}
                          value={edu.endYear}
                          onChange={(e) => updateEducation(edu.id, "endYear", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground">Marks / Grade</label>
                      <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex rounded-xl border border-glass-border overflow-hidden bg-surface-1">
                          {gradeTypes.map((gt) => (
                            <button
                              key={gt.value}
                              onClick={() => {
                                updateEducation(edu.id, "gradeType", gt.value);
                                if (gt.defaultScale) {
                                  updateEducation(edu.id, "gradeScale", gt.defaultScale);
                                } else {
                                  updateEducation(edu.id, "gradeScale", "");
                                }
                              }}
                              className={`px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                                edu.gradeType === gt.value
                                  ? "bg-primary text-white shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                                  : "text-muted-foreground hover:text-foreground hover:bg-surface-4"
                              }`}
                            >
                              {gt.label}
                            </button>
                          ))}
                        </div>
                        <input
                          className="w-20 bg-surface-2 border border-glass-border rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:border-primary/40 focus:shadow-[0_0_10px_rgba(139,92,246,0.1)] transition-all"
                          placeholder={edu.gradeType === "Grade" ? "A+" : "9.1"}
                          value={edu.gradeValue}
                          onChange={(e) => updateEducation(edu.id, "gradeValue", e.target.value)}
                        />
                        {edu.gradeType !== "Grade" && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <span>/</span>
                            <input
                              className="w-14 bg-surface-2 border border-glass-border rounded-xl px-2 py-2 text-sm text-center focus:outline-none focus:border-primary/40 focus:shadow-[0_0_10px_rgba(139,92,246,0.1)] transition-all"
                              placeholder="10"
                              value={edu.gradeScale}
                              onChange={(e) => updateEducation(edu.id, "gradeScale", e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground">Relevant Coursework (optional)</label>
                      <Input
                        placeholder="Data Structures, Algorithms, Machine Learning..."
                        value={edu.coursework}
                        onChange={(e) => updateEducation(edu.id, "coursework", e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}

              {educations.length > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 text-xs text-muted-foreground backdrop-blur-sm">
                  <span className="text-primary font-medium">{educations.filter((e) => e.degree || e.institution).length}</span> education {educations.filter((e) => e.degree || e.institution).length === 1 ? "entry" : "entries"} added
                </div>
              )}
            </motion.div>
          )}

          {/* Experience */}
          {activeSection === "experience" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2.5">
                    <Briefcase className="h-5 w-5 text-primary" />
                    <span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Work Experience</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">Add separate work experience entries with clear bullet points</p>
                </div>
                <Button variant="outline" size="sm" onClick={addExperience} className="gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add Experience
                </Button>
              </div>

              {experiences.map((exp, idx) => (
                <Card key={exp.id}>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Experience Entry {idx + 1}</span>
                      {experiences.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeExperience(exp.id)}
                          className="gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-7"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">Role</label>
                        <Input placeholder="Software Engineer" value={exp.role} onChange={(e) => updateExperience(exp.id, "role", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">Company</label>
                        <Input placeholder="Google" value={exp.company} onChange={(e) => updateExperience(exp.id, "company", e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">Duration</label>
                        <Input placeholder="Jan 2023 - Present" value={exp.duration} onChange={(e) => updateExperience(exp.id, "duration", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">Location</label>
                        <Input placeholder="Bangalore, India" value={exp.location} onChange={(e) => updateExperience(exp.id, "location", e.target.value)} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground">Description Points</label>
                      <Textarea
                        rows={5}
                        placeholder={"- Built microservices handling 1M+ requests/day\n- Reduced API latency by 40%"}
                        value={exp.points}
                        onChange={(e) => updateExperience(exp.id, "points", e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          )}

          {/* Projects */}
          {activeSection === "projects" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2.5">
                    <Code className="h-5 w-5 text-primary" />
                    <span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Projects</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">Add each project with title, link, and bullet-point description</p>
                </div>
                <Button variant="outline" size="sm" onClick={addProject} className="gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add Project
                </Button>
              </div>

              {projects.map((proj, idx) => (
                <Card key={proj.id}>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Project Entry {idx + 1}</span>
                      {projects.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeProject(proj.id)}
                          className="gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-7"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">Project Name</label>
                        <Input placeholder="JobNest" value={proj.name} onChange={(e) => updateProject(proj.id, "name", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground">Project Link</label>
                        <Input placeholder="https://github.com/you/project" value={proj.link} onChange={(e) => updateProject(proj.id, "link", e.target.value)} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-muted-foreground">Description Points</label>
                      <Textarea
                        rows={5}
                        placeholder={"- Built job listing and application interface\n- Designed reusable UI components"}
                        value={proj.points}
                        onChange={(e) => updateProject(proj.id, "points", e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </motion.div>
          )}

          {/* Skills & Achievements */}
          {activeSection === "skills" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2.5">
                      <Trophy className="h-5 w-5 text-primary" />
                      <span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Skills & Achievements</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isCreativeTemplate
                        ? "Creative Modern supports 1-5 skill ratings with horizontal bars in the final PDF."
                        : "Add technical and soft skills separately"}
                    </p>
                  </div>

                  {isCreativeTemplate && (
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Creative Skill Ratings</h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Use a 1-5 scale. These entries render as horizontal bars in the Creative sidebar.</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5 shrink-0">Scale 1-5</Badge>
                      </div>

                      {renderRatedSkillGroup(
                        "technicalRatings",
                        "Technical Ratings",
                        "Add Skill",
                        "bg-linear-to-r from-blue-500 to-cyan-500"
                      )}

                      {renderRatedSkillGroup(
                        "softRatings",
                        "Soft Skill Ratings",
                        "Add Skill",
                        "bg-linear-to-r from-fuchsia-500 to-rose-500"
                      )}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {isCreativeTemplate ? "Technical Skills (optional manual list)" : "Technical Skills"}
                    </label>
                    <Textarea
                      placeholder="HTML, CSS, JavaScript, React, Node.js, SQL..."
                      rows={4}
                      value={skillsEntry.technical}
                      onChange={(e) => updateSkillsEntry("technical", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      {isCreativeTemplate ? "Soft Skills (optional manual list)" : "Soft Skills"}
                    </label>
                    <Textarea
                      placeholder="Communication, Teamwork, Leadership, Problem Solving..."
                      rows={3}
                      value={skillsEntry.soft}
                      onChange={(e) => updateSkillsEntry("soft", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Achievements & Certifications (optional)</label>
                    <Textarea
                      placeholder={"AWS Certified\n1st in Hackathon\nPublished paper in IEEE"}
                      rows={4}
                      value={form.achievements}
                      onChange={(e) => updateForm("achievements", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Generate Bar */}
          <div className="sticky bottom-4 z-20">
            {saveNotice && (
              <div className="mb-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                {saveNotice}
              </div>
            )}
            <div className="p-3 rounded-2xl border border-glass-border bg-sticky-bg backdrop-blur-xl shadow-[0_-8px_30px_var(--shadow-heavy)]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className={`h-9 w-9 rounded-lg bg-linear-to-br ${currentTemplate.color} flex items-center justify-center text-base shrink-0`}>
                    {currentTemplate.preview}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{currentTemplate.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{currentTemplate.description}</div>
                  </div>
                </div>
                {photoPreview && currentTemplate.hasPhoto && (
                  <img src={photoPreview} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-primary/30 shrink-0" />
                )}
                {!canGenerate && (
                  <div className="hidden md:block text-[11px] text-amber-400/90 shrink-0">
                    Missing: {!hasName ? "Name" : ""}{!hasName && !hasTargetRole ? " + " : ""}{!hasTargetRole ? "Target Role" : ""}
                  </div>
                )}
                <Button
                  onClick={handleSaveProgress}
                  variant="outline"
                  className="gap-2 px-4 py-5 text-sm shrink-0"
                  title="Save current progress locally"
                >
                  <Save className="h-4 w-4" /> Save Progress
                </Button>
                <Button
                  onClick={generateResume}
                  disabled={loading || !canGenerate}
                  variant="glow"
                  title={!canGenerate ? "Enter Full Name and Target Role to enable Generate" : "Generate resume"}
                  className={`gap-2 px-6 py-5 text-sm shrink-0 transition-all ${
                    canGenerate
                      ? "bg-linear-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
                      : "bg-surface-3 text-muted-foreground border border-glass-border cursor-not-allowed opacity-70"
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" /> Generate
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Output Section — Full Width Below Form */}
      {latexCode ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">LaTeX Output</h3>
                    <p className="text-[11px] text-muted-foreground">Your generated resume code</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyLatex}
                    className="gap-1.5 text-xs"
                  >
                    {copied ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={downloadPDF}
                    disabled={downloading}
                    className="gap-1.5 text-xs"
                  >
                    {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {downloading ? "Converting..." : "PDF"}
                  </Button>
                </div>
              </div>
              <pre className="latex-code max-h-[500px] bg-code-bg border border-glass-border rounded-lg p-4 overflow-auto text-sm">{latexCode}</pre>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}
    </motion.div>
  );
}

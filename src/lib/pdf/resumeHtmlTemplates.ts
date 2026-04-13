export type ResumeFormData = {
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
};

function shouldUseModernCompact(payload: ResumePdfPayload): boolean {
  if (payload.templateId !== "modern-professional") return false;
  return false;
}

function shouldUseClassicFill(payload: ResumePdfPayload): boolean {
  if (payload.templateId !== "classic-elegant") return false;
  return true;
}

function shouldUseMinimalFill(payload: ResumePdfPayload): boolean {
  if (payload.templateId !== "minimal-clean") return false;

  const formDensity =
    splitLines(payload.form.summary).length +
    splitLines(payload.form.experience).length +
    splitLines(payload.form.education).length +
    splitLines(payload.form.skills).length +
    splitLines(payload.form.projects).length +
    splitLines(payload.form.achievements).length;

  const structuredEducationWeight = payload.educations.filter((e) => e.degree.trim() || e.institution.trim()).length * 2;
  const densityScore = formDensity + structuredEducationWeight;

  // Fill mode is intended for low/medium content; dense resumes remain compact to prevent clipping.
  return densityScore <= 48;
}

function shouldUseTechFill(payload: ResumePdfPayload): boolean {
  if (payload.templateId !== "tech-developer") return false;

  const formDensity =
    splitLines(payload.form.summary).length +
    splitLines(payload.form.experience).length +
    splitLines(payload.form.education).length +
    splitLines(payload.form.skills).length +
    splitLines(payload.form.projects).length +
    splitLines(payload.form.achievements).length;

  const structuredEducationWeight = payload.educations.filter((e) => e.degree.trim() || e.institution.trim()).length * 2;
  const structuredExperienceWeight = parseExperienceBlocks(payload.form.experience).length * 2;
  const structuredProjectWeight = parseProjectBlocks(payload.form.projects).length;

  const densityScore =
    formDensity +
    structuredEducationWeight +
    structuredExperienceWeight +
    structuredProjectWeight;

  // Fill mode keeps sparse/medium resumes visually full while dense payloads stay compact.
  return densityScore <= 58;
}

function shouldUseExecutiveFill(payload: ResumePdfPayload): boolean {
  if (payload.templateId !== "executive-premium") return false;

  const formDensity =
    splitLines(payload.form.summary).length +
    splitLines(payload.form.experience).length +
    splitLines(payload.form.education).length +
    splitLines(payload.form.skills).length +
    splitLines(payload.form.projects).length +
    splitLines(payload.form.achievements).length;

  const structuredEducationWeight = payload.educations.filter((e) => e.degree.trim() || e.institution.trim()).length * 2;
  const structuredExperienceWeight = parseExperienceBlocks(payload.form.experience).length * 2;
  const structuredProjectWeight = parseProjectBlocks(payload.form.projects).length * 2;

  const densityScore =
    formDensity +
    structuredEducationWeight +
    structuredExperienceWeight +
    structuredProjectWeight;

  // Executives often carry denser narrative content, so fill mode uses a higher threshold.
  return densityScore <= 64;
}

export type ResumeEducationEntry = {
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
};

export type ResumeRatedSkill = {
  name: string;
  level: number;
};

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

const DEFAULT_SECTION_ORDER: ResumeSectionKey[] = [
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

const MINIMAL_DEFAULT_SECTION_ORDER: ResumeSectionKey[] = [
  "summary",
  "experience",
  "education",
  "certificate",
  "skills",
  "projects",
  "awards",
  "publications",
  "affiliations",
];

const EXECUTIVE_MAIN_SECTION_ORDER: ResumeSectionKey[] = [
  "summary",
  "experience",
  "projects",
  "certificate",
  "awards",
  "publications",
  "affiliations",
];

export type ResumePdfPayload = {
  templateId: string;
  form: ResumeFormData;
  educations: ResumeEducationEntry[];
  photoBase64?: string | null;
  sectionOrder?: ResumeSectionKey[];
  ratedSkills?: {
    technical?: ResumeRatedSkill[];
    soft?: ResumeRatedSkill[];
  };
};

function cleanInvisible(text: string): string {
  return text
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2028\u2029]/g, "\n")
    .normalize("NFKC");
}

function escapeHtml(text: string): string {
  return cleanInvisible(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitLines(value: string): string[] {
  return cleanInvisible(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s*/, ""));
}

function normalizeUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

function joinNonEmpty(parts: string[], sep: string): string {
  const filtered = parts.filter((p) => p.trim().length > 0);
  return filtered.join(sep);
}

function buildExecutiveMonogram(fullName: string): string {
  const parts = fullName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "EP";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function normalizeSectionOrder(sectionOrder?: ResumeSectionKey[]): ResumeSectionKey[] {
  const known = new Set<ResumeSectionKey>(DEFAULT_SECTION_ORDER);
  const normalized: ResumeSectionKey[] = [];

  if (Array.isArray(sectionOrder)) {
    for (const key of sectionOrder) {
      if (!known.has(key)) continue;
      if (normalized.includes(key)) continue;
      normalized.push(key);
    }
  }

  for (const key of DEFAULT_SECTION_ORDER) {
    if (!normalized.includes(key)) {
      normalized.push(key);
    }
  }

  return normalized;
}

function hasDefaultSectionOrder(sectionOrder: ResumeSectionKey[] | undefined): boolean {
  if (!sectionOrder) return true;
  const normalized = normalizeSectionOrder(sectionOrder);
  return normalized.every((key, idx) => key === DEFAULT_SECTION_ORDER[idx]);
}

function renderOrderedSections(
  sectionOrder: ResumeSectionKey[] | undefined,
  sectionMap: Partial<Record<ResumeSectionKey, string>>
): string {
  const order = normalizeSectionOrder(sectionOrder);
  return order
    .map((key) => sectionMap[key] || "")
    .filter((block) => block.trim().length > 0)
    .join("");
}

function renderSection(title: string, body: string): string {
  if (!body.trim()) return "";

  const sectionSlug = cleanInvisible(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const sectionClass = sectionSlug ? ` section-${sectionSlug}` : "";

  return `<section class="section${sectionClass}"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function renderBulletLines(lines: string[]): string {
  if (lines.length === 0) return "";
  return `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
}

function renderEducation(educations: ResumeEducationEntry[], fallbackText: string): string {
  const valid = educations.filter((e) => e.degree.trim() || e.institution.trim());

  if (valid.length === 0) {
    const fallbackLines = splitLines(fallbackText);
    return renderBulletLines(fallbackLines);
  }

  return valid
    .map((e) => {
      const degree = joinNonEmpty([e.degree, e.fieldOfStudy ? `in ${e.fieldOfStudy}` : ""], " ");
      const dateRange = joinNonEmpty([e.startYear, e.endYear], " - ");
      const grade = e.gradeValue
        ? e.gradeType === "Grade"
          ? `Grade: ${e.gradeValue}`
          : `${e.gradeType}: ${e.gradeValue}${e.gradeScale ? `/${e.gradeScale}` : ""}`
        : "";
      const coursework = e.coursework ? `Relevant Coursework: ${e.coursework}` : "";

      return `<div class="edu-item">
        <div class="edu-head">
          <div class="edu-title">${escapeHtml(joinNonEmpty([degree, e.institution], ", "))}</div>
          ${dateRange ? `<div class="edu-date">${escapeHtml(dateRange)}</div>` : ""}
        </div>
        ${grade ? `<div class="edu-meta">${escapeHtml(grade)}</div>` : ""}
        ${coursework ? `<div class="edu-meta">${escapeHtml(coursework)}</div>` : ""}
      </div>`;
    })
    .join("");
}

function renderHeader(payload: ResumePdfPayload): string {
  const { form } = payload;
  const showPhoto =
    (payload.templateId === "tech-developer" ||
      payload.templateId === "modern-professional" ||
      payload.templateId === "creative-modern") &&
    Boolean(payload.photoBase64);

  const links: string[] = [];
  if (form.email.trim()) {
    links.push(`<a href="mailto:${escapeHtml(form.email.trim())}">${escapeHtml(form.email.trim())}</a>`);
  }
  if (form.linkedin.trim()) {
    const u = normalizeUrl(form.linkedin);
    links.push(`<a href="${escapeHtml(u)}">${escapeHtml(form.linkedin.trim())}</a>`);
  }
  if (form.github.trim()) {
    const u = normalizeUrl(form.github);
    links.push(`<a href="${escapeHtml(u)}">${escapeHtml(form.github.trim())}</a>`);
  }

  const contactLine = joinNonEmpty(
    [form.phone.trim(), form.location.trim()].map((v) => escapeHtml(v)),
    " | "
  );

  if (payload.templateId === "executive-premium") {
    const fullName = form.fullName.trim() || "Executive Candidate";
    const monogram = buildExecutiveMonogram(fullName);

    return `<header class="header executive-header">
      <div class="executive-monogram" aria-hidden="true">${escapeHtml(monogram)}</div>
      <h1>${escapeHtml(fullName)}</h1>
      <div class="role">${escapeHtml(form.targetRole || "Professional Title")}</div>
    </header>`;
  }

  if (payload.templateId === "creative-modern") {
    const creativeLinks = links.length > 0 ? links.join(" | ") : "";

    return `<header class="header creative-header">
      <div class="creative-banner"></div>
      <div class="creative-header-content">
        ${showPhoto
          ? `<img class="creative-photo" src="${payload.photoBase64}" alt="Profile photo" />`
          : `<div class="creative-photo-placeholder" aria-hidden="true"></div>`}
        <div class="creative-identity">
          <h1>${escapeHtml(form.fullName || "Candidate")}</h1>
          <div class="role">${escapeHtml(form.targetRole || "Professional")}</div>
          ${contactLine ? `<div class="creative-contact">${contactLine}</div>` : ""}
          ${creativeLinks ? `<div class="creative-links">${creativeLinks}</div>` : ""}
        </div>
      </div>
    </header>`;
  }

  return `<header class="header">
    <div class="header-main">
      <div class="header-text">
        <h1>${escapeHtml(form.fullName || "Candidate")}</h1>
        <div class="role">${escapeHtml(form.targetRole || "Professional")}</div>
        ${contactLine ? `<div class="contact">${contactLine}</div>` : ""}
        ${links.length > 0 ? `<div class="links">${links.join(" | ")}</div>` : ""}
      </div>
      ${showPhoto ? `<img class="profile-photo" src="${payload.photoBase64}" alt="Profile photo" />` : ""}
    </div>
  </header>`;
}

type ParsedMeta = {
  technical: string[];
  subjectsOfInterest: string[];
  additionalSkills: string[];
  additionalDetails: string[];
  declaration: string;
};

function splitInlineValues(text: string): string[] {
  return text
    .split(/[;,|]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function clampSkillLevel(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

function uniqueTextValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = value.trim();
    if (!cleaned) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function sanitizeRatedSkills(raw: unknown): ResumeRatedSkill[] {
  if (!Array.isArray(raw)) return [];

  const normalized = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;

      const candidate = entry as Partial<ResumeRatedSkill>;
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      if (!name) return null;

      return {
        name,
        level: clampSkillLevel(candidate.level),
      };
    })
    .filter((entry): entry is ResumeRatedSkill => Boolean(entry));

  const seen = new Set<string>();
  return normalized.filter((entry) => {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractLabeledSkills(text: string, label: "technical" | "soft"): string[] {
  const matcher =
    label === "technical"
      ? /^technical\s+skills?\s*:\s*(.+)$/i
      : /^soft\s+skills?\s*:\s*(.+)$/i;

  const extracted: string[] = [];
  for (const line of splitLines(text)) {
    const match = line.match(matcher);
    if (!match) continue;
    extracted.push(...splitInlineValues(match[1]));
  }

  return uniqueTextValues(extracted);
}

function resolveCreativeRatedSkills(payload: ResumePdfPayload): { technical: ResumeRatedSkill[]; soft: ResumeRatedSkill[] } {
  const technical = sanitizeRatedSkills(payload.ratedSkills?.technical);
  const soft = sanitizeRatedSkills(payload.ratedSkills?.soft);

  if (technical.length > 0 || soft.length > 0) {
    return { technical, soft };
  }

  const technicalFallback = extractLabeledSkills(payload.form.skills, "technical").map((name) => ({ name, level: 3 }));
  const softFallback = extractLabeledSkills(payload.form.skills, "soft").map((name) => ({ name, level: 3 }));

  return {
    technical: technicalFallback,
    soft: softFallback,
  };
}

function renderCreativeSection(title: string, body: string): string {
  if (!body.trim()) return "";
  return `<section class="creative-section"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function renderCreativeInfoPanel(title: string, lines: string[], panelClass = ""): string {
  if (lines.length === 0) return "";
  const className = joinNonEmpty(["creative-panel", panelClass], " ");

  return `<section class="${className}">
    <h3>${escapeHtml(title)}</h3>
    <ul>
      ${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
    </ul>
  </section>`;
}

function renderCreativeSkillsPanel(title: string, skills: ResumeRatedSkill[]): string {
  if (skills.length === 0) return "";

  const bars = skills
    .map((skill) => {
      const level = clampSkillLevel(skill.level);
      const width = `${(level / 5) * 100}%`;

      return `<div class="creative-skill-row">
        <div class="creative-skill-head">
          <span>${escapeHtml(skill.name)}</span>
          <span>${level}/5</span>
        </div>
        <div class="creative-skill-track">
          <span class="creative-skill-fill" style="width:${width}"></span>
        </div>
      </div>`;
    })
    .join("");

  return `<section class="creative-panel creative-panel-skills">
    <h3>${escapeHtml(title)}</h3>
    <div class="creative-skill-list">${bars}</div>
  </section>`;
}

function parseMeta(form: ResumeFormData): ParsedMeta {
  const parsed: ParsedMeta = {
    technical: [],
    subjectsOfInterest: [],
    additionalSkills: [],
    additionalDetails: [],
    declaration: "",
  };

  const processLine = (line: string, source: "skills" | "achievements") => {
    const cleaned = cleanInvisible(line).trim();
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
}

function renderTechnicalSkills(lines: string[]): string {
  if (lines.length === 0) return "";

  const rows = lines.map((line) => {
    if (line.includes(":")) {
      const [k, ...rest] = line.split(":");
      return `<div class="skill-row"><strong>${escapeHtml(k.trim())}</strong><span>${escapeHtml(rest.join(":").trim())}</span></div>`;
    }
    return `<div class="skill-row"><strong>Technical Skills</strong><span>${escapeHtml(line)}</span></div>`;
  });

  return `<div class="skills-grid">${rows.join("")}</div>`;
}

function renderBulletParagraph(lines: string[]): string {
  if (lines.length === 0) return "";
  return `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
}

type ExperienceBlock = {
  role: string;
  company: string;
  duration: string;
  location: string;
  points: string[];
};

type ProjectBlock = {
  name: string;
  link: string;
  points: string[];
};

function parseExperienceBlocks(text: string): ExperienceBlock[] {
  const entries = text
    .split(/\n\s*\n/g)
    .map((e) => e.trim())
    .filter(Boolean);

  const blocks: ExperienceBlock[] = [];
  for (const entry of entries) {
    const lines = entry.split("\n").map((l) => l.trim()).filter(Boolean);
    const block: ExperienceBlock = { role: "", company: "", duration: "", location: "", points: [] };

    let inPoints = false;
    for (const line of lines) {
      if (/^role\s*:/i.test(line)) {
        block.role = line.replace(/^role\s*:/i, "").trim();
        inPoints = false;
      } else if (/^company\s*:/i.test(line)) {
        block.company = line.replace(/^company\s*:/i, "").trim();
        inPoints = false;
      } else if (/^duration\s*:/i.test(line)) {
        block.duration = line.replace(/^duration\s*:/i, "").trim();
        inPoints = false;
      } else if (/^location\s*:/i.test(line)) {
        block.location = line.replace(/^location\s*:/i, "").trim();
        inPoints = false;
      } else if (/^description\s+points\s*:/i.test(line)) {
        inPoints = true;
      } else if (/^[-*•]\s*/.test(line)) {
        block.points.push(line.replace(/^[-*•]\s*/, "").trim());
      } else if (inPoints) {
        block.points.push(line);
      }
    }

    if (block.role || block.company || block.points.length > 0) {
      blocks.push(block);
    }
  }

  return blocks;
}

function parseProjectBlocks(text: string): ProjectBlock[] {
  const entries = text
    .split(/\n\s*\n/g)
    .map((e) => e.trim())
    .filter(Boolean);

  const blocks: ProjectBlock[] = [];
  for (const entry of entries) {
    const lines = entry.split("\n").map((l) => l.trim()).filter(Boolean);
    const block: ProjectBlock = { name: "", link: "", points: [] };

    let inPoints = false;
    for (const line of lines) {
      if (/^project\s+name\s*:/i.test(line)) {
        block.name = line.replace(/^project\s+name\s*:/i, "").trim();
        inPoints = false;
      } else if (/^project\s+link\s*:/i.test(line)) {
        block.link = line.replace(/^project\s+link\s*:/i, "").trim();
        inPoints = false;
      } else if (/^description\s+points\s*:/i.test(line)) {
        inPoints = true;
      } else if (/^[-*•]\s*/.test(line)) {
        block.points.push(line.replace(/^[-*•]\s*/, "").trim());
      } else if (inPoints) {
        block.points.push(line);
      }
    }

    if (block.name || block.points.length > 0) {
      blocks.push(block);
    }
  }

  return blocks;
}

function buildObjectiveLines(form: ResumeFormData): string[] {
  const fromSummary = cleanInvisible(form.summary)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const lines: string[] = [...fromSummary];
  const role = form.targetRole.trim() || "professional role";

  const fallback = [
    `Seeking a ${role} position where I can contribute to impactful projects.`,
    "Focused on delivering clean, maintainable, and user-centric solutions.",
    "Strong collaboration, communication, and problem-solving mindset.",
    "Committed to continuous learning and measurable outcome-driven work.",
  ];

  for (const f of fallback) {
    if (lines.length >= 4) break;
    lines.push(f);
  }

  return lines.slice(0, 4);
}

function renderExperienceBlocks(text: string): string {
  const blocks = parseExperienceBlocks(text);
  if (blocks.length === 0) return "";

  return blocks
    .map((b) => `<div class="exp-item">
      <div class="item-head">
        <div class="item-title">${escapeHtml(joinNonEmpty([b.role, b.company], " | "))}</div>
        <div class="item-meta">${escapeHtml(joinNonEmpty([b.duration, b.location], " | "))}</div>
      </div>
      ${renderBulletParagraph(b.points)}
    </div>`)
    .join("");
}

function renderProjectBlocks(text: string): string {
  const blocks = parseProjectBlocks(text);
  if (blocks.length === 0) return "";

  return blocks
    .map((b) => `<div class="project-item">
      <div class="item-head">
        <div class="item-title">${escapeHtml(b.name || "Project")}</div>
        ${b.link ? `<div class="item-meta"><a href="${escapeHtml(normalizeUrl(b.link))}">${escapeHtml(b.link)}</a></div>` : ""}
      </div>
      ${renderBulletParagraph(b.points)}
    </div>`)
    .join("");
}

function renderBody(payload: ResumePdfPayload, modernCompact = false): string {
  const { form, educations } = payload;
  const meta = parseMeta(form);

  const objectiveLines = buildObjectiveLines(form);
  const experienceLines = splitLines(form.experience);
  const projectLines = splitLines(form.projects);

  if (payload.templateId === "modern-professional") {
    const row = (label: string, body: string) => {
      if (!body.trim()) return "";
      return `<section class="modern-row">
        <div class="modern-label">${escapeHtml(label)}</div>
        <div class="modern-content">${body}</div>
      </section>`;
    };

    const summaryText = `<p>${objectiveLines.map((l) => escapeHtml(l)).join(" ")}</p>`;
    const experienceBody = renderExperienceBlocks(form.experience) || renderBulletLines(experienceLines);
    const educationBody = renderEducation(educations, form.education);
    const projectBody = renderProjectBlocks(form.projects) || renderBulletLines(projectLines);
    const skillsBody = renderTechnicalSkills(meta.technical) || renderBulletParagraph(splitLines(form.skills));

    const rawAchievements = splitLines(form.achievements);
    const seen = new Set<string>();
    const certificates: string[] = [];
    const awards: string[] = [];
    const publications: string[] = [];
    const affiliations: string[] = [];

    // Assign each achievement to a single best-fit bucket so rows never repeat the same line.
    for (const line of rawAchievements) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;

      if (/publication|published|paper|journal/i.test(line)) {
        publications.push(line);
        seen.add(key);
        continue;
      }

      if (/affiliation|member|volunteer|community|club/i.test(line)) {
        affiliations.push(line);
        seen.add(key);
        continue;
      }

      if (/cert|certificate|course/i.test(line)) {
        certificates.push(line);
        seen.add(key);
        continue;
      }

      if (/award|winner|rank|achievement/i.test(line)) {
        awards.push(line);
        seen.add(key);
      }
    }

    // Fallback only fills missing slots and still avoids duplicates.
    for (const line of rawAchievements) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      if (certificates.length < 3) {
        certificates.push(line);
        seen.add(key);
        continue;
      }
      if (awards.length < 3) {
        awards.push(line);
        seen.add(key);
      }
    }

    const hasSummary = summaryText.trim().length > 0;
    const hasEducation = educationBody.trim().length > 0;
    const hasProjects = projectBody.trim().length > 0;
    const hasSkills = skillsBody.trim().length > 0;
    const hasExperience = experienceBody.trim().length > 0;
    const isMandatoryOnlyFillMode = !hasExperience && hasSummary && hasEducation && hasProjects && hasSkills;

    const rows = renderOrderedSections(payload.sectionOrder, {
      summary: row("Summary", summaryText),
      education: row("Education", educationBody),
      skills: row("Skills", skillsBody),
      projects: row("Projects", projectBody),
      experience: row("Experience", experienceBody),
      certificate: row("Certificate", renderBulletParagraph(certificates)),
      awards: row("Awards", renderBulletParagraph(awards)),
      publications: row("Publications", renderBulletParagraph(publications)),
      affiliations: row("Affiliations", renderBulletParagraph(affiliations)),
    });

    return `<div class="modern-layout ${modernCompact ? "is-compact" : "is-expanded"} ${isMandatoryOnlyFillMode ? "is-low-content" : ""}">${rows}</div>`;
  }

  if (payload.templateId === "creative-modern") {
    const summaryText = `<p>${objectiveLines.map((l) => escapeHtml(l)).join(" ")}</p>`;
    const experienceBody = renderExperienceBlocks(form.experience) || renderBulletLines(experienceLines);
    const educationBody = renderEducation(educations, form.education);
    const projectBody = renderProjectBlocks(form.projects) || renderBulletLines(projectLines);

    const rawAchievements = splitLines(form.achievements);
    const seen = new Set<string>();
    const certificates: string[] = [];
    const awards: string[] = [];
    const publications: string[] = [];
    const affiliations: string[] = [];

    for (const line of rawAchievements) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;

      if (/publication|published|paper|journal/i.test(line)) {
        publications.push(line);
        seen.add(key);
        continue;
      }

      if (/affiliation|member|volunteer|community|club/i.test(line)) {
        affiliations.push(line);
        seen.add(key);
        continue;
      }

      if (/cert|certificate|course/i.test(line)) {
        certificates.push(line);
        seen.add(key);
        continue;
      }

      if (/award|winner|rank|achievement/i.test(line)) {
        awards.push(line);
        seen.add(key);
      }
    }

    for (const line of rawAchievements) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      if (certificates.length < 4) {
        certificates.push(line);
        seen.add(key);
        continue;
      }
      if (awards.length < 4) {
        awards.push(line);
        seen.add(key);
      }
    }

    const ratedSkills = resolveCreativeRatedSkills(payload);
    const contactLines = uniqueTextValues([
      form.email.trim(),
      form.phone.trim(),
      form.location.trim(),
    ]);
    const referenceLines = uniqueTextValues([
      form.linkedin.trim() ? `LinkedIn: ${form.linkedin.trim()}` : "",
      form.github.trim() ? `GitHub: ${form.github.trim()}` : "",
    ]);
    const competencyLines = uniqueTextValues([
      ...ratedSkills.technical.map((skill) => skill.name),
      ...ratedSkills.soft.map((skill) => skill.name),
      ...extractLabeledSkills(form.skills, "technical"),
      ...extractLabeledSkills(form.skills, "soft"),
    ]).slice(0, 10);

    const sidebar = [
      renderCreativeInfoPanel("Contact", contactLines),
      renderCreativeInfoPanel("Core Competencies", competencyLines, "creative-panel-competencies"),
      renderCreativeSkillsPanel("Technical Skills", ratedSkills.technical),
      renderCreativeSkillsPanel("Soft Skills", ratedSkills.soft),
      renderCreativeInfoPanel("References", referenceLines, "creative-panel-references"),
    ]
      .filter((block) => block.trim().length > 0)
      .join("");

    const contentDensityScore =
      objectiveLines.length +
      experienceLines.length +
      projectLines.length +
      splitLines(form.education).length +
      rawAchievements.length +
      ratedSkills.technical.length +
      ratedSkills.soft.length;
    const creativeFillClass = contentDensityScore <= 42 ? "is-fill" : "is-compact";

    const orderedMain = renderOrderedSections(payload.sectionOrder, {
      summary: renderCreativeSection("Profile", summaryText),
      education: renderCreativeSection("Education", educationBody),
      skills: "",
      projects: renderCreativeSection("Projects", projectBody),
      experience: renderCreativeSection("Experience", experienceBody),
      certificate: renderCreativeSection("Certifications", renderBulletParagraph(certificates)),
      awards: renderCreativeSection("Awards", renderBulletParagraph(awards)),
      publications: renderCreativeSection("Publications", renderBulletParagraph(publications)),
      affiliations: renderCreativeSection("Affiliations", renderBulletParagraph(affiliations)),
    });

    return `<div class="creative-layout ${creativeFillClass}">
      <aside class="creative-sidebar">${sidebar}</aside>
      <div class="creative-main">${orderedMain}</div>
    </div>`;
  }

  if (payload.templateId === "minimal-clean") {
    const summaryText = `<p>${objectiveLines.map((l) => escapeHtml(l)).join(" ")}</p>`;
    const experienceBlocks = parseExperienceBlocks(form.experience);
    const minimalExperienceBody =
      experienceBlocks.length > 0
        ? experienceBlocks
            .map((b) => {
              const companyOrRole = b.company || b.role || "Experience";
              const secondaryRole = b.company && b.role ? b.role : "";
              const location = b.location.trim();
              const duration = b.duration.trim();

              return `<div class="minimal-exp-item">
                <div class="minimal-exp-head">
                  <div class="minimal-exp-left">
                    <div class="minimal-exp-company">${escapeHtml(companyOrRole)}</div>
                    ${secondaryRole ? `<div class="minimal-exp-role">${escapeHtml(secondaryRole)}</div>` : ""}
                  </div>
                  <div class="minimal-exp-meta">
                    ${location ? `<span>${escapeHtml(location)}</span>` : ""}
                    ${duration ? `<span>${escapeHtml(duration)}</span>` : ""}
                  </div>
                </div>
                ${renderBulletParagraph(b.points)}
              </div>`;
            })
            .join("")
        : renderBulletLines(experienceLines);

    const validEducation = educations.filter((e) => e.degree.trim() || e.institution.trim());
    const minimalEducationBody =
      validEducation.length > 0
        ? validEducation
            .map((e) => {
              const degree = joinNonEmpty([e.degree, e.fieldOfStudy ? `in ${e.fieldOfStudy}` : ""], " ");
              const dateRange = joinNonEmpty([e.startYear, e.endYear], " - ");
              const grade = e.gradeValue
                ? e.gradeType === "Grade"
                  ? `Grade: ${e.gradeValue}`
                  : `${e.gradeType}: ${e.gradeValue}${e.gradeScale ? `/${e.gradeScale}` : ""}`
                : "";

              return `<div class="minimal-edu-item">
                <div class="minimal-edu-head">
                  <div class="minimal-edu-school">${escapeHtml(e.institution || degree || "Education")}</div>
                  ${dateRange ? `<div class="minimal-edu-date">${escapeHtml(dateRange)}</div>` : ""}
                </div>
                ${degree ? `<div class="minimal-edu-degree">${escapeHtml(degree)}</div>` : ""}
                ${grade ? `<div class="minimal-edu-meta">${escapeHtml(grade)}</div>` : ""}
              </div>`;
            })
            .join("")
        : renderBulletLines(splitLines(form.education));

    const skillTokens = uniqueTextValues(
      splitLines(form.skills).flatMap((line) => {
        if (line.includes(":")) {
          const [, ...rest] = line.split(":");
          return splitInlineValues(rest.join(":"));
        }
        return splitInlineValues(line);
      })
    );

    const skillsBody =
      skillTokens.length > 0
        ? `<p class="minimal-skills-inline">${skillTokens.map((token) => escapeHtml(token)).join(" · ")}</p>`
        : renderTechnicalSkills(meta.technical) || renderBulletParagraph(splitLines(form.skills));

    const projectBody = renderProjectBlocks(form.projects) || renderBulletLines(projectLines);

    const achievementLines = splitLines(form.achievements);
    const keyAchievementsBody = achievementLines.length
      ? `<div class="minimal-achievements-grid">${achievementLines
          .map((line) => {
            const parts = line.split(/[,|]/g).map((p) => p.trim()).filter(Boolean);
            const title = parts[0] || line;
            const detail = parts[1] || "";
            const duration = parts.slice(2).join(" | ");

            return `<div class="minimal-achievement-item">
              <div class="minimal-achievement-title">${escapeHtml(title)}</div>
              ${detail ? `<div class="minimal-achievement-detail">${escapeHtml(detail)}</div>` : ""}
              ${duration ? `<div class="minimal-achievement-duration">${escapeHtml(duration)}</div>` : ""}
            </div>`;
          })
          .join("")}</div>`
      : renderBulletLines(meta.additionalSkills);

    const minimalOrder = hasDefaultSectionOrder(payload.sectionOrder)
      ? MINIMAL_DEFAULT_SECTION_ORDER
      : normalizeSectionOrder(payload.sectionOrder);

    const minimalDensityClass = shouldUseMinimalFill(payload) ? "is-fill" : "is-compact";

    const minimalRows = renderOrderedSections(minimalOrder, {
      summary: renderSection("Summary", summaryText),
      experience: renderSection("Experience", minimalExperienceBody),
      education: renderSection("Education", minimalEducationBody),
      certificate: renderSection("Key Achievements", keyAchievementsBody),
      skills: renderSection("Skills", skillsBody),
      projects: renderSection("Projects", projectBody),
    });

    return `<div class="minimal-layout ${minimalDensityClass}">${minimalRows}</div>`;
  }

  if (payload.templateId === "tech-developer") {
    const declarationText = meta.declaration || "";
    const skillsBody = renderTechnicalSkills(meta.technical) || renderBulletParagraph(splitLines(form.skills));
    const projectsBody = renderProjectBlocks(form.projects) || renderBulletParagraph(projectLines);
    const experienceBody = renderExperienceBlocks(form.experience) || renderBulletParagraph(experienceLines);
    const additionalSkillsBody = renderBulletParagraph(meta.additionalSkills);
    const additionalDetailsBody = renderBulletParagraph(meta.additionalDetails);
    const techFillClass = shouldUseTechFill(payload) ? "is-fill" : "is-compact";

    const ordered = renderOrderedSections(payload.sectionOrder, {
      summary: renderSection("Career Objective", renderBulletParagraph(objectiveLines)),
      education: renderSection("Education", renderEducation(educations, form.education)),
      skills: renderSection("Technical Skills", skillsBody),
      projects: renderSection("Projects", projectsBody),
      experience: renderSection("Experience", experienceBody),
      certificate: renderSection("Additional Skills", additionalSkillsBody),
      awards: renderSection("Additional Details", additionalDetailsBody),
      affiliations: renderSection("Declaration", declarationText ? `<p>${escapeHtml(declarationText)}</p>` : ""),
    });

    const subjectBlock = renderSection("Subjects Of Interest", renderBulletParagraph(meta.subjectsOfInterest));
    return `<div class="tech-layout ${techFillClass}">${ordered}${subjectBlock}</div>`;
  }

  if (payload.templateId === "executive-premium") {
    const summaryText = `<p>${objectiveLines.map((line) => escapeHtml(line)).join(" ")}</p>`;
    const experienceBody = renderExperienceBlocks(form.experience) || renderBulletLines(experienceLines);
    const educationBody = renderEducation(educations, form.education);
    const projectBody = renderProjectBlocks(form.projects) || renderBulletLines(projectLines);
    const skillsBody = renderTechnicalSkills(meta.technical) || renderBulletParagraph(splitLines(form.skills));

    const rawAchievements = splitLines(form.achievements);
    const seen = new Set<string>();
    const certificates: string[] = [];
    const awards: string[] = [];
    const publications: string[] = [];
    const affiliations: string[] = [];

    for (const line of rawAchievements) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;

      if (/publication|published|paper|journal/i.test(line)) {
        publications.push(line);
        seen.add(key);
        continue;
      }

      if (/affiliation|member|volunteer|community|club|society/i.test(line)) {
        affiliations.push(line);
        seen.add(key);
        continue;
      }

      if (/cert|certificate|course|license/i.test(line)) {
        certificates.push(line);
        seen.add(key);
        continue;
      }

      if (/award|winner|rank|achievement|honou?r/i.test(line)) {
        awards.push(line);
        seen.add(key);
      }
    }

    for (const line of rawAchievements) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;

      if (certificates.length < 4) {
        certificates.push(line);
        seen.add(key);
        continue;
      }

      if (awards.length < 4) {
        awards.push(line);
        seen.add(key);
      }
    }

    const hasDefaultOrder = hasDefaultSectionOrder(payload.sectionOrder);
    const mainOrder = hasDefaultOrder ? EXECUTIVE_MAIN_SECTION_ORDER : normalizeSectionOrder(payload.sectionOrder);

    const contactRows = [
      { label: "T", value: form.phone.trim() },
      { label: "E", value: form.email.trim() },
      { label: "A", value: form.location.trim() },
      { label: "In", value: form.linkedin.trim() },
      { label: "Gh", value: form.github.trim() },
    ].filter((entry) => entry.value.length > 0);

    const contactBody =
      contactRows.length > 0
        ? `<div class="executive-contact-list">${contactRows
            .map(
              (entry) => `<div class="executive-contact-row">
              <span class="executive-contact-label">${escapeHtml(entry.label)}:</span>
              <span class="executive-contact-value">${escapeHtml(entry.value)}</span>
            </div>`
            )
            .join("")}</div>`
        : "";

    const compactEducationBody =
      educations.filter((entry) => entry.degree.trim() || entry.institution.trim()).length > 0
        ? educations
            .filter((entry) => entry.degree.trim() || entry.institution.trim())
            .map((entry) => {
              const degree = joinNonEmpty([entry.degree, entry.fieldOfStudy ? `in ${entry.fieldOfStudy}` : ""], " ");
              const period = joinNonEmpty([entry.startYear, entry.endYear], " - ");

              return `<div class="executive-mini-item">
                <div class="executive-mini-title">${escapeHtml(degree || entry.institution || "Education")}</div>
                ${entry.institution ? `<div class="executive-mini-meta">${escapeHtml(entry.institution)}</div>` : ""}
                ${period ? `<div class="executive-mini-meta">${escapeHtml(period)}</div>` : ""}
              </div>`;
            })
            .join("")
        : renderBulletParagraph(splitLines(form.education).slice(0, 4));

    const skillTokens = uniqueTextValues(
      splitLines(form.skills).flatMap((line) => {
        if (line.includes(":")) {
          const [, ...rest] = line.split(":");
          return splitInlineValues(rest.join(":"));
        }
        return splitInlineValues(line);
      })
    ).slice(0, 14);

    const compactSkillsBody = skillTokens.length
      ? `<ul class="executive-token-list">${skillTokens.map((token) => `<li>${escapeHtml(token)}</li>`).join("")}</ul>`
      : "";

    const supportTokens = uniqueTextValues([
      ...meta.additionalSkills,
      ...meta.subjectsOfInterest,
    ]).slice(0, 8);
    const supportBody = supportTokens.length
      ? `<ul class="executive-token-list">${supportTokens.map((token) => `<li>${escapeHtml(token)}</li>`).join("")}</ul>`
      : "";

    const executivePanel = (title: string, body: string): string => {
      if (!body.trim()) return "";
      return `<section class="executive-panel">
        <h3>${escapeHtml(title)}</h3>
        ${body}
      </section>`;
    };

    const sidebarPanels = [
      executivePanel("Get In Touch", contactBody),
      hasDefaultOrder ? executivePanel("Education", compactEducationBody) : "",
      hasDefaultOrder ? executivePanel("Skills", compactSkillsBody) : "",
      executivePanel("Languages & Extras", supportBody),
    ].filter((panel) => panel.trim().length > 0);

    const sidebarContent =
      sidebarPanels.length > 0
        ? sidebarPanels.join("")
        : executivePanel("Profile", `<p>${escapeHtml(form.targetRole || "Executive Profile")}</p>`);

    const mainSectionMap: Partial<Record<ResumeSectionKey, string>> = {
      summary: renderSection("Profile", summaryText),
      experience: renderSection("Work Experience", experienceBody),
      projects: renderSection("Key Projects", projectBody),
      education: hasDefaultOrder ? "" : renderSection("Education", educationBody),
      skills: hasDefaultOrder ? "" : renderSection("Core Competencies", skillsBody),
      certificate: renderSection("Certifications", renderBulletParagraph(certificates)),
      awards: renderSection("Achievements", renderBulletParagraph(uniqueTextValues([...awards, ...meta.additionalDetails]))),
      publications: renderSection("Publications", renderBulletParagraph(publications)),
      affiliations: renderSection("Affiliations", renderBulletParagraph(affiliations)),
    };

    const mainBlocks = mainOrder
      .map((key) => mainSectionMap[key] || "")
      .filter((section) => section.trim().length > 0);
    const mainContent = mainBlocks.join("");

    const executiveFillClass = shouldUseExecutiveFill(payload) ? "is-fill" : "is-compact";
    const executiveSparseClass = mainBlocks.length <= 3 ? "is-sparse" : "is-dense";
    return `<div class="executive-layout ${executiveFillClass} ${executiveSparseClass}">
      <aside class="executive-sidebar">${sidebarContent}</aside>
      <div class="executive-main">${mainContent}</div>
    </div>`;
  }

  if (payload.templateId === "classic-elegant") {
    const summaryText = `<p>${objectiveLines.map((l) => escapeHtml(l)).join(" ")}</p>`;
    const experienceBody = renderExperienceBlocks(form.experience) || renderBulletLines(experienceLines);
    const educationBody = renderEducation(educations, form.education);
    const skillsBody = renderTechnicalSkills(meta.technical) || renderBulletParagraph(splitLines(form.skills));
    const projectBody = renderProjectBlocks(form.projects) || renderBulletLines(projectLines);

    const achievementLines = splitLines(form.achievements);
    const achievementsBody = achievementLines.length
      ? `<div class="classic-achievements-grid">${achievementLines
          .map((line) => {
            const parts = line.split(/[,|]/g).map((p) => p.trim()).filter(Boolean);
            const title = parts[0] || line;
            const detail = parts.slice(1).join(" | ");
            return `<div class="classic-achievement-item">
              <div class="classic-achievement-title">${escapeHtml(title)}</div>
              ${detail ? `<div class="classic-achievement-meta">${escapeHtml(detail)}</div>` : ""}
            </div>`;
          })
          .join("")}</div>`
      : "";

    return renderOrderedSections(payload.sectionOrder, {
      summary: renderSection("Summary", summaryText),
      experience: renderSection("Experience", experienceBody),
      education: renderSection("Education", educationBody),
      skills: renderSection("Skills", skillsBody),
      projects: renderSection("Projects", projectBody),
      certificate: renderSection("Key Achievements", achievementsBody),
    });
  }

  return renderOrderedSections(payload.sectionOrder, {
    summary: renderSection("Objective", renderBulletParagraph(objectiveLines)),
    education: renderSection("Education", renderEducation(educations, form.education)),
    skills: renderSection("Skills", renderTechnicalSkills(meta.technical)),
    projects: renderSection("Projects", renderProjectBlocks(form.projects) || renderBulletLines(projectLines)),
    experience: renderSection("Experience", renderExperienceBlocks(form.experience) || renderBulletLines(experienceLines)),
    certificate: renderSection("Extra-Curricular Activities", renderBulletLines(meta.additionalSkills)),
  });
}

function getTheme(templateId: string): { className: string; accent: string; font: string } {
  switch (templateId) {
    case "faangpath-simple":
      return { className: "theme-faang", accent: "#1f2937", font: "'Times New Roman', Times, serif" };
    case "tech-developer":
      return { className: "theme-tech", accent: "#0ea5e9", font: "'Segoe UI', Tahoma, sans-serif" };
    case "classic-elegant":
      return { className: "theme-classic", accent: "#374151", font: "Georgia, 'Times New Roman', serif" };
    case "modern-professional":
      return { className: "theme-modern", accent: "#2563eb", font: "'Segoe UI', Tahoma, sans-serif" };
    case "executive-premium":
      return { className: "theme-executive", accent: "#b45309", font: "Georgia, 'Times New Roman', serif" };
    case "creative-modern":
      return { className: "theme-creative", accent: "#f97316", font: "'Segoe UI', Tahoma, sans-serif" };
    case "minimal-clean":
      return { className: "theme-minimal", accent: "#111827", font: "Arial, sans-serif" };
    default:
      return { className: "theme-minimal", accent: "#111827", font: "Arial, sans-serif" };
  }
}

export function renderResumeHtml(payload: ResumePdfPayload): string {
  const theme = getTheme(payload.templateId);
  const modernCompact = shouldUseModernCompact(payload);
  const classicFill = shouldUseClassicFill(payload);
  const minimalFill = shouldUseMinimalFill(payload);
  const techFill = shouldUseTechFill(payload);
  const executiveFill = shouldUseExecutiveFill(payload);
  const modernDensityClass =
    payload.templateId === "modern-professional"
      ? modernCompact
        ? "modern-compact"
        : "modern-expanded"
      : "";
  const classicDensityClass =
    payload.templateId === "classic-elegant"
      ? classicFill
        ? "classic-fill"
        : "classic-compact"
      : "";
  const minimalDensityClass =
    payload.templateId === "minimal-clean"
      ? minimalFill
        ? "minimal-fill"
        : "minimal-compact"
      : "";
  const techDensityClass =
    payload.templateId === "tech-developer"
      ? techFill
        ? "tech-fill"
        : "tech-compact"
      : "";
  const executiveDensityClass =
    payload.templateId === "executive-premium"
      ? executiveFill
        ? "executive-fill"
        : "executive-compact"
      : "";
  const header = renderHeader(payload);
  const body = renderBody(payload, modernCompact);

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        --accent: ${theme.accent};
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #ffffff;
        color: #111827;
        font-family: ${theme.font};
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page {
        width: 100%;
        max-width: 760px;
        margin: 0 auto;
        padding: 8px 4px 6px;
      }
      .header {
        text-align: center;
        margin-bottom: 10px;
      }
      .header-main {
        display: block;
      }
      .header-text {
        width: 100%;
      }
      .header h1 {
        margin: 0;
        font-size: 34px;
        line-height: 1.05;
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }
      .profile-photo {
        display: none;
      }
      .header .role {
        margin-top: 4px;
        font-size: 14px;
      }
      .header .contact,
      .header .links {
        margin-top: 3px;
        font-size: 12px;
        line-height: 1.3;
        color: #374151;
      }
      .header .links a { color: var(--accent); text-decoration: none; }

      .section {
        margin-top: 7px;
      }
      .section h2 {
        margin: 0;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        border-bottom: 1px solid #9ca3af;
        padding-bottom: 2px;
        color: var(--accent);
      }
      .section p {
        margin: 5px 0 0;
        font-size: 12px;
        line-height: 1.35;
      }
      ul {
        margin: 4px 0 0 16px;
        padding: 0;
      }
      li {
        font-size: 12px;
        line-height: 1.32;
        margin: 0 0 2px;
      }

      .edu-item { margin-top: 6px; }
      .exp-item, .project-item { margin-top: 6px; }
      .item-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 10px;
      }
      .item-title { font-size: 12.5px; font-weight: 700; }
      .item-meta { font-size: 11px; color: #374151; white-space: nowrap; }
      .item-meta a { color: var(--accent); text-decoration: none; }
      .edu-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
      }
      .edu-title { font-size: 12.5px; font-weight: 700; }
      .edu-date { font-size: 11px; color: #374151; white-space: nowrap; }
      .edu-meta { margin-top: 2px; font-size: 11.5px; color: #374151; }

      .skills-grid { margin-top: 5px; display: grid; gap: 3px; }
      .skill-row {
        display: grid;
        grid-template-columns: 180px 1fr;
        gap: 8px;
        font-size: 12px;
      }
      .skill-row strong { font-weight: 700; }

      .theme-tech .header h1,
      .theme-modern .header h1 {
        font-size: 32px;
        letter-spacing: 0.3px;
        text-transform: none;
      }
      .theme-modern .header {
        text-align: left;
        margin-bottom: 8px;
      }
      .theme-modern .header-main {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 14px;
        align-items: center;
      }
      .theme-modern .profile-photo {
        display: block;
        width: 88px;
        height: 88px;
        object-fit: cover;
        border-radius: 50%;
        border: 1.2px solid #d1d5db;
      }
      .theme-modern .header h1 {
        margin: 0;
        text-transform: uppercase;
        font-size: 50px;
        letter-spacing: 0.6px;
        line-height: 0.95;
        color: #374151;
      }
      .theme-modern .header .role {
        color: #4ea3e3;
        font-size: 20px;
        font-weight: 600;
        margin-top: 2px;
      }
      .theme-modern .header .contact,
      .theme-modern .header .links {
        color: #4b5563;
        font-size: 12px;
      }
      .theme-modern .header .links a {
        color: #4b5563;
      }
      .theme-modern .modern-row {
        display: grid;
        grid-template-columns: 118px 1fr;
        gap: 10px;
        border-top: 1px solid #d7dde4;
        padding: 12px 0;
      }
      .theme-modern .modern-label {
        color: #4ea3e3;
        font-size: 12px;
        font-weight: 700;
        text-transform: none;
        padding-top: 1px;
      }
      .theme-modern .modern-content {
        font-size: 13px;
        line-height: 1.46;
        color: #374151;
      }
      .theme-modern .modern-content p {
        line-height: 1.45;
      }
      .theme-modern .modern-content .exp-item,
      .theme-modern .modern-content .project-item,
      .theme-modern .modern-content .edu-item {
        margin-top: 7px;
      }
      .theme-modern .modern-content .item-head,
      .theme-modern .modern-content .edu-head {
        gap: 6px;
      }
      .theme-modern .modern-content .item-title,
      .theme-modern .modern-content .edu-title {
        font-size: 13px;
      }
      .theme-modern .modern-content .item-meta,
      .theme-modern .modern-content .edu-date,
      .theme-modern .modern-content .edu-meta {
        font-size: 11.4px;
      }
      .theme-modern .modern-content ul {
        margin-top: 4px;
      }
      .theme-modern .modern-content li {
        font-size: 12.4px;
        margin-bottom: 2px;
      }
      .theme-modern .skills-grid {
        margin-top: 5px;
        gap: 5px;
      }
      .theme-modern .skill-row {
        grid-template-columns: 175px 1fr;
        gap: 8px;
        font-size: 12.2px;
      }
      .theme-modern .modern-layout.is-low-content .modern-row {
        grid-template-columns: 126px 1fr;
        gap: 12px;
        padding: 16px 0;
      }
      .theme-modern .modern-layout.is-low-content .modern-label {
        font-size: 13.6px;
      }
      .theme-modern .modern-layout.is-low-content .modern-content {
        font-size: 14.2px;
        line-height: 1.6;
      }
      .theme-modern .modern-layout.is-low-content .modern-content p {
        line-height: 1.6;
      }
      .theme-modern .modern-layout.is-low-content .modern-content .exp-item,
      .theme-modern .modern-layout.is-low-content .modern-content .project-item,
      .theme-modern .modern-layout.is-low-content .modern-content .edu-item {
        margin-top: 10px;
      }
      .theme-modern .modern-layout.is-low-content .modern-content .item-title,
      .theme-modern .modern-layout.is-low-content .modern-content .edu-title {
        font-size: 14.8px;
      }
      .theme-modern .modern-layout.is-low-content .modern-content .item-meta,
      .theme-modern .modern-layout.is-low-content .modern-content .edu-date,
      .theme-modern .modern-layout.is-low-content .modern-content .edu-meta {
        font-size: 12.8px;
      }
      .theme-modern .modern-layout.is-low-content .modern-content li {
        font-size: 13.8px;
        line-height: 1.55;
        margin-bottom: 3px;
      }
      .theme-modern .modern-layout.is-low-content .skill-row {
        grid-template-columns: 200px 1fr;
        font-size: 13.6px;
      }
      .theme-modern .modern-layout.is-low-content + .header,
      .theme-modern .modern-layout.is-low-content ~ .header {
        margin-bottom: 12px;
      }
      .theme-modern.modern-expanded .header {
        margin-bottom: 10px;
      }
      .theme-modern.modern-expanded .profile-photo {
        width: 96px;
        height: 96px;
      }
      .theme-modern.modern-expanded .header .role {
        font-size: 21px;
      }
      .theme-creative {
        padding: 0;
        min-height: 277mm;
        display: flex;
        flex-direction: column;
      }
      .theme-creative .creative-header {
        text-align: left;
        margin-bottom: 12px;
      }
      .theme-creative .creative-banner {
        height: 90px;
        border-radius: 14px 14px 0 0;
        background: linear-gradient(125deg, #0f172a 0%, #1e293b 56%, #334155 100%);
      }
      .theme-creative .creative-header-content {
        margin-top: -60px;
        padding: 0 16px;
        display: grid;
        grid-template-columns: 108px 1fr;
        gap: 14px;
        align-items: start;
      }
      .theme-creative .creative-photo,
      .theme-creative .creative-photo-placeholder {
        width: 104px;
        height: 104px;
        border-radius: 50%;
        border: 4px solid #ffffff;
        background: #e5e7eb;
      }
      .theme-creative .creative-photo {
        object-fit: cover;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.28);
      }
      .theme-creative .creative-identity {
        padding-top: 8px;
      }
      .theme-creative .creative-identity h1 {
        margin: -6px 0 0;
        font-size: 36px;
        line-height: 1.02;
        text-transform: uppercase;
        letter-spacing: 0.65px;
        color: #f8fafc;
        text-shadow: 0 1px 2px rgba(15, 23, 42, 0.45);
      }
      .theme-creative .creative-identity .role {
        margin-top: 1px;
        color: #fb923c;
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.45px;
      }
      .theme-creative .creative-contact,
      .theme-creative .creative-links {
        margin-top: 4px;
        font-size: 11.2px;
        line-height: 1.3;
        color: #334155;
        font-weight: 600;
        text-shadow: none;
        max-width: 100%;
        overflow-wrap: anywhere;
      }
      .theme-creative .creative-links a {
        color: #334155;
        text-decoration: none;
      }
      .theme-creative .creative-layout {
        display: grid;
        grid-template-columns: 214px 1fr;
        gap: 14px;
        align-items: start;
        flex: 1;
        min-height: 0;
      }
      .theme-creative .creative-sidebar {
        background: linear-gradient(180deg, #0f172a 0%, #101a35 58%, #0a1732 100%);
        border-radius: 12px;
        padding: 12px 11px;
        color: #e5e7eb;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 11px;
        position: relative;
        overflow: hidden;
      }
      .theme-creative .creative-sidebar::after {
        content: "";
        margin-top: auto;
        height: 112px;
        border-radius: 10px;
        background:
          radial-gradient(circle at 18% 22%, rgba(251, 146, 60, 0.22) 0%, rgba(251, 146, 60, 0) 52%),
          radial-gradient(circle at 84% 76%, rgba(59, 130, 246, 0.18) 0%, rgba(59, 130, 246, 0) 58%),
          repeating-linear-gradient(
            180deg,
            rgba(148, 163, 184, 0.16) 0,
            rgba(148, 163, 184, 0.16) 1px,
            transparent 1px,
            transparent 8px
          );
        border: 1px solid rgba(148, 163, 184, 0.28);
      }
      .theme-creative .creative-main {
        min-width: 0;
      }
      .theme-creative .creative-panel {
        margin-top: 0;
      }
      .theme-creative .creative-panel-references {
        margin-top: auto;
      }
      .theme-creative .creative-panel h3 {
        margin: 0;
        font-size: 10.4px;
        letter-spacing: 0.7px;
        text-transform: uppercase;
        color: #f8fafc;
        border-bottom: 1px solid rgba(148, 163, 184, 0.4);
        padding-bottom: 4px;
      }
      .theme-creative .creative-panel ul {
        margin: 6px 0 0 13px;
      }
      .theme-creative .creative-panel li {
        color: #e2e8f0;
        font-size: 10.9px;
        line-height: 1.4;
        margin: 0 0 3px;
        word-break: break-word;
      }
      .theme-creative .creative-panel-competencies ul {
        columns: 2;
        column-gap: 16px;
      }
      .theme-creative .creative-panel-competencies li {
        break-inside: avoid;
      }
      .theme-creative .creative-skill-list {
        margin-top: 7px;
        display: grid;
        gap: 6px;
      }
      .theme-creative .creative-skill-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
        font-size: 10.9px;
        color: #e2e8f0;
      }
      .theme-creative .creative-skill-track {
        margin-top: 3px;
        height: 6.2px;
        border-radius: 999px;
        background: #374151;
        overflow: hidden;
      }
      .theme-creative .creative-skill-fill {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, #f59e0b 0%, #f97316 100%);
      }
      .theme-creative .creative-section {
        margin-top: 9px;
        border-bottom: 1px solid #dbe3ec;
        padding-bottom: 8px;
      }
      .theme-creative .creative-section h2 {
        margin: 0;
        padding-bottom: 2px;
        border-bottom: none;
        color: #0f172a;
        font-size: 14.3px;
        text-transform: uppercase;
        letter-spacing: 0.58px;
      }
      .theme-creative .creative-section p {
        margin: 4px 0 0;
        font-size: 12.05px;
        line-height: 1.48;
        color: #1f2937;
      }
      .theme-creative .creative-section ul {
        margin: 4px 0 0 16px;
      }
      .theme-creative .creative-section li {
        font-size: 11.85px;
        line-height: 1.45;
        margin: 0 0 2px;
        color: #1f2937;
      }
      .theme-creative .creative-section .exp-item,
      .theme-creative .creative-section .project-item,
      .theme-creative .creative-section .edu-item {
        margin-top: 5px;
      }
      .theme-creative .creative-section .item-title,
      .theme-creative .creative-section .edu-title {
        font-size: 12.45px;
      }
      .theme-creative .creative-section .item-meta,
      .theme-creative .creative-section .edu-date,
      .theme-creative .creative-section .edu-meta {
        font-size: 10.9px;
        color: #475569;
      }
      .theme-creative .creative-layout.is-fill .creative-sidebar {
        gap: 13px;
      }
      .theme-creative .creative-layout.is-fill .creative-panel li {
        font-size: 11.2px;
        line-height: 1.46;
      }
      .theme-creative .creative-layout.is-fill .creative-sidebar::after {
        height: 132px;
      }
      .theme-creative .creative-layout.is-fill .creative-skill-list {
        gap: 7px;
      }
      .theme-creative .creative-layout.is-fill .creative-section {
        margin-top: 11px;
        padding-bottom: 10px;
      }
      .theme-creative .creative-layout.is-fill .creative-section h2 {
        font-size: 14.8px;
      }
      .theme-creative .creative-layout.is-fill .creative-section p {
        font-size: 12.45px;
        line-height: 1.55;
      }
      .theme-creative .creative-layout.is-fill .creative-section li {
        font-size: 12.15px;
        line-height: 1.53;
        margin-bottom: 3px;
      }
      .theme-creative .creative-layout.is-fill .creative-section .item-title,
      .theme-creative .creative-layout.is-fill .creative-section .edu-title {
        font-size: 12.9px;
      }
      .theme-creative .creative-layout.is-fill .creative-section .item-meta,
      .theme-creative .creative-layout.is-fill .creative-section .edu-date,
      .theme-creative .creative-layout.is-fill .creative-section .edu-meta {
        font-size: 11.25px;
      }
      .theme-tech {
        padding-top: 6px;
        min-height: 277mm;
      }
      .theme-tech .header {
        text-align: left;
        margin-bottom: 9px;
      }
      .theme-tech .header-main {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: end;
        gap: 14px;
        border-bottom: 1.5px solid #94a3b8;
        padding-bottom: 7px;
      }
      .theme-tech .profile-photo {
        display: block;
        width: 66px;
        height: 66px;
        object-fit: cover;
        border-radius: 6px;
        border: 1px solid #94a3b8;
      }
      .theme-tech .header h1 {
        margin: 0;
        text-transform: uppercase;
        font-size: 31px;
        line-height: 0.98;
        letter-spacing: 0.55px;
        color: #0f172a;
      }
      .theme-tech .header .role {
        margin-top: 2px;
        color: #0284c7;
        font-size: 12.9px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      .theme-tech .header .contact,
      .theme-tech .header .links {
        margin-top: 2px;
        font-size: 11px;
        line-height: 1.34;
        color: #334155;
      }
      .theme-tech .header .links a {
        color: #0369a1;
      }
      .theme-tech .tech-layout {
        display: block;
      }
      .theme-tech .section {
        margin-top: 8px;
      }
      .theme-tech .tech-layout > .section:first-child {
        margin-top: 12px;
      }
      .theme-tech .section h2 {
        color: #0f172a;
        border-bottom: 1px solid #94a3b8;
        font-size: 11.9px;
        letter-spacing: 0.82px;
        padding-bottom: 2px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .theme-tech .section h2::before {
        content: "";
        width: 6px;
        height: 6px;
        border-radius: 2px;
        background: #0ea5e9;
        flex: 0 0 auto;
      }
      .theme-tech .section p {
        margin-top: 4px;
        font-size: 11.7px;
        line-height: 1.5;
        color: #1e293b;
      }
      .theme-tech ul {
        margin: 4px 0 0 16px;
      }
      .theme-tech li {
        font-size: 11.5px;
        line-height: 1.46;
        margin: 0 0 3px;
        color: #1e293b;
      }
      .theme-tech .exp-item,
      .theme-tech .project-item {
        margin-top: 7px;
        border-left: 2px solid #7dd3fc;
        padding-left: 10px;
      }
      .theme-tech .edu-item {
        margin-top: 7px;
      }
      .theme-tech .item-head,
      .theme-tech .edu-head {
        gap: 7px;
      }
      .theme-tech .item-title,
      .theme-tech .edu-title {
        font-size: 12.5px;
        color: #0f172a;
      }
      .theme-tech .item-meta,
      .theme-tech .edu-date,
      .theme-tech .edu-meta {
        font-size: 10.9px;
        color: #475569;
      }
      .theme-tech .item-meta a {
        color: #0369a1;
      }
      .theme-tech .section-technical-skills .skills-grid {
        margin-top: 4px;
        display: grid;
        gap: 5px;
      }
      .theme-tech .section-technical-skills .skill-row {
        grid-template-columns: 126px 1fr;
        gap: 8px;
        align-items: center;
        font-size: 11.2px;
      }
      .theme-tech .section-technical-skills .skill-row strong {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 21px;
        padding: 2px 9px;
        border-radius: 999px;
        background: #e0f2fe;
        color: #0c4a6e;
        font-size: 10.2px;
        letter-spacing: 0.35px;
        text-transform: uppercase;
      }
      .theme-tech .section-technical-skills .skill-row span {
        display: block;
        min-height: 21px;
        padding: 3px 9px;
        border-radius: 999px;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        color: #0f172a;
        line-height: 1.34;
      }
      .theme-tech .section-additional-skills ul,
      .theme-tech .section-additional-details ul,
      .theme-tech .section-subjects-of-interest ul {
        margin-top: 4px;
      }
      .theme-tech .section-additional-skills li,
      .theme-tech .section-additional-details li,
      .theme-tech .section-subjects-of-interest li {
        list-style: none;
        margin: 0 0 4px;
        padding: 4px 8px;
        border-radius: 6px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
      }
      .theme-tech .section-declaration p {
        border-left: 2px solid #bae6fd;
        padding-left: 8px;
      }
      .theme-tech.tech-fill .header {
        margin-bottom: 11px;
      }
      .theme-tech.tech-fill .header h1 {
        font-size: 33px;
      }
      .theme-tech.tech-fill .header .role {
        font-size: 13.6px;
      }
      .theme-tech.tech-fill .header .contact,
      .theme-tech.tech-fill .header .links {
        font-size: 11.6px;
      }
      .theme-tech .tech-layout.is-fill .section {
        margin-top: 12px;
      }
      .theme-tech .tech-layout.is-fill > .section:first-child {
        margin-top: 14px;
      }
      .theme-tech .tech-layout.is-fill .section h2 {
        font-size: 12.8px;
      }
      .theme-tech .tech-layout.is-fill .section p {
        font-size: 12.35px;
        line-height: 1.58;
      }
      .theme-tech .tech-layout.is-fill li {
        font-size: 12.15px;
        line-height: 1.56;
        margin-bottom: 3px;
      }
      .theme-tech .tech-layout.is-fill .exp-item,
      .theme-tech .tech-layout.is-fill .project-item,
      .theme-tech .tech-layout.is-fill .edu-item {
        margin-top: 10px;
      }
      .theme-tech .tech-layout.is-fill .item-title,
      .theme-tech .tech-layout.is-fill .edu-title {
        font-size: 13.2px;
      }
      .theme-tech .tech-layout.is-fill .item-meta,
      .theme-tech .tech-layout.is-fill .edu-date,
      .theme-tech .tech-layout.is-fill .edu-meta {
        font-size: 11.55px;
      }
      .theme-tech .tech-layout.is-fill .section-technical-skills .skill-row {
        grid-template-columns: 150px 1fr;
        font-size: 11.9px;
      }
      .theme-tech .tech-layout.is-fill .section-technical-skills .skill-row strong {
        font-size: 10.8px;
        min-height: 24px;
      }
      .theme-tech .tech-layout.is-fill .section-technical-skills .skill-row span {
        min-height: 24px;
      }
      .theme-executive {
        padding: 0;
        min-height: 277mm;
        background: #f4f4f2;
        display: flex;
        flex-direction: column;
      }
      .theme-executive .executive-header {
        margin: 0;
        padding: 16px 24px 18px;
        text-align: center;
        background: linear-gradient(180deg, #112d4a 0%, #0f2942 100%);
        border: 1px solid #10273d;
        border-bottom: 0;
      }
      .theme-executive .executive-monogram {
        width: 66px;
        height: 44px;
        margin: 0 auto 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 2px;
        background: #c6ad77;
        border: 1px solid #b4975b;
        color: #20384f;
        font-size: 23px;
        font-weight: 700;
        letter-spacing: 0.7px;
      }
      .theme-executive .executive-header h1 {
        margin: 0;
        font-size: 47px;
        line-height: 0.98;
        color: #d3bb89;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .theme-executive .executive-header .role {
        margin-top: 8px;
        color: #f5f5f4;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 3px;
        text-transform: uppercase;
      }
      .theme-executive .executive-layout {
        display: grid;
        grid-template-columns: 216px 1fr;
        border: 1px solid #d1d5db;
        border-top: 0;
        background: #fbfbfa;
        flex: 1;
        min-height: 0;
        align-items: stretch;
      }
      .theme-executive .executive-sidebar {
        border-right: 1px solid #c7c7c7;
        background: #f3f3f1;
        padding: 18px 15px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .theme-executive .executive-panel {
        margin: 0;
        padding-bottom: 12px;
        border-bottom: 1px solid #d7d7d4;
      }
      .theme-executive .executive-panel:last-child {
        padding-bottom: 0;
        border-bottom: 0;
      }
      .theme-executive .executive-panel h3 {
        margin: 0;
        font-size: 15px;
        letter-spacing: 2.3px;
        text-transform: uppercase;
        color: #1f2937;
        padding-bottom: 6px;
      }
      .theme-executive .executive-panel p {
        margin: 4px 0 0;
        font-size: 11.2px;
        line-height: 1.48;
        color: #4b5563;
      }
      .theme-executive .executive-contact-list {
        display: grid;
        gap: 5px;
      }
      .theme-executive .executive-contact-row {
        display: grid;
        grid-template-columns: 22px 1fr;
        gap: 5px;
      }
      .theme-executive .executive-contact-label {
        font-size: 10.95px;
        font-weight: 700;
        color: #374151;
      }
      .theme-executive .executive-contact-value {
        font-size: 10.8px;
        line-height: 1.42;
        color: #4b5563;
        overflow-wrap: anywhere;
      }
      .theme-executive .executive-mini-item {
        margin-top: 8px;
      }
      .theme-executive .executive-mini-item:first-of-type {
        margin-top: 4px;
      }
      .theme-executive .executive-mini-title {
        font-size: 12.2px;
        line-height: 1.35;
        font-weight: 700;
        color: #1f2937;
        text-transform: uppercase;
        letter-spacing: 0.35px;
      }
      .theme-executive .executive-mini-meta {
        margin-top: 1px;
        font-size: 10.8px;
        line-height: 1.4;
        color: #4b5563;
      }
      .theme-executive .executive-token-list {
        margin: 5px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 4px;
      }
      .theme-executive .executive-token-list li {
        margin: 0;
        font-size: 11.15px;
        line-height: 1.45;
        color: #374151;
      }
      .theme-executive .executive-main {
        padding: 16px 18px 16px 20px;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
      }
      .theme-executive .section {
        margin-top: 13px;
      }
      .theme-executive .section:first-child {
        margin-top: 0;
      }
      .theme-executive .section h2 {
        color: #1f2937;
        border-bottom: 1.4px solid #c8aa6d;
        font-size: 12.9px;
        letter-spacing: 1.6px;
        padding-bottom: 4px;
      }
      .theme-executive .section p {
        margin-top: 5px;
        font-size: 11.9px;
        line-height: 1.62;
        color: #374151;
      }
      .theme-executive ul {
        margin: 5px 0 0 18px;
      }
      .theme-executive li {
        font-size: 11.6px;
        line-height: 1.58;
        margin: 0 0 3px;
        color: #374151;
      }
      .theme-executive .edu-item,
      .theme-executive .exp-item,
      .theme-executive .project-item {
        margin-top: 8px;
      }
      .theme-executive .item-head,
      .theme-executive .edu-head {
        gap: 12px;
      }
      .theme-executive .item-title,
      .theme-executive .edu-title {
        font-size: 12.4px;
        color: #1f2937;
      }
      .theme-executive .item-meta,
      .theme-executive .edu-date,
      .theme-executive .edu-meta {
        font-size: 11px;
        color: #4b5563;
      }
      .theme-executive .item-meta a {
        color: #8b6b2e;
      }
      .theme-executive .executive-layout.is-compact .section {
        margin-top: 10px;
      }
      .theme-executive .executive-layout.is-compact .section h2 {
        font-size: 12.5px;
      }
      .theme-executive .executive-layout.is-compact .section p {
        font-size: 11.45px;
        line-height: 1.48;
      }
      .theme-executive .executive-layout.is-compact li {
        font-size: 11.2px;
        line-height: 1.46;
      }
      .theme-executive.executive-fill .executive-header {
        padding-top: 18px;
        padding-bottom: 20px;
      }
      .theme-executive.executive-fill .executive-header h1 {
        font-size: 50px;
      }
      .theme-executive.executive-fill .executive-header .role {
        font-size: 14.8px;
      }
      .theme-executive .executive-layout.is-fill .executive-sidebar {
        gap: 18px;
      }
      .theme-executive .executive-layout.is-fill .executive-panel h3 {
        font-size: 16px;
      }
      .theme-executive .executive-layout.is-fill .executive-contact-value,
      .theme-executive .executive-layout.is-fill .executive-mini-meta,
      .theme-executive .executive-layout.is-fill .executive-token-list li {
        font-size: 11.35px;
        line-height: 1.5;
      }
      .theme-executive .executive-layout.is-fill .executive-mini-title {
        font-size: 12.8px;
      }
      .theme-executive .executive-layout.is-fill .executive-main {
        padding-top: 18px;
        padding-bottom: 20px;
      }
      .theme-executive .executive-layout.is-fill .section {
        margin-top: 17px;
      }
      .theme-executive .executive-layout.is-fill .section h2 {
        font-size: 13.6px;
      }
      .theme-executive .executive-layout.is-fill .section p {
        font-size: 12.35px;
        line-height: 1.68;
      }
      .theme-executive .executive-layout.is-fill li {
        font-size: 12.1px;
        line-height: 1.64;
      }
      .theme-executive .executive-layout.is-fill .item-title,
      .theme-executive .executive-layout.is-fill .edu-title {
        font-size: 12.95px;
      }
      .theme-executive .executive-layout.is-fill .item-meta,
      .theme-executive .executive-layout.is-fill .edu-date,
      .theme-executive .executive-layout.is-fill .edu-meta {
        font-size: 11.4px;
      }
      .theme-executive .executive-layout.is-fill.is-sparse .executive-main,
      .theme-executive .executive-layout.is-fill.is-sparse .executive-sidebar {
        justify-content: space-between;
      }
      .theme-executive .executive-layout.is-fill.is-sparse .section {
        margin-top: 0;
      }
      .theme-classic .header h1 {
        letter-spacing: 0.9px;
      }
      .theme-classic .header {
        text-align: center;
        margin-bottom: 8px;
      }
      .theme-classic .header-main {
        display: block;
      }
      .theme-classic .profile-photo {
        display: none !important;
      }
      .theme-classic .header h1 {
        font-size: 44px;
        line-height: 1;
        color: #1f2937;
        text-transform: uppercase;
      }
      .theme-classic .header .role {
        margin-top: 2px;
        font-size: 14px;
        font-weight: 600;
        color: #111827;
      }
      .theme-classic .header .contact,
      .theme-classic .header .links {
        margin-top: 2px;
        font-size: 10.8px;
        color: #374151;
      }
      .theme-classic .header .links a {
        color: #374151;
        text-decoration: none;
      }
      .theme-classic .section {
        margin-top: 9px;
        border-top: 1px solid #374151;
        padding-top: 5px;
      }
      .theme-classic .section h2 {
        border-bottom: none;
        text-align: center;
        text-transform: none;
        letter-spacing: 0.2px;
        font-size: 16px;
        font-weight: 600;
        color: #1f2937;
        padding-bottom: 0;
      }
      .theme-classic .section p {
        margin-top: 4px;
        font-size: 11.3px;
        line-height: 1.42;
        color: #1f2937;
      }
      .theme-classic ul {
        margin: 3px 0 0 16px;
      }
      .theme-classic li {
        font-size: 11.2px;
        line-height: 1.36;
        margin: 0 0 1px;
        color: #1f2937;
      }
      .theme-classic .edu-item,
      .theme-classic .exp-item,
      .theme-classic .project-item {
        margin-top: 5px;
      }
      .theme-classic .item-title,
      .theme-classic .edu-title {
        font-size: 12px;
        font-weight: 700;
        color: #111827;
      }
      .theme-classic .item-meta,
      .theme-classic .edu-date,
      .theme-classic .edu-meta {
        font-size: 10.7px;
        color: #374151;
      }
      .theme-classic .item-meta a {
        color: #374151;
      }
      .theme-classic .skills-grid {
        gap: 2px;
      }
      .theme-classic .skill-row {
        grid-template-columns: 155px 1fr;
        font-size: 11.2px;
      }
      .theme-classic .classic-achievements-grid {
        margin-top: 4px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .theme-classic .classic-achievement-item {
        min-width: 0;
      }
      .theme-classic .classic-achievement-title {
        font-size: 11.1px;
        font-weight: 700;
        color: #111827;
      }
      .theme-classic .classic-achievement-meta {
        margin-top: 1px;
        font-size: 10px;
        color: #4b5563;
        line-height: 1.25;
      }
      .theme-classic.classic-fill {
        padding-top: 14px;
        padding-bottom: 12px;
      }
      .theme-classic.classic-fill .header {
        margin-bottom: 12px;
      }
      .theme-classic.classic-fill .header h1 {
        font-size: 40px;
      }
      .theme-classic.classic-fill .header .role {
        font-size: 16px;
      }
      .theme-classic.classic-fill .header .contact,
      .theme-classic.classic-fill .header .links {
        font-size: 12px;
      }
      .theme-classic.classic-fill .section {
        margin-top: 13px;
        padding-top: 7px;
      }
      .theme-classic.classic-fill .section h2 {
        font-size: 18px;
      }
      .theme-classic.classic-fill .section p {
        font-size: 12.8px;
        line-height: 1.56;
      }
      .theme-classic.classic-fill li {
        font-size: 12.6px;
        line-height: 1.5;
        margin-bottom: 3px;
      }
      .theme-classic.classic-fill .item-title,
      .theme-classic.classic-fill .edu-title {
        font-size: 13.8px;
      }
      .theme-classic.classic-fill .item-meta,
      .theme-classic.classic-fill .edu-date,
      .theme-classic.classic-fill .edu-meta {
        font-size: 12px;
      }
      .theme-classic.classic-fill .edu-item,
      .theme-classic.classic-fill .exp-item,
      .theme-classic.classic-fill .project-item {
        margin-top: 9px;
      }
      .theme-classic.classic-fill .skills-grid {
        gap: 4px;
      }
      .theme-classic.classic-fill .skill-row {
        grid-template-columns: 185px 1fr;
        font-size: 12.4px;
      }
      .theme-classic.classic-fill .classic-achievements-grid {
        gap: 14px;
      }
      .theme-classic.classic-fill .classic-achievement-title {
        font-size: 12.4px;
      }
      .theme-classic.classic-fill .classic-achievement-meta {
        font-size: 11.2px;
      }
      .theme-faang .section h2 {
        color: #111827;
      }
      .theme-minimal {
        padding-top: 10px;
        min-height: 277mm;
      }
      .theme-minimal .header {
        text-align: center;
        margin-bottom: 14px;
        padding-bottom: 8px;
        border-bottom: 1.4px solid #9ca3af;
      }
      .theme-minimal .header h1 {
        font-size: 35px;
        line-height: 1.08;
        letter-spacing: 0.55px;
        text-transform: uppercase;
        color: #111827;
      }
      .theme-minimal .header .role {
        margin-top: 3px;
        font-size: 13.2px;
        font-weight: 500;
        color: #374151;
      }
      .theme-minimal .header .contact,
      .theme-minimal .header .links {
        margin-top: 2px;
        font-size: 10.9px;
        line-height: 1.3;
        color: #4b5563;
      }
      .theme-minimal .header .links a {
        color: #4b5563;
        text-decoration: none;
      }
      .theme-minimal .minimal-layout {
        display: block;
      }
      .theme-minimal .section {
        margin-top: 13px;
        padding-top: 8px;
        border-top: 1.3px solid #4b5563;
      }
      .theme-minimal .section h2 {
        color: #111827;
        border-bottom: none;
        text-align: center;
        text-transform: none;
        letter-spacing: 0;
        font-size: 15.4px;
        font-weight: 600;
      }
      .theme-minimal .section p {
        margin-top: 5px;
        font-size: 11.45px;
        line-height: 1.48;
        color: #1f2937;
      }
      .theme-minimal ul {
        margin: 4px 0 0 14px;
      }
      .theme-minimal li {
        font-size: 11.15px;
        line-height: 1.46;
        margin: 0 0 2px;
        color: #1f2937;
      }
      .theme-minimal .exp-item,
      .theme-minimal .project-item,
      .theme-minimal .edu-item,
      .theme-minimal .minimal-exp-item,
      .theme-minimal .minimal-edu-item {
        margin-top: 7px;
      }
      .theme-minimal .item-title,
      .theme-minimal .edu-title,
      .theme-minimal .minimal-exp-company,
      .theme-minimal .minimal-edu-school {
        font-size: 12.55px;
        font-weight: 700;
        color: #111827;
      }
      .theme-minimal .item-meta,
      .theme-minimal .edu-date,
      .theme-minimal .edu-meta,
      .theme-minimal .minimal-exp-meta,
      .theme-minimal .minimal-edu-date,
      .theme-minimal .minimal-edu-meta {
        font-size: 10.9px;
        color: #4b5563;
      }
      .theme-minimal .item-meta a {
        color: #4b5563;
        text-decoration: none;
      }
      .theme-minimal .minimal-exp-head,
      .theme-minimal .minimal-edu-head {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 10px;
      }
      .theme-minimal .minimal-exp-role,
      .theme-minimal .minimal-edu-degree {
        margin-top: 1px;
        font-size: 11.25px;
        color: #374151;
      }
      .theme-minimal .minimal-exp-meta {
        text-align: right;
        white-space: nowrap;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .theme-minimal .minimal-edu-meta {
        margin-top: 1px;
      }
      .theme-minimal .minimal-exp-item ul {
        margin-top: 3px;
      }
      .theme-minimal .minimal-achievements-grid {
        margin-top: 5px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .theme-minimal .minimal-achievement-item {
        min-width: 0;
      }
      .theme-minimal .minimal-achievement-title {
        font-size: 11.2px;
        font-weight: 700;
        color: #111827;
      }
      .theme-minimal .minimal-achievement-detail {
        margin-top: 1px;
        font-size: 10.5px;
        color: #374151;
      }
      .theme-minimal .minimal-achievement-duration {
        margin-top: 1px;
        font-size: 10.35px;
        color: #6b7280;
      }
      .theme-minimal .minimal-skills-inline {
        margin-top: 5px;
        font-size: 11.2px;
        line-height: 1.48;
        color: #1f2937;
      }
      .theme-minimal .skills-grid {
        margin-top: 4px;
        gap: 2px;
      }
      .theme-minimal .skill-row {
        grid-template-columns: 160px 1fr;
        gap: 6px;
        font-size: 11.1px;
      }
      .theme-minimal.minimal-fill .header {
        margin-bottom: 17px;
      }
      .theme-minimal.minimal-fill .header h1 {
        font-size: 38px;
      }
      .theme-minimal.minimal-fill .header .role {
        font-size: 14px;
        margin-top: 4px;
      }
      .theme-minimal.minimal-fill .header .contact,
      .theme-minimal.minimal-fill .header .links {
        font-size: 11.3px;
      }
      .theme-minimal .minimal-layout.is-fill .section {
        margin-top: 16px;
        padding-top: 10px;
      }
      .theme-minimal .minimal-layout.is-fill .section h2 {
        font-size: 16.1px;
      }
      .theme-minimal .minimal-layout.is-fill .section p {
        font-size: 12.15px;
        line-height: 1.56;
      }
      .theme-minimal .minimal-layout.is-fill li {
        font-size: 11.75px;
        line-height: 1.54;
        margin-bottom: 3px;
      }
      .theme-minimal .minimal-layout.is-fill .minimal-exp-item,
      .theme-minimal .minimal-layout.is-fill .minimal-edu-item,
      .theme-minimal .minimal-layout.is-fill .project-item,
      .theme-minimal .minimal-layout.is-fill .exp-item,
      .theme-minimal .minimal-layout.is-fill .edu-item {
        margin-top: 9px;
      }
      .theme-minimal .minimal-layout.is-fill .item-title,
      .theme-minimal .minimal-layout.is-fill .edu-title,
      .theme-minimal .minimal-layout.is-fill .minimal-exp-company,
      .theme-minimal .minimal-layout.is-fill .minimal-edu-school {
        font-size: 13.2px;
      }
      .theme-minimal .minimal-layout.is-fill .item-meta,
      .theme-minimal .minimal-layout.is-fill .edu-date,
      .theme-minimal .minimal-layout.is-fill .edu-meta,
      .theme-minimal .minimal-layout.is-fill .minimal-exp-meta,
      .theme-minimal .minimal-layout.is-fill .minimal-edu-date,
      .theme-minimal .minimal-layout.is-fill .minimal-edu-meta {
        font-size: 11.35px;
      }
      .theme-minimal .minimal-layout.is-fill .minimal-skills-inline {
        font-size: 11.85px;
        line-height: 1.55;
      }
      .theme-minimal .minimal-layout.is-fill .skill-row {
        font-size: 11.75px;
      }
    </style>
  </head>
  <body>
    <main class="page ${theme.className} ${modernDensityClass} ${classicDensityClass} ${minimalDensityClass} ${techDensityClass} ${executiveDensityClass}">
      ${header}
      ${body}
    </main>
  </body>
</html>`;
}

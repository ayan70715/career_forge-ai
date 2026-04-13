export type CoverLetterFormPayload = {
  name: string;
  targetRole: string;
  company: string;
  senderEmail: string;
  senderPhone: string;
  senderLocation: string;
  senderLinkedin: string;
  recipientName: string;
  recipientTitle: string;
  recipientAddress: string;
  letterDate: string;
};

export type CoverLetterDraftPayload = {
  subjectLine: string;
  salutation: string;
  openingParagraph: string;
  bodyParagraphs: string[];
  achievementBullets: string[];
  closingParagraph: string;
  signOff: string;
  signatureName: string;
};

export type CoverLetterPdfPayload = {
  form: CoverLetterFormPayload;
  draft: CoverLetterDraftPayload;
  signatureImageBase64?: string | null;
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
    .filter(Boolean);
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function formatDate(rawDate: string): string {
  const trimmed = rawDate.trim();
  if (!trimmed) {
    return new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function normalizeSignatureImage(value?: string | null): string {
  const src = (value || "").trim();
  if (!src) return "";
  if (/^data:image\/[a-zA-Z]+;base64,/.test(src)) return src;
  return "";
}

function renderParagraphs(paragraphs: string[]): string {
  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function buildBodyParagraphs(draft: CoverLetterDraftPayload): string[] {
  const explicit = draft.bodyParagraphs
    .map((paragraph) => cleanInvisible(paragraph).trim())
    .filter(Boolean);

  if (explicit.length > 0) {
    return explicit;
  }

  return splitLines(draft.openingParagraph);
}

function buildBulletPoints(draft: CoverLetterDraftPayload): string[] {
  return draft.achievementBullets
    .map((bullet) => cleanInvisible(bullet).replace(/^[-*\u2022]\s*/, "").trim())
    .filter(Boolean);
}

function limitWords(text: string, maxWords: number): string {
  const words = cleanInvisible(text)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length <= maxWords) {
    return words.join(" ");
  }

  return `${words.slice(0, maxWords).join(" ")}.`;
}

function clampParagraphs(paragraphs: string[], maxCount: number, maxWords: number): string[] {
  return paragraphs
    .slice(0, maxCount)
    .map((paragraph) => limitWords(paragraph, maxWords))
    .filter(Boolean);
}

export function renderCoverLetterHtml(payload: CoverLetterPdfPayload): string {
  const { form, draft } = payload;

  const displayName = form.name.trim() || "Candidate";
  const displayRole = form.targetRole.trim();
  const companyName = form.company.trim();

  const contactLines = [
    form.senderEmail.trim(),
    form.senderPhone.trim(),
    form.senderLocation.trim(),
    form.senderLinkedin.trim() ? normalizeUrl(form.senderLinkedin) : "",
  ].filter(Boolean);

  const recipientLines = [
    form.recipientName.trim(),
    form.recipientTitle.trim(),
    companyName,
    ...splitLines(form.recipientAddress),
  ].filter(Boolean);

  const letterDate = formatDate(form.letterDate);
  const subjectLine = limitWords(cleanInvisible(draft.subjectLine).trim() || `${displayRole || "Application"} Position`, 14);
  const salutation = cleanInvisible(draft.salutation).trim() || "Dear Hiring Manager,";
  const openingParagraph = limitWords(cleanInvisible(draft.openingParagraph).trim(), 82);
  const bodyParagraphs = clampParagraphs(buildBodyParagraphs(draft), 2, 78);
  const bulletPoints = clampParagraphs(buildBulletPoints(draft), 2, 16);
  const closingParagraph = limitWords(cleanInvisible(draft.closingParagraph).trim(), 60);
  const signOff = cleanInvisible(draft.signOff).trim() || "Sincerely,";
  const signatureName = cleanInvisible(draft.signatureName).trim() || displayName;
  const signatureImage = normalizeSignatureImage(payload.signatureImageBase64);

  const openingBlock = openingParagraph ? `<p>${escapeHtml(openingParagraph)}</p>` : "";
  const bodyBlock = bodyParagraphs.length > 0 ? renderParagraphs(bodyParagraphs) : "";
  const bulletBlock = bulletPoints.length
    ? `<ul>${bulletPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>`
    : "";
  const closingBlock = closingParagraph ? `<p>${escapeHtml(closingParagraph)}</p>` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cover Letter</title>
  <style>
    :root {
      --text: #111827;
      --muted: #4b5563;
      --accent: #1f2937;
      --line: #d1d5db;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: var(--text);
      font-family: Cambria, Georgia, "Times New Roman", serif;
      font-size: 11.1pt;
      line-height: 1.38;
    }

    .page {
      width: 100%;
      height: 277mm;
      padding: 12mm 12mm 10mm;
      overflow: hidden;
    }

    .header {
      display: flex;
      justify-content: space-between;
      gap: 12mm;
      padding-bottom: 5mm;
      border-bottom: 1px solid var(--line);
    }

    .identity h1 {
      margin: 0;
      font-size: 18.5pt;
      line-height: 1.2;
      color: var(--accent);
      font-weight: 700;
      letter-spacing: 0;
    }

    .identity .role {
      margin-top: 2px;
      font-size: 10.5pt;
      color: var(--muted);
    }

    .contact {
      text-align: right;
      font-size: 9.6pt;
      color: var(--muted);
      word-break: break-word;
      min-width: 58mm;
    }

    .contact div + div {
      margin-top: 1.2px;
    }

    .meta {
      margin-top: 5mm;
      margin-bottom: 4mm;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8mm;
      font-size: 10.3pt;
    }

    .meta .subject {
      color: var(--accent);
      font-weight: 700;
      text-align: right;
    }

    .recipient {
      margin-bottom: 4mm;
      color: var(--text);
      font-size: 10.3pt;
    }

    .recipient div + div {
      margin-top: 1px;
    }

    .salutation {
      margin-bottom: 3mm;
      font-size: 10.7pt;
      font-weight: 600;
    }

    .body {
      font-size: 10.6pt;
    }

    .body p {
      margin: 0 0 2.7mm;
      text-align: justify;
    }

    .body ul {
      margin: 1mm 0 3mm 5mm;
      padding: 0;
    }

    .body li {
      margin-bottom: 1.6mm;
      text-align: justify;
    }

    .signature {
      margin-top: 4.2mm;
      font-size: 10.5pt;
    }

    .signature-image {
      margin-top: 2mm;
      margin-bottom: 2mm;
      max-height: 44px;
      max-width: 220px;
      object-fit: contain;
      display: block;
    }

    .signature-name {
      margin-top: 1mm;
      font-weight: 700;
      color: var(--text);
    }

    @page {
      size: A4;
      margin: 0;
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="identity">
        <h1>${escapeHtml(displayName)}</h1>
        ${displayRole ? `<div class="role">${escapeHtml(displayRole)}</div>` : ""}
      </div>
      ${contactLines.length ? `<div class="contact">${contactLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>` : ""}
    </header>

    <section class="meta">
      <div class="date">${escapeHtml(letterDate)}</div>
      <div class="subject">Re: ${escapeHtml(subjectLine)}</div>
    </section>

    ${recipientLines.length ? `<section class="recipient">${recipientLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</section>` : ""}

    <div class="salutation">${escapeHtml(salutation)}</div>

    <section class="body">
      ${openingBlock}
      ${bodyBlock}
      ${bulletBlock}
      ${closingBlock}
    </section>

    <section class="signature">
      <div>${escapeHtml(signOff)}</div>
      ${signatureImage ? `<img class="signature-image" src="${signatureImage}" alt="Signature" />` : ""}
      <div class="signature-name">${escapeHtml(signatureName)}</div>
    </section>
  </main>
</body>
</html>`;
}

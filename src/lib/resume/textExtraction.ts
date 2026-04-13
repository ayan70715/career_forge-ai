export type SupportedResumeFileType = "pdf" | "docx" | "text";

export const MAX_RESUME_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME_TYPE = "application/pdf";

function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0) return "";
  return fileName.slice(idx).toLowerCase();
}

export function isPdfFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return file.type === PDF_MIME_TYPE || ext === ".pdf";
}

export function isDocxFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return file.type === DOCX_MIME_TYPE || ext === ".docx";
}

export function isPlainTextFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return file.type.startsWith("text/") || ext === ".txt" || ext === ".text" || ext === ".md";
}

export function getSupportedResumeFileType(file: File): SupportedResumeFileType | null {
  if (isPdfFile(file)) return "pdf";
  if (isDocxFile(file)) return "docx";
  if (isPlainTextFile(file)) return "text";
  return null;
}

export function isSupportedResumeFile(file: File): boolean {
  return getSupportedResumeFileType(file) !== null;
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => {
        const withText = item as { str?: string };
        return typeof withText.str === "string" ? withText.str : "";
      })
      .join(" ");
    textParts.push(pageText);
  }

  return textParts.join("\n\n").trim();
}

export async function extractTextFromDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.replace(/\r/g, "").trim();
}

export async function extractTextFromSupportedResumeFile(
  file: File
): Promise<{ type: SupportedResumeFileType; text: string }> {
  const detectedType = getSupportedResumeFileType(file);
  if (!detectedType) {
    throw new Error("Unsupported file type. Please upload a PDF, DOCX, or text file.");
  }

  if (detectedType === "pdf") {
    return { type: "pdf", text: await extractTextFromPdf(file) };
  }

  if (detectedType === "docx") {
    return { type: "docx", text: await extractTextFromDocx(file) };
  }

  return { type: "text", text: (await file.text()).trim() };
}

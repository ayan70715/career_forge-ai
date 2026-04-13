import { NextRequest, NextResponse } from "next/server";
import { renderCoverLetterHtml, type CoverLetterPdfPayload } from "@/lib/pdf/coverLetterHtmlTemplates";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let browser: Awaited<ReturnType<typeof import("puppeteer")["default"]["launch"]>> | null = null;

  try {
    const payload = (await req.json()) as CoverLetterPdfPayload;

    if (!payload?.form?.name?.trim() || !payload?.form?.targetRole?.trim()) {
      return NextResponse.json(
        { error: "Missing mandatory fields: name and targetRole" },
        { status: 400 }
      );
    }

    if (!payload?.draft?.openingParagraph?.trim() && !payload?.draft?.bodyParagraphs?.length) {
      return NextResponse.json(
        { error: "Missing cover letter content to export" },
        { status: 400 }
      );
    }

    const html = renderCoverLetterHtml(payload);
    const puppeteer = (await import("puppeteer")).default;

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "10mm",
        right: "10mm",
        bottom: "10mm",
        left: "10mm",
      },
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=cover-letter.pdf",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Cover letter PDF generation failed: ${message}` },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

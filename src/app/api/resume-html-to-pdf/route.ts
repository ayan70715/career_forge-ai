import { NextRequest, NextResponse } from "next/server";
import { renderResumeHtml, type ResumePdfPayload } from "@/lib/pdf/resumeHtmlTemplates";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let browser: Awaited<ReturnType<typeof import("puppeteer")["default"]["launch"]>> | null = null;

  try {
    const payload = (await req.json()) as ResumePdfPayload;

    if (!payload?.form?.fullName?.trim() || !payload?.form?.targetRole?.trim()) {
      return NextResponse.json(
        { error: "Missing mandatory fields: fullName and targetRole" },
        { status: 400 }
      );
    }

    const html = renderResumeHtml(payload);
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
        "Content-Disposition": "attachment; filename=resume.pdf",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `HTML PDF generation failed: ${message}` },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const RESUME_CLS_CONTENT = String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{resume}[2026/03/15 Lightweight resume class]

\LoadClass[11pt]{article}
\RequirePackage{ifthen}
\RequirePackage{hyperref}
\RequirePackage{titlesec}
\RequirePackage{enumitem}
\RequirePackage{parskip}
\RequirePackage{fancyhdr}

\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\setlength{\parindent}{0pt}
\setlength{\parskip}{3pt}

\makeatletter
\def\@name{}
\def\@addressone{}
\def\@addresstwo{}

\newcommand{\name}[1]{\gdef\@name{#1}}
\providecommand{\address}[1]{}
\renewcommand{\address}[1]{%
  \ifthenelse{\equal{\@addressone}{}}{\gdef\@addressone{#1}}{\gdef\@addresstwo{#1}}%
}

\AtBeginDocument{%
  \begin{center}
    {\LARGE\bfseries \@name}\\[2pt]
    {\@addressone}
    \ifthenelse{\equal{\@addresstwo}{}}{}{\\{\@addresstwo}}
  \end{center}
  \vspace{2pt}
}
\makeatother

\newcommand{\sectionskip}{\vspace{6pt}}

\newenvironment{rSection}[1]{%
  \sectionskip
  {\bfseries\MakeUppercase{#1}}\\[-2pt]
  \rule{\linewidth}{0.4pt}\\[-7pt]
  \begin{list}{}{\setlength{\leftmargin}{0em}}
  \item[]
}{%
  \end{list}
}`;

function cleanupDir(workDir: string) {
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors.
  }
}

function resolvePdfLatexBinary(): string | null {
  const envPath = process.env.PDFLATEX_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const whereProbe = spawnSync("where", ["pdflatex"], {
    encoding: "utf-8",
    timeout: 10000,
  });

  if (!whereProbe.error && whereProbe.status === 0) {
    const first = whereProbe.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (first) return first;
  }

  const candidates = [
    join(process.env.LOCALAPPDATA || "", "Programs", "MiKTeX", "miktex", "bin", "x64", "pdflatex.exe"),
    join(process.env.ProgramFiles || "", "MiKTeX", "miktex", "bin", "x64", "pdflatex.exe"),
    join(process.env.USERPROFILE || "", "AppData", "Local", "Programs", "MiKTeX", "miktex", "bin", "x64", "pdflatex.exe"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function runPdfLatex(pdflatexBin: string, workDir: string, haltOnError = true) {
  const args = ["-interaction=nonstopmode"];
  if (haltOnError) args.push("-halt-on-error");
  args.push("resume.tex");

  return spawnSync(pdflatexBin, args, {
    cwd: workDir,
    encoding: "utf-8",
    timeout: 180000,
  });
}

function sanitizeLatexInput(input: string): string {
  return input
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/\r\n/g, "\n");
}

export async function POST(req: NextRequest) {
  try {
    const { latex, photo } = await req.json();

    if (!latex) {
      return NextResponse.json({ error: "No LaTeX code provided" }, { status: 400 });
    }

    const pdflatexBin = resolvePdfLatexBinary();
    if (!pdflatexBin) {
      return NextResponse.json(
        {
          error:
            "LaTeX compiler not found: 'pdflatex' is not available to the server process. Install MiKTeX/TeX Live and restart VS Code + Next.js dev server, or set PDFLATEX_PATH.",
        },
        { status: 500 }
      );
    }

    const id = randomUUID();
    const workDir = join(tmpdir(), `latex-${id}`);
    mkdirSync(workDir, { recursive: true });

    const texFile = join(workDir, "resume.tex");
    const pdfFile = join(workDir, "resume.pdf");
    const clsFile = join(workDir, "resume.cls");

    // Provide a local resume.cls so Overleaf-style templates compile with pdflatex.
    writeFileSync(clsFile, RESUME_CLS_CONTENT);

    // If photo base64 is provided, save it as photo.jpg in the work dir
    if (photo) {
      try {
        // Remove data URL prefix if present
        const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
        const photoBuffer = Buffer.from(base64Data, "base64");
        writeFileSync(join(workDir, "photo.jpg"), photoBuffer);
      } catch {
        // Photo processing failed, continue without photo
        console.warn("Failed to process photo, continuing without it");
      }
    }

    const safeLatex = sanitizeLatexInput(String(latex));
    writeFileSync(texFile, safeLatex);

    try {
      const firstPass = runPdfLatex(pdflatexBin, workDir, true);
      if (firstPass.error || firstPass.status !== 0) {
        throw new Error(firstPass.stderr || firstPass.stdout || firstPass.error?.message || "pdflatex failed");
      }

      // Run twice for references
      if (existsSync(pdfFile)) {
        runPdfLatex(pdflatexBin, workDir, false);
      }
    } catch (compileError: unknown) {
      // Check if PDF was still generated despite errors
      if (!existsSync(pdfFile)) {
        const logFile = join(workDir, "resume.log");
        let logContent = "";
        let errorSummary = "LaTeX compilation failed.";

        const compileMessage = compileError instanceof Error ? compileError.message : String(compileError);
        if (compileMessage) {
          errorSummary = `LaTeX compilation failed:\n${compileMessage.slice(0, 500)}`;
        }

        if (existsSync(logFile)) {
          const fullLog = readFileSync(logFile, "utf-8");
          logContent = fullLog.slice(-2000);
          // Extract key error lines
          const errorLines = fullLog
            .split("\n")
            .filter((l) => l.startsWith("!") || l.includes("Fatal error") || l.includes("Emergency stop"))
            .slice(0, 5)
            .join("\n");
          if (errorLines) {
            errorSummary = `LaTeX compilation failed:\n${errorLines}`;
          }
        }

        cleanupDir(workDir);
        return NextResponse.json(
          { error: errorSummary, log: logContent },
          { status: 400 }
        );
      }
    }

    if (!existsSync(pdfFile)) {
      cleanupDir(workDir);
      return NextResponse.json({ error: "PDF not generated" }, { status: 500 });
    }

    const pdfBuffer = readFileSync(pdfFile);

    cleanupDir(workDir);

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=resume.pdf",
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: "Internal server error during PDF generation" },
      { status: 500 }
    );
  }
}

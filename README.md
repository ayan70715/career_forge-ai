# CareerForge AI

> AI-powered career toolkit built with Next.js, TypeScript, Tailwind CSS, and Google Gemini 2.0 Flash.

---

## Features

### 1. Resume Builder
- Input your details, target role, and upload a **Job Description (PDF/TXT)**
- Select from **6 professional LaTeX templates** (Modern Professional, Classic Elegant, Creative Modern, Minimal Clean, Tech Developer, Executive Premium)
- Structured **education form** with GPA/CGPA/Percentage/Grade support and multiple entries
- **Profile photo** upload with circular clipping in supported templates
- AI generates a complete, ATS-optimized **LaTeX resume**
- **Download as PDF** (server-side LaTeX → PDF conversion)
- **Auto-fix**: if LaTeX compilation fails, AI automatically fixes errors (up to 2 attempts)
- Copy LaTeX code for manual editing

### 2. AI Resume Enhancer
- **4 enhancement levels:**
  - **Basic Polish** — Grammar, spelling, formatting fixes
  - **Professional Upgrade** — Action verbs, quantified achievements, ATS keywords
  - **Executive Rewrite** — Complete professional rewrite with strategic positioning
  - **Role-Targeted** — Tailored to a specific job description

### 3. ATS Checker
- Score your resume against job descriptions (0–100)
- Section-by-section analysis (formatting, keywords, content quality, etc.)
- Keyword match analysis (found vs. missing)
- Detailed actionable feedback

### 4. CV & Cover Letter Generator
- **Cover Letter** — Professional, personalized cover letters with LaTeX + PDF export
- **Academic CV** — Comprehensive academic curriculum vitae
- **Networking Email** — Professional cold email introductions
- Auto-fix on compilation failure (same as Resume Builder)

### 5. Live Interview Prep
- Real-time AI interview simulation
- **Voice interaction** — Speak your answers via microphone, AI speaks back
- Multiple interview types: Technical, Behavioral, System Design, HR, Custom
- Adjustable difficulty (Easy / Medium / Hard)
- Conversational history for natural follow-ups

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4 |
| **AI** | Google Gemini 2.0 Flash via `@google/generative-ai` |
| **PDF Generation** | Server-side LaTeX → PDF via `pdflatex` (TeX Live) |
| **PDF Parsing** | `pdfjs-dist` (client-side JD upload extraction) |
| **Markdown** | `react-markdown` |
| **Voice** | Web Speech API (Speech Recognition + Speech Synthesis) |
| **Icons** | Lucide React, React Icons |

---

## Prerequisites

Before setting up the project, ensure you have the following installed:

### 1. Node.js (v18 or higher)

Check if installed:
```bash
node --version   # Should be v18+
npm --version
```

If not installed, download from [nodejs.org](https://nodejs.org/) or use nvm:
```bash
# Install via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### 2. LaTeX Distribution (required for PDF export)

PDF generation uses `pdflatex` under the hood. You need a TeX Live installation with extra packages for fonts, icons, and TikZ graphics.

**Ubuntu / Debian:**
```bash
sudo apt-get update
sudo apt-get install -y \
  texlive-latex-base \
  texlive-latex-extra \
  texlive-latex-recommended \
  texlive-fonts-recommended \
  texlive-fonts-extra \
  texlive-pictures
```

**Fedora / RHEL:**
```bash
sudo dnf install -y \
  texlive-scheme-medium \
  texlive-collection-fontsrecommended \
  texlive-collection-fontsextra \
  texlive-collection-latexextra \
  texlive-fontawesome5
```

**macOS (via Homebrew):**
```bash
brew install --cask mactex-no-gui
# Or for a smaller install:
brew install --cask basictex
sudo tlmgr update --self
sudo tlmgr install fontawesome5 enumitem titlesec parskip charter hyperref xcolor pgf
```

**Windows:**
- Install [MiKTeX](https://miktex.org/download) (auto-installs missing packages)
- Or install [TeX Live for Windows](https://tug.org/texlive/windows.html)
- Make sure `pdflatex` is in your system PATH

**Verify installation:**
```bash
pdflatex --version
# Should output something like: pdfTeX 3.141592653-2.6-1.40.25 (TeX Live)

# Verify required packages:
kpsewhich fontawesome5.sty    # Should return a path
kpsewhich enumitem.sty        # Should return a path
kpsewhich tikz.sty            # Should return a path
```

### 3. Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key (free tier available)
3. You'll enter this key in the app's **Settings** page after setup

---

## Installation

### Clone the repository

```bash
git clone https://github.com/Techlead-ANKAN/CareerForge-AI.git
cd CareerForge-AI
```

### Install Node.js dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Configure your API key

1. Open [http://localhost:3000/settings](http://localhost:3000/settings)
2. Enter your **Google Gemini API key**
3. Click Save — the key is stored in your browser's localStorage

---

## Production Build

```bash
npm run build
npm start
```

This creates an optimized production build and starts the server on port 3000.

---

## Key LaTeX Packages Used

The resume templates rely on these LaTeX packages (installed via `texlive-latex-extra`, `texlive-fonts-extra`, and `texlive-pictures`):

| Package | Purpose |
|---------|---------|
| `fontawesome5` | Contact icons (email, phone, GitHub, LinkedIn) |
| `tikz` / `pgf` | Circular photo clipping, sidebar backgrounds, decorative elements |
| `xcolor` | Custom colors for accents and sections |
| `enumitem` | Compact bullet point lists |
| `hyperref` | Clickable links |
| `geometry` | Page margins |
| `titlesec` | Custom section header formatting |
| `parskip` | Paragraph spacing |
| `charter` | Serif font (Executive Premium template) |
| `graphicx` | Profile photo inclusion |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Home / dashboard
│   ├── layout.tsx                  # Global layout with sidebar
│   ├── globals.css                 # Global styles (dark theme)
│   ├── resume-builder/page.tsx     # Resume builder (6 templates, photo, JD upload)
│   ├── ai-enhance/page.tsx         # AI enhancement (4 levels)
│   ├── ats-checker/page.tsx        # ATS scoring
│   ├── cv-generator/page.tsx       # Cover letter, CV & email generator
│   ├── interview-prep/page.tsx     # Live interview prep (voice)
│   ├── settings/page.tsx           # API key configuration
│   └── api/
│       └── latex-to-pdf/route.ts   # LaTeX → PDF server API
├── components/
│   └── Sidebar.tsx                 # Navigation sidebar
├── lib/
│   ├── gemini.ts                   # Gemini API client & utilities
│   └── templates.ts                # 6 LaTeX resume template definitions
└── types/
    └── speech.d.ts                 # Web Speech API TypeScript types
```

---

## Troubleshooting

### "LaTeX compilation failed" on PDF download

- **Missing packages:** Run the full TeX Live install command above. The most common missing package is `fontawesome5` (in `texlive-fonts-extra`).
- **`pdflatex` not found:** Ensure TeX Live is installed and `pdflatex` is in your PATH. Run `which pdflatex` to verify.
- **TikZ/PGF errors (`\pgfutil@next`):** The app has a built-in auto-fix that retries compilation up to 2 times. If it still fails, try regenerating the resume or switching to the **Minimal Clean** or **Classic Elegant** template (no TikZ).

### "Please configure your Gemini API key"

Go to [http://localhost:3000/settings](http://localhost:3000/settings) and enter your API key. It's saved in `localStorage`.

### Port 3000 already in use

```bash
# Find and kill the process using port 3000
lsof -ti:3000 | xargs kill -9
# Then restart
npm run dev
```

### PDF upload for Job Description shows garbled text

The app uses `pdfjs-dist` for client-side PDF text extraction. If extraction fails, try copying the JD text manually into the text field.

---

## License

MIT

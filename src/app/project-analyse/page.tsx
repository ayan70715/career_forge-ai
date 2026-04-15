"use client";


import { useRef, useState } from "react";
import {
  FolderSearch,
  Loader2,
  Upload,
  X,
  ExternalLink,
  Star,
  GitFork,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trophy,
  Download,
} from "lucide-react";
import { getApiKey, generateWithRetry } from "@/lib/ai/gemini";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  extractTextFromSupportedResumeFile,
  getSupportedResumeFileType,
  MAX_RESUME_FILE_SIZE_BYTES,
  type SupportedResumeFileType,
} from "@/lib/resume/textExtraction";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";


const FILE_SIZE_LIMIT_MB = Math.round(MAX_RESUME_FILE_SIZE_BYTES / (1024 * 1024));

interface SimilarProject {
  name: string;
  url: string;
  description: string;
  stars: string;
  forks: string;
  techStack: string[];
}

interface ResumeProject {
  name: string;
  description: string;
  techStack: string[];
}

interface ComparisonResult {
  resumeProjects: ResumeProject[];
  similarProjects: SimilarProject[];
  comparisons: {
    resumeProjectName: string;
    matchedSimilarProject: string;
    uniquenessScore: number;
    scopeComparison: string;
    featureOverlap: string[];
    differentiators: string[];
    suggestions: string[];
    verdict: "strong" | "competitive" | "needs-work";
  }[];
  overallSummary: string;
}

function sourceLabel(type: SupportedResumeFileType | "paste"): string {
  if (type === "pdf") return "PDF";
  if (type === "docx") return "DOCX";
  if (type === "text") return "Text File";
  return "Pasted Text";
}

function getVerdictConfig(verdict: "strong" | "competitive" | "needs-work") {
  switch (verdict) {
    case "strong":
      return {
        label: "Strong & Unique",
        icon: <Trophy className="w-4 h-4 text-success" />,
        color: "text-success",
        bg: "bg-success/10 border-success/25",
      };
    case "competitive":
      return {
        label: "Competitive",
        icon: <CheckCircle2 className="w-4 h-4 text-warning" />,
        color: "text-warning",
        bg: "bg-warning/10 border-warning/25",
      };
    case "needs-work":
      return {
        label: "Needs Differentiation",
        icon: <AlertTriangle className="w-4 h-4 text-danger" />,
        color: "text-danger",
        bg: "bg-danger/10 border-danger/25",
      };
  }
}

/** Extract owner/repo from a GitHub URL */
function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  try {
    const { hostname, pathname } = new URL(url);
    if (!hostname.includes("github.com")) return null;
    const parts = pathname.replace(/^\//, "").split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * Validate a single project URL:
 * - GitHub URLs: hit the GitHub REST API to confirm existence and fetch real star/fork counts
 * - Non-GitHub URLs: do a HEAD request to confirm reachability, keep Gemini's stats as-is
 * Returns the validated project or null if the URL is dead/fake.
 */
async function validateProject(project: SimilarProject): Promise<SimilarProject | null> {
  const { url } = project;
  if (!url || !url.startsWith("http")) return null;

  const ghRepo = parseGitHubRepo(url);

  if (ghRepo) {
    // GitHub URL — validate via API and pull real stats
    try {
      const res = await fetch(
        `https://api.github.com/repos/${ghRepo.owner}/${ghRepo.repo}`,
        { headers: { Accept: "application/vnd.github+json" } }
      );
      if (!res.ok) return null; // 404 or other — drop hallucinated repo

      const data = await res.json() as {
        stargazers_count?: number;
        forks_count?: number;
      };

      return {
        ...project,
        // Replace Gemini's counts with real GitHub API values
        stars: typeof data.stargazers_count === "number"
          ? formatCount(data.stargazers_count)
          : project.stars,
        forks: typeof data.forks_count === "number"
          ? formatCount(data.forks_count)
          : project.forks,
      };
    } catch {
      return null;
    }
  } else {
    // Non-GitHub URL — just verify it's reachable
    try {
      // mode: "no-cors" gives an opaque response (status 0) if reachable,
      // and throws if the network request fails entirely
      await fetch(url, { method: "HEAD", mode: "no-cors" });
      return project; // Keep Gemini's stars/forks for non-GitHub sites
    } catch {
      return null; // Unreachable — drop it
    }
  }
}

/** Validate all projects concurrently, dropping any that fail */
async function validateAllProjects(projects: SimilarProject[]): Promise<SimilarProject[]> {
  const results = await Promise.all(projects.map(validateProject));
  return results.filter((p): p is SimilarProject => p !== null);
}

export default function ProjectAnalyzerPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // const reportRef = useRef<HTMLDivElement>(null);
  
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeSourceType, setResumeSourceType] = useState<SupportedResumeFileType | "paste">("paste");
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loadingStep, setLoadingStep] = useState("");

  const clearUpload = () => {
    setResumeFileName(null);
    setResumeSourceType("paste");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setExtracting(true);

    if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
      setError(`File too large. Max ${FILE_SIZE_LIMIT_MB}MB.`);
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const supportedType = getSupportedResumeFileType(file);
    if (!supportedType) {
      setError("Unsupported file type. Please upload PDF, DOCX, or text files.");
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const extracted = await extractTextFromSupportedResumeFile(file);
      if (!extracted.text.trim()) {
        setError("Could not extract text. Try pasting manually.");
        setResumeFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setResumeFileName(file.name);
      setResumeSourceType(extracted.type);
      setResumeText(extracted.text);
    } catch {
      setError("Failed to read file. Try another file or paste manually.");
      setResumeFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setExtracting(false);
    }
  };

  const analyze = async () => {
    const key = getApiKey();
    if (!key) {
      setError("Please configure your Gemini API key in Settings first.");
      return;
    }
    if (!resumeText.trim()) {
      setError("Please upload your resume or paste resume text.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      // Step 1: Extract projects from resume (no grounding needed)
      setLoadingStep("Extracting projects from your resume...");
      const extractPrompt = `Extract all projects from this resume. For each project return its name, a brief description, and the tech stack used.

RESUME:
${resumeText}

Respond ONLY in this JSON format (no markdown, no code blocks):
{
  "projects": [
    {
      "name": "Project Name",
      "description": "Brief description of what it does",
      "techStack": ["tech1", "tech2"]
    }
  ]
}`;

      let extractText = (await generateWithRetry(extractPrompt)).trim();
      extractText = extractText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      const extractedData = JSON.parse(extractText) as { projects: ResumeProject[] };
      const resumeProjects = extractedData.projects || [];

      if (resumeProjects.length === 0) {
        setError("No projects found in your resume. Make sure your resume includes a Projects section.");
        setLoading(false);
        return;
      }

      // Step 2: Use Google Search grounding to find real similar projects
      setLoadingStep(`Found ${resumeProjects.length} project(s). Searching the web for real similar projects...`);

      const projectListText = resumeProjects
        .map((p, i) => `${i + 1}. ${p.name}: ${p.description} (Tech: ${p.techStack.join(", ")})`)
        .join("\n");

      const searchPrompt = `Search the web and GitHub right now to find real, existing, verifiable similar projects for each of the following resume projects.

Resume projects:
${projectListText}

STRICT RULES — you MUST follow all of these:
- Only include projects with a REAL, WORKING URL you found via search (GitHub repo, official site, npm, PyPI, etc.)
- NEVER fabricate, guess, or construct a URL — only use URLs you actually found in live search results
- NEVER include entries with placeholder names like "(example)", "(generic)", "(commercial)", "(sample)", or any vague category names
- If you cannot find a real verifiable match for a resume project, set "matchedSimilarProject" to null for that comparison — do NOT invent a fake one
- For GitHub URLs: use the exact full URL (e.g. https://github.com/owner/repo)
- For non-GitHub projects: use the real verified homepage URL (official site, npm, PyPI, etc.)
- Star/fork counts: provide your best estimate from search results for GitHub repos; for non-GitHub set to "N/A"

Respond ONLY in this JSON format (no markdown, no code blocks):
{
  "similarProjects": [
    {
      "name": "Exact repo or project name",
      "url": "https://real-verified-url.com",
      "description": "What it does",
      "stars": "e.g. 6.4k or N/A",
      "forks": "e.g. 1k or N/A",
      "techStack": ["tech1", "tech2"]
    }
  ],
  "comparisons": [
    {
      "resumeProjectName": "Name from resume",
      "matchedSimilarProject": "Name of best real match found, or null if none",
      "uniquenessScore": <0-100>,
      "scopeComparison": "One sentence comparing the scope of both projects",
      "featureOverlap": ["shared feature 1", "shared feature 2"],
      "differentiators": ["what makes the resume project unique"],
      "suggestions": ["actionable suggestion to strengthen the project on a resume"],
      "verdict": "strong | competitive | needs-work"
    }
  ],
  "overallSummary": "2-3 sentence overall assessment of the candidate's projects vs real-world standards"
}

Uniqueness score guide:
- 80-100: Highly unique with strong differentiators
- 50-79: Competitive but similar to existing tools
- 0-49: Very common, needs more differentiation`;

      setLoadingStep("Comparing with real-world projects from the web...");

      let compareText = (
        await generateWithRetry(searchPrompt, {
          tools: [{ googleSearch: {} }],
        })
      ).trim();

      compareText = compareText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      const compareData = JSON.parse(compareText) as Omit<ComparisonResult, "resumeProjects">;

      // Step 3: Validate all URLs — drop hallucinated/dead ones, replace GitHub stats with real API data
      setLoadingStep("Validating URLs and fetching real GitHub stats...");
      const validatedProjects = await validateAllProjects(compareData.similarProjects || []);

      // Build set of validated project names for cross-referencing comparisons
      const validNames = new Set(validatedProjects.map((p) => p.name));

      // Update comparisons: if matched project didn't survive validation, mark it clearly
      const validatedComparisons = (compareData.comparisons || []).map((comp) => {
        if (!comp.matchedSimilarProject || !validNames.has(comp.matchedSimilarProject)) {
          return { ...comp, matchedSimilarProject: "No verified match found" };
        }
        return comp;
      });

      setResult({
        resumeProjects,
        similarProjects: validatedProjects,
        comparisons: validatedComparisons,
        overallSummary: compareData.overallSummary || "",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Analysis failed. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const resumeReady = resumeText.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="relative max-w-380 mx-auto pb-3"
    >
      <PageHeader
        icon={FolderSearch}
        title="Project Analyzer"
        subtitle="Find top similar real-world projects from the web and compare them against your resume projects"
        gradient="from-fuchsia-500 to-indigo-500"
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Left: Input */}
        <section className="space-y-5">
          <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_18px_40px_var(--shadow-heavy)]">
            <CardContent className="p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold">Resume Input</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload or paste your resume. Projects are extracted, similar ones searched live on the web, every URL validated, and GitHub stats fetched from the real API.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={extracting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-60"
                >
                  {extracting ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting...</>
                  ) : (
                    <><Upload className="h-3.5 w-3.5" /> Upload Resume PDF or DOCX</>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.text,.md"
                  onChange={handleFileUpload}
                  className="hidden"
                  title="Upload resume"
                />
                {resumeFileName && (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success">
                    {resumeFileName}
                    <button onClick={clearUpload} className="text-danger/70 hover:text-danger">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">PDF, DOCX, TXT up to {FILE_SIZE_LIMIT_MB}MB</span>
              </div>

              <textarea
                className="w-full min-h-[280px] resize-none rounded-xl border border-glass-border bg-surface-1/80 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="Paste your full resume text here, or upload a file above..."
                value={resumeText}
                onChange={(e) => {
                  setResumeText(e.target.value);
                  setResumeSourceType("paste");
                  setResumeFileName(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {resumeReady
                    ? `${resumeText.split(/\s+/).filter(Boolean).length} words · ${sourceLabel(resumeSourceType)}`
                    : "No resume loaded"}
                </span>
                <Badge variant={resumeReady ? "success" : "warning"} className="text-[10px]">
                  {resumeReady ? "Ready" : "Pending"}
                </Badge>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
                🔍 <span className="text-primary font-medium">Google Search grounding</span> finds real projects →
                GitHub URLs are verified via the GitHub API with real star/fork counts →
                Non-GitHub URLs verified for reachability →
                Hallucinated or dead links are automatically dropped.
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-4 z-20">
            <Card className="border-glass-border/80 bg-sticky-bg backdrop-blur-xl shadow-[0_14px_34px_var(--shadow-heavy)]">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-linear-to-br from-fuchsia-500 to-indigo-500 flex items-center justify-center">
                        <FolderSearch className="h-3.5 w-3.5 text-white" />
                      </div>
                      Analyze My Projects
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 ml-10">
                      {loading ? loadingStep : "Searches live web · Validates URLs · Fetches real GitHub stats"}
                    </p>
                  </div>
                  <Button
                    onClick={analyze}
                    disabled={loading || extracting || !resumeReady}
                    variant="glow"
                    className="gap-2 px-6 py-5 text-sm bg-linear-to-r from-fuchsia-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 w-full sm:w-auto"
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</>
                    ) : (
                      <><FolderSearch className="h-4 w-4" /> Run Analysis</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Right: Results */}
        <aside className="space-y-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1 scrollbar-thin">
          {loading ? (
            <Card className="border-glass-border/80 bg-surface-1/95 min-h-60 flex items-center justify-center">
              <CardContent className="p-6 text-center space-y-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                <p className="text-sm font-medium">{loadingStep}</p>
                <p className="text-xs text-muted-foreground">This may take 20–40 seconds</p>
              </CardContent>
            </Card>
          ) : result ? (
            <div className="space-y-4">

              <Card className="border-glass-border/80 bg-surface-1/95 shadow-[0_20px_45px_var(--shadow-heavy)]">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <FolderSearch className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Overall Assessment</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{result.overallSummary}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge variant="outline" className="text-[10px]">{result.resumeProjects.length} Resume Projects</Badge>
                    <Badge variant="outline" className="text-[10px]">{result.similarProjects.length} Verified Projects Found</Badge>
                    <Badge variant="outline" className="text-[10px]">{result.comparisons.length} Comparisons</Badge>
                    <Badge variant="success" className="text-[10px]">✓ URLs Validated</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-glass-border/80 bg-surface-1/95">
                <CardContent className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold">Verified Similar Projects</h3>
                  <div className="space-y-2">
                    {result.similarProjects.map((proj, i) => (
                      <div key={i} className="rounded-xl border border-glass-border bg-surface-2/70 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">#{i + 1}</Badge>
                            <span className="text-xs font-semibold truncate">{proj.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {proj.stars && proj.stars !== "N/A" && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Star className="h-3 w-3" />{proj.stars}
                              </span>
                            )}
                            {proj.forks && proj.forks !== "N/A" && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <GitFork className="h-3 w-3" />{proj.forks}
                              </span>
                            )}
                            {proj.url && (
                              <a href={proj.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{proj.description}</p>
                        <div className="flex flex-wrap gap-1">
                          {proj.techStack.map((tech) => (
                            <Badge key={tech} variant="outline" className="text-[10px] px-1.5">{tech}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {result.comparisons.map((comp, i) => {
                const verdictConfig = getVerdictConfig(comp.verdict);
                return (
                  <Card key={i} className="border-glass-border/80 bg-surface-1/95">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold">{comp.resumeProjectName}</h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5">vs. {comp.matchedSimilarProject}</p>
                        </div>
                        <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${verdictConfig.bg} ${verdictConfig.color}`}>
                          {verdictConfig.icon}
                          {verdictConfig.label}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">Uniqueness Score</span>
                          <span className={`text-xs font-bold ${comp.uniquenessScore >= 80 ? "text-success" : comp.uniquenessScore >= 50 ? "text-warning" : "text-danger"}`}>
                            {comp.uniquenessScore}/100
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-4 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${comp.uniquenessScore >= 80 ? "bg-success" : comp.uniquenessScore >= 50 ? "bg-warning" : "bg-danger"}`}
                            style={{ width: `${comp.uniquenessScore}%` }}
                          />
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground italic">{comp.scopeComparison}</p>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-warning/20 bg-warning/10 p-3">
                          <div className="text-[10px] font-semibold text-warning mb-1.5 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Feature Overlap
                          </div>
                          {comp.featureOverlap.length > 0 ? (
                            <ul className="space-y-1">
                              {comp.featureOverlap.map((f, j) => (
                                <li key={j} className="text-[11px] text-muted-foreground">• {f}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">None detected</p>
                          )}
                        </div>

                        <div className="rounded-xl border border-success/20 bg-success/10 p-3">
                          <div className="text-[10px] font-semibold text-success mb-1.5 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Your Edge
                          </div>
                          {comp.differentiators.length > 0 ? (
                            <ul className="space-y-1">
                              {comp.differentiators.map((d, j) => (
                                <li key={j} className="text-[11px] text-muted-foreground">• {d}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">Not identified</p>
                          )}
                        </div>

                        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
                          <div className="text-[10px] font-semibold text-primary mb-1.5 flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Suggestions
                          </div>
                          {comp.suggestions.length > 0 ? (
                            <ul className="space-y-1">
                              {comp.suggestions.map((s, j) => (
                                <li key={j} className="text-[11px] text-muted-foreground">{j + 1}. {s}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">No suggestions</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-glass-border/80 bg-surface-1/95 min-h-90 flex items-center justify-center">
              <CardContent className="p-6 text-center">
                <div className="mx-auto h-14 w-14 rounded-2xl border border-glass-border bg-surface-2 flex items-center justify-center mb-4">
                  <FolderSearch className="h-7 w-7 opacity-30" />
                </div>
                <h3 className="text-lg font-semibold">Results will appear here</h3>
                <p className="text-xs text-muted-foreground mt-2 max-w-60 mx-auto leading-relaxed">
                  Upload your resume and run analysis to see how your projects compare to verified real-world projects.
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </motion.div>
  );
}

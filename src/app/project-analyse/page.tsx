"use client";

import { useRef, useState } from "react";
import {
  GitCompare,
  Loader2,
  Upload,
  ExternalLink,
  Star,
  GitFork,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  Search,
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
    matchedSimilarProject: string | null;
    uniquenessScore: number;
    scopeComparison: string;
    featureOverlap: string[];
    differentiators: string[];
    suggestions: string[];
    verdict: "strong" | "competitive" | "needs-work";
    fallbackSearchUrl?: string;
  }[];
  overallSummary: string;
}

/**
 * Validates if a GitHub project exists via the Public API
 */
async function validateProject(project: SimilarProject): Promise<SimilarProject | null> {
  if (!project.url || !project.url.includes("github.com")) return project;

  try {
    const urlParts = project.url.split("github.com/")[1]?.split("/");
    if (!urlParts || urlParts.length < 2) return null;
    
    const owner = urlParts[0];
    const repo = urlParts[1].replace(".git", "");

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
    if (!res.ok) return null; // Project doesn't exist or is private

    const data = await res.json();
    return {
      ...project,
      stars: data.stargazers_count?.toLocaleString() || project.stars,
      forks: data.forks_count?.toLocaleString() || project.forks,
    };
  } catch {
    return null;
  }
}

export default function ProjectAnalyzerPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
      setError(`File too large. Max ${FILE_SIZE_LIMIT_MB}MB.`);
      return;
    }

    try {
      setLoading(true);
      setLoadingStep("Extracting text...");
      const extracted = await extractTextFromSupportedResumeFile(file);
      setResumeText(extracted.text);
      setResumeFileName(file.name);
      setError("");
    } catch {
      setError("Failed to read file.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const analyze = async () => {
    const key = getApiKey();
    if (!key) {
      setError("Please set your API key in Settings.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      setLoadingStep("Identifying projects...");
      const extractPrompt = `Extract technical projects from this resume. Return ONLY JSON: { "projects": [{ "name": "string", "description": "string", "techStack": [] }] }\n\nResume: ${resumeText}`;
      const extractRes = await generateWithRetry(extractPrompt);
      const cleanExtract = extractRes.replace(/```json|```/gi, "").trim();
      const { projects } = JSON.parse(cleanExtract);

      setLoadingStep("Searching GitHub for matches...");
      const comparePrompt = `Find real, popular GitHub projects similar to these: ${JSON.stringify(projects)}. 
      Return ONLY JSON: { "similarProjects": [{ "name": "string", "url": "string", "stars": "string", "forks": "string" }], 
      "comparisons": [{ "resumeProjectName": "string", "matchedSimilarProject": "string", "uniquenessScore": 0, "scopeComparison": "string", "suggestions": [], "verdict": "strong|competitive|needs-work" }],
      "overallSummary": "string" }`;

      const compareRes = await generateWithRetry(comparePrompt, { tools: [{ googleSearch: {} }] });
      const cleanCompare = compareRes.replace(/```json|```/gi, "").trim();
      const rawResult = JSON.parse(cleanCompare);

      setLoadingStep("Validating links...");
      const validatedSimilar = (await Promise.all(
        (rawResult.similarProjects || []).map(validateProject)
      )).filter((p): p is SimilarProject => p !== null);

      const validNames = new Set(validatedSimilar.map(p => p.name));

      const finalComparisons = rawResult.comparisons.map((comp: any) => {
        const isLive = validNames.has(comp.matchedSimilarProject);
        return {
          ...comp,
          matchedSimilarProject: isLive ? comp.matchedSimilarProject : "No direct match verified",
          fallbackSearchUrl: isLive ? undefined : `https://github.com/search?q=${encodeURIComponent(comp.matchedSimilarProject || comp.resumeProjectName)}`
        };
      });

      setResult({
        resumeProjects: projects,
        similarProjects: validatedSimilar,
        comparisons: finalComparisons,
        overallSummary: rawResult.overallSummary
      });

    } catch (err: any) {
      setError("Analysis failed. Please ensure your resume text is clear.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto p-6">
      <PageHeader icon={GitCompare} title="Project Analyzer" subtitle="Benchmarking your projects against the industry." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        <Card className="bg-surface-1/50">
          <CardContent className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-sm">Resume Content</h3>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-3 h-3 mr-2" /> {resumeFileName || "Upload"}
              </Button>
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept=".pdf,.docx,.txt" />
            </div>
            <textarea
              className="w-full h-96 bg-surface-2 border-none rounded-xl p-4 text-xs focus:ring-1 focus:ring-primary outline-none"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste resume text or upload file..."
            />
            <Button className="w-full" onClick={analyze} disabled={loading || !resumeText}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> {loadingStep}</> : "Analyze Portfolio"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {result ? (
            result.comparisons.map((comp, idx) => (
              <Card key={idx} className="border-glass-border">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-bold">{comp.resumeProjectName}</h4>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        vs {comp.matchedSimilarProject}
                        {comp.fallbackSearchUrl && (
                          <a href={comp.fallbackSearchUrl} target="_blank" className="text-primary flex items-center">
                            <Search className="w-2 h-2 ml-1" /> search
                          </a>
                        )}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{comp.verdict}</Badge>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-surface-2 h-1 w-full rounded-full overflow-hidden">
                      <div className="bg-primary h-full" style={{ width: `${comp.uniquenessScore}%` }} />
                    </div>
                    <p className="text-xs italic text-muted-foreground">{comp.scopeComparison}</p>
                    <div className="grid grid-cols-1 gap-2">
                      {comp.suggestions.slice(0, 2).map((s, i) => (
                        <div key={i} className="text-[11px] flex gap-2 text-muted-foreground">
                          <Star className="w-3 h-3 text-yellow-500" /> {s}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="h-full border-2 border-dashed border-glass-border rounded-3xl flex items-center justify-center opacity-30 italic text-sm">
              Analysis results will appear here
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
  }

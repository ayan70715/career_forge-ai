import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────
// Adzuna India API — server-only (secret keys)
// Add to .env.local:
//   ADZUNA_APP_ID=your_app_id
//   ADZUNA_APP_KEY=your_app_key
// Get free keys at: https://developer.adzuna.com/
// ─────────────────────────────────────────────────────

const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID!;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY!;

const CITY_SLUGS: Record<string, string> = {
  Bangalore: "bangalore",
  Mumbai: "mumbai",
  Delhi: "delhi",
  Hyderabad: "hyderabad",
  Chennai: "chennai",
  Pune: "pune",
  Kolkata: "kolkata",
  Ahmedabad: "ahmedabad",
  Noida: "noida",
  Gurgaon: "gurgaon",
};

interface AdzunaJob {
  title: string;
  description: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  location?: { display_name: string };
}

async function fetchAdzunaData(role: string, city: string) {
  const citySlug = CITY_SLUGS[city] || city.toLowerCase();
  const query = encodeURIComponent(role);

  const url =
    `https://api.adzuna.com/v1/api/jobs/in/search/1` +
    `?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}` +
    `&results_per_page=20&what=${query}&where=${citySlug}` +
    `&salary_include_unknown=1&content-type=application/json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Adzuna API error: ${res.status}`);
  return await res.json();
}

function extractSalaryStats(jobs: AdzunaJob[]) {
  const salaries = jobs
    .filter((j) => j.salary_min && j.salary_max)
    .map((j) => ({
      min: Math.round((j.salary_min! / 100000) * 10) / 10, // convert to LPA
      max: Math.round((j.salary_max! / 100000) * 10) / 10,
    }));

  if (salaries.length === 0) return { min: 6, max: 24, count: 0 };

  const mins = salaries.map((s) => s.min).sort((a, b) => a - b);
  const maxes = salaries.map((s) => s.max).sort((a, b) => a - b);

  const p10 = mins[Math.floor(mins.length * 0.1)] || mins[0];
  const p90 = maxes[Math.floor(maxes.length * 0.9)] || maxes[maxes.length - 1];

  return {
    min: Math.max(3, Math.round(p10)),
    max: Math.min(80, Math.round(p90)),
    count: salaries.length,
  };
}

function extractTrendingSkills(jobs: AdzunaJob[]): string[] {
  const techKeywords = [
    "React", "Next.js", "TypeScript", "JavaScript", "Python", "Node.js",
    "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Kafka", "Redis",
    "PostgreSQL", "MongoDB", "GraphQL", "REST", "Microservices",
    "System Design", "Data Structures", "Algorithms", "CI/CD", "Git",
    "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch",
    "Spark", "Hadoop", "SQL", "NoSQL", "Java", "Go", "Rust", "C++",
    "Spring Boot", "Django", "FastAPI", "Flutter", "Swift", "Kotlin",
    "Terraform", "Ansible", "Jenkins", "Prometheus", "Grafana",
    "Agile", "Scrum", "Product Management", "Figma", "Sketch",
  ];

  const allText = jobs.map((j) => `${j.title} ${j.description}`).join(" ").toLowerCase();

  return techKeywords
    .filter((kw) => allText.includes(kw.toLowerCase()))
    .slice(0, 20);
}

// ─────────────────────────────────────────────────────
// POST /api/job-analyser/adzuna
// Returns: { salaryMin, salaryMax, totalJobs, trendingSkills }
// Gemini analysis runs client-side using the user's API key
// ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { role, city } = await req.json();

    const targetRole = role?.trim() || "Software Engineer";
    const targetCity = city?.trim() || "Bangalore";

    let salaryStats = { min: 6, max: 24, count: 0 };
    let trendingSkills: string[] = [];
    let totalJobs = 0;

    try {
      const adzunaData = await fetchAdzunaData(targetRole, targetCity);
      const jobs: AdzunaJob[] = adzunaData.results || [];
      totalJobs = adzunaData.count || jobs.length;
      salaryStats = extractSalaryStats(jobs);
      trendingSkills = extractTrendingSkills(jobs);
    } catch (adzunaErr: any) {
      // Graceful degradation — return fallback salary ranges
      console.warn("Adzuna fetch failed:", adzunaErr.message);
      const fallbackSalaries: Record<string, { min: number; max: number }> = {
        "Frontend Developer":        { min: 6,  max: 22 },
        "Backend Developer":         { min: 7,  max: 25 },
        "Full Stack Developer":      { min: 8,  max: 28 },
        "Data Scientist":            { min: 8,  max: 30 },
        "Machine Learning Engineer": { min: 10, max: 35 },
        "DevOps Engineer":           { min: 8,  max: 28 },
        "Product Manager":           { min: 12, max: 40 },
      };
      const fb = fallbackSalaries[targetRole] || { min: 6, max: 24 };
      salaryStats = { ...fb, count: 0 };
    }

    return NextResponse.json({
      salaryMin: salaryStats.min,
      salaryMax: salaryStats.max,
      totalJobs,
      trendingSkills,
    });

  } catch (err: any) {
    console.error("Adzuna route error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch market data" },
      { status: 500 }
    );
  }
}

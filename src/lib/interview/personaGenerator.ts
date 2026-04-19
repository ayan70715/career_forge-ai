import { generateWithRetry } from "@/lib/ai/gemini";

export interface InterviewerPersona {
  id: string;
  name: string;
  role: string;
  style: string;
}

// Fallback static personas used while Gemini generates dynamic ones
// or if the API call fails
export function getDefaultPersonas(count: number = 2): InterviewerPersona[] {
  const all: InterviewerPersona[] = [
    {
      id: "1",
      name: "Arya",
      role: "Senior Software Engineer",
      style: "strict, technical, asks deep follow-ups on implementation details",
    },
    {
      id: "2",
      name: "Alok",
      role: "HR Manager",
      style: "friendly, behavioral, focuses on communication and culture fit",
    },
    {
      id: "3",
      name: "John",
      role: "Engineering Manager",
      style: "strategic, focuses on problem-solving approach and team collaboration",
    },
  ];
  return all.slice(0, count);
}

/**
 * Generate role-aware interviewer personas using Gemini based on the
 * target job role and interview type. Falls back to static personas on error.
 */
export async function generatePersonas(
  targetRole: string,
  interviewType: string,
  count: number
): Promise<InterviewerPersona[]> {
  const prompt = `You are setting up a realistic mock interview panel for a candidate applying for: "${targetRole || "Software Engineer"}".
Interview type: ${interviewType}
Number of interviewers: ${count}

Generate ${count} distinct interviewer personas for this panel. Each persona must:
- Have a realistic male name only (no female name)
- Have a job title that makes sense for interviewing a "${targetRole || "Software Engineer"}" candidate
- Have a unique interviewing style that matches their role (e.g. a tech lead asks technical depth questions, an HR manager asks behavioral questions, a product manager asks about problem-solving and product thinking)
- Be diverse in their approach so the interview feels multi-dimensional

Examples of appropriate roles based on interview type:
- technical: Senior Engineer, Staff Engineer, Tech Lead, Engineering Manager
- hr: HR Manager, Talent Acquisition Specialist, People Partner
- behavioral: Engineering Manager, Team Lead, Senior Engineer
- system: Principal Engineer, Solutions Architect, CTO
- mixed: combine technical + HR + managerial roles

Respond ONLY in this JSON format (no markdown, no code blocks):
{
  "personas": [
    {
      "id": "1",
      "name": "First name only",
      "role": "Specific job title relevant to interviewing for ${targetRole || "this role"}",
      "style": "Brief description of their interviewing style and what they focus on"
    }
  ]
}`;

  try {
    let text = (await generateWithRetry(prompt)).trim();
    text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const data = JSON.parse(text) as { personas: InterviewerPersona[] };
    if (Array.isArray(data.personas) && data.personas.length >= count) {
      return data.personas.slice(0, count);
    }
    return getDefaultPersonas(count);
  } catch {
    return getDefaultPersonas(count);
  }
}

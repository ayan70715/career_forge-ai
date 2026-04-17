import { generateWithGemini } from "@/lib/ai/gemini";
import { InterviewerPersona } from "./personaGenerator";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function generateInterviewResponse(
  messages: Message[],
  persona: InterviewerPersona
) {
  const systemPrompt = `
You are ${persona.name}, a ${persona.role}.

Your personality:
${persona.style}

Rules:
- Ask realistic interview questions
- Follow up based on candidate's previous answers
- Stay consistent with your personality
- Keep responses short (1–3 sentences)
- Do NOT give feedback or evaluation
`;

  const formatted = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const res = await generateWithGemini(formatted);

  return res;
}

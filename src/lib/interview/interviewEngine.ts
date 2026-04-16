import { generateWithGemini } from "@/lib/ai/gemini";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function generateInterviewResponse(
  messages: Message[],
  interviewerName: string
) {
  const systemPrompt = `
You are ${interviewerName}, a professional job interviewer.

Rules:
- Ask concise, realistic interview questions
- Be conversational, not robotic
- Ask follow-ups based on user's answers
- Do NOT give feedback or explanations
- Keep responses under 2-3 sentences
`;

  const formatted = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const res = await generateWithGemini(formatted);

  return res;
}

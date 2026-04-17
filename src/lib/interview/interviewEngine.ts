import { generateWithRetry } from "@/lib/ai/gemini";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export async function generateInterviewResponse(
  messages: Message[],
  persona: any
) {
  // 🎯 SYSTEM PROMPT (strict control)
  const systemPrompt = `
You are a strict but helpful technical interviewer.

Rules:
- Always respond with either:
  1) A follow-up question OR
  2) A new interview question
- NEVER say "please continue"
- NEVER give vague responses
- If answer is short → ask deeper question
- If answer is complete → move to next topic
- If candidate asks something → answer briefly, then continue interview

Keep responses short (1-2 lines max).
`;

  // 🎭 Persona context
  const personaContext = `
Interviewer Name: ${persona?.name || "Interviewer"}
Focus Area: ${persona?.focus || "General"}
Company Style: ${persona?.company || "Tech"}
`;

  // 🧠 Convert messages → structured conversation
  const formattedConversation = messages
    .map((m) =>
      m.role === "user"
        ? `Candidate: ${m.content}`
        : `Interviewer: ${m.content}`
    ).join("\n");

  
  // 🧾 Final prompt
  const finalPrompt = `
${systemPrompt}

${personaContext}

Conversation so far:
${formattedConversation}

Interviewer:
`;

  try {
    const res = await generateWithRetry(finalPrompt);

    // ✅ minimal safe fallback ONLY if broken
    if (!res || res.trim().length < 5) {
      return "Can you tell me more about a project you've worked on?";
    }

    return res.trim();
  } catch (err: any) {
      console.error("AI error:", err);

      throw new Error(err?.message || "AI failed");
  }
}

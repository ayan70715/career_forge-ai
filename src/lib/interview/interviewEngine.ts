import { generateWithRetry } from "@/lib/ai/gemini";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export async function generateInterviewResponse(
  messages: Message[],
  persona: any
) {
  // 🎯 SYSTEM PROMPT (brain of interviewer)
  const systemPrompt = `
You are a professional interviewer.

Rules:
- Ask relevant interview questions
- React naturally to answers
- NEVER say "please continue"
- If answer is short → ask follow-up
- If answer is complete → ask next question
- If candidate asks something → answer briefly, then continue interview
- Keep responses short (1-2 lines max)

Style:
- Conversational
- Slightly challenging but polite
`;

  // 🎭 Persona context (optional but powerful)
  const personaContext = `
Interviewer Name: ${persona?.name || "Interviewer"}
Role Focus: ${persona?.focus || "General"}
Company Style: ${persona?.company || "Tech"}
`;

  // 🧠 Convert chat → prompt string (Gemini expects string)
  const formattedConversation = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const finalPrompt = `
${systemPrompt}

${personaContext}

Conversation:
${formattedConversation}

Interviewer:
`;

  try {
    const res = await generateWithRetry(finalPrompt);

    // 🛑 fallback safety (just in case)
    if (!res || res.toLowerCase().includes("please continue")) {
      return "Can you expand on that a bit?";
    }

    return res.trim();
  } catch (err) {
    console.error("AI error:", err);
    return "Let's move on. Can you tell me about a project you've worked on?";
  }
}

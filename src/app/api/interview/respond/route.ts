import { NextRequest, NextResponse } from "next/server";
import { generateInterviewResponse } from "@/lib/interview/interviewEngine";

export async function POST(req: NextRequest) {
  try {
    const { messages, persona } = await req.json();

    const response = await generateInterviewResponse(
      messages,
      persona
    );

    return NextResponse.json({ text: response });
  } catch (err: any) {
    console.error("API ERROR:", err);

    return NextResponse.json(
      {
        error:
          err?.message || "Something went wrong with AI",
      },
      { status: 500 }
    );
  }
}

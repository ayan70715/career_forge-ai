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
  } catch {
    return NextResponse.json(
      { error: "Failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { generateInterviewResponse } from "@/lib/interview/interviewEngine";

export async function POST(req: NextRequest) {
  try {
    const { messages, interviewer } = await req.json();

    const response = await generateInterviewResponse(
      messages,
      interviewer
    );

    return NextResponse.json({ text: response });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 }
    );
  }
}

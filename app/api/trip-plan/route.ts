import { streamObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { NextResponse } from "next/server";
import {
  buildTripPlannerPrompt,
  buildMockTripPlan,
  createTripPlanSchemaForMembers,
  parseMemberNames,
  TRIP_PLANNER_SYSTEM_PROMPT,
} from "@/app/trip-plan";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    let body: {
      prompt?: string;
      memberNamesInput?: string;
    };

    try {
      body = (await request.json()) as {
        prompt?: string;
        memberNamesInput?: string;
      };
    } catch {
      return NextResponse.json(
        { error: "Payload không hợp lệ. Vui lòng gửi JSON hợp lệ." },
        { status: 400 }
      );
    }

    const prompt = body.prompt?.trim() ?? "";
    const memberNamesInput = body.memberNamesInput?.trim() ?? "";
    const memberNames = parseMemberNames(memberNamesInput);

    if (!prompt) {
      return NextResponse.json({ error: "Vui lòng nhập kế hoạch chuyến đi." }, { status: 400 });
    }

    if (memberNames.length === 0) {
      return NextResponse.json(
        { error: "Vui lòng nhập tên thành viên, cách nhau bằng dấu phẩy." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(buildMockTripPlan(prompt, memberNames));
    }

    const runtimeSchema = createTripPlanSchemaForMembers(memberNames);

    const result = streamObject({
      model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
      schema: runtimeSchema,
      system: TRIP_PLANNER_SYSTEM_PROMPT,
      prompt: buildTripPlannerPrompt(prompt, memberNames)
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Streaming route failed", error);
    return NextResponse.json(
      { error: "Không thể tạo kế hoạch lúc này. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}

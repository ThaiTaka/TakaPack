import { streamObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildTripPlannerPrompt,
  buildMockTripPlan,
  type ContextOverride,
  createTripPlanSchemaForMembers,
  parseMemberNames,
  resolveContextKind,
  TRIP_PLANNER_SYSTEM_PROMPT,
} from "@/app/trip-plan";

export const maxDuration = 30;

const contextOverrideSchema = z
  .enum(["auto", "charity", "farewell", "home-party", "outdoor", "celebration", "workshop", "community", "generic"])
  .optional();

export async function POST(request: Request) {
  try {
    let body: {
      prompt?: string;
      memberNamesInput?: string;
      overrideContextKind?: string;
    };

    try {
      body = (await request.json()) as {
        prompt?: string;
        memberNamesInput?: string;
        overrideContextKind?: string;
      };
    } catch {
      return NextResponse.json(
        { error: "Payload không hợp lệ. Vui lòng gửi JSON hợp lệ." },
        { status: 400 }
      );
    }

    const prompt = body.prompt?.trim() ?? "";
    const memberNamesInput = body.memberNamesInput?.trim() ?? "";
    const overrideContextKindParsed = contextOverrideSchema.safeParse(body.overrideContextKind);
    if (!overrideContextKindParsed.success) {
      return NextResponse.json({ error: "overrideContextKind không hợp lệ." }, { status: 400 });
    }

    const overrideContextKind = overrideContextKindParsed.data as ContextOverride;
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
      return NextResponse.json(buildMockTripPlan(prompt, memberNames, overrideContextKind));
    }

    const resolvedContextKind = resolveContextKind(prompt, overrideContextKind);
    const runtimeSchema = createTripPlanSchemaForMembers(memberNames, resolvedContextKind);

    const result = streamObject({
      model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
      schema: runtimeSchema,
      system: TRIP_PLANNER_SYSTEM_PROMPT,
      prompt: buildTripPlannerPrompt(prompt, memberNames, overrideContextKind)
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

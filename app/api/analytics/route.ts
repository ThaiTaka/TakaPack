import { NextResponse } from "next/server";
import { z } from "zod";

const analyticsEventSchema = z.object({
  eventName: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().optional(),
  userAgent: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = analyticsEventSchema.parse(payload);

    console.info("[analytics]", {
      eventName: parsed.eventName,
      metadata: parsed.metadata,
      timestamp: parsed.timestamp,
      userAgent: parsed.userAgent
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

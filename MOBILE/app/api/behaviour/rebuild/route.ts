import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildBehaviourMap } from "@/lib/behaviour/buildBehaviourMap";
import { saveBehaviourMap } from "@/lib/behaviour/saveBehaviourMap";
import {
  enforceServiceKeyProtection,
  readBodyWithLimit,
  MAX_SERVICE_KEY_BODY_BYTES,
} from "@/lib/security/serviceKeyProtection";
import { safeErrorLog } from "@/lib/security/logGuard";

const bodySchema = z.object({ userId: z.string().min(1).max(64) }).strict();

function isAuthorized(req: NextRequest): boolean {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const header = req.headers.get("authorization") ?? "";
  return Boolean(serviceKey && header === `Bearer ${serviceKey}`);
}

export async function POST(req: NextRequest) {
  const protectionResponse = await enforceServiceKeyProtection(req, "behaviour");
  if (protectionResponse) return protectionResponse;

  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const rawBody = await readBodyWithLimit(req, MAX_SERVICE_KEY_BODY_BYTES);
    const parsed = bodySchema.safeParse(
      rawBody ? (JSON.parse(rawBody) as unknown) : {}
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const { userId } = parsed.data;

    const map = await buildBehaviourMap(userId);
    await saveBehaviourMap(userId, map);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    safeErrorLog("[api/behaviour/rebuild] error", error);
    return NextResponse.json({ error: "behaviour_map_failed" }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildSleepEnergyModel } from "@/lib/sleep/buildSleepEnergyModel";
import { saveSleepEnergyModel } from "@/lib/sleep/saveSleepEnergyModel";
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
  const protectionResponse = await enforceServiceKeyProtection(req, "sleep");
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

    const model = await buildSleepEnergyModel(userId);
    await saveSleepEnergyModel(userId, model);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    safeErrorLog("[api/sleep/rebuild] error", error);
    return NextResponse.json({ error: "sleep_model_failed" }, { status: 500 });
  }
}


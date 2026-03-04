import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const ADMIN_ACTOR_ID = process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";
const ALERT_RULES_LABEL = "alert_rules";

const alertRuleSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().max(128),
  condition: z.string().max(256),
  threshold: z.number().min(0).max(1_000_000),
  action: z.enum(["notify", "disable", "flag", "escalate"]),
  enabled: z.boolean(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  cooldownMinutes: z.number().int().min(0).max(10080).optional(),
});

const bodySchema = z.object({
  rules: z.array(alertRuleSchema).max(50),
});

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "alert-rules-save", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const payload = bodySchema.parse(await request.json());
    const supabase = getAdminClient();

    // Get current state
    const { data: currentConfig, error: selectError } = await supabase
      .from("admin_ai_config")
      .select("*")
      .eq("label", ALERT_RULES_LABEL)
      .eq("is_active", true)
      .maybeSingle();

    // Deactivate previous rules
    if (currentConfig) {
      await supabase
        .from("admin_ai_config")
        .update({ is_active: false })
        .eq("id", currentConfig.id);
    }

    // Insert new active rules
    const { error: insertError } = await supabase
      .from("admin_ai_config")
      .insert({
        label: ALERT_RULES_LABEL,
        config: { rules: payload.rules },
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      throw insertError;
    }

    // Log admin activity — store rule count + IDs only (not full payloads)
    const previousRules = currentConfig ? ((currentConfig.config as { rules?: { id?: string }[] })?.rules ?? []) : [];
    await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "alert_rules.save",
      previous: currentConfig ? { rule_count: previousRules.length, rule_ids: previousRules.map(r => r.id).filter(Boolean) } : null,
      next: { rule_count: payload.rules.length, rule_ids: payload.rules.map(r => r.id).filter(Boolean) },
    });

    return NextResponse.json({
      success: true,
      message: "Alert rules saved successfully",
    });
  } catch (error) {
    console.error("[api/admin/alert-rules/save] Error", error);
    let message = "Failed to save alert rules.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}


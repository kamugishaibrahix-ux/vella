"use server";

/**
 * Path B placeholder: server nudges are disabled until a local-only signal
 * pipeline is available. This stub keeps the API surface intact while ensuring
 * we no longer read/write personal content to Supabase tables.
 */

export type NudgeType =
  | "focus"
  | "energy_reset"
  | "motivation"
  | "stress_relief"
  | "discipline_support";

export type NudgeResult = {
  type: NudgeType;
  message: string;
};

export async function createAndStoreNudge(_userId: string): Promise<NudgeResult | null> {
  if (process.env.NODE_ENV !== "production") {
    console.info("[nudgeEngine] Nudges temporarily disabled under Path B privacy rules.");
  }
  return null;
}


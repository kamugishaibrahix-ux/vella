/**
 * Next.js instrumentation — runs once when the Node server starts, before handling requests.
 * Validates production environment and logs warnings for missing config.
 * MUST NEVER throw — any failure here would crash the entire application.
 */
import { assertProductionEnv } from "@/lib/server/env";

export async function register(): Promise<void> {
  try {
    if (process.env.NEXT_RUNTIME === "nodejs") {
      assertProductionEnv();
    }
  } catch (err) {
    console.error("[Instrumentation] Initialization failed:", err);
  }
}

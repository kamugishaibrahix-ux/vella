/**
 * Next.js instrumentation — runs once when the Node server starts, before handling requests.
 * Used to enforce production environment requirements (hard stop if required vars missing).
 */
import { assertProductionEnv } from "@/lib/server/env";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertProductionEnv();
  }
}

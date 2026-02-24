"use server";

import { serverLocalGet, serverLocalSet } from "@/lib/local/serverLocal";
import type { AuditEvent } from "./types";

/**
 * Persist only safe metadata. No transcript, text, content, or free-text.
 * Stored shape: { id, user_id, event_type, created_at, route?, outcome? }
 */
export async function logAuditEvent(event: AuditEvent) {
  try {
    const userId = event.userId ?? "system";
    const key = `audit_events:${userId}`;
    const existing = await serverLocalGet(key);
    const events = Array.isArray(existing) ? existing : [];

    const payload = {
      id: crypto.randomUUID(),
      user_id: userId,
      event_type: event.type,
      created_at: new Date().toISOString(),
      route: event.route ?? null,
      outcome: event.outcome ?? null,
    };

    events.push(payload);
    await serverLocalSet(key, events);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[AUDIT] persist failed:", msg);
  }
}

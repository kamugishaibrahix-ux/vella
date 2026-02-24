/**
 * Webhook idempotency: prevent double-processing of Stripe events.
 * Stores processed event IDs in Supabase to ensure exactly-once semantics.
 */
import { supabaseAdmin, fromSafe } from "@/lib/supabase/admin";
import { safeInsert } from "@/lib/safe/safeSupabaseWrite";

/**
 * Check if a webhook event has already been processed.
 * Returns true if the event was processed before.
 */
export async function isEventProcessed(eventId: string): Promise<boolean> {
  if (!supabaseAdmin) {
    console.error("[webhook-idempotency] supabaseAdmin not available, cannot check event");
    // Fail-open in this case: if we can't check, assume not processed
    // This is safer than blocking all webhooks if Supabase is temporarily down
    return false;
  }

  try {
    const { data } = await fromSafe("webhook_events")
      .select("id")
      .eq("event_id", eventId)
      .maybeSingle();

    return !!data;
  } catch (error) {
    console.error("[webhook-idempotency] Error checking event", eventId, error);
    // On error, assume not processed (fail-open)
    return false;
  }
}

/**
 * Mark a webhook event as processed.
 * Stores the event ID with a timestamp.
 * Returns alreadyProcessed: true when a unique constraint indicates the event was already recorded.
 */
export async function markEventProcessed(
  eventId: string,
  eventType: string,
): Promise<{ success: boolean; alreadyProcessed?: boolean; error?: string }> {
  if (!supabaseAdmin) {
    return { success: false, error: "supabaseAdmin not available" };
  }

  try {
    const row = {
      event_id: eventId,
      event_type: eventType,
      processed_at: new Date().toISOString(),
    };
    const { error } = await safeInsert("webhook_events", row, undefined, supabaseAdmin);

    if (error) {
      // Check if it's a duplicate key error (event already exists)
      if (error.code === "23505" || error.message?.includes("duplicate key")) {
        // Event was already marked as processed (race condition)
        console.warn(`[webhook-idempotency] Event ${eventId} already marked as processed (race condition)`);
        return { success: true, alreadyProcessed: true };
      }
      console.error("[webhook-idempotency] Error marking event as processed", eventId, error);
      return { success: false, error: error.message };
    }

    return { success: true, alreadyProcessed: false };
  } catch (error) {
    console.error("[webhook-idempotency] Unexpected error marking event", eventId, error);
    return { success: false, error: String(error) };
  }
}

/**
 * Clean up old processed events (optional maintenance function).
 * Removes events older than the specified number of days.
 * Call this periodically (e.g., via a cron job) to prevent unbounded growth.
 */
export async function cleanupOldEvents(olderThanDays: number = 90): Promise<{ deleted: number }> {
  if (!supabaseAdmin) {
    console.error("[webhook-idempotency] supabaseAdmin not available");
    return { deleted: 0 };
  }

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const { data, error } = await fromSafe("webhook_events")
      .delete()
      .lt("processed_at", cutoffDate.toISOString())
      .select("id");

    if (error) {
      console.error("[webhook-idempotency] Error cleaning up old events", error);
      return { deleted: 0 };
    }

    const deleted = Array.isArray(data) ? data.length : 0;
    console.log(`[webhook-idempotency] Cleaned up ${deleted} old events`);
    return { deleted };
  } catch (error) {
    console.error("[webhook-idempotency] Unexpected error during cleanup", error);
    return { deleted: 0 };
  }
}

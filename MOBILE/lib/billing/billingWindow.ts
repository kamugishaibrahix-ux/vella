/**
 * Billing Window Resolver
 * Determines the time-scoped window for token usage accounting.
 *
 * Model B: Usage + topups within current billing window. No counter resets.
 */

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";

export interface BillingWindow {
  start: Date;
  end: Date;
  source: "subscription" | "calendar_month";
}

/**
 * Resolves the billing window for a user.
 *
 * Logic:
 * 1. If subscription has valid current_period_start/end, use those
 * 2. Else use calendar UTC month (start of month → start of next month)
 * 3. Fail-closed: returns null if window cannot be determined and user is attempting token-consuming action
 *
 * @param userId - The user to resolve billing window for
 * @returns BillingWindow or null if cannot be determined
 */
export async function resolveBillingWindow(userId: string): Promise<BillingWindow | null> {
  try {
    // Check for subscription-based window
    if (supabaseAdmin) {
      const { data, error } = await fromSafe("subscriptions")
        .select("current_period_start, current_period_end")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("[resolveBillingWindow] Error fetching subscription:", error.message);
        // Continue to fallback - don't fail here
      }

      if (data) {
        const row = data as {
          current_period_start: string | null;
          current_period_end: string | null;
        };

        // Validate both dates exist and are valid
        if (row.current_period_start && row.current_period_end) {
          const start = new Date(row.current_period_start);
          const end = new Date(row.current_period_end);

          // Validate dates are valid
          if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
            return {
              start,
              end,
              source: "subscription",
            };
          }
        }
      }
    }

    // Fallback: calendar UTC month
    return getCalendarMonthWindow();
  } catch (error) {
    console.error("[resolveBillingWindow] Unexpected error:", error);
    // Fail-closed: return null on error (caller must handle)
    return null;
  }
}

/**
 * Get calendar month window in UTC.
 * From start of current month to start of next month.
 */
export function getCalendarMonthWindow(): BillingWindow {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

  return {
    start,
    end,
    source: "calendar_month",
  };
}

/**
 * Synchronous version for contexts where async is not available.
 * Always returns calendar month window.
 */
export function resolveBillingWindowSync(): BillingWindow {
  return getCalendarMonthWindow();
}

/**
 * Check if a date falls within a billing window (inclusive start, exclusive end).
 */
export function isWithinBillingWindow(date: Date, window: BillingWindow): boolean {
  return date >= window.start && date < window.end;
}

/**
 * Format window for logging/debugging.
 */
export function formatBillingWindow(window: BillingWindow): string {
  return `${window.source}: ${window.start.toISOString()} → ${window.end.toISOString()}`;
}

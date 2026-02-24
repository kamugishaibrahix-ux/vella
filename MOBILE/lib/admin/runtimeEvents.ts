// Dynamic imports to prevent server-only code from being analyzed during build
// This file is only used in API routes (server-only), but Next.js analyzes the import chain

/**
 * Runtime event logging for admin monitoring.
 * All functions are best-effort and never throw.
 */

type LogEntry = {
  user_id: string;
  level: "info" | "warn" | "error";
  source: string;
  code?: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
};

type FeedbackEntry = {
  user_id: string;
  session_id?: string | null;
  rating?: number | null;
  channel: "voice" | "text";
  category?: string | null;
  created_at?: string;
};

/**
 * Records a runtime log event for admin monitoring.
 * Local-first: no-op in local mode.
 */
export async function recordAdminRuntimeLog(event: {
  userId: string;
  level: "info" | "warn" | "error";
  source: string;
  code?: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Local-first: no Supabase, no-op
  return;
}

/**
 * Records a feedback summary for admin analytics.
 * Local-first: no-op in local mode.
 */
export async function recordAdminFeedbackSummary(event: {
  userId: string;
  sessionId: string;
  rating?: number;
  channel: "voice" | "text";
  category?: string;
}): Promise<void> {
  // Local-first: no Supabase, no-op
  return;
}


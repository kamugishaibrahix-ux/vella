/**
 * Admin-only metrics endpoint for production observability.
 * GET /api/internal/metrics
 *
 * Returns in-memory counters (resets on process restart):
 * - OpenAI success/failure counts and latency histogram
 * - Token deduct/refund counts
 * - Rate limit 503 count
 * - DB unavailable count
 * - Stripe webhook duplicate count
 *
 * Protected by CRON_SECRET header (admin only).
 * NO PII exposed - only aggregate counters.
 */

import { NextResponse } from "next/server";
import { getSecurityCounts, getOpenAILatencyHistogram } from "@/lib/security/observability";
import { getHealthQueryCount } from "@/app/api/system/health/healthInstrumentation";
import { getOpenAICircuitState } from "@/lib/ai/circuitBreaker";

const CRON_SECRET_HEADER = "x-cron-secret";
const CRON_SECRET_ENV = "CRON_SECRET";

function getCronSecret(): string | null {
  return process.env[CRON_SECRET_ENV] ?? null;
}

function isAuthorized(request: Request): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const header =
    request.headers.get(CRON_SECRET_HEADER) ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return header === secret;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized", request_id: requestId }, { status: 401 });
  }

  const [
    securityCounts,
    openAILatency,
    healthQueries,
    circuitState,
  ] = await Promise.all([
    getSecurityCounts(),
    getOpenAILatencyHistogram(),
    getHealthQueryCount(),
    getOpenAICircuitState(),
  ]);

  const uptimeSeconds = process.uptime ? process.uptime() : 0;

  return NextResponse.json({
    request_id: requestId,
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(uptimeSeconds),

    counters: {
      // OpenAI metrics
      openai_successes: securityCounts.openAISuccesses,
      openai_failures: securityCounts.openAIFailures,
      openai_circuit_open: circuitState.isOpen,
      openai_circuit_state: circuitState.state,

      // Token metrics
      token_deducts: securityCounts.tokenDeductCount,
      token_refunds: securityCounts.tokenRefundCount,

      // Rate limiting metrics
      rate_limited_429: securityCounts.rateLimited,
      rate_limit_503: securityCounts.rateLimit503Count,
      quota_exceeded: securityCounts.quotaExceeded,

      // Infrastructure metrics
      db_unavailable: securityCounts.dbUnavailableCount,
      health_endpoint_queries: healthQueries,

      // Stripe metrics
      stripe_webhook_duplicates: securityCounts.stripeWebhookDuplicateCount,
    },

    // Latency distribution (no PII)
    openai_latency_histogram: {
      buckets_ms: openAILatency.buckets,
      counts: openAILatency.counts,
    },

    // Metadata
    _meta: {
      note: "Counters reset on process restart",
      circuit_open_until: circuitState.openUntil ?? null,
    },
  });
}

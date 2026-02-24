import type { ObservabilityMeta } from "@/lib/security/observability";
import { incrementQuotaExceeded, logSecurityEvent } from "@/lib/security/observability";

/**
 * Standardized response when token quota is exceeded.
 * Do not reveal internal limits in detail.
 * Pass optional meta for privacy-safe structured logging.
 */
export const QUOTA_EXCEEDED_RESPONSE = {
  code: "QUOTA_EXCEEDED" as const,
  message: "Quota exceeded. Please try again later or upgrade your plan.",
};

export function quotaExceededResponse(meta?: ObservabilityMeta): Response {
  incrementQuotaExceeded();
  if (meta) {
    logSecurityEvent({ ...meta, outcome: "quota_exceeded" });
  }
  return new Response(JSON.stringify(QUOTA_EXCEEDED_RESPONSE), {
    status: 402,
    headers: { "Content-Type": "application/json" },
  });
}

export function isQuotaExceededResponse(res: Response): boolean {
  return res.status === 402;
}

/**
 * Hardening for service-key protected routes (rebuild/snapshot).
 * - Optional IP allowlist (SERVICE_KEY_ALLOWED_IPS)
 * - Rate limit per IP and per auth header fingerprint (never store or log raw key)
 * - Request body size bounds for JSON
 *
 * Do NOT log or persist the raw Authorization header or service key.
 */

import { createHash } from "crypto";
import { getClientIp, rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";

const ENV_ALLOWED_IPS = "SERVICE_KEY_ALLOWED_IPS";

/** Parsed allowlist; empty set means "not configured" (allow all). */
let allowlistSet: Set<string> | null = null;

function getAllowlist(): Set<string> | null {
  if (allowlistSet !== null) return allowlistSet;
  const raw = process.env[ENV_ALLOWED_IPS]?.trim();
  if (!raw) {
    allowlistSet = null;
    return null;
  }
  allowlistSet = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return allowlistSet;
}

/**
 * Stable fingerprint of the Authorization header for rate limiting.
 * Same header value always yields the same fingerprint. Raw key is never stored or logged.
 */
export function getAuthFingerprint(authHeader: string | null): string {
  if (!authHeader || typeof authHeader !== "string") return "none";
  const hash = createHash("sha256").update(authHeader).digest("hex");
  return hash.slice(0, 16);
}

/**
 * If SERVICE_KEY_ALLOWED_IPS is set, returns true only when client IP is in the list.
 * If not set, returns true (no allowlist enforced).
 */
export function isIpAllowlisted(ip: string): boolean {
  const allowlist = getAllowlist();
  if (!allowlist) return true;
  return allowlist.has(ip);
}

/** Default rate limit for rebuild/snapshot: 10 req / 300s (per IP and per fingerprint). */
export const SERVICE_KEY_RATE_LIMIT = { limit: 10, window: 300 };

/**
 * Enforce rate limit by both IP and auth fingerprint, and optional IP allowlist.
 * Call before checking Bearer token. Returns a Response to send (403 or 429) or null to continue.
 * Never logs or stores the raw Authorization header.
 */
export async function enforceServiceKeyProtection(
  req: Request,
  routeKey: string
): Promise<Response | null> {
  const ip = getClientIp(req);
  const allowlist = getAllowlist();
  if (allowlist !== null && !allowlist.has(ip)) {
    return new Response(
      JSON.stringify({ error: "forbidden", message: "IP not allowed" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const authHeader = req.headers.get("authorization");
  const fp = getAuthFingerprint(authHeader);

  const rlIp = await rateLimit({
    key: `rebuild:${routeKey}:ip:${ip}`,
    limit: SERVICE_KEY_RATE_LIMIT.limit,
    window: SERVICE_KEY_RATE_LIMIT.window,
    routeKey,
  });
  if (!rlIp.allowed) {
    return rlIp.status === 503 ? rateLimit503Response() : rateLimit429Response(rlIp.retryAfterSeconds);
  }
  const rlFp = await rateLimit({
    key: `rebuild:${routeKey}:fp:${fp}`,
    limit: SERVICE_KEY_RATE_LIMIT.limit,
    window: SERVICE_KEY_RATE_LIMIT.window,
    routeKey,
  });
  if (!rlFp.allowed) {
    return rlFp.status === 503 ? rateLimit503Response() : rateLimit429Response(rlFp.retryAfterSeconds);
  }
  return null;
}

/** Max JSON body size for service-key routes (small payloads only). */
export const MAX_SERVICE_KEY_BODY_BYTES = 2048;

/**
 * Read request body as string with a byte size limit. Use for JSON bodies to prevent large payloads.
 * Returns the body text or throws if over limit. Does not log body content.
 */
export async function readBodyWithLimit(req: Request, maxBytes: number): Promise<string> {
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const len = parseInt(contentLength, 10);
    if (Number.isNaN(len) || len < 0 || len > maxBytes) {
      throw new Error("BODY_TOO_LARGE");
    }
  }
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw new Error("BODY_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buf = Buffer.concat(chunks);
  return buf.toString("utf-8");
}

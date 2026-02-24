/**
 * DO NOT REMOVE: Privacy enforcement layer
 * Prevents accidental logging of user/assistant text and request bodies.
 */

/** Redact keys that may contain user/AI text (aligned with BANNED_FIELDS and contract). */
const SENSITIVE_KEYS = new Set([
  "message",
  "history",
  "memory_summary",
  "transcript",
  "content",
  "payload",
  "body",
  "text",
  "delta",
  "safeText",
  "data",
  "input",
  "output",
  "note",
  "summary",
  "journal",
  "response",
  "prompt",
  "narrative",
  "description",
  "comment",
  "reflection",
  "entry",
  "reply",
  "answer",
  "reasoning",
  "free_text",
]);

function redactValue(val: unknown, keyHint?: string): unknown {
  if (val === null || val === undefined) return val;
  const key = (keyHint ?? "").toLowerCase();
  if (key && SENSITIVE_KEYS.has(key)) return "[REDACTED]";
  if (typeof val === "string" && key && SENSITIVE_KEYS.has(key)) return "[REDACTED]";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.map((v) => redactValue(v));
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = redactValue(v, k);
    }
    return out;
  }
  return val;
}

function redactArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === "object" && arg !== null && !Array.isArray(arg)) {
      return redactValue(arg);
    }
    return arg;
  });
}

let installed = false;

export function installLogGuard(): void {
  if (installed) return;
  installed = true;
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  console.log = (...args: unknown[]) => origLog(...redactArgs(args));
  console.error = (...args: unknown[]) => origError(...redactArgs(args));
  console.warn = (...args: unknown[]) => origWarn(...redactArgs(args));
}

/**
 * Log only a label and the error message. No stack, no serialized body.
 */
export function safeErrorLog(label: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : "Unknown error";
  console.error(label, msg);
}

/**
 * Call from test setup to enable log redaction in tests (prevents sensitive data in test output).
 */
export function installLogGuardForTests(): void {
  installLogGuard();
}

// Apply guard at module load (client and server) except in test
if (typeof process !== "undefined" && process.env?.NODE_ENV !== "test") {
  installLogGuard();
}

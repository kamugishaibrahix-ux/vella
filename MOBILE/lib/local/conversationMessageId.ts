/**
 * Phase M3.5: Stable message_id for conversation dedupe.
 * sha256(role+content+session_id+salt) so same message gets same id and upsert is idempotent.
 */

export async function hashMessageId(
  role: string,
  content: string,
  sessionId: string,
  salt: string
): Promise<string> {
  const payload = `${role}:${content}:${sessionId}:${salt}`;
  const bytes = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex;
}

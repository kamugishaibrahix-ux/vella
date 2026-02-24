/**
 * @deprecated prompt_signatures table does not exist. This function is now a no-op.
 * Logging is disabled in local-first mode.
 */
export async function logPromptSignature(
  userId: string,
  personaHash: string,
  channel: "voice" | "text",
): Promise<void> {
  // Local-first: prompt_signatures table does not exist. No-op.
  return;
}


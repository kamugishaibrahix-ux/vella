/**
 * LLM context window: active session only, capped messages.
 * Never send full history or archived sessions.
 */

export const MAX_CONTEXT_MESSAGES = 30;

export type ContextMessage = { role: "user" | "assistant"; content: string };

/**
 * Take last N messages (most recent at end). Prepends can be added by caller
 * (weekly focus, behaviour snapshot, identity) in the prompt layer.
 */
export function buildConversationContext(messages: ContextMessage[]): ContextMessage[] {
  if (messages.length <= MAX_CONTEXT_MESSAGES) return messages;
  return messages.slice(-MAX_CONTEXT_MESSAGES);
}

/**
 * Format conversation for prompt: "User: ... Assistant: ..." (or similar).
 * Used to inject recent turns into the system/user block.
 */
export function formatConversationForPrompt(messages: ContextMessage[]): string {
  const limited = buildConversationContext(messages);
  return limited
    .map((m) => (m.role === "user" ? `User: ${m.content}` : `Vella: ${m.content}`))
    .join("\n\n");
}

/**
 * Audit event types. Stored payload must NEVER contain user/assistant text.
 * Only type, userId, createdAt, route?, outcome? are persisted.
 */
export type AuditEventType =
  | "USER_MESSAGE"
  | "ASSISTANT_MESSAGE"
  | "EMOTION_UPDATE"
  | "HEALTH_UPDATE"
  | "INTELLIGENCE_SUGGESTION"
  | "STRATEGY_CHOSEN"
  | "SAFETY_INTERVENTION";

export interface AuditEvent {
  type: AuditEventType;
  timestamp: number;
  userId?: string | null;
  route?: string | null;
  /** Non-free-text code only (e.g. intent name). Never user/assistant content. */
  outcome?: string | null;
}

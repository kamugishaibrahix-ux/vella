// Summary: In-memory logger for token dry-run enforcement events
// This logger is DEV-ONLY and MUST NOT write to disk or leak sensitive data

type DryRunEvent = {
  type: "check" | "charge";
  mode: "dry-run";
  userId: string;
  planTier: string;
  estimatedOrActualTokens: number;
  route: string;
  timestamp: number;
  operation?: string; // Only present for charge events
};

// In-memory storage (max 200 entries, oldest removed when limit exceeded)
const MAX_EVENTS = 200;
const eventLog: DryRunEvent[] = [];

/**
 * Logs a dry-run token enforcement event to in-memory storage.
 * 
 * DEV-ONLY: This logger is for debugging and telemetry only.
 * MUST NOT write to disk or leak sensitive data.
 * 
 * @param event - Dry-run event data
 */
export function logDryRunEvent(event: Omit<DryRunEvent, "timestamp">): void {
  // Sanitize userId to prevent sensitive data leakage
  const sanitizedUserId = event.userId.length > 20 
    ? `${event.userId.slice(0, 20)}...` 
    : event.userId;

  const logEntry: DryRunEvent = {
    ...event,
    userId: sanitizedUserId,
    timestamp: Date.now(),
  };

  // Append to log (newest first)
  eventLog.unshift(logEntry);

  // Trim to max size (remove oldest entries)
  if (eventLog.length > MAX_EVENTS) {
    eventLog.splice(MAX_EVENTS);
  }

  // Also log to console in dev mode for immediate visibility
  if (process.env.NODE_ENV !== "production") {
    console.log(`[TOKEN-DRY-RUN-LOG] ${event.type}:`, {
      route: event.route,
      planTier: event.planTier,
      tokens: event.estimatedOrActualTokens,
      operation: event.operation,
      timestamp: new Date(logEntry.timestamp).toISOString(),
    });
  }
}

/**
 * Retrieves the last N dry-run events (newest first).
 * 
 * DEV-ONLY: This function is for debugging and telemetry only.
 * 
 * @param limit - Maximum number of events to return (default: 50)
 * @returns Array of dry-run events, newest first
 */
export function getDryRunEvents(limit: number = 50): DryRunEvent[] {
  // Return last N events (already sorted newest→oldest)
  return eventLog.slice(0, Math.min(limit, eventLog.length));
}

/**
 * Clears all dry-run events from memory.
 * 
 * DEV-ONLY: Useful for testing or resetting telemetry.
 */
export function clearDryRunEvents(): void {
  eventLog.length = 0;
}

/**
 * Gets the total count of logged events.
 * 
 * @returns Number of events in the log
 */
export function getDryRunEventCount(): number {
  return eventLog.length;
}


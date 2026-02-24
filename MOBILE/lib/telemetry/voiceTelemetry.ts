export type VoiceTelemetryEventBase = {
  source: "realtime_client" | "realtime_hook" | "realtime_api";
  kind: "info" | "warning" | "error";
  code: string;
  message: string;
  context?: Record<string, unknown>;
};

export type VoiceTelemetryEvent = VoiceTelemetryEventBase;

import type { EmotionalArc } from "@/lib/realtime/emotion/extractArc";

export function logVoiceTelemetry(event: VoiceTelemetryEvent): void {
  if (process.env.NODE_ENV === "test") return;

  const payload = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV === "development") {
    // Do not log message/context/payload — may contain or lead to user content
    // eslint-disable-next-line no-console
    console.log("[VoiceTelemetry]", payload.source, payload.kind, payload.code);
  }
}

export function logEmotionalArc(arc: EmotionalArc): void {
  logVoiceTelemetry({
    source: "realtime_client",
    kind: "info",
    code: "emotional_arc",
    message: "Emotional arc detected for realtime guidance.",
    context: { arc },
  });
}


"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeVella } from "@/lib/realtime/useRealtimeVella";
import { useVellaContext } from "@/lib/realtime/VellaProvider";
import {
  getActiveSessionId,
  closeSession,
  getMessagesForSession,
  saveSessionSummary,
} from "@/lib/session/sessionStore";
import { summariseSession } from "@/lib/session/summariseSession";

type ChamberState = "idle" | "listening" | "processing" | "responding";

function mapStageToChamber(stage: string): ChamberState {
  switch (stage) {
    case "listening":
      return "listening";
    case "thinking":
      return "processing";
    case "speaking":
      return "responding";
    default:
      return "idle";
  }
}

export default function SessionPage() {
  const router = useRouter();
  const [realtimeState, realtimeBudget, controls, deliveryMeta] = useRealtimeVella({
    planTier: "pro",
    onUserUtterance: (text) => {
      setTranscriptLines((prev) => [...prev, { role: "user" as const, text }]);
    },
    onAssistantMessage: (text) => {
      setTranscriptLines((prev) => [...prev, { role: "assistant" as const, text }]);
      setSubtitle(text);
    },
  });
  const { setRealtimeState, setRealtimeControls, setRealtimeBudget, setRealtimeDeliveryMeta } =
    useVellaContext();

  const [transcriptLines, setTranscriptLines] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [subtitle, setSubtitle] = useState("");
  const [interrupting, setInterrupting] = useState(false);
  const chamberState = mapStageToChamber(realtimeState.stage);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRealtimeState(realtimeState);
    setRealtimeControls(controls);
    setRealtimeBudget(realtimeBudget);
    setRealtimeDeliveryMeta(deliveryMeta);
  }, [realtimeState, controls, realtimeBudget, deliveryMeta, setRealtimeState, setRealtimeControls, setRealtimeBudget, setRealtimeDeliveryMeta]);

  const tension = deliveryMeta?.emotionalState?.tension ?? 0;
  const isTense = tension > 0.5;
  const isCalm = tension < 0.3;
  const isFocused = tension >= 0.3 && tension <= 0.5 && (deliveryMeta?.emotionalState?.arousal ?? 0) > 0.4;
  const isDistress = tension > 0.7;

  const handleTapArea = useCallback(() => {
    if (chamberState === "responding") {
      setInterrupting(true);
      controls.cancelResponse();
      setSubtitle("");
      const t = setTimeout(() => setInterrupting(false), 700);
      return () => clearTimeout(t);
    }
  }, [chamberState, controls]);

  const handleMicPress = useCallback(() => {
    if (!realtimeState.connected) {
      controls.startSession({ enableMic: true });
    }
  }, [realtimeState.connected, controls]);

  const handleEndSession = useCallback(async () => {
    const currentId = getActiveSessionId();
    if (currentId) {
      const messages = getMessagesForSession(currentId);
      closeSession(currentId);
      if (messages.length > 0) {
        const summary = summariseSession(currentId, messages);
        saveSessionSummary(currentId, summary);
        try {
          await fetch("/api/vella/session/close", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ summary }),
          });
        } catch {
          // non-blocking
        }
      }
    }
    await controls.stopSession("stopSession");
    router.push("/home");
  }, [controls, router]);

  const stateLabel =
    chamberState === "idle"
      ? ""
      : chamberState === "listening"
        ? "Listening…"
        : chamberState === "processing"
          ? "Thinking…"
          : "";

  return (
    <div
      ref={containerRef}
      className="relative min-h-[100dvh] flex flex-col bg-vella-bg overflow-hidden"
      onClick={chamberState === "responding" ? handleTapArea : undefined}
      role={chamberState === "responding" ? "button" : undefined}
      tabIndex={chamberState === "responding" ? 0 : undefined}
      onKeyDown={(e) => {
        if (chamberState === "responding" && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          handleTapArea();
        }
      }}
      aria-label={chamberState === "responding" ? "Tap to stop" : undefined}
    >
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br to-neutral-100 dark:to-neutral-950 transition-all duration-700",
          isTense ? "from-emerald-50/20 dark:from-emerald-950/20" : "from-neutral-50 dark:from-neutral-900"
        )}
      />

      <div
        className={cn(
          "absolute inset-3 rounded-3xl pointer-events-none border transition-all duration-700 ease-chamber",
          chamberState === "listening" &&
            "scale-[1.01] border-neutral-300/70 animate-chamber-shimmer",
          chamberState === "processing" &&
            "scale-100 border-neutral-300/40 animate-chamber-breathe",
          chamberState === "responding" &&
            "border-emerald-300/30 dark:border-emerald-400/20 animate-chamber-pulse",
          interrupting && "scale-[0.995] border-neutral-300/40",
          (chamberState === "idle" || (chamberState === "responding" && interrupting)) &&
            "border-neutral-300/40 scale-100",
          chamberState === "idle" && "border-neutral-300/40",
          isFocused && chamberState !== "responding" && "border-neutral-300/60",
          isDistress && chamberState === "processing"
        )}
        style={
          isDistress && chamberState === "processing"
            ? { animationDuration: "3.5s" }
            : undefined
        }
      />

      <div className="relative flex-1 flex items-center justify-center px-6 min-h-0">
        <div className="flex flex-col items-center justify-center w-full max-w-[80%]">
          {stateLabel && (
            <p
              className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2 animate-fadeIn"
              style={{ animationDuration: "600ms" }}
            >
              {stateLabel}
            </p>
          )}
          {subtitle && (
            <p
              className={cn(
                "text-lg font-medium text-neutral-800 dark:text-neutral-200 text-center",
                "animate-fadeIn transition-opacity duration-700"
              )}
              style={{ animationDuration: "700ms" }}
            >
              {subtitle}
            </p>
          )}
          {transcriptLines.length > 0 && (
            <div className="mt-4 w-full space-y-2">
              {transcriptLines.map((line, i) => (
                <p
                  key={i}
                  className={cn(
                    "text-lg font-medium text-neutral-800 dark:text-neutral-200 text-center",
                    "animate-fadeIn"
                  )}
                  style={{ animationDuration: "600ms" }}
                >
                  {line.text}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-6 items-center pointer-events-none">
        <div className="flex justify-center gap-6 items-center pointer-events-auto">
          <button
            type="button"
            onClick={handleMicPress}
            className={cn(
              "rounded-full p-4 transition-all duration-700 ease-chamber active:scale-[0.98]",
              realtimeState.connected && chamberState === "listening"
                ? "bg-vella-primary-active scale-[1.02]"
                : "bg-vella-primary hover:bg-vella-primary-hover"
            )}
            aria-label={realtimeState.connected && chamberState === "listening" ? "Listening" : "Tap to speak"}
          >
            <Mic className="w-6 h-6 text-white" />
          </button>
          <button
            type="button"
            onClick={handleEndSession}
            className="text-sm text-vella-muted hover:text-vella-text font-medium pressable py-2"
          >
            End session
          </button>
        </div>
      </div>
    </div>
  );
}

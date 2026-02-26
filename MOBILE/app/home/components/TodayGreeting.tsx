"use client";

import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Deterministic fallback greetings by time-of-day
// ---------------------------------------------------------------------------

function getTimeOfDay(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

const FALLBACK_GREETINGS: Record<string, string> = {
  morning: "How is this morning landing?",
  afternoon: "How has today been unfolding?",
  evening: "How are you holding up tonight?",
};

function trimToFirstSentence(text: string): string {
  const cleaned = text.trim();
  const match = cleaned.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : cleaned;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TodayGreeting() {
  const fallback = FALLBACK_GREETINGS[getTimeOfDay()];
  const [greeting, setGreeting] = useState(fallback);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: controller.signal,
      body: JSON.stringify({
        message: "Give a single short greeting sentence for the user opening their home screen right now. One sentence only. No questions about what they need help with.",
        mode: "listen",
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.reply && typeof data.reply === "string") {
          const line = trimToFirstSentence(data.reply);
          if (line.length > 0) setGreeting(line);
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  return (
    <p
      className="text-base leading-relaxed"
      style={{
        color: "var(--vella-muted-strong)",
        fontWeight: 400,
        letterSpacing: "0.01em",
      }}
    >
      {greeting}
    </p>
  );
}

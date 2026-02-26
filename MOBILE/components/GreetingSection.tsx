"use client";

import { useEffect, useState } from "react";

function trimToFirstSentence(text: string): string {
  const cleaned = text.trim();
  const match = cleaned.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : cleaned;
}

function fallbackGreeting(): string {
  return "You were up late. How is the morning landing?";
}

type Props = {
  checkedInToday: boolean;
};

export function GreetingSection({ checkedInToday }: Props) {
  const [greeting, setGreeting] = useState<string>(() => fallbackGreeting());

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: controller.signal,
      body: JSON.stringify({
        message:
          "Write one gentle home-screen greeting sentence for the user. One sentence only. End after the first period. Calm, quiet, conversational. No emojis.",
        mode: "listen",
        conversationHistory: [],
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.reply && typeof data.reply === "string") {
          const line = trimToFirstSentence(data.reply);
          if (line) setGreeting(line);
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  return (
    <section className="pt-8">
      <h2
        className="text-[30px] leading-[1.25] font-medium tracking-[-0.01em]"
        style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
      >
        {greeting}
      </h2>

      {!checkedInToday && (
        <p className="mt-4 text-sm italic leading-relaxed text-vella-muted">
          — Vella notices you haven’t checked in yet today.
        </p>
      )}
    </section>
  );
}


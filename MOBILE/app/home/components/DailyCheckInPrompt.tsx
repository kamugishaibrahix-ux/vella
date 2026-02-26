"use client";

import { useState, useEffect, useCallback } from "react";
import { saveCheckin } from "@/lib/local/checkinsLocal";
import { ensureUserId } from "@/lib/local/ensureUserId";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "vella_daily_checkin_date";

const MOOD_MAP: Record<string, number> = {
  lighter: 3,
  same: 2,
  heavier: 1,
};

const BUTTONS: { label: string; key: string }[] = [
  { label: "Lighter", key: "lighter" },
  { label: "Same", key: "same" },
  { label: "Heavier", key: "heavier" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasCheckedInToday(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === todayKey();
  } catch {
    return false;
  }
}

function markCheckedIn(): void {
  try {
    localStorage.setItem(STORAGE_KEY, todayKey());
  } catch {}
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DailyCheckInPrompt() {
  const [done, setDone] = useState(true);
  const [noted, setNoted] = useState(false);

  useEffect(() => {
    setDone(hasCheckedInToday());
  }, []);

  const handlePress = useCallback(async (key: string) => {
    const mood = MOOD_MAP[key] ?? 2;
    const today = todayKey();
    const id = crypto.randomUUID();
    const userId = ensureUserId();

    // Write to IndexedDB (local-first)
    await saveCheckin(userId, {
      id,
      entry_date: today,
      mood,
      stress: 0,
      energy: 0,
      focus: 0,
      created_at: new Date().toISOString(),
    }).catch(() => {});

    // Sync metadata to server (best-effort, non-blocking)
    fetch("/api/check-ins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ entry_date: today, mood }),
    }).catch(() => {});

    markCheckedIn();
    setNoted(true);
    setDone(true);
  }, []);

  if (done && !noted) return null;

  if (noted) {
    return (
      <section className="py-2">
        <p
          className="text-sm"
          style={{ color: "var(--vella-muted)", fontWeight: 400 }}
        >
          Noted.
        </p>
      </section>
    );
  }

  return (
    <section className="py-2">
      <p
        className="text-sm mb-3"
        style={{ color: "var(--vella-muted-strong)", fontWeight: 400 }}
      >
        How are you landing today?
      </p>
      <div className="flex gap-3">
        {BUTTONS.map((btn) => (
          <button
            key={btn.key}
            onClick={() => handlePress(btn.key)}
            className="text-xs font-medium px-3 py-1.5 rounded-full transition pressable"
            style={{
              border: "1px solid var(--vella-border)",
              background: "transparent",
              color: "var(--vella-muted-strong)",
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </section>
  );
}

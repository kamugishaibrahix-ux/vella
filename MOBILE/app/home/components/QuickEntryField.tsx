"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickEntryField() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  const handleJournal = useCallback(() => {
    const text = value.trim();
    setValue("");
    setFocused(false);
    router.push(
      text
        ? (`/journal?prefill=${encodeURIComponent(text)}` as "/journal")
        : ("/journal" as "/journal"),
    );
  }, [value, router]);

  const handleVella = useCallback(() => {
    const text = value.trim();
    setValue("");
    setFocused(false);
    router.push(
      text
        ? (`/session?prefill=${encodeURIComponent(text)}` as "/session")
        : ("/session" as "/session"),
    );
  }, [value, router]);

  return (
    <section className="py-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        placeholder="What's on your mind?"
        className="w-full text-sm py-2 bg-transparent outline-none"
        style={{
          color: "var(--vella-text)",
          borderBottom: "1px solid var(--vella-border)",
          caretColor: "var(--vella-primary)",
        }}
      />
      {focused && (
        <div className="flex gap-3 mt-3">
          <button
            onClick={handleJournal}
            className="text-xs font-medium transition pressable"
            style={{ color: "var(--vella-muted-strong)" }}
          >
            Open as journal entry
          </button>
          <button
            onClick={handleVella}
            className="text-xs font-medium transition pressable"
            style={{ color: "var(--vella-primary)" }}
          >
            Send to Vella
          </button>
        </div>
      )}
    </section>
  );
}

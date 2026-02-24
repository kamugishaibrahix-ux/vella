"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { cn, formatDate } from "@/lib/utils";

type JournalListResponse = { entries?: { id: string; content: string; createdAt: string }[] };

type ResolutionDraft = {
  happening: string;
  reality: string;
  next: string;
};

type ClarityState = "clouded" | "mixed" | "clear";

const LABEL_HAPPENING = "WHAT’S HAPPENING";
const LABEL_REALITY = "WHAT’S REALLY GOING ON";
const LABEL_NEXT = "WHAT WILL I DO NEXT";

const CLARITY_STORAGE_KEY = "journal:clarity";

const HIGHLIGHT_TERMS = [
  // loops (mirrors server-side regex intent)
  "late night",
  "can't sleep",
  "cant sleep",
  "scroll",
  "avoid",
  "delay",
  "procrastinat",
  "burnout",
  "exhausted",
  "drained",
  "overthink",
  "ruminate",
  "spiral",

  // distortions
  "everything will go wrong",
  "disaster",
  "ruined",
  "always",
  "never",
  "everyone",
  "no one",
  "because i feel",
  "i feel so it must be",
  "they must think",
  "i know what they think",

  // themes (conservative subset)
  "worth",
  "enough",
  "identity",
  "friend",
  "relationship",
  "partner",
  "lonely",
  "career",
  "purpose",
  "tired",
  "energy",
  "fatigue",
  "panic",
  "stress",
  "calm",
  "breathe",

  // trait markers
  "kept going",
  "bounced back",
  "recovered",
  "understand",
  "see clearly",
  "naming",
  "routine",
  "habit",
  "stuck with",
  "excited",
  "driven",
  "motivated",
  "kind to myself",
  "gave myself grace",
  "self-compassion",
  "self compassion",

  // value references (local deterministic)
  "important to me",
  "matters to me",
  "i care about",
  "i value",
  "my values",
  "integrity",
  "honesty",
  "respect",
  "kindness",
  "family",
  "health",
  "freedom",
  "growth",

  // commitment references (local deterministic)
  "i will",
  "i won't",
  "i wont",
  "i'm going to",
  "im going to",
  "i am going to",
  "i commit",
  "next step",
  "tomorrow",
  "this week",
] as const;

const HIGHLIGHT_REGEX = new RegExp(
  `(${HIGHLIGHT_TERMS.map((t) => t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})`,
  "gi"
);

function buildResolutionContent(draft: ResolutionDraft): string {
  const happening = draft.happening.trim();
  const reality = draft.reality.trim();
  const next = draft.next.trim();

  return [
    `${LABEL_HAPPENING}\n${happening}`,
    `${LABEL_REALITY}\n${reality}`,
    `${LABEL_NEXT}\n${next}`,
  ].join("\n\n");
}

function normalizeNewlines(input: string) {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function extractResolutionSections(content: string): { happening: string; next: string } {
  const text = normalizeNewlines(content ?? "").trim();
  if (!text) return { happening: "", next: "" };

  const headingHappening = /WHAT['’]S HAPPENING/i;
  const headingReality = /WHAT['’]S REALLY GOING ON/i;
  const headingNext = /WHAT WILL I DO NEXT/i;

  const idxH = text.search(headingHappening);
  const idxR = text.search(headingReality);
  const idxN = text.search(headingNext);

  if (idxH === -1 || idxN === -1) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    return {
      happening: lines.slice(0, 2).join("\n"),
      next: lines.at(-1) ?? "",
    };
  }

  const afterHeading = (fromIdx: number, heading: RegExp) => {
    const match = text.slice(fromIdx).match(heading);
    if (!match || match.index == null) return fromIdx;
    return fromIdx + match.index + match[0].length;
  };

  const startH = afterHeading(idxH, headingHappening);
  const endH = Math.min(...[idxR, idxN].filter((x) => x !== -1));
  const happening = text.slice(startH, endH).trim().replace(/^\n+/, "");

  const startN = afterHeading(idxN, headingNext);
  const next = text.slice(startN).trim().replace(/^\n+/, "");

  return { happening, next };
}

function clampLines(text: string, maxLines: number) {
  const lines = normalizeNewlines(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.slice(0, Math.max(1, maxLines)).join("\n");
}

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday=0 ... Sunday=6
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekLabel(weekStart: Date) {
  return `Week of ${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return { entries: [] } satisfies JournalListResponse;
  const data = (await res.json().catch(() => ({}))) as JournalListResponse;
  return data;
};

function HighlightedText({ value }: { value: string }) {
  const parts = value.split(HIGHLIGHT_REGEX);
  return (
    <>
      {parts.map((part, i) => {
        const isHit = i % 2 === 1;
        if (!isHit) return <span key={i}>{part}</span>;
        return (
          <span
            key={i}
            className="underline decoration-vella-accent-muted/60 decoration-2 underline-offset-[3px]"
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

function FlowTextarea({
  value,
  onChange,
  placeholder,
  rows,
  highlightEnabled,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  rows: number;
  highlightEnabled: boolean;
  ariaLabel: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const showHighlight = highlightEnabled && value.trim().length > 0;

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const ov = overlayRef.current;
    if (!ta || !ov) return;
    ov.scrollTop = ta.scrollTop;
    ov.scrollLeft = ta.scrollLeft;
  }, []);

  useEffect(() => {
    if (!showHighlight) return;
    syncScroll();
  }, [showHighlight, value, syncScroll]);

  const baseText =
    "w-full resize-none bg-transparent text-[15px] leading-relaxed text-vella-text placeholder:text-vella-muted/70";

  return (
    <div
      className={cn(
        "relative",
        "pb-2",
        "border-b border-transparent",
        "focus-within:border-vella-border"
      )}
    >
      {showHighlight && (
        <div
          ref={overlayRef}
          aria-hidden
          className={cn(
            "absolute inset-0 overflow-auto pointer-events-none",
            "pr-1" // slight buffer so underlines don't clip on the right edge
          )}
        >
          <div className={cn(baseText, "whitespace-pre-wrap break-words")}>
            <HighlightedText value={value} />
          </div>
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          baseText,
          "focus:outline-none",
          showHighlight && "text-transparent caret-vella-text",
          "whitespace-pre-wrap break-words"
        )}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export default function JournalPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ResolutionDraft>({ happening: "", reality: "", next: "" });
  const [clarity, setClarity] = useState<ClarityState>("mixed");
  const [consent, setConsent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justLogged, setJustLogged] = useState(false);
  const [lastSaveHadConsent, setLastSaveHadConsent] = useState(false);
  const loggedTimeoutRef = useRef<number | null>(null);

  const { data, mutate } = useSWR<JournalListResponse>("/api/journal", fetcher);
  const entries = data?.entries;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLARITY_STORAGE_KEY);
      if (raw === "clouded" || raw === "mixed" || raw === "clear") {
        setClarity(raw);
      }
    } catch {
      // ignore
    }
    return () => {
      if (loggedTimeoutRef.current != null) {
        window.clearTimeout(loggedTimeoutRef.current);
      }
    };
  }, []);

  const saveEnabled = draft.next.trim().length > 0 && !isSaving;

  const grouped = useMemo(() => {
    const sorted = [...(entries ?? [])].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    const groups = new Map<string, { weekStart: Date; items: typeof sorted }>();
    for (const e of sorted) {
      const created = new Date(e.createdAt);
      const ws = startOfWeekMonday(created);
      const key = ws.toISOString().slice(0, 10);
      const g = groups.get(key);
      if (g) g.items.push(e);
      else groups.set(key, { weekStart: ws, items: [e] });
    }
    return Array.from(groups.values()).sort((a, b) => (a.weekStart > b.weekStart ? -1 : 1));
  }, [entries]);

  const handleSave = useCallback(async () => {
    if (!draft.next.trim() || isSaving) return;
    setIsSaving(true);
    setJustLogged(false);
    setLastSaveHadConsent(consent);

    try {
      const text = buildResolutionContent(draft);
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          // UX-only consent wiring: maps to existing API modes (no analytics UI shown here).
          processingMode: consent ? "signals_only" : "private",
        }),
      });
      if (res.ok) {
        setDraft({ happening: "", reality: "", next: "" });
        setConsent(false);
        setJustLogged(true);
        await mutate();
        if (loggedTimeoutRef.current != null) window.clearTimeout(loggedTimeoutRef.current);
        loggedTimeoutRef.current = window.setTimeout(() => setJustLogged(false), 1600);
      }
    } finally {
      setIsSaving(false);
    }
  }, [draft, isSaving, mutate, consent]);

  const todayLabel = useMemo(() => formatDate(new Date()), []);
  const saveLabel = lastSaveHadConsent ? "Clarity logged." : "Saved.";

  return (
    <div className="min-h-[100dvh] overflow-y-auto pb-24">
      <div className="px-5 py-6 space-y-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-vella-text">Journal</h1>
          <button
            type="button"
            onClick={() => router.push("/journal/history")}
            className="text-sm font-medium text-vella-muted hover:text-vella-text transition-colors pressable"
          >
            History
          </button>
        </header>

        <div className="flex justify-end">
          <span className="text-xs text-vella-muted">{todayLabel}</span>
        </div>

        <div className="space-y-6">
          <section className="space-y-2">
            <p className="text-sm text-vella-muted">How clear do you feel right now?</p>
            <div className="flex gap-2">
              {([
                ["clouded", "Clouded"],
                ["mixed", "Mixed"],
                ["clear", "Clear"],
              ] as const).map(([id, label]) => {
                const active = clarity === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setClarity(id);
                      try {
                        window.localStorage.setItem(CLARITY_STORAGE_KEY, id);
                      } catch {
                        // ignore
                      }
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm",
                      "border border-vella-border",
                      "transition-colors",
                      active ? "bg-vella-bg-card text-vella-text" : "bg-transparent text-vella-muted hover:text-vella-text"
                    )}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="rounded-vella-card bg-vella-bg-card shadow-soft px-5 py-6">
            <div className="space-y-6">
              <section className="space-y-3">
                <p className="text-sm text-vella-muted">What’s happening?</p>
                <FlowTextarea
                  value={draft.happening}
                  onChange={(v) => setDraft((d) => ({ ...d, happening: v }))}
                  placeholder="Describe the situation."
                  rows={5}
                  highlightEnabled={consent}
                  ariaLabel="What's happening"
                />
              </section>

              <section className="space-y-3">
                <p className="text-sm text-vella-muted">What’s really going on?</p>
                <FlowTextarea
                  value={draft.reality}
                  onChange={(v) => setDraft((d) => ({ ...d, reality: v }))}
                  placeholder="What are you actually thinking or feeling about this?"
                  rows={5}
                  highlightEnabled={consent}
                  ariaLabel="What's really going on"
                />
              </section>

              <section className="space-y-3">
                <p className="text-sm text-vella-muted">What’s one step forward?</p>
                <FlowTextarea
                  value={draft.next}
                  onChange={(v) => setDraft((d) => ({ ...d, next: v }))}
                  placeholder="What is the next step?"
                  rows={3}
                  highlightEnabled={consent}
                  ariaLabel="What's one step forward"
                />
              </section>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-vella-border text-vella-accent focus:ring-vella-accent/25"
              />
              <span className="text-sm text-vella-text">Allow Vella to learn from this entry</span>
            </label>
            <p className="text-xs text-vella-muted ml-7">
              Only structured signals are extracted. Your words remain private.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <span
              className={cn(
                "text-xs text-vella-muted transition-opacity duration-200",
                justLogged ? "opacity-100 animate-fadeIn" : "opacity-0"
              )}
              aria-live="polite"
            >
              {saveLabel}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={!saveEnabled}
              className={cn(
                "rounded-vella-button px-5 py-2 text-sm font-medium text-white bg-vella-text pressable",
                "transition-opacity duration-200",
                isSaving && "opacity-70",
                !saveEnabled && "opacity-40 pointer-events-none"
              )}
            >
              Save
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

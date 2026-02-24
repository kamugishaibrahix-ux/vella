"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { cn, formatDate } from "@/lib/utils";

type JournalListResponse = { entries?: { id: string; content: string; createdAt: string }[] };

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return { entries: [] } satisfies JournalListResponse;
  const data = (await res.json().catch(() => ({}))) as JournalListResponse;
  return data;
};

function normalizeNewlines(input: string) {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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

export default function JournalHistoryPage() {
  const router = useRouter();
  const { data } = useSWR<JournalListResponse>("/api/journal", fetcher);
  const entries = data?.entries ?? [];

  const grouped = useMemo(() => {
    const sorted = [...entries].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
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

  return (
    <div className="min-h-[100dvh] overflow-y-auto pb-24">
      <div className="px-5 py-6 space-y-6">
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className={cn(
              "text-sm font-medium text-vella-muted hover:text-vella-text pressable",
              "min-w-[64px] text-left"
            )}
            aria-label="Back"
          >
            ← Back
          </button>
          <h1 className="text-sm font-semibold text-vella-text">Journal History</h1>
          <div className="min-w-[64px]" aria-hidden />
        </header>

        <div>
          {grouped.length === 0 ? (
            <div className="min-h-[60dvh] flex items-center justify-center">
              <p className="text-sm text-vella-muted">No entries yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <section key={group.weekStart.toISOString()} className="space-y-3">
                  <p className="text-[11px] font-semibold tracking-widest uppercase text-vella-muted">
                    {weekLabel(group.weekStart)}
                  </p>
                  <div className="space-y-3">
                    {group.items.map((entry) => {
                      const { happening, next } = extractResolutionSections(entry.content);
                      const happeningPreview = clampLines(happening, 2);
                      const nextPreview = clampLines(next, 1);
                      return (
                        <div
                          key={entry.id}
                          className="rounded-vella-card bg-vella-bg-card shadow-soft px-4 py-4"
                        >
                          <p className="text-xs text-vella-muted">{formatDate(entry.createdAt)}</p>
                          <p className="mt-2 text-sm leading-relaxed text-vella-text whitespace-pre-wrap break-words">
                            {happeningPreview || "—"}
                          </p>
                          <div className="mt-3 rounded-vella-button bg-vella-accent-soft/70 px-3 py-2">
                            <p className="text-sm font-medium text-vella-text whitespace-pre-wrap break-words">
                              {nextPreview || "—"}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

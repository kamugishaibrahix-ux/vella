"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { WeeklyFocusCard } from "@/app/components/weekly-focus/WeeklyFocusCard";
import { ReviewPanel } from "@/app/components/weekly-focus/ReviewPanel";
import { EmptyFocusState } from "@/app/components/weekly-focus/EmptyFocusState";
import { InfoSheet } from "@/app/components/weekly-focus/InfoSheet";
import { CompletionRing } from "@/app/components/weekly-focus/CompletionRing";
import { getDisplayWeekId } from "@/app/checkin/weekIdClient";
import { getWeeklyIntentSummary } from "@/app/checkin/intentSummary";
import { getDevMockWeeklyFocus } from "@/lib/focus/devMock";
import type {
  WeeklyFocusItem,
  FocusWeekResponse,
  WeeklyFocusReview,
  FocusRating,
  RatingPayload,
} from "@/app/checkin/types";

const MAX_ITEMS = 5;

const useMockEnv = process.env.NEXT_PUBLIC_DEV_FOCUS_MOCK === "true";
const isDev = process.env.NODE_ENV === "development";

const RATING_TO_NUMERIC: Record<FocusRating, number> = {
  strong: 2,
  neutral: 1,
  struggling: 0,
};

/** Alignment 0–1: strong=1, neutral=0.5, struggling=0. */
function getAlignmentRatio(
  items: WeeklyFocusItem[],
  ratings: Record<string, FocusRating>
): number {
  const selected = items.filter((i) => ratings[i.itemId] != null);
  if (!selected.length) return 0;
  let sum = 0;
  selected.forEach((i) => {
    const r = ratings[i.itemId];
    if (r === "strong") sum += 1;
    else if (r === "neutral") sum += 0.5;
  });
  return sum / selected.length;
}

function SkeletonCards() {
  return (
    <div className="space-y-1.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-vella-card border border-vella-border bg-vella-bg-card p-3 animate-pulse"
        >
          <div className="h-4 w-3/4 rounded bg-vella-border" />
          <div className="mt-2 h-8 w-full rounded-full bg-vella-border" />
        </div>
      ))}
    </div>
  );
}

export default function CheckinPage() {
  const [view, setView] = useState<"form" | "review">("form");
  const [weekId, setWeekId] = useState<string | null>(null);
  const [items, setItems] = useState<WeeklyFocusItem[]>([]);
  const [ratings, setRatings] = useState<Record<string, FocusRating>>({});
  const [review, setReview] = useState<WeeklyFocusReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [mockActive, setMockActive] = useState(false);
  const [weekSoFarPercent, setWeekSoFarPercent] = useState(0);
  const [checkinCount, setCheckinCount] = useState(0);
  const [localRatings, setLocalRatings] = useState<Record<string, number>>({});
  const [submittedToday, setSubmittedToday] = useState(false);
  const [optionalNote, setOptionalNote] = useState("");
  const [hadStrugglingThisSubmit, setHadStrugglingThisSubmit] = useState(false);
  const router = useRouter();

  const applyMockData = useCallback(() => {
    const displayWeekId = getDisplayWeekId(new Date());
    const mock = getDevMockWeeklyFocus(displayWeekId);
    setWeekId(mock.weekId);
    setItems(mock.items);
    setRatings({});
    setError(null);
    setMockActive(true);
    setWeekSoFarPercent(0);
    setCheckinCount(0);
    setLocalRatings({});
    setSubmittedToday(false);
  }, []);

  const fetchFocusWeek = useCallback(async () => {
    setError(null);
    setMockActive(false);
    setLoading(true);
    try {
      const res = await fetch("/api/focus/week");
      if (!res.ok) {
        if (isDev) {
          applyMockData();
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data?.error === "internal_error" ? "Something went wrong." : "Could not load focus.");
          setItems([]);
        }
        return;
      }
      const data: FocusWeekResponse = await res.json();
      setWeekId(data.weekId ?? null);
      setItems(data.items?.slice(0, MAX_ITEMS) ?? []);
      setRatings({});
      setLocalRatings({});
      setWeekSoFarPercent(data.weekSoFarPercent ?? 0);
      setCheckinCount(data.checkinCount ?? 0);
      setSubmittedToday(data.submittedToday ?? false);
    } catch {
      if (isDev) {
        applyMockData();
      } else {
        setError("Could not load focus.");
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, [applyMockData]);

  useEffect(() => {
    if (useMockEnv) {
      applyMockData();
      setLoading(false);
      return;
    }
    fetchFocusWeek();
  }, [useMockEnv, applyMockData, fetchFocusWeek]);

  const completedCount = items.filter((i) => ratings[i.itemId] != null).length;
  const allSelected = items.length > 0 && completedCount === items.length;
  const alignmentRatio = getAlignmentRatio(items, ratings);
  const showAlignmentIndicator = completedCount >= 1;
  const intentSummary = getWeeklyIntentSummary(items);

  const DAILY_MAX = 100 / 7;
  const N = items.length || 1;
  const ITEM_DAILY_MAX = DAILY_MAX / N;
  const todayPercent = Object.values(localRatings).reduce((sum, value) => {
    let weight = 0;
    if (value === 2) weight = 1;
    if (value === 1) weight = 2 / 3;
    if (value === 0) weight = 1 / 3;
    return sum + weight * ITEM_DAILY_MAX;
  }, 0);
  const todayRounded = Math.round(todayPercent);
  const liveWeekDisplay = Math.min(100, weekSoFarPercent + todayRounded);

  const refetchWeekSoFar = useCallback(async () => {
    try {
      const res = await fetch("/api/focus/week");
      if (res.ok) {
        const data: FocusWeekResponse = await res.json();
        setWeekSoFarPercent(data.weekSoFarPercent ?? 0);
        setCheckinCount(data.checkinCount ?? 0);
        setSubmittedToday(data.submittedToday ?? false);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!submitSuccess) return;
    const t = setTimeout(() => {
      setView("review");
      setSubmitSuccess(false);
    }, 1200);
    return () => clearTimeout(t);
  }, [submitSuccess]);

  const handleSubmit = useCallback(async () => {
    if (!weekId || !allSelected) return;
    setError(null);
    setSubmitLoading(true);
    try {
      const dateIso = new Date().toISOString().slice(0, 10);
      const ratingsPayload: RatingPayload[] = items.map((item) => ({
        itemId: item.itemId,
        subjectCode: item.subjectCode,
        sourceType: item.sourceType,
        rating: ratings[item.itemId]!,
      }));

      const res = await fetch("/api/check-ins/weekly-focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId,
          dateIso,
          ratings: ratingsPayload,
          ...(optionalNote.trim() && { note: optionalNote.trim().slice(0, 200) }),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error === "validation_error" ? "Invalid data." : "Check-in failed.");
        return;
      }

      let reviewData: WeeklyFocusReview;
      const reviewRes = await fetch(`/api/focus/week/review?weekId=${encodeURIComponent(weekId)}`);
      if (!reviewRes.ok) {
        reviewData = {
          weekId,
          completionScore0to100: 0,
          strongestSubjectCode: null,
          weakestSubjectCode: null,
          consistencyTier: "mixed",
          earnedValidationEligible: false,
          earnedValidationReasons: [],
          suggestedNextWeek: [],
        };
      } else {
        reviewData = await reviewRes.json();
      }
      setReview(reviewData);
      setHadStrugglingThisSubmit(items.some((i) => ratings[i.itemId] === "struggling"));
      setSubmitSuccess(true);
      setLocalRatings({});
      setOptionalNote("");
      await refetchWeekSoFar();
    } catch {
      setError("Check-in failed.");
    } finally {
      setSubmitLoading(false);
    }
  }, [weekId, allSelected, items, ratings, refetchWeekSoFar]);

  const handleDiscuss = useCallback(
    async (item: WeeklyFocusItem) => {
      try {
        await fetch("/api/vella/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "focus_intervention",
            subjectCode: item.subjectCode,
            weekId: weekId ?? getDisplayWeekId(new Date()),
            rating: localRatings[item.itemId] ?? 0,
          }),
        });
      } finally {
        router.push("/session");
      }
    },
    [weekId, localRatings, router]
  );

  const displayWeekId = getDisplayWeekId(new Date());

  return (
    <div className="min-h-[100dvh] overflow-y-auto pb-24 flex flex-col">
      <header className="shrink-0 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-vella-text">This Week&apos;s Contract</h1>
            <p className="text-sm text-vella-muted mt-0.5">Week {displayWeekId}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <CompletionRing
              percent={liveWeekDisplay}
              label="Week so far"
              checkinCount={checkinCount}
              size="sm"
            />
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="p-1.5 rounded-full text-vella-muted hover:text-vella-text pressable"
              aria-label="About this week's contract"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </button>
          </div>
        </div>
        {intentSummary && (
          <p className="text-sm text-vella-muted font-light italic mt-2">
            {intentSummary}
          </p>
        )}
        {checkinCount >= 1 && (
          <p className="text-xs text-vella-muted mt-1">
            Based on {checkinCount} check-in{checkinCount === 1 ? "" : "s"}
          </p>
        )}
        {items.length > 0 && view === "form" && (
          <div className="mt-2 flex items-center justify-end gap-2">
            <span className="text-xs text-vella-muted">Alignment today</span>
            <div className="h-1.5 w-20 rounded-full bg-vella-border overflow-hidden">
              <div
                className="h-full rounded-full bg-vella-accent transition-all duration-200 ease-in-out"
                style={{ width: `${Math.round(alignmentRatio * 100)}%` }}
              />
            </div>
          </div>
        )}
        {mockActive && isDev && (
          <p className="text-[10px] text-vella-muted mt-1.5 font-medium uppercase tracking-wide">
            Development Preview
          </p>
        )}
      </header>

      <div className="flex flex-col gap-3 pb-4">
        {!mockActive && error && (
          <div className="rounded-vella-button border border-vella-border bg-vella-bg-card px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-sm text-vella-muted">{error}</span>
            {view === "form" && (
              <button
                type="button"
                onClick={fetchFocusWeek}
                className="text-sm font-medium text-vella-accent pressable"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {submitSuccess && hadStrugglingThisSubmit && (
          <p className="text-sm text-vella-muted">Support activated for this item.</p>
        )}
        {view === "review" && review ? (
          <ReviewPanel review={review} />
        ) : loading ? (
          <SkeletonCards />
        ) : items.length === 0 ? (
          <EmptyFocusState />
        ) : (
          <>
            <div className="space-y-1.5">
              {items.map((item) => (
                <WeeklyFocusCard
                  key={item.itemId}
                  item={item}
                  value={ratings[item.itemId] ?? null}
                  onChange={(rating) => {
                    setRatings((prev) => ({ ...prev, [item.itemId]: rating }));
                    setLocalRatings((prev) => ({
                      ...prev,
                      [item.itemId]: RATING_TO_NUMERIC[rating],
                    }));
                  }}
                  disabled={submitLoading}
                  localRatingValue={localRatings[item.itemId]}
                  submittedToday={submittedToday}
                  onDiscussWithVella={handleDiscuss}
                />
              ))}
            </div>
            {!submittedToday && Object.values(localRatings).some((v) => v === 0) && (
              <div className="rounded-vella-card border border-vella-border bg-vella-bg-card p-3">
                <textarea
                  placeholder="What made this hard today? (optional)"
                  maxLength={200}
                  value={optionalNote}
                  onChange={(e) => setOptionalNote(e.target.value)}
                  className="w-full rounded-vella-button border border-vella-border bg-vella-bg px-3 py-2 text-sm text-vella-text placeholder:text-vella-muted focus:outline-none focus:ring-2 focus:ring-vella-accent"
                  rows={2}
                />
              </div>
            )}
            {!submittedToday && (
            <button
              type="button"
              disabled={!allSelected || submitLoading}
              onClick={handleSubmit}
              className="sticky bottom-4 w-full rounded-vella-button bg-vella-accent py-2.5 text-sm font-medium text-white pressable disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 transition-all duration-200 ease-in-out"
            >
              {submitSuccess ? (
                "✔ Alignment Recorded"
              ) : submitLoading ? (
                <>
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Locking in…
                </>
              ) : (
                "Lock In Today's Alignment"
              )}
            </button>
            )}
          </>
        )}
      </div>

      <InfoSheet open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

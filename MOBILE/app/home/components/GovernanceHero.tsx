"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { HomeState } from "@/lib/home/deriveHomeState";
import type { GovernanceClientState } from "../utils/deriveHomeState";

// ---------------------------------------------------------------------------
// Design tokens (inline — matches spec exactly)
// ---------------------------------------------------------------------------

const T = {
  bg: "#FAFAF8",
  card: "#F4F3F0",
  text: "#1E1D1B",
  secondary: "#6B6A66",
  tertiary: "#9B9A96",
  caption: "#C8C7C2",
  divider: "#E2E1DD",
  slate: "#4A5266",
  slateLight: "#E8EAF0",
  slateMuted: "#8B91A8",
  forest: "#3D5E4E",
  forestLight: "#EBF2EE",
  terracotta: "#7A4F3E",
  terracottaLight: "#F5EDEA",
  brass: "#7A6340",
  brassLight: "#F4EFE5",
  shadow: "0 1px 4px rgba(0,0,0,0.06)",
  radius: 14,
  radiusBtn: 10,
  garamond: 'var(--font-garamond), "EB Garamond", "Georgia", serif',
  dmSans: 'var(--font-dm-sans), "DM Sans", sans-serif',
} as const;

// ---------------------------------------------------------------------------
// Offline governance cache
// ---------------------------------------------------------------------------

const CACHE_KEY = "vella_governance_state";
const CHECKIN_KEY = "vella_daily_checkin_date";

function getCached(): GovernanceClientState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as GovernanceClientState) : null;
  } catch {
    return null;
  }
}

function setCache(state: GovernanceClientState): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {}
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Time-of-day label
// ---------------------------------------------------------------------------

function getTimeLabel(): string {
  const h = new Date().getHours();
  if (h < 12) return "THIS MORNING";
  if (h < 17) return "THIS AFTERNOON";
  return "TONIGHT";
}

// ---------------------------------------------------------------------------
// Deterministic greeting fallbacks
// ---------------------------------------------------------------------------

function getFallbackGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "How is this morning landing?";
  if (h < 17) return "How has today been unfolding?";
  return "How are you holding up tonight?";
}

function trimToFirstSentence(text: string): string {
  const cleaned = text.trim();
  const match = cleaned.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : cleaned;
}

// ---------------------------------------------------------------------------
// Commitment row types
// ---------------------------------------------------------------------------

type CommitmentRow = {
  id: string;
  name: string;
  dotColor: string;
  nameColor: string;
  nameWeight: number;
  milestone: string | null;
};

function deriveCommitmentRows(
  homeState: HomeState | null,
  governance: GovernanceClientState | null,
): CommitmentRow[] {
  if (!homeState) return [];
  const commitments = homeState.commitments ?? [];
  if (commitments.length === 0) return [];

  const rows: CommitmentRow[] = commitments
    .filter((c) => c.status === "active" || c.status === "paused")
    .slice(0, 3)
    .map((c) => {
      const isQuiet = c.status === "paused";
      const isAtRisk =
        governance &&
        (governance.disciplineState === "off_track" ||
          governance.disciplineState === "slipping");
      const label = c.commitment_code
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

      return {
        id: c.id,
        name: label,
        dotColor: isQuiet ? T.caption : T.forest,
        nameColor: isQuiet ? T.tertiary : T.text,
        nameWeight: isQuiet ? 400 : 500,
        milestone: null,
      };
    });

  // Add streak milestone to the first active row if applicable
  const streakDays = homeState.streakDays ?? 0;
  const MILESTONES = [7, 14, 30, 60, 90, 180, 365];
  if (MILESTONES.includes(streakDays) && rows.length > 0) {
    const firstActive = rows.find((r) => r.nameWeight === 500);
    if (firstActive) {
      firstActive.milestone = `${streakDays} days`;
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  homeState: HomeState | null;
};

export function GovernanceHero({ homeState }: Props) {
  const router = useRouter();

  // Governance state
  const [governance, setGovernance] = useState<GovernanceClientState | null>(
    getCached,
  );

  // Greeting state
  const [greeting, setGreeting] = useState(getFallbackGreeting);
  const [subGreeting] = useState(
    "You haven\u2019t checked in yet today. Whenever you\u2019re ready.",
  );

  // Check-in state
  const [checkedIn, setCheckedIn] = useState(true);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  // Entry field
  const [entryValue, setEntryValue] = useState("");
  const [entryFocused, setEntryFocused] = useState(false);

  // Mount fade-in
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Check if already checked in today
    try {
      setCheckedIn(localStorage.getItem(CHECKIN_KEY) === todayKey());
    } catch {}

    // Fetch governance state
    fetch("/api/governance/state", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          const state = data as GovernanceClientState;
          setGovernance(state);
          setCache(state);
        }
      })
      .catch(() => {});

    // Background AI greeting (non-blocking)
    const controller = new AbortController();
    fetch("/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: controller.signal,
      body: JSON.stringify({
        message:
          "Give a single short greeting sentence for the user opening their home screen right now. One sentence only. No questions about what they need help with.",
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

  // Commitment rows
  const commitmentRows = useMemo(
    () => deriveCommitmentRows(homeState, governance),
    [homeState, governance],
  );

  // Check-in handler
  const handleMood = useCallback(
    (key: string) => {
      setSelectedMood(key);
      const moodMap: Record<string, number> = {
        lighter: 3,
        same: 2,
        heavier: 1,
      };
      const mood = moodMap[key] ?? 2;
      const today = todayKey();

      // Mark done locally
      try {
        localStorage.setItem(CHECKIN_KEY, today);
      } catch {}
      setCheckedIn(true);

      // Local-first write
      import("@/lib/local/checkinsLocal").then(({ saveCheckin }) => {
        import("@/lib/local/ensureUserId").then(({ ensureUserId }) => {
          const userId = ensureUserId();
          saveCheckin(userId, {
            id: crypto.randomUUID(),
            entry_date: today,
            mood,
            stress: 0,
            energy: 0,
            focus: 0,
            created_at: new Date().toISOString(),
          }).catch(() => {});
        });
      });

      // Sync to server (best-effort)
      fetch("/api/check-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ entry_date: today, mood }),
      }).catch(() => {});
    },
    [],
  );

  // Entry field handlers
  const handleJournal = useCallback(() => {
    const text = entryValue.trim();
    setEntryValue("");
    setEntryFocused(false);
    router.push(
      text
        ? (`/journal?prefill=${encodeURIComponent(text)}` as "/journal")
        : ("/journal" as "/journal"),
    );
  }, [entryValue, router]);

  const handleSendVella = useCallback(() => {
    const text = entryValue.trim();
    setEntryValue("");
    setEntryFocused(false);
    router.push(
      text
        ? (`/session?prefill=${encodeURIComponent(text)}` as "/session")
        : ("/session" as "/session"),
    );
  }, [entryValue, router]);

  // ── Pill data ──
  const pills = [
    { key: "lighter", label: "\u2191 Lighter", color: T.forest, lightBg: T.forestLight },
    { key: "same", label: "\u2014 Same", color: T.secondary, lightBg: "#EDEDEB" },
    { key: "heavier", label: "\u2193 Heavier", color: T.terracotta, lightBg: T.terracottaLight },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.5s ease-out",
      }}
    >
      {/* ══════════════════════════════════════════════════════════════════
          Section 1 — Vella's Greeting
      ══════════════════════════════════════════════════════════════════ */}
      <section
        style={{
          background: T.card,
          borderRadius: T.radius,
          padding: 22,
          boxShadow: T.shadow,
        }}
      >
        {/* Time label */}
        <p
          style={{
            fontFamily: T.dmSans,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: T.slateMuted,
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          {getTimeLabel()}
        </p>

        {/* Main greeting */}
        <p
          style={{
            fontFamily: T.garamond,
            fontSize: 26,
            fontWeight: 400,
            lineHeight: 1.35,
            color: T.text,
            margin: "10px 0 0",
          }}
        >
          {greeting}
        </p>

        {/* Sub-greeting */}
        {!checkedIn && (
          <p
            style={{
              fontFamily: T.garamond,
              fontSize: 15,
              fontWeight: 400,
              fontStyle: "italic",
              color: T.tertiary,
              margin: "10px 0 0",
            }}
          >
            {subGreeting}
          </p>
        )}

        {/* Mood pills */}
        {!checkedIn && !selectedMood && (
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 18,
            }}
          >
            {pills.map((pill) => (
              <button
                key={pill.key}
                onClick={() => handleMood(pill.key)}
                style={{
                  flex: 1,
                  fontFamily: T.dmSans,
                  fontSize: 13,
                  fontWeight: 500,
                  color: pill.color,
                  background: "#FFFFFF",
                  border: `1.5px solid ${T.divider}`,
                  borderRadius: 20,
                  padding: "8px 14px",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {pill.label}
              </button>
            ))}
          </div>
        )}

        {/* Selected state */}
        {selectedMood && (
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 18,
            }}
          >
            {pills.map((pill) => {
              const isSelected = pill.key === selectedMood;
              return (
                <button
                  key={pill.key}
                  disabled
                  style={{
                    flex: 1,
                    fontFamily: T.dmSans,
                    fontSize: 13,
                    fontWeight: 500,
                    color: pill.color,
                    background: isSelected ? pill.lightBg : "#FFFFFF",
                    border: `1.5px solid ${isSelected ? pill.color : T.divider}`,
                    borderRadius: 20,
                    padding: "8px 14px",
                    cursor: "default",
                    opacity: isSelected ? 1 : 0.4,
                    transition: "all 0.3s ease",
                  }}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Privacy caption */}
        {(!checkedIn || selectedMood) && (
          <p
            style={{
              fontFamily: T.dmSans,
              fontSize: 11,
              color: T.caption,
              textAlign: "center",
              margin: "10px 0 0",
            }}
          >
            Saved privately on your device
          </p>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          Section 2 — In Motion (Commitments)
      ══════════════════════════════════════════════════════════════════ */}
      {commitmentRows.length > 0 && (
        <section>
          <p
            style={{
              fontFamily: T.dmSans,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: T.slateMuted,
              margin: "0 0 12px",
              textTransform: "uppercase",
            }}
          >
            IN MOTION
          </p>

          {commitmentRows.map((row, idx) => (
            <div key={row.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 52,
                  gap: 12,
                }}
              >
                {/* Dot */}
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: row.dotColor,
                    flexShrink: 0,
                  }}
                />

                {/* Name */}
                <span
                  style={{
                    fontFamily: T.dmSans,
                    fontSize: 15,
                    fontWeight: row.nameWeight,
                    color: row.nameColor,
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.name}
                </span>

                {/* Milestone label */}
                {row.milestone && (
                  <span
                    style={{
                      fontFamily: T.dmSans,
                      fontSize: 12,
                      fontWeight: 600,
                      color: T.forest,
                      flexShrink: 0,
                    }}
                  >
                    {row.milestone}
                  </span>
                )}
              </div>

              {/* Divider (not after last row) */}
              {idx < commitmentRows.length - 1 && (
                <div
                  style={{
                    height: 1,
                    background: T.divider,
                  }}
                />
              )}
            </div>
          ))}

          <p
            style={{
              fontFamily: T.dmSans,
              fontSize: 11,
              color: T.caption,
              margin: "10px 0 0",
            }}
          >
            Tap any commitment to open it
          </p>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          Section 3 — Vella's Observation (Pattern Card)
      ══════════════════════════════════════════════════════════════════ */}
      <section
        style={{
          background: T.slateLight,
          borderRadius: T.radius,
          borderLeft: `3px solid ${T.slate}`,
          padding: "18px 20px",
        }}
      >
        <p
          style={{
            fontFamily: T.dmSans,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: T.slate,
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          VELLA NOTICED
        </p>

        <p
          style={{
            fontFamily: T.garamond,
            fontSize: 16,
            fontWeight: 400,
            fontStyle: "italic",
            lineHeight: 1.7,
            color: T.text,
            margin: "8px 0 0",
          }}
        >
          You&rsquo;ve returned to the same tension three times this week. That
          seems worth sitting with.
        </p>

        <button
          onClick={() => router.push("/session" as "/session")}
          style={{
            fontFamily: T.dmSans,
            fontSize: 12,
            color: T.slateMuted,
            textDecoration: "underline",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            marginTop: 10,
            display: "block",
          }}
        >
          Talk about it &rarr;
        </button>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          Section 4 — Entry Field
      ══════════════════════════════════════════════════════════════════ */}
      <section>
        <input
          type="text"
          value={entryValue}
          onChange={(e) => setEntryValue(e.target.value)}
          onFocus={() => setEntryFocused(true)}
          placeholder="What\u2019s on your mind?"
          style={{
            width: "100%",
            fontFamily: T.garamond,
            fontSize: 17,
            fontWeight: 400,
            fontStyle: "italic",
            color: T.text,
            background: T.card,
            border: `1.5px solid ${entryFocused ? T.slateMuted : T.divider}`,
            borderRadius: 12,
            padding: "15px 18px",
            outline: "none",
            transition: "border-color 0.2s ease",
            boxSizing: "border-box",
          }}
        />

        {/* Action links */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
          }}
        >
          <button
            onClick={handleJournal}
            style={{
              fontFamily: T.dmSans,
              fontSize: 12,
              color: T.tertiary,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            Open as journal entry
          </button>
          <span style={{ color: T.divider, fontSize: 10 }}>&middot;</span>
          <button
            onClick={handleSendVella}
            style={{
              fontFamily: T.dmSans,
              fontSize: 12,
              color: T.tertiary,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            Send to Vella
          </button>
        </div>
      </section>
    </div>
  );
}

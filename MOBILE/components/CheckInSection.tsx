"use client";

import { useCallback, useMemo } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type OptionKey = "lighter" | "same" | "heavier";

type Props = {
  checkedInToday: boolean;
  onCheckedInToday: () => void;
};

const CHECKIN_KEY = "vella_daily_checkin_date";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CheckInSection({ checkedInToday, onCheckedInToday }: Props) {
  const options = useMemo(
    () =>
      [
        { key: "lighter" as const, label: "Lighter", mood_score: 7, Icon: ArrowUp },
        { key: "same" as const, label: "Same", mood_score: 5, Icon: Minus },
        { key: "heavier" as const, label: "Heavier", mood_score: 3, Icon: ArrowDown },
      ],
    []
  );

  const handlePress = useCallback(
    (opt: (typeof options)[number]) => {
      if (checkedInToday) return;

      onCheckedInToday();

      const entry_date = todayKey();
      const mood = opt.mood_score;

      try {
        localStorage.setItem(CHECKIN_KEY, entry_date);
      } catch {}

      try {
        window.dispatchEvent(
          new CustomEvent("CHECKIN_COMPLETED", { detail: { mood_score: mood } })
        );
      } catch {}

      import("@/lib/local/checkinsLocal")
        .then(({ saveCheckin }) =>
          import("@/lib/local/ensureUserId").then(({ ensureUserId }) => {
            const userId = ensureUserId();
            return saveCheckin(userId, {
              id: crypto.randomUUID(),
              entry_date,
              mood,
              stress: 0,
              energy: 0,
              focus: 0,
              created_at: new Date().toISOString(),
            }).catch(() => {});
          })
        )
        .catch(() => {});

      fetch("/api/check-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ entry_date, mood }),
      }).catch(() => {});
    },
    [checkedInToday, onCheckedInToday]
  );

  return (
    <section className="mt-6">
      <p className="text-xs tracking-[0.12em] uppercase text-vella-muted">
        HOW ARE YOU LANDING?
      </p>

      <div className="mt-2">
        {checkedInToday ? (
          <p className="text-sm text-vella-muted">Noted.</p>
        ) : (
          <div className="flex gap-3">
            {options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => handlePress(opt)}
                className={cn(
                  "flex-1 rounded-2xl border border-vella-border bg-transparent pressable",
                  "h-[92px] px-3 py-3",
                  "flex flex-col items-center justify-center gap-2",
                  "text-vella-text hover:bg-black/5 transition"
                )}
              >
                <opt.Icon className="h-5 w-5 text-vella-muted-strong" aria-hidden />
                <span className="text-sm text-vella-muted-strong">{opt.label}</span>
              </button>
            ))}
          </div>
        )}

        {!checkedInToday && (
          <p className="mt-2 text-xs text-center text-vella-muted">
            Optional · stored only on device
          </p>
        )}
      </div>
    </section>
  );
}

export { CHECKIN_KEY };


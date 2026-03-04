"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { HomeState } from "@/lib/home/deriveHomeState";
import { computeCurrentWindow } from "@/lib/execution/triggerEngine";

type GovernanceClientState = {
  disciplineState?: string;
};

type CommitmentItem = {
  id: string;
  name: string;
  status: "active" | "quiet" | "drifting" | "paused";
};

const DRIFT_COLOR = "#7A4F3E";

export function CommitmentSection({ homeState }: { homeState: HomeState | null }) {
  const [names, setNames] = useState<{ id: string; name: string }[]>([]);
  const [governance, setGovernance] = useState<GovernanceClientState | null>(null);
  const [missedCounts, setMissedCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;

    fetch("/api/governance/state", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        if (data && typeof data === "object") setGovernance(data as GovernanceClientState);
      })
      .catch(() => {});

    import("@/lib/local/ensureUserId")
      .then(({ ensureUserId }) => {
        const uid = ensureUserId();
        return Promise.all([
          import("@/lib/local/db/commitmentsLocalRepo").then(({ getAllCommitmentsLocal }) =>
            getAllCommitmentsLocal(uid)
          ),
          import("@/lib/local/db/inboxRepo").then(({ listItems }) => listItems(uid)),
        ]);
      })
      .then(([rows, inbox]) => {
        if (!alive) return;
        const top = (rows ?? [])
          .map((r) => ({ id: r.id, name: r.description }))
          .filter((r) => r.name && r.name.trim().length > 0)
          .slice(0, 3);
        setNames(top);

        const counts: Record<string, number> = {};
        for (const item of inbox ?? []) {
          if (item.template_code !== "missed_window") continue;
          if (item.status !== "unread") continue;
          counts[item.commitment_id] = (counts[item.commitment_id] ?? 0) + 1;
        }
        setMissedCounts(counts);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  const items: CommitmentItem[] = useMemo(() => {
    if (names.length === 0) return [];

    const metaById = new Map<string, NonNullable<typeof homeState>["commitments"][number]>();
    for (const c of homeState?.commitments ?? []) {
      metaById.set(c.id, c as any);
    }

    const governanceDriftingBand =
      governance?.disciplineState === "off_track" || governance?.disciplineState === "slipping";

    const now = new Date();
    const tz = now.getTimezoneOffset();

    return names.slice(0, 3).map((n) => {
      const meta = metaById.get(n.id) as any | undefined;
      const serverStatus = meta?.status as string | undefined;

      if (serverStatus === "paused") {
        return { id: n.id, name: n.name, status: "paused" as const };
      }

      const missed = (missedCounts[n.id] ?? 0) >= 2;
      if (missed || (governanceDriftingBand && (missedCounts[n.id] ?? 0) >= 1)) {
        return { id: n.id, name: n.name, status: "drifting" as const };
      }

      const window = meta ? computeCurrentWindow(meta, now, tz) : null;
      const quiet = !window;
      return { id: n.id, name: n.name, status: quiet ? ("quiet" as const) : ("active" as const) };
    });
  }, [names, homeState, governance, missedCounts]);

  if (items.length === 0) return null;

  return (
    <section className="mt-6">
      <p className="text-xs tracking-[0.12em] uppercase text-vella-muted">IN MOTION</p>

      <div className="mt-2">
        {items.map((item, idx) => (
          <div key={item.id}>
            <div className="flex items-center gap-3 py-3">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background:
                    item.status === "drifting"
                      ? DRIFT_COLOR
                      : item.status === "quiet" || item.status === "paused"
                        ? "var(--vella-border)"
                        : "var(--vella-text)",
                }}
                aria-hidden
              />
              <span
                className={cn(
                  "flex-1 min-w-0 truncate text-[15px]",
                  item.status === "active" && "font-medium text-vella-text",
                  item.status === "quiet" && "font-normal text-vella-muted",
                  item.status === "paused" && "font-normal text-vella-muted",
                  item.status === "drifting" && "font-normal italic"
                )}
                style={item.status === "drifting" ? { color: DRIFT_COLOR } : undefined}
              >
                {item.name}
              </span>
            </div>

            {idx < items.length - 1 && (
              <div className="h-px w-full bg-vella-border/70" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}


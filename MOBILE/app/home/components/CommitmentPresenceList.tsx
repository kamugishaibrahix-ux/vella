"use client";

import { useMemo } from "react";
import type { HomeState } from "@/lib/home/deriveHomeState";
import type { GovernanceClientState } from "../utils/deriveHomeState";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function commitmentLabel(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

type StatusSeverity = "at_risk" | "active" | "paused";

function resolveStatusSeverity(
  commitmentStatus: string,
  governance: GovernanceClientState | null,
): StatusSeverity {
  if (governance && governance.disciplineState === "off_track") return "at_risk";
  if (governance && governance.disciplineState === "slipping") return "at_risk";
  if (commitmentStatus === "paused") return "paused";
  return "active";
}

const STATUS_COLORS: Record<StatusSeverity, string> = {
  at_risk: "#b08d57",
  active: "var(--vella-text)",
  paused: "var(--vella-muted)",
};

const MILESTONE_DAYS = [7, 14, 30, 60, 90, 180, 365];

function getMilestoneLabel(streakDays: number): string | null {
  const hit = MILESTONE_DAYS.find((d) => streakDays === d);
  if (!hit) return null;
  return `${hit}-day streak`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  homeState: HomeState | null;
  governance: GovernanceClientState | null;
};

export function CommitmentPresenceList({ homeState, governance }: Props) {
  const items = useMemo(() => {
    if (!homeState) return [];

    const commitments = homeState.commitments ?? [];
    if (commitments.length === 0) return [];

    const withSeverity = commitments
      .filter((c) => c.status === "active" || c.status === "paused")
      .map((c) => ({
        id: c.id,
        label: commitmentLabel(c.commitment_code),
        status: c.status,
        severity: resolveStatusSeverity(c.status, governance),
      }));

    const order: StatusSeverity[] = ["at_risk", "active", "paused"];
    withSeverity.sort(
      (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
    );

    return withSeverity.slice(0, 3);
  }, [homeState, governance]);

  const milestone = useMemo(() => {
    if (!homeState) return null;
    return getMilestoneLabel(homeState.streakDays);
  }, [homeState]);

  if (items.length === 0) return null;

  return (
    <section className="px-1">
      {items.map((item) => (
        <p
          key={item.id}
          className="text-sm leading-loose"
          style={{
            color: STATUS_COLORS[item.severity],
            fontWeight: item.severity === "at_risk" ? 500 : 400,
          }}
        >
          {item.label}
          {item.severity === "at_risk" && milestone && (
            <span
              className="ml-2 text-xs font-medium"
              style={{ color: "var(--vella-primary)" }}
            >
              {milestone}
            </span>
          )}
        </p>
      ))}
      {milestone && items.every((i) => i.severity !== "at_risk") && (
        <p
          className="text-xs mt-1"
          style={{ color: "var(--vella-primary)", fontWeight: 500 }}
        >
          {milestone}
        </p>
      )}
    </section>
  );
}

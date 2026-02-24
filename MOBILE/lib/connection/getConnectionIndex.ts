"use client";

import type { ConnectionDashboard } from "@/lib/connection/types";

export async function getConnectionDashboardClient(): Promise<ConnectionDashboard | null> {
  try {
    const res = await fetch("/api/connection-index", { method: "GET", cache: "no-store" });
    if (!res.ok) {
      throw new Error("connection_dashboard_fetch_failed");
    }
    const payload = (await res.json()) as { dashboard?: ConnectionDashboard };
    return payload.dashboard ?? null;
  } catch (error) {
    console.error("[connection] getConnectionDashboardClient error", error);
    return null;
  }
}

export async function getConnectionIndex(): Promise<number> {
  const dashboard = await getConnectionDashboardClient();
  return dashboard?.score ?? 0;
}


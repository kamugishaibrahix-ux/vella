"use client";

import { useEffect, useState } from "react";
import {
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
import { ActivitySquare } from "lucide-react";
import { BaseCard } from "./BaseCard";
import { fetchSystemHealth, type SystemHealth } from "@/lib/api/adminSystemHealthClient";

export function SystemHealthGauge() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const loadHealth = async () => {
      try {
        const data = await fetchSystemHealth();
        if (isActive) {
          setHealth(data);
        }
      } catch (error) {
        console.error("[SystemHealthGauge] Failed to load health", error);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadHealth();

    // Poll every 30 seconds
    const interval = setInterval(() => {
      void loadHealth();
    }, 30000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, []);

  // Calculate health score: 100 - (error_count_24h * 2) with min 0, max 100
  // If status is operational, add bonus
  const healthScore = health
    ? Math.max(0, Math.min(100, 100 - (health.error_count_24h * 2) + (health.status === "operational" ? 10 : 0)))
    : null;

  const healthData = healthScore !== null ? [{ name: "Health", value: healthScore, fill: "#22c55e" }] : [];

  const statusText = health?.status === "operational" ? "Operational" : health?.status === "degraded" ? "Degraded" : "Unknown";
  const statusColor = health?.status === "operational" ? "text-emerald-300" : health?.status === "degraded" ? "text-yellow-300" : "text-slate-400";

  return (
    <BaseCard
      title="System Health Index"
      subtitle="Realtime + AI orchestration composite score"
      icon={<ActivitySquare className="h-4 w-4 text-emerald-400" />}
      footer={health ? `Errors (24h): ${health.error_count_24h.toLocaleString()} · Status: ${statusText}` : "Loading health data..."}
    >
      <div className="flex h-full items-center justify-between gap-4">
        <div className="h-44 w-44">
          {isLoading || healthScore === null ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="70%"
                outerRadius="100%"
                data={healthData}
                startAngle={210}
                endAngle={-30}
              >
                <RadialBar
                  dataKey="value"
                  cornerRadius={999}
                  background
                  fill="#22c55e"
                />
              </RadialBarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 text-sm">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300/90">
            Overall
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-emerald-200">
            {healthScore !== null ? (
              <>
                {Math.round(healthScore)}
                <span className="text-lg align-top text-emerald-400">/100</span>
              </>
            ) : (
              "—"
            )}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Status: <span className={`font-medium ${statusColor}`}>{statusText}</span>
            {health?.db_load !== null && health?.db_load !== undefined && ` · DB Load: ${health.db_load}%`}
          </p>
        </div>
      </div>
    </BaseCard>
  );
}



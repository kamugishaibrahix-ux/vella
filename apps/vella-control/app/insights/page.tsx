"use client";

import { useEffect, useState } from "react";
import { Activity, AlertCircle, MessageSquare, Users, Coins, TrendingUp } from "lucide-react";
import { SectionHeader } from "@/components/admin/SectionHeader";
import { MetricCard } from "@/components/dashboard/MetricCard";

type InsightsOverview = {
  totals: {
    totalUsers: number;
    activeUsers24h: number;
    activeSubscriptions: number;
  };
  usage: {
    tokensUsed7d: number;
  };
  feedback: {
    feedbackLast30d: number;
  };
  admin: {
    adminActions7d: number;
};
  system: {
    errors7d: number;
  };
};

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default function InsightsPage() {
  const [insights, setInsights] = useState<InsightsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadInsights = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/insights/overview", { cache: "no-store" });
        const json = await response.json();

        if (!response.ok || !json.success) {
          throw new Error(json.error ?? "Failed to load insights");
        }

        setInsights(json.data);
      } catch (err) {
        console.error("[InsightsPage] Failed to load insights", err);
        setError(err instanceof Error ? err.message : "Failed to load insights");
      } finally {
        setIsLoading(false);
      }
    };

    void loadInsights();
  }, []);

  return (
    <div className="space-y-8 text-[var(--vc-text)]">
      <SectionHeader
        title="Insights & Analytics"
        description="Deep dive into platform metrics, usage patterns, and system health."
      />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading insights...</div>
      ) : insights ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              title="Total Users"
              value={formatCompactNumber(insights.totals.totalUsers)}
              icon={<Users className="h-5 w-5 text-slate-100" />}
            />
            <MetricCard
              title="Active Users (24h)"
              value={formatCompactNumber(insights.totals.activeUsers24h)}
              icon={<Activity className="h-5 w-5 text-slate-100" />}
            />
            <MetricCard
              title="Active Subscriptions"
              value={formatCompactNumber(insights.totals.activeSubscriptions)}
              icon={<TrendingUp className="h-5 w-5 text-slate-100" />}
            />
            <MetricCard
              title="Tokens Used (7d)"
              value={formatCompactNumber(insights.usage.tokensUsed7d)}
              icon={<Coins className="h-5 w-5 text-slate-100" />}
            />
        </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-6 backdrop-blur-sm">
        <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-slate-100" />
                <div>
                  <p className="text-xs uppercase opacity-70">Feedback (30d)</p>
                  <p className="mt-1 text-2xl font-bold">{formatCompactNumber(insights.feedback.feedbackLast30d)}</p>
        </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-slate-100" />
                <div>
                  <p className="text-xs uppercase opacity-70">Admin Actions (7d)</p>
                  <p className="mt-1 text-2xl font-bold">{formatCompactNumber(insights.admin.adminActions7d)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-6 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-slate-100" />
                <div>
                  <p className="text-xs uppercase opacity-70">System Errors (7d)</p>
                  <p className="mt-1 text-2xl font-bold">{formatCompactNumber(insights.system.errors7d)}</p>
                </div>
        </div>
          </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

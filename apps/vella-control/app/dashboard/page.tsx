"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  Coins,
  Flame,
  Sparkles,
  Users,
} from "lucide-react";
import { SectionHeader } from "@/components/admin/SectionHeader";
import { MetricCard as DashboardMetricCard } from "@/components/dashboard/MetricCard";
import { EngagementPanel } from "@/components/dashboard/EngagementPanel";
import { SystemAlert } from "@/components/dashboard/SystemAlert";
import type { AdminAnalytics } from "@/lib/api/adminAnalyticsClient";
import { fetchAdminAnalytics } from "@/lib/api/adminAnalyticsClient";
import { fetchSystemHealth, type SystemHealth } from "@/lib/api/adminSystemHealthClient";
import { fetchAlerts, type Alert } from "@/lib/api/adminAlertsClient";
import { fetchEngagement, type EngagementData } from "@/lib/api/adminEngagementClient";
import { fetchRevenue, type RevenueData } from "@/lib/api/adminRevenueClient";

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AdminAnalytics>({});
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [systemHealthError, setSystemHealthError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load all dashboard data
  useEffect(() => {
    let isActive = true;

    const loadDashboardData = async () => {
      setIsLoading(true);
      setAnalyticsError(null);
      setSystemHealthError(null);
      setAlertsError(null);
      setEngagementError(null);
      setRevenueError(null);

      try {
        const [analyticsData, healthData, alertsData, engagementData, revenueData] = await Promise.allSettled([
          fetchAdminAnalytics(),
          fetchSystemHealth(),
          fetchAlerts(),
          fetchEngagement(),
          fetchRevenue(),
        ]);

        if (!isActive) return;

        if (analyticsData.status === "fulfilled") {
          setAnalytics(analyticsData.value);
        } else {
          setAnalyticsError("Failed to load analytics.");
        }

        if (healthData.status === "fulfilled") {
          setSystemHealth(healthData.value);
        } else {
          setSystemHealthError("Failed to load system health.");
        }

        if (alertsData.status === "fulfilled") {
          setAlerts(alertsData.value);
        } else {
          setAlertsError("Failed to load alerts.");
        }

        if (engagementData.status === "fulfilled") {
          setEngagement(engagementData.value);
        } else {
          setEngagementError("Failed to load engagement data.");
        }

        if (revenueData.status === "fulfilled") {
          setRevenue(revenueData.value);
        } else {
          setRevenueError("Failed to load revenue data.");
        }
      } catch (error) {
        console.error("[DashboardPage] Error loading data", error);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadDashboardData();

    // Poll live metrics every 30 seconds
    const interval = setInterval(() => {
      if (isActive) {
        void loadDashboardData();
      }
    }, 30000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, []);

  const handleAlertAction = (alertId: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
  };

  const renderedMetrics = useMemo(() => {
    const totalUsers = analytics.total_users;
    const activeSubscriptions = analytics.active_subscriptions;
    const totalTokensUsed = analytics.total_tokens_used;
    const dailyActiveUsers = engagement?.summary.estimated_sessions ?? null;
    const mrr = revenue?.mrr ?? null;
    const activeSessions = engagement?.summary.estimated_sessions ?? null;

    return [
      {
        title: "Total Users",
        value: totalUsers ? totalUsers.toLocaleString() : "—",
        subtitle: analytics.total_users ? `${Math.round((activeSubscriptions ?? 0) / totalUsers * 100)}% have subscriptions` : "Loading...",
        icon: <Users className="h-5 w-5 text-slate-100" />,
      },
      {
        title: "Active Subscriptions",
        value: activeSubscriptions ? activeSubscriptions.toLocaleString() : "—",
        subtitle: totalUsers ? `${Math.round((activeSubscriptions ?? 0) / totalUsers * 100)}% of total accounts` : "Loading...",
        icon: <Sparkles className="h-5 w-5 text-slate-100" />,
      },
      {
        title: "Daily Active Users",
        value: dailyActiveUsers ? dailyActiveUsers.toLocaleString() : "—",
        subtitle: totalUsers ? `${Math.round((dailyActiveUsers ?? 0) / totalUsers * 100)}% DAU / MAU` : "Loading...",
        icon: <Flame className="h-5 w-5 text-slate-100" />,
      },
      {
        title: "Tokens Used",
        value: totalTokensUsed ? formatCompactNumber(totalTokensUsed) : "—",
        subtitle: "This month to-date",
        icon: <Brain className="h-5 w-5 text-slate-100" />,
      },
      {
        title: "Monthly Recurring Revenue",
        value: mrr !== null ? formatCurrency(mrr) : "—",
        subtitle: "All paid plans",
        icon: <Coins className="h-5 w-5 text-slate-100" />,
      },
      {
        title: "Active Sessions",
        value: activeSessions ? activeSessions.toLocaleString() : "—",
        subtitle: "Last 24 hours",
        icon: <Activity className="h-5 w-5 text-slate-100" />,
      },
    ];
  }, [analytics, engagement, revenue]);

  return (
    <div className="space-y-8 text-[var(--vc-text)]">
      <SectionHeader
        title="Dashboard Overview"
        description="Monitor Vella’s performance and system health."
      />

      {(analyticsError || systemHealthError || alertsError || engagementError || revenueError) && (
        <div className="space-y-1">
          {analyticsError && <p className="text-sm text-destructive">Analytics: {analyticsError}</p>}
          {systemHealthError && <p className="text-sm text-destructive">System Health: {systemHealthError}</p>}
          {alertsError && <p className="text-sm text-destructive">Alerts: {alertsError}</p>}
          {engagementError && <p className="text-sm text-destructive">Engagement: {engagementError}</p>}
          {revenueError && <p className="text-sm text-destructive">Revenue: {revenueError}</p>}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading dashboard data...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {renderedMetrics.map((metric) => (
              <DashboardMetricCard
                key={metric.title}
                title={metric.title}
                value={metric.value}
                sub={metric.subtitle}
                icon={metric.icon}
              />
            ))}
          </div>

          <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <EngagementPanel engagement={engagement} engagementError={engagementError} />
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-5 backdrop-blur-sm">
                  <p className="text-xs uppercase vc-label-soft">API status</p>
                  <p className="vc-metric text-lg font-semibold">
                    {systemHealth?.status === "operational" ? "Operational" : systemHealth?.status === "degraded" ? "Degraded" : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-5 backdrop-blur-sm">
                  <p className="text-xs uppercase vc-label-soft">DB load</p>
                  <p className="vc-metric text-lg font-semibold">
                    {systemHealth?.db_load !== null && systemHealth?.db_load !== undefined
                      ? `${systemHealth.db_load}%`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-5 backdrop-blur-sm">
                  <p className="text-xs uppercase vc-label-soft">Errors (24h)</p>
                  <p className="vc-metric text-lg font-semibold">
                    {systemHealth?.error_count_24h !== undefined
                      ? systemHealth.error_count_24h.toLocaleString()
                      : "—"}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {alertsError ? (
                  <div className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-4 backdrop-blur-sm">
                    <p className="text-sm text-destructive">Failed to load alerts</p>
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-4 backdrop-blur-sm">
                    <p className="text-sm text-muted-foreground">No active alerts</p>
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <SystemAlert
                      key={alert.id}
                      id={alert.id}
                      title={alert.title}
                      details={alert.details}
                      severity={alert.severity}
                      actionLabel="Acknowledge"
                      onAction={handleAlertAction}
                    />
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}



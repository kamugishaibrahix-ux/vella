"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Database, Gauge, Info } from "lucide-react";
import { MetricCard } from "@/components/admin/MetricCard";
import { SectionHeader } from "@/components/admin/SectionHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AdminLogEntry } from "@/lib/api/adminLogsClient";
import { fetchAdminLogs } from "@/lib/api/adminLogsClient";
import { fetchSystemHealth } from "@/lib/api/adminSystemHealthClient";
import { fetchAlertRules, saveAlertRules, type AlertRule } from "@/lib/api/alertRulesClient";

const levelChipClasses: Record<"info" | "warning" | "error", string> = {
  info: "bg-blue-500/15 text-blue-200",
  warning: "bg-yellow-500/20 text-yellow-100",
  error: "bg-red-500/15 text-red-200",
};

type LogLevel = "info" | "warning" | "error";

type DisplayLogEntry = {
  id: string;
  timeLabel: string;
  level: LogLevel;
  source: string;
  message: string;
  createdAt: string;
  raw: AdminLogEntry;
};

export default function LogsPage() {
  const [timeRange, setTimeRange] = useState<"15m" | "1h" | "24h" | "7d">("15m");
  const [levels, setLevels] = useState<string[]>(["error", "warning", "info"]);
  const [sourceFilter, setSourceFilter] = useState<"All" | "AI" | "Realtime" | "Stripe" | "System" | "Admin">("All");
  const [liveTail, setLiveTail] = useState(true);
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<DisplayLogEntry | null>(null);
  const [systemHealth, setSystemHealth] = useState<Awaited<ReturnType<typeof fetchSystemHealth>> | null>(null);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [isLoadingAlertRules, setIsLoadingAlertRules] = useState(true);
  const [savingAlertRules, setSavingAlertRules] = useState(false);

  useEffect(() => {
    let isActive = true;

    const loadLogs = async () => {
      try {
        setLogsError(null);
        const params = new URLSearchParams({ since: timeRange });
        const data = await fetchAdminLogs(params.toString());
        if (!isActive) return;
        setLogs(data);
      } catch (error) {
        console.error(error);
        if (isActive) {
          setLogsError("Failed to load logs.");
        }
      } finally {
        if (isActive) {
          setIsLoadingLogs(false);
        }
      }
    };

    const loadSystemHealth = async () => {
      try {
        const health = await fetchSystemHealth();
        if (isActive) {
          setSystemHealth(health);
        }
      } catch (error) {
        console.error("[LogsPage] Failed to load system health", error);
      }
    };

    const loadAlertRules = async () => {
      setIsLoadingAlertRules(true);
      try {
        const rules = await fetchAlertRules();
        if (isActive) {
          setAlertRules(rules);
        }
      } catch (error) {
        console.error("[LogsPage] Failed to load alert rules", error);
      } finally {
        if (isActive) {
          setIsLoadingAlertRules(false);
        }
      }
    };

    loadLogs();
    loadSystemHealth();
    loadAlertRules();

    // Poll every 30 seconds if live tail is enabled
    let interval: NodeJS.Timeout | null = null;
    if (liveTail) {
      interval = setInterval(() => {
        if (isActive) {
          void loadLogs();
          void loadSystemHealth();
        }
      }, 30000);
    }

    return () => {
      isActive = false;
      if (interval) clearInterval(interval);
    };
  }, [timeRange, liveTail]);

  const handleSaveAlertRules = async () => {
    setSavingAlertRules(true);
    try {
      await saveAlertRules(alertRules);
    } catch (error) {
      console.error("[LogsPage] Failed to save alert rules", error);
    } finally {
      setSavingAlertRules(false);
    }
  };

  const displayLogs = useMemo(() => logs.map(mapAdminLogToDisplay), [logs]);

  const filteredEntries = useMemo(() => {
    return displayLogs.filter((entry) => {
      const levelMatch = levels.includes(entry.level);
      const sourceMatch = sourceFilter === "All" || entry.source === sourceFilter;
      return levelMatch && sourceMatch;
    });
  }, [displayLogs, levels, sourceFilter]);

  const toggleLevel = (level: string) => {
    setLevels((prev) => (prev.includes(level) ? prev.filter((item) => item !== level) : [...prev, level]));
  };

  return (
    <div className="space-y-8 text-foreground">
      <SectionHeader title="Logs & Monitoring" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="AI inference latency"
          value={systemHealth ? `${systemHealth.info_count_24h > 0 ? "~" : ""}—` : "—"}
          subtitle="p95 last 5 min"
          icon={<Gauge className="h-5 w-5" />}
        />
        <MetricCard
          title="Database load"
          value={systemHealth?.db_load !== null && systemHealth?.db_load !== undefined ? `${systemHealth.db_load}%` : "—"}
          subtitle="Supabase pool"
          icon={<Database className="h-5 w-5" />}
        />
        <MetricCard
          title="Errors (24h)"
          value={systemHealth?.error_count_24h !== undefined ? systemHealth.error_count_24h.toLocaleString() : "—"}
          subtitle="System errors"
          icon={<Activity className="h-5 w-5" />}
        />
      </div>

      <div className="vc-card flex flex-wrap items-center gap-4 rounded-2xl border border-white/5 bg-surface/80 p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            { value: "15m", label: "Last 15 min" },
            { value: "1h", label: "1 hour" },
            { value: "24h", label: "24 hours" },
            { value: "7d", label: "7 days" },
          ].map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={timeRange === option.value ? "default" : "secondary"}
              onClick={() => setTimeRange(option.value as typeof timeRange)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {["error", "warning", "info", "debug"].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => toggleLevel(level)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition",
                levels.includes(level) ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground",
              )}
            >
              {level.toUpperCase()}
            </button>
          ))}
        </div>
        <select
          value={sourceFilter}
          onChange={(event) => setSourceFilter(event.target.value as typeof sourceFilter)}
          className="rounded-xl border border-white/10 bg-background/60 px-3 py-2 text-sm text-foreground"
        >
          {["All", "AI", "Realtime", "Stripe", "System", "Admin"].map((option) => (
            <option key={option} value={option}>
              Source: {option}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Live tail</span>
          <Switch checked={liveTail} onCheckedChange={setLiveTail} className="data-[state=checked]:bg-primary" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-white/5">
      <Table>
        <TableHeader>
                <TableRow className="border-white/5 text-muted-foreground">
                  <TableHead>Time</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-right">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
                {isLoadingLogs ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      Loading logs...
                    </TableCell>
                  </TableRow>
                ) : logsError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-destructive">
                      {logsError}
                    </TableCell>
                  </TableRow>
                ) : filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      No log entries match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => (
                    <TableRow key={entry.id} className="border-white/5 text-sm text-muted-foreground transition hover:bg-white/5">
                      <TableCell className="font-mono text-xs text-muted-foreground/80">{entry.timeLabel}</TableCell>
              <TableCell>
                        <span className={`${levelChipClasses[entry.level]} inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold`}>
                  {entry.level}
                </span>
              </TableCell>
                      <TableCell className="text-foreground">{entry.source}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.message}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedLog(entry)}>
                          <Info className="h-4 w-4" />
                        </Button>
                      </TableCell>
            </TableRow>
                  ))
                )}
        </TableBody>
      </Table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="vc-card rounded-2xl border border-white/5 bg-surface/80 p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">Alert rules</h3>
                <p className="text-sm text-muted-foreground">Manage thresholds for auto alerts.</p>
              </div>
              <Button size="sm" onClick={handleSaveAlertRules} disabled={savingAlertRules || isLoadingAlertRules}>
                {savingAlertRules ? "Saving..." : "Save"}
              </Button>
            </div>
            {isLoadingAlertRules ? (
              <div className="py-4 text-center text-sm text-muted-foreground">Loading alert rules...</div>
            ) : alertRules.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">No alert rules configured.</div>
            ) : (
              <div className="space-y-3">
                {alertRules.map((rule, index) => (
                  <div key={rule.id} className="rounded-xl border border-white/5 bg-background/40 p-3 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{rule.pattern}</p>
                        <p className="text-xs text-muted-foreground/80">
                          Severity: {rule.severity}
                        </p>
                      </div>
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(checked) =>
                          setAlertRules((prev) =>
                            prev.map((item, idx) => (idx === index ? { ...item, enabled: checked } : item)),
                          )
                        }
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="vc-card rounded-2xl border border-white/5 bg-surface/80 p-4 text-sm text-muted-foreground shadow-sm">
            <p>Live tail: {liveTail ? "Following" : "Paused"} · Time range {timeRange}</p>
            <p>
              Filters: {levels.length} levels · Source {sourceFilter}
            </p>
          </div>
        </div>
      </div>

      <Sheet open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <SheetContent className="w-full bg-background/95 text-foreground sm:max-w-md">
          {selectedLog ? (
            <div className="space-y-4">
              <SheetHeader className="text-left">
                <SheetTitle className="text-lg">
                  {selectedLog.level.toUpperCase()} · {selectedLog.source}
                </SheetTitle>
                <p className="text-sm text-muted-foreground">{selectedLog.timeLabel}</p>
              </SheetHeader>
              <div className="rounded-xl border border-white/5 bg-background/40 p-4 text-sm text-muted-foreground">
                {selectedLog.message}
              </div>
              <div className="rounded-xl border border-white/5 bg-background/40 p-4 text-sm text-muted-foreground">
                <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Metadata</p>
                <dl className="mt-2 space-y-1">
                  <div className="flex justify-between">
                    <dt>Log ID</dt>
                    <dd className="font-mono text-xs">{selectedLog.raw.id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Source table</dt>
                    <dd className="text-foreground">{selectedLog.raw.source}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Action</dt>
                    <dd className="text-foreground">{selectedLog.raw.action ?? "Not provided"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Recorded</dt>
                    <dd className="text-foreground">
                      {new Date(selectedLog.createdAt).toLocaleString()}
                    </dd>
                  </div>
                </dl>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  setSelectedLog(null);
                }}
              >
                Create alert rule
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function mapAdminLogToDisplay(entry: AdminLogEntry): DisplayLogEntry {
  const createdAt = entry.created_at ?? new Date().toISOString();
  return {
    id: entry.id,
    timeLabel: formatLogTime(createdAt),
    level: deriveLogLevel(entry.type),
    source: formatLogSource(entry),
    message: entry.message ?? entry.action ?? "No details provided",
    createdAt,
    raw: entry,
  };
}

function deriveLogLevel(type?: string | null): LogLevel {
  const normalized = type?.toLowerCase() ?? "";
  if (normalized.includes("error")) return "error";
  if (normalized.includes("warn")) return "warning";
  return "info";
}

function formatLogSource(entry: AdminLogEntry) {
  if (entry.source === "admin_activity_log") return "Admin";
  if (entry.source === "system_logs") return "System";
  return entry.source ?? "System";
}

function formatLogTime(dateString?: string | null) {
  if (!dateString) return "--:--:--";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}



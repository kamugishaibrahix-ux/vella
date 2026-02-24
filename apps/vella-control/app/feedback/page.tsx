"use client";

import { useState, useEffect } from "react";
import { fetchAdminFeedback } from "@/lib/api/adminFeedbackClient";
import type { AdminFeedbackRow } from "@/app/api/admin/feedback/list/route";
import {
  fetchUserReports,
  updateUserReport,
  type UserReport,
} from "@/lib/api/adminUserReportsClient";
import { fetchUserReports as fetchReportsFromAPI, updateUserReport as updateReportFromAPI } from "@/lib/api/userReportsClient";
import { flagUserForReview } from "@/lib/api/userReviewClient";
import { SectionHeader } from "@/components/admin/SectionHeader";
import { FeedbackCard } from "@/components/feedback/FeedbackCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type Alert = {
  id: string;
  title: string;
  severity: "info" | "warning" | "error";
  source: "AI" | "Realtime" | "Stripe" | "System";
  status: "open" | "acknowledged";
  muted: boolean;
};

const severityColor: Record<"info" | "warning" | "error", string> = {
  info: "bg-sky-500/15 text-sky-200",
  warning: "bg-amber-500/20 text-amber-100",
  error: "bg-rose-500/20 text-rose-100",
};

const reportStatuses = ["open", "in-progress", "resolved", "ignored"] as const;
const ratingRanges = ["7d", "30d", "90d"] as const;

function formatUserHandle(userId?: string) {
  if (!userId) return "unknown";
  return userId.length <= 8 ? userId : `${userId.slice(0, 4)}...${userId.slice(-2)}`;
}

export default function FeedbackPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportNotes, setReportNotes] = useState("");
  const [flagUser, setFlagUser] = useState(false);
  const [savingReportId, setSavingReportId] = useState<string | null>(null);
  const [flaggingUserId, setFlaggingUserId] = useState<string | null>(null);
  const [ratingsRange, setRatingsRange] = useState<(typeof ratingRanges)[number]>("30d");
  const [feedback, setFeedback] = useState<AdminFeedbackRow[]>([]);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(true);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  const selectedReport = reports.find((report) => report.id === selectedReportId);

  // Load current admin user ID
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user?.id) {
          setCurrentAdminId(data.user.id);
        }
      })
      .catch(() => {
        // Ignore errors
      });
  }, []);

  // Load feedback data
  useEffect(() => {
    let isActive = true;
    const loadFeedback = async () => {
      setIsLoadingFeedback(true);
      setFeedbackError(null);
      try {
        const data = await fetchAdminFeedback();
        if (isActive) {
          setFeedback(data);
        }
      } catch (error) {
        console.error("[FeedbackPage] Failed to load feedback", error);
        if (isActive) {
          setFeedbackError("Failed to load feedback. Please try again later.");
          setFeedback([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingFeedback(false);
        }
      }
    };
    void loadFeedback();
    return () => {
      isActive = false;
    };
  }, []);

  // Load user reports
  useEffect(() => {
    let isActive = true;
    const loadReports = async () => {
      setIsLoadingReports(true);
      setReportsError(null);
      try {
        const data = await fetchReportsFromAPI();
        if (isActive) {
          setReports(data);
        }
      } catch (error) {
        console.error("[FeedbackPage] Failed to load reports", error);
        if (isActive) {
          setReportsError("Failed to load user reports.");
          setReports([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingReports(false);
        }
      }
    };
    void loadReports();
    return () => {
      isActive = false;
    };
  }, []);

  // Load report details when selected
  useEffect(() => {
    if (selectedReport) {
      setReportNotes(selectedReport.notes ?? "");
      setFlagUser(false); // Will be loaded from user_metadata if needed
    }
  }, [selectedReport]);

  const acknowledgeAlert = (id: string) => {
    setAlerts((prev) =>
      prev.map((alert) => (alert.id === id ? { ...alert, status: "acknowledged" } : alert)),
    );
  };

  const toggleMute = (id: string) => {
    setAlerts((prev) =>
      prev.map((alert) => (alert.id === id ? { ...alert, muted: !alert.muted } : alert)),
    );
  };

  const updateReport = async (id: string, changes: { status?: string; assignee?: string | null; notes?: string | null }) => {
    setSavingReportId(id);
    try {
      const updated = await updateReportFromAPI({
        report_id: id,
        status: changes.status,
        assignee: changes.assignee,
        resolved_notes: changes.notes,
      });
      setReports((prev) => prev.map((report) => (report.id === id ? updated : report)));
      if (selectedReport?.id === id) {
        setReportNotes(updated.notes ?? "");
      }
    } catch (error) {
      console.error("[FeedbackPage] Failed to update report", error);
    } finally {
      setSavingReportId(null);
    }
  };

  const handleFlagUser = async (userId: string, flagged: boolean) => {
    setFlaggingUserId(userId);
    try {
      await flagUserForReview(userId, flagged);
      setFlagUser(flagged);
    } catch (error) {
      console.error("[FeedbackPage] Failed to flag user", error);
    } finally {
      setFlaggingUserId(null);
    }
  };

  const handleExportFeedback = () => {
    const headers = ["User ID", "Session ID", "Channel", "Rating", "Category", "Date"];
    const rows = feedback.map((item) => [
      item.user_id,
      item.session_id || "",
      item.channel,
      item.rating?.toString() || "",
      item.category || "",
      new Date(item.created_at).toISOString(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `feedback-export-${ratingsRange}-${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-10">
      <SectionHeader
        title="Feedback & Reports"
        description="Close the loop on alerts, moderate user reports, and tune sentiment."
      />

      <FeedbackCard title="System Alerts">
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-surface/80 p-4 text-sm text-foreground shadow-sm transition hover:border-primary/30"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{alert.title}</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-2 py-1 ${severityColor[alert.severity]}`}>
                      {alert.severity.toUpperCase()}
                    </span>
                    <span className="rounded-full bg-white/5 px-2 py-1 text-muted-foreground">{alert.source}</span>
                    <span className="rounded-full bg-white/5 px-2 py-1 text-muted-foreground">
                      {alert.status === "open" ? "Open" : "Acknowledged"}
                </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => acknowledgeAlert(alert.id)} disabled={alert.status === "acknowledged"}>
                    Acknowledge
                  </Button>
                  <div className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5">
                    <span className="text-xs text-muted-foreground">Mute 24h</span>
                    <Switch
                      checked={alert.muted}
                      onCheckedChange={() => toggleMute(alert.id)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </FeedbackCard>

      <div className="grid gap-6 lg:grid-cols-2">
      <FeedbackCard title="Ratings & Sentiment Summary">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {ratingRanges.map((range) => (
                <Button
                  key={range}
                  variant={ratingsRange === range ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setRatingsRange(range)}
                >
                  {range}
                </Button>
              ))}
              <Button variant="outline" size="sm" className="ml-auto" onClick={handleExportFeedback}>
                Export feedback CSV
              </Button>
            </div>
        <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Average rating ({ratingsRange})</p>
                {(() => {
                  const days = ratingsRange === "7d" ? 7 : ratingsRange === "30d" ? 30 : 90;
                  const cutoffDate = new Date();
                  cutoffDate.setDate(cutoffDate.getDate() - days);
                  const filtered = feedback.filter((item) => new Date(item.created_at) >= cutoffDate);
                  const ratings = filtered.filter((item) => item.rating !== null && item.rating !== undefined).map((item) => item.rating!);
                  const avgRating = ratings.length > 0 ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(1) : "0.0";
                  return (
                    <>
                      <p className="text-5xl font-semibold text-foreground">{avgRating}</p>
                      <p className="text-sm text-muted-foreground">{ratings.length} responses</p>
                    </>
                  );
                })()}
          </div>
          <div className="space-y-4">
                {(() => {
                  const days = ratingsRange === "7d" ? 7 : ratingsRange === "30d" ? 30 : 90;
                  const cutoffDate = new Date();
                  cutoffDate.setDate(cutoffDate.getDate() - days);
                  const filtered = feedback.filter((item) => new Date(item.created_at) >= cutoffDate);
                  const ratings = filtered.filter((item) => item.rating !== null && item.rating !== undefined).map((item) => item.rating!);
                  const total = ratings.length;
                  const positive = ratings.filter((r) => r >= 4).length;
                  const neutral = ratings.filter((r) => r === 3).length;
                  const negative = ratings.filter((r) => r <= 2).length;
                  const positivePct = total > 0 ? Math.round((positive / total) * 100) : 0;
                  const neutralPct = total > 0 ? Math.round((neutral / total) * 100) : 0;
                  const negativePct = total > 0 ? Math.round((negative / total) * 100) : 0;
                  return [
                    { label: "Positive", value: positivePct },
                    { label: "Neutral", value: neutralPct },
                    { label: "Negative", value: negativePct },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{item.label}</span>
                        <span>{item.value}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-primary/60" style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ));
                })()}
              </div>
          </div>
        </div>
      </FeedbackCard>

      <FeedbackCard title="Recent Feedback Summary">
        {isLoadingFeedback ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading feedback...</div>
        ) : feedbackError ? (
          <div className="py-6 text-center text-sm text-destructive">{feedbackError}</div>
        ) : feedback.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No feedback data available.</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/5 bg-surface/80 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5">
                  <TableHead>User ID</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(feedback ?? []).slice(0, 10).map((item) => (
                  <TableRow key={item.id} className="border-white/5 text-sm text-muted-foreground">
                    <TableCell className="font-mono text-xs">{item.user_id.slice(0, 8)}...</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.channel}</Badge>
                    </TableCell>
                    <TableCell>{item.rating ?? "—"}</TableCell>
                    <TableCell>{item.category ?? "—"}</TableCell>
                    <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </FeedbackCard>
      </div>

      <FeedbackCard title="User Reports">
        {isLoadingReports ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading reports...</div>
        ) : reportsError ? (
          <div className="py-6 text-center text-sm text-destructive">{reportsError}</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/5 bg-surface/80 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5">
                  <TableHead>Report ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      No user reports found.
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((report) => (
                    <TableRow key={report.id} className="border-white/5 text-sm text-muted-foreground transition hover:bg-white/5">
                      <TableCell className="font-mono text-xs text-muted-foreground">{report.id.slice(0, 8)}...</TableCell>
                      <TableCell>{formatUserHandle(report.user_id)}</TableCell>
                      <TableCell>{report.type}</TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-1 text-xs ${severityColor[report.severity as "info" | "warning" | "error"]}`}>
                          {report.severity}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-foreground" disabled={savingReportId === report.id}>
                              {savingReportId === report.id ? "Updating..." : report.status}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {reportStatuses.map((status) => (
                              <DropdownMenuItem
                                key={status}
                                disabled={savingReportId === report.id || report.status === status}
                                onClick={() => updateReport(report.id, { status })}
                              >
                                {status}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-foreground" disabled={savingReportId === report.id}>
                              {report.assignee ? formatUserHandle(report.assignee) : "Unassigned"}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              onClick={() => updateReport(report.id, { assignee: null })}
                              disabled={savingReportId === report.id}
                            >
                              Unassigned
                            </DropdownMenuItem>
                            {currentAdminId && (
                              <DropdownMenuItem
                                onClick={() => updateReport(report.id, { assignee: currentAdminId })}
                                disabled={savingReportId === report.id}
                              >
                                Assign to me
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedReportId(report.id)}>
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </FeedbackCard>

      <Sheet open={Boolean(selectedReport)} onOpenChange={(open) => !open && setSelectedReportId(null)}>
        <SheetContent className="w-full bg-background/95 text-foreground sm:max-w-md">
          {selectedReport ? (
            <div className="space-y-4">
              <SheetHeader className="text-left">
                <SheetTitle className="text-xl">{selectedReport.summary}</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  User: {formatUserHandle(selectedReport.user_id)} · {selectedReport.id}
                </p>
              </SheetHeader>

              <div className="rounded-2xl border border-white/5 bg-surface/70 p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Report details</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedReport.summary}. User describes intermittent failure when switching tones mid voice session.
                </p>
              </div>

              <label className="flex items-center justify-between text-sm text-muted-foreground">
                Flag user for review
                <Switch
                  checked={flagUser}
                  disabled={flaggingUserId === selectedReport?.user_id}
                  onCheckedChange={async (checked) => {
                    if (selectedReport) {
                      await handleFlagUser(selectedReport.user_id, checked);
                    }
                  }}
                  className="data-[state=checked]:bg-primary"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-muted-foreground">
                Internal notes
                <Textarea
                  value={reportNotes}
                  onChange={(event) => {
                    const newNotes = event.target.value;
                    setReportNotes(newNotes);
                    // Debounce update
                    if (selectedReport) {
                      clearTimeout((window as any).reportNotesTimeout);
                      (window as any).reportNotesTimeout = setTimeout(() => {
                        if (selectedReport) {
                          updateReport(selectedReport.id, { notes: newNotes || null });
                        }
                      }, 1000);
                    }
                  }}
                  className="min-h-[120px] bg-background/60"
                />
              </label>

              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setReportNotes("");
                    setFlagUser(false);
                  }}
                >
                  Clear
                </Button>
                <Button
                  onClick={async () => {
                    if (selectedReport) {
                      await updateReport(selectedReport.id, { status: "resolved" });
                      setSelectedReportId(null);
                      setReportNotes("");
                      setFlagUser(false);
                    }
                  }}
                  disabled={savingReportId === selectedReport?.id}
                >
                  {savingReportId === selectedReport?.id ? "Saving..." : "Mark resolved"}
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}


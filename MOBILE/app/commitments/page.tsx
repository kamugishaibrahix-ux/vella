"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommitmentDomainCode } from "@/lib/execution/types";

type CommitmentRow = {
  id: string;
  commitment_code: string;
  subject_code: string | null;
  target_type: string | null;
  target_value: number | null;
  status: string;
  start_at: string;
  created_at: string;
};

const DOMAIN_LABELS: Record<string, string> = {
  sleep: "Sleep",
  focus: "Focus",
  routine: "Routine",
  fitness: "Fitness",
  abstinence: "Abstinence",
  social: "Social",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  abandoned: "Archived",
};

export default function CommitmentsPage() {
  const router = useRouter();
  const [commitments, setCommitments] = useState<CommitmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCommitments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/commitments/list");
      if (!res.ok) {
        setError("Failed to load commitments");
        return;
      }
      const data = await res.json();
      setCommitments(data.commitments ?? []);
    } catch {
      setError("Failed to load commitments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCommitments();
  }, [fetchCommitments]);

  const activeCount = commitments.filter((c) => c.status === "active").length;
  const pausedCount = commitments.filter((c) => c.status === "paused").length;

  return (
    <div className="px-5 py-6 space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-1 -ml-1 pressable"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-vella-text" strokeWidth={1.8} />
          </button>
          <h1 className="text-xl font-semibold text-vella-text">Commitments</h1>
        </div>
        <Link
          href="/commitments/create"
          className="flex items-center gap-1.5 rounded-[var(--vella-radius-button)] bg-[var(--vella-primary)] px-3.5 py-2 text-sm font-medium text-white pressable"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          New
        </Link>
      </header>

      {/* Summary */}
      {!loading && commitments.length > 0 && (
        <p className="text-sm text-vella-muted">
          {activeCount} active{pausedCount > 0 ? `, ${pausedCount} paused` : ""}
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-vella-muted/30 border-t-[var(--vella-primary)] rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-[var(--vella-radius-button)] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && commitments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-12 h-12 rounded-full bg-[var(--vella-primary-muted)] flex items-center justify-center">
            <Target className="w-6 h-6 text-[var(--vella-primary)]" strokeWidth={1.8} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-base font-medium text-vella-text">No commitments yet</p>
            <p className="text-sm text-vella-muted">Create your first commitment to start tracking</p>
          </div>
          <Link
            href="/commitments/create"
            className="rounded-[var(--vella-radius-button)] bg-[var(--vella-primary)] px-5 py-2.5 text-sm font-medium text-white pressable"
          >
            Create commitment
          </Link>
        </div>
      )}

      {/* List */}
      {!loading && commitments.length > 0 && (
        <div className="space-y-3">
          {commitments.map((c) => (
            <Link
              key={c.id}
              href={`/commitments/${c.id}`}
              className={cn(
                "block rounded-[var(--vella-radius-card)] border bg-vella-bg-card p-4 pressable transition-colors duration-150",
                c.status === "paused"
                  ? "border-vella-border opacity-60"
                  : "border-vella-border"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-[var(--vella-primary)] bg-[var(--vella-primary-muted)] px-2 py-0.5 rounded-full">
                      {DOMAIN_LABELS[c.subject_code ?? "other"] ?? "Other"}
                    </span>
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      c.status === "active"
                        ? "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30"
                        : "text-vella-muted bg-neutral-100 dark:bg-neutral-800"
                    )}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-vella-text truncate">
                    {c.commitment_code.replace(/_/g, " ")}
                  </p>
                  {c.target_value != null && c.target_type && (
                    <p className="text-xs text-vella-muted mt-0.5">
                      Target: {c.target_value} ({c.target_type})
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

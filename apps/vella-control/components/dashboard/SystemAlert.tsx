"use client";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/StatusBadge";

type SystemAlertProps = {
  id: string;
  title: string;
  details: string;
  severity: "warning" | "error" | "info";
  actionLabel: string;
  onAction?: (id: string) => void;
};

export function SystemAlert({ id, title, details, severity, actionLabel, onAction }: SystemAlertProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-4 backdrop-blur-sm transition hover:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--vc-text)]">{title}</p>
          <p className="text-sm text-[var(--vc-subtle)]">{details}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={severity} />
          <Button variant="outline" size="sm" onClick={() => onAction?.(id)}>
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

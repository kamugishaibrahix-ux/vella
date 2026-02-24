"use client";

import { cn } from "@/lib/utils";

interface ConsentToggleCardProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  showBadge?: boolean;
  className?: string;
}

export function ConsentToggleCard({
  enabled,
  onChange,
  showBadge = false,
  className,
}: ConsentToggleCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-vella-border bg-vella-bg-card p-5 shadow-[var(--vella-elevation)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-[15px] text-vella-text">
            Let Vella learn from this entry?
          </h3>
          <p className="mt-1 text-sm text-vella-muted leading-snug">
            If enabled, structured signals (not raw text) may be used to improve
            insights and weekly focus.
          </p>
          {showBadge && enabled && (
            <span
              className="inline-block mt-3 text-xs font-medium text-vella-primary bg-[var(--vella-accent-soft)] px-2.5 py-1 rounded-lg"
              aria-hidden
            >
              Shared with Vella
            </span>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Allow Vella to learn from this entry"
          onClick={() => onChange(!enabled)}
          className={cn(
            "relative flex-shrink-0 w-11 h-[26px] rounded-full transition-colors duration-200",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-vella-primary focus-visible:ring-offset-2",
            enabled ? "bg-vella-primary" : "bg-vella-border"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 block w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200",
              enabled ? "left-[22px]" : "left-0.5"
            )}
          />
        </button>
      </div>
    </div>
  );
}

"use client";

import { cn } from "@/lib/utils";

interface ReflectionReinforcementToastProps {
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function ReflectionReinforcementToast({
  message,
  onDismiss,
  className,
}: ReflectionReinforcementToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-2xl border border-vella-border bg-vella-bg-card shadow-[var(--vella-elevation-hover)]",
        "py-4 px-5 text-[15px] font-medium text-vella-text",
        "flex items-center justify-between gap-3",
        className
      )}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-vella-muted hover:text-vella-text transition-colors p-1 -m-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-vella-primary"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

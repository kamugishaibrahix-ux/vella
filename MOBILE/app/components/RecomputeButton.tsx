"use client";

import { useState } from "react";
import { RefreshCw, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type RecomputeButtonProps = {
  onRecompute?: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
};

const TOOLTIP = "Recomputes your current behavioural state from recent activity. No backend call yet.";

export function RecomputeButton({
  onRecompute,
  disabled = false,
  className,
}: RecomputeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = async () => {
    if (disabled || loading) return;
    setLoading(true);
    try {
      await onRecompute?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("relative flex items-center rounded-full bg-[#E0E0E0] px-4 py-2.5", className)}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className={cn(
          "flex items-center gap-2 flex-1 min-w-0 text-left text-sm font-medium text-vella-text pressable",
          "disabled:opacity-50 disabled:pointer-events-none"
        )}
      >
        <RefreshCw
          className={cn("w-4 h-4 shrink-0", loading && "animate-spin")}
          aria-hidden
        />
        <span>Recompute state</span>
      </button>
      <button
        type="button"
        className="p-1.5 rounded-full text-vella-muted hover:text-vella-text focus:outline-none focus:ring-2 focus:ring-vella-accent shrink-0 -mr-1"
        aria-label="Info"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
      >
        <Info className="w-4 h-4" />
      </button>
      {showTooltip && (
        <div
          role="tooltip"
          className="absolute left-0 right-0 top-full mt-2 z-10 rounded-vella-button bg-vella-text text-white text-xs px-3 py-2 shadow-vella-hover max-w-[280px]"
        >
          {TOOLTIP}
        </div>
      )}
    </div>
  );
}

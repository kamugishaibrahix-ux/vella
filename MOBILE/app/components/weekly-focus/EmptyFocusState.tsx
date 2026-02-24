"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type EmptyFocusStateProps = {
  onRecompute?: () => void | Promise<void>;
  className?: string;
};

export function EmptyFocusState({ onRecompute, className }: EmptyFocusStateProps) {
  const [loading, setLoading] = useState(false);

  const handleRecompute = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onRecompute?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-8 px-4 text-center",
        className
      )}
    >
      <p className="text-sm text-vella-muted">No focus areas this week.</p>
      {onRecompute && (
        <button
          type="button"
          onClick={handleRecompute}
          disabled={loading}
          className="mt-4 rounded-vella-button bg-vella-accent px-4 py-2.5 text-sm font-medium text-white pressable disabled:opacity-50"
        >
          {loading ? "Recomputing…" : "Recompute Focus"}
        </button>
      )}
    </div>
  );
}

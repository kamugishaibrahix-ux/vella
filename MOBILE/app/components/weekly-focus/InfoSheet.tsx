"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

const INFO_COPY =
  "Each week Vella selects up to five areas that matter most. Your check-in shapes next week.";

type InfoSheetProps = {
  open: boolean;
  onClose: () => void;
  className?: string;
};

export function InfoSheet({ open, onClose, className }: InfoSheetProps) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-40 bg-black/40 animate-fadeIn"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="About this week's contract"
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 max-h-[70dvh] overflow-auto rounded-t-2xl bg-vella-bg-card shadow-vella-hover animate-sheet-rise",
          "max-w-[430px] mx-auto border border-vella-border border-b-0",
          className
        )}
      >
        <div className="sticky top-0 flex justify-end p-2 border-b border-vella-border bg-vella-bg-card">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-vella-muted hover:text-vella-text pressable"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-5 pb-8 pt-2">
          <p className="text-sm text-vella-text leading-relaxed">{INFO_COPY}</p>
        </div>
      </div>
    </>
  );
}

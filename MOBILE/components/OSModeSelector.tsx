"use client";

import { useState, useEffect } from "react";
import {
  OS_MODES,
  OS_MODE_LABELS,
  OS_MODE_DESCRIPTIONS,
  getStoredOSMode,
  setStoredOSMode,
  type OSMode,
} from "@/lib/system/osModes";

interface OSModeSelectorProps {
  /** Compact = segmented control for headers. Full = with descriptions for sheets. */
  variant?: "compact" | "full";
  onChange?: (mode: OSMode) => void;
}

export function OSModeSelector({ variant = "compact", onChange }: OSModeSelectorProps) {
  const [mode, setMode] = useState<OSMode>("soft");

  useEffect(() => {
    setMode(getStoredOSMode());
  }, []);

  const handleSelect = (next: OSMode) => {
    setMode(next);
    setStoredOSMode(next);
    onChange?.(next);
  };

  if (variant === "full") {
    return (
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-white/30 font-medium">
          Personal OS Mode
        </p>
        {OS_MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => handleSelect(m)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
              mode === m
                ? "bg-white/10 border border-white/20"
                : "bg-white/5 border border-transparent hover:bg-white/8"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                mode === m ? "bg-emerald-400" : "bg-white/20"
              }`}
            />
            <div className="text-left">
              <p className={`text-sm font-medium ${mode === m ? "text-white" : "text-white/70"}`}>
                {OS_MODE_LABELS[m]}
              </p>
              <p className="text-[11px] text-white/40">{OS_MODE_DESCRIPTIONS[m]}</p>
            </div>
          </button>
        ))}
      </div>
    );
  }

  // Compact: segmented control (light background context)
  return (
    <div className="inline-flex items-center gap-0.5 bg-gray-100 border border-gray-200 rounded-lg p-0.5">
      {OS_MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => handleSelect(m)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
            mode === m
              ? "bg-emerald-700 text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/60 active:bg-gray-200"
          }`}
        >
          {OS_MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

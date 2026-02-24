"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PillTabsProps = {
  tabs: { id: string; label: string; icon?: ReactNode }[];
  activeId: string;
  onChange?: (id: string) => void;
  className?: string;
};

export function PillTabs({
  tabs,
  activeId,
  onChange,
  className,
}: PillTabsProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1 text-sm",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange?.(tab.id)}
            aria-pressed={isActive}
            className={cn(
              "flex items-center gap-1 rounded-full px-3 py-1 font-medium transition",
              isActive
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {tab.icon ? (
              <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{tab.icon}</span>
            ) : null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}



"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SystemCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function SystemCard({
  title,
  description,
  children,
  className,
}: SystemCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/5 bg-card p-6 shadow-[0_0_20px_-4px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-all hover:shadow-[0_0_24px_-4px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      <div className="border-b border-white/5 pb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}



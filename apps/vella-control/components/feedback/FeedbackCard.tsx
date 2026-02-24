"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FeedbackCardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function FeedbackCard({ title, children, className }: FeedbackCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/5 bg-card p-6 shadow-[0_0_20px_-6px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-all hover:shadow-[0_0_24px_-6px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      {title ? (
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}



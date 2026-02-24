"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  title: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  className?: string;
};

export function MetricCard({ title, value, sub, icon, className }: MetricCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-6 backdrop-blur-sm transition hover:border-white/10",
        className,
      )}
    >
      {icon ? (
        <div className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
          {icon}
        </div>
      ) : null}
      <p className="text-sm opacity-70">{title}</p>
      <h2 className="mt-1 text-3xl font-bold">{value}</h2>
      {sub ? <p className="mt-2 text-xs opacity-60">{sub}</p> : null}
    </div>
  );
}



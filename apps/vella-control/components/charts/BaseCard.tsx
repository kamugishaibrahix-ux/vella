"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BaseCardProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

export function BaseCard({
  title,
  subtitle,
  icon,
  className,
  children,
  footer,
}: BaseCardProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/70",
        "shadow-[0_0_40px_rgba(56,189,248,0.18)] backdrop-blur-md",
        "transition-colors duration-300 hover:border-sky-400/80 hover:shadow-[0_0_50px_rgba(129,140,248,0.55)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-px rounded-[1.4rem] bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.18),transparent_60%),radial-gradient(circle_at_bottom,_rgba(45,212,191,0.08),transparent_55%)]" />

      <div className="relative z-10 flex flex-col gap-4 p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-50">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
            ) : null}
          </div>
          {icon ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900/80 ring-1 ring-slate-700/80">
              {icon}
            </div>
          ) : null}
        </header>

        {children ? <div className="h-56 sm:h-64">{children}</div> : null}

        {footer ? (
          <footer className="mt-1 text-xs text-slate-400">{footer}</footer>
        ) : null}
      </div>
    </section>
  );
}



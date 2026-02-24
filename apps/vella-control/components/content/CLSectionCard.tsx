"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CLSectionCardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function CLSectionCard({ title, children, className }: CLSectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-xl bg-card/40 border border-border/40 shadow-sm backdrop-blur-sm p-6",
        className,
      )}
    >
      {title ? (
        <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}


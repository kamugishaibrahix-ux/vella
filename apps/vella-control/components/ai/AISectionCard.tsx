"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AISectionCardProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

export function AISectionCard({ title, children, className }: AISectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}



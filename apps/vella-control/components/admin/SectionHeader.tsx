import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function SectionHeader({
  title,
  description,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-[color:var(--vc-border-subtle)] pb-4 md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      <div>
        <h1 className="vc-heading text-2xl font-semibold">{title}</h1>
        {description ? (
          <p className="vc-subtitle mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}



import { cn } from "@/lib/utils";

type SectionTitleProps = {
  children: React.ReactNode;
  className?: string;
};

export function SectionTitle({ children, className }: SectionTitleProps) {
  return (
    <h2
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.12em] text-vella-muted mb-4",
        className
      )}
    >
      {children}
    </h2>
  );
}

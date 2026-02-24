import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ReactNode;
  trendLabel?: string;
  trendDirection?: "up" | "down" | "neutral";
};

const trendStyles: Record<
  NonNullable<MetricCardProps["trendDirection"]>,
  string
> = {
  up: "vc-badge-positive",
  down: "vc-badge-negative",
  neutral: "bg-[color:var(--vc-surface-muted)] text-[color:var(--vc-text-secondary)]",
};

const trendIcons = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  neutral: ArrowRight,
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trendLabel,
  trendDirection = "neutral",
}: MetricCardProps) {
  const TrendIcon = trendIcons[trendDirection];

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <p className="vc-subtitle text-sm font-medium">{title}</p>
        {icon ? (
          <div className="text-[color:var(--vc-accent)] [&>svg]:h-5 [&>svg]:w-5">
            {icon}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="vc-metric text-3xl font-semibold">{value}</div>
        {subtitle ? (
          <p className="vc-subtitle text-sm">{subtitle}</p>
        ) : null}
        {trendLabel ? (
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              trendStyles[trendDirection],
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {trendLabel}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}



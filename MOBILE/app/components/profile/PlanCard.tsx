"use client";

import { Check, Crown, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_LIMITS, type PlanTier } from "@/lib/tiers/tierLimits";

interface PlanCardProps {
  planId: PlanTier;
  displayName: string;
  isCurrent: boolean;
  onSelect: (planId: PlanTier) => void;
}

const PLAN_ICONS: Record<PlanTier, React.ReactNode> = {
  free: <Sparkles className="w-5 h-5" />,
  pro: <Zap className="w-5 h-5" />,
  elite: <Crown className="w-5 h-5" />,
};

const PLAN_COLORS: Record<PlanTier, { bg: string; border: string; text: string; badge: string }> = {
  free: {
    bg: "bg-neutral-50",
    border: "border-neutral-200",
    text: "text-neutral-700",
    badge: "bg-neutral-100 text-neutral-600 border-neutral-200",
  },
  pro: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
  },
  elite: {
    bg: "bg-gradient-to-br from-violet-50 to-fuchsia-50",
    border: "border-violet-200",
    text: "text-violet-700",
    badge: "bg-violet-100 text-violet-700 border-violet-200",
  },
};

const FEATURE_LISTS: Record<PlanTier, string[]> = {
  free: [
    "10K text tokens / month",
    "Basic AI conversations",
    "Daily check-ins",
    "Core emotional insights",
  ],
  pro: [
    "300K text tokens / month",
    "60 voice minutes / month",
    "30 audio clips / month",
    "Full voice mode & realtime",
    "Journaling intelligence",
    "Behaviour patterns",
  ],
  elite: [
    "1M text tokens / month",
    "200 voice minutes / month",
    "120 audio clips / month",
    "Priority routing",
    "Advanced forecasting",
    "Quarterly deep-dives",
    "Custom modes",
  ],
};

export function PlanCard({ planId, displayName, isCurrent, onSelect }: PlanCardProps) {
  const limits = PLAN_LIMITS[planId];
  const colors = PLAN_COLORS[planId];
  const features = FEATURE_LISTS[planId];

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${num / 1000000}M`;
    if (num >= 1000) return `${num / 1000}k`;
    return num.toString();
  };

  return (
    <div
      className={cn(
        "relative rounded-2xl border-2 p-5 transition-all",
        colors.bg,
        colors.border,
        isCurrent ? "ring-2 ring-offset-2 ring-emerald-500 scale-[1.02]" : "hover:scale-[1.01]",
        planId === "elite" && "shadow-lg shadow-violet-100"
      )}
    >
      {/* Current Plan Badge */}
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500 text-white shadow-sm">
            <Check className="w-3 h-3" />
            Current Plan
          </span>
        </div>
      )}

      {/* Elite Badge */}
      {planId === "elite" && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-violet-600 text-white shadow-sm">
            <Crown className="w-3 h-3" />
            Best Value
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 mt-2">
        <div className={cn("p-2.5 rounded-xl bg-white/80", colors.text)}>
          {PLAN_ICONS[planId]}
        </div>
        <div>
          <h3 className={cn("font-semibold text-lg", colors.text)}>{displayName}</h3>
          <p className="text-sm text-neutral-500">
            {formatNumber(limits.monthlyTextTokens)} tokens/mo
          </p>
        </div>
      </div>

      {/* Token Allocation Bar */}
      <div className="mb-4">
        <div className="h-2 rounded-full bg-white/60 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full",
              planId === "free" && "bg-neutral-400",
              planId === "pro" && "bg-blue-500",
              planId === "elite" && "bg-gradient-to-r from-violet-500 to-fuchsia-500"
            )}
            style={{ width: planId === "free" ? "15%" : planId === "pro" ? "50%" : "100%" }}
          />
        </div>
      </div>

      {/* Features */}
      <ul className="space-y-2.5 mb-5">
        {features.map((feature, idx) => (
          <li key={idx} className="flex items-start gap-2 text-sm text-neutral-700">
            <Check className={cn("w-4 h-4 mt-0.5 shrink-0", colors.text)} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* Action Button */}
      <button
        onClick={() => onSelect(planId)}
        disabled={isCurrent}
        className={cn(
          "w-full py-2.5 px-4 rounded-xl font-medium transition-all",
          isCurrent
            ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
            : planId === "elite"
            ? "bg-violet-600 text-white hover:bg-violet-700 shadow-sm hover:shadow"
            : planId === "pro"
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-neutral-800 text-white hover:bg-neutral-900"
        )}
      >
        {isCurrent ? "Current Plan" : planId === "free" ? "Downgrade" : "Upgrade"}
      </button>
    </div>
  );
}

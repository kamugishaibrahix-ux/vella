"use client";

/**
 * Upgrade Page
 * Full-page plan selection using uiTierModel (single source of truth).
 * Fully wired to Stripe checkout and customer portal.
 */

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Check, X, Crown, Sparkles, Zap, AlertCircle, Loader2, CreditCard, Coins, RefreshCw } from "lucide-react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { TokenUsageDisplay } from "@/components/TokenUsageDisplay";
import {
  getAllTierDisplayModels,
  type TierDisplayModel,
} from "@/lib/plans/uiTierModel";
import { DEFAULT_ENTITLEMENTS_BY_TIER } from "@/lib/plans/defaultEntitlements";
import type { PlanTier } from "@/lib/plans/types";
import type { TopupSKU } from "@/lib/stripe/stripeProducts";
import { cn } from "@/lib/utils";

const TIER_ICONS: Record<PlanTier, React.ReactNode> = {
  free: <Sparkles className="w-6 h-6" />,
  pro: <Zap className="w-6 h-6" />,
  elite: <Crown className="w-6 h-6" />,
};

const TIER_COLORS: Record<PlanTier, { bg: string; border: string; text: string; accent: string }> = {
  free: {
    bg: "bg-neutral-50",
    border: "border-neutral-200",
    text: "text-neutral-700",
    accent: "bg-neutral-600",
  },
  pro: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    accent: "bg-blue-600",
  },
  elite: {
    bg: "bg-gradient-to-br from-violet-50 to-fuchsia-50",
    border: "border-violet-200",
    text: "text-violet-700",
    accent: "bg-violet-600",
  },
};

const TOPUP_OPTIONS: { sku: TopupSKU; tokens: number; label: string; priceLabel: string }[] = [
  { sku: "topup_50k", tokens: 50_000, label: "+50K tokens", priceLabel: "$4.99" },
  { sku: "topup_200k", tokens: 200_000, label: "+200K tokens", priceLabel: "$14.99" },
  { sku: "topup_1m", tokens: 1_000_000, label: "+1M tokens", priceLabel: "$49.99" },
];

/**
 * Simple toast notification.
 */
function showToast(message: string, type: "info" | "success" | "error" = "info") {
  const toast = document.createElement("div");
  toast.className = cn(
    "fixed bottom-24 left-1/2 -translate-x-1/2",
    "px-4 py-3 rounded-xl shadow-lg",
    "text-white text-sm font-medium",
    "z-[100] transition-all duration-300",
    "flex items-center gap-2",
    type === "success" ? "bg-emerald-600" : type === "error" ? "bg-red-600" : "bg-neutral-900"
  );
  toast.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
        d="${type === "success" ? "M5 13l4 4L19 7" : type === "error" ? "M6 18L18 6M6 6l12 12" : "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"}"/>
    </svg>
    ${message}
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("opacity-100", "translate-y-0");
    toast.classList.remove("opacity-0", "translate-y-2");
  });

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<UpgradePageFallback />}>
      <UpgradePageContent />
    </Suspense>
  );
}

function UpgradePageFallback() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-vella-bg">
      <div className="w-8 h-8 border-2 border-vella-border border-t-vella-accent rounded-full animate-spin" />
    </div>
  );
}

function UpgradePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { plan: currentPlan, isLoading, refresh: refreshEntitlements } = useEntitlements();
  const { refresh: refreshTokenBalance } = useTokenBalance();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<"plans" | "topups">("plans");

  /**
   * Refresh entitlements and token balance after Stripe return.
   */
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refreshEntitlements(), refreshTokenBalance()]);
    setIsRefreshing(false);
    router.replace("/profile/upgrade");
  }, [refreshEntitlements, refreshTokenBalance, router]);

  // Handle return from Stripe
  useEffect(() => {
    const upgrade = searchParams.get("upgrade");
    const topup = searchParams.get("topup");

    if (upgrade === "success" || topup === "success") {
      showToast("Purchase successful! Refreshing your account...", "success");
      handleRefresh();
    } else if (upgrade === "cancelled" || topup === "cancelled") {
      showToast("Purchase cancelled", "info");
    }
  }, [searchParams, handleRefresh]);

  // Get tier models from single source of truth
  const tierModels = getAllTierDisplayModels(DEFAULT_ENTITLEMENTS_BY_TIER, currentPlan);

  /**
   * Handle subscription tier selection.
   */
  const handleSelectTier = async (tier: PlanTier) => {
    if (tier === currentPlan) return;
    if (tier === "free") return;

    setIsProcessing(true);

    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create checkout session");
      }

      const { url } = await response.json();
      if (url) {
        window.location.assign(url);
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      showToast(message, "error");
      setIsProcessing(false);
    }
  };

  /**
   * Handle opening customer billing portal.
   */
  const handleManageBilling = async () => {
    setIsProcessing(true);

    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: "/profile/upgrade" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to open billing portal");
      }

      const { url } = await response.json();
      if (url) {
        window.location.assign(url);
      } else {
        throw new Error("No portal URL received");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      showToast(message, "error");
      setIsProcessing(false);
    }
  };

  /**
   * Handle token top-up selection.
   */
  const handleSelectTopup = async (sku: TopupSKU) => {
    setIsProcessing(true);

    try {
      const response = await fetch("/api/stripe/topups/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create top-up session");
      }

      const { url } = await response.json();
      if (url) {
        window.location.assign(url);
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      showToast(message, "error");
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center gap-3">
          <button
            onClick={() => router.push("/profile")}
            className="p-2 -ml-2 rounded-xl hover:bg-neutral-200 transition-colors"
            aria-label="Back to profile"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-neutral-900">Choose Your Plan</h1>
            <p className="text-sm text-neutral-500">
              Current: <span className="font-medium capitalize">{currentPlan || "Free"}</span>
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-50"
            aria-label="Refresh plan status"
            title="Refresh plan status"
          >
            <RefreshCw className={cn("w-5 h-5 text-neutral-600", isRefreshing && "animate-spin")} />
          </button>
        </header>

        {/* Usage Card */}
        <TokenUsageDisplay variant="full" />

        {/* Manage Billing Button (for paid users) */}
        {currentPlan !== "free" && (
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-900">Manage Your Subscription</h3>
                <p className="text-sm text-blue-700">
                  Update payment method, cancel, or view invoices
                </p>
              </div>
              <button
                onClick={handleManageBilling}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 font-medium rounded-xl border border-blue-200 hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                <CreditCard className="w-4 h-4" />
                Billing Portal
              </button>
            </div>
          </div>
        )}

        {/* Section Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSection("plans")}
            disabled={isProcessing}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
              activeSection === "plans"
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
            )}
          >
            <Crown className="w-4 h-4" />
            Subscription Plans
          </button>
          <button
            onClick={() => setActiveSection("topups")}
            disabled={isProcessing}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
              activeSection === "topups"
                ? "bg-emerald-600 text-white"
                : "bg-white text-neutral-600 hover:bg-emerald-50 border border-neutral-200"
            )}
          >
            <Coins className="w-4 h-4" />
            Token Top-ups
          </button>
        </div>

        {/* Plans Section */}
        {activeSection === "plans" && (
          <>
            {isLoading ? (
              <div className="grid gap-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-64 bg-white rounded-2xl border border-neutral-200 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {tierModels.map((tier) => (
                  <TierCard
                    key={tier.tier}
                    model={tier}
                    onSelect={() => handleSelectTier(tier.tier)}
                    isProcessing={isProcessing}
                  />
                ))}
              </div>
            )}

            {/* Feature Comparison */}
            {!isLoading && (
              <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">
                  What You Get
                </h2>
                <FeatureComparisonTable models={tierModels} />
              </section>
            )}
          </>
        )}

        {/* Top-ups Section */}
        {activeSection === "topups" && (
          <>
            {/* Top-up Cards */}
            <div className="grid gap-4">
              {TOPUP_OPTIONS.map((option) => (
                <TopupCard
                  key={option.sku}
                  option={option}
                  onSelect={() => handleSelectTopup(option.sku)}
                  isProcessing={isProcessing}
                />
              ))}
            </div>

            {/* Token Info */}
            <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-100 rounded-xl">
                  <Coins className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-emerald-900">How Token Top-ups Work</h4>
                  <ul className="mt-2 text-sm text-emerald-800 space-y-1.5">
                    <li>• Top-up tokens are added to your token balance immediately after purchase</li>
                    <li>• Top-up tokens never expire and carry over month to month</li>
                    <li>• Your monthly allowance is used first, then top-up tokens</li>
                    <li>• You can purchase top-ups on any plan (including Free)</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Footer Note */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Subscription Terms</p>
            <p className="mt-0.5">
              You can upgrade, downgrade, or cancel anytime. Changes take effect at your next billing cycle.
              Token top-ups never expire.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual tier card.
 */
function TierCard({
  model,
  onSelect,
  isProcessing,
}: {
  model: TierDisplayModel;
  onSelect: () => void;
  isProcessing: boolean;
}) {
  const colors = TIER_COLORS[model.tier];

  return (
    <div
      className={cn(
        "relative rounded-2xl border-2 p-5 transition-all bg-white",
        colors.border,
        model.ctaDisabled
          ? "ring-2 ring-emerald-500 ring-offset-2"
          : "hover:shadow-md"
      )}
    >
      {/* Badge */}
      {model.badge && (
        <div className="absolute -top-3 left-6">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold shadow-sm",
              model.ctaDisabled
                ? "bg-emerald-500 text-white"
                : model.tier === "elite"
                ? "bg-violet-600 text-white"
                : "bg-neutral-700 text-white"
            )}
          >
            {model.ctaDisabled && <Check className="w-3 h-3" />}
            {model.badge}
          </span>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={cn("p-3 rounded-xl shrink-0", colors.bg, colors.text)}>
          {TIER_ICONS[model.tier]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className={cn("font-bold text-lg", colors.text)}>{model.title}</h3>
            <div className="text-right">
              <span className="text-2xl font-bold text-neutral-900">{model.priceLabel}</span>
              <span className="text-neutral-500">{model.priceSubtext}</span>
            </div>
          </div>
          <p className="text-sm text-neutral-500 mb-3">{model.subtitle}</p>

          {/* Quick Features */}
          <div className="flex flex-wrap gap-2 mb-4">
            {model.bullets.slice(0, 3).map((bullet, idx) => (
              <span
                key={idx}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs",
                  bullet.included
                    ? "bg-neutral-100 text-neutral-700"
                    : "bg-neutral-50 text-neutral-400"
                )}
              >
                {bullet.included ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <X className="w-3 h-3" />
                )}
                {bullet.label}
              </span>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={onSelect}
            disabled={model.ctaDisabled || isProcessing}
            className={cn(
              "w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2",
              model.ctaDisabled
                ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                : model.tier === "elite"
                ? "bg-violet-600 text-white hover:bg-violet-700"
                : model.tier === "pro"
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-neutral-800 text-white hover:bg-neutral-900",
              isProcessing && "opacity-70 cursor-wait"
            )}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              model.ctaLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Token top-up card.
 */
function TopupCard({
  option,
  onSelect,
  isProcessing,
}: {
  option: (typeof TOPUP_OPTIONS)[number];
  onSelect: () => void;
  isProcessing: boolean;
}) {
  return (
    <div className="relative rounded-2xl border-2 border-emerald-200 bg-white p-5 transition-all hover:shadow-md">
      {/* Badge - Best Value */}
      {option.sku === "topup_200k" && (
        <div className="absolute -top-3 left-6">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold shadow-sm bg-emerald-600 text-white">
            Best Value
          </span>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="p-3 rounded-xl shrink-0 bg-emerald-100 text-emerald-700">
          <Coins className="w-6 h-6" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-lg text-emerald-900">{option.label}</h3>
            <div className="text-right">
              <span className="text-2xl font-bold text-emerald-900">{option.priceLabel}</span>
              <span className="text-emerald-600 text-sm"> one-time</span>
            </div>
          </div>
          <p className="text-sm text-emerald-700 mb-3">One-time purchase • Never expires</p>

          {/* Token Amount */}
          <div className="mb-4 p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
            <p className="text-sm text-emerald-800">
              <span className="font-semibold">{option.tokens.toLocaleString()}</span> tokens added to
              your balance immediately
            </p>
          </div>

          {/* Benefits */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">
              <Check className="w-3 h-3" />
              Never expires
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">
              <Check className="w-3 h-3" />
              Any plan
            </span>
          </div>

          {/* CTA */}
          <button
            onClick={onSelect}
            disabled={isProcessing}
            className={cn(
              "w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold transition-all flex items-center justify-center gap-2",
              "bg-emerald-600 text-white hover:bg-emerald-700",
              isProcessing && "opacity-70 cursor-wait"
            )}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Buy Now"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Feature comparison table.
 */
function FeatureComparisonTable({ models }: { models: TierDisplayModel[] }) {
  const matrix = models[0]?.featureMatrix || [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-100">
            <th className="py-2 text-left font-medium text-neutral-500">Feature</th>
            <th className="py-2 text-center font-medium text-neutral-600">Free</th>
            <th className="py-2 text-center font-medium text-blue-600">Pro</th>
            <th className="py-2 text-center font-medium text-violet-600">Elite</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-50">
          {matrix.map((row, idx) => (
            <tr
              key={idx}
              className={cn(
                row.isDeepMemory && "bg-violet-50/50"
              )}
            >
              <td
                className={cn(
                  "py-2.5 font-medium",
                  row.isDeepMemory ? "text-violet-700" : "text-neutral-700"
                )}
              >
                {row.feature}
                {row.isDeepMemory && (
                  <span className="ml-1.5 text-xs font-normal text-violet-600">
                    (Elite only)
                  </span>
                )}
              </td>
              <td className="py-2.5 text-center text-neutral-600">
                {renderCellValue(row.free)}
              </td>
              <td className="py-2.5 text-center text-neutral-600">
                {renderCellValue(row.pro)}
              </td>
              <td className="py-2.5 text-center font-medium text-violet-700">
                {renderCellValue(row.elite)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCellValue(value: string | boolean): React.ReactNode {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="w-4 h-4 mx-auto text-green-500" />
    ) : (
      <X className="w-4 h-4 mx-auto text-neutral-300" />
    );
  }
  return value;
}

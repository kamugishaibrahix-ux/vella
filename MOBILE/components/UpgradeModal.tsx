"use client";

/**
 * UpgradeModal Component
 * Displays 3-tier upgrade options using uiTierModel (single source of truth).
 * Fully wired to Stripe checkout and customer portal.
 */

import React, { useState } from "react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { getAllTierDisplayModels, type TierDisplayModel } from "@/lib/plans/uiTierModel";
import { DEFAULT_ENTITLEMENTS_BY_TIER } from "@/lib/plans/defaultEntitlements";
import type { PlanTier } from "@/lib/plans/types";
import type { TopupSKU } from "@/lib/stripe/stripeProducts";
import { Check, X, Crown, Sparkles, Zap, Loader2, CreditCard, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  highlightedFeature?: string;
}

const TIER_ICONS: Record<PlanTier, React.ReactNode> = {
  free: <Sparkles className="w-5 h-5" />,
  pro: <Zap className="w-5 h-5" />,
  elite: <Crown className="w-5 h-5" />,
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
function showToast(message: string, type: "success" | "error" = "success") {
  const toast = document.createElement("div");
  toast.className = cn(
    "fixed bottom-20 left-1/2 -translate-x-1/2",
    "px-4 py-3 rounded-xl shadow-lg",
    type === "success" ? "bg-emerald-600" : "bg-red-600",
    "text-white text-sm font-medium",
    "z-[100] animate-in fade-in slide-in-from-bottom-2",
    "flex items-center gap-2"
  );
  toast.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${
        type === "success"
          ? "M5 13l4 4L19 7"
          : "M6 18L18 6M6 6l12 12"
      }"/>
    </svg>
    ${message}
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("animate-out", "fade-out");
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

export function UpgradeModal({ isOpen, onClose, highlightedFeature }: UpgradeModalProps) {
  const { plan: currentPlan, isLoading } = useEntitlements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"plans" | "topups">("plans");

  if (!isOpen) return null;

  // Get tier display models from single source of truth
  const tierModels = getAllTierDisplayModels(DEFAULT_ENTITLEMENTS_BY_TIER, currentPlan);

  /**
   * Handle subscription tier selection.
   * Creates Stripe checkout session and redirects.
   */
  const handleSelectTier = async (tier: PlanTier) => {
    if (tier === currentPlan) return;
    if (tier === "free") return; // Cannot "upgrade" to free

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">
              {activeTab === "plans" ? "Upgrade Your Plan" : "Buy More Tokens"}
            </h2>
            {highlightedFeature && activeTab === "plans" && (
              <p className="text-sm text-neutral-600">
                Unlock <span className="font-semibold">{highlightedFeature}</span> and more
              </p>
            )}
            {activeTab === "topups" && (
              <p className="text-sm text-neutral-600">
                Purchase additional tokens that never expire
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("plans")}
            disabled={isProcessing}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
              activeTab === "plans"
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            )}
          >
            <Crown className="w-4 h-4" />
            Subscription Plans
          </button>
          <button
            onClick={() => setActiveTab("topups")}
            disabled={isProcessing}
            className={cn(
              "flex-1 py-2.5 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2",
              activeTab === "topups"
                ? "bg-emerald-600 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            )}
          >
            <Coins className="w-4 h-4" />
            Token Top-ups
          </button>
        </div>

        {/* Plans Tab */}
        {activeTab === "plans" && (
          <>
            {/* Manage Billing Button (for paid users) */}
            {currentPlan !== "free" && (
              <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
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
                    className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 font-medium rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <CreditCard className="w-4 h-4" />
                    Billing Portal
                  </button>
                </div>
              </div>
            )}

            {/* Tier Cards Grid */}
            <div className="grid gap-4 md:grid-cols-3">
              {tierModels.map((model) => (
                <TierCard
                  key={model.tier}
                  model={model}
                  onSelect={() => handleSelectTier(model.tier)}
                  isProcessing={isProcessing}
                />
              ))}
            </div>

            {/* Footer Note */}
            <p className="mt-6 text-center text-xs text-neutral-500">
              You can upgrade or cancel anytime. Token top-ups never expire.
            </p>
          </>
        )}

        {/* Top-ups Tab */}
        {activeTab === "topups" && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
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
            <div className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Coins className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-medium text-emerald-900">How Token Top-ups Work</h4>
                  <ul className="mt-2 text-sm text-emerald-800 space-y-1">
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
      </div>
    </div>
  );
}

/**
 * Individual tier card component.
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
        "relative rounded-2xl border-2 p-5 transition-all",
        colors.bg,
        colors.border,
        model.ctaDisabled
          ? "ring-2 ring-emerald-500 ring-offset-2"
          : "hover:scale-[1.02] hover:shadow-lg"
      )}
    >
      {/* Badge */}
      {model.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
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

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 mt-2">
        <div className={cn("p-2.5 rounded-xl bg-white/80", colors.text)}>{TIER_ICONS[model.tier]}</div>
        <div>
          <h3 className={cn("font-bold text-lg", colors.text)}>{model.title}</h3>
          <p className="text-xs text-neutral-500">{model.subtitle}</p>
        </div>
      </div>

      {/* Price */}
      <div className="mb-4">
        <span className="text-3xl font-bold text-neutral-900">{model.priceLabel}</span>
        <span className="text-neutral-500">{model.priceSubtext}</span>
      </div>

      {/* Token Bar */}
      <div className="mb-4">
        <div className="h-2 rounded-full bg-white/60 overflow-hidden">
          <div
            className={cn("h-full rounded-full", colors.accent)}
            style={{ width: model.tier === "free" ? "15%" : model.tier === "pro" ? "50%" : "100%" }}
          />
        </div>
        <p className="text-xs text-neutral-500 mt-1">{model.formattedTokens} tokens/month</p>
      </div>

      {/* Features */}
      <ul className="space-y-2 mb-5">
        {model.bullets.slice(0, 5).map((bullet, idx) => (
          <li
            key={idx}
            className={cn(
              "flex items-start gap-2 text-sm",
              bullet.included ? "text-neutral-700" : "text-neutral-400"
            )}
          >
            {bullet.included ? (
              <Check className={cn("w-4 h-4 mt-0.5 shrink-0", colors.text)} />
            ) : (
              <X className="w-4 h-4 mt-0.5 shrink-0 text-neutral-300" />
            )}
            <span className={bullet.highlight ? "font-medium" : ""}>{bullet.label}</span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <button
        onClick={onSelect}
        disabled={model.ctaDisabled || isProcessing}
        className={cn(
          "w-full py-2.5 px-4 rounded-xl font-semibold transition-all",
          model.ctaDisabled
            ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
            : model.tier === "elite"
            ? "bg-violet-600 text-white hover:bg-violet-700 shadow-sm hover:shadow"
            : model.tier === "pro"
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-neutral-800 text-white hover:bg-neutral-900",
          isProcessing && "opacity-70 cursor-wait"
        )}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </span>
        ) : (
          model.ctaLabel
        )}
      </button>
    </div>
  );
}

/**
 * Token top-up card component.
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
    <div className="relative rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-5 transition-all hover:scale-[1.02] hover:shadow-lg">
      {/* Badge - Best Value */}
      {option.sku === "topup_200k" && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold shadow-sm bg-emerald-600 text-white">
            Best Value
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 mt-2">
        <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
          <Coins className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-lg text-emerald-900">{option.label}</h3>
          <p className="text-xs text-emerald-600">One-time purchase</p>
        </div>
      </div>

      {/* Price */}
      <div className="mb-4">
        <span className="text-3xl font-bold text-emerald-900">{option.priceLabel}</span>
        <span className="text-emerald-600 text-sm"> one-time</span>
      </div>

      {/* Token Amount */}
      <div className="mb-4 p-3 bg-white rounded-xl border border-emerald-100">
        <p className="text-sm text-emerald-800">
          <span className="font-semibold">{option.tokens.toLocaleString()}</span> tokens added to
          your balance
        </p>
      </div>

      {/* Benefits */}
      <ul className="space-y-2 mb-5 text-sm text-emerald-700">
        <li className="flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          Never expires
        </li>
        <li className="flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          Used after monthly allowance
        </li>
        <li className="flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          Works on any plan
        </li>
      </ul>

      {/* CTA Button */}
      <button
        onClick={onSelect}
        disabled={isProcessing}
        className={cn(
          "w-full py-2.5 px-4 rounded-xl font-semibold transition-all",
          "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm hover:shadow",
          isProcessing && "opacity-70 cursor-wait"
        )}
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </span>
        ) : (
          "Buy Now"
        )}
      </button>
    </div>
  );
}

/**
 * TokenUsageDisplay Component
 * Shows remaining tokens and billing window info.
 * Fail-safe: shows zero on error but doesn't crash.
 */

import React from "react";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useEntitlements } from "@/hooks/useEntitlements";

interface TokenUsageDisplayProps {
  variant?: "compact" | "full";
}

export function TokenUsageDisplay({ variant = "full" }: TokenUsageDisplayProps) {
  const { remaining, allowance, used, windowEnd, isLoading: balanceLoading } = useTokenBalance();
  const { plan, entitlements, isLoading: entitlementsLoading } = useEntitlements();

  const isLoading = balanceLoading || entitlementsLoading;

  // Format numbers
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${Math.round(num / 1000)}k`;
    return num.toString();
  };

  // Format date
  const formatResetDate = (date: Date | null): string => {
    if (!date) return "Unknown";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  // Calculate percentage
  const percentage = allowance > 0 ? Math.round((used / allowance) * 100) : 0;

  // Compact variant for header
  if (variant === "compact") {
    return (
      <div 
        className="flex items-center gap-2 rounded-full px-3 py-1 text-sm"
        style={{ backgroundColor: "var(--vella-bg-card)", border: "1px solid var(--vella-border)" }}
      >
        <span className="font-medium capitalize" style={{ color: "var(--vella-text)" }}>{plan}</span>
        <span style={{ color: "var(--vella-muted)" }}>|</span>
        {isLoading ? (
          <span style={{ color: "var(--vella-muted)" }}>Loading...</span>
        ) : (
          <span style={{ color: "var(--vella-text)" }}>
            {formatNumber(remaining)} tokens
          </span>
        )}
      </div>
    );
  }

  // Full variant for settings/profile - uses theme tokens for consistency
  return (
    <div 
      className="rounded-[var(--vella-radius-card)] p-4"
      style={{ border: "1px solid var(--vella-border)", backgroundColor: "var(--vella-bg-card)" }}
    >
      <h3 
        className="mb-4 text-lg font-semibold"
        style={{ color: "var(--vella-text)" }}
      >
        Usage & Limits
      </h3>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div 
            className="h-6 w-6 animate-spin rounded-full border-b-2"
            style={{ borderColor: "var(--vella-primary)" }}
          />
        </div>
      ) : (
        <>
          {/* Plan Badge */}
          <div className="mb-4">
            <span 
              className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
              style={{ 
                backgroundColor: "var(--vella-primary-muted)", 
                color: "var(--vella-primary)" 
              }}
            >
              {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
            </span>
          </div>

          {/* Token Usage */}
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-sm">
              <span style={{ color: "var(--vella-muted)" }}>Monthly Tokens</span>
              <span 
                className="font-medium"
                style={{ color: "var(--vella-text)" }}
              >
                {formatNumber(remaining)} / {formatNumber(allowance)} remaining
              </span>
            </div>
            <div 
              className="h-2 w-full rounded-full"
              style={{ backgroundColor: "var(--vella-border)" }}
            >
              <div
                className="h-2 rounded-full transition-all"
                style={{ 
                  width: `${Math.min(percentage, 100)}%`,
                  backgroundColor: percentage > 90 
                    ? "#ef4444" // red-500
                    : percentage > 75 
                      ? "#eab308" // yellow-500
                      : "var(--vella-primary)"
                }}
              />
            </div>
            <p 
              className="mt-1 text-xs"
              style={{ color: "var(--vella-muted)" }}
            >
              Resets on {formatResetDate(windowEnd)}
            </p>
          </div>

          {/* Voice Minutes (if enabled) */}
          {entitlements.enableVoiceTTS && (
            <div 
              className="mb-3 flex items-center justify-between pt-3"
              style={{ borderTop: "1px solid var(--vella-border)" }}
            >
              <span className="text-sm" style={{ color: "var(--vella-muted)" }}>Voice Generation</span>
              <span 
                className="text-sm font-medium"
                style={{ color: "var(--vella-accent-muted)" }}
              >
                ✓ Included
              </span>
            </div>
          )}

          {/* Audio Clips (if enabled) */}
          {entitlements.enableAudioVella && (
            <div 
              className="mb-3 flex items-center justify-between pt-3"
              style={{ borderTop: "1px solid var(--vella-border)" }}
            >
              <span className="text-sm" style={{ color: "var(--vella-muted)" }}>Audio Generation</span>
              <span 
                className="text-sm font-medium"
                style={{ color: "var(--vella-accent-muted)" }}
              >
                ✓ Included
              </span>
            </div>
          )}

          {/* Realtime (if enabled) */}
          {entitlements.enableRealtime && (
            <div 
              className="mb-3 flex items-center justify-between pt-3"
              style={{ borderTop: "1px solid var(--vella-border)" }}
            >
              <span className="text-sm" style={{ color: "var(--vella-muted)" }}>Realtime Voice</span>
              <span 
                className="text-sm font-medium"
                style={{ color: "var(--vella-accent-muted)" }}
              >
                ✓ Included
              </span>
            </div>
          )}

          {/* Locked Features */}
          {!entitlements.enableRealtime && (
            <div 
              className="mb-3 flex items-center justify-between pt-3"
              style={{ borderTop: "1px solid var(--vella-border)" }}
            >
              <span className="text-sm" style={{ color: "var(--vella-muted)" }}>Realtime Voice</span>
              <span style={{ color: "var(--vella-muted)" }}>
                <svg className="inline h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * FeatureGate Component
 * Soft gating for premium features.
 * Shows upgrade CTA when feature is not available.
 * Backend remains authoritative (enforces actual restrictions).
 * 
 * CRITICAL: Uses Feature Registry for PURE abstraction - NO tier strings allowed.
 */

import React, { useState } from "react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { UpgradeModal } from "./UpgradeModal";
import type { FeatureKey } from "@/lib/tokens/costSchedule";
import { 
  isFeatureEnabled, 
  isFeatureUISoftGated, 
  getFeatureDisplayName 
} from "@/lib/plans/featureRegistry";

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * DEPRECATED: Local entitlement maps removed.
 * 
 * Use Feature Registry (lib/plans/featureRegistry.ts) for all feature definitions.
 * This provides single source of truth and prevents drift between frontend/backend.
 * 
 * Functions replaced by Feature Registry:
 * - requiresEntitlement(feature) → isFeatureEnabled(feature, entitlements)
 * - getEntitlementKey(feature) → getFeatureEntitlement(feature)
 * - FEATURE_NAMES[feature] → getFeatureDisplayName(feature)
 */

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { entitlements, isLoading } = useEntitlements();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Loading state - render children (don't block UI)
  if (isLoading) {
    return <>{children}</>;
  }

  // PURE abstraction: Check feature entitlement via Feature Registry
  // Uses entitlement flags ONLY - no tier strings
  const isEnabled = isFeatureEnabled(feature, entitlements);

  // Feature is enabled - render children
  if (isEnabled) {
    return <>{children}</>;
  }
  
  // Check if we should soft-gate (show upgrade UI) or hard-block
  const shouldSoftGate = isFeatureUISoftGated(feature);

  // Custom fallback provided
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default locked UI - uses theme tokens for consistency
  return (
    <>
      <div className="relative">
        {/* Blurred content preview */}
        <div className="pointer-events-none select-none blur-sm opacity-50">
          {children}
        </div>

        {/* Lock overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div 
            className="rounded-[var(--vella-radius-card)] p-6 text-center shadow-lg"
            style={{ 
              backgroundColor: "var(--vella-bg-card)",
            }}
          >
            <svg
              className="mx-auto mb-3 h-10 w-10"
              fill="none"
              stroke="var(--vella-muted)"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <h3 
              className="mb-2 text-lg font-semibold"
              style={{ color: "var(--vella-text)" }}
            >
              Pro Feature
            </h3>
          <p 
            className="mb-4 text-sm"
            style={{ color: "var(--vella-muted)" }}
          >
            {getFeatureDisplayName(feature)} is available with Pro and Elite plans.
          </p>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="rounded-[var(--vella-radius-button)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "var(--vella-primary)" }}
            >
              Upgrade to Access
            </button>
          </div>
        </div>
      </div>

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        highlightedFeature={getFeatureDisplayName(feature)}
      />
    </>
  );
}

/**
 * Hook to check if a feature is enabled (for conditional UI).
 * 
 * PURE abstraction: Uses Feature Registry, NOT tier strings.
 */
export function useFeatureEnabled(feature: FeatureKey): boolean {
  const { entitlements, isLoading } = useEntitlements();

  // Loading state: optimistic (don't block UI during load)
  if (isLoading) return true;

  // PURE abstraction: Check via Feature Registry
  // Uses entitlement flags ONLY - no tier strings
  return isFeatureEnabled(feature, entitlements);
}

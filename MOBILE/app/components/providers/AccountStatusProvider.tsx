"use client";

/**
 * AccountStatusProvider - Single Source of Truth for Account Status
 * 
 * Composes entitlements, token balance, and derived states into one
 * canonical source for account status across the application.
 * 
 * Benefits:
 * - No duplicated "<20% remaining" logic scattered in components
 * - Single source for isDepleted, isCritical, isUnlimited states
 * - Consistent planLabel and account status across app
 * - Automatic reconciliation after quota errors
 */

import React, { createContext, useContext, useMemo, useCallback } from "react";
import { useEntitlementsContext } from "./EntitlementsProvider";
import { useTokenBalanceContext } from "./TokenBalanceProvider";
import type { PlanEntitlement } from "@/lib/plans/types";
import { getCapabilities, type Capabilities } from "@/lib/plans/capabilities";

export interface AccountStatus {
  // Identity
  userId: string | null;
  plan: "free" | "pro" | "elite" | null;
  planLabel: string;

  // Entitlements (raw)
  entitlements: PlanEntitlement | null;

  // Capabilities (derived from entitlements)
  capabilities: Capabilities | null;

  // Token economy
  remaining: number;
  allowance: number;
  used: number;
  topups: number;

  // Derived states (canonical source of truth)
  /** True when tokens are exhausted and user is not unlimited */
  isDepleted: boolean;
  /** True when tokens are below 20% and not unlimited */
  isCritical: boolean;
  /** True when user has unlimited/very high token quota */
  isUnlimited: boolean;
  /** True when any account-level error exists */
  hasError: boolean;
  /** Error message if hasError is true */
  error: string | null;
  /** PHASE 7: Canonical send gate – false if depleted, errored, or loading */
  canSend: boolean;

  // Loading states
  isLoading: boolean;
  lastUpdated: number;

  // Actions
  /** Refresh all account data (entitlements + token balance) */
  refresh: () => void;
}

const AccountStatusContext = createContext<AccountStatus | null>(null);

const DEFAULT_PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  elite: "Elite",
};

export function AccountStatusProvider({ children }: { children: React.ReactNode }) {
  // Compose from existing providers
  const {
    plan,
    entitlements,
    isLoading: entitlementsLoading,
    error: entitlementsError,
    refresh: refreshEntitlements,
    lastUpdated: entitlementsUpdated,
  } = useEntitlementsContext();

  const {
    remaining,
    allowance,
    used,
    topups,
    isLoading: balanceLoading,
    error: balanceError,
    refresh: refreshBalance,
    lastUpdated: balanceUpdated,
  } = useTokenBalanceContext();

  // Derive capabilities from entitlements
  const capabilities = useMemo(() => {
    if (!entitlements) return null;
    return getCapabilities(entitlements);
  }, [entitlements]);

  // Canonical derived states
  const isUnlimited = useMemo(() => {
    if (!entitlements) return false;
    return entitlements.maxMonthlyTokens >= 1_000_000 || entitlements.maxMonthlyTokens === 0;
  }, [entitlements]);

  const isDepleted = useMemo(() => {
    if (!entitlements || balanceLoading) return false;
    if (isUnlimited) return false;
    return remaining <= 0;
  }, [entitlements, balanceLoading, isUnlimited, remaining]);

  const isCritical = useMemo(() => {
    if (!entitlements || balanceLoading) return false;
    if (isUnlimited) return false;
    const threshold = (entitlements.maxMonthlyTokens || 0) * 0.2;
    return remaining > 0 && remaining < threshold;
  }, [entitlements, balanceLoading, isUnlimited, remaining]);

  const hasError = useMemo(() => {
    return !!entitlementsError || !!balanceError;
  }, [entitlementsError, balanceError]);

  const error = useMemo(() => {
    return entitlementsError || balanceError || null;
  }, [entitlementsError, balanceError]);

  const isLoading = entitlementsLoading || balanceLoading;

  const lastUpdated = Math.max(entitlementsUpdated, balanceUpdated);

  // PHASE 7: Canonical send gate
  const canSend = useMemo(() => {
    if (isLoading) return false;
    if (hasError) return false;
    if (isDepleted) return false;
    if (!entitlements) return false;
    return remaining > 0 || isUnlimited;
  }, [isLoading, hasError, isDepleted, entitlements, remaining, isUnlimited]);

  const planLabel = useMemo(() => {
    if (!plan) return "Unknown";
    return DEFAULT_PLAN_LABELS[plan] || plan.charAt(0).toUpperCase() + plan.slice(1);
  }, [plan]);

  // Unified refresh action
  const refresh = useCallback(() => {
    refreshEntitlements();
    refreshBalance();
  }, [refreshEntitlements, refreshBalance]);

  const value: AccountStatus = {
    userId: null, // Not exposed by current providers, can be added later
    plan,
    planLabel,
    entitlements,
    capabilities,
    remaining,
    allowance: allowance || entitlements?.maxMonthlyTokens || 0,
    used,
    topups,
    isDepleted,
    isCritical,
    isUnlimited,
    hasError,
    error,
    canSend,
    isLoading,
    lastUpdated,
    refresh,
  };

  return (
    <AccountStatusContext.Provider value={value}>
      {children}
    </AccountStatusContext.Provider>
  );
}

/**
 * Hook to access canonical account status.
 * This should be the primary hook for account-related UI.
 */
export function useAccountStatus(): AccountStatus {
  const context = useContext(AccountStatusContext);

  if (!context) {
    throw new Error(
      "useAccountStatus() must be used within an AccountStatusProvider. " +
      "Ensure AccountStatusProvider wraps your component tree."
    );
  }

  return context;
}

/**
 * Hook that returns account status or null if provider not available.
 * Safe to use in components that might not be wrapped.
 */
export function useAccountStatusOptional(): AccountStatus | null {
  return useContext(AccountStatusContext);
}

/**
 * Check if AccountStatusProvider is available.
 */
export function useHasAccountStatusProvider(): boolean {
  return !!useContext(AccountStatusContext);
}

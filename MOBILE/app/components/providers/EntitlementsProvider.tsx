"use client";

/**
 * EntitlementsProvider
 * Provides cached entitlements data to avoid multiple fetches.
 * Wraps MobileShell or root layout to ensure single fetch per session.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { PlanTier, PlanEntitlement } from "@/lib/plans/types";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";
import { usePolling, detectStripeReturn, cleanupStripeParams } from "@/hooks/usePolling";

interface EntitlementsResponse {
  plan: PlanTier;
  entitlements: PlanEntitlement;
  source: string;
}

interface EntitlementsContextValue {
  plan: PlanTier;
  entitlements: PlanEntitlement;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  source: string;
  /**
   * PHASE C: Status for reactivity.
   * - "loading": Initial load or refresh in progress
   * - "ready": Data successfully loaded
   * - "error": API failed
   */
  status: "loading" | "ready" | "error";
  /** PHASE C: Last updated timestamp for debugging/reactivity */
  lastUpdated: number;
  /** PHASE C: True when polling is active (for Stripe return detection) */
  isPolling: boolean;
}

/**
 * Fail-safe defaults when API fails.
 * SINGLE SOURCE OF TRUTH: lib/plans/defaultEntitlements.ts
 * Never duplicate - always import from canonical defaults.
 * 
 * HARDENING: Use RESTRICTED entitlements on error, not free.
 * This prevents showing inflated limits when API fails.
 */
import { RESTRICTED_ENTITLEMENTS } from "@/lib/plans/defaultEntitlements";

const ERROR_DEFAULTS: EntitlementsResponse = {
  plan: "free", // Keep free label but with restricted entitlements
  entitlements: RESTRICTED_ENTITLEMENTS,
  source: "client_fallback_error",
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

// Cache TTL: 30 seconds
const CACHE_TTL_MS = 30000;

// Global module-level cache for cross-component deduplication
let globalCache: {
  data: EntitlementsResponse;
  timestamp: number;
  inFlightPromise: Promise<EntitlementsResponse> | null;
} = {
  data: ERROR_DEFAULTS,
  timestamp: 0,
  inFlightPromise: null,
};

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<EntitlementsResponse>(globalCache.data);
  const [hasError, setHasError] = useState(false); // HARDENING: Track error state
  const [isLoading, setIsLoading] = useState(!globalCache.timestamp);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);
  
  // PHASE C: Track last updated timestamp
  const [lastUpdated, setLastUpdated] = useState(globalCache.timestamp);

  // PHASE C: Status computation
  const status = isLoading 
    ? "loading" 
    : error 
      ? "error" 
      : "ready";

  const fetchEntitlements = useCallback(async (): Promise<EntitlementsResponse> => {
    // Check cache first
    const now = Date.now();
    if (now - globalCache.timestamp < CACHE_TTL_MS && globalCache.timestamp > 0) {
      return globalCache.data;
    }

    // Deduplicate in-flight requests
    if (globalCache.inFlightPromise) {
      return globalCache.inFlightPromise;
    }

    // Create new fetch promise
    const fetchPromise = (async (): Promise<EntitlementsResponse> => {
      try {
        const response = await fetch("/api/account/entitlements");

        if (!response.ok) {
          console.warn("[EntitlementsProvider] API error, using restricted defaults");
          setHasError(true);
          return ERROR_DEFAULTS;
        }

        const result: EntitlementsResponse = await response.json();
        setHasError(false);
        return result;
      } catch (err) {
        console.warn("[EntitlementsProvider] Exception, using restricted defaults:", err);
        setHasError(true);
        return ERROR_DEFAULTS;
      }
    })();

    // Store in-flight promise
    globalCache.inFlightPromise = fetchPromise;

    try {
      const result = await fetchPromise;
      // Update cache
      globalCache = {
        data: result,
        timestamp: Date.now(),
        inFlightPromise: null,
      };
      return result;
    } catch {
      globalCache.inFlightPromise = null;
      setHasError(true);
      return ERROR_DEFAULTS;
    }
  }, []);

  const refresh = useCallback(() => {
    // Clear cache and refetch
    globalCache.timestamp = 0;
    setIsLoading(true);
    fetchEntitlements()
      .then((result) => {
        if (isMounted.current) {
          setData(result);
          setError(null);
          setLastUpdated(Date.now());
        }
      })
      .catch(() => {
        if (isMounted.current) {
          setError("Failed to refresh entitlements");
        }
      })
      .finally(() => {
        if (isMounted.current) {
          setIsLoading(false);
        }
      });
  }, [fetchEntitlements]);

  // PHASE C: Polling with backoff
  const { start: startPolling, stop: stopPolling, triggerFastMode, isPolling } = usePolling({
    interval: 30000, // Default: 30s
    fastInterval: 10000, // Fast mode: 10s
    fastDuration: 120000, // Fast mode for 2 minutes
    onPoll: async () => {
      // Only poll if we're not already loading and cache is stale
      const now = Date.now();
      if (now - globalCache.timestamp >= 30000) {
        const result = await fetchEntitlements();
        if (isMounted.current) {
          setData(result);
          setLastUpdated(Date.now());
        }
      }
    },
  });

  // Stable refs to avoid re-render loops from polling function identity changes
  const startPollingRef = useRef(startPolling);
  startPollingRef.current = startPolling;
  const stopPollingRef = useRef(stopPolling);
  stopPollingRef.current = stopPolling;
  const triggerFastModeRef = useRef(triggerFastMode);
  triggerFastModeRef.current = triggerFastMode;

  useEffect(() => {
    isMounted.current = true;

    // Only fetch if cache is stale
    const now = Date.now();
    if (now - globalCache.timestamp >= CACHE_TTL_MS || globalCache.timestamp === 0) {
      fetchEntitlements()
        .then((result) => {
          if (isMounted.current) {
            setData(result);
            setLastUpdated(Date.now());
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (isMounted.current) {
            setData(ERROR_DEFAULTS);
            setHasError(true);
            setIsLoading(false);
          }
        });
    } else {
      // Use cached data
      setData(globalCache.data);
      setIsLoading(false);
    }

    // PHASE C: Start polling
    startPollingRef.current();

    // PHASE C: Detect Stripe return and trigger fast mode
    if (detectStripeReturn()) {
      triggerFastModeRef.current(120000); // 2 minutes fast polling
      cleanupStripeParams(); // Clean up URL params
    }

    return () => {
      isMounted.current = false;
      stopPollingRef.current();
    };
  }, [fetchEntitlements]);

  const value: EntitlementsContextValue = {
    plan: data.plan,
    entitlements: data.entitlements,
    isLoading,
    error,
    refresh,
    source: data.source,
    status,
    lastUpdated,
    isPolling,
  };

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

/**
 * Hook to access entitlements from context.
 * Falls back to direct fetch if provider is not present (for backwards compatibility).
 */
export function useEntitlementsContext(): EntitlementsContextValue {
  const context = useContext(EntitlementsContext);

  if (!context) {
    // Provider not found - return error defaults with restricted entitlements
    // HARDENING: Never return free entitlements when provider is missing
    return {
      ...ERROR_DEFAULTS,
      isLoading: false,
      error: "Entitlements provider not available",
      refresh: () => {},
      source: "no_provider",
      status: "error" as const,
      lastUpdated: 0,
      isPolling: false,
    };
  }

  return context;
}

/**
 * Check if EntitlementsProvider is available.
 */
export function useHasEntitlementsProvider(): boolean {
  return !!useContext(EntitlementsContext);
}

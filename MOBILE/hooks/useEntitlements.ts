/**
 * useEntitlements Hook
 * Fetches and caches user's plan entitlements.
 * Fail-safe: returns free defaults on error.
 * 
 * NOTE: Uses EntitlementsProvider context when available to avoid duplicate fetches.
 * Falls back to direct fetch if provider is not present.
 */

import { useState, useEffect, useCallback } from "react";
import {
  useEntitlementsContext,
  useHasEntitlementsProvider,
} from "@/app/components/providers";
import type { PlanTier, PlanEntitlement } from "@/lib/plans/types";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";

interface EntitlementsResponse {
  plan: PlanTier;
  entitlements: PlanEntitlement;
  source: string;
}

interface UseEntitlementsReturn {
  plan: PlanTier;
  entitlements: PlanEntitlement;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fail-safe defaults when API fails.
 * Ensures UI never crashes - backend enforces actual restrictions.
 * SINGLE SOURCE OF TRUTH: lib/plans/defaultEntitlements.ts
 * Never duplicate - always import from canonical defaults.
 */
const FREE_DEFAULTS: EntitlementsResponse = {
  plan: "free",
  entitlements: getDefaultEntitlements("free"),
  source: "client_fallback",
};

// Cache TTL: 30 seconds
const CACHE_TTL_MS = 30000;

// Module-level cache for fallback mode (when provider not available)
let moduleCache: {
  data: EntitlementsResponse;
  timestamp: number;
  inFlightPromise: Promise<EntitlementsResponse> | null;
} = {
  data: FREE_DEFAULTS,
  timestamp: 0,
  inFlightPromise: null,
};

/**
 * Direct fetch function with caching (fallback when provider not available)
 */
async function fetchEntitlementsDirect(): Promise<EntitlementsResponse> {
  // Check cache first
  const now = Date.now();
  if (now - moduleCache.timestamp < CACHE_TTL_MS && moduleCache.timestamp > 0) {
    return moduleCache.data;
  }

  // Deduplicate in-flight requests
  if (moduleCache.inFlightPromise) {
    return moduleCache.inFlightPromise;
  }

  // Create new fetch promise
  const fetchPromise = (async (): Promise<EntitlementsResponse> => {
    try {
      const response = await fetch("/api/account/entitlements");

      if (!response.ok) {
        console.warn("[useEntitlements] API error, using defaults");
        return FREE_DEFAULTS;
      }

      const result: EntitlementsResponse = await response.json();
      return result;
    } catch (err) {
      console.warn("[useEntitlements] Exception, using defaults:", err);
      return FREE_DEFAULTS;
    }
  })();

  // Store in-flight promise
  moduleCache.inFlightPromise = fetchPromise;

  try {
    const result = await fetchPromise;
    // Update cache
    moduleCache = {
      data: result,
      timestamp: Date.now(),
      inFlightPromise: null,
    };
    return result;
  } catch {
    moduleCache.inFlightPromise = null;
    return FREE_DEFAULTS;
  }
}

export function useEntitlements(): UseEntitlementsReturn {
  const hasProvider = useHasEntitlementsProvider();
  const contextData = useEntitlementsContext();

  // Use context if available
  if (hasProvider && contextData.source !== "no_provider") {
    return {
      plan: contextData.plan,
      entitlements: contextData.entitlements,
      isLoading: contextData.isLoading,
      error: contextData.error,
      refresh: contextData.refresh,
    };
  }

  // Fallback: direct fetch with module-level caching
  const [data, setData] = useState<EntitlementsResponse>(moduleCache.data);
  const [isLoading, setIsLoading] = useState(!moduleCache.timestamp);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    moduleCache.timestamp = 0;
    setIsLoading(true);
    fetchEntitlementsDirect()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch(() => {
        setData(FREE_DEFAULTS);
        setError("Failed to refresh entitlements");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    const now = Date.now();
    if (now - moduleCache.timestamp >= CACHE_TTL_MS || moduleCache.timestamp === 0) {
      fetchEntitlementsDirect()
        .then((result) => {
          setData(result);
          setIsLoading(false);
        })
        .catch(() => {
          setData(FREE_DEFAULTS);
          setIsLoading(false);
        });
    } else {
      setData(moduleCache.data);
      setIsLoading(false);
    }
  }, []);

  return {
    plan: data.plan,
    entitlements: data.entitlements,
    isLoading,
    error,
    refresh,
  };
}

"use client";

/**
 * CreditBalanceProvider (formerly TokenBalanceProvider)
 * Provides cached credit balance data to avoid multiple fetches.
 * Wraps MobileShell or root layout to ensure single fetch per session.
 * 
 * NOTE: Backend still uses token terminology internally, but UI displays credits.
 * 1 credit = 1 token for user-facing purposes.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

interface TokenBalanceWindow {
  start: string;
  end: string;
  source: string;
}

interface TokenBalanceResponse {
  remaining: number;
  allowance: number;
  topups: number;
  used: number;
  window: TokenBalanceWindow;
  source: string;
}

interface TokenBalanceContextValue {
  remaining: number;
  allowance: number;
  used: number;
  topups: number;
  windowEnd: Date | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  /**
   * PHASE B: Status for UX hardening.
   * - "loading": Initial load or refresh in progress
   * - "ready": Data successfully loaded
   * - "error": API failed, don't show optimistic values
   */
  status: "loading" | "ready" | "error";
  /** PHASE B: Last updated timestamp for debugging/reactivity */
  lastUpdated: number;
}

/**
 * Fail-safe defaults when API fails.
 * Do NOT show optimistic remaining credits on API failure.
 * Instead, expose error state so UI can show "Unable to load credits" + retry.
 */
const FALLBACK_BALANCE: TokenBalanceResponse = {
  remaining: 0,
  allowance: 0,
  topups: 0,
  used: 0,
  window: {
    start: new Date().toISOString(),
    end: new Date().toISOString(),
    source: "client_fallback",
  },
  source: "client_fallback",
};

const TokenBalanceContext = createContext<TokenBalanceContextValue | null>(null);

// Cache TTL: 30 seconds
const CACHE_TTL_MS = 30000;

// Global module-level cache for cross-component deduplication
let globalCache: {
  data: TokenBalanceResponse;
  timestamp: number;
  inFlightPromise: Promise<TokenBalanceResponse> | null;
  error: string | null;
} = {
  data: FALLBACK_BALANCE,
  timestamp: 0,
  inFlightPromise: null,
  error: null,
};

export function CreditBalanceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<TokenBalanceResponse>(globalCache.data);
  const [isLoading, setIsLoading] = useState(!globalCache.timestamp);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchBalance = useCallback(async (): Promise<TokenBalanceResponse> => {
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
    const fetchPromise = (async (): Promise<TokenBalanceResponse> => {
      try {
        const response = await fetch("/api/account/token-balance");

        if (!response.ok) {
          console.warn("[CreditBalanceProvider] API error");
          // PHASE B: Return fallback with source marker to indicate error
          return {
            ...FALLBACK_BALANCE,
            source: "api_error",
          };
        }

        const result: TokenBalanceResponse = await response.json();
        return result;
      } catch (err) {
        console.warn("[CreditBalanceProvider] Exception:", err);
        // PHASE B: Return fallback with source marker to indicate error
        return {
          ...FALLBACK_BALANCE,
          source: "exception",
        };
      }
    })();

    // Store in-flight promise
    globalCache.inFlightPromise = fetchPromise;

    try {
      const result = await fetchPromise;
      // Update cache
      globalCache = {
        ...globalCache,
        data: result,
        timestamp: Date.now(),
        inFlightPromise: null,
        error: result.source === "api_error" || result.source === "exception" ? "Failed to load balance" : null,
      };
      return result;
    } catch {
      globalCache.inFlightPromise = null;
      globalCache.error = "Failed to load balance";
      return FALLBACK_BALANCE;
    }
  }, []);

  const refresh = useCallback(() => {
    // Clear cache and refetch
    globalCache.timestamp = 0;
    setIsLoading(true);
    fetchBalance()
      .then((result) => {
        if (isMounted.current) {
          setData(result);
          setError(null);
        }
      })
      .catch(() => {
        if (isMounted.current) {
          setError("Failed to refresh balance");
        }
      })
      .finally(() => {
        if (isMounted.current) {
          setIsLoading(false);
        }
      });
  }, [fetchBalance]);

  // PHASE B: Track status and lastUpdated
  const status = isLoading 
    ? "loading" 
    : error || globalCache.error || data.source === "api_error" || data.source === "exception"
      ? "error"
      : "ready";
  const lastUpdated = globalCache.timestamp;

  useEffect(() => {
    isMounted.current = true;

    // Only fetch if cache is stale
    const now = Date.now();
    if (now - globalCache.timestamp >= CACHE_TTL_MS || globalCache.timestamp === 0) {
      fetchBalance()
        .then((result) => {
          if (isMounted.current) {
            setData(result);
            setError(result.source === "api_error" || result.source === "exception" ? "Failed to load balance" : null);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted.current) {
            setData(FALLBACK_BALANCE);
            setError("Failed to load balance");
            setIsLoading(false);
          }
        });
    } else {
      // Use cached data
      setData(globalCache.data);
      setError(globalCache.error);
      setIsLoading(false);
    }

    return () => {
      isMounted.current = false;
    };
  }, [fetchBalance]);

  // Parse window end date
  const windowEnd = data.window?.end ? new Date(data.window.end) : null;

  const value: TokenBalanceContextValue = {
    remaining: data.remaining,
    allowance: data.allowance,
    used: data.used,
    topups: data.topups,
    windowEnd,
    isLoading,
    error,
    refresh,
    status,
    lastUpdated,
  };

  return (
    <TokenBalanceContext.Provider value={value}>
      {children}
    </TokenBalanceContext.Provider>
  );
}

/**
 * Hook to access credit balance from context.
 */
export function useTokenBalanceContext(): TokenBalanceContextValue {
  const context = useContext(TokenBalanceContext);

  if (!context) {
    // Provider not found - return defaults that will trigger fallback behavior
    // PHASE B: Return error status to indicate missing provider
    return {
      remaining: 0,
      allowance: 0,
      used: 0,
      topups: 0,
      windowEnd: null,
      isLoading: false,
      error: "Credit balance unavailable",
      refresh: () => {},
      status: "error" as const,
      lastUpdated: 0,
    };
  }

  return context;
}

/**
 * Check if CreditBalanceProvider is available.
 */
export function useHasCreditBalanceProvider(): boolean {
  return !!useContext(TokenBalanceContext);
}

// Backwards compatibility aliases
export { CreditBalanceProvider as TokenBalanceProvider };
export { useTokenBalanceContext as useCreditBalanceContext };
export { useHasCreditBalanceProvider as useHasTokenBalanceProvider };

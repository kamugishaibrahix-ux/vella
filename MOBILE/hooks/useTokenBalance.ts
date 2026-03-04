/**
 * useTokenBalance Hook
 * Fetches and caches user's token balance.
 * Fail-safe: returns zero on error but doesn't crash UI.
 * 
 * NOTE: Uses TokenBalanceProvider context when available to avoid duplicate fetches.
 * Falls back to direct fetch if provider is not present.
 */

import { useState, useEffect, useCallback } from "react";
import {
  useTokenBalanceContext,
  useHasTokenBalanceProvider,
} from "@/app/components/providers";

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

interface UseTokenBalanceReturn {
  remaining: number;
  allowance: number;
  used: number;
  topups: number;
  windowEnd: Date | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fail-safe defaults when API fails.
 * Shows 0 remaining but doesn't crash UI.
 * Backend enforces actual restrictions.
 */
const ZERO_BALANCE: TokenBalanceResponse = {
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

// Cache TTL: 30 seconds
const CACHE_TTL_MS = 30000;

// Module-level cache for fallback mode (when provider not available)
let moduleCache: {
  data: TokenBalanceResponse;
  timestamp: number;
  inFlightPromise: Promise<TokenBalanceResponse> | null;
} = {
  data: ZERO_BALANCE,
  timestamp: 0,
  inFlightPromise: null,
};

/**
 * Direct fetch function with caching (fallback when provider not available)
 */
async function fetchBalanceDirect(): Promise<TokenBalanceResponse> {
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
  const fetchPromise = (async (): Promise<TokenBalanceResponse> => {
    try {
      const response = await fetch("/api/account/token-balance");

      if (!response.ok) {
        console.warn("[useTokenBalance] API error, using zero balance");
        return ZERO_BALANCE;
      }

      const result: TokenBalanceResponse = await response.json();
      return result;
    } catch (err) {
      console.warn("[useTokenBalance] Exception, using zero balance:", err);
      return ZERO_BALANCE;
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
    return ZERO_BALANCE;
  }
}

export function useTokenBalance(): UseTokenBalanceReturn {
  const hasProvider = useHasTokenBalanceProvider();
  const contextData = useTokenBalanceContext();

  // Use context if available
  if (hasProvider && contextData.windowEnd !== null) {
    return {
      remaining: contextData.remaining,
      allowance: contextData.allowance,
      used: contextData.used,
      topups: contextData.topups,
      windowEnd: contextData.windowEnd,
      isLoading: contextData.isLoading,
      error: contextData.error,
      refresh: contextData.refresh,
    };
  }

  // Fallback: direct fetch with module-level caching
  const [data, setData] = useState<TokenBalanceResponse>(moduleCache.data);
  const [isLoading, setIsLoading] = useState(!moduleCache.timestamp);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    moduleCache.timestamp = 0;
    setIsLoading(true);
    fetchBalanceDirect()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch(() => {
        setData(ZERO_BALANCE);
        setError("Failed to refresh balance");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    const now = Date.now();
    if (now - moduleCache.timestamp >= CACHE_TTL_MS || moduleCache.timestamp === 0) {
      fetchBalanceDirect()
        .then((result) => {
          setData(result);
          setIsLoading(false);
        })
        .catch(() => {
          setData(ZERO_BALANCE);
          setIsLoading(false);
        });
    } else {
      setData(moduleCache.data);
      setIsLoading(false);
    }
  }, []);

  // Parse window end date
  const windowEnd = data.window?.end ? new Date(data.window.end) : null;

  return {
    remaining: data.remaining,
    allowance: data.allowance,
    used: data.used,
    topups: data.topups,
    windowEnd,
    isLoading,
    error,
    refresh,
  };
}

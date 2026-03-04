"use client";

/**
 * Polling Hook with Backoff
 * 
 * Provides intelligent polling for data synchronization:
 * - Default interval: 30s
 * - Fast mode (after Stripe return): 10s for 2 minutes
 * - Error backoff: 10s → 20s → 40s → stop at 5 min
 * - Visibility API: pauses when tab hidden, resumes when visible
 * - Request deduplication: keeps in-flight request ID
 * 
 * Usage:
 * ```tsx
 * const { start, stop, isPolling } = usePolling({
 *   interval: 30000,
 *   onPoll: async () => { await refreshData(); },
 * });
 * 
 * // Start polling
 * useEffect(() => start(), [start]);
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface PollingOptions {
  /** Default polling interval in ms (default: 30000) */
  interval?: number;
  /** Fast mode interval in ms (default: 10000) */
  fastInterval?: number;
  /** Fast mode duration in ms (default: 120000 = 2 min) */
  fastDuration?: number;
  /** Initial error backoff in ms (default: 10000) */
  errorBackoffInitial?: number;
  /** Maximum backoff in ms (default: 300000 = 5 min) */
  maxBackoff?: number;
  /** Callback to execute on each poll */
  onPoll: () => Promise<void>;
  /** Callback when polling stops due to max backoff */
  onMaxBackoffReached?: () => void;
}

export interface PollingState {
  isPolling: boolean;
  isFastMode: boolean;
  currentInterval: number;
  consecutiveErrors: number;
  lastPollTime: number;
  requestId: number;
}

export interface PollingControls {
  start: () => void;
  stop: () => void;
  triggerFastMode: (duration?: number) => void;
  forcePoll: () => void;
  isPolling: boolean;
  isFastMode: boolean;
  state: PollingState;
}

/**
 * Hook for intelligent polling with backoff.
 */
export function usePolling(options: PollingOptions): PollingControls {
  const {
    interval = 30000,
    fastInterval = 10000,
    fastDuration = 120000,
    errorBackoffInitial = 10000,
    maxBackoff = 300000,
    onPoll,
    onMaxBackoffReached,
  } = options;

  // Polling state
  const [isPolling, setIsPolling] = useState(false);
  const [isFastMode, setIsFastMode] = useState(false);
  const [currentInterval, setCurrentInterval] = useState(interval);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [lastPollTime, setLastPollTime] = useState(0);
  const [requestId, setRequestId] = useState(0);

  // Refs for timer management
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fastModeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);

  // Stable refs for callbacks to prevent dependency cascades
  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;
  const onMaxBackoffReachedRef = useRef(onMaxBackoffReached);
  onMaxBackoffReachedRef.current = onMaxBackoffReached;

  // Refs that mirror state so async callbacks always read the latest value
  const isPollingRef = useRef(isPolling);
  isPollingRef.current = isPolling;
  const currentIntervalRef = useRef(currentInterval);
  currentIntervalRef.current = currentInterval;
  const consecutiveErrorsRef = useRef(consecutiveErrors);
  consecutiveErrorsRef.current = consecutiveErrors;
  const isFastModeRef = useRef(isFastMode);
  isFastModeRef.current = isFastMode;

  const clearPollTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearPollTimer();
    if (fastModeTimerRef.current) {
      clearTimeout(fastModeTimerRef.current);
      fastModeTimerRef.current = null;
    }
  }, [clearPollTimer]);

  // Calculate next interval based on error count
  const calculateNextInterval = useCallback(
    (errors: number, isFast: boolean): number => {
      if (isFast) {
        return fastInterval;
      }
      if (errors === 0) {
        return interval;
      }
      // Exponential backoff: 10s, 20s, 40s, 80s... up to max
      const backoff = errorBackoffInitial * Math.pow(2, errors - 1);
      return Math.min(backoff, maxBackoff);
    },
    [interval, fastInterval, errorBackoffInitial, maxBackoff]
  );

  // Execute poll — reads mutable refs so the .then() chain always sees latest state
  const executePoll = useCallback(async () => {
    if (inFlightRef.current || !isMountedRef.current) {
      return;
    }

    inFlightRef.current = true;
    const currentRequestId = Date.now();
    setRequestId(currentRequestId);

    try {
      await onPollRef.current();
      
      if (isMountedRef.current) {
        setConsecutiveErrors(0);
        setLastPollTime(Date.now());
        setCurrentInterval(calculateNextInterval(0, isFastModeRef.current));
      }
    } catch (error) {
      if (isMountedRef.current) {
        const newErrorCount = consecutiveErrorsRef.current + 1;
        setConsecutiveErrors(newErrorCount);
        
        const nextInterval = calculateNextInterval(newErrorCount, isFastModeRef.current);
        setCurrentInterval(nextInterval);

        if (nextInterval >= maxBackoff && onMaxBackoffReachedRef.current) {
          onMaxBackoffReachedRef.current();
        }
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [calculateNextInterval, maxBackoff]);

  // Schedule next poll — reads refs so the recursive .then() chain never goes stale
  const scheduleNextPoll = useCallback(() => {
    if (!isPollingRef.current || !isMountedRef.current) {
      return;
    }

    clearPollTimer();

    timerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        executePoll().then(() => {
          if (isMountedRef.current && isPollingRef.current) {
            scheduleNextPoll();
          }
        });
      }
    }, currentIntervalRef.current);
  }, [executePoll, clearPollTimer]);

  // Start polling
  const start = useCallback(() => {
    if (!isMountedRef.current) return;
    isPollingRef.current = true;
    setIsPolling(true);
    executePoll().then(() => {
      if (isMountedRef.current) {
        scheduleNextPoll();
      }
    });
  }, [executePoll, scheduleNextPoll]);

  // Stop polling
  const stop = useCallback(() => {
    isPollingRef.current = false;
    setIsPolling(false);
    clearAllTimers();
  }, [clearAllTimers]);

  // Trigger fast mode (e.g., after Stripe return)
  const triggerFastMode = useCallback((duration: number = fastDuration) => {
    if (!isMountedRef.current) return;
    
    isFastModeRef.current = true;
    currentIntervalRef.current = fastInterval;
    setIsFastMode(true);
    setCurrentInterval(fastInterval);
    
    if (fastModeTimerRef.current) {
      clearTimeout(fastModeTimerRef.current);
    }
    
    // Reschedule with the fast interval if already polling
    if (isPollingRef.current) {
      scheduleNextPoll();
    }
    
    fastModeTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        isFastModeRef.current = false;
        setIsFastMode(false);
        const normalInterval = calculateNextInterval(consecutiveErrorsRef.current, false);
        currentIntervalRef.current = normalInterval;
        setCurrentInterval(normalInterval);
      }
    }, duration);
  }, [fastDuration, fastInterval, calculateNextInterval, scheduleNextPoll]);

  // Force immediate poll
  const forcePoll = useCallback(() => {
    executePoll();
  }, [executePoll]);

  // Visibility API: pause when tab hidden, resume when visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearPollTimer();
      } else {
        // Page is visible again - resume polling
        if (isPolling) {
          // Poll immediately on visibility change (user just returned)
          executePoll().then(() => {
            if (isMountedRef.current && isPolling) {
              scheduleNextPoll();
            }
          });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isPolling, clearPollTimer, executePoll, scheduleNextPoll]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  const state: PollingState = {
    isPolling,
    isFastMode,
    currentInterval,
    consecutiveErrors,
    lastPollTime,
    requestId,
  };

  return {
    start,
    stop,
    triggerFastMode,
    forcePoll,
    isPolling,
    isFastMode,
    state,
  };
}

/**
 * Detect if we're returning from a Stripe checkout.
 * Checks for success/canceled query params.
 */
export function detectStripeReturn(): boolean {
  if (typeof window === "undefined") return false;
  
  const params = new URLSearchParams(window.location.search);
  const isSuccess = params.has("success");
  const isCanceled = params.has("canceled");
  
  return isSuccess || isCanceled;
}

/**
 * Clean up Stripe return params from URL (to avoid infinite fast-polling).
 */
export function cleanupStripeParams(): void {
  if (typeof window === "undefined") return;
  
  const params = new URLSearchParams(window.location.search);
  if (params.has("success") || params.has("canceled")) {
    params.delete("success");
    params.delete("canceled");
    
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    
    window.history.replaceState({}, "", newUrl);
  }
}

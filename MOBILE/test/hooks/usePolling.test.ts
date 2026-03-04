/**
 * Polling Hook Tests
 *
 * Tests for intelligent polling with backoff and visibility handling.
 *
 * Key pattern: usePolling uses async chains (executePoll().then(scheduleNextPoll)),
 * so after advancing fake timers we must also flush microtasks.
 * vi.advanceTimersByTimeAsync does both in one call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePolling, detectStripeReturn, cleanupStripeParams } from "@/hooks/usePolling";

/** Advance fake timers AND flush the microtask queue so .then() chains settle. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Flush only pending microtasks (no timer advance). */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("usePolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("basic polling", () => {
    it("should start polling when start() is called", async () => {
      const onPoll = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        usePolling({ interval: 1000, onPoll })
      );

      await act(async () => {
        result.current.start();
      });
      await flush();

      expect(onPoll).toHaveBeenCalledTimes(1);
      expect(result.current.isPolling).toBe(true);
    });

    it("should stop polling when stop() is called", async () => {
      const onPoll = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        usePolling({ interval: 1000, onPoll })
      );

      await act(async () => {
        result.current.start();
      });
      await flush();

      await act(async () => {
        result.current.stop();
      });

      expect(result.current.isPolling).toBe(false);
    });

    it("should poll at specified interval", async () => {
      const onPoll = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        usePolling({ interval: 1000, onPoll })
      );

      await act(async () => {
        result.current.start();
      });
      await flush();

      expect(onPoll).toHaveBeenCalledTimes(1);

      await advance(1000);
      expect(onPoll).toHaveBeenCalledTimes(2);

      await advance(1000);
      expect(onPoll).toHaveBeenCalledTimes(3);
    });
  });

  describe("fast mode", () => {
    it("should poll faster in fast mode", async () => {
      const onPoll = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        usePolling({
          interval: 30000,
          fastInterval: 1000,
          fastDuration: 5000,
          onPoll,
        })
      );

      await act(async () => {
        result.current.start();
        result.current.triggerFastMode(5000);
      });
      await flush();

      expect(result.current.isFastMode).toBe(true);

      await advance(1000);
      expect(onPoll).toHaveBeenCalledTimes(2);
    });

    it("should exit fast mode after duration", async () => {
      const onPoll = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        usePolling({
          interval: 30000,
          fastInterval: 1000,
          fastDuration: 5000,
          onPoll,
        })
      );

      await act(async () => {
        result.current.start();
        result.current.triggerFastMode(5000);
      });
      await flush();

      expect(result.current.isFastMode).toBe(true);

      await advance(5000);
      expect(result.current.isFastMode).toBe(false);
    });
  });

  describe("error backoff", () => {
    it("should increase interval after errors", async () => {
      const onPoll = vi
        .fn()
        .mockRejectedValueOnce(new Error("Error 1"))
        .mockRejectedValueOnce(new Error("Error 2"))
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() =>
        usePolling({
          interval: 1000,
          errorBackoffInitial: 1000,
          maxBackoff: 10000,
          onPoll,
        })
      );

      await act(async () => {
        result.current.start();
      });
      await flush();

      expect(result.current.state.consecutiveErrors).toBe(1);
      expect(result.current.state.currentInterval).toBe(1000);

      await advance(1000);

      expect(result.current.state.consecutiveErrors).toBe(2);
      expect(result.current.state.currentInterval).toBe(2000);
    });

    it("should reset interval after successful poll", async () => {
      const onPoll = vi
        .fn()
        .mockRejectedValueOnce(new Error("Error"))
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() =>
        usePolling({
          interval: 1000,
          errorBackoffInitial: 2000,
          onPoll,
        })
      );

      await act(async () => {
        result.current.start();
      });
      await flush();

      expect(result.current.state.consecutiveErrors).toBe(1);
      expect(result.current.state.currentInterval).toBe(2000);

      await advance(2000);

      expect(result.current.state.consecutiveErrors).toBe(0);
      expect(result.current.state.currentInterval).toBe(1000);
    });
  });

  describe("force poll", () => {
    it("should trigger immediate poll with forcePoll", async () => {
      const onPoll = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        usePolling({ interval: 30000, onPoll })
      );

      await act(async () => {
        result.current.start();
      });
      await flush();

      expect(onPoll).toHaveBeenCalledTimes(1);

      await act(async () => {
        result.current.forcePoll();
      });
      await flush();

      expect(onPoll).toHaveBeenCalledTimes(2);
    });
  });

  describe("state tracking", () => {
    it("should track request ID for deduplication", async () => {
      const onPoll = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        usePolling({ interval: 1000, onPoll })
      );

      await act(async () => {
        result.current.start();
      });
      await flush();

      const initialRequestId = result.current.state.requestId;
      expect(initialRequestId).toBeGreaterThan(0);

      await advance(1000);

      expect(result.current.state.requestId).not.toBe(initialRequestId);
    });

    it("should track last poll time", async () => {
      const onPoll = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        usePolling({ interval: 1000, onPoll })
      );

      const beforeStart = Date.now();

      await act(async () => {
        result.current.start();
      });
      await flush();

      expect(result.current.state.lastPollTime).toBeGreaterThanOrEqual(
        beforeStart
      );
    });
  });
});

describe("detectStripeReturn", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // @ts-ignore -- jsdom Location is non-configurable; delete + reassign is the accepted pattern
    delete window.location;
    window.location = { search: "" } as Location;
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it("should detect success parameter", () => {
    window.location.search = "?success=true";
    expect(detectStripeReturn()).toBe(true);
  });

  it("should detect canceled parameter", () => {
    window.location.search = "?canceled=true";
    expect(detectStripeReturn()).toBe(true);
  });

  it("should return false without Stripe params", () => {
    window.location.search = "?other=value";
    expect(detectStripeReturn()).toBe(false);
  });

  it("should return false with empty search", () => {
    window.location.search = "";
    expect(detectStripeReturn()).toBe(false);
  });
});

describe("cleanupStripeParams", () => {
  const originalLocation = window.location;
  const originalHistory = window.history;

  beforeEach(() => {
    // @ts-ignore
    delete window.location;
    window.location = {
      search: "?success=true&other=value",
      pathname: "/profile",
    } as Location;
    window.history = { replaceState: vi.fn() } as unknown as History;
  });

  afterEach(() => {
    window.location = originalLocation;
    window.history = originalHistory;
  });

  it("should remove Stripe params from URL", () => {
    cleanupStripeParams();
    expect(window.history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/profile?other=value"
    );
  });
});

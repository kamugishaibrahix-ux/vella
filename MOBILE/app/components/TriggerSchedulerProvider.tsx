"use client";

import { useEffect } from "react";
import { initScheduler } from "@/lib/execution/scheduler";

/**
 * Mounts the foreground-only trigger scheduler.
 * Renders nothing — no DOM, no layout impact.
 * Scheduler is OFF by default (controlled by localStorage dev toggle).
 */
export function TriggerSchedulerProvider() {
  useEffect(() => {
    const cleanup = initScheduler();
    return cleanup;
  }, []);

  return null;
}

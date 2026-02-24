/**
 * Emergency kill switches (env-controlled). No product logic; guards only.
 * See docs/ops/KILL_SWITCH_RUNBOOK.md.
 */

export function isMaintenanceMode(): boolean {
  return process.env.APP_MAINTENANCE_MODE === "true";
}

export function isBillingDisabled(): boolean {
  return process.env.DISABLE_BILLING === "true";
}

export function isAIDisabled(): boolean {
  return process.env.DISABLE_AI === "true";
}

export function isWriteLocked(): boolean {
  return process.env.WRITE_LOCK_MODE === "true";
}

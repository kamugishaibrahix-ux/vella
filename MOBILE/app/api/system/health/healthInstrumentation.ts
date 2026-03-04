/**
 * Instrumentation for GET /api/system/health.
 * Exported for load tests and verification; do not import this from route.ts
 * so that the route module only exports the GET handler.
 */

export let healthEndpointQueryCounter = 0;

export function resetHealthQueryCounter(): void {
  healthEndpointQueryCounter = 0;
}

export function getHealthQueryCount(): number {
  return healthEndpointQueryCounter;
}

/** Called by the route handler to record executed query count. */
export function incrementHealthQueryCount(delta: number): void {
  healthEndpointQueryCounter += delta;
}

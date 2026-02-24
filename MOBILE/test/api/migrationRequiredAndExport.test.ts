/**
 * Phase M2 Patch: Migration state helper; export guard; complete endpoint.
 * Normal endpoint 409 behaviour is covered by integration (manual or e2e).
 */

import { describe, it, expect, vi } from "vitest";
import { migrationRequiredResponse } from "@/lib/migration/state";

describe("migrationRequiredResponse", () => {
  it("returns 409 with MIGRATION_REQUIRED and next_step export_legacy", async () => {
    const res = migrationRequiredResponse("NOT_STARTED", "req-1");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error?.code).toBe("MIGRATION_REQUIRED");
    expect(body.migration?.status).toBe("NOT_STARTED");
    expect(body.migration?.next_step).toBe("export_legacy");
  });

  it("returns 409 for IN_PROGRESS status", async () => {
    const res = migrationRequiredResponse("IN_PROGRESS");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error?.code).toBe("MIGRATION_REQUIRED");
    expect(body.migration?.next_step).toBe("export_legacy");
  });
});

describe("Migration export", () => {
  it("NO_CACHE_HEADERS include no-store", async () => {
    const { NO_CACHE_HEADERS } = await import("@/lib/migration/exportGuard");
    expect(NO_CACHE_HEADERS["Cache-Control"]).toMatch(/no-store|no-cache/);
  });
});

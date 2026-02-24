/**
 * Phase M3.5: Check if migration is required via dedicated status endpoint.
 * Never log response body.
 */

export type MigrationRequiredResult =
  | { required: true; status: string; next_step: string }
  | { required: false };

const STATUS_URL = "/api/migration/status";

export async function checkMigrationRequired(): Promise<MigrationRequiredResult> {
  try {
    const res = await fetch(STATUS_URL, { credentials: "include" });
    if (!res.ok) return { required: false };
    const body = await res.json();
    if (body?.required === true) {
      return {
        required: true,
        status: body.migration?.status ?? "NOT_STARTED",
        next_step: "export_legacy",
      };
    }
    return { required: false };
  } catch {
    return { required: false };
  }
}

/**
 * Admin roles (app_metadata.role). Must match MOBILE/lib/admin/requireAdminRole.ts.
 * Server-authoritative only; not writable by the user.
 */

export const ADMIN_ROLES = [
  "super_admin",
  "ops_admin",
  "analyst",
  "support_agent",
  "read_only",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

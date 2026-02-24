/**
 * Admin auth: requireAdminRole returns 403 when user lacks admin role; returns userId and role when present.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: () => mockGetUser(),
    },
  }),
}));

describe("requireAdminRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error("Not signed in") });
    const { requireAdminRole } = await import("@/lib/admin/requireAdminRole");
    const result = await requireAdminRole();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("returns 403 when user has no app_metadata.role", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", app_metadata: {} } },
      error: null,
    });
    const { requireAdminRole } = await import("@/lib/admin/requireAdminRole");
    const result = await requireAdminRole();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("returns 403 when user has non-admin role", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", app_metadata: { role: "user" } } },
      error: null,
    });
    const { requireAdminRole } = await import("@/lib/admin/requireAdminRole");
    const result = await requireAdminRole();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("returns userId and role when user has admin role", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "admin-1", app_metadata: { role: "read_only" } } },
      error: null,
    });
    const { requireAdminRole } = await import("@/lib/admin/requireAdminRole");
    const result = await requireAdminRole();
    expect(result).not.toBeInstanceOf(Response);
    expect(result).toEqual({ userId: "admin-1", role: "read_only" });
  });

  it("accepts all contract admin roles", async () => {
    const roles = ["super_admin", "ops_admin", "analyst", "support_agent", "read_only"] as const;
    for (const role of roles) {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "admin-1", app_metadata: { role } } },
        error: null,
      });
      const { requireAdminRole } = await import("@/lib/admin/requireAdminRole");
      const result = await requireAdminRole();
      expect(result).not.toBeInstanceOf(Response);
      expect((result as { role: string }).role).toBe(role);
    }
  });
});

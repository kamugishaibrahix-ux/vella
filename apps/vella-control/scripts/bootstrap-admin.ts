/**
 * Bootstrap Admin — dev-only utility for vella-control.
 *
 * Uses the SAME Supabase project as the app (NEXT_PUBLIC_SUPABASE_URL).
 * Finds or creates the admin user, optionally enforces password/confirm/role (dev only),
 * then verifies login with signInWithPassword (anon key).
 *
 * RUN (from apps/vella-control):
 *   ADMIN_BOOTSTRAP_EMAIL="admin@example.com" ADMIN_BOOTSTRAP_PASSWORD="your-secure-password" pnpm bootstrap:admin
 *
 * Or with tsx directly:
 *   ADMIN_BOOTSTRAP_EMAIL="..." ADMIN_BOOTSTRAP_PASSWORD="..." pnpm exec tsx scripts/bootstrap-admin.ts
 */

import { createClient } from "@supabase/supabase-js";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_BOOTSTRAP_EMAIL",
  "ADMIN_BOOTSTRAP_PASSWORD",
] as const;

function requireEnv(name: (typeof REQUIRED_ENV)[number]): string {
  const val = process.env[name];
  if (!val || val.trim() === "") {
    console.error(`[bootstrap-admin] Missing required env: ${name}`);
    process.exit(1);
  }
  return val.trim();
}

const ADMIN_ROLES = ["super_admin", "ops_admin", "analyst", "support_agent", "read_only"] as const;
function isAdminRole(role: unknown): role is (typeof ADMIN_ROLES)[number] {
  return typeof role === "string" && (ADMIN_ROLES as readonly string[]).includes(role);
}

type AuthUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  identities?: unknown[];
};

function main() {
  console.log("=== vella-control admin bootstrap ===\n");
  console.log("Run from apps/vella-control:");
  console.log('  ADMIN_BOOTSTRAP_EMAIL="..." ADMIN_BOOTSTRAP_PASSWORD="..." pnpm bootstrap:admin');
  console.log("Or: pnpm exec tsx scripts/bootstrap-admin.ts (with same env vars)\n");

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const email = requireEnv("ADMIN_BOOTSTRAP_EMAIL");
  const password = requireEnv("ADMIN_BOOTSTRAP_PASSWORD");

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  const report: Record<string, string | boolean> = {
    "ENV URL": url,
    "FOUND USER?": "no",
    "CONFIRMED?": "no",
    "HAS PASSWORD?": "no",
    "ROLE OK?": "no",
    "SIGNIN TEST": "fail",
  };

  let authUser: AuthUser | null = null;

  async function findUserByEmail(): Promise<AuthUser | null> {
    let page = 1;
    const perPage = 500;
    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error("[bootstrap-admin] listUsers error:", error.message);
        return null;
      }
      const users = (data?.users ?? []) as AuthUser[];
      const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) return found;
      if (users.length < perPage) return null;
      page += 1;
    }
  }

  async function run() {
    authUser = await findUserByEmail();

    if (authUser) {
      report["FOUND USER?"] = "yes";
      const role = (authUser.app_metadata as { role?: string } | undefined)?.role;
      const confirmed =
        !!(authUser as { email_confirmed_at?: string | null }).email_confirmed_at ||
        !!(authUser as { confirmed_at?: string | null }).confirmed_at;
      report["CONFIRMED?"] = confirmed ? "yes" : "no";
      report["ROLE OK?"] = isAdminRole(role) ? "yes" : "no";

      console.log("Project URL:", url);
      console.log("User id:", authUser.id);
      console.log("app_metadata.role:", role ?? "(missing)");
      console.log(
        "email_confirmed_at:",
        (authUser as { email_confirmed_at?: string | null }).email_confirmed_at ?? null
      );
      console.log("confirmed_at:", (authUser as { confirmed_at?: string | null }).confirmed_at ?? null);

      const hasPasswordByApi = (authUser as { encrypted_password?: string | null }).encrypted_password != null;
      if (hasPasswordByApi) {
        report["HAS PASSWORD?"] = "yes";
        console.log("HAS PASSWORD (from API): yes");
      } else {
        report["HAS PASSWORD?"] = "unknown (not in API response)";
        console.log("HAS PASSWORD: unknown (Admin API does not expose encrypted_password)");
      }

      const isDev = process.env.NODE_ENV !== "production";
      if (isDev) {
        const updates: {
          app_metadata?: Record<string, unknown>;
          email_confirm?: boolean;
          password?: string;
        } = {};
        if (!isAdminRole(role)) {
          updates.app_metadata = { ...(authUser.app_metadata ?? {}), role: "super_admin" };
        }
        if (!confirmed) {
          updates.email_confirm = true;
        }
        updates.password = password;

        const { error: updateErr } = await adminClient.auth.admin.updateUserById(authUser.id, updates);
        if (updateErr) {
          console.error("[bootstrap-admin] updateUserById error:", updateErr.message);
        } else {
          console.log("[bootstrap-admin] DEV: enforced password, email_confirm (if needed), app_metadata.role (if needed)");
          report["CONFIRMED?"] = "yes";
          report["ROLE OK?"] = "yes";
          report["HAS PASSWORD?"] = "yes (set by script)";
        }
      }
    } else {
      console.log("User not found. Creating with email_confirm=true, password, app_metadata.role=super_admin");
      const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: "super_admin" },
      });
      if (createErr) {
        console.error("[bootstrap-admin] createUser error:", createErr.message);
        report["SIGNIN TEST"] = `fail: createUser ${createErr.message}`;
        printReport(report);
        return;
      }
      authUser = createData?.user as AuthUser;
      if (authUser) {
        report["FOUND USER?"] = "yes (created)";
        report["CONFIRMED?"] = "yes";
        report["HAS PASSWORD?"] = "yes";
        report["ROLE OK?"] = "yes";
        console.log("Created user id:", authUser.id);
      }
    }

    if (!authUser) {
      printReport(report);
      return;
    }

    const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      report["SIGNIN TEST"] = `fail: ${signInError.message}`;
      console.log("SIGNIN TEST (anon key): FAIL");
      console.log("Error:", JSON.stringify({ message: signInError.message, status: (signInError as { status?: number }).status, code: (signInError as { code?: string }).code }, null, 2));
    } else if (signInData?.user) {
      report["SIGNIN TEST"] = "pass";
      console.log("SIGNIN TEST (anon key): PASS");
    }

    printReport(report);
  }

  function printReport(r: Record<string, string | boolean>) {
    console.log("\n--- REPORT ---");
    Object.entries(r).forEach(([k, v]) => console.log(`${k}: ${v}`));
    console.log("\n--- RUN AGAIN ---");
    console.log(
      "From apps/vella-control:\n  ADMIN_BOOTSTRAP_EMAIL=\"" +
        email +
        "\" ADMIN_BOOTSTRAP_PASSWORD=\"...\" pnpm bootstrap:admin"
    );
    console.log("\nOr:\n  ADMIN_BOOTSTRAP_EMAIL=\"...\" ADMIN_BOOTSTRAP_PASSWORD=\"...\" pnpm exec tsx scripts/bootstrap-admin.ts");
  }

  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[bootstrap-admin] Fatal:", err);
      process.exit(1);
    });
}

main();

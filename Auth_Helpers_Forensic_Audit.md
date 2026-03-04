# Auth Helpers Forensic Audit

**Scope:** requireUserId, requireActiveUser, requireEntitlement, requireAdminRole, requireAdmin, getAdminUserId.  
**Criteria:** Full implementation, use of supabase.auth.getUser(), trust of body user_id / cookies / JWT claims, how admin is determined, whether admin status can be manipulated by the user.

---

## 1. requireUserId

**File path:** `MOBILE/lib/supabase/server-auth.ts`

### Full implementation (lines 48–70)

```typescript
export async function requireUserId(): Promise<string | NextResponse> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return unauthResponse();
    }

    const userId = user.id;
    if (!userId || typeof userId !== "string") {
      return unauthResponse();
    }

    return userId;
  } catch (err) {
    console.error("[server-auth] requireUserId failed:", err);
    return unauthResponse();
  }
}
```

### Checks

| Question | Result | Evidence |
|----------|--------|----------|
| Is `supabase.auth.getUser()` called? | **Yes** | Line 54: `await supabase.auth.getUser()` |
| Trusts request body `user_id`? | **No** | No reference to request or body; identity is `user.id` from `getUser()` |
| Trusts cookies without validation? | **No** | Cookies supply the session to Supabase client; **validation is performed by Supabase** when `getUser()` is called (server-side session/JWT verification by Supabase Auth) |
| Trusts JWT custom claims without verification? | **No** | Only `user.id` is used; no custom claims read. Identity comes from verified Auth response |

### Verdict: **PASS**

**Privilege escalation risk:** None. Identity is derived solely from the result of `getUser()`; no user-supplied identity is used.

---

## 2. requireActiveUser

**File path:** `MOBILE/lib/auth/requireActiveUser.ts`

### Full implementation (lines 38–124)

```typescript
export async function requireActiveUser(): Promise<ActiveUserResult> {
  // Step 1: Require authenticated user
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof NextResponse) {
    return userIdOr401;
  }
  const userId = userIdOr401;

  // Step 2: Check admin_user_flags for suspension
  // Step 3: Check subscriptions for status and plan
  // Both checks must pass; any failure blocks access

  if (!supabaseAdmin) {
    console.error("[requireActiveUser] Supabase admin unavailable - blocking access");
    return ACCOUNT_INACTIVE_RESPONSE;
  }

  try {
    // Fetch admin_user_flags and subscriptions in parallel
    const [flagsResult, subscriptionResult] = await Promise.all([
      supabaseAdmin
        .from("admin_user_flags")
        .select("suspended, suspended_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("subscriptions")
        .select("plan, status")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    // ... error checks, then:
    if (flags?.suspended === true) { return ACCOUNT_INACTIVE_RESPONSE; }
    // ... plan validation from subscription?.plan (DB), subscriptionStatus check
    return { userId, plan, subscriptionStatus };
  } catch (err) { ... return ACCOUNT_INACTIVE_RESPONSE; }
}
```

### Checks

| Question | Result | Evidence |
|----------|--------|----------|
| Is `supabase.auth.getUser()` called? | **Yes** | Via `requireUserId()` (line 40), which calls `getUser()` |
| Trusts request body `user_id`? | **No** | `userId` comes only from `requireUserId()` |
| Trusts cookies without validation? | **No** | Same as requireUserId: session from cookies, validation via `getUser()` |
| Trusts JWT custom claims without verification? | **No** | Plan/status come from **DB** (`subscriptions`, `admin_user_flags`), not from JWT |

### Verdict: **PASS**

**Privilege escalation risk:** None. Identity is from `requireUserId()`. Plan and suspension are from server-side DB (admin_user_flags, subscriptions), not from client or JWT.

---

## 3. requireEntitlement

**File path:** `MOBILE/lib/plans/requireEntitlement.ts`

### Full implementation (lines 61–99)

```typescript
export async function requireEntitlement(
  feature: FeatureKey
): Promise<EntitlementCheckResult | NextResponse> {
  try {
    // Step 1: Require active user (handles suspension/subscription status)
    const activeResult = await requireActiveUser();
    if (isActiveUserBlocked(activeResult)) {
      return activeResult;
    }

    const { userId, plan, subscriptionStatus } = activeResult;

    // Step 2: Resolve entitlements for the plan
    const entitlementResult = await resolvePlanEntitlements(plan);
    const { entitlements } = entitlementResult;

    // Step 3: Check feature entitlement via Feature Registry (PURE abstraction)
    const isAllowed = isFeatureEnabled(feature, entitlements);

    if (!isAllowed) {
      console.warn(`[requireEntitlement] Feature ${feature} blocked for ${plan} plan (entitlement check)`);
      return FEATURE_NOT_AVAILABLE_RESPONSE(feature, plan);
    }

    return {
      userId,
      plan,
      entitlements,
    };
  } catch (err) {
    if (err instanceof UnknownTierError) {
      logSecurityEvent("PLAN_RESOLUTION_FAILED", { tier: err.tier, context: err.context, feature });
      return NextResponse.json(
        { error: "plan_resolution_failed", code: "PLAN_RESOLUTION_FAILED" },
        { status: 500 }
      );
    }
    throw err;
  }
}
```

### Checks

| Question | Result | Evidence |
|----------|--------|----------|
| Is `supabase.auth.getUser()` called? | **Yes** | Via `requireActiveUser()` → `requireUserId()` → `getUser()` |
| Trusts request body `user_id`? | **No** | `userId` and `plan` come from `requireActiveUser()` (DB-backed) |
| Trusts cookies without validation? | **No** | Same chain as above |
| Trusts JWT custom claims without verification? | **No** | Entitlements are derived from **plan** (from DB in requireActiveUser) and feature registry (server-side config) |

### Verdict: **PASS**

**Privilege escalation risk:** None. Identity and plan come from requireActiveUser (auth + DB); entitlements are server-side resolution from plan.

---

## 4. requireAdminRole

**File path:** `MOBILE/lib/admin/requireAdminRole.ts`

### Full implementation (lines 31–66)

```typescript
export const ADMIN_ROLES = [
  "super_admin",
  "ops_admin",
  "analyst",
  "support_agent",
  "read_only",
] as const;

function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export async function requireAdminRole(): Promise<
  | { userId: string; role: AdminRole }
  | NextResponse
> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: "unauthorized", code: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = user.id;
    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "unauthorized", code: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 }
      );
    }

    const role = (user.app_metadata as { role?: string } | undefined)?.role;
    if (!isAdminRole(role)) {
      return FORBIDDEN_RESPONSE;
    }

    return { userId, role };
  } catch (err) {
    console.error("[admin-auth] requireAdminRole failed:", err);
    return FORBIDDEN_RESPONSE;
  }
}
```

### How admin is determined

- **Source:** `user.app_metadata.role` (line 56).
- **Supabase semantics:** `app_metadata` is **server-only**. It cannot be updated by the user from the client; only via Admin API (`auth.admin.updateUserById`) or direct DB with service role. So the role is **not** user-writable.

### Checks

| Question | Result | Evidence |
|----------|--------|----------|
| Is `supabase.auth.getUser()` called? | **Yes** | Line 40: `await supabase.auth.getUser()` |
| Trusts request body `user_id`? | **No** | `userId` is `user.id` from `getUser()` |
| Trusts cookies without validation? | **No** | Session validated by Supabase in `getUser()` |
| Trusts JWT custom claims without verification? | **N/A (verified)** | `app_metadata` is part of the signed JWT/session; Supabase validates the token. The claim is server-set (not user-set). |

### Verdict: **PASS**

**Privilege escalation risk:** None. Admin role is read from **app_metadata.role**, which only the server (or service_role) can set. A user cannot grant themselves an admin role via `updateUser()` because `app_metadata` is not writable by the client.

---

## 5. requireAdmin (vella-control)

**File path:** `apps/vella-control/lib/auth/requireAdmin.ts`

### Full implementation (lines 12–39)

```typescript
export async function requireAdmin(): Promise<NextResponse | null> {
  // Dev bypass: always succeed without contacting Supabase
  if (isAdminBypassActive()) {
    return null; // Authorized
  }

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const isAdmin = user.user_metadata?.is_admin === true;

    if (!isAdmin) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    return null; // Authorized
  } catch (error) {
    console.error("[requireAdmin] Auth check failed", error);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
```

### How admin is determined

- **Source:** `user.user_metadata?.is_admin === true` (line 29).
- **Supabase semantics:** **user_metadata is editable by the user** from the client via `supabase.auth.updateUser({ data: { is_admin: true } })`. There is no in-code restriction or server-side check that prevents the user from setting `is_admin` in their own metadata.

### Checks

| Question | Result | Evidence |
|----------|--------|----------|
| Is `supabase.auth.getUser()` called? | **Yes** | Line 22: `await supabase.auth.getUser()` |
| Trusts request body `user_id`? | **No** | No request/body; identity is from session |
| Trusts cookies without validation? | **No** | Session validated by Supabase in `getUser()` |
| Trusts JWT custom claims without verification? | **Yes, for admin** | Admin status is taken from **user_metadata.is_admin**. The JWT is verified by Supabase, but **the value of user_metadata is user-writable**. So the claim is verified as “what the user (or server) put there,” not “server-authoritative admin flag.” |

### Can admin status be manipulated by the user?

**Yes.** In Supabase, `user_metadata` can be updated by the signed-in user via `auth.updateUser()`. Unless the project uses Auth Hooks or custom logic to reject updates to `is_admin`, a user can:

1. Call `supabase.auth.updateUser({ data: { is_admin: true } })`.
2. On the next request, `getUser()` returns `user_metadata.is_admin === true`.
3. `requireAdmin()` treats them as admin.

No code in this repo restricts which keys can be written to `user_metadata`; the admin check relies entirely on that field.

### Verdict: **FAIL**

**Privilege escalation risk:** **High.** Admin status is determined by **user_metadata.is_admin**, which is client-writable. A user can escalate to admin by updating their own metadata unless Supabase project configuration (e.g. Auth Hooks, or disabling user_metadata updates) prevents it. The implementation itself does not prevent this.

**Recommendation:** Determine admin status from a server-only source, e.g.:
- **app_metadata** (set only via Admin API / service role), or  
- A dedicated table (e.g. `admin_users` or `admin_user_flags`) writable only by service_role or backend, and check that after `getUser()`.

---

## 6. getAdminUserId (vella-control)

**File path:** `apps/vella-control/lib/auth/requireAdmin.ts` (same file as requireAdmin)

### Full implementation (lines 45–62)

```typescript
export async function getAdminUserId(): Promise<string | null> {
  if (isAdminBypassActive()) {
    return "dev-bypass";
  }
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user || user.user_metadata?.is_admin !== true) {
      return null;
    }
    return user.id;
  } catch {
    return null;
  }
}
```

### How admin is determined

- Same as **requireAdmin:** `user.user_metadata?.is_admin === true` (line 55).

### Checks

| Question | Result | Evidence |
|----------|--------|----------|
| Is `supabase.auth.getUser()` called? | **Yes** | Line 54: `await supabase.auth.getUser()` |
| Trusts request body `user_id`? | **No** | Returns `user.id` from `getUser()` |
| Trusts cookies without validation? | **No** | Same as requireAdmin |
| Trusts JWT custom claims without verification? | **Yes, for admin** | Same as requireAdmin: **user_metadata.is_admin** is user-writable. |

### Can admin status be manipulated by the user?

**Yes.** Same privilege escalation as requireAdmin: a user can set `user_metadata.is_admin` to true and then `getAdminUserId()` will return their id as “admin.”

### Verdict: **FAIL**

**Privilege escalation risk:** Same as requireAdmin: **High.** Admin is derived from user-writable **user_metadata.is_admin**. Same recommendation: use **app_metadata** or a server-only store for admin status.

---

## 7. Summary Table

| Helper | File | getUser() | Body user_id | Cookies | JWT claims (admin) | Admin source | User can escalate? | Result |
|--------|------|-----------|--------------|---------|---------------------|--------------|--------------------|--------|
| requireUserId | MOBILE/lib/supabase/server-auth.ts | Yes | No | Validated via getUser() | N/A | N/A | No | **PASS** |
| requireActiveUser | MOBILE/lib/auth/requireActiveUser.ts | Yes (via requireUserId) | No | Same | N/A | DB (admin_user_flags, subscriptions) | No | **PASS** |
| requireEntitlement | MOBILE/lib/plans/requireEntitlement.ts | Yes (via requireActiveUser) | No | Same | N/A | Plan from DB + registry | No | **PASS** |
| requireAdminRole | MOBILE/lib/admin/requireAdminRole.ts | Yes | No | Same | app_metadata.role (server-set) | **app_metadata.role** | No | **PASS** |
| requireAdmin | apps/vella-control/lib/auth/requireAdmin.ts | Yes | No | Same | **user_metadata.is_admin** | **user_metadata.is_admin** | **Yes** | **FAIL** |
| getAdminUserId | apps/vella-control/lib/auth/requireAdmin.ts | Yes | No | Same | **user_metadata.is_admin** | **user_metadata.is_admin** | **Yes** | **FAIL** |

---

## 8. Cookie / session validation note

All helpers use a Supabase client created with **createServerSupabaseClient()** / **createServerComponentClient({ cookies })** (MOBILE uses async server, vella-control uses sync). The session is taken from **cookies** and sent to Supabase; **validation of the session/JWT is performed by Supabase Auth** when `getUser()` is called. The server does not validate the JWT locally; it trusts Supabase’s response. So cookies are not “trusted without validation”—they are the transport for the session that Supabase then validates. **PASS** for all helpers from a “do we validate?” perspective (validation is delegated to Supabase).

---

## 9. Explicit privilege escalation risk analysis

- **requireUserId, requireActiveUser, requireEntitlement:** Identity and plan/entitlements come from Auth + DB. No user-supplied identity or privilege flag is trusted. **No privilege escalation path.**
- **requireAdminRole:** Admin is **app_metadata.role**. app_metadata is server-only in Supabase; users cannot set it. **No privilege escalation path.**
- **requireAdmin / getAdminUserId:** Admin is **user_metadata.is_admin**. user_metadata is user-writable by default. A user can call `auth.updateUser({ data: { is_admin: true } })` and be treated as admin on the next request. **Privilege escalation is possible** unless the Supabase project explicitly prevents it (e.g. Auth Hooks blocking `is_admin` updates, or disabling user_metadata updates). The codebase does not implement or enforce that. **Risk: HIGH.**

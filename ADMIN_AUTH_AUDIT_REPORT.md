# Admin Panel Authentication & Authorization Audit Report

**Date:** 2025-11-30  
**Scope:** Vella Control (apps/vella-control) and MOBILE admin routes  
**Type:** READ-ONLY Security Audit

---

## Executive Summary

The Vella Control admin panel uses a **dual-layer authentication model**:
1. **Middleware-level protection** for all pages (except `/login` and `/api/auth/*`)
2. **API route-level protection** via `requireAdmin()` helper

**Current Admin Status Representation:**
- Admin status is stored in **Supabase Auth `user_metadata.is_admin`** (boolean)
- Database RLS uses `public.is_admin_user()` function that checks `user_metadata.admin = true`
- **CRITICAL GAP:** Development mode bypasses ALL authentication checks

**Security Status:**
- ✅ All vella-control admin routes are protected
- ⚠️ **CRITICAL:** Development mode bypasses all auth (middleware + requireAdmin)
- ⚠️ **HIGH RISK:** One admin route in vella-control is missing `requireAdmin()` check
- ⚠️ **MEDIUM RISK:** MOBILE admin routes have inconsistent or missing protection

---

## A. Admin Entry Points

### A1. Vella Control Pages

| Route Path | File Path | Current Auth Protection | Status |
|------------|-----------|------------------------|--------|
| `/` | `apps/vella-control/app/page.tsx` | Middleware (redirects to `/dashboard`) | ✅ Protected |
| `/dashboard` | `apps/vella-control/app/dashboard/page.tsx` | Middleware only | ⚠️ Client-side only |
| `/users` | `apps/vella-control/app/users/page.tsx` | Middleware only | ⚠️ Client-side only |
| `/subscriptions` | `apps/vella-control/app/subscriptions/page.tsx` | Middleware only | ⚠️ Client-side only |
| `/feedback` | `apps/vella-control/app/feedback/page.tsx` | Middleware only | ⚠️ Client-side only |
| `/logs` | `apps/vella-control/app/logs/page.tsx` | Middleware only | ⚠️ Client-side only |
| `/insights` | `apps/vella-control/app/insights/page.tsx` | Middleware only | ⚠️ Client-side only |
| `/ai-configuration` | `apps/vella-control/app/ai-configuration/page.tsx` | Middleware only | ⚠️ Client-side only |
| `/system-settings` | `apps/vella-control/app/system-settings/page.tsx` | Middleware only | ⚠️ Client-side only |
| `/content-library` | `apps/vella-control/app/content-library/page.tsx` | Middleware only | ⚠️ Client-side only |
| `/login` | `apps/vella-control/app/login/page.tsx` | Public (explicitly allowed) | ✅ Public |

**Page Protection Analysis:**
- All pages (except `/login`) are protected by **middleware** that:
  1. Checks if user is authenticated
  2. Checks if `user.user_metadata?.is_admin === true`
  3. Redirects to `/login` if either check fails
- **Gap:** Pages rely on middleware + client-side API calls. If middleware is bypassed, pages could render (though API calls would fail).

### A2. Vella Control API Routes

| Route Path | File Path | Current Auth Protection | Status |
|------------|-----------|------------------------|--------|
| `/api/admin/analytics/get` | `apps/vella-control/app/api/admin/analytics/get/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/config/get` | `apps/vella-control/app/api/admin/config/get/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/config/save` | `apps/vella-control/app/api/admin/config/save/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/feedback/list` | `apps/vella-control/app/api/admin/feedback/list/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/logs/list` | `apps/vella-control/app/api/admin/logs/list/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/subscriptions/list` | `apps/vella-control/app/api/admin/subscriptions/list/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/tokens/list` | `apps/vella-control/app/api/admin/tokens/list/route.ts` | **NONE** | ❌ **UNPROTECTED** |
| `/api/admin/users/list` | `apps/vella-control/app/api/admin/users/list/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/users/update-plan` | `apps/vella-control/app/api/admin/users/update-plan/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/users/update-tokens` | `apps/vella-control/app/api/admin/users/update-tokens/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/users/update-status` | `apps/vella-control/app/api/admin/users/update-status/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/users/update-voice` | `apps/vella-control/app/api/admin/users/update-voice/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/users/update-realtime` | `apps/vella-control/app/api/admin/users/update-realtime/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/admin/users/update-notes` | `apps/vella-control/app/api/admin/users/update-notes/route.ts` | `requireAdmin()` | ✅ Protected |
| `/api/auth/login` | `apps/vella-control/app/api/auth/login/route.ts` | Public (checks admin after login) | ✅ Public |
| `/api/auth/logout` | `apps/vella-control/app/api/auth/logout/route.ts` | Public | ✅ Public |
| `/api/auth/me` | `apps/vella-control/app/api/auth/me/route.ts` | None (returns user info) | ⚠️ No admin check |

**Critical Finding:**
- **`/api/admin/tokens/list`** is **completely unprotected** - anyone can access token usage data
- **`/api/auth/me`** does not require admin, but this is acceptable as it's used for client-side auth state

### A3. MOBILE Admin Routes

| Route Path | File Path | Current Auth Protection | Status |
|------------|-----------|------------------------|--------|
| `/api/admin/policy` | `MOBILE/app/api/admin/policy/route.ts` | `requireUserId()` only | ⚠️ **NOT ADMIN PROTECTED** |
| `/api/admin/runtime/tuning` | `MOBILE/app/api/admin/runtime/tuning/route.ts` | **NONE** | ❌ **UNPROTECTED** |
| `/api/admin/runtime/ai-config-preview` | `MOBILE/app/api/admin/runtime/ai-config-preview/route.ts` | **NONE** | ❌ **UNPROTECTED** |

**Critical Finding:**
- All MOBILE admin routes are **missing admin authorization checks**
- They only check for authentication (`requireUserId()`) or have no protection at all
- These routes expose sensitive runtime configuration and policy data

---

## B. Auth Helpers Available

### B1. Vella Control Auth Helpers

| Helper Function | File Path | What It Enforces | Notes |
|----------------|-----------|------------------|-------|
| `requireAdmin()` | `apps/vella-control/lib/auth/requireAdmin.ts` | Admin status (`user_metadata.is_admin === true`) | ⚠️ **Bypassed in development mode** |
| `createServerSupabaseClient()` | `apps/vella-control/lib/supabase/server.ts` | None (creates client) | Helper only |
| `getAdminClient()` | `apps/vella-control/lib/supabase/adminClient.ts` | None (uses service role) | Bypasses RLS |

**`requireAdmin()` Implementation:**
```typescript
export async function requireAdmin(): Promise<NextResponse | null> {
  // ⚠️ CRITICAL: Allows all requests in development
  if (process.env.NODE_ENV === "development") {
    return null;
  }

  // Checks: user exists AND user_metadata.is_admin === true
  const isAdmin = user.user_metadata?.is_admin === true;
  if (!isAdmin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null; // Authorized
}
```

### B2. MOBILE Auth Helpers

| Helper Function | File Path | What It Enforces | Notes |
|----------------|-----------|------------------|-------|
| `requireUserId()` | `MOBILE/lib/supabase/server-auth.ts` | Authentication only (no admin check) | Used by MOBILE routes |
| `ensureVellaSession()` | `MOBILE/lib/auth/ensureVellaSession.ts` | Anonymous session creation | Not for admin |

**Key Difference:**
- MOBILE has **no `requireAdmin()` helper**
- MOBILE routes use `requireUserId()` which only checks authentication, not admin status

### B3. Middleware Protection

**Vella Control Middleware** (`apps/vella-control/middleware.ts`):
- ⚠️ **Bypassed in development mode** (`NODE_ENV === "development"`)
- Checks authentication via `supabase.auth.getUser()`
- Checks admin status via `user.user_metadata?.is_admin === true`
- Redirects to `/login` if either check fails

**MOBILE Middleware** (`MOBILE/middleware.ts`):
- Creates anonymous sessions only
- **No admin protection** (not needed for MOBILE app)

---

## C. Admin Role Representation

### C1. Database Representation

**Primary Storage:**
- Admin status is stored in **Supabase Auth `user_metadata.is_admin`** (boolean)
- This is set via Supabase Auth Admin API or dashboard

**Database Function:**
```sql
create or replace function public.is_admin_user()
returns boolean as $$
begin
  return exists (
    select 1
    from public.user_metadata
    where user_id = auth.uid()
    and admin = true
  );
end;
$$ language plpgsql security definer;
```

**Key Points:**
- The function checks `user_metadata.admin = true` (not `is_admin`)
- There's a **mismatch**: Code checks `user_metadata.is_admin`, but DB function checks `user_metadata.admin`
- RLS policies use `public.is_admin_user()` for admin checks

### C2. Code Representation

**Where Admin Status is Checked:**
1. **Middleware:** `user.user_metadata?.is_admin === true`
2. **requireAdmin():** `user.user_metadata?.is_admin === true`
3. **Login route:** `user.user_metadata?.is_admin === true`
4. **Auth me route:** Returns `is_admin: user.user_metadata?.is_admin === true`

**Inconsistency:**
- Code consistently uses `is_admin` (with underscore)
- Database function uses `admin` (no underscore)
- This suggests the database function may not work correctly if admin status is stored as `is_admin`

### C3. RLS Policies

RLS policies use `public.is_admin_user()` function which:
- Checks `user_metadata.admin = true` (not `is_admin`)
- Used in policies for: `admin_ai_config`, `analytics_counters`, `system_logs`, `token_usage`, etc.

**Potential Issue:**
- If admin status is stored as `user_metadata.is_admin = true`, the RLS function won't detect it
- This could cause RLS to block admin access even if the app-level checks pass

---

## D. Gaps & Risks

### D1. Critical Security Gaps

#### 🔴 **CRITICAL: Development Mode Bypass**
- **Location:** `requireAdmin()` and `middleware.ts`
- **Issue:** All authentication is bypassed when `NODE_ENV === "development"`
- **Risk:** Admin panel is completely open in development
- **Impact:** Anyone with access to dev environment can access admin features

#### 🔴 **CRITICAL: Unprotected Token Usage Route**
- **Location:** `apps/vella-control/app/api/admin/tokens/list/route.ts`
- **Issue:** No `requireAdmin()` check
- **Risk:** Anyone can access token usage data
- **Impact:** Sensitive metadata exposure

#### 🔴 **CRITICAL: MOBILE Admin Routes Unprotected**
- **Locations:**
  - `MOBILE/app/api/admin/policy/route.ts` (only `requireUserId()`)
  - `MOBILE/app/api/admin/runtime/tuning/route.ts` (no protection)
  - `MOBILE/app/api/admin/runtime/ai-config-preview/route.ts` (no protection)
- **Issue:** No admin authorization checks
- **Risk:** Any authenticated user can access admin configuration
- **Impact:** Runtime configuration and policy data exposure

### D2. High-Risk Gaps

#### 🟠 **HIGH: Admin Status Field Mismatch**
- **Issue:** Code uses `user_metadata.is_admin`, DB function uses `user_metadata.admin`
- **Risk:** RLS policies may not work correctly
- **Impact:** Admin users may be blocked by RLS even if app-level checks pass

#### 🟠 **HIGH: Pages Rely on Client-Side Protection**
- **Issue:** Admin pages only have middleware protection (which can be bypassed)
- **Risk:** Pages could render if middleware is bypassed (though API calls would fail)
- **Impact:** Potential information disclosure through page structure

### D3. Medium-Risk Gaps

#### 🟡 **MEDIUM: No Rate Limiting on Admin Routes**
- **Issue:** Admin routes have no rate limiting
- **Risk:** Brute force or enumeration attacks
- **Impact:** Potential DoS or information disclosure

#### 🟡 **MEDIUM: No Audit Logging for Failed Auth Attempts**
- **Issue:** Failed admin login attempts are not logged
- **Risk:** No visibility into attack attempts
- **Impact:** Security incidents may go undetected

#### 🟡 **MEDIUM: Service Role Key Used in Admin Client**
- **Issue:** `getAdminClient()` uses service role key (bypasses RLS)
- **Risk:** If service role key is leaked, all RLS is bypassed
- **Impact:** Complete database access

### D4. Missing Middleware

- ✅ Vella Control has middleware protection
- ❌ MOBILE has no admin-specific middleware (not needed, but admin routes should still be protected)

### D5. Missing RLS Assumptions

- ⚠️ RLS policies assume `user_metadata.admin = true` exists
- ⚠️ No verification that admin status is correctly set in both places
- ⚠️ No migration or script to ensure admin users have correct metadata

---

## E. Recommended Admin Auth Model

### E1. Current Model Assessment

**Strengths:**
- ✅ Centralized `requireAdmin()` helper
- ✅ Middleware protection for pages
- ✅ Consistent admin status check pattern
- ✅ Login route validates admin status

**Weaknesses:**
- ❌ Development mode bypass
- ❌ Field name inconsistency (`is_admin` vs `admin`)
- ❌ Missing protection on some routes
- ❌ No admin helper in MOBILE app

### E2. Recommended Improvements

#### **Phase 1: Critical Fixes (Immediate)**

1. **Fix Unprotected Routes:**
   ```typescript
   // apps/vella-control/app/api/admin/tokens/list/route.ts
   export async function GET() {
     const authError = await requireAdmin();
     if (authError) return authError;
     // ... rest of route
   }
   ```

2. **Add Admin Protection to MOBILE Routes:**
   - Create `MOBILE/lib/auth/requireAdmin.ts` (copy from vella-control)
   - Add `requireAdmin()` to all MOBILE admin routes

3. **Fix Development Mode Bypass:**
   ```typescript
   // Option 1: Remove bypass entirely
   // Option 2: Require explicit dev admin flag
   if (process.env.NODE_ENV === "development" && !process.env.REQUIRE_ADMIN_IN_DEV) {
     return null;
   }
   ```

#### **Phase 2: Consistency Fixes (Short-term)**

4. **Standardize Admin Field Name:**
   - Decide on single field name: `is_admin` OR `admin`
   - Update database function to match code
   - OR update code to match database function
   - **Recommendation:** Use `is_admin` (more explicit)

5. **Add Admin Helper to MOBILE:**
   - Create `MOBILE/lib/auth/requireAdmin.ts`
   - Use same pattern as vella-control

#### **Phase 3: Enhanced Security (Medium-term)**

6. **Add Rate Limiting:**
   - Rate limit admin login attempts
   - Rate limit admin API routes

7. **Add Audit Logging:**
   - Log all admin actions (already partially done via `admin_activity_log`)
   - Log failed authentication attempts
   - Log authorization failures

8. **Add Admin Status Verification:**
   - Migration script to verify admin users have correct metadata
   - Health check endpoint to verify admin status consistency

### E3. Recommended Final Model

**Core Principles:**
1. **Single Source of Truth:** Admin status stored in `user_metadata.is_admin` (boolean)
2. **Defense in Depth:** Middleware + API route checks
3. **No Development Bypass:** Always require admin in production, optional in dev with explicit flag
4. **Consistent Helpers:** Same `requireAdmin()` pattern across all apps
5. **RLS Alignment:** Database function matches code field name

**Implementation:**
```typescript
// Standard requireAdmin() helper (all apps)
export async function requireAdmin(): Promise<NextResponse | null> {
  // Only bypass in dev if explicitly allowed
  const devBypass = process.env.NODE_ENV === "development" 
    && process.env.ALLOW_DEV_ADMIN_BYPASS === "true";
  
  if (devBypass) {
    console.warn("[requireAdmin] Development bypass enabled");
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Use consistent field name
  const isAdmin = user.user_metadata?.is_admin === true;

  if (!isAdmin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return null; // Authorized
}
```

**Database Function:**
```sql
create or replace function public.is_admin_user()
returns boolean as $$
begin
  return exists (
    select 1
    from auth.users
    where id = auth.uid()
    and (raw_user_meta_data->>'is_admin')::boolean = true
  );
end;
$$ language plpgsql security definer;
```

---

## F. Summary of Findings

### Protected Routes ✅
- 13/14 vella-control admin API routes
- All vella-control pages (via middleware)
- Login route (validates admin after login)

### Unprotected Routes ❌
- 1 vella-control admin API route (`/api/admin/tokens/list`)
- 3 MOBILE admin API routes (all unprotected)

### Critical Issues 🔴
1. Development mode bypasses all auth
2. Token usage route unprotected
3. MOBILE admin routes unprotected
4. Admin field name inconsistency

### Recommended Actions
1. **Immediate:** Add `requireAdmin()` to unprotected routes
2. **Immediate:** Fix development mode bypass
3. **Short-term:** Standardize admin field name
4. **Short-term:** Add admin helper to MOBILE
5. **Medium-term:** Add rate limiting and audit logging

---

## Appendix: File Reference

### Key Files Reviewed
- `apps/vella-control/lib/auth/requireAdmin.ts`
- `apps/vella-control/middleware.ts`
- `apps/vella-control/app/api/admin/**/*.ts` (14 routes)
- `MOBILE/app/api/admin/**/*.ts` (3 routes)
- `supabase/migrations/20250101000000_vella_core_admin.sql`

### Auth Flow Diagram
```
User Request
    ↓
Middleware (vella-control only)
    ├─ Development? → Allow all
    ├─ Not authenticated? → Redirect to /login
    ├─ Not admin? → Redirect to /login
    └─ Admin? → Continue
        ↓
API Route
    ├─ requireAdmin() check
    │   ├─ Development? → Allow all
    │   ├─ Not authenticated? → 401
    │   ├─ Not admin? → 401
    │   └─ Admin? → Continue
    └─ Route handler
```

---

**End of Report**


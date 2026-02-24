# Phase A — Admin Authentication Fixes: Modification Map

**Date:** 2025-11-30  
**Type:** READ-ONLY Mapping Pass  
**Status:** Preparation for Phase A fixes

---

## Table of Contents

1. [File Contents with Line Numbers](#file-contents)
2. [Modification Points](#modification-points)
3. [Database Function Analysis](#database-function)
4. [Safe Modification Zones](#safe-zones)
5. [Implementation Checklist](#checklist)

---

## 1. File Contents with Line Numbers

### File 1: `apps/vella-control/lib/auth/requireAdmin.ts`

```typescript
  1|import { NextResponse } from "next/server";
  2|import { createServerSupabaseClient } from "@/lib/supabase/server";
  3|
  4|/**
  5| * Require admin authentication for API routes.
  6| * Returns null if authorized, or a NextResponse with error if not.
  7| */
  8|export async function requireAdmin(): Promise<NextResponse | null> {
  9|  // Allow all requests in development
 10|  if (process.env.NODE_ENV === "development") {
 11|    return null;
 12|  }
 13|
 14|  try {
 15|    const supabase = createServerSupabaseClient();
 16|    const {
 17|      data: { user },
 18|      error,
 19|    } = await supabase.auth.getUser();
 20|
 21|    if (error || !user) {
 22|      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
 23|    }
 24|
 25|    const isAdmin = user.user_metadata?.is_admin === true;
 25|
 27|    if (!isAdmin) {
 28|      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
 29|    }
 30|
 31|    return null; // Authorized
 32|  } catch (error) {
 33|    console.error("[requireAdmin] Auth check failed", error);
 34|    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
 35|  }
 36|}
 37|
 38|
```

**Total Lines:** 38

---

### File 2: `apps/vella-control/middleware.ts`

```typescript
  1|import { NextResponse } from "next/server";
  2|import type { NextRequest } from "next/server";
  3|import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
  4|
  5|export async function middleware(request: NextRequest) {
  6|  const { pathname } = request.nextUrl;
  7|
  8|  // Allow all requests in development
  9|  if (process.env.NODE_ENV === "development") {
 10|    return NextResponse.next();
 11|  }
  12|
 13|  // Allow public routes
 14|  if (
 15|    pathname === "/login" ||
 16|    pathname.startsWith("/api/auth/") ||
 17|    pathname.startsWith("/_next/") ||
 18|    pathname.startsWith("/favicon.ico") ||
 19|    pathname.startsWith("/assets/")
 20|  ) {
 21|    return NextResponse.next();
 22|  }
 23|
 24|  // Check authentication for all other routes
 25|  try {
 26|    // Create a response object to set cookies
 27|    const response = NextResponse.next();
 28|    const supabase = createServerComponentClient({
 29|      cookies: () => request.cookies,
 30|    });
 31|    
 32|    const {
 33|      data: { user },
 34|      error,
 35|    } = await supabase.auth.getUser();
 35|
 37|    if (error || !user) {
 38|      // Not authenticated, redirect to login
 39|      const loginUrl = new URL("/login", request.url);
 40|      loginUrl.searchParams.set("redirect", pathname);
 41|      return NextResponse.redirect(loginUrl);
 42|    }
 43|
 44|    // Check if user is admin
 45|    const isAdmin = user.user_metadata?.is_admin === true;
 46|
 47|    if (!isAdmin) {
 48|      // Not an admin, redirect to login
 49|      const loginUrl = new URL("/login", request.url);
 50|      loginUrl.searchParams.set("error", "unauthorized");
 51|      return NextResponse.redirect(loginUrl);
 52|    }
 53|
 54|    // User is authenticated and is admin, allow request
 55|    return response;
 56|  } catch (error) {
 57|    console.error("[middleware] Auth check failed", error);
 58|    // On error, redirect to login
 59|    const loginUrl = new URL("/login", request.url);
 60|    return NextResponse.redirect(loginUrl);
 61|  }
 62|}
 63|
 64|export const config = {
 65|  matcher: [
 66|    /*
 67|     * Match all request paths except for the ones starting with:
 68|     * - _next/static (static files)
 69|     * - _next/image (image optimization files)
 70|     * - favicon.ico (favicon file)
 71|     */
 72|    "/((?!_next/static|_next/image|favicon.ico).*)",
 73|  ],
 74|};
 75|
 76|
```

**Total Lines:** 76

---

### File 3: `apps/vella-control/app/api/admin/tokens/list/route.ts`

```typescript
  1|import { NextResponse } from "next/server";
  2|
  3|import { supabaseAdmin } from "@/lib/supabase/admin";
  4|
  5|export async function GET() {
  6|  try {
  7|    const { data, error } = await supabaseAdmin
  8|      .from("token_usage")
  9|      .select("*")
 10|      .order("used_at", { ascending: false });
 11|
 12|    return NextResponse.json({ data, error });
 13|  } catch (err: any) {
 14|    console.error("[admin/tokens/list] unexpected error", err);
 15|    return NextResponse.json(
 16|      {
 17|        data: null,
 18|        error: { message: err?.message ?? "unexpected_error" },
 19|      },
 20|      { status: 500 },
 21|    );
 22|  }
 23|}
```

**Total Lines:** 23

---

### File 4: `MOBILE/app/api/admin/policy/route.ts`

```typescript
  1|import { NextResponse } from "next/server";
  2|import { requireUserId } from "@/lib/supabase/server-auth";
  3|import { loadAdminUserPolicy, loadAdminRuntimeLimits } from "@/lib/admin/adminPolicy";
  4|
  5|export async function GET() {
  6|  try {
  7|    const userId = await requireUserId();
  8|    const [policy, limits] = await Promise.all([
  9|      loadAdminUserPolicy(userId),
 10|      loadAdminRuntimeLimits(userId),
 11|    ]);
 12|
 13|     return NextResponse.json(
 14|      {
 15|        success: true,
 16|        policy,
 17|        limits,
 18|      },
 19|      { status: 200 },
 20|    );
 21|  } catch (error) {
 22|    console.error("[api/admin/policy] Error loading admin policy", error);
 23|    // Return safe defaults on error
 24|    return NextResponse.json(
 25|      {
 26|        success: false,
 27|        error: "Failed to load admin policy",
 28|        policy: null,
 29|        limits: null,
 30|      },
 31|      { status: 200 }, // Return 200 so client can handle gracefully
 32|    );
 33|  }
 34|}
 35|
 36|
```

**Total Lines:** 36

---

### File 5: `MOBILE/app/api/admin/runtime/tuning/route.ts`

```typescript
  1|import { NextResponse } from "next/server";
  2|import { loadRuntimeTuning } from "@/lib/admin/runtimeTuning";
  3|
  4|/**
  5| * Dev-only endpoint to expose runtime tuning for diagnostic purposes.
  6| * Returns the active RuntimeTuning that Vella is using.
  7| */
  8|export async function GET() {
  9|  try {
 10|    const tuning = await loadRuntimeTuning();
 11|    return NextResponse.json(
 12|      {
 13|        success: true,
 14|        tuning,
 15|      },
 16|      { status: 200 },
 17|    );
 18|  } catch (error) {
 19|    console.error("[api/admin/runtime/tuning] Error loading tuning", error);
 20|    return NextResponse.json(
 21|      {
 22|        success: false,
 23|        error: "Failed to load runtime tuning",
 24|        tuning: null,
 25|      },
 26|      { status: 200 },
 27|    );
 28|  }
 29|}
 30|
 31|
```

**Total Lines:** 31

---

### File 6: `MOBILE/app/api/admin/runtime/ai-config-preview/route.ts`

```typescript
  1|import { NextResponse } from "next/server";
  2|import { loadActiveAdminAIConfig } from "@/lib/admin/adminConfig";
  3|
  4|/**
  5| * Debug endpoint to verify admin AI config wiring.
  6| * Returns the merged config that Vella would use.
  7| * This endpoint is read-only and does not require authentication (for now).
  8| */
  9|export async function GET() {
 10|  try {
 11|    const config = await loadActiveAdminAIConfig();
 12|
 13|    return NextResponse.json(
 14|      {
 15|        success: true,
 16|        config,
 17|      },
 18|      { status: 200 },
 19|    );
 20|  } catch (error) {
 21|    // Never throw - always return a response
 22|    console.error("[api/admin/runtime/ai-config-preview] Error loading config", error);
 23|    return NextResponse.json(
 24|      {
 25|        success: false,
 26|        error: "Failed to load admin AI config, returning defaults.",
 27|        config: null,
 28|      },
 29|      { status: 200 },
 30|    );
 31|  }
 32|}
 33|
 34|
```

**Total Lines:** 34

---

### File 7: `MOBILE/lib/supabase/server-auth.ts`

```typescript
  1|// Dynamic import to prevent server-only code from being analyzed during build
  2|// This file is only used in API routes (server-only), but Next.js analyzes the import chain
  3|
  4|export class UnauthenticatedError extends Error {
  5|  constructor(message = "Unauthenticated") {
  6|    super(message);
  7|    this.name = "UnauthenticatedError";
  8|  }
  9|}
 10|
 11|export async function requireUserId(): Promise<string> {
 12|  const { createServerSupabaseClient } = await import("@/lib/supabase/server");
 13|  const supabase = await createServerSupabaseClient();
 14|  const {
 15|    data: { user },
 16|    error,
 17|  } = await supabase.auth.getUser();
 18|
 19|  if (error) {
 20|    console.error("[auth] Supabase auth error in requireUserId", error);
 21|    throw new UnauthenticatedError(`Authentication failed: ${error.message}`);
 22|  }
 24|  if (!user) {
 25|    throw new UnauthenticatedError("No authenticated user");
 26|  }
 27|
 28|  return user.id;
 29|}
 30|
 31|
```

**Total Lines:** 31

---

## 2. Modification Points

### A. Adding requireAdmin() Calls

#### File: `apps/vella-control/app/api/admin/tokens/list/route.ts`

**Insertion Point 1: Import Statement**
- **Location:** After line 1, before line 3
- **Action:** Add import for `requireAdmin`
- **Exact Insertion:**
  ```typescript
  import { requireAdmin } from "@/lib/auth/requireAdmin";
  ```

**Insertion Point 2: Function Body**
- **Location:** After line 5 (function signature), before line 6 (try block)
- **Action:** Add `requireAdmin()` check
- **Exact Insertion:**
  ```typescript
  const authError = await requireAdmin();
  if (authError) return authError;
  ```

---

#### File: `MOBILE/app/api/admin/policy/route.ts`

**Insertion Point 1: Import Statement**
- **Location:** After line 2, before line 3
- **Action:** Add import for `requireAdmin` (will need to create helper first)
- **Exact Insertion:**
  ```typescript
  import { requireAdmin } from "@/lib/auth/requireAdmin";
  ```

**Insertion Point 2: Function Body**
- **Location:** After line 5 (function signature), before line 6 (try block)
- **Action:** Add `requireAdmin()` check before `requireUserId()`
- **Exact Insertion:**
  ```typescript
  const authError = await requireAdmin();
  if (authError) return authError;
  ```

---

#### File: `MOBILE/app/api/admin/runtime/tuning/route.ts`

**Insertion Point 1: Import Statement**
- **Location:** After line 1, before line 2
- **Action:** Add import for `requireAdmin`
- **Exact Insertion:**
  ```typescript
  import { requireAdmin } from "@/lib/auth/requireAdmin";
  ```

**Insertion Point 2: Function Body**
- **Location:** After line 8 (function signature), before line 9 (try block)
- **Action:** Add `requireAdmin()` check
- **Exact Insertion:**
  ```typescript
  const authError = await requireAdmin();
  if (authError) return authError;
  ```

---

#### File: `MOBILE/app/api/admin/runtime/ai-config-preview/route.ts`

**Insertion Point 1: Import Statement**
- **Location:** After line 1, before line 2
- **Action:** Add import for `requireAdmin`
- **Exact Insertion:**
  ```typescript
  import { requireAdmin } from "@/lib/auth/requireAdmin";
  ```

**Insertion Point 2: Function Body**
- **Location:** After line 9 (function signature), before line 10 (try block)
- **Action:** Add `requireAdmin()` check
- **Exact Insertion:**
  ```typescript
  const authError = await requireAdmin();
  if (authError) return authError;
  ```

---

### B. Fixing Development-Mode Bypass

#### File: `apps/vella-control/lib/auth/requireAdmin.ts`

**Modification Point 1: Development Bypass Logic**
- **Location:** Lines 9-12
- **Current Code:**
  ```typescript
  // Allow all requests in development
  if (process.env.NODE_ENV === "development") {
    return null;
  }
  ```
- **Action:** Replace with explicit dev flag check
- **Replacement:**
  ```typescript
  // Only bypass in dev if explicitly allowed
  const devBypass = process.env.NODE_ENV === "development" 
    && process.env.ALLOW_DEV_ADMIN_BYPASS === "true";
  
  if (devBypass) {
    console.warn("[requireAdmin] Development bypass enabled");
    return null;
  }
  ```

---

#### File: `apps/vella-control/middleware.ts`

**Modification Point 1: Development Bypass Logic**
- **Location:** Lines 8-11
- **Current Code:**
  ```typescript
  // Allow all requests in development
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }
  ```
- **Action:** Replace with explicit dev flag check
- **Replacement:**
  ```typescript
  // Only bypass in dev if explicitly allowed
  const devBypass = process.env.NODE_ENV === "development" 
    && process.env.ALLOW_DEV_ADMIN_BYPASS === "true";
  
  if (devBypass) {
    console.warn("[middleware] Development bypass enabled");
    return NextResponse.next();
  }
  ```

---

### C. Fixing Admin Field Name Mismatch

#### File: `apps/vella-control/lib/auth/requireAdmin.ts`

**Modification Point 1: Admin Check**
- **Location:** Line 25
- **Current Code:**
  ```typescript
  const isAdmin = user.user_metadata?.is_admin === true;
  ```
- **Action:** Keep as-is (code uses `is_admin`, which is correct)
- **Note:** Database function needs to be updated to match

#### File: `apps/vella-control/middleware.ts`

**Modification Point 1: Admin Check**
- **Location:** Line 45
- **Current Code:**
  ```typescript
  const isAdmin = user.user_metadata?.is_admin === true;
  ```
- **Action:** Keep as-is (code uses `is_admin`, which is correct)
- **Note:** Database function needs to be updated to match

---

### D. Creating MOBILE requireAdmin Helper

**New File:** `MOBILE/lib/auth/requireAdmin.ts`

**Action:** Create new file with same structure as vella-control version, but using MOBILE's Supabase client pattern.

**Content Structure:**
- Import from `@/lib/supabase/server` (MOBILE pattern)
- Use same logic as vella-control version
- Apply same dev bypass fix

---

## 3. Database Function Analysis

### Current Function Definition

**Location:** `supabase/migrations/20250101000000_vella_core_admin.sql` (lines 223-235)

```sql
-- Helper function to check if user is admin (via user_metadata.admin flag)
create or replace function public.is_admin_user()
returns boolean as $$
begin
  -- Service role bypasses RLS, so this function is for authenticated users
  -- Check if user exists in user_metadata with admin = true
  return exists (
    select 1
    from public.user_metadata
    where user_id = auth.uid()
    and admin = true
  );
end;
$$ language plpgsql security definer;
```

**Issue:** Function checks `admin = true`, but code uses `is_admin`.

**Also Found In:**
- `supabase/rebuild_migration_engine.sql` (lines 502-510) - Same definition

### Safe Modification Location

**⚠️ IMPORTANT:** Database functions should be modified via **new migration**, not by editing existing migrations.

**Recommended Approach:**
1. Create new migration file: `supabase/migrations/[timestamp]_fix_is_admin_user_function.sql`
2. Update function to check `is_admin` instead of `admin`
3. OR update function to check Supabase Auth `user_metadata.is_admin` directly

**Alternative Direct Update Location (NOT RECOMMENDED):**
- `supabase/rebuild_migration_engine.sql` (line 502-510)
  - **Risk:** This file may be regenerated
  - **Use Case:** Only for immediate testing, must be followed by proper migration

**Recommended Function Fix:**
```sql
create or replace function public.is_admin_user()
returns boolean as $$
begin
  -- Check Supabase Auth user_metadata.is_admin directly
  return (
    select (raw_user_meta_data->>'is_admin')::boolean = true
    from auth.users
    where id = auth.uid()
  );
end;
$$ language plpgsql security definer;
```

---

## 4. Safe Modification Zones

### File: `apps/vella-control/lib/auth/requireAdmin.ts`

| Lines | Status | Modification Type | Notes |
|-------|--------|-------------------|-------|
| 1-2 | ✅ Safe | Import statements | No changes needed |
| 4-7 | ❌ DO NOT TOUCH | JSDoc comments | Preserve documentation |
| 8 | ❌ DO NOT TOUCH | Function signature | Must remain unchanged |
| 9-12 | ✅ **MODIFY** | Dev bypass logic | Replace with explicit flag check |
| 14-19 | ❌ DO NOT TOUCH | Supabase client creation | Core logic |
| 21-23 | ❌ DO NOT TOUCH | Error handling | Core logic |
| 25 | ⚠️ REVIEW | Admin check | Keep as-is (uses `is_admin`) |
| 27-29 | ❌ DO NOT TOUCH | Authorization check | Core logic |
| 31 | ❌ DO NOT TOUCH | Return statement | Core logic |
| 32-35 | ❌ DO NOT TOUCH | Error handling | Core logic |

**Safe Zone:** Lines 9-12 only

---

### File: `apps/vella-control/middleware.ts`

| Lines | Status | Modification Type | Notes |
|-------|--------|-------------------|-------|
| 1-3 | ✅ Safe | Import statements | No changes needed |
| 5 | ❌ DO NOT TOUCH | Function signature | Must remain unchanged |
| 6 | ❌ DO NOT TOUCH | Pathname extraction | Core logic |
| 8-11 | ✅ **MODIFY** | Dev bypass logic | Replace with explicit flag check |
| 13-22 | ❌ DO NOT TOUCH | Public route checks | Core logic |
| 24-30 | ❌ DO NOT TOUCH | Supabase client creation | Core logic |
| 32-35 | ❌ DO NOT TOUCH | Auth check | Core logic |
| 37-42 | ❌ DO NOT TOUCH | Redirect logic | Core logic |
| 44-45 | ⚠️ REVIEW | Admin check | Keep as-is (uses `is_admin`) |
| 47-52 | ❌ DO NOT TOUCH | Redirect logic | Core logic |
| 54-55 | ❌ DO NOT TOUCH | Return statement | Core logic |
| 56-61 | ❌ DO NOT TOUCH | Error handling | Core logic |
| 64-74 | ❌ DO NOT TOUCH | Config export | Must remain unchanged |

**Safe Zone:** Lines 8-11 only

---

### File: `apps/vella-control/app/api/admin/tokens/list/route.ts`

| Lines | Status | Modification Type | Notes |
|-------|--------|-------------------|-------|
| 1 | ✅ Safe | Import statement | Add requireAdmin import here |
| 2 | ❌ DO NOT TOUCH | Empty line | Preserve formatting |
| 3 | ❌ DO NOT TOUCH | Existing import | Do not modify |
| 4 | ❌ DO NOT TOUCH | Empty line | Preserve formatting |
| 5 | ❌ DO NOT TOUCH | Function signature | Must remain unchanged |
| 6-22 | ❌ DO NOT TOUCH | Function body | Add requireAdmin check at start |

**Safe Zones:**
- Line 1: Add import
- After line 5: Add requireAdmin check

---

### File: `MOBILE/app/api/admin/policy/route.ts`

| Lines | Status | Modification Type | Notes |
|-------|--------|-------------------|-------|
| 1 | ✅ Safe | Import statement | No changes |
| 2 | ✅ Safe | Import statement | Add requireAdmin import after this |
| 3 | ❌ DO NOT TOUCH | Existing import | Do not modify |
| 4 | ❌ DO NOT TOUCH | Empty line | Preserve formatting |
| 5 | ❌ DO NOT TOUCH | Function signature | Must remain unchanged |
| 6-33 | ❌ DO NOT TOUCH | Function body | Add requireAdmin check at start |

**Safe Zones:**
- After line 2: Add import
- After line 5: Add requireAdmin check

---

### File: `MOBILE/app/api/admin/runtime/tuning/route.ts`

| Lines | Status | Modification Type | Notes |
|-------|--------|-------------------|-------|
| 1 | ✅ Safe | Import statement | Add requireAdmin import after this |
| 2 | ❌ DO NOT TOUCH | Existing import | Do not modify |
| 3-7 | ❌ DO NOT TOUCH | JSDoc comments | Preserve documentation |
| 8 | ❌ DO NOT TOUCH | Function signature | Must remain unchanged |
| 9-28 | ❌ DO NOT TOUCH | Function body | Add requireAdmin check at start |

**Safe Zones:**
- After line 1: Add import
- After line 8: Add requireAdmin check

---

### File: `MOBILE/app/api/admin/runtime/ai-config-preview/route.ts`

| Lines | Status | Modification Type | Notes |
|-------|--------|-------------------|-------|
| 1 | ✅ Safe | Import statement | Add requireAdmin import after this |
| 2 | ❌ DO NOT TOUCH | Existing import | Do not modify |
| 3-8 | ❌ DO NOT TOUCH | JSDoc comments | Preserve documentation |
| 9 | ❌ DO NOT TOUCH | Function signature | Must remain unchanged |
| 10-31 | ❌ DO NOT TOUCH | Function body | Add requireAdmin check at start |

**Safe Zones:**
- After line 1: Add import
- After line 9: Add requireAdmin check

---

### File: `MOBILE/lib/supabase/server-auth.ts`

| Lines | Status | Modification Type | Notes |
|-------|--------|-------------------|-------|
| 1-9 | ❌ DO NOT TOUCH | File header and class | Core structure |
| 11-29 | ❌ DO NOT TOUCH | requireUserId function | Core logic, do not modify |

**Safe Zone:** None (reference only)

---

### New File: `MOBILE/lib/auth/requireAdmin.ts`

**Action:** Create new file
**Location:** `MOBILE/lib/auth/requireAdmin.ts`
**Content:** Copy from vella-control version, adapt for MOBILE Supabase client pattern

---

## 5. Implementation Checklist

### Phase A.1: Fix Development Mode Bypass

- [ ] **File:** `apps/vella-control/lib/auth/requireAdmin.ts`
  - [ ] Replace lines 9-12 with explicit dev flag check
  - [ ] Test: Verify bypass only works with `ALLOW_DEV_ADMIN_BYPASS=true`

- [ ] **File:** `apps/vella-control/middleware.ts`
  - [ ] Replace lines 8-11 with explicit dev flag check
  - [ ] Test: Verify bypass only works with `ALLOW_DEV_ADMIN_BYPASS=true`

---

### Phase A.2: Add Missing requireAdmin() Calls

- [ ] **File:** `apps/vella-control/app/api/admin/tokens/list/route.ts`
  - [ ] Add import at line 1 (after existing import)
  - [ ] Add requireAdmin check after line 5
  - [ ] Test: Verify route returns 401 for non-admin users

- [ ] **File:** `MOBILE/lib/auth/requireAdmin.ts`
  - [ ] Create new file
  - [ ] Copy structure from vella-control version
  - [ ] Adapt for MOBILE Supabase client imports
  - [ ] Apply dev bypass fix

- [ ] **File:** `MOBILE/app/api/admin/policy/route.ts`
  - [ ] Add import after line 2
  - [ ] Add requireAdmin check after line 5
  - [ ] Test: Verify route returns 401 for non-admin users

- [ ] **File:** `MOBILE/app/api/admin/runtime/tuning/route.ts`
  - [ ] Add import after line 1
  - [ ] Add requireAdmin check after line 8
  - [ ] Test: Verify route returns 401 for non-admin users

- [ ] **File:** `MOBILE/app/api/admin/runtime/ai-config-preview/route.ts`
  - [ ] Add import after line 1
  - [ ] Add requireAdmin check after line 9
  - [ ] Test: Verify route returns 401 for non-admin users

---

### Phase A.3: Database Function Fix (Separate Task)

- [ ] **Create Migration:** `supabase/migrations/[timestamp]_fix_is_admin_user_function.sql`
  - [ ] Update function to check `is_admin` from `auth.users.raw_user_meta_data`
  - [ ] Test: Verify function works with `user_metadata.is_admin = true`
  - [ ] Deploy migration

---

## 6. Exact Code Insertions

### Insertion 1: `apps/vella-control/app/api/admin/tokens/list/route.ts`

**After line 1:**
```typescript
import { requireAdmin } from "@/lib/auth/requireAdmin";
```

**After line 5:**
```typescript
  const authError = await requireAdmin();
  if (authError) return authError;
```

---

### Insertion 2: `MOBILE/app/api/admin/policy/route.ts`

**After line 2:**
```typescript
import { requireAdmin } from "@/lib/auth/requireAdmin";
```

**After line 5:**
```typescript
  const authError = await requireAdmin();
  if (authError) return authError;
```

---

### Insertion 3: `MOBILE/app/api/admin/runtime/tuning/route.ts`

**After line 1:**
```typescript
import { requireAdmin } from "@/lib/auth/requireAdmin";
```

**After line 8:**
```typescript
  const authError = await requireAdmin();
  if (authError) return authError;
```

---

### Insertion 4: `MOBILE/app/api/admin/runtime/ai-config-preview/route.ts`

**After line 1:**
```typescript
import { requireAdmin } from "@/lib/auth/requireAdmin";
```

**After line 9:**
```typescript
  const authError = await requireAdmin();
  if (authError) return authError;
```

---

### Replacement 1: `apps/vella-control/lib/auth/requireAdmin.ts`

**Replace lines 9-12 with:**
```typescript
  // Only bypass in dev if explicitly allowed
  const devBypass = process.env.NODE_ENV === "development" 
    && process.env.ALLOW_DEV_ADMIN_BYPASS === "true";
  
  if (devBypass) {
    console.warn("[requireAdmin] Development bypass enabled");
    return null;
  }
```

---

### Replacement 2: `apps/vella-control/middleware.ts`

**Replace lines 8-11 with:**
```typescript
  // Only bypass in dev if explicitly allowed
  const devBypass = process.env.NODE_ENV === "development" 
    && process.env.ALLOW_DEV_ADMIN_BYPASS === "true";
  
  if (devBypass) {
    console.warn("[middleware] Development bypass enabled");
    return NextResponse.next();
  }
```

---

## 7. Summary

### Files to Modify

1. ✅ `apps/vella-control/lib/auth/requireAdmin.ts` - Fix dev bypass
2. ✅ `apps/vella-control/middleware.ts` - Fix dev bypass
3. ✅ `apps/vella-control/app/api/admin/tokens/list/route.ts` - Add requireAdmin
4. ✅ `MOBILE/lib/auth/requireAdmin.ts` - **CREATE NEW FILE**
5. ✅ `MOBILE/app/api/admin/policy/route.ts` - Add requireAdmin
6. ✅ `MOBILE/app/api/admin/runtime/tuning/route.ts` - Add requireAdmin
7. ✅ `MOBILE/app/api/admin/runtime/ai-config-preview/route.ts` - Add requireAdmin

### Database Function

- ⚠️ Create new migration to fix `is_admin_user()` function
- Function currently checks `admin`, should check `is_admin`

### Total Changes

- **7 files** to modify/create
- **1 database migration** to create (separate task)
- **Minimal, surgical changes** - only adding imports and auth checks

---

**End of Modification Map**


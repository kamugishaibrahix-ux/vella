# STRIPE INTEGRATION AUDIT REPORT

**Date:** 2025-01-XX  
**Scope:** Complete repository scan for Stripe SDK, subscriptions, token packs, webhooks, and related infrastructure  
**Status:** READ-ONLY AUDIT (No files modified)

---

## 1. FILES REFERENCING STRIPE

### Core Stripe Implementation Files

#### ✅ `MOBILE/lib/payments/stripe.ts`
- **Status:** ✅ **IMPLEMENTED** (Production-ready)
- **Purpose:** Core Stripe client initialization and plan configuration
- **Key Features:**
  - Initializes Stripe client with `STRIPE_SECRET_KEY`
  - Exports `PLAN_PRICE_IDS` mapping (`free`, `pro`, `elite`)
  - Gracefully handles missing secret key (returns `null`, logs warning)
- **Environment Variables:**
  - `STRIPE_SECRET_KEY` (required)
  - `STRIPE_PRICE_PRO` (optional, for pro plan)
  - `STRIPE_PRICE_ELITE` (optional, for elite plan)
- **Issues:** None identified

#### ✅ `MOBILE/app/api/stripe/webhook/route.ts`
- **Status:** ✅ **IMPLEMENTED** (Production-ready)
- **Purpose:** Stripe webhook handler for subscription lifecycle events
- **Key Features:**
  - Handles `checkout.session.completed`
  - Handles `customer.subscription.updated`
  - Handles `customer.subscription.deleted`
  - Validates webhook signatures using `STRIPE_WEBHOOK_SECRET`
  - Syncs subscription state to `public.subscriptions` table
  - Maps Stripe price IDs to internal plan IDs
- **User Identification:**
  - Uses `client_reference_id` OR `metadata.user_id` OR `metadata.supabase_user_id`
  - Falls back to customer ID lookup if user ID not in metadata
- **Database Operations:**
  - Uses `safeInsert` and `safeUpdate` (metadata-only writes)
  - Updates `subscriptions` table with plan, status, periods, Stripe IDs
- **Environment Variables:**
  - `STRIPE_WEBHOOK_SECRET` (required)
- **Issues:** None identified

#### ✅ `MOBILE/app/api/stripe/create-checkout-session/route.ts`
- **Status:** ✅ **IMPLEMENTED** (Production-ready)
- **Purpose:** Creates Stripe Checkout sessions for subscription upgrades
- **Key Features:**
  - Accepts `plan` (`pro` or `elite`) and optional `email`
  - Creates subscription-mode checkout session
  - Returns checkout URL
  - Success/cancel URLs configured
- **Missing:** 
  - ❌ **CRITICAL:** Does NOT set `client_reference_id` or `metadata.user_id` in checkout session
  - This means webhook handler may not be able to associate checkout with user
- **Environment Variables:** None (uses `PLAN_PRICE_IDS` from `stripe.ts`)
- **Issues:** 
  - ⚠️ **HIGH PRIORITY:** Missing user metadata in checkout session creation

#### ✅ `MOBILE/app/api/stripe/portal/route.ts`
- **Status:** ✅ **IMPLEMENTED** (Production-ready)
- **Purpose:** Creates Stripe Billing Portal sessions
- **Key Features:**
  - Accepts `customerId` and optional `returnPath`
  - Creates billing portal session
  - Returns portal URL
- **Issues:** None identified

#### ❌ `MOBILE/app/api/stripe/token-pack/route.ts`
- **Status:** ❌ **MISSING** (Referenced but does not exist)
- **Referenced In:**
  - `MOBILE/app/settings/account-plan/page.tsx:129` - `createTokenPackCheckout()` function
  - `MOBILE/INTEGRITY_AUDIT_REPORT.md:191` - Documented as missing
- **Expected Functionality:**
  - Should create Stripe Checkout session for one-time token pack purchases
  - Should accept `packId` (`pack_small`, `pack_medium`, `pack_large`)
  - Should create payment intent (not subscription)
  - Should set user metadata for webhook association
- **Impact:** Token pack purchase flow is broken
- **Issues:**
  - ⚠️ **CRITICAL:** Route does not exist, breaking token pack purchases

### UI Components

#### ✅ `MOBILE/app/settings/account-plan/page.tsx`
- **Status:** ✅ **IMPLEMENTED** (Production-ready)
- **Purpose:** Account plan management UI
- **Key Features:**
  - Displays current plan, status, token balance
  - Shows token usage history
  - Displays token pack purchase options
  - Calls `/api/stripe/token-pack` (missing route - see above)
  - Calls `/api/stripe/portal` for billing management
- **Token Pack Definitions:**
  - `pack_small`: 5,000 tokens, $4.99
  - `pack_medium`: 20,000 tokens, $14.99
  - `pack_large`: 100,000 tokens, $49.99
- **Issues:**
  - ⚠️ **HIGH PRIORITY:** References missing `/api/stripe/token-pack` route

#### ✅ `MOBILE/app/pricing/page.tsx`
- **Status:** ✅ **IMPLEMENTED** (Production-ready)
- **Purpose:** Public pricing page
- **Key Features:**
  - Displays Free/Pro/Elite tiers
  - Uses `PlanSwitcherModal` for plan selection
  - References token packs in feature descriptions
- **Issues:** None identified

#### ✅ `MOBILE/components/settings/PlanSwitcherModal.tsx`
- **Status:** ✅ **IMPLEMENTED** (Local-only, no Stripe integration)
- **Purpose:** Plan selection modal
- **Key Features:**
  - Allows switching between free/pro/elite plans
  - Updates local memory only (`updatePlan()`)
  - Does NOT trigger Stripe checkout
- **Issues:**
  - ⚠️ **INCONSISTENCY:** Modal allows plan switching without Stripe checkout
  - This is a local-only override, not a real subscription change
  - May confuse users who expect billing changes

### Hooks and Utilities

#### ✅ `MOBILE/lib/hooks/useAccountPlan.ts`
- **Status:** ✅ **IMPLEMENTED** (Production-ready)
- **Purpose:** React hook for fetching account plan and token data
- **Key Features:**
  - Fetches user profile from `profiles` table
  - Fetches subscription from `subscriptions` table
  - Calculates token usage from `token_usage` table
  - Returns plan status, periods, customer/subscription IDs
- **Database Queries:**
  - Uses `from("subscriptions")` with RLS
  - Uses `from("token_usage")` with RLS
- **Issues:** None identified

#### ✅ `MOBILE/lib/tiers/server.ts`
- **Status:** ✅ **IMPLEMENTED** (Production-ready)
- **Purpose:** Server-side plan tier resolution
- **Key Features:**
  - `getUserPlanTier()` - Fetches plan from `subscriptions` table
  - Uses `supabaseAdmin` for server-side queries
- **Issues:** None identified

#### ✅ `MOBILE/lib/tokens/getUserTokenState.ts`
- **Status:** ✅ **IMPLEMENTED** (Production-ready)
- **Purpose:** Token state calculation
- **Key Features:**
  - Calculates allocation, purchased packs, used, remaining
  - Queries `subscriptions` and `token_usage` tables
  - Handles period-based usage tracking
- **Issues:** None identified

### Test Files

#### ✅ `scripts/smoke/smokeStripeWiring.mjs`
- **Status:** ✅ **IMPLEMENTED** (Test harness)
- **Purpose:** Smoke tests for Stripe API routes
- **Key Features:**
  - Mocks Stripe SDK
  - Tests checkout session creation
  - Tests billing portal creation
- **Issues:** None identified

### Documentation References

#### ✅ `MOBILE/PREPROD_CHECKLIST.md`
- **Status:** ✅ **DOCUMENTED**
- **References:** Stripe env vars, test keys, webhook secret

#### ✅ `MOBILE/INTEGRITY_AUDIT_REPORT.md`
- **Status:** ✅ **DOCUMENTED**
- **References:** Missing token pack endpoint (line 191)

---

## 2. DATABASE SCHEMA

### Tables

#### ✅ `public.subscriptions`
- **Status:** ✅ **IMPLEMENTED**
- **Columns:**
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key to `auth.users`)
  - `plan` (text: "free" | "pro" | "elite")
  - `status` (text: subscription status)
  - `stripe_customer_id` (text, nullable)
  - `stripe_subscription_id` (text, nullable)
  - `monthly_token_allocation` (integer, nullable)
  - `monthly_token_allocation_used` (integer, nullable)
  - `token_balance` (integer, nullable) - purchased token packs
  - `current_period_start` (timestamp, nullable)
  - `current_period_end` (timestamp, nullable)
  - `created_at`, `updated_at` (timestamps)
- **RLS:** Enabled (users can read own subscriptions)
- **Issues:** None identified

#### ✅ `public.token_usage`
- **Status:** ✅ **IMPLEMENTED**
- **Columns:**
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key to `auth.users`)
  - `source` (text) - usage source identifier
  - `category` (text, nullable)
  - `tokens` (integer) - tokens consumed
  - `from_allocation` (boolean) - whether from monthly allocation or purchased pack
  - `created_at` (timestamp)
- **RLS:** Enabled (users can read own usage)
- **Issues:** None identified

#### ✅ `public.token_topups`
- **Status:** ✅ **IMPLEMENTED**
- **Columns:**
  - `id` (uuid, primary key)
  - `user_id` (uuid, foreign key to `auth.users`)
  - `amount` (numeric) - USD amount paid
  - `tokens` (integer) - tokens awarded
  - `stripe_payment_intent_id` (text, nullable) - Stripe payment intent ID
  - `created_at` (timestamp)
- **RLS:** Enabled (users can read own topups)
- **Issues:**
  - ⚠️ **MISSING:** No webhook handler for token pack purchases
  - Webhook should create `token_topups` row and update `subscriptions.token_balance`

---

## 3. ENVIRONMENT VARIABLES

### Required Variables

| Variable | Status | Used In | Notes |
|----------|--------|---------|-------|
| `STRIPE_SECRET_KEY` | ✅ Required | `lib/payments/stripe.ts` | Stripe API secret key (test or live) |
| `STRIPE_WEBHOOK_SECRET` | ✅ Required | `app/api/stripe/webhook/route.ts` | Webhook signature verification |
| `STRIPE_PRICE_PRO` | ⚠️ Optional | `lib/payments/stripe.ts` | Pro plan price ID (undefined if not set) |
| `STRIPE_PRICE_ELITE` | ⚠️ Optional | `lib/payments/stripe.ts` | Elite plan price ID (undefined if not set) |

### Missing from `.env.example`
- ❌ **ISSUE:** No `.env.example` file found in repository root
- **Recommendation:** Create `.env.example` with all Stripe variables documented

### Variable Usage Analysis

#### ✅ `STRIPE_SECRET_KEY`
- **Usage:** Initializes Stripe client
- **Handling:** Gracefully degrades to `null` if missing (logs warning)
- **Issues:** None

#### ✅ `STRIPE_WEBHOOK_SECRET`
- **Usage:** Webhook signature verification
- **Handling:** Returns 500 error if missing
- **Issues:** None

#### ⚠️ `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ELITE`
- **Usage:** Plan price ID mapping
- **Handling:** `undefined` if not set, which breaks checkout for those plans
- **Issues:**
  - ⚠️ **MEDIUM PRIORITY:** Checkout will fail if price IDs not configured
  - No validation that price IDs are set before allowing checkout

---

## 4. MISSING OR BROKEN PIECES

### Critical Issues

#### ❌ **MISSING: Token Pack Checkout Route**
- **File:** `MOBILE/app/api/stripe/token-pack/route.ts` (does not exist)
- **Impact:** Token pack purchases are completely broken
- **Referenced In:**
  - `MOBILE/app/settings/account-plan/page.tsx:129`
- **Required Implementation:**
  ```typescript
  // Expected structure:
  POST /api/stripe/token-pack
  Body: { packId: "pack_small" | "pack_medium" | "pack_large" }
  Response: { url: string } // Stripe Checkout URL
  ```
- **Required Features:**
  - Create one-time payment checkout session (not subscription)
  - Map `packId` to Stripe price ID
  - Set `client_reference_id` to user ID
  - Set `metadata.user_id` to user ID
  - Configure success/cancel URLs
  - Return checkout URL

#### ⚠️ **MISSING: Token Pack Webhook Handler**
- **Impact:** Token pack purchases won't update `token_topups` or `subscriptions.token_balance`
- **Required Implementation:**
  - Add handler for `payment_intent.succeeded` event in webhook route
  - Extract user ID from payment intent metadata
  - Create `token_topups` row
  - Update `subscriptions.token_balance` for user
  - Map payment amount to token count (5k/$4.99, 20k/$14.99, 100k/$49.99)

#### ⚠️ **MISSING: User Metadata in Checkout Session**
- **File:** `MOBILE/app/api/stripe/create-checkout-session/route.ts`
- **Issue:** Checkout session does not include `client_reference_id` or `metadata.user_id`
- **Impact:** Webhook handler may not be able to associate checkout with user
- **Required Fix:**
  ```typescript
  // Add to checkout session creation:
  client_reference_id: userId,
  metadata: {
    user_id: userId,
    supabase_user_id: userId,
  },
  ```

### Medium Priority Issues

#### ⚠️ **INCONSISTENCY: Plan Switcher Modal**
- **File:** `MOBILE/components/settings/PlanSwitcherModal.tsx`
- **Issue:** Allows plan switching without Stripe checkout
- **Impact:** Users may think they've upgraded, but no billing occurs
- **Recommendation:**
  - For non-free plans, trigger Stripe checkout instead of local-only update
  - Or clearly indicate this is a "preview" mode

#### ⚠️ **MISSING: Price ID Validation**
- **Issue:** No validation that `STRIPE_PRICE_PRO` and `STRIPE_PRICE_ELITE` are set
- **Impact:** Checkout will fail silently if price IDs missing
- **Recommendation:** Add validation in checkout route

### Low Priority Issues

#### ⚠️ **MISSING: Token Pack Price ID Configuration**
- **Issue:** Token pack prices are hardcoded in UI, not in env/config
- **Files:** `MOBILE/app/settings/account-plan/page.tsx:28-32`
- **Recommendation:** Move to config file or env variables

#### ⚠️ **MISSING: Error Handling for Missing Stripe Client**
- **Files:** Multiple API routes check `if (!stripe)` but could provide better UX
- **Recommendation:** Add user-friendly error messages

---

## 5. UNREACHABLE CODE PATHS

### None Identified
- All Stripe-related code paths appear reachable
- No commented-out Stripe code found
- No legacy implementations detected

---

## 6. UNUSED HELPERS

### None Identified
- All Stripe-related functions are used
- No duplicate implementations found

---

## 7. RECOMMENDATIONS FOR CLEAN STRIPE INTEGRATION

### Phase 1: Critical Fixes (Required for Production)

1. **Create Token Pack Checkout Route**
   - File: `MOBILE/app/api/stripe/token-pack/route.ts`
   - Implement one-time payment checkout
   - Set user metadata for webhook association
   - Map pack IDs to Stripe price IDs (create products in Stripe dashboard)

2. **Add Token Pack Webhook Handler**
   - File: `MOBILE/app/api/stripe/webhook/route.ts`
   - Add `payment_intent.succeeded` case
   - Create `token_topups` row
   - Update `subscriptions.token_balance`

3. **Fix Checkout Session User Metadata**
   - File: `MOBILE/app/api/stripe/create-checkout-session/route.ts`
   - Add `client_reference_id` and `metadata.user_id` to session creation
   - Ensure `requireUserId()` is called to get authenticated user ID

### Phase 2: Configuration & Validation

4. **Create `.env.example`**
   - Document all Stripe environment variables
   - Include placeholders for test keys
   - Add comments explaining each variable

5. **Add Price ID Validation**
   - Validate `STRIPE_PRICE_PRO` and `STRIPE_PRICE_ELITE` are set before checkout
   - Return clear error if missing

6. **Move Token Pack Config to Env/Config**
   - Extract hardcoded pack definitions to config file
   - Map pack IDs to Stripe price IDs
   - Store token amounts and prices in config

### Phase 3: UX Improvements

7. **Fix Plan Switcher Modal**
   - For paid plans, redirect to Stripe checkout instead of local-only update
   - Keep local-only mode for free plan or preview mode
   - Add clear messaging about billing changes

8. **Improve Error Handling**
   - Add user-friendly error messages for Stripe failures
   - Handle missing Stripe configuration gracefully
   - Provide fallback UI when Stripe unavailable

### Phase 4: Testing & Documentation

9. **Add Integration Tests**
   - Test checkout session creation with user metadata
   - Test webhook handlers for all event types
   - Test token pack purchase flow end-to-end

10. **Update Documentation**
    - Document Stripe setup process
    - Document webhook endpoint configuration
    - Document token pack pricing and configuration

---

## 8. SUMMARY

### Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Stripe Client | ✅ Complete | Gracefully handles missing key |
| Webhook Handler | ✅ Complete | Handles subscription events |
| Checkout Session | ⚠️ Partial | Missing user metadata |
| Billing Portal | ✅ Complete | Fully functional |
| Token Pack Checkout | ❌ Missing | Route does not exist |
| Token Pack Webhook | ❌ Missing | No handler for purchases |
| Database Schema | ✅ Complete | All tables present |
| UI Components | ✅ Complete | References missing route |
| Environment Config | ⚠️ Partial | Missing `.env.example` |

### Critical Blockers

1. ❌ **Token pack checkout route missing** - Blocks token pack purchases
2. ❌ **Token pack webhook handler missing** - Blocks token pack fulfillment
3. ⚠️ **User metadata missing in checkout** - May cause webhook association failures

### Overall Assessment

**Status:** ⚠️ **PARTIALLY IMPLEMENTED**

The core Stripe subscription flow is **production-ready**, but token pack purchases are **completely broken** due to missing routes and webhook handlers. The subscription webhook handler is well-implemented and handles all subscription lifecycle events correctly.

**Estimated Effort to Complete:**
- Critical fixes: 4-6 hours
- Configuration & validation: 2-3 hours
- UX improvements: 2-4 hours
- Testing & documentation: 3-5 hours
- **Total: 11-18 hours**

---

**END OF AUDIT REPORT**


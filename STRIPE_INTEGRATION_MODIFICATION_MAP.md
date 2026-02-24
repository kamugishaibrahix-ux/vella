# STRIPE INTEGRATION MODIFICATION MAP

**Date:** 2025-01-XX  
**Purpose:** Exact insertion points and safe modification zones for Stripe integration fixes  
**Status:** READ-ONLY MAPPING (No files modified)

---

## 1. CONFIRMED STRIPE API ROUTE FILE PATHS

### ✅ Existing Routes

| File Path | Status | Lines |
|-----------|--------|-------|
| `MOBILE/app/api/stripe/create-checkout-session/route.ts` | ✅ EXISTS | 48 lines |
| `MOBILE/app/api/stripe/webhook/route.ts` | ✅ EXISTS | 220 lines |
| `MOBILE/app/api/stripe/portal/route.ts` | ✅ EXISTS | 33 lines |

### ❌ Missing Route

| File Path | Status |
|-----------|--------|
| `MOBILE/app/api/stripe/token-pack/route.ts` | ❌ **DOES NOT EXIST** - Must be created |

---

## 2. CREATE-CHECKOUT-SESSION/ROUTE.TS - MODIFICATION POINTS

### File: `MOBILE/app/api/stripe/create-checkout-session/route.ts`

**Full File Content (48 lines):**
```typescript
1:  import { NextRequest } from "next/server";
2:  import { PLAN_PRICE_IDS, type PlanId, stripe } from "@/lib/payments/stripe";
3:
4:  export const runtime = "nodejs";
5:
6:  export async function POST(req: NextRequest) {
7:    if (!stripe) {
8:      return new Response("Stripe not configured", { status: 500 });
9:    }
10:
11:   const body = (await req.json().catch(() => null)) as { plan: PlanId; email?: string | null } | null;
12:
13:   const plan = body?.plan;
14:   if (!plan || plan === "free") {
15:     return new Response("Invalid plan", { status: 400 });
16:   }
17:
18:   const priceId = PLAN_PRICE_IDS[plan];
19:   if (!priceId) {
20:     return new Response("Missing price for plan", { status: 500 });
21:   }
22:
23:   const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
24:
25:   try {
26:     const session = await stripe.checkout.sessions.create({
27:       mode: "subscription",
28:       payment_method_types: ["card"],
29:       line_items: [
30:         {
31:           price: priceId,
32:           quantity: 1,
33:         },
34:       ],
35:       success_url: `${origin}/session?upgrade=success`,
36:       cancel_url: `${origin}/profile?upgrade=cancelled`,
37:       customer_email: body?.email ?? undefined,
38:       metadata: {},
39:     });
40:
41:     return Response.json({ url: session.url });
42:   } catch (err) {
43:     console.error("[stripe] create-checkout-session error", err);
44:     return new Response("Unable to create checkout session", { status: 500 });
45:   }
46: }
47:
48:
```

### Exact Modification Points

#### **MODIFICATION POINT 1: Add requireUserId Import**
- **Location:** Line 2 (after existing imports)
- **Action:** Add import statement
- **Exact Insertion:**
```typescript
import { requireUserId } from "@/lib/supabase/server-auth";
```

#### **MODIFICATION POINT 2: Add Authentication Call**
- **Location:** Line 6-9 (immediately after function signature, before stripe check)
- **Action:** Insert `requireUserId()` call
- **Exact Insertion Point:** After line 6, before line 7
- **Exact Code:**
```typescript
export async function POST(req: NextRequest) {
  const userId = await requireUserId();  // ← INSERT HERE
  
  if (!stripe) {
    return new Response("Stripe not configured", { status: 500 });
  }
```

#### **MODIFICATION POINT 3: Add client_reference_id**
- **Location:** Line 26-39 (inside `stripe.checkout.sessions.create()` call)
- **Action:** Add `client_reference_id` property
- **Exact Insertion Point:** After line 26, before line 27
- **Exact Code:**
```typescript
const session = await stripe.checkout.sessions.create({
  client_reference_id: userId,  // ← INSERT HERE
  mode: "subscription",
```

#### **MODIFICATION POINT 4: Update metadata Object**
- **Location:** Line 38 (replace empty metadata object)
- **Action:** Replace `metadata: {}` with user metadata
- **Exact Replacement:**
```typescript
metadata: {
  user_id: userId,
  supabase_user_id: userId,
},  // ← REPLACE LINE 38
```

### Context Around Metadata (50 lines above/below)

**Lines 1-48 (Full file shown above):**
- Line 38 is the metadata declaration
- Line 26-39 is the `stripe.checkout.sessions.create()` call
- Line 6 is the function signature
- Line 11 is where body is parsed

### Safe Modification Zones

| Zone | Lines | Description | Allowed Changes |
|------|-------|-------------|-----------------|
| **Zone 1** | 1-2 | Import statements | ✅ Add `requireUserId` import |
| **Zone 2** | 6-11 | Function start + auth | ✅ Add `requireUserId()` call |
| **Zone 3** | 26-39 | Checkout session creation | ✅ Add `client_reference_id`, update `metadata` |
| **Zone 4** | 42-45 | Error handling | ❌ DO NOT MODIFY |
| **Zone 5** | 13-21 | Plan validation | ❌ DO NOT MODIFY |
| **Zone 6** | 23 | Origin header | ❌ DO NOT MODIFY |

---

## 3. WEBHOOK/ROUTE.TS - MODIFICATION POINTS

### File: `MOBILE/app/api/stripe/webhook/route.ts`

**Switch Block with 20 Lines Above and Below:**

```typescript
30: export async function POST(req: NextRequest) {
31:   if (!stripe) {
32:     return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
33:   }
34:   if (!supabaseAdmin) {
35:     return NextResponse.json({ error: "Supabase admin client missing" }, { status: 500 });
36:   }
37:   const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
38:   if (!webhookSecret) {
39:     return NextResponse.json({ error: "Webhook secret missing" }, { status: 500 });
40:   }
41:
42:   const signature = req.headers.get("stripe-signature");
43:   if (!signature) {
44:     return NextResponse.json({ error: "Missing stripe signature" }, { status: 400 });
45:   }
46:
47:   const body = await req.text();
48:
49:   let event: Stripe.Event;
50:   try {
51:     event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
52:   } catch (error) {
53:     console.error("[stripe-webhook] signature error", error);
54:     return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
55:   }
56:
57:   try {
58:     switch (event.type) {
59:       case "checkout.session.completed":
60:         await handleCheckoutSession(event.data.object as Stripe.Checkout.Session);
61:         break;
62:       case "customer.subscription.updated":
63:         await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
64:         break;
65:       case "customer.subscription.deleted":
66:         await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
67:         break;
68:       default:
69:         break;
70:     }
71:   } catch (error) {
72:     console.error("[stripe-webhook] handler error", error);
73:     return NextResponse.json({ error: "webhook_error" }, { status: 400 });
74:   }
75:
76:   return NextResponse.json({ received: true });
77: }
```

### Exact Modification Points

#### **MODIFICATION POINT 1: Add payment_intent.succeeded Case**
- **Location:** Line 58-70 (inside switch statement)
- **Action:** Add new case before `default:`
- **Exact Insertion Point:** After line 67, before line 68
- **Exact Code:**
```typescript
switch (event.type) {
  case "checkout.session.completed":
    await handleCheckoutSession(event.data.object as Stripe.Checkout.Session);
    break;
  case "customer.subscription.updated":
    await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
    break;
  case "customer.subscription.deleted":
    await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    break;
  case "payment_intent.succeeded":  // ← INSERT HERE
    await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
    break;
  default:
    break;
}
```

#### **MODIFICATION POINT 2: Add Handler Function**
- **Location:** After line 148 (after `handleSubscriptionDeleted` function)
- **Action:** Add new handler function
- **Exact Insertion Point:** After line 148, before line 150
- **Exact Code:**
```typescript
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  // Implementation here
}
```

### Helper Functions Used in Existing Handlers

**Functions Available for Reference:**
- `handleCheckoutSession()` - Lines 79-108
  - Uses: `planFromSubscription()`, `buildSubscriptionPayload()`, `upsertSubscriptionForUser()`, `upsertSubscriptionByCustomer()`
- `handleSubscriptionUpdated()` - Lines 110-129
  - Uses: `planFromSubscription()`, `buildSubscriptionPayload()`, `upsertSubscriptionForUser()`, `upsertSubscriptionByCustomer()`
- `handleSubscriptionDeleted()` - Lines 131-148
  - Uses: `safeUpdate()`, `toIso()`
- `planFromSubscription()` - Lines 150-154
- `buildSubscriptionPayload()` - Lines 156-169
- `upsertSubscriptionForUser()` - Lines 171-200
- `upsertSubscriptionByCustomer()` - Lines 202-213
- `toIso()` - Lines 215-218

**Database Helpers Available:**
- `fromSafe()` - For safe table access
- `safeInsert()` - For safe inserts
- `safeUpdate()` - For safe updates
- `supabaseAdmin` - Admin client

### Safe Modification Zones

| Zone | Lines | Description | Allowed Changes |
|------|-------|-------------|-----------------|
| **Zone 1** | 58-70 | Switch statement | ✅ Add `payment_intent.succeeded` case |
| **Zone 2** | 148-220 | After existing handlers | ✅ Add `handlePaymentIntentSucceeded()` function |
| **Zone 3** | 1-9 | Imports | ✅ Add any needed imports for token_topups |
| **Zone 4** | 30-77 | POST handler | ❌ DO NOT MODIFY (except switch case) |
| **Zone 5** | 79-148 | Existing handlers | ❌ DO NOT MODIFY |
| **Zone 6** | 150-218 | Helper functions | ❌ DO NOT MODIFY (reference only) |

---

## 4. ACCOUNT-PLAN/PAGE.TSX - TOKEN PACK REFERENCES

### File: `MOBILE/app/settings/account-plan/page.tsx`

#### **Token Pack Checkout Function Call**

**Location:** Lines 127-144
```typescript
127:  const createTokenPackCheckout = useCallback(async (packId: TokenPackId) => {
128:    try {
129:      const res = await fetch("/api/stripe/token-pack", {
130:        method: "POST",
131:        headers: { "Content-Type": "application/json" },
132:        body: JSON.stringify({ packId }),
133:      });
134:      if (!res.ok) {
135:        throw new Error("token_pack_checkout_failed");
136:      }
137:      const { url } = await res.json();
138:      if (url) {
139:        window.location.href = url;
140:      }
141:    } catch (error) {
142:      console.error("[account-plan] token pack checkout error", error);
143:    }
144:  }, []);
```

**Status:** ✅ Function is correct - will work once route is created

#### **Token Pack UI Element**

**Location:** Lines 355-386
```typescript
355:        <section aria-label="Buy token packs" className="space-y-3">
356:          <div className="flex items-center justify-between">
357:            <div>
358:              <p className="text-sm font-semibold text-[color:var(--mc-text)]">Token Packs</p>
359:              <p className="text-xs text-[color:var(--mc-muted)]">Top up whenever you need an extra burst.</p>
360:            </div>
361:          </div>
362:          <div className="grid gap-3 md:grid-cols-3">
363:            {tokenPacks.map((pack) => (
364:              <Card key={pack.id} className="rounded-3xl border-white/5 bg-[color:var(--mc-card-soft)]/80 p-4">
365:                <div className="flex items-center gap-3">
366:                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--gradient-primary-start-soft)] to-[var(--gradient-primary-mid-soft)] text-[color:var(--mc-primary)]">
367:                    <SparkIcon className="h-5 w-5" />
368:                  </div>
369:                  <div className="flex w-full items-center justify-between">
370:                    <div>
371:                      <p className="text-sm font-semibold text-[color:var(--mc-text)]">{pack.title}</p>
372:                      <p className="text-xs text-[color:var(--mc-muted)]">{pack.tokens}</p>
373:                    </div>
374:                    <span className="text-lg font-bold text-[color:var(--mc-text)]">{pack.title}</span>
375:                  </div>
                </div>
                <Button
377:                  onClick={() => createTokenPackCheckout(pack.id)}
378:                  className="mt-4 w-full rounded-2xl px-3 py-2 text-sm font-semibold"
379:                >
380:                  Buy Tokens
381:                </Button>
382:              </Card>
383:            ))}
384:          </div>
385:        </section>
```

**Status:** ✅ UI is correct - no modifications needed

#### **Token Pack Definitions**

**Location:** Lines 28-32
```typescript
28: const tokenPacks = [
29:   { id: "pack_small", title: "Small Pack", tokens: "+5,000 tokens", price: "$4.99" },
30:   { id: "pack_medium", title: "Medium Pack", tokens: "+20,000 tokens", price: "$14.99" },
31:   { id: "pack_large", title: "Large Pack", tokens: "+100,000 tokens", price: "$49.99" },
32: ] as const;
```

**Status:** ✅ Definitions are correct - will need to map to Stripe price IDs

### Safe Modification Zones

| Zone | Lines | Description | Allowed Changes |
|------|-------|-------------|-----------------|
| **Zone 1** | 127-144 | Checkout function | ❌ DO NOT MODIFY (works correctly) |
| **Zone 2** | 355-386 | UI element | ❌ DO NOT MODIFY (works correctly) |
| **Zone 3** | 28-32 | Token pack definitions | ⚠️ MAY need price ID mapping later (not critical) |

---

## 5. LIB/PAYMENTS/STRIPE.TS - PRICE ID CONFIGURATION

### File: `MOBILE/lib/payments/stripe.ts`

**Full File Content (24 lines):**
```typescript
1:  import Stripe from "stripe";
2:
3:  const secretKey = process.env.STRIPE_SECRET_KEY;
4:
5:  if (!secretKey) {
6:    console.warn("[stripe] STRIPE_SECRET_KEY not set – Stripe APIs will fail");
7:  }
8:
9:  export const stripe =
10:    secretKey != null && secretKey !== ""
11:      ? new Stripe(secretKey, {
12:          apiVersion: "2024-06-20",
13:        })
14:      : null;
15:
16:  export type PlanId = "free" | "pro" | "elite";
17:
18:  export const PLAN_PRICE_IDS: Record<PlanId, string | undefined> = {
19:    free: undefined,
20:    pro: process.env.STRIPE_PRICE_PRO,
21:    elite: process.env.STRIPE_PRICE_ELITE,
22:  };
23:
24:
```

### Token Pack Price IDs - Insertion Point

#### **MODIFICATION POINT: Add Token Pack Price IDs**
- **Location:** After line 22 (after `PLAN_PRICE_IDS`)
- **Action:** Add new constant for token pack price IDs
- **Exact Insertion Point:** After line 22, before line 24
- **Exact Code:**
```typescript
export type TokenPackId = "pack_small" | "pack_medium" | "pack_large";

export const TOKEN_PACK_PRICE_IDS: Record<TokenPackId, string | undefined> = {
  pack_small: process.env.STRIPE_PRICE_PACK_SMALL,
  pack_medium: process.env.STRIPE_PRICE_PACK_MEDIUM,
  pack_large: process.env.STRIPE_PRICE_PACK_LARGE,
};
```

### Safe Modification Zones

| Zone | Lines | Description | Allowed Changes |
|------|-------|-------------|-----------------|
| **Zone 1** | 16-22 | Plan price IDs | ❌ DO NOT MODIFY |
| **Zone 2** | 22-24 | After PLAN_PRICE_IDS | ✅ Add token pack price IDs |
| **Zone 3** | 1-15 | Stripe client init | ❌ DO NOT MODIFY |

---

## 6. NEW FILE: TOKEN-PACK/ROUTE.TS

### File to Create: `MOBILE/app/api/stripe/token-pack/route.ts`

**Status:** ❌ **DOES NOT EXIST** - Must be created

**Recommended Structure:**
```typescript
import { NextRequest } from "next/server";
import { TOKEN_PACK_PRICE_IDS, type TokenPackId, stripe } from "@/lib/payments/stripe";
import { requireUserId } from "@/lib/supabase/server-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  
  if (!stripe) {
    return new Response("Stripe not configured", { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as { packId?: TokenPackId } | null;
  const packId = body?.packId;

  if (!packId || !["pack_small", "pack_medium", "pack_large"].includes(packId)) {
    return new Response("Invalid pack ID", { status: 400 });
  }

  const priceId = TOKEN_PACK_PRICE_IDS[packId];
  if (!priceId) {
    return new Response("Missing price for pack", { status: 500 });
  }

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment", // One-time payment, not subscription
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/settings/account-plan?token-pack=success`,
      cancel_url: `${origin}/settings/account-plan?token-pack=cancelled`,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        supabase_user_id: userId,
        pack_id: packId,
      },
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[stripe] token-pack checkout error", err);
    return new Response("Unable to create checkout session", { status: 500 });
  }
}
```

**File Location:** `MOBILE/app/api/stripe/token-pack/route.ts`

---

## 7. SAFE MODIFICATION ZONES SUMMARY

### ✅ Files with Safe Modification Zones

| File | Safe Zones | Restricted Zones |
|------|------------|------------------|
| `create-checkout-session/route.ts` | Lines 1-2, 6-11, 26-39 | Lines 13-23, 42-48 |
| `webhook/route.ts` | Lines 58-70, 148-220 | Lines 30-57, 79-148 |
| `lib/payments/stripe.ts` | Lines 22-24 | Lines 1-22 |
| `token-pack/route.ts` | **ENTIRE FILE** (new file) | N/A |

### ❌ Files with NO Modifications Allowed

| File | Reason |
|------|--------|
| `portal/route.ts` | ✅ Already correct, no changes needed |
| `account-plan/page.tsx` | ✅ Already correct, no changes needed |

---

## 8. CONFIRMATION: NO DUPLICATE/HIDDEN ROUTES

### ✅ Confirmed: No Other Stripe Routes Exist

**Searched Patterns:**
- `**/api/stripe/**` - Only 3 routes found (create-checkout-session, webhook, portal)
- `**/pages/api/stripe/**` - Does not exist (Next.js 13+ app router)
- `**/src/server/stripe/**` - Does not exist
- `**/old/**/stripe/**` - Does not exist
- `**/backup/**/stripe/**` - Does not exist

**Result:** ✅ **CONFIRMED** - No duplicate or hidden routes exist

### ✅ Confirmed: No Duplicate Webhook Handlers

**Searched:**
- Files containing "webhook" + "stripe": Only `webhook/route.ts` found
- Files containing "payment_intent": Only references in audit reports and schema

**Result:** ✅ **CONFIRMED** - No duplicate webhook handlers exist

### ✅ Confirmed: No Shadow Routes

**Searched Directories:**
- `/pages/api/*` - Does not exist
- `/old/*` - Does not exist
- `/backup/*` - Does not exist
- `/_deprecated/*` - Does not exist
- `/archive/*` - Does not exist

**Result:** ✅ **CONFIRMED** - No shadow routes exist

---

## 9. MODIFICATION CHECKLIST

### Phase 1: Authentication & Metadata Fixes

- [ ] **File:** `create-checkout-session/route.ts`
  - [ ] Add `requireUserId` import (Line 2)
  - [ ] Add `requireUserId()` call (Line 6-7)
  - [ ] Add `client_reference_id` (Line 26-27)
  - [ ] Update `metadata` object (Line 38)

### Phase 2: Token Pack Route Creation

- [ ] **File:** `token-pack/route.ts` (NEW FILE)
  - [ ] Create file at `MOBILE/app/api/stripe/token-pack/route.ts`
  - [ ] Implement POST handler with authentication
  - [ ] Add token pack price ID mapping
  - [ ] Set correct metadata and client_reference_id

### Phase 3: Token Pack Price IDs

- [ ] **File:** `lib/payments/stripe.ts`
  - [ ] Add `TokenPackId` type (Line 22-23)
  - [ ] Add `TOKEN_PACK_PRICE_IDS` constant (Line 22-24)

### Phase 4: Webhook Handler

- [ ] **File:** `webhook/route.ts`
  - [ ] Add `payment_intent.succeeded` case (Line 67-68)
  - [ ] Add `handlePaymentIntentSucceeded()` function (Line 148-149)
  - [ ] Implement token_topups row creation
  - [ ] Implement subscriptions.token_balance update

---

## 10. CRITICAL REMINDERS

### ⚠️ DO NOT MODIFY

1. **Error handling blocks** in existing routes
2. **Plan validation logic** in checkout route
3. **Existing webhook handlers** (only add new case)
4. **Helper functions** in webhook route (reference only)
5. **UI components** in account-plan page
6. **Portal route** (already correct)

### ✅ ONLY MODIFY

1. **Safe modification zones** explicitly listed above
2. **New file creation** for token-pack route
3. **Additions only** - no deletions or rewrites

---

**END OF MODIFICATION MAP**


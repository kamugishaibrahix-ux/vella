# Stripe Checkout and Webhook Hardening

**Date:** 2026-02-10  
**Phase:** Security Hardening - Stripe Integration

## Overview

Hardened Stripe checkout URL building and webhook processing to prevent origin poisoning, double-processing, and abuse. All changes maintain backward compatibility with existing Stripe flows while adding critical security layers.

## Changes Implemented

### 1. Origin Validation for Checkout URLs

**Problem:** Checkout routes trusted `req.headers.get("origin")` directly, allowing potential URL poisoning attacks where an attacker could craft success/cancel URLs pointing to malicious domains.

**Solution:** Created `lib/payments/originValidation.ts` with:
- Allowlist-based validation using `ALLOWED_ORIGINS` environment variable (CSV)
- Automatic inclusion of `NEXT_PUBLIC_APP_URL` in allowlist
- Localhost allowlist for development (`http://localhost:3000`, `http://127.0.0.1:3000`)
- Normalization (lowercase, trim, remove trailing slash)
- Fallback to canonical base URL when origin is missing or untrusted
- Warning logging for rejected origins

**Files Modified:**
- `lib/payments/originValidation.ts` (new)
- `app/api/stripe/create-checkout-session/route.ts`
- `app/api/stripe/token-pack/route.ts`

### 2. Webhook Idempotency

**Problem:** Stripe retries webhooks on network failures, potentially causing double-processing of subscription updates, payment intents, and token allocations.

**Solution:** Created `lib/payments/webhookIdempotency.ts` with:
- `isEventProcessed(eventId)`: Checks if event already processed (queries Supabase)
- `markEventProcessed(eventId, eventType)`: Records event as processed
- Fail-open on database unavailability (assumes not processed to avoid blocking all webhooks)
- Graceful handling of race conditions (duplicate key errors treated as success)
- Returns 200 with `{ received: true, skipped: true }` for already-processed events

**Database Schema:**
Created `supabase/migrations/20260210_webhook_events.sql`:
```sql
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
- Indexes on `event_id` (for fast lookups) and `processed_at` (for cleanup)
- RLS enabled with service-role-only access
- Includes optional `cleanupOldEvents(olderThanDays)` maintenance function

**Files Modified:**
- `lib/payments/webhookIdempotency.ts` (new)
- `app/api/stripe/webhook/route.ts`
- `supabase/migrations/20260210_webhook_events.sql` (new)

### 3. Webhook Rate Limiting

**Problem:** Webhook endpoint was publicly accessible without rate limiting, vulnerable to abuse.

**Solution:** Added lenient IP-based rate limiting:
- Limit: 100 requests per 60 seconds per IP
- Uses existing `rateLimit` infrastructure with Redis support
- Returns 429 if exceeded
- Lenient threshold to accommodate legitimate Stripe retry behavior

**Files Modified:**
- `app/api/stripe/webhook/route.ts`

### 4. Environment Configuration

**New Environment Variables:**
- `ALLOWED_ORIGINS` (optional): Comma-separated list of trusted origins for checkout URLs
  - Example: `ALLOWED_ORIGINS=https://app.example.com,https://app2.example.com`
  - Falls back to `NEXT_PUBLIC_APP_URL` if not set
  - Automatically includes localhost in development

## Security Benefits

| Attack Vector | Mitigation |
|---------------|------------|
| **Origin Poisoning** | Checkout URLs validated against allowlist; untrusted origins replaced with canonical URL |
| **Double-Processing** | Idempotent webhook handling prevents duplicate subscription/payment/token changes |
| **Webhook Abuse** | Rate limiting (100 req/60s per IP) prevents flood attacks |
| **Webhook Forgery** | Existing signature verification maintained (not removed) |

## Testing

### Unit Tests

**Origin Validation** (`test/payments/originValidation.test.ts`)
- ✅ Accepts origins from `ALLOWED_ORIGINS` CSV
- ✅ Accepts origin from `NEXT_PUBLIC_APP_URL`
- ✅ Normalizes origins (lowercase, trim, remove trailing slash)
- ✅ Rejects untrusted origins and returns canonical URL
- ✅ Handles missing/empty origin headers
- ✅ Includes localhost in development
- ✅ 14/14 tests passing

**Webhook Idempotency** (`test/payments/webhookIdempotency.test.ts`)
- ✅ Returns false when event not found
- ✅ Returns true when event already processed
- ✅ Handles database errors gracefully (fail-open)
- ✅ Successfully marks event as processed
- ✅ Handles duplicate key errors (race conditions)
- ✅ Returns error on database failure
- ✅ 6/6 tests passing

### Integration Tests

**Stripe Checkout Hardening** (`test/api/stripeCheckoutHardening.test.ts`)
- ✅ Uses trusted origin for success/cancel URLs
- ✅ Rejects untrusted origin and uses canonical URL
- ✅ Handles missing origin header
- ✅ Normalizes origin (removes trailing slash, lowercase)
- ✅ Tests both `/create-checkout-session` and `/token-pack` routes
- ✅ 6/6 tests passing

**Stripe Webhook Hardening** (`test/api/stripeWebhookHardening.test.ts`)
- ✅ Processes event when not previously seen
- ✅ Skips processing when event already processed
- ✅ Still returns success if marking fails after processing
- ✅ Applies rate limiting to webhook endpoint
- ✅ Rejects webhook with missing signature
- ✅ Rejects webhook with invalid signature
- ✅ 6/6 tests passing

**Total:** 32/32 tests passing

## Usage Examples

### Setting Allowed Origins

```bash
# Single origin (uses NEXT_PUBLIC_APP_URL by default)
NEXT_PUBLIC_APP_URL=https://app.example.com

# Multiple origins
ALLOWED_ORIGINS=https://app.example.com,https://staging.example.com,https://app2.example.com
```

### Webhook Event Table Maintenance

The `webhook_events` table grows over time. Optional cleanup:

```typescript
import { cleanupOldEvents } from "@/lib/payments/webhookIdempotency";

// In a cron job or maintenance script:
await cleanupOldEvents(90); // Remove events older than 90 days
```

### Verifying Idempotency

```bash
# Simulate Stripe retry (same event twice)
curl -X POST http://localhost:3000/api/stripe/webhook \
  -H "stripe-signature: ..." \
  -d '{"id":"evt_test_123",...}'

# First request: processes event, returns { received: true }
# Second request: skips processing, returns { received: true, skipped: true }
```

## Migration Instructions

1. **Deploy Database Migration:**
   ```bash
   # Apply webhook_events table migration to Supabase
   psql $DATABASE_URL < MOBILE/supabase/migrations/20260210_webhook_events.sql
   ```

2. **Configure Environment (Optional):**
   ```bash
   # Add to .env.local or production env
   ALLOWED_ORIGINS=https://yourdomain.com,https://staging.yourdomain.com
   ```

3. **Deploy Code:**
   - No breaking changes - existing Stripe flows continue to work
   - Origin validation defaults to `NEXT_PUBLIC_APP_URL`
   - Idempotency is transparent (Stripe already sends unique event IDs)

## Verification Checklist

- [ ] Database migration applied successfully
- [ ] `webhook_events` table exists with correct indexes
- [ ] Checkout URLs use trusted origins (check Stripe dashboard logs)
- [ ] Webhook retries don't cause duplicate charges (monitor logs for "already processed, skipping")
- [ ] Rate limiting active on webhook endpoint (test with multiple rapid requests)
- [ ] All tests passing: `pnpm vitest run test/payments/ test/api/stripeCheckoutHardening.test.ts test/api/stripeWebhookHardening.test.ts`

## Acceptance Criteria

✅ **Success/cancel URLs cannot be poisoned by untrusted origin**
- Checkout routes validate origin against allowlist
- Untrusted origins fallback to canonical base URL
- Warning logged for rejected origins

✅ **Webhook cannot double-apply changes on retries**
- Event IDs stored in `webhook_events` table
- Duplicate events return 200 with `skipped: true`
- Idempotency checks happen before any business logic

✅ **Rate limiting prevents webhook abuse**
- IP-based limit: 100 req/60s
- Returns 429 on exceeded limit
- Lenient enough for legitimate Stripe retries

✅ **Signature verification maintained**
- No changes to existing signature verification
- Still rejects invalid signatures with 400

## Future Enhancements

1. **Event Cleanup Automation:** Schedule `cleanupOldEvents()` via cron/serverless function
2. **Alerting:** Monitor rejected origins and rate limit hits for potential attacks
3. **Metrics:** Track webhook processing times and idempotency hit rates
4. **Multi-Provider Support:** Extend origin validation for other payment providers if needed

## Files Created/Modified

### New Files
- `lib/payments/originValidation.ts` - Origin allowlist validation
- `lib/payments/webhookIdempotency.ts` - Idempotent event processing
- `supabase/migrations/20260210_webhook_events.sql` - Event tracking table
- `test/payments/originValidation.test.ts` - Unit tests for origin validation
- `test/payments/webhookIdempotency.test.ts` - Unit tests for idempotency
- `test/api/stripeCheckoutHardening.test.ts` - Integration tests for checkout
- `test/api/stripeWebhookHardening.test.ts` - Integration tests for webhook

### Modified Files
- `app/api/stripe/create-checkout-session/route.ts` - Added origin validation
- `app/api/stripe/token-pack/route.ts` - Added origin validation
- `app/api/stripe/webhook/route.ts` - Added idempotency and rate limiting

## Backward Compatibility

✅ **No breaking changes**
- Existing Stripe flows continue to work
- `ALLOWED_ORIGINS` optional (defaults to `NEXT_PUBLIC_APP_URL`)
- Idempotency transparent to external callers
- Rate limits lenient enough for production traffic

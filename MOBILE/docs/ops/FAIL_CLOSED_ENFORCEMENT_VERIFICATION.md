# Fail-Closed Enforcement Verification

**Objective:** All monetised endpoints must enforce: **Auth → RateLimit → Entitlement → Token Deduct → External Call**. Rate limit must be evaluated BEFORE token deduction. If Redis is unavailable (FAIL-CLOSED policy), return 503. No OpenAI/Stripe call before rateLimit.

## Verification table

| route | rateLimit position | tokenDeduct position | 503 on Redis down | compliant |
|-------|--------------------|----------------------|-------------------|----------|
| api/reflection | 2 (after auth) | 5 | Y | Y |
| api/strategy | 2 | 4 | Y | Y |
| api/clarity | 2 | 4 | Y | Y |
| api/compass | 2 | 4 | Y | Y |
| api/deepdive | 2 | 4 | Y | Y |
| api/architect | 2 | 4 | Y | Y |
| api/growth-roadmap | 2 | 4 | Y | Y |
| api/emotion-intel | 2 | 4 | Y | Y |
| api/insights/generate | 2 (in POST) | 4 (in helper) | Y | Y |
| api/insights/patterns | 2 | 4 | Y | Y |
| api/realtime/offer | 2 | 4 | Y | Y |
| api/realtime/token | 2 | 4 | Y | Y |
| api/audio/vella | 2 | 4 | Y | Y |
| api/transcribe | 2 | 4 | Y | Y |
| api/vella/text | 2 | 5 | Y | Y |
| api/stripe/create-checkout-session | 2 | N/A (Stripe) | Y | Y |
| api/stripe/topups/create-checkout-session | 2 | N/A | Y | Y |
| api/stripe/portal | 2 | N/A | Y | Y |
| api/stripe/token-pack | 2 | N/A | Y | Y |
| api/stripe/webhook | 2 | N/A (RPC) | Y | Y |

**Position:** Step order in handler (1 = auth, 2 = rateLimit, 3 = entitlement/token check, 4/5 = chargeTokensForOperation, then external call).

**503 on Redis down:** When `rateLimitResult.status === 503`, route returns `rateLimit503Response(...)` so Redis unavailability (FAIL-CLOSED) results in 503.

## Endpoints that use OpenAI / atomic_token_deduct / Stripe / RPC writes

- **OpenAI + token deduct:** reflection, strategy, clarity, compass, deepdive, architect, growth-roadmap, emotion-intel, insights/generate, insights/patterns, realtime/offer, realtime/token, audio/vella, transcribe, vella/text.
- **Stripe mutation:** stripe/create-checkout-session, stripe/topups/create-checkout-session, stripe/portal, stripe/token-pack, stripe/webhook.
- **RPC writes (e.g. atomic_token_deduct):** All routes that call `chargeTokensForOperation` (see above).

## Invariants checked

1. **rateLimit before token deduct:** In every monetised route, `rateLimit()` is called before `chargeTokensForOperation()`. No route charges tokens before evaluating rate limit.
2. **503 when Redis unavailable:** All monetised routes that use `rateLimit` with a FAIL-CLOSED `routeKey` check `rateLimitResult.status === 503` and return `rateLimit503Response(...)`.
3. **No OpenAI before rateLimit:** No route invokes OpenAI (or Stripe mutation) before the rateLimit check in the same handler.

## Non-monetised routes (rate limit only, no token deduct)

These use rateLimit for abuse prevention but do not charge tokens or call OpenAI in a monetised path: pattern-insight (open policy, no charge), goals, progress, check-ins, commitments/*, feedback/create, etc. They still return 503 when `status === 503` where applicable.

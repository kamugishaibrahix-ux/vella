# Production War-Testing: Staged Stress-Test Protocol

This document defines a **staged stress-test protocol** with exact execution steps for production readiness. Run stages in order. Record results in the **Final Report** section.

**Prerequisites:**
- Staging or production-like environment (Supabase, Redis, OpenAI API key, Stripe test mode).
- **k6** installed: `brew install k6` or [k6.io](https://k6.io/docs/getting-started/installation/).
- Valid auth: session cookies or Bearer tokens for authenticated endpoints.
- Optional: Prometheus/Grafana or Supabase Dashboard for DB/Redis metrics.

**Conventions:**
- `BASE_URL`: e.g. `https://staging.vella.app` or `http://localhost:3000`.
- `AUTH_COOKIE`: Session cookie string or use k6 `http.header("Cookie", "...")` / `Bearer` token.
- All timings in **seconds** unless noted.

---

## STAGE 0 — Baseline Metrics

**Objective:** Establish p50/p95/p99 latency, DB time, Redis hit rate, and token RPC time before load.

### 0.1 Endpoint latency (k6)

Create `scripts/stress/k6-baseline.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const vellaTextLatency = new Trend('vella_text_latency');
const compassLatency = new Trend('compass_latency');
const deepdiveLatency = new Trend('deepdive_latency');

export const options = {
  vus: 5,
  duration: '60s',
  thresholds: {
    http_req_duration: ['p(95)<30000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH = __ENV.AUTH_COOKIE || '';

export default function () {
  // 1) /api/vella/text
  const vellaRes = http.post(
    `${BASE_URL}/api/vella/text`,
    JSON.stringify({ message: 'Hello, how are you?', language: 'en' }),
    { headers: { 'Content-Type': 'application/json', 'Cookie': AUTH } }
  );
  if (vellaRes.timings.duration) vellaTextLatency.add(vellaRes.timings.duration);
  check(vellaRes, { 'vella/text status 200 or 402': (r) => r.status === 200 || r.status === 402 });
  sleep(2);

  // 2) /api/compass
  const compassRes = http.post(
    `${BASE_URL}/api/compass`,
    JSON.stringify({ raw: 'I feel overwhelmed and stuck.' }),
    { headers: { 'Content-Type': 'application/json', 'Cookie': AUTH } }
  );
  if (compassRes.timings.duration) compassLatency.add(compassRes.timings.duration);
  check(compassRes, { 'compass status 200 or 402': (r) => r.status === 200 || r.status === 402 });
  sleep(2);

  // 3) /api/deepdive
  const deepdiveRes = http.post(
    `${BASE_URL}/api/deepdive`,
    JSON.stringify({ section: 'clarity', text: 'I assume the worst will happen.' }),
    { headers: { 'Content-Type': 'application/json', 'Cookie': AUTH } }
  );
  if (deepdiveRes.timings.duration) deepdiveLatency.add(deepdiveRes.timings.duration);
  check(deepdiveRes, { 'deepdive status 200 or 402': (r) => r.status === 200 || r.status === 402 });
  sleep(3);
}
```

**Run:**
```bash
k6 run --out json=baseline-metrics.json scripts/stress/k6-baseline.js
k6 run --summary-trend-stats="avg,p(50),p(95),p(99)" scripts/stress/k6-baseline.js
```

**Record:** p50, p95, p99 for `http_req_duration` and custom trends (`vella_text_latency`, etc.) from k6 output or `baseline-metrics.json`.

### 0.2 Stripe webhook (replayed) baseline

Use a **saved** Stripe test event body and signature (from Stripe CLI or dashboard).

```bash
# Replay one event, measure latency
curl -w "\n%{time_total}\n" -X POST "$BASE_URL/api/stripe/webhook" \
  -H "Content-Type: application/json" \
  -H "stripe-signature: $STRIPE_SIGNATURE" \
  -d @stripe_event_payment_intent_succeeded.json
```

**Record:** Total time (seconds) for single webhook POST. Run 20 times and compute p50, p95, p99.

### 0.3 DB query time

- **Supabase:** Dashboard → Reports → Query Performance, or enable `log_statement = 'all'` and measure from logs.
- **Relevant queries:** `fromSafe("behavioural_state_current")`, `fromSafe("subscriptions")`, `atomic_token_deduct` RPC.
- **Record:** Average and p95 of top 5 slowest query types during baseline.

### 0.4 Redis hit rate

- If using Redis for rate limit + cache: run `INFO stats` and note `keyspace_hits`, `keyspace_misses`. Hit rate = hits / (hits + misses).
- **Record:** Hit rate % during 60s baseline run.

### 0.5 Token RPC execution time

- From Supabase Dashboard or pg_stat_statements: average execution time for `atomic_token_deduct` and `atomic_token_refund` calls during baseline.
- **Record:** Mean and p95 (ms) for each RPC.

---

## STAGE 1 — Concurrency Load Test (1000 users)

**Objective:** 1000 concurrent authenticated users; 30% vella/text, 20% compass, 10% insights/generate, 40% idle/background. Measure error rate, token integrity, advisory lock contention, Supabase saturation.

### 1.1 k6 script

Create `scripts/stress/k6-stage1-load.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'k6/javascript';

export const options = {
  scenarios: {
    vella_text: {
      executor: 'constant-vus',
      vus: 300,
      duration: '120s',
      startTime: '0s',
      exec: 'vellaText',
    },
    compass: {
      executor: 'constant-vus',
      vus: 200,
      duration: '120s',
      startTime: '0s',
      exec: 'compass',
    },
    insights_generate: {
      executor: 'constant-vus',
      vus: 100,
      duration: '120s',
      startTime: '0s',
      exec: 'insightsGenerate',
    },
    background: {
      executor: 'constant-vus',
      vus: 400,
      duration: '120s',
      startTime: '0s',
      exec: 'background',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(99)<60000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH = __ENV.AUTH_COOKIE || '';

const headers = { 'Content-Type': 'application/json', 'Cookie': AUTH };

function vellaText() {
  const res = http.post(
    `${BASE_URL}/api/vella/text`,
    JSON.stringify({ message: 'Short message for load test.', language: 'en' }),
    { headers }
  );
  check(res, { 'vella/text 2xx or 402/429/503': (r) => r.status >= 200 && r.status < 500 || r.status === 503 });
  sleep(randomIntBetween(1, 5));
}

function compass() {
  const res = http.post(
    `${BASE_URL}/api/compass`,
    JSON.stringify({ raw: 'I feel stressed.' }),
    { headers }
  );
  check(res, { 'compass 2xx or 402/429/503': (r) => r.status >= 200 && r.status < 500 || r.status === 503 });
  sleep(randomIntBetween(1, 5));
}

function insightsGenerate() {
  const res = http.post(
    `${BASE_URL}/api/insights/generate`,
    JSON.stringify({}),
    { headers }
  );
  check(res, { 'insights/generate 2xx or 402/429/503': (r) => r.status >= 200 && r.status < 500 || r.status === 503 });
  sleep(randomIntBetween(2, 8));
}

function background() {
  const r = randomIntBetween(0, 3);
  if (r === 0) {
    http.get(`${BASE_URL}/api/state/current`, { headers });
  } else if (r === 1) {
    http.get(`${BASE_URL}/api/account/token-balance`, { headers });
  } else if (r === 2) {
    http.get(`${BASE_URL}/api/governance/state`, { headers });
  } else {
    http.get(`${BASE_URL}/api/insights/snapshot`, { headers });
  }
  sleep(randomIntBetween(2, 10));
}
```

**Run:**
```bash
k6 run --out json=stage1-metrics.json scripts/stress/k6-stage1-load.js
```

### 1.2 Metrics to record

- **Error rate:** `http_req_failed` rate from k6 (target &lt; 5%).
- **Token deduction integrity:** Before/after run, for one test user: `SELECT * FROM token_usage WHERE user_id = '...' ORDER BY created_at DESC LIMIT 100` and compare sum of deductions vs number of successful 200 responses; no double charge per requestId.
- **Advisory lock contention:** Supabase logs or pg_stat_activity for wait events on `pg_advisory_lock` during run.
- **Supabase connection saturation:** Active connections from Dashboard or `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();` during peak.

---

## STAGE 2 — Token Abuse Simulation

**Objective:** Same user issues 50 concurrent token-charging requests; verify exactly one atomic deduction per requestId, no negative balance, no race.

### 2.1 Execution

Use existing script pattern (see `scripts/test-token-concurrency.mjs`) or k6:

Create `scripts/stress/k6-stage2-token-abuse.js`:

```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  iterations: 50,
  startTime: '0s',
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH = __ENV.AUTH_COOKIE || '';

export default function () {
  const res = http.post(
    `${BASE_URL}/api/vella/text`,
    JSON.stringify({ message: 'Concurrent token test ' + __VU, language: 'en' }),
    { headers: { 'Content-Type': 'application/json', 'Cookie': AUTH } }
  );
  check(res, { 'status 200 or 402': (r) => r.status === 200 || r.status === 402 });
}
```

**Run:**
```bash
# Record balance before: query token_usage / resource_budget_current for test user
k6 run scripts/stress/k6-stage2-token-abuse.js
# Record balance after; count successful 200s; verify deductions = count(200) and no duplicate requestIds in token_usage
```

### 2.2 Verification

- Query `token_usage` for the test user: count rows with `operation_type` like `vella_text` in the last 2 minutes. Count distinct `idempotency_key` / requestId; must equal number of rows (no duplicate requestId).
- Query balance: no negative balance.
- **Record:** Total 200 responses, total deduction rows, distinct requestIds, min/max balance.

---

## STAGE 3 — Stripe Replay Attack

**Objective:** Replay the **same** webhook event 20 times; only first mutates DB; others exit early; no duplicate `token_topups` rows.

### 3.1 Execution

Save one Stripe test event (e.g. `payment_intent.succeeded` or `checkout.session.completed` with token top-up) to `stripe_event_replay.json`. Generate signature for that payload once (Stripe CLI or script).

```bash
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE_URL/api/stripe/webhook" \
    -H "Content-Type: application/json" \
    -H "stripe-signature: $STRIPE_SIGNATURE" \
    -d @stripe_event_replay.json
done
```

### 3.2 Verification

- All 20 requests return **200** (Stripe expects 200 for idempotent duplicate).
- DB: exactly **1** row in `webhook_events` for that `event_id`.
- DB: exactly **1** row in `token_topups` for that payment intent (if applicable).
- **Record:** Response codes, `SELECT count(*) FROM webhook_events WHERE event_id = 'ev_...'`, `SELECT count(*) FROM token_topups WHERE stripe_payment_intent_id = 'pi_...'`.

---

## STAGE 4 — Redis Failure Simulation

**Objective:** With Redis disabled (or forced down), monetised endpoints must fail closed (503); no OpenAI calls; no tokens deducted.

### 4.1 Execution

**Option A — Env flag (if supported):**  
Set `RATE_LIMIT_FORCE_REDIS_DOWN=1` and restart app. Routes using FAIL-CLOSED policy (see `lib/security/rateLimitPolicy.ts`) must return 503 when rate limit is evaluated.

**Option B — Real Redis down:**  
Stop Redis: `redis-cli shutdown` or stop Redis container. Restart app (so it connects to missing Redis).

### 4.2 Tests

1. **Monetised endpoint (FAIL-CLOSED):**  
   `POST /api/compass` with valid auth → expect **503** (rate limiting unavailable).  
   `POST /api/insights/generate` → expect **503**.  
   `POST /api/realtime/token` → expect **503**.

2. **No OpenAI call:**  
   Check app logs: no OpenAI API request must be logged for the above requests.

3. **No tokens deducted:**  
   For a test user, balance before and after the 503 requests must be unchanged (no `atomic_token_deduct` called).

4. **Read-only / FAIL-OPEN:**  
   `GET /api/system/health` may still return 200 (FAIL-OPEN policy) with fallback throttle.

**Record:** Response codes for each endpoint; log line count for OpenAI; balance delta.

---

## STAGE 5 — Supabase Exhaustion Simulation

**Objective:** Throttle DB connections and send 2000 req/min; verify graceful failure, no unhandled rejections, proper 500 logging.

### 5.1 Execution

- **Throttle:** Reduce Supabase pool size or use a proxy to limit connections (e.g. PgBouncer max_client_conn). Alternatively, run a separate process that holds many connections open.
- **Load:** k6 with 2000 iterations per minute against a mix of endpoints (e.g. 50% `/api/state/current`, 50% `/api/vella/text`).

```javascript
// k6: 2000 req/min for 2 minutes
export const options = {
  scenarios: {
    load: {
      executor: 'constant-rate',
      rate: 2000,
      timeUnit: '1m',
      duration: '2m',
      preAllocatedVUs: 100,
      maxVUs: 200,
    },
  },
};
```

### 5.2 Verification

- Some requests will 500 or 503 when pool is exhausted.
- App logs: no unhandled promise rejections; errors logged with safeErrorLog or equivalent.
- **Record:** Error rate, sample 500 response body, log snippet showing handled error.

---

## STAGE 6 — Memory Pressure

**Objective:** Send large-but-allowed payloads; verify server memory stable and no unbounded cache growth.

### 6.1 Execution

- **vella/text:** Message length at upper limit (e.g. 4000 chars per schema). Send 500 sequential requests.
- **Stripe webhook:** Body near 256KB limit (reject above). Send 50 requests with large payload (e.g. 200KB).
- Monitor process RSS/heap during and 5 minutes after.

```bash
# Example: 500 vella/text with 4k message
# (Implement in k6 or curl loop; message = 4000-char string)
```

### 6.2 Verification

- No OOM; memory growth bounded (e.g. RSS growth &lt; 100MB over 500 requests).
- Health/instrumentation caches (e.g. system/health 15s TTL) do not grow unbounded.
- **Record:** RSS before/after; max heap; cache size if exposed.

---

## STAGE 7 — Chaos Injection

**Objective:** Randomly delay OpenAI, throw Stripe errors, return 500 from Supabase RPC; verify refund logic, no silent failures, no token leakage.

### 7.1 Execution

- **OpenAI delay:** Use a proxy (e.g. toxiproxy) to add 30s delay to `api.openai.com`; send 5 vella/text requests; cancel or wait; verify refunds for failed/timeout requests.
- **Stripe API error:** Mock Stripe to return 500 once; replay webhook; verify no duplicate token credit and error logged.
- **Supabase RPC 500:** Temporarily break `atomic_token_deduct` (e.g. invalid arg) or use a test RPC that returns error; call charge then refund path; verify no double refund and no token leakage.

### 7.2 Verification

- **Refund logic:** After OpenAI failure, `atomic_token_refund` called once per failed request; balance restored.
- **No silent failures:** All errors logged; no 200 with partial state.
- **No token leakage:** Balance after chaos matches expected (charges minus refunds).
- **Record:** Refund call count, balance before/after, log excerpts.

---

## FINAL REPORT FORMAT

Fill in after each stage. Use PASS/FAIL and attach evidence (metrics, logs, query results).

---

### STAGE 0 — Baseline Metrics

| Metric | Target | Result | Evidence |
|--------|--------|--------|----------|
| /api/vella/text p50 | — | ___ ms | k6 trend |
| /api/vella/text p95 | — | ___ ms | k6 trend |
| /api/vella/text p99 | — | ___ ms | k6 trend |
| /api/compass p50/p95/p99 | — | ___ ms | k6 trend |
| /api/deepdive p50/p95/p99 | — | ___ ms | k6 trend |
| /api/stripe/webhook p50/p95/p99 | — | ___ ms | curl ×20 |
| DB query time (top 5) | — | ___ ms | Supabase / logs |
| Redis hit rate | — | ___ % | INFO stats |
| atomic_token_deduct mean/p95 | — | ___ ms | pg_stat_statements |

**Status:** PASS / FAIL  
**Observed bottleneck:**  
**Mitigation recommendation:**  

---

### STAGE 1 — Concurrency Load (1000 users)

| Metric | Target | Result | Evidence |
|--------|--------|--------|----------|
| Error rate | &lt; 5% | ___ % | k6 http_req_failed |
| Token double charge | 0 | ___ | token_usage requestId count |
| Advisory lock contention | Low | ___ | pg_stat_activity / wait events |
| Supabase connections (peak) | &lt; pool max | ___ | Dashboard / pg_stat_activity |

**Status:** PASS / FAIL  
**Observed bottleneck:**  
**Mitigation recommendation:**  

---

### STAGE 2 — Token Abuse (50 concurrent same user)

| Metric | Target | Result | Evidence |
|--------|--------|--------|----------|
| One deduction per requestId | Yes | ___ | Distinct requestIds = rows |
| No negative balance | Yes | ___ | resource_budget / balance query |
| No race condition | Yes | ___ | Balance consistency |

**Status:** PASS / FAIL  
**Observed bottleneck:**  
**Mitigation recommendation:**  

---

### STAGE 3 — Stripe Replay (20× same event)

| Metric | Target | Result | Evidence |
|--------|--------|--------|----------|
| All 200 responses | Yes | ___ | curl status codes |
| Exactly 1 webhook_events row | Yes | ___ | SELECT count(*) |
| Exactly 1 token_topups row | Yes | ___ | SELECT count(*) |

**Status:** PASS / FAIL  
**Observed bottleneck:**  
**Mitigation recommendation:**  

---

### STAGE 4 — Redis Failure

| Metric | Target | Result | Evidence |
|--------|--------|--------|----------|
| Monetised endpoints 503 | Yes | ___ | Response codes |
| No OpenAI calls | Yes | ___ | Logs |
| No tokens deducted | Yes | ___ | Balance unchanged |
| Proper 503 body | Yes | ___ | Response JSON |

**Status:** PASS / FAIL  
**Observed bottleneck:**  
**Mitigation recommendation:**  

---

### STAGE 5 — Supabase Exhaustion

| Metric | Target | Result | Evidence |
|--------|--------|--------|----------|
| Graceful failure | Yes | ___ | 500/503 returned |
| No unhandled rejections | Yes | ___ | Logs |
| Proper 500 logging | Yes | ___ | safeErrorLog / stack |

**Status:** PASS / FAIL  
**Observed bottleneck:**  
**Mitigation recommendation:**  

---

### STAGE 6 — Memory Pressure

| Metric | Target | Result | Evidence |
|--------|--------|--------|----------|
| No OOM | Yes | ___ | RSS / OOM killer |
| Bounded memory growth | Yes | ___ | RSS delta |
| No unbounded cache | Yes | ___ | Cache size / TTL |

**Status:** PASS / FAIL  
**Observed bottleneck:**  
**Mitigation recommendation:**  

---

### STAGE 7 — Chaos Injection

| Metric | Target | Result | Evidence |
|--------|--------|--------|----------|
| Refund on OpenAI failure | Yes | ___ | Refund calls / balance |
| No silent failures | Yes | ___ | Logs |
| No token leakage | Yes | ___ | Balance consistency |

**Status:** PASS / FAIL  
**Observed bottleneck:**  
**Mitigation recommendation:**  

---

## Scripts and Artifacts

- **k6 scripts:** `scripts/stress/k6-baseline.js`, `k6-stage1-load.js`, `k6-stage2-token-abuse.js` (create from snippets above).
- **Stripe replay:** Keep `stripe_event_replay.json` and `STRIPE_SIGNATURE` in a secure, env-specific location (e.g. `.env.stress` not committed).
- **Report:** Save this document with filled tables as `STRESS_TEST_REPORT_YYYYMMDD.md` after each run.

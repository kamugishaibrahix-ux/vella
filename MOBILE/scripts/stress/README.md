# Stress test scripts (k6)

Used by the [Staged Stress-Test Protocol](../../docs/ops/STRESS_TEST_PROTOCOL.md).

## Prerequisites

- [k6](https://k6.io/docs/getting-started/installation/) installed.
- `BASE_URL`: e.g. `https://staging.example.com` or `http://localhost:3000`.
- `AUTH_COOKIE`: Cookie header value for an authenticated session (e.g. `sb-access-token=...; sb-refresh-token=...`).

## Quick run

```bash
export BASE_URL=http://localhost:3000
export AUTH_COOKIE="your-cookie-header-here"

# Stage 0 — Baseline
k6 run --summary-trend-stats="avg,p(50),p(95),p(99)" scripts/stress/k6-baseline.js

# Stage 1 — 1000 VUs load
k6 run --out json=stage1-metrics.json scripts/stress/k6-stage1-load.js

# Stage 2 — Token abuse (50 concurrent same user)
k6 run scripts/stress/k6-stage2-token-abuse.js

# Stage 5 — DB exhaustion (2000 req/min)
k6 run scripts/stress/k6-stage5-db-exhaustion.js
```

Stages 3, 4, 6, 7 use curl, Redis shutdown, or chaos tooling; see the protocol doc.

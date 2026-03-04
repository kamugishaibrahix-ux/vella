/**
 * STAGE 2 — Token abuse: 50 concurrent requests from same user
 * Verify: one deduction per requestId, no negative balance, no race
 * Run: k6 run scripts/stress/k6-stage2-token-abuse.js
 * Before/after: query token_usage and balance for test user
 * Env: BASE_URL, AUTH_COOKIE (same user for all VUs)
 */
import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 50,
  iterations: 50,
  startTime: "0s",
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH = __ENV.AUTH_COOKIE || "";

export default function () {
  const res = http.post(
    `${BASE_URL}/api/vella/text`,
    JSON.stringify({
      message: "Concurrent token test " + __VU,
      language: "en",
    }),
    {
      headers: { "Content-Type": "application/json", Cookie: AUTH },
    }
  );
  check(res, {
    "status 200 or 402": (r) => r.status === 200 || r.status === 402,
  });
}

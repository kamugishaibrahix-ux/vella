/**
 * STAGE 5 — Supabase exhaustion: 2000 req/min
 * Throttle DB pool separately; this script generates load.
 * Run: k6 run scripts/stress/k6-stage5-db-exhaustion.js
 * Env: BASE_URL, AUTH_COOKIE
 */
import http from "k6/http";
import { check } from "k6";
import { randomIntBetween } from "k6/javascript";

export const options = {
  scenarios: {
    load: {
      executor: "constant-arrival-rate",
      rate: 2000,
      timeUnit: "1m",
      duration: "2m",
      preAllocatedVUs: 100,
      maxVUs: 200,
    },
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH = __ENV.AUTH_COOKIE || "";
const headers = { "Content-Type": "application/json", Cookie: AUTH };

export default function () {
  const r = randomIntBetween(0, 1);
  if (r === 0) {
    const res = http.get(`${BASE_URL}/api/state/current`, { headers });
    check(res, { "state/current any": (x) => x.status > 0 });
  } else {
    const res = http.post(
      `${BASE_URL}/api/vella/text`,
      JSON.stringify({ message: "Load test.", language: "en" }),
      { headers }
    );
    check(res, {
      "vella/text any": (x) =>
        (x.status >= 200 && x.status < 600) || x.status === 503,
    });
  }
}

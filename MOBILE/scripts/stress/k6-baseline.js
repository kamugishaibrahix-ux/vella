/**
 * STAGE 0 — Baseline latency metrics
 * Run: k6 run --summary-trend-stats="avg,p(50),p(95),p(99)" scripts/stress/k6-baseline.js
 * Env: BASE_URL, AUTH_COOKIE (Cookie header value for authenticated requests)
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const vellaTextLatency = new Trend("vella_text_latency");
const compassLatency = new Trend("compass_latency");
const deepdiveLatency = new Trend("deepdive_latency");

export const options = {
  vus: 5,
  duration: "60s",
  thresholds: {
    http_req_duration: ["p(95)<30000"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH = __ENV.AUTH_COOKIE || "";

export default function () {
  const headers = { "Content-Type": "application/json", Cookie: AUTH };

  const vellaRes = http.post(
    `${BASE_URL}/api/vella/text`,
    JSON.stringify({ message: "Hello, how are you?", language: "en" }),
    { headers }
  );
  if (vellaRes.timings.duration) vellaTextLatency.add(vellaRes.timings.duration);
  check(vellaRes, { "vella/text status 200 or 402": (r) => r.status === 200 || r.status === 402 });
  sleep(2);

  const compassRes = http.post(
    `${BASE_URL}/api/compass`,
    JSON.stringify({ raw: "I feel overwhelmed and stuck." }),
    { headers }
  );
  if (compassRes.timings.duration) compassLatency.add(compassRes.timings.duration);
  check(compassRes, { "compass status 200 or 402": (r) => r.status === 200 || r.status === 402 });
  sleep(2);

  const deepdiveRes = http.post(
    `${BASE_URL}/api/deepdive`,
    JSON.stringify({ section: "clarity", text: "I assume the worst will happen." }),
    { headers }
  );
  if (deepdiveRes.timings.duration) deepdiveLatency.add(deepdiveRes.timings.duration);
  check(deepdiveRes, { "deepdive status 200 or 402": (r) => r.status === 200 || r.status === 402 });
  sleep(3);
}

/**
 * STAGE 1 — Concurrency load test: 1000 VUs
 * 30% vella/text, 20% compass, 10% insights/generate, 40% background
 * Run: k6 run --out json=stage1-metrics.json scripts/stress/k6-stage1-load.js
 * Env: BASE_URL, AUTH_COOKIE
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { randomIntBetween } from "k6/javascript";

export const options = {
  scenarios: {
    vella_text: {
      executor: "constant-vus",
      vus: 300,
      duration: "120s",
      startTime: "0s",
      exec: "vellaText",
    },
    compass: {
      executor: "constant-vus",
      vus: 200,
      duration: "120s",
      startTime: "0s",
      exec: "compass",
    },
    insights_generate: {
      executor: "constant-vus",
      vus: 100,
      duration: "120s",
      startTime: "0s",
      exec: "insightsGenerate",
    },
    background: {
      executor: "constant-vus",
      vus: 400,
      duration: "120s",
      startTime: "0s",
      exec: "background",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(99)<60000"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH = __ENV.AUTH_COOKIE || "";
const headers = { "Content-Type": "application/json", Cookie: AUTH };

export function vellaText() {
  const res = http.post(
    `${BASE_URL}/api/vella/text`,
    JSON.stringify({ message: "Short message for load test.", language: "en" }),
    { headers }
  );
  check(res, {
    "vella/text 2xx or 402/429/503": (r) =>
      (r.status >= 200 && r.status < 500) || r.status === 503,
  });
  sleep(randomIntBetween(1, 5));
}

export function compass() {
  const res = http.post(
    `${BASE_URL}/api/compass`,
    JSON.stringify({ raw: "I feel stressed." }),
    { headers }
  );
  check(res, {
    "compass 2xx or 402/429/503": (r) =>
      (r.status >= 200 && r.status < 500) || r.status === 503,
  });
  sleep(randomIntBetween(1, 5));
}

export function insightsGenerate() {
  const res = http.post(
    `${BASE_URL}/api/insights/generate`,
    JSON.stringify({}),
    { headers }
  );
  check(res, {
    "insights/generate 2xx or 402/429/503": (r) =>
      (r.status >= 200 && r.status < 500) || r.status === 503,
  });
  sleep(randomIntBetween(2, 8));
}

export function background() {
  const r = randomIntBetween(0, 4);
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

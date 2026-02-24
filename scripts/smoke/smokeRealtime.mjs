#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDefaultEnv, setupLocalStorage, bootstrapTs, getRepoRoot, overrideModule, createJsonRequest, assertTruthy } from "./helpers.mjs";

const namespace = "[SMOKE:REALTIME]";
const __filename = fileURLToPath(import.meta.url);

ensureDefaultEnv();
setupLocalStorage();

const repoRoot = getRepoRoot();
const requireTs = bootstrapTs({
  projectRelativePath: "MOBILE/tsconfig.json",
  callerUrl: __filename,
});

const TEST_USER_ID = "test-user-smoke";
let allowAuth = true;

function mockServerAuth() {
  const modulePath = path.join(repoRoot, "MOBILE", "lib", "supabase", "server-auth.ts");
  overrideModule(requireTs, modulePath, (original) => {
    const UnauthenticatedError =
      original?.UnauthenticatedError ?? class UnauthenticatedError extends Error {};
    return {
      ...original,
      UnauthenticatedError,
      requireUserId: async () => {
        if (!allowAuth) {
          throw new UnauthenticatedError("not_authenticated");
        }
        return TEST_USER_ID;
      },
    };
  });
}

function mockAdminPolicy() {
  const modulePath = path.join(repoRoot, "MOBILE", "lib", "admin", "adminPolicy.ts");
  overrideModule(requireTs, modulePath, (original) => ({
    ...original,
    loadAdminUserPolicy: async () => ({
      isDisabled: false,
      realtimeEnabled: true,
      canStartSession: true,
    }),
  }));
}

function mockRateLimit() {
  const modulePath = path.join(repoRoot, "MOBILE", "lib", "security", "rateLimit.ts");
  overrideModule(requireTs, modulePath, () => ({
    rateLimit: async () => {},
    RateLimitError: class RateLimitError extends Error {},
  }));
}

function mockTelemetry() {
  const modulePath = path.join(repoRoot, "MOBILE", "lib", "telemetry", "voiceTelemetry.ts");
  overrideModule(requireTs, modulePath, () => ({
    logVoiceTelemetry: () => {},
  }));
}

function mockSupabaseClient() {
  const resolved = requireTs.resolve("@supabase/supabase-js");
  overrideModule(requireTs, resolved, () => ({
    createClient: () => ({
      auth: {
        getUser: async (token) => {
          if (token === "valid-token") {
            return {
              data: { user: { id: TEST_USER_ID } },
              error: null,
            };
          }
          return {
            data: { user: null },
            error: new Error("unauthorized"),
          };
        },
      },
    }),
  }));
}

function mockFetch() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const urlString = typeof url === "string" ? url : url?.url ?? "";
    if (urlString.includes("/v1/realtime/sessions")) {
      return new Response(
        JSON.stringify({
          client_secret: {
            value: "mock-realtime-token",
            expires_at: Date.now() + 60_000,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    if (urlString.includes("/v1/realtime")) {
      return new Response("v=0\r\na=mock-answer", { status: 200 });
    }
    if (typeof originalFetch === "function") {
      return originalFetch(url, options);
    }
    throw new Error(`Unhandled fetch url in smoke test: ${urlString}`);
  };
}

function setupMocks() {
  mockServerAuth();
  mockAdminPolicy();
  mockRateLimit();
  mockTelemetry();
  mockSupabaseClient();
  mockFetch();
}

async function runRealtimeTokenValid() {
  allowAuth = true;
  const route = requireTs(path.join(repoRoot, "MOBILE", "app", "api", "realtime", "token", "route.ts"));
  const response = await route.GET({ method: "GET" });
  const payload = await response.json();
  assertTruthy("realtime token", payload?.token);
}

async function runRealtimeTokenInvalidAuth() {
  allowAuth = false;
  const route = requireTs(path.join(repoRoot, "MOBILE", "app", "api", "realtime", "token", "route.ts"));
  const response = await route.GET({ method: "GET" });
  if (response.status !== 401) {
    throw new Error(`Expected 401, received ${response.status}`);
  }
}

async function runRealtimeOfferValid() {
  allowAuth = true;
  const route = requireTs(path.join(repoRoot, "MOBILE", "app", "api", "realtime", "offer", "route.ts"));
  const headers = new Headers({
    "sb-access-token": "valid-token",
  });
  const request = new Request("http://localhost/api/realtime/offer", {
    method: "POST",
    headers,
    body: JSON.stringify({ sdp: "v=0" }),
  });
  const response = await route.POST(request);
  const payload = await response.json();
  assertTruthy("offer answer", payload?.sdp);
}

async function runRealtimeOfferInvalidAuth() {
  allowAuth = true;
  const route = requireTs(path.join(repoRoot, "MOBILE", "app", "api", "realtime", "offer", "route.ts"));
  const request = new Request("http://localhost/api/realtime/offer", {
    method: "POST",
    headers: new Headers(),
    body: JSON.stringify({ sdp: "v=0" }),
  });
  const response = await route.POST(request);
  if (response.status !== 401) {
    throw new Error(`Expected 401, received ${response.status}`);
  }
}

async function main() {
  setupMocks();

  const steps = [
    { name: "token valid", fn: runRealtimeTokenValid },
    { name: "token invalid auth", fn: runRealtimeTokenInvalidAuth },
    { name: "offer valid", fn: runRealtimeOfferValid },
    { name: "offer missing auth", fn: runRealtimeOfferInvalidAuth },
  ];

  let success = true;
  for (const step of steps) {
    try {
      await step.fn();
      console.log(`${namespace} ${step.name}: PASS`);
    } catch (error) {
      success = false;
      console.error(`${namespace} ${step.name}: FAIL`, error);
    }
  }

  console.log(`${namespace} ${success ? "PASS" : "FAIL"}`);
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  console.error(`${namespace} fatal`, error);
  process.exit(1);
});



#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDefaultEnv, bootstrapTs, getRepoRoot, overrideModule, createJsonRequest, assertTruthy } from "./helpers.mjs";

const namespace = "[SMOKE:ADMIN]";
const __filename = fileURLToPath(import.meta.url);

ensureDefaultEnv({
  NEXT_PUBLIC_ENV: "development",
  ADMIN_ACTIVITY_ACTOR_ID: "00000000-0000-0000-0000-000000000000",
});

const repoRoot = getRepoRoot();
const requireTs = bootstrapTs({
  projectRelativePath: "apps/vella-control/tsconfig.json",
  callerUrl: __filename,
});

function createStubSupabase() {
  const queryBuilder = () => {
    const chain = {
      select() {
        return Promise.resolve({ data: [], error: null });
      },
      insert() {
        return Promise.resolve({ data: [], error: null });
      },
      update() {
        return Promise.resolve({ data: [], error: null });
      },
      eq() {
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      maybeSingle() {
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  };

  return {
    from() {
      return queryBuilder();
    },
    auth: {
      getUser: async () => ({
        data: {
          user: {
            user_metadata: { is_admin: true },
          },
        },
        error: null,
      }),
    },
  };
}

function mockAdminSupabase() {
  const modulePath = path.join(repoRoot, "apps", "vella-control", "lib", "supabase", "adminClient.ts");
  overrideModule(requireTs, modulePath, (original) => ({
    ...original,
    getAdminClient: () => createStubSupabase(),
  }));
}

function mockAnalyticsCounters() {
  const modulePath = path.join(repoRoot, "apps", "vella-control", "lib", "supabase", "adminClient.ts");
  overrideModule(requireTs, modulePath, (original) => {
    const client = createStubSupabase();
    return {
      ...original,
      getAdminClient: () => ({
        ...client,
        from: () => ({
          select: async () => ({
            data: [
              { key: "daily_active_users", value: 42 },
              { key: "total_sessions", value: 120 },
            ],
            error: null,
          }),
        }),
      }),
    };
  });
}

async function runAnalyticsGet() {
  mockAnalyticsCounters();
  const route = requireTs(path.join(repoRoot, "apps", "vella-control", "app", "api", "admin", "analytics", "get", "route.ts"));
  const response = await route.GET();
  const payload = await response.json();
  if (!payload || typeof payload.data !== "object") {
    throw new Error("analytics payload missing");
  }
}

async function runUsersList() {
  mockAdminSupabase();
  const route = requireTs(path.join(repoRoot, "apps", "vella-control", "app", "api", "admin", "users", "list", "route.ts"));
  const response = await route.GET();
  const payload = await response.json();
  if (!Array.isArray(payload?.data)) {
    throw new Error("users list missing array");
  }
}

async function runConfigGet() {
  mockAdminSupabase();
  const route = requireTs(path.join(repoRoot, "apps", "vella-control", "app", "api", "admin", "config", "get", "route.ts"));
  const response = await route.GET();
  const payload = await response.json();
  if (!payload || typeof payload.data !== "object") {
    throw new Error("config payload missing");
  }
}

async function runConfigSave() {
  mockAdminSupabase();
  const route = requireTs(path.join(repoRoot, "apps", "vella-control", "app", "api", "admin", "config", "save", "route.ts"));
  const req = createJsonRequest({ realtimeModel: "gpt-4o-realtime-preview" });
  const response = await route.POST(req);
  const payload = await response.json();
  assertTruthy("config save success", payload?.success ?? false);
}

async function runLogsList() {
  mockAdminSupabase();
  const route = requireTs(path.join(repoRoot, "apps", "vella-control", "app", "api", "admin", "logs", "list", "route.ts"));
  const response = await route.GET();
  const payload = await response.json();
  if (!Array.isArray(payload?.logs)) {
    throw new Error("logs list missing array");
  }
}

async function runFeedbackList() {
  mockAdminSupabase();
  const route = requireTs(path.join(repoRoot, "apps", "vella-control", "app", "api", "admin", "feedback", "list", "route.ts"));
  const response = await route.GET();
  const payload = await response.json();
  if (!Array.isArray(payload?.feedback)) {
    throw new Error("feedback list missing array");
  }
}

async function main() {
  const steps = [
    { name: "analytics/get", fn: runAnalyticsGet },
    { name: "users/list", fn: runUsersList },
    { name: "config/get", fn: runConfigGet },
    { name: "config/save", fn: runConfigSave },
    { name: "logs/list", fn: runLogsList },
    { name: "feedback/list", fn: runFeedbackList },
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



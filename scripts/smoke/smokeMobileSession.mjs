#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDefaultEnv, assertTruthy, setupLocalStorage, bootstrapTs, getRepoRoot, overrideModule } from "./helpers.mjs";

const namespace = "[SMOKE:MOBILE_SESSION]";
const __filename = fileURLToPath(import.meta.url);

ensureDefaultEnv();
setupLocalStorage();

const repoRoot = getRepoRoot();
const requireTs = bootstrapTs({
  projectRelativePath: "MOBILE/tsconfig.json",
  callerUrl: __filename,
});

const TEST_USER_ID = "test-user-smoke";

const localPaths = {
  checkins: path.join(repoRoot, "MOBILE", "lib", "local", "checkinsLocal.ts"),
  journals: path.join(repoRoot, "MOBILE", "lib", "local", "journalLocal.ts"),
  traits: path.join(repoRoot, "MOBILE", "lib", "local", "traitsLocal.ts"),
};

const { saveCheckin } = requireTs(localPaths.checkins);
const { createLocalJournal } = requireTs(localPaths.journals);
const { saveLocalTraits, appendLocalTraitHistory } = requireTs(localPaths.traits);

function seedLocalData(userId) {
  const now = Date.now();

  for (let i = 0; i < 5; i++) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000);
    saveCheckin(userId, {
      id: `smoke-checkin-${i}`,
      entry_date: date.toISOString().slice(0, 10),
      mood: 6 + (i % 3),
      stress: 4 + (i % 2),
      energy: 5 + (i % 4),
      focus: 6 - (i % 2),
      created_at: date.toISOString(),
    });
  }

  for (let i = 0; i < 3; i++) {
    createLocalJournal(userId, {
      title: `Smoke Journal ${i + 1}`,
      content: `Automated smoke entry ${i + 1} about focus and calm.`,
    });
  }

  const snapshot = {
    userId,
    scores: {
      resilience: 72,
      clarity: 68,
      discipline: 65,
      emotional_stability: 70,
      motivation: 74,
      self_compassion: 69,
    },
    lastComputedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  saveLocalTraits(userId, snapshot);

  appendLocalTraitHistory(userId, {
    id: `smoke-trait-${now}`,
    userId,
    windowStart: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    windowEnd: new Date(now).toISOString(),
    scores: snapshot.scores,
    createdAt: new Date(now).toISOString(),
  });
}

function mockServerAuth() {
  const modulePath = path.join(repoRoot, "MOBILE", "lib", "supabase", "server-auth.ts");
  overrideModule(requireTs, modulePath, (original) => ({
    ...original,
    requireUserId: async () => TEST_USER_ID,
    UnauthenticatedError: class extends Error {},
  }));
}

function mockGoalEngine() {
  const modulePath = path.join(repoRoot, "MOBILE", "lib", "goals", "goalEngine.ts");
  const sampleGoals = [
    {
      id: 1,
      user_id: TEST_USER_ID,
      type: "life",
      title: "Stay grounded",
      description: "Mindful mornings",
      status: "active",
      priority: 1,
      target_date: null,
    },
    {
      id: 2,
      user_id: TEST_USER_ID,
      type: "focus",
      title: "Deep work block",
      description: "90 minute focus",
      status: "active",
      priority: 2,
      target_date: null,
    },
    {
      id: 3,
      user_id: TEST_USER_ID,
      type: "weekly",
      title: "Active recovery",
      description: "Stretch and breathe",
      status: "active",
      priority: 2,
      target_date: null,
    },
  ];

  overrideModule(requireTs, modulePath, (original) => ({
    ...original,
    listGoals: async (_userId, type) =>
      sampleGoals
        .filter((goal) => (type ? goal.type === type : true))
        .map((goal) => ({ ...goal })),
  }));
}

function mockRateLimit() {
  const modulePath = path.join(repoRoot, "MOBILE", "lib", "security", "rateLimit.ts");
  overrideModule(requireTs, modulePath, () => ({
    rateLimit: async () => {},
    RateLimitError: class RateLimitError extends Error {},
  }));
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

async function runLocalEngines() {
  const { getAllCheckIns } = requireTs(path.join(repoRoot, "MOBILE", "lib", "checkins", "getAllCheckIns.ts"));
  const { generateEmotionalForecast } = requireTs(path.join(repoRoot, "MOBILE", "lib", "forecast", "generateEmotionalForecast.ts"));
  const { generateWeeklyReview } = requireTs(path.join(repoRoot, "MOBILE", "lib", "review", "weeklyReview.ts"));
  const { buildDailyContext } = requireTs(path.join(repoRoot, "MOBILE", "lib", "ai", "context", "buildDailyContext.ts"));

  const checkins = await getAllCheckIns(TEST_USER_ID);
  assertTruthy("checkins", checkins);

  const forecast = await generateEmotionalForecast(TEST_USER_ID);
  assertTruthy("forecast.shortTerm", forecast?.shortTerm);

  const review = await generateWeeklyReview(TEST_USER_ID);
  assertTruthy("weeklyReview.highlights", review?.highlights ?? []);

  const context = await buildDailyContext(TEST_USER_ID);
  assertTruthy("dailyContext", context);
}

async function runForecastApi() {
  const route = requireTs(path.join(repoRoot, "MOBILE", "app", "api", "forecast", "route.ts"));
  const response = await route.GET({ method: "GET" });
  const payload = await response.json();
  assertTruthy("api/forecast forecast", payload?.forecast);
}

async function runIdentityApi() {
  const route = requireTs(path.join(repoRoot, "MOBILE", "app", "api", "identity", "route.ts"));
  const response = await route.GET({ method: "GET" });
  const payload = await response.json();
  assertTruthy("api/identity traits", payload?.traits);
  assertTruthy("api/identity strengths", payload?.strengthsValues?.strengths ?? []);
}

async function runWeeklyReviewApi() {
  const route = requireTs(path.join(repoRoot, "MOBILE", "app", "api", "weekly-review", "route.ts"));
  const response = await route.GET({ method: "GET" });
  const payload = await response.json();
  assertTruthy("api/weekly-review highlights", payload?.highlights ?? []);
}

async function main() {
  seedLocalData(TEST_USER_ID);
  mockServerAuth();
  mockGoalEngine();
  mockRateLimit();
  mockAdminPolicy();

  const steps = [
    { name: "Local engines", fn: runLocalEngines },
    { name: "API /forecast", fn: runForecastApi },
    { name: "API /identity", fn: runIdentityApi },
    { name: "API /weekly-review", fn: runWeeklyReviewApi },
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



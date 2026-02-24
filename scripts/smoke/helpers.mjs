#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const requireShim = createRequire(import.meta.url);

export function getRepoRoot() {
  return repoRoot;
}

export function ensureDefaultEnv(overrides = {}) {
  const defaults = {
    NODE_ENV: "development",
    DATA_DESIGN_ACK: "true",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "",
    NEXT_PUBLIC_ENV: "development",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_PRICE_PRO: "price_test_pro",
    STRIPE_PRICE_ELITE: "price_test_elite",
    OPENAI_API_KEY: "sk-test-placeholder",
    OPENAI_MODEL: "gpt-4o",
    OPENAI_AUDIO_MODEL: "gpt-4o-audio-preview",
    OPENAI_REALTIME_MODEL: "gpt-4o-realtime-preview",
    ADMIN_ACTIVITY_ACTOR_ID: "00000000-0000-0000-0000-000000000000",
  };

  const entries = Object.entries({ ...defaults, ...overrides });
  for (const [key, value] of entries) {
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

export function bootstrapTs() {
  // All smoke scripts run as pure ESM. No TS runtime needed.
  return requireShim;
}

export function requireTs(path) {
  // Pure ESM loader fallback
  return import(path);
}

export function setupLocalStorage() {
  if (globalThis.window?.localStorage) {
    return globalThis.window.localStorage;
  }

  let store = {};
  const memoryStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    },
    key(index) {
      return Object.keys(store)[index] ?? null;
    },
    get length() {
      return Object.keys(store).length;
    },
  };

  const browserWindow = globalThis.window ?? {};
  browserWindow.localStorage = memoryStorage;
  globalThis.window = browserWindow;
  globalThis.localStorage = memoryStorage;
  globalThis.self = browserWindow;
  if (!globalThis.crypto) {
    globalThis.crypto = {
      randomUUID: () => randomUUID(),
    };
  } else if (typeof globalThis.crypto.randomUUID !== "function") {
    globalThis.crypto.randomUUID = () => randomUUID();
  }

  return memoryStorage;
}

export function overrideModule(activeLoader, modulePath, transformer) {
  const loader = activeLoader ?? requireShim;
  const resolved =
    modulePath.startsWith("file:")
      ? fileURLToPath(modulePath)
      : path.isAbsolute(modulePath)
        ? modulePath
        : loader.resolve(modulePath);

  const original = loader(resolved);
  const mutated = transformer(original);
  const cached = loader.cache?.[resolved];
  if (cached) {
    cached.exports = mutated;
  } else if (loader.cache) {
    loader.cache[resolved] = { exports: mutated };
  }
  return mutated;
}

export function createHeaders(init = {}) {
  const normalized = Object.fromEntries(
    Object.entries(init).map(([key, value]) => [String(key).toLowerCase(), value]),
  );

  return {
    get(key) {
      if (!key) return null;
      return normalized[String(key).toLowerCase()] ?? null;
    },
    entries() {
      return Object.entries(normalized);
    },
  };
}

export function createJsonRequest(body = {}, headers = {}, method = "POST") {
  return {
    method,
    json: async () => body,
    headers: createHeaders(headers),
  };
}

export function assertTruthy(label, value) {
  const ok =
    Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";
  if (!ok) {
    throw new Error(`Expected ${label} to be present`);
  }
}



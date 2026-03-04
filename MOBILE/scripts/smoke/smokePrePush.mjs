#!/usr/bin/env node
/**
 * Pre-push smoke test — verifies all production requirements against a running dev server.
 *
 * Usage:
 *   node scripts/smoke/smokePrePush.mjs [base_url]
 *
 * Default base_url: http://localhost:3000
 */

const BASE = process.argv[2] || "http://localhost:3000";
let passed = 0;
let failed = 0;

async function check(label, fn) {
  try {
    const result = await fn();
    if (result.ok) {
      console.log(`  ✅ ${label}: ${result.detail}`);
      passed++;
    } else {
      console.error(`  ❌ ${label}: ${result.detail}`);
      failed++;
    }
  } catch (err) {
    console.error(`  ❌ ${label}: EXCEPTION — ${err.message}`);
    failed++;
  }
}

console.log(`\n🔍 Pre-push smoke tests against ${BASE}\n`);

// ── REQ 1: BRANDING ──────────────────────────────────────────────────────────

console.log("REQ 1 — BRANDING");

await check("Manifest name=Vella, description=Your Life's Compass", async () => {
  const res = await fetch(`${BASE}/manifest.webmanifest`);
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
  const m = await res.json();
  const checks = [
    m.name === "Vella",
    m.short_name === "Vella",
    m.description === "Your Life's Compass",
    m.display === "standalone",
    m.start_url === "/",
    m.icons?.some((i) => i.sizes === "192x192"),
    m.icons?.some((i) => i.sizes === "512x512"),
  ];
  const failures = [];
  if (!checks[0]) failures.push(`name="${m.name}"`);
  if (!checks[1]) failures.push(`short_name="${m.short_name}"`);
  if (!checks[2]) failures.push(`description="${m.description}"`);
  if (!checks[3]) failures.push(`display="${m.display}"`);
  if (!checks[4]) failures.push(`start_url="${m.start_url}"`);
  if (!checks[5]) failures.push("missing 192 icon");
  if (!checks[6]) failures.push("missing 512 icon");
  return failures.length === 0
    ? { ok: true, detail: "all manifest fields correct" }
    : { ok: false, detail: failures.join(", ") };
});

// ── REQ 2: ONBOARDING ────────────────────────────────────────────────────────

console.log("\nREQ 2 — ONBOARDING");

await check("/onboarding returns 200", async () => {
  const res = await fetch(`${BASE}/onboarding`, { redirect: "follow" });
  return res.status === 200
    ? { ok: true, detail: `HTTP ${res.status}` }
    : { ok: false, detail: `HTTP ${res.status}` };
});

await check("/onboarding/welcome returns 200", async () => {
  const res = await fetch(`${BASE}/onboarding/welcome`, { redirect: "follow" });
  return res.status === 200
    ? { ok: true, detail: `HTTP ${res.status}` }
    : { ok: false, detail: `HTTP ${res.status}` };
});

// ── REQ 3: CHAT ENDPOINT ─────────────────────────────────────────────────────

console.log("\nREQ 3 — CHAT ENDPOINT");

await check("POST /api/vella/text returns 401 JSON (no auth)", async () => {
  const res = await fetch(`${BASE}/api/vella/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  });
  const body = await res.text();
  let json;
  try { json = JSON.parse(body); } catch { json = null; }
  if (res.status === 401 && json) {
    return { ok: true, detail: `HTTP 401, JSON body: ${JSON.stringify(json).slice(0, 100)}` };
  }
  return { ok: false, detail: `HTTP ${res.status}, body: ${body.slice(0, 120)}` };
});

await check("GET /api/vella/text returns 405 (method not allowed)", async () => {
  const res = await fetch(`${BASE}/api/vella/text`, { method: "GET" });
  // 405 is correct — only POST is exported
  return res.status === 405
    ? { ok: true, detail: `HTTP 405 (correct — GET not supported)` }
    : { ok: false, detail: `HTTP ${res.status} (expected 405)` };
});

// ── REQ 4: HEALTH / BOOT STABILITY ───────────────────────────────────────────

console.log("\nREQ 4 — BACKEND STABILITY");

await check("/api/system/health returns 401 or 200 (never 500)", async () => {
  const res = await fetch(`${BASE}/api/system/health`);
  if (res.status === 200 || res.status === 401) {
    return { ok: true, detail: `HTTP ${res.status}` };
  }
  return { ok: false, detail: `HTTP ${res.status} — expected 200 or 401` };
});

// ── PWA ───────────────────────────────────────────────────────────────────────

console.log("\nREQ 5 — PWA INSTALL FLOW");

await check("/manifest.webmanifest returns 200", async () => {
  const res = await fetch(`${BASE}/manifest.webmanifest`);
  return res.status === 200
    ? { ok: true, detail: `HTTP ${res.status}` }
    : { ok: false, detail: `HTTP ${res.status}` };
});

// ── SUMMARY ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`  Passed: ${passed}   Failed: ${failed}`);
if (failed === 0) {
  console.log("  ✅ ALL SMOKE TESTS PASSED — safe to push.\n");
  process.exit(0);
} else {
  console.error("  ❌ SOME TESTS FAILED — do NOT push.\n");
  process.exit(1);
}

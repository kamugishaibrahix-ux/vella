#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDefaultEnv, setupLocalStorage, bootstrapTs, getRepoRoot, overrideModule, createJsonRequest, assertTruthy } from "./helpers.mjs";

const namespace = "[SMOKE:STRIPE]";
const __filename = fileURLToPath(import.meta.url);

ensureDefaultEnv({
  STRIPE_SECRET_KEY: "sk_test_smoke",
  STRIPE_PRICE_PRO: "price_test_pro",
  STRIPE_PRICE_ELITE: "price_test_elite",
});
setupLocalStorage();

const repoRoot = getRepoRoot();
const requireTs = bootstrapTs({
  projectRelativePath: "MOBILE/tsconfig.json",
  callerUrl: __filename,
});

function mockStripeModule() {
  const modulePath = path.join(repoRoot, "MOBILE", "lib", "payments", "stripe.ts");
  overrideModule(requireTs, modulePath, (original) => {
    const mockStripe = {
      checkout: {
        sessions: {
          create: async () => ({
            url: "https://stripe.test/checkout-session",
          }),
        },
      },
      billingPortal: {
        sessions: {
          create: async () => ({
            url: "https://stripe.test/billing-portal",
          }),
        },
      },
      webhooks: {
        constructEvent: () => ({}),
      },
      subscriptions: {
        retrieve: async () => ({
          id: "sub_test",
          customer: "cus_test",
          status: "active",
          items: {
            data: [
              {
                price: {
                  id: process.env.STRIPE_PRICE_PRO,
                },
              },
            ],
          },
          current_period_start: Date.now() / 1000,
          current_period_end: Date.now() / 1000 + 30 * 24 * 60 * 60,
        }),
      },
    };

    return {
      ...original,
      stripe: mockStripe,
      PLAN_PRICE_IDS: {
        ...original.PLAN_PRICE_IDS,
        pro: process.env.STRIPE_PRICE_PRO,
        elite: process.env.STRIPE_PRICE_ELITE,
      },
    };
  });
}

async function callCheckoutSession() {
  const route = requireTs(path.join(repoRoot, "MOBILE", "app", "api", "stripe", "create-checkout-session", "route.ts"));
  const req = createJsonRequest({ plan: "pro", email: "smoke@example.com" }, { origin: "http://localhost:3000" });
  const response = await route.POST(req);
  const payload = await response.json();
  assertTruthy("checkout session url", payload?.url);
}

async function callBillingPortal() {
  const route = requireTs(path.join(repoRoot, "MOBILE", "app", "api", "stripe", "portal", "route.ts"));
  const req = createJsonRequest(
    { customerId: "cus_test", returnPath: "/profile" },
    { origin: "http://localhost:3000" },
  );
  const response = await route.POST(req);
  const payload = await response.json();
  assertTruthy("billing portal url", payload?.url);
}

async function main() {
  mockStripeModule();

  const steps = [
    { name: "checkout session", fn: callCheckoutSession },
    { name: "billing portal", fn: callBillingPortal },
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



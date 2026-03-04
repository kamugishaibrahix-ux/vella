/**
 * Contract Template Bank — Unit Tests
 */

import { describe, it, expect } from "vitest";
import {
  CONTRACT_TEMPLATES,
  getTemplatesForDomain,
  getTemplateById,
  type Domain,
  type ContractTemplate,
} from "@/lib/contracts/contractTemplates";

const ALL_DOMAINS: Domain[] = [
  "health",
  "finance",
  "cognitive",
  "performance",
  "recovery",
  "addiction",
  "relationships",
  "identity",
];

describe("CONTRACT_TEMPLATES registry", () => {
  // ── Domain coverage ────────────────────────────────────────────────────
  it.each(ALL_DOMAINS)("has at least 2 templates for domain: %s", (domain) => {
    const count = CONTRACT_TEMPLATES.filter((t) => t.domain === domain).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ── No undefined domain values ────────────────────────────────────────
  it("every template has a valid domain", () => {
    for (const t of CONTRACT_TEMPLATES) {
      expect(ALL_DOMAINS).toContain(t.domain);
    }
  });

  // ── Unique IDs ────────────────────────────────────────────────────────
  it("all template IDs are unique", () => {
    const ids = CONTRACT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ── Budget weight range ───────────────────────────────────────────────
  it("budgetWeight is between 1 and 5 for every template", () => {
    for (const t of CONTRACT_TEMPLATES) {
      expect(t.budgetWeight).toBeGreaterThanOrEqual(1);
      expect(t.budgetWeight).toBeLessThanOrEqual(5);
    }
  });

  // ── Recommended days range ────────────────────────────────────────────
  it("recommendedDays is between 3 and 7 for every template", () => {
    for (const t of CONTRACT_TEMPLATES) {
      expect(t.recommendedDays).toBeGreaterThanOrEqual(3);
      expect(t.recommendedDays).toBeLessThanOrEqual(7);
    }
  });
});

describe("getTemplatesForDomain", () => {
  it("returns only templates matching domain and severity", () => {
    const results = getTemplatesForDomain("health", "high");
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const t of results) {
      expect(t.domain).toBe("health");
      expect(t.severity).toBe("high");
    }
  });

  it("returns empty array for unmatched severity", () => {
    const results = getTemplatesForDomain("finance", "low");
    expect(results).toEqual([]);
  });
});

describe("getTemplateById", () => {
  it("returns the correct template for a known ID", () => {
    const t = getTemplateById("finance_spending_pause");
    expect(t).not.toBeNull();
    expect(t!.domain).toBe("finance");
    expect(t!.severity).toBe("moderate");
  });

  it("returns null for an unknown ID", () => {
    expect(getTemplateById("nonexistent_id")).toBeNull();
  });
});

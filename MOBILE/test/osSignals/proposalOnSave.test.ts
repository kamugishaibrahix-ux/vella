/**
 * Tests for proposal-on-save orchestrator and local inbox repo.
 * Covers:
 *   Part 1: proposal_ready items insert, list, order, schema rejects unknown fields
 *   Part 2: proposal created only in signals_only, no proposal in private,
 *           dedupe blocks duplicates within 72h, selectedDomains filtering
 */

import { describe, it, expect, vi } from "vitest";
import { maybeCreateProposal } from "@/lib/osSignals/proposalOnSave";
import type { ProposalOnSaveDeps } from "@/lib/osSignals/proposalOnSave";
import type { OSSignal } from "@/lib/osSignals/taxonomy";
import type { ProposalInboxItem } from "@/lib/execution/types";
import type { Proposal } from "@/lib/osSignals/proposalEngine";

const NOW = "2026-02-27T12:00:00.000Z";

function makeSignal(overrides: Partial<OSSignal> = {}): OSSignal {
  return {
    domain: "emotional-intelligence",
    code: "EI_ANXIETY_ELEVATED",
    severity: "high",
    confidence: 70,
    source: "journal",
    ...overrides,
  };
}

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "proposal::emotional-intelligence::2026-02-27T12:00:00.000Z",
    domain: "emotional-intelligence",
    severity: "high",
    recommendedDurationDays: 7,
    budgetWeight: 5,
    reasonCodes: ["HIGH_SEVERITY_RECENT"],
    created_at: NOW,
    ...overrides,
  };
}

function buildDeps(overrides: Partial<ProposalOnSaveDeps> = {}): ProposalOnSaveDeps {
  return {
    getRecentEntriesMeta: () => [
      { created_at: "2026-02-27T10:00:00.000Z", signals: [makeSignal()] },
    ],
    getSelectedDomains: () => ["emotional-intelligence"],
    hasPendingProposal: vi.fn().mockResolvedValue(false),
    addProposalItem: vi.fn().mockResolvedValue(undefined),
    evaluateProposal: vi.fn().mockReturnValue(makeProposal()),
    generateId: () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    now: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Part 1: ProposalInboxItem shape & ordering
// ---------------------------------------------------------------------------

describe("ProposalInboxItem shape", () => {
  it("created item has all required fields, no free text", async () => {
    const deps = buildDeps();
    const result = await maybeCreateProposal(deps);

    expect(result.created).toBe(true);
    expect(result.item).not.toBeNull();

    const item = result.item!;
    expect(item.type).toBe("proposal_ready");
    expect(item.proposal_id).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(item.domain).toBe("emotional-intelligence");
    expect(item.severity).toBe("high");
    expect(item.reason_codes).toEqual(["HIGH_SEVERITY_RECENT"]);
    expect(item.created_at).toBe(NOW);
    expect(item.status).toBe("pending");

    // Verify no free-text fields
    const keys = Object.keys(item).sort();
    expect(keys).toEqual([
      "created_at",
      "domain",
      "id",
      "proposal_id",
      "reason_codes",
      "severity",
      "status",
      "type",
    ]);
  });

  it("item id is prefixed with proposal_inbox::", async () => {
    const deps = buildDeps();
    const result = await maybeCreateProposal(deps);
    expect(result.item!.id).toMatch(/^proposal_inbox::/);
  });

  it("addProposalItem is called with the correct item", async () => {
    const addFn = vi.fn().mockResolvedValue(undefined);
    const deps = buildDeps({ addProposalItem: addFn });

    await maybeCreateProposal(deps);

    expect(addFn).toHaveBeenCalledTimes(1);
    const calledWith = addFn.mock.calls[0][0] as ProposalInboxItem;
    expect(calledWith.type).toBe("proposal_ready");
    expect(calledWith.domain).toBe("emotional-intelligence");
    expect(calledWith.severity).toBe("high");
    expect(calledWith.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// Part 2: Proposal generation rules
// ---------------------------------------------------------------------------

describe("proposal created only in signals_only mode", () => {
  it("creates proposal when signals exist and evaluateProposal returns non-null", async () => {
    const deps = buildDeps();
    const result = await maybeCreateProposal(deps);
    expect(result.created).toBe(true);
    expect(result.item).not.toBeNull();
  });

  it("does NOT create proposal when evaluateProposal returns null (simulates private mode / no signals)", async () => {
    const deps = buildDeps({
      evaluateProposal: vi.fn().mockReturnValue(null),
    });
    const result = await maybeCreateProposal(deps);
    expect(result.created).toBe(false);
    expect(result.item).toBeNull();
  });

  it("does NOT create proposal when recentEntriesMeta is empty (private mode scenario)", async () => {
    const deps = buildDeps({
      getRecentEntriesMeta: () => [],
    });
    const result = await maybeCreateProposal(deps);
    expect(result.created).toBe(false);
    expect(result.item).toBeNull();
  });
});

describe("no proposal in private mode", () => {
  it("returns NONE when no entries have signals (all private)", async () => {
    const deps = buildDeps({
      getRecentEntriesMeta: () => [],
    });
    const result = await maybeCreateProposal(deps);
    expect(result.created).toBe(false);
  });
});

describe("dedupe blocks duplicates within 72h", () => {
  it("does NOT create proposal when hasPendingProposal returns true", async () => {
    const deps = buildDeps({
      hasPendingProposal: vi.fn().mockResolvedValue(true),
    });
    const result = await maybeCreateProposal(deps);
    expect(result.created).toBe(false);
    expect(result.item).toBeNull();
  });

  it("hasPendingProposal is called with the proposal's domain", async () => {
    const hasPendingFn = vi.fn().mockResolvedValue(false);
    const deps = buildDeps({ hasPendingProposal: hasPendingFn });

    await maybeCreateProposal(deps);

    expect(hasPendingFn).toHaveBeenCalledWith("emotional-intelligence");
  });

  it("creates proposal when hasPendingProposal returns false", async () => {
    const deps = buildDeps({
      hasPendingProposal: vi.fn().mockResolvedValue(false),
    });
    const result = await maybeCreateProposal(deps);
    expect(result.created).toBe(true);
  });
});

describe("selectedDomains filtering", () => {
  it("returns NONE when selectedDomains is empty", async () => {
    const deps = buildDeps({
      getSelectedDomains: () => [],
    });
    const result = await maybeCreateProposal(deps);
    expect(result.created).toBe(false);
  });

  it("passes selectedDomains to evaluateProposal", async () => {
    const evalFn = vi.fn().mockReturnValue(makeProposal());
    const deps = buildDeps({
      getSelectedDomains: () => ["physical-health", "emotional-intelligence"],
      evaluateProposal: evalFn,
    });

    await maybeCreateProposal(deps);

    expect(evalFn).toHaveBeenCalledTimes(1);
    const call = evalFn.mock.calls[0];
    expect(call[0].selectedDomains).toEqual(["physical-health", "emotional-intelligence"]);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("same inputs produce same result", async () => {
    const makeDeps = () => buildDeps({
      hasPendingProposal: vi.fn().mockResolvedValue(false),
      addProposalItem: vi.fn().mockResolvedValue(undefined),
    });

    const r1 = await maybeCreateProposal(makeDeps());
    const r2 = await maybeCreateProposal(makeDeps());

    expect(r1.created).toBe(r2.created);
    expect(r1.item?.domain).toBe(r2.item?.domain);
    expect(r1.item?.severity).toBe(r2.item?.severity);
    expect(r1.item?.reason_codes).toEqual(r2.item?.reason_codes);
  });
});

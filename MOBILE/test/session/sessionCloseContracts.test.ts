/**
 * Session Close — Route-level Tests
 * Mocks auth and governance extraction.
 * Note: Contract creation was removed from session close (v2 negotiation protocol).
 * Contracts are now only created via POST /api/session/confirm-contract.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/vella/session/close/route";

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/server-auth", () => ({
  requireUserId: vi.fn().mockResolvedValue("test-user-id"),
}));

const mockExtractGovernance = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/session/governanceExtraction", () => ({
  extractGovernanceSignalsFromSession: (...args: unknown[]) => mockExtractGovernance(...args),
}));

vi.mock("@/lib/telemetry/securityEvents", () => ({
  logSecurityEvent: vi.fn(),
}));

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    summary: {
      sessionId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      dominantTopics: ["sleep"],
      emotionalTone: "neutral",
      contradictionsDetected: false,
      valueAlignmentShift: false,
    },
    selectedDomains: ["health"],
    ...overrides,
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/vella/session/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/vella/session/close — selectedDomains validation", () => {
  it("returns 400 when selectedDomains is missing", async () => {
    const res = await POST(makeRequest(makeBody({ selectedDomains: undefined })));
    expect(res.status).toBe(400);
  });

  it("returns 400 when selectedDomains is empty array", async () => {
    const res = await POST(makeRequest(makeBody({ selectedDomains: [] })));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_SELECTED_DOMAINS");
  });

  it("returns 400 when selectedDomains has more than 3 items", async () => {
    const res = await POST(
      makeRequest(makeBody({ selectedDomains: ["health", "finance", "cognitive", "recovery"] })),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_SELECTED_DOMAINS");
  });

  it("returns 400 when selectedDomains contains invalid string", async () => {
    const res = await POST(makeRequest(makeBody({ selectedDomains: ["invalid_domain"] })));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_SELECTED_DOMAINS");
  });

  it("does not call governance extraction when validation fails", async () => {
    await POST(makeRequest(makeBody({ selectedDomains: [] })));
    expect(mockExtractGovernance).not.toHaveBeenCalled();
  });
});

describe("POST /api/vella/session/close — governance extraction (no contract creation)", () => {
  it("returns ok with governanceEventsRecorded when valid", async () => {
    const res = await POST(makeRequest(makeBody({ selectedDomains: ["health", "finance"] })));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.governanceEventsRecorded).toBe(1);
  });

  it("does not include contracts field in response", async () => {
    const res = await POST(makeRequest(makeBody()));
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.contracts).toBeUndefined();
  });

  it("calls governance extraction with userId and summary", async () => {
    await POST(makeRequest(makeBody()));
    expect(mockExtractGovernance).toHaveBeenCalledWith(
      "test-user-id",
      expect.objectContaining({
        sessionId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        dominantTopics: ["sleep"],
        emotionalTone: "neutral",
      }),
    );
  });

  it("returns 500 when governance extraction throws", async () => {
    mockExtractGovernance.mockRejectedValue(new Error("infra failure"));

    const res = await POST(makeRequest(makeBody()));
    expect(res.status).toBe(500);
  });
});

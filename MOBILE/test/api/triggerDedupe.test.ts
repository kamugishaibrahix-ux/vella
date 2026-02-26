import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE imports (vitest hoists vi.mock)
// ---------------------------------------------------------------------------

const mockRecordEvent = vi.fn();
const mockFromSafe = vi.fn();
const mockRateLimit = vi.fn();
const mockRequireUserId = vi.fn();

vi.mock("@/lib/governance/events", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  fromSafe: (...args: unknown[]) => mockFromSafe(...args),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  isRateLimitError: () => false,
  rateLimit429Response: () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
}));

vi.mock("@/lib/supabase/server-auth", () => ({
  requireUserId: () => mockRequireUserId(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/execution/trigger/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildQuery(existingRow: { id: string } | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: existingRow, error: null }),
  };
}

const VALID_FIRED_BODY = {
  commitment_id: "550e8400-e29b-41d4-a716-446655440000",
  domain_code: "fitness",
  trigger_type: "window_open",
  window_start_iso: "2026-02-24T00:00:00Z",
  window_end_iso: "2026-02-24T23:59:59Z",
  idempotency_key: "trigger_fired::550e8400-e29b-41d4-a716-446655440000::2026-02-24T00:00:00Z",
};

const VALID_SUPPRESSED_BODY = {
  commitment_id: "550e8400-e29b-41d4-a716-446655440000",
  domain_code: "fitness",
  trigger_type: "window_open",
  window_start_iso: "2026-02-24T00:00:00Z",
  reason_code: "quiet_hours",
  idempotency_key: "trigger_suppressed::550e8400-e29b-41d4-a716-446655440000::2026-02-24T00:00:00Z::quiet_hours",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserId.mockResolvedValue("user-123");
  mockRateLimit.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// trigger/log dedupe
// ---------------------------------------------------------------------------

describe("POST /api/execution/trigger/log — server-side dedupe", () => {
  it("returns deduped=true when idempotency_key already exists", async () => {
    const query = buildQuery({ id: "existing-event-id" });
    mockFromSafe.mockReturnValue(query);

    const { POST } = await import("@/app/api/execution/trigger/log/route");
    const req = makeRequest(VALID_FIRED_BODY) as any;
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.deduped).toBe(true);
    expect(json.existing_id).toBe("existing-event-id");
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it("inserts when no existing event found (deduped=false)", async () => {
    const query = buildQuery(null);
    mockFromSafe.mockReturnValue(query);
    mockRecordEvent.mockResolvedValue({ success: true, id: "new-event-id" });

    const { POST } = await import("@/app/api/execution/trigger/log/route");
    const req = makeRequest(VALID_FIRED_BODY) as any;
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.deduped).toBe(false);
    expect(json.id).toBe("new-event-id");
    expect(mockRecordEvent).toHaveBeenCalledOnce();
    // Verify idempotency_key is passed in metadata
    const callArgs = mockRecordEvent.mock.calls[0];
    expect(callArgs[4].idempotency_key).toBe(VALID_FIRED_BODY.idempotency_key);
  });

  it("falls through to insert if dedupe query throws", async () => {
    mockFromSafe.mockImplementation(() => {
      throw new Error("Supabase down");
    });
    mockRecordEvent.mockResolvedValue({ success: true, id: "fallback-id" });

    const { POST } = await import("@/app/api/execution/trigger/log/route");
    const req = makeRequest(VALID_FIRED_BODY) as any;
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.deduped).toBe(false);
    expect(mockRecordEvent).toHaveBeenCalledOnce();
  });

  it("rejects payload without idempotency_key", async () => {
    const { idempotency_key, ...bodyWithout } = VALID_FIRED_BODY;

    const { POST } = await import("@/app/api/execution/trigger/log/route");
    const req = makeRequest(bodyWithout) as any;
    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// trigger/suppressed dedupe
// ---------------------------------------------------------------------------

describe("POST /api/execution/trigger/suppressed — server-side dedupe", () => {
  it("returns deduped=true when idempotency_key already exists", async () => {
    const query = buildQuery({ id: "existing-suppressed-id" });
    mockFromSafe.mockReturnValue(query);

    const { POST } = await import("@/app/api/execution/trigger/suppressed/route");
    const req = makeRequest(VALID_SUPPRESSED_BODY) as any;
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.deduped).toBe(true);
    expect(json.existing_id).toBe("existing-suppressed-id");
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it("inserts when no existing event found (deduped=false)", async () => {
    const query = buildQuery(null);
    mockFromSafe.mockReturnValue(query);
    mockRecordEvent.mockResolvedValue({ success: true, id: "new-suppressed-id" });

    const { POST } = await import("@/app/api/execution/trigger/suppressed/route");
    const req = makeRequest(VALID_SUPPRESSED_BODY) as any;
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.deduped).toBe(false);
    expect(json.id).toBe("new-suppressed-id");
    expect(mockRecordEvent).toHaveBeenCalledOnce();
    // Verify idempotency_key and reason_code in metadata
    const callArgs = mockRecordEvent.mock.calls[0];
    expect(callArgs[4].idempotency_key).toBe(VALID_SUPPRESSED_BODY.idempotency_key);
    expect(callArgs[4].reason_code).toBe("quiet_hours");
  });

  it("rejects payload without idempotency_key", async () => {
    const { idempotency_key, ...bodyWithout } = VALID_SUPPRESSED_BODY;

    const { POST } = await import("@/app/api/execution/trigger/suppressed/route");
    const req = makeRequest(bodyWithout) as any;
    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});

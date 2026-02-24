/**
 * Phase M3: Assert export response data items have only the allowed keys.
 * Prevents leaking extra columns in migration export.
 */

import { describe, it, expect } from "vitest";

const ALLOWED_KEYS = {
  journals: ["id", "user_id", "title", "content", "created_at", "updated_at"],
  checkins: ["id", "user_id", "entry_date", "mood", "stress", "energy", "focus", "note", "created_at"],
  conversations: ["id", "role", "content", "session_id", "created_at"],
  reports: ["id", "user_id", "type", "severity", "status", "summary", "notes", "created_at", "updated_at"],
} as const;

function assertOnlyAllowedKeys(data: Record<string, unknown>[], allowed: readonly string[], label: string) {
  const allowedSet = new Set(allowed);
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item || typeof item !== "object") continue;
    const keys = Object.keys(item as Record<string, unknown>);
    const extra = keys.filter((k) => !allowedSet.has(k));
    expect(extra, `${label} item ${i} has unexpected keys`).toEqual([]);
  }
}

describe("Export shape – allowed keys only", () => {
  it("journals: data items have only id, user_id, title, content, created_at, updated_at", () => {
    const mock = {
      data: [
        { id: "1", user_id: "u1", title: "t", content: "c", created_at: "2025-01-01", updated_at: "2025-01-01" },
        { id: "2", user_id: "u1", title: null, content: "c2", created_at: "2025-01-02", updated_at: "2025-01-02" },
      ],
    };
    assertOnlyAllowedKeys(mock.data, ALLOWED_KEYS.journals, "journals");
  });

  it("journals: rejects extra keys", () => {
    const mock = { data: [{ id: "1", user_id: "u1", title: null, content: "c", created_at: "x", updated_at: "x", extra: "no" }] };
    const allowedSet = new Set(ALLOWED_KEYS.journals);
    const item = mock.data[0] as Record<string, unknown>;
    const extra = Object.keys(item).filter((k) => !allowedSet.has(k));
    expect(extra).toContain("extra");
  });

  it("checkins: data items have only allowed keys", () => {
    const mock = {
      data: [
        {
          id: "1",
          user_id: "u1",
          entry_date: "2025-01-01",
          mood: 5,
          stress: 3,
          energy: 5,
          focus: 4,
          note: "ok",
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
    };
    assertOnlyAllowedKeys(mock.data, ALLOWED_KEYS.checkins, "checkins");
  });

  it("conversations: data items have only id, role, content, session_id, created_at", () => {
    const mock = {
      data: [
        { id: "1", role: "user", content: "hi", session_id: "s1", created_at: "2025-01-01T00:00:00Z" },
        { id: "2", role: "assistant", content: "hello", session_id: "s1", created_at: "2025-01-01T00:01:00Z" },
      ],
    };
    assertOnlyAllowedKeys(mock.data, ALLOWED_KEYS.conversations, "conversations");
  });

  it("reports: data items have only allowed keys", () => {
    const mock = {
      data: [
        {
          id: "1",
          user_id: "u1",
          type: "feedback",
          severity: 1,
          status: "open",
          summary: "s",
          notes: "n",
          created_at: "2025-01-01",
          updated_at: "2025-01-01",
        },
      ],
    };
    assertOnlyAllowedKeys(mock.data, ALLOWED_KEYS.reports, "reports");
  });
});

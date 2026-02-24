/**
 * Hybrid Coupling Hardening: textEngine uses system message for mode (not user prefix).
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const mockCreate = vi.fn();
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

describe("runVellaTextCompletion", () => {
  beforeAll(() => {
    process.env.OPENAI_API_KEY = "sk-test";
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "Assistant reply." } }],
    });
  });

  it("sends system message with mode and separate user message when context.mode is set", async () => {
    const { runVellaTextCompletion } = await import("@/lib/ai/textEngine");
    await runVellaTextCompletion("User prompt here.", "user-1", { mode: "crisis" });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const messages = mockCreate.mock.calls[0][0].messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toMatch(/Current mode: crisis/i);
    expect(messages[0].content).not.toMatch(/User prompt here/);
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toBe("User prompt here.");
  });

  it("sends only user message when context is null", async () => {
    const { runVellaTextCompletion } = await import("@/lib/ai/textEngine");
    await runVellaTextCompletion("User only.", null, null);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const messages = mockCreate.mock.calls[0][0].messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("User only.");
  });
});

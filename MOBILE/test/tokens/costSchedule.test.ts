/**
 * Token Cost Schedule Tests
 * Verifies estimateTokens calculations for all channels.
 */
import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  getFeatureChannel,
  isVariableCost,
  TOKEN_COST_SCHEDULE,
} from "@/lib/tokens/costSchedule";

describe("costSchedule", () => {
  describe("estimateTokens", () => {
    it("calculates realtime tokens correctly (60 seconds => 1200 tokens)", () => {
      const tokens = estimateTokens("realtime_session", { seconds: 60 });
      expect(tokens).toBe(1200); // 60 * 20
    });

    it("calculates audio tokens correctly (1 clip => 5000 tokens)", () => {
      const tokens = estimateTokens("voice_tts", { clips: 1 });
      expect(tokens).toBe(5000); // 1 * 5000
    });

    it("calculates audio tokens correctly (3 clips => 15000 tokens)", () => {
      const tokens = estimateTokens("audio_vella", { clips: 3 });
      expect(tokens).toBe(15000); // 3 * 5000
    });

    it("uses baseTokens fallback when no actual provided", () => {
      const tokens = estimateTokens("architect");
      expect(tokens).toBe(1000); // baseTokens from schedule
    });

    it("uses textTokens when provided for text channel", () => {
      const tokens = estimateTokens("insights_generate", { textTokens: 3500 });
      expect(tokens).toBe(3500);
    });

    it("uses baseTokens when textTokens is 0", () => {
      const tokens = estimateTokens("deepdive", { textTokens: 0 });
      expect(tokens).toBe(1200); // baseTokens from schedule
    });

    it("clamps negative values to 0", () => {
      const tokens = estimateTokens("realtime_offer", { seconds: -10 });
      expect(tokens).toBe(500); // baseTokens, negative clamped to 0
    });

    it("handles multiple clips correctly", () => {
      const tokens = estimateTokens("voice_tts", { clips: 5 });
      expect(tokens).toBe(25000); // 5 * 5000
    });

    it("returns 0 for unknown feature", () => {
      // @ts-expect-error Testing unknown feature
      const tokens = estimateTokens("unknown_feature");
      expect(tokens).toBe(0);
    });

    // Phase 1: Memory-aware token estimation tests
    describe("memory-aware estimation (Phase 1)", () => {
      it("adds memory context tokens for chat_text (memoryChars / 4)", () => {
        const baseTokens = 1000;
        const memoryChars = 1200; // Should add 300 tokens
        const tokens = estimateTokens("chat_text", { textTokens: baseTokens, memoryChars });
        expect(tokens).toBe(1300); // 1000 + (1200/4)
      });

      it("handles zero memoryChars correctly", () => {
        const baseTokens = 1000;
        const tokens = estimateTokens("chat_text", { textTokens: baseTokens, memoryChars: 0 });
        expect(tokens).toBe(1000);
      });

      it("clamps negative memoryChars to 0", () => {
        const baseTokens = 1000;
        const tokens = estimateTokens("chat_text", { textTokens: baseTokens, memoryChars: -100 });
        expect(tokens).toBe(1000); // Negative clamped to 0
      });

      it("calculates memory tokens for large context", () => {
        const baseTokens = 1000;
        const memoryChars = 1500; // Default maxCharsTotal
        const tokens = estimateTokens("chat_text", { textTokens: baseTokens, memoryChars });
        expect(tokens).toBe(1375); // 1000 + 375
      });

      it("uses only baseTokens when no memoryChars provided (backward compat)", () => {
        const baseTokens = 1000;
        const tokens = estimateTokens("chat_text", { textTokens: baseTokens });
        expect(tokens).toBe(1000);
      });
    });
  });

  describe("getFeatureChannel", () => {
    it("returns correct channel for text features", () => {
      expect(getFeatureChannel("chat_text")).toBe("text");
      expect(getFeatureChannel("insights_generate")).toBe("text");
      expect(getFeatureChannel("architect")).toBe("text");
    });

    it("returns correct channel for realtime features", () => {
      expect(getFeatureChannel("realtime_session")).toBe("realtime");
      expect(getFeatureChannel("realtime_offer")).toBe("realtime");
    });

    it("returns correct channel for audio features", () => {
      expect(getFeatureChannel("voice_tts")).toBe("audio");
      expect(getFeatureChannel("audio_vella")).toBe("audio");
    });
  });

  describe("isVariableCost", () => {
    it("identifies variable cost features (baseTokens=0)", () => {
      expect(isVariableCost("chat_text")).toBe(true);
    });

    it("identifies fixed cost features (baseTokens>0)", () => {
      expect(isVariableCost("architect")).toBe(false);
      expect(isVariableCost("realtime_session")).toBe(false);
      expect(isVariableCost("voice_tts")).toBe(false);
    });
  });

  describe("TOKEN_COST_SCHEDULE", () => {
    it("has expected costs matching codebase estimates", () => {
      expect(TOKEN_COST_SCHEDULE.chat_text.baseTokens).toBe(0);
      expect(TOKEN_COST_SCHEDULE.realtime_session.baseTokens).toBe(750);
      expect(TOKEN_COST_SCHEDULE.realtime_offer.baseTokens).toBe(500);
      expect(TOKEN_COST_SCHEDULE.voice_tts.baseTokens).toBe(5000);
      expect(TOKEN_COST_SCHEDULE.audio_vella.baseTokens).toBe(3500);
      expect(TOKEN_COST_SCHEDULE.insights_generate.baseTokens).toBe(3000);
      expect(TOKEN_COST_SCHEDULE.insights_patterns.baseTokens).toBe(2500);
      expect(TOKEN_COST_SCHEDULE.deepdive.baseTokens).toBe(1200);
      expect(TOKEN_COST_SCHEDULE.architect.baseTokens).toBe(1000);
      expect(TOKEN_COST_SCHEDULE.reflection.baseTokens).toBe(4000);
      expect(TOKEN_COST_SCHEDULE.strategy.baseTokens).toBe(500);
      expect(TOKEN_COST_SCHEDULE.compass.baseTokens).toBe(500);
      expect(TOKEN_COST_SCHEDULE.emotion_intel.baseTokens).toBe(700);
      expect(TOKEN_COST_SCHEDULE.growth_roadmap.baseTokens).toBe(2000);
      expect(TOKEN_COST_SCHEDULE.clarity.baseTokens).toBe(500);
    });

    it("all features have valid channels", () => {
      const validChannels = ["text", "realtime", "audio"];
      Object.values(TOKEN_COST_SCHEDULE).forEach((entry) => {
        expect(validChannels).toContain(entry.channel);
      });
    });
  });
});

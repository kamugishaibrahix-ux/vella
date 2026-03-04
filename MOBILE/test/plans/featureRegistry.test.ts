/**
 * Feature Registry Tests
 * 
 * Tests for PURE abstraction - ensure all features use entitlements, not tier strings.
 */

import { describe, it, expect } from "vitest";
import {
  FEATURE_REGISTRY,
  getFeatureEntitlement,
  isFeatureUISoftGated,
  getFeatureDisplayName,
  isFeatureEnabled,
  isDeepMemoryEnabled,
  getFeaturesByEntitlement,
  validateFeatureRegistry,
  type FeatureDefinition,
} from "@/lib/plans/featureRegistry";
import type { FeatureKey } from "@/lib/tokens/costSchedule";
import type { PlanEntitlement } from "@/lib/plans/types";

describe("Feature Registry", () => {
  describe("FEATURE_REGISTRY completeness", () => {
    it("should have all FeatureKey values defined", () => {
      const featureKeys: FeatureKey[] = [
        "chat_text",
        "realtime_session",
        "realtime_offer",
        "voice_tts",
        "audio_vella",
        "transcribe",
        "insights_generate",
        "insights_patterns",
        "deepdive",
        "architect",
        "reflection",
        "strategy",
        "compass",
        "emotion_intel",
        "growth_roadmap",
        "clarity",
        "deep_insights",
      ];

      for (const key of featureKeys) {
        expect(FEATURE_REGISTRY[key]).toBeDefined();
        expect(FEATURE_REGISTRY[key].featureKey).toBe(key);
      }
    });

    it("should have consistent token channels", () => {
      const validChannels = ["text", "realtime", "audio"];
      
      for (const def of Object.values(FEATURE_REGISTRY)) {
        expect(validChannels).toContain(def.tokenChannel);
      }
    });

    it("should have display names for all features", () => {
      for (const def of Object.values(FEATURE_REGISTRY)) {
        expect(def.displayName).toBeTruthy();
        expect(typeof def.displayName).toBe("string");
        expect(def.displayName.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getFeatureEntitlement", () => {
    it("should return undefined for always-allowed features", () => {
      expect(getFeatureEntitlement("chat_text")).toBeUndefined();
      expect(getFeatureEntitlement("insights_generate")).toBeUndefined();
      expect(getFeatureEntitlement("reflection")).toBeUndefined();
    });

    it("should return correct entitlement flag for gated features", () => {
      expect(getFeatureEntitlement("realtime_session")).toBe("enableRealtime");
      expect(getFeatureEntitlement("voice_tts")).toBe("enableVoiceTTS");
      expect(getFeatureEntitlement("architect")).toBe("enableArchitect");
      expect(getFeatureEntitlement("deep_insights")).toBe("enableDeepInsights");
    });
  });

  describe("isFeatureEnabled (PURE abstraction)", () => {
    const freeEntitlements: PlanEntitlement = {
      maxMonthlyTokens: 10000,
      enableRealtime: false,
      enableVoiceTTS: false,
      enableAudioVella: false,
      enableArchitect: false,
      enableDeepDive: false,
      enableDeepInsights: false,
      enableGrowthRoadmap: false,
      enableDeepMemory: false,
      requestsPerMinute: 5,
    };

    const eliteEntitlements: PlanEntitlement = {
      maxMonthlyTokens: 1000000,
      enableRealtime: true,
      enableVoiceTTS: true,
      enableAudioVella: true,
      enableArchitect: true,
      enableDeepDive: true,
      enableDeepInsights: true,
      enableGrowthRoadmap: true,
      enableDeepMemory: true,
      requestsPerMinute: 60,
    };

    it("should allow chat_text for all entitlements (no entitlement flag)", () => {
      expect(isFeatureEnabled("chat_text", freeEntitlements)).toBe(true);
      expect(isFeatureEnabled("chat_text", eliteEntitlements)).toBe(true);
    });

    it("should block gated features for free entitlements", () => {
      expect(isFeatureEnabled("realtime_session", freeEntitlements)).toBe(false);
      expect(isFeatureEnabled("voice_tts", freeEntitlements)).toBe(false);
      expect(isFeatureEnabled("architect", freeEntitlements)).toBe(false);
      expect(isFeatureEnabled("deep_insights", freeEntitlements)).toBe(false);
    });

    it("should allow gated features for elite entitlements", () => {
      expect(isFeatureEnabled("realtime_session", eliteEntitlements)).toBe(true);
      expect(isFeatureEnabled("voice_tts", eliteEntitlements)).toBe(true);
      expect(isFeatureEnabled("architect", eliteEntitlements)).toBe(true);
      expect(isFeatureEnabled("deep_insights", eliteEntitlements)).toBe(true);
    });

    it("should NOT use tier strings - only entitlement flags", () => {
      // Create a fake "elite" tier user with all features disabled
      const fakeEliteAllDisabled: PlanEntitlement = {
        ...eliteEntitlements,
        enableRealtime: false,
        enableDeepInsights: false,
      };

      // Should be blocked even though max tokens suggests elite
      expect(isFeatureEnabled("realtime_session", fakeEliteAllDisabled)).toBe(false);
      expect(isFeatureEnabled("deep_insights", fakeEliteAllDisabled)).toBe(false);
    });
  });

  describe("isDeepMemoryEnabled", () => {
    it("should return false when enableDeepMemory is false", () => {
      const entitlements: PlanEntitlement = {
        maxMonthlyTokens: 10000,
        enableRealtime: false,
        enableVoiceTTS: false,
        enableAudioVella: false,
        enableArchitect: false,
        enableDeepDive: false,
        enableDeepInsights: false,
        enableGrowthRoadmap: false,
        enableDeepMemory: false,
        requestsPerMinute: 5,
      };

      expect(isDeepMemoryEnabled(entitlements)).toBe(false);
    });

    it("should return true when enableDeepMemory is true", () => {
      const entitlements: PlanEntitlement = {
        maxMonthlyTokens: 1000000,
        enableRealtime: true,
        enableVoiceTTS: true,
        enableAudioVella: true,
        enableArchitect: true,
        enableDeepDive: true,
        enableDeepInsights: true,
        enableGrowthRoadmap: true,
        enableDeepMemory: true,
        requestsPerMinute: 60,
      };

      expect(isDeepMemoryEnabled(entitlements)).toBe(true);
    });

    it("should NOT check tier strings - only enableDeepMemory flag", () => {
      // Pro tier with Deep Memory enabled (possible via admin config)
      const proWithDeepMemory: PlanEntitlement = {
        maxMonthlyTokens: 300000,
        enableRealtime: true,
        enableVoiceTTS: true,
        enableAudioVella: true,
        enableArchitect: true,
        enableDeepDive: true,
        enableDeepInsights: false,
        enableGrowthRoadmap: true,
        enableDeepMemory: true, // Enabled despite "pro" tier
        requestsPerMinute: 30,
      };

      expect(isDeepMemoryEnabled(proWithDeepMemory)).toBe(true);
    });
  });

  describe("isFeatureUISoftGated", () => {
    it("should return true for features that need upgrade modal", () => {
      expect(isFeatureUISoftGated("realtime_session")).toBe(true);
      expect(isFeatureUISoftGated("voice_tts")).toBe(true);
      expect(isFeatureUISoftGated("architect")).toBe(true);
    });

    it("should return false for internal/always-allowed features", () => {
      expect(isFeatureUISoftGated("chat_text")).toBe(false);
      expect(isFeatureUISoftGated("realtime_offer")).toBe(false);
      expect(isFeatureUISoftGated("transcribe")).toBe(false);
    });
  });

  describe("getFeatureDisplayName", () => {
    it("should return display name for known features", () => {
      expect(getFeatureDisplayName("chat_text")).toBe("Chat");
      expect(getFeatureDisplayName("realtime_session")).toBe("Realtime Voice Session");
      expect(getFeatureDisplayName("deep_insights")).toBe("Deep Insights");
    });

    it("should return feature key as fallback for unknown features", () => {
      expect(getFeatureDisplayName("unknown_feature" as FeatureKey)).toBe("unknown_feature");
    });
  });

  describe("getFeaturesByEntitlement", () => {
    it("should return features mapped to a specific entitlement", () => {
      const realtimeFeatures = getFeaturesByEntitlement("enableRealtime");
      expect(realtimeFeatures).toContain("realtime_session");
      expect(realtimeFeatures).toContain("realtime_offer");
    });

    it("should return empty array for unused entitlements", () => {
      // If enableDeepMemory is not directly mapped to features (it's composite)
      const deepMemoryFeatures = getFeaturesByEntitlement("enableDeepMemory");
      // Deep Memory is handled separately via isDeepMemoryEnabled
      expect(deepMemoryFeatures).toEqual([]);
    });
  });

  describe("validateFeatureRegistry", () => {
    it("should report valid registry", () => {
      const result = validateFeatureRegistry();
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });

  describe("Feature Registry Table", () => {
    it("should document all features in the registry table", () => {
      // This test serves as documentation of the feature mapping
      const expectedFeatures: Array<{
        key: FeatureKey;
        entitlement?: string;
        uiSoftGate: boolean;
      }> = [
        { key: "chat_text", uiSoftGate: false },
        { key: "realtime_session", entitlement: "enableRealtime", uiSoftGate: true },
        { key: "realtime_offer", entitlement: "enableRealtime", uiSoftGate: false },
        { key: "voice_tts", entitlement: "enableVoiceTTS", uiSoftGate: true },
        { key: "audio_vella", entitlement: "enableAudioVella", uiSoftGate: true },
        { key: "transcribe", entitlement: "enableVoiceTTS", uiSoftGate: false },
        { key: "insights_generate", uiSoftGate: false },
        { key: "insights_patterns", uiSoftGate: false },
        { key: "deepdive", entitlement: "enableDeepDive", uiSoftGate: true },
        { key: "architect", entitlement: "enableArchitect", uiSoftGate: true },
        { key: "reflection", uiSoftGate: false },
        { key: "strategy", uiSoftGate: false },
        { key: "compass", uiSoftGate: false },
        { key: "emotion_intel", uiSoftGate: false },
        { key: "growth_roadmap", entitlement: "enableGrowthRoadmap", uiSoftGate: true },
        { key: "clarity", uiSoftGate: false },
        { key: "deep_insights", entitlement: "enableDeepInsights", uiSoftGate: true },
      ];

      for (const expected of expectedFeatures) {
        const actual = FEATURE_REGISTRY[expected.key];
        expect(actual).toBeDefined();
        expect(actual.uiSoftGate).toBe(expected.uiSoftGate);
        
        if (expected.entitlement) {
          expect(actual.entitlementFlag).toBe(expected.entitlement);
        } else {
          expect(actual.entitlementFlag).toBeUndefined();
        }
      }
    });
  });
});

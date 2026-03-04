/**
 * DEPRECATED: Tier-based feature gates.
 * 
 * This file previously contained tier-based feature checks which violated
 * the "No Tier Strings In Logic" architectural rule.
 * 
 * All functions in this file have been REMOVED. They are replaced by:
 * 
 * 1. **For server/routes**: Use `requireEntitlement(featureKey)` from `@/lib/plans/requireEntitlement`
 *    Example:
 *    ```typescript
 *    const entitlement = await requireEntitlement("voice_tts");
 *    if (isEntitlementBlocked(entitlement)) return entitlement;
 *    // entitlement.entitlements contains all capability flags
 *    ```
 * 
 * 2. **For client/components**: Use `useEntitlementsContext()` from `@/app/components/providers/EntitlementsProvider`
 *    Example:
 *    ```typescript
 *    const { entitlements } = useEntitlementsContext();
 *    if (entitlements.enableVoiceTTS) { ... }
 *    ```
 * 
 * 3. **For feature checks**: Use `isFeatureEnabled(feature, entitlements)` from `@/lib/plans/featureRegistry`
 *    Example:
 *    ```typescript
 *    import { isFeatureEnabled } from "@/lib/plans/featureRegistry";
 *    const canUseVoice = isFeatureEnabled("voice_tts", entitlements);
 *    ```
 * 
 * 4. **For capabilities**: Use `getCapabilities(entitlements)` from `@/lib/plans/capabilities`
 *    Example:
 *    ```typescript
 *    import { getCapabilities } from "@/lib/plans/capabilities";
 *    const capabilities = getCapabilities(entitlements);
 *    if (capabilities.voiceTTS) { ... }
 *    ```
 * 
 * 5. **For model selection**: Use `resolveModelForCapabilities()` from `@/lib/plans/capabilities`
 *    Example:
 *    ```typescript
 *    import { getCapabilities, resolveModelForCapabilities } from "@/lib/plans/capabilities";
 *    const model = resolveModelForCapabilities(getCapabilities(entitlements));
 *    ```
 * 
 * MIGRATION TABLE:
 * | Old (tier-based) | New (entitlement-based) |
 * |------------------|-------------------------|
 * | isVoiceEnabled(tier) | entitlements.enableVoiceTTS |
 * | isMusicModeEnabled(tier) | entitlements.enableAudioVella |
 * | storyModePremiumFeaturesEnabled(tier) | entitlements.enableDeepDive \|\| entitlements.enableArchitect |
 * | isVoiceEnabledPure(e) | isFeatureEnabled("voice_tts", e) |
 * | isMusicModeEnabledPure(e) | isFeatureEnabled("audio_vella", e) |
 * 
 * This file is kept as a tombstone to prevent accidental re-introduction of tier-based logic.
 * Do NOT add new tier-based functions here.
 * 
 * @see lib/plans/NO_TIER_STRINGS_RULE.md
 */

// Re-export the canonical functions from proper locations for convenience
export { isFeatureEnabled } from "@/lib/plans/featureRegistry";
export { getCapabilities, resolveModelForCapabilities } from "@/lib/plans/capabilities";

// DEPRECATED EXPORTS - DO NOT USE
// These exports throw runtime errors to catch migration failures

/** @deprecated Use entitlements.enableVoiceTTS instead. Removed: 2026-02-26 */
export function isVoiceEnabled(_tier: never): never {
  throw new Error(
    "isVoiceEnabled(tier) is removed. Use entitlements.enableVoiceTTS or isFeatureEnabled('voice_tts', entitlements). " +
    "See lib/tiers/featureGates.ts for migration guide."
  );
}

/** @deprecated Use entitlements.enableAudioVella instead. Removed: 2026-02-26 */
export function isMusicModeEnabled(_tier: never): never {
  throw new Error(
    "isMusicModeEnabled(tier) is removed. Use entitlements.enableAudioVella or isFeatureEnabled('audio_vella', entitlements). " +
    "See lib/tiers/featureGates.ts for migration guide."
  );
}

/** @deprecated Check specific entitlements instead. Removed: 2026-02-26 */
export function storyModePremiumFeaturesEnabled(_tier: unknown): never {
  throw new Error(
    "storyModePremiumFeaturesEnabled(tier) is removed. Use entitlements.enableDeepDive || entitlements.enableArchitect. " +
    "See lib/tiers/featureGates.ts for migration guide."
  );
}

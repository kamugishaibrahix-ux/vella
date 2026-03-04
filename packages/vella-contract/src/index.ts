/**
 * Vella Contract
 * Shared contract between Vella MOBILE and Vella-Control.
 * 
 * This package is the SINGLE SOURCE OF TRUTH for:
 * - Plan tiers and validation
 * - Entitlement schemas and defaults
 * - Feature registry and gating
 * - Pricing configuration
 * 
 * DO NOT define these separately in MOBILE or Vella-Control.
 * Always import from @vella/contract.
 * 
 * HARDENING PRINCIPLES:
 * 1. Unknown tiers fail-closed (never silently fall back to free)
 * 2. All exports are strictly typed (no string escapes)
 * 3. Logic paths use throw/Result types, display paths use safe variants
 */

// Core types
export type {
  PlanTier,
  PlanEntitlement,
  PlanEntitlementsConfig,
  ResolvedPlanEntitlements,
  AdminPlanConfig,
  AdminAuditLog,
  UnknownTierPolicy,
  TierValidationResult,
  EntitlementResolutionResult,
} from "./types";

// Error type and validators
export {
  VALID_PLAN_TIERS,
  isValidPlanTier,
  validatePlanTier,
  assertValidPlanTier,
  normalizeToPlanTier,
  UnknownTierError,
} from "./types";

// Entitlements - STRICT versions (throw on unknown tier)
export {
  DEFAULT_FREE_ENTITLEMENTS,
  DEFAULT_PRO_ENTITLEMENTS,
  DEFAULT_ELITE_ENTITLEMENTS,
  DEFAULT_ENTITLEMENTS_BY_TIER,
  RESTRICTED_ENTITLEMENTS,
  getDefaultEntitlements,
  getTierTokenLimit,
  getTierFeatures,
  isFeatureEnabledByDefault,
} from "./entitlements";

// Entitlements - SAFE versions (Result types, no throws)
export {
  getDefaultEntitlementsSafe,
  getTierTokenLimitSafe,
  getRestrictedEntitlements,
  isFeatureEnabledByDefaultSafe,
} from "./entitlements";

// Pricing
export type {
  TierPricing,
  TierMRR,
} from "./pricing";
export {
  TIER_PRICING,
  LEGACY_PRICE_MAP,
  TIER_MARKETING,
  getTierPricing,
  getMonthlyPriceCents,
  getMonthlyPriceDollars,
  formatPrice,
  formatPriceDecimal,
  calculateMRR,
  getTierMarketing,
} from "./pricing";

// Features
export type {
  FeatureKey,
  TokenChannel,
  FeatureDefinition,
  DeepMemoryFeature,
} from "./features";
export {
  ALL_FEATURE_KEYS,
  DEEP_MEMORY_FEATURES,
  FEATURE_REGISTRY,
  getAdminConfigurableFeatures,
  getAllEntitlementFlags,
  getFeatureEntitlement,
  isFeatureUISoftGated,
  getFeatureDisplayName,
  isFeatureEnabled,
  isDeepMemoryEnabled,
  getFeaturesByEntitlement,
  validateFeatureRegistry,
} from "./features";

// Package version for debugging
export const CONTRACT_VERSION = "1.1.0";

// Hardening version tracking
export const HARDENING_LEVEL = "strict-v2";

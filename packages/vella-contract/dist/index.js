"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HARDENING_LEVEL = exports.CONTRACT_VERSION = exports.validateFeatureRegistry = exports.getFeaturesByEntitlement = exports.isDeepMemoryEnabled = exports.isFeatureEnabled = exports.getFeatureDisplayName = exports.isFeatureUISoftGated = exports.getFeatureEntitlement = exports.getAllEntitlementFlags = exports.getAdminConfigurableFeatures = exports.FEATURE_REGISTRY = exports.DEEP_MEMORY_FEATURES = exports.ALL_FEATURE_KEYS = exports.getTierMarketing = exports.calculateMRR = exports.formatPriceDecimal = exports.formatPrice = exports.getMonthlyPriceDollars = exports.getMonthlyPriceCents = exports.getTierPricing = exports.TIER_MARKETING = exports.LEGACY_PRICE_MAP = exports.TIER_PRICING = exports.isFeatureEnabledByDefaultSafe = exports.getRestrictedEntitlements = exports.getTierTokenLimitSafe = exports.getDefaultEntitlementsSafe = exports.isFeatureEnabledByDefault = exports.getTierFeatures = exports.getTierTokenLimit = exports.getDefaultEntitlements = exports.RESTRICTED_ENTITLEMENTS = exports.DEFAULT_ENTITLEMENTS_BY_TIER = exports.DEFAULT_ELITE_ENTITLEMENTS = exports.DEFAULT_PRO_ENTITLEMENTS = exports.DEFAULT_FREE_ENTITLEMENTS = exports.UnknownTierError = exports.normalizeToPlanTier = exports.assertValidPlanTier = exports.validatePlanTier = exports.isValidPlanTier = exports.VALID_PLAN_TIERS = void 0;
// Error type and validators
var types_1 = require("./types");
Object.defineProperty(exports, "VALID_PLAN_TIERS", { enumerable: true, get: function () { return types_1.VALID_PLAN_TIERS; } });
Object.defineProperty(exports, "isValidPlanTier", { enumerable: true, get: function () { return types_1.isValidPlanTier; } });
Object.defineProperty(exports, "validatePlanTier", { enumerable: true, get: function () { return types_1.validatePlanTier; } });
Object.defineProperty(exports, "assertValidPlanTier", { enumerable: true, get: function () { return types_1.assertValidPlanTier; } });
Object.defineProperty(exports, "normalizeToPlanTier", { enumerable: true, get: function () { return types_1.normalizeToPlanTier; } });
Object.defineProperty(exports, "UnknownTierError", { enumerable: true, get: function () { return types_1.UnknownTierError; } });
// Entitlements - STRICT versions (throw on unknown tier)
var entitlements_1 = require("./entitlements");
Object.defineProperty(exports, "DEFAULT_FREE_ENTITLEMENTS", { enumerable: true, get: function () { return entitlements_1.DEFAULT_FREE_ENTITLEMENTS; } });
Object.defineProperty(exports, "DEFAULT_PRO_ENTITLEMENTS", { enumerable: true, get: function () { return entitlements_1.DEFAULT_PRO_ENTITLEMENTS; } });
Object.defineProperty(exports, "DEFAULT_ELITE_ENTITLEMENTS", { enumerable: true, get: function () { return entitlements_1.DEFAULT_ELITE_ENTITLEMENTS; } });
Object.defineProperty(exports, "DEFAULT_ENTITLEMENTS_BY_TIER", { enumerable: true, get: function () { return entitlements_1.DEFAULT_ENTITLEMENTS_BY_TIER; } });
Object.defineProperty(exports, "RESTRICTED_ENTITLEMENTS", { enumerable: true, get: function () { return entitlements_1.RESTRICTED_ENTITLEMENTS; } });
Object.defineProperty(exports, "getDefaultEntitlements", { enumerable: true, get: function () { return entitlements_1.getDefaultEntitlements; } });
Object.defineProperty(exports, "getTierTokenLimit", { enumerable: true, get: function () { return entitlements_1.getTierTokenLimit; } });
Object.defineProperty(exports, "getTierFeatures", { enumerable: true, get: function () { return entitlements_1.getTierFeatures; } });
Object.defineProperty(exports, "isFeatureEnabledByDefault", { enumerable: true, get: function () { return entitlements_1.isFeatureEnabledByDefault; } });
// Entitlements - SAFE versions (Result types, no throws)
var entitlements_2 = require("./entitlements");
Object.defineProperty(exports, "getDefaultEntitlementsSafe", { enumerable: true, get: function () { return entitlements_2.getDefaultEntitlementsSafe; } });
Object.defineProperty(exports, "getTierTokenLimitSafe", { enumerable: true, get: function () { return entitlements_2.getTierTokenLimitSafe; } });
Object.defineProperty(exports, "getRestrictedEntitlements", { enumerable: true, get: function () { return entitlements_2.getRestrictedEntitlements; } });
Object.defineProperty(exports, "isFeatureEnabledByDefaultSafe", { enumerable: true, get: function () { return entitlements_2.isFeatureEnabledByDefaultSafe; } });
var pricing_1 = require("./pricing");
Object.defineProperty(exports, "TIER_PRICING", { enumerable: true, get: function () { return pricing_1.TIER_PRICING; } });
Object.defineProperty(exports, "LEGACY_PRICE_MAP", { enumerable: true, get: function () { return pricing_1.LEGACY_PRICE_MAP; } });
Object.defineProperty(exports, "TIER_MARKETING", { enumerable: true, get: function () { return pricing_1.TIER_MARKETING; } });
Object.defineProperty(exports, "getTierPricing", { enumerable: true, get: function () { return pricing_1.getTierPricing; } });
Object.defineProperty(exports, "getMonthlyPriceCents", { enumerable: true, get: function () { return pricing_1.getMonthlyPriceCents; } });
Object.defineProperty(exports, "getMonthlyPriceDollars", { enumerable: true, get: function () { return pricing_1.getMonthlyPriceDollars; } });
Object.defineProperty(exports, "formatPrice", { enumerable: true, get: function () { return pricing_1.formatPrice; } });
Object.defineProperty(exports, "formatPriceDecimal", { enumerable: true, get: function () { return pricing_1.formatPriceDecimal; } });
Object.defineProperty(exports, "calculateMRR", { enumerable: true, get: function () { return pricing_1.calculateMRR; } });
Object.defineProperty(exports, "getTierMarketing", { enumerable: true, get: function () { return pricing_1.getTierMarketing; } });
var features_1 = require("./features");
Object.defineProperty(exports, "ALL_FEATURE_KEYS", { enumerable: true, get: function () { return features_1.ALL_FEATURE_KEYS; } });
Object.defineProperty(exports, "DEEP_MEMORY_FEATURES", { enumerable: true, get: function () { return features_1.DEEP_MEMORY_FEATURES; } });
Object.defineProperty(exports, "FEATURE_REGISTRY", { enumerable: true, get: function () { return features_1.FEATURE_REGISTRY; } });
Object.defineProperty(exports, "getAdminConfigurableFeatures", { enumerable: true, get: function () { return features_1.getAdminConfigurableFeatures; } });
Object.defineProperty(exports, "getAllEntitlementFlags", { enumerable: true, get: function () { return features_1.getAllEntitlementFlags; } });
Object.defineProperty(exports, "getFeatureEntitlement", { enumerable: true, get: function () { return features_1.getFeatureEntitlement; } });
Object.defineProperty(exports, "isFeatureUISoftGated", { enumerable: true, get: function () { return features_1.isFeatureUISoftGated; } });
Object.defineProperty(exports, "getFeatureDisplayName", { enumerable: true, get: function () { return features_1.getFeatureDisplayName; } });
Object.defineProperty(exports, "isFeatureEnabled", { enumerable: true, get: function () { return features_1.isFeatureEnabled; } });
Object.defineProperty(exports, "isDeepMemoryEnabled", { enumerable: true, get: function () { return features_1.isDeepMemoryEnabled; } });
Object.defineProperty(exports, "getFeaturesByEntitlement", { enumerable: true, get: function () { return features_1.getFeaturesByEntitlement; } });
Object.defineProperty(exports, "validateFeatureRegistry", { enumerable: true, get: function () { return features_1.validateFeatureRegistry; } });
// Package version for debugging
exports.CONTRACT_VERSION = "1.1.0";
// Hardening version tracking
exports.HARDENING_LEVEL = "strict-v2";

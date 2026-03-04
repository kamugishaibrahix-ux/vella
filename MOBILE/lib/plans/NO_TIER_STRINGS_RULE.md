# No Tier Strings In Logic - Architectural Rule

## Summary

**Tier strings ("free", "pro", "elite") MUST NOT appear in business logic.**

This is an architectural invariant. Violations are regressions.

## What Constitutes "Logic"

Logic includes (but is not limited to):
- Feature gating (enabling/disabling features)
- Model selection (choosing AI models)
- Memory depth configuration
- API route authorization
- Context sanitization
- Reasoning injection
- Response refinement

## What Constitutes "Display"

Display includes:
- Plan badges/labels ("Pro", "Elite")
- Price strings ("$9.99/month")
- Marketing copy
- Upgrade modal content
- Plan comparison tables

## Allowed Tier String Locations

Tier strings MAY appear ONLY in:

1. **UI Tier Model** (`lib/plans/uiTierModel.ts`)
   - Plan labels, badges, marketing text
   
2. **Stripe Mapping Layer** (`lib/stripe/`)
   - Converting Stripe plan IDs to internal types
   
3. **Default Entitlements** (`lib/plans/defaultEntitlements.ts`)
   - Defining default capability sets per tier
   
4. **Tests** (`test/`)
   - Test fixtures and assertions

## The Abstraction Chain

```
Tier String (Stripe/DB)
    ↓
PlanTier type ("free" | "pro" | "elite") - internal only
    ↓
resolvePlanEntitlements() → PlanEntitlement
    ↓
getCapabilities() → Capabilities
    ↓
Business Logic (isFeatureEnabled, resolveModel, etc.)
```

## Violation Examples

### ❌ BAD: Tier-based feature gating
```typescript
if (tier === "pro" || tier === "elite") {
  enableFeature();
}
```

### ✅ GOOD: Capability-based feature gating
```typescript
if (capabilities.enableFeature || entitlements.enableFeature) {
  enableFeature();
}
```

### ❌ BAD: Tier-based model selection
```typescript
if (tier === "elite") {
  return "gpt-4.1";
}
```

### ✅ GOOD: Capability-based model selection
```typescript
if (capabilities.modelClass === "premium") {
  return "gpt-4.1";
}
```

### ❌ BAD: Tier-based context sanitization
```typescript
function sanitize(tier: PlanTier, context: unknown) {
  if (tier === "free") {
    delete context.patterns;
  }
}
```

### ✅ GOOD: Capability-based sanitization
```typescript
function sanitize(capabilities: Capabilities, context: unknown) {
  if (!capabilities.deepInsights) {
    delete context.patterns;
  }
}
```

## Enforcement

### Static Analysis
Run the test suite to catch violations:

```bash
pnpm test test/guard/noTierStringLogic.test.ts
```

### Code Review Checklist
- [ ] No `=== "free"` or `!== "free"` in lib/ or app/api/
- [ ] No `=== "pro"` or `!== "pro"` in lib/ or app/api/
- [ ] No `=== "elite"` or `!== "elite"` in lib/ or app/api/
- [ ] All feature checks use `isFeatureEnabled()` or capabilities
- [ ] All model selection uses `resolveModelForCapabilities()`

## Migration Guide

When you find tier strings in logic:

1. Replace tier parameter with `capabilities: Capabilities` or `entitlements: PlanEntitlement`
2. Use `getCapabilities(entitlements)` to derive capability flags
3. Replace tier checks with capability checks
4. Update callers to pass entitlements instead of tier
5. Add test to verify behavior matches old tier logic

## Rationale

1. **Admin Configurability**: Tiers should be configurable by admin without code changes
2. **Gradual Rollouts**: Features can be enabled per-user via entitlements
3. **Testing**: Pure entitlement checks are easier to test than tier strings
4. **Flexibility**: New plans can be added without code changes
5. **Clarity**: Capabilities describe WHAT the user can do, not their "tier"

## Exceptions

None. If you think you need an exception, you're probably mixing logic and display.

Separate the concerns:
- Logic uses capabilities
- Display uses tier strings

---

**Last Updated**: 2026-02-26
**Rule Version**: 1.0
**Enforcement**: Test suite + code review

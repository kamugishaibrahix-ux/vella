# UI Duplication Audit Report
## Complete Analysis of Settings, Profile, and Account Management UI

---

## EXECUTIVE SUMMARY

**CRITICAL FINDING:** There are **TWO separate settings pages** in the codebase:
1. `/settings` - Minimal settings page (NOT linked in navigation)
2. `/settings/account-plan` - Full account & plan page (LINKED in navigation)

**The navigation links to `/settings/account-plan`, which means users NEVER see `/settings` unless they manually navigate there.**

---

## 1. SETTINGS PAGES ANALYSIS

### A. Active Settings Pages (In Use)

#### 1. `/settings/account-plan` (PRIMARY - LINKED IN NAVIGATION)
- **File:** `MOBILE/app/settings/account-plan/page.tsx`
- **Route:** `/settings/account-plan`
- **Navigation Link:** ✅ YES - BottomNav.tsx line 13: `href: "/settings/account-plan"`
- **Status:** **ACTIVE - This is what users see**

**UI Components Rendered:**
- Profile card (avatar, name, email, "Manage Profile" button)
- Account & Plan card (current plan, status badge, plan switcher, billing portal)
- AppLanguageCard (language selector)
- VellaSettingsCard (voice model, relationship mode, tone style, voice HUD)
- PreferencesCard (daily check-ins, smart journaling, privacy/support links)
- DataPrivacyCard (export data, delete account, privacy toggles)
- TokenSummary card (token balance, progress bar, usage stats)
- VoiceRealtimeUsageCard (voice session metrics)
- Token Packs section (3 pack cards with purchase buttons)
- Usage & Purchase History drawer

**Key Features:**
- Full account management
- Subscription management
- Token management
- All Vella configuration
- All privacy settings
- Complete settings UI

---

#### 2. `/settings` (SHADOW PAGE - NOT LINKED)
- **File:** `MOBILE/app/settings/page.tsx`
- **Route:** `/settings`
- **Navigation Link:** ❌ NO - Not referenced anywhere
- **Status:** **UNUSED/SHADOW PAGE**

**UI Components Rendered:**
- Header ("Settings" title)
- Language selector (inline, not using AppLanguageCard)
- SecurityInfoStrip
- SecurityCard (PIN + biometrics)
- Reset Vella section (clear local data)

**Key Features:**
- Basic language selector
- Security settings (PIN/biometrics)
- Local data reset
- **MISSING:** Account info, plan management, tokens, Vella config, privacy settings

**Problem:** This page is a **duplicate/minimal version** that users never see because navigation goes to `/settings/account-plan` instead.

---

### B. Profile Pages

#### 1. `/profile` (ACTIVE)
- **File:** `MOBILE/app/profile/page.tsx`
- **Route:** `/profile`
- **Navigation Link:** ✅ YES - Referenced in account-plan page (line 124: `router.push("/profile")`)
- **Status:** **ACTIVE**

**UI Components Rendered:**
- Profile header (avatar, name, email placeholder)
- Account section (sign in/out, email display)
- Name input field

**Key Features:**
- Basic profile display
- Authentication (sign in/out)
- Name editing
- **LIMITED:** No settings, no plan info, no tokens

**Relationship to Settings:**
- Linked from account-plan page ("Manage Profile" button)
- Provides basic profile editing
- Does NOT duplicate settings functionality

---

## 2. SETTINGS COMPONENTS ANALYSIS

### Components in `MOBILE/components/settings/`:

1. **AppLanguageCard.tsx** ✅ USED
   - Used in: `/settings/account-plan` (line 312)
   - NOT used in: `/settings` (has inline language selector instead)

2. **VellaSettingsCard.tsx** ✅ USED
   - Used in: `/settings/account-plan` (line 317)
   - NOT used in: `/settings`

3. **PreferencesCard.tsx** ✅ USED
   - Used in: `/settings/account-plan` (line 332)
   - NOT used in: `/settings`

4. **DataPrivacyCard.tsx** ✅ USED
   - Used in: `/settings/account-plan` (line 337)
   - NOT used in: `/settings`

5. **SecurityCard.tsx** ⚠️ PARTIALLY USED
   - Used in: `/settings` (line 86)
   - NOT used in: `/settings/account-plan` (MISSING!)
   - **PROBLEM:** SecurityCard is only in the unused `/settings` page, not in the active `/settings/account-plan` page

6. **SecurityInfoStrip.tsx** ⚠️ PARTIALLY USED
   - Used in: `/settings` (line 85)
   - NOT used in: `/settings/account-plan` (MISSING!)

7. **PlanSwitcherModal.tsx** ✅ USED
   - Used in: `/settings/account-plan` (line 404)

---

## 3. DUPLICATION ANALYSIS

### A. Language Selector - DUPLICATED

**Location 1:** `/settings` (MOBILE/app/settings/page.tsx)
- Inline `<select>` element (lines 70-81)
- Custom implementation
- Direct state management

**Location 2:** `/settings/account-plan` (MOBILE/app/settings/account-plan/page.tsx)
- Uses `AppLanguageCard` component (line 312)
- Shared component
- Proper abstraction

**Verdict:** ❌ **DUPLICATE** - Two different implementations of the same feature

---

### B. Settings UI - DUPLICATED

**Location 1:** `/settings`
- Minimal settings page
- Only: Language, Security, Reset
- NOT linked in navigation

**Location 2:** `/settings/account-plan`
- Complete settings page
- All features: Language, Vella config, Preferences, Privacy, Tokens, Account
- LINKED in navigation

**Verdict:** ❌ **DUPLICATE** - Two separate pages serving similar purpose

---

### C. Security Settings - MISSING FROM ACTIVE PAGE

**Location:** `/settings` only
- SecurityCard (PIN + biometrics)
- SecurityInfoStrip

**Problem:** Security settings are ONLY in the unused `/settings` page, NOT in the active `/settings/account-plan` page.

**Verdict:** ⚠️ **MISSING** - SecurityCard should be in `/settings/account-plan` but isn't

---

## 4. NAVIGATION ANALYSIS

### BottomNav.tsx (MOBILE/components/layout/BottomNav.tsx)

**Settings Link:**
```typescript
{ labelKey: "nav.settings" as const, href: "/settings/account-plan", icon: ProfileIcon }
```

**Finding:** Navigation points to `/settings/account-plan`, NOT `/settings`

**Implications:**
- Users clicking "Settings" in bottom nav go to `/settings/account-plan`
- Users NEVER see `/settings` unless they manually type the URL
- `/settings` is effectively a shadow/unused page

---

## 5. DEAD/UNUSED CODE IDENTIFICATION

### A. Unused Pages

1. **`/settings`** (MOBILE/app/settings/page.tsx)
   - **Status:** SHADOW PAGE - Not linked anywhere
   - **Recommendation:** Either merge into `/settings/account-plan` OR delete if redundant

### B. Unused Components

**None found** - All components in `components/settings/` are used, but SecurityCard is only in the unused page.

---

## 6. COMPONENT USAGE MATRIX

| Component | `/settings` | `/settings/account-plan` | `/profile` |
|-----------|-------------|-------------------------|------------|
| AppLanguageCard | ❌ (inline instead) | ✅ | ❌ |
| VellaSettingsCard | ❌ | ✅ | ❌ |
| PreferencesCard | ❌ | ✅ | ❌ |
| DataPrivacyCard | ❌ | ✅ | ❌ |
| SecurityCard | ✅ | ❌ | ❌ |
| SecurityInfoStrip | ✅ | ❌ | ❌ |
| PlanSwitcherModal | ❌ | ✅ | ❌ |

---

## 7. FINAL RECOMMENDATIONS

### A. These are the settings pages in use:

1. ✅ **`/settings/account-plan`** - PRIMARY ACTIVE PAGE
   - Linked in navigation
   - Complete settings UI
   - All features except Security

2. ✅ **`/profile`** - ACTIVE PROFILE PAGE
   - Linked from account-plan
   - Basic profile editing
   - Authentication

### B. These are shadow settings pages not in use:

1. ❌ **`/settings`** - SHADOW PAGE
   - Not linked in navigation
   - Minimal features
   - Contains SecurityCard (which should be in account-plan)

### C. These are duplicate UI cards:

1. **Language Selector**
   - Duplicate: Inline in `/settings` vs AppLanguageCard in `/settings/account-plan`

### D. These screens should be merged:

1. **Merge `/settings` into `/settings/account-plan`:**
   - Add SecurityCard to `/settings/account-plan`
   - Add SecurityInfoStrip to `/settings/account-plan`
   - Remove duplicate language selector from `/settings`
   - Delete `/settings` page after merge

### E. These screens should be removed:

1. **`/settings` page** (after merging SecurityCard into account-plan)

### F. This is the REAL settings route you are looking at:

**`/settings/account-plan`** - This is what users see when they click "Settings" in the bottom navigation.

**The SecurityCard you're trying to debug is in `/settings`, which users NEVER see.**

---

## 8. ROOT CAUSE OF SECURITYCARD ISSUE

**The Problem:**
- SecurityCard is in `/settings/page.tsx` (unused page)
- Users navigate to `/settings/account-plan` (active page)
- SecurityCard is NOT in `/settings/account-plan/page.tsx`
- Therefore, SecurityCard never appears because users never visit `/settings`

**The Solution:**
1. Move SecurityCard from `/settings/page.tsx` to `/settings/account-plan/page.tsx`
2. Move SecurityInfoStrip from `/settings/page.tsx` to `/settings/account-plan/page.tsx`
3. Delete `/settings/page.tsx` after migration

---

## 9. COMPLETE FILE INVENTORY

### Settings-Related Pages:
- ✅ `MOBILE/app/settings/account-plan/page.tsx` - ACTIVE
- ❌ `MOBILE/app/settings/page.tsx` - SHADOW/UNUSED

### Profile Pages:
- ✅ `MOBILE/app/profile/page.tsx` - ACTIVE

### Settings Components:
- ✅ `MOBILE/components/settings/AppLanguageCard.tsx` - USED
- ✅ `MOBILE/components/settings/VellaSettingsCard.tsx` - USED
- ✅ `MOBILE/components/settings/PreferencesCard.tsx` - USED
- ✅ `MOBILE/components/settings/DataPrivacyCard.tsx` - USED
- ⚠️ `MOBILE/components/settings/SecurityCard.tsx` - IN WRONG PAGE
- ⚠️ `MOBILE/components/settings/SecurityInfoStrip.tsx` - IN WRONG PAGE
- ✅ `MOBILE/components/settings/PlanSwitcherModal.tsx` - USED

---

## 10. ACTION ITEMS

### Immediate Actions:

1. **Move SecurityCard to active page:**
   - Add `<SecurityCard />` to `/settings/account-plan/page.tsx` (after DataPrivacyCard, line 338)

2. **Move SecurityInfoStrip to active page:**
   - Add `<SecurityInfoStrip />` to `/settings/account-plan/page.tsx` (before SecurityCard)

3. **Delete shadow page:**
   - Delete `MOBILE/app/settings/page.tsx` after migration

4. **Update navigation (if needed):**
   - Consider changing BottomNav to point to `/settings` if you want a simpler route
   - OR keep `/settings/account-plan` and ensure all features are there

---

## CONCLUSION

**The SecurityCard is not appearing because it's in the wrong page.** Users navigate to `/settings/account-plan`, but SecurityCard is only in `/settings`, which is never visited.

**The fix:** Move SecurityCard and SecurityInfoStrip from `/settings/page.tsx` to `/settings/account-plan/page.tsx`, then delete the unused `/settings` page.


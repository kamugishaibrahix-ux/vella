# localStorage Keys Audit Report

## Overview
Comprehensive audit of all localStorage keys related to:
- checkins / check-in
- entries
- daily
- history
- notes
- vella_memory
- vella_local_profile
- legacy or older key patterns

---

## 1. CHECK-IN RELATED KEYS

### `checkins:{userId}:data`
- **Pattern:** `checkins:${userId}:data`
- **Includes userId:** ✅ Yes
- **Read/Write Files:**
  - `MOBILE/lib/local/checkinsLocal.ts` (saveCheckin, loadCheckins, deleteCheckin)
- **Cleared by resetCheckinHistory:** ✅ Yes (matches `checkins:` prefix)

### `checkins:{userId}:notes`
- **Pattern:** `checkins:${userId}:notes`
- **Includes userId:** ✅ Yes
- **Read/Write Files:**
  - `MOBILE/lib/local/checkinsLocal.ts` (saveCheckinNote, loadCheckinNotes, deleteCheckin)
- **Cleared by resetCheckinHistory:** ✅ Yes (matches `checkins:` prefix)

---

## 2. JOURNAL/ENTRY RELATED KEYS

### `journals:{userId}:entries`
- **Pattern:** `journals:${userId}:entries`
- **Includes userId:** ✅ Yes
- **Read/Write Files:**
  - `MOBILE/lib/local/journalLocal.ts` (listLocalJournals, getLocalJournal, createLocalJournal, updateLocalJournal, deleteLocalJournal)
- **Cleared by resetCheckinHistory:** ✅ Yes (matches `journal` pattern)

---

## 3. DAILY/STOIC NOTE KEYS

### `vella.stoic.today`
- **Pattern:** `vella.stoic.today`
- **Includes userId:** ❌ No (global, not user-specific)
- **Read/Write Files:**
  - `MOBILE/lib/stoic/insights.ts` (getCachedStoicNote, setCachedStoicNote)
- **Cleared by resetCheckinHistory:** ✅ Yes (matches `stoic` pattern)

---

## 4. MEMORY PROFILE KEYS

### `vella_memory_v1`
- **Pattern:** `vella_memory_v1`
- **Includes userId:** ❌ No (global, not user-specific)
- **Read/Write Files:**
  - `MOBILE/lib/memory/localMemory.ts` (loadLocalMemory, saveLocalMemory)
  - `MOBILE/app/settings/account-plan/page.tsx` (loadLocalMemory)
  - `MOBILE/app/profile/page.tsx` (loadLocalMemory, saveLocalMemory)
  - `MOBILE/lib/realtime/VellaProvider.tsx` (loadLocalMemory)
- **Cleared by resetCheckinHistory:** ✅ Yes (explicit match: `key === "vella_memory_v1"`)

---

## 5. CONVERSATION/MEMORY KEYS

### `conversation:{userId}:messages`
- **Pattern:** `conversation:${userId}:messages`
- **Includes userId:** ✅ Yes
- **Read/Write Files:**
  - `MOBILE/lib/local/conversationLocal.ts` (saveLocalMessage, getLocalRecentMessages, getLocalFullHistory)
  - `MOBILE/lib/memory/conversation.ts` (saveMessage, getRecentMessages, getFullHistory)
- **Cleared by resetCheckinHistory:** ❌ **NO** (does not match any pattern)

### `conversation:{userId}:summary`
- **Pattern:** `conversation:${userId}:summary`
- **Includes userId:** ✅ Yes
- **Read/Write Files:**
  - `MOBILE/lib/local/conversationLocal.ts` (saveLocalSummary, loadLocalSummary)
  - `MOBILE/lib/memory/conversation.ts` (getSummary, saveSummary)
- **Cleared by resetCheckinHistory:** ❌ **NO** (does not match any pattern)

### `memory:{userId}:profile`
- **Pattern:** `memory:${userId}:profile`
- **Includes userId:** ✅ Yes
- **Read/Write Files:**
  - `MOBILE/lib/local/conversationLocal.ts` (saveLocalMemoryProfile, loadLocalMemoryProfile)
  - `MOBILE/lib/memory/conversation.ts` (getMemoryProfile, updateMemoryProfile)
- **Cleared by resetCheckinHistory:** ❌ **NO** (does not match any pattern)

### `memory_snapshots:{userId}:snapshots`
- **Pattern:** `memory_snapshots:${userId}:snapshots`
- **Includes userId:** ✅ Yes
- **Read/Write Files:**
  - `MOBILE/lib/local/memorySnapshotsLocal.ts` (saveLocalMemorySnapshot, listLocalMemorySnapshots)
- **Cleared by resetCheckinHistory:** ❌ **NO** (does not match any pattern)

---

## 6. TRAITS/HISTORY KEYS

### `traits:{userId}:current`
- **Pattern:** `traits:${userId}:current`
- **Includes userId:** ✅ Yes
- **Read/Write Files:**
  - `MOBILE/lib/local/traitsLocal.ts` (loadLocalTraits, saveLocalTraits)
  - `MOBILE/lib/traits/adaptiveTraits.ts` (uses loadLocalTraits, saveLocalTraits)
  - `MOBILE/lib/traits/getPreviousTraitSnapshot.ts` (uses loadLocalTraits)
- **Cleared by resetCheckinHistory:** ❌ **NO** (does not match any pattern)

### `traits:{userId}:history`
- **Pattern:** `traits:${userId}:history`
- **Includes userId:** ✅ Yes
- **Read/Write Files:**
  - `MOBILE/lib/local/traitsLocal.ts` (loadLocalTraitHistory, appendLocalTraitHistory)
  - `MOBILE/lib/traits/listTraitHistory.ts` (uses loadLocalTraitHistory)
  - `MOBILE/lib/traits/getPreviousTraitSnapshot.ts` (uses loadLocalTraitHistory)
  - `MOBILE/lib/traits/adaptiveTraits.ts` (uses loadLocalTraitHistory)
  - `MOBILE/lib/review/weeklyReview.ts` (uses loadLocalTraitHistory)
- **Cleared by resetCheckinHistory:** ❌ **NO** (does not match any pattern)

---

## 7. PROFILE KEYS

### `vella_local_profile_v1`
- **Pattern:** `vella_local_profile_v1`
- **Includes userId:** ❌ No (global, not user-specific)
- **Read/Write Files:**
  - `MOBILE/lib/local/vellaLocalProfile.ts` (loadVellaLocalProfile, saveVellaLocalProfile, clearVellaLocalProfile)
- **Cleared by resetCheckinHistory:** ❌ **NO** (protected pattern: `vella_local_profile`)

---

## 8. SESSION KEYS

### `session.history`
- **Pattern:** `session.history`
- **Includes userId:** ❌ No (global, not user-specific)
- **Read/Write Files:**
  - `MOBILE/app/session/page.tsx` (loadLocal, saveLocal)
- **Cleared by resetCheckinHistory:** ❌ **NO** (does not match any pattern)

### `session.voiceMode`
- **Pattern:** `session.voiceMode`
- **Includes userId:** ❌ No (global, not user-specific)
- **Read/Write Files:**
  - `MOBILE/app/session/page.tsx` (loadLocal, saveLocal)
- **Cleared by resetCheckinHistory:** ❌ **NO** (does not match any pattern)

---

## 9. LEGACY/OLD PATTERNS (via safeStorage.ts)

### `checkins` (namespace)
- **Pattern:** Uses `safeStorage.ts` with namespace `"checkins"`
- **Includes userId:** ❌ No (legacy pattern, no userId)
- **Read/Write Files:**
  - `MOBILE/lib/local/localCheckins.ts` (saveLocalCheckinNote, listLocalCheckinNotes)
- **Cleared by resetCheckinHistory:** ✅ Yes (matches `checkin` pattern)

### `journal` (namespace)
- **Pattern:** Uses `safeStorage.ts` with namespace `"journal"`
- **Includes userId:** ❌ No (legacy pattern, no userId)
- **Read/Write Files:**
  - `MOBILE/lib/local/localJournals.ts` (createLocalJournal, updateLocalJournal, getLocalJournal, listLocalJournals, deleteLocalJournal)
- **Cleared by resetCheckinHistory:** ✅ Yes (matches `journal` pattern)

---

## 10. OTHER PATTERNS (Potentially Related)

### Keys matching `insight` pattern
- **Pattern:** Any key containing `insight` (case-insensitive)
- **Cleared by resetCheckinHistory:** ✅ Yes (matches `insight` pattern)
- **Note:** No explicit keys found in codebase, but pattern matching would catch them

### Keys matching `emotion` pattern
- **Pattern:** Any key containing `emotion` (case-insensitive)
- **Cleared by resetCheckinHistory:** ✅ Yes (matches `emotion` pattern)
- **Note:** No explicit keys found in codebase, but pattern matching would catch them

### Keys matching `pattern` pattern
- **Pattern:** Any key containing `pattern` (case-insensitive)
- **Cleared by resetCheckinHistory:** ✅ Yes (matches `pattern` pattern)
- **Note:** No explicit keys found in codebase, but pattern matching would catch them

### Keys matching `mood_history` pattern
- **Pattern:** Any key containing `mood_history` (case-insensitive)
- **Cleared by resetCheckinHistory:** ✅ Yes (matches `mood_history` pattern)
- **Note:** No explicit keys found in codebase, but pattern matching would catch them

### Keys matching `daily_insight` pattern
- **Pattern:** Any key containing `daily_insight` (case-insensitive)
- **Cleared by resetCheckinHistory:** ✅ Yes (matches `daily_insight` pattern)
- **Note:** No explicit keys found in codebase, but pattern matching would catch them

---

## SUMMARY: Keys NOT Cleared by resetCheckinHistory()

### ❌ **NOT CLEARED:**

1. **`conversation:{userId}:messages`** - Conversation message history
2. **`conversation:{userId}:summary`** - Conversation summaries
3. **`memory:{userId}:profile`** - Memory profile data
4. **`memory_snapshots:{userId}:snapshots`** - Memory snapshots
5. **`traits:{userId}:current`** - Current trait scores
6. **`traits:{userId}:history`** - Trait history
7. **`vella_local_profile_v1`** - Local profile (protected)
8. **`session.history`** - Session history
9. **`session.voiceMode`** - Session voice mode

### ✅ **CLEARED:**

1. **`checkins:{userId}:data`** - Check-in data
2. **`checkins:{userId}:notes`** - Check-in notes
3. **`journals:{userId}:entries`** - Journal entries
4. **`vella.stoic.today`** - Daily Stoic note cache
5. **`vella_memory_v1`** - Memory profile (global)
6. **Legacy `checkins` namespace** - Old check-in storage
7. **Legacy `journal` namespace** - Old journal storage
8. **Any keys containing:** `insight`, `emotion`, `pattern`, `mood_history`, `daily_insight`

---

## RECOMMENDATIONS

### 1. Consider Clearing Conversation/Memory Keys
If "Delete History" should clear all emotional/check-in related data, consider adding:
- `conversation:{userId}:messages`
- `conversation:{userId}:summary`
- `memory:{userId}:profile`
- `memory_snapshots:{userId}:snapshots`

### 2. Consider Clearing Traits Keys
If traits are derived from check-ins, consider adding:
- `traits:{userId}:current`
- `traits:{userId}:history`

### 3. Session Keys
Session keys (`session.history`, `session.voiceMode`) are likely intentional to keep, as they're not check-in related.

### 4. Profile Keys
`vella_local_profile_v1` is intentionally protected (user profile data, not check-in history).

---

## PATTERN MATCHING LOGIC (from resetCheckinHistory.ts)

```typescript
const isCheckinRelated =
  keyLower.includes("checkin") ||
  keyLower.includes("insight") ||
  keyLower.includes("emotion") ||
  keyLower.includes("pattern") ||
  keyLower.includes("stoic") ||
  keyLower.includes("journal") ||
  keyLower.includes("mood_history") ||
  keyLower.includes("daily_insight") ||
  keyLower.startsWith("checkins:") ||
  key === "vella_memory_v1";
```

**Protected patterns (NOT deleted):**
- `vella_local_profile`
- `vella_settings`
- `user_preferences`
- `subscription`
- `token`
- `profile`
- `auth`
- `anonUserId`


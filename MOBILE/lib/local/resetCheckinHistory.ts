"use client";

/**
 * Reset all local emotional/relational history on this device.
 * This function deletes localStorage keys related to:
 * - Check-ins (data and notes)
 * - Journals
 * - Conversations and messages
 * - Memory profiles and snapshots
 * - Traits and trait history
 * - Insights and emotional patterns
 * - Stoic notes
 * 
 * Does NOT delete:
 * - User profile data
 * - Subscriptions
 * - Tokens
 * - Preferences
 * - Supabase auth data
 */
export function resetLocalCheckinHistory(): void {
  if (typeof window === "undefined") {
    return;
  }

  const keysToDelete: string[] = [];
  const protectedPatterns = [
    "vella_local_profile",
    "vella_settings",
    "user_preferences",
    "subscription",
    "token",
    "profile",
    "auth",
    "anonUserId", // Keep anonymous user ID for continuity
  ];

  // Helper function to determine if a key is related to emotional/relational history
  const isCheckinRelated = (key: string): boolean => {
    const keyLower = key.toLowerCase();

    // Pattern matches (any key containing these substrings)
    const isPatternMatch =
      keyLower.includes("checkin") ||
      keyLower.includes("insight") ||
      keyLower.includes("emotion") ||
      keyLower.includes("pattern") ||
      keyLower.includes("stoic") ||
      keyLower.includes("journal") ||
      keyLower.includes("mood_history") ||
      keyLower.includes("daily_insight");

    // Namespace matches (keys starting with these prefixes)
    const isNamespaceMatch =
      keyLower.startsWith("checkins:") ||
      keyLower.startsWith("journals:") ||
      keyLower.startsWith("conversation:") ||
      keyLower.startsWith("memory:") ||
      keyLower.startsWith("memory_snapshots:") ||
      keyLower.startsWith("traits:");

    // Exact matches
    const isExactMatch =
      key === "vella_memory_v1" ||
      key === "vella.stoic.today";

    return isPatternMatch || isNamespaceMatch || isExactMatch;
  };

  // Scan all localStorage keys
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;

    const keyLower = key.toLowerCase();

    // Skip protected keys (user profile, subscriptions, tokens, etc.)
    const isProtected = protectedPatterns.some((pattern) => keyLower.includes(pattern.toLowerCase()));
    if (isProtected) {
      continue;
    }

    // Match emotional/relational history keys
    if (isCheckinRelated(key)) {
      keysToDelete.push(key);
    }
  }

  // Delete matched keys
  keysToDelete.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
      console.log("[resetCheckinHistory] Deleted localStorage key:", key);
    } catch (error) {
      console.error(`[resetCheckinHistory] Failed to delete key "${key}":`, error);
    }
  });

  console.log(`[resetCheckinHistory] Reset complete. Deleted ${keysToDelete.length} keys.`);
}


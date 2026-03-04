"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";

// Storage keys
const STORAGE_KEY_ENABLED = "vella.lock.enabled";
const STORAGE_KEY_HASH = "vella.lock.hash";
const STORAGE_KEY_SALT = "vella.lock.salt";
const STORAGE_KEY_LAST_UNLOCK = "vella.lock.lastUnlock";
const STORAGE_KEY_REQUIRE_AFTER = "vella.lock.requireAfterMinutes";

// Default values
const DEFAULT_REQUIRE_AFTER_MINUTES = 5;

// Inactivity check interval (ms)
const INACTIVITY_CHECK_INTERVAL_MS = 10_000;

// Throttle activity recording (ms)
const ACTIVITY_THROTTLE_MS = 2_000;

// Helper: Check if window/localStorage is available
function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

// Helper: Read string from localStorage
function readStorage(key: string): string | null {
  if (!hasStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Helper: Write string to localStorage
function writeStorage(key: string, value: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort; ignore quota errors
  }
}

// Helper: Remove key from localStorage
function removeStorage(key: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// Helper: Convert ArrayBuffer to hex string
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Helper: Hash passcode with salt using SHA-256
async function hashPasscode(salt: string, passcode: string): Promise<string> {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Web Crypto API not available");
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${passcode}`);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  return arrayBufferToHex(hashBuffer);
}

// Helper: Generate random salt
function generateSalt(): string {
  if (typeof window === "undefined" || !window.crypto) {
    throw new Error("Crypto API not available");
  }

  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return arrayBufferToHex(array.buffer);
}

// Helper: Validate passcode format
function validatePasscode(passcode: string): void {
  if (!/^[0-9]{6}$/.test(passcode)) {
    throw new Error("Passcode must be exactly 6 digits");
  }
}

// Helper: Check if a passcode already exists
export function hasExistingPasscode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem(STORAGE_KEY_HASH);
  } catch {
    return false;
  }
}

// Lock state type
type LockState = {
  locked: boolean;
  enabled: boolean;
  requireAfterMinutes: number;
  lastUnlock: Date | null;
  initializing: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  setRequireAfterMinutes: (minutes: number) => Promise<void>;
  setNewPasscode: (passcode: string) => Promise<void>;
  unlock: (passcode: string) => Promise<boolean>;
  unlockWithBiometric: () => Promise<void>;
  lock: () => void;
  hardReset: () => Promise<void>;
};

// Context
const LockContext = createContext<LockState | null>(null);

// Provider component
export function LockProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState<boolean>(false);
  const [enabled, setEnabledState] = useState<boolean>(false);
  const [requireAfterMinutes, setRequireAfterMinutesState] = useState<number>(DEFAULT_REQUIRE_AFTER_MINUTES);
  const [lastUnlock, setLastUnlockState] = useState<Date | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);

  // Refs for lifecycle/inactivity (avoid stale closure issues)
  const enabledRef = useRef<boolean>(false);
  const lockedRef = useRef<boolean>(false);
  const requireAfterMinutesRef = useRef<number>(DEFAULT_REQUIRE_AFTER_MINUTES);
  const lastActivityRef = useRef<number>(Date.now());
  const lastActivityThrottleRef = useRef<number>(0);

  // Load state from storage
  const loadState = useCallback(() => {
    if (!hasStorage()) {
      setInitializing(false);
      return;
    }

    const storedEnabled = readStorage(STORAGE_KEY_ENABLED) === "true";
    const storedHash = readStorage(STORAGE_KEY_HASH);
    const storedSalt = readStorage(STORAGE_KEY_SALT);
    const storedLastUnlock = readStorage(STORAGE_KEY_LAST_UNLOCK);
    const storedRequireAfter = readStorage(STORAGE_KEY_REQUIRE_AFTER);

    setEnabledState(storedEnabled);
    setRequireAfterMinutesState(
      storedRequireAfter ? parseInt(storedRequireAfter, 10) : DEFAULT_REQUIRE_AFTER_MINUTES,
    );

    if (storedLastUnlock) {
      try {
        setLastUnlockState(new Date(parseInt(storedLastUnlock, 10)));
      } catch {
        setLastUnlockState(null);
      }
    } else {
      setLastUnlockState(null);
    }

    // Determine initial locked state
    if (storedEnabled && storedHash && storedSalt) {
      if (storedRequireAfter === "0") {
        setLocked(true);
      } else if (!storedLastUnlock) {
        setLocked(true);
      } else {
        try {
          const lastUnlockTime = parseInt(storedLastUnlock, 10);
          const now = Date.now();
          const requireAfterMs = parseInt(storedRequireAfter || "0", 10) * 60_000;
          if (now - lastUnlockTime > requireAfterMs) {
            setLocked(true);
          } else {
            setLocked(false);
          }
        } catch {
          setLocked(true);
        }
      }
    } else {
      setLocked(false);
    }

    setInitializing(false);
  }, []);

  // Keep refs in sync with state for use in event handlers / intervals
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { lockedRef.current = locked; }, [locked]);
  useEffect(() => { requireAfterMinutesRef.current = requireAfterMinutes; }, [requireAfterMinutes]);

  // Initialize on mount
  useEffect(() => {
    loadState();
  }, [loadState]);

  // ── Auto-lock lifecycle + inactivity ──────────────────────────────────────
  const lockIfEnabled = useCallback(() => {
    if (!enabledRef.current) return;
    const hash = readStorage(STORAGE_KEY_HASH);
    const salt = readStorage(STORAGE_KEY_SALT);
    if (hash && salt) {
      writeStorage(STORAGE_KEY_LAST_UNLOCK, "");
      setLastUnlockState(null);
      setLocked(true);
    }
  }, []);

  // Activity recorder — throttled, does NOT run while locked
  const recordActivity = useCallback(() => {
    if (lockedRef.current) return;
    const now = Date.now();
    if (now - lastActivityThrottleRef.current < ACTIVITY_THROTTLE_MS) return;
    lastActivityThrottleRef.current = now;
    lastActivityRef.current = now;
  }, []);

  // Lifecycle events: lock on background/close
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) lockIfEnabled();
    };
    const handlePageHide = () => lockIfEnabled();
    const handleBeforeUnload = () => lockIfEnabled();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [lockIfEnabled]);

  // Activity event listeners
  useEffect(() => {
    window.addEventListener("pointerdown", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity, { passive: true });
    window.addEventListener("touchstart", recordActivity, { passive: true });
    window.addEventListener("scroll", recordActivity, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("touchstart", recordActivity);
      window.removeEventListener("scroll", recordActivity);
    };
  }, [recordActivity]);

  // Inactivity timeout interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (!enabledRef.current) return;
      if (lockedRef.current) return;
      const minutes = requireAfterMinutesRef.current;
      if (minutes === 0) return; // 0 = lock immediately on every open (handled elsewhere)
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs > minutes * 60_000) {
        lockIfEnabled();
      }
    }, INACTIVITY_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [lockIfEnabled]);
  // ────────────────────────────────────────────────────────────────────────────

  // setEnabled
  const setEnabled = useCallback(
    async (newEnabled: boolean) => {
      writeStorage(STORAGE_KEY_ENABLED, String(newEnabled));
      setEnabledState(newEnabled);

      if (!newEnabled) {
        setLocked(false);
      } else {
        // Check if hash/salt exist
        const hash = readStorage(STORAGE_KEY_HASH);
        const salt = readStorage(STORAGE_KEY_SALT);
        if (!hash || !salt) {
          // No passcode set yet, lock the app to force setup
          setLocked(true);
        }
      }
    },
    [],
  );

  // setRequireAfterMinutes
  const setRequireAfterMinutes = useCallback(async (minutes: number) => {
    writeStorage(STORAGE_KEY_REQUIRE_AFTER, String(minutes));
    setRequireAfterMinutesState(minutes);
  }, []);

  // setNewPasscode
  const setNewPasscode = useCallback(
    async (passcode: string) => {
      validatePasscode(passcode);

      if (typeof window === "undefined" || !window.crypto?.subtle) {
        throw new Error("Web Crypto API not available");
      }

      const salt = generateSalt();
      const hash = await hashPasscode(salt, passcode);

      writeStorage(STORAGE_KEY_HASH, hash);
      writeStorage(STORAGE_KEY_SALT, salt);
      writeStorage(STORAGE_KEY_ENABLED, "true");
      setEnabledState(true);

      // Unlock immediately after setting passcode; reset activity timer
      const now = Date.now();
      writeStorage(STORAGE_KEY_LAST_UNLOCK, String(now));
      lastActivityRef.current = now;
      setLastUnlockState(new Date(now));
      setLocked(false);
    },
    [],
  );

  // unlock
  const unlock = useCallback(
    async (passcode: string): Promise<boolean> => {
      if (!hasStorage()) return false;

      const storedHash = readStorage(STORAGE_KEY_HASH);
      const storedSalt = readStorage(STORAGE_KEY_SALT);
      const storedEnabled = readStorage(STORAGE_KEY_ENABLED) === "true";

      // Return false immediately if no passcode exists (setup mode)
      if (!storedHash || !storedSalt || !storedEnabled) {
        return false;
      }

      if (typeof window === "undefined" || !window.crypto?.subtle) {
        return false;
      }

      try {
        const computedHash = await hashPasscode(storedSalt, passcode);
        if (computedHash === storedHash) {
          const now = Date.now();
          writeStorage(STORAGE_KEY_LAST_UNLOCK, String(now));
          setLastUnlockState(new Date(now));
          lastActivityRef.current = now;
          setLocked(false);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [],
  );

  // unlockWithBiometric
  const unlockWithBiometric = useCallback(async () => {
    // Treat biometric unlock as trusted
    const now = Date.now();
    writeStorage(STORAGE_KEY_LAST_UNLOCK, String(now));
    lastActivityRef.current = now;
    setLastUnlockState(new Date(now));
    setLocked(false);
  }, []);

  // lock
  const lock = useCallback(() => {
    const storedEnabled = readStorage(STORAGE_KEY_ENABLED) === "true";
    const storedHash = readStorage(STORAGE_KEY_HASH);
    const storedSalt = readStorage(STORAGE_KEY_SALT);

    if (storedEnabled && storedHash && storedSalt) {
      writeStorage(STORAGE_KEY_LAST_UNLOCK, "");
      setLastUnlockState(null);
      setLocked(true);
    }
  }, []);

  // hardReset
  const hardReset = useCallback(async () => {
    removeStorage(STORAGE_KEY_ENABLED);
    removeStorage(STORAGE_KEY_HASH);
    removeStorage(STORAGE_KEY_SALT);
    removeStorage(STORAGE_KEY_LAST_UNLOCK);
    removeStorage(STORAGE_KEY_REQUIRE_AFTER);

    setEnabledState(false);
    setLocked(false);
    setLastUnlockState(null);
    setRequireAfterMinutesState(DEFAULT_REQUIRE_AFTER_MINUTES);
  }, []);

  const value: LockState = {
    locked,
    enabled,
    requireAfterMinutes,
    lastUnlock,
    initializing,
    setEnabled,
    setRequireAfterMinutes,
    setNewPasscode,
    unlock,
    unlockWithBiometric,
    lock,
    hardReset,
  };

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

// Hook
export function useLockState(): LockState {
  const context = useContext(LockContext);
  if (!context) {
    throw new Error("useLockState must be used within a LockProvider");
  }
  return context;
}


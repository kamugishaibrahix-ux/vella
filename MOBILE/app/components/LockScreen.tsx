"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useLockState } from "@/lib/security/lockState";
import { verifyBiometricCredential, biometricsEnabled } from "@/lib/security/biometrics";
import { X, Fingerprint, AlertTriangle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Storage keys to clear on reset
const VELLA_NAMESPACE = "vella_local_v1";
const LOCK_KEYS = [
  "vella.lock.enabled",
  "vella.lock.hash",
  "vella.lock.salt",
  "vella.lock.lastUnlock",
  "vella.lock.requireAfterMinutes",
  "vella.lock.biometric.enabled",
  "vella.lock.biometric.credentialId",
];
const OTHER_KEYS = [
  "vella_local_profile_v1",
  "vella_settings_v1",
  "vella_notifications_v1",
  "profile_avatar_v1",
  "profile_data_v1",
];

// PIN Input Component
function PinInput({
  length,
  value,
  onChange,
  onComplete,
  error,
  disabled = false,
}: {
  length: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
}) {
  const handleDigit = (digit: string) => {
    if (disabled || value.length >= length) return;
    const newValue = value + digit;
    onChange(newValue);
    if (newValue.length === length && onComplete) {
      onComplete(newValue);
    }
  };

  const handleBackspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const rows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "backspace"],
  ];

  return (
    <div className="space-y-6">
      {/* PIN Display */}
      <div className="flex items-center justify-center gap-3">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-4 h-4 rounded-full transition-all duration-200",
              i < value.length
                ? error
                  ? "bg-red-500 scale-110"
                  : "bg-white scale-110"
                : "bg-white/30"
            )}
          />
        ))}
      </div>

      {/* Numpad */}
      <div className="grid gap-2">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-2">
            {row.map((key) => (
              <button
                key={key}
                onClick={() => {
                  if (key === "backspace") handleBackspace();
                  else if (key) handleDigit(key);
                }}
                disabled={disabled || (!key && key !== "0")}
                className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-semibold transition-all duration-150",
                  key === ""
                    ? "invisible"
                    : key === "backspace"
                    ? "bg-white/20 text-white hover:bg-white/30 active:scale-95"
                    : "bg-white text-neutral-900 hover:bg-neutral-100 active:scale-95 active:bg-neutral-200",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {key === "backspace" ? <X className="w-6 h-6" /> : key}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Forgot PIN / Reset Modal
function ResetModal({
  isOpen,
  onClose,
  onReset,
}: {
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  if (!isOpen) return null;

  const canReset = confirmText === "RESET";

  const handleReset = async () => {
    if (!canReset) return;
    setIsResetting(true);
    try {
      await onReset();
    } catch (err) {
      console.error("Reset failed:", err);
      alert("Reset failed. Please try again.");
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm bg-neutral-900 rounded-2xl shadow-xl overflow-hidden border border-neutral-700">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Forgot PIN?</h3>
              <p className="text-sm text-red-400">This cannot be undone</p>
            </div>
          </div>

          <div className="space-y-4 text-sm text-neutral-300">
            <p>
              For your privacy, we <strong>cannot recover your PIN</strong>. The only way to 
              regain access is to reset this device.
            </p>

            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-300">
                <strong>Reset will delete:</strong>
              </p>
              <ul className="mt-1 space-y-1 text-red-300/80">
                <li>• Your PIN and biometric settings</li>
                <li>• All journals and check-ins</li>
                <li>• All sessions and memories</li>
                <li>• Your anonymous ID</li>
              </ul>
            </div>

            <p>You will start fresh with a new anonymous ID.</p>

            <div className="pt-2">
              <label className="block text-sm text-neutral-400 mb-1">
                Type <strong className="text-white">RESET</strong> to confirm:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type RESET"
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              disabled={isResetting}
              className="flex-1 py-2.5 px-4 rounded-xl border border-neutral-600 text-neutral-300 font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={!canReset || isResetting}
              className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {isResetting ? "Resetting..." : "Reset Device"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main LockScreen Component
export function LockScreen() {
  const { locked, enabled, initializing, unlock, unlockWithBiometric, hardReset } = useLockState();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showResetModal, setShowResetModal] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Check biometric availability
  useEffect(() => {
    setBiometricAvailable(biometricsEnabled());
  }, []);

  // Reset state when unlocked
  useEffect(() => {
    if (!locked) {
      setPin("");
      setError(false);
      setAttempts(0);
    }
  }, [locked]);

  const handleComplete = useCallback(
    async (enteredPin: string) => {
      const valid = await unlock(enteredPin);

      if (valid) {
        setPin("");
        setError(false);
        setAttempts(0);
      } else {
        setError(true);
        setShake(true);
        setAttempts((prev) => prev + 1);
        setPin("");
        setTimeout(() => setShake(false), 500);
      }
    },
    [unlock]
  );

  const handleBiometricUnlock = async () => {
    if (!biometricAvailable) return;

    try {
      // First verify the biometric credential with WebAuthn
      const verified = await verifyBiometricCredential();
      if (verified) {
        // Biometric verified - unlock the app via the hook
        await unlockWithBiometric();
        setPin("");
        setError(false);
        setAttempts(0);
      } else {
        setError(true);
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch (err) {
      console.error("Biometric verification failed:", err);
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  const handleFullReset = async () => {
    // Clear all vella_local_v1 namespace data
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(VELLA_NAMESPACE)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // Clear lock keys
    LOCK_KEYS.forEach((key) => localStorage.removeItem(key));

    // Clear other keys
    OTHER_KEYS.forEach((key) => localStorage.removeItem(key));

    // Reload to regenerate anonUserId
    window.location.href = "/home";
  };

  // Don't render until initialized (prevents hydration flicker)
  if (initializing) return null;

  // Don't show if not enabled or not locked
  if (!enabled || !locked) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-neutral-900 flex flex-col">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-800 to-neutral-900" />

        {/* Content */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-8">
          {/* Logo/Icon */}
          <div className="mb-8">
            <div className="w-20 h-20 rounded-3xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 overflow-hidden">
              <Image
                src="/icons/icon-192.png"
                alt="Vella logo"
                width={72}
                height={72}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-semibold text-white mb-2">Vella is Locked</h1>
          <p className="text-white/60 text-center mb-8">Enter your PIN to unlock</p>

          {/* PIN Input with shake animation */}
          <div className={cn("w-full max-w-xs", shake && "animate-shake")}>
            <PinInput
              length={6}
              value={pin}
              onChange={setPin}
              onComplete={handleComplete}
              error={error}
            />
          </div>

          {/* Error message */}
          {error && (
            <p className="mt-6 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-lg">
              Incorrect PIN. Try again.
            </p>
          )}

          {/* Attempts warning */}
          {attempts >= 3 && (
            <p className="mt-4 text-amber-400 text-xs bg-amber-500/10 px-3 py-1.5 rounded-lg text-center">
              Multiple failed attempts. Tap &quot;Forgot PIN?&quot; below if you need to reset.
            </p>
          )}

          {/* Biometric unlock button */}
          {biometricAvailable && (
            <button
              onClick={handleBiometricUnlock}
              className="mt-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white/70 text-sm hover:bg-white/20 hover:text-white transition-colors"
            >
              <Fingerprint className="w-4 h-4" />
              Unlock with biometrics
            </button>
          )}

          {/* Forgot PIN link */}
          <button
            onClick={() => setShowResetModal(true)}
            className="mt-8 text-white/40 text-sm hover:text-white/70 transition-colors"
          >
            Forgot PIN?
          </button>
        </div>

        {/* Footer hint */}
        <div className="relative px-6 py-4 text-center">
          <p className="text-white/30 text-xs">
            Your data is secure on this device
          </p>
        </div>
      </div>

      {/* Reset Modal */}
      <ResetModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onReset={handleFullReset}
      />
    </>
  );
}

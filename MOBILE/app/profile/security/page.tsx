"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, Shield, Key, Trash2, AlertTriangle, Check, X, Fingerprint } from "lucide-react";
import { useLockState } from "@/lib/security/lockState";
import {
  biometricsSupported,
  createBiometricCredential,
  enableBiometrics,
  biometricsEnabled,
} from "@/lib/security/biometrics";
import { cn } from "@/lib/utils";

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

  // Numpad layout
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
                  : "bg-neutral-900 scale-110"
                : "bg-neutral-200"
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
                    ? "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 active:scale-95"
                    : "bg-white border-2 border-neutral-200 text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50 active:scale-95 active:bg-neutral-100",
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

// Modal Component
function Modal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="font-semibold text-neutral-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// Main Page
export default function SecurityPage() {
  const router = useRouter();
  const {
    enabled,
    locked,
    requireAfterMinutes,
    initializing,
    setEnabled,
    setRequireAfterMinutes,
    setNewPasscode,
    unlock,
    hardReset,
  } = useLockState();

  const [mounted, setMounted] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Biometric state
  const [biometricSupported, setBiometricSupported] = useState<boolean>(false);
  const [biometricEnabled, setBiometricEnabledState] = useState<boolean>(false);
  const [biometricLoading, setBiometricLoading] = useState(true);
  const [showBiometricEnableModal, setShowBiometricEnableModal] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);

  // PIN states
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [firstPin, setFirstPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check biometric support on mount
  useEffect(() => {
    setMounted(true);

    const checkBiometricSupport = async () => {
      try {
        const supported = await biometricsSupported();
        setBiometricSupported(supported);
        setBiometricEnabledState(biometricsEnabled());
      } catch {
        setBiometricSupported(false);
      } finally {
        setBiometricLoading(false);
      }
    };

    checkBiometricSupport();
  }, []);

  // Setup flow
  const handleFirstPinComplete = async (pin: string) => {
    setFirstPin(pin);
    setSetupStep(2);
    setConfirmPin("");
    setError(null);
  };

  const handleConfirmPinComplete = async (pin: string) => {
    if (pin !== firstPin) {
      setError("PINs don't match. Try again.");
      setConfirmPin("");
      return;
    }

    try {
      await setNewPasscode(pin);
      setSuccess(true);
      setTimeout(() => {
        setShowSetupModal(false);
        resetSetupState();
      }, 1500);
    } catch (err) {
      setError("Failed to set PIN. Please try again.");
    }
  };

  // Change flow
  const handleChangePin = async () => {
    const valid = await unlock(currentPin);
    if (!valid) {
      setError("Incorrect PIN");
      setCurrentPin("");
      return;
    }

    // Current PIN correct, start setup flow
    setShowChangeModal(false);
    setShowSetupModal(true);
    resetSetupState();
  };

  // Disable flow
  const handleDisablePin = async () => {
    const valid = await unlock(currentPin);
    if (!valid) {
      setError("Incorrect PIN");
      setCurrentPin("");
      return;
    }

    try {
      await setEnabled(false);
      // Also disable biometrics when disabling PIN
      enableBiometrics(false);
      setBiometricEnabledState(false);
      setShowDisableModal(false);
      setCurrentPin("");
      setError(null);
    } catch (err) {
      setError("Failed to disable. Please try again.");
    }
  };

  // Reset flow
  const handleHardReset = async () => {
    try {
      await hardReset();
      // Also clear biometric settings
      enableBiometrics(false);
      setBiometricEnabledState(false);
      setShowResetConfirm(false);
    } catch (err) {
      setError("Failed to reset. Please try again.");
    }
  };

  // Biometric enable flow
  const handleEnableBiometric = async () => {
    if (!enabled) return; // Require PIN first

    setBiometricError(null);
    setShowBiometricEnableModal(true);

    try {
      // Attempt to create biometric credential (requires user verification)
      const result = await createBiometricCredential();

      if (result.success) {
        enableBiometrics(true);
        setBiometricEnabledState(true);
        setShowBiometricEnableModal(false);
      } else {
        setBiometricError("Biometric setup failed. Please try again.");
      }
    } catch (err) {
      setBiometricError("Biometric verification failed or was cancelled.");
    }
  };

  // Biometric disable flow
  const handleDisableBiometric = () => {
    enableBiometrics(false);
    setBiometricEnabledState(false);
  };

  const resetSetupState = () => {
    setSetupStep(1);
    setFirstPin("");
    setConfirmPin("");
    setCurrentPin("");
    setError(null);
    setSuccess(false);
  };

  const handleToggle = async () => {
    if (enabled) {
      // Turning off - require PIN
      setShowDisableModal(true);
      setCurrentPin("");
      setError(null);
    } else {
      // Turning on - start setup
      setShowSetupModal(true);
      resetSetupState();
    }
  };

  if (!mounted || initializing) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <div className="px-5 py-6">
          <div className="h-8 w-32 bg-neutral-200 rounded animate-pulse mb-6" />
          <div className="h-24 bg-white rounded-xl border border-neutral-200 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="px-5 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center gap-3">
          <button
            onClick={() => router.push("/profile")}
            className="p-2 -ml-2 rounded-lg hover:bg-neutral-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-700" />
          </button>
          <h1 className="text-xl font-semibold text-neutral-900">Security</h1>
        </header>

        {/* App Lock Card */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-700 shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-neutral-900">App Lock</h2>
                  <p className="text-sm text-neutral-500">Protect Vella with a PIN</p>
                </div>
                <button
                  onClick={handleToggle}
                  className={cn(
                    "w-12 h-7 rounded-full transition-colors relative",
                    enabled ? "bg-neutral-900" : "bg-neutral-300"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 w-5 h-5 rounded-full bg-white transition-transform",
                      enabled ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {enabled && (
                <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100">
                    <Shield className="w-4 h-4" />
                    <span>App Lock is active</span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowChangeModal(true);
                        setCurrentPin("");
                        setError(null);
                      }}
                      className="flex-1 py-2.5 px-4 rounded-xl border border-neutral-200 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors text-sm"
                    >
                      Change PIN
                    </button>
                    <button
                      onClick={() => {
                        setShowResetConfirm(true);
                        setError(null);
                      }}
                      className="py-2.5 px-4 rounded-xl border border-red-200 text-red-600 font-medium hover:bg-red-50 transition-colors text-sm"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Biometric Unlock Card */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-700 shrink-0">
              <Fingerprint className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-neutral-900">Biometric Unlock</h2>
                  <p className="text-sm text-neutral-500">Use Face ID, Touch ID, or fingerprint</p>
                </div>
                {biometricLoading ? (
                  <div className="w-12 h-7 rounded-full bg-neutral-200 animate-pulse" />
                ) : enabled && biometricSupported ? (
                  <button
                    onClick={biometricEnabled ? handleDisableBiometric : handleEnableBiometric}
                    className={cn(
                      "w-12 h-7 rounded-full transition-colors relative",
                      biometricEnabled ? "bg-neutral-900" : "bg-neutral-300"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 w-5 h-5 rounded-full bg-white transition-transform",
                        biometricEnabled ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                ) : (
                  <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-1 rounded border border-neutral-200">
                    {enabled ? "Not supported" : "Requires PIN"}
                  </span>
                )}
              </div>

              {!enabled && (
                <p className="mt-3 text-sm text-neutral-500">
                  Set up a PIN first to enable biometric unlock.
                </p>
              )}

              {enabled && !biometricSupported && !biometricLoading && (
                <p className="mt-3 text-sm text-neutral-500">
                  Your device or browser doesn&apos;t support biometric authentication. 
                  This feature requires WebAuthn with a platform authenticator (Face ID, Touch ID, or fingerprint).
                </p>
              )}

              {enabled && biometricSupported && biometricEnabled && (
                <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
                  <Check className="w-4 h-4" />
                  <span>Biometric unlock is enabled</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Auto-Lock Timeout Card */}
        {enabled && (
          <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-700 shrink-0">
                <Key className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-neutral-900">Auto-Lock</h2>
                <p className="text-sm text-neutral-500 mt-0.5">Lock Vella after a period of inactivity</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    { label: "1 minute", value: 1 },
                    { label: "5 minutes", value: 5 },
                    { label: "15 minutes", value: 15 },
                    { label: "30 minutes", value: 30 },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRequireAfterMinutes(opt.value)}
                      className={cn(
                        "py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors text-left",
                        requireAfterMinutes === opt.value
                          ? "bg-neutral-900 border-neutral-900 text-white"
                          : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-neutral-400">
                  App always locks when backgrounded or closed.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Security Info */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">
            How Security Works
          </h2>

          <div className="space-y-4 text-sm text-neutral-600">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700 text-xs font-medium shrink-0 mt-0.5">
                1
              </div>
              <p>
                Your PIN is never stored as plain text. We use SHA-256 with a random 128-bit salt 
                to create a secure hash.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700 text-xs font-medium shrink-0 mt-0.5">
                2
              </div>
              <p>
                Biometric unlock uses your device&apos;s secure hardware (Face ID, Touch ID, or fingerprint) 
                via WebAuthn. Your biometric data never leaves this device.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700 text-xs font-medium shrink-0 mt-0.5">
                3
              </div>
              <p>
                If you forget your PIN, you must reset this device. For privacy, we cannot recover 
                your PIN. A reset permanently deletes all local data.
              </p>
            </div>
          </div>
        </section>

        {/* Technical Details */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">
            Technical Details
          </h2>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-600">PIN Encryption</span>
              <span className="text-neutral-900 font-medium">SHA-256 + 128-bit salt</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-600">Biometric Standard</span>
              <span className="text-neutral-900 font-medium">WebAuthn Platform Auth</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-600">Storage</span>
              <span className="text-neutral-900 font-medium">Local only, encrypted</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-neutral-600">Recovery</span>
              <span className="text-neutral-900 font-medium">Not possible (privacy)</span>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-neutral-400 pt-4">
          <p>Security settings are stored locally on this device.</p>
          <p className="mt-1">Vella cannot recover your PIN or biometrics.</p>
        </footer>
      </div>

      {/* Setup PIN Modal */}
      <Modal
        isOpen={showSetupModal}
        onClose={() => {
          if (!enabled) setEnabled(false); // Revert toggle if cancelled
          setShowSetupModal(false);
          resetSetupState();
        }}
        title={setupStep === 1 ? "Create PIN" : "Confirm PIN"}
      >
        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="font-medium text-neutral-900">PIN set successfully!</p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-center text-sm text-neutral-600">
              {setupStep === 1
                ? "Choose a 6-digit PIN to protect Vella"
                : "Enter the same PIN again to confirm"}
            </p>

            <PinInput
              length={6}
              value={setupStep === 1 ? firstPin : confirmPin}
              onChange={setupStep === 1 ? setFirstPin : setConfirmPin}
              onComplete={setupStep === 1 ? handleFirstPinComplete : handleConfirmPinComplete}
              error={!!error}
            />

            {error && (
              <p className="text-center text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            {setupStep === 2 && (
              <button
                onClick={() => {
                  setSetupStep(1);
                  setFirstPin("");
                  setConfirmPin("");
                  setError(null);
                }}
                className="w-full text-center text-sm text-neutral-500 hover:text-neutral-700"
              >
                Start over
              </button>
            )}
          </div>
        )}
      </Modal>

      {/* Change PIN Modal */}
      <Modal
        isOpen={showChangeModal}
        onClose={() => {
          setShowChangeModal(false);
          setCurrentPin("");
          setError(null);
        }}
        title="Enter Current PIN"
      >
        <div className="space-y-6">
          <p className="text-center text-sm text-neutral-600">
            Enter your current PIN to change it
          </p>

          <PinInput
            length={6}
            value={currentPin}
            onChange={setCurrentPin}
            error={!!error}
          />

          <button
            onClick={handleChangePin}
            disabled={currentPin.length !== 6}
            className="w-full py-3 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            Continue
          </button>

          {error && (
            <p className="text-center text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>
      </Modal>

      {/* Disable PIN Modal */}
      <Modal
        isOpen={showDisableModal}
        onClose={() => {
          setShowDisableModal(false);
          setCurrentPin("");
          setError(null);
        }}
        title="Disable App Lock"
      >
        <div className="space-y-6">
          <p className="text-center text-sm text-neutral-600">
            Enter your PIN to disable App Lock
          </p>

          <PinInput
            length={6}
            value={currentPin}
            onChange={setCurrentPin}
            error={!!error}
          />

          <button
            onClick={handleDisablePin}
            disabled={currentPin.length !== 6}
            className="w-full py-3 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            Disable App Lock
          </button>

          {error && (
            <p className="text-center text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>
      </Modal>

      {/* Biometric Enable Modal */}
      <Modal
        isOpen={showBiometricEnableModal}
        onClose={() => {
          setShowBiometricEnableModal(false);
          setBiometricError(null);
        }}
        title="Enable Biometric Unlock"
      >
        <div className="space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
              <Fingerprint className="w-8 h-8 text-neutral-700" />
            </div>
            <p className="text-sm text-neutral-600">
              You&apos;ll be prompted to verify with your device&apos;s biometric sensor 
              (Face ID, Touch ID, or fingerprint) to enable this feature.
            </p>
          </div>

          {biometricError && (
            <p className="text-center text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {biometricError}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setShowBiometricEnableModal(false)}
              className="flex-1 py-2.5 px-4 rounded-xl border border-neutral-200 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleEnableBiometric}
              className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      </Modal>

      {/* Hard Reset Confirmation Modal */}
      <Modal
        isOpen={showResetConfirm}
        onClose={() => {
          setShowResetConfirm(false);
          setError(null);
        }}
        title="Reset This Device?"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <strong>This cannot be undone.</strong>
              <p className="mt-1">
                Resetting will permanently delete your PIN, biometric settings, 
                and all local data including journals, check-ins, and sessions.
              </p>
            </div>
          </div>

          <p className="text-sm text-neutral-600">
            Only reset if you&apos;ve forgotten your PIN and can&apos;t access the app. 
            You will start fresh with a new anonymous ID.
          </p>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="flex-1 py-2.5 px-4 rounded-xl border border-neutral-200 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleHardReset}
              className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
            >
              Reset & Delete Data
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

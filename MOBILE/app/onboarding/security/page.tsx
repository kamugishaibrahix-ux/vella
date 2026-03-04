"use client";

import React, { useState, useEffect } from "react";
import { ProgressDots } from "@/components/onboarding/ProgressDots";
import { readFlag, writeFlag } from "@/lib/local/runtimeFlags";
import { useLockState } from "@/lib/security/lockState";
import {
  biometricsSupported,
  createBiometricCredential,
  enableBiometrics,
  biometricsEnabled,
} from "@/lib/security/biometrics";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#F2F3F4",
  cardPrimary: "#F8F8F8",
  cardSecondary: "#F8F8F8",
  border: "rgba(0,0,0,0.08)",
  title: "#0D0D0D",
  body: "#6B7177",
  muted: "#AAAFB5",
  chipEnabled: { bg: "#0D0D0D", text: "#FFFFFF" },
  chipDisabled: { bg: "rgba(0,0,0,0.07)", text: "#8A8F95" },
  chipRequires: { bg: "rgba(0,0,0,0.05)", text: "#AAAFB5" },
  actionBorder: "rgba(0,0,0,0.14)",
  actionText: "#111111",
  actionDanger: "#B83232",
  actionDangerBorder: "rgba(184,50,50,0.22)",
  dot: "#0D0D0D",
  dotEmpty: "#D8DADD",
  keyBg: "#FFFFFF",
  keyBorder: "rgba(0,0,0,0.10)",
  keyBackBg: "#EBEBED",
  success: "#2A6B47",
  error: "#B83232",
  shadowPrimary: "0 2px 8px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.06)",
  shadowSecondary: "0 1px 4px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.05)",
};

function proceed() {
  // Mark onboarding as complete (device-based, used by OnboardingGate).
  writeFlag("hasSeenOnboarding", "true");

  // Auto-enable trigger engine after onboarding, only if not already configured.
  // Sets a 7-day soft-start window for relaxed proposal thresholds.
  // readFlag / writeFlag are SSR-safe and try/catch-wrapped.
  if (readFlag("vella_trigger_engine_enabled") === null) {
    writeFlag("vella_trigger_engine_enabled", "true");
  }
  if (readFlag("vella_soft_start_until") === null) {
    writeFlag(
      "vella_soft_start_until",
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
  }
  window.location.href = "/home";
}

export default function OnboardingSecurityPage() {
  const { enabled, setNewPasscode, setEnabled } = useLockState();

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(true);

  // "idle" | "entering" | "confirming" | "saving" | "done"
  const [pinFlow, setPinFlow] = useState<"idle" | "entering" | "confirming" | "saving" | "done">("idle");
  const [firstPin, setFirstPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [ctaPressed, setCtaPressed] = useState(false);

  // Derived: passcode is active if the lock provider reports enabled OR we just completed setup
  const passcodeActive = enabled || pinFlow === "done";

  useEffect(() => {
    biometricsSupported().then((supported) => {
      setBiometricSupported(supported);
      if (supported) setBiometricOn(biometricsEnabled());
      setBiometricLoading(false);
    });
  }, []);

  // ── Passcode actions ──────────────────────────────────────────────────────

  function startSetPasscode() {
    setFirstPin("");
    setConfirmPin("");
    setPinError(null);
    setPinFlow("entering");
  }

  function removePasscode() {
    setEnabled(false);
    enableBiometrics(false);
    setBiometricOn(false);
    setPinFlow("idle");
  }

  async function handleConfirmPin(val: string) {
    if (val !== firstPin) {
      setPinError("Passcodes do not match. Please try again.");
      setConfirmPin("");
      return;
    }
    setPinFlow("saving");
    try {
      await setNewPasscode(firstPin);
      setPinFlow("done");
      setPinError(null);
    } catch {
      setPinError("Could not save passcode. Please try again.");
      setPinFlow("confirming");
    }
  }

  // ── Biometric actions ─────────────────────────────────────────────────────

  async function handleEnableBiometric() {
    if (!passcodeActive) return;
    const result = await createBiometricCredential();
    if (result.success) {
      enableBiometrics(true);
      setBiometricOn(true);
    }
  }

  function handleDisableBiometric() {
    enableBiometrics(false);
    setBiometricOn(false);
  }

  // ─────────────────────────────────────────────────────────────────────────

  const pinInputActive = pinFlow === "entering" || pinFlow === "confirming" || pinFlow === "saving";

  return (
    <div style={{
      backgroundColor: C.bg,
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      paddingLeft: 20,
      paddingRight: 20,
      paddingTop: 44,
      paddingBottom: 0,
      boxSizing: "border-box",
      overflow: "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 14 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
          stroke={C.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      <h1 style={{
        fontSize: 22, fontWeight: 600, color: C.title,
        letterSpacing: "-0.4px", lineHeight: 1.2,
        margin: 0, textAlign: "center",
      }}>
        Protect Your Space
      </h1>
      <p style={{
        fontSize: 13, fontWeight: 400, color: C.body,
        margin: 0, marginTop: 7, textAlign: "center", lineHeight: 1.45,
      }}>
        Add optional security to keep Vella private on this device.
      </p>

      {/* ═══ PASSCODE CARD ═══════════════════════════════════════════════════ */}
      <div style={{
        width: "100%",
        marginTop: 22,
        backgroundColor: C.cardPrimary,
        borderRadius: 20,
        padding: 20,
        boxSizing: "border-box",
        boxShadow: C.shadowPrimary,
      }}>

        {/* Card header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p style={{
              fontSize: 14, fontWeight: 600, color: C.title,
              margin: 0, lineHeight: 1.25, letterSpacing: "-0.1px",
            }}>
              Passcode Protection
            </p>
            <p style={{
              fontSize: 12, fontWeight: 400, color: C.body,
              margin: 0, marginTop: 3, lineHeight: 1.4,
            }}>
              Secure access to Vella on this device
            </p>
          </div>

          {/* Status chip */}
          {passcodeActive ? (
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.3px",
              color: C.chipEnabled.text, backgroundColor: C.chipEnabled.bg,
              borderRadius: 20, padding: "4px 11px", flexShrink: 0,
              marginLeft: 12, marginTop: 1,
            }}>
              Enabled
            </span>
          ) : (
            <span style={{
              fontSize: 11, fontWeight: 500, letterSpacing: "0.2px",
              color: C.chipDisabled.text, backgroundColor: C.chipDisabled.bg,
              borderRadius: 20, padding: "4px 11px", flexShrink: 0,
              marginLeft: 12, marginTop: 1,
            }}>
              Not set
            </span>
          )}
        </div>

        {/* ── Idle: show primary action ── */}
        {!passcodeActive && pinFlow === "idle" && (
          <button
            onClick={startSetPasscode}
            style={{
              display: "block",
              width: "100%",
              marginTop: 16,
              height: 42,
              borderRadius: 12,
              border: `1.5px solid ${C.actionBorder}`,
              backgroundColor: "transparent",
              fontSize: 13,
              fontWeight: 600,
              color: C.actionText,
              cursor: "pointer",
              letterSpacing: "-0.1px",
            }}
          >
            Set 6-digit passcode
          </button>
        )}

        {/* ── Enabled: change + remove actions ── */}
        {passcodeActive && pinFlow !== "entering" && pinFlow !== "confirming" && pinFlow !== "saving" && (
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              onClick={startSetPasscode}
              style={{
                flex: 1, height: 38, borderRadius: 10,
                border: `1.5px solid ${C.actionBorder}`,
                backgroundColor: "transparent",
                fontSize: 12, fontWeight: 600, color: C.actionText,
                cursor: "pointer", letterSpacing: "-0.1px",
              }}
            >
              Change passcode
            </button>
            <button
              onClick={removePasscode}
              style={{
                height: 38, padding: "0 16px", borderRadius: 10,
                border: `1.5px solid ${C.actionDangerBorder}`,
                backgroundColor: "transparent",
                fontSize: 12, fontWeight: 600, color: C.actionDanger,
                cursor: "pointer", letterSpacing: "-0.1px",
              }}
            >
              Remove
            </button>
          </div>
        )}

        {/* ── PIN input panel ── */}
        {pinInputActive && (
          <div style={{ marginTop: 20 }}>
            <PinPanel
              label="Enter 6-digit passcode"
              value={firstPin}
              length={6}
              disabled={pinFlow !== "entering"}
              dimmed={pinFlow !== "entering"}
              onChange={setFirstPin}
              onComplete={(v) => {
                setFirstPin(v);
                setPinFlow("confirming");
                setConfirmPin("");
              }}
            />

            {(pinFlow === "confirming" || pinFlow === "saving") && (
              <div style={{ marginTop: 20 }}>
                <PinPanel
                  label="Confirm passcode"
                  value={confirmPin}
                  length={6}
                  disabled={pinFlow === "saving"}
                  dimmed={false}
                  onChange={setConfirmPin}
                  onComplete={(v) => {
                    setConfirmPin(v);
                    handleConfirmPin(v);
                  }}
                />
                {pinError && (
                  <p style={{
                    fontSize: 11, fontWeight: 400, color: C.error,
                    margin: 0, marginTop: 10, lineHeight: 1.4,
                  }}>
                    {pinError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Success state ── */}
        {pinFlow === "done" && (
          <div style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              backgroundColor: C.success,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="10" height="7" viewBox="0 0 10 7" fill="none">
                <path d="M1 3L3.8 6L9 1" stroke="white" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p style={{ fontSize: 12, fontWeight: 500, color: C.success, margin: 0 }}>
              Passcode enabled.
            </p>
          </div>
        )}

        {/* ── Professional disclosure ── */}
        <p style={{
          fontSize: 11, fontWeight: 400, color: C.muted,
          margin: 0, marginTop: 16,
          lineHeight: 1.55, letterSpacing: "0.1px",
          borderTop: `1px solid ${C.border}`,
          paddingTop: 12,
        }}>
          If you forget your passcode, locally stored content cannot be recovered and will need to be reset.
        </p>
      </div>

      {/* ═══ BIOMETRICS CARD ════════════════════════════════════════════════ */}
      {!biometricLoading && biometricSupported && (
        <div style={{
          width: "100%",
          marginTop: 10,
          backgroundColor: C.cardSecondary,
          borderRadius: 20,
          padding: 20,
          boxSizing: "border-box",
          boxShadow: C.shadowSecondary,
          opacity: passcodeActive ? 1 : 0.65,
          transition: "opacity 200ms ease",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <p style={{
                fontSize: 14, fontWeight: 600, color: C.title,
                margin: 0, lineHeight: 1.25, letterSpacing: "-0.1px",
              }}>
                Biometric Authentication
              </p>
              <p style={{
                fontSize: 12, fontWeight: 400, color: C.body,
                margin: 0, marginTop: 3, lineHeight: 1.4,
              }}>
                {passcodeActive
                  ? "Unlock using your device biometrics"
                  : "Requires passcode to be set first"}
              </p>
            </div>

            {/* Status chip */}
            {!passcodeActive ? (
              <span style={{
                fontSize: 11, fontWeight: 500, letterSpacing: "0.2px",
                color: C.chipRequires.text, backgroundColor: C.chipRequires.bg,
                borderRadius: 20, padding: "4px 11px", flexShrink: 0,
                marginLeft: 12, marginTop: 1,
              }}>
                Requires passcode
              </span>
            ) : biometricOn ? (
              <span style={{
                fontSize: 11, fontWeight: 600, letterSpacing: "0.3px",
                color: C.chipEnabled.text, backgroundColor: C.chipEnabled.bg,
                borderRadius: 20, padding: "4px 11px", flexShrink: 0,
                marginLeft: 12, marginTop: 1,
              }}>
                Enabled
              </span>
            ) : (
              <span style={{
                fontSize: 11, fontWeight: 500, letterSpacing: "0.2px",
                color: C.chipDisabled.text, backgroundColor: C.chipDisabled.bg,
                borderRadius: 20, padding: "4px 11px", flexShrink: 0,
                marginLeft: 12, marginTop: 1,
              }}>
                Not set
              </span>
            )}
          </div>

          {/* Biometric action button */}
          {passcodeActive && (
            <div style={{ marginTop: 16 }}>
              {biometricOn ? (
                <button
                  onClick={handleDisableBiometric}
                  style={{
                    height: 38, padding: "0 16px", borderRadius: 10,
                    border: `1.5px solid ${C.actionDangerBorder}`,
                    backgroundColor: "transparent",
                    fontSize: 12, fontWeight: 600, color: C.actionDanger,
                    cursor: "pointer", letterSpacing: "-0.1px",
                  }}
                >
                  Disable biometric
                </button>
              ) : (
                <button
                  onClick={handleEnableBiometric}
                  style={{
                    height: 38, padding: "0 18px", borderRadius: 10,
                    border: `1.5px solid ${C.actionBorder}`,
                    backgroundColor: "transparent",
                    fontSize: 12, fontWeight: 600, color: C.actionText,
                    cursor: "pointer", letterSpacing: "-0.1px",
                  }}
                >
                  Enable biometric
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Enforcement line ── */}
      <p style={{
        fontSize: 11, fontWeight: 400, color: C.muted,
        margin: 0, marginTop: 14, textAlign: "center", lineHeight: 1.5,
      }}>
        Security settings apply only to this device.{" "}
        Deleting Vella data will remove local protection.
      </p>

      <div style={{ flex: 1, minHeight: 8 }} />

      {/* ── Primary CTA ── */}
      <div style={{ width: "85%", maxWidth: 320 }}>
        <button
          onClick={proceed}
          onMouseDown={() => setCtaPressed(true)}
          onMouseUp={() => setCtaPressed(false)}
          onMouseLeave={() => setCtaPressed(false)}
          onTouchStart={() => setCtaPressed(true)}
          onTouchEnd={() => setCtaPressed(false)}
          style={{
            backgroundColor: "#000000", color: "#ffffff",
            height: 48, borderRadius: 24, fontWeight: 600, fontSize: 16,
            width: "100%", border: "none", cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.10)", letterSpacing: "0.01em",
            transform: ctaPressed ? "scale(0.97)" : "scale(1)",
            transition: "transform 120ms ease",
          }}
        >
          Continue →
        </button>
      </div>

      {/* ── Skip ── */}
      <button
        onClick={proceed}
        style={{
          marginTop: 13, background: "none", border: "none",
          cursor: "pointer", fontSize: 13, fontWeight: 400,
          color: C.muted, padding: "4px 12px",
        }}
      >
        Skip for now
      </button>

      {/* ── Progress dots ── */}
      <div style={{ marginTop: 14 }}>
        <ProgressDots total={4} current={3} />
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── PinPanel ─────────────────────────────────────────────────────────────────
// Large circular dot indicators + clean numpad. No browser text input visible.

interface PinPanelProps {
  label: string;
  value: string;
  length: number;
  disabled: boolean;
  dimmed: boolean;
  onChange: (v: string) => void;
  onComplete: (v: string) => void;
}

function PinPanel({ label, value, length, disabled, dimmed, onChange, onComplete }: PinPanelProps) {
  function press(key: string) {
    if (disabled) return;
    if (key === "back") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    const next = value + key;
    onChange(next);
    if (next.length === length) onComplete(next);
  }

  const rows = [["1","2","3"],["4","5","6"],["7","8","9"],["","0","back"]];

  return (
    <div style={{ opacity: dimmed ? 0.45 : 1, transition: "opacity 180ms ease" }}>
      {/* Label */}
      <p style={{
        fontSize: 11, fontWeight: 500, color: "#8A8F95",
        margin: 0, marginBottom: 14,
        textTransform: "uppercase", letterSpacing: "0.6px",
      }}>
        {label}
      </p>

      {/* Dot indicators — large circles */}
      <div style={{ display: "flex", gap: 14, marginBottom: 20, justifyContent: "center" }}>
        {Array.from({ length }).map((_, i) => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: "50%",
            backgroundColor: i < value.length ? C.dot : C.dotEmpty,
            transition: "background-color 100ms ease",
            flexShrink: 0,
          }} />
        ))}
      </div>

      {/* Numpad */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "flex", gap: 8 }}>
            {row.map((key, ki) => (
              <button
                key={`${ri}-${ki}`}
                disabled={disabled || key === ""}
                onClick={() => press(key === "back" ? "back" : key)}
                style={{
                  width: 68, height: 44, borderRadius: 12,
                  border: key === "back" ? "none" : `1px solid ${C.keyBorder}`,
                  backgroundColor: key === ""
                    ? "transparent"
                    : key === "back"
                    ? C.keyBackBg
                    : C.keyBg,
                  fontSize: key === "back" ? 17 : 18,
                  fontWeight: key === "back" ? 400 : 500,
                  color: C.title,
                  cursor: key === "" ? "default" : "pointer",
                  visibility: key === "" ? "hidden" : "visible",
                  opacity: disabled ? 0.35 : 1,
                  boxShadow: key === "" || key === "back"
                    ? "none"
                    : "0 1px 2px rgba(0,0,0,0.06)",
                  letterSpacing: 0,
                }}
              >
                {key === "back" ? "⌫" : key}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

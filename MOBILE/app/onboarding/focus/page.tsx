"use client";

import React, { useEffect, useState } from "react";
import {
  type FocusDomain,
  DOMAIN_METADATA,
  getFocusAreas,
  saveFocusArea,
  removeFocusArea,
} from "@/lib/focusAreas";
import { ProgressDots } from "@/components/onboarding/ProgressDots";

const ORDERED_DOMAINS: FocusDomain[] = [
  "self-mastery",
  "emotional-intelligence",
  "performance-focus",
  "physical-health",
  "relationships",
  "identity-purpose",
  "financial-discipline",
  "addiction-recovery",
];

const MAX = 3;

export default function OnboardingFocusPage() {
  const [selected, setSelected] = useState<FocusDomain[]>([]);
  const [pressed, setPressed] = useState<FocusDomain | null>(null);

  useEffect(() => {
    const stored = getFocusAreas();
    setSelected(stored.map((a) => a.domain).slice(0, MAX));
  }, []);

  function toggle(domain: FocusDomain) {
    const isSelected = selected.includes(domain);
    if (!isSelected && selected.length >= MAX) return;

    if (isSelected) {
      setSelected((prev) => prev.filter((d) => d !== domain));
      removeFocusArea(domain);
    } else {
      setSelected((prev) => [...prev, domain]);
      saveFocusArea(domain);
    }
  }

  function handleContinue() {
    if (selected.length === 0) return;
    window.location.href = "/onboarding/privacy";
  }

  const ctaDisabled = selected.length === 0;

  return (
    <>
      <style>{`
        @keyframes ob-fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ob-tileIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ob-tile {
          transition: transform 140ms ease, border-color 140ms ease, background-color 140ms ease, opacity 140ms ease, box-shadow 140ms ease;
        }
      `}</style>

      <div
        style={{
          backgroundColor: "#F4F5F6",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: "6vh",
        }}
      >
        {/* Top spacer */}
        <div style={{ flex: 1 }} />

        {/* Content unit */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
            animation: "ob-fadeUp 320ms ease both",
          }}
        >
          {/* Title section with radial top-weight accent */}
          <div
            style={{
              background: "radial-gradient(circle at 50% 10%, rgba(0,0,0,0.03) 0%, rgba(244,245,246,1) 55%)",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingBottom: 4,
            }}
          >
            <h1
              style={{
                fontSize: 23,
                fontWeight: 600,
                color: "#1A1A1A",
                letterSpacing: "-0.3px",
                lineHeight: 1.2,
                margin: 0,
                textAlign: "center",
              }}
            >
              Where Should Vella Focus?
            </h1>
          </div>

          {/* Subtext */}
          <p
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: "#6B7075",
              lineHeight: 1.5,
              margin: 0,
              marginTop: 6,
              textAlign: "center",
            }}
          >
            Select up to three areas Vella should prioritise.
          </p>

          {/* Counter */}
          <p
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: "#8A8F95",
              margin: 0,
              marginTop: 18,
              letterSpacing: "0.2px",
            }}
          >
            {selected.length === 0 && "Choose up to three"}
            {selected.length === 1 && "Good start"}
            {selected.length === 2 && "Two aligned"}
            {selected.length === 3 && "Maximum selected"}
          </p>

          {/* Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              width: "100%",
              marginTop: 16,
              paddingLeft: 4,
              paddingRight: 4,
            }}
          >
            {ORDERED_DOMAINS.map((domain, i) => {
              const isSelected = selected.includes(domain);
              const isDisabled = !isSelected && selected.length >= MAX;
              const isPressed = pressed === domain;

              return (
                <button
                  key={domain}
                  className="ob-tile"
                  disabled={isDisabled}
                  onMouseDown={() => setPressed(domain)}
                  onMouseUp={() => setPressed(null)}
                  onMouseLeave={() => setPressed(null)}
                  onTouchStart={() => setPressed(domain)}
                  onTouchEnd={() => setPressed(null)}
                  onClick={() => toggle(domain)}
                  style={{
                    border: isSelected ? "1px solid #000000" : "1px solid #E3E5E8",
                    borderRadius: 16,
                    padding: "18px 12px",
                    backgroundColor: isSelected
                      ? "rgba(16, 92, 60, 0.05)"
                      : "rgba(255,255,255,0.5)",
                    backdropFilter: isSelected ? undefined : "blur(1px)",
                    boxShadow: isSelected
                      ? "0 4px 14px rgba(0,0,0,0.06)"
                      : "none",
                    cursor: isDisabled ? "default" : "pointer",
                    opacity: isDisabled ? 0.4 : 1,
                    pointerEvents: isDisabled ? "none" : "auto",
                    transform: isPressed
                      ? "scale(0.98)"
                      : isSelected
                      ? "translateY(-2px)"
                      : "translateY(0)",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    overflow: "hidden",
                    animation: `ob-tileIn 280ms ease ${i * 40}ms both`,
                  }}
                >
                  {/* Top accent line on selected */}
                  {isSelected && (
                    <span
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        backgroundColor: "#000000",
                        borderRadius: "0 0 2px 2px",
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: "#1A1A1A",
                      lineHeight: 1.3,
                    }}
                  >
                    {DOMAIN_METADATA[domain].label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* CTA */}
          <div
            style={{
              marginTop: 28,
              width: "85%",
              maxWidth: 320,
              animation: "ob-fadeUp 320ms ease 100ms both",
            }}
          >
            <button
              disabled={ctaDisabled}
              onClick={handleContinue}
              style={{
                backgroundColor: ctaDisabled ? "#CFCFCF" : "#000000",
                color: "#ffffff",
                height: 48,
                borderRadius: 24,
                fontWeight: 600,
                fontSize: 16,
                width: "100%",
                border: "none",
                cursor: ctaDisabled ? "default" : "pointer",
                boxShadow: ctaDisabled
                  ? "none"
                  : selected.length === MAX
                  ? "0 6px 18px rgba(0,0,0,0.12)"
                  : "0 4px 10px rgba(0, 0, 0, 0.08)",
                letterSpacing: "0.01em",
                transition: "transform 120ms ease, background-color 120ms ease, box-shadow 200ms ease",
              }}
            >
              Continue →
            </button>
          </div>
        </div>

        {/* Bottom spacer */}
        <div style={{ flex: 1 }} />

        {/* Progress dots */}
        <ProgressDots total={4} current={1} />

        {/* Bottom padding */}
        <div style={{ height: 24 }} />
      </div>
    </>
  );
}

"use client";

import React, { useState } from "react";
import { ProgressDots } from "@/components/onboarding/ProgressDots";

const SECTIONS = [
  {
    title: "Your content stays private",
    body: "Journal entries and saved reflections remain on your device.\nVella does not store your journal text on its servers.",
  },
  {
    title: "AI processing",
    body: "When you use chat or voice features, your messages are securely transmitted to our AI processing provider to generate responses.\nVella does not retain those messages on its servers.",
  },
  {
    title: "Limited server data",
    body: "We store only account information, subscription status, usage statistics, and structured behavioural signals.\nNo journal text or conversation transcripts are stored by Vella.",
  },
  {
    title: "No data selling",
    body: "We do not sell your data.\nWe do not publish your content.\nThere are no public feeds.",
  },
  {
    title: "Device responsibility",
    body: "Because journal content is stored locally, it is not automatically backed up.\nIf your device is lost or reset, your journal data may not be recoverable.",
  },
  {
    title: "Device passcode protection",
    body: "If you enable a passcode, access to Vella on this device will require that passcode.\nThe passcode is stored securely on your device and is not transmitted to our servers.\n\nIf you forget your passcode, locally stored content may not be recoverable.",
  },
];

export default function OnboardingPrivacyPage() {
  const [checked, setChecked] = useState(false);
  const [ctaPressed, setCtaPressed] = useState(false);

  function handleContinue() {
    if (!checked) return;
    window.location.href = "/onboarding/security";
  }

  const ctaDisabled = !checked;

  return (
    <>
      <style>{`
        .vella-scroll-box::-webkit-scrollbar {
          width: 4px;
        }
        .vella-scroll-box::-webkit-scrollbar-track {
          background: transparent;
        }
        .vella-scroll-box::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.12);
          border-radius: 4px;
        }
        .vella-scroll-box {
          scrollbar-width: thin;
          scrollbar-color: rgba(0,0,0,0.12) transparent;
        }
      `}</style>

      <div
        style={{
          backgroundColor: "#F4F5F6",
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
        }}
      >
        {/* Headline */}
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#1A1A1A",
            letterSpacing: "-0.3px",
            lineHeight: 1.2,
            margin: 0,
            textAlign: "center",
          }}
        >
          Privacy &amp; Data Handling
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: "#8A8F95",
            margin: 0,
            marginTop: 7,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          Please review before continuing.
        </p>

        {/* Scrollable disclosure window */}
        <div
          className="vella-scroll-box"
          style={{
            width: "100%",
            height: "47vh",
            marginTop: 20,
            backgroundColor: "#FAFAFA",
            borderRadius: 16,
            padding: 16,
            boxSizing: "border-box",
            overflowY: "auto",
            boxShadow: "0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)",
            flexShrink: 0,
          }}
        >
          {SECTIONS.map((section, i) => (
            <div
              key={i}
              style={{
                marginBottom: i < SECTIONS.length - 1 ? 20 : 0,
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#111111",
                  margin: 0,
                  marginBottom: 5,
                  lineHeight: 1.3,
                }}
              >
                {section.title}
              </p>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 400,
                  color: "#6B7177",
                  margin: 0,
                  lineHeight: 1.6,
                  whiteSpace: "pre-line",
                }}
              >
                {section.body}
              </p>
            </div>
          ))}
        </div>

        {/* Consent checkbox */}
        <div
          style={{
            marginTop: 24,
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 12,
            cursor: "pointer",
          }}
          onClick={() => setChecked((c) => !c)}
          role="checkbox"
          aria-checked={checked}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") setChecked((c) => !c);
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              border: checked ? "2px solid #000000" : "2px solid #C8CACD",
              backgroundColor: checked ? "#000000" : "transparent",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "border-color 140ms ease, background-color 140ms ease",
            }}
          >
            {checked && (
              <svg
                width="11"
                height="8"
                viewBox="0 0 11 8"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 3.5L4 6.5L10 1"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#1A1A1A",
              lineHeight: 1.4,
              userSelect: "none",
            }}
          >
            I have read and understand how Vella handles my data
          </span>
        </div>

        {/* Legal links */}
        <div
          style={{
            marginTop: 12,
            width: "100%",
            display: "flex",
            gap: 20,
          }}
        >
          <a
            href="https://vella.app/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "#8A8F95",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            Privacy Policy
          </a>
          <a
            href="https://vella.app/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "#8A8F95",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            Terms of Service
          </a>
        </div>

        {/* CTA Button */}
        <div
          style={{
            marginTop: 16,
            width: "85%",
            maxWidth: 320,
          }}
        >
          <button
            disabled={ctaDisabled}
            onClick={handleContinue}
            onMouseDown={() => setCtaPressed(true)}
            onMouseUp={() => setCtaPressed(false)}
            onMouseLeave={() => setCtaPressed(false)}
            onTouchStart={() => setCtaPressed(true)}
            onTouchEnd={() => setCtaPressed(false)}
            style={{
              backgroundColor: "#000000",
              color: "#ffffff",
              height: 48,
              borderRadius: 24,
              fontWeight: 600,
              fontSize: 16,
              width: "100%",
              border: "none",
              cursor: ctaDisabled ? "default" : "pointer",
              opacity: ctaDisabled ? 0.5 : 1,
              boxShadow: ctaDisabled ? "none" : "0 4px 10px rgba(0,0,0,0.08)",
              letterSpacing: "0.01em",
              transform: ctaPressed && !ctaDisabled ? "scale(0.97)" : "scale(1)",
              transition:
                "transform 120ms ease, opacity 140ms ease, box-shadow 140ms ease",
            }}
          >
            Continue →
          </button>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, minHeight: 8 }} />

        {/* Progress dots */}
        <ProgressDots total={4} current={2} />

        {/* Bottom padding */}
        <div style={{ height: 24 }} />
      </div>
    </>
  );
}

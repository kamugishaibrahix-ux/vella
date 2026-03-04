"use client";

import React from "react";
import Image from "next/image";
import { ProgressDots } from "@/components/onboarding/ProgressDots";
import { PrimaryButton } from "@/components/onboarding/PrimaryButton";

const fadeIn: React.CSSProperties = {
  animation: "ob-fadeUp 320ms ease both",
};

const fadeInDelayed: React.CSSProperties = {
  animation: "ob-fadeUp 320ms ease 100ms both",
};

export default function OnboardingWelcomePage() {

  return (
    <>
      <style>{`
        @keyframes ob-fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    <div
      style={{
        background: "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.25) 40%, rgba(244,245,246,1) 70%)",
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

      {/* Centered content unit: logo + text + CTA */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >

        {/* Logo */}
        <Image
          src="/icons/icon-192.png"
          alt="Vella logo"
          width={100}
          height={100}
          className="rounded-xl"
          style={fadeIn}
        />

        {/* Brand Name */}
        <h1
          style={{
            ...fadeIn,
            fontSize: 30,
            fontWeight: 600,
            color: "#1A1A1A",
            letterSpacing: "-0.5px",
            lineHeight: 1.1,
            margin: 0,
            marginTop: 20,
          }}
        >
          Vella
        </h1>

        {/* Tagline */}
        <p
          style={{
            ...fadeIn,
            fontSize: 17,
            fontWeight: 400,
            color: "#5F6368",
            lineHeight: 1.4,
            margin: 0,
            marginTop: 6,
          }}
        >
          Your Life Compass
        </p>

        {/* Micro Clarifier */}
        <p
          style={{
            ...fadeIn,
            fontSize: 13,
            fontWeight: 400,
            color: "#8A8F95",
            letterSpacing: "1.2px",
            lineHeight: 1.4,
            margin: 0,
            marginTop: 14,
          }}
        >
          Direction&nbsp;&nbsp;•&nbsp;&nbsp;Clarity&nbsp;&nbsp;•&nbsp;&nbsp;Alignment
        </p>

        {/* CTA Button */}
        <div style={{ ...fadeInDelayed, marginTop: 28, width: "85%", maxWidth: 320 }}>
          <PrimaryButton
            label="Begin →"
            onClick={() => { window.location.href = "/onboarding/focus"; }}
          />
        </div>
      </div>

      {/* Small spacer */}
      <div style={{ flex: 1 }} />

      {/* Progress Dots */}
      <ProgressDots total={4} current={0} />

      {/* Bottom padding */}
      <div style={{ height: 24 }} />
    </div>
    </>
  );
}

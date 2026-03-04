"use client";

import { useMemo, useState, useEffect, useCallback } from "react";

// Animation variant: "lighter" | "same" | "heavier"
export type MorningLanding = "lighter" | "same" | "heavier";

interface LandingSignatureProps {
  landing: MorningLanding;
  onTap?: () => void;
}

// Mood-specific colors - muted, desaturated tones
const moodColors = {
  lighter: "#2D5A4A",   // Deep forest / emerald
  same: "#4A4A48",      // Graphite / muted charcoal
  heavier: "#5A4A5C",   // Deep desaturated plum / slate
} as const;

// Display font for signature - using system serif stack
const signatureFont = '"Playfair Display", "Libre Baskerville", "Georgia", "Times New Roman", serif';

// UI font for hint
const uiFont = '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif';

// Daily responses per mood - designed for 2 lines max
const lighterResponses = [
  "Something's flowing.\nWhat's behind it?",
  "I like that.\nWhat shifted?",
  "Hold onto that.\nWant to unpack it?",
  "That energy changes\nthe whole day.",
];

const sameResponses = [
  "Steady.\nAnything beneath?",
  "Neutral days\nsay something.",
  "Nothing dramatic.\nOr something subtle?",
  "Want to check\na little deeper?",
];

const heavierResponses = [
  "What's weighing\non you?",
  "Something feels off.\nI'm here.",
  "Let's take it slow.\nWhat happened?",
  "We can sit\nwith it a minute.",
];

function dateHash(date: string): number {
  let hash = 0;
  for (let i = 0; i < date.length; i++) {
    hash = ((hash << 5) - hash) + date.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getResponseForDate(landing: MorningLanding, date: string): string {
  const hash = dateHash(date);
  switch (landing) {
    case "lighter":
      return lighterResponses[hash % lighterResponses.length];
    case "same":
      return sameResponses[hash % sameResponses.length];
    case "heavier":
      return heavierResponses[hash % heavierResponses.length];
  }
}

// Split response by newline for multi-line rendering
function splitLines(text: string): string[] {
  return text.split("\n");
}

// ========== CINEMATIC ANIMATION VARIANTS ==========

// Lighter: Fade + upward drift (600ms), blur to sharp (4px → 0)
function LighterReveal({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const lines = splitLines(text);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span
      style={{
        display: "block",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        filter: visible ? "blur(0px)" : "blur(4px)",
        transition: "opacity 600ms ease-out, transform 600ms ease-out, filter 600ms ease-out",
        lineHeight: 1.45,
      }}
    >
      {lines.map((line, i) => (
        <span key={i} style={{ display: "block" }}>
          {line}
        </span>
      ))}
    </span>
  );
}

// Same: 500ms fade only, no movement
function SameReveal({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const lines = splitLines(text);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span
      style={{
        display: "block",
        opacity: visible ? 1 : 0,
        transition: "opacity 500ms ease-out",
        lineHeight: 1.45,
      }}
    >
      {lines.map((line, i) => (
        <span key={i} style={{ display: "block" }}>
          {line}
        </span>
      ))}
    </span>
  );
}

// Heavier: Line-by-line reveal, 250ms stagger, slight downward settle
function HeavierReveal({ text }: { text: string }) {
  const lines = splitLines(text);
  const [visibleLines, setVisibleLines] = useState<boolean[]>(new Array(lines.length).fill(false));

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    const staggerMs = 250;

    lines.forEach((_, i) => {
      const timer = setTimeout(() => {
        setVisibleLines((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, i * staggerMs + 50);
      timers.push(timer);
    });

    return () => timers.forEach(clearTimeout);
  }, [lines]);

  return (
    <span style={{ display: "block", lineHeight: 1.45 }}>
      {lines.map((line, i) => (
        <span
          key={i}
          style={{
            display: "block",
            opacity: visibleLines[i] ? 1 : 0,
            transform: visibleLines[i] ? "translateY(0)" : "translateY(-6px)",
            transition: "opacity 400ms ease-out, transform 400ms ease-out",
          }}
        >
          {line}
        </span>
      ))}
    </span>
  );
}

// ========== MAIN COMPONENT ==========

export function LandingSignature({ landing, onTap }: LandingSignatureProps) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const response = useMemo(() => getResponseForDate(landing, today), [landing, today]);
  const [isPressed, setIsPressed] = useState(false);

  const color = moodColors[landing];

  const handlePointerDown = useCallback(() => setIsPressed(true), []);
  const handlePointerUp = useCallback(() => setIsPressed(false), []);
  const handlePointerLeave = useCallback(() => setIsPressed(false), []);

  return (
    <div
      onClick={onTap}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      style={{
        width: "100%",
        padding: "48px 24px",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        textAlign: "center",
        transform: isPressed ? "scale(0.96)" : "scale(1)",
        transition: "transform 150ms ease-out",
      }}
    >
      {/* Main signature text - serif, cinematic */}
      <p
        style={{
          fontFamily: signatureFont,
          fontSize: "clamp(22px, 5.5vw, 24px)",
          fontWeight: 600,
          color: color,
          margin: 0,
          lineHeight: 1.45,
          letterSpacing: "-0.3px",
          fontStyle: "italic",
        }}
      >
        {landing === "lighter" && <LighterReveal text={response} />}
        {landing === "same" && <SameReveal text={response} />}
        {landing === "heavier" && <HeavierReveal text={response} />}
      </p>

      {/* Subtle hint */}
      <p
        style={{
          fontFamily: uiFont,
          fontSize: "13px",
          fontWeight: 400,
          color: color,
          margin: "20px 0 0",
          opacity: 0.5,
          letterSpacing: "0.02em",
        }}
      >
        Tap to talk
      </p>
    </div>
  );
}

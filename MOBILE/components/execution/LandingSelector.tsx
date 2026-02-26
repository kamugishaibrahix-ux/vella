"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LandingSignature, type MorningLanding } from "./LandingSignature";

const T = {
  card: "#F4F3F0",
  secondary: "#6B6A66",
  tertiary: "#9B9A96",
  divider: "#E2E1DD",
  forest: "#3D5E4E",
  terracotta: "#7A4F3E",
  shadow: "0 1px 3px rgba(0,0,0,0.05)",
  dmSans: '"DM Sans", sans-serif',
} as const;

const LANDING_KEY = "vella-landing-v2";

interface LandingState {
  date: string;
  landing: MorningLanding;
  consecutiveHeavierCount?: number;
}

export function getLandingForToday(): MorningLanding | null {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const stored = localStorage.getItem(LANDING_KEY);
    if (!stored) return null;
    const data: LandingState = JSON.parse(stored);
    return data.date === today ? data.landing : null;
  } catch {
    return null;
  }
}

export function getLandingState(): LandingState | null {
  try {
    const stored = localStorage.getItem(LANDING_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function LandingSelector() {
  const router = useRouter();
  const [selected, setSelected] = useState<MorningLanding | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = getLandingForToday();
    if (saved) {
      setSelected(saved);
    }
    setLoaded(true);
  }, []);

  const handleSelect = (landing: MorningLanding) => {
    setIsAnimating(true);

    const today = new Date().toISOString().slice(0, 10);
    const prevState = getLandingState();

    // Calculate consecutive heavier count for future escalation
    let consecutiveHeavierCount = 0;
    if (landing === "heavier") {
      if (prevState?.landing === "heavier" && prevState?.consecutiveHeavierCount) {
        consecutiveHeavierCount = prevState.consecutiveHeavierCount + 1;
      } else {
        consecutiveHeavierCount = 1;
      }
    }

    const state: LandingState = {
      date: today,
      landing,
      consecutiveHeavierCount,
    };

    localStorage.setItem(LANDING_KEY, JSON.stringify(state));

    setTimeout(() => {
      setSelected(landing);
      setIsAnimating(false);
    }, 300);
  };

  const handleTapResponse = () => {
    router.push("/session");
  };

  if (!loaded) return null;

  // Show signature if already selected today
  if (selected) {
    return <LandingSignature landing={selected} onTap={handleTapResponse} />;
  }

  // Selector UI
  const options: { key: MorningLanding; label: string; symbol: string }[] = [
    { key: "lighter", label: "Lighter", symbol: "↑" },
    { key: "same", label: "Same", symbol: "—" },
    { key: "heavier", label: "Heavier", symbol: "↓" },
  ];

  const selectorStyle = {
    background: T.card,
    borderRadius: 14,
    padding: "20px",
    boxShadow: T.shadow,
    opacity: isAnimating ? 0 : 1,
    transform: isAnimating ? "translateY(-10px)" : "translateY(0)",
    transition: "opacity 300ms ease-out, transform 300ms ease-out",
  };

  return (
    <section style={selectorStyle}>
      <p
        style={{
          fontFamily: T.dmSans,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: T.tertiary,
          margin: "0 0 14px",
          textTransform: "uppercase",
        }}
      >
        HOW ARE YOU LANDING TODAY?
      </p>

      <div style={{ display: "flex", gap: 10 }}>
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => handleSelect(opt.key)}
            disabled={isAnimating}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "14px 10px",
              background: "white",
              border: `2px solid ${T.divider}`,
              borderRadius: 10,
              cursor: isAnimating ? "default" : "pointer",
              transition: "all 0.2s ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span
              style={{
                fontFamily: T.dmSans,
                fontSize: 18,
                fontWeight: 600,
                color: opt.key === "lighter" ? T.forest : opt.key === "heavier" ? T.terracotta : T.secondary,
              }}
            >
              {opt.symbol}
            </span>
            <span
              style={{
                fontFamily: T.dmSans,
                fontSize: 12,
                fontWeight: 500,
                color: T.secondary,
              }}
            >
              {opt.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  safelist: [
    "voice-bubble",
    "voice-bubble--active",
    "voice-bubble--listening",
    "voice-bubble-wave",
    "animate-voice-breathe",
    "animate-voice-ring",
  ],
  theme: {
    extend: {
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
      },
      colors: {
        vella: {
          bg: "var(--vella-bg)",
          "bg-card": "var(--vella-bg-card)",
          border: "var(--vella-border)",
          text: "var(--vella-text)",
          muted: "var(--vella-muted)",
          "muted-strong": "var(--vella-muted-strong)",
          primary: "var(--vella-primary)",
          "primary-hover": "var(--vella-primary-hover)",
          "primary-active": "var(--vella-primary-active)",
          "primary-muted": "var(--vella-primary-muted)",
          accent: "var(--vella-accent)",
          "accent-soft": "var(--vella-accent-soft)",
          "accent-muted": "var(--vella-accent-muted)",
        },
        mc: {
          bg: {
            DEFAULT: "var(--mc-bg)",
            soft: "var(--mc-bg-soft)",
            deep: "var(--mc-bg-elevated)",
          },
          card: "var(--mc-card)",
          card2: "var(--mc-card-soft)",
          border: "var(--mc-border)",
          borderSoft: "var(--mc-border-soft)",
          text: {
            DEFAULT: "var(--mc-text)",
            muted: "var(--mc-muted)",
            subtle: "var(--mc-muted-strong)",
          },
          primary: {
            DEFAULT: "var(--mc-primary)",
            glow: "var(--mc-primary-glow)",
            soft: "var(--mc-primary-soft)",
            dark: "var(--mc-primary-dark)",
          },
        },
      },
      borderRadius: {
        "vella-card": "var(--vella-radius-card)",
        "vella-button": "var(--vella-radius-button)",
        xl: "18px",
        "2xl": "28px",
      },
      boxShadow: {
        "vella-soft": "var(--vella-elevation)",
        "vella-hover": "var(--vella-elevation-hover)",
        soft: "var(--vella-elevation)",
        elevated: "0 4px 12px rgba(0, 0, 0, 0.08)",
        glow: "0 0 14px rgba(49,232,201,0.4)",
        innerGlow: "inset 0 0 12px rgba(49,232,201,0.15)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      keyframes: {
        "compass-pulse": {
          "0%": { transform: "scale(0.9)", opacity: "0.8" },
          "70%": { transform: "scale(1.15)", opacity: "0.3" },
          "100%": { transform: "scale(1.25)", opacity: "0" },
        },
        "sheet-rise": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(150%)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "ping-slow": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "70%": { transform: "scale(1.6)", opacity: "0" },
          "100%": { opacity: "0" },
        },
        successPulse: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "50%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(1.3)", opacity: "0" },
        },
        "scale-in": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "50%": { transform: "scale(1.1)", opacity: "0.8" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "compass-pulse": "compass-pulse 1.8s ease-in-out infinite",
        "sheet-rise": "sheet-rise 0.3s ease-out forwards",
        fadeIn: "fadeIn 0.6s ease-out forwards",
        shimmer: "shimmer 2.5s linear infinite",
        "spin-slow": "spin-slow 6s linear infinite",
        "ping-slow": "ping-slow 2.4s ease-out infinite",
        successPulse: "successPulse 1s ease-out",
        "scale-in": "scale-in 0.3s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;


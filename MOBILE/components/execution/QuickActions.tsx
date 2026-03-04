"use client";

const T = {
  bg: "#FAFAF8",
  card: "#F4F3F0",
  text: "#1E1D1B",
  secondary: "#6B6A66",
  tertiary: "#9B9A96",
  forest: "#3D5E4E",
  forestLight: "#EBF2EE",
  shadow: "0 1px 3px rgba(0,0,0,0.05)",
  dmSans: '"DM Sans", sans-serif',
} as const;

interface QuickActionsProps {
  onOpenLibrary: () => void;
  onOpenFocusAreas: () => void;
  budgetLine?: { focus: string; decisions: string };
}

export function QuickActions({ onOpenLibrary, onOpenFocusAreas, budgetLine }: QuickActionsProps) {
  return (
    <section>
      <p
        style={{
          fontFamily: T.dmSans,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: T.tertiary,
          margin: "0 0 12px",
          textTransform: "uppercase",
        }}
      >
        QUICK ACTIONS
      </p>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onOpenLibrary}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: 44,
            padding: "0 16px",
            background: T.forest,
            color: "white",
            border: "none",
            borderRadius: 10,
            fontFamily: T.dmSans,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <span>Mind & Body</span>
        </button>

        <button
          onClick={onOpenFocusAreas}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: 44,
            padding: "0 16px",
            background: "white",
            color: T.forest,
            border: `2px solid ${T.forest}`,
            borderRadius: 10,
            fontFamily: T.dmSans,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <span>Focus Areas</span>
        </button>
      </div>

      {budgetLine && (
        <div style={{ marginTop: 12 }}>
          <p
            style={{
              fontFamily: T.dmSans,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: T.tertiary,
              margin: "0 0 3px",
            }}
          >
            Today&apos;s Capacity
          </p>
          <p
            style={{
              fontFamily: T.dmSans,
              fontSize: 12,
              color: T.secondary,
              margin: 0,
            }}
          >
            Focus: {budgetLine.focus} · Decisions: {budgetLine.decisions}
          </p>
        </div>
      )}
    </section>
  );
}

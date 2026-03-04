"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DomainStress {
  health: number;
  financial: number;
  cognitive: number;
  behavioural: number;
  governance: number;
}

interface SystemHealthData {
  globalStabilityScore: number;
  dominantRiskDomain: string;
  focusCapacity: number;
  decisionCapacity: number;
  recoveryRequired: boolean;
  domainStress: DomainStress;
  phase?: string;
}

interface SystemHealthPanelProps {
  isOpen: boolean;
  onClose: () => void;
  systemHealth: SystemHealthData | null;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Design Tokens
// ---------------------------------------------------------------------------

const T = {
  bg: "#FAFAF8",
  card: "rgba(255, 255, 255, 0.92)",
  text: "#1E1D1B",
  secondary: "#6B6A66",
  tertiary: "#9B9A96",
  divider: "#EEEDEA",
  emerald: "#1E8E5A",
  gold: "#B38B2D",
  amber: "#C86F2D",
  danger: "#8F2E2E",
  muted: "#C8C7C2",
  barBg: "#F0EFEC",
  dmSans: '"DM Sans", sans-serif',
} as const;

const DOMAIN_LABELS: Record<string, string> = {
  health: "Health",
  financial: "Financial",
  cognitive: "Cognitive",
  behavioural: "Behavioural",
  governance: "Governance",
};

const PRESSURE_EXPLANATIONS: Record<string, string> = {
  health: "Elevated stress indicators in physical health metrics.",
  financial: "Financial stress index above normal operating range.",
  cognitive: "Decision quality and cognitive load require attention.",
  behavioural: "Behavioural consistency has dropped below baseline.",
  governance: "Governance risk score indicates elevated exposure.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScoreColor(score: number): string {
  if (score >= 80) return T.emerald;
  if (score >= 60) return T.gold;
  if (score >= 40) return T.amber;
  return T.danger;
}

function getStressColor(stress: number): string {
  if (stress >= 70) return T.danger;
  if (stress >= 50) return T.amber;
  if (stress >= 30) return T.gold;
  return T.emerald;
}

function formatDomainName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " ");
}

function getDecisionLevel(capacity: number): string {
  if (capacity >= 70) return "High";
  if (capacity >= 40) return "Medium";
  return "Low";
}

function getTrendIndicator(score: number): { label: string; arrow: string; color: string } {
  if (score >= 70) return { label: "Improving", arrow: "↑", color: T.emerald };
  if (score >= 40) return { label: "Stable", arrow: "→", color: T.secondary };
  return { label: "Declining", arrow: "↓", color: T.danger };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: T.dmSans,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: T.tertiary,
        margin: "0 0 8px",
      }}
    >
      {children}
    </p>
  );
}

function Shimmer({ w, h, style }: { w?: number | string; h?: number; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        width: w ?? "100%",
        height: h ?? 14,
        borderRadius: 4,
        background: "linear-gradient(90deg, #EEEDEA 25%, #F4F3F0 50%, #EEEDEA 75%)",
        backgroundSize: "200% 100%",
        animation: "stabilityShimmer 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function CapacityRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <span style={{ fontFamily: T.dmSans, fontSize: 12, color: T.secondary }}>{label}</span>
      <span style={{ fontFamily: T.dmSans, fontSize: 12, fontWeight: 600, color: T.text }}>{value}</span>
    </div>
  );
}

function DomainCell({ name, stress }: { name: string; stress: number }) {
  const isInactive = stress < 15;
  const barColor = getStressColor(stress);
  return (
    <div style={{ opacity: isInactive ? 0.45 : 1, transition: "opacity 200ms ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontFamily: T.dmSans, fontSize: 12, color: isInactive ? T.tertiary : T.text }}>
          {DOMAIN_LABELS[name] ?? name}
        </span>
        <span style={{ fontFamily: T.dmSans, fontSize: 11, fontWeight: 500, color: barColor }}>
          {stress}%
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: T.barBg, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(stress, 100)}%`,
            borderRadius: 2,
            background: barColor,
            transition: "width 0.4s ease-out",
          }}
        />
      </div>
    </div>
  );
}

function DomainCellEmpty({ label }: { label: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontFamily: T.dmSans, fontSize: 12, color: T.tertiary }}>
          {label}
        </span>
        <span style={{ fontFamily: T.dmSans, fontSize: 11, fontWeight: 500, color: T.muted }}>
          —
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: T.barBg, overflow: "hidden" }}>
        <div style={{ height: "100%", width: "0%", borderRadius: 2, background: T.muted }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SystemHealthPanel({
  isOpen,
  onClose,
  systemHealth,
  isLoading,
}: SystemHealthPanelProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 280);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  const hasData = systemHealth !== null && systemHealth.globalStabilityScore > 0;
  const score = systemHealth?.globalStabilityScore ?? 0;
  const scoreColor = hasData ? getScoreColor(score) : T.muted;
  const trend = hasData ? getTrendIndicator(score) : null;
  const dominantDomain = systemHealth?.dominantRiskDomain ?? "none";
  const hasPressure = hasData && dominantDomain !== "none";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.24)",
          opacity: isOpen ? 1 : 0,
          transition: "opacity 280ms ease-out",
          zIndex: 100,
        }}
      />

      {/* Floating Card */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: isOpen
            ? "translate(-50%, -50%) scale(1)"
            : "translate(-50%, -48%) scale(0.96)",
          opacity: isOpen ? 1 : 0,
          width: "90vw",
          maxWidth: 400,
          maxHeight: "70vh",
          overflow: "auto",
          background: T.card,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: 20,
          padding: "22px 20px 18px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.10), 0 2px 12px rgba(0,0,0,0.04)",
          transition: "transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 280ms ease-out",
          zIndex: 101,
          scrollbarWidth: "none" as const,
        }}
      >
        {/* ── Top: Score + Label + Subtext + Trend ── */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          {isLoading ? (
            <Shimmer w={64} h={40} style={{ margin: "0 auto 6px" }} />
          ) : hasData ? (
            <div
              style={{
                fontFamily: T.dmSans,
                fontSize: 42,
                fontWeight: 700,
                color: scoreColor,
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              {score}%
            </div>
          ) : (
            <div
              style={{
                fontFamily: T.dmSans,
                fontSize: 42,
                fontWeight: 700,
                color: T.muted,
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              —
            </div>
          )}
          <div
            style={{
              fontFamily: T.dmSans,
              fontSize: 13,
              fontWeight: 600,
              color: T.text,
              marginTop: 5,
            }}
          >
            Stability
          </div>
          <div
            style={{
              fontFamily: T.dmSans,
              fontSize: 11,
              color: T.secondary,
              marginTop: 2,
            }}
          >
            {hasData
              ? "Overall regulation across active domains."
              : "Awaiting initial computation."}
          </div>
          {trend && (
            <div
              style={{
                fontFamily: T.dmSans,
                fontSize: 11,
                fontWeight: 500,
                color: trend.color,
                marginTop: 6,
              }}
            >
              {trend.arrow} {trend.label} (last 24h)
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: T.divider, margin: "0 0 14px" }} />

        {/* ── Domain Grid (2-column) ── */}
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>Domain Breakdown</SectionLabel>
          {isLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px" }}>
              <Shimmer h={28} /> <Shimmer h={28} />
              <Shimmer h={28} /> <Shimmer h={28} />
            </div>
          ) : hasData ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
              {Object.entries(systemHealth.domainStress).map(([domain, stress]) => (
                <DomainCell key={domain} name={domain} stress={stress} />
              ))}
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
                <DomainCellEmpty label="Health" />
                <DomainCellEmpty label="Finance" />
                <DomainCellEmpty label="Cognitive" />
                <DomainCellEmpty label="Behavioural" />
              </div>
              <p style={{ fontFamily: T.dmSans, fontSize: 11, color: T.tertiary, margin: "8px 0 0", fontStyle: "italic" }}>
                System calibrating.
              </p>
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: T.divider, margin: "0 0 14px" }} />

        {/* ── Primary Pressure ── */}
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>Primary Pressure</SectionLabel>
          {isLoading ? (
            <Shimmer h={16} />
          ) : hasPressure ? (
            <>
              <div
                style={{
                  fontFamily: T.dmSans,
                  fontSize: 13,
                  color: T.amber,
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                {formatDomainName(dominantDomain)}
              </div>
              <div
                style={{
                  fontFamily: T.dmSans,
                  fontSize: 11,
                  color: T.secondary,
                  lineHeight: 1.4,
                }}
              >
                {PRESSURE_EXPLANATIONS[dominantDomain] ?? "Elevated stress detected in this domain."}
              </div>
            </>
          ) : (
            <div style={{ fontFamily: T.dmSans, fontSize: 12, color: T.emerald, fontWeight: 500 }}>
              No elevated pressure detected.
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 1, background: T.divider, margin: "0 0 14px" }} />

        {/* ── Capacity Snapshot ── */}
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>Capacity Snapshot</SectionLabel>
          {isLoading ? (
            <>
              <Shimmer h={14} style={{ marginBottom: 6 }} />
              <Shimmer h={14} style={{ marginBottom: 6 }} />
              <Shimmer h={14} />
            </>
          ) : hasData ? (
            <div>
              <CapacityRow label="Focus Capacity" value={`${systemHealth.focusCapacity}m`} />
              <CapacityRow label="Decision Capacity" value={getDecisionLevel(systemHealth.decisionCapacity)} />
              <CapacityRow label="Recovery Required" value={systemHealth.recoveryRequired ? "Active" : "None"} />
            </div>
          ) : (
            <p style={{ fontFamily: T.dmSans, fontSize: 12, color: T.tertiary, margin: 0 }}>
              Awaiting capacity data.
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 10,
            borderTop: `1px solid ${T.divider}`,
          }}
        >
          <span style={{ fontFamily: T.dmSans, fontSize: 10, color: T.muted }}>
            {hasData ? "Updated just now" : "Awaiting data"}
          </span>
          <span style={{ fontFamily: T.dmSans, fontSize: 10, color: T.muted }}>
            {hasData ? `Confidence: ${Math.min(Math.round(score * 0.9 + 10), 100)}%` : ""}
          </span>
        </div>
      </div>

      {/* Shimmer keyframe */}
      <style>{`
        @keyframes stabilityShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  );
}

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

interface StabilityData {
  globalStabilityScore: number;
  dominantRiskDomain: string;
  focusCapacity: number;
  decisionCapacity: number;
  recoveryRequired: boolean;
  domainStress: DomainStress;
  trend?: "improving" | "stable" | "declining";
}

interface StabilityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  systemHealth: StabilityData | null;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Design Tokens - Professional Muted Palette
// ---------------------------------------------------------------------------

const T = {
  bg: "#FAFAF8",
  card: "#FFFFFF",
  text: "#1E1D1B",
  secondary: "#6B6A66",
  tertiary: "#9B9A96",
  divider: "#E8E7E4",
  emerald: "#1E8E5A",
  gold: "#B38B2D",
  amber: "#C86F2D",
  red: "#8F2E2E",
  dmSans: '"DM Sans", sans-serif',
} as const;

const DOMAIN_LABELS: Record<string, string> = {
  health: "Health",
  financial: "Financial",
  cognitive: "Cognitive",
  behavioural: "Behavioural",
  governance: "Governance",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StabilityPanel({ isOpen, onClose, systemHealth, isLoading }: StabilityPanelProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  const score = systemHealth?.globalStabilityScore ?? 0;
  const scoreColor = getScoreColor(score);
  const hasValidScore = score >= 10;

  const decisionCapacity = systemHealth?.decisionCapacity ?? 0;
  const decisionLevel = decisionCapacity >= 80 ? "High" : decisionCapacity >= 50 ? "Medium" : "Low";
  const recoveryHours = systemHealth?.recoveryRequired ? 8 : 0;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.32)",
          opacity: isOpen ? 1 : 0,
          transition: "opacity 300ms ease-out",
          zIndex: 100,
        }}
      />

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: T.card,
          borderRadius: "16px 16px 0 0",
          padding: "20px 20px 28px",
          transform: isOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          zIndex: 101,
          maxHeight: "75vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.08)",
        }}
      >
        <div
          onClick={onClose}
          style={{
            width: 36,
            height: 4,
            background: T.divider,
            borderRadius: 2,
            margin: "0 auto 16px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        />

        <div style={{ overflow: "auto", flex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            {isLoading || !hasValidScore ? (
              <SkeletonShimmer width={80} height={48} style={{ margin: "0 auto 8px" }} />
            ) : (
              <div
                style={{
                  fontFamily: T.dmSans,
                  fontSize: 44,
                  fontWeight: 700,
                  color: scoreColor,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                {score}%
              </div>
            )}
            <div
              style={{
                fontFamily: T.dmSans,
                fontSize: 15,
                fontWeight: 600,
                color: T.text,
                marginTop: 6,
              }}
            >
              Stability
            </div>
            <div
              style={{
                fontFamily: T.dmSans,
                fontSize: 12,
                color: T.secondary,
                marginTop: 4,
                lineHeight: 1.4,
              }}
            >
              Your overall regulation across active domains.
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <SectionTitle>Domain Breakdown</SectionTitle>
            {isLoading ? (
              <>
                <SkeletonShimmer height={32} style={{ marginBottom: 6 }} />
                <SkeletonShimmer height={32} style={{ marginBottom: 6 }} />
                <SkeletonShimmer height={32} style={{ marginBottom: 6 }} />
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(systemHealth?.domainStress ?? {}).map(([domain, stress]) => {
                  const isInactive = stress < 20;
                  return (
                    <div
                      key={domain}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        background: isInactive ? "transparent" : "#F8F8F6",
                        borderRadius: 6,
                        opacity: isInactive ? 0.5 : 1,
                        transition: "opacity 200ms ease",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: T.dmSans,
                          fontSize: 13,
                          color: isInactive ? T.tertiary : T.text,
                        }}
                      >
                        {DOMAIN_LABELS[domain] ?? domain}
                      </span>
                      <span
                        style={{
                          fontFamily: T.dmSans,
                          fontSize: 12,
                          fontWeight: 500,
                          color: getStressColor(stress),
                        }}
                      >
                        {stress}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: T.divider, margin: "16px 0" }} />

          <div style={{ marginBottom: 16 }}>
            <SectionTitle>Dominant Domain</SectionTitle>
            {isLoading ? (
              <SkeletonShimmer height={20} />
            ) : (
              <div
                style={{
                  fontFamily: T.dmSans,
                  fontSize: 14,
                  color: T.text,
                  fontWeight: 500,
                }}
              >
                Primary Pressure:{" "}
                <span
                  style={{
                    color:
                      systemHealth?.dominantRiskDomain && systemHealth.dominantRiskDomain !== "none"
                        ? T.amber
                        : T.emerald,
                  }}
                >
                  {systemHealth?.dominantRiskDomain && systemHealth.dominantRiskDomain !== "none"
                    ? formatDomainName(systemHealth.dominantRiskDomain)
                    : "None"}
                </span>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <SectionTitle>Trend</SectionTitle>
            {isLoading ? (
              <SkeletonShimmer height={20} />
            ) : (
              <div
                style={{
                  fontFamily: T.dmSans,
                  fontSize: 14,
                  color: T.text,
                  fontWeight: 500,
                }}
              >
                {getTrendDisplay(systemHealth?.trend)}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: T.divider, margin: "16px 0" }} />

          <div>
            <SectionTitle>Capacity Snapshot</SectionTitle>
            {isLoading ? (
              <>
                <SkeletonShimmer height={18} style={{ marginBottom: 4 }} />
                <SkeletonShimmer height={18} style={{ marginBottom: 4 }} />
                <SkeletonShimmer height={18} />
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <CapacityRow
                  label="Focus Capacity"
                  value={`${systemHealth?.focusCapacity ?? 0}m`}
                />
                <CapacityRow
                  label="Decision Capacity"
                  value={decisionLevel}
                  valueColor={decisionCapacity < 50 ? T.amber : T.text}
                />
                <CapacityRow
                  label="Recovery Required"
                  value={recoveryHours > 0 ? `${recoveryHours}h` : "None"}
                  valueColor={recoveryHours > 0 ? T.red : T.emerald}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: T.dmSans,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.06em",
        color: T.tertiary,
        textTransform: "uppercase",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function CapacityRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontFamily: T.dmSans, fontSize: 13, color: T.secondary }}>{label}</span>
      <span style={{ fontFamily: T.dmSans, fontSize: 13, fontWeight: 500, color: valueColor ?? T.text }}>
        {value}
      </span>
    </div>
  );
}

function SkeletonShimmer({
  width,
  height,
  style,
}: {
  width?: number;
  height: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        width: width ?? "100%",
        height,
        background: "linear-gradient(90deg, #E8E7E4 25%, #F0F0EE 50%, #E8E7E4 75%)",
        backgroundSize: "200% 100%",
        borderRadius: 4,
        animation: "shimmer 1.5s infinite",
        ...style,
      }}
    />
  );
}

function getScoreColor(score: number): string {
  if (score >= 80) return T.emerald;
  if (score >= 60) return T.gold;
  if (score >= 40) return T.amber;
  return T.red;
}

function getStressColor(stress: number): string {
  if (stress < 30) return T.emerald;
  if (stress < 50) return T.gold;
  if (stress < 70) return T.amber;
  return T.red;
}

function formatDomainName(domain: string): string {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function getTrendDisplay(trend?: "improving" | "stable" | "declining"): React.ReactNode {
  if (trend === "improving") {
    return (
      <>
        Improving <span style={{ color: T.emerald }}>↑</span>
      </>
    );
  }
  if (trend === "declining") {
    return (
      <>
        Declining <span style={{ color: T.amber }}>↓</span>
      </>
    );
  }
  return (
    <>
      Stable <span style={{ color: T.gold }}>→</span>
    </>
  );
}

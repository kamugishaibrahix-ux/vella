"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type FocusDomain,
  getFocusAreas,
  saveFocusArea,
  removeFocusArea,
  hasFocusArea,
  DOMAIN_METADATA,
  migrateDomain,
} from "@/lib/focusAreas";

const T = {
  bg: "#FAFAF8",
  card: "#F4F3F0",
  text: "#1E1D1B",
  secondary: "#6B6A66",
  tertiary: "#9B9A96",
  caption: "#C8C7C2",
  divider: "#E2E1DD",
  forest: "#3D5E4E",
  forestLight: "#EBF2EE",
  terracotta: "#7A4F3E",
  terracottaLight: "#F5EDEA",
  brass: "#7A6340",
  shadow: "0 1px 3px rgba(0,0,0,0.05)",
  dmSans: '"DM Sans", sans-serif',
} as const;

export default function FocusAreasPage() {
  const router = useRouter();
  const [selectedDomains, setSelectedDomains] = useState<FocusDomain[]>([]);
  const [expandedDomain, setExpandedDomain] = useState<FocusDomain | null>(null);
  const [selectedSubtypes, setSelectedSubtypes] = useState<Record<FocusDomain, string | undefined>>({
    "self-mastery": undefined,
    "addiction-recovery": undefined,
    relationships: undefined,
    "emotional-intelligence": undefined,
    "performance-focus": undefined,
    "identity-purpose": undefined,
    "physical-health": undefined,
    "financial-discipline": undefined,
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved focus areas on mount
  useEffect(() => {
    const areas = getFocusAreas();
    const domains = areas.map((a) => a.domain);
    setSelectedDomains(domains);

    // Restore subtypes
    const subtypes: Record<FocusDomain, string | undefined> = {
      "self-mastery": undefined,
      "addiction-recovery": undefined,
      relationships: undefined,
      "emotional-intelligence": undefined,
      "performance-focus": undefined,
      "identity-purpose": undefined,
      "physical-health": undefined,
      "financial-discipline": undefined,
    };
    areas.forEach((area) => {
      const migratedDomain = migrateDomain(area.domain);
      if (area.subtype) {
        subtypes[migratedDomain] = area.subtype;
      }
    });
    setSelectedSubtypes(subtypes);
    setIsLoaded(true);
  }, []);

  const toggleDomain = (domain: FocusDomain) => {
    const isSelected = selectedDomains.includes(domain);
    if (isSelected) {
      // Deselect
      setSelectedDomains((prev) => prev.filter((d) => d !== domain));
      removeFocusArea(domain);
      if (expandedDomain === domain) {
        setExpandedDomain(null);
      }
    } else {
      // Select
      const metadata = DOMAIN_METADATA[domain];
      if (metadata.subtypes && metadata.subtypes.length > 0) {
        setExpandedDomain(domain);
      } else {
        setSelectedDomains((prev) => [...prev, domain]);
        saveFocusArea(domain);
      }
    }
  };

  const selectSubtype = (domain: FocusDomain, subtype: string) => {
    setSelectedSubtypes((prev) => ({ ...prev, [domain]: subtype }));
    setSelectedDomains((prev) => [...prev.filter((d) => d !== domain), domain]);
    saveFocusArea(domain, subtype);
    setExpandedDomain(null);
  };

  const domains: FocusDomain[] = [
    "self-mastery",
    "addiction-recovery",
    "emotional-intelligence",
    "relationships",
    "performance-focus",
    "identity-purpose",
    "physical-health",
    "financial-discipline",
  ];

  if (!isLoaded) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        padding: "20px",
        fontFamily: T.dmSans,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => router.push("/home")}
          style={{
            fontSize: 13,
            color: T.secondary,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0 0 12px",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span>←</span>
          <span>Back</span>
        </button>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: T.text,
            margin: "0 0 8px",
          }}
        >
          What are you actively working on?
        </h1>
        <p
          style={{
            fontSize: 14,
            color: T.secondary,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          This helps Vella understand where to focus over time.
        </p>
      </div>

      {/* Selected Summary */}
      {selectedDomains.length > 0 && (
        <div
          style={{
            background: T.forestLight,
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 20,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              color: T.forest,
              margin: "0 0 8px",
              textTransform: "uppercase",
            }}
          >
            Selected ({selectedDomains.length})
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {selectedDomains.map((domain) => (
              <span
                key={domain}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  background: "white",
                  color: T.forest,
                  borderRadius: 6,
                  border: `1px solid ${T.forest}`,
                }}
              >
                {DOMAIN_METADATA[domain].label}
                {selectedSubtypes[domain] && ` • ${selectedSubtypes[domain]}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Domain Grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {domains.map((domain) => {
          const metadata = DOMAIN_METADATA[domain];
          const isSelected = selectedDomains.includes(domain);
          const isExpanded = expandedDomain === domain;

          return (
            <div
              key={domain}
              style={{
                background: isSelected ? T.forestLight : "white",
                borderRadius: 12,
                border: `2px solid ${isSelected ? T.forest : T.divider}`,
                overflow: "hidden",
                transition: "all 0.2s ease",
              }}
            >
              <button
                onClick={() => toggleDomain(domain)}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <h3
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: isSelected ? T.forest : T.text,
                        margin: "0 0 2px",
                      }}
                    >
                      {metadata.label}
                    </h3>
                    <p
                      style={{
                        fontSize: 12,
                        color: T.tertiary,
                        margin: 0,
                      }}
                    >
                      {metadata.description}
                    </p>
                    {isSelected && selectedSubtypes[domain] && (
                      <p
                        style={{
                          fontSize: 11,
                          color: T.forest,
                          margin: "4px 0 0",
                        }}
                      >
                        {selectedSubtypes[domain]}
                      </p>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 18,
                      color: isSelected ? T.forest : T.divider,
                      marginLeft: 12,
                    }}
                  >
                    {isSelected ? "✓" : "○"}
                  </span>
                </div>
              </button>

              {/* Subtype Selection */}
              {isExpanded && metadata.subtypes && (
                <div
                  style={{
                    padding: "0 16px 14px",
                    borderTop: `1px solid ${T.divider}`,
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      color: T.tertiary,
                      margin: "10px 0 8px",
                    }}
                  >
                    Select a focus area (optional):
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {metadata.subtypes.map((subtype) => (
                      <button
                        key={subtype}
                        onClick={() => selectSubtype(domain, subtype)}
                        style={{
                          fontSize: 12,
                          padding: "6px 12px",
                          background: selectedSubtypes[domain] === subtype ? T.forest : "white",
                          color: selectedSubtypes[domain] === subtype ? "white" : T.secondary,
                          border: `1.5px solid ${selectedSubtypes[domain] === subtype ? T.forest : T.divider}`,
                          borderRadius: 8,
                          cursor: "pointer",
                        }}
                      >
                        {subtype}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setExpandedDomain(null);
                        setSelectedDomains((prev) => [...prev.filter((d) => d !== domain), domain]);
                        saveFocusArea(domain);
                      }}
                      style={{
                        fontSize: 12,
                        padding: "6px 12px",
                        background: "transparent",
                        color: T.tertiary,
                        border: `1.5px dashed ${T.divider}`,
                        borderRadius: 8,
                        cursor: "pointer",
                      }}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Done Button */}
      <button
        onClick={() => router.push("/home")}
        style={{
          width: "100%",
          marginTop: 24,
          height: 48,
          fontSize: 15,
          fontWeight: 600,
          background: T.forest,
          color: "white",
          border: "none",
          borderRadius: 10,
          cursor: "pointer",
        }}
      >
        Done
      </button>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import type {
  Exercise,
  ExerciseCategory,
} from "@/lib/exercises/exerciseLibrary";
import {
  EXERCISE_LIBRARY,
  getExercisesByCategory,
  formatDuration,
} from "@/lib/exercises/exerciseLibrary";
import {
  getCurrentRecommendations,
  getCategoryLabel,
  getCategoryDescription,
} from "@/lib/exercises/exerciseLogic";

// ---------------------------------------------------------------------------
// Design Tokens - Mobile-First Compact
// ---------------------------------------------------------------------------

const T = {
  bg: "#FAFAF8",
  card: "#F4F3F0",
  text: "#1E1D1B",
  secondary: "#6B6A66",
  tertiary: "#9B9A96",
  caption: "#C8C7C2",
  divider: "#E2E1DD",
  slate: "#4A5266",
  slateLight: "#E8EAF0",
  forest: "#3D5E4E",
  forestLight: "#EBF2EE",
  terracotta: "#7A4F3E",
  brass: "#7A6340",
  shadow: "0 1px 3px rgba(0,0,0,0.05)",
  dmSans: '"DM Sans", sans-serif',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Tab = "recommended" | ExerciseCategory;

interface ExerciseLibrarySheetProps {
  onSelectExercise: (exercise: Exercise) => void;
  onClose: () => void;
  hasActiveTimeBlock?: boolean;
}

export function ExerciseLibrarySheet({
  onSelectExercise,
  onClose,
  hasActiveTimeBlock = false,
}: ExerciseLibrarySheetProps) {
  const [activeTab, setActiveTab] = useState<Tab>("recommended");
  const [recommendations, setRecommendations] = useState<Exercise[]>([]);

  // Load recommendations on mount
  useMemo(() => {
    getCurrentRecommendations(hasActiveTimeBlock).then((recs) => {
      setRecommendations(recs.map((r) => r.exercise));
    });
  }, [hasActiveTimeBlock]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "recommended", label: "For You" },
    { key: "stabilise", label: "Stabilise" },
    { key: "focus", label: "Focus" },
    { key: "energy", label: "Energy" },
    { key: "recovery", label: "Recovery" },
  ];

  const exercises = useMemo(() => {
    if (activeTab === "recommended") {
      return recommendations;
    }
    return getExercisesByCategory(activeTab);
  }, [activeTab, recommendations]);

  const categoryColor: Record<ExerciseCategory, string> = {
    stabilise: T.slate,
    focus: T.forest,
    energy: T.brass,
    recovery: T.tertiary,
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: T.bg,
          borderRadius: "16px 16px 0 0",
          maxHeight: "85vh",
          maxWidth: 480,
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          animation: "slideUp 0.25s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Compact */}
        <div
          style={{
            padding: "14px 16px 10px",
            borderBottom: `1px solid ${T.divider}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <h2
              style={{
                fontFamily: T.dmSans,
                fontSize: 17,
                fontWeight: 600,
                color: T.text,
                margin: 0,
              }}
            >
              Mind & Body
            </h2>
            <button
              onClick={onClose}
              style={{
                fontFamily: T.dmSans,
                fontSize: 13,
                color: T.secondary,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              Close
            </button>
          </div>

          {/* Tabs - Compact */}
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  fontFamily: T.dmSans,
                  fontSize: 12,
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  padding: "6px 12px",
                  background: activeTab === tab.key ? T.text : "transparent",
                  color: activeTab === tab.key ? "white" : T.secondary,
                  border: `1.5px solid ${activeTab === tab.key ? T.text : T.divider}`,
                  borderRadius: 16,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content - Compact */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 16px 16px",
          }}
        >
          {/* Description for category tabs */}
          {activeTab !== "recommended" && (
            <p
              style={{
                fontFamily: T.dmSans,
                fontSize: 12,
                color: T.tertiary,
                margin: "0 0 10px",
              }}
            >
              {getCategoryDescription(activeTab)}
            </p>
          )}

          {/* Exercise Cards - Compact Row Layout */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {exercises.map((exercise) => (
              <div
                key={exercise.id}
                style={{
                  background: "white",
                  borderRadius: 10,
                  padding: "10px 12px",
                  boxShadow: T.shadow,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {/* Left: Category + Duration inline */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <span
                    style={{
                      fontFamily: T.dmSans,
                      fontSize: 9,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      padding: "2px 6px",
                      background: categoryColor[exercise.category] + "15",
                      color: categoryColor[exercise.category],
                      borderRadius: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {getCategoryLabel(exercise.category)}
                  </span>
                  <span
                    style={{
                      fontFamily: T.dmSans,
                      fontSize: 11,
                      color: T.tertiary,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDuration(exercise.durationSeconds)}
                  </span>
                  <h3
                    style={{
                      fontFamily: T.dmSans,
                      fontSize: 14,
                      fontWeight: 500,
                      color: T.text,
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {exercise.title}
                  </h3>
                </div>

                {/* Right: Start Button - 44px max */}
                <button
                  onClick={() => onSelectExercise(exercise)}
                  style={{
                    fontFamily: T.dmSans,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "8px 14px",
                    height: 36,
                    minWidth: 70,
                    background: T.forest,
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Start
                </button>
              </div>
            ))}
          </div>

          {exercises.length === 0 && (
            <p
              style={{
                fontFamily: T.dmSans,
                fontSize: 13,
                color: T.tertiary,
                textAlign: "center",
                padding: "24px 16px",
              }}
            >
              No exercises found.
            </p>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

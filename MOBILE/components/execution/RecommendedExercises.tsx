"use client";

import { useState, useEffect } from "react";
import type { Exercise } from "@/lib/exercises/exerciseLibrary";
import { formatDuration } from "@/lib/exercises/exerciseLibrary";
import {
  getCurrentRecommendations,
  type ExerciseRecommendation,
  getMorningLanding,
} from "@/lib/exercises/exerciseLogic";

// ---------------------------------------------------------------------------
// Design Tokens
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
  shadow: "0 1px 4px rgba(0,0,0,0.06)",
  dmSans: '"DM Sans", sans-serif',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RecommendedExercisesProps {
  onSelectExercise: (exercise: Exercise) => void;
  onOpenLibrary: () => void;
  hasActiveTimeBlock?: boolean;
}

export function RecommendedExercises({
  onSelectExercise,
  onOpenLibrary,
  hasActiveTimeBlock = false,
}: RecommendedExercisesProps) {
  const [recommendations, setRecommendations] = useState<ExerciseRecommendation[]>([]);
  const [landing, setLanding] = useState<string | null>(null);

  useEffect(() => {
    // Load recommendations
    getCurrentRecommendations(hasActiveTimeBlock).then((recs) => {
      setRecommendations(recs);
    });

    // Load morning landing
    const ml = getMorningLanding();
    setLanding(ml);
  }, [hasActiveTimeBlock]);

  const categoryColor: Record<string, string> = {
    stabilise: T.slate,
    focus: T.forest,
    energy: T.brass,
    recovery: T.tertiary,
  };

  const categoryBg: Record<string, string> = {
    stabilise: T.slateLight,
    focus: T.forestLight,
    energy: "#F4EFE5",
    recovery: "#F5F5F4",
  };

  if (recommendations.length === 0) {
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
          RECOMMENDED
        </p>
        <p
          style={{
            fontFamily: T.dmSans,
            fontSize: 14,
            color: T.secondary,
          }}
        >
          Set your morning state to get personalized recommendations.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <p
          style={{
            fontFamily: T.dmSans,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: T.tertiary,
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          RECOMMENDED FOR {landing ? landing.toUpperCase() : "TODAY"}
        </p>
        <button
          onClick={onOpenLibrary}
          style={{
            fontFamily: T.dmSans,
            fontSize: 11,
            color: T.forest,
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          View All
        </button>
      </div>

      {/* Horizontal scroll of recommendations */}
      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          scrollbarWidth: "none",
          padding: "4px 0",
        }}
      >
        {recommendations.map((rec) => (
          <button
            key={rec.exercise.id}
            onClick={() => onSelectExercise(rec.exercise)}
            style={{
              flex: "0 0 200px",
              background: categoryBg[rec.exercise.category],
              border: `1.5px solid ${categoryBg[rec.exercise.category]}`,
              borderRadius: 12,
              padding: 16,
              cursor: "pointer",
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              height: 140,
            }}
          >
            <span
              style={{
                display: "inline-block",
                fontFamily: T.dmSans,
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "2px 6px",
                background: categoryColor[rec.exercise.category] + "20",
                color: categoryColor[rec.exercise.category],
                borderRadius: 3,
                marginBottom: 8,
                alignSelf: "flex-start",
              }}
            >
              {rec.exercise.category}
            </span>

            <h4
              style={{
                fontFamily: T.dmSans,
                fontSize: 15,
                fontWeight: 600,
                color: T.text,
                margin: "0 0 4px",
                lineHeight: 1.3,
              }}
            >
              {rec.exercise.title}
            </h4>

            <p
              style={{
                fontFamily: T.dmSans,
                fontSize: 12,
                color: T.tertiary,
                margin: "0 0 8px",
                lineHeight: 1.4,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {rec.exercise.description}
            </p>

            <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14 }}>▶</span>
              <span
                style={{
                  fontFamily: T.dmSans,
                  fontSize: 12,
                  fontWeight: 600,
                  color: T.secondary,
                }}
              >
                {formatDuration(rec.exercise.durationSeconds)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

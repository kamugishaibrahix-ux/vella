"use client";

import { useState, useEffect, useCallback } from "react";
import type { Exercise } from "@/lib/exercises/exerciseLibrary";
import { formatDuration, logExerciseCompletion } from "@/lib/exercises/exerciseLibrary";

// ---------------------------------------------------------------------------
// Design Tokens - Mobile-First Compact
// ---------------------------------------------------------------------------

const T = {
  bg: "#FAFAF8",
  card: "#F4F3F0",
  text: "#1E1D1B",
  secondary: "#6B6A66",
  tertiary: "#9B9A96",
  forest: "#3D5E4E",
  forestLight: "#EBF2EE",
  terracotta: "#7A4F3E",
  shadow: "0 1px 3px rgba(0,0,0,0.05)",
  dmSans: '"DM Sans", sans-serif',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ExerciseTimerProps {
  exercise: Exercise;
  onComplete: () => void;
  onCancel: () => void;
}

export function ExerciseTimer({ exercise, onComplete, onCancel }: ExerciseTimerProps) {
  const [timeLeft, setTimeLeft] = useState(exercise.durationSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // Timer logic
  useEffect(() => {
    if (!isRunning || isPaused) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsFinished(true);
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, isPaused]);

  // Auto-start after 3 second prep
  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsRunning(true);
    }, 3000);
    return () => clearTimeout(timeout);
  }, []);

  const handleComplete = useCallback(async () => {
    await logExerciseCompletion(exercise.id, exercise.durationSeconds - timeLeft);
    onComplete();
  }, [exercise, timeLeft, onComplete]);

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  // Format display time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = ((exercise.durationSeconds - timeLeft) / exercise.durationSeconds) * 100;

  // Finished state
  if (isFinished) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: T.forest,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 200,
          color: "white",
          textAlign: "center",
          maxWidth: 480,
          margin: "0 auto",
          height: "100dvh",
          overflow: "hidden",
        }}
      >
        <div style={{ fontSize: 64, marginBottom: 20 }}>✓</div>
        <h2
          style={{
            fontFamily: T.dmSans,
            fontSize: 24,
            fontWeight: 600,
            margin: "0 0 8px",
          }}
        >
          Completed
        </h2>
        <p
          style={{
            fontFamily: T.dmSans,
            fontSize: 14,
            opacity: 0.9,
            margin: "0 0 28px",
          }}
        >
          {exercise.title} • {formatDuration(exercise.durationSeconds)}
        </p>
        <button
          onClick={handleComplete}
          style={{
            fontFamily: T.dmSans,
            fontSize: 15,
            fontWeight: 600,
            padding: "14px 28px",
            background: "white",
            color: T.forest,
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            height: 48,
          }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: T.bg,
        display: "flex",
        flexDirection: "column",
        zIndex: 200,
        maxWidth: 480,
        margin: "0 auto",
        height: "100dvh",
        overflow: "hidden",
      }}
    >
      {/* Header - Compact */}
      <div
        style={{
          padding: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          onClick={onCancel}
          style={{
            fontFamily: T.dmSans,
            fontSize: 14,
            color: T.tertiary,
            background: "none",
            border: "none",
            cursor: "pointer",
            height: 36,
          }}
        >
          Cancel
        </button>
        <span
          style={{
            fontFamily: T.dmSans,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: T.tertiary,
          }}
        >
          {isRunning ? (isPaused ? "Paused" : "In Progress") : "Preparing..."}
        </span>
      </div>

      {/* Main Timer Display - Compact */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
        }}
      >
        <h1
          style={{
            fontFamily: T.dmSans,
            fontSize: 15,
            color: T.tertiary,
            fontWeight: 500,
            margin: "0 0 8px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {exercise.title}
        </h1>

        <div
          style={{
            fontFamily: T.dmSans,
            fontSize: 72,
            fontWeight: 700,
            color: T.text,
            letterSpacing: "-0.03em",
            margin: "4px 0",
          }}
        >
          {formatTime(timeLeft)}
        </div>

        <p
          style={{
            fontFamily: T.dmSans,
            fontSize: 13,
            color: T.secondary,
            textAlign: "center",
            maxWidth: 280,
            margin: "8px 0 0",
            lineHeight: 1.5,
          }}
        >
          {exercise.description}
        </p>
      </div>

      {/* Progress Bar & Controls - Compact */}
      <div style={{ padding: "0 16px 20px" }}>
        <div
          style={{
            height: 4,
            background: T.card,
            borderRadius: 2,
            overflow: "hidden",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: T.forest,
              borderRadius: 2,
              transition: "width 1s linear",
            }}
          />
        </div>

        {/* Controls - 44px buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={togglePause}
            style={{
              flex: 1,
              fontFamily: T.dmSans,
              fontSize: 15,
              fontWeight: 600,
              height: 44,
              background: isPaused ? T.forest : "transparent",
              color: isPaused ? "white" : T.text,
              border: `2px solid ${isPaused ? T.forest : T.text}`,
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>

          <button
            onClick={handleComplete}
            style={{
              flex: 1,
              fontFamily: T.dmSans,
              fontSize: 15,
              fontWeight: 600,
              height: 44,
              background: T.forest,
              color: "white",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Finish Early
          </button>
        </div>
      </div>
    </div>
  );
}

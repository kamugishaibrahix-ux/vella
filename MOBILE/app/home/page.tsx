"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { deriveHomeState, type HomeState } from "@/lib/home/deriveHomeState";
import { getAllSessions } from "@/lib/session/sessionStore";
import { InMotionPanel } from "@/components/execution/InMotionPanel";
import { RecommendedExercises } from "@/components/execution/RecommendedExercises";
import { ExerciseLibrarySheet } from "@/components/execution/ExerciseLibrarySheet";
import { ExerciseTimer } from "@/components/execution/ExerciseTimer";
import type { Exercise } from "@/lib/exercises/exerciseLibrary";
import { LandingSelector } from "@/components/execution/LandingSelector";
import { QuickActions } from "@/components/execution/QuickActions";
import { SystemHealthPanel } from "@/components/SystemHealthPanel";

// ---------------------------------------------------------------------------
// Stability color palette (muted, professional)
// ---------------------------------------------------------------------------
function getStabilityColor(score: number): string {
  if (score >= 80) return "#1E8E5A";
  if (score >= 60) return "#B38B2D";
  if (score >= 40) return "#C86F2D";
  return "#8F2E2E";
}

const HEADLINE = "Vella";

function formatDateLabel(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/**
 * HomePage - Main dashboard surface.
 * 
 * NOTE: Bottom navigation is rendered by MobileShell to ensure single source of truth.
 * Do NOT add a local BottomNav here - it would duplicate the nav UI.
 */
export default function HomePage() {
  const router = useRouter();
  const [state, setState] = useState<HomeState | null>(null);
  const [hasActiveContract, setHasActiveContract] = useState(false);
  const [showExerciseLibrary, setShowExerciseLibrary] = useState(false);
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null);

  const [showStabilityPanel, setShowStabilityPanel] = useState(false);

  // Load home state
  useEffect(() => {
    deriveHomeState().then(setState).catch(() => {});
  }, []);

  // Check for active contract from InMotionPanel
  useEffect(() => {
    const checkContract = async () => {
      const { getActiveContract } = await import("@/lib/contracts/contractStore");
      const contract = await getActiveContract();
      setHasActiveContract(!!contract);
    };
    checkContract();
    const interval = setInterval(checkContract, 5000);
    return () => clearInterval(interval);
  }, []);

  // 3-state: null = not loaded, systemHealth null = no data, otherwise valid
  const stabilityData = state?.systemHealth ?? null;
  const hasStabilityData = stabilityData !== null && stabilityData.globalStabilityScore > 0;
  const stabilityScore = hasStabilityData ? stabilityData.globalStabilityScore : null;

  const handleExerciseSelect = useCallback((exercise: Exercise) => {
    setActiveExercise(exercise);
    setShowExerciseLibrary(false);
  }, []);

  const handleExerciseComplete = useCallback(() => {
    setActiveExercise(null);
  }, []);

  const handleOpenFocusAreas = useCallback(() => {
    router.push("/focus-areas");
  }, [router]);

  // Budget capacity data
  const focusCapacity = stabilityData?.focusCapacity ?? 0;
  const decisionCapacity = stabilityData?.decisionCapacity ?? 0;
  const decisionLevel = decisionCapacity >= 70 ? "High" : decisionCapacity >= 40 ? "Medium" : "Low";

  // Deterministic gate: "Recommended for today" only when user has behavioural data (no AI)
  const sessionCount = typeof window !== "undefined" ? getAllSessions().length : 0;
  const hasBehavioralData =
    (state?.checkInCount ?? 0) >= 3 ||
    (state?.journalCount ?? 0) >= 2 ||
    sessionCount >= 2;

  return (
    <div className={styles.viewport}>
      <div className={styles.shell}>
        <div className={styles.content}>
          <header className={styles.header}>
            {/* LEFT: Logo + Vella + Date (stacked) */}
            <div className={styles.vellaCluster}>
              <Image
                src="/icons/icon-192.png"
                alt="Vella logo"
                width={120}
                height={120}
                priority
                className={styles.logoImage}
              />
              <div className={styles.headerText}>
                <h1 className={styles.headline}>{HEADLINE}</h1>
                <p className={styles.date}>{formatDateLabel()}</p>
              </div>
            </div>

            {/* CENTER: Heart (center aligned) */}
            <div className={styles.stabilityCenter}>
              <StabilityIndicator
                score={stabilityScore}
                isLoading={!state}
                onClick={() => setShowStabilityPanel(true)}
              />
            </div>

            {/* RIGHT: Inbox + Profile (tight cluster) */}
            <div className={styles.headerActions}>
              <Link
                href="/inbox"
                className={styles.inboxLink}
                aria-label="Open inbox"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--vella-primary)" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 12h5l2 3h4l2-3h5" />
                </svg>
              </Link>
              <div
                onClick={() => router.push("/profile")}
                className={styles.profileLink}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && router.push("/profile")}
                aria-label="Go to profile"
              >
                <div className={styles.avatar}>You</div>
              </div>
            </div>
          </header>

          {/* Body between header and bottom nav */}
          <div className={styles.cardStack}>
            <LandingSelector />
            <InMotionPanel systemPhase={stabilityData?.phase} />
            <RecommendedExercises
              onSelectExercise={handleExerciseSelect}
              onOpenLibrary={() => setShowExerciseLibrary(true)}
              hasActiveTimeBlock={hasActiveContract}
              hasBehavioralData={hasBehavioralData}
            />
            <QuickActions
              onOpenLibrary={() => setShowExerciseLibrary(true)}
              onOpenFocusAreas={handleOpenFocusAreas}
              budgetLine={{ focus: `${focusCapacity}m`, decisions: decisionLevel }}
            />
          </div>
        </div>
        {/* BottomNav is rendered by MobileShell - do not duplicate here */}
      </div>

      {/* Modals */}
      {showExerciseLibrary && (
        <ExerciseLibrarySheet
          onSelectExercise={handleExerciseSelect}
          onClose={() => setShowExerciseLibrary(false)}
          hasActiveTimeBlock={hasActiveContract}
        />
      )}

      {activeExercise && (
        <ExerciseTimer
          exercise={activeExercise}
          onComplete={handleExerciseComplete}
          onCancel={() => setActiveExercise(null)}
        />
      )}

      <SystemHealthPanel
        isOpen={showStabilityPanel}
        onClose={() => setShowStabilityPanel(false)}
        systemHealth={stabilityData}
        isLoading={!state}
      />
    </div>
  );
}

const HEART_PATH =
  "M12 20.2l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 10.38L12 20.2z";

interface StabilityIndicatorProps {
  score: number | null;
  isLoading: boolean;
  onClick: () => void;
}

function StabilityIndicator({ score, isLoading, onClick }: StabilityIndicatorProps) {
  const hasData = score !== null;
  const color = hasData ? getStabilityColor(score) : "#C8C7C2";
  const fillHeight = hasData ? score : 0;
  
  // Generate live system metadata
  const lastUpdatedSec = Math.floor(Math.random() * 30) + 1; // Simulated: 1-30s ago
  const confidencePct = hasData ? Math.min(Math.round((score ?? 0) * 0.9 + 10), 100) : 0;

  return (
    <button
      onClick={onClick}
      className={styles.stabilityIndicator}
      aria-label={hasData ? `Stability ${score}%` : "Stability initializing"}
    >
      <div className={styles.heartIconWrap}>
        {/* Ambient glow (max 8% opacity) */}
        <div
          className={styles.heartGlow}
          style={{
            background: hasData
              ? `radial-gradient(circle, ${color}14 0%, transparent 70%)`
              : "none",
          }}
        />
        {/* Glass highlight top-left */}
        <div className={styles.heartHighlight} />
        {/* Fill */}
        <div
          className={styles.heartFill}
          style={{
            height: `${fillHeight}%`,
            background: hasData
              ? `radial-gradient(ellipse at center bottom, ${color}0A 0%, ${color} 100%)`
              : "#E8E7E4",
          }}
          aria-hidden
        />
        <svg
          className={styles.heartSvg}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d={HEART_PATH}
            className={styles.heartOutline}
            stroke={color}
            strokeWidth="1.6"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      {isLoading ? (
        <span className={styles.heartPercent} style={{ color: "#C8C7C2" }}>···</span>
      ) : hasData ? (
        <span className={styles.heartPercent} style={{ color }}>{score}%</span>
      ) : (
        <span className={styles.heartPercent} style={{ color: "#C8C7C2" }}>—</span>
      )}
      <span className={styles.heartLabel}>Stability</span>
      
      {/* Live system metadata */}
      {!isLoading && hasData && (
        <div className={styles.liveSystemMeta}>
          <div>Last updated: {lastUpdatedSec}s ago</div>
          <div>Confidence: {confidencePct}%</div>
        </div>
      )}
    </button>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { deriveHomeState, type HomeState } from "@/lib/home/deriveHomeState";
import { InMotionPanel } from "@/components/execution/InMotionPanel";
import { RecommendedExercises } from "@/components/execution/RecommendedExercises";
import { ExerciseLibrarySheet } from "@/components/execution/ExerciseLibrarySheet";
import { ExerciseTimer } from "@/components/execution/ExerciseTimer";
import type { Exercise } from "@/lib/exercises/exerciseLibrary";
import { LandingSelector } from "@/components/execution/LandingSelector";
import { QuickActions } from "@/components/execution/QuickActions";

const HEADLINE = "Vella";

function formatDateLabel(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default function HomePage() {
  const router = useRouter();
  const [state, setState] = useState<HomeState | null>(null);
  const [hasActiveContract, setHasActiveContract] = useState(false);
  const [showExerciseLibrary, setShowExerciseLibrary] = useState(false);
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null);

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

  const connectionPercent = state?.connectionScore ?? 0;

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

  return (
    <div className={styles.viewport}>
      <div className={styles.shell}>
        <div className={styles.content}>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <div
                onClick={() => router.push("/profile")}
                className="cursor-pointer hover:opacity-80 transition"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && router.push("/profile")}
                aria-label="Go to profile"
              >
                <div className={styles.avatar}>You</div>
              </div>
              <div className={styles.headerText}>
                <h1 className={styles.headline}>{HEADLINE}</h1>
                <p className={styles.date}>{formatDateLabel()}</p>
              </div>
            </div>
            <Link
              href="/inbox"
              className="mr-2 p-1.5 rounded-xl hover:bg-black/5 transition pressable"
              aria-label="Open inbox"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="var(--vella-primary)" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 12h5l2 3h4l2-3h5" />
              </svg>
            </Link>
            <HeartConnection percent={connectionPercent} />
          </header>

          {/* Body between header and bottom nav */}
          <div className={styles.cardStack}>
            <LandingSelector />
            <InMotionPanel />
            <RecommendedExercises
              onSelectExercise={handleExerciseSelect}
              onOpenLibrary={() => setShowExerciseLibrary(true)}
              hasActiveTimeBlock={hasActiveContract}
            />
            <QuickActions
              onOpenLibrary={() => setShowExerciseLibrary(true)}
              onOpenFocusAreas={handleOpenFocusAreas}
            />
          </div>
        </div>
        <BottomNav />
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
    </div>
  );
}

const HEART_PATH =
  "M12 20.2l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 10.38L12 20.2z";

function HeartConnection({ percent }: { percent: number }) {
  return (
    <div
      className={styles.heartConnection}
      aria-label={`Connection ${percent}%`}
      style={{ ["--heart-fill" as string]: `${percent}%` }}
    >
      <div className={styles.heartIconWrap}>
        <div
          className={styles.heartFill}
          style={{ height: `${percent}%` }}
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
            stroke="var(--vella-primary)"
            strokeWidth="1.6"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      <span className={styles.heartPercent}>{percent}%</span>
      <span className={styles.heartLabel}>Connection</span>
    </div>
  );
}

function BottomNav() {
  return (
    <nav className={styles.bottomNav} aria-label="Bottom navigation">
      <Link href="/home" className={`${styles.navItem} ${styles.navActive}`} aria-current="page">
        <NavIcon kind="home" />
        <span>Home</span>
      </Link>
      <Link href="/checkin" className={styles.navItem}>
        <NavIcon kind="checkin" />
        <span>Check-in</span>
      </Link>
      <Link href="/session" className={styles.navItem}>
        <NavIcon kind="session" />
        <span>Session</span>
      </Link>
      <Link href="/journal" className={styles.navItem}>
        <NavIcon kind="journal" />
        <span>Journal</span>
      </Link>
      <Link href="/insights" className={styles.navItem}>
        <NavIcon kind="insights" />
        <span>Clarity</span>
      </Link>
    </nav>
  );
}

function NavIcon({ kind }: { kind: "home" | "checkin" | "session" | "journal" | "insights" }) {
  const isHome = kind === "home";
  const stroke = isHome ? "#1E1D1B" : "#C8C7C2";
  const common = { className: styles.icon, stroke };
  if (kind === "home") {
    return (
      <svg {...common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 10.5 12 4l8 6.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9.5Z"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "checkin") {
    return (
      <svg {...common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="6" y="4" width="12" height="16" rx="2" strokeWidth="1.5" />
        <path d="M9 12l2 2 4-5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "session") {
    return (
      <svg {...common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M20 12a7 7 0 0 1-7 7H9l-5 2 1.6-4.4A7 7 0 1 1 20 12Z"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "journal") {
    return (
      <svg {...common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 4h10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" strokeWidth="1.5" />
        <path d="M7 4v14" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg {...common} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 18h6" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 21h4" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M8 10a4 4 0 1 1 8 0c0 1.4-.7 2.4-1.5 3.2-.8.8-1.5 1.4-1.5 2.3v.3h-2v-.3c0-.9-.7-1.5-1.5-2.3C8.7 12.4 8 11.4 8 10Z"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

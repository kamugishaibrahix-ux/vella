"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

export function QuickActionsSection() {
  const router = useRouter();

  const goExercises = useCallback(() => {
    router.push("/exercises");
  }, [router]);

  const goGoals = useCallback(() => {
    router.push("/goals");
  }, [router]);

  return (
    <section className="mt-6 pb-12">
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={goExercises}
          className={cn(
            "w-full rounded-2xl border border-vella-border bg-transparent pressable",
            "px-5 py-5 text-left",
            "text-[15px] text-vella-text"
          )}
        >
          <span className="block font-medium">Mind &amp; Body Exercises</span>
        </button>

        <button
          type="button"
          onClick={goGoals}
          className={cn(
            "w-full rounded-2xl border border-vella-border bg-transparent pressable",
            "px-5 py-5 text-left",
            "text-[15px] text-vella-text"
          )}
        >
          <span className="block font-medium">Goals &amp; Contracts</span>
        </button>
      </div>
    </section>
  );
}


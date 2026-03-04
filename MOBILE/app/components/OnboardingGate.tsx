"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readFlag } from "@/lib/local/runtimeFlags";

/**
 * Client-side onboarding gate.
 *
 * If the user has NOT completed onboarding (no `hasSeenOnboarding` flag in localStorage),
 * redirect them to /onboarding. Paths under /onboarding and static asset paths
 * are excluded from the redirect to prevent loops.
 *
 * This must be a client component because onboarding state is stored in localStorage
 * (not accessible from Edge middleware).
 */

const ONBOARDING_FLAG = "hasSeenOnboarding";

const EXCLUDED_PREFIXES = [
  "/onboarding",
  "/offline",
  "/api",
  "/_next",
];

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Skip check for excluded paths
    if (pathname && EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p))) {
      setChecked(true);
      return;
    }

    const completed = readFlag(ONBOARDING_FLAG);
    if (!completed) {
      router.replace("/onboarding/welcome");
      return;
    }

    setChecked(true);
  }, [pathname, router]);

  // While checking, render nothing to avoid flash of content
  if (!checked) {
    return null;
  }

  return <>{children}</>;
}

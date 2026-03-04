"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { TriggerSchedulerProvider } from "./TriggerSchedulerProvider";
import { LockProvider } from "@/lib/security/lockState";
import { LockScreen } from "./LockScreen";
import { EntitlementsProvider, TokenBalanceProvider, AccountStatusProvider } from "./providers";
import { AuthBootstrap } from "./providers/AuthBootstrap";
import { OnboardingGate } from "./OnboardingGate";
import { PwaInstallHandler } from "./PwaInstallHandler";

/**
 * Routes that should display the bottom navigation.
 * Must match the tabs defined in BottomNav.tsx.
 */
const BOTTOM_NAV_PATHS = ["/home", "/checkin", "/journal", "/insights"];

/**
 * MobileShell - Root layout wrapper for all mobile routes.
 * 
 * Responsibilities:
 * - Provides LockProvider for app lock functionality
 * - Provides EntitlementsProvider and TokenBalanceProvider for cached data
 * - Conditionally renders BottomNav based on route
 * - Handles full-screen routes (/session) without nav
 */
export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Vella/session: full-screen takeover, no bottom nav (completely unmount).
  const hideBottomNav = pathname?.startsWith("/session");
  const showBottomNav = pathname ? BOTTOM_NAV_PATHS.includes(pathname) && !hideBottomNav : false;

  // Session/Vella: full viewport, no bottom padding (no nav).
  if (hideBottomNav) {
    return (
      <LockProvider>
        <LockScreen />
        <AuthBootstrap>
          <EntitlementsProvider>
            <TokenBalanceProvider>
              <AccountStatusProvider>
                <div className="h-dvh flex flex-col">
                  <TriggerSchedulerProvider />
                  <main className="flex-1 min-h-0 w-full flex flex-col overflow-hidden"><OnboardingGate>{children}</OnboardingGate></main>
                </div>
              </AccountStatusProvider>
            </TokenBalanceProvider>
          </EntitlementsProvider>
        </AuthBootstrap>
      </LockProvider>
    );
  }

  return (
    <LockProvider>
      <LockScreen />
      <AuthBootstrap>
        <EntitlementsProvider>
          <TokenBalanceProvider>
            <AccountStatusProvider>
              <div className="h-dvh flex flex-col">
                <TriggerSchedulerProvider />
                <PwaInstallHandler />
                <main className="flex-1 min-h-0 w-full flex flex-col"><OnboardingGate>{children}</OnboardingGate></main>
                {showBottomNav && (
                  <div className="sticky bottom-0 w-full z-50">
                    <BottomNav />
                  </div>
                )}
              </div>
            </AccountStatusProvider>
          </TokenBalanceProvider>
        </EntitlementsProvider>
      </AuthBootstrap>
    </LockProvider>
  );
}

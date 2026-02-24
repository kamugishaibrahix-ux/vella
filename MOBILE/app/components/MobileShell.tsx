"use client";
import { cn } from "@/lib/utils";

import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";

const BOTTOM_NAV_PATHS = ["/home", "/checkin", "/journal", "/insights", "/archive"];

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Home owns its own viewport + BottomNav layout (full rebuild requirement).
  if (pathname === "/home") {
    return <>{children}</>;
  }
  // Vella/session: full-screen takeover, no bottom nav (completely unmount).
  const hideBottomNav = pathname?.startsWith("/session");
  const showBottomNav = pathname ? BOTTOM_NAV_PATHS.includes(pathname) && !hideBottomNav : false;

  // Session/Vella: full viewport, no bottom padding (no nav).
  if (hideBottomNav) {
    return (
      <div className="h-dvh flex flex-col">
        <main className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 min-h-0 w-full flex flex-col">{children}</main>
      {showBottomNav && (
        <div className="sticky bottom-0 w-full z-50">
          <BottomNav />
        </div>
      )}
    </div>
  );
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isMaintenanceMode } from "@/lib/security/killSwitch";

/**
 * Allowed paths when APP_MAINTENANCE_MODE=true (exact or prefix).
 * Everything else returns 503 Maintenance.
 */
const MAINTENANCE_ALLOWED = [
  "/api/stripe/webhook", // Stripe events must continue for subscription sync
  "/api/admin",          // Admin operations (if any under this app)
  "/login",              // Login page
  "/_next",              // Next.js static
  "/favicon.ico",
  "/assets",
];

function isAllowedDuringMaintenance(pathname: string): boolean {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return MAINTENANCE_ALLOWED.some(
    (allowed) => normalized === allowed || normalized.startsWith(`${allowed}/`)
  );
}

export async function middleware(req: NextRequest) {
  if (isMaintenanceMode()) {
    const pathname = req.nextUrl.pathname;
    if (isAllowedDuringMaintenance(pathname)) {
      return NextResponse.next();
    }
    return new NextResponse("Maintenance", { status: 503 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

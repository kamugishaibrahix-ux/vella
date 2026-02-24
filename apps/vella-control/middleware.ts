import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { isAdminBypassActive } from "@/lib/auth/devBypass";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Dev bypass: skip all auth checks if bypass is active
  if (isAdminBypassActive()) {
    // In dev bypass mode, do not enforce any auth redirects.
    return NextResponse.next();
  }

  // Allow public routes
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/assets/")
  ) {
    return NextResponse.next();
  }

  // Check authentication for all other routes
  try {
    // Create a response object to set cookies
    const response = NextResponse.next();
    const supabase = createServerComponentClient({
      cookies: () => request.cookies as any,
    });
    
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      // Not authenticated, redirect to login
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Check if user is admin
    const isAdmin = user.user_metadata?.is_admin === true;

    if (!isAdmin) {
      // Not an admin, redirect to login
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(loginUrl);
    }

    // User is authenticated and is admin, allow request
    return response;
  } catch (error) {
    console.error("[middleware] Auth check failed", error);
    // On error, redirect to login
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};


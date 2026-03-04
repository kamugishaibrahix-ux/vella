"use client";

/**
 * Settings Redirect
 * Redirects /settings to /profile/settings (canonical location).
 * Preserves any query parameters during redirect.
 */

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

export default function SettingsRedirectPage() {
  return (
    <Suspense fallback={<SettingsRedirectFallback />}>
      <SettingsRedirectContent />
    </Suspense>
  );
}

function SettingsRedirectFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-b-2"
        style={{ borderColor: "var(--vella-primary)" }}
      />
    </div>
  );
}

function SettingsRedirectContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Preserve query params when redirecting
    const params = searchParams.toString();
    const redirectPath = "/profile/settings" + (params ? `?${params}` : "");
    // Use window.location for external-like redirect to avoid type issues
    window.location.replace(redirectPath);
  }, [searchParams]);

  // Show minimal loading state while redirecting
  return <SettingsRedirectFallback />;
}

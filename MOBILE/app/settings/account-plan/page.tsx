"use client";

/**
 * Account Plan Redirect
 * Redirects /settings/account-plan to /profile/settings (canonical location).
 * This preserves backwards compatibility with existing links.
 */

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

export default function AccountPlanRedirectPage() {
  return (
    <Suspense fallback={<AccountPlanRedirectFallback />}>
      <AccountPlanRedirectContent />
    </Suspense>
  );
}

function AccountPlanRedirectFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-b-2"
        style={{ borderColor: "var(--vella-primary)" }}
      />
    </div>
  );
}

function AccountPlanRedirectContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Preserve query params (including token-pack success/cancel indicators)
    const params = searchParams.toString();
    const redirectPath = "/profile/settings" + (params ? `?${params}` : "");
    // Use window.location for external-like redirect to avoid type issues
    window.location.replace(redirectPath);
  }, [searchParams]);

  // Show minimal loading state while redirecting
  return <AccountPlanRedirectFallback />;
}

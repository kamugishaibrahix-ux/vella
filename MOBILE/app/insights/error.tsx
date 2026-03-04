"use client";

/**
 * Insights Route Error Boundary
 *
 * Catches errors in insights rendering routes.
 * Renders a graceful fallback with retry option.
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function InsightsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Minimal error logging - no stack traces in production
    if (process.env.NODE_ENV === "production") {
      // Log error code only for monitoring
    }
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-vella-bg">
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Soft icon */}
        <div className="w-16 h-16 mx-auto rounded-full bg-vella-accent/10 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-vella-accent"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>

        {/* Supportive message */}
        <div className="space-y-2">
          <h1 className="text-lg font-medium text-vella-text">
            Insights unavailable
          </h1>
          <p className="text-sm text-vella-text-secondary">
            We&apos;re having trouble loading your insights. Let&apos;s try again.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={reset}
            className="w-full bg-vella-accent text-white hover:bg-vella-accent/90"
          >
            Try again
          </Button>

          <a
            href="/home"
            className="block text-sm text-vella-text-secondary hover:text-vella-text underline underline-offset-4"
          >
            Go to home
          </a>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * Journal Route Error Boundary
 *
 * Catches errors in journal routes.
 * Renders a graceful fallback with retry option.
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function JournalError({ error, reset }: ErrorProps) {
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
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>

        {/* Supportive message */}
        <div className="space-y-2">
          <h1 className="text-lg font-medium text-vella-text">
            Journal unavailable
          </h1>
          <p className="text-sm text-vella-text-secondary">
            We&apos;re having trouble loading your journal. Your entries are safe. Let&apos;s try again.
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

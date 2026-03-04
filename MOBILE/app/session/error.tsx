"use client";

/**
 * Session Route Error Boundary
 *
 * Catches errors in voice session routes.
 * Renders a graceful fallback that allows retry or escape to home.
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SessionError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Minimal error logging - no stack traces in production
    if (process.env.NODE_ENV === "production") {
      // Log error code only for monitoring
    }
  }, [error]);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-[#081C15]">
      <div className="max-w-sm w-full text-center space-y-6">
        {/* Soft icon */}
        <div className="w-16 h-16 mx-auto rounded-full bg-white/10 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-white/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Supportive message */}
        <div className="space-y-2">
          <h1 className="text-lg font-medium text-white">
            Session interrupted
          </h1>
          <p className="text-sm text-white/60">
            Something went wrong with your voice session. Let&apos;s get you back on track.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={reset}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
          >
            Try again
          </Button>

          <a
            href="/session"
            className="block text-sm text-white/50 hover:text-white/70 underline underline-offset-4"
          >
            Return to sessions
          </a>
        </div>
      </div>
    </div>
  );
}

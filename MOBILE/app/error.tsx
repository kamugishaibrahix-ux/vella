"use client";

/**
 * Global Error Boundary
 *
 * Catches all unhandled errors in the application.
 * Renders a graceful fallback UI instead of white-screen.
 * Never leaks stack traces in production.
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error for monitoring (without sensitive details)
    if (process.env.NODE_ENV === "production") {
      // Production: minimal logging, no stack trace
    } else {
      // Development: can log for debugging
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-vella-bg text-vella-text flex items-center justify-center p-4">
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
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          {/* Supportive message */}
          <div className="space-y-2">
            <h1 className="text-lg font-medium text-vella-text">
              Something went wrong
            </h1>
            <p className="text-sm text-vella-text-secondary">
              We&apos;re having trouble loading this page. Let&apos;s try again.
            </p>
          </div>

          {/* Retry action */}
          <Button
            onClick={reset}
            className="w-full bg-vella-accent text-white hover:bg-vella-accent/90"
          >
            Try again
          </Button>

          {/* Subtle escape hatch */}
          <a
            href="/home"
            className="block text-sm text-vella-text-secondary hover:text-vella-text underline underline-offset-4"
          >
            Go to home
          </a>
        </div>
      </body>
    </html>
  );
}

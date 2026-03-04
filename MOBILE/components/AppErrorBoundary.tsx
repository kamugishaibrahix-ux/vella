"use client";

/**
 * App Error Boundary
 *
 * Reusable error boundary for high-risk surfaces:
 * - Voice session components
 * - Realtime components
 * - Insights rendering
 * - Dynamic JSON rendering
 *
 * Catches errors and renders graceful fallback UI.
 * Supports retry via reset key pattern.
 */

import React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // In production, never log full error details
    if (process.env.NODE_ENV === "production") {
      // Minimal error tracking without stack traces
    } else {
      // Development: can log for debugging
    }
  }

  componentDidUpdate(prevProps: Props) {
    // Reset error state when resetKey changes
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="p-6 rounded-lg bg-vella-surface border border-vella-border text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-vella-accent/10 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-vella-accent"
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

          <div className="space-y-1">
            <h3 className="text-sm font-medium text-vella-text">
              Something went wrong
            </h3>
            <p className="text-xs text-vella-text-secondary">
              We couldn&apos;t load this part. Let&apos;s try again.
            </p>
          </div>

          <Button
            onClick={this.handleRetry}
            className="border border-vella-border text-vella-text hover:bg-vella-surface rounded-md px-3 py-1.5 text-sm"
          >
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook to provide reset key for error boundaries
 * Usage: const resetKey = useResetKey();
 * Then: <AppErrorBoundary resetKey={resetKey}>
 */
export function useResetKey(): number {
  const [key, setKey] = React.useState(0);

  const reset = React.useCallback(() => {
    setKey((k) => k + 1);
  }, []);

  // Return both as a combined key for convenience
  return key;
}

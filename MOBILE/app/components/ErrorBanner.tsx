import { cn } from "@/lib/utils";

type ErrorBannerProps = {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

export function ErrorBanner({
  message,
  onDismiss,
  onRetry,
  retryLabel = "Retry",
  className,
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-vella-button bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm flex items-center justify-between gap-2 dark:bg-red-950/30 dark:border-red-800 dark:text-red-200",
        className
      )}
    >
      <span className="min-w-0 flex-1">{message}</span>
      <div className="flex shrink-0 items-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-red-600 hover:text-red-800 font-medium pressable dark:text-red-300 dark:hover:text-red-100"
          >
            {retryLabel}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-red-600 hover:text-red-800 pressable dark:text-red-300"
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({
  message,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      <p className="text-vella-muted text-sm">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-vella-button bg-vella-accent text-white text-sm font-medium pressable"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

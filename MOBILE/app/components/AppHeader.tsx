import Link from "next/link";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  greeting?: string;
  date?: string;
  showAvatar?: boolean;
  title?: string;
  /** For non-home pages: simple title only */
  variant?: "home" | "simple";
  className?: string;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getDateString(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function AppHeader({
  greeting,
  date,
  showAvatar = true,
  title,
  variant = "home",
  className,
}: AppHeaderProps) {
  const isHome = variant === "home";
  const displayGreeting = greeting ?? getGreeting();
  const displayDate = date ?? getDateString();

  if (variant === "simple") {
    return (
      <header
        className={cn(
          "flex items-center justify-between py-6",
          className
        )}
      >
        <h1 className="text-xl font-semibold text-vella-text">{title ?? "Page"}</h1>
      </header>
    );
  }

  return (
    <header
      className={cn(
        "flex items-baseline justify-between gap-4 pt-6 pb-5 shrink-0",
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-vella-text tracking-tight">
          {displayGreeting}
        </h1>
        <p className="text-sm text-vella-muted mt-3">{displayDate}</p>
      </div>
      {showAvatar && (
        <Link
          href="/profile"
          className="shrink-0 w-10 h-10 rounded-full bg-vella-accent-soft flex items-center justify-center pressable"
          aria-label="Go to profile"
        >
          <span className="text-white font-medium text-sm">You</span>
        </Link>
      )}
    </header>
  );
}

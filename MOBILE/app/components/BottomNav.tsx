"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ClipboardList,
  MessageCircle,
  BookOpen,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/checkin", label: "Check-in", icon: ClipboardList },
  { href: "/session", label: "Vella", icon: MessageCircle },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/insights", label: "Insights", icon: Lightbulb },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center justify-around bg-vella-bg-card/95 backdrop-blur-sm border border-vella-border/50 border-b-0 rounded-t-[24px] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] py-2 px-2 safe-area-pb h-[80px]"
      role="navigation"
      aria-label="Main navigation"
    >
      {tabs.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href as "/home" | "/checkin" | "/session" | "/journal" | "/insights"}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-vella-button pressable min-w-[56px]",
              isActive ? "text-vella-accent" : "text-vella-muted"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon
              className={cn("w-6 h-6", isActive && "fill-vella-accent")}
              aria-hidden
            />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

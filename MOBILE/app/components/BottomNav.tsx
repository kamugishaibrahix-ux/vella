"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  MessageCircle,
  NotebookPen,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/home", label: "State", icon: Activity },
  { href: "/checkin", label: "Check", icon: CheckCircle2 },
  { href: "/session", label: "Vella", icon: MessageCircle },
  { href: "/journal", label: "Reflect", icon: NotebookPen },
  { href: "/insights", label: "Clarity", icon: Target },
];

const VELLA_INDEX = 2; // center tab index

export function BottomNav() {
  const pathname = usePathname();

  // Find active non-center tab index for pill positioning
  const activeIndex = tabs.findIndex((t) => t.href === pathname);
  const showPill = activeIndex >= 0 && activeIndex !== VELLA_INDEX;

  // Pill offset: each tab is 1/5 of the bar width, pill centers in that slot
  // translateX = activeIndex * 100% of one slot width (handled via left %)
  const pillLeft = activeIndex >= 0 ? `${(activeIndex / tabs.length) * 100 + 100 / tabs.length / 2}%` : "0%";

  return (
    <nav
      className="relative flex items-center justify-around backdrop-blur-md rounded-t-2xl pt-2 px-2 h-[80px]"
      style={{
        background: "rgba(255,255,255,0.7)",
        borderTop: "1px solid rgba(0,0,0,0.05)",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.04)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Sliding active pill indicator */}
      <span
        className="absolute bottom-[6px] h-[3px] w-6 rounded-full bg-[var(--vella-primary)]"
        style={{
          left: pillLeft,
          transform: "translateX(-50%)",
          transition: "left 250ms ease",
          opacity: showPill ? 1 : 0,
        }}
        aria-hidden
      />

      {tabs.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href;
        const isVella = href === "/session";

        if (isVella) {
          return (
            <Link
              key={href}
              href={href as "/session"}
              className="relative flex flex-col items-center justify-center min-w-[56px] pressable"
              style={{ marginTop: -10 }}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 60,
                  height: 60,
                  background: "var(--vella-primary, #2E6B5F)",
                  boxShadow: "0 4px 14px rgba(46,107,95,0.30)",
                  transition: "transform 200ms ease",
                  transform: isActive ? "scale(1.05)" : "scale(1)",
                }}
              >
                <Icon className="w-6 h-6 text-white" aria-hidden />
              </span>
              <span className="text-[10px] font-medium text-white mt-1"
                style={{ color: "var(--vella-primary)" }}
              >
                {label}
              </span>
            </Link>
          );
        }

        return (
          <Link
            key={href}
            href={href as "/home" | "/checkin" | "/journal" | "/insights"}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[56px] pressable",
              isActive ? "text-[var(--vella-primary)]" : "text-gray-500"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="w-6 h-6" aria-hidden />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

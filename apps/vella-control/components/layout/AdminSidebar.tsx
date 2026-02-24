"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  Bot,
  CreditCard,
  FileText,
  LayoutDashboard,
  Library,
  LineChart,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Users", href: "/users", icon: Users },
  { label: "AI Configuration", href: "/ai-configuration", icon: Bot },
  { label: "Content Library", href: "/content-library", icon: Library },
  { label: "Insights & Analytics", href: "/insights", icon: LineChart },
  { label: "Feedback & Reports", href: "/feedback", icon: FileText },
  { label: "Subscriptions", href: "/subscriptions", icon: CreditCard },
  { label: "System Settings", href: "/system-settings", icon: Settings },
  { label: "Logs & Monitoring", href: "/logs", icon: Activity },
];

export function AdminSidebar() {
  const [pathname, setPathname] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updatePath = () => setPathname(window.location.pathname);
    updatePath();

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function pushState(this: History, ...args: Parameters<typeof originalPushState>) {
      const result = originalPushState.apply(
        this,
        args,
      );
      updatePath();
      return result;
    } as typeof window.history.pushState;

    window.history.replaceState = function replaceState(this: History, ...args: Parameters<typeof originalReplaceState>) {
      const result = originalReplaceState.apply(
        this,
        args,
      );
      updatePath();
      return result;
    } as typeof window.history.replaceState;

    window.addEventListener("popstate", updatePath);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", updatePath);
    };
  }, []);

  return (
    <div className="flex h-full flex-col text-slate-100">
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 font-semibold text-white">
          VC
        </div>
        <div>
          <p className="font-semibold">Vella Control</p>
          <p className="text-xs text-slate-400">Admin Console</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-6 py-4 text-xs text-slate-500">
        © {new Date().getFullYear()} Vella
      </div>
    </div>
  );
}



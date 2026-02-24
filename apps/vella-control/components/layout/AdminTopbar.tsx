"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/components/theme-provider";
import { AdminBadge } from "@/components/AdminBadge";

type AdminTopbarProps = {
  children?: ReactNode;
};

export function AdminTopbar({ children }: AdminTopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const handleToggleTheme = () => {
    toggleTheme();
    setOpen(false);
  };

  const closeMenu = () => setOpen(false);

  return (
    <header className="vc-topbar sticky top-0 z-20 flex h-16 items-center justify-between px-6 backdrop-blur">
      <div className="text-sm font-semibold vc-heading">
        {children ?? "Page title"}
      </div>
      <div className="flex items-center gap-4">
        <AdminBadge />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="vc-icon-button rounded-full p-2"
        >
          <Bell className="h-5 w-5" />
          <span className="sr-only">Notifications</span>
        </Button>
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            className="vc-icon-button relative h-11 w-11 rounded-full border border-[color:var(--vc-border-subtle)] bg-[color:var(--vc-surface)] p-0 text-[color:var(--vc-text-primary)]"
            onClick={() => setOpen((prev) => !prev)}
          >
            <Avatar className="h-10 w-10">
              <AvatarFallback>AD</AvatarFallback>
            </Avatar>
            <span className="sr-only">Open admin menu</span>
          </Button>
          {open && (
            <div className="absolute right-0 top-12 w-64 rounded-xl border border-[var(--vc-border)] bg-[var(--vc-card)] p-4 shadow-lg">
              <div className="mb-3 border-b border-[var(--vc-border)] pb-3">
                <p className="font-semibold text-[var(--vc-text)]">
                  Ariana Diaz
                </p>
                <p className="text-sm text-[var(--vc-subtle)]">admin@vella.ai</p>
                <p className="text-sm text-[var(--vc-subtle)]">
                  Role: Super Admin
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={closeMenu}
                  className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--vc-surface-muted)] transition"
                >
                  Account Settings
                </button>
                <button
                  type="button"
                  onClick={handleToggleTheme}
                  className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--vc-surface-muted)] transition"
                >
                  {theme === "light"
                    ? "Switch to Dark Theme"
                    : "Switch to Light Theme"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await fetch("/api/auth/logout", { method: "POST" });
                      window.location.href = "/login";
                    } catch (error) {
                      console.error("[AdminTopbar] Logout error", error);
                      window.location.href = "/login";
                    }
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-rose-500 hover:bg-[var(--vc-surface-muted)] transition"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}


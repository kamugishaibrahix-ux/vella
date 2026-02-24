"use client";

import { useState, useEffect } from "react";
import { Settings, Download, Trash2, ChevronRight, Sun, Moon } from "lucide-react";

const MOCK_USER = {
  name: "Vella User",
  email: "user@example.com",
  plan: "Free plan",
};

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = document.documentElement;
    const isDark = root.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex rounded-full border border-neutral-200 bg-vella-bg p-0.5"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
          theme === "light"
            ? "bg-neutral-100 text-vella-text"
            : "text-neutral-500 hover:text-vella-text"
        }`}
      >
        <Sun className="w-4 h-4" strokeWidth={1.8} />
        Light
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
          theme === "dark"
            ? "bg-neutral-100 text-vella-text dark:bg-neutral-700 dark:text-vella-text"
            : "text-neutral-500 hover:text-vella-text"
        }`}
      >
        <Moon className="w-4 h-4" strokeWidth={1.8} />
        Dark
      </button>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="px-5 py-6 space-y-6">
      {/* 1. Header */}
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-vella-text">Profile</h1>
        <ThemeToggle />
      </header>

      {/* 2. User identity block */}
      <div className="flex items-center gap-4 mt-6">
        <div className="w-14 h-14 shrink-0 rounded-full bg-neutral-100 flex items-center justify-center text-lg font-semibold text-vella-text">
          V
        </div>
        <div className="min-w-0">
          <div className="font-medium text-vella-text">{MOCK_USER.name}</div>
          <div className="text-sm text-neutral-500">{MOCK_USER.email}</div>
          <div className="text-sm text-neutral-500">{MOCK_USER.plan}</div>
        </div>
      </div>

      {/* 3. Divider */}
      <div className="border-t border-neutral-200 my-6" />

      {/* 4. Settings & Plan card */}
      <button
        type="button"
        className="w-full rounded-2xl border border-neutral-200 bg-vella-bg-card p-4 flex items-center justify-between text-left transition-colors duration-150 hover:bg-neutral-50 cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Settings className="w-5 h-5 shrink-0 text-vella-text" strokeWidth={1.8} />
          <div className="min-w-0">
            <div className="font-medium text-vella-text">Settings & Plan</div>
            <div className="text-sm text-neutral-500">
              Manage your plan, privacy, and preferences
            </div>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 shrink-0 text-neutral-400" strokeWidth={1.8} />
      </button>

      {/* 5. Account section card */}
      <div className="rounded-2xl border border-neutral-200 bg-vella-bg-card p-4 space-y-4">
        <div>
          <div className="font-medium text-vella-text">Account</div>
          <div className="text-sm text-neutral-500">Manage your account data</div>
        </div>

        <button
          type="button"
          className="w-full flex items-start gap-3 text-left transition-colors duration-150 hover:opacity-90 cursor-pointer"
        >
          <Download className="w-5 h-5 shrink-0 mt-0.5 text-vella-text" strokeWidth={1.8} />
          <div className="min-w-0">
            <div className="font-medium text-vella-text">Export account data</div>
            <div className="text-sm text-neutral-500">
              Download all your journals, check-ins, and sessions
            </div>
          </div>
        </button>

        <div className="border-t border-neutral-200" />

        <button
          type="button"
          className="w-full flex items-start gap-3 text-left transition-colors duration-150 hover:opacity-90 cursor-pointer"
        >
          <Trash2 className="w-5 h-5 shrink-0 mt-0.5 text-red-600" strokeWidth={1.8} />
          <div className="min-w-0">
            <div className="font-medium text-red-600">Permanently remove all your data</div>
          </div>
        </button>
      </div>

      {/* 6. Privacy section card */}
      <button
        type="button"
        className="w-full rounded-2xl border border-neutral-200 bg-vella-bg-card p-4 flex items-center justify-between text-left transition-colors duration-150 hover:bg-neutral-50 cursor-pointer"
      >
        <div className="min-w-0">
          <div className="font-medium text-vella-text">Privacy</div>
          <div className="text-sm text-neutral-500">How your data is handled</div>
        </div>
        <ChevronRight className="w-5 h-5 shrink-0 text-neutral-400" strokeWidth={1.8} />
      </button>
    </div>
  );
}

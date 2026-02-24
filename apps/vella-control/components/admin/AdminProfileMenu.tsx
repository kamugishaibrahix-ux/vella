"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/components/theme-provider";
import { motion, AnimatePresence } from "framer-motion";

export function AdminProfileMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  // Close menu on outside click
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = () => setOpen((p) => !p);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={toggle}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-[13px] font-medium shadow-md transition hover:opacity-80"
      >
        AD
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-12 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-4"
          >
            <div className="mb-3 border-b border-slate-200 dark:border-slate-700 pb-3">
              <p className="font-semibold text-slate-900 dark:text-slate-100">Ariana Diaz</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">admin@vella.ai</p>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Role: Super Admin
              </p>
            </div>

            <div className="space-y-3">
              <button className="w-full text-left text-sm hover:text-sky-500 transition">
                Account Settings
              </button>

              <button
                className="w-full text-left text-sm hover:text-sky-500 transition"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                {theme === "light" ? "Switch to Dark Theme" : "Switch to Light Theme"}
              </button>

              <button className="w-full text-left text-sm text-red-500 hover:opacity-80 transition">
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


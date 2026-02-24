"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = "vc-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  const applyTheme = useCallback((value: Theme) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", value === "dark");
    root.setAttribute("data-theme", value);
  }, []);

  const setTheme = useCallback((value: Theme) => {
    setThemeState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
    applyTheme(value);
  }, [applyTheme]);

  const toggleTheme = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
  }, [theme, setTheme]);

  // Initial load (runs once)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial = stored === "dark" ? "dark" : "light";
    setTheme(initial);
  }, [setTheme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

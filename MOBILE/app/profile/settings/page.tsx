"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Palette, Globe, Moon, Sun, ChevronRight, Crown, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEntitlements } from "@/hooks/useEntitlements";
import { TokenUsageDisplay } from "@/components/TokenUsageDisplay";
import { getPlanLabel, getPlanBadgeStyles } from "@/lib/plans/uiTierModel";
import type { PlanTier } from "@/lib/plans/types";

// Types
type Theme = "light" | "dark" | "system";
type Language = "en" | "es" | "fr" | "de" | "ja";

interface SettingsState {
  theme: Theme;
  language: Language;
  reducedMotion: boolean;
}

// Storage keys
const SETTINGS_KEY = "vella_settings_v1";

// Language labels
const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  ja: "日本語",
};

// Components
function ThemeToggle({
  value,
  onChange,
}: {
  value: Theme;
  onChange: (theme: Theme) => void;
}) {
  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Light", icon: <Sun className="w-4 h-4" /> },
    { value: "dark", label: "Dark", icon: <Moon className="w-4 h-4" /> },
    { value: "system", label: "Auto", icon: <Palette className="w-4 h-4" /> },
  ];

  return (
    <div 
      className="inline-flex rounded-xl border p-1"
      style={{ borderColor: "var(--vella-border)", backgroundColor: "var(--vella-bg-card)" }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
            value === opt.value
              ? "shadow-sm"
              : "hover:opacity-80"
          )}
          style={
            value === opt.value
              ? { backgroundColor: "var(--vella-primary)", color: "white" }
              : { color: "var(--vella-muted)" }
          }
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onClick,
  action,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  onClick?: () => void;
  action?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-3 px-1 text-left hover:bg-neutral-50 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-3">
        <div 
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--vella-bg)", color: "var(--vella-muted)" }}
        >
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <div className="font-medium" style={{ color: "var(--vella-text)" }}>{title}</div>
            {badge}
          </div>
          {subtitle && <div className="text-sm text-neutral-500">{subtitle}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {value && <span className="text-sm text-neutral-500">{value}</span>}
        {action || <ChevronRight className="w-5 h-5 text-neutral-400" />}
      </div>
    </button>
  );
}

// Plan icon helper
function PlanIcon({ tier }: { tier: PlanTier }) {
  const className = "w-5 h-5";
  switch (tier) {
    case "elite":
      return <Crown className={className} />;
    case "pro":
      return <Zap className={className} />;
    default:
      return <Sparkles className={className} />;
  }
}

// Main Page
export default function SettingsPage() {
  const router = useRouter();
  const { plan: currentPlan, isLoading: planLoading } = useEntitlements();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<SettingsState>({
    theme: "system",
    language: "en",
    reducedMotion: false,
  });

  useEffect(() => {
    setMounted(true);

    // Load settings
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const saveSettings = (updates: Partial<SettingsState>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    } catch {
      // Ignore storage errors
    }

    // Apply theme change
    if (updates.theme) {
      applyTheme(updates.theme);
    }
  };

  const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) root.classList.add("dark");
    } else if (theme === "dark") {
      root.classList.add("dark");
    }
    // light = no class (default)
  };

  // Get plan badge styles
  const planStyles = getPlanBadgeStyles(currentPlan || "free");
  const planLabel = getPlanLabel(currentPlan || "free");

  if (!mounted) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <div className="px-5 py-6">
          <div className="h-8 w-32 bg-neutral-200 rounded animate-pulse mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-white rounded-xl border border-neutral-200 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="px-5 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center gap-3">
          <button
            onClick={() => router.push("/profile")}
            className="p-2 -ml-2 rounded-lg hover:bg-neutral-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-700" />
          </button>
          <h1 className="text-xl font-semibold text-neutral-900">Settings & Plan</h1>
        </header>

        {/* Appearance Section */}
        <section 
          className="rounded-2xl border p-5 shadow-sm"
          style={{ borderColor: "var(--vella-border)", backgroundColor: "var(--vella-bg-card)" }}
        >
          <h2 
            className="text-sm font-semibold uppercase tracking-wide mb-4"
            style={{ color: "var(--vella-muted)" }}
          >
            Appearance
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--vella-bg)", color: "var(--vella-muted)" }}
                >
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium" style={{ color: "var(--vella-text)" }}>Theme</div>
                  <div className="text-sm text-neutral-500">Choose your preferred look</div>
                </div>
              </div>
              <ThemeToggle value={settings.theme} onChange={(t) => saveSettings({ theme: t })} />
            </div>
          </div>
        </section>

        {/* Language Section */}
        <section 
          className="rounded-2xl border p-5 shadow-sm"
          style={{ borderColor: "var(--vella-border)", backgroundColor: "var(--vella-bg-card)" }}
        >
          <h2 
            className="text-sm font-semibold uppercase tracking-wide mb-4"
            style={{ color: "var(--vella-muted)" }}
          >
            Language
          </h2>

          <SettingRow
            icon={<Globe className="w-5 h-5" />}
            title="App Language"
            subtitle="Select your preferred language"
            value={LANGUAGE_LABELS[settings.language]}
            onClick={() => {
              const langs: Language[] = ["en", "es", "fr", "de", "ja"];
              const currentIndex = langs.indexOf(settings.language);
              const nextLang = langs[(currentIndex + 1) % langs.length];
              saveSettings({ language: nextLang });
            }}
          />
        </section>

        {/* Plan Section - UPDATED */}
        <section 
          className="rounded-2xl border p-5 shadow-sm"
          style={{ borderColor: "var(--vella-border)", backgroundColor: "var(--vella-bg-card)" }}
        >
          <h2 
            className="text-sm font-semibold uppercase tracking-wide mb-4"
            style={{ color: "var(--vella-muted)" }}
          >
            Subscription
          </h2>

          {/* Current Plan Badge */}
          <div className="flex items-center justify-between py-3 mb-4">
            <div className="flex items-center gap-3">
              <div 
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center border",
                  planStyles.background,
                  planStyles.border,
                  planStyles.text
                )}
              >
                <PlanIcon tier={currentPlan || "free"} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-medium" style={{ color: "var(--vella-text)" }}>
                    {planLoading ? "Loading..." : `${planLabel} Plan`}
                  </div>
                  <span 
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium border",
                      planStyles.background,
                      planStyles.text,
                      planStyles.border
                    )}
                  >
                    Current
                  </span>
                </div>
                <div className="text-sm text-neutral-500">
                  {currentPlan === "free" 
                    ? "Upgrade for premium features" 
                    : "You have an active subscription"}
                </div>
              </div>
            </div>
          </div>

          {/* Token Usage Display */}
          <div className="mb-4">
            <TokenUsageDisplay variant="compact" />
          </div>

          {/* Upgrade CTA */}
          {currentPlan !== "elite" && (
            <button
              onClick={() => router.push("/profile/upgrade")}
              className="w-full py-3 px-4 rounded-xl font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: "var(--vella-primary)" }}
            >
              {currentPlan === "free" ? "Upgrade Plan" : "Upgrade to Elite"}
            </button>
          )}
        </section>

        {/* Accessibility Section */}
        <section 
          className="rounded-2xl border p-5 shadow-sm"
          style={{ borderColor: "var(--vella-border)", backgroundColor: "var(--vella-bg-card)" }}
        >
          <h2 
            className="text-sm font-semibold uppercase tracking-wide mb-4"
            style={{ color: "var(--vella-muted)" }}
          >
            Accessibility
          </h2>

          <div className="flex items-center justify-between py-3">
            <div>
              <div className="font-medium" style={{ color: "var(--vella-text)" }}>Reduce Motion</div>
              <div className="text-sm text-neutral-500">Minimize animations</div>
            </div>
            <button
              onClick={() => saveSettings({ reducedMotion: !settings.reducedMotion })}
              className={cn(
                "w-12 h-7 rounded-full transition-colors relative",
                settings.reducedMotion ? "bg-neutral-900" : "bg-neutral-300"
              )}
            >
              <span
                className={cn(
                  "absolute top-1 w-5 h-5 rounded-full bg-white transition-transform",
                  settings.reducedMotion ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </section>

        {/* Info Footer */}
        <footer className="text-center text-xs text-neutral-400 pt-4 space-y-1">
          <p>Settings are stored locally on this device.</p>
          <p>Vella respects your privacy.</p>
        </footer>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, Mail, MessageSquare, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface NotificationSettings {
  dailyReminder: boolean;
  weeklyInsights: boolean;
  newFeatureAnnouncements: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

// Storage key
const NOTIFICATIONS_KEY = "vella_notifications_v1";

// Components
function ToggleRow({
  icon,
  title,
  subtitle,
  enabled,
  onToggle,
  comingSoon = false,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  enabled: boolean;
  onToggle: () => void;
  comingSoon?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between py-3", comingSoon && "opacity-60")}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-900">{title}</span>
            {comingSoon && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                Coming soon
              </span>
            )}
          </div>
          {subtitle && <div className="text-sm text-neutral-500">{subtitle}</div>}
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={comingSoon}
        className={cn(
          "w-12 h-7 rounded-full transition-colors relative",
          enabled ? "bg-neutral-900" : "bg-neutral-300",
          comingSoon && "cursor-not-allowed opacity-50"
        )}
      >
        <span
          className={cn(
            "absolute top-1 w-5 h-5 rounded-full bg-white transition-transform",
            enabled ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}

// Main Page
export default function NotificationsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({
    dailyReminder: true,
    weeklyInsights: true,
    newFeatureAnnouncements: false,
    emailNotifications: false,
    pushNotifications: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
  });

  useEffect(() => {
    setMounted(true);

    // Load saved settings
    try {
      const saved = localStorage.getItem(NOTIFICATIONS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const updateSetting = <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    try {
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(newSettings));
    } catch {
      // Ignore storage errors
    }
  };

  const toggleSetting = (key: keyof NotificationSettings) => {
    const current = settings[key];
    if (typeof current === "boolean") {
      updateSetting(key, !current as NotificationSettings[typeof key]);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <div className="px-5 py-6">
          <div className="h-8 w-32 bg-neutral-200 rounded animate-pulse mb-6" />
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
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
          <h1 className="text-xl font-semibold text-neutral-900">Notifications</h1>
        </header>

        {/* Notification Types */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">
            Notification Types
          </h2>

          <div className="divide-y divide-neutral-100">
            <ToggleRow
              icon={<Clock className="w-5 h-5" />}
              title="Daily Check-in Reminder"
              subtitle="Gentle nudge for your daily reflection"
              enabled={settings.dailyReminder}
              onToggle={() => toggleSetting("dailyReminder")}
              comingSoon
            />

            <ToggleRow
              icon={<Calendar className="w-5 h-5" />}
              title="Weekly Insights"
              subtitle="Your weekly patterns and progress"
              enabled={settings.weeklyInsights}
              onToggle={() => toggleSetting("weeklyInsights")}
              comingSoon
            />

            <ToggleRow
              icon={<Bell className="w-5 h-5" />}
              title="New Features"
              subtitle="Updates about new capabilities"
              enabled={settings.newFeatureAnnouncements}
              onToggle={() => toggleSetting("newFeatureAnnouncements")}
              comingSoon
            />
          </div>
        </section>

        {/* Channels */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">
            Channels
          </h2>

          <div className="divide-y divide-neutral-100">
            <ToggleRow
              icon={<MessageSquare className="w-5 h-5" />}
              title="Push Notifications"
              subtitle="In-app and device notifications"
              enabled={settings.pushNotifications}
              onToggle={() => toggleSetting("pushNotifications")}
              comingSoon
            />

            <ToggleRow
              icon={<Mail className="w-5 h-5" />}
              title="Email Notifications"
              subtitle="Updates sent to your email"
              enabled={settings.emailNotifications}
              onToggle={() => toggleSetting("emailNotifications")}
              comingSoon
            />
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              Notification delivery is coming soon. Your preferences are saved for when this feature launches.
            </p>
          </div>
        </section>

        {/* Quiet Hours Info */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">
            Quiet Hours
          </h2>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium text-neutral-900">Scheduled Quiet Time</div>
              <div className="text-sm text-neutral-500">{settings.quietHoursStart} - {settings.quietHoursEnd}</div>
            </div>
            <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-1 rounded">
              Default
            </span>
          </div>

          <p className="text-sm text-neutral-500 mt-3">
            Notifications are silenced during these hours. This setting is stored locally and
            applies to this device only.
          </p>
        </section>

        {/* Info Footer */}
        <footer className="text-center text-xs text-neutral-400 pt-4">
          <p>Notification preferences are stored locally.</p>
          <p className="mt-1">No notification data is sent to any server.</p>
        </footer>
      </div>
    </div>
  );
}

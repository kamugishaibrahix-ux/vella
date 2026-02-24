"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { SectionHeader } from "@/components/admin/SectionHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SystemSettingsConfig } from "@/lib/admin/systemSettings";

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSettingsConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/system-settings/get", { cache: "no-store" });
        const json = await response.json();

        if (!response.ok || !json.success) {
          throw new Error(json.error ?? "Failed to load system settings");
      }

        setSettings(json.data);
      } catch (err) {
        console.error("[SystemSettingsPage] Failed to load settings", err);
        setError(err instanceof Error ? err.message : "Failed to load system settings");
      } finally {
        setIsLoading(false);
      }
    };

    void loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/admin/system-settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error ?? "Failed to save system settings");
      }

      setSaveMessage("Settings saved successfully");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error("[SystemSettingsPage] Failed to save settings", err);
      setError(err instanceof Error ? err.message : "Failed to save system settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8 text-[var(--vc-text)]">
        <SectionHeader title="System Settings" description="Configure system-wide flags and limits." />
        <div className="py-12 text-center text-sm text-muted-foreground">Loading settings...</div>
          </div>
    );
  }

  if (!settings) {
    return (
      <div className="space-y-8 text-[var(--vc-text)]">
        <SectionHeader title="System Settings" description="Configure system-wide flags and limits." />
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Failed to load system settings"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-[var(--vc-text)]">
      <SectionHeader
        title="System Settings"
        description="Configure system-wide flags and limits."
        actions={
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        }
      />

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {saveMessage ? (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-sm text-green-500">
          {saveMessage}
        </div>
      ) : null}

      <div className="space-y-8">
        <section className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-6 backdrop-blur-sm">
          <h2 className="mb-6 text-lg font-semibold">Global Flags</h2>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="maintenanceMode">Maintenance Mode</Label>
                <p className="text-sm text-muted-foreground">Disable user access during maintenance</p>
          </div>
              <Switch
                id="maintenanceMode"
                checked={settings.maintenanceMode}
                onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enableVoice">Enable Voice</Label>
                <p className="text-sm text-muted-foreground">Allow voice interactions</p>
              </div>
              <Switch
                id="enableVoice"
                checked={settings.enableVoice}
                onCheckedChange={(checked) => setSettings({ ...settings, enableVoice: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enableRealtime">Enable Realtime</Label>
                <p className="text-sm text-muted-foreground">Allow realtime voice sessions</p>
          </div>
              <Switch
                id="enableRealtime"
                checked={settings.enableRealtime}
                onCheckedChange={(checked) => setSettings({ ...settings, enableRealtime: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="enableMusicMode">Enable Music Mode</Label>
                <p className="text-sm text-muted-foreground">Allow music generation features</p>
            </div>
            <Switch
                id="enableMusicMode"
                checked={settings.enableMusicMode}
                onCheckedChange={(checked) => setSettings({ ...settings, enableMusicMode: checked })}
            />
          </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-6 backdrop-blur-sm">
          <h2 className="mb-6 text-lg font-semibold">Limits</h2>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="maxTokensPerMessage">Max Tokens Per Message</Label>
              <Input
                id="maxTokensPerMessage"
                type="number"
                min={100}
                max={10000}
                value={settings.maxTokensPerMessage}
                onChange={(e) =>
                  setSettings({ ...settings, maxTokensPerMessage: parseInt(e.target.value, 10) || 2000 })
                }
              />
              <p className="text-sm text-muted-foreground">Maximum tokens allowed per user message</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxDailyTokensPerUser">Max Daily Tokens Per User</Label>
              <Input
                id="maxDailyTokensPerUser"
                type="number"
                min={1000}
                max={1000000}
                value={settings.maxDailyTokensPerUser}
                onChange={(e) =>
                  setSettings({ ...settings, maxDailyTokensPerUser: parseInt(e.target.value, 10) || 20000 })
                }
              />
              <p className="text-sm text-muted-foreground">Maximum tokens allowed per user per day</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

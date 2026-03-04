"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Settings,
  Download,
  Trash2,
  ChevronRight,
  Bell,
  Shield,
  Lock,
  User,
  Crown,
  AlertTriangle,
  Sparkles,
  Zap,
  ArrowLeft,
} from "lucide-react";
import { loadLocal, saveLocal } from "@/lib/local/storage";
import { loadVellaLocalProfile, saveVellaLocalProfile } from "@/lib/local/vellaLocalProfile";
import { ensureUserId } from "@/lib/local/ensureUserId";
import { useLockState } from "@/lib/security/lockState";
import { cn } from "@/lib/utils";
import { TokenUsageDisplay } from "@/components/TokenUsageDisplay";
import { getPlanLabel as getUiPlanLabel, getPlanBadgeStyles as getUiPlanBadgeStyles } from "@/lib/plans/uiTierModel";
import type { PlanTier } from "@/lib/plans/types";

// Types
interface ProfileData {
  displayName: string;
  vellaId: string;
  email: string | null;
  plan: "free" | "pro" | "elite" | "local";
  hasSession: boolean;
}

// Storage keys
const PROFILE_STORAGE_KEY = "profile_data_v1";
const AVATAR_STORAGE_KEY = "profile_avatar_v1";

// Utilities
function truncateVellaId(id: string): string {
  if (!id) return "unknown";
  return id.slice(0, 8).toUpperCase();
}

function getInitials(name: string): string {
  if (!name) return "V";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getPlanBadgeStyles(plan: ProfileData["plan"]): string {
  switch (plan) {
    case "elite":
      return "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 border-amber-200";
    case "pro":
      return "bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 border-blue-200";
    case "free":
      return "bg-neutral-100 text-neutral-700 border-neutral-200";
    default:
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
}

function getPlanLabel(plan: ProfileData["plan"]): string {
  switch (plan) {
    case "elite":
      return "Elite";
    case "pro":
      return "Pro";
    case "free":
      return "Free";
    default:
      return "Local mode";
  }
}

// Components
function AvatarSection({
  displayName,
  avatarDataUrl,
  onAvatarChange,
}: {
  displayName: string;
  avatarDataUrl: string | null;
  onAvatarChange: (dataUrl: string | null) => void;
}) {
  const fileInputRef = useCallback((node: HTMLInputElement | null) => {
    // No-op, just for potential future use
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        onAvatarChange(dataUrl);
        saveLocal(AVATAR_STORAGE_KEY, dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative">
      <label className="cursor-pointer group block">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-neutral-200 bg-neutral-100 flex items-center justify-center transition-all duration-200 group-hover:border-neutral-300 group-hover:shadow-md">
          {avatarDataUrl ? (
            <Image
              src={avatarDataUrl}
              alt="Profile"
              width={80}
              height={80}
              className="w-full h-full object-cover"
              unoptimized
            />
          ) : (
            <span className="text-2xl font-semibold text-neutral-600">
              {getInitials(displayName)}
            </span>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center">
            <User className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </div>
        </div>
      </label>
    </div>
  );
}

function EditableDisplayName({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.focus();
  }, []);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onChange(trimmed);
      saveVellaLocalProfile({ displayName: trimmed });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="text-lg font-semibold text-neutral-900 bg-white border border-neutral-300 rounded-lg px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-neutral-400"
          maxLength={32}
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="group flex items-center gap-2 text-lg font-semibold text-neutral-900 hover:text-neutral-700 transition-colors"
    >
      {value || "Vella User"}
      <span className="opacity-0 group-hover:opacity-100 text-sm text-neutral-400 transition-opacity">
        (edit)
      </span>
    </button>
  );
}

function ExportDataModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Collect all local data
      const userId = ensureUserId();
      const data: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        userId,
        version: "1.0",
      };

      // Get all localStorage keys with our namespace
      const namespace = "vella_local_v1";
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(namespace)) {
          try {
            const value = localStorage.getItem(key);
            if (value) {
              data[key] = JSON.parse(value);
            }
          } catch {
            // Skip non-JSON values
          }
        }
      }

      // Create and download file
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vella-export-${userId.slice(0, 8)}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <Download className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Export your data</h3>
            <p className="text-sm text-neutral-500">Download all your local data</p>
          </div>
        </div>
        <p className="text-sm text-neutral-600 mb-6">
          This will download a JSON file containing all your journals, check-ins, sessions, and
          settings stored locally on this device.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl border border-neutral-200 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            {isExporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteDataModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  if (!isOpen) return null;

  const canDelete = confirmText === "DELETE";

  const handleDelete = async () => {
    if (!canDelete) return;
    setIsDeleting(true);
    try {
      // Clear all vella_local_v1 namespace data
      const namespace = "vella_local_v1";
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(namespace)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      // Clear lock state (separate namespace)
      localStorage.removeItem("vella.lock.enabled");
      localStorage.removeItem("vella.lock.hash");
      localStorage.removeItem("vella.lock.salt");
      localStorage.removeItem("vella.lock.lastUnlock");
      localStorage.removeItem("vella.lock.requireAfterMinutes");

      // Clear profile data
      localStorage.removeItem("vella_local_profile_v1");

      // Clear settings
      localStorage.removeItem("vella_settings_v1");

      // Clear notification preferences
      localStorage.removeItem("vella_notifications_v1");

      // Clear avatar
      localStorage.removeItem(AVATAR_STORAGE_KEY);

      // Clear export data key if exists
      localStorage.removeItem(PROFILE_STORAGE_KEY);

      // Reload to reset app state (ensureUserId will generate new anonUserId)
      window.location.href = "/home";
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Delete failed. Please try again.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900">Delete all data?</h3>
            <p className="text-sm text-red-600">This cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-neutral-600 mb-4">
          This will permanently delete all your journals, check-ins, sessions, and settings from
          this device. Type <strong>DELETE</strong> to confirm.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE"
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg mb-4 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-400"
        />
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl border border-neutral-200 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || isDeleting}
            className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Main Page Component
export default function ProfilePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    displayName: "Vella User",
    vellaId: "",
    email: null,
    plan: "local",
    hasSession: false,
  });
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { enabled: lockEnabled } = useLockState();

  useEffect(() => {
    setMounted(true);

    // Load profile data
    const vellaId = ensureUserId();
    const localProfile = loadVellaLocalProfile();
    const savedAvatar = loadLocal<string>(AVATAR_STORAGE_KEY, null);

    // Check for Supabase session (async)
    const loadSession = async () => {
      try {
        // Dynamic import to avoid SSR issues
        const { supabase } = await import("@/lib/supabase/client");
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user) {
            const user = data.session.user;
            // Get plan from subscriptions
            const { data: subData } = await supabase
              .from("subscriptions")
              .select("plan")
              .eq("user_id", user.id)
              .maybeSingle();

            const subPlan = (subData as { plan: string | null } | null)?.plan;

            setProfile({
              displayName: localProfile?.displayName || user.user_metadata?.display_name || "Vella User",
              vellaId,
              email: user.email || null,
              plan: subPlan === "elite" ? "elite" : subPlan === "pro" ? "pro" : "free",
              hasSession: true,
            });
          } else {
            setProfile({
              displayName: localProfile?.displayName || "Vella User",
              vellaId,
              email: null,
              plan: "local",
              hasSession: false,
            });
          }
        } else {
          setProfile({
            displayName: localProfile?.displayName || "Vella User",
            vellaId,
            email: null,
            plan: "local",
            hasSession: false,
          });
        }
      } catch {
        // Fallback to local-only
        setProfile({
          displayName: localProfile?.displayName || "Vella User",
          vellaId,
          email: null,
          plan: "local",
          hasSession: false,
        });
      }
    };

    if (savedAvatar) setAvatarDataUrl(savedAvatar);
    loadSession();
  }, []);

  const handleDisplayNameChange = (newName: string) => {
    setProfile((prev) => ({ ...prev, displayName: newName }));
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <div className="px-5 py-6">
          <div className="h-8 w-32 bg-neutral-200 rounded animate-pulse mb-6" />
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-neutral-200 animate-pulse" />
            <div className="space-y-2">
              <div className="h-6 w-32 bg-neutral-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-neutral-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="px-5 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="p-1 rounded-full hover:bg-neutral-200/50 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-neutral-700" />
            </button>
            <h1 className="text-xl font-semibold text-stone-700">Profile</h1>
          </div>
          {lockEnabled && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
              <Lock className="w-3.5 h-3.5" />
              <span>Locked</span>
            </div>
          )}
        </header>

        {/* Identity Card */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <AvatarSection
              displayName={profile.displayName}
              avatarDataUrl={avatarDataUrl}
              onAvatarChange={setAvatarDataUrl}
            />
            <div className="min-w-0 flex-1">
              <EditableDisplayName
                value={profile.displayName}
                onChange={handleDisplayNameChange}
              />
              {profile.email && (
                <p className="text-sm text-neutral-500 truncate">{profile.email}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
                    getPlanBadgeStyles(profile.plan)
                  )}
                >
                  {profile.plan !== "local" && <Crown className="w-3 h-3" />}
                  {getPlanLabel(profile.plan)}
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  ID: {truncateVellaId(profile.vellaId)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Usage & Limits Card */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">
            Usage & Limits
          </h2>
          <TokenUsageDisplay variant="full" />
          
          {/* Quick upgrade CTA if not elite */}
          {profile.plan !== "elite" && (
            <button
              onClick={() => router.push("/profile/upgrade")}
              className="mt-4 w-full py-2.5 px-4 rounded-xl font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: "var(--vella-primary)" }}
            >
              {profile.plan === "free" ? "Upgrade to Pro" : "Upgrade to Elite"}
            </button>
          )}
        </div>

        {/* Navigation Cards */}
        <div className="space-y-3">
          {/* Settings */}
          <button
            onClick={() => router.push("/profile/settings")}
            className="w-full bg-white rounded-2xl border border-neutral-200 p-4 flex items-center justify-between text-left shadow-sm transition-all duration-200 hover:shadow-md hover:border-neutral-300"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                <Settings className="w-5 h-5 text-neutral-700" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-neutral-900">Settings</div>
                <div className="text-sm text-neutral-500">Manage your preferences & plan</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 shrink-0 text-neutral-400" />
          </button>

          {/* Upgrade Plan - only show if not elite */}
          {profile.plan !== "elite" && (
            <button
              onClick={() => router.push("/profile/upgrade")}
              className="w-full bg-white rounded-2xl border border-neutral-200 p-4 flex items-center justify-between text-left shadow-sm transition-all duration-200 hover:shadow-md hover:border-neutral-300"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center shrink-0">
                  <Crown className="w-5 h-5 text-violet-700" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-neutral-900">Upgrade Plan</div>
                  <div className="text-sm text-neutral-500">
                    {profile.plan === "free"
                      ? "Unlock voice and insights"
                      : "Explore Elite benefits"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">
                  Upgrade
                </span>
                <ChevronRight className="w-5 h-5 shrink-0 text-neutral-400" />
              </div>
            </button>
          )}

          {/* Notifications */}
          <button
            onClick={() => router.push("/profile/notifications")}
            className="w-full bg-white rounded-2xl border border-neutral-200 p-4 flex items-center justify-between text-left shadow-sm transition-all duration-200 hover:shadow-md hover:border-neutral-300"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-neutral-700" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-neutral-900">Notifications</div>
                <div className="text-sm text-neutral-500">Control your notification settings</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 shrink-0 text-neutral-400" />
          </button>

          {/* Privacy */}
          <button
            onClick={() => router.push("/profile/privacy")}
            className="w-full bg-white rounded-2xl border border-neutral-200 p-4 flex items-center justify-between text-left shadow-sm transition-all duration-200 hover:shadow-md hover:border-neutral-300"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-neutral-700" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-neutral-900">Privacy</div>
                <div className="text-sm text-neutral-500">How your data is handled</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 shrink-0 text-neutral-400" />
          </button>

          {/* Security / App Lock */}
          <button
            onClick={() => router.push("/profile/security")}
            className="w-full bg-white rounded-2xl border border-neutral-200 p-4 flex items-center justify-between text-left shadow-sm transition-all duration-200 hover:shadow-md hover:border-neutral-300"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-neutral-700" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-neutral-900">Security</div>
                <div className="text-sm text-neutral-500">
                  {lockEnabled ? "App Lock is enabled" : "Set up App Lock and PIN"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lockEnabled && (
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  On
                </span>
              )}
              <ChevronRight className="w-5 h-5 shrink-0 text-neutral-400" />
            </div>
          </button>
        </div>

        {/* Account Actions Card */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-4">
          <div>
            <h2 className="font-medium text-neutral-900">Account</h2>
            <p className="text-sm text-neutral-500">Manage your account data</p>
          </div>

          <button
            onClick={() => setShowExportModal(true)}
            className="w-full flex items-center gap-3 text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
              <Download className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-neutral-900 group-hover:text-neutral-700 transition-colors">
                Export account data
              </div>
              <div className="text-sm text-neutral-500">
                Download all your journals, check-ins, and sessions
              </div>
            </div>
          </button>

          <div className="border-t border-neutral-100" />

          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full flex items-center gap-3 text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0 group-hover:bg-red-100 transition-colors">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-red-600 group-hover:text-red-700 transition-colors">
                Permanently remove all your data
              </div>
              <div className="text-sm text-neutral-500">Delete everything from this device</div>
            </div>
          </button>
        </div>

        {/* Version Footer */}
        <footer className="text-center text-xs text-neutral-400 pt-4">
          <p>Vella ID: {profile.vellaId}</p>
          <p className="mt-1">Local-first. Your data stays on this device.</p>
          <div className="flex justify-center gap-4 mt-3">
            <a href="/privacy" className="underline hover:text-neutral-600">Privacy Policy</a>
            <a href="/terms" className="underline hover:text-neutral-600">Terms of Service</a>
          </div>
        </footer>
      </div>

      {/* Modals */}
      <ExportDataModal isOpen={showExportModal} onClose={() => setShowExportModal(false)} />
      <DeleteDataModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
    </div>
  );
}

"use client";

import { loadLocal, removeLocal, saveLocal } from "./storage";

export type VellaLocalProfile = {
  displayName?: string; // nickname
  initialFeeling?: string; // free-text from onboarding
  relationshipStyle?: string; // label, mirrors Supabase
  focusArea?: string; // label, mirrors Supabase
  createdAt?: string; // ISO string
  hasSeenPrivacyNotice?: boolean; // flag for privacy screen acknowledgment
};

const STORAGE_KEY = "vella_local_profile_v1";

export function loadVellaLocalProfile(): VellaLocalProfile | null {
  return loadLocal<VellaLocalProfile>(STORAGE_KEY, null);
}

export function saveVellaLocalProfile(update: Partial<VellaLocalProfile>): void {
  const existing = loadVellaLocalProfile() ?? {};
  const merged: VellaLocalProfile = {
    ...existing,
    ...update,
    createdAt: existing.createdAt ?? new Date().toISOString(),
  };
  saveLocal(STORAGE_KEY, merged);
}

export function clearVellaLocalProfile(): void {
  removeLocal(STORAGE_KEY);
}


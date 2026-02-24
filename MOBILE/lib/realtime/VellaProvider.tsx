"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { MemoryProfile } from "@/lib/memory/types";
import { loadLocalMemory } from "@/lib/memory/localMemory";
import type {
  RealtimeBudgetSnapshot,
  RealtimeDeliveryMeta,
  RealtimeVellaControls,
  RealtimeVellaState,
} from "@/lib/realtime/useRealtimeVella";
import type { VellaSettings } from "@/lib/settings/vellaSettings";
import { ensureVellaSession } from "@/lib/auth/ensureVellaSession";
import { useVellaUnifiedAudioEngine } from "@/lib/audio/useVellaUnifiedAudioEngine";

type VellaContextValue = {
  realtimeState: RealtimeVellaState | null;
  setRealtimeState: Dispatch<SetStateAction<RealtimeVellaState | null>>;
  realtimeBudget: RealtimeBudgetSnapshot | null;
  setRealtimeBudget: Dispatch<SetStateAction<RealtimeBudgetSnapshot | null>>;
  realtimeControls: RealtimeVellaControls | null;
  setRealtimeControls: Dispatch<SetStateAction<RealtimeVellaControls | null>>;
  realtimeDeliveryMeta: RealtimeDeliveryMeta | null;
  setRealtimeDeliveryMeta: Dispatch<SetStateAction<RealtimeDeliveryMeta | null>>;
  personaSettings: VellaSettings | null;
  setPersonaSettings: Dispatch<SetStateAction<VellaSettings | null>>;
  memoryProfile: MemoryProfile | null;
  setMemoryProfile: Dispatch<SetStateAction<MemoryProfile | null>>;
  debugPlayTestTone: () => Promise<void>;
};

const VellaContext = createContext<VellaContextValue | undefined>(undefined);

export function VellaProvider({ children }: { children: ReactNode }) {
  const [realtimeState, setRealtimeState] = useState<RealtimeVellaState | null>(null);
  const [realtimeBudget, setRealtimeBudget] = useState<RealtimeBudgetSnapshot | null>(null);
  const [realtimeControls, setRealtimeControls] = useState<RealtimeVellaControls | null>(null);
  const [realtimeDeliveryMeta, setRealtimeDeliveryMeta] = useState<RealtimeDeliveryMeta | null>(null);
  const [personaSettings, setPersonaSettings] = useState<VellaSettings | null>(null);
  const [memoryProfile, setMemoryProfile] = useState<MemoryProfile | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const unifiedAudio = useVellaUnifiedAudioEngine();

  useEffect(() => {
    setMemoryProfile(loadLocalMemory());
  }, []);

  useEffect(() => {
    ensureVellaSession()
      .then(() => {
        if (process.env.NODE_ENV === "development") {
          console.log("[REALTIME:AUTH] Session ensured before realtime init");
        }
      })
      .catch((err) => {
        console.error("[REALTIME:AUTH] Failed to ensure session", err);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const session = await ensureVellaSession();
        if (!session && process.env.NODE_ENV !== "production") {
          console.warn("[VellaProvider] No Supabase session available; realtime may fail.");
        }
      } finally {
        if (!cancelled) {
          setSessionReady(true);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Do NOT duck background audio while Vella is speaking. Causes OpenAI voice distortion.
  useEffect(() => {
    const stage = realtimeState?.stage;
    if (!stage) return;

    // Only restore volume when idle, never duck during speech
    if (stage === "idle") {
      unifiedAudio.setMasterVolume(0.35);
    }
  }, [realtimeState?.stage, unifiedAudio]);

  const debugPlayTestTone = useMemo(
    () => async () => {
      console.log("[VellaProvider] debugPlayTestTone called");
      await unifiedAudio.debugPlayTestTone();
    },
    [unifiedAudio],
  );

  const value = useMemo(
    () => ({
      realtimeState,
      setRealtimeState,
      realtimeBudget,
      setRealtimeBudget,
      realtimeControls,
      setRealtimeControls,
      realtimeDeliveryMeta,
      setRealtimeDeliveryMeta,
      personaSettings,
      setPersonaSettings,
      memoryProfile,
      setMemoryProfile,
      debugPlayTestTone,
    }),
    [
      realtimeState,
      realtimeBudget,
      realtimeControls,
      realtimeDeliveryMeta,
      personaSettings,
      memoryProfile,
      debugPlayTestTone,
    ],
  );

  if (!sessionReady) {
    return null;
  }

  return <VellaContext.Provider value={value}>{children}</VellaContext.Provider>;
}

export function useVellaContext(): VellaContextValue {
  const context = useContext(VellaContext);
  if (!context) {
    throw new Error("useVellaContext must be used within a VellaProvider");
  }
  return context;
}


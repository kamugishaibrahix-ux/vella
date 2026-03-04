/**
 * Unified non-voice audio engine used for music/ambience/effects under the Vella companion experience.
 *
 * Trigger surface summary (discovered during migration):
 * - `MOBILE/app/session/page.tsx` invokes `handlePlayPreset` and `handleAudioIntentFromText`
 *   to start or switch background audio in response to user actions, directives, or inline intents.
 * - These helpers reference catalog entries from `MOBILE/lib/audio/vellaAudioCatalog.ts`,
 *   where preset IDs (string unions derived from `VellaAudioMode`) map to audio metadata.
 *
 * This engine centralises playback so the session UI can route catalog presets or intent-derived audio
 * through a single, browser-native Web Audio pipeline without touching the realtime voice stack.
 */

type AudioContextLike = AudioContext;

export type VellaAudioTrackKind = "music" | "ambience" | "effect";

export interface VellaAudioPreset {
  id: string;
  url: string;
  kind: VellaAudioTrackKind;
  loop?: boolean;
  volume?: number; // 0–1
}

export type VellaAudioEngineState = {
  contextState: AudioContextState | "uninitialised";
  activeKinds: VellaAudioTrackKind[];
};

export interface VellaUnifiedAudioEngine {
  playPreset(preset: VellaAudioPreset): Promise<void>;
  stopKind(kind: VellaAudioTrackKind, options?: { fadeMs?: number }): Promise<void>;
  stopAll(options?: { fadeMs?: number }): Promise<void>;
  setMasterVolume(volume: number): void;
  getState(): VellaAudioEngineState;
  subscribe(listener: (state: VellaAudioEngineState) => void): () => void;
}

type TrackSlot = {
  gain: GainNode;
  source: AudioBufferSourceNode | null;
  currentId: string | null;
};

const TRACK_KINDS: VellaAudioTrackKind[] = ["music", "ambience", "effect"];

let audioContext: AudioContextLike | null = null;
let musicMasterGain: GainNode | null = null;
let masterVolume = 1.0;
const slots: Record<VellaAudioTrackKind, TrackSlot | null> = {
  music: null,
  ambience: null,
  effect: null,
};

// BOUNDED LRU CACHE: Audio buffers
// Limits: 50 entries, 100MB total size
// Prevents unbounded memory growth when playing many audio files
const MAX_BUFFER_CACHE_ENTRIES = 50;
const MAX_BUFFER_CACHE_SIZE = 100 * 1024 * 1024; // 100MB

// Main cache stores AudioBuffer directly for compatibility
const bufferCache = new Map<string, AudioBuffer>();
// Metadata for LRU and size tracking
const bufferCacheMeta = new Map<string, { size: number; timestamp: number }>();
let bufferCacheTotalSize = 0;

const engineListeners = new Set<(state: VellaAudioEngineState) => void>();

/**
 * Calculate AudioBuffer size in bytes
 */
function getBufferSize(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4; // 4 bytes per float32
}

/**
 * Get buffer from cache (LRU update)
 */
function getCachedBuffer(key: string): AudioBuffer | undefined {
  const buffer = bufferCache.get(key);
  if (!buffer) return undefined;

  // Update LRU order
  const meta = bufferCacheMeta.get(key);
  if (meta) {
    bufferCacheMeta.delete(key);
    bufferCacheMeta.set(key, { ...meta, timestamp: Date.now() });
  }

  return buffer;
}

/**
 * Set buffer in cache (LRU eviction)
 */
function setCachedBuffer(key: string, buffer: AudioBuffer): void {
  const size = getBufferSize(buffer);

  // Remove existing if present
  if (bufferCache.has(key)) {
    const oldMeta = bufferCacheMeta.get(key)!;
    bufferCacheTotalSize -= oldMeta.size;
    bufferCache.delete(key);
    bufferCacheMeta.delete(key);
  }

  // Evict by size
  while (
    bufferCacheTotalSize + size > MAX_BUFFER_CACHE_SIZE &&
    bufferCache.size > 0
  ) {
    evictLRUBuffer();
  }

  // Evict by count
  while (bufferCache.size >= MAX_BUFFER_CACHE_ENTRIES) {
    evictLRUBuffer();
  }

  // Add new entry
  bufferCache.set(key, buffer);
  bufferCacheMeta.set(key, { size, timestamp: Date.now() });
  bufferCacheTotalSize += size;
}

/**
 * Evict least recently used buffer
 */
function evictLRUBuffer(): void {
  const firstKey = bufferCache.keys().next().value;
  if (firstKey === undefined) return;

  const meta = bufferCacheMeta.get(firstKey);
  if (meta) {
    bufferCacheTotalSize -= meta.size;
    bufferCacheMeta.delete(firstKey);
  }
  bufferCache.delete(firstKey);
}

/**
 * Get cache stats for monitoring
 */
function getBufferCacheStats(): {
  entries: number;
  totalSize: number;
  maxEntries: number;
  maxSize: number;
} {
  return {
    entries: bufferCache.size,
    totalSize: bufferCacheTotalSize,
    maxEntries: MAX_BUFFER_CACHE_ENTRIES,
    maxSize: MAX_BUFFER_CACHE_SIZE,
  };
}

// Create AudioContext only on user gesture (click, touch, etc.)
// This is called from playPreset() which is only invoked on user action
function createContextOnUserGesture(): AudioContextLike {
  if (typeof window === "undefined") {
    throw new Error("VellaUnifiedAudioEngine can only run in the browser.");
  }
  if (!audioContext) {
    // Production: Remove console.log
    // console.log("[AUDIO] Creating AudioContext on user gesture");
    audioContext = new AudioContext();
    musicMasterGain = audioContext.createGain();
    musicMasterGain.gain.value = masterVolume;
    musicMasterGain.connect(audioContext.destination);
  }
  return audioContext;
}

function ensureContext(): AudioContextLike {
  if (typeof window === "undefined") {
    throw new Error("VellaUnifiedAudioEngine can only run in the browser.");
  }
  if (!audioContext) {
    // This should only be called after createContextOnUserGesture() has been called
    // ensureContext() is used by ensureSlot() which is called after playPreset() creates the context
    throw new Error("AudioContext not initialized. Must be created on user gesture first.");
  }
  return audioContext;
}

function ensureSlot(kind: VellaAudioTrackKind): TrackSlot {
  const ctx = ensureContext();
  if (!musicMasterGain) {
    musicMasterGain = ctx.createGain();
    musicMasterGain.gain.value = masterVolume;
    musicMasterGain.connect(ctx.destination);
  }
  const existing = slots[kind];
  if (existing) return existing;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(musicMasterGain);
  const slot: TrackSlot = {
    gain,
    source: null,
    currentId: null,
  };
  slots[kind] = slot;
  return slot;
}

async function fetchAudioBuffer(url: string, ctx: AudioContextLike): Promise<AudioBuffer> {
  const cached = getCachedBuffer(url);
  if (cached) {
    // Production: Remove debug logging
    return cached;
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch audio (${res.status}): ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();

  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    setCachedBuffer(url, buffer);
    return buffer;
  } catch (err) {
    throw err;
  }
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

async function fadeOutAndStop(kind: VellaAudioTrackKind, fadeMs = 200): Promise<void> {
  if (!audioContext) return;
  const slot = slots[kind];
  if (!slot || !slot.source) return;
  const ctx = audioContext;
  const source = slot.source;
  const gainParam = slot.gain.gain;
  const now = ctx.currentTime;
  const fadeSeconds = Math.max(0, fadeMs / 1000);
  const currentValue = gainParam.value;
  gainParam.cancelScheduledValues(now);
  gainParam.setValueAtTime(currentValue, now);
  if (fadeSeconds > 0) {
    gainParam.linearRampToValueAtTime(0, now + fadeSeconds);
    source.stop(now + fadeSeconds);
    await new Promise((resolve) => setTimeout(resolve, fadeMs + 20));
  } else {
    gainParam.setValueAtTime(0, now);
    source.stop(now);
  }
  source.disconnect();
  slot.source = null;
  slot.currentId = null;
}

function listActiveKinds(): VellaAudioTrackKind[] {
  return TRACK_KINDS.filter((kind) => {
    const slot = slots[kind];
    return Boolean(slot && slot.source);
  });
}

async function resumeContext(): Promise<void> {
  if (!audioContext) return;

  try {
    console.log("[AUDIO] context state before resume:", audioContext.state);

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    console.log("[AUDIO] context state after resume:", audioContext.state);

    if (audioContext.state !== "running") {
      console.error("[AUDIO] ERROR: AudioContext failed to resume");
    }
  } catch (err) {
    console.error("[AUDIO] ERROR: resumeContext failed:", err);
    throw err;
  }
}

let engineSingleton: VellaUnifiedAudioEngine | null = null;

function emitEngineState() {
  if (!engineSingleton || engineListeners.size === 0) return;
  const snapshot = engineSingleton.getState();
  engineListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (err) {
      console.warn("[VellaUnifiedAudio] engine listener error", err);
    }
  });
}

export function getVellaUnifiedAudioEngine(): VellaUnifiedAudioEngine {
  if (engineSingleton) return engineSingleton;

  engineSingleton = {
    async playPreset(preset: VellaAudioPreset) {
      console.log("[AUDIO] playing URL:", preset.url);
      console.log("[Engine] playPreset:", preset.id);
      
      // Create AudioContext on first user gesture (this is called from user action)
      const ctx = createContextOnUserGesture();
      
      // Resume context if suspended
      await resumeContext();
      
      await engineSingleton!.stopKind(preset.kind, { fadeMs: 220 });
      const buffer = await fetchAudioBuffer(preset.url, ctx);
      const slot = ensureSlot(preset.kind);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = preset.loop ?? (preset.kind !== "effect");
      const trackVolume = clamp(preset.volume ?? 1);
      const effectiveVolume = Math.min(trackVolume, 0.35);
      const masterVol = musicMasterGain?.gain?.value ?? masterVolume;

      slot.gain.gain.setValueAtTime(effectiveVolume, ctx.currentTime);

      console.log("[AUDIO] effective ambient track volume:", effectiveVolume);
      console.log("[AUDIO] effective volume:", {
        trackVolume,
        effectiveVolume,
        masterVolume: masterVol
      });
      
      source.connect(slot.gain);
      console.log("[AUDIO] wiring graph: source -> gain -> masterGain -> destination");
      
      // Verify master gain is connected to destination
      if (musicMasterGain && musicMasterGain.numberOfOutputs === 0) {
        console.warn("[AUDIO] WARNING: masterGain not connected to destination!");
        musicMasterGain.connect(ctx.destination);
      }
      
      slot.source = source;
      slot.currentId = preset.id;
      source.onended = () => {
        if (slot.source === source) {
          slot.source.disconnect();
          slot.source = null;
          slot.currentId = null;
        }
        emitEngineState();
      };
      console.log("[AUDIO] AudioBufferSourceNode starting, loop:", source.loop, "buffer duration:", buffer.duration);
      source.start();
      console.log("[AUDIO] AudioBufferSourceNode started successfully");
      emitEngineState();
    },

    async stopKind(kind, options) {
      await fadeOutAndStop(kind, options?.fadeMs ?? 200);
      emitEngineState();
    },

    async stopAll(options) {
      await Promise.all(TRACK_KINDS.map((kind) => this.stopKind(kind, options)));
      emitEngineState();
    },

    setMasterVolume(volume: number) {
      masterVolume = clamp(volume);
      if (musicMasterGain) {
        const ctx = ensureContext();
        musicMasterGain.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.01);
      }
    },

    getState() {
      return {
        contextState: audioContext ? audioContext.state : "uninitialised",
        activeKinds: listActiveKinds(),
      };
    },

    subscribe(listener) {
      engineListeners.add(listener);
      try {
        listener(this.getState());
      } catch (err) {
        console.warn("[VellaUnifiedAudio] immediate listener dispatch failed", err);
      }
      return () => {
        engineListeners.delete(listener);
      };
    },
  };

  return engineSingleton;
}

// Debug function to play a test tone - proves the engine can output sound
export async function debugPlayTestTone(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("debugPlayTestTone can only run in the browser.");
  }
  
  const ctx = createContextOnUserGesture();
  await resumeContext();
  
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  gain.gain.setValueAtTime(0.2, ctx.currentTime); // 20% volume
  osc.type = "sine";
  osc.frequency.setValueAtTime(440, ctx.currentTime); // A4 test tone
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  console.log("[AUDIO-DEBUG] Playing test tone");
  console.log("[AUDIO-DEBUG] wiring graph: oscillator -> gain -> destination");
  console.log("[AUDIO-DEBUG] effective volume:", { oscillatorVolume: 0.2, masterVolume: musicMasterGain?.gain.value ?? masterVolume });
  
  osc.start();
  osc.stop(ctx.currentTime + 1.5); // 1.5 seconds
  
  // Wait for tone to finish
  await new Promise((resolve) => setTimeout(resolve, 1600));
  console.log("[AUDIO-DEBUG] Test tone finished");
}


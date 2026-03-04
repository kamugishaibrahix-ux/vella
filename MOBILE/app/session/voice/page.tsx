"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Settings, Mic, X, Music, Camera, Check } from "lucide-react";
import Link from "next/link";
import type { PendingProposal } from "@/lib/session/negotiationState";
import { VoiceChamber, type VoiceState } from "./components/VoiceChamber";
import {
  VoiceSelectorSheet,
  getStoredVoice,
  setStoredVoice,
} from "./components/VoiceSelectorSheet";
import { VoiceParticleField } from "./components/VoiceParticleField";
import { useRealtimeVella } from "@/lib/realtime/useRealtimeVella";
import { useAccountStatus } from "@/app/components/providers/AccountStatusProvider";
import { mapPlanToTier } from "@/lib/tiers/mapPlanToTier";
import type { VellaVoiceId } from "@/lib/voice/vellaVoices";
import { resolveVoiceTransport, type VoiceTransport } from "@/lib/voice/voiceTransport";

// Sound library options organized by category
const SOUND_OPTIONS = [
  // Humming
  { id: "focus_hum", label: "Focus hum", path: "/audio/humming/hum_soft_1/hum_soft_1_1.mp3", category: "Humming" },
  { id: "calm_hum", label: "Calm hum", path: "/audio/humming/hum_warm_1/hum_warm_1_1.mp3", category: "Humming" },
  // Quick
  { id: "rain", label: "Rain", path: "/audio/quick/quick_calm_wave/quick_calm_wave_1.mp3", category: "Quick" },
  { id: "night", label: "Night ambience", path: "/audio/quick/quick_sleep_wind/quick_sleep_wind_1.mp3", category: "Quick" },
  { id: "white", label: "White noise", path: "/audio/quick/quick_focus_glow/quick_focus_glow_1.mp3", category: "Quick" },
  // Emotion
  { id: "calm", label: "Calm", path: "/audio/emotional_state/emotion_calm/emotion_calm_1.mp3", category: "Emotion" },
  { id: "clarity", label: "Clarity", path: "/audio/emotional_state/emotion_clarity/emotion_clarity_1.mp3", category: "Emotion" },
  { id: "grounding", label: "Grounding", path: "/audio/emotional_state/emotion_grounding/emotion_grounding_1.mp3", category: "Emotion" },
  // Meditation
  { id: "breath_deep", label: "Deep breath", path: "/audio/meditation/meditation_breath_deep/meditation_breath_deep_1.mp3", category: "Meditation" },
  { id: "breath_slow", label: "Slow breath", path: "/audio/meditation/meditation_breath_slow/meditation_breath_slow_1.mp3", category: "Meditation" },
  { id: "meditation_focus", label: "Meditation focus", path: "/audio/meditation/meditation_focus/meditation_focus_1.mp3", category: "Meditation" },
] as const;

// Sound categories derived from SOUND_OPTIONS
const SOUND_CATEGORIES = Array.from(new Set(SOUND_OPTIONS.map(s => s.category)));

type SoundId = typeof SOUND_OPTIONS[number]["id"];

// OpenAI TTS voice preview — calls /api/voice/preview for real audio
function playVoicePreview(
  voiceId: string,
  onDone: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  let cancelled = false;
  let audio: HTMLAudioElement | null = null;

  fetch("/api/voice/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voiceId }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
      return res.json();
    })
    .then((data) => {
      if (cancelled || !data.audioBase64) return;
      const audioUrl = `data:audio/mp3;base64,${data.audioBase64}`;
      audio = new Audio(audioUrl);
      audio.onended = () => onDone();
      audio.onerror = () => onDone();
      audio.play().catch(() => onDone());
    })
    .catch(() => {
      if (!cancelled) onDone();
    });

  return () => {
    cancelled = true;
    if (audio) {
      audio.pause();
      audio = null;
    }
  };
}

export default function SessionVoicePage() {
  const router = useRouter();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>("luna");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const stopPreviewRef = useRef<(() => void) | null>(null);

  // Transcript preview state (must be before useRealtimeVella which uses setters in callbacks)
  const [liveTranscript, setLiveTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const transcriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Voice pipeline: account + transport routing ──
  const account = useAccountStatus();
  const planTier = mapPlanToTier(account.plan ?? "free");
  const voiceTransport: VoiceTransport = resolveVoiceTransport(account.entitlements);

  // ── Standard voice state (HTTP turn-based) ──
  const [isRecording, setIsRecording] = useState(false);
  const [standardError, setStandardError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const standardAudioRef = useRef<HTMLAudioElement | null>(null);
  const conversationHistoryRef = useRef<Array<{ role: string; content: string }>>([]);

  // ── Realtime voice hook (only active for pro/elite) ──
  const [realtimeState, realtimeBudget, realtimeControls] = useRealtimeVella({
    planTier,
    voiceId: selectedVoice as VellaVoiceId,
    onUserUtterance: (text) => {
      console.log("[VoiceTrace] user_utterance", { transport: voiceTransport, text: text.slice(0, 80), ts: Date.now() });
      setLiveTranscript(text);
      setShowTranscript(true);
    },
    onAssistantMessage: (text) => {
      console.log("[VoiceTrace] assistant_message", { transport: voiceTransport, text: text.slice(0, 80), ts: Date.now() });
    },
    onError: (err) => {
      console.error("[VoiceTrace] realtime_error", err);
    },
  });

  // Sync realtime hook stage → local voiceState for VoiceChamber visuals (realtime only)
  useEffect(() => {
    if (voiceTransport !== "realtime" || !realtimeState) return;
    const stageMap: Record<string, VoiceState> = {
      idle: "idle",
      listening: "listening",
      thinking: "processing",
      speaking: "responding",
    };
    const mapped = stageMap[realtimeState.stage] ?? "idle";
    setVoiceState(mapped);
  }, [voiceTransport, realtimeState?.stage]);

  // Trace: log voice state changes
  useEffect(() => {
    console.log("[VoiceTrace] voice_state", {
      transport: voiceTransport,
      voiceState,
      plan: account.plan,
      realtimeConnected: realtimeState?.connected,
      realtimeStage: realtimeState?.stage,
      realtimeError: realtimeState?.error,
      ts: Date.now(),
    });
  }, [voiceTransport, voiceState, realtimeState?.connected, realtimeState?.stage, realtimeState?.error]);

  // ── Standard voice: start recording ──
  const startStandardRecording = useCallback(async () => {
    try {
      setStandardError(null);
      console.log("[VoiceTrace] standard_recording_start", { ts: Date.now() });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) {
          setStandardError("No audio recorded. Please try again.");
          setVoiceState("idle");
          setIsRecording(false);
          return;
        }
        await sendStandardVoice(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setVoiceState("listening");
    } catch (err) {
      console.error("[VoiceTrace] mic_access_failed", err);
      setStandardError("Microphone access denied. Please allow microphone access.");
      setVoiceState("idle");
    }
  }, []);

  // ── Standard voice: stop recording ──
  const stopStandardRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      console.log("[VoiceTrace] standard_recording_stop", { ts: Date.now() });
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setVoiceState("processing");
    }
  }, []);

  // ── Standard voice: send audio to /api/voice/standard ──
  const sendStandardVoice = useCallback(async (audioBlob: Blob) => {
    try {
      console.log("[VoiceTrace] standard_upload_start", { bytes: audioBlob.size, ts: Date.now() });
      setVoiceState("processing");

      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("history", JSON.stringify(conversationHistoryRef.current.slice(-10)));
      formData.append("voiceId", selectedVoice);

      const res = await fetch("/api/voice/standard", { method: "POST", body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Server error ${res.status}`);
      }

      const data = await res.json();
      console.log("[VoiceTrace] standard_response", {
        userTextLen: data.userText?.length,
        assistantTextLen: data.assistantText?.length,
        voice_mode: data.voice_mode,
        trace_id: data.__debug?.trace_id,
        ts: Date.now(),
      });

      // Update transcript
      setLiveTranscript(data.assistantText || "");
      setShowTranscript(true);

      // Track conversation history
      if (data.userText) {
        conversationHistoryRef.current.push({ role: "user", content: data.userText });
      }
      if (data.assistantText) {
        conversationHistoryRef.current.push({ role: "assistant", content: data.assistantText });
      }

      // Play audio response
      if (data.audioBase64) {
        setVoiceState("responding");
        const audioUrl = `data:audio/mp3;base64,${data.audioBase64}`;
        const audio = new Audio(audioUrl);
        standardAudioRef.current = audio;
        audio.onended = () => {
          setVoiceState("idle");
          standardAudioRef.current = null;
        };
        audio.onerror = () => {
          console.error("[VoiceTrace] standard_audio_playback_error");
          setVoiceState("idle");
          standardAudioRef.current = null;
        };
        await audio.play();
      } else {
        setVoiceState("idle");
      }
    } catch (err) {
      console.error("[VoiceTrace] standard_voice_error", err);
      setStandardError(err instanceof Error ? err.message : "Voice processing failed.");
      setVoiceState("idle");
    }
  }, [selectedVoice]);

  // Sound library state
  const [isSoundModalOpen, setIsSoundModalOpen] = useState(false);
  const [selectedSoundCategory, setSelectedSoundCategory] = useState<string | null>(null);
  const [activeSound, setActiveSound] = useState<SoundId | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Camera capture state
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Negotiation protocol state (voice follows identical protocol as text)
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [confirmingProposal, setConfirmingProposal] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ contractId: string } | null>(null);

  // Voice proposal confirmation handler
  const handleConfirmProposal = useCallback(async () => {
    if (!pendingProposal || confirmingProposal) return;
    setConfirmingProposal(true);
    try {
      const res = await fetch("/api/session/confirm-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: pendingProposal.domain,
          severity: pendingProposal.severity,
          duration_days: pendingProposal.suggestedDurationDays,
          budget_weight: pendingProposal.suggestedBudgetWeight,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setConfirmResult({ contractId: result.contractId });
        setPendingProposal(null);
      }
    } catch {
      // Fail silently in voice mode
    } finally {
      setConfirmingProposal(false);
    }
  }, [pendingProposal, confirmingProposal]);

  const handleCancelProposal = useCallback(() => {
    setPendingProposal(null);
  }, []);

  // Safety layer (internal)
  const [safetyMode, setSafetyMode] = useState(false);

  // Load stored voice on mount
  useEffect(() => {
    setSelectedVoice(getStoredVoice());
  }, []);

  // Cleanup preview on unmount
  useEffect(() => {
    return () => {
      if (stopPreviewRef.current) {
        stopPreviewRef.current();
      }
    };
  }, []);

  // Handle voice selection
  const handleSelectVoice = useCallback((voiceId: string) => {
    setSelectedVoice(voiceId);
    setStoredVoice(voiceId);
  }, []);

  // Handle voice preview — uses OpenAI TTS via /api/voice/preview
  const handlePreviewVoice = useCallback((voiceId: string) => {
    // Stop current preview if playing
    if (stopPreviewRef.current) {
      stopPreviewRef.current();
    }

    if (playingVoice === voiceId) {
      // Stop if same voice clicked
      setPlayingVoice(null);
      stopPreviewRef.current = null;
      return;
    }

    // Start new preview — onDone clears playing state when audio finishes
    setPlayingVoice(voiceId);
    stopPreviewRef.current = playVoicePreview(voiceId, () => {
      setPlayingVoice((current) => (current === voiceId ? null : current));
      stopPreviewRef.current = null;
    });
  }, [playingVoice]);

  // Handle chamber tap — routes by transport
  const handleChamberTap = useCallback(() => {
    console.log("[VoiceTrace] chamber_tap", { transport: voiceTransport, voiceState, ts: Date.now() });

    if (voiceTransport === "standard") {
      // Standard: tap to start recording (idle), tap again to stop (listening)
      if (voiceState === "idle") {
        startStandardRecording();
      } else if (voiceState === "listening" && isRecording) {
        stopStandardRecording();
      }
      // processing/responding taps are no-ops
    } else {
      // Realtime: tap to start session when idle
      if (voiceState === "idle") {
        realtimeControls.startSession({ enableMic: true }).catch((err) => {
          console.error("[VoiceTrace] startSession failed", err);
        });
      }
      // During active realtime session, taps are no-ops
    }
  }, [voiceTransport, voiceState, isRecording, startStandardRecording, stopStandardRecording, realtimeControls]);

  // Handle end session
  const handleEndSession = useCallback(() => {
    console.log("[VoiceTrace] end_session", { transport: voiceTransport, ts: Date.now() });

    // Transport-specific cleanup
    if (voiceTransport === "standard") {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (standardAudioRef.current) {
        standardAudioRef.current.pause();
        standardAudioRef.current = null;
      }
      setIsRecording(false);
      conversationHistoryRef.current = [];
    } else {
      realtimeControls.stopSession("stopSession").catch((err) => {
        console.error("[VoiceTrace] stopSession failed", err);
      });
    }

    // Common cleanup
    if (stopPreviewRef.current) {
      stopPreviewRef.current();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setLiveTranscript("");
    setShowTranscript(false);
    setStandardError(null);
    router.push("/session");
  }, [router, voiceTransport, realtimeControls]);

  // Handle primary control button - starts session when idle, ends when active
  const handlePrimaryControl = useCallback(() => {
    if (voiceState === "idle") {
      console.log("[VoiceTrace] primary_control_start", { transport: voiceTransport, plan: account.plan, ts: Date.now() });
      if (voiceTransport === "standard") {
        startStandardRecording();
      } else {
        realtimeControls.startSession({ enableMic: true }).catch((err) => {
          console.error("[VoiceTrace] startSession failed", err);
        });
      }
    } else {
      // End session - route to home
      handleEndSession();
    }
  }, [voiceState, voiceTransport, account.plan, startStandardRecording, realtimeControls, handleEndSession]);

  // Check if session is active (not idle)
  const isSessionActive = voiceState !== "idle";

  // Sound library handlers
  const handlePlaySound = useCallback((soundId: SoundId) => {
    // Stop current sound if playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // If clicking same sound, just stop it
    if (activeSound === soundId) {
      setActiveSound(null);
      return;
    }

    // Play new sound
    const sound = SOUND_OPTIONS.find(s => s.id === soundId);
    if (!sound) return;

    const audio = new Audio(sound.path);
    audio.loop = true;
    audio.volume = 0.3;
    audio.play().catch(() => {
      // Audio playback failed (user interaction required first)
    });

    audioRef.current = audio;
    setActiveSound(soundId);
  }, [activeSound]);

  // Camera handlers
  const handleOpenCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch {
      // Camera access denied or not available
      setIsCameraOpen(false);
    }
  }, []);

  const handleCloseCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
    setCapturedImage(null);
  }, []);

  const handleCaptureImage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedImage(imageData);

    // Stop stream after capture
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Internal safety check (not exposed in UI)
    const hasHighRiskContent = false; // Placeholder for actual detection
    if (hasHighRiskContent) {
      setSafetyMode(true);
    }

    // Close camera and process via voice
    setIsCameraOpen(false);

    // Trigger voice response about captured image
    setVoiceState("processing");
    setTimeout(() => {
      setVoiceState("responding");
    }, 1500);
  }, []);

  // Transcript preview handlers
  const updateTranscript = useCallback((text: string) => {
    setLiveTranscript(text);
    setShowTranscript(true);

    // Clear existing timeout
    if (transcriptTimeoutRef.current) {
      clearTimeout(transcriptTimeoutRef.current);
    }

    // Set new timeout to hide after 2 seconds of silence
    transcriptTimeoutRef.current = setTimeout(() => {
      setShowTranscript(false);
    }, 2000);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transcriptTimeoutRef.current) {
        clearTimeout(transcriptTimeoutRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Get control button icon based on state
  const getControlIcon = () => {
    if (voiceState === "idle") {
      return <Mic className="w-8 h-8 text-white" />;
    }
    // Active states show X (end session)
    return <X className="w-6 h-6 text-white" />;
  };

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden" style={{ backgroundColor: "#081C15" }}>
      {/* Particle field background (renders its own bg + particles) */}
      <div className="absolute inset-0 z-0">
        <VoiceParticleField state={voiceState} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-4">
        {/* Sound Library icon - top left */}
        <button
          type="button"
          onClick={() => setIsSoundModalOpen(true)}
          className="p-3 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200 active:scale-95"
          aria-label="Sound library"
        >
          <Music className="w-5 h-5" />
        </button>

        {/* Settings icon - top right */}
        <button
          type="button"
          onClick={() => setIsSelectorOpen(true)}
          className="p-3 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200 active:scale-95"
          aria-label="Voice settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* Voice Chamber */}
      <VoiceChamber state={voiceState} onTap={handleChamberTap} />

      {/* Transport mode label */}
      <div className="relative z-10 flex justify-center -mt-4 mb-2">
        <span className="text-[11px] font-medium tracking-wide text-white/40 uppercase">
          {voiceTransport === "realtime" ? "Realtime Voice Mode" : "Standard Voice Mode"}
        </span>
      </div>

      {/* Standard voice error banner */}
      {standardError && (
        <div className="relative z-10 mx-6 mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-300">{standardError}</p>
        </div>
      )}

      {/* Realtime error banner */}
      {voiceTransport === "realtime" && realtimeState?.error && (
        <div className="relative z-10 mx-6 mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-300">{realtimeState.error}</p>
        </div>
      )}

      {/* Negotiation: Proposal confirmation overlay */}
      {pendingProposal && !confirmResult && (
        <div className="relative z-10 mx-6 mb-4 rounded-2xl px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20">
          <p className="text-sm text-white/90">
            Shall I schedule <span className="font-medium">{pendingProposal.domain}</span> for {pendingProposal.suggestedDurationDays} days this week?
          </p>
          <p className="text-xs text-white/50 mt-1">
            {pendingProposal.severity} · weight {pendingProposal.suggestedBudgetWeight}
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              disabled={confirmingProposal}
              onClick={handleConfirmProposal}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              {confirmingProposal ? "Confirming…" : "Confirm"}
            </button>
            <button
              type="button"
              disabled={confirmingProposal}
              onClick={handleCancelProposal}
              className="px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Negotiation: Confirm success */}
      {confirmResult && (
        <div className="relative z-10 mx-6 mb-4 rounded-2xl px-4 py-2.5 bg-white/10 backdrop-blur-sm border border-white/20">
          <div className="flex items-center gap-1.5 text-sm text-emerald-300">
            <Check className="w-3.5 h-3.5" />
            <span className="font-medium">Execution Plan Created</span>
          </div>
          <Link
            href="/checkin"
            className="text-xs text-white/50 hover:text-white/80 mt-1 inline-block"
          >
            View in Check-in →
          </Link>
        </div>
      )}

      {/* Primary Control */}
      <div className="relative z-10 flex flex-col items-center gap-4 pb-8 px-6">
        {/* Live transcript preview */}
        <AnimatePresence>
          {showTranscript && liveTranscript && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="max-w-[80%] text-center"
            >
              <p className="text-sm text-white/60 line-clamp-2">{liveTranscript}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Control area - camera and X aligned horizontally */}
        <div className="relative w-full max-w-xs h-20 flex items-center justify-between">
          {/* Camera capture button - always visible, bottom left */}
          <button
            type="button"
            onClick={handleOpenCamera}
            className="p-3 text-white/60 hover:text-white transition-all duration-200 active:scale-95"
            aria-label="Capture image"
          >
            <Camera className="w-5 h-5" />
          </button>

          {/* X button - only visible when session active, positioned right */}
          <AnimatePresence>
            {isSessionActive && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <motion.button
                  type="button"
                  onClick={handleEndSession}
                  disabled={voiceState === "processing"}
                  className={`
                    w-20 h-20 rounded-full flex items-center justify-center
                    bg-transparent
                    transition-all duration-300
                    ${voiceState === "processing" ? "opacity-50 cursor-not-allowed" : "active:scale-90 hover:scale-110"}
                  `}
                >
                  <X className="w-6 h-6 text-white" />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Voice Selector Sheet */}
      <VoiceSelectorSheet
        isOpen={isSelectorOpen}
        selectedVoice={selectedVoice}
        playingVoice={playingVoice}
        onClose={() => setIsSelectorOpen(false)}
        onSelectVoice={handleSelectVoice}
        onPreviewVoice={handlePreviewVoice}
      />

      {/* Sound Library Floating Modal */}
      <AnimatePresence>
        {isSoundModalOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60"
              onClick={() => {
                setIsSoundModalOpen(false);
                setSelectedSoundCategory(null);
              }}
            />
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="w-[90%] max-w-sm max-h-[75vh] overflow-y-auto rounded-2xl bg-vella-bg-card/95 backdrop-blur-md border border-white/10 shadow-2xl pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  {selectedSoundCategory ? (
                    <button
                      type="button"
                      onClick={() => setSelectedSoundCategory(null)}
                      className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10"
                      aria-label="Back to categories"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="w-7" />
                  )}
                  <h2 className="text-base font-semibold text-white">
                    {selectedSoundCategory || "Sound Library"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSoundModalOpen(false);
                      setSelectedSoundCategory(null);
                    }}
                    className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-2 space-y-1">
                  {!selectedSoundCategory ? (
                    // Category selection view
                    <>
                      {SOUND_CATEGORIES.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setSelectedSoundCategory(category)}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/5 transition-all duration-200 active:scale-[0.98]"
                        >
                          <span className="text-sm text-white/80">{category}</span>
                          <span className="text-xs text-white/40">
                            {SOUND_OPTIONS.filter(s => s.category === category).length} sounds
                          </span>
                        </button>
                      ))}
                    </>
                  ) : (
                    // Sounds within category
                    <>
                      {SOUND_OPTIONS.filter(s => s.category === selectedSoundCategory).map((sound) => (
                        <button
                          key={sound.id}
                          type="button"
                          onClick={() => handlePlaySound(sound.id)}
                          className={`
                            w-full flex items-center justify-between px-4 py-3 rounded-xl
                            transition-all duration-200 active:scale-[0.98]
                            ${activeSound === sound.id
                              ? "bg-emerald-500/20 border border-emerald-500/30"
                              : "hover:bg-white/5"
                            }
                          `}
                        >
                          <span className={`text-sm ${activeSound === sound.id ? "text-emerald-400" : "text-white/80"}`}>
                            {sound.label}
                          </span>
                          {activeSound === sound.id && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-2 h-2 rounded-full bg-emerald-400"
                            />
                          )}
                        </button>
                      ))}
                    </>
                  )}
                </div>

                {/* Stop button */}
                {activeSound && (
                  <div className="px-4 pb-4 pt-2">
                    <button
                      type="button"
                      onClick={() => handlePlaySound(activeSound)}
                      className="w-full py-2.5 rounded-xl bg-white/10 text-white/80 text-sm hover:bg-white/15 transition-colors"
                    >
                      Stop sound
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Camera Capture Modal */}
      <AnimatePresence>
        {isCameraOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/80"
              onClick={handleCloseCamera}
            />
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4"
            >
              {/* Video preview */}
              <div className="relative w-full max-w-md aspect-[3/4] rounded-2xl overflow-hidden bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover"
                  onLoadedMetadata={(e) => {
                    const video = e.currentTarget;
                    video.play().catch(() => {});
                  }}
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Close button */}
                <button
                  type="button"
                  onClick={handleCloseCamera}
                  className="absolute top-4 left-4 p-2 rounded-full bg-black/50 text-white/80 hover:text-white"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Capture button */}
                <button
                  type="button"
                  onClick={handleCaptureImage}
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white border-4 border-white/30 active:scale-95 transition-transform"
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Dev-only transport debug badge */}
      {process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-3 right-3 z-50 px-2 py-1 rounded text-[10px] font-mono tracking-wide bg-neutral-800/80 text-neutral-400 border border-neutral-700 pointer-events-none select-none">
          {voiceTransport.toUpperCase()} · {planTier}
        </div>
      )}
    </div>
  );
}

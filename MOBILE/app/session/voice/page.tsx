"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Settings, Mic, X, Music, Camera } from "lucide-react";
import { VoiceChamber, type VoiceState } from "./components/VoiceChamber";
import {
  VoiceSelectorSheet,
  getStoredVoice,
  setStoredVoice,
} from "./components/VoiceSelectorSheet";
import { VoiceParticleField } from "./components/VoiceParticleField";

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

// Simulated audio preview using Web Speech API synthesis as placeholder
function playVoicePreview(voiceId: string): () => void {
  if (typeof window === "undefined") return () => {};

  const utterance = new SpeechSynthesisUtterance(
    `Hi, I'm ${voiceId}. I'm here to listen and support you.`
  );
  utterance.rate = 0.9;
  utterance.pitch = voiceId === "luna" ? 0.95 : voiceId === "aira" ? 1.0 : voiceId === "sol" ? 0.9 : 1.05;

  window.speechSynthesis.speak(utterance);

  return () => {
    window.speechSynthesis.cancel();
  };
}

export default function SessionVoicePage() {
  const router = useRouter();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>("luna");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const stopPreviewRef = useRef<(() => void) | null>(null);

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

  // Transcript preview state
  const [liveTranscript, setLiveTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const transcriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Handle voice preview
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

    // Start new preview
    setPlayingVoice(voiceId);
    stopPreviewRef.current = playVoicePreview(voiceId);

    // Auto-stop after ~3 seconds (approximate preview duration)
    setTimeout(() => {
      setPlayingVoice((current) => {
        if (current === voiceId) {
          if (stopPreviewRef.current) {
            stopPreviewRef.current();
            stopPreviewRef.current = null;
          }
          return null;
        }
        return current;
      });
    }, 3000);
  }, [playingVoice]);

  // Handle chamber tap - state transitions
  const handleChamberTap = useCallback(() => {
    setVoiceState((current) => {
      switch (current) {
        case "idle":
          return "listening";
        case "listening":
          return "processing";
        case "processing":
          return "responding";
        case "responding":
          return "idle";
        default:
          return "idle";
      }
    });
  }, []);

  // Handle end session
  const handleEndSession = useCallback(() => {
    // Stop any preview
    if (stopPreviewRef.current) {
      stopPreviewRef.current();
    }
    // Stop ambient sound
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    // Clear transcript
    setLiveTranscript("");
    setShowTranscript(false);
    router.push("/session");
  }, [router]);

  // Handle primary control button - starts session when idle, ends when active
  const handlePrimaryControl = useCallback(() => {
    if (voiceState === "idle") {
      // Start session
      setVoiceState("listening");
    } else {
      // End session - route to home
      handleEndSession();
    }
  }, [voiceState, handleEndSession]);

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

        {/* Control area - camera only when idle, X appears when active */}
        <div className="relative w-full max-w-xs h-20">
          {/* Camera capture button - always visible, bottom left */}
          <button
            type="button"
            onClick={handleOpenCamera}
            className="absolute left-0 bottom-0 p-3 text-white/60 hover:text-white transition-all duration-200 active:scale-95"
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
                className="absolute right-0 bottom-0"
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
    </div>
  );
}

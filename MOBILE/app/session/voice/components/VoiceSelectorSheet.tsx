"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { VoiceOptionCard, type VoiceOption } from "./VoiceOptionCard";
import { getSelectedDomainLabels } from "@/lib/focusAreas";
import { OSModeSelector } from "@/components/OSModeSelector";

const VOICE_OPTIONS: VoiceOption[] = [
  { id: "luna", name: "Luna", personality: "Calm · Warm · Reflective" },
  { id: "aira", name: "Aira", personality: "Gentle · Intuitive · Supportive" },
  { id: "sol", name: "Sol", personality: "Steady · Grounded · Reassuring" },
  { id: "orion", name: "Orion", personality: "Clear · Focused · Direct" },
];

const STORAGE_KEY = "vella_selected_voice";

interface VoiceSelectorSheetProps {
  isOpen: boolean;
  selectedVoice: string;
  playingVoice: string | null;
  onClose: () => void;
  onSelectVoice: (voiceId: string) => void;
  onPreviewVoice: (voiceId: string) => void;
}

export function VoiceSelectorSheet({
  isOpen,
  selectedVoice,
  playingVoice,
  onClose,
  onSelectVoice,
  onPreviewVoice,
}: VoiceSelectorSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleBackdropClick}
        >
          {/* Backdrop blur */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            className="relative w-full max-w-md bg-neutral-900/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 300,
            }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-12 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <h2 className="text-lg font-semibold text-white">Choose your voice</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Voice options */}
            <div className="px-4 pb-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {VOICE_OPTIONS.map((voice) => (
                <VoiceOptionCard
                  key={voice.id}
                  voice={voice}
                  isSelected={selectedVoice === voice.id}
                  isPlaying={playingVoice === voice.id}
                  onSelect={() => onSelectVoice(voice.id)}
                  onPreview={() => onPreviewVoice(voice.id)}
                />
              ))}
            </div>

            {/* Personal OS Mode */}
            <div className="px-4 pb-3">
              <OSModeSelector variant="full" />
            </div>

            {/* OS Context */}
            <SessionContextSection />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Minimal OS context shown inside the voice settings sheet. */
function SessionContextSection() {
  const [labels, setLabels] = useState<string[]>([]);
  useEffect(() => {
    setLabels(getSelectedDomainLabels());
  }, []);

  if (labels.length === 0) return null;

  return (
    <div className="px-5 pb-6 pt-2 border-t border-white/5">
      <p className="text-[10px] uppercase tracking-wide text-white/30 font-medium">Selected Domains</p>
      <p className="text-xs text-white/60 mt-1 truncate">{labels.join(" · ")}</p>
      <p className="text-[10px] text-white/30 mt-2">Plans are only created when you confirm.</p>
    </div>
  );
}

// Helper functions for voice storage
export function getStoredVoice(): string {
  if (typeof window === "undefined") return VOICE_OPTIONS[0].id;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && VOICE_OPTIONS.some((v) => v.id === stored)
      ? stored
      : VOICE_OPTIONS[0].id;
  } catch {
    return VOICE_OPTIONS[0].id;
  }
}

export function setStoredVoice(voiceId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, voiceId);
  } catch {
    // ignore
  }
}

export function getVoiceOptions(): VoiceOption[] {
  return VOICE_OPTIONS;
}

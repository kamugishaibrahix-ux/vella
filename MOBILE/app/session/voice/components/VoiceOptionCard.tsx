"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Check } from "lucide-react";

export interface VoiceOption {
  id: string;
  name: string;
  personality: string;
}

interface VoiceOptionCardProps {
  voice: VoiceOption;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onPreview: () => void;
}

export function VoiceOptionCard({
  voice,
  isSelected,
  isPlaying,
  onSelect,
  onPreview,
}: VoiceOptionCardProps) {
  const handlePreviewClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPreview();
    },
    [onPreview]
  );

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-200 ${
        isSelected
          ? "bg-white/10 border border-white/20"
          : "bg-white/5 border border-transparent hover:bg-white/8"
      }`}
      whileTap={{ scale: 0.98 }}
    >
      {/* Radio indicator */}
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          isSelected ? "border-emerald-400 bg-emerald-400/20" : "border-white/30"
        }`}
      >
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <Check className="w-3 h-3 text-emerald-400" />
          </motion.div>
        )}
      </div>

      {/* Voice info */}
      <div className="flex-1 text-left">
        <p className="font-medium text-white">{voice.name}</p>
        <p className="text-sm text-white/50">{voice.personality}</p>
      </div>

      {/* Preview button */}
      <button
        type="button"
        onClick={handlePreviewClick}
        className={`p-2.5 rounded-full transition-all duration-200 ${
          isPlaying
            ? "bg-white/20 text-white"
            : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
        }`}
        aria-label={isPlaying ? "Stop preview" : `Preview ${voice.name}`}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
      </button>
    </motion.button>
  );
}

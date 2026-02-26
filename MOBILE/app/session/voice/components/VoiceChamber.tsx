"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type VoiceState = "idle" | "listening" | "processing" | "responding";

interface VoiceChamberProps {
  state: VoiceState;
  onTap: () => void;
}

// Animated waveform bars for listening state
function WaveformBars() {
  return (
    <div className="flex items-center gap-1 h-8">
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="w-1 bg-white/80 rounded-full"
          animate={{
            height: [12, 28, 12],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// Breathing halo for idle state
function BreathingHalo() {
  return (
    <>
      {/* Outer glow */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-radial from-emerald-500/20 via-emerald-500/5 to-transparent blur-xl"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {/* Middle ring */}
      <motion.div
        className="absolute inset-4 rounded-full border border-emerald-400/20"
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.5,
        }}
      />
      {/* Inner subtle ring */}
      <motion.div
        className="absolute inset-8 rounded-full border border-emerald-300/10"
        animate={{
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
      />
    </>
  );
}

// Processing contraction effect
function ProcessingEffect() {
  return (
    <motion.div
      className="absolute inset-0 rounded-full border-2 border-violet-400/30"
      initial={{ scale: 1.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        duration: 2,
        repeat: Infinity,
        repeatType: "reverse",
        ease: "easeInOut",
      }}
    />
  );
}

// Responding pulse synced to speech
function RespondingPulse() {
  return (
    <>
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-radial from-blue-500/30 via-blue-500/10 to-transparent blur-lg"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute inset-2 rounded-full border border-blue-400/40"
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </>
  );
}

const stateText: Record<VoiceState, string> = {
  idle: "Tap to speak",
  listening: "Listening...",
  processing: "Thinking...",
  responding: "Speaking...",
};

export function VoiceChamber({ state, onTap }: VoiceChamberProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard accessibility
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onTap();
      }
    },
    [onTap]
  );

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col items-center justify-center px-6 relative"
      onClick={onTap}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={stateText[state]}
    >
      {/* Transparent overlay — let particle field show through */}

      {/* Main chamber container */}
      <div className="relative w-64 h-64 flex items-center justify-center">
        {/* State-based visual effects */}
        <AnimatePresence mode="wait">
          {state === "idle" && (
            <motion.div
              key="idle"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <BreathingHalo />
            </motion.div>
          )}

          {state === "listening" && (
            <motion.div
              key="listening"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="absolute inset-0 rounded-full bg-gradient-radial from-emerald-500/30 via-emerald-500/10 to-transparent blur-xl" />
            </motion.div>
          )}

          {state === "processing" && (
            <motion.div
              key="processing"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ProcessingEffect />
              <div className="absolute inset-0 rounded-full bg-gradient-radial from-violet-500/20 via-violet-500/5 to-transparent blur-xl" />
            </motion.div>
          )}

          {state === "responding" && (
            <motion.div
              key="responding"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <RespondingPulse />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Waveform field - shown in listening state */}
        <AnimatePresence>
          {state === "listening" && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
            >
              <WaveformBars />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Central focal point - subtle dot */}
        <motion.div
          className="w-3 h-3 rounded-full bg-white/60"
          animate={{
            scale: state === "idle" ? [1, 1.1, 1] : 1,
            opacity: state === "idle" ? [0.4, 0.6, 0.4] : 0.6,
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* State text */}
      <motion.p
        className="mt-12 text-xl font-medium tracking-[0.06em]"
        style={{ color: "rgba(180, 220, 200, 0.9)" }}
        initial={false}
        animate={{
          opacity: 1,
          y: 0,
        }}
        key={state}
        transition={{ duration: 0.25, ease: "easeInOut" }}
      >
        {stateText[state]}
      </motion.p>
    </div>
  );
}

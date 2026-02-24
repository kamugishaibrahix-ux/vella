"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { StructuredPromptBlock } from "./StructuredPromptBlock";
import type { JournalMode } from "./types";

interface JournalEditorProps {
  mode: JournalMode | null;
  structuredResponses: string[];
  freeText: string;
  onStructuredChange: (values: string[]) => void;
  onFreeTextChange: (value: string) => void;
  className?: string;
}

function setAutoExpandHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.max(160, el.scrollHeight)}px`;
}

export function JournalEditor({
  mode,
  structuredResponses,
  freeText,
  onStructuredChange,
  onFreeTextChange,
  className,
}: JournalEditorProps) {
  const freeRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (freeRef.current) setAutoExpandHeight(freeRef.current);
  }, [freeText]);

  if (!mode) {
    return (
      <div
        className={cn(
          "rounded-2xl border-2 border-dashed border-vella-border bg-vella-bg-card/50 py-12 px-6 text-center",
          className
        )}
      >
        <p className="text-vella-muted text-sm">Choose a mode above to start.</p>
      </div>
    );
  }

  if (mode.id === "free-write") {
    return (
      <div className={cn("space-y-2", className)}>
        <textarea
          ref={freeRef}
          value={freeText}
          onChange={(e) => onFreeTextChange(e.target.value)}
          onInput={(e) => setAutoExpandHeight(e.currentTarget)}
          placeholder="Write freely. No structure, no judgment."
          rows={6}
          className={cn(
            "w-full min-h-[160px] resize-none rounded-2xl border-2 border-vella-border bg-vella-bg-card",
            "px-4 py-4 text-[15px] leading-relaxed text-vella-text placeholder:text-vella-muted/70",
            "focus:outline-none focus:border-vella-primary focus:ring-0",
            "transition-colors duration-150"
          )}
          aria-label="Free write"
        />
      </div>
    );
  }

  const prompts = mode.prompts ?? [];
  return (
    <div className={cn("space-y-5", className)}>
      {prompts.map((prompt, i) => (
        <StructuredPromptBlock
          key={prompt}
          label={prompt}
          value={structuredResponses[i] ?? ""}
          onChange={(v) => {
            const next = [...structuredResponses];
            next[i] = v;
            onStructuredChange(next);
          }}
        />
      ))}
    </div>
  );
}

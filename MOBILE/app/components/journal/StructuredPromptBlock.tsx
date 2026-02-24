"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface StructuredPromptBlockProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function setTextareaHeight(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.max(80, el.scrollHeight)}px`;
}

export function StructuredPromptBlock({
  label,
  value,
  onChange,
  placeholder = "Write here…",
  className,
}: StructuredPromptBlockProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) setTextareaHeight(ref.current);
  }, [value]);

  return (
    <div className={cn("space-y-2", className)}>
      <label className="block text-sm font-medium text-vella-muted">
        {label}
      </label>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => setTextareaHeight(e.currentTarget)}
        placeholder={placeholder}
        rows={2}
        className={cn(
          "w-full min-h-[80px] resize-none rounded-xl border-2 border-vella-border bg-vella-bg-card",
          "px-4 py-3 text-[15px] text-vella-text placeholder:text-vella-muted/70",
          "focus:outline-none focus:border-vella-primary focus:ring-0",
          "transition-colors duration-150"
        )}
        aria-label={label}
      />
    </div>
  );
}

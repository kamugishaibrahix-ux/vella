"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { cn, formatDate } from "@/lib/utils";

// Web Speech API type declarations
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

// Types
type JournalListResponse = { entries?: JournalEntry[] };

interface JournalEntry {
  id: string;
  content: string;
  createdAt: string;
  clarity?: ClarityState;
  pinnedSnippet?: string;
  hasAudio?: boolean;
  photoCount?: number;
}

type ResolutionDraft = { happening: string; reality: string; next: string };
type ClarityState = "clouded" | "mixed" | "clear";
type VoiceState = "idle" | "listening" | "paused";
type AudioRecordState = "idle" | "recording";
type JournalTemplate = "freewrite" | "clarity" | "decompress";

interface Attachment {
  id: string;
  type: "photo" | "audio";
  dataUrl: string;
  duration?: number;
}

interface Highlight {
  id: string;
  text: string;
  start: number;
  end: number;
}

// Constants
const CLARITY_STORAGE_KEY = "journal:clarity";
const TEMPLATE_STORAGE_KEY = "journal:template";

const NEUTRAL_PROMPTS = [
  "What's on your mind?",
  "Start wherever you are.",
  "Write freely.",
  "One sentence is enough.",
];

const SAVE_ACKNOWLEDGMENTS = [
  "Captured.",
  "That mattered.",
  "Clarity grows.",
  "Good work.",
  "You faced it.",
];

const TEMPLATE_CONFIG: Record<JournalTemplate, {
  label: string;
  sections: { key: keyof ResolutionDraft; primary: string; secondary: string }[];
}> = {
  freewrite: {
    label: "Free Write",
    sections: [
      { key: "happening", primary: "What's on your mind?", secondary: "Write freely, no structure needed." },
    ],
  },
  clarity: {
    label: "Clarity",
    sections: [
      { key: "happening", primary: "What's happening?", secondary: "Describe the situation." },
      { key: "reality", primary: "What's really going on?", secondary: "What are you actually thinking?" },
      { key: "next", primary: "What's one step forward?", secondary: "A small step is enough." },
    ],
  },
  decompress: {
    label: "Decompress",
    sections: [
      { key: "happening", primary: "What filled your day?", secondary: "Events, moments, interactions." },
      { key: "reality", primary: "What stayed with you?", secondary: "Feelings that linger." },
      { key: "next", primary: "What do you need?", secondary: "Rest, connection, action." },
    ],
  },
};

const VISUAL_SYSTEM = {
  background: "#f8f9fa",
  surface: "rgba(255, 255, 255, 0.6)",
  ink: "#2d3436",
  muted: "#636e72",
  border: "rgba(178, 190, 195, 0.4)",
  highlight: "rgba(200, 214, 229, 0.4)",
  clarity: {
    clouded: "rgba(232, 236, 241, 0.8)",
    mixed: "rgba(245, 246, 250, 0.4)",
    clear: "rgba(248, 249, 250, 0.6)",
  },
};

const CLARITY_LABELS: Record<ClarityState, { label: string; subtext: string }> = {
  clouded: { label: "Clouded", subtext: "Thoughts feel unclear." },
  mixed: { label: "Mixed", subtext: "Some clarity, some tension." },
  clear: { label: "Clear", subtext: "Mind feels open." },
};

// Utilities
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) return { entries: [] } satisfies JournalListResponse;
  return (await res.json().catch(() => ({}))) as JournalListResponse;
};

function getDayHash(): number {
  const date = new Date();
  const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getRotatingPrompt(prompts: string[]): string {
  return prompts[getDayHash() % prompts.length];
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Components
function ClaritySegmentedControl({
  value,
  onChange,
}: {
  value: ClarityState;
  onChange: (value: ClarityState) => void;
}) {
  const options: ClarityState[] = ["clouded", "mixed", "clear"];
  const selectedIndex = options.indexOf(value);

  return (
    <div className="space-y-2">
      <div className="relative flex">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "flex-1 py-3 text-sm transition-all duration-200",
              value === option
                ? "font-medium text-vella-text"
                : "font-normal text-vella-muted/60 hover:text-vella-muted"
            )}
          >
            {CLARITY_LABELS[option].label}
          </button>
        ))}
        <div
          className="absolute bottom-0 h-0.5 bg-vella-text transition-all duration-300 ease-out"
          style={{ left: `${selectedIndex * 33.333}%`, width: "33.333%" }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-vella-border/30" />
      </div>
      <p className="text-xs text-vella-muted/50 pl-1">{CLARITY_LABELS[value].subtext}</p>
    </div>
  );
}

function TemplateSwitcher({
  value,
  onChange,
}: {
  value: JournalTemplate;
  onChange: (value: JournalTemplate) => void;
}) {
  const templates: JournalTemplate[] = ["freewrite", "clarity", "decompress"];

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-white/50 border border-vella-border/20">
      {templates.map((template) => (
        <button
          key={template}
          type="button"
          onClick={() => onChange(template)}
          className={cn(
            "px-3 py-1.5 text-xs rounded-md transition-all duration-200",
            value === template
              ? "bg-white text-vella-text shadow-sm font-medium"
              : "text-vella-muted/60 hover:text-vella-muted"
          )}
        >
          {TEMPLATE_CONFIG[template].label}
        </button>
      ))}
    </div>
  );
}

function ProgressIndicator({
  current,
  total,
  visible,
}: {
  current: number;
  total: number;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 h-1.5 rounded-full transition-all duration-300",
            i < current ? "bg-vella-text" : i === current ? "bg-vella-text/40 scale-110" : "bg-vella-border/40"
          )}
        />
      ))}
      <span className="ml-1.5 text-[11px] text-vella-muted/50">{current + 1}/{total}</span>
    </div>
  );
}

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn("w-0.5 bg-vella-accent rounded-full transition-all duration-100", active && "animate-pulse")}
          style={{ height: active ? `${20 + Math.random() * 60}%` : "20%", animationDelay: `${i * 0.05}s` }}
        />
      ))}
    </div>
  );
}

function VoiceTranscriber({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [state, setState] = useState<VoiceState>("idle");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptRef = useRef("");

  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setState("listening");
      transcriptRef.current = "";
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript;
      }
      if (finalTranscript) {
        transcriptRef.current += finalTranscript;
        onTranscript(transcriptRef.current);
      }
    };

    recognition.onerror = () => setState("idle");
    recognition.onend = () => {
      if (state === "listening") recognition.start();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [onTranscript, state]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setState("idle");
  }, []);

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={startListening}
        className="text-[11px] text-vella-muted/50 hover:text-vella-muted transition-colors flex items-center gap-1"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        <span>Speak instead</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Waveform active={state === "listening"} />
      <span className="text-[11px] text-vella-muted/60">{state === "listening" ? "Listening…" : "Paused"}</span>
      <button type="button" onClick={stopListening} className="text-[11px] text-vella-muted/40 hover:text-vella-muted transition-colors">Stop</button>
    </div>
  );
}

function AudioRecorder({ onRecording }: { onRecording: (audio: Attachment) => void }) {
  const [state, setState] = useState<AudioRecordState>("idle");
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          onRecording({
            id: generateId(),
            type: "audio",
            dataUrl: reader.result as string,
            duration,
          });
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setState("recording");
      setDuration(0);
      intervalRef.current = window.setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      // Permission denied
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    setState("idle");
  };

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={startRecording}
        className="text-[11px] text-vella-muted/50 hover:text-vella-muted transition-colors flex items-center gap-1"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
        <span>Record audio</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Waveform active={true} />
      <span className="text-[11px] text-vella-muted/60">{formatDuration(duration)}</span>
      <button type="button" onClick={stopRecording} className="text-[11px] text-vella-muted/40 hover:text-vella-muted transition-colors">Stop</button>
    </div>
  );
}

function PhotoAttachment({ onPhoto }: { onPhoto: (photo: Attachment) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      onPhoto({ id: generateId(), type: "photo", dataUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="text-[11px] text-vella-muted/50 hover:text-vella-muted transition-colors flex items-center gap-1"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        <span>Add photo</span>
      </button>
    </>
  );
}

function AttachmentChips({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (id: string) => void }) {
  if (attachments.length === 0) return null;

  const photoCount = attachments.filter((a) => a.type === "photo").length;
  const audioCount = attachments.filter((a) => a.type === "audio").length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {photoCount > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-white/60 rounded-md text-[11px] text-vella-muted/70">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span>{photoCount}</span>
        </div>
      )}
      {audioCount > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-white/60 rounded-md text-[11px] text-vella-muted/70">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          <span>{audioCount}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => attachments.forEach((a) => onRemove(a.id))}
        className="text-[10px] text-vella-muted/40 hover:text-vella-muted/60 transition-colors"
      >
        Clear
      </button>
    </div>
  );
}

function HighlightPinToolbar({
  selectedText,
  onHighlight,
  onPin,
  onClear,
  position,
}: {
  selectedText: string;
  onHighlight: () => void;
  onPin: () => void;
  onClear: () => void;
  position: { x: number; y: number };
}) {
  if (!selectedText) return null;

  return (
    <div
      className="fixed z-50 flex items-center gap-1 px-2 py-1.5 bg-white rounded-lg shadow-lg border border-vella-border/20"
      style={{ left: position.x, top: position.y - 40 }}
    >
      <button type="button" onClick={onHighlight} className="p-1.5 hover:bg-sky-50/50 rounded transition-colors" title="Highlight">
        <svg className="w-4 h-4 text-vella-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      </button>
      <button type="button" onClick={onPin} className="p-1.5 hover:bg-sky-50/50 rounded transition-colors" title="Pin">
        <svg className="w-4 h-4 text-vella-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="12" y1="17" x2="12" y2="3" />
          <path d="M5 17h14" />
        </svg>
      </button>
      <div className="w-px h-4 bg-vella-border/30" />
      <button type="button" onClick={onClear} className="p-1.5 hover:bg-sky-50/50 rounded transition-colors" title="Remove">
        <svg className="w-4 h-4 text-vella-muted/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function EnhancedTextarea({
  value,
  onChange,
  placeholder,
  ariaLabel,
  highlights,
  onHighlightChange,
  onPin,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  ariaLabel: string;
  highlights: Highlight[];
  onHighlightChange: (highlights: Highlight[]) => void;
  onPin: (text: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<{ text: string; start: number; end: number } | null>(null);
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const words = countWords(value);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 72)}px`;
  }, [value]);

  const handleSelection = () => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = value.slice(start, end);

    if (text.trim()) {
      const rect = ta.getBoundingClientRect();
      const lines = value.slice(0, start).split("\n");
      const lineHeight = 24;
      const x = rect.left + 20 + (lines[lines.length - 1].length * 8);
      const y = rect.top + lines.length * lineHeight;

      setSelection({ text, start, end });
      setToolbarPos({ x: Math.min(x, rect.right - 100), y });
    } else {
      setSelection(null);
    }
  };

  const handleHighlight = () => {
    if (!selection) return;
    onHighlightChange([...highlights, { id: generateId(), text: selection.text, start: selection.start, end: selection.end }]);
    setSelection(null);
    textareaRef.current?.focus();
  };

  const handlePin = () => {
    if (!selection) return;
    onPin(selection.text);
    setSelection(null);
    textareaRef.current?.focus();
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onSelect={handleSelection}
        onMouseUp={handleSelection}
        onKeyUp={handleSelection}
        placeholder={placeholder}
        rows={3}
        className={cn(
          "w-full resize-none text-[15px] leading-relaxed placeholder:text-vella-muted/30 focus:outline-none",
          "border-b border-vella-border/30 focus:border-vella-border/60 pb-6 pt-2 px-3 min-h-[72px] bg-white/40 rounded-t-lg"
        )}
        style={{ color: VISUAL_SYSTEM.ink }}
        aria-label={ariaLabel}
      />
      <div className="absolute bottom-1 right-3 text-[11px] text-vella-muted/40">{words > 0 && `${words}`}</div>
      {selection && (
        <HighlightPinToolbar
          selectedText={selection.text}
          onHighlight={handleHighlight}
          onPin={handlePin}
          onClear={() => setSelection(null)}
          position={toolbarPos}
        />
      )}
    </div>
  );
}

function RevealSection({ children, visible, delay = 0 }: { children: React.ReactNode; visible: boolean; delay?: number }) {
  const [shouldRender, setShouldRender] = useState(visible);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setShouldRender(true), delay);
      return () => clearTimeout(timer);
    }
  }, [visible, delay]);

  if (!shouldRender && !visible) return null;

  return (
    <div className={cn("transition-all duration-300 ease-out", visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")}>
      {children}
    </div>
  );
}

function SectionDivider() {
  return <div className="h-px bg-vella-border/20 w-full" />;
}

function JournalSection({
  primary,
  secondary,
  children,
  isActive,
}: {
  primary: string;
  secondary: string;
  children: React.ReactNode;
  isActive?: boolean;
}) {
  return (
    <section className={cn("space-y-3 transition-opacity duration-300", !isActive && "opacity-70")}>
      <div className="space-y-1">
        <h2 className="text-[17px] font-medium text-vella-text leading-tight">{primary}</h2>
        <p className="text-[13px] text-vella-muted/50 leading-snug">{secondary}</p>
      </div>
      {children}
    </section>
  );
}

function SaveFeedback({ visible }: { visible: boolean }) {
  const message = useMemo(() => getRotatingPrompt(SAVE_ACKNOWLEDGMENTS), []);
  return (
    <span className={cn("text-[13px] text-vella-muted/60 transition-opacity duration-300", visible ? "opacity-100" : "opacity-0")}>
      {message}
    </span>
  );
}

// Main Page
export default function JournalPage() {
  const router = useRouter();
  const [template, setTemplate] = useState<JournalTemplate>("clarity");
  const [draft, setDraft] = useState<ResolutionDraft>({ happening: "", reality: "", next: "" });
  const [clarity, setClarity] = useState<ClarityState>("mixed");
  const [consent, setConsent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showCaptured, setShowCaptured] = useState(false);
  const [proposalToast, setProposalToast] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [pinnedSnippet, setPinnedSnippet] = useState<string>("");
  const [currentSection, setCurrentSection] = useState(0);
  const [hasStartedWriting, setHasStartedWriting] = useState(false);

  const capturedTimeoutRef = useRef<number | null>(null);
  const { mutate } = useSWR<JournalListResponse>("/api/journal", fetcher);

  const config = TEMPLATE_CONFIG[template];
  const supportPrompt = useMemo(() => getRotatingPrompt(NEUTRAL_PROMPTS), []);

  useEffect(() => {
    try {
      const savedTemplate = window.localStorage.getItem(TEMPLATE_STORAGE_KEY) as JournalTemplate;
      if (savedTemplate && TEMPLATE_CONFIG[savedTemplate]) setTemplate(savedTemplate);
      const savedClarity = window.localStorage.getItem(CLARITY_STORAGE_KEY) as ClarityState;
      if (savedClarity && CLARITY_LABELS[savedClarity]) setClarity(savedClarity);
    } catch {
      // ignore
    }
    return () => {
      if (capturedTimeoutRef.current) window.clearTimeout(capturedTimeoutRef.current);
    };
  }, []);

  const handleTemplateChange = (newTemplate: JournalTemplate) => {
    setTemplate(newTemplate);
    setDraft({ happening: "", reality: "", next: "" });
    setHighlights([]);
    setPinnedSnippet("");
    setAttachments([]);
    setCurrentSection(0);
    setHasStartedWriting(false);
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, newTemplate);
    } catch {
      // ignore
    }
  };

  const handleDraftChange = (key: keyof ResolutionDraft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (!hasStartedWriting && value.trim()) setHasStartedWriting(true);
    const sectionIndex = config.sections.findIndex((s) => s.key === key);
    if (sectionIndex >= 0) setCurrentSection(sectionIndex);
  };

  const handleAttachment = (attachment: Attachment) => setAttachments((prev) => [...prev, attachment]);
  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));
  const handleHighlight = (sectionHighlights: Highlight[]) => setHighlights(sectionHighlights);
  const handlePin = (text: string) => setPinnedSnippet(text.slice(0, 200));

  const buildContent = useCallback(() => {
    const parts: string[] = [];
    config.sections.forEach((section) => {
      const text = draft[section.key].trim();
      if (text) parts.push(`${section.primary.toUpperCase()}\n${text}`);
    });
    return parts.join("\n\n");
  }, [config, draft]);

  const getSectionVisibility = (index: number) => {
    if (index === 0) return true;
    const prevKey = config.sections[index - 1].key;
    return draft[prevKey].trim().length > 0;
  };

  const allSectionsFilled = config.sections.every((s) => draft[s.key].trim().length > 0);
  const saveEnabled = allSectionsFilled && !isSaving;

  const handleSave = useCallback(async () => {
    if (!saveEnabled) return;
    setIsSaving(true);
    setShowCaptured(false);

    try {
      const text = buildContent();
      if (attachments.length > 0) {
        const savedAttachments = JSON.parse(window.localStorage.getItem("journal:attachments") || "[]");
        savedAttachments.push({ entryId: Date.now().toString(), attachments });
        window.localStorage.setItem("journal:attachments", JSON.stringify(savedAttachments));
      }

      // LOCAL-FIRST: save text on-device, send only metadata to server
      const { createLocalJournal } = await import("@/lib/local/journalLocal");
      const { meta } = await createLocalJournal(undefined, {
        title: pinnedSnippet || null,
        content: text,
        processingMode: consent ? "signals_only" : "private",
      });

      // Sync metadata to server (no text, no title)
      await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      });

      // Proposal generation (local only, signals_only mode)
      if (consent) {
        try {
          const { ensureUserId } = await import("@/lib/local/ensureUserId");
          const { maybeCreateProposal, buildDefaultDeps } = await import("@/lib/osSignals/proposalOnSave");
          const uid = ensureUserId();
          const deps = buildDefaultDeps(uid);
          if (process.env.NODE_ENV === "development") {
            const meta = deps.getRecentEntriesMeta();
            const domains = deps.getSelectedDomains();
            console.debug("[proposal] uid=%s entries=%d domains=%o", uid, meta.length, domains);
          }
          const result = await maybeCreateProposal(deps);
          if (process.env.NODE_ENV === "development") {
            console.debug("[proposal] result=%o", { created: result.created, domain: result.item?.domain ?? null });
          }
          if (result.created) {
            setProposalToast(true);
            setTimeout(() => setProposalToast(false), 3000);
          }
        } catch { /* silent — proposal is best-effort */ }
      }

      setDraft({ happening: "", reality: "", next: "" });
      setHighlights([]);
      setPinnedSnippet("");
      setAttachments([]);
      setConsent(false);
      setShowCaptured(true);
      setHasStartedWriting(false);
      setCurrentSection(0);
      await mutate();
      capturedTimeoutRef.current = window.setTimeout(() => setShowCaptured(false), 1500);
    } finally {
      setIsSaving(false);
    }
  }, [pinnedSnippet, attachments, consent, saveEnabled, mutate, buildContent]);

  // Proposal toast auto-dismiss handled inline above

  const todayLabel = useMemo(() => formatDate(new Date()), []);
  const pageStyle = useMemo(() => ({ backgroundColor: VISUAL_SYSTEM.clarity[clarity] }), [clarity]);

  return (
    <div className="min-h-[100dvh] overflow-y-auto pb-24 transition-colors duration-500" style={pageStyle}>
      <div className="px-5 py-6 space-y-8 max-w-2xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-medium tracking-tight" style={{ color: VISUAL_SYSTEM.ink }}>Journal</h1>
          <button
            type="button"
            onClick={() => router.push("/journal/history")}
            className="text-[10px] font-medium uppercase tracking-wider text-vella-muted/40 hover:text-vella-muted/60 transition-colors"
          >
            Saved
          </button>
        </header>

        {/* Proposal toast */}
        {proposalToast && (
          <div className="text-center text-[11px] font-medium text-vella-muted/70 bg-vella-muted/5 rounded-lg py-2 px-3 animate-fade-in">
            Execution suggestion added to Inbox
          </div>
        )}

        {/* Date */}
        <div className="flex justify-end">
          <span className="text-[11px] text-vella-muted/50">{todayLabel}</span>
        </div>

        {/* Template Switcher */}
        <div className="flex items-center justify-between">
          <TemplateSwitcher value={template} onChange={handleTemplateChange} />
          {hasStartedWriting && <ProgressIndicator current={currentSection} total={config.sections.length} visible={true} />}
        </div>

        {/* Clarity Control */}
        <ClaritySegmentedControl
          value={clarity}
          onChange={(c) => {
            setClarity(c);
            try {
              window.localStorage.setItem(CLARITY_STORAGE_KEY, c);
            } catch {
              // ignore
            }
          }}
        />

        {/* Journal Sections */}
        <div className="space-y-8">
          {config.sections.map((section, index) => {
            const isVisible = getSectionVisibility(index);
            const isActive = index === currentSection || draft[section.key].trim().length > 0;

            return (
              <RevealSection key={section.key} visible={isVisible} delay={index * 100}>
                {index > 0 && <SectionDivider />}
                <JournalSection primary={section.primary} secondary={section.secondary} isActive={isActive}>
                  <EnhancedTextarea
                    value={draft[section.key]}
                    onChange={(v) => handleDraftChange(section.key, v)}
                    placeholder={index === 0 ? supportPrompt : "..."}
                    ariaLabel={section.primary}
                    highlights={highlights}
                    onHighlightChange={handleHighlight}
                    onPin={handlePin}
                  />

                  {/* Voice + Audio + Photo row */}
                  <div className="flex items-center gap-4 pt-2">
                    <VoiceTranscriber
                      onTranscript={(text) => {
                        const current = draft[section.key];
                        const separator = current && !current.endsWith(" ") ? " " : "";
                        handleDraftChange(section.key, current + separator + text);
                      }}
                    />
                    <AudioRecorder onRecording={handleAttachment} />
                    <PhotoAttachment onPhoto={handleAttachment} />
                  </div>

                  {/* Attachments */}
                  <div className="pt-2">
                    <AttachmentChips attachments={attachments} onRemove={removeAttachment} />
                  </div>

                  {/* Pinned snippet indicator */}
                  {pinnedSnippet && index === 0 && (
                    <div className="flex items-center gap-2 text-[11px] text-vella-muted/50">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <line x1="12" y1="17" x2="12" y2="3" />
                        <path d="M5 17h14" />
                      </svg>
                      <span>Pinned: {pinnedSnippet.slice(0, 40)}...</span>
                    </div>
                  )}
                </JournalSection>
              </RevealSection>
            );
          })}
        </div>

        {/* Consent Toggle - Progressive reveal */}
        <RevealSection visible={allSectionsFilled} delay={150}>
          <div className="pt-4">
            <button type="button" onClick={() => setConsent(!consent)} className="flex items-center gap-3 group">
              <div className={cn("w-10 h-5 rounded-full transition-colors duration-200", consent ? "bg-vella-text/70" : "bg-vella-border/50")}>
                <div className={cn("w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5", consent ? "translate-x-5" : "translate-x-0.5")} />
              </div>
              <span className="text-[13px] text-vella-muted/70">Allow Vella to learn from this</span>
            </button>
            {consent && (
              <p className="text-[11px] text-vella-muted/40 ml-14 mt-1">If enabled, only structured signals are saved to your account. Your text stays on this device.</p>
            )}
          </div>
        </RevealSection>

        {/* Save Action */}
        <RevealSection visible={allSectionsFilled} delay={200}>
          <div className="pt-6 flex items-center justify-between">
            <SaveFeedback visible={showCaptured} />
            <button
              type="button"
              onClick={handleSave}
              disabled={!saveEnabled}
              className={cn(
                "px-5 py-2 text-[13px] font-medium text-white transition-all duration-200 rounded-md bg-vella-text/80 hover:bg-vella-text",
                isSaving && "opacity-70",
                !saveEnabled && "opacity-40 pointer-events-none"
              )}
            >
              Save
            </button>
          </div>
        </RevealSection>
      </div>
    </div>
  );
}

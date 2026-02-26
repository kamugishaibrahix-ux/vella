"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mic, AudioLines, Send, Plus, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ensureActiveSession,
  getActiveSessionId,
  getMessagesForSession,
  addMessage,
  createSession,
  closeSession,
  type VellaMessage,
} from "@/lib/session/sessionStore";
import { buildConversationContext } from "@/lib/llm/contextBuilder";

// Speech recognition types
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtorLike = new () => SpeechRecognitionLike;

export default function SessionPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VellaMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Initialize session
  useEffect(() => {
    const id = ensureActiveSession();
    setSessionId(id);
    setMessages(getMessagesForSession(id));
  }, []);

  const refreshMessages = useCallback(() => {
    const id = getActiveSessionId();
    if (id) setMessages(getMessagesForSession(id));
  }, []);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    const id = getActiveSessionId();
    if (id) closeSession(id);
    const newSession = createSession();
    setSessionId(newSession.sessionId);
    setMessages([]);
    setInput("");
    setError(null);
  }, []);

  // Transcribe button handler
  const handleTranscribe = useCallback(() => {
    textareaRef.current?.focus();
    if (typeof window === "undefined") return;

    const SpeechRecognitionCtor =
      ((window as any).SpeechRecognition as SpeechRecognitionCtorLike | undefined) ??
      ((window as any).webkitSpeechRecognition as SpeechRecognitionCtorLike | undefined);

    if (!SpeechRecognitionCtor) return;

    if (recording) {
      recognitionRef.current?.stop();
      return;
    }

    const base = input;
    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0]?.transcript ?? "";
      }
      setInput(base ? `${base} ${transcript.trim()}` : transcript.trim());
    };

    const stop = () => setRecording(false);
    recognition.onend = stop;
    recognition.onerror = stop;

    try {
      setRecording(true);
      recognition.start();
    } catch {
      setRecording(false);
    }
  }, [input, recording]);

  // Cleanup speech recognition
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  // Send message handler with image support and safety gating
  const handleSend = useCallback(async () => {
    const text = input.trim();
    const hasImage = !!selectedImage && !!imageFile;

    // Allow sending if there's text OR an image
    if ((!text && !hasImage) || !sessionId || sending) return;

    // Clear input and image after validation
    setInput("");
    setError(null);
    const imageToSend = selectedImage;
    const fileToSend = imageFile;
    setSelectedImage(null);
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    const previousMessages = getMessagesForSession(sessionId);
    const history = buildConversationContext(
      previousMessages.map((m) => ({ role: m.role, content: m.content }))
    );

    // Add user message with image marker if present
    const userContent = hasImage
      ? `[Image attached] ${text || "What do you see?"}`
      : text;
    addMessage({ sessionId, role: "user", content: userContent });
    refreshMessages();

    setSending(true);
    try {
      // Prepare request body
      const requestBody: any = {
        message: text || (hasImage ? "What do you see?" : ""),
        session_id: sessionId,
        conversationHistory: history,
      };

      // If image is present, add it as base64
      if (hasImage && imageToSend) {
        requestBody.image = imageToSend; // base64 data URL
        requestBody.hasImage = true;
        requestBody.visionConstraints = {
          allowed: [
            "context_interpretation",
            "behaviour_linked_insight",
            "decision_assistance",
            "environmental_observations",
          ],
          blocked: [
            "medical_diagnosis",
            "calorie_precision",
            "body_weight_estimation",
            "facial_recognition",
            "identifying_people",
          ],
          safetyProtocol: true,
        };
      }

      const res = await fetch("/api/vella/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.message ?? data?.error ?? `Request failed (${res.status})`;
        setError(msg);
        return;
      }

      const data = await res.json();
      const reply = data?.reply ?? "";
      if (reply) {
        addMessage({ sessionId, role: "assistant", content: reply });
        refreshMessages();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }, [input, sessionId, sending, refreshMessages, selectedImage, imageFile]);

  // Handle keydown for textarea (Enter to send, Shift+Enter for newline)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Handle image selection
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) return; // 10MB max

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  // Clear selected image
  const clearSelectedImage = useCallback(() => {
    setSelectedImage(null);
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // Trigger file input click
  const triggerImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle quick intent selection
  const handleQuickIntent = useCallback((intent: string) => {
    setInput(intent);
    textareaRef.current?.focus();
  }, []);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const sh = ta.scrollHeight;
    const h = Math.min(sh, 160);
    ta.style.height = `${h}px`;
    ta.style.overflowY = sh > 160 ? "auto" : "hidden";
  }, [input]);

  // Scroll to bottom on new messages
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const hasText = input.trim().length > 0;

  return (
    <div className="h-dvh flex flex-col bg-vella-bg">
      {/* Header */}
      <header className="shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-vella-text">Vella</h1>
            <p className="text-sm text-vella-muted mt-0.5">Whatever&apos;s on your mind.</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleNewChat}
              className="p-2 rounded-lg text-vella-muted hover:text-vella-text hover:bg-vella-bg-card pressable"
              aria-label="New chat"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/session/archive")}
              className="text-sm text-vella-muted hover:text-vella-text font-medium pressable py-1.5 px-2"
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => router.push("/home")}
              className="p-2 rounded-lg text-vella-muted hover:text-vella-text hover:bg-vella-bg-card pressable"
              aria-label="Close session"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                m.role === "user"
                  ? "bg-vella-primary text-white"
                  : "bg-vella-bg-card border border-vella-border text-vella-text"
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 text-sm bg-vella-bg-card border border-vella-border text-vella-muted">
              <span className="animate-pulse">Thinking…</span>
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-xl px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 px-4 py-3 pb-[env(safe-area-inset-bottom,0px)] border-t border-vella-border bg-vella-bg">
        {/* Image Preview */}
        {selectedImage && (
          <div className="mb-2 flex items-start gap-2">
            <div className="relative">
              <img
                src={selectedImage}
                alt="Selected"
                className="h-16 w-16 rounded-lg object-cover border border-vella-border"
              />
              <button
                type="button"
                onClick={clearSelectedImage}
                className="absolute -top-1 -right-1 p-0.5 rounded-full bg-vella-text text-vella-bg text-[10px] leading-none"
                aria-label="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
          aria-label="Upload image"
        />

        {/* Input Row */}
        <div className="flex items-center gap-2 rounded-full border border-vella-border bg-vella-bg-card px-4 py-2 shadow-sm">
          {/* Image Upload Icon - Left side */}
          <button
            type="button"
            onClick={triggerImageUpload}
            disabled={sending}
            className="p-1.5 rounded-full text-vella-muted hover:text-vella-text hover:bg-vella-bg transition-all duration-150 active:scale-95 shrink-0"
            aria-label="Upload image"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            rows={1}
            className="flex-1 min-h-[24px] max-h-[160px] resize-none overflow-hidden bg-transparent text-vella-text placeholder:text-vella-muted text-sm focus:outline-none"
            disabled={sending}
          />

          {/* Transcribe Button - Mic Icon */}
          <button
            type="button"
            onClick={handleTranscribe}
            className={cn(
              "p-2 rounded-full transition-all duration-150 active:scale-95 shrink-0",
              recording
                ? "text-vella-primary bg-vella-primary/10"
                : "text-vella-muted hover:text-vella-text hover:bg-vella-bg"
            )}
            aria-label="Transcribe"
          >
            <Mic className="w-5 h-5" />
          </button>

          {/* Primary Button - Waveform OR Send */}
          {hasText || selectedImage ? (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="p-2 rounded-full bg-vella-primary text-white hover:bg-vella-primary-hover transition-all duration-150 active:scale-95 shrink-0 disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push("/session/voice")}
              className="p-2 rounded-full bg-vella-primary text-white hover:bg-vella-primary-hover transition-all duration-150 active:scale-95 shrink-0"
              aria-label="Voice session"
            >
              <AudioLines className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Quick Intent Chips */}
        <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {[
            "Help me decide",
            "I feel stuck",
            "Break this down",
            "Reflect with me",
          ].map((intent) => (
            <button
              key={intent}
              type="button"
              onClick={() => handleQuickIntent(intent)}
              disabled={sending}
              className="shrink-0 px-3 py-1.5 rounded-full bg-vella-bg-card border border-vella-border/60 text-xs text-vella-muted hover:text-vella-text hover:border-vella-border transition-all duration-150 active:scale-95"
            >
              {intent}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

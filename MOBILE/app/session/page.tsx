"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Mic, AudioLines, Send, Plus, X, Camera, Check, Archive } from "lucide-react";
import type { PendingProposal } from "@/lib/session/negotiationState";
import {
  persistProposal,
  restoreProposal,
  clearPersistedProposal,
  isProposalDuplicate,
  markProposalSeen,
  clearSeenProposals,
} from "@/lib/session/negotiationState";
import { getSelectedDomainLabels } from "@/lib/focusAreas";
import { cn } from "@/lib/utils";
import { VellaMessage as VellaMessageBubble } from "@/components/chat/VellaMessage";
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
import { addFocusSessionLocal } from "@/lib/local/focusSessionsLocal";
import { useAccountStatus } from "@/app/components/providers/AccountStatusProvider";
// UpgradeModal kept in codebase but no longer mounted from session page
// import { UpgradeModal } from "@/components/UpgradeModal";
import { useApiErrorGuard, extractApiError, ERROR_MESSAGES } from "@/hooks/useApiErrorGuard";
import { OSModeSelector } from "@/components/OSModeSelector";
import { getStoredOSMode } from "@/lib/system/osModes";

const VELLA_DEBUG = process.env.NEXT_PUBLIC_VELLA_DEBUG === "1";

interface VellaDebugInfo {
  trace_id: string;
  mode: string | null;
  tier: string | null;
  reason: string | null;
  plan: string | null;
  plan_override: string | null;
  token_balance_before: number | null;
  token_balance_after: number | null;
  openai_attempted: boolean;
  openai_model: string | null;
  openai_duration_ms: number | null;
  openai_success: boolean | null;
  error_stage: string | null;
  error_message: string | null;
  duration_ms: number | null;
  route_path: string | null;
}

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
  const [isBasicMode, setIsBasicMode] = useState(false);
  const [lastResponseReason, setLastResponseReason] = useState<string | null>(null);
  const [debugInfoMap, setDebugInfoMap] = useState<Record<string, VellaDebugInfo>>({});
  const [expandedDebug, setExpandedDebug] = useState<Set<string>>(new Set());

  // Negotiation protocol state
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
  const [confirmingProposal, setConfirmingProposal] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ contractId: string } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [domainLabels, setDomainLabels] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Token depletion and entitlement guards via AccountStatusProvider
  const account = useAccountStatus();
  const { errorState, handleError, clearError, hasError } = useApiErrorGuard();
  // Navigation-based upgrade flow (replaces modal)

  // Compute blocked states using canonical account status
  const isUnlimited = account.isUnlimited;
  const isTokenDepleted = account.isDepleted;
  const isBlocked = isTokenDepleted || hasError;

  // UX: Single source of truth for user-facing error — do not conflate error types
  const isAiNotConfigured =
    hasError &&
    !isTokenDepleted &&
    (errorState.type === "ai_not_configured" ||
      errorState.type === "feature_not_available" ||
      errorState.type === "account_inactive");

  const uiError: string | null = isTokenDepleted
    ? "Token limit reached"
    : isAiNotConfigured
      ? "AI not configured"
      : (hasError && !isTokenDepleted)
        ? "Temporary issue"
        : error || null;

  // Initialize session
  useEffect(() => {
    const id = ensureActiveSession();
    setSessionId(id);
    setMessages(getMessagesForSession(id));
    const restored = restoreProposal(id);
    if (restored) setPendingProposal(restored);
    setDomainLabels(getSelectedDomainLabels());
  }, []);

  const refreshMessages = useCallback(() => {
    const id = getActiveSessionId();
    if (id) setMessages(getMessagesForSession(id));
  }, []);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    const id = getActiveSessionId();
    if (id) {
      closeSession(id);
      clearPersistedProposal(id);
      clearSeenProposals(id);
      // Write local focus session record (best-effort)
      addFocusSessionLocal({
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        completed: true,
      }).catch(() => {});
    }
    const newSession = createSession();
    setSessionId(newSession.sessionId);
    setMessages([]);
    setInput("");
    setError(null);
    setLastResponseReason(null);
    setPendingProposal(null);
    setConfirmResult(null);
    setConfirmError(null);
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
  // PHASE B: Hard stop UX - prevents sending when token depleted
  const handleSend = useCallback(async () => {
    const text = input.trim();
    const hasImage = !!selectedImage && !!imageFile;

    // Do NOT block chat at client level.
    // Server will enforce token + fallback logic.

    // Allow sending if there's text OR an image
    if ((!text && !hasImage) || !sessionId || sending) return;

    // Clear input and image after validation
    setInput("");
    setError(null);
    clearError();
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
        osMode: getStoredOSMode(),
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

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (VELLA_DEBUG) headers["x-vella-debug"] = "1";

      const res = await fetch("/api/vella/text", {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      // Capture trace ID from response header
      const traceId = res.headers.get("x-vella-trace-id");

      console.log("STATUS:", res.status);

      // PHASE B: Unified error handling via useApiErrorGuard
      if (!res.ok) {
        const apiError = await extractApiError(res);
        const isBlocking = handleError(apiError, res.status);
        
        if (isBlocking) {
          // Show appropriate UI based on error type
          if (apiError?.code === "quota_exceeded" || res.status === 402) {
            router.push("/profile/upgrade");
          }
        }
        
        const msg = apiError?.message ?? apiError?.error ?? ERROR_MESSAGES[errorState.type ?? "unknown"];
        setError(msg);
        return;
      }

      const data = await res.json();

      // VELLA TRACE: browser console log
      if (VELLA_DEBUG && data?.__debug) {
        console.info("%cVELLA TRACE", "color:#C08A5D;font-weight:bold", data.__debug);
      } else if (traceId) {
        console.info("%cVELLA TRACE", "color:#C08A5D;font-weight:bold", { trace_id: traceId, mode: data?.mode });
      }

      // Track response reason for UX banner
      setLastResponseReason(data?.reason ?? data?.mode ?? null);

      if (data?.basicMode === true) {
        setIsBasicMode(true);
      } else {
        setIsBasicMode(false);
      }

      const reply = data?.reply ?? "";
      if (reply) {
        addMessage({ sessionId, role: "assistant", content: reply });
        refreshMessages();

        // Store debug info keyed by the message that was just added
        if (VELLA_DEBUG && data?.__debug) {
          const latestMessages = getMessagesForSession(sessionId);
          const lastMsg = latestMessages[latestMessages.length - 1];
          if (lastMsg) {
            setDebugInfoMap(prev => ({ ...prev, [lastMsg.id]: data.__debug as VellaDebugInfo }));
          }
        }
      }

      // Handle proposal from negotiation protocol (with duplicate suppression)
      if (data?.proposal && sessionId) {
        const p = data.proposal as PendingProposal;
        if (!isProposalDuplicate(sessionId, p.domain, p.severity)) {
          setPendingProposal(p);
          persistProposal(sessionId, p);
          markProposalSeen(sessionId, p.domain, p.severity);
          setConfirmResult(null);
          setConfirmError(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }, [input, sessionId, sending, refreshMessages, selectedImage, imageFile, isBlocked, isTokenDepleted, clearError, handleError, errorState.type, router]);

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
    <div className="h-dvh flex flex-col overflow-hidden bg-gradient-to-b from-[#f3f6fb] to-[#eef2f7] text-gray-900 max-w-full" style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <header className="shrink-0 h-14 flex items-center justify-between px-4 w-full" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Image src="/icons/icon-192.png" alt="Vella" width={28} height={28} priority className="w-7 h-7 rounded-[6px] shrink-0 object-contain" />
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900 truncate overflow-hidden whitespace-nowrap text-ellipsis">Session</h1>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Token usage indicator */}
          {!isUnlimited && (
            <span
              className="flex items-center min-w-[44px] min-h-[44px] justify-center cursor-default"
              title="Token usage indicator"
            >
              <span
                className={cn(
                  "inline-block w-2 h-2 rounded-full",
                  isTokenDepleted
                    ? "bg-red-500"
                    : account.isCritical
                      ? "bg-amber-500"
                      : "bg-gray-400"
                )}
              />
            </span>
          )}
          <button
            type="button"
            onClick={handleNewChat}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 pressable"
            aria-label="New chat"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/session/archive")}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 pressable"
            aria-label="Archive"
          >
            <Archive className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/home")}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 pressable"
            aria-label="Close session"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>
      {/* Session subtitle + mode selector (below compact header) */}
      <div className="shrink-0 px-4 pb-2">
        <p className="text-xs text-gray-500 whitespace-nowrap">Talk it through. Turn it into an execution plan.</p>
        {domainLabels.length > 0 && (
          <p className="mt-0.5 text-xs text-sky-500 truncate overflow-hidden whitespace-nowrap text-ellipsis">
            {domainLabels.length > 2
              ? `${domainLabels.slice(0, 2).join(" · ")} · \u2026`
              : domainLabels.join(" · ")}
          </p>
        )}
        <div className="mt-1">
          <OSModeSelector variant="compact" />
        </div>
      </div>

      {/* Basic mode notice */}
      {isBasicMode && (
        <div className="text-xs text-amber-600 mb-2 px-6">
          Basic mode active · Upgrade for full AI intelligence
        </div>
      )}

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide bg-gradient-to-b from-neutral-50 to-neutral-100 px-4 sm:px-6 py-6 sm:py-8 space-y-6 min-h-0">
        {messages.map((m) => (
          <div key={m.id}>
            <VellaMessageBubble
              role={m.role}
              content={m.content}
            />
            {VELLA_DEBUG && m.role === "assistant" && debugInfoMap[m.id] && (
              <div className="ml-4 mt-1">
                <button
                  type="button"
                  onClick={() => setExpandedDebug(prev => {
                    const next = new Set(prev);
                    next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                    return next;
                  })}
                  className="text-[10px] text-gray-400 hover:text-gray-600 font-mono"
                >
                  {expandedDebug.has(m.id) ? "▾" : "▸"} trace: {debugInfoMap[m.id].trace_id.slice(0, 8)}
                </button>
                {expandedDebug.has(m.id) && (
                  <div className="mt-1 p-2 rounded bg-gray-100 border border-gray-200 text-[10px] font-mono text-gray-600 space-y-0.5 max-w-[85%]">
                    <div><b>trace_id:</b> {debugInfoMap[m.id].trace_id}</div>
                    <div><b>route_path:</b> {debugInfoMap[m.id].route_path}</div>
                    <div><b>mode:</b> {debugInfoMap[m.id].mode} | <b>tier:</b> {debugInfoMap[m.id].tier ?? "—"}</div>
                    <div><b>reason:</b> {debugInfoMap[m.id].reason}</div>
                    <div><b>plan:</b> {debugInfoMap[m.id].plan}{debugInfoMap[m.id].plan_override ? ` (override: ${debugInfoMap[m.id].plan_override})` : ""}</div>
                    <div><b>tokens before:</b> {debugInfoMap[m.id].token_balance_before ?? "—"} | <b>after:</b> {debugInfoMap[m.id].token_balance_after ?? "—"}</div>
                    <div><b>openai:</b> {debugInfoMap[m.id].openai_attempted ? `✓ ${debugInfoMap[m.id].openai_model} ${debugInfoMap[m.id].openai_duration_ms}ms ${debugInfoMap[m.id].openai_success ? "OK" : "FAIL"}` : "not attempted"}</div>
                    {debugInfoMap[m.id].error_stage && (
                      <div className="text-red-500"><b>error:</b> [{debugInfoMap[m.id].error_stage}] {debugInfoMap[m.id].error_message}</div>
                    )}
                    <div><b>total:</b> {debugInfoMap[m.id].duration_ms}ms</div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <VellaMessageBubble
            role="assistant"
            content="Tuning in…"
            isStreaming
          />
        )}

        {/* Negotiation: Proposal confirmation card */}
        {pendingProposal && !confirmResult && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-vella-bg-card border border-vella-border">
              <span className="text-[10px] uppercase tracking-wide text-vella-muted font-medium">Plan Proposal</span>
              <p className="text-sm text-vella-text mt-1">
                Shall we commit to <span className="font-medium">{pendingProposal.domain}</span> for {pendingProposal.suggestedDurationDays} days this week?
              </p>
              <p className="text-xs text-vella-muted mt-1">
                {pendingProposal.severity} severity · weight {pendingProposal.suggestedBudgetWeight}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  disabled={confirmingProposal}
                  onClick={async () => {
                    setConfirmingProposal(true);
                    setConfirmError(null);
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
                        // Re-fetch contracts before clearing state
                        try {
                          await fetch("/api/checkin/contracts");
                        } catch {
                          // non-blocking — contract was created regardless
                        }
                        setConfirmResult({ contractId: result.contractId });
                        setPendingProposal(null);
                        if (sessionId) {
                          clearPersistedProposal(sessionId);
                          addMessage({ sessionId, role: "assistant", content: "Execution Plan Created." });
                          refreshMessages();
                        }
                      } else {
                        const errData = await res.json().catch(() => null);
                        setConfirmError(errData?.code ?? "Confirm failed");
                      }
                    } catch {
                      setConfirmError("Network error");
                    } finally {
                      setConfirmingProposal(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-vella-primary text-white hover:bg-vella-primary-hover disabled:opacity-50"
                >
                  {confirmingProposal ? "Confirming…" : "Confirm"}
                </button>
                <button
                  type="button"
                  disabled={confirmingProposal}
                  onClick={() => {
                    setPendingProposal(null);
                    setConfirmError(null);
                    if (sessionId) clearPersistedProposal(sessionId);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs text-vella-muted hover:text-vella-text disabled:opacity-50"
                >
                  Cancel
                </button>
                {confirmError && (
                  <span className="text-[10px] text-red-500 self-center">{confirmError}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Negotiation: Confirm success — link to check-in */}
        {confirmResult && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-vella-bg-card border border-vella-border">
              <div className="flex items-center gap-1.5 text-sm text-emerald-700">
                <Check className="w-3.5 h-3.5" />
                <span className="font-medium">Execution Plan Created</span>
              </div>
              <Link
                href="/checkin"
                className="text-xs text-vella-muted hover:text-vella-text mt-1 inline-block"
              >
                View in Check-in →
              </Link>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 sticky bottom-0 border-t border-gray-200 bg-gradient-to-b from-[#eef2f7] to-[#eef2f7] px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}>
        {/* UX hint banner based on last response */}
        {lastResponseReason === "token_blocked" && (
          <div className="mb-2 px-1 text-xs text-amber-600">
            Token limit reached for this period.{" "}
            <button type="button" onClick={() => router.push("/profile/upgrade")} className="underline font-medium">Upgrade</button>
          </div>
        )}
        {lastResponseReason === "engine" && (
          <div className="mb-2 px-1 text-xs text-gray-500 italic">
            Quick reply mode. Add details for a deeper answer.
          </div>
        )}
        {/* Image Preview */}
        {selectedImage && (
          <div className="mb-2 flex items-start gap-2">
            <div className="relative">
              <Image
                src={selectedImage}
                alt="Selected"
                width={64}
                height={64}
                className="h-16 w-16 rounded-lg object-cover border border-gray-200"
                unoptimized
              />
              <button
                type="button"
                onClick={clearSelectedImage}
                className="absolute -top-1 -right-1 p-0.5 rounded-full bg-gray-800 text-white text-[10px] leading-none"
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


        {/* Quick Intent Chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-3">
          {([
            { label: "Help me decide", prompt: "Vella, help me decide between two options. Here are the details: " },
            { label: "I feel stuck", prompt: "Vella, I feel stuck. Help me understand what's blocking me: " },
            { label: "Break this down", prompt: "Vella, break this down into clear steps: " },
            { label: "Reflect with me", prompt: "Vella, reflect with me on what happened and what it means: " },
          ] as const).map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleQuickIntent(chip.prompt)}
              disabled={sending}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs text-gray-600 border border-gray-300 hover:bg-gray-100 transition-all duration-150 active:scale-95 disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Structured Input Box */}
        <div className="rounded-xl border border-gray-200 bg-white">
          {/* Textarea (top) */}
          <div className="px-4 py-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Talk it through..."
              rows={1}
              className="w-full bg-transparent outline-none resize-none text-gray-900 placeholder-gray-400 text-base"
              disabled={sending}
            />
          </div>

          {/* Action Row (bottom) */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              {/* Image Upload */}
              <button
                type="button"
                onClick={triggerImageUpload}
                disabled={sending}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition active:scale-95 disabled:opacity-50"
                aria-label="Upload image"
              >
                <Camera className="w-5 h-5" />
              </button>

              {/* Transcribe */}
              <button
                type="button"
                onClick={handleTranscribe}
                className={cn(
                  "p-2 rounded-lg transition active:scale-95",
                  recording
                    ? "text-emerald-600 bg-emerald-50"
                    : "text-gray-600 hover:bg-gray-100"
                )}
                aria-label="Transcribe"
              >
                <Mic className="w-5 h-5" />
              </button>
            </div>

            {/* Send or Voice */}
            {hasText || selectedImage ? (
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition active:scale-95 disabled:opacity-50"
                aria-label="Send"
              >
                <Send className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/session/voice")}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition active:scale-95"
                aria-label="Voice session"
              >
                <AudioLines className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Upgrade modal removed — navigates to /profile/upgrade instead */}
    </div>
  );
}

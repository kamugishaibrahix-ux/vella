"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAllSessions, getActiveSessionId, setActiveSessionId } from "@/lib/session/sessionStore";
import type { VellaSession } from "@/lib/session/sessionStore";

export default function ArchivePage() {
  const [sessions, setSessions] = useState<VellaSession[]>([]);
  const router = useRouter();
  const activeId = getActiveSessionId();

  useEffect(() => {
    setSessions(getAllSessions());
  }, []);

  function handleSelect(session: VellaSession) {
    setActiveSessionId(session.sessionId);
    router.push("/session");
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 px-4 pb-[var(--bottom-nav-height)]">
      <header className="pt-6 pb-4 shrink-0">
        <button
          type="button"
          onClick={() => router.push("/session")}
          className="text-sm text-vella-muted hover:text-vella-text pressable mb-2"
        >
          ← Back to Vella
        </button>
        <h1 className="text-2xl font-semibold">Session archive</h1>
        <p className="text-sm text-vella-muted mt-1">
          Tap a session to view it.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto space-y-2">
        {sessions.length === 0 ? (
          <p className="text-sm text-vella-muted py-8">No sessions yet.</p>
        ) : (
          sessions.map((session) => {
            const isActive = session.sessionId === activeId && !session.closedAt;
            const title = session.title || `Session — ${formatDate(session.createdAt)}`;
            return (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => handleSelect(session)}
                className="w-full text-left rounded-vella-card border border-vella-border bg-vella-bg-card p-4 pressable hover:border-vella-accent-muted transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-vella-text truncate flex-1">
                    {title}
                  </span>
                  {isActive && (
                    <span className="shrink-0 text-xs font-medium text-vella-accent">
                      Active
                    </span>
                  )}
                  {session.closedAt && !isActive && (
                    <span className="shrink-0 text-xs text-vella-muted">Closed</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-vella-muted">
                  <span>{formatDate(session.lastMessageAt)}</span>
                  <span>{session.messageCount} messages</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

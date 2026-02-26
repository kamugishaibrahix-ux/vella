"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import {
  getAllSessions,
  deleteSession,
  setActiveSessionId,
  getMessagesForSession,
  type VellaSession,
} from "@/lib/session/sessionStore";

export default function SessionArchivePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<VellaSession[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load sessions on mount
  useEffect(() => {
    setSessions(getAllSessions());
  }, []);

  const handleReopen = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      router.push("/session");
    },
    [router]
  );

  const handleDelete = useCallback((sessionId: string) => {
    setDeleteConfirm(sessionId);
  }, []);

  const confirmDelete = useCallback((sessionId: string) => {
    deleteSession(sessionId);
    setSessions(getAllSessions());
    setDeleteConfirm(null);
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  return (
    <div className="h-dvh flex flex-col bg-vella-bg">
      {/* Header */}
      <header className="shrink-0 px-4 pt-4 pb-2 border-b border-vella-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-lg text-vella-muted hover:text-vella-text hover:bg-vella-bg-card"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold text-vella-text">Archived sessions</h1>
        </div>
      </header>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {sessions.length === 0 ? (
          <p className="text-sm text-vella-muted mt-4">No archived sessions yet.</p>
        ) : (
          sessions.map((session) => {
            const messages = getMessagesForSession(session.sessionId);
            const preview = messages[messages.length - 1]?.content.slice(0, 60) ?? "";

            return (
              <div
                key={session.sessionId}
                className={cn(
                  "group relative rounded-xl border border-vella-border bg-vella-bg-card p-4",
                  "hover:border-vella-primary/30 transition-colors"
                )}
              >
                {deleteConfirm === session.sessionId ? (
                  // Delete confirmation overlay
                  <div className="absolute inset-0 rounded-xl bg-vella-bg-card/95 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 z-10">
                    <p className="text-sm text-vella-text font-medium text-center">
                      Delete this conversation?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={cancelDelete}
                        className="px-4 py-2 text-sm text-vella-muted hover:text-vella-text rounded-lg hover:bg-vella-bg"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDelete(session.sessionId)}
                        className="px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Session content */}
                <button
                  type="button"
                  onClick={() => handleReopen(session.sessionId)}
                  className="w-full text-left"
                >
                  <h3 className="font-medium text-vella-text pr-10">
                    {session.title ?? `Session — ${formatDate(session.createdAt)}`}
                  </h3>
                  {preview && (
                    <p className="text-sm text-vella-muted mt-1 line-clamp-2">{preview}</p>
                  )}
                  <p className="text-xs text-vella-muted mt-2">
                    {formatDate(session.lastMessageAt)} • {session.messageCount} messages
                  </p>
                </button>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleDelete(session.sessionId)}
                  className="absolute top-3 right-3 p-2 rounded-lg text-vella-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Delete session"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

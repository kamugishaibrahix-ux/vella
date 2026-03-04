"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useState, useEffect, useCallback, useRef } from "react";

type BootstrapState = "loading" | "ready" | "error";

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BootstrapState>("loading");
  const attempted = useRef(false);

  const bootstrap = useCallback(async () => {
    setState("loading");
    try {
      const supabase = createClientComponentClient();
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("[AuthBootstrap] getSession error:", error.message);
        setState("error");
        return;
      }

      if (data.session) {
        setState("ready");
        return;
      }

      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        console.error("[AuthBootstrap] signInAnonymously error:", signInError.message);
        setState("error");
        return;
      }

      setState("ready");
    } catch (e) {
      console.error("[AuthBootstrap] UNCAUGHT:", e instanceof Error ? e.message : e);
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    bootstrap();
  }, [bootstrap]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vella-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading…</span>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vella-bg">
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <p className="text-sm text-gray-600">Unable to start session</p>
          <button
            type="button"
            onClick={() => {
              attempted.current = false;
              bootstrap();
            }}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 transition active:scale-95"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

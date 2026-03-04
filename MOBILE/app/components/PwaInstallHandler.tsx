"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * PWA Install Handler.
 *
 * Listens for the `beforeinstallprompt` event, stores the deferred prompt,
 * and renders a minimal install button when the app is installable.
 * The button is hidden once installed or dismissed.
 *
 * On iOS (no beforeinstallprompt), shows a manual instruction banner instead.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const INSTALL_DISMISSED_KEY = "vella_install_dismissed";

export function PwaInstallHandler() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === "true";
  });

  useEffect(() => {
    // Already installed as standalone — do nothing
    if (isStandalone()) return;

    // iOS: show manual install banner
    if (isIOS()) {
      setShowIOSBanner(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
    setDismissed(true);
    localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
    setShowIOSBanner(false);
  }, []);

  if (dismissed) return null;

  // Chrome / Android install prompt
  if (deferredPrompt) {
    return (
      <div style={bannerStyle}>
        <p style={textStyle}>Install Vella for the best experience</p>
        <div style={buttonRow}>
          <button onClick={handleInstall} style={installBtnStyle}>
            Install
          </button>
          <button onClick={handleDismiss} style={dismissBtnStyle}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  // iOS manual install banner
  if (showIOSBanner) {
    return (
      <div style={bannerStyle}>
        <p style={textStyle}>
          To install Vella, tap{" "}
          <span style={{ fontWeight: 600 }}>Share</span> then{" "}
          <span style={{ fontWeight: 600 }}>Add to Home Screen</span>
        </p>
        <button onClick={handleDismiss} style={dismissBtnStyle}>
          Got it
        </button>
      </div>
    );
  }

  return null;
}

// ── Minimal inline styles (no external CSS dependency) ──

const bannerStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 80,
  left: 16,
  right: 16,
  zIndex: 9999,
  backgroundColor: "#1A1A1A",
  color: "#FFFFFF",
  borderRadius: 16,
  padding: "14px 18px",
  boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const textStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 400,
  lineHeight: 1.4,
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
};

const installBtnStyle: React.CSSProperties = {
  flex: 1,
  height: 38,
  borderRadius: 10,
  border: "none",
  backgroundColor: "#FFFFFF",
  color: "#1A1A1A",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const dismissBtnStyle: React.CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.25)",
  backgroundColor: "transparent",
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

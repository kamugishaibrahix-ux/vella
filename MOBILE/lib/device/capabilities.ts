/**
 * iOS/Android capability detector utility
 * Enterprise-grade device capability detection for PWAs
 */

export type DeviceCapabilities = {
  platform: "ios" | "android" | "desktop" | "unknown";
  isPWA: boolean;
  isStandalone: boolean;
  hasBiometrics: boolean;
  hasFaceID: boolean;
  hasTouchID: boolean;
  safeAreaInsets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  viewportHeight: number;
  statusBarHeight: number;
};

let cachedCapabilities: DeviceCapabilities | null = null;

/**
 * Detect device capabilities with caching
 */
export async function detectCapabilities(): Promise<DeviceCapabilities> {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  if (typeof window === "undefined") {
    return getDefaultCapabilities();
  }

  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isStandalone =
    (window.navigator as any).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    document.referrer.includes("android-app://");

  const platform: DeviceCapabilities["platform"] = isIOS
    ? "ios"
    : isAndroid
      ? "android"
      : "desktop";

  // Detect biometric capabilities
  let hasBiometrics = false;
  let hasFaceID = false;
  let hasTouchID = false;

  if (window.PublicKeyCredential) {
    try {
      hasBiometrics = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      // iOS devices typically support Face ID (newer) or Touch ID (older)
      // Android devices support fingerprint
      if (isIOS) {
        // On iOS, we can't distinguish between Face ID and Touch ID via WebAuthn
        // But newer devices (iPhone X+) have Face ID
        const isNewerIOS = /iphone/.test(ua) && !/iphone[1-8]/.test(ua);
        hasFaceID = isNewerIOS;
        hasTouchID = !isNewerIOS;
      } else {
        hasTouchID = hasBiometrics; // Android typically uses fingerprint
      }
    } catch {
      // Silently fail
    }
  }

  // Safe area insets (iOS notch/home indicator)
  const safeAreaInsets = {
    top: parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-top") || "0",
    ),
    bottom: parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-bottom") ||
        "0",
    ),
    left: parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-left") || "0",
    ),
    right: parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-right") ||
        "0",
    ),
  };

  // Viewport height (accounts for browser chrome)
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const statusBarHeight = isIOS && isStandalone ? safeAreaInsets.top : 0;

  cachedCapabilities = {
    platform,
    isPWA: isStandalone,
    isStandalone,
    hasBiometrics,
    hasFaceID,
    hasTouchID,
    safeAreaInsets,
    viewportHeight,
    statusBarHeight,
  };

  return cachedCapabilities;
}

function getDefaultCapabilities(): DeviceCapabilities {
  return {
    platform: "unknown",
    isPWA: false,
    isStandalone: false,
    hasBiometrics: false,
    hasFaceID: false,
    hasTouchID: false,
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    viewportHeight: 0,
    statusBarHeight: 0,
  };
}

/**
 * Clear cached capabilities (useful for testing or after device changes)
 */
export function clearCapabilityCache(): void {
  cachedCapabilities = null;
}


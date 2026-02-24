/**
 * Device capability detector for biometrics and PWA behavior
 * SSR-safe implementation with comprehensive platform detection
 */

export type BiometricEnvironment = {
  isBrowser: boolean;
  isSecureContext: boolean;
  isStandalonePWA: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
  hasWebAuthn: boolean;
  webAuthnPlatformAvailable: boolean | null; // null while unknown
};

/**
 * Detect biometric environment and PWA capabilities
 * Returns comprehensive environment information for biometric authentication
 */
export async function detectBiometricEnvironment(): Promise<BiometricEnvironment> {
  // SSR-safe: return defaults if window is undefined
  if (typeof window === "undefined") {
    return {
      isBrowser: false,
      isSecureContext: false,
      isStandalonePWA: false,
      isIOS: false,
      isAndroid: false,
      isDesktop: false,
      hasWebAuthn: false,
      webAuthnPlatformAvailable: null,
    };
  }

  // 1. isBrowser
  const isBrowser = typeof window !== "undefined";

  // 2. isSecureContext
  const isSecureContext = Boolean(window.isSecureContext);

  // 3. isStandalonePWA
  const isStandalonePWA =
    ("standalone" in window.navigator && (window.navigator as any).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches === true;

  // 4. isIOS
  // Check for iPad, iPhone, iPod in user agent
  // Exclude Mac with Apple Silicon (which may report as iPad in some cases)
  const ua = navigator.userAgent;
  const isMacIntel = /Macintosh|Mac OS X/.test(ua) && !/iPad|iPhone|iPod/.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !isMacIntel;

  // 5. isAndroid
  const isAndroid = /Android/.test(ua);

  // 6. isDesktop
  const isDesktop = !isIOS && !isAndroid;

  // 7. hasWebAuthn
  const hasWebAuthn = typeof window.PublicKeyCredential !== "undefined";

  // 8. webAuthnPlatformAvailable
  let webAuthnPlatformAvailable: boolean | null = null;
  if (hasWebAuthn) {
    try {
      webAuthnPlatformAvailable =
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (error) {
      // On error, set to false
      webAuthnPlatformAvailable = false;
    }
  }

  return {
    isBrowser,
    isSecureContext,
    isStandalonePWA,
    isIOS,
    isAndroid,
    isDesktop,
    hasWebAuthn,
    webAuthnPlatformAvailable,
  };
}


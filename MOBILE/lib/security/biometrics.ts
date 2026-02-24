// WebAuthn-based biometric authentication utilities

import { detectBiometricEnvironment } from "@/lib/security/deviceCapabilities";

const STORAGE_KEY_BIOMETRIC_ENABLED = "vella.lock.biometric.enabled";
const STORAGE_KEY_BIOMETRIC_CREDENTIAL_ID = "vella.lock.biometric.credentialId";

/**
 * Check if biometric authentication is supported on this device
 */
export async function biometricsSupported(): Promise<boolean> {
  const env = await detectBiometricEnvironment();

  // Return false if basic requirements not met
  if (!env.isBrowser) return false;
  if (!env.isSecureContext) return false;
  if (env.isIOS && env.isStandalonePWA) return false; // iOS PWA not supported
  if (!env.hasWebAuthn) return false;

  // Return platform authenticator availability
  return env.webAuthnPlatformAvailable === true;
}

/**
 * Create a new biometric credential (passkey) for the user
 * Returns success status
 */
export async function createBiometricCredential(): Promise<{ success: boolean }> {
  if (typeof window === "undefined" || !window.navigator || !window.crypto) {
    return { success: false };
  }

  if (!window.PublicKeyCredential || !navigator.credentials) {
    return { success: false };
  }

  try {
    // Generate random challenge (32 bytes)
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    // Generate random user ID
    const userId = new Uint8Array(16);
    window.crypto.getRandomValues(userId);

    // Get hostname for RP ID
    const rpId = window.location.hostname;

    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge: challenge.buffer,
      rp: {
        id: rpId,
        name: "Vella",
      },
      user: {
        id: userId,
        name: "vella_user",
        displayName: "Vella User",
      },
      pubKeyCredParams: [
        {
          alg: -7, // ES256
          type: "public-key",
        },
      ],
      authenticatorSelection: {
        userVerification: "required",
        authenticatorAttachment: "platform",
      },
      attestation: "none",
      timeout: 60000,
    };

    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    });

    if (credential && "rawId" in credential) {
      // Store credential ID as base64url
      const credentialId = arrayBufferToBase64Url(credential.rawId as ArrayBuffer);
      window.localStorage.setItem(STORAGE_KEY_BIOMETRIC_CREDENTIAL_ID, credentialId);
      return { success: true };
    }

    return { success: false };
  } catch (error) {
    console.warn("[biometrics] Credential creation failed:", error);
    return { success: false };
  }
}

/**
 * Verify biometric credential (passkey) for authentication
 * Returns true if verification succeeds
 */
export async function verifyBiometricCredential(): Promise<boolean> {
  if (typeof window === "undefined" || !window.navigator || !window.crypto) {
    return false;
  }

  if (!window.PublicKeyCredential || !navigator.credentials) {
    return false;
  }

  // Check environment before attempting WebAuthn
  const env = await detectBiometricEnvironment();
  if (env.isIOS && env.isStandalonePWA) {
    // iOS PWA not supported - don't attempt WebAuthn
    return false;
  }

  // Load stored credential ID
  const storedCredentialId = window.localStorage.getItem(STORAGE_KEY_BIOMETRIC_CREDENTIAL_ID);
  if (!storedCredentialId) {
    return false;
  }

  try {
    // Convert base64url back to ArrayBuffer
    const credentialId = base64UrlToArrayBuffer(storedCredentialId);

    // Generate random challenge
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge: challenge.buffer,
      allowCredentials: [
        {
          id: credentialId,
          type: "public-key",
        },
      ],
      userVerification: "required",
      timeout: 60000,
    };

    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    });

    return assertion !== null;
  } catch (error) {
    // Handle WebAuthn errors gracefully
    // NotAllowedError, AbortError, UnknownError all result in false
    if (
      error instanceof DOMException &&
      (error.name === "NotAllowedError" ||
        error.name === "AbortError" ||
        error.name === "UnknownError")
    ) {
      return false;
    }
    // User cancelled or authentication failed
    console.warn("[biometrics] Credential verification failed:", error);
    return false;
  }
}

/**
 * Enable or disable biometric authentication
 */
export function enableBiometrics(flag: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  if (flag) {
    window.localStorage.setItem(STORAGE_KEY_BIOMETRIC_ENABLED, "1");
  } else {
    window.localStorage.removeItem(STORAGE_KEY_BIOMETRIC_ENABLED);
    // Also remove credential ID when disabling
    window.localStorage.removeItem(STORAGE_KEY_BIOMETRIC_CREDENTIAL_ID);
  }
}

/**
 * Check if biometric authentication is enabled
 */
export function biometricsEnabled(): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  return window.localStorage.getItem(STORAGE_KEY_BIOMETRIC_ENABLED) === "1";
}

// Helper: Convert ArrayBuffer to base64url
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  // Convert to base64url (replace + with -, / with _, remove padding)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Helper: Convert base64url to ArrayBuffer
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  // Convert base64url to base64
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

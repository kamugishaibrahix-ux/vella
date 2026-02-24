/**
 * Phase M3.5: Web Crypto AES-GCM encryption with AAD for sensitive fields at rest.
 * Key stored in localStorage (vella_local_v2:encryption_key). Browser storage is not hardware-level secure.
 * AAD = userId + recordId + fieldName to prevent ciphertext swapping.
 */

import type { ILocalEncryption, EncryptResult } from "./types";

const KEY_PATH = "vella_local_v2:encryption_key";
const ALG = "AES-GCM";
const KEY_LEN = 256;
const IV_LEN = 12;

function getKeyStorage(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage.getItem(KEY_PATH);
}

function setKeyStorage(hex: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(KEY_PATH, hex);
}

async function getOrCreateKey(): Promise<CryptoKey> {
  let raw = getKeyStorage();
  if (!raw) {
    const key = await crypto.subtle.generateKey({ name: ALG, length: KEY_LEN }, true, ["encrypt", "decrypt"]);
    const exp = await crypto.subtle.exportKey("raw", key);
    const hex = Array.from(new Uint8Array(exp))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setKeyStorage(hex);
    return key;
  }
  const bytes = new Uint8Array(raw.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.importKey("raw", bytes, { name: ALG, length: KEY_LEN }, false, ["encrypt", "decrypt"]);
}

function b64Encode(u: Uint8Array): string {
  return btoa(String.fromCharCode.apply(null, Array.from(u)));
}

function b64Decode(s: string): Uint8Array {
  return new Uint8Array(atob(s).split("").map((c) => c.charCodeAt(0)));
}

/** Encrypt with AAD (e.g. userId + recordId + fieldName). Wrong AAD will fail decryption. */
export async function encryptString(plaintext: string, aad: string): Promise<EncryptResult> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const aadBytes = new TextEncoder().encode(aad);
  const enc = await crypto.subtle.encrypt(
    { name: ALG, iv, additionalData: aadBytes },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    iv: b64Encode(iv),
    ciphertext: b64Encode(new Uint8Array(enc)),
  };
}

/** Decrypt with same AAD used at encrypt. Throws if AAD or ciphertext is wrong. */
export async function decryptString(payload: EncryptResult, aad: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = b64Decode(payload.iv);
  const ciphertext = b64Decode(payload.ciphertext);
  const aadBytes = new TextEncoder().encode(aad);
  const dec = await crypto.subtle.decrypt(
    { name: ALG, iv: iv as BufferSource, additionalData: aadBytes },
    key,
    ciphertext as BufferSource
  );
  return new TextDecoder().decode(dec);
}

export const webCryptoEncryption: ILocalEncryption = {
  async encrypt(plaintext: string): Promise<string> {
    const key = await getOrCreateKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const enc = await crypto.subtle.encrypt(
      { name: ALG, iv },
      key,
      new TextEncoder().encode(plaintext)
    );
    const combined = new Uint8Array(iv.length + enc.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(enc), iv.length);
    return b64Encode(combined);
  },

  async decrypt(ciphertext: string): Promise<string> {
    const key = await getOrCreateKey();
    const combined = b64Decode(ciphertext);
    const iv = combined.slice(0, IV_LEN);
    const data = combined.slice(IV_LEN);
    const dec = await crypto.subtle.decrypt({ name: ALG, iv }, key, data);
    return new TextDecoder().decode(dec);
  },
};

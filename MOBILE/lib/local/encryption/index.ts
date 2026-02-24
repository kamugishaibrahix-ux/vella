/**
 * Phase M3.5: Export encryption. Production always uses real crypto; dev uses noop when flag off.
 */

import { isEncryptionEnabled } from "./types";
import { noopEncryption } from "./noop";
import { webCryptoEncryption, encryptString as cryptoEncrypt, decryptString as cryptoDecrypt } from "./crypto";
import type { ILocalEncryption, EncryptResult } from "./types";

export type { ILocalEncryption, EncryptResult } from "./types";
export { isEncryptionEnabled } from "./types";
export { noopEncryption } from "./noop";
export { webCryptoEncryption } from "./crypto";

export function getLocalEncryption(): ILocalEncryption {
  return isEncryptionEnabled() ? webCryptoEncryption : noopEncryption;
}

/** AAD = userId + recordId + fieldName to prevent swapping. */
export function buildAad(userId: string, recordId: string, fieldName: string): string {
  return `${userId}:${recordId}:${fieldName}`;
}

/** Encrypt with AAD; noop in dev when encryption disabled (returns plaintext in a compatible container). */
export async function encryptString(plaintext: string, aad: string): Promise<EncryptResult> {
  if (!isEncryptionEnabled()) {
    return { iv: "", ciphertext: plaintext };
  }
  return cryptoEncrypt(plaintext, aad);
}

/** Decrypt with AAD; noop in dev when encryption disabled (expects { iv: "", ciphertext: plaintext }). */
export async function decryptString(payload: EncryptResult, aad: string): Promise<string> {
  if (!isEncryptionEnabled() || (payload.iv === "" && payload.ciphertext)) {
    return payload.ciphertext;
  }
  return cryptoDecrypt(payload, aad);
}

/** Encrypt a sensitive field for storage. Returns JSON string or plaintext when encryption off. */
export async function encryptField(
  plaintext: string,
  userId: string,
  recordId: string,
  fieldName: string
): Promise<string> {
  if (!plaintext) return plaintext;
  if (!isEncryptionEnabled()) return plaintext;
  const result = await cryptoEncrypt(plaintext, buildAad(userId, recordId, fieldName));
  return JSON.stringify(result);
}

/** Decrypt a stored value. Handles legacy plaintext and encrypted JSON. */
export async function decryptField(
  stored: string | null,
  userId: string,
  recordId: string,
  fieldName: string
): Promise<string | null> {
  if (stored == null || stored === "") return stored;
  if (!isEncryptionEnabled()) return stored;
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (parsed && typeof parsed === "object" && "iv" in parsed && "ciphertext" in parsed) {
      return await cryptoDecrypt(
        { iv: (parsed as EncryptResult).iv, ciphertext: (parsed as EncryptResult).ciphertext },
        buildAad(userId, recordId, fieldName)
      );
    }
  } catch {
    // not JSON or decrypt failed -> treat as legacy plaintext
  }
  return stored;
}

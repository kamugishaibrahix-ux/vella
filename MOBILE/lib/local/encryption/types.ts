/**
 * Phase M3/M3.5: Local encryption at rest interface.
 * Production: encryption MUST be enabled. Dev: controlled by flag.
 */

export interface ILocalEncryption {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

/** Result of encryptString with AAD (userId + recordId + fieldName to prevent swapping). */
export type EncryptResult = { iv: string; ciphertext: string };

/** Encrypt with additional authenticated data. AAD prevents ciphertext swapping between records. */
export type EncryptStringWithAad = (plaintext: string, aad: string) => Promise<EncryptResult>;

/** Decrypt with same AAD used at encrypt time. */
export type DecryptStringWithAad = (payload: EncryptResult, aad: string) => Promise<string>;

const ENV_KEY = "NEXT_PUBLIC_LOCAL_ENCRYPTION_AT_REST";

/** In production always true. In dev, true when NEXT_PUBLIC_LOCAL_ENCRYPTION_AT_REST is true. */
export function isEncryptionEnabled(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  if (process.env.NODE_ENV === "production") return true;
  const v = process.env[ENV_KEY];
  return v === "true" || v === "1";
}

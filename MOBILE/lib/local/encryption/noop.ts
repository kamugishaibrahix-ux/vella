/**
 * Phase M3: No-op encryption (pass-through). Use when LOCAL_ENCRYPTION_AT_REST is off.
 */

import type { ILocalEncryption } from "./types";

export const noopEncryption: ILocalEncryption = {
  async encrypt(plaintext: string): Promise<string> {
    return plaintext;
  },
  async decrypt(ciphertext: string): Promise<string> {
    return ciphertext;
  },
};

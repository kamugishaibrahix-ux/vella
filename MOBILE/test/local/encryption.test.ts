/**
 * Phase M3.5: Local encryption tests.
 * - Encrypted output is not equal to plaintext
 * - decrypt(encrypt(x)) === x
 * - Wrong AAD fails decryption
 */

import { beforeEach, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { encryptString, decryptString } from "@/lib/local/encryption/crypto";
import type { EncryptResult } from "@/lib/local/encryption/types";

// Restore real Web Crypto for this suite (setup.ts mocks crypto with only randomUUID)
beforeEach(() => {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
});

describe("local encryption (AES-GCM with AAD)", () => {
  it("encrypted ciphertext is not equal to plaintext", async () => {
    const plain = "secret journal content";
    const result = await encryptString(plain, "user1:journal1:content");
    expect(result.iv).toBeTruthy();
    expect(result.ciphertext).toBeTruthy();
    expect(result.ciphertext).not.toBe(plain);
    expect(result.iv).not.toBe(plain);
  });

  it("decrypt(encrypt(x)) equals x", async () => {
    const plain = "hello world";
    const aad = "userId:recordId:fieldName";
    const encrypted = await encryptString(plain, aad);
    const decrypted = await decryptString(encrypted, aad);
    expect(decrypted).toBe(plain);
  });

  it("wrong AAD fails decryption", async () => {
    const plain = "sensitive";
    const encrypted = await encryptString(plain, "user1:rec1:content");
    await expect(decryptString(encrypted, "user1:rec1:other")).rejects.toThrow();
    await expect(decryptString(encrypted, "user2:rec1:content")).rejects.toThrow();
  });
});

/**
 * Tests for origin validation in Stripe checkout URLs.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getValidatedOrigin, getAllowedOrigins } from "@/lib/payments/originValidation";

describe("originValidation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getValidatedOrigin", () => {
    it("accepts origin from NEXT_PUBLIC_APP_URL", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
      const result = getValidatedOrigin("https://app.example.com");
      expect(result).toBe("https://app.example.com");
    });

    it("accepts origin from ALLOWED_ORIGINS CSV", () => {
      process.env.ALLOWED_ORIGINS = "https://trusted1.com,https://trusted2.com";
      const result = getValidatedOrigin("https://trusted1.com");
      expect(result).toBe("https://trusted1.com");
    });

    it("normalizes origin by removing trailing slash", () => {
      process.env.ALLOWED_ORIGINS = "https://trusted.com";
      const result = getValidatedOrigin("https://trusted.com/");
      expect(result).toBe("https://trusted.com");
    });

    it("normalizes origin to lowercase", () => {
      process.env.ALLOWED_ORIGINS = "https://trusted.com";
      const result = getValidatedOrigin("HTTPS://TRUSTED.COM");
      expect(result).toBe("https://trusted.com");
    });

    it("rejects untrusted origin and returns canonical URL", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
      process.env.ALLOWED_ORIGINS = "https://trusted.com";
      const result = getValidatedOrigin("https://evil.com");
      expect(result).toBe("https://app.example.com");
    });

    it("handles missing origin header", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
      const result = getValidatedOrigin(null);
      expect(result).toBe("https://app.example.com");
    });

    it("handles empty origin header", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
      const result = getValidatedOrigin("");
      expect(result).toBe("https://app.example.com");
    });

    it("accepts localhost in development", () => {
      process.env.NODE_ENV = "development";
      process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
      const result = getValidatedOrigin("http://localhost:3000");
      expect(result).toBe("http://localhost:3000");
    });

    it("accepts 127.0.0.1 in development", () => {
      process.env.NODE_ENV = "development";
      const result = getValidatedOrigin("http://127.0.0.1:3000");
      expect(result).toBe("http://127.0.0.1:3000");
    });

    it("handles whitespace in ALLOWED_ORIGINS CSV", () => {
      process.env.ALLOWED_ORIGINS = " https://trusted1.com , https://trusted2.com ";
      const result = getValidatedOrigin("https://trusted2.com");
      expect(result).toBe("https://trusted2.com");
    });
  });

  describe("getAllowedOrigins", () => {
    it("includes NEXT_PUBLIC_APP_URL", () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
      process.env.ALLOWED_ORIGINS = "";
      const origins = getAllowedOrigins();
      expect(origins.has("https://app.example.com")).toBe(true);
    });

    it("includes all CSV origins", () => {
      process.env.ALLOWED_ORIGINS = "https://trusted1.com,https://trusted2.com";
      const origins = getAllowedOrigins();
      expect(origins.has("https://trusted1.com")).toBe(true);
      expect(origins.has("https://trusted2.com")).toBe(true);
    });

    it("includes localhost in development", () => {
      process.env.NODE_ENV = "development";
      const origins = getAllowedOrigins();
      expect(origins.has("http://localhost:3000")).toBe(true);
      expect(origins.has("http://127.0.0.1:3000")).toBe(true);
    });

    it("normalizes all origins", () => {
      process.env.ALLOWED_ORIGINS = "HTTPS://TRUSTED.COM/";
      const origins = getAllowedOrigins();
      expect(origins.has("https://trusted.com")).toBe(true);
    });
  });
});

/**
 * SECURITY: Verifies transcribe policy constants (file size, content-type allowlist).
 */
import { describe, it, expect } from "vitest";
import { AI_ENDPOINTS } from "@/lib/security/aiEndpointPolicy";

describe("transcribe hardening", () => {
  it("defines max file size at Whisper API limit (25MB)", () => {
    expect(AI_ENDPOINTS.transcribe.maxFileSizeBytes).toBe(25 * 1024 * 1024);
  });

  it("allows only supported audio MIME types", () => {
    const { allowedMimeTypes } = AI_ENDPOINTS.transcribe;
    expect(allowedMimeTypes).toContain("audio/webm");
    expect(allowedMimeTypes).toContain("audio/mpeg");
    expect(allowedMimeTypes).toContain("audio/wav");
    expect(allowedMimeTypes).toContain("audio/m4a");
    expect(allowedMimeTypes).not.toContain("application/octet-stream");
  });

  it("transcribe requires auth", () => {
    expect(AI_ENDPOINTS.transcribe.auth).toBe("required");
  });
});

/**
 * PII FIREWALL
 * ============
 * Global enforcement layer for PII (Personally Identifiable Information) protection.
 * This module provides mandatory scanning of all outgoing Supabase writes to ensure
 * NO personal text ever reaches the server.
 *
 * Compliance: DATA_DESIGN.md Local-First Contract
 * Principle: Personal text must be structurally impossible to store in Supabase.
 *
 * @module lib/security/piiFirewall
 */

// ============================================================================
// FORBIDDEN FIELDS - PERSONAL TEXT DETECTION
// ============================================================================

/**
 * Core personal text fields that are NEVER allowed in Supabase.
 * These fields would contain user-generated personal content.
 */
export const PII_FORBIDDEN_FIELDS = new Set([
  // Core content fields (primary detection)
  "content",
  "text",
  "message",
  "note",
  "body",
  "journal",
  "reflection",
  "summary",
  "transcript",
  "prompt",
  "response",
  "narrative",
  "description",
  "comment",
  "entry",
  "reply",
  "answer",
  "reasoning",
  "free_text",
  "freeText",
  "free-text",
  "userText",
  "user_text",
  "assistantText",
  "assistant_text",
  "userMessage",
  "user_message",
  "assistantMessage",
  "assistant_message",
  "chatMessage",
  "chat_message",
  // Additional personal content fields
  "diary",
  "thought",
  "thoughts",
  "feeling",
  "feelings",
  "emotion",
  "emotions",
  "experience",
  "experiences",
  "memory",
  "memories",
  "story",
  "stories",
  "personal_info",
  "personalInfo",
  "private_info",
  "privateInfo",
  "sensitive_data",
  "sensitiveData",
]);

/**
 * Semantic smuggling vectors - fields that could be used to bypass detection
 * by storing personal text under seemingly innocent key names.
 */
export const PII_SEMANTIC_VECTORS = new Set([
  // Data hiding vectors
  "detail",
  "details",
  "context",
  "notes",
  "note_text",
  "noteText",
  "caption",
  "content_text",
  "contentText",
  "text_content",
  "textContent",
  // Input/output vectors
  "user_input",
  "userInput",
  "input",
  "raw_input",
  "rawInput",
  "assistant_output",
  "assistantOutput",
  "output",
  "raw_output",
  "rawOutput",
  // Payload vectors
  "raw",
  "payload",
  "data",
  "blob",
  "value",
  "values",
  // Message vectors
  "message_text",
  "messageText",
  "text_message",
  "textMessage",
  "full_text",
  "fullText",
  "complete_text",
  "completeText",
  "original_text",
  "originalText",
  // Escalation vectors
  "info",
  "information",
  "metadata",
  "meta_data",
  "meta",
  "extra",
  "extras",
  "additional",
  "supplemental",
  // Deep nesting vectors
  "nested",
  "inner",
  "internal",
  "private",
  "hidden",
  "secret",
]);

/**
 * Combined forbidden fields for comprehensive detection.
 */
export const ALL_FORBIDDEN_FIELDS = new Set(
  Array.from(PII_FORBIDDEN_FIELDS).concat(Array.from(PII_SEMANTIC_VECTORS))
);

// ============================================================================
// ERROR TYPES
// ============================================================================

export const PII_FIREWALL_ERROR_CODES = {
  FORBIDDEN_FIELD_DETECTED: "FORBIDDEN_FIELD_DETECTED",
  SEMANTIC_SMUGGLING_DETECTED: "SEMANTIC_SMUGGLING_DETECTED",
  OVERSIZED_STRING_DETECTED: "OVERSIZED_STRING_DETECTED",
  NESTED_PII_DETECTED: "NESTED_PII_DETECTED",
  ARRAY_PII_DETECTED: "ARRAY_PII_DETECTED",
  NON_SNAKE_CASE_KEY: "NON_SNAKE_CASE_KEY",
} as const;

export type PIIFirewallErrorCode =
  (typeof PII_FIREWALL_ERROR_CODES)[keyof typeof PII_FIREWALL_ERROR_CODES];

/**
 * Fatal error thrown when PII is detected in a Supabase write.
 * This error should crash the application to prevent any data leakage.
 */
export class PIIFirewallError extends Error {
  constructor(
    public readonly code: PIIFirewallErrorCode,
    message: string,
    public readonly keyPath?: string,
    public readonly value?: unknown,
    public readonly table?: string,
  ) {
    super(`[PII-FIREWALL] ${message}`);
    this.name = "PIIFirewallError";
    Object.setPrototypeOf(this, PIIFirewallError.prototype);
  }

  /**
   * Returns a sanitized error response for API routes.
   * Never includes the actual forbidden value.
   */
  toResponse(): { error: string; code: string; key?: string } {
    return {
      error: "PII_WRITE_BLOCKED",
      code: this.code,
      key: this.keyPath,
    };
  }
}

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Safe compound field patterns - these contain forbidden words but are legitimate metadata fields.
 * Format: prefix_forbidden_word or forbidden_word_suffix where the combination is safe.
 */
const SAFE_COMPOUND_PATTERNS = [
  /_hash$/,      // content_hash, text_hash, etc. - stores hashes, not text
  /_count$/,     // message_count, word_count, etc. - stores numbers
  /_id$/,        // content_id, text_id - references
  /_type$/,      // content_type, message_type - type enums
  /_at$/,        // created_at, updated_at - timestamps
  /_by$/,        // created_by, updated_by - user references
  /_model$/,     // embedding_model, text_model - AI model identifiers
  /^content_/,   // content_hash, content_type - metadata about content
  /^message_/,   // message_count, message_type - metadata about messages
  /^text_/,      // text_length, text_type - metadata about text
  /^note_/,      // note_id, note_type - metadata about notes
  /^embedding$/, // embedding - actual embedding arrays (numbers only)
];

/**
 * Dangerous compound patterns - these look like encoding but are smuggling attempts.
 */
const DANGEROUS_COMPOUND_PATTERNS = [
  /_b64$/i,      // content_b64, message_b64 - base64 encoded personal text
  /_encoded$/i,  // content_encoded - encoded text
  /_raw$/i,      // content_raw - raw text
  /_data$/i,     // message_data - data payload
];

/**
 * Checks if a key is a safe compound that contains a forbidden word but is legitimate.
 */
function isSafeCompound(key: string): boolean {
  // First check if it's a dangerous pattern (always forbidden)
  if (DANGEROUS_COMPOUND_PATTERNS.some(pattern => pattern.test(key.toLowerCase()))) {
    return false;
  }
  return SAFE_COMPOUND_PATTERNS.some(pattern => pattern.test(key.toLowerCase()));
}

/**
 * Normalizes a key by removing zero-width and invisible characters.
 * This prevents Unicode-based bypass attempts.
 */
function normalizeKey(key: string): string {
  // Remove zero-width characters and other invisible formatting
  return key
    .replace(/[\u200b-\u200f\u2028-\u202e\ufeff]/g, '')  // Zero-width chars, line separators, BOM
    .replace(/[\u0430-\u044f]/gi, (match) => {  // Cyrillic homoglyphs - map to similar Latin
      const cyrillicMap: Record<string, string> = {
        'а': 'a', 'б': 'b', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x',
        'А': 'A', 'Б': 'B', 'С': 'C', 'Е': 'E', 'О': 'O', 'Р': 'P', 'Х': 'X',
      };
      return cyrillicMap[match] || match;
    });
}

/**
 * Detects Unicode tricks (lookalike/invisible characters) in keys.
 * These are used to bypass filters by using characters that look like Latin letters.
 */
function containsUnicodeTricks(key: string): boolean {
  // Zero-width and invisible characters
  const invisiblePattern = /[\u200b-\u200f\u2028-\u202e\ufeff]/;
  if (invisiblePattern.test(key)) {
    return true;
  }

  // Common Cyrillic lookalikes mixed with Latin
  const cyrillicPattern = /[\u0430-\u044f\u0450-\u045f]/i; // Cyrillic range
  if (cyrillicPattern.test(key)) {
    return true;
  }

  // Mathematical alphanumeric symbols (script, bold, italic, etc.)
  // Range: U+1D400 to U+1D7FF. Avoid ES202x regex flag for TS target compatibility.
  for (let i = 0; i < key.length; i++) {
    const code = key.codePointAt(i) ?? 0;
    if (code >= 0x1d400 && code <= 0x1d7ff) return true;
    if (code > 0xffff) i++; // skip surrogate pair
  }

  return false;
}

/**
 * Checks if a key is forbidden (case-insensitive and partial match).
 * Also detects obfuscated keys containing forbidden words.
 */
export function isForbiddenKey(key: string): boolean {
  const lowerKey = key.toLowerCase();

  // Direct match
  if (ALL_FORBIDDEN_FIELDS.has(key) || ALL_FORBIDDEN_FIELDS.has(lowerKey)) {
    return true;
  }

  // Detect Unicode tricks (zero-width chars, Cyrillic homoglyphs)
  if (containsUnicodeTricks(key)) {
    return true;
  }

  // Normalize key for pattern matching (remove invisible chars, map homoglyphs)
  const normalizedKey = normalizeKey(key);
  const normalizedLower = normalizedKey.toLowerCase();

  // Skip safe compound patterns (use normalized key)
  if (isSafeCompound(normalizedKey)) {
    return false;
  }

  // Partial match - key contains forbidden words (on normalized key)
  // This catches obfuscated keys like "user-content", "msg", "journalText"
  const forbiddenPatterns = [
    /content/i,
    /text/i,
    /\btxt\b/i,  // Standalone txt abbreviation
    /message/i,
    /\bmsg\b/i,  // Standalone msg abbreviation
    /note/i,
    /journal/i,
    /reflection/i,
    /summary/i,
    /transcript/i,
    /prompt/i,
    /response/i,
    /narrative/i,
    /description/i,
    /comment/i,
    /entry/i,
    /reply/i,
    /answer/i,
    /reasoning/i,
    /free[_-]?text/i,
  ];

  return forbiddenPatterns.some((pattern) => pattern.test(normalizedKey) || pattern.test(normalizedLower));
}

/**
 * Checks if a key is a semantic smuggling vector.
 */
export function isSemanticVector(key: string): boolean {
  const lowerKey = key.toLowerCase();
  if (PII_SEMANTIC_VECTORS.has(key) || PII_SEMANTIC_VECTORS.has(lowerKey)) {
    return true;
  }

  // Also check for partial matches
  const vectorPatterns = [
    /detail/i,
    /context/i,
    /note/i,
    /caption/i,
    /input/i,
    /output/i,
    /raw/i,
    /payload/i,
    /full[_-]?text/i,
    /message[_-]?text/i,
    /_b64$/i,        // Base64 encoded data
    /_encoded$/i,    // Encoded data
    /_raw$/i,        // Raw data
    /_data$/i,       // Data payload
    /chunks$/i,      // Chunks (could be text chunks)
    /matrix$/i,      // Matrix data
    /^fake_/i,       // Fake prefix (fake_embedding, etc.)
  ];

  return vectorPatterns.some((pattern) => pattern.test(key));
}

/**
 * Scans a string value for PII indicators.
 * Returns true if the string looks like personal text.
 */
export function stringLooksLikePersonalText(value: string): boolean {
  if (!value || typeof value !== "string") return false;

  const indicators = [
    // Personal pronouns and narrative markers
    /\b(I|me|my|myself|mine)\b/i,
    /\b(I am|I'm feeling|I feel|I think|I thought)\b/i,
    // Journal/check-in patterns
    /\b(today|yesterday|this morning|last night)\b/i,
    /\b(journal|diary|entry|reflection)\b/i,
    // Emotional expressions
    /\b(happy|sad|angry|anxious|stressed|excited|worried)\b/i,
    // Sentence structure (indicates free text)
    /[.!?]\s+[A-Z]/, // Multiple sentences
    /\b(because|although|however|therefore)\b/i, // Connective words
  ];

  // Only flag if string is substantial (>50 chars) AND matches indicators
  if (value.length < 50) return false;

  const matchCount = indicators.filter((regex) => regex.test(value)).length;
  return matchCount >= 2; // Multiple indicators required to reduce false positives
}

// ============================================================================
// SCANNING FUNCTIONS
// ============================================================================

export interface PIIScanResult {
  hasPII: boolean;
  violations: Array<{
    code: PIIFirewallErrorCode;
    keyPath: string;
    key: string;
    type: "forbidden_field" | "semantic_vector" | "suspicious_value";
    valuePreview?: string;
  }>;
  scannedKeys: number;
  maxDepthReached: number;
}

const MAX_SCAN_DEPTH = 10;
const MAX_STRING_LENGTH = 500; // Suspicious if string exceeds this

/**
 * Recursively scans a payload for PII.
 * Returns detailed scan results without throwing.
 */
export function scanForPII(payload: unknown, keyPath = "", depth = 0): PIIScanResult {
  const result: PIIScanResult = {
    hasPII: false,
    violations: [],
    scannedKeys: 0,
    maxDepthReached: depth,
  };

  if (depth > MAX_SCAN_DEPTH) {
    return result;
  }

  if (payload === null || payload === undefined) {
    return result;
  }

  // Handle strings
  if (typeof payload === "string") {
    // Check for oversized strings
    if (payload.length > MAX_STRING_LENGTH) {
      result.violations.push({
        code: PII_FIREWALL_ERROR_CODES.OVERSIZED_STRING_DETECTED,
        keyPath,
        key: keyPath.split(".").pop() || "",
        type: "suspicious_value",
        valuePreview: payload.slice(0, 50) + "...",
      });
      result.hasPII = true;
      return result;
    }

    // Check for forbidden patterns inside string values (catches JSON embedding attacks)
    // Look for patterns like "content": "..." or "text": "..." in JSON strings
    const jsonForbiddenPattern = /"(content|text|message|note|body|journal|reflection|summary|transcript|prompt|response|narrative|description|comment|entry|reply|answer|reasoning)":\s*"[^"]{10,}/i;
    // Also check for escaped JSON patterns (double-encoded)
    const escapedJsonPattern = /\\"(content|text|message|note|body|journal|reflection|summary|transcript|prompt|response|narrative|description|comment|entry|reply|answer|reasoning)\\":\s*\\"[^"]{5,}/i;

    if (jsonForbiddenPattern.test(payload) || escapedJsonPattern.test(payload)) {
      result.violations.push({
        code: PII_FIREWALL_ERROR_CODES.FORBIDDEN_FIELD_DETECTED,
        keyPath,
        key: keyPath.split(".").pop() || "",
        type: "suspicious_value",
        valuePreview: payload.slice(0, 50) + "...",
      });
      result.hasPII = true;
      return result;
    }

    // Check for personal text indicators in medium-length strings (30-500 chars)
    // This catches hidden text in arrays, embeddings, etc.
    if (payload.length >= 30 && stringLooksLikePersonalText(payload)) {
      result.violations.push({
        code: PII_FIREWALL_ERROR_CODES.OVERSIZED_STRING_DETECTED,
        keyPath,
        key: keyPath.split(".").pop() || "",
        type: "suspicious_value",
        valuePreview: payload.slice(0, 50) + "...",
      });
      result.hasPII = true;
    }

    return result;
  }

  // Handle arrays
  if (Array.isArray(payload)) {
    payload.forEach((item, index) => {
      const itemPath = `${keyPath}[${index}]`;
      const itemResult = scanForPII(item, itemPath, depth + 1);
      result.violations.push(...itemResult.violations);
      result.hasPII = result.hasPII || itemResult.hasPII;
      result.scannedKeys += itemResult.scannedKeys;
      result.maxDepthReached = Math.max(result.maxDepthReached, itemResult.maxDepthReached);
    });
    return result;
  }

  // Handle objects
  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      result.scannedKeys++;
      const currentPath = keyPath ? `${keyPath}.${key}` : key;

      // Phase Seal: Reject camelCase keys — all DB payload keys must be snake_case.
      // This prevents accidental PII pattern matches (e.g. "messageLength" matching /message/i).
      if (/[a-z][A-Z]/.test(key)) {
        result.violations.push({
          code: PII_FIREWALL_ERROR_CODES.NON_SNAKE_CASE_KEY,
          keyPath: currentPath,
          key,
          type: "forbidden_field",
        });
        result.hasPII = true;
        continue;
      }

      // Skip null/undefined values - they don't contain personal text
      if (value === null || value === undefined) {
        continue;
      }

      // Check if key is a core forbidden field (not semantic vectors)
      // Use direct set check first for exact matches
      const lowerKey = key.toLowerCase();
      const isCoreForbidden = PII_FORBIDDEN_FIELDS.has(key) || PII_FORBIDDEN_FIELDS.has(lowerKey);
      const isSemanticVec = PII_SEMANTIC_VECTORS.has(key) || PII_SEMANTIC_VECTORS.has(lowerKey);

      // Check pattern-based matches (catches obfuscated/homoglyph keys)
      const isPatternForbidden = !isSafeCompound(key) && isForbiddenKey(key);
      const isPatternSemantic = isSemanticVector(key);

      // Priority: Core forbidden fields > Semantic vectors > Pattern matches
      if (isCoreForbidden || (isPatternForbidden && !isSemanticVec)) {
        result.violations.push({
          code: PII_FIREWALL_ERROR_CODES.FORBIDDEN_FIELD_DETECTED,
          keyPath: currentPath,
          key,
          type: "forbidden_field",
          valuePreview: typeof value === "string" ? value.slice(0, 50) : undefined,
        });
        result.hasPII = true;
        continue;
      }

      // Check if key is semantic vector
      if (isSemanticVec || isPatternSemantic) {
        result.violations.push({
          code: PII_FIREWALL_ERROR_CODES.SEMANTIC_SMUGGLING_DETECTED,
          keyPath: currentPath,
          key,
          type: "semantic_vector",
          valuePreview: typeof value === "string" ? value.slice(0, 50) : undefined,
        });
        result.hasPII = true;
        // Continue scanning the value - semantic vectors might contain nested PII
      }

      // STRICT: Validate embedding fields (dimension + range)
      if (isEmbeddingField(key)) {
        const embeddingValidation = validateEmbedding(value);
        if (!embeddingValidation.valid) {
          result.violations.push({
            code: PII_FIREWALL_ERROR_CODES.NESTED_PII_DETECTED,
            keyPath: currentPath,
            key,
            type: "suspicious_value",
            valuePreview: embeddingValidation.error,
          });
          result.hasPII = true;
          continue; // Skip recursive scan of invalid embedding
        }
      }

      // Recursively scan the value
      const valueResult = scanForPII(value, currentPath, depth + 1);
      result.violations.push(...valueResult.violations);
      result.hasPII = result.hasPII || valueResult.hasPII;
      result.scannedKeys += valueResult.scannedKeys;
      result.maxDepthReached = Math.max(result.maxDepthReached, valueResult.maxDepthReached);
    }
  }

  return result;
}

// ============================================================================
// ASSERTION FUNCTIONS (THROWING)
// ============================================================================

/**
 * Asserts that a payload contains NO PII.
 * Throws PIIFirewallError if ANY forbidden field is found.
 * This is the primary enforcement function for Supabase writes.
 *
 * @param payload - The data payload to scan
 * @param table - Optional table name for error context
 * @throws PIIFirewallError if PII is detected
 *
 * @example
 * ```typescript
 * import { assertNoPII } from "@/lib/security/piiFirewall";
 *
 * const data = { mood_score: 7, local_hash: "abc123" };
 * assertNoPII(data, "journal_entries_meta");
 * // OK - no PII detected
 *
 * const badData = { content: "Personal journal entry..." };
 * assertNoPII(badData, "journal_entries_meta");
 * // Throws: [PII-FIREWALL] Forbidden field 'content' detected
 * ```
 */
export function assertNoPII(payload: unknown, table?: string): void {
  const scanResult = scanForPII(payload);

  if (scanResult.hasPII && scanResult.violations.length > 0) {
    const firstViolation = scanResult.violations[0];

    const tableContext = table ? ` in table '${table}'` : "";
    let message = `PII WRITE BLOCKED${tableContext}: `;

    if (firstViolation.code === PII_FIREWALL_ERROR_CODES.NON_SNAKE_CASE_KEY) {
      message += `Non-snake_case key '${firstViolation.key}' detected at '${firstViolation.keyPath}'. All DB payload keys must be snake_case.`;
    } else if (firstViolation.type === "forbidden_field") {
      message += `Forbidden field '${firstViolation.key}' detected at '${firstViolation.keyPath}'. Personal text cannot be stored in Supabase per DATA_DESIGN.md.`;
    } else if (firstViolation.type === "semantic_vector") {
      message += `Semantic smuggling vector '${firstViolation.key}' detected at '${firstViolation.keyPath}'. This field name is reserved and cannot contain personal text.`;
    } else if (firstViolation.code === PII_FIREWALL_ERROR_CODES.OVERSIZED_STRING_DETECTED) {
      message += `Oversized string detected at '${firstViolation.keyPath}'. Strings > ${MAX_STRING_LENGTH} chars are suspicious.`;
    } else {
      message += `Potential PII detected at '${firstViolation.keyPath}'.`;
    }

    throw new PIIFirewallError(
      firstViolation.code,
      message,
      firstViolation.keyPath,
      undefined, // Never include the actual value
      table,
    );
  }
}

/**
 * Asserts that a payload contains NO PII for an array of records.
 * Throws on first violation found.
 */
export function assertNoPIIInBatch(payloads: unknown[], table?: string): void {
  for (let i = 0; i < payloads.length; i++) {
    try {
      assertNoPII(payloads[i], table);
    } catch (error) {
      if (error instanceof PIIFirewallError) {
        // Enhance error with batch index
        throw new PIIFirewallError(
          error.code,
          `Batch item [${i}]: ${error.message}`,
          error.keyPath,
          error.value,
          table,
        );
      }
      throw error;
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Quick check if payload might contain personal text.
 * Returns boolean without detailed scan (faster for pre-validation).
 */
export function payloadContainsPII(payload: unknown): boolean {
  return scanForPII(payload).hasPII;
}

/**
 * Quick check specifically for forbidden text fields in payload.
 * Useful for API route pre-validation.
 */
export function payloadContainsForbiddenText(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;

  const obj = payload as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (PII_FORBIDDEN_FIELDS.has(key) || PII_FORBIDDEN_FIELDS.has(key.toLowerCase())) {
      return true;
    }
    // Check nested objects one level deep (fast check)
    const value = obj[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const nestedKey of Object.keys(value as Record<string, unknown>)) {
        if (
          PII_FORBIDDEN_FIELDS.has(nestedKey) ||
          PII_FORBIDDEN_FIELDS.has(nestedKey.toLowerCase())
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Validates that an embedding array contains only numeric values.
 * This prevents text smuggling inside embedding arrays.
 */
export function validateEmbedding(value: unknown): { valid: boolean; error?: string } {
  if (!Array.isArray(value)) {
    return { valid: false, error: "Embedding must be an array of numbers" };
  }

  // STRICT: Exact dimension check (1536 for text-embedding-3-small)
  const EXPECTED_DIMENSION = 1536;
  if (value.length !== EXPECTED_DIMENSION) {
    return {
      valid: false,
      error: `Embedding must have exactly ${EXPECTED_DIMENSION} dimensions, got ${value.length}`,
    };
  }

  // STRICT: Value range check (-5 to 5)
  // This prevents ASCII numeric encoding (e.g., [104, 101, 108, 108, 111] = "hello")
  const MIN_VALUE = -5.0;
  const MAX_VALUE = 5.0;

  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== "number" || !Number.isFinite(item)) {
      return {
        valid: false,
        error: `Embedding[${i}] must be a finite number, got ${typeof item}`,
      };
    }

    // STRICT: Reject values outside realistic embedding range
    if (item < MIN_VALUE || item > MAX_VALUE) {
      return {
        valid: false,
        error: `Embedding[${i}] = ${item} outside allowed range [${MIN_VALUE}, ${MAX_VALUE}]. Possible ASCII encoding.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates hash field format (matches database constraints).
 * Supports: SHA-256 hex (64 chars), prefixed hex (71 chars), Base64 (44 chars)
 */
export function validateHashFormat(value: string): { valid: boolean; error?: string } {
  // SHA-256 hex: 64 hexadecimal characters
  const hexPattern = /^[a-f0-9]{64}$/i;
  // Prefixed format: sha256: + 64 hex chars
  const prefixedPattern = /^sha256:[a-f0-9]{64}$/i;
  // Base64: 44 characters (with or without padding)
  const base64Pattern = /^[A-Za-z0-9+/]{43,44}={0,2}$/;
  // Allow shorter hashes (MD5: 32 chars, SHA-1: 40 chars) for backwards compatibility
  const legacyPattern = /^[a-f0-9]{32,64}$/i;

  if (hexPattern.test(value) || prefixedPattern.test(value) ||
      base64Pattern.test(value) || legacyPattern.test(value)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Invalid hash format. Expected SHA-256 hex (64 chars), sha256:prefix (71 chars), or Base64 (44 chars). Got ${value.length} chars.`,
  };
}

/**
 * Checks if a key is an embedding field.
 */
export function isEmbeddingField(key: string): boolean {
  return key === "embedding" || key.endsWith("_embedding");
}

/**
 * Checks if a key is a hash field.
 */
export function isHashField(key: string): boolean {
  return key.includes("hash") || key.includes("checksum") || key.includes("signature");
}

/**
 * Sanitizes an error for safe logging (never logs PII).
 */
export function sanitizePIIError(error: unknown): { type: string; message: string } {
  if (error instanceof PIIFirewallError) {
    return {
      type: "PIIFirewallError",
      message: `[${error.code}] Key: ${error.keyPath || "unknown"}`,
    };
  }
  return {
    type: error instanceof Error ? error.name : "Unknown",
    message: error instanceof Error ? error.message : String(error),
  };
}

// ============================================================================
// API RESPONSE HELPERS
// ============================================================================

/**
 * Returns a standard 403 Forbidden response for PII violations.
 */
export function piiBlockedResponse(requestId?: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "PII_WRITE_BLOCKED",
        message:
          "This request has been blocked. Personal text cannot be stored server-side per the local-first privacy policy.",
        request_id: requestId ?? null,
      },
    }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    },
  );
}

/**
 * Returns a JSON object suitable for NextResponse.json() for PII violations.
 */
export function piiBlockedJsonResponse(requestId?: string) {
  return {
    error: {
      code: "PII_WRITE_BLOCKED",
      message:
        "This request has been blocked. Personal text cannot be stored server-side per the local-first privacy policy.",
      request_id: requestId ?? null,
    },
  };
}

// ============================================================================
// EXPORT SUMMARY
// ============================================================================

/**
 * PII Firewall Module Exports:
 *
 * Constants:
 * - PII_FORBIDDEN_FIELDS: Set of forbidden field names
 * - PII_SEMANTIC_VECTORS: Set of suspicious field names
 * - ALL_FORBIDDEN_FIELDS: Combined set
 * - PII_FIREWALL_ERROR_CODES: Error code constants
 *
 * Classes:
 * - PIIFirewallError: Fatal error for PII violations
 *
 * Functions:
 * - assertNoPII(payload, table?): Primary enforcement - throws on violation
 * - assertNoPIIInBatch(payloads, table?): Batch enforcement
 * - scanForPII(payload): Non-throwing detailed scan
 * - payloadContainsPII(payload): Quick boolean check
 * - payloadContainsForbiddenText(payload): API route pre-check
 * - isForbiddenKey(key): Check if key is forbidden
 * - isSemanticVector(key): Check if key is semantic vector
 * - piiBlockedResponse(requestId?): HTTP 403 response
 * - piiBlockedJsonResponse(requestId?): JSON response object
 * - sanitizePIIError(error): Safe error logging
 *
 * Usage in API routes:
 * ```typescript
 * import { assertNoPII, piiBlockedResponse } from "@/lib/security/piiFirewall";
 *
 * export async function POST(req: Request) {
 *   const body = await req.json();
 *
 *   // Primary enforcement
 *   try {
 *     assertNoPII(body, "my_table");
 *   } catch (error) {
 *     if (error instanceof PIIFirewallError) {
 *       return piiBlockedResponse();
 *     }
 *     throw error;
 *   }
 *
 *   // Safe to proceed with Supabase write
 *   await safeInsert("my_table", body);
 * }
 * ```
 */

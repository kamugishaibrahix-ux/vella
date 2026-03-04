/**
 * ATTACK STRINGS FOR PII ADVERSARIAL TESTING
 * ============================================
 * These payloads attempt to smuggle personal text past the PII firewall.
 * Each represents a different attack vector that must be blocked.
 *
 * @module tests/pii/attackStrings
 */

// ============================================================================
// DIRECT FORBIDDEN KEYS (Baseline attacks)
// ============================================================================

export const directForbiddenKeys = [
  // Core content fields
  { content: "This is my personal journal entry about my day" },
  { text: "I feel really sad today and need to talk about it" },
  { message: "My thoughts on the relationship breakdown..." },
  { note: "Private therapy session notes about childhood trauma" },
  { body: "Detailed description of my physical symptoms..." },
  { journal: "Intimate details about my mental health journey" },
  { reflection: "Deep personal introspection about my failures" },
  { summary: "Comprehensive summary of my therapy session" },
  { transcript: "Voice transcript: I cried for three hours yesterday..." },
  { prompt: "Help me process my grief over losing my parent" },
  { response: "I'm struggling with addiction and need support" },
  { narrative: "My life story including abuse and recovery" },
  { description: "Detailed account of my panic attack today" },
  { comment: "I'm having suicidal thoughts and need help" },
  { entry: "Diary entry: feeling worthless and alone" },
  { reply: "Response to my therapist's questions about trauma" },
  { answer: "Answers to deeply personal psychological questions" },
  { reasoning: "My thought process about self-harm urges" },
  { free_text: "Unrestricted personal expression about my depression" },
  { freeText: "CamelCase version of personal text content" },
];

// ============================================================================
// NESTED KEY ATTACKS (Deep object smuggling)
// ============================================================================

export const nestedKeyAttacks = [
  // Single nesting
  { meta: { content: "Nested personal text in meta object" } },
  { data: { message: "Hidden message in data field" } },
  { payload: { note: "Secret note in payload" } },

  // Double nesting
  { outer: { inner: { content: "Deeply nested personal content" } } },
  { level1: { level2: { level3: { text: "Triple nested attack" } } } },

  // Array nesting
  { items: [{ content: "Personal text in array item" }] },
  { messages: [{ text: "Message one" }, { text: "Message two" }] },

  // Mixed nesting
  {
    user: {
      profile: {
        bio: { content: "Biography with personal details" }
      }
    }
  },
];

// ============================================================================
// OBFUSCATED KEY ATTACKS (Case variations and typos)
// ============================================================================

export const obfuscatedKeyAttacks = [
  // Case variations
  { Content: "Capitalized Content key" },
  { CONTENT: "All caps CONTENT key" },
  { coNtEnT: "Mixed case coNtEnT key" },
  { MESSAGE: "All caps MESSAGE" },
  { Note: "Capitalized Note" },
  { TEXT: "All caps TEXT" },

  // Separator variations
  { "user-content": "Hyphenated content key" },
  { "user_content": "Underscore content key" },
  { "user:content": "Colon separated key" },
  { "user.content": "Dot notation key" },

  // Abbreviations and variants
  { msg: "Abbreviated message" },
  { txt: "Abbreviated text" },
  { notes: "Plural notes form" },
  { journalText: "Combined journalText" },
  { journal_text: "Snake case journal_text" },
  { "journal-text": "Kebab case journal-text" },
  { userInput: "Combined userInput" },
  { assistantOutput: "Combined assistantOutput" },

  // Unicode lookalikes (homoglyphs)
  { сontent: "Cyrillic с (U+0441) instead of Latin c" }, // сontent with Cyrillic с
  { "cоntent": "Mixed script with Cyrillic о" },
  { "​content": "Zero-width space prefix" },
  { "content​": "Zero-width space suffix" },
];

// ============================================================================
// JSON STRING EMBEDDING ATTACKS
// ============================================================================

export const jsonEmbeddingAttacks = [
  // JSON string containing forbidden fields
  { payload: JSON.stringify({ content: "Personal text inside JSON string" }) },
  { data: JSON.stringify({ message: "Message in JSON", note: "Note in JSON" }) },
  { metadata: JSON.stringify({ journal: "Journal entry in metadata" }) },

  // Nested JSON
  { outer: JSON.stringify({ inner: JSON.stringify({ content: "Double encoded" }) }) },

  // JSON array
  { items: JSON.stringify([{ text: "Array item 1" }, { text: "Array item 2" }]) },
];

// ============================================================================
// BASE64 ENCODING ATTACKS
// ============================================================================

function b64encode(str: string): string {
  return Buffer.from(str).toString("base64");
}

export const base64EncodingAttacks = [
  // Base64 encoded personal text
  { content_b64: b64encode("This is personal text base64 encoded") },
  { message_b64: b64encode("Secret message in base64") },
  { data: b64encode(JSON.stringify({ content: "Nested in base64 in JSON" })) },

  // Double encoding
  { double_encoded: b64encode(b64encode("Double base64 personal text")) },
];

// ============================================================================
// UNICODE TRICKS (Invisible characters and normalization)
// ============================================================================

export const unicodeTrickAttacks = [
  // Zero-width characters in keys
  { "content​": "Zero-width joiner after key" }, // U+200D
  { "​content": "Zero-width non-joiner before key" }, // U+200C
  { "cont​ent": "Zero-width space in middle" }, // U+200B

  // Invisible formatting
  { "content\u200b": "Explicit zero-width space" },
  { "content\ufeff": "Byte order mark suffix" },

  // RTL/LTR override characters
  { "\u202econtent\u202c": "RTL override around key" },

  // Homoglyphs (lookalike characters)
  { "сontent": "Cyrillic с (U+0441) homoglyph" },
  { "cоntent": "Cyrillic о (U+043E) homoglyph" },
  { "соntеnt": "Multiple Cyrillic homoglyphs" },
  { "𝑐𝑜𝑛𝑡𝑒𝑛𝑡": "Mathematical script letters" },
];

// ============================================================================
// LONG STRING ATTACKS (Abusing length limits)
// ============================================================================

export const longStringAttacks = [
  // Very long strings in "safe" fields
  { local_hash: "a".repeat(10000) }, // Abuse local_hash length
  { id: "x".repeat(5000) }, // Long ID
  { user_id: "user_" + "y".repeat(3000) }, // Long user_id

  // Long strings that look like hashes but aren't
  { content_hash: "not_a_hash_" + "z".repeat(5000) },
  { summary_hash: "fake_" + "0".repeat(10000) },

  // Legitimate-looking field with huge content
  { embedding: "0.1,".repeat(2000) + "personal text hidden in embedding" },
];

// ============================================================================
// ARRAY ATTACKS (Collection smuggling)
// ============================================================================

export const arrayAttacks = [
  // Array of personal messages
  { messages: ["Personal message 1", "Personal message 2", "Personal message 3"] },
  { contents: ["Content A", "Content B", "Content C"] },

  // Array of objects with forbidden fields
  { items: [{ content: "Item 1 content" }, { content: "Item 2 content" }] },
  { history: [{ message: "Old message" }, { message: "New message" }] },

  // Mixed arrays
  { data: ["safe string", { content: "nested content" }, 123, "more text"] },

  // Large arrays
  { chunks: Array(100).fill("Personal text repeated many times") },
];

// ============================================================================
// EMBEDDING-LIKE ARRAY ATTACKS
// ============================================================================

export const embeddingLikeAttacks = [
  // Vector with hidden text (wrong dimension + string)
  { embedding: [0.1, 0.2, 0.3, "hidden personal text", 0.4, 0.5] },

  // Object pretending to be embedding
  { vector: { content: "Not actually a vector" } },

  // Multi-dimensional array with text
  { matrix: [[0.1, 0.2], ["personal text", 0.3]] },

  // Long array that looks like embedding but has text at end (wrong dimension + string)
  { embedding: Array(1536).fill(0.01).concat(["secret message"]) },

  // ASCII numeric encoding (values outside range -5 to 5)
  // 104=h, 101=e, 108=l, 108=l, 111=o (spells "hello")
  { embedding: [104, 101, 108, 108, 111] },
];

// ============================================================================
// ERROR-TRIGGERING ATTACKS (Stack traces and log injection)
// ============================================================================

export const errorTriggeringAttacks = [
  // Strings that might cause errors and get logged
  { content: "undefined".repeat(1000) },
  { text: "null".repeat(500) },
  { message: "[object Object]".repeat(200) },

  // Newline injection
  { note: "Line 1\nLine 2\nLine 3\nPersonal info on new lines" },

  // Tab and control characters
  { text: "Personal\tdata\tin\ttabs" },

  // SQL injection-like patterns (should be caught by validation)
  { content: "'; DROP TABLE users; --" },
  { text: "1 OR 1=1; --" },

  // XSS-like patterns
  { message: "<script>alert('personal info')</script>" },
  { note: "<img src=x onerror=alert('data')>" },
];

// ============================================================================
// CANARY STRINGS (For leak detection)
// ============================================================================

export const canaryStrings = [
  "CANARY_PII_9f3a2c1d8e7b4f5a6b9c0d1e2f3a4b5c",
  "TEST_LEAK_DETECTION_7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a",
  "UNIQUE_TRACE_ID_b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9",
];

// ============================================================================
// ALL ATTACKS COMBINED
// ============================================================================

export const allAttacks = [
  ...directForbiddenKeys,
  ...nestedKeyAttacks,
  ...obfuscatedKeyAttacks,
  ...jsonEmbeddingAttacks,
  ...base64EncodingAttacks,
  ...unicodeTrickAttacks,
  ...longStringAttacks,
  ...arrayAttacks,
  ...embeddingLikeAttacks,
  ...errorTriggeringAttacks,
];

// ============================================================================
// KNOWN-SAFE PAYLOADS (Should NOT trigger firewall)
// ============================================================================

export const safePayloads = [
  // Metadata only
  { id: "123e4567-e89b-12d3-a456-426614174000", user_id: "user_123", created_at: "2026-02-27T10:00:00Z" },
  { local_hash: "a3f5c8d9e2b1a4f7c6d8e9a0b1c2d3e4f5a6b7c8", mood_score: 7, word_count: 150 },
  { content_hash: "sha256:abcdef1234567890", token_estimate: 50, embedding_model: "text-embedding-3-small" },

  // Enums and flags
  { type: "journal", status: "active", severity: "low", processing_mode: "standard" },
  { domain: "health", enforcement_mode: "soft", tier: "pro" },

  // Numbers and booleans
  { mood: 5, stress: 3, energy: 7, focus: 6, is_deleted: false },
  { message_count: 2, token_count: 500, from_allocation: true },

  // Short strings (IDs, codes)
  { session_id: "sess_abc123", model_id: "gpt-4", language: "en" },

  // Empty/null values
  { note: null, content: null, text: null },
  {},

  // Valid JSONB fields (structured, not free text)
  { signals: { trigger: "morning_routine", intensity: 3 } },
  { state_json: { phase: "growth", confidence: 0.85 } },
  // Valid embedding: exactly 1536 dimensions, all values in range [-5, 5]
  { embedding: Array(1536).fill(0.01) },
];

// ============================================================================
// ATTACK METADATA
// ============================================================================

export interface AttackMetadata {
  name: string;
  category: string;
  payload: unknown;
  expectedToBeBlocked: boolean;
  description: string;
}

export const attackMetadata: AttackMetadata[] = [
  // Direct attacks
  ...directForbiddenKeys.map((payload, i) => ({
    name: `Direct Attack ${i + 1}`,
    category: "Direct Forbidden Key",
    payload,
    expectedToBeBlocked: true,
    description: `Direct use of forbidden key: ${Object.keys(payload)[0]}`,
  })),

  // Nested attacks
  ...nestedKeyAttacks.map((payload, i) => ({
    name: `Nested Attack ${i + 1}`,
    category: "Nested Key",
    payload,
    expectedToBeBlocked: true,
    description: "Personal text nested in object hierarchy",
  })),

  // Obfuscated attacks
  ...obfuscatedKeyAttacks.map((payload, i) => ({
    name: `Obfuscated Attack ${i + 1}`,
    category: "Obfuscated Key",
    payload,
    expectedToBeBlocked: true,
    description: `Obfuscated key variation: ${Object.keys(payload)[0]}`,
  })),

  // JSON embedding attacks
  ...jsonEmbeddingAttacks.map((payload, i) => ({
    name: `JSON Embedding Attack ${i + 1}`,
    category: "JSON String Embedding",
    payload,
    expectedToBeBlocked: true,
    description: "Personal text embedded in JSON string",
  })),

  // Base64 attacks
  ...base64EncodingAttacks.map((payload, i) => ({
    name: `Base64 Attack ${i + 1}`,
    category: "Base64 Encoding",
    payload,
    expectedToBeBlocked: true,
    description: "Base64 encoded personal text",
  })),

  // Unicode tricks
  ...unicodeTrickAttacks.map((payload, i) => ({
    name: `Unicode Trick Attack ${i + 1}`,
    category: "Unicode Obfuscation",
    payload,
    expectedToBeBlocked: true,
    description: `Unicode trick: ${Object.keys(payload)[0]}`,
  })),

  // Long string attacks
  ...longStringAttacks.map((payload, i) => ({
    name: `Long String Attack ${i + 1}`,
    category: "Length Abuse",
    payload,
    expectedToBeBlocked: true,
    description: `Oversized string in field: ${Object.keys(payload)[0]}`,
  })),

  // Array attacks
  ...arrayAttacks.map((payload, i) => ({
    name: `Array Attack ${i + 1}`,
    category: "Array Smuggling",
    payload,
    expectedToBeBlocked: true,
    description: "Personal text in array structure",
  })),

  // Embedding-like attacks
  ...embeddingLikeAttacks.map((payload, i) => ({
    name: `Embedding Attack ${i + 1}`,
    category: "Embedding Masquerade",
    payload,
    expectedToBeBlocked: true,
    description: "Fake embedding structure with hidden text",
  })),

  // Error-triggering attacks
  ...errorTriggeringAttacks.map((payload, i) => ({
    name: `Error Trigger Attack ${i + 1}`,
    category: "Error Exploitation",
    payload,
    expectedToBeBlocked: true,
    description: "Payload designed to trigger error logging",
  })),
];

// ============================================================================
// EXPORT SUMMARY
// ============================================================================

/**
 * Attack Strings Module Exports:
 *
 * Attack Collections:
 * - directForbiddenKeys: 20 payloads with direct forbidden keys
 * - nestedKeyAttacks: 8 payloads with nested structures
 * - obfuscatedKeyAttacks: 20 payloads with obfuscated keys
 * - jsonEmbeddingAttacks: 4 payloads with JSON string embedding
 * - base64EncodingAttacks: 3 payloads with Base64 encoding
 * - unicodeTrickAttacks: 9 payloads with Unicode tricks
 * - longStringAttacks: 5 payloads abusing length limits
 * - arrayAttacks: 5 payloads using arrays
 * - embeddingLikeAttacks: 4 payloads masquerading as embeddings
 * - errorTriggeringAttacks: 7 payloads targeting error logs
 * - allAttacks: Combined array of all 85 attack payloads
 *
 * Safe Payloads:
 * - safePayloads: 10 payloads that should NOT trigger the firewall
 *
 * Testing:
 * - canaryStrings: 3 unique strings for leak detection
 * - attackMetadata: Detailed metadata for all attacks
 */

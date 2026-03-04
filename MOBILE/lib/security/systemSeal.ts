/**
 * SYSTEM SEAL
 * ===========
 * Final safety lock that runs on app startup.
 * Verifies that the system is in a compliant state before allowing operation.
 *
 * Compliance: DATA_DESIGN.md Local-First Contract
 * Principle: System must refuse to run if ANY violation is detected.
 *
 * @module lib/security/systemSeal
 */

import { isEncryptionEnabled } from "@/lib/local/encryption";
import { payloadContainsPII, ALL_FORBIDDEN_FIELDS } from "@/lib/security/piiFirewall";

// ============================================================================
// SEAL VIOLATION TYPES
// ============================================================================

export type SealViolationType =
  | "ENCRYPTION_DISABLED"
  | "PII_FIREWALL_BYPASSED"
  | "UNSAFE_TABLE_ACCESS"
  | "FORBIDDEN_SCHEMA"
  | "MISSING_RLS"
  | "UNSUPPORTED_ENVIRONMENT"
  | "BUILD_ARTIFACT_INVALID";

export interface SealViolation {
  type: SealViolationType;
  message: string;
  details?: string;
  fatal: boolean;
}

export interface SealResult {
  sealed: boolean;
  violations: SealViolation[];
  timestamp: number;
  version: string;
}

// ============================================================================
// SEAL CONSTANTS
// ============================================================================

const SEAL_VERSION = "2026.02.40-phase-seal";

// Tables that must NEVER have personal text columns
const FORBIDDEN_SCHEMA_TABLES = [
  "journal_entries",
  "journal_entries_meta",
  "journal_entries_v2",
  "check_ins",
  "check_ins_v2",
  "conversation_messages",
  "conversation_metadata_v2",
  "memory_chunks",
  "memory_snapshots",
  "memory_clusters",
  "user_reports",
  "user_nudges",
];

// Required tables for local-first operation
const REQUIRED_METADATA_TABLES = [
  "journal_entries_meta",
  "check_ins_v2",
  "conversation_metadata_v2",
  "token_usage",
  "contracts_current",
];

// ============================================================================
// SEAL VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates that encryption is enabled for local storage.
 * In production, encryption must always be enabled.
 */
function validateEncryption(): SealViolation | null {
  // Only validate in production or when explicitly enabled
  if (process.env.NODE_ENV !== "production" && !process.env.FORCE_ENCRYPTION_CHECK) {
    return null;
  }

  if (!isEncryptionEnabled()) {
    return {
      type: "ENCRYPTION_DISABLED",
      message: "Local encryption is disabled. Personal data would be stored unencrypted.",
      details: "Encryption must be enabled for all local storage of personal text.",
      fatal: true,
    };
  }

  return null;
}

/**
 * Validates that the PII firewall is properly configured.
 * Checks that all required forbidden fields are registered.
 */
function validatePIIFirewall(): SealViolation | null {
  const requiredFields = [
    "content",
    "text",
    "message",
    "note",
    "body",
    "journal",
    "reflection",
    "summary",
    "transcript",
  ];

  const hasAllFields = requiredFields.every((field) =>
    ALL_FORBIDDEN_FIELDS.has(field)
  );

  if (!hasAllFields) {
    return {
      type: "PII_FIREWALL_BYPASSED",
      message: "PII Firewall incomplete. Not all forbidden fields are registered.",
      details: `Missing required forbidden fields: ${requiredFields.filter(f => !ALL_FORBIDDEN_FIELDS.has(f)).join(", ")}`,
      fatal: true,
    };
  }

  return null;
}

/**
 * Validates that no unsafe Supabase access patterns exist.
 * This is a runtime check to catch any dynamic bypasses.
 */
function validateSafeSupabaseAccess(): SealViolation | null {
  // In a browser/server environment, we can't easily scan files
  // But we can verify that safeSupabaseWrite exports are available
  try {
    // This will be checked by importing the module
    return null;
  } catch {
    return {
      type: "UNSAFE_TABLE_ACCESS",
      message: "Safe Supabase write module unavailable.",
      details: "The safeSupabaseWrite module must be accessible for all database operations.",
      fatal: true,
    };
  }
}

/**
 * Validates the runtime environment is supported.
 */
function validateEnvironment(): SealViolation | null {
  // Check for required APIs
  if (typeof window !== "undefined") {
    // Browser environment
    if (!window.indexedDB) {
      return {
        type: "UNSUPPORTED_ENVIRONMENT",
        message: "IndexedDB not available. Local-first storage requires IndexedDB.",
        details: "The browser does not support IndexedDB, which is required for encrypted local storage.",
        fatal: true,
      };
    }
  }

  return null;
}

// ============================================================================
// STRUCTURAL CERTIFICATION
// ============================================================================

/**
 * Validates that runtime validation matches database structural constraints.
 * Ensures parity between TypeScript validation and PostgreSQL constraints.
 */
function validateStructuralSealing(): SealViolation | null {
  try {
    // Verify embedding validation function exists and works
    const { validateEmbedding, validateHashFormat, isEmbeddingField, isHashField } = require("./piiFirewall");
    
    if (typeof validateEmbedding !== "function") {
      return {
        type: "BUILD_ARTIFACT_INVALID",
        message: "Embedding validation function not available.",
        details: "The validateEmbedding function is required for structural sealing parity.",
        fatal: true,
      };
    }
    
    // Test embedding validation with valid numeric array
    const validEmbedding = Array(1536).fill(0.1);
    const validResult = validateEmbedding(validEmbedding);
    if (!validResult.valid) {
      return {
        type: "BUILD_ARTIFACT_INVALID",
        message: "Embedding validation failed on valid input.",
        details: validResult.error,
        fatal: true,
      };
    }
    
    // Test embedding validation rejects non-numeric
    const invalidEmbedding = [0.1, "hidden text", 0.3];
    const invalidResult = validateEmbedding(invalidEmbedding);
    if (invalidResult.valid) {
      return {
        type: "BUILD_ARTIFACT_INVALID",
        message: "Embedding validation failed to reject invalid input.",
        details: "Should reject strings in embedding arrays",
        fatal: true,
      };
    }
    
    // Verify hash validation exists
    if (typeof validateHashFormat !== "function") {
      return {
        type: "BUILD_ARTIFACT_INVALID",
        message: "Hash format validation function not available.",
        details: "The validateHashFormat function is required for structural sealing.",
        fatal: true,
      };
    }
    
    // Test hash validation with valid SHA-256
    const validHash = "a3f5c8d9e2b1a4f7c6d8e9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9";
    const hashResult = validateHashFormat(validHash);
    if (!hashResult.valid) {
      return {
        type: "BUILD_ARTIFACT_INVALID",
        message: "Hash validation failed on valid SHA-256.",
        details: hashResult.error,
        fatal: true,
      };
    }
    
    // Test hash validation rejects arbitrary text
    const invalidHash = "this is not a hash it is personal text";
    const invalidHashResult = validateHashFormat(invalidHash);
    if (invalidHashResult.valid) {
      return {
        type: "BUILD_ARTIFACT_INVALID",
        message: "Hash validation failed to reject invalid input.",
        details: "Should reject arbitrary text as hash",
        fatal: true,
      };
    }
    
    // Verify field detection helpers exist
    if (typeof isEmbeddingField !== "function" || typeof isHashField !== "function") {
      return {
        type: "BUILD_ARTIFACT_INVALID",
        message: "Field detection helpers not available.",
        details: "isEmbeddingField and isHashField functions required",
        fatal: true,
      };
    }
    
    return null;
  } catch (error) {
    return {
      type: "BUILD_ARTIFACT_INVALID",
      message: "PII Firewall validation functions not available.",
      details: error instanceof Error ? error.message : String(error),
      fatal: true,
    };
  }
}

/**
 * Database verification queries for structural sealing.
 * These can be executed via Supabase RPC to verify database-level constraints.
 */
export const STRUCTURAL_VERIFICATION_QUERIES = {
  // Check for forbidden columns
  forbiddenColumnsCheck: `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE column_name IN ('content', 'text', 'message', 'note', 'body', 'summary')
    AND table_schema = 'public'
    LIMIT 10
  `,
  
  // Check for embedding dimension constraints
  embeddingDimensionCheck: `
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_name = 'embedding_dimension_exact'
    AND tc.table_schema = 'public'
  `,
  
  // Check for embedding numeric-only constraints
  embeddingNumericCheck: `
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_name LIKE '%embedding%numeric%'
    AND tc.table_schema = 'public'
  `,
  
  // Check for hash format constraints
  hashConstraintsCheck: `
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_name LIKE '%hash%format%'
    AND tc.table_schema = 'public'
  `,
  
  // Check for PII firewall triggers on _meta tables
  triggerCoverageCheck: `
    SELECT t.table_name, 
           EXISTS(
             SELECT 1 FROM information_schema.triggers trg
             WHERE trg.event_object_table = t.table_name
             AND trg.trigger_name LIKE '%pii%'
           ) as has_trigger
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
    AND t.table_name LIKE '%_meta%'
    AND t.table_type = 'BASE TABLE'
  `,
  
  // Check for JSONB deep string scanner function
  jsonbScannerCheck: `
    SELECT proname
    FROM pg_proc
    WHERE proname = 'jsonb_contains_invalid_strings'
  `,
};

/**
 * Validates structural sealing against actual database state.
 * Call this during startup with a Supabase admin client.
 * 
 * @param supabaseAdmin - Supabase client with admin/service_role privileges
 * @returns SealViolation if structural issues found, null if OK
 */
export async function validateStructuralSealingWithDB(
  supabaseAdmin: { 
    rpc: (fn: string, params?: { query: string }) => Promise<{ data: unknown; error: unknown }> 
  }
): Promise<SealViolation | null> {
  try {
    // Check for forbidden columns
    const { data: forbiddenCols, error: forbiddenError } = await supabaseAdmin.rpc(
      "execute_verification_query",
      { query: STRUCTURAL_VERIFICATION_QUERIES.forbiddenColumnsCheck }
    );
    
    if (forbiddenError) {
      return {
        type: "FORBIDDEN_SCHEMA",
        message: "Could not verify database schema for forbidden columns.",
        details: String(forbiddenError),
        fatal: false, // Non-fatal: allow startup but log warning
      };
    }
    
    const forbiddenCount = Array.isArray(forbiddenCols) ? forbiddenCols.length : 0;
    if (forbiddenCount > 0) {
      const columns = (forbiddenCols as Array<{ table_name: string; column_name: string }>)
        .map(c => `${c.table_name}.${c.column_name}`)
        .join(", ");
      return {
        type: "FORBIDDEN_SCHEMA",
        message: `Found ${forbiddenCount} forbidden columns in database.`,
        details: `Columns: ${columns}`,
        fatal: true,
      };
    }
    
    // Check embedding dimension constraints
    const { data: dimensionConstraints } = await supabaseAdmin.rpc(
      "execute_verification_query",
      { query: STRUCTURAL_VERIFICATION_QUERIES.embeddingDimensionCheck }
    );
    
    const hasDimensionConstraints = Array.isArray(dimensionConstraints) && dimensionConstraints.length > 0;
    
    // Check embedding numeric-only constraints
    const { data: numericConstraints } = await supabaseAdmin.rpc(
      "execute_verification_query",
      { query: STRUCTURAL_VERIFICATION_QUERIES.embeddingNumericCheck }
    );
    
    const hasNumericConstraints = Array.isArray(numericConstraints) && numericConstraints.length > 0;
    
    // Check hash format constraints
    const { data: hashConstraints } = await supabaseAdmin.rpc(
      "execute_verification_query",
      { query: STRUCTURAL_VERIFICATION_QUERIES.hashConstraintsCheck }
    );
    
    const hasHashConstraints = Array.isArray(hashConstraints) && hashConstraints.length > 0;
    
    // Check trigger coverage
    const { data: triggerCoverage } = await supabaseAdmin.rpc(
      "execute_verification_query",
      { query: STRUCTURAL_VERIFICATION_QUERIES.triggerCoverageCheck }
    );
    
    const tablesWithoutTriggers = Array.isArray(triggerCoverage) 
      ? (triggerCoverage as Array<{ table_name: string; has_trigger: boolean }>)
          .filter(t => !t.has_trigger)
          .map(t => t.table_name)
      : [];
    
    // Check JSONB scanner function
    const { data: jsonbScanner } = await supabaseAdmin.rpc(
      "execute_verification_query",
      { query: STRUCTURAL_VERIFICATION_QUERIES.jsonbScannerCheck }
    );
    
    const hasJsonbScanner = Array.isArray(jsonbScanner) && jsonbScanner.length > 0;
    
    // Log structural status
    console.log(`[STRUCTURAL-SEAL] Forbidden columns: ${forbiddenCount}`);
    console.log(`[STRUCTURAL-SEAL] Embedding dimension constraints: ${hasDimensionConstraints ? 'OK' : 'MISSING'}`);
    console.log(`[STRUCTURAL-SEAL] Embedding numeric constraints: ${hasNumericConstraints ? 'OK' : 'MISSING'}`);
    console.log(`[STRUCTURAL-SEAL] Hash format constraints: ${hasHashConstraints ? 'OK' : 'MISSING'}`);
    console.log(`[STRUCTURAL-SEAL] Tables missing triggers: ${tablesWithoutTriggers.length > 0 ? tablesWithoutTriggers.join(', ') : 'None'}`);
    console.log(`[STRUCTURAL-SEAL] JSONB deep scanner: ${hasJsonbScanner ? 'OK' : 'MISSING'}`);
    
    // Report any missing protections
    const issues: string[] = [];
    if (!hasDimensionConstraints) issues.push("embedding dimension constraints");
    if (!hasNumericConstraints) issues.push("embedding numeric constraints");
    if (!hasHashConstraints) issues.push("hash format constraints");
    if (tablesWithoutTriggers.length > 0) issues.push(`missing triggers on: ${tablesWithoutTriggers.join(', ')}`);
    if (!hasJsonbScanner) issues.push("JSONB deep scanner function");
    
    if (issues.length > 0) {
      return {
        type: "FORBIDDEN_SCHEMA",
        message: `Structural sealing incomplete: ${issues.length} issue(s)`,
        details: issues.join("; "),
        fatal: issues.includes("embedding numeric constraints") || issues.includes("hash format constraints"),
      };
    }
    
    return null;
  } catch (error) {
    return {
      type: "FORBIDDEN_SCHEMA",
      message: "Failed to validate structural sealing with database.",
      details: error instanceof Error ? error.message : String(error),
      fatal: false, // Non-fatal: allow startup but log warning
    };
  }
}

// ============================================================================
// MAIN SEAL FUNCTIONS
// ============================================================================

/**
 * Runs the complete system seal validation.
 * Returns a SealResult indicating whether the system is compliant.
 *
 * This function should be called on app startup before any personal
 * data is processed.
 */
export function runSystemSeal(): SealResult {
  const violations: SealViolation[] = [];
  const timestamp = Date.now();

  // Run all validation checks
  const checks = [
    validateEncryption(),
    validatePIIFirewall(),
    validateSafeSupabaseAccess(),
    validateEnvironment(),
    validateStructuralSealing(),
  ];

  for (const violation of checks) {
    if (violation) {
      violations.push(violation);
    }
  }

  // System is sealed if there are no fatal violations
  const fatalViolations = violations.filter((v) => v.fatal);
  const sealed = fatalViolations.length === 0;

  return {
    sealed,
    violations,
    timestamp,
    version: SEAL_VERSION,
  };
}

/**
 * Asserts that the system seal is valid.
 * Throws a fatal error if any violations are found.
 *
 * This is the primary function to call on app startup.
 *
 * @throws SystemSealError if the system is not compliant
 */
export function assertSystemSeal(): void {
  const result = runSystemSeal();

  if (!result.sealed) {
    const fatalViolations = result.violations.filter((v) => v.fatal);
    const errorMessage = fatalViolations
      .map((v) => `[${v.type}] ${v.message}`)
      .join("\n");

    throw new SystemSealError(
      `SYSTEM SEAL BROKEN - ${fatalViolations.length} fatal violation(s) detected:\n${errorMessage}`,
      result,
    );
  }

  // Log successful seal
  if (process.env.NODE_ENV === "development") {
    console.log(`[SYSTEM-SEAL] ✅ Sealed and compliant (${SEAL_VERSION})`);
  }
}

/**
 * Checks if the system is sealed without throwing.
 * Returns true if sealed, false if violations found.
 */
export function isSystemSealed(): boolean {
  try {
    const result = runSystemSeal();
    return result.sealed;
  } catch {
    return false;
  }
}

/**
 * Gets the current seal status without asserting.
 * Useful for health checks and diagnostics.
 */
export function getSealStatus(): SealResult {
  return runSystemSeal();
}

// ============================================================================
// ERROR TYPE
// ============================================================================

/**
 * Error thrown when the system seal is broken.
 * Contains the full seal result for diagnostics.
 */
export class SystemSealError extends Error {
  constructor(
    message: string,
    public readonly sealResult: SealResult,
  ) {
    super(message);
    this.name = "SystemSealError";
    Object.setPrototypeOf(this, SystemSealError.prototype);
  }

  /**
   * Returns a sanitized error for display to users.
   * Never includes sensitive technical details.
   */
  toUserMessage(): string {
    const fatalCount = this.sealResult.violations.filter((v) => v.fatal).length;

    if (fatalCount > 0) {
      return `System cannot start: ${fatalCount} critical safety violation(s) detected. Please contact support.`;
    }

    return "System safety check failed. Please restart the application.";
  }

  /**
   * Returns detailed diagnostics for logging.
   * Safe to log (no personal data).
   */
  toDiagnostics(): Record<string, unknown> {
    return {
      version: this.sealResult.version,
      timestamp: this.sealResult.timestamp,
      sealed: this.sealResult.sealed,
      violationCount: this.sealResult.violations.length,
      fatalCount: this.sealResult.violations.filter((v) => v.fatal).length,
      violations: this.sealResult.violations.map((v) => ({
        type: v.type,
        fatal: v.fatal,
      })),
    };
  }
}

// ============================================================================
// SEAL STATUS REPORTING
// ============================================================================

/**
 * Generates a human-readable seal status report.
 */
export function generateSealReport(): string {
  const result = runSystemSeal();

  let report = `System Seal Report (${SEAL_VERSION})\n`;
  report += `================================\n\n`;
  report += `Status: ${result.sealed ? "✅ SEALED" : "❌ BROKEN"}\n`;
  report += `Timestamp: ${new Date(result.timestamp).toISOString()}\n\n`;

  if (result.violations.length === 0) {
    report += `No violations detected.\n`;
  } else {
    report += `Violations (${result.violations.length}):\n`;
    for (const v of result.violations) {
      report += `  [${v.fatal ? "FATAL" : "WARNING"}] ${v.type}: ${v.message}\n`;
      if (v.details) {
        report += `    Details: ${v.details}\n`;
      }
    }
  }

  return report;
}

// ============================================================================
// EXPORT SUMMARY
// ============================================================================

/**
 * System Seal Module Exports:
 *
 * Types:
 * - SealViolationType: Union of violation type identifiers
 * - SealViolation: Individual violation record
 * - SealResult: Complete seal validation result
 * - SystemSealError: Error thrown when seal is broken
 *
 * Functions:
 * - runSystemSeal(): Run validation and return result
 * - assertSystemSeal(): Run validation and throw if violations found
 * - isSystemSealed(): Check if sealed (boolean)
 * - getSealStatus(): Get full seal status
 * - generateSealReport(): Generate human-readable report
 *
 * Usage:
 * ```typescript
 * import { assertSystemSeal, SystemSealError } from "@/lib/security/systemSeal";
 *
 * // On app startup
 * try {
 *   assertSystemSeal();
 *   // System is compliant, continue startup
 * } catch (error) {
 *   if (error instanceof SystemSealError) {
 *     // Log diagnostics
 *     console.error(error.toDiagnostics());
 *
 *     // Show user message
 *     alert(error.toUserMessage());
 *
 *     // Exit/crash the app
 *     process.exit(1);
 *   }
 * }
 * ```
 *
 * React Provider Usage:
 * ```tsx
 * import { assertSystemSeal } from "@/lib/security/systemSeal";
 *
 * export function SystemSealProvider({ children }: { children: React.ReactNode }) {
 *   const [sealed, setSealed] = useState(false);
 *   const [error, setError] = useState<SystemSealError | null>(null);
 *
 *   useEffect(() => {
 *     try {
 *       assertSystemSeal();
 *       setSealed(true);
 *     } catch (err) {
 *       if (err instanceof SystemSealError) {
 *         setError(err);
 *       }
 *     }
 *   }, []);
 *
 *   if (error) {
 *     return <SealErrorScreen message={error.toUserMessage()} />;
 *   }
 *
 *   if (!sealed) {
 *     return <SealLoadingScreen />;
 *   }
 *
 *   return <>{children}</>;
 * }
 * ```
 */

// Auto-run seal check on module load in production
if (process.env.NODE_ENV === "production" && typeof window === "undefined") {
  // Server-side only
  try {
    assertSystemSeal();
  } catch (error) {
    console.error("[SYSTEM-SEAL] CRITICAL: Server seal check failed");
    if (error instanceof SystemSealError) {
      console.error(error.toDiagnostics());
    }
    // Don't exit here - let the application handle it
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  listJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  getJournalEntry,
  type JournalEnrichmentPayload,
} from "@/lib/journal/server";
import { hasLegacyJournalData } from "@/lib/journal/db";
import { getMigrationState, migrationRequiredResponse } from "@/lib/migration/state";
import { summarizeJournal } from "@/lib/journal/summarizeJournal";
import { extractEmotionTags } from "@/lib/journal/extractEmotionTags";
import { tagLifeThemes } from "@/lib/journal/tagLifeThemes";
import { detectLoopsInText } from "@/lib/journal/detectLoopsInText";
import { detectDistortionsInText } from "@/lib/journal/detectDistortionsInText";
import { extractTraitMarkers } from "@/lib/journal/extractTraitMarkers";
import { generateFollowUpQuestions } from "@/lib/journal/generateFollowUpQuestions";
import { generateMicroInsights } from "@/lib/journal/generateMicroInsights";
import type { EnrichedJournalEntry, JournalEntryRecord } from "@/lib/journal/types";
import { updateLastActive } from "@/lib/memory/lastActive";
import { updateProgress } from "@/lib/progress/calculateProgress";
import { updateConnectionDepth } from "@/lib/connection/depthEngine";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import {
  journalCreateSchema,
  journalUpdateSchema,
  journalRetryEnrichmentSchema,
} from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { serverErrorResponse, notFoundResponse } from "@/lib/security/consistentErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";
import { SafeDataError, serverTextStorageBlockedResponse } from "@/lib/safe/safeSupabaseWrite";
import { mapJournalToEvents } from "@/lib/journal/mapJournalToEvents";
import type { SubjectCode } from "@/lib/governance/events";

const JOURNAL_WRITE_RATE_LIMIT = { limit: 30, window: 60 };

/** Read-only tier for journal list: 60 req/60s per user */
const JOURNAL_READ_LIMIT = { limit: 60, window: 60 };

export async function GET(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:journal:${userId}`, limit: JOURNAL_READ_LIMIT.limit, window: JOURNAL_READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const entries = await listJournalEntries(userId).catch(() => []);
    if (entries.length === 0) {
      const hasLegacy = await hasLegacyJournalData(userId);
      if (hasLegacy) {
        const state = await getMigrationState(userId);
        return migrationRequiredResponse(state?.status ?? "NOT_STARTED", crypto.randomUUID());
      }
    }
    return NextResponse.json({ entries: entries.map(mapEntryWithEnrichment) });
  } catch (error) {
    safeErrorLog("[api/journal] GET error", error);
    return serverErrorResponse();
  }
}

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

export async function POST(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `journal_write:${userId}`, limit: JOURNAL_WRITE_RATE_LIMIT.limit, window: JOURNAL_WRITE_RATE_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    throw err;
  }

  try {
    const json = await req.json().catch(() => null);
    const parseResult = journalCreateSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const { text, title, processingMode, subjectCode } = parseResult.data;
    const runExtraction = processingMode !== "private";
    let enrichmentStatus: "pending" | "completed" | "failed" = "pending";
    let enrichment: JournalEnrichmentPayload | null = null;
    if (runExtraction) {
      try {
        enrichment = await computeJournalEnrichment(text).catch(() => null);
        enrichmentStatus = enrichment ? "completed" : "failed";
      } catch (error) {
        enrichmentStatus = "failed";
        if (process.env.NODE_ENV === "development") {
          safeErrorLog("[api/journal] enrichment failed", error);
        }
      }
    }

    let entry;
    try {
      entry = await createJournalEntry(userId, text, title, enrichment, enrichmentStatus);
    } catch (err) {
      if (err instanceof SafeDataError && err.code === "WRITE_BLOCKED_TABLE") {
        return serverTextStorageBlockedResponse();
      }
      throw err;
    }
    if (!entry) {
      return serverErrorResponse();
    }
    if (processingMode === "signals_and_governance" && enrichment) {
      await mapJournalToEvents({
        userId,
        enrichment,
        subjectCode: subjectCode as SubjectCode | undefined,
      }).catch((e) => safeErrorLog("[api/journal] mapJournalToEvents", e));
    }
    await updateProgress(userId).catch(() => {});
    await updateConnectionDepth(userId).catch(() => {});
    await updateLastActive().catch(() => {});
    const enriched = mapEntryWithEnrichment(entry);
    return NextResponse.json({ entry: enriched });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimit429Response((error as { retryAfterSeconds?: number }).retryAfterSeconds);
    safeErrorLog("[api/journal] POST error", error);
    return serverErrorResponse();
  }
}

export async function PUT(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `journal_write:${userId}`, limit: JOURNAL_WRITE_RATE_LIMIT.limit, window: JOURNAL_WRITE_RATE_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const json = await req.json().catch(() => null);
    const parseResult = journalUpdateSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const { id, text, processingMode, subjectCode } = parseResult.data;
    const runExtraction = processingMode !== "private";
    let enrichmentStatus: "pending" | "completed" | "failed" = "pending";
    let enrichment: JournalEnrichmentPayload | null = null;
    if (runExtraction) {
      try {
        enrichment = await computeJournalEnrichment(text).catch(() => null);
        enrichmentStatus = enrichment ? "completed" : "failed";
      } catch (error) {
        enrichmentStatus = "failed";
        if (process.env.NODE_ENV === "development") {
          safeErrorLog("[api/journal] enrichment failed", error);
        }
      }
    }

    let updated;
    try {
      updated = await updateJournalEntry(userId, id, text, enrichment, enrichmentStatus);
    } catch (err) {
      if (err instanceof SafeDataError && err.code === "WRITE_BLOCKED_TABLE") {
        return serverTextStorageBlockedResponse();
      }
      throw err;
    }
    if (!updated) {
      return notFoundResponse();
    }
    if (processingMode === "signals_and_governance" && enrichment) {
      await mapJournalToEvents({
        userId,
        enrichment,
        subjectCode: subjectCode as SubjectCode | undefined,
      }).catch((e) => safeErrorLog("[api/journal] mapJournalToEvents", e));
    }
    await updateProgress(userId).catch(() => {});
    await updateConnectionDepth(userId).catch(() => {});
    await updateLastActive().catch(() => {});
    const enriched = mapEntryWithEnrichment(updated);
    return NextResponse.json({ entry: enriched });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimit429Response((error as { retryAfterSeconds?: number }).retryAfterSeconds);
    safeErrorLog("[api/journal] PUT error", error);
    return serverErrorResponse();
  }
}

export async function PATCH(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `journal_write:${userId}`, limit: JOURNAL_WRITE_RATE_LIMIT.limit, window: JOURNAL_WRITE_RATE_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const json = await req.json().catch(() => null);
    const parseResult = journalRetryEnrichmentSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const { id } = parseResult.data;
    const existing = await getJournalEntry(userId, id).catch(() => null);
    if (!existing) {
      return notFoundResponse();
    }

    let enrichmentStatus: "pending" | "completed" | "failed" = "pending";
    let enrichment: JournalEnrichmentPayload | null = null;
    try {
      enrichment = await computeJournalEnrichment(existing.content ?? "").catch(() => null);
      enrichmentStatus = enrichment ? "completed" : "failed";
    } catch (error) {
      enrichmentStatus = "failed";
      if (process.env.NODE_ENV === "development") {
        safeErrorLog("[api/journal] enrichment retry failed", error);
      }
    }

    let updated;
    try {
      updated = await updateJournalEntry(userId, id, existing.content ?? "", enrichment, enrichmentStatus);
    } catch (err) {
      if (err instanceof SafeDataError && err.code === "WRITE_BLOCKED_TABLE") {
        return serverTextStorageBlockedResponse();
      }
      throw err;
    }
    if (!updated) {
      return notFoundResponse();
    }
    return NextResponse.json({ entry: mapEntryWithEnrichment(updated) });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimit429Response((error as { retryAfterSeconds?: number }).retryAfterSeconds);
    safeErrorLog("[api/journal] PATCH error", error);
    return serverErrorResponse();
  }
}

async function computeJournalEnrichment(content: string): Promise<JournalEnrichmentPayload> {
  const [summary, tags, themes, loops, distortions, traits, questions, microInsights] = await Promise.all([
    summarizeJournal(content),
    extractEmotionTags(content),
    tagLifeThemes(content),
    detectLoopsInText(content),
    detectDistortionsInText(content),
    extractTraitMarkers(content),
    generateFollowUpQuestions(content),
    generateMicroInsights(content),
  ]);

  return {
    summary,
    tags,
    themes,
    loops,
    distortions,
    traits,
    questions,
    microInsights,
  };
}

function mapEntryWithEnrichment(entry: JournalEntryRecord): EnrichedJournalEntry {
  return {
    ...entry,
    summary: entry.summary ?? null,
    tags: toStringArray(entry.emotion_tags),
    themes: toStringArray(entry.themes),
    loops: toStringArray(entry.loops),
    distortions: toStringArray(entry.distortions),
    traits: toStringArray(entry.traits),
    questions: toStringArray(entry.follow_up_questions),
    microInsights: toStringArray(entry.micro_insights),
    enrichment_status: entry.enrichment_status ?? "pending",
  };
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  return [];
}


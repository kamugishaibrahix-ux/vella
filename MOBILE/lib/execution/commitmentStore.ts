/**
 * Execution Spine — Server-side commitment CRUD.
 * Metadata-only writes to `commitments` table via safeSupabaseWrite.
 * Does NOT store free-text. Does NOT modify governance_state.
 */

"use server";

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert, safeUpdate } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";
import type { CommitmentStatus } from "./types";

type CommitmentRow = Database["public"]["Tables"]["commitments"]["Row"];
type CommitmentInsert = Database["public"]["Tables"]["commitments"]["Insert"];

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateCommitmentParams = {
  userId: string;
  commitment_code: string;
  subject_code: string;
  target_type: string;
  target_value: number;
  cadence_type: string;
  start_at: string;
  end_at?: string | null;
  deadline_at?: string | null;
};

export type CreateResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function createCommitment(params: CreateCommitmentParams): Promise<CreateResult> {
  if (!supabaseAdmin) {
    return { success: false, error: "Supabase admin not configured." };
  }

  const now = new Date().toISOString();

  const row: CommitmentInsert = {
    user_id: params.userId,
    commitment_code: params.commitment_code,
    subject_code: params.subject_code,
    target_type: params.target_type,
    target_value: params.target_value,
    start_at: params.start_at,
    end_at: params.end_at ?? null,
    status: "active",
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await safeInsert(
    "commitments",
    row as Record<string, unknown>,
    undefined,
    supabaseAdmin
  ).select("id").single();

  if (error) return { success: false, error: error.message };
  if (!data?.id) return { success: false, error: "Insert did not return id" };
  return { success: true, id: data.id };
}

// ---------------------------------------------------------------------------
// List (active + paused for user)
// ---------------------------------------------------------------------------

export async function listCommitments(
  userId: string
): Promise<{ commitments: CommitmentRow[]; error?: string }> {
  const { data, error } = await fromSafe("commitments")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false });

  if (error) return { commitments: [], error: error.message };
  return { commitments: (data ?? []) as CommitmentRow[] };
}

// ---------------------------------------------------------------------------
// Get single
// ---------------------------------------------------------------------------

export async function getCommitment(
  userId: string,
  commitmentId: string
): Promise<CommitmentRow | null> {
  const { data, error } = await fromSafe("commitments")
    .select("*")
    .eq("id", commitmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as CommitmentRow;
}

// ---------------------------------------------------------------------------
// Change status
// ---------------------------------------------------------------------------

export type ChangeStatusResult =
  | { success: true }
  | { success: false; error: string };

export async function changeCommitmentStatus(
  userId: string,
  commitmentId: string,
  newStatus: CommitmentStatus
): Promise<ChangeStatusResult> {
  if (!supabaseAdmin) {
    return { success: false, error: "Supabase admin not configured." };
  }

  const now = new Date().toISOString();

  const { error } = await safeUpdate(
    "commitments",
    { status: newStatus, updated_at: now } as Record<string, unknown>,
    undefined,
    supabaseAdmin
  )
    .eq("id", commitmentId)
    .eq("user_id", userId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

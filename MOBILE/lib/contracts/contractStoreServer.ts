/**
 * Contract Persistence — Server-side metadata-only CRUD via fromSafe().
 * No service role bypass. No client exposure. No free text.
 */

"use server";

import { fromSafe } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractInsert {
  user_id: string;
  template_id: string;
  domain: string;
  origin: "system" | "user";
  enforcement_mode: "observe" | "soft" | "strict";
  severity: "low" | "moderate" | "high";
  duration_days: number;
  budget_weight: number;
  expires_at: string; // ISO 8601 timestamptz
}

export interface ContractRow {
  id: string;
  user_id: string;
  template_id: string;
  domain: string;
  origin: string;
  enforcement_mode: string;
  severity: string;
  duration_days: number;
  budget_weight: number;
  is_active: boolean;
  created_at: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Persistence Functions
// ---------------------------------------------------------------------------

export async function createContract(
  contract: ContractInsert,
): Promise<{ data: ContractRow | null; error: string | null }> {
  const { data, error } = await fromSafe("contracts_current")
    .insert({
      user_id: contract.user_id,
      template_id: contract.template_id,
      domain: contract.domain,
      origin: contract.origin,
      enforcement_mode: contract.enforcement_mode,
      severity: contract.severity,
      duration_days: contract.duration_days,
      budget_weight: contract.budget_weight,
      expires_at: contract.expires_at,
    } as never)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as ContractRow, error: null };
}

export async function getActiveContracts(
  userId: string,
): Promise<{ data: ContractRow[]; error: string | null }> {
  const { data, error } = await fromSafe("contracts_current")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as ContractRow[], error: null };
}

export async function countWeeklyContracts(
  userId: string,
): Promise<{ count: number; error: string | null }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await fromSafe("contracts_current")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_active", true)
    .gte("created_at", sevenDaysAgo);

  if (error) return { count: 0, error: error.message };
  return { count: (data as unknown as number) ?? 0, error: null };
}

export async function deactivateExpiredContracts(
  userId: string,
): Promise<{ affected: number; error: string | null }> {
  const now = new Date().toISOString();

  const { data, error } = await fromSafe("contracts_current")
    .update({ is_active: false } as never)
    .eq("user_id", userId)
    .eq("is_active", true)
    .lt("expires_at", now)
    .select("id");

  if (error) return { affected: 0, error: error.message };
  return { affected: (data ?? []).length, error: null };
}

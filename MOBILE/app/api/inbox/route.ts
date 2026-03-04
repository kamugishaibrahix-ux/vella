/**
 * Inbox Metadata Feed API — GET endpoint for post-session outcomes.
 * Returns system transitions and contract metadata in a merged chronological feed.
 * No free-text fields returned. Strict schema validation via Zod.
 * Fail-closed: Any query failure returns 500 INBOX_READ_FAILED.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveUser, isActiveUserBlocked } from "@/lib/auth/requireActiveUser";
import { fromSafe } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Zod Schemas — Strict validation, no free-text
// ---------------------------------------------------------------------------

const ChangeFlagsSchema = z.object({
  phase_changed: z.boolean(),
  priority_changed: z.boolean(),
  enforcement_changed: z.boolean(),
  constraint_level_changed: z.boolean(),
});

const TransitionPayloadSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  previous_phase: z.string(),
  new_phase: z.string(),
  previous_priority_domain: z.string(),
  new_priority_domain: z.string(),
  previous_enforcement_mode: z.string(),
  new_enforcement_mode: z.string(),
  triggered_by_domain: z.string(),
  trigger_source: z.string(),
  change_flags: ChangeFlagsSchema,
});

const ContractPayloadSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  domain: z.string(),
  severity: z.string(),
  origin: z.string(),
  enforcement_mode: z.string(),
  template_id: z.string(),
  expires_at: z.string(),
  is_active: z.boolean(),
});

const ProposalPayloadSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  type: z.literal("proposal_ready"),
  domain: z.string(),
  severity: z.string(),
  proposal_id: z.string(),
  status: z.string(),
});

const InboxItemSchema = z.union([
  z.object({
    type: z.literal("system_transition"),
    created_at: z.string(),
    payload: TransitionPayloadSchema,
  }),
  z.object({
    type: z.literal("contract_created"),
    created_at: z.string(),
    payload: ContractPayloadSchema,
  }),
  z.object({
    type: z.literal("proposal_ready"),
    created_at: z.string(),
    payload: ProposalPayloadSchema,
  }),
]);

const ResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(InboxItemSchema).max(30),
});

type TransitionRow = Database["public"]["Tables"]["system_transition_log"]["Row"];
type ContractRow = Database["public"]["Tables"]["contracts_current"]["Row"];
type ProposalRow = Database["public"]["Tables"]["inbox_proposals_meta"]["Row"];

const MAX_ITEMS = 30;
const QUERY_LIMIT = 20;

// ---------------------------------------------------------------------------
// GET Handler
// ---------------------------------------------------------------------------
export async function GET() {
  // Step 1: Auth — require active user
  const authResult = await requireActiveUser();
  if (isActiveUserBlocked(authResult)) {
    return authResult; // Returns 403 NextResponse
  }
  const { userId } = authResult;

  // Step 2: Fetch data in parallel (fail-closed: any error fails the entire request)
  const [transitionsResult, contractsResult, proposalsResult] = await Promise.all([
    // A) system_transition_log: last 20 rows ordered by created_at desc
    fromSafe("system_transition_log")
      .select(
        "id, created_at, previous_phase, new_phase, previous_priority_domain, new_priority_domain, " +
          "previous_enforcement_mode, new_enforcement_mode, triggered_by_domain, trigger_source, " +
          "changed_phase, changed_priority, changed_enforcement, changed_budget"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(QUERY_LIMIT),

    // B) contracts_current: last 20 rows ordered by created_at desc
    fromSafe("contracts_current")
      .select("id, created_at, domain, severity, origin, enforcement_mode, template_id, expires_at, is_active")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(QUERY_LIMIT),

    // C) inbox_proposals_meta: last 20 proposal_ready items
    fromSafe("inbox_proposals_meta")
      .select("id, created_at, type, domain, severity, proposal_id, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(QUERY_LIMIT),
  ]);

  // Step 3: Fail-closed check — if either query failed, return 500
  if (transitionsResult.error) {
    return NextResponse.json(
      { error: "inbox_read_failed", code: "INBOX_READ_FAILED" },
      { status: 500 }
    );
  }

  if (contractsResult.error) {
    return NextResponse.json(
      { error: "inbox_read_failed", code: "INBOX_READ_FAILED" },
      { status: 500 }
    );
  }

  if (proposalsResult.error) {
    return NextResponse.json(
      { error: "inbox_read_failed", code: "INBOX_READ_FAILED" },
      { status: 500 }
    );
  }

  // Step 4: Transform data into inbox items
  const transitionItems: z.infer<typeof InboxItemSchema>[] = ((transitionsResult.data ?? []) as TransitionRow[]).map(
    (row) => ({
      type: "system_transition" as const,
      created_at: row.created_at,
      payload: {
        id: row.id,
        created_at: row.created_at,
        previous_phase: row.previous_phase,
        new_phase: row.new_phase,
        previous_priority_domain: row.previous_priority_domain,
        new_priority_domain: row.new_priority_domain,
        previous_enforcement_mode: row.previous_enforcement_mode,
        new_enforcement_mode: row.new_enforcement_mode,
        triggered_by_domain: row.triggered_by_domain,
        trigger_source: row.trigger_source,
        change_flags: {
          phase_changed: row.changed_phase,
          priority_changed: row.changed_priority,
          enforcement_changed: row.changed_enforcement,
          constraint_level_changed: row.changed_budget,
        },
      },
    })
  );

  const contractItems: z.infer<typeof InboxItemSchema>[] = ((contractsResult.data ?? []) as ContractRow[]).map(
    (row) => ({
      type: "contract_created" as const,
      created_at: row.created_at,
      payload: {
        id: row.id,
        created_at: row.created_at,
        domain: row.domain,
        severity: row.severity,
        origin: row.origin,
        enforcement_mode: row.enforcement_mode,
        template_id: row.template_id,
        expires_at: row.expires_at,
        is_active: row.is_active,
      },
    })
  );

  const proposalItems: z.infer<typeof InboxItemSchema>[] = ((proposalsResult.data ?? []) as ProposalRow[]).map(
    (row) => ({
      type: "proposal_ready" as const,
      created_at: row.created_at,
      payload: {
        id: row.id,
        created_at: row.created_at,
        type: "proposal_ready" as const,
        domain: row.domain,
        severity: row.severity,
        proposal_id: row.proposal_id,
        status: row.status,
      },
    })
  );

  // Step 5: Merge and sort chronologically (descending by created_at)
  const mergedItems = [...transitionItems, ...contractItems, ...proposalItems].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    return bTime - aTime; // Descending (newest first)
  });

  // Step 6: Limit to max 30 items
  const limitedItems = mergedItems.slice(0, MAX_ITEMS);

  // Step 7: Build and validate response
  const responsePayload = {
    ok: true as const,
    items: limitedItems,
  };

  // Strict schema validation
  const validation = ResponseSchema.safeParse(responsePayload);
  if (!validation.success) {
    return NextResponse.json(
      { error: "response_validation_failed", code: "RESPONSE_VALIDATION_FAILED" },
      { status: 500 }
    );
  }

  return NextResponse.json(responsePayload);
}

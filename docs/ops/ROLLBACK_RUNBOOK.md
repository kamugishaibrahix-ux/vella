# Rollback Runbook

**Scope:** Vercel (application deployments) + Supabase (database).  
**Purpose:** Restore service or data to a known-good state within RTO/RPO targets.

---

## Targets

| Target | Value | Notes |
|--------|--------|--------|
| **RTO (Recovery Time Objective)** | ≤ 15 minutes | For code/configuration rollback (Lever A or B). |
| **RPO (Recovery Point Objective)** | See Supabase backups | Confirm in [Supabase Dashboard](https://supabase.com/dashboard) → Project → Settings → Backups. Pro/Team: PITR and daily backups; Free tier: limited. Define exact RPO after verification. |

---

## Rollback Levers

### (A) Vercel code rollback procedure

Use when a **recent deployment** is causing incidents (bugs, errors, broken flows). Does not change database state.

1. **Open Vercel Dashboard** → select the project (MOBILE and/or vella-control if separate).
2. **Deployments** → find the last known-good deployment (by time or commit).
3. **Rollback:**
   - Click the **⋮** menu on that deployment.
   - Select **Promote to Production** (or equivalent).
4. **Confirm:** Production alias now points to that deployment; new requests use rolled-back code.
5. **Optional:** Redeploy from the same commit later if you need a new build with same code.
6. **Communicate:** Notify team and, if needed, users (status page / in-app).

**Time:** Typically &lt; 5 minutes. RTO for code rollback is met if this is done within 15 minutes of the decision.

---

### (B) Feature-flag rollback

Use when the issue can be **turned off via configuration** (e.g. a feature flag or env-based toggle) without reverting the whole deployment.

- **Mechanism (placeholder):** Env-based toggles (e.g. `NEXT_PUBLIC_FEATURE_X=0` or `DISABLE_BILLING=1`) applied in Vercel Project Settings → Environment Variables, then **redeploy** or use Vercel’s instant env refresh if available.
- **Future:** A dedicated kill-switch and feature flags will be described in **KILL_SWITCH.md** (to be created). Until then, use env toggles and redeploy as above.
- **Steps:**
  1. Identify the env var that disables the problematic feature.
  2. In Vercel → Project → Settings → Environment Variables, set the toggle for Production.
  3. Trigger a redeploy or wait for env propagation per Vercel docs.
  4. Verify behavior and communicate.

---

### (C) Supabase restore procedure (PITR / backup restore)

Use when **database state** is corrupted or lost (bad migration, accidental bulk delete, etc.). **Destructive:** restores overwrite current state to a point in time; all changes after that point are lost.

**Warning:** Restoring from backup/PITR is **destructive**. It affects the entire project. Application code must be compatible with the restored schema. Coordinate with the team and schedule maintenance if possible.

1. **Supabase Dashboard** → Project → **Settings** → **Backups** (or **Database** → **Backups** / **PITR**).
2. **Point-in-time recovery (PITR)** — if available (Pro/Team):
   - Choose **Restore to a point in time**.
   - Select the target time (before the incident).
   - Confirm: a **new** project is usually created with the restored database, or the current project is replaced depending on Supabase UI. Follow the on-screen instructions.
   - Update application env (e.g. `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) if a new project was created.
3. **Daily backup restore** — if PITR not available:
   - Use the latest backup before the incident.
   - Follow Supabase docs for “Restore from backup” (often creates a new project or overwrites; confirm in dashboard).
4. **Post-restore:** Run [Post-rollback validation checklist](#post-rollback-validation-checklist) and re-run any migrations that are required for the current codebase (see [MIGRATION_POLICY.md](./MIGRATION_POLICY.md)).

---

## Decision tree: when to use A vs B vs C

```
Incident: production broken or data at risk?
    │
    ├─ Is the problem only in application code (no DB corruption)?
    │     ├─ Yes → Can you turn it off with a feature flag / env toggle?
    │     │         ├─ Yes → Use (B) Feature-flag rollback
    │     │         └─ No  → Use (A) Vercel code rollback
    │     │
    │     └─ No (DB may be wrong or lost)
    │           → Use (C) Supabase restore
    │           → Then align code if needed (A) or toggles (B)
    │
    └─ Unknown cause
          → Start with (A) to stabilize; if data is wrong, proceed to (C) and then (A)/(B) as needed.
```

| Lever | Use when |
|-------|----------|
| **A – Vercel rollback** | Bad deploy, broken UI/API, no DB change. |
| **B – Feature-flag rollback** | Single feature or path can be disabled via config; no need to revert full deploy. |
| **C – Supabase restore** | Wrong or lost data; bad migration; need to recover to a point in time. |

---

## Rollback drill checklist

- **Frequency:** Monthly (or per release cadence).
- **Owner:** Ops / on-call; record outcome in a shared doc or ticket.

**How to time and record:**

1. **Schedule:** Pick a recurring day (e.g. first Tuesday of the month) and a 15–30 minute window.
2. **Lever to drill:** Rotate (A) one month, (B) next, (C) once per quarter or in staging only.
3. **Steps to record:**
   - Date and time of drill.
   - Lever used (A / B / C).
   - Steps performed (e.g. “Promoted deployment X to production” or “Restored staging DB to T-1h”).
   - Time from “go” to “verified” (should be ≤ 15 min for A/B).
   - Any blockers or doc gaps.
4. **Staging for (C):** Prefer running Supabase restore drills against a **staging** project; document that production PITR/restore is only for real incidents.

---

## Post-rollback validation checklist

After **any** rollback (A, B, or C), run through these smoke checks and tick when done:

- [ ] **Auth:** Log in (MOBILE and vella-control if applicable); confirm session and redirects.
- [ ] **Billing:** If billing is in scope — load checkout or billing page; confirm no 500s; optionally create a test checkout session and cancel.
- [ ] **Webhook health:** If Stripe webhook is used — send a test event from Stripe Dashboard or confirm recent events are processed; check app logs for webhook errors.
- [ ] **Rate limiting:** Trigger a rate-limited endpoint (e.g. repeated API call); confirm 429 and Retry-After where expected.
- [ ] **Critical path:** One main user flow (e.g. open app → one AI/conversation action or key screen) completes without errors.

Record result (pass/fail) and any follow-up actions. If validation fails, escalate and consider a second rollback or restore.

---

## Related

- [MIGRATION_POLICY.md](./MIGRATION_POLICY.md) — Safe migrations and staging before prod.
- [KILL_SWITCH_RUNBOOK.md](./KILL_SWITCH_RUNBOOK.md) — Central kill switch (APP_MAINTENANCE_MODE, DISABLE_BILLING, DISABLE_AI, WRITE_LOCK_MODE) and when to use each.

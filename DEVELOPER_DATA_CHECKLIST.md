# Developer Data Handling Checklist

This checklist exists to keep every feature aligned with Vella’s data design principles. Any change that touches storage must confirm where the data lives, how sensitive it is, and whether it complies with our metadata-only use of Supabase. When in doubt, assume personal text belongs on the user’s device and verify against `DATA_DESIGN.md`.

Follow these steps each time you introduce new fields, tables, queries, or logging.

## Before you add a new field or table

- Classify the data using the categories defined in `DATA_DESIGN.md`.
- Ask whether the data can live purely on-device (localStorage) and document that decision.
- If the data must be in Supabase, justify the reason in a code comment or internal doc.
- Ensure any remote field is **not** free-text; favour enums, booleans, or integers.
- Confirm retention/deletion expectations and note them in the feature spec.

## Before you store any text

- Determine whether the value contains user-authored free text (sentences, paragraphs, prompts, responses).
- If “yes”, it must remain in localStorage unless `DATA_DESIGN.md` explicitly documents an exemption.
- Never write prompts, responses, or summaries into Supabase tables.
- If derived metrics are needed, store only numeric/boolean aggregates (e.g., counts, scores).
- Verify that logs or telemetry do not capure raw message content.

## Before you add a new Supabase query

- Confirm the target table is in the SAFE metadata list and approved by `safeTables.ts`.
- Use the wrapper/helper that enforces safe table names.
- Double-check you are not selecting/inserting any free-text column.
- Add a brief inline comment explaining why this query is needed.
- Ensure all writes are idempotent or guarded to prevent accidental persistence.

## Before you release to production

- Run the CI guard (e.g., `pnpm run check:data`) and resolve any violations.
- Re-read `DATA_DESIGN.md` to confirm the feature still matches the documented storage model.
- Sanity-check application logs and monitoring outputs; no user content should appear in logs or third-party tools.
- Confirm privacy notices or onboarding screens remain accurate if behaviour changed.

## Final reminders

- If it looks like a sentence or paragraph, it almost certainly does **not** belong in Supabase.
- Default to on-device storage whenever feasible, and update `DATA_DESIGN.md` if you introduce new categories.
- Raise concerns early—security review is easier before code merges than after data is collected.


_As of 2025-11-26, TypeScript and data-safety checks pass with zero errors. Supabase schema is metadata-only; all user text is local-only._



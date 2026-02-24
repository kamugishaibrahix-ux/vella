Vella Data Design & Storage Model
=================================

1. Purpose
----------

This document defines how Vella collects, stores, and processes user data across the product. It is the authoritative reference for engineers, compliance reviewers, and stakeholders when evaluating any feature that touches persistence. The core design constraint is simple: **No personal free-text content persists in Supabase; only minimal metadata is allowed in the managed database.** Everything else must remain on the user’s device or flow transiently through AI providers.

2. Data Categories
------------------

| Category                           | Examples                                              | Sensitivity | Storage                         |
|------------------------------------|-------------------------------------------------------|-------------|----------------------------------|
| Personal free-text content         | Chat messages, journals, emotional notes, reflections | HIGH        | Browser/device localStorage only |
| Behavioural / emotional state signals (derived) | Mood scores, stress indexes, numeric traits generated from check-ins | MEDIUM      | LocalStorage primary; numeric metrics may be mirrored in Supabase if required |
| Account metadata                   | User ID, auth session, subscription plan, usage counters | LOW / MEDIUM | Supabase Postgres (restricted tables) |
| Technical telemetry                | Error logs, latency metrics, feature flag exposures   | LOW         | Logging/monitoring tools (no message text permitted) |

3. Storage Locations
--------------------

* **Browser/device localStorage** – Primary storage for every piece of user-authored free text, including conversations, journals, emotional state snapshots, memory maps, and persona cues. Clearing local data removes this content permanently.
* **Supabase Postgres (managed cloud)** – Houses authentication metadata, subscription records, usage counters, non-text preferences, and other strictly scoped metadata. Guard rails prevent arbitrary writes.
* **AI model provider (OpenAI Realtime API)** – Acts as a transient processor for running sessions. Inputs are transmitted securely, processed for responses, and not persisted by Vella.

4. Supabase Usage (Metadata Only)
---------------------------------

**Allowed in Supabase**

* User ID, session identifiers, auth tokens
* Display name, avatar URL/reference
* Subscription plan, status, billing period, token counters (numeric only)
* Booleans/enums/numeric preferences such as notification toggles, language codes, trait scores, progress metrics

**Not Allowed in Supabase**

* Chat transcripts or conversation histories
* Journals, emotional logs, reflections, or any diary-like entries
* Free-text insights, notes, or summarised narratives
* Raw prompts, raw responses, persona instruction bodies, rewritten scripts

5. On-Device Storage (Local Storage)
------------------------------------

Local storage is the authoritative data store for:

* Conversation history (text and derived annotations)
* Journals, emotional logs, reflection notes, and other diary entries
* Memory snapshots, behavioural maps, world-state/context cues, embeddings
* Any free-text authored by the user (names, descriptions, coping plans, etc.)

Deleting local app/browser data wipes this content; it is not backed up or synchronised to the server.

6. Realtime Voice & Text Sessions
---------------------------------

* Each session streams transient text/voice to the AI provider solely for response generation; the provider is configured to avoid training use.
* The application may log derived numeric usage (token counts, stage timers) in Supabase, but never the raw message bodies.
* Guard rails (SAFE-DATA patches) explicitly block the realtime client from writing any free-text payload into Supabase. Violations throw errors in development and halt execution.

7. Data Retention & Deletion
----------------------------

* **On-device**: retention is fully user-controlled. Clearing browser storage or uninstalling the app deletes conversations, journals, and other personal text immediately.
* **Supabase**: retention is limited to metadata required for authentication, subscription management, fraud prevention, and operational metrics. No personal text is present.
* We periodically audit tables and migrations to confirm no free-text columns or JSON blobs have been introduced.

8. Compliance & Audit Practices
-------------------------------

* Code-level guards (SAFE-DATA patches, `fromSafe()` wrappers, forbidden-table scanners) prevent accidental persistence of sensitive data.
* Every feature touching Supabase must undergo manual review to confirm metadata-only storage. The guiding rule: **If it looks like a sentence, it doesn’t belong in Supabase.**
* CI tasks (e.g., `pnpm check:data`) flag forbidden table references and fail builds when new risks appear.

9. Future Changes & Extensions
------------------------------

* Any feature that seeks to store new data in Supabase must update this document and describe the classification, reason, and retention policy.
* The team must justify why the data cannot stay on-device and obtain security review before deployment.
* Changes remain blocked until compliance review confirms the design still meets the metadata-only principle for Supabase.



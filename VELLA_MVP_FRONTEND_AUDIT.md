# Vella MVP Frontend Audit (Read-Only)

**Mode:** STRICT READ-ONLY. No code modified. No refactors or redesigns proposed.  
**Purpose:** Structural clarity for a clean MVP-focused frontend rebuild (English-only, simplified surface).  
**Scope:** MOBILE/app, MOBILE/components, MOBILE/lib (hooks, i18n, theme), journal boundary.

---

## PART 1 — COMPONENT ARCHITECTURE MAP

### 1.1 Page → Dependency Graph

**PAGE: /home**

- **UI components used:** HomeClientPage, AppShell, VellaLogo, PlanStatusCard, TodaysEnergyCard, QuickActionCard, WeeklyInsightCard, PredictionHint, MoodForecastMini.
- **Custom hooks used:** useLocale, useAccountPlan, useRealtimeVellaContext.
- **Direct API calls?** Yes. Home page (home/page.tsx) calls getAuthenticatedUserId() and generateHomeGreeting(id). HomeClientPage contains: supabase.auth.getUser(), listCheckins() (hook → local), requestEmotionalPatterns(), fetchHighlightInsights (internal), fetch("/api/prediction"), fetch("/api/forecast"), fetch("/api/nudge"), fetch("/api/insights/generate").
- **Data fetch location:** Page: greeting + userId. Component (HomeClientPage): checkins, patterns, highlight insights, prediction, forecast, nudge — all in useEffect in component.
- **Logic mixed into component?** Yes. getMoodSummary(), mood/energy/stress derived values, plan resolution, and multiple useEffect data-load blocks live in HomeClientPage.
- **Estimated refactor risk:** High (heavy coupling of data + UI in one component).

**PAGE: /session**

- **UI components used:** AppShell, Card, CompassPulse, ChatPanel, UpgradeGate, VellaLogo, AudioSheet, NowPlayingStrip, VideoVella, EmotionalStateChip, HealthChip, InsightsTray, MonitoringChip, PredictiveAlertList, AlertChip, StrategyChip, AudioLibrarySheet, AITuningInspector (dev).
- **Custom hooks used:** useRouter, useSearchParams, useLocale, useUserSettings, useVellaContext, useAccountPlan, useVellaUnifiedAudioEngine, useRealtimeVella.
- **Direct API calls?** Yes. In session page: fetch("/api/admin/policy"), fetch("/api/vella/text"), fetch("/api/pattern-insight"). Also loadLocal/saveLocal for session.history.
- **Data fetch location:** Page and child components. Session state (history, emotionIntel) in page; realtime via useRealtimeVella; policy and text/pattern APIs called from page or chat flow.
- **Logic mixed into component?** Yes. Format helpers, audio state, conversation handling, and large inline JSX with conditional rendering.
- **Estimated refactor risk:** High (largest page, most hooks and APIs, deep integration with realtime and audio).

**PAGE: /check-in**

- **UI components used:** AppShell, InsightStack, CheckInSliders, EmotionalStateChip, AlertChip, AuroraBloomOverlay.
- **Custom hooks used:** useLocale, useRealtimeVellaContext, useAccountPlan, useUserSettings.
- **Direct API calls?** Yes. supabase.auth.getUser() (none in check-in page; userId from context or elsewhere). listCheckins() (hook). callVellaReflectionAPI(), requestEmotionalPatterns(), fetch("/api/progress"), fetch("/api/insights/generate").
- **Data fetch location:** Component (check-in page). All loading in useEffect; checkins from listCheckins; patterns from requestEmotionalPatterns; insights from /api/insights/generate; reflection from callVellaReflectionAPI.
- **Logic mixed into component?** Yes. Slider state, aurora message building, stoic note logic, save handler with progress/insights calls.
- **Estimated refactor risk:** High (many useEffects and API calls in page component).

**PAGE: /journal**

- **UI components used:** JournalPageClient, AppShell, Button, JournalList, NewJournalEntryModal.
- **Custom hooks used:** useLocale (in client), useRouter (in client). Page is server component; no hooks in page.
- **Direct API calls?** Yes. Server: fetch(baseUrl + "/api/journal") in fetchJournalEntries(). Client: fetch("/api/journal") POST in JournalPageClient handleSubmit.
- **Data fetch location:** Server: journal page fetches from GET /api/journal (returns empty — see Part 6). Client: JournalPageClient submits via POST /api/journal; list comes from server-rendered props (always empty).
- **Logic mixed into component?** Limited in page (server). In JournalPageClient: submit handler and hardcoded error string ("We couldn't save that entry...").
- **Estimated refactor risk:** High (data path broken; must fix data source and optionally simplify to client-only).

**PAGE: /insights**

- **UI components used:** AppShell, InsightStack, EmotionalPatternsCard, JournalThemesCard, LifeThemesCard, MoodForecastCard, BehaviourLoopsCard, CognitiveDistortionsCard, StrengthValuesCard, GrowthRoadmapCard, InsightsTray, EmotionalStateChip, AlertChip.
- **Custom hooks used:** useLocale, useAccountPlan, useRealtimeVellaContext, useUserSettings.
- **Direct API calls?** Yes. supabase.auth.getUser(); listCheckins(); requestEmotionalPatterns(); fetch("/api/insights/generate"); fetch("/api/journal-themes"); fetch("/api/life-themes"); fetch("/api/forecast"); fetch("/api/behaviour-loops"); fetch("/api/cognitive-distortions"); fetch("/api/strengths-values"); fetch("/api/growth-roadmap"); callVellaReflectionAPI().
- **Data fetch location:** Component (insights page). Single large loadInsights() plus multiple useEffects for themes, life-themes, forecast, loops, distortions, identity, roadmap — all in page.
- **Logic mixed into component?** Yes. Many useState slices, derived labels, and API calls spread across useEffects.
- **Estimated refactor risk:** High (most API calls per page; duplicated insight-type loading patterns).

**PAGE: /profile**

- **UI components used:** AppShell, profile-specific UI (display name, sign-in/out).
- **Custom hooks used:** useLocale.
- **Direct API calls?** Yes. loadLocalMemory() (sync); supabase.auth.signInWithOtp(), supabase.auth.signOut() in handlers.
- **Data fetch location:** Component. useEffect loadLocalMemory; auth in event handlers.
- **Logic mixed into component?** Yes. applyProfileUpdate, handleNameChange, handleSignIn, handleSignOut in page.
- **Estimated refactor risk:** Medium (contained but auth and local memory in same component).

**PAGE: /timeline**

- **UI components used:** AppShell, Link, TimelineEntryCard, EmotionalStateChip, AlertChip.
- **Custom hooks used:** useLocale, useAccountPlan, useRealtimeVellaContext, useUserSettings, listCheckins, listJournal (from useJournal or direct listJournal).
- **Direct API calls?** Yes. supabase.auth.getUser(); listCheckins(); listJournal(); requestEmotionalPatterns(); fetch("/api/insights/generate") for entry expansion.
- **Data fetch location:** Component. useEffect for user; checkins and journal from hooks; insights generate on demand.
- **Logic mixed into component?** Yes. describeBehaviourVector(), getCategoryIcon(), truncate(), filter logic, and entry-building in page.
- **Estimated refactor risk:** High (mixed data sources and inline business logic).

---

### 1.2 Logic Placement Audit

| File | Type | Contains Data Fetch? | Contains Business Logic? | Properly Abstracted? |
|------|------|----------------------|--------------------------|------------------------|
| MOBILE/app/home/page.tsx | Page | Yes (getAuthenticatedUserId, generateHomeGreeting) | Minimal | Partial (delegates to HomeClientPage) |
| MOBILE/components/home/HomeClientPage.tsx | Component | Yes (supabase, listCheckins, requestEmotionalPatterns, fetch prediction/forecast/nudge/insights) | Yes (getMoodSummary, derived values) | No |
| MOBILE/app/session/page.tsx | Page | Yes (loadLocal/saveLocal, fetch admin/policy, vella/text, pattern-insight) | Yes (format helpers, conversation handling) | No |
| MOBILE/app/check-in/page.tsx | Page | Yes (listCheckins, requestEmotionalPatterns, callVellaReflectionAPI, fetch progress/insights) | Yes (aurora, stoic, save flow) | No |
| MOBILE/app/journal/page.tsx | Page | Yes (server fetch /api/journal) | No | N/A (server); client receives empty data |
| MOBILE/components/journal/JournalPageClient.tsx | Component | Yes (fetch POST /api/journal) | Minimal (submit handler) | Partial |
| MOBILE/app/insights/page.tsx | Page | Yes (supabase, listCheckins, requestEmotionalPatterns, fetch 8+ APIs) | Yes (many derived states) | No |
| MOBILE/app/profile/page.tsx | Page | Yes (loadLocalMemory, supabase auth) | Yes (applyProfileUpdate, auth handlers) | No |
| MOBILE/app/timeline/page.tsx | Page | Yes (supabase, listCheckins, listJournal, requestEmotionalPatterns, fetch insights) | Yes (describeBehaviourVector, getCategoryIcon, truncate) | No |
| MOBILE/components/clarity/DeepDiveModal.tsx | Component | Yes (fetch /api/deepdive) | Minimal | Partial |
| MOBILE/components/settings/ReportIssueModal.tsx | Component | Yes (fetch /api/reports/create) | Minimal | Partial |
| MOBILE/components/settings/FeedbackModal.tsx | Component | Yes (fetch /api/feedback/create) | Minimal | Partial |
| MOBILE/components/chat/ChatPanel.tsx | Component | Yes (fetch /api/transcribe) | Some (message handling) | Partial |
| MOBILE/components/voice/NowPlayingStrip.tsx | Component | No | Yes (audio state) | Partial |
| MOBILE/lib/hooks/useAccountPlan.ts | Hook | Yes (fetch /api/account/plan) | Yes (plan resolution) | Yes |
| MOBILE/lib/hooks/useUserSettings.ts | Hook | Yes (fetch export/delete) | Yes (settings merge) | Yes |
| MOBILE/lib/hooks/useCheckins.ts | Hook | No (uses local loadCheckins/saveCheckin) | Yes (add/remove/refresh) | Yes |
| MOBILE/lib/hooks/useJournal.ts | Hook | No (uses journalLocal only) | Yes (add/remove/refresh) | Yes |

**Summary:** Data fetch and business logic are frequently inside page or feature components rather than in hooks or server. Home, session, check-in, insights, timeline, and profile all have direct fetch/supabase and logic in the same file. Properly abstracted: useAccountPlan, useUserSettings, useCheckins, useJournal.

---

## PART 2 — NAVIGATION & SURFACE COMPLEXITY AUDIT

**All routes in MOBILE (from app/**/page.tsx):**

| Route | Primary / Secondary / Hidden | Essential to MVP? | Safe to Remove? |
|-------|------------------------------|--------------------|------------------|
| / | Primary (redirect) | Yes | No |
| /home | Primary | Yes | No |
| /session | Primary (Talk) | Yes | No |
| /check-in | Primary | Yes (if MVP = Talk + Journal + Insights + Profile, check-in can be secondary) | Only if Insights don’t depend on it |
| /timeline | Secondary | No (overlaps with Insights + Journal) | Yes |
| /journal | Primary | Yes | No |
| /journal/[id] | Primary | Yes | No |
| /insights | Primary | Yes | No |
| /session-insights | Secondary | No | Yes |
| /profile | Primary | Yes | No |
| /settings/account-plan | Primary (Profile entry) | Yes | No |
| /pricing | Primary (billing) | Yes | No |
| /identity | Secondary | No (insight-type; duplicates Insights) | Yes |
| /regulation | Secondary | No (insight-type) | Yes |
| /growth-roadmap | Secondary | No | Yes |
| /growth-plan | Secondary | No | Yes |
| /forecast-center | Secondary | No (insight-type) | Yes |
| /loops | Secondary | No (insight-type) | Yes |
| /themes | Secondary | No (insight-type) | Yes |
| /distortions | Secondary | No (insight-type) | Yes |
| /connection-index | Secondary | No (insight-type) | Yes |
| /compass-mode | Secondary / experimental | No | Yes |
| /exercises | Secondary | No | Yes |
| /onboarding | Primary (first-run) | Yes | No |
| /onboarding/name … /done | Primary | Yes | No |
| /onboarding/vella | Primary | Yes | No |
| /(site)/privacy | Secondary | No (legal) | Optional |
| /dev/biometric-test | Hidden (dev) | No | Yes (dev only) |

**Duplicates insight data:** identity, regulation, growth-roadmap, growth-plan, forecast-center, loops, themes, distortions, connection-index, session-insights all surface insight-type content that could be consolidated under Insights.  
**Experimental / low-traffic conceptual:** compass-mode, exercises.  
**Not essential to Talk / Reflect / Insight core:** timeline (aggregation view), all standalone insight pages above, session-insights.

**Navigation bloat score (1–10):** 7. Many secondary routes (identity, regulation, growth, forecast, loops, themes, distortions, connection-index, compass, exercises) and timeline; bottom nav is only 5 items but in-app links and entry points multiply surfaces.

---

## PART 3 — i18n AUDIT

- **useTranslation:** Not used. App uses **useLocale()** from `@/i18n/useLocale` (returns `t`, `render`, `lang`, `setLang`).
- **t("..."):** Used throughout; keys are typed as `keyof Messages` (i18n/types.ts). Structure: dot-separated (e.g. "home.title", "checkins.sliders.mood.label", "i18n.auto.*").
- **Translation files:** `i18n/dictionaries/en.ts`, `es.ts`, `fr.ts`, `pt.ts`, `ar.ts`, `ja.ts`. Plus `missing_pt.txt`, `missing_fr.txt`, `en_keys.txt`, `types_keys.txt`.
- **Locale folders:** No locale folders; flat dictionaries per language.
- **Language switcher:** `components/settings/AppLanguageCard.tsx` uses `useLanguageContext()` and `setUiLanguage`; only rendered on settings/account-plan page. No global header switcher.
- **Provider:** `LanguageProvider` in `i18n/providers.tsx` wraps app in `app/layout.tsx`. Detects language from localStorage (`ui_language_v1`) or browser; syncs with Supabase `userSettings.profile?.appLanguage` when available.

**How many languages active:** 6 (en, es, fr, pt, ar, ja) — all in config and dictionaries.

**Hardcoded English strings (estimate):** Dozens. Examples: JournalPageClient `"We couldn't save that entry. Please try again."`; timeline `describeBehaviourVector` returns "warm steady energy", "direct coaching focus", etc.; session and other components have inline strings; Button uses `t()` for loading text but many modals and messages use raw strings.

**Incomplete translations:** `missing_pt.txt`, `missing_fr.txt` indicate missing keys in pt/fr. Fallback in useLocale: `return translation ?? (key as string)` so missing keys show the key or English if key exists in en.

**Architectural issues:** (1) Server components (e.g. journal page) use `getDictionary(locale)` and manual `t(key)`; client uses `useLocale()`. Two code paths. (2) Cookie `vella_locale` is read in journal page but language is primarily driven by LanguageProvider + localStorage. (3) RTL (ar) handled in `render()` with wrapper span. (4) Keys are not always consistent: mix of "i18n.auto.*" and "section.key".

**Clean removal steps to English-only MVP:**  
(1) Keep only `i18n/dictionaries/en.ts` and make `getDictionary`/dictionary loaders always return en.  
(2) Remove or stub `setUiLanguage` / language switcher (hide AppLanguageCard or remove from settings).  
(3) In LanguageProvider, set `uiLanguage` to `"en"` only and skip browser/localStorage language detection.  
(4) Replace all `t(key)` with a simple function that returns en dict value or key.  
(5) Remove or don’t load es, fr, pt, ar, ja dictionaries.  
(6) Audit and replace remaining hardcoded strings with en keys if desired for consistency.

---

## i18n Status

- **Languages detected:** 6 (en, es, fr, pt, ar, ja).
- **Hardcoded strings count (estimate):** 50+ (components and pages with raw English).
- **Incomplete translations:** pt, fr have missing-key files; fallback is key or en.
- **Architectural issues:** Dual server/client i18n path; locale cookie vs provider state; mixed key naming.
- **Clean removal steps:** Single-language loader (en only); fix LanguageProvider to en-only; hide/remove switcher; optionally replace hardcoded strings with en keys.

---

## PART 4 — THEME SYSTEM AUDIT

- **Theme tokenized or hardcoded?** Tokenized. Colours and surfaces use CSS variables (`--mc-bg`, `--mc-card`, `--mc-text`, `--mc-primary`, etc.) in `styles/globals.css`. Tailwind extends theme to reference them (`tailwind.config.ts`: `colors.mc.*`).
- **Uses CSS variables?** Yes. Globals define :root with --mc-* and gradient/shadow vars.
- **Light mode implemented?** No. `:root` only; no `.light` or media query overrides. `app/layout.tsx` has `className="dark"` on `<html>`. color-scheme: dark in globals.
- **Dark mode forced or user-controlled?** Forced dark. No toggle; no light theme.
- **Typography scales:** Not a scale. `globals.css` has `.mctitle`, `.mcsubtitle`, `.mctext`; `tailwind.config` has fontFamily.sans. No type scale (e.g. text-xs through text-4xl) defined as design tokens.
- **Spacing system:** Tailwind default spacing. No custom spacing scale in theme; components use Tailwind spacing (p-4, gap-2, etc.).

**Theme Architecture Status**

- **Tokenized?** Yes.
- **Uses CSS variables?** Yes.
- **Light mode implemented?** No.
- **Design system maturity level:** Partial (tokens for colour/surface; no typography or spacing scale; no light/dark switch).
- **Refactor complexity:** Medium (introduce light mode or new tokens would touch globals + Tailwind + components using --mc-* or raw Tailwind classes).

---

## PART 5 — DESIGN SYSTEM READINESS

| Component | Reusable? | Hardcoded styling? | Multiple variants? | Centralized? |
|-----------|-----------|--------------------|--------------------|--------------|
| Button (components/ui/Button.tsx) | Yes | No (uses --mc-* and variant/size maps) | Yes (primary, secondary, ghost, danger; md, sm) | Yes |
| Card (components/ui/Card.tsx) | Yes | No (CSS vars) | No (single style) | Yes |
| Modal (components/ui/Modal.tsx) | Yes | No (CSS vars) | No | Yes |
| Sheet (components/ui/Sheet.tsx) | Yes | No (CSS vars) | No | Yes |
| No dedicated Input | N/A | N/A | N/A | Inputs are raw `<input>`/`<textarea>` or shadcn-style in components |
| Layout: AppShell | Yes | Uses --mc-* and fixed layout | No variants | Yes (components/layout/AppShell) |
| Layout: BottomNav | Yes | Uses CSS vars | No | Yes |
| AlertChip, EmotionalStateChip, etc. | Yes | Some inline colour classes | Yes (context-specific) | Partially (voice/, ui/) |
| Accordion (components/ui/accordion.tsx) | Yes | Tailwind/shadcn | Yes | Yes |

**Conclusion:** Button, Card, Modal, Sheet, AppShell, BottomNav are centralized and use tokens. No shared Input component; many forms use ad-hoc inputs. Chips and feature components are partially centralized. Introducing a design system would not require rewriting Button/Card/Modal/Sheet/AppShell; would require extracting or standardizing inputs and reducing inline Tailwind in large pages.

---

## PART 6 — JOURNAL ARCHITECTURAL BREAKPOINT

**Where is journal data fetched?**

- **Server (SSR):** `app/journal/page.tsx` calls `fetchJournalEntries()` which does `fetch(baseUrl + "/api/journal", { method: "GET", ... })`. Response is typed `{ entries: EnrichedJournalEntry[] }`. This runs in Node; cookies are forwarded.
- **API handler:** `app/api/journal/route.ts` GET calls `listJournalEntries(userId)`. `listJournalEntries` (lib/journal/server.ts) calls `listLocalJournals(userId)`. `listLocalJournals` (lib/local/journalLocal.ts) calls `loadLocal(JOURNAL_PATH(uid), [])` which uses `readLocalJSON` from safeLocalStore. On the server, `hasWindow()` is false, so `readLocalJSON` returns the fallback `[]`. So the API always returns `{ entries: [] }`.
- **Client (after hydration):** Journal list is only what was passed from server (always []). Creating an entry: JournalPageClient calls `fetch("/api/journal", { method: "POST", body: JSON.stringify({ text: content }) })`. API POST calls `createJournalEntry(userId, text, title, ...)`, which calls `createLocalJournal(userId, ...)`. `createLocalJournal` calls `saveLocal(JOURNAL_PATH(uid), all)`. On the server, `writeLocalJSON` is a no-op (hasWindow() is false), so the new entry is not persisted anywhere. So: **list is always empty; create does not persist on server.**

**Where is it stored?**

- **Intended:** Browser localStorage only (DATA_DESIGN.md; lib/local/journalLocal.ts → safeLocalStore → window.localStorage with namespace `vella_local_v1`, key pattern `journals:{userId}:entries`).
- **Actual:** Only when code runs in the browser. Server-side code path uses the same functions but they no-op or return fallback, so server has no journal data.

**Why does server API return empty?**

- GET: `listJournalEntries` → `listLocalJournals(userId)` → `loadLocal(...)` → `readLocalJSON(..., [])`. In Node, `hasWindow()` is false, so `readLocalJSON` returns fallback `[]`. So the API returns `{ entries: [] }`.
- POST: `createJournalEntry` → `createLocalJournal` → `saveLocal(...)`. In Node, `writeLocalJSON` is a no-op, so nothing is written. The API still returns the “created” entry object (built in memory), but it is not stored.

**Is journal client-only viable without API?**

- **Yes.** `lib/hooks/useJournal.ts` already exposes `listJournal()`, `addJournal()`, `getJournalEntry()`, etc., which call `listLocalJournals`, `createLocalJournal`, etc. Those run in the browser and read/write localStorage. So the client can list, add, update, delete journal entries without calling the API. The API could be used only for “enrichment” (e.g. POST with content, server returns summary/tags/themes) and the client would then write the entry locally with that enrichment — but list and persistence must be client-only for current architecture.

**Refactor difficulty level?**

- **Medium.** (1) Change journal page to a client component that uses `useJournal()` (or equivalent) to read/write localStorage and no longer rely on server-rendered entries. (2) Stop calling GET /api/journal for list; optionally keep POST for enrichment-only and merge result into local entry. (3) Remove or repurpose server-side `listJournalEntries`/create in journal/server.ts for any other callers (e.g. depthEngine, progress, insights use listJournalEntries server-side — those also run in Node and currently get [] from listLocalJournals; if they are only used in API routes that run on server, they would need a different design or client-supplied data). So: journal UI and list/create can be made client-only with moderate refactor; any server-side consumers of journal list need separate handling.

---

## PART 7 — FRONTEND REFACTOR STRATEGY OPTIONS

**Option A — Surface Rebuild Only**  
Replace UI (pages/components) with new layouts and components while keeping existing hooks and API usage.

- **Feasibility: Medium.** Many pages have fetch and business logic in the same file as UI. Replacing “only” the UI would require either leaving that logic in place (tight coupling remains) or moving it into hooks as part of the “surface” change. So surface-only is feasible if the rebuild is limited to visual/structure and you accept current coupling; if you want clean separation, some logic extraction is necessary.

**Option B — Component Isolation First**  
Refactor data and business logic into hooks (or server/data layer), then replace UI.

- **Feasibility: High.** Hooks like useAccountPlan, useCheckins, useJournal already show the pattern. Extracting data-fetch and domain logic from HomeClientPage, session page, check-in, insights, timeline, profile into dedicated hooks would make “then redesign” straightforward. Risk: session and insights have many dependencies; extraction is non-trivial but structurally clear.

**Option C — Full Frontend Re-architecture**  
Rebuild presentation layer from scratch (new pages, new components, new routing).

- **Feasibility: Medium.** APIs, auth, and realtime/session flow are intact. New UI can call same APIs and hooks. Constraint: realtime (useRealtimeVella), VellaProvider, and session page logic are tightly woven; a full rebuild would need to rewire those integration points. Doable with a clear contract (e.g. one session container that consumes useRealtimeVella and exposes minimal props to new UI).

**Cleanest refactor path (from code structure):** Option B. Isolate data and logic into hooks per page/feature, then rebuild surfaces. That reduces risk for Option C later and makes Option A’s “surface only” less tangled.

---

## PART 8 — MVP REDUCTION PLAN

**If MVP is: Talk, Journal, Insights, Profile (and auth + billing + token engine + admin dependencies must stay intact):**

**Routes that can be removed from the visible surface without breaking auth, billing, token engine, or admin:**

- /timeline  
- /session-insights  
- /identity  
- /regulation  
- /growth-roadmap  
- /growth-plan  
- /forecast-center  
- /loops  
- /themes  
- /distortions  
- /connection-index  
- /compass-mode  
- /exercises  
- /(site)/privacy (optional; keep if legal required)  
- /dev/biometric-test  

**Routes to keep for MVP:**

- /, /home, /session (Talk), /journal, /journal/[id], /insights, /profile, /settings/account-plan, /pricing, /onboarding/*.

**Check-in:** If Insights or Talk depend on check-in data (e.g. insights generate from check-ins), then /check-in cannot be removed; it can be de-emphasized or folded into “Reflect” if you merge check-in into one flow with journal. Removing only the **standalone** insight pages (identity, regulation, growth, forecast, loops, themes, distortions, connection-index) and timeline/session-insights/compass/exercises does not break auth, billing, token engine, or admin. Those pages only consume read APIs; removing them removes consumption, not dependencies.

**Immediate MVP reduction candidates (removable routes):**  
/timeline, /session-insights, /identity, /regulation, /growth-roadmap, /growth-plan, /forecast-center, /loops, /themes, /distortions, /connection-index, /compass-mode, /exercises, /dev/biometric-test.

---

## OUTPUT SUMMARY

- **Architecture reality:** Page-level and feature components hold most data fetch and business logic; hooks (useAccountPlan, useCheckins, useJournal, useUserSettings) are the exception. Session, home, check-in, insights, timeline are high-coupling.

- **Coupling risk level:** High for /home, /session, /check-in, /insights, /timeline, /profile; Medium for /profile; High for /journal (broken data path).

- **Navigation bloat score (1–10):** 7.

- **i18n status:** 6 languages; tokenized keys; many hardcoded strings; dual server/client paths; English-only MVP achievable by single-language loader, en-only provider, and removing/switching language switcher.

- **Theme maturity:** Partial (tokenized colours/surfaces; no light mode; no typography/spacing scale).

- **Journal fix complexity:** Medium (switch to client-only list/create via useJournal; optionally keep API for enrichment-only).

- **Cleanest refactor path:** Option B (component isolation first — extract logic into hooks, then rebuild UI).

- **Immediate MVP reduction candidates:** /timeline, /session-insights, /identity, /regulation, /growth-roadmap, /growth-plan, /forecast-center, /loops, /themes, /distortions, /connection-index, /compass-mode, /exercises, /dev/biometric-test. Keep: /, /home, /session, /journal, /journal/[id], /insights, /profile, /settings/account-plan, /pricing, /onboarding/*.

---

*Audit complete. No files were modified. No redesign or patch suggestions.*

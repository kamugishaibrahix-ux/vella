# Phase 4 — I18n Audit Snapshot (English-Only Simplification)

## Guardrails

- Do not remove translation keys.
- Do not hardcode strings everywhere.
- Keep `t()` pattern for consistency.
- Only remove multi-language switching logic.

---

## Step 1 — Language Audit Snapshot

### Languages currently configured

- **supportedLanguages** (i18n/config.ts): `["en", "es", "fr", "pt", "ar", "ja"]`
- **defaultUILanguage**: `"en"`
- **LANGUAGE_LABELS**: en, es, fr, pt, ar, ja display names

### Files under i18n/dictionaries

| File   | Purpose        |
|--------|----------------|
| en.ts  | English (keep) |
| es.ts  | Spanish        |
| fr.ts  | French         |
| pt.ts  | Portuguese     |
| ar.ts  | Arabic         |
| ja.ts  | Japanese       |

Also: i18n/missing_pt.txt, missing_fr.txt, en_keys.txt, types_keys.txt (support files).

### Locale cookie usage

- **Cookie name:** `vella_locale`
- **Usage:**
  - **app/journal/page.tsx:** `cookies().get("vella_locale")?.value` for locale (passed to client; not used for data).
  - **app/distortions/page.tsx, themes, loops, forecast-center, growth-roadmap, regulation, identity:** Server pages use `cookies().get("vella_locale")?.value || "en"` then `getDictionary(locale)`.
  - **i18n/serverLocale.ts:** `resolveServerLocale()` reads `vella_locale` first, then Accept-Language header, then default "en".

### Browser language detection logic

- **i18n/providers.tsx:** `detectBrowserLanguage()`:
  - Reads `window.localStorage.getItem("ui_language_v1")`.
  - Else `window.navigator?.language?.slice(0, 2)` matched against supportedLanguages.
  - Used in `useEffect` to set initial `uiLanguage`.
- **lib/hooks/useUserSettings.ts:** Default profile `appLanguage: navigator.language?.split("-")[0] ?? "en"` when creating/updating profile.

### Server-side getDictionary(locale) calls

| Location                         | Usage |
|----------------------------------|--------|
| app/distortions/page.tsx         | getDictionary(locale), locale from cookie |
| app/themes/page.tsx              | getDictionary(locale), locale from cookie |
| app/loops/page.tsx               | getDictionary(locale), locale from cookie |
| app/forecast-center/page.tsx     | getDictionary(locale), locale from cookie |
| app/growth-roadmap/page.tsx      | getDictionary(locale), locale from cookie |
| app/regulation/page.tsx          | getDictionary(locale), locale from cookie |
| app/identity/page.tsx             | getDictionary(locale), locale from cookie |
| app/api/pattern-insight/route.ts  | getDictionary(targetLanguage), targetLanguage from request or "en" |

### Language switcher components

- **components/settings/AppLanguageCard.tsx:** Renders a `<select>` with en/es/pt/fr/ar/ja; calls `setUiLanguage(next)` and `onChange(next)` (which calls `userSettings.updateAppLanguage(lang)`).
- **app/settings/account-plan/page.tsx:** Renders `<AppLanguageCard value={appLanguageValue} onChange={userSettings.updateAppLanguage} />`.

### setUiLanguage / setLang usage

- **i18n/providers.tsx:** Provides `setUiLanguage` in context; updates state and triggers dictionary reload + localStorage write.
- **i18n/useLocale.ts:** Exposes `setLang: setUiLanguage` in return object.
- **components/settings/AppLanguageCard.tsx:** Calls `setUiLanguage(next)` and `onChange(next)` on select change.
- No other components call `setLang` or `setUiLanguage` (grep result).

---

## Step 5 — Clean Hardcoded Strings Audit (Representative)

Do not fix every string in this phase — only ensure no string is breaking functionality. Below: representative raw strings in JSX or error paths.

| File | Raw String | Critical? | Wrap in t()? |
|------|------------|------------|--------------|
| components/journal/JournalPageClient.tsx | "We couldn't save that entry. Please try again." | Yes (user-facing error) | Yes (add key to en) |
| components/settings/DataPrivacyCard.tsx | "Your plan, tokens... Do you want to reset..." | Yes (confirm dialog) | Optional |
| components/settings/ReportIssueModal.tsx | "Report an Issue", "Let us know...", "Report Sent", "Describe the issue..." | Medium | Optional |
| components/settings/FeedbackModal.tsx | "Give Feedback", "Thank you!", "Your feedback has been submitted." | Medium | Optional |
| components/settings/SupportCard.tsx | "Support", "Help us improve Vella" | Low | Optional |
| components/voice/NowPlayingStrip.tsx | "Now playing" (fallback when t missing) | Low | Already has t() path |
| components/security/* (aria-label) | "Enter digit 0", "Delete last digit" | Low (a11y) | Optional |
| components/dev/AITuningInspector.tsx | "Failed to load tuning", "Unknown error" | Dev-only | No |
| lib/security/rateLimit.ts | "Too many requests. Please try again later." | Yes (API response) | Optional |
| lib/hooks/useSessionOrchestrator.ts | "Something went wrong — I couldn't respond." | Yes (assistant fallback) | Optional |
| lib/hooks/useHomeDashboard.ts | "Home insights are offline right now. Please try again soon." | Yes | Optional |

None of these block English-only or build. Phase 4 does not require changing them; document only.

---

## Post–Phase 4 State (Summary)

- **Provider:** Always `uiLanguage = "en"`; no browser detection; no localStorage language; no Supabase appLanguage override; single dictionary load (en).
- **Dictionary loading:** getDictionary() always returns English; other locale files removed or commented out; no dynamic import of es/fr/pt/ar/ja.
- **Language switcher:** AppLanguageCard removed or hidden from settings; no UI to change language.
- **Server locale:** resolveServerLocale() / getDictionary(locale) can be simplified to always "en" where used (optional in Phase 4; APIs may still accept locale for future use but only en dictionary loaded).

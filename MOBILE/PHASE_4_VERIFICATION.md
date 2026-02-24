# Phase 4 I18n — Verification Checklist

English-only; no language switching; no missing-key fallback to raw key strings.

---

## Manual verification

- [ ] **App renders** — All main routes load (home, journal, timeline, settings, etc.).
- [ ] **No language detection flicker** — UI does not briefly show another language or change after load.
- [ ] **No console warnings about missing translations** — In dev, no `Missing translation key` warnings for normal flows (unless a key is genuinely missing from en).
- [ ] **No undefined translation keys** — No user-visible raw keys (e.g. `"settings.language.title"` as on-screen text); missing keys render as empty string.

---

## Build and static checks

- [ ] **`pnpm run build`** passes (run from `MOBILE/`).
- [ ] **No dynamic import of other dictionaries** — Only `./dictionaries/en` is loaded at runtime (grep or inspect build output for `dictionaries/es`, `dictionaries/fr`, etc., if needed).

---

## Completion criteria

Phase 4 is complete only if:

- App is English-only.
- No language switching logic remains (provider forces "en"; no switcher UI).
- No missing-key fallback to raw key strings (useLocale returns `""` when key missing).
- Build passes.
- Audit (`PHASE_4_I18N_AUDIT.md`) and this verification doc exist.

Do not proceed to Phase 5 until confirmed.

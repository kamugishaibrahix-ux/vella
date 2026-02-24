# Color Override Mapping Report

This report lists all files that use hardcoded colors or Tailwind classes that override the theme variables.

## Summary
- **bg-white opacity classes**: 35+ files
- **bg-black opacity classes**: 9 files  
- **bg-neutral/slate classes**: 3 files
- **Hardcoded hex colors**: 1 file (markdown)
- **Tailwind color gradients**: 3 files

---

## 1. bg-white Opacity Classes Overrides

### MOBILE/app/settings/account-plan/page.tsx
- Line 228: `bg-white/10`
- Line 442: `bg-white/10`
- Line 702: `bg-white/15`
- Line 714: `bg-white/15`

### MOBILE/app/session/page.tsx
- Line 886: `bg-white/10`

### MOBILE/app/connection-index/page.tsx
- Line 371: `bg-white/[0.02]`
- Line 435: `bg-white/[0.02]`

### MOBILE/components/ui/InsightsTray.tsx
- Line 125: `bg-white/5`

### MOBILE/app/growth-plan/page.tsx
- Line 179: `bg-white/5`
- Line 213: `bg-white/5`
- Line 227: `bg-white/5`

### MOBILE/components/voice/NowPlayingStrip.tsx
- Line 127: `bg-white/5`
- Line 154: `bg-white/5`

### MOBILE/components/voice/LiquidVoiceStage.tsx
- Line 104: `bg-white/10`, `bg-white/20` (hover)

### MOBILE/components/voice/InsightsTray.tsx
- Line 34: `bg-white/5`

### MOBILE/components/voice/PredictiveAlertList.tsx
- Line 9: `bg-white/5`

### MOBILE/components/ui/EmotionalDisplay.tsx
- Line 65: `bg-white/[0.02]`
- Line 81: `bg-white/10`

### MOBILE/app/identity/page.tsx
- Line 69: `bg-white/5`

### MOBILE/app/profile/page.tsx
- Line 96: `bg-white/20`

### MOBILE/components/audio/AudioLibrarySheet.tsx
- Line 110: `bg-white/15`
- Line 177: `bg-white/20`
- Line 201: `hover:bg-white/10`

### MOBILE/components/regulation/RegulationStrategyList.tsx
- Line 33: `bg-white/5`

### MOBILE/components/distortions/CognitiveDistortionList.tsx
- Line 18: `bg-white/5`

### MOBILE/components/session-insights/SessionInsightSummary.tsx
- Line 27: `bg-white/5`

### MOBILE/components/session-insights/InsightSection.tsx
- Line 23: `bg-white/5`

### MOBILE/components/growth/RoadmapList.tsx
- Line 27: `bg-white/5`

### MOBILE/components/themes/LifeThemeList.tsx
- Line 22: `bg-white/5`

### MOBILE/components/forecast/WeeklyTrend.tsx
- Line 21: `bg-white/10`
- Line 39: `bg-white/5`

### MOBILE/components/forecast/ShortTermForecast.tsx
- Line 22: `bg-white/10`
- Line 40: `bg-white/5`
- Line 44: `bg-white/5`
- Line 48: `bg-white/5`
- Line 52: `bg-white/5`

### MOBILE/components/loops/BehaviourLoopList.tsx
- Line 15: `bg-white/5`

### MOBILE/app/journal/[id]/page.tsx
- Line 94: `bg-white/5`
- Line 106: `bg-white/5`

### MOBILE/components/insights/GrowthRoadmapCard.tsx
- Line 37: `bg-white/10`

### MOBILE/components/growth/GrowthPlanSection.tsx
- Line 10: `bg-white/5`

### MOBILE/components/insights/StrengthValuesCard.tsx
- Line 33: `bg-white/10`

### MOBILE/components/insights/CognitiveDistortionsCard.tsx
- Line 30: `bg-white/10`

### MOBILE/components/insights/MoodForecastCard.tsx
- Line 41: `bg-white/10`
- Line 72: `bg-white/5`

### MOBILE/components/home/MoodForecastMini.tsx
- Line 29: `bg-white/10`

### MOBILE/components/insights/JournalThemesCard.tsx
- Line 30: `bg-white/10`

### MOBILE/app/compass-mode/page.tsx
- Line 94: `bg-white/5`

### MOBILE/components/ui/Toggle.tsx
- Line 32: `dark:bg-white/20`

### MOBILE/components/clarity/DeepDiveModal.tsx
- Line 76: `bg-white/5`

### MOBILE/components/strategy/StrategyView.tsx
- Line 31: `bg-white/5`
- Line 68: `bg-white/5`

### MOBILE/components/clarity/ClarityCard.tsx
- Line 19: `bg-white/5`

### MOBILE/components/ui/Badge.tsx
- Line 13: `bg-white/5`

---

## 2. bg-black Opacity Classes Overrides

### MOBILE/app/check-in/page.tsx
- Line 478: `bg-black/40`

### MOBILE/app/session/page.tsx
- Line 648: `bg-black/30`
- Line 659: `bg-black/20`
- Line 673: `bg-black/10`
- Line 899: `bg-black/10`, `hover:bg-black/30`
- Line 1120: `bg-black/10`, `hover:bg-black/30`

### MOBILE/components/voice/InsightsTray.tsx
- Line 20: `bg-black/20`

### MOBILE/components/voice/PredictiveAlertList.tsx
- Line 15: `bg-black/20`

### MOBILE/components/ui/EmotionalDisplay.tsx
- Line 76: `bg-black/20`

### MOBILE/components/modals/UpgradeGate.tsx
- Line 42: `bg-black/70`

### MOBILE/app/compass-mode/page.tsx
- Line 44: `bg-black/20`, `hover:bg-black/40`

### MOBILE/components/ui/Toggle.tsx
- Line 32: `bg-black/30`

### MOBILE/components/ui/Modal.tsx
- Line 32: `bg-black/70`

---

## 3. bg-neutral / bg-slate Classes Overrides

### MOBILE/components/settings/VellaSettingsCard.tsx
- Line 112: `bg-neutral-900`

### MOBILE/components/settings/AppLanguageCard.tsx
- Line 36: `bg-neutral-900`

### MOBILE/components/voice/AudioSheet.tsx
- Line 14: `bg-slate-900`

---

## 4. Hardcoded Hex Colors

### MOBILE/voice_realtime_scan.md
- Line 1095: `bg-[#101018]`, `hover:bg-[#161624]`
  - Note: This is a markdown file, not a component

---

## 5. Tailwind Color Gradient Classes

### MOBILE/app/connection-index/page.tsx
- Line 101: `from-pink-400 via-amber-300 to-emerald-300`
- Line 103: `from-pink-400 to-purple-400`
- Line 105: `from-purple-400 to-indigo-400`
- Line 107: `from-indigo-400 to-sky-400`
- Line 109: `from-sky-400 to-slate-400`
- Line 111: `from-slate-500 to-slate-600`
- Line 355: `from-slate-700/50 to-slate-200/80`
- Line 356: `from-pink-500/80 to-amber-300/80`

### MOBILE/components/insights/InsightCard.tsx
- Line 11: `from-rose-500/10 to-transparent`
- Line 13: `from-emerald-400/10 to-transparent`

### MOBILE/components/ui/EmotionalDisplay.tsx
- Line 11: `from-rose-300 to-emerald-300`
- Line 12: `from-sky-300 to-amber-200`
- Line 13: `from-pink-300 to-orange-200`
- Line 14: `from-purple-300 to-red-300`

---

## 6. Gradient Classes Using Theme Variables (These are OK)

These files use gradients with theme variables and should be kept as-is:
- MOBILE/app/settings/account-plan/page.tsx (uses var(--gradient-primary-*))
- MOBILE/app/check-in/page.tsx (uses var(--gradient-primary-*))
- MOBILE/components/home/PlanStatusCard.tsx (uses var(--mc-card))
- MOBILE/app/session/page.tsx (uses var(--gradient-primary-*))
- MOBILE/app/timeline/page.tsx (uses var(--gradient-primary-*))
- MOBILE/components/home/HomeClientPage.tsx (uses var(--gradient-primary-*))
- MOBILE/components/layout/BottomNav.tsx (uses var(--gradient-primary-*))
- MOBILE/app/profile/page.tsx (uses var(--gradient-primary-*))
- MOBILE/app/compass-mode/page.tsx (uses var(--mc-primary-soft))
- MOBILE/components/strategy/StrategyView.tsx (uses var(--mc-primary-soft))
- MOBILE/components/check-in/ConnectionProgressCard.tsx (uses var(--mc-border))

---

## Recommendations

1. **Replace bg-white/5, bg-white/10, bg-white/[0.02]** with:
   - `bg-[color:var(--mc-card)]` for cards
   - `bg-[color:var(--mc-card-soft)]` for elevated surfaces

2. **Replace bg-black/10, bg-black/20, bg-black/30** with:
   - `bg-[color:var(--mc-card)]` for cards
   - `bg-[color:var(--mc-bg)]` for backgrounds
   - `bg-[color:var(--mc-bg-elevated)]` for elevated backgrounds

3. **Replace bg-neutral-900, bg-slate-900** with:
   - `bg-[color:var(--mc-card)]`

4. **Replace Tailwind color gradients** (pink, purple, rose, etc.) with:
   - Theme-based gradients using `var(--gradient-primary-*)` or `var(--mc-primary-*)`

5. **Review connection-index bond level gradients** - These use semantic colors (pink, purple, indigo) that may need special handling for the bond visualization.


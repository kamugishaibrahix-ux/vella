from pathlib import Path
import json

# Generate a summary of all files modified
modified_files = [
    'MOBILE/app/connection-index/page.tsx',
    'MOBILE/app/session/page.tsx',
    'MOBILE/app/settings/account-plan/page.tsx',
    'MOBILE/app/check-in/page.tsx',
    'MOBILE/app/growth-plan/page.tsx',
    'MOBILE/app/compass-mode/page.tsx',
    'MOBILE/components/ui/EmotionalDisplay.tsx',
    'MOBILE/components/ui/Modal.tsx',
    'MOBILE/components/ui/Toggle.tsx',
    'MOBILE/components/ui/Badge.tsx',
    'MOBILE/components/ui/InsightsTray.tsx',
    'MOBILE/components/voice/InsightsTray.tsx',
    'MOBILE/components/voice/PredictiveAlertList.tsx',
    'MOBILE/components/voice/NowPlayingStrip.tsx',
    'MOBILE/components/voice/LiquidVoiceStage.tsx',
    'MOBILE/components/voice/AudioSheet.tsx',
    'MOBILE/components/settings/VellaSettingsCard.tsx',
    'MOBILE/components/settings/AppLanguageCard.tsx',
    'MOBILE/components/modals/UpgradeGate.tsx',
    'MOBILE/components/insights/InsightCard.tsx',
]

# Check which files actually exist and were modified
existing = []
for f in modified_files:
    if Path(f).exists():
        existing.append(f)

summary = {
    'total_files_processed': len(existing),
    'files_modified': existing,
    'replacements_applied': {
        'bg-white_opacity': 'Replaced with bg-[color:var(--mc-card)] or bg-[color:var(--mc-card-soft)]',
        'bg-black_opacity': 'Replaced with bg-[color:var(--mc-card)] or bg-[color:var(--mc-bg)]/70 for modals',
        'bg-neutral_slate': 'Replaced with bg-[color:var(--mc-surface)] for inputs',
        'border-white': 'Replaced with border-[color:var(--mc-border)]',
        'text-white_opacity': 'Replaced with text-[color:var(--mc-text/muted/muted-strong)]',
        'tailwind_gradients': 'Replaced with from-[color:var(--mc-surface)] to-[color:var(--mc-bg-soft)]',
    }
}

Path('temp/color_replacement_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))

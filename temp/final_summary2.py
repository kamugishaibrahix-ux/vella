from pathlib import Path
import json

# Summary of all color replacements made
summary = {
    'MOBILE/components/ui/StrategyChip.tsx': {
        'replacements': [
            'border-sky-400/50 bg-sky-500/15  border-[color:var(--mc-primary)]/50 bg-[color:var(--mc-primary-soft)]',
            'border-violet-400/50 bg-violet-500/15  border-[color:var(--mc-primary)]/50 bg-[color:var(--mc-primary-soft)]',
            'border-amber-400/50 bg-amber-500/15  border-[color:var(--mc-primary)]/50 bg-[color:var(--mc-primary-soft)]',
            'border-indigo-400/50 bg-indigo-500/15  border-[color:var(--mc-primary)]/50 bg-[color:var(--mc-primary-soft)]',
            'border-pink-400/50 bg-pink-500/15  border-[color:var(--mc-primary)]/50 bg-[color:var(--mc-primary-soft)]',
            'border-rose-400/50 bg-rose-500/15  border-[color:var(--mc-primary)]/50 bg-[color:var(--mc-primary-soft)]',
            'text-sky-100, text-violet-100, etc.  text-[color:var(--mc-text)]',
            'text-sky-200, text-violet-200, etc.  text-[color:var(--mc-accent)]',
            'border-white/30 bg-white/10 text-white/80  border-[color:var(--mc-border)] bg-[color:var(--mc-card)] text-[color:var(--mc-muted)]',
        ]
    },
    'MOBILE/components/ui/Sheet.tsx': {
        'replacements': [
            'bg-black/60  bg-[color:var(--mc-bg)]/60',
            'border-white/20  border-[color:var(--mc-border)]',
            'bg-black/10  bg-[color:var(--mc-card)]',
            'text-white  text-[color:var(--mc-text)]',
            'hover:bg-black/30  hover:bg-[color:var(--mc-card-soft)]',
            'bg-white/15  bg-[color:var(--mc-border-soft)]',
        ]
    },
    'MOBILE/app/insights/page.tsx': {
        'replacements': [
            'border-white/15  border-[color:var(--mc-border)]',
            'text-white/70  text-[color:var(--mc-muted)]',
            'border-white/10  border-[color:var(--mc-border)]',
            'bg-white/5  bg-[color:var(--mc-card)]',
            'text-white/40  text-[color:var(--mc-muted-strong)]',
            'text-white/90  text-[color:var(--mc-text)]',
        ]
    },
    'MOBILE/app/pricing/page.tsx': {
        'replacements': [
            'border-white/10  border-[color:var(--mc-border)]',
            'bg-white/10  bg-[color:var(--mc-card-soft)]',
            'text-white/80  text-[color:var(--mc-muted)]',
        ]
    },
    'MOBILE/components/insights/EmotionalPatternsCard.tsx': {
        'replacements': [
            'bg-white/10  bg-[color:var(--mc-card)]',
            'text-rose-300  text-[color:var(--mc-danger)]',
        ]
    },
    'MOBILE/components/insights/BehaviourLoopsCard.tsx': {
        'replacements': [
            'bg-white/10  bg-[color:var(--mc-card)]',
            'text-rose-300  text-[color:var(--mc-danger)]',
        ]
    },
    'MOBILE/components/insights/LifeThemesCard.tsx': {
        'replacements': [
            'bg-white/10  bg-[color:var(--mc-card)]',
            'text-rose-300  text-[color:var(--mc-danger)]',
        ]
    },
    'MOBILE/components/ui/AlertChip.tsx': {
        'replacements': [
            'border-white/20  border-[color:var(--mc-border)]',
            'bg-black/20  bg-[color:var(--mc-card)]',
        ]
    },
    'MOBILE/app/settings/page.tsx': {
        'replacements': [
            'bg-neutral-900  bg-[color:var(--mc-card)]',
            'text-white  text-[color:var(--mc-text)]',
        ]
    },
    'MOBILE/components/settings/DataPrivacyCard.tsx': {
        'replacements': [
            'border-white/5  border-[color:var(--mc-border-soft)]',
            'border-white/15  border-[color:var(--mc-border)]',
        ]
    },
    'MOBILE/components/ui/Button.tsx': {
        'replacements': [
            'text-white  text-[color:var(--mc-text)] (2x in primary and danger variants)',
        ]
    },
    'MOBILE/components/chat/ChatPanel.tsx': {
        'replacements': [
            'text-white  text-[color:var(--mc-text)]',
        ]
    },
}

Path('temp/color_refactor_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(f'Color refactoring complete. Modified {len(summary)} files.')
print(json.dumps(summary, indent=2))

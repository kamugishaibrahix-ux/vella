from pathlib import Path
import json

# Comprehensive list of all files modified with color replacements
summary = {
    'MOBILE/app/connection-index/page.tsx': {
        'replacements': [
            'bg-[#050509]  bg-[color:var(--mc-bg)] (2x)',
            'text-white  text-[color:var(--mc-text)]',
            'bg-white/[0.02]  bg-[color:var(--mc-card)] (5x)',
            'border-white/10  border-[color:var(--mc-border)] (4x)',
            'border-white/15  border-[color:var(--mc-border)] (2x)',
            'text-white/80  text-[color:var(--mc-muted)] (2x)',
            'text-white/70  text-[color:var(--mc-muted)]',
            'text-white/60  text-[color:var(--mc-muted)]',
            'text-white/45  text-[color:var(--mc-muted-strong)] (3x)',
            'text-white/40  text-[color:var(--mc-muted-strong)]',
            'text-white/55  text-[color:var(--mc-muted)]',
            'bg-black/30  bg-[color:var(--mc-card)]',
            'hover:bg-white/5  hover:bg-[color:var(--mc-card)]',
            'hover:bg-white/10  hover:bg-[color:var(--mc-card-soft)]',
        ]
    },
    'MOBILE/app/session/page.tsx': {
        'replacements': [
            'from-[#050411] via-[#090726] to-[#1d0d44]  bg-[var(--page-gradient)]',
            'bg-[#05040A]  bg-[color:var(--mc-bg)]',
        ]
    },
    'MOBILE/app/layout.tsx': {
        'replacements': [
            'bg-[color:var(--mc-bg)]  bg-[var(--page-gradient)]',
        ]
    },
    'MOBILE/app/check-in/page.tsx': {
        'replacements': [
            'from-[#ffb347] to-[#ff7095]  from-[color:var(--mc-accent)] to-[color:var(--mc-accent-soft)]',
            'from-[#f88ba0] to-[#ff5f6d]  from-[color:var(--mc-accent)] to-[color:var(--mc-accent-soft)]',
        ]
    },
    'MOBILE/components/home/QuickActionCard.tsx': {
        'replacements': [
            'bg-[#1d1d1d]  bg-[color:var(--mc-card)] (2x)',
            'hover:bg-[#252525]  hover:bg-[color:var(--mc-card-soft)] (2x)',
            'border-white/10  border-[color:var(--mc-border)] (2x)',
            'text-white  text-[color:var(--mc-text)] (2x)',
            'bg-black/80  bg-[color:var(--mc-card-soft)]',
            'text-white/70  text-[color:var(--mc-muted)]',
            'shadow-[0_0_25px_rgba(255,122,203,0.45)]  shadow-[0_0_25px_var(--shadow-primary-strong)]',
            'shadow-[0_0_18px_rgba(138,92,246,0.35)]  shadow-[0_0_18px_var(--shadow-primary-medium)]',
            'shadow-[0_0_12px_rgba(100,116,139,0.35)]  shadow-[0_0_12px_var(--shadow-primary-soft)]',
            'drop-shadow-[0_0_10px_rgba(255,192,203,0.35)]  drop-shadow-[0_0_10px_var(--shadow-primary-soft)]',
        ]
    },
    'MOBILE/components/home/PlanStatusCard.tsx': {
        'replacements': [
            'from-[#1d2434] via-[#1f2f46] to-[#1b1f3a]  from-[color:var(--mc-card)] via-[color:var(--mc-card-soft)] to-[color:var(--mc-card)]',
            'border-white/10  border-[color:var(--mc-border)]',
            'text-white  text-[color:var(--mc-text)]',
            'bg-white/15  bg-[color:var(--mc-card-soft)]',
            'text-white/70  text-[color:var(--mc-muted)]',
            'shadow-[0_25px_65px_rgba(50,80,130,0.35)]  shadow-[0_25px_65px_var(--shadow-primary-medium)]',
        ]
    },
    'MOBILE/components/check-in/ConnectionProgressCard.tsx': {
        'replacements': [
            'text-[#ff7acb]  text-[color:var(--mc-accent)]',
            'from-[#ff7acb]/60 to-[#ffd27f]/80  from-[color:var(--mc-accent)]/60 to-[color:var(--mc-accent-soft)]/80',
            'shadow-[0_0_15px_rgba(255,122,203,0.35)]  shadow-[0_0_15px_var(--shadow-primary-soft)]',
        ]
    },
    'MOBILE/components/voice/MonitoringChip.tsx': {
        'replacements': [
            'border-white/10  border-[color:var(--mc-border)]',
            'bg-white/5  bg-[color:var(--mc-card)]',
            'text-white/40  text-[color:var(--mc-muted-strong)]',
            'border-white/15  border-[color:var(--mc-border)]',
            'bg-white/5  bg-[color:var(--mc-card)]',
            'text-white/80  text-[color:var(--mc-text)]',
            'text-white/60  text-[color:var(--mc-muted)]',
            'text-white/70  text-[color:var(--mc-muted)]',
        ]
    },
    'MOBILE/components/voice/EmotionalStateChip.tsx': {
        'replacements': [
            'bg-black/20  bg-[color:var(--mc-card)]',
            'text-white/80  text-[color:var(--mc-text)]',
            'text-white/70  text-[color:var(--mc-muted)]',
            'text-white/50  text-[color:var(--mc-muted-strong)]',
            'text-white  text-[color:var(--mc-text)] (5x)',
        ]
    },
    'MOBILE/components/voice/HealthChip.tsx': {
        'replacements': [
            'border-white/15  border-[color:var(--mc-border)]',
            'bg-white/5  bg-[color:var(--mc-card)]',
            'text-white/80  text-[color:var(--mc-text)]',
            'text-white/60  text-[color:var(--mc-muted)]',
            'text-white/70  text-[color:var(--mc-muted)]',
            'bg-white/10  bg-[color:var(--mc-card-soft)] (3x)',
        ]
    },
    'MOBILE/components/settings/PlanSwitcherModal.tsx': {
        'replacements': [
            'bg-black/60  bg-[color:var(--mc-bg)]/60',
            'border-white/15  border-[color:var(--mc-border)] (2x)',
            'border-white/10  border-[color:var(--mc-border)]',
            'bg-white/[0.02]  bg-[color:var(--mc-card)]',
            'text-white/80  text-[color:var(--mc-muted)]',
            'border-white/60  border-[color:var(--mc-border)]',
            'bg-white/10  bg-[color:var(--mc-card-soft)]',
            'text-white  text-[color:var(--mc-text)] (2x)',
            'text-white/70  text-[color:var(--mc-muted)] (2x)',
            'bg-white/15  bg-[color:var(--mc-card-soft)]',
            'bg-white/70  bg-[color:var(--mc-card-soft)]',
        ]
    },
}

Path('temp/color_replacement_diffs.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))

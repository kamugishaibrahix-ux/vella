import re
from pathlib import Path
from collections import defaultdict

root = Path('MOBILE')
skip_dirs = {'.git', 'node_modules', '.next', '.turbo', '.cache', 'dist', 'build', 'temp'}
skip_files = {'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'globals.css'}

# Track what was replaced
replacements_made = defaultdict(list)

# Known replacements
known_replacements = {
    'bg-[#050509]': 'bg-[color:var(--mc-bg)]',
    'bg-[#050411]': 'bg-[var(--page-gradient)]',
    'bg-[#05040A]': 'bg-[color:var(--mc-bg)]',
    'bg-[#1d1d1d]': 'bg-[color:var(--mc-card)]',
    'bg-[#252525]': 'bg-[color:var(--mc-card-soft)]',
    'bg-white/[0.02]': 'bg-[color:var(--mc-card)]',
    'bg-white/5': 'bg-[color:var(--mc-card)]',
    'bg-white/10': 'bg-[color:var(--mc-card-soft)]',
    'bg-black/20': 'bg-[color:var(--mc-card)]',
    'text-white/80': 'text-[color:var(--mc-text)]',
    'text-white/70': 'text-[color:var(--mc-muted)]',
    'text-white/60': 'text-[color:var(--mc-muted)]',
    'text-white/45': 'text-[color:var(--mc-muted-strong)]',
    'border-white/10': 'border-[color:var(--mc-border)]',
    'border-white/15': 'border-[color:var(--mc-border)]',
    'border-white/20': 'border-[color:var(--mc-border)]',
    '#ff7acb': 'var(--mc-accent)',
    '#866cff': 'var(--mc-accent)',
    '#a48cff': 'var(--mc-primary)',
    '#d2c7ff': 'var(--mc-primary-soft)',
    '#c7b5ff': 'var(--mc-accent-soft)',
    '#d9534f': 'var(--mc-danger)',
    '#3bb273': 'var(--mc-success)',
}

# Scan files for these patterns
for path in root.rglob('*.{tsx,ts}'):
    if any(part in skip_dirs for part in path.parts):
        continue
    if path.name in skip_files:
        continue
    try:
        text = path.read_text(encoding='utf-8')
        rel_path = str(path.relative_to(root))
        for old, new in known_replacements.items():
            if old in text:
                count = text.count(old)
                replacements_made[rel_path].append(f'{old}  {new} ({count}x)')
    except Exception:
        continue

# Generate summary
summary = []
for file, changes in sorted(replacements_made.items()):
    summary.append(f'\n{file}:')
    for change in changes[:5]:  # Limit to 5 per file
        summary.append(f'  - {change}')
    if len(changes) > 5:
        summary.append(f'  ... and {len(changes) - 5} more')

print(f'Files with color replacements: {len(replacements_made)}')
print(''.join(summary[:500]))  # Limit output

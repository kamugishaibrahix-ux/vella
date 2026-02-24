import re
from pathlib import Path
from collections import defaultdict

root = Path('MOBILE')
skip_dirs = {'.git', 'node_modules', '.next', '.turbo', '.cache', 'dist', 'build', 'temp'}
skip_files = {'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'globals.css'}

# More comprehensive replacements
replacements = [
    # Background patterns
    (r'bg-white/\[0\.02\]', 'bg-[color:var(--mc-card)]'),
    (r'bg-white/5', 'bg-[color:var(--mc-card)]'),
    (r'bg-white/10', 'bg-[color:var(--mc-card-soft)]'),
    (r'bg-white/15', 'bg-[color:var(--mc-card-soft)]'),
    (r'bg-white/20', 'bg-[color:var(--mc-card-soft)]'),
    (r'bg-white/30', 'bg-[color:var(--mc-card-soft)]'),
    (r'bg-white/70', 'bg-[color:var(--mc-card-soft)]'),
    (r'bg-black/10', 'bg-[color:var(--mc-card)]'),
    (r'bg-black/20', 'bg-[color:var(--mc-card)]'),
    (r'bg-black/25', 'bg-[color:var(--mc-card)]'),
    (r'bg-black/30', 'bg-[color:var(--mc-card)]'),
    (r'bg-black/40', 'bg-[color:var(--mc-card)]'),
    (r'bg-black/60', 'bg-[color:var(--mc-bg)]/60'),
    (r'bg-black/70', 'bg-[color:var(--mc-bg)]/70'),
    (r'bg-black/80', 'bg-[color:var(--mc-card-soft)]'),
    # Text patterns
    (r'text-white"', 'text-[color:var(--mc-text)]"'),
    (r'text-white ', 'text-[color:var(--mc-text)] '),
    (r'text-white/', 'text-[color:var(--mc-text)]/'),
    (r'text-white/80', 'text-[color:var(--mc-text)]'),
    (r'text-white/70', 'text-[color:var(--mc-muted)]'),
    (r'text-white/60', 'text-[color:var(--mc-muted)]'),
    (r'text-white/55', 'text-[color:var(--mc-muted)]'),
    (r'text-white/50', 'text-[color:var(--mc-muted-strong)]'),
    (r'text-white/45', 'text-[color:var(--mc-muted-strong)]'),
    (r'text-white/40', 'text-[color:var(--mc-muted-strong)]'),
    (r'text-white/65', 'text-[color:var(--mc-muted)]'),
    (r'text-white/85', 'text-[color:var(--mc-text)]'),
    (r'text-white/90', 'text-[color:var(--mc-text)]'),
    # Border patterns
    (r'border-white/5', 'border-[color:var(--mc-border)]'),
    (r'border-white/10', 'border-[color:var(--mc-border)]'),
    (r'border-white/15', 'border-[color:var(--mc-border)]'),
    (r'border-white/20', 'border-[color:var(--mc-border)]'),
    (r'border-white/30', 'border-[color:var(--mc-border)]/60'),
    (r'border-white/40', 'border-[color:var(--mc-border)]/70'),
    (r'border-white/60', 'border-[color:var(--mc-border)]'),
    # Hex colors
    (r'#ff7acb', 'var(--mc-accent)'),
    (r'#866cff', 'var(--mc-accent)'),
    (r'#a48cff', 'var(--mc-primary)'),
    (r'#d2c7ff', 'var(--mc-primary-soft)'),
    (r'#c7b5ff', 'var(--mc-accent-soft)'),
    (r'#d9534f', 'var(--mc-danger)'),
    (r'#3bb273', 'var(--mc-success)'),
]

files_modified = defaultdict(list)
for path in root.rglob('*.{tsx,ts}'):
    if any(part in skip_dirs for part in path.parts):
        continue
    if path.name in skip_files:
        continue
    try:
        text = path.read_text(encoding='utf-8')
        original = text
        for pattern, replacement in replacements:
            new_text = re.sub(pattern, replacement, text)
            if new_text != text:
                files_modified[str(path)].append((pattern, replacement))
                text = new_text
        if text != original:
            path.write_text(text, encoding='utf-8')
    except Exception:
        continue

print(f'Modified {len(files_modified)} files')
for f, changes in sorted(files_modified.items())[:10]:
    print(f'{f}: {len(changes)} replacements')

import re
from pathlib import Path

replacements = [
    (r'bg-white/\[0\.02\]', 'bg-[color:var(--mc-card)]'),
    (r'bg-white/5', 'bg-[color:var(--mc-card)]'),
    (r'bg-white/10', 'bg-[color:var(--mc-card-soft)]'),
    (r'bg-black/20', 'bg-[color:var(--mc-card)]'),
    (r'bg-black/30', 'bg-[color:var(--mc-card)]'),
    (r'bg-black/60', 'bg-[color:var(--mc-bg)]/60'),
    (r'bg-black/70', 'bg-[color:var(--mc-bg)]/70'),
    (r'bg-black/80', 'bg-[color:var(--mc-card-soft)]'),
    (r'text-white/80', 'text-[color:var(--mc-text)]'),
    (r'text-white/70', 'text-[color:var(--mc-muted)]'),
    (r'text-white/60', 'text-[color:var(--mc-muted)]'),
    (r'text-white/45', 'text-[color:var(--mc-muted-strong)]'),
    (r'text-white/40', 'text-[color:var(--mc-muted-strong)]'),
    (r'text-white/50', 'text-[color:var(--mc-muted-strong)]'),
    (r'text-white/55', 'text-[color:var(--mc-muted)]'),
    (r'border-white/10', 'border-[color:var(--mc-border)]'),
    (r'border-white/15', 'border-[color:var(--mc-border)]'),
    (r'border-white/20', 'border-[color:var(--mc-border)]'),
    (r'border-white/30', 'border-[color:var(--mc-border)]/60'),
    (r'border-white/40', 'border-[color:var(--mc-border)]/70'),
    (r'border-white/60', 'border-[color:var(--mc-border)]'),
    (r'#ff7acb', 'var(--mc-accent)'),
    (r'#866cff', 'var(--mc-accent)'),
    (r'#a48cff', 'var(--mc-primary)'),
    (r'#d2c7ff', 'var(--mc-primary-soft)'),
    (r'#c7b5ff', 'var(--mc-accent-soft)'),
    (r'#d9534f', 'var(--mc-danger)'),
    (r'#3bb273', 'var(--mc-success)'),
]

root = Path('MOBILE')
skip_dirs = {'.git', 'node_modules', '.next', '.turbo', '.cache', 'dist', 'build', 'temp'}
skip_files = {'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'globals.css'}

files_modified = []
for path in root.rglob('*.{tsx,ts}'):
    if any(part in skip_dirs for part in path.parts):
        continue
    if path.name in skip_files:
        continue
    try:
        text = path.read_text(encoding='utf-8')
        original = text
        for pattern, replacement in replacements:
            text = re.sub(pattern, replacement, text)
        if text != original:
            path.write_text(text, encoding='utf-8')
            files_modified.append(str(path))
    except Exception:
        continue

print(f'Modified {len(files_modified)} files')

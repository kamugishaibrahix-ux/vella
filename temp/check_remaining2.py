import re
from pathlib import Path
from collections import defaultdict

root = Path('MOBILE')
skip_dirs = {'.git', 'node_modules', '.next', '.turbo', '.cache', 'dist', 'build', 'temp', 'voice_realtime_scan.md'}
skip_files = {'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'globals.css'}

# Find remaining patterns
patterns = {
    'bg-white_opacity': r'bg-white/(\[0\.02\]|5|10|15|20)',
    'bg-black_opacity': r'bg-black/(10|20|30|40|60|70|80)',
    'border-white': r'border-white/(5|10|15|20|30|40)',
    'text-white_opacity': r'text-white/(40|45|50|55|60|70|80|90)',
    'text-white_plain': r'text-white[^/]',
    'bg-neutral': r'bg-neutral-900',
    'bg-slate': r'bg-slate-900',
}

found = defaultdict(list)
for path in root.rglob('*.{tsx,ts}'):
    if any(part in skip_dirs for part in path.parts):
        continue
    if path.name in skip_files:
        continue
    try:
        text = path.read_text(encoding='utf-8')
        for name, pattern in patterns.items():
            matches = list(re.finditer(pattern, text))
            if matches:
                found[str(path.relative_to(root))].append((name, len(matches)))
    except Exception:
        continue

if found:
    print(f'Found {len(found)} files with remaining hardcoded colors:')
    for f, items in sorted(found.items())[:20]:
        print(f'{f}: {dict(items)}')
else:
    print('No remaining hardcoded colors found')

import re
from pathlib import Path
from collections import defaultdict

root = Path('MOBILE')
skip_dirs = {'.git', 'node_modules', '.next', '.turbo', '.cache', 'dist', 'build', 'temp'}
skip_files = {'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'globals.css'}

# Find remaining hardcoded colors
patterns = {
    'hex_bg': r'bg-\[#(050509|050411|05040A|090726|1d0d44|1d1d1d|252525)\]',
    'hex_text': r'text-\[#(ff7acb|866cff|a48cff|d2c7ff|c7b5ff|d9534f|3bb273)\]',
    'white_opacity': r'(bg|text|border)-white/(\[0\.02\]|5|10|15|20|30|40|45|50|55|60|70|80)',
    'black_opacity': r'bg-black/(10|20|25|30|40|60|70|80)',
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
            matches = re.findall(pattern, text)
            if matches:
                found[str(path)].extend([(name, m) for m in matches[:3]])
    except Exception:
        continue

if found:
    print(f'Found {len(found)} files with remaining hardcoded colors:')
    for f, items in sorted(found.items())[:15]:
        print(f'{f}: {len(items)} instances')
else:
    print('No remaining hardcoded colors found')

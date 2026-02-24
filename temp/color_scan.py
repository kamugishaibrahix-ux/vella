import os, re, json
from pathlib import Path
from collections import defaultdict
root = Path('MOBILE')
skip_dirs = {'.git','node_modules','.next','.turbo','.cache','dist','build'}
skip_files = {'pnpm-lock.yaml','package-lock.json','yarn.lock'}
patterns = {
    'hex': re.compile(r'#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})'),
    'rgba': re.compile(r'rgba?\([^\)]*\)'),
    'hsl': re.compile(r'hsla?\([^\)]*\)'),
    'utility': re.compile(r'\b(?:bg|text|border|from|to|via|shadow|outline|ring|stroke|fill|divide|accent|caret|placeholder|decoration|underline|overline|drop-shadow|backdrop)-[a-zA-Z\[\]:0-9_./%()-]+'),
    'var': re.compile(r'var\(--[^)]+\)'),
    'gradient': re.compile(r'(?:linear|radial)-gradient\([^\)]*\)'),
}
box_shadow_re = re.compile(r'shadow-\[[^\]]+\]')
css_var_def_re = re.compile(r'--[a-zA-Z0-9_-]+\s*:\s*[^;]+;')
results = defaultdict(lambda: defaultdict(lambda: {'count':0,'files':[]}))
box_shadows = defaultdict(list)
var_defs = {}
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in skip_dirs]
    for name in filenames:
        if name in skip_files:
            continue
        path = Path(dirpath) / name
        try:
            text = path.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        rel = path.as_posix()
        lines = text.splitlines()
        for idx, line in enumerate(lines,1):
            stripped = line.strip()
            for kind, regex in patterns.items():
                for match in regex.finditer(line):
                    val = match.group(0)
                    entry = results[kind][val]
                    entry['count'] += 1
                    if len(entry['files'])<5:
                        entry['files'].append({'file': rel, 'line': idx, 'context': stripped})
            for match in box_shadow_re.finditer(line):
                val = match.group(0)
                arr = box_shadows[val]
                if len(arr)<5:
                    arr.append({'file': rel, 'line': idx, 'context': stripped})
            for match in css_var_def_re.finditer(line):
                name = match.group(0).split(':',1)[0].strip()
                val = match.group(0).strip()
                entry = var_defs.setdefault(name, [])
                if len(entry)<3:
                    entry.append({'file': rel, 'line': idx, 'context': val})
output = {'colors': {k: v for k,v in results.items()}, 'box_shadows': box_shadows, 'var_defs': var_defs}
Path('temp/color_scan.json').write_text(json.dumps(output, indent=2), encoding='utf-8')

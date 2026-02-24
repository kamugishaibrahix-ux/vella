import json
from pathlib import Path

data = json.loads(Path('temp/color_scan.json').read_text())
role_sets = {
    'card_colors': set(),
    'background_colors': set(),
    'border_colors': set(),
    'text_colors': set(),
    'accent_colors': set(),
    'danger_colors': set(),
    'success_colors': set(),
}

def classify_usage(context: str) -> str:
    c = context.lower()
    if 'shadow' in c or 'shadow-' in c:
        return 'shadow'
    if 'bg-gradient' in c or 'gradient' in c or 'from[' in c or 'to[' in c or 'via[' in c:
        return 'gradient'
    if 'card' in c:
        return 'card'
    if 'bg-' in c or 'bg[' in c or 'background' in c or 'class="bg' in c:
        return 'background'
    if 'border' in c:
        return 'border'
    if 'text-' in c or 'text[' in c or 'color:' in c:
        return 'text'
    if 'accent' in c:
        return 'accent'
    return 'general'

def assign_roles(value: str, usage: str, context: str):
    c = context.lower()
    if usage == 'card' or 'card' in c:
        role_sets['card_colors'].add(value)
    if usage in {'background','card'} or 'bg[' in c or 'bg-' in c or 'background' in c:
        role_sets['background_colors'].add(value)
    if usage == 'border' or 'border' in c:
        role_sets['border_colors'].add(value)
    if usage == 'text' or 'text-' in c or 'text[' in c or 'color:' in c:
        role_sets['text_colors'].add(value)
    if 'danger' in value or 'danger' in c or value in {'#d9534f','var(--mc-danger)','text-[color:var(--mc-danger)]','text-[color:var(--mc-danger,#ff7b7b)]'}:
        role_sets['danger_colors'].add(value)
    if 'success' in value or value in {'#3bb273','var(--mc-success)'}:
        role_sets['success_colors'].add(value)
    accent_values = {'var(--mc-primary)','var(--mc-primary-soft)','var(--mc-primary-dark)','var(--mc-primary-glow)','var(--mc-accent)','var(--mc-accent-soft)','text-[color:var(--mc-accent)]','bg-[color:var(--mc-accent)]','#ff7acb','#ffd27f','#ffb347','#ff7095','#f88ba0','#ff5f6d'}
    if usage == 'accent' or 'accent' in c or value in accent_values:
        role_sets['accent_colors'].add(value)


def build_entries(entries, file_limit=2):
    result = []
    for value, info in sorted(entries.items(), key=lambda kv: (-kv[1]['count'], kv[0])):
        file_refs = []
        for file_info in info['files'][:file_limit]:
            usage = classify_usage(file_info['context'])
            assign_roles(value, usage, file_info['context'])
            file_refs.append(f"{file_info['file']}:{file_info['line']}:{usage}")
        result.append({
            'value': value,
            'frequency': info['count'],
            'files': file_refs,
        })
    return result

colors_found = []
for bucket in ('var','hex','rgba'):
    if bucket in data['colors']:
        colors_found.extend(build_entries(data['colors'][bucket]))

tailwind_utilities = []
if 'utility' in data['colors']:
    tailwind_utilities = build_entries(data['colors']['utility'], file_limit=1)

gradient_colors = []
for value, info in sorted(data['colors'].get('gradient', {}).items(), key=lambda kv: (-kv[1]['count'], kv[0])):
    refs = [f"{f['file']}:{f['line']}:{classify_usage(f['context'])}" for f in info['files'][:2]]
    gradient_colors.append({
        'value': value,
        'frequency': info['count'],
        'files': refs,
    })

shadow_colors = []
for value, files in data['box_shadows'].items():
    refs = [f"{f['file']}:{f['line']}:{classify_usage(f['context'])}" for f in files[:2]]
    shadow_colors.append({
        'value': value,
        'files': refs,
    })

css_variables = []
for name, defs in sorted(data['var_defs'].items()):
    refs = [f"{d['file']}:{d['line']}:{d['context']}" for d in defs[:2]]
    css_variables.append({
        'variable': name,
        'definitions': refs,
    })

tailwind_tokens = [
    {'token': 'mc.bg.DEFAULT', 'value': 'var(--mc-bg)'},
    {'token': 'mc.bg.soft', 'value': 'var(--mc-bg-soft)'},
    {'token': 'mc.bg.deep', 'value': 'var(--mc-bg-elevated)'},
    {'token': 'mc.card', 'value': 'var(--mc-card)'},
    {'token': 'mc.card2', 'value': 'var(--mc-card-soft)'},
    {'token': 'mc.border', 'value': 'var(--mc-border)'},
    {'token': 'mc.borderSoft', 'value': 'var(--mc-border-soft)'},
    {'token': 'mc.text.DEFAULT', 'value': 'var(--mc-text)'},
    {'token': 'mc.text.muted', 'value': 'var(--mc-muted)'},
    {'token': 'mc.text.subtle', 'value': 'var(--mc-muted-strong)'},
    {'token': 'mc.primary.DEFAULT', 'value': 'var(--mc-primary)'},
    {'token': 'mc.primary.glow', 'value': 'var(--mc-primary-glow)'},
    {'token': 'mc.primary.soft', 'value': 'var(--mc-primary-soft)'},
    {'token': 'mc.primary.dark', 'value': 'var(--mc-primary-dark)'}
]

recommendations = "Do NOT modify any theme assets until the migration map is approved. Use this report to plan token replacements and gradient staging."  
output = {
    'colors_found': colors_found,
    'card_colors': sorted(role_sets['card_colors']),
    'background_colors': sorted(role_sets['background_colors']),
    'border_colors': sorted(role_sets['border_colors']),
    'text_colors': sorted(role_sets['text_colors']),
    'accent_colors': sorted(role_sets['accent_colors']),
    'danger_colors': sorted(role_sets['danger_colors']),
    'success_colors': sorted(role_sets['success_colors']),
    'gradient_colors': gradient_colors,
    'shadow_colors': shadow_colors,
    'css_variables': css_variables,
    'tailwind_tokens': tailwind_tokens,
    'tailwind_utilities': tailwind_utilities,
    'recommendations': recommendations,
}
Path('temp/color_report.json').write_text(json.dumps(output, indent=2), encoding='utf-8')

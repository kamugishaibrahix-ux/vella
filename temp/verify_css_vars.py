import re
from pathlib import Path

# Read the file and verify only the 6 specified variables were changed
file_path = Path('MOBILE/styles/globals.css')
content = file_path.read_text(encoding='utf-8')

# Expected values after update
expected = {
    '--mc-bg': '#050B18',
    '--mc-bg-soft': '#0A1224',
    '--mc-bg-elevated': '#0E172C',
    '--mc-card': '#0C162B',
    '--mc-card-soft': '#111D35',
    '--mc-surface-strong': '#152544',
}

# Extract all CSS variables
variables = {}
for match in re.finditer(r'--([\w-]+):\s*([^;]+);', content):
    var_name = f'--{match.group(1)}'
    var_value = match.group(2).strip()
    variables[var_name] = var_value

# Check the 6 variables
print('Updated variables:')
for var, expected_val in expected.items():
    actual = variables.get(var, 'NOT FOUND')
    status = '' if actual == expected_val else ''
    print(f'{status} {var}: {actual} (expected: {expected_val})')

# Count total variables to ensure nothing was deleted
print(f'\nTotal CSS variables found: {len(variables)}')
print('Verification complete.')

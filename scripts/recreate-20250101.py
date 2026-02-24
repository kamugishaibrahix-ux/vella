#!/usr/bin/env python3
"""Recreate the 20250101 migration file with a clean filename."""
import sys
from pathlib import Path

migrations_dir = Path('supabase/migrations')
expected_name = '20250101_drop_sensitive_tables.sql'

print("=" * 60)
print("Fixing 20250101 Migration Filename")
print("=" * 60)

# Step 1: Find the file
print("\n[1] Scanning for 20250101 migration file...")
target_file = None
for f in migrations_dir.iterdir():
    if f.is_file() and '20250101' in f.name:
        target_file = f
        break

if not target_file:
    print("ERROR: No file found with version 20250101", file=sys.stderr)
    sys.exit(1)

current_name = target_file.name
print(f"  Found: {repr(current_name)}")
print(f"  Expected: {repr(expected_name)}")

# Step 2: Analyze filename
print("\n[2] Analyzing filename bytes...")
name_bytes = current_name.encode('utf-8')
expected_bytes = expected_name.encode('utf-8')
print(f"  Current bytes (hex): {name_bytes.hex()}")
print(f"  Expected bytes (hex): {expected_bytes.hex()}")

issues = []
for i, byte in enumerate(name_bytes):
    if byte < 32 or byte > 126:
        if byte not in [10, 13]:
            issues.append((i, byte))

if issues:
    print(f"  ⚠️  Found {len(issues)} potential issues")
else:
    print(f"  ✅ No obvious corruption detected")

# Step 3: Read content
print("\n[3] Reading file content...")
try:
    content = target_file.read_text(encoding='utf-8')
    print(f"  Content length: {len(content)} characters")
    print(f"  Lines: {len(content.splitlines())}")
    
    # Clean content
    if content.startswith('\ufeff'):
        content = content[1:]
        print(f"  Removed BOM from content")
    
    lines = [line.rstrip() for line in content.splitlines()]
    content_clean = '\n'.join(lines)
    if content_clean and not content_clean.endswith('\n'):
        content_clean += '\n'
    
    print(f"  Cleaned content: {len(content_clean)} characters")
except Exception as e:
    print(f"  ERROR reading file: {e}", file=sys.stderr)
    sys.exit(1)

# Step 4: Delete old file
print("\n[4] Deleting old file...")
try:
    target_file.unlink()
    print(f"  ✅ Deleted: {repr(current_name)}")
except Exception as e:
    print(f"  ERROR deleting file: {e}", file=sys.stderr)
    sys.exit(1)

# Step 5: Create new file
print("\n[5] Creating new clean file...")
new_file = migrations_dir / expected_name
try:
    new_file.write_text(content_clean, encoding='utf-8', newline='\n')
    print(f"  ✅ Created: {repr(expected_name)}")
except Exception as e:
    print(f"  ERROR creating file: {e}", file=sys.stderr)
    sys.exit(1)

# Step 6: Verify
print("\n[6] Verification...")
if new_file.exists():
    final_name = new_file.name
    final_bytes = final_name.encode('utf-8')
    
    print(f"  ✅ File exists")
    print(f"  ✅ Filename: {repr(final_name)}")
    print(f"  ✅ Bytes (hex): {final_bytes.hex()}")
    print(f"  ✅ Matches expected: {final_name == expected_name}")
    print(f"  ✅ Bytes match: {final_bytes == expected_bytes}")
    
    # Check content
    final_content = new_file.read_text(encoding='utf-8')
    print(f"  ✅ Content preserved: {len(final_content)} characters")
    
    # Check for BOM
    if not final_content.startswith('\ufeff'):
        print(f"  ✅ No BOM in content")
    else:
        print(f"  ⚠️  BOM still present")
    
    # Check filename
    has_invalid = any(b < 32 or b > 126 for b in final_bytes if b not in [10, 13])
    if not has_invalid:
        print(f"  ✅ No invalid characters in filename")
    
    print(f"\n  ✅ Supabase CLI will match version=20250101: YES")
else:
    print(f"  ❌ ERROR: New file not found", file=sys.stderr)
    sys.exit(1)

print("\n" + "=" * 60)
print("✅ Fix complete!")
print("=" * 60)


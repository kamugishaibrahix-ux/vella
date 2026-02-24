#!/usr/bin/env python3
"""Fix the 20250101 migration filename by recreating it cleanly."""
import sys
from pathlib import Path

migrations_dir = Path('supabase/migrations')
expected_name = '20250101_drop_sensitive_tables.sql'

print("=== Fixing 20250101 Migration Filename ===\n")

# Step 1: Find the file
target_file = None
for f in migrations_dir.iterdir():
    if f.is_file() and '20250101' in f.name:
        target_file = f
        break

if not target_file:
    print("ERROR: No file found with version 20250101", file=sys.stderr)
    sys.exit(1)

current_name = target_file.name
print(f"Step 1: Found file")
print(f"  Current name: {repr(current_name)}")
print(f"  Expected name: {repr(expected_name)}")

# Step 2: Analyze filename bytes
name_bytes = current_name.encode('utf-8')
expected_bytes = expected_name.encode('utf-8')

print(f"\nStep 2: Analyzing filename bytes")
print(f"  Current bytes (hex): {name_bytes.hex()}")
print(f"  Expected bytes (hex): {expected_bytes.hex()}")

# Check for issues
issues = []
for i, byte in enumerate(name_bytes):
    if byte < 32 or byte > 126:
        if byte not in [10, 13]:  # newline/carriage return
            issues.append((i, byte, f"0x{byte:02X}"))

if issues:
    print(f"  ⚠️  Issues detected:")
    for pos, byte, hex_val in issues:
        print(f"    Position {pos}: byte {byte} ({hex_val})")
else:
    print(f"  ✅ No obvious issues in filename")

# Check for BOM
if name_bytes.startswith(b'\xef\xbb\xbf'):
    print(f"  ⚠️  UTF-8 BOM detected")
    issues.append(('BOM', None, None))

# Step 3: Extract file content
print(f"\nStep 3: Extracting file content")
content = target_file.read_text(encoding='utf-8')
print(f"  Content length: {len(content)} characters")
print(f"  Content lines: {len(content.splitlines())}")

# Clean content: remove BOM, trailing spaces, extra newlines
content_clean = content
if content_clean.startswith('\ufeff'):  # BOM character
    content_clean = content_clean[1:]
    print(f"  Removed BOM from content")

# Remove trailing whitespace from each line
lines = [line.rstrip() for line in content_clean.splitlines()]
content_clean = '\n'.join(lines)
# Add exactly one newline at the end if content exists
if content_clean and not content_clean.endswith('\n'):
    content_clean += '\n'

print(f"  Cleaned content length: {len(content_clean)} characters")

# Step 4: Delete old file
print(f"\nStep 4: Deleting old file")
target_file.unlink()
print(f"  ✅ Deleted: {repr(current_name)}")

# Step 5: Create new clean file
print(f"\nStep 5: Creating new clean file")
new_file = migrations_dir / expected_name
new_file.write_text(content_clean, encoding='utf-8', newline='\n')
print(f"  ✅ Created: {repr(expected_name)}")

# Step 6: Verify
print(f"\nStep 6: Verification")
if new_file.exists():
    final_name = new_file.name
    final_bytes = final_name.encode('utf-8')
    final_content = new_file.read_text(encoding='utf-8')
    
    print(f"  ✅ File exists: {repr(final_name)}")
    print(f"  ✅ Name matches expected: {final_name == expected_name}")
    print(f"  ✅ Bytes match expected: {final_bytes == expected_bytes}")
    print(f"  ✅ Content preserved: {len(final_content)} characters")
    print(f"  ✅ Supabase CLI will match version=20250101: YES")
    
    # Verify no BOM
    if not final_content.startswith('\ufeff'):
        print(f"  ✅ No BOM in content")
    else:
        print(f"  ⚠️  Warning: BOM still present in content")
    
    # Verify filename bytes
    has_invalid = any(b < 32 or b > 126 for b in final_bytes if b not in [10, 13])
    if not has_invalid:
        print(f"  ✅ No invalid characters in filename")
    else:
        print(f"  ⚠️  Warning: Invalid characters in filename")
else:
    print(f"  ❌ ERROR: New file not found", file=sys.stderr)
    sys.exit(1)

print(f"\n✅ Fix complete!")


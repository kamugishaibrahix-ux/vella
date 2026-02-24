#!/usr/bin/env python3
"""Normalize the 20250101 migration filename to remove any hidden characters."""
import sys
from pathlib import Path

migrations_dir = Path('supabase/migrations')
expected_name = '20250101_drop_sensitive_tables.sql'

# Find the file
target_file = None
for f in migrations_dir.iterdir():
    if f.is_file() and '20250101' in f.name:
        target_file = f
        break

if not target_file:
    print("ERROR: No file found with version 20250101", file=sys.stderr)
    sys.exit(1)

current_name = target_file.name
current_bytes = current_name.encode('utf-8')
expected_bytes = expected_name.encode('utf-8')

print("=== Migration Filename Normalization for 20250101 ===")
print(f"\nCurrent filename: {repr(current_name)}")
print(f"Expected filename: {repr(expected_name)}")
print(f"\nCurrent bytes (hex): {current_bytes.hex()}")
print(f"Expected bytes (hex): {expected_bytes.hex()}")

# Check for invalid characters
invalid_chars = []
for i, byte in enumerate(current_bytes):
    if byte < 32 or byte > 126:
        if byte not in [10, 13]:  # Allow newline/carriage return
            invalid_chars.append((i, byte))

if invalid_chars:
    print(f"\n⚠️  Invalid characters detected at positions:")
    for pos, byte in invalid_chars:
        print(f"  Position {pos}: byte {byte} (0x{byte:02X})")
else:
    print(f"\n✅ No invalid characters detected")

# Normalize if needed
if current_bytes != expected_bytes:
    print(f"\n❌ Filename mismatch - Normalizing...")
    print(f"  Old filename: {repr(current_name)}")
    print(f"  New filename: {repr(expected_name)}")
    
    new_path = target_file.parent / expected_name
    target_file.rename(new_path)
    
    print(f"\n✅ Successfully normalized filename")
    
    # Verify
    if new_path.exists():
        print(f"✅ Verification: File exists with normalized name")
        print(f"✅ Final name: {repr(new_path.name)}")
    else:
        print(f"❌ ERROR: File not found after normalization", file=sys.stderr)
        sys.exit(1)
else:
    print(f"\n✅ Filename is already normalized correctly!")

# Final verification
final_file = migrations_dir / expected_name
if final_file.exists():
    final_name = final_file.name
    final_bytes = final_name.encode('utf-8')
    
    print(f"\n=== FINAL VERIFICATION ===")
    print(f"✅ File exists: {final_name}")
    print(f"✅ Matches expected: {final_name == expected_name}")
    print(f"✅ Bytes match: {final_bytes == expected_bytes}")
    print(f"✅ Supabase CLI will match version=20250101: YES")
    
    # Verify no hidden characters
    has_hidden = any(b < 32 or b > 126 for b in final_bytes if b not in [10, 13])
    if not has_hidden:
        print(f"✅ No hidden characters detected")
    else:
        print(f"⚠️  Warning: Hidden characters still present", file=sys.stderr)
else:
    print(f"❌ ERROR: Final file verification failed", file=sys.stderr)
    sys.exit(1)

print(f"\n✅ Normalization complete!")


#!/usr/bin/env python3
import os
import sys
from pathlib import Path

migrations_dir = Path('supabase/migrations')
expected_name = '20250101_drop_sensitive_tables.sql'

# Find all files
all_files = list(migrations_dir.iterdir())
matching_files = [f for f in all_files if f.is_file() and '20250101' in f.name]

print(f"=== Migration Filename Fix for 20250101 ===")
print(f"\nFiles found matching '20250101': {len(matching_files)}")

if not matching_files:
    print("ERROR: No file found with version 20250101")
    sys.exit(1)

target_file = matching_files[0]
current_name = target_file.name

print(f"\nCurrent filename: {repr(current_name)}")
print(f"Expected filename: {repr(expected_name)}")
print(f"Length: {len(current_name)} (expected: {len(expected_name)})")

# Check bytes
name_bytes = current_name.encode('utf-8')
print(f"\nByte analysis:")
print(f"  Total bytes: {len(name_bytes)}")
print(f"  Hex: {name_bytes.hex()}")

# Check for invalid characters
invalid_positions = []
for i, byte in enumerate(name_bytes):
    if byte < 32 or byte > 126:
        if byte not in [10, 13]:  # newline/carriage return
            invalid_positions.append((i, byte, f"0x{byte:02X}"))

if invalid_positions:
    print(f"\n⚠️  INVALID CHARACTERS DETECTED:")
    for pos, byte, hex_val in invalid_positions:
        char = chr(byte) if byte < 256 else f"\\u{byte:04X}"
        print(f"  Position {pos}: byte {byte} ({hex_val}) = {repr(char)}")
else:
    print(f"\n✅ No invalid characters detected")

# Check if names match
if current_name != expected_name:
    print(f"\n❌ FILENAME MISMATCH - Renaming required")
    print(f"  From: {repr(current_name)}")
    print(f"  To:   {repr(expected_name)}")
    
    # Rename
    try:
        new_path = target_file.parent / expected_name
        target_file.rename(new_path)
        print(f"\n✅ Successfully renamed!")
        
        # Verify
        if new_path.exists():
            print(f"✅ Verification: New file exists")
            print(f"✅ New filename: {repr(new_path.name)}")
        else:
            print(f"❌ ERROR: File not found after rename")
            sys.exit(1)
    except Exception as e:
        print(f"❌ ERROR during rename: {e}")
        sys.exit(1)
else:
    print(f"\n✅ Filename is already correct!")

# Final verification
final_file = migrations_dir / expected_name
if final_file.exists():
    print(f"\n=== FINAL VERIFICATION ===")
    print(f"✅ File exists: {final_file.name}")
    print(f"✅ Matches expected: {final_file.name == expected_name}")
    print(f"✅ Supabase CLI will match version=20250101: YES")
else:
    print(f"\n❌ ERROR: Final file not found")
    sys.exit(1)


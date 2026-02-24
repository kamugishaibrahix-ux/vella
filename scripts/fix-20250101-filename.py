#!/usr/bin/env python3
import os
from pathlib import Path

migrations_dir = Path('supabase/migrations')
expected_name = '20250101_drop_sensitive_tables.sql'

# Find file with 20250101
files = list(migrations_dir.glob('*20250101*'))
print(f"Files matching 20250101: {len(files)}")

for f in files:
    print(f"\nFound file:")
    print(f"  Name: {repr(f.name)}")
    print(f"  Length: {len(f.name)}")
    
    # Check bytes
    name_bytes = f.name.encode('utf-8')
    print(f"  Bytes (hex): {name_bytes.hex()}")
    
    # Check for invalid characters
    invalid_chars = []
    for i, byte in enumerate(name_bytes):
        if byte < 32 or byte > 126:
            if byte not in [10, 13]:  # Allow newline/carriage return for display
                invalid_chars.append((i, byte, f"0x{byte:02X}"))
    
    if invalid_chars:
        print(f"  ⚠️  Invalid characters found:")
        for pos, byte, hex_val in invalid_chars:
            print(f"    Position {pos}: byte {byte} ({hex_val})")
    else:
        print(f"  ✅ No invalid characters")
    
    # Check if it matches expected
    if f.name != expected_name:
        print(f"\n  ❌ MISMATCH!")
        print(f"    Current: {repr(f.name)}")
        print(f"    Expected: {repr(expected_name)}")
        print(f"\n  Renaming...")
        new_path = f.parent / expected_name
        f.rename(new_path)
        print(f"  ✅ Renamed to: {expected_name}")
        
        # Verify
        if (f.parent / expected_name).exists():
            print(f"  ✅ Verification: File exists with correct name")
    else:
        print(f"\n  ✅ Filename is correct!")


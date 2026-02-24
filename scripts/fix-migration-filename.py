#!/usr/bin/env python3
import os
import shutil
from pathlib import Path

migrations_dir = Path('supabase/migrations')
expected_name = '20251129154622_create_admin_global_config.sql'

# Get all files
all_files = list(migrations_dir.glob('*.sql'))

print(f"Total migration files: {len(all_files)}")
print("\nAll files:")
for f in sorted(all_files):
    print(f"  {f.name} (len={len(f.name)})")

# Find the target file
target_files = [f for f in all_files if '20251129' in f.name or ('admin' in f.name and 'global' in f.name)]

print(f"\nFiles matching pattern: {len(target_files)}")
for f in target_files:
    print(f"  {repr(f.name)}")

if target_files:
    target_file = target_files[0]
    if target_file.name != expected_name:
        print(f"\n❌ MISMATCH FOUND!")
        print(f"  Current: {repr(target_file.name)}")
        print(f"  Expected: {repr(expected_name)}")
        print(f"\nRenaming...")
        new_path = target_file.parent / expected_name
        target_file.rename(new_path)
        print(f"✅ Renamed to: {expected_name}")
    else:
        print(f"\n✅ File name is correct: {target_file.name}")
else:
    print("\n❌ Target file not found!")


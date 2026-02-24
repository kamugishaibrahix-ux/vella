# Supabase Migration Repair Commands

## Analysis

**Remote duplicates:**
- 20250218: 3 entries (need to keep 1, mark 2 as reverted)
- 20250220: 5 entries (need to keep 1, mark 4 as reverted)
- 20250221: 3 entries (need to keep 1, mark 2 as reverted)
- 20251220: 2 entries (need to keep 1, mark 1 as reverted)

**Total duplicates to revert:** 9 entries

## Repair Commands (PowerShell)

```powershell
# Revert duplicate 20250218 entries (keep 1, revert 2)
supabase migration repair --status reverted 20250218
supabase migration repair --status reverted 20250218

# Revert duplicate 20250220 entries (keep 1, revert 4)
supabase migration repair --status reverted 20250220
supabase migration repair --status reverted 20250220
supabase migration repair --status reverted 20250220
supabase migration repair --status reverted 20250220

# Revert duplicate 20250221 entries (keep 1, revert 2)
supabase migration repair --status reverted 20250221
supabase migration repair --status reverted 20250221

# Revert duplicate 20251220 entries (keep 1, revert 1)
supabase migration repair --status reverted 20251220
```


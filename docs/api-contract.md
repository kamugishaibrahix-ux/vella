# Vella Control — API Contract



This document defines the APIs that the Admin Panel uses to read/write Supabase data.



## 1. /api/admin/config/get

Returns the active admin_global_config row.

- Method: GET

- Returns: full JSON config



## 2. /api/admin/config/save

Replaces the active config with a new one.

- Method: POST

- Body: { config: AdminConfig }

- Logs to admin_activity_log



## 3. /api/admin/users/list

Returns user_metadata rows for the admin User List page.



## 4. /api/admin/users/update-plan

Allows admin to change plan tier.

- Method: POST

- Body: { user_id, new_plan }



## 5. /api/admin/users/update-tokens

Allows admin to add/remove tokens.

- Method: POST

- Body: { user_id, delta }



## 6. /api/admin/subscriptions/list

Returns subscriptions table rows.



## 7. /api/admin/logs/list

Returns system_logs & admin_activity_log entries.



## 8. /api/admin/analytics/get

Returns analytics_counters aggregated.


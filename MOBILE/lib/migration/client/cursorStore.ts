/**
 * Phase M3: Migration cursor store (uses IndexedDB migration_cursors store).
 */

import { migrationCursorStore } from "@/lib/local/db/migrationCursors";
import type { IMigrationCursorStore } from "@/lib/local/db/types";

export const getMigrationCursorStore = (): IMigrationCursorStore => migrationCursorStore;

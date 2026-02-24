/**
 * ISO week identifier (YYYY-Www) for weekly focus and review.
 * No storage. Deterministic only.
 */

/**
 * Returns ISO week id for the given date, e.g. "2026-W08".
 * Week starts Monday (ISO 8601).
 */
export function getISOWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayOfWeek = d.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  const year = d.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const startDayOfWeek = startOfYear.getUTCDay();
  const startMondayOffset = startDayOfWeek === 0 ? -6 : 1 - startDayOfWeek;
  startOfYear.setUTCDate(startOfYear.getUTCDate() + startMondayOffset);
  const diffMs = d.getTime() - startOfYear.getTime();
  const weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  const weekStr = weekNum < 10 ? `0${weekNum}` : String(weekNum);
  return `${year}-W${weekStr}`;
}

const WEEK_ID_REGEX = /^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/;

/** Returns true if string is valid YYYY-Www (week 01–53). */
export function isValidWeekId(weekId: string): boolean {
  return WEEK_ID_REGEX.test(weekId);
}

/**
 * Returns ISO bounds for the given week (Monday 00:00:00 to next Monday 00:00:00 exclusive).
 * Used for querying behaviour_events in that week.
 */
export function getWeekBounds(weekId: string): { startIso: string; endIso: string } | null {
  if (!isValidWeekId(weekId)) return null;
  const [, y, w] = weekId.match(/^(\d{4})-W(\d{2})$/) ?? [];
  const year = parseInt(y!, 10);
  const week = parseInt(w!, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const firstMonday = new Date(Date.UTC(year, 0, 4 + mondayOffset));
  const weekStart = new Date(firstMonday);
  weekStart.setUTCDate(weekStart.getUTCDate() + (week - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return {
    startIso: weekStart.toISOString(),
    endIso: weekEnd.toISOString(),
  };
}

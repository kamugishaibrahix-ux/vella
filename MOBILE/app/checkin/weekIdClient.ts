/**
 * Client-only ISO week id for display (e.g. "Week 2026-W08").
 * Mirrors lib/focus/weekId logic without importing server modules.
 */
export function getDisplayWeekId(date: Date): string {
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

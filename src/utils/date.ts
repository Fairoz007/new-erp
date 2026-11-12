/**
 * Parse a date string. Date-only strings ('YYYY-MM-DD') are treated as local
 * calendar dates; `new Date('YYYY-MM-DD')` would parse them as UTC midnight,
 * shifting the displayed day by one in timezones west of UTC.
 */
function parseDate(dateStr: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(dateStr);
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const d = parseDate(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr || 'N/A';
  }
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr || 'N/A';
  }
}

export function getDaysDifference(targetDateStr?: string | null): number {
  if (!targetDateStr) return 999;
  const target = parseDate(targetDateStr).getTime();
  const now = new Date().getTime();
  const diffTime = target - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function isDateOverdue(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  return getDaysDifference(dateStr) < 0;
}

export function isDateExpiringSoon(dateStr?: string | null, daysThreshold: number = 30): boolean {
  if (!dateStr) return false;
  const days = getDaysDifference(dateStr);
  return days >= 0 && days <= daysThreshold;
}

/** Today as YYYY-MM-DD in the user's local zone (toISOString() would give the UTC day). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Local calendar dates. `new Date().toISOString().slice(0, 10)` is the UTC date: in Oman (UTC+4)
// it is still "yesterday" between midnight and 04:00, so forms defaulted to the wrong day and
// "due in 30 days" windows were shifted. Every business date is a local calendar date.
// ---------------------------------------------------------------------------------------------
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' of a Date in the browser's local time zone. */
export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Today's local date, 'YYYY-MM-DD'. */
export function todayYmd(now: Date = new Date()): string {
  return toYmd(now);
}

/** Local date `days` calendar days from today (negative = in the past), 'YYYY-MM-DD'. DST-safe. */
export function addDaysYmd(days: number, from: Date | string = new Date()): string {
  const base = typeof from === 'string' ? parseDate(from) : new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return toYmd(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days));
}

/** Current local month, 'YYYY-MM'. */
export function currentMonthYm(now: Date = new Date()): string {
  return toYmd(now).slice(0, 7);
}

export { parseDate as parseLocalDate };

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

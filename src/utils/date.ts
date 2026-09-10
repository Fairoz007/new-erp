export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
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
  const target = new Date(targetDateStr).getTime();
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

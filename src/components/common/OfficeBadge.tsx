// Office identity mark: the office logo when one is stored (media bucket, signed URL), otherwise the
// office code on a coloured badge. Colours follow the logo accents in a fixed order by office code,
// so an office keeps its colour everywhere (header, Offices screen, edit panel).
import React, { useEffect, useMemo, useState } from 'react';
import { createSignedUrls } from '../../services/storage';
import type { Company } from '../../types/system';

const BADGE_COLOURS = [
  'bg-brand-100 text-brand-600 border-brand-200',
  'bg-accent-blue-50 text-accent-blue-700 border-accent-blue-100',
  'bg-accent-red-50 text-accent-red-700 border-accent-red-100',
  'bg-accent-green-50 text-accent-green-700 border-accent-green-100',
];

/** Stable colour index for an office: position of its code among all codes, sorted. */
export function officeColourIndex(code: string, allCodes: string[]): number {
  const sorted = Array.from(new Set(allCodes.map(c => c.toUpperCase()))).sort();
  const i = sorted.indexOf(code.toUpperCase());
  return (i < 0 ? 0 : i) % BADGE_COLOURS.length;
}

const DIRECT = /^(https?:|data:|blob:)/i;
const cache = new Map<string, { url: string | null; until: number }>();

/** Signed URLs for office logo paths (one request for all of them; cached for 45 minutes). */
export function useOfficeLogoUrls(paths: Array<string | undefined>): (path?: string) => string | null {
  const key = useMemo(() => Array.from(new Set(paths.filter((p): p is string => !!p && !DIRECT.test(p)))).sort().join('\n'), [paths]);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!key) return;
    const now = Date.now();
    const missing = key.split('\n').filter(p => { const c = cache.get(p); return !c || c.until <= now; });
    if (missing.length === 0) return;
    let live = true;
    createSignedUrls('media', missing, 3600)
      .then(r => { for (const p of missing) cache.set(p, { url: r[p] ?? null, until: Date.now() + 45 * 60_000 }); if (live) setTick(t => t + 1); })
      .catch(() => { for (const p of missing) cache.set(p, { url: null, until: Date.now() + 60_000 }); if (live) setTick(t => t + 1); });
    return () => { live = false; };
  }, [key]);
  return (path?: string) => (!path ? null : DIRECT.test(path) ? path : cache.get(path)?.url ?? null);
}

/** Forget a signed logo URL (after the logo is replaced or removed). */
export const forgetOfficeLogo = (path?: string) => { if (path) cache.delete(path); };

interface Props {
  office: Pick<Company, 'code' | 'name' | 'logo'>;
  allCodes: string[];
  logoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const OfficeBadge: React.FC<Props> = ({ office, allCodes, logoUrl, size = 'md', className = '' }) => {
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px] rounded-lg' : size === 'lg' ? 'w-14 h-14 text-base rounded-2xl' : 'w-10 h-10 text-xs rounded-xl';
  if (logoUrl) {
    return <img src={logoUrl} alt="" className={`${dim} object-contain bg-white border border-slate-700 shrink-0 ${className}`} />;
  }
  return (
    <span aria-hidden="true" className={`${dim} ${BADGE_COLOURS[officeColourIndex(office.code, allCodes)]} border font-extrabold tracking-tight flex items-center justify-center shrink-0 ${className}`}>
      {office.code.slice(0, 4)}
    </span>
  );
};

/** "All offices" mark for the combined view. */
export const AllOfficesBadge: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px] rounded-lg' : size === 'lg' ? 'w-14 h-14 text-base rounded-2xl' : 'w-10 h-10 text-xs rounded-xl';
  return <span aria-hidden="true" className={`${dim} bg-brand-500 text-white font-extrabold flex items-center justify-center shrink-0`}>ALL</span>;
};

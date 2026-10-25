import React, { useEffect, useMemo, useState } from 'react';
import { Car } from 'lucide-react';
import { createSignedUrls } from '../../services/storage';

const DIRECT = /^(https?:|data:|blob:)/i;

/**
 * vehicles.photo_url holds a path in the private `media` bucket. This hook resolves a list of them to
 * short-lived signed URLs in one request; direct http(s) URLs pass through unchanged.
 */
export function useVehiclePhotoUrls(photos: Array<string | undefined>): (photo: string | undefined) => string | null {
  const key = useMemo(
    () => Array.from(new Set(photos.filter((p): p is string => !!p && !DIRECT.test(p)))).sort().join('\n'),
    [photos],
  );
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    if (!key) { setUrls({}); return; }
    createSignedUrls('media', key.split('\n'), 3000)
      .then(r => { if (!cancelled) setUrls(r); })
      .catch(() => { if (!cancelled) setUrls({}); }); // a photo that cannot be signed just shows the placeholder
    return () => { cancelled = true; };
  }, [key]);

  return (photo?: string) => (!photo ? null : DIRECT.test(photo) ? photo : urls[photo] ?? null);
}

export const VehiclePhoto: React.FC<{ src: string | null; alt: string; className?: string }> = ({ src, alt, className }) =>
  src ? (
    <img src={src} alt={alt} className={className ?? 'w-full h-full object-cover'} />
  ) : (
    <div className="w-full h-full flex items-center justify-center text-slate-500 bg-slate-850" aria-label="No photo">
      <Car className="w-1/2 h-1/2" />
    </div>
  );

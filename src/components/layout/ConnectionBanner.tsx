import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { markAllStale } from '../../lib/queryCache';

/**
 * Shows when the browser is offline. When the connection comes back, everything on screen is
 * refreshed (cached lists and figures are marked stale and the collections are reloaded).
 */
export const ConnectionBanner: React.FC<{ onReconnect: () => void }> = ({ onReconnect }) => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => { setOnline(true); markAllStale(0); onReconnect(); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [onReconnect]);
  if (online) return null;
  return (
    <div role="status" aria-live="polite" className="px-5 sm:px-8 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center gap-2">
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>You are offline. Figures may be out of date and changes cannot be saved until the connection is back.</span>
    </div>
  );
};

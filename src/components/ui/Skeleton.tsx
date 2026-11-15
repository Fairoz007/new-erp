import React from 'react';

/** A grey placeholder bar while data loads (pulses unless the user prefers reduced motion). */
export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
  <span aria-hidden="true" className={`block rounded-md bg-slate-800 motion-safe:animate-pulse ${className}`} />
);

/** Several skeleton lines with a status label for screen readers. */
export const SkeletonBlock: React.FC<{ lines?: number; label?: string; className?: string }> = ({ lines = 3, label = 'Loading', className = '' }) => (
  <div role="status" aria-label={label} className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />)}
  </div>
);

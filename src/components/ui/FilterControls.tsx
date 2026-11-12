import React, { InputHTMLAttributes, SelectHTMLAttributes, forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

/** Compact pill controls for list toolbars and filter rows (same height as the toolbar's sm buttons). */
// phones: 44 px tall (touch target). Callers name controls that have no <label> with aria-label; title / placeholder are the fallback.
const base = 'h-11 sm:h-9 bg-slate-850 border border-slate-700 rounded-full px-3.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] disabled:opacity-60';

export const FilterSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} aria-label={props['aria-labelledby'] ? undefined : props.title} className={twMerge(base, 'cursor-pointer', className)} {...props} />
  ),
);
FilterSelect.displayName = 'FilterSelect';

export const FilterInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} aria-label={props['aria-labelledby'] ? undefined : props.placeholder ?? props.title} className={twMerge(base, 'px-3 font-medium', className)} {...props} />
  ),
);
FilterInput.displayName = 'FilterInput';

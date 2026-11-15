import React, { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type BadgeVariant =
  | 'default'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'cyan'
  | 'slate'
  | 'outline';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'default',
  size = 'md',
  dot = false,
  ...props
}) => {
  const variantStyles = {
    default: 'bg-slate-800 text-slate-300 border-slate-700',
    emerald: 'bg-brand-100 text-brand-600 border-transparent font-semibold',
    amber: 'bg-warning-50 text-warning-700 border-transparent font-semibold',
    rose: 'bg-danger-50 text-danger-700 border-transparent font-semibold',
    blue: 'bg-accent-blue-50 text-accent-blue-700 border-transparent font-semibold',
    indigo: 'bg-brand-100 text-brand-500 border-transparent font-semibold',
    violet: 'bg-accent-blue-50 text-accent-blue-700 border-transparent font-semibold',
    cyan: 'bg-accent-blue-100 text-accent-blue-700 border-transparent font-semibold',
    slate: 'bg-slate-800 text-slate-400 border-transparent font-medium',
    outline: 'bg-white text-slate-400 border-slate-700 font-medium',
  };

  const dotColors = {
    default: 'bg-slate-400',
    emerald: 'bg-brand-500',
    amber: 'bg-warning',
    rose: 'bg-danger',
    blue: 'bg-accent-blue-600',
    indigo: 'bg-brand-500',
    violet: 'bg-accent-blue-700',
    cyan: 'bg-accent-blue-500',
    slate: 'bg-slate-400',
    outline: 'bg-slate-400',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2.5 py-0.5 font-medium leading-normal',
    md: 'text-xs px-3 py-1 font-medium leading-normal',
    lg: 'text-sm px-3.5 py-1.5 font-medium leading-normal',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 rounded-full border select-none tracking-tight',
          variantStyles[variant],
          sizeStyles[size],
          className
        )
      )}
      {...props}
    >
      {dot && (
        <span
          className={clsx('w-1.5 h-1.5 rounded-full shrink-0', dotColors[variant])}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </span>
  );
};

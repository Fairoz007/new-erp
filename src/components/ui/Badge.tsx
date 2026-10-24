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
    emerald: 'bg-[#DCEFE5] text-[#06452F] border-transparent font-semibold',
    amber: 'bg-[#FEF3C7] text-[#92400E] border-transparent font-semibold',
    rose: 'bg-[#FFE4E6] text-[#9F1239] border-transparent font-semibold',
    blue: 'bg-[#DBEAFE] text-[#1E40AF] border-transparent font-semibold',
    indigo: 'bg-[#DCEFE5] text-[#086343] border-transparent font-semibold',
    violet: 'bg-[#F3E8FF] text-[#6B21A8] border-transparent font-semibold',
    cyan: 'bg-[#CFFAFE] text-[#155E75] border-transparent font-semibold',
    slate: 'bg-slate-800 text-slate-400 border-transparent font-medium',
    outline: 'bg-white text-slate-400 border-slate-700 font-medium',
  };

  const dotColors = {
    default: 'bg-slate-400',
    emerald: 'bg-[#086343]',
    amber: 'bg-[#D9A441]',
    rose: 'bg-[#D94B4B]',
    blue: 'bg-[#2563EB]',
    indigo: 'bg-[#086343]',
    violet: 'bg-[#7C3AED]',
    cyan: 'bg-[#0891B2]',
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

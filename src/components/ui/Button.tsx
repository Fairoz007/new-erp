import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost' | 'navy';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  leftIcon,
  rightIcon,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer';

  const sizeStyles = {
    xs: 'text-xs px-3 py-2 gap-1.5 min-h-9',
    sm: 'text-sm px-3.5 py-2 gap-1.5 min-h-10',
    md: 'text-sm px-4 py-2.5 gap-2 min-h-11',
    lg: 'text-base px-5 py-3 gap-2.5 min-h-12',
  };

  const variantStyles = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow focus:ring-indigo-600 border border-indigo-600',
    secondary: 'bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700 focus:ring-slate-500',
    navy: 'bg-slate-100 hover:bg-slate-200 text-white border border-slate-100 focus:ring-indigo-600',
    outline: 'bg-white hover:bg-slate-850 text-slate-300 border border-slate-700 focus:ring-indigo-600',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white focus:ring-rose-500 border border-rose-500/30 shadow-sm',
    success: 'bg-emerald-600 hover:bg-emerald-500 text-white focus:ring-emerald-500 border border-emerald-500/30 shadow-sm',
    ghost: 'bg-transparent hover:bg-slate-850 text-slate-300 hover:text-slate-100 border-transparent focus:ring-indigo-600',
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, sizeStyles[size], variantStyles[variant], className))}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
    </button>
  );
};

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
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer';

  const sizeStyles = {
    xs: 'text-xs px-2.5 py-1 min-h-8 gap-1.5',
    sm: 'text-xs sm:text-sm px-3 py-1.5 min-h-9 gap-1.5',
    md: 'text-sm px-3.5 py-2 min-h-10 gap-2',
    lg: 'text-sm sm:text-base px-4.5 py-2.5 min-h-11 gap-2.5',
  };

  const variantStyles = {
    primary:
      'bg-indigo-600 hover:bg-indigo-700 text-white border border-transparent shadow-[0_1px_2px_rgba(79,70,229,0.25)] active:translate-y-px',
    secondary:
      'bg-white hover:bg-slate-800 text-slate-100 border border-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:bg-slate-750',
    navy:
      'bg-slate-100 hover:bg-slate-200 text-white border border-slate-100 shadow-sm',
    outline:
      'bg-white hover:bg-slate-800 text-slate-100 border border-slate-700 active:bg-slate-750',
    danger:
      'bg-rose-600 hover:bg-rose-700 text-white border border-transparent shadow-xs',
    success:
      'bg-emerald-600 hover:bg-emerald-700 text-white border border-transparent shadow-xs',
    ghost:
      'bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-100 border-transparent',
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, sizeStyles[size], variantStyles[variant], className))}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-current shrink-0" />
      ) : (
        leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
      )}
      {children && <span>{children}</span>}
      {!isLoading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
    </button>
  );
};

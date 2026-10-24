import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost' | 'navy';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  pill?: boolean;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  pill = true,
  isLoading = false,
  disabled,
  leftIcon,
  rightIcon,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-forest-500/30 focus:border-forest-500 disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer';

  const shapeStyles = pill ? 'rounded-full' : 'rounded-xl';

  const sizeStyles = {
    xs: 'text-xs px-3 py-1 min-h-[32px] gap-1.5',
    sm: 'text-xs sm:text-sm px-4 py-1.5 min-h-[36px] gap-1.5',
    md: 'text-sm px-5 py-2 min-h-[40px] gap-2',
    lg: 'text-sm sm:text-base px-6 py-2.5 min-h-[44px] gap-2.5',
  };

  const variantStyles = {
    primary:
      'bg-[#086343] hover:bg-[#06452F] text-white border border-transparent shadow-[0_1px_2px_rgba(8,99,67,0.2)] active:translate-y-px',
    secondary:
      'bg-white hover:bg-slate-800 text-slate-100 border border-slate-700 shadow-subtle active:bg-slate-750',
    navy:
      'bg-slate-100 hover:bg-slate-200 text-white border border-slate-100 shadow-subtle',
    outline:
      'bg-white hover:bg-slate-800 text-slate-100 border border-slate-700 active:bg-slate-750',
    danger:
      'bg-[#D94B4B] hover:bg-[#C53030] text-white border border-transparent shadow-xs',
    success:
      'bg-[#086343] hover:bg-[#06452F] text-white border border-transparent shadow-xs',
    ghost:
      'bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-100 border-transparent',
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, shapeStyles, sizeStyles[size], variantStyles[variant], className))}
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

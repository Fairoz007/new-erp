import React, { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'glass' | 'subtle' | 'flat';
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  variant = 'default',
  noPadding = false,
  ...props
}) => {
  const variantStyles = {
    default: 'bg-white border border-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.02)]',
    glass: 'bg-white border border-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.02)]',
    subtle: 'bg-slate-850 border border-slate-700',
    flat: 'bg-white border border-slate-700',
  };

  return (
    <div
      className={twMerge(
        clsx(
          'rounded-[14px] overflow-hidden transition-all duration-150',
          variantStyles[variant],
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<HTMLAttributes<HTMLDivElement> & { action?: ReactNode }> = ({
  children,
  className,
  action,
  ...props
}) => (
  <div
    className={twMerge(
      clsx(
        'px-5 py-3.5 sm:px-5 sm:py-4 border-b border-slate-700 flex items-center justify-between gap-3 bg-white',
        className
      )
    )}
    {...props}
  >
    <div className="min-w-0">{children}</div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const CardTitle: React.FC<HTMLAttributes<HTMLHeadingElement>> = ({ children, className, ...props }) => (
  <h3
    className={twMerge(
      clsx('text-sm sm:text-base font-semibold text-slate-100 flex items-center gap-2 tracking-tight', className))
    }
    {...props}
  >
    {children}
  </h3>
);

export const CardDescription: React.FC<HTMLAttributes<HTMLParagraphElement>> = ({ children, className, ...props }) => (
  <p
    className={twMerge(clsx('text-xs text-slate-400 mt-0.5', className))}
    {...props}
  >
    {children}
  </p>
);

export const CardContent: React.FC<HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div className={twMerge(clsx('p-4 sm:p-5', className))} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div
    className={twMerge(
      clsx(
        'px-5 py-3 border-t border-slate-700 bg-slate-850 flex items-center justify-between text-xs text-slate-400',
        className
      )
    )}
    {...props}
  >
    {children}
  </div>
);

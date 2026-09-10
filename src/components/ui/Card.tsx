import React, { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'glass' | 'subtle';
}

export const Card: React.FC<CardProps> = ({ children, className, variant = 'default', ...props }) => {
  const variantStyles = {
    default: 'bg-white border border-slate-700 shadow-sm',
    glass: 'bg-white border border-slate-700 shadow-sm',
    subtle: 'bg-slate-850 border border-slate-700',
  };

  return (
  <div className={twMerge(clsx('rounded-xl overflow-hidden transition-all', variantStyles[variant], className))} {...props}>
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
  <div className={twMerge(clsx('px-5 py-4 sm:px-6 border-b border-slate-700 flex items-center justify-between gap-3', className))} {...props}>
    <div>{children}</div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const CardTitle: React.FC<HTMLAttributes<HTMLHeadingElement>> = ({ children, className, ...props }) => (
  <h3 className={twMerge(clsx('text-base font-semibold text-slate-100 flex items-center gap-2', className))} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<HTMLAttributes<HTMLParagraphElement>> = ({ children, className, ...props }) => (
  <p className={twMerge(clsx('text-sm text-slate-400 mt-1', className))} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div className={twMerge(clsx('p-5 sm:p-6', className))} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div className={twMerge(clsx('px-5 py-3 border-t border-slate-700 bg-slate-850 flex items-center justify-between', className))} {...props}>
    {children}
  </div>
);

import React, { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface InputWrapperProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export const InputWrapper: React.FC<InputWrapperProps> = ({
  label,
  error,
  hint,
  required,
  leftIcon,
  rightIcon,
  className,
  children,
}) => (
  <div className={twMerge(clsx('flex flex-col gap-1.5', className))}>
    {label && (
      <label className="text-sm font-semibold text-slate-300 flex items-center justify-between">
        <span>
          {label} {required && <span className="text-rose-400">*</span>}
        </span>
      </label>
    )}
    <div className="relative flex items-center">
      {leftIcon && <div className="absolute left-3 text-slate-400 pointer-events-none shrink-0">{leftIcon}</div>}
      {children}
      {rightIcon && <div className="absolute right-3 text-slate-400 pointer-events-none shrink-0">{rightIcon}</div>}
    </div>
    {error ? (
      <p className="text-xs text-rose-700 font-medium">{error}</p>
    ) : hint ? (
      <p className="text-xs text-slate-400">{hint}</p>
    ) : null}
  </div>
);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className, required, ...props }, ref) => {
    return (
      <InputWrapper label={label} error={error} hint={hint} required={required} leftIcon={leftIcon} rightIcon={rightIcon}>
        <input
          ref={ref}
          className={twMerge(
            clsx(
              'w-full min-h-11 bg-white border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600 transition-colors disabled:opacity-60 disabled:bg-slate-850',
              leftIcon && 'pl-9',
              rightIcon && 'pr-9',
              error && 'border-rose-500 focus:ring-rose-500/50 focus:border-rose-500',
              className
            )
          )}
          {...props}
        />
      </InputWrapper>
    );
  }
);
Input.displayName = 'Input';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options?: { value: string; label: string; disabled?: boolean }[];
  leftIcon?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, leftIcon, options, children, className, required, ...props }, ref) => {
    return (
      <InputWrapper label={label} error={error} hint={hint} required={required} leftIcon={leftIcon}>
        <select
          ref={ref}
          className={twMerge(
            clsx(
              'w-full min-h-11 bg-white border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600 transition-colors disabled:opacity-60 appearance-none cursor-pointer',
              leftIcon && 'pl-9',
              error && 'border-rose-500 focus:ring-rose-500/50 focus:border-rose-500',
              className
            )
          )}
          {...props}
        >
          {options ? options.map(opt => <option key={opt.value} value={opt.value} disabled={opt.disabled} className="bg-white text-slate-100">{opt.label}</option>) : children}
        </select>
      </InputWrapper>
    );
  }
);
Select.displayName = 'Select';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, required, rows = 3, ...props }, ref) => {
    return (
      <InputWrapper label={label} error={error} hint={hint} required={required}>
        <textarea
          ref={ref}
          rows={rows}
          className={twMerge(
            clsx(
              'w-full bg-white border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600 transition-colors disabled:opacity-60 resize-y',
              error && 'border-rose-500 focus:ring-rose-500/50 focus:border-rose-500',
              className
            )
          )}
          {...props}
        />
      </InputWrapper>
    );
  }
);
Textarea.displayName = 'Textarea';

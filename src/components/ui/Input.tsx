import React, { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode, forwardRef, useId } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown } from 'lucide-react';

interface InputWrapperProps {
  /** id of the control: the label points at it and the error / hint get `${id}-error` / `${id}-hint`. */
  id?: string;
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
  id,
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
      <label htmlFor={id} className="text-xs sm:text-sm font-semibold text-slate-100 flex items-center justify-between">
        <span>
          {label} {required && <span className="text-rose-500 font-bold" aria-hidden="true">*</span>}
        </span>
      </label>
    )}
    <div className="relative flex items-center">
      {leftIcon && <div className="absolute left-3.5 text-slate-400 pointer-events-none shrink-0">{leftIcon}</div>}
      {children}
      {rightIcon && <div className="absolute right-3.5 text-slate-400 pointer-events-none shrink-0">{rightIcon}</div>}
    </div>
    {error ? (
      <p id={id ? `${id}-error` : undefined} className="text-xs text-rose-600 font-medium" role="alert">{error}</p>
    ) : hint ? (
      <p id={id ? `${id}-hint` : undefined} className="text-xs text-slate-400">{hint}</p>
    ) : null}
  </div>
);

/** id, aria-invalid, aria-describedby and required for a control rendered inside InputWrapper. */
function useFieldA11y(idProp: string | undefined, error?: string, hint?: string, describedBy?: string) {
  const auto = useId();
  const id = idProp ?? `f${auto.replace(/:/g, '')}`;
  const ids = [describedBy, error ? `${id}-error` : hint ? `${id}-hint` : undefined].filter(Boolean).join(' ') || undefined;
  return { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': ids } as const;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  pill?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, pill = false, className, required, id: idProp, ...props }, ref) => {
    const a11y = useFieldA11y(idProp, error, hint, props['aria-describedby']);
    return (
      <InputWrapper id={a11y.id} label={label} error={error} hint={hint} required={required} leftIcon={leftIcon} rightIcon={rightIcon}>
        <input
          ref={ref}
          aria-required={required || undefined}
          // the right on-screen keyboard on phones (callers can override)
          inputMode={props.inputMode ?? (props.type === 'number' ? (props.step && !String(props.step).includes('.') && props.step !== 'any' ? 'numeric' : 'decimal')
            : props.type === 'tel' ? 'tel' : props.type === 'email' ? 'email' : props.type === 'url' ? 'url' : undefined)}
          autoComplete={props.autoComplete ?? (props.type === 'email' ? 'email' : props.type === 'tel' ? 'tel' : undefined)}
          aria-label={!label && !props['aria-labelledby'] ? (props['aria-label'] ?? props.placeholder) : props['aria-label']}
          className={twMerge(
            clsx(
              'w-full min-h-[44px] sm:min-h-[40px] h-11 sm:h-10 bg-white border border-slate-700 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-forest-500/20 focus:border-forest-500 transition-all disabled:opacity-60 disabled:bg-slate-850',
              pill ? 'rounded-full px-4' : 'rounded-xl',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error && 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-500',
              className
            )
          )}
          {...props}
          {...a11y}
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
  ({ label, error, hint, leftIcon, options, children, className, required, id: idProp, ...props }, ref) => {
    const a11y = useFieldA11y(idProp, error, hint, props['aria-describedby']);
    return (
      <InputWrapper id={a11y.id} label={label} error={error} hint={hint} required={required} leftIcon={leftIcon}>
        <div className="relative w-full">
          <select
            ref={ref}
            aria-required={required || undefined}
            className={twMerge(
              clsx(
                'w-full min-h-[44px] sm:min-h-[40px] h-11 sm:h-10 bg-white border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-forest-500/20 focus:border-forest-500 transition-all disabled:opacity-60 appearance-none cursor-pointer pr-9',
                leftIcon && 'pl-10',
                error && 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-500',
                className
              )
            )}
            {...props}
            {...a11y}
          >
            {options ? options.map(opt => <option key={opt.value} value={opt.value} disabled={opt.disabled} className="bg-white text-slate-100">{opt.label}</option>) : children}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
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
  ({ label, error, hint, className, required, rows = 3, id: idProp, ...props }, ref) => {
    const a11y = useFieldA11y(idProp, error, hint, props['aria-describedby']);
    return (
      <InputWrapper id={a11y.id} label={label} error={error} hint={hint} required={required}>
        <textarea
          ref={ref}
          aria-required={required || undefined}
          rows={rows}
          className={twMerge(
            clsx(
              'w-full bg-white border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-forest-500/20 focus:border-forest-500 transition-all disabled:opacity-60 resize-y',
              error && 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-500',
              className
            )
          )}
          {...props}
          {...a11y}
        />
      </InputWrapper>
    );
  }
);
Textarea.displayName = 'Textarea';

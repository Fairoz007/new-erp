import React, { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right side: secondary actions first, the primary action last. Wraps under the title on narrow screens. */
  actions?: ReactNode;
  /** Detail pages: a back link above the title. */
  back?: { label: string; onClick: () => void };
  /** Detail pages: key identifier, status badges and other facts under the title. */
  meta?: ReactNode;
}

/** The one page title block: title + description on the left, actions on the right. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions, back, meta }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div className="min-w-0 space-y-1">
      {back && (
        <button type="button" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer" onClick={back.onClick}>
          <ArrowLeft className="w-3.5 h-3.5" /> {back.label}
        </button>
      )}
      <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight break-words">{title}</h1>
      {meta && <div className="flex flex-wrap items-center gap-2 text-xs">{meta}</div>}
      {description && <p className="text-xs sm:text-sm text-slate-400 font-medium">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end shrink-0 print:hidden">{actions}</div>}
  </div>
);

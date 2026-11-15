import React, { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

/** The one empty-state block: an icon, what is missing, and the page's own Add action when there is one. */
export const EmptyState: React.FC<{ title: string; description?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }> = ({
  title, description, icon, action, className = '',
}) => (
  <div className={`flex flex-col items-center justify-center gap-2 px-5 py-12 text-center ${className}`}>
    <span className="w-12 h-12 rounded-2xl bg-slate-850 border border-slate-700 flex items-center justify-center text-slate-400" aria-hidden="true">
      {icon ?? <Inbox className="w-6 h-6 stroke-[1.5]" />}
    </span>
    <p className="text-sm font-semibold text-slate-200">{title}</p>
    {description && <p className="text-xs text-slate-400 max-w-md">{description}</p>}
    {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
  </div>
);

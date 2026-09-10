import React, { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { clsx } from 'clsx';

interface StatCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: ReactNode;
  trend?: {
    value: string | number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  variant?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'blue' | 'purple' | 'slate';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subValue,
  icon,
  trend,
  variant = 'indigo',
  onClick,
}) => {
  const iconVariants = {
    indigo: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border border-amber-100',
    rose: 'bg-rose-50 text-rose-700 border border-rose-100',
    blue: 'bg-blue-50 text-blue-700 border border-blue-100',
    purple: 'bg-purple-50 text-purple-700 border border-purple-100',
    slate: 'bg-slate-800 text-slate-400 border border-slate-700',
  };

  return (
    <div
      onClick={onClick}
      className={clsx(
        'min-w-0 bg-white border border-slate-700 rounded-[14px] p-4 sm:p-5 flex flex-col justify-between transition-all shadow-[0_1px_3px_rgba(0,0,0,0.02)] relative overflow-hidden',
        onClick && 'cursor-pointer hover:border-indigo-200 hover:bg-slate-850/40 hover:shadow-xs'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400 leading-tight truncate">{title}</p>
          <h4 className="mt-2 text-xl sm:text-2xl font-semibold text-slate-100 tracking-tight tabular-nums break-words">
            {value}
          </h4>
        </div>
        <div className={clsx('p-2 rounded-lg shrink-0', iconVariants[variant])}>
          {icon}
        </div>
      </div>

      {(subValue || trend) && (
        <div className="mt-3 pt-2.5 border-t border-slate-700 flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-400">
          {trend ? (
            <div className="flex items-center gap-1 font-medium">
              <span
                className={clsx(
                  'inline-flex items-center gap-0.5 text-xs',
                  trend.direction === 'up'
                    ? 'text-emerald-700'
                    : trend.direction === 'down'
                    ? 'text-rose-700'
                    : 'text-slate-400'
                )}
              >
                {trend.direction === 'up' ? (
                  <TrendingUp className="w-3 h-3 text-emerald-600" />
                ) : trend.direction === 'down' ? (
                  <TrendingDown className="w-3 h-3 text-rose-600" />
                ) : (
                  <Minus className="w-3 h-3 text-slate-400" />
                )}
                <span>{trend.value}</span>
              </span>
              {trend.label && <span className="text-slate-400 text-[11px]">{trend.label}</span>}
            </div>
          ) : (
            <div />
          )}

          {subValue && <span className="text-[11px] font-normal text-slate-400 truncate">{subValue}</span>}
        </div>
      )}
    </div>
  );
};

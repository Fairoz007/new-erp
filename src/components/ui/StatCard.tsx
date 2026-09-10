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
    slate: 'bg-slate-850 text-slate-400 border border-slate-700',
  };

  return (
    <div
      onClick={onClick}
      className={clsx(
        'min-w-0 bg-white border border-slate-700 rounded-xl p-5 flex flex-col justify-between transition-all shadow-sm relative overflow-hidden',
        onClick && 'cursor-pointer hover:border-indigo-200 hover:shadow-md focus-within:ring-2 focus-within:ring-indigo-600'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-400 leading-tight">{title}</p>
          <h4 className="mt-2 text-xl xl:text-2xl font-bold text-slate-100 tracking-tight tabular-nums break-words">{value}</h4>
        </div>
        <div className={clsx('p-2.5 rounded-xl shrink-0', iconVariants[variant])}>
          {icon}
        </div>
      </div>

      {(subValue || trend) && (
        <div className="mt-4 pt-3 border-t border-slate-700 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-400">
          {trend ? (
            <div className="flex items-center gap-1.5 font-medium">
              <span
                className={clsx(
                  'flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[11px]',
                  trend.direction === 'up'
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                    : trend.direction === 'down'
                    ? 'bg-rose-950/80 text-rose-400 border border-rose-800/50'
                    : 'bg-slate-800 text-slate-400'
                )}
              >
                {trend.direction === 'up' ? (
                  <TrendingUp className="w-3 h-3" />
                ) : trend.direction === 'down' ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                {trend.value}
              </span>
              {trend.label && <span className="text-slate-400 text-xs">{trend.label}</span>}
            </div>
          ) : (
            <div />
          )}

          {subValue && <span className="text-xs font-medium text-slate-400">{subValue}</span>}
        </div>
      )}
    </div>
  );
};

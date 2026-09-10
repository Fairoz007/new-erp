import React, { ReactNode } from 'react';
import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface KPIMetricItem {
  id?: string;
  title: string;
  value: string | number;
  subValue?: string;
  icon?: ReactNode;
  trend?: {
    value: string | number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  statusBadge?: string;
  statusVariant?: 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate';
  onClick?: () => void;
  accentColor?: string;
}

interface KPIGroupProps {
  metrics: KPIMetricItem[];
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
  title?: string;
  action?: ReactNode;
}

export const KPIGroup: React.FC<KPIGroupProps> = ({
  metrics,
  columns,
  className,
  title,
  action,
}) => {
  const colCount = columns || (metrics.length as 2 | 3 | 4 | 5 | 6);

  const gridColsClass = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-5',
    6: 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
  }[colCount] || 'sm:grid-cols-3';

  return (
    <div className={clsx('bg-white border border-slate-700 rounded-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden', className)}>
      {(title || action) && (
        <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between gap-3 bg-white">
          {title && <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className={clsx('grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-slate-700', gridColsClass)}>
        {metrics.map((metric, index) => (
          <div
            key={metric.id || index}
            onClick={metric.onClick}
            className={clsx(
              'p-4 sm:p-5 flex flex-col justify-between transition-colors',
              metric.onClick && 'cursor-pointer hover:bg-slate-850/60 group'
            )}
          >
            {/* Top row: Label + optional icon */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-400 truncate group-hover:text-slate-200 transition-colors">
                {metric.title}
              </span>
              {metric.icon && (
                <span className="text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0">
                  {metric.icon}
                </span>
              )}
            </div>

            {/* Middle: Big Metric Value */}
            <div className="mt-2.5 mb-1.5">
              <span className="text-2xl sm:text-[28px] lg:text-[30px] font-semibold text-slate-100 tracking-tight tabular-nums leading-none block">
                {metric.value}
              </span>
            </div>

            {/* Bottom: Trend or SubValue or Status */}
            <div className="mt-1 flex items-center flex-wrap gap-2 text-xs">
              {metric.trend && (
                <span
                  className={clsx(
                    'inline-flex items-center gap-1 font-medium',
                    metric.trend.direction === 'up'
                      ? 'text-emerald-700'
                      : metric.trend.direction === 'down'
                      ? 'text-rose-700'
                      : 'text-slate-400'
                  )}
                >
                  {metric.trend.direction === 'up' ? (
                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                  ) : metric.trend.direction === 'down' ? (
                    <TrendingDown className="w-3 h-3 text-rose-600" />
                  ) : (
                    <Minus className="w-3 h-3 text-slate-400" />
                  )}
                  <span>{metric.trend.value}</span>
                  {metric.trend.label && (
                    <span className="text-slate-400 font-normal ml-0.5">{metric.trend.label}</span>
                  )}
                </span>
              )}

              {metric.statusBadge && (
                <span
                  className={clsx(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium',
                    metric.statusVariant === 'emerald' && 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                    metric.statusVariant === 'amber' && 'bg-amber-50 text-amber-700 border border-amber-200',
                    metric.statusVariant === 'rose' && 'bg-rose-50 text-rose-700 border border-rose-200',
                    metric.statusVariant === 'indigo' && 'bg-indigo-50 text-indigo-700 border border-indigo-200',
                    (!metric.statusVariant || metric.statusVariant === 'slate') && 'bg-slate-800 text-slate-300 border border-slate-700'
                  )}
                >
                  {metric.statusBadge}
                </span>
              )}

              {metric.subValue && !metric.trend && (
                <span className="text-slate-400 text-xs font-normal truncate">
                  {metric.subValue}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

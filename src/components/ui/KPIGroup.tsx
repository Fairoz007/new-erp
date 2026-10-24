import React, { ReactNode } from 'react';
import { clsx } from 'clsx';
import { TrendingUp, TrendingDown, Minus, ArrowUpRight } from 'lucide-react';

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
    <div className={clsx('bg-white border border-slate-700 rounded-[20px] shadow-card overflow-hidden', className)}>
      {(title || action) && (
        <div className="px-5 py-3.5 border-b border-slate-700 flex items-center justify-between gap-3 bg-white">
          {title && <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h3>}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className={clsx('grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-slate-700', gridColsClass)}>
        {metrics.map((metric, index) => (
          <div
            key={metric.id || index}
            onClick={metric.onClick}
            className={clsx(
              'p-5 sm:p-6 flex flex-col justify-between transition-colors',
              metric.onClick && 'cursor-pointer hover:bg-slate-850/70 group'
            )}
          >
            {/* Top row: Label + action arrow */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-semibold text-slate-400 group-hover:text-slate-100 transition-colors truncate">
                {metric.title}
              </span>
              <div className="w-6 h-6 rounded-full border border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-forest-500 group-hover:border-forest-500/40 transition-colors shrink-0">
                {metric.icon || <ArrowUpRight className="w-3.5 h-3.5" />}
              </div>
            </div>

            {/* Middle: Big Metric Value */}
            <div className="mt-3 mb-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight tabular-nums leading-tight block">
                {metric.value}
              </span>
            </div>

            {/* Bottom: Trend or SubValue or Status */}
            <div className="mt-1 flex items-center flex-wrap gap-2 text-xs">
              {metric.trend && (
                <span
                  className={clsx(
                    'inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full text-xs',
                    metric.trend.direction === 'up'
                      ? 'bg-[#DCEFE5] text-[#06452F]'
                      : metric.trend.direction === 'down'
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-slate-800 text-slate-400'
                  )}
                >
                  {metric.trend.direction === 'up' ? (
                    <TrendingUp className="w-3.5 h-3.5 text-forest-500" />
                  ) : metric.trend.direction === 'down' ? (
                    <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                  ) : (
                    <Minus className="w-3.5 h-3.5 text-slate-400" />
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
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                    metric.statusVariant === 'emerald' && 'bg-[#DCEFE5] text-[#06452F]',
                    metric.statusVariant === 'amber' && 'bg-amber-50 text-amber-700 border border-amber-200',
                    metric.statusVariant === 'rose' && 'bg-rose-50 text-rose-700 border border-rose-200',
                    metric.statusVariant === 'indigo' && 'bg-[#DCEFE5] text-[#06452F]',
                    (!metric.statusVariant || metric.statusVariant === 'slate') && 'bg-slate-800 text-slate-400'
                  )}
                >
                  {metric.statusBadge}
                </span>
              )}

              {metric.subValue && (
                <span className="text-xs text-slate-400 font-medium truncate">
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

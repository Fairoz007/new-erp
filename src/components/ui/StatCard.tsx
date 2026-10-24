import React, { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus, ArrowUpRight } from 'lucide-react';
import { clsx } from 'clsx';

export interface StatCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon?: ReactNode;
  trend?: {
    value: string | number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  variant?: 'forest' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'blue' | 'purple' | 'slate';
  isHero?: boolean;
  onClick?: () => void;
  actionIcon?: ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subValue,
  icon,
  trend,
  variant = 'slate',
  isHero = false,
  onClick,
  actionIcon,
}) => {
  const isDarkHero = isHero || variant === 'forest';

  return (
    <div
      onClick={onClick}
      className={clsx(
        'min-w-0 rounded-[20px] p-5 sm:p-6 flex flex-col justify-between transition-all relative overflow-hidden',
        isDarkHero
          ? 'bg-[#086343] text-white shadow-card hover:bg-[#06452F]'
          : 'bg-white border border-slate-700 text-slate-100 shadow-card hover:border-forest-500/40 hover:shadow-elevated',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Top Header: Title + Arrow Action Button */}
      <div className="flex items-center justify-between gap-3">
        <span
          className={clsx(
            'text-xs sm:text-sm font-semibold truncate',
            isDarkHero ? 'text-white/90' : 'text-slate-100'
          )}
        >
          {title}
        </span>

        <div
          className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105',
            isDarkHero
              ? 'bg-white/15 text-white hover:bg-white/25'
              : 'border border-slate-700 bg-white text-slate-600 hover:bg-slate-800'
          )}
        >
          {actionIcon || <ArrowUpRight className="w-4 h-4 stroke-[2.2]" />}
        </div>
      </div>

      {/* Main Metric Value */}
      <div className="my-4">
        <h4
          className={clsx(
            'text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums break-words',
            isDarkHero ? 'text-white' : 'text-slate-100'
          )}
        >
          {value}
        </h4>
      </div>

      {/* Bottom Subvalue / Pill Badge */}
      {(subValue || trend) && (
        <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
          {trend ? (
            <div
              className={clsx(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                isDarkHero
                  ? 'bg-white/15 text-white/95'
                  : trend.direction === 'up'
                  ? 'bg-[#DCEFE5] text-[#06452F]'
                  : trend.direction === 'down'
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-slate-800 text-slate-400'
              )}
            >
              <span className="inline-flex items-center">
                {trend.direction === 'up' ? (
                  <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
                ) : trend.direction === 'down' ? (
                  <TrendingDown className="w-3.5 h-3.5 mr-0.5" />
                ) : (
                  <Minus className="w-3 h-3 mr-0.5" />
                )}
                <span>{trend.value}</span>
              </span>
              {trend.label && (
                <span className={isDarkHero ? 'text-white/80' : 'text-slate-400'}>
                  {trend.label}
                </span>
              )}
            </div>
          ) : null}

          {subValue && (
            <span
              className={clsx(
                'text-[11px] font-medium truncate',
                isDarkHero ? 'text-white/75' : 'text-slate-400'
              )}
            >
              {subValue}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

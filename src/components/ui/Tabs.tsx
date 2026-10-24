import React, { ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface TabItem {
  id: string;
  label: string;
  count?: number | string;
  icon?: ReactNode;
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'pills' | 'segmented';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className,
}) => {
  if (variant === 'segmented') {
    return (
      <div className={twMerge(clsx('flex items-center p-1 bg-slate-850 border border-slate-700 rounded-full gap-1 overflow-x-auto', className))}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && onChange(tab.id)}
              disabled={tab.disabled}
              className={clsx(
                'flex min-h-[36px] items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer select-none',
                isActive
                  ? 'bg-white text-[#086343] shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/60',
                tab.disabled && 'opacity-40 cursor-not-allowed'
              )}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={clsx(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold',
                    isActive ? 'bg-[#DCEFE5] text-[#06452F]' : 'bg-slate-800 text-slate-400'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'pills') {
    return (
      <div className={twMerge(clsx('flex items-center gap-2 overflow-x-auto pb-1', className))}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && onChange(tab.id)}
              disabled={tab.disabled}
              className={clsx(
                'flex min-h-[38px] items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer select-none',
                isActive
                  ? 'bg-[#086343] text-white shadow-xs'
                  : 'bg-white border border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-850',
                tab.disabled && 'opacity-40 cursor-not-allowed'
              )}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={clsx(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold',
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Underline
  return (
    <div className={twMerge(clsx('flex items-center border-b border-slate-700 gap-6 overflow-x-auto', className))}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && onChange(tab.id)}
            disabled={tab.disabled}
            className={clsx(
              'flex items-center gap-2 py-3 border-b-2 text-xs font-semibold transition-all whitespace-nowrap cursor-pointer select-none',
              isActive
                ? 'border-[#086343] text-[#086343]'
                : 'border-transparent text-slate-400 hover:text-slate-100 hover:border-slate-400',
              tab.disabled && 'opacity-40 cursor-not-allowed'
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={clsx(
                  'px-2 py-0.5 rounded-full text-[10px] font-bold',
                  isActive ? 'bg-[#DCEFE5] text-[#06452F]' : 'bg-slate-800 text-slate-400'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

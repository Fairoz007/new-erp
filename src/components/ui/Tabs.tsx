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
      <div className={twMerge(clsx('flex items-center p-1 bg-slate-850 border border-slate-700 rounded-xl gap-1 overflow-x-auto', className))}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && onChange(tab.id)}
              disabled={tab.disabled}
              className={clsx(
                'flex min-h-10 items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer select-none',
                isActive
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-700 font-semibold'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white',
                tab.disabled && 'opacity-40 cursor-not-allowed'
              )}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={clsx(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-semibold',
                    isActive ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-800 text-slate-400'
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
      <div className={twMerge(clsx('flex items-center gap-1.5 overflow-x-auto pb-1', className))}>
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && onChange(tab.id)}
              disabled={tab.disabled}
              className={clsx(
                'flex min-h-10 items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer select-none border',
                isActive
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold'
                  : 'bg-white border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-850',
                tab.disabled && 'opacity-40 cursor-not-allowed'
              )}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={clsx(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-semibold',
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-800 text-slate-400'
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

  // Underline default
  return (
    <div className={twMerge(clsx('flex items-center gap-6 border-b border-slate-800 overflow-x-auto', className))}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && onChange(tab.id)}
            disabled={tab.disabled}
            className={clsx(
              'flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-all whitespace-nowrap cursor-pointer select-none',
              isActive
                ? 'border-indigo-600 text-indigo-700 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-100 hover:border-slate-600',
              tab.disabled && 'opacity-40 cursor-not-allowed'
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={clsx(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                isActive ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-800 text-slate-400'
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

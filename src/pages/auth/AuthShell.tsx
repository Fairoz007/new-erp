import React, { ReactNode } from 'react';
import { Shield } from 'lucide-react';

// Shared frame for the sign-in / set-password / account-status screens.
export const AuthShell: React.FC<{ title: string; subtitle?: string; children: ReactNode }> = ({ title, subtitle, children }) => (
  <div className="min-h-screen w-full bg-surface-secondary flex items-center justify-center px-4 py-10 font-sans">
    <div className="w-full max-w-sm">
      <div className="flex items-center justify-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#086343] flex items-center justify-center text-white shadow-sm">
          <Shield className="w-5 h-5 text-white stroke-[2.2]" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-extrabold text-slate-100 tracking-tight leading-none">FleetX</span>
          <span className="text-[10px] bg-[#DCEFE5] text-[#06452F] font-bold px-1.5 py-0.5 rounded-full">ERP</span>
        </div>
      </div>
      <div className="bg-white border border-slate-700 rounded-[20px] shadow-card p-6 sm:p-7 space-y-5">
        <div>
          <h1 className="text-lg font-extrabold text-slate-100 tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  </div>
);

export const AuthNotice: React.FC<{ tone: 'error' | 'info' | 'success'; children: ReactNode }> = ({ tone, children }) => {
  const styles = {
    error: 'bg-rose-50 border-rose-200 text-rose-700',
    info: 'bg-slate-850 border-slate-700 text-slate-300',
    success: 'bg-[#DCEFE5] border-[#21865B]/30 text-[#06452F]',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`text-xs rounded-xl border px-3.5 py-2.5 ${styles[tone]}`}>
      {children}
    </div>
  );
};

import { PRODUCT_NAME } from '../../lib/branding';
import React, { ReactNode } from 'react';
import { BRAND_ALT, BRAND_LOGO_URL } from '../../lib/brandAssets';

// Shared frame for the sign-in / set-password / account-status screens.
export const AuthShell: React.FC<{ title: string; subtitle?: string; children: ReactNode }> = ({ title, subtitle, children }) => (
  <div className="min-h-screen w-full bg-surface-secondary flex items-center justify-center px-4 py-10 font-sans">
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center gap-2 mb-6">
        <img src={BRAND_LOGO_URL} alt={BRAND_ALT} width={240} height={121} className="h-auto w-48 sm:w-56" />
        <span className="text-xs font-semibold text-slate-400 tracking-wide">{PRODUCT_NAME}</span>
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

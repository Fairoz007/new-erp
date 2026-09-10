import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useUI } from '../../context/UIContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useUI();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="pointer-events-auto bg-white border border-slate-700 rounded-xl p-4 shadow-xl flex items-start gap-3 text-slate-100 animate-in slide-in-from-bottom-5 duration-200"
        >
          {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
          {t.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
          {t.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
          {t.type === 'info' && <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />}

          <div className="flex-1 text-sm">
            <p className="font-semibold text-slate-100">{t.title}</p>
            {t.message && <p className="text-slate-400 mt-0.5 leading-relaxed">{t.message}</p>}
          </div>

          <button
            onClick={() => removeToast(t.id)}
            className="text-slate-500 hover:text-white p-0.5 rounded cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

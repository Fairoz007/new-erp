// Setup Wizard (Super Admin only; the RPCs re-check). Progress is saved after every step so the
// wizard resumes where it was left, on any device.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, LogOut } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useOrg } from '../../context/OrgContext';
import { useAuth } from '../../context/AuthContext';
import { PRODUCT_NAME } from '../../lib/branding';
import * as org from '../../services/org';
import { OrgProfileStep } from './steps/OrgProfileStep';
import { UniversalSettingsStep } from './steps/UniversalSettingsStep';
import { OfficesStep } from './steps/OfficesStep';
import { RolesEditor } from './RolesEditor';
import { UsersStep } from './steps/UsersStep';
import { VehicleTypesStep } from './steps/VehicleTypesStep';
import { ExpenseCategoriesStep } from './steps/ExpenseCategoriesStep';
import { OpeningBalancesStep } from './steps/OpeningBalancesStep';
import { ReviewStep } from './steps/ReviewStep';
import { NoticeBar, errText, useNotice, useOffices } from './shared';

export const STEPS = [
  { n: 1, title: 'Organization', sub: 'Legal name, contact, logo' },
  { n: 2, title: 'Universal settings', sub: 'Currency, year, tax, numbering' },
  { n: 3, title: 'Offices', sub: 'Branches and depots' },
  { n: 4, title: 'Roles & permissions', sub: 'Who can do what' },
  { n: 5, title: 'Users', sub: 'Invite your team' },
  { n: 6, title: 'Vehicles & fields', sub: 'Vehicle types, custom fields' },
  { n: 7, title: 'Expenses', sub: 'Categories, recurring costs' },
  { n: 8, title: 'Opening balances', sub: 'Banks, parties, assets (CSV)' },
  { n: 9, title: 'Review & finish', sub: 'Go live' },
];

export const SetupWizard: React.FC<{ onDefer?: () => void }> = ({ onDefer }) => {
  const { organization, reload, baseCurrency } = useOrg();
  const { signOut, currentUser } = useAuth();
  const { offices, reload: reloadOffices } = useOffices();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState<number[]>([]);
  const [notice, setNotice] = useNotice();
  // A step with its own form (1, 2) registers its save while it has unsaved edits, so
  // "Save & continue" saves them instead of leaving them behind.
  const pendingSave = useRef<(() => Promise<boolean>) | null>(null);
  const registerSave = useCallback((fn: (() => Promise<boolean>) | null) => { pendingSave.current = fn; }, []);

  useEffect(() => {
    if (organization) {
      setStep(organization.setupStep || 1);
      setDone(organization.setupCompletedSteps);
    }
    // only when the organization first appears / changes identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  // step 1 needs a saved organization; step 3 needs an office before moving on
  const blocker = (s: number): string | null => {
    if (s === 1 && !organization) return 'Save the organization profile to continue.';
    if (s === 3 && offices.length === 0) return 'Add at least one office to continue.';
    return null;
  };

  const go = async (to: number, markDone = false) => {
    const nextDone = markDone ? Array.from(new Set([...done, step])) : done;
    setDone(nextDone);
    setStep(to);
    window.scrollTo({ top: 0 });
    try { await org.saveSetupProgress(to, nextDone); }
    catch (e) { setNotice({ tone: 'error', text: `Progress not saved: ${errText(e)}` }); }
  };

  const [advancing, setAdvancing] = useState(false);
  const next = async () => {
    if (advancing) return;
    setAdvancing(true);
    try {
      let saved = false;
      if (pendingSave.current) {
        if (!(await pendingSave.current())) return;   // the step shows why (field errors or a notice)
        saved = true;
      }
      // step 1 has just created the organization when it saved; the context catches up on the next render
      const b = saved && step === 1 ? null : blocker(step);
      if (b) { setNotice({ tone: 'error', text: b }); return; }
      pendingSave.current = null;
      await go(Math.min(9, step + 1), true);
    } finally {
      setAdvancing(false);
    }
  };

  const body = (() => {
    switch (step) {
      case 1: return <OrgProfileStep onSaved={() => setNotice(null)} registerSave={registerSave} />;
      case 2: return <UniversalSettingsStep registerSave={registerSave} />;
      case 3: return <OfficesStep onChanged={() => void reloadOffices()} />;
      case 4: return <RolesEditor />;
      case 5: return <UsersStep />;
      case 6: return <VehicleTypesStep />;
      case 7: return <ExpenseCategoriesStep />;
      case 8: return <OpeningBalancesStep currency={baseCurrency} />;
      default: return <ReviewStep goTo={s => void go(s)} onFinished={() => void reload()} />;
    }
  })();
  const cur = STEPS[step - 1];

  return (
    <div className="min-h-screen bg-surface-secondary">
      <header className="bg-white border-b border-slate-700 px-4 sm:px-6 h-14 flex items-center gap-3">
        <span className="font-extrabold text-slate-100 truncate">{organization?.tradeName || organization?.legalName || PRODUCT_NAME}</span>
        <span className="text-xs text-slate-400 hidden sm:inline">Setup</span>
        <div className="ml-auto flex items-center gap-2">
          {onDefer && offices.length > 0 && <Button size="xs" variant="ghost" onClick={onDefer}>Continue to app</Button>}
          <span className="text-xs text-slate-400 hidden sm:inline">{currentUser.name}</span>
          <Button size="xs" variant="outline" onClick={() => void signOut()} leftIcon={<LogOut className="w-3 h-3" />}>Sign out</Button>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
        {/* steps: horizontal scroller on phones, sidebar on desktop */}
        <nav aria-label="Setup steps" className="lg:sticky lg:top-5 self-start">
          <ol className="flex lg:flex-col gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {STEPS.map(s => {
              const isDone = done.includes(s.n);
              const active = s.n === step;
              const reachable = s.n === 1 || !!organization;
              return (
                <li key={s.n} className="shrink-0">
                  <button type="button" disabled={!reachable} onClick={() => void go(s.n)}
                    className={`w-full text-left flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs transition ${active ? 'bg-white border border-[#086343] shadow-card' : 'border border-transparent hover:bg-white/70'} disabled:opacity-50`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${isDone ? 'bg-[#086343] text-white' : active ? 'bg-[#DCEFE5] text-[#086343]' : 'bg-slate-850 text-slate-400'}`}>
                      {isDone ? <Check className="w-3.5 h-3.5" /> : s.n}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-100 whitespace-nowrap">{s.title}</span>
                      <span className="hidden lg:block text-[10px] text-slate-400 truncate">{s.sub}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <main className="min-w-0 space-y-4">
          <div>
            <p className="text-xs text-slate-400">Step {step} of 9</p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100">{cur.title}</h1>
            <p className="text-xs text-slate-400">{cur.sub}</p>
          </div>
          <NoticeBar notice={notice} onClose={() => setNotice(null)} />
          {body}
          {step < 9 && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-700">
              <Button variant="outline" disabled={step === 1} onClick={() => void go(step - 1)} leftIcon={<ArrowLeft className="w-4 h-4" />}>Back</Button>
              <div className="flex gap-2">
                {[5, 7, 8].includes(step) && <Button variant="ghost" onClick={() => void go(step + 1)}>Skip for now</Button>}
                <Button onClick={() => void next()} isLoading={advancing} rightIcon={<ArrowRight className="w-4 h-4" />}>Save & continue</Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

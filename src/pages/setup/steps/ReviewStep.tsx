// Step 9: readiness checks from setup_checklist(); finishing calls complete_setup(), which re-runs them.
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Rocket } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import * as org from '../../../services/org';
import type { ChecklistItem } from '../../../services/org';
import { LoadState, NoticeBar, Section, errText, useNotice } from '../shared';

export const ReviewStep: React.FC<{ onFinished: () => void; goTo: (step: number) => void }> = ({ onFinished, goTo }) => {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useNotice();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setItems(await org.fetchSetupChecklist()); } catch (e) { setError(errText(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const STEP_FOR: Record<string, number> = {
    organization: 1, tax_rates: 2, payment_terms: 2, document_formats: 2, offices: 3, chart_of_accounts: 3, roles: 4, vehicle_types: 6, expense_categories: 7,
  };
  const ready = items.length > 0 && items.every(i => i.ok);

  const finish = async () => {
    setBusy(true);
    try {
      await org.completeSetup();
      onFinished();
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
      void load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <Section title="Review" description="Everything below must pass before the organization goes live. Every setting stays editable later in Settings.">
        <LoadState loading={loading} error={error} onRetry={load}>
          <ul className="divide-y divide-slate-700/60">
            {items.map(i => (
              <li key={i.key} className="py-2.5 flex items-center gap-3 text-sm">
                {i.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <XCircle className="w-5 h-5 text-rose-500 shrink-0" />}
                <span className="flex-1 text-slate-100">{i.label}{i.detail && <span className="block text-xs text-rose-500">Missing for: {i.detail}</span>}</span>
                {!i.ok && STEP_FOR[i.key] && <Button size="xs" variant="outline" onClick={() => goTo(STEP_FOR[i.key])}>Fix</Button>}
              </li>
            ))}
          </ul>
        </LoadState>
      </Section>
      <div className="flex justify-end">
        <Button size="lg" onClick={finish} isLoading={busy} disabled={!ready} leftIcon={<Rocket className="w-4 h-4" />}>Finish setup</Button>
      </div>
    </div>
  );
};

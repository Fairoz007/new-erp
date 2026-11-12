import React, { Suspense, lazy, useRef, useState } from 'react';
import { ApprovalRulesEditor } from './ApprovalRulesEditor';
import { Database, Download, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { Badge } from '../../components/ui/Badge';
import { useOrg } from '../../context/OrgContext';
import { useUI } from '../../context/UIContext';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { exportToJSON } from '../../utils/export';
import type { CollectionKey } from '../../services/core';
import { expenseSource, paymentSource, fetchAllOf } from '../../services/queries';
import { fetchAllInvoicesForExport, fetchAllJournalsForExport } from '../../services/queries-system';

// Collections held in the app (loaded on first read); the large tables are fetched from the
// database page by page (≤1000 rows per request) when the export runs.
const CLIENT_EXPORT_KEYS = ['companies', 'vehicles', 'tyres', 'tyreEvents', 'oilChanges', 'maintenanceRecords', 'workOrders',
  'accidents', 'suppliers', 'customers', 'reconciliations', 'bankAccounts', 'chartOfAccounts', 'fixedAssets', 'depreciationRuns',
  'employees', 'payrollRuns', 'documents', 'approvalRules', 'approvalRequests'] as const;
const EXPORT_ORDER = ['companies', 'vehicles', 'tyres', 'tyreEvents', 'oilChanges', 'maintenanceRecords', 'workOrders', 'accidents',
  'expenses', 'suppliers', 'customers', 'invoices', 'reconciliations', 'payments', 'bankAccounts', 'chartOfAccounts', 'journalEntries',
  'fixedAssets', 'depreciationRuns', 'employees', 'payrollRuns', 'documents', 'approvalRules', 'approvalRequests'];

// Removed with the move to the shared database (see docs/audit/agent-D.md):
//  * "Import Backup"  - would overwrite the browser cache only; a shared DB must never be bulk-overwritten from a paste box.
//  * "Reset to Default Data" - would re-seed fake demo rows; there is no equivalent for a shared database.
//  * Hard-coded "5.0% VAT" / "Decimal safe math" fields.
//  * The per-browser "display currency" (amounts were relabelled, not converted); the organization
//    base currency (Universal settings) is used everywhere instead.
// Every Setup Wizard step is editable here; the same components are used.
const OrgProfileStep = lazy(() => import('../setup/steps/OrgProfileStep').then(m => ({ default: m.OrgProfileStep })));
const UniversalSettingsStep = lazy(() => import('../setup/steps/UniversalSettingsStep').then(m => ({ default: m.UniversalSettingsStep })));
const OfficesStep = lazy(() => import('../setup/steps/OfficesStep').then(m => ({ default: m.OfficesStep })));
const VehicleTypesEditor = lazy(() => import('../setup/steps/VehicleTypesStep').then(m => ({ default: m.VehicleTypesEditor })));
const FieldBuilder = lazy(() => import('../setup/FieldBuilder').then(m => ({ default: m.FieldBuilder })));
const ExpenseCategoriesStep = lazy(() => import('../setup/steps/ExpenseCategoriesStep').then(m => ({ default: m.ExpenseCategoriesStep })));
const OpeningBalancesStep = lazy(() => import('../setup/steps/OpeningBalancesStep').then(m => ({ default: m.OpeningBalancesStep })));

type SettingsTab = 'organization' | 'universal' | 'offices' | 'vehicle-types' | 'custom-fields' | 'expenses' | 'opening' | 'approvals' | 'data';
export const SettingsPage: React.FC = () => {
  const fleet = useFleet();
  const { approvalRules } = fleet;
  const { currentUser, hasPermission, isSuperAdmin } = useAuth();
  const { baseCurrency, organization } = useOrg();
  const canEdit = hasPermission('edit', 'settings');
  const canEditOffices = hasPermission('edit', 'companies') || hasPermission('create', 'companies');
  const [tab, setTab] = useState<SettingsTab>('organization');
  const { addToast } = useUI();
  const [exportStep, setExportStep] = useState<string | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const exporting = exportStep !== null;
  // Reading the collections on the Data export tab starts loading them (FleetContext loads on first read).
  const clientCollections = tab === 'data'
    ? Object.fromEntries(CLIENT_EXPORT_KEYS.map(k => [k, (fleet as unknown as Record<string, unknown[]>)[k]])) as Record<string, unknown[]>
    : {};
  const clientLoaded = CLIENT_EXPORT_KEYS.every(k => fleet.isCollectionLoaded(k as CollectionKey));
  const clientErrors = CLIENT_EXPORT_KEYS.filter(k => fleet.loadErrors[k as CollectionKey]);

  // Read-only export of exactly what this user can see (RLS filters every query).
  const handleExport = async () => {
    if (exporting) { exportAbort.current?.abort(); return; }
    if (!clientLoaded || clientErrors.length) return;
    const ctrl = new AbortController();
    exportAbort.current = ctrl;
    const step = (label: string) => (p: { loaded: number; total: number }) =>
      setExportStep(`${label} ${p.loaded.toLocaleString()} / ${p.total.toLocaleString()}`);
    try {
      setExportStep('Starting…');
      const invoices = await fetchAllInvoicesForExport(step('Invoices'), ctrl.signal);
      const payments = await fetchAllOf(paymentSource({}), step('Payments'), ctrl.signal);
      const expenses = await fetchAllOf(expenseSource({}), step('Expenses'), ctrl.signal);
      const journalEntries = await fetchAllJournalsForExport(step('Journal entries'), ctrl.signal);
      const all: Record<string, unknown[]> = { ...clientCollections, invoices, payments, expenses, journalEntries };
      const collections = Object.fromEntries(EXPORT_ORDER.map(k => [k, all[k] ?? []])) as Record<string, unknown[]>;
      const counts = Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
      exportToJSON('ERP_Visible_Data', {
        exportedAt: new Date().toISOString(),
        exportedBy: { id: currentUser.id, name: currentUser.name, role: currentUser.role },
        note: 'Read-only snapshot of the records visible to this user. Documents are listed as metadata only (no file contents).',
        counts,
        data: collections,
      });
      addToast({ type: 'success', title: 'Export created', message: 'A JSON file with your visible data was downloaded.' });
    } catch (e) {
      if ((e as Error).name === 'AbortError') addToast({ type: 'info', title: 'Export cancelled', message: 'No file was created.' });
      else addToast({ type: 'error', title: 'Export failed', message: (e as Error).message });
    } finally {
      setExportStep(null);
      exportAbort.current = null;
    }
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'organization', label: 'Organization' },
    { id: 'universal', label: 'Universal settings' },
    { id: 'offices', label: 'Offices' },
    { id: 'vehicle-types', label: 'Vehicle types' },
    { id: 'custom-fields', label: 'Custom fields' },
    { id: 'expenses', label: 'Expense categories' },
    ...(hasPermission('create', 'accounting') ? [{ id: 'opening' as SettingsTab, label: 'Opening balances' }] : []),
    { id: 'approvals', label: 'Approval rules' },
    { id: 'data', label: 'Data export' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">Settings</h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Organization profile and the settings every office inherits. Base currency: {baseCurrency}.
          </p>
        </div>
        <div className="flex gap-2">
          {!canEdit && <Badge variant="slate">Read-only</Badge>}
          {organization && organization.setupStatus !== 'completed' && <Badge variant="amber">Setup not finished</Badge>}
        </div>
      </div>

      <Tabs variant="pills" tabs={tabs} activeTab={tab} onChange={id => setTab(id as SettingsTab)} className="overflow-x-auto" />

      <Suspense fallback={<p className="text-xs text-slate-400">Loading…</p>}>
        {tab === 'organization' && <OrgProfileStep readOnly={!canEdit} />}
        {tab === 'universal' && <UniversalSettingsStep readOnly={!canEdit} />}
        {tab === 'offices' && <OfficesStep readOnly={!canEditOffices} onChanged={() => void fleet.reload(['companies'])} />}
        {tab === 'vehicle-types' && <VehicleTypesEditor readOnly={!canEdit} />}
        {tab === 'custom-fields' && <FieldBuilder readOnly={!canEdit} />}
        {tab === 'expenses' && <ExpenseCategoriesStep readOnly={!canEdit} />}
        {tab === 'opening' && <OpeningBalancesStep currency={baseCurrency} />}
      </Suspense>

      {tab === 'approvals' && (
        <Card className="rounded-[20px] bg-white border border-slate-700 shadow-card">
          <CardHeader>
            <CardTitle>Approval rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <ApprovalRulesEditor readOnly={!(isSuperAdmin || canEdit)} />
          </CardContent>
        </Card>
      )}

      {tab === 'data' && (
      <Card className="rounded-[20px] bg-white border border-slate-700 shadow-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-forest-500" />
            <CardTitle>Data Export</CardTitle>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Records are stored in the shared company database and protected by role-based access. The export contains only what your role and offices allow you to see.
          </p>
        </CardHeader>
        <CardContent>
          <div className="p-4 sm:p-5 bg-slate-850/60 rounded-2xl border border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-bold text-slate-100">Export my visible data (JSON)</h4>
              <p className="text-[11px] text-slate-400 mt-1">
                Read-only snapshot for archiving or audits. It cannot be imported back; restores are done by an administrator from database backups.
              </p>
              {clientErrors.length > 0 && (
                <p className="text-[11px] text-rose-600 mt-1">
                  Some records could not be loaded ({clientErrors.join(', ')}), so the export is unavailable.{' '}
                  <button className="underline font-bold cursor-pointer" onClick={() => void fleet.reload(clientErrors as unknown as CollectionKey[])}>Retry</button>
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full shrink-0"
              onClick={() => void handleExport()}
              disabled={!exporting && (!clientLoaded || clientErrors.length > 0)}
              leftIcon={<Download className="w-4 h-4 text-forest-500" />}
            >
              {exporting ? `Cancel (${exportStep})` : clientLoaded ? 'Export JSON' : 'Loading records…'}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
};

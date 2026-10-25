import React, { useState } from 'react';
import { Database, Download, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { exportToJSON } from '../../utils/export';

// Removed with the move to the shared database (see docs/audit/agent-D.md):
//  * "Import Backup"  - would overwrite the browser cache only; a shared DB must never be bulk-overwritten from a paste box.
//  * "Reset to Default Data" - would re-seed fake demo rows; there is no equivalent for a shared database.
//  * Hard-coded "5.0% VAT" / "Decimal safe math" fields.
export const SettingsPage: React.FC = () => {
  const fleet = useFleet();
  const { currency, setCurrency, approvalRules } = fleet;
  const { currentUser } = useAuth();
  const { addToast } = useUI();
  const [exporting, setExporting] = useState(false);

  // Read-only export of exactly what this user can see (RLS has already filtered what the app loaded).
  const handleExport = () => {
    if (exporting) return;
    setExporting(true);
    try {
      const collections = {
        companies: fleet.companies, vehicles: fleet.vehicles, tyres: fleet.tyres, tyreEvents: fleet.tyreEvents,
        oilChanges: fleet.oilChanges, maintenanceRecords: fleet.maintenanceRecords, workOrders: fleet.workOrders,
        accidents: fleet.accidents, expenses: fleet.expenses, suppliers: fleet.suppliers, customers: fleet.customers,
        invoices: fleet.invoices, reconciliations: fleet.reconciliations, payments: fleet.payments,
        bankAccounts: fleet.bankAccounts, chartOfAccounts: fleet.chartOfAccounts, journalEntries: fleet.journalEntries,
        fixedAssets: fleet.fixedAssets, depreciationRuns: fleet.depreciationRuns, employees: fleet.employees,
        payrollRuns: fleet.payrollRuns, documents: fleet.documents, approvalRules: fleet.approvalRules,
        approvalRequests: fleet.approvalRequests,
      } as Record<string, unknown[]>;
      const counts = Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
      exportToJSON('FleetX_Visible_Data', {
        exportedAt: new Date().toISOString(),
        exportedBy: { id: currentUser.id, name: currentUser.name, role: currentUser.role },
        note: 'Read-only snapshot of the records visible to this user. Documents are listed as metadata only (no file contents).',
        counts,
        data: collections,
      });
      addToast({ type: 'success', title: 'Export created', message: 'A JSON file with your visible data was downloaded.' });
    } catch (e) {
      addToast({ type: 'error', title: 'Export failed', message: (e as Error).message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            System Settings
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Display currency, approval thresholds and a read-only export of the data you can access.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-[20px] bg-white border border-slate-700 shadow-card">
          <CardHeader>
            <CardTitle>Display Currency</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <Select
              label="Reporting currency (this browser only)"
              value={currency}
              onChange={e => {
                setCurrency(e.target.value);
                addToast({ type: 'info', title: `Display currency set to ${e.target.value}` });
              }}
            >
              <option value="OMR">OMR - Omani Rial (3 decimals)</option>
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="SAR">SAR - Saudi Riyal</option>
              <option value="AED">AED - UAE Dirham</option>
            </Select>
            <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
              This only changes how amounts are formatted for you. Stored amounts are not converted, and each company keeps its own base currency.
            </p>
            <Input label="Financial year" value="Per company (see Companies)" disabled />
          </CardContent>
        </Card>

        <Card className="rounded-[20px] bg-white border border-slate-700 shadow-card">
          <CardHeader>
            <CardTitle>Approval Threshold Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {approvalRules.length === 0 && (
              <p className="text-slate-400">No approval rules are configured. Nothing requires approval until a rule is added.</p>
            )}
            {approvalRules.map(rule => (
              <div key={rule.id} className="p-3.5 bg-slate-850/60 rounded-xl border border-slate-700/80 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200 uppercase text-[11px]">
                    {rule.module} threshold{!rule.active ? ' (inactive)' : ''}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-forest-100 text-forest-700 font-mono font-bold text-[10px]">
                    &gt; {rule.thresholdAmount.toFixed(3)} {rule.currency}
                  </span>
                </div>
                {rule.description && <p className="text-slate-400 text-[11px]">{rule.description}</p>}
                <p className="text-[10px] text-slate-400 font-semibold mt-1">
                  Required Approvers: <span className="text-forest-600">{rule.requiredRoles.join(' -> ')}</span>
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

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
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full shrink-0"
              onClick={handleExport}
              disabled={exporting}
              leftIcon={<Download className="w-4 h-4 text-forest-500" />}
            >
              Export JSON
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

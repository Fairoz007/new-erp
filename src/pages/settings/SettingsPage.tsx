import React, { useState } from 'react';
import { Settings as SettingsIcon, Database, Download, Upload, RotateCcw, ShieldAlert, CheckCircle2, Save, Layers } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';

export const SettingsPage: React.FC = () => {
  const { currency, setCurrency, resetToDefaultData, exportAllDataJSON, importDataJSON, approvalRules } = useFleet();
  const { addToast } = useUI();
  const [importJsonText, setImportJsonText] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all cached data to standard enterprise initial seed records? This will overwrite your local changes.')) {
      resetToDefaultData();
      addToast({
        type: 'success',
        title: 'ERP State Restored',
        message: 'System cache has been reset to default enterprise dataset.',
      });
    }
  };

  const handleImport = () => {
    if (!importJsonText.trim()) return;
    const success = importDataJSON(importJsonText);
    if (success) {
      addToast({ type: 'success', title: 'Backup Restored', message: 'Imported state into persistent browser cache.' });
      setIsImportModalOpen(false);
      setImportJsonText('');
    } else {
      addToast({ type: 'error', title: 'Import Failed', message: 'Invalid JSON format or missing required entity keys.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <SettingsIcon className="w-6 h-6 text-indigo-400" />
            <span>System Settings & Local Cache Controls</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage system currency, regional thresholds, approval rules, and export/import persistent localStorage data.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System & Financial Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Regional & Currency Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <Select
              label="Default Base Reporting Currency"
              value={currency}
              onChange={e => {
                setCurrency(e.target.value);
                addToast({ type: 'info', title: `Reporting currency updated to ${e.target.value}` });
              }}
            >
              <option value="OMR">OMR - Omani Rial (3 Decimals: OMR 0.000)</option>
              <option value="USD">USD - US Dollar ($ 0.00)</option>
              <option value="EUR">EUR - Euro (€ 0.00)</option>
              <option value="SAR">SAR - Saudi Riyal (﷼ 0.00)</option>
              <option value="AED">AED - UAE Dirham (د.إ 0.00)</option>
            </Select>

            <Input label="Default VAT Rate Percentage" value="5.0%" disabled />
            <Input label="Financial Year Standard" value="01 January to 31 December" disabled />
            <Input label="Decimal Safe Math" value="Enabled (3 Decimals IEEE-754 Safe Engine)" disabled />
          </CardContent>
        </Card>

        {/* Approval Rules Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Automated Approval Threshold Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {approvalRules.map(rule => (
              <div key={rule.id} className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200 uppercase text-[11px]">{rule.module} Threshold</span>
                  <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono font-bold text-[10px]">
                    &gt; {rule.thresholdAmount.toFixed(3)} {rule.currency}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">{rule.description}</p>
                <p className="text-[10px] text-slate-500 font-semibold mt-1">
                  Required Approvers: {rule.requiredRoles.join(' → ')}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Local Storage & Cache Persistence Management */}
      <Card className="border-indigo-800/40 bg-slate-900/90">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />
            <CardTitle>Browser Cache & Offline State Management</CardTitle>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            All vehicles, work orders, invoices, payments, journals, and logs are automatically persisted in your browser&apos;s localStorage cache.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Persistent Cache Active
              </h4>
              <p className="text-[11px] text-slate-400 mt-1">
                Any records you create, update, or pay remain stored in this browser session and across reloads.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={exportAllDataJSON}
                leftIcon={<Download className="w-4 h-4" />}
              >
                Export JSON Backup
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsImportModalOpen(true)}
                leftIcon={<Upload className="w-4 h-4" />}
              >
                Import Backup
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleReset}
                leftIcon={<RotateCcw className="w-4 h-4" />}
              >
                Reset to Default Data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-100">Import Al Hakim ERP JSON Backup</h3>
            <p className="text-xs text-slate-400">Paste your exported Al Hakim ERP JSON state to restore all records into local cache.</p>
            <textarea
              rows={6}
              value={importJsonText}
              onChange={e => setImportJsonText(e.target.value)}
              placeholder="Paste JSON content here..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setIsImportModalOpen(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleImport}>Restore Database</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

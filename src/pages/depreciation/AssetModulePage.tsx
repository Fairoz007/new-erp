import React, { useState } from 'react';
import { Plus, Play, History, ShieldCheck, TrendingDown, Layers, Eye, Pencil, Trash2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { FixedAsset, DepreciationRun, FixedAssetCategory, AssetDepreciationMethod } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

const CATEGORIES: FixedAssetCategory[] = ['Fleet Vehicle', 'Workshop Equipment', 'Heavy Machinery', 'IT & GPS Hardware', 'Facility & Garage Fixture', 'Other Fixed Asset'];
const STATUSES: FixedAsset['status'][] = ['Active', 'Under Maintenance', 'Fully Depreciated', 'Disposed'];

export const AssetModulePage: React.FC = () => {
  const { fixedAssets, depreciationRuns: allRuns, currency, selectedCompanyId, updateFixedAsset, deleteFixedAsset } = useFleet();
  const { openQuickModal, addToast } = useUI();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('create', 'fixed-assets');
  const canEdit = hasPermission('edit', 'fixed-assets');
  const canDelete = hasPermission('delete', 'fixed-assets');
  const [activeTab, setActiveTab] = useState<'register' | 'runs'>('register');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRun, setSelectedRun] = useState<DepreciationRun | null>(null);
  const [editing, setEditing] = useState<FixedAsset | null>(null);
  const [editForm, setEditForm] = useState<Partial<FixedAsset>>({});
  const [deleting, setDeleting] = useState<FixedAsset | null>(null);
  const [pending, setPending] = useState(false);

  const inScope = (cid: string) => !selectedCompanyId || selectedCompanyId === 'all' || cid === selectedCompanyId;
  const depreciationRuns = allRuns.filter(r => inScope(r.companyId));
  const scopedAssets = fixedAssets.filter(a => inScope(a.companyId));
  const filteredAssets = scopedAssets.filter(a => selectedCategory === 'all' || a.category === selectedCategory);
  const totalCost = scopedAssets.reduce((s, a) => s + a.purchaseCost, 0);
  const totalAccDepr = scopedAssets.reduce((s, a) => s + a.accumulatedDepreciation, 0);
  const totalNetBookValue = scopedAssets.reduce((s, a) => s + a.currentBookValue, 0);

  const openEdit = (a: FixedAsset) => {
    setEditing(a);
    setEditForm({
      name: a.name, category: a.category, location: a.location, department: a.department, serialNumber: a.serialNumber,
      purchaseDate: a.purchaseDate, purchaseCost: a.purchaseCost, salvageValue: a.salvageValue,
      usefulLifeYears: a.usefulLifeYears, annualRatePercentage: a.annualRatePercentage, depreciationMethod: a.depreciationMethod,
      currentMarketValue: a.currentMarketValue, status: a.status, notes: a.notes,
      glAssetAccount: a.glAssetAccount, glDepreciationExpenseAccount: a.glDepreciationExpenseAccount,
      glAccumulatedDepreciationAccount: a.glAccumulatedDepreciationAccount,
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || pending) return;
    const cost = Number(editForm.purchaseCost);
    const salvage = Number(editForm.salvageValue);
    const life = Number(editForm.usefulLifeYears);
    if (!(life > 0) || !(salvage >= 0) || cost - salvage < editing.accumulatedDepreciation - 0.0005) {
      addToast({ type: 'error', title: 'Invalid values', message: 'Useful life must be above 0, and cost less salvage cannot be below the depreciation already posted.' });
      return;
    }
    setPending(true);
    try {
      await updateFixedAsset(editing.id, {
        ...editForm,
        purchaseCost: cost,
        salvageValue: salvage,
        usefulLifeYears: life,
        annualRatePercentage: Number(editForm.annualRatePercentage) || 0,
      });
      addToast({ type: 'success', title: 'Asset updated', message: `${editing.assetCode} saved.` });
      setEditing(null);
    } catch (err) {
      addToast({ type: 'error', title: 'Update failed', message: (err as Error).message });
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting || pending) return;
    setPending(true);
    try {
      await deleteFixedAsset(deleting.id);
      addToast({ type: 'success', title: 'Asset removed', message: `${deleting.assetCode} deleted from the register.` });
      setDeleting(null);
    } catch (err) {
      const msg = (err as Error).message;
      addToast({
        type: 'error',
        title: 'Delete failed',
        message: /linked/i.test(msg) ? 'This asset has posted depreciation and cannot be deleted. Set its status to Disposed instead.' : msg,
      });
    } finally {
      setPending(false);
    }
  };

  const assetColumns: Column<FixedAsset>[] = [
    {
      key: 'assetCode',
      header: 'Asset Code / Tag',
      render: (a) => (
        <div>
          <span className="font-mono font-bold text-slate-100">{a.assetCode}</span>
          <p className="text-[10px] text-slate-400 font-mono">SN: {a.serialNumber || 'N/A'}</p>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Asset Description',
      render: (a) => (
        <div>
          <p className="font-semibold text-slate-200">{a.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-indigo-300 text-[10px]">
              {a.category}
            </span>
            {a.assignedVehiclePlate && (
              <span className="text-[10px] text-slate-400 font-mono">Plate: {a.assignedVehiclePlate}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'purchaseCost',
      header: 'Purchase Cost',
      align: 'right',
      render: (a) => (
        <div className="text-right">
          <span className="font-bold text-slate-200">{formatCurrency(a.purchaseCost, currency)}</span>
          <p className="text-[10px] text-slate-500">Acquired: {formatDate(a.purchaseDate)}</p>
        </div>
      ),
    },
    {
      key: 'depreciationMethod',
      header: 'Method & Rate',
      render: (a) => (
        <div>
          <span className="text-slate-300 font-medium">{a.depreciationMethod}</span>
          <p className="text-[10px] text-slate-400">
            {a.depreciationMethod === 'Reducing Balance' ? `${a.annualRatePercentage}% p.a. • ` : ''}{a.usefulLifeYears} Yrs Life
          </p>
        </div>
      ),
    },
    {
      key: 'accumulatedDepreciation',
      header: 'Accumulated Depr',
      align: 'right',
      render: (a) => (
        <div className="text-right">
          <span className="font-mono font-bold text-rose-400">{formatCurrency(a.accumulatedDepreciation, currency)}</span>
          <p className="text-[10px] text-slate-500">
            {(a.purchaseCost > 0 ? (a.accumulatedDepreciation / a.purchaseCost) * 100 : 0).toFixed(1)}% amortized
          </p>
        </div>
      ),
    },
    {
      key: 'currentBookValue',
      header: 'Net Book Value',
      align: 'right',
      render: (a) => (
        <div className="text-right">
          <span className="font-mono font-bold text-emerald-400 text-sm">{formatCurrency(a.currentBookValue, currency)}</span>
          <p className="text-[10px] text-slate-400">Salvage: {formatCurrency(a.salvageValue, currency)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (a) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            a.status === 'Active'
              ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'
              : a.status === 'Fully Depreciated'
              ? 'bg-amber-950/70 text-amber-300 border border-amber-800'
              : 'bg-rose-950/70 text-rose-300 border border-rose-800'
          }`}
        >
          {a.status}
        </span>
      ),
    },
    ...((canEdit || canDelete) ? [{
      key: 'actions',
      header: 'Actions',
      align: 'right' as const,
      sortable: false,
      render: (a: FixedAsset) => (
        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
          {canEdit && <Button variant="ghost" size="xs" onClick={() => openEdit(a)} leftIcon={<Pencil className="w-3 h-3" />}>Edit</Button>}
          {canDelete && <Button variant="ghost" size="xs" onClick={() => setDeleting(a)} leftIcon={<Trash2 className="w-3 h-3" />}>Delete</Button>}
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Asset Module & Automatic Depreciation
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Fixed asset register with monthly depreciation runs posted to the GL (Dr each asset's depreciation expense account / Cr its accumulated depreciation account).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canCreate && hasPermission('create', 'accounting') && (
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => openQuickModal('run-depreciation')}
              leftIcon={<Play className="w-4 h-4 text-forest-500" />}>
              Run Auto-Depreciation
            </Button>
          )}
          {canCreate && (
            <Button variant="primary" size="sm" className="rounded-full shadow-sm" onClick={() => openQuickModal('add-fixed-asset')}
              leftIcon={<Plus className="w-4 h-4" />}>
              Add Fixed Asset
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard title="Gross Fixed Assets (At Cost)" value={formatCurrency(totalCost, currency)} subValue={`${scopedAssets.length} Registered Assets`}
          icon={<Layers className="w-4 h-4" />} variant="indigo" isHero={true} />
        <StatCard title="Accumulated Depreciation" value={formatCurrency(totalAccDepr, currency)} subValue="Per asset register"
          icon={<TrendingDown className="w-4 h-4" />} variant="rose" />
        <StatCard title="Net Carrying Book Value" value={formatCurrency(totalNetBookValue, currency)} subValue="Cost less accumulated depreciation"
          icon={<ShieldCheck className="w-4 h-4" />} variant="emerald" />
        <StatCard title="Depreciation Runs" value={depreciationRuns.length} subValue="Monthly runs executed"
          icon={<History className="w-4 h-4" />} variant="amber" />
      </div>

      {/* Segmented Pill Tabs */}
      <div className="inline-flex items-center gap-1.5 p-1 bg-slate-850 border border-slate-700 rounded-full">
        <button
          onClick={() => setActiveTab('register')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'register' ? 'bg-white text-forest-600 shadow-sm border border-slate-700/60' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Fixed Asset Register</span>
        </button>
        <button
          onClick={() => setActiveTab('runs')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'runs' ? 'bg-white text-forest-600 shadow-sm border border-slate-700/60' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Depreciation History & GL Postings ({depreciationRuns.length})</span>
        </button>
      </div>

      {activeTab === 'register' ? (
        <DataTable
          data={filteredAssets}
          columns={assetColumns}
          keyExtractor={a => a.id}
          title="Fixed Assets Master Registry"
          searchPlaceholder="Search fixed assets by asset code, name, category, serial number..."
          searchFields={['assetCode', 'name', 'category', 'serialNumber', 'assignedVehiclePlate']}
          exportFilename="FleetX_Fixed_Assets_Register"
          emptyMessage="No fixed assets registered for this selection."
          filterComponent={
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-white border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-forest-500/20 focus:border-forest-500 cursor-pointer shadow-sm"
            >
              <option value="all">All Asset Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          }
        />
      ) : (
        <div className="space-y-4">
          <Card className="overflow-hidden border border-slate-700 bg-white shadow-card rounded-[20px]">
            <div className="p-4 sm:p-5 bg-white border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Depreciation Runs</h3>
                <p className="text-xs text-slate-400 mt-0.5">Monthly runs (one per company and month) with their linked GL journal.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-850 border-b border-slate-700 text-slate-400 text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">Batch #</th>
                    <th className="py-3 px-4 font-semibold">Period</th>
                    <th className="py-3 px-4 font-semibold">Execution Date</th>
                    <th className="py-3 px-4 font-semibold text-center">Assets Processed</th>
                    <th className="py-3 px-4 font-semibold text-right">Total Depreciation</th>
                    <th className="py-3 px-4 font-semibold">Linked GL Journal</th>
                    <th className="py-3 px-4 font-semibold">Processed By</th>
                    <th className="py-3 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60 bg-white">
                  {depreciationRuns.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500 italic">No depreciation runs yet.</td>
                    </tr>
                  ) : (
                    depreciationRuns.map(run => (
                      <tr key={run.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-100">{run.batchNumber}</td>
                        <td className="py-3 px-4 font-medium text-amber-300">{run.periodLabel}</td>
                        <td className="py-3 px-4 text-slate-300 font-mono">{formatDate(run.runDate)}</td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200">{run.totalAssetsProcessed} Assets</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-400">{formatCurrency(run.totalDepreciationAmount, currency)}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-mono text-[10px] font-bold">
                            {run.journalEntryNumber || 'Not posted to GL'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{run.processedBy || '—'}</td>
                        <td className="py-3 px-4 text-right">
                          <Button variant="ghost" size="xs" onClick={() => setSelectedRun(run)} leftIcon={<Eye className="w-3 h-3" />}>
                            View Breakdown
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Run Breakdown Modal */}
      {selectedRun && (
        <Modal
          isOpen={!!selectedRun}
          onClose={() => setSelectedRun(null)}
          title={`Depreciation Breakdown: ${selectedRun.batchNumber} (${selectedRun.periodLabel})`}
          description={`Processed by ${selectedRun.processedBy || 'unknown user'} on ${formatDate(selectedRun.runDate)} • Total: ${formatCurrency(selectedRun.totalDepreciationAmount, currency)}`}
          size="xl"
        >
          <div className="space-y-4">
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 text-[11px] uppercase border-b border-slate-800">
                    <th className="py-2 px-3">Asset Code</th>
                    <th className="py-2 px-3">Asset Name</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3 text-right">Previous BV</th>
                    <th className="py-2 px-3 text-right text-rose-400">Depreciation</th>
                    <th className="py-2 px-3 text-right text-emerald-400">New Net BV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {selectedRun.breakdown.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-center text-slate-500 italic">No asset was depreciated in this run.</td></tr>
                  )}
                  {selectedRun.breakdown.map(item => (
                    <tr key={item.assetId} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-mono font-bold text-slate-200">{item.assetCode}</td>
                      <td className="py-2 px-3 font-medium text-slate-200">{item.assetName}</td>
                      <td className="py-2 px-3 text-slate-400">{item.category}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-300">{formatCurrency(item.previousBookValue, currency)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-rose-400">{formatCurrency(item.depreciationAmount, currency)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(item.newBookValue, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedRun(null)}>Close Breakdown</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Fixed Asset */}
      <Modal
        isOpen={!!editing}
        onClose={() => !pending && setEditing(null)}
        title={`Edit ${editing?.assetCode ?? ''}`}
        description="Accumulated depreciation only changes through depreciation runs."
        size="lg"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Input label="Asset Name" value={editForm.name ?? ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <Select label="Category" value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value as FixedAssetCategory })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Location" value={editForm.location ?? ''} onChange={e => setEditForm({ ...editForm, location: e.target.value })} />
            <Input label="Department" value={editForm.department ?? ''} onChange={e => setEditForm({ ...editForm, department: e.target.value })} />
            <Input label="Serial Number" value={editForm.serialNumber ?? ''} onChange={e => setEditForm({ ...editForm, serialNumber: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Purchase Date" type="date" value={editForm.purchaseDate ?? ''} onChange={e => setEditForm({ ...editForm, purchaseDate: e.target.value })} required />
            <Input label={`Cost (${currency})`} type="number" step="0.001" min="0" value={editForm.purchaseCost ?? 0} onChange={e => setEditForm({ ...editForm, purchaseCost: Number(e.target.value) })} required />
            <Input label={`Salvage (${currency})`} type="number" step="0.001" min="0" value={editForm.salvageValue ?? 0} onChange={e => setEditForm({ ...editForm, salvageValue: Number(e.target.value) })} />
            <Input label="Useful Life (Years)" type="number" step="0.01" min="0.01" value={editForm.usefulLifeYears ?? 0} onChange={e => setEditForm({ ...editForm, usefulLifeYears: Number(e.target.value) })} required />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Select label="Method" value={editForm.depreciationMethod} onChange={e => setEditForm({ ...editForm, depreciationMethod: e.target.value as AssetDepreciationMethod })}>
              <option value="Straight-Line">Straight-Line</option>
              <option value="Reducing Balance">Reducing Balance</option>
              <option value="Double Declining">Double Declining</option>
            </Select>
            <Input label="Annual Rate % (reducing balance)" type="number" step="0.001" min="0" value={editForm.annualRatePercentage ?? 0}
              onChange={e => setEditForm({ ...editForm, annualRatePercentage: Number(e.target.value) })} />
            <Input label={`Market Value (${currency})`} type="number" step="0.001" min="0" value={editForm.currentMarketValue ?? ''}
              onChange={e => setEditForm({ ...editForm, currentMarketValue: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <Select label="Status" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value as FixedAsset['status'] })}>
              {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="GL Asset Account" value={editForm.glAssetAccount ?? ''} onChange={e => setEditForm({ ...editForm, glAssetAccount: e.target.value })} required />
            <Input label="GL Depreciation Expense" value={editForm.glDepreciationExpenseAccount ?? ''} onChange={e => setEditForm({ ...editForm, glDepreciationExpenseAccount: e.target.value })} required />
            <Input label="GL Accumulated Depreciation" value={editForm.glAccumulatedDepreciationAccount ?? ''} onChange={e => setEditForm({ ...editForm, glAccumulatedDepreciationAccount: e.target.value })} required />
          </div>
          <Textarea label="Notes" value={editForm.notes ?? ''} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setEditing(null)} disabled={pending}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Fixed Asset */}
      <Modal
        isOpen={!!deleting}
        onClose={() => !pending && setDeleting(null)}
        title={`Delete ${deleting?.assetCode ?? ''}?`}
        description="Assets with posted depreciation cannot be deleted; mark them Disposed instead."
        size="sm"
      >
        <div className="space-y-4 text-sm text-slate-300">
          <p>{deleting?.name} will be removed from the fixed asset register.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={pending}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={pending}>{pending ? 'Deleting…' : 'Delete Asset'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

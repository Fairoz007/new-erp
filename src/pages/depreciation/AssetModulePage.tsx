import React, { useState } from 'react';
import { Sparkles, Plus, Play, History, Calculator, ShieldCheck, RefreshCw, CheckCircle2, TrendingDown, Layers, FileSpreadsheet, Eye, ChevronRight } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { FixedAsset, DepreciationRun } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const AssetModulePage: React.FC = () => {
  const { fixedAssets, depreciationRuns, currency, selectedCompanyId } = useFleet();
  const { openQuickModal } = useUI();
  const [activeTab, setActiveTab] = useState<'register' | 'runs'>('register');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRun, setSelectedRun] = useState<DepreciationRun | null>(null);

  const filteredAssets = fixedAssets.filter(a => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && a.companyId !== selectedCompanyId) return false;
    if (selectedCategory !== 'all' && a.category !== selectedCategory) return false;
    return true;
  });

  const scopedAssets = fixedAssets.filter(a => !selectedCompanyId || selectedCompanyId === 'all' || a.companyId === selectedCompanyId);
  const totalCost = scopedAssets.reduce((s, a) => s + a.purchaseCost, 0);
  const totalAccDepr = scopedAssets.reduce((s, a) => s + a.accumulatedDepreciation, 0);
  const totalNetBookValue = scopedAssets.reduce((s, a) => s + a.currentBookValue, 0);
  const totalAssetsCount = scopedAssets.length;

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
            {a.annualRatePercentage}% p.a. • {a.usefulLifeYears} Yrs Life
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
          <span className="font-mono font-bold text-rose-400">
            {formatCurrency(a.accumulatedDepreciation, currency)}
          </span>
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
          <span className="font-mono font-bold text-emerald-400 text-sm">
            {formatCurrency(a.currentBookValue, currency)}
          </span>
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
            Enterprise fixed asset register with automatic monthly depreciation calculations and direct GL journal posting (Dr 5080 / Cr 1520).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => openQuickModal('run-depreciation')}
            leftIcon={<Play className="w-4 h-4 text-forest-500" />}
          >
            Run Auto-Depreciation
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="rounded-full shadow-sm"
            onClick={() => openQuickModal('add-fixed-asset')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Fixed Asset
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Gross Fixed Assets (At Cost)"
          value={formatCurrency(totalCost, currency)}
          subValue={`${totalAssetsCount} Registered Assets`}
          icon={<Layers className="w-4 h-4" />}
          variant="indigo"
          isHero={true}
        />
        <StatCard
          title="Accumulated Depreciation"
          value={formatCurrency(totalAccDepr, currency)}
          subValue="Credit Balance (GL 1520)"
          icon={<TrendingDown className="w-4 h-4" />}
          variant="rose"
        />
        <StatCard
          title="Net Carrying Book Value"
          value={formatCurrency(totalNetBookValue, currency)}
          subValue="Balance Sheet Net Worth"
          icon={<ShieldCheck className="w-4 h-4" />}
          variant="emerald"
        />
        <StatCard
          title="Depreciation Batches"
          value={depreciationRuns.length}
          subValue="Executed Amortizations"
          icon={<History className="w-4 h-4" />}
          variant="amber"
        />
      </div>

      {/* Segmented Pill Tabs */}
      <div className="inline-flex items-center gap-1.5 p-1 bg-slate-850 border border-slate-700 rounded-full">
        <button
          onClick={() => setActiveTab('register')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'register'
              ? 'bg-white text-forest-600 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Fixed Asset Register</span>
        </button>

        <button
          onClick={() => setActiveTab('runs')}
          className={`px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'runs'
              ? 'bg-white text-forest-600 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200'
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
          filterComponent={
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="bg-white border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-forest-500/20 focus:border-forest-500 cursor-pointer shadow-sm"
            >
              <option value="all">All Asset Categories</option>
              <option value="Fleet Vehicle">Fleet Vehicles</option>
              <option value="Workshop Equipment">Workshop & Diagnostic Equipment</option>
              <option value="Machinery">Machinery & Cranes</option>
              <option value="IT & Office">IT & Facilities</option>
            </select>
          }
        />
      ) : (
        /* Depreciation Runs Log */
        <div className="space-y-4">
          <Card className="overflow-hidden border border-slate-700 bg-white shadow-card rounded-[20px]">
            <div className="p-4 sm:p-5 bg-white border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  Automatic Depreciation Batch Runs
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Historical monthly depreciation runs with linked GL double-entry journal vouchers.
                </p>
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
                      <td colSpan={8} className="py-6 text-center text-slate-500 italic">
                        No depreciation batches executed yet. Click "Run Auto-Depreciation" above.
                      </td>
                    </tr>
                  ) : (
                    depreciationRuns.map(run => (
                      <tr key={run.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-100">{run.batchNumber}</td>
                        <td className="py-3 px-4 font-medium text-amber-300">{run.periodLabel}</td>
                        <td className="py-3 px-4 text-slate-300 font-mono">{formatDate(run.runDate)}</td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-200">
                            {run.totalAssetsProcessed} Assets
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-400">
                          {formatCurrency(run.totalDepreciationAmount, currency)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-mono text-[10px] font-bold">
                            {run.journalEntryNumber || 'JE-POSTED'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{run.processedBy}</td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setSelectedRun(run)}
                            leftIcon={<Eye className="w-3 h-3" />}
                          >
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
          description={`Processed by ${selectedRun.processedBy} on ${formatDate(selectedRun.runDate)} • Total: ${formatCurrency(selectedRun.totalDepreciationAmount, currency)}`}
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
                  {selectedRun.breakdown.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-mono font-bold text-slate-200">{item.assetCode}</td>
                      <td className="py-2 px-3 font-medium text-slate-200">{item.assetName}</td>
                      <td className="py-2 px-3 text-slate-400">{item.category}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-300">
                        {formatCurrency(item.previousBookValue, currency)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-rose-400">
                        {formatCurrency(item.depreciationAmount, currency)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                        {formatCurrency(item.newBookValue, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={() => setSelectedRun(null)}>
                Close Breakdown
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

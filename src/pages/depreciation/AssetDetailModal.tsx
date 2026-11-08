import React from 'react';
import { Sparkles, Calendar, DollarSign, Layers, Pencil, Trash2, Car, MapPin, Building2, TrendingDown } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { FixedAsset } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

interface AssetDetailModalProps {
  asset: FixedAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (asset: FixedAsset) => void;
}

export const AssetDetailModal: React.FC<AssetDetailModalProps> = ({
  asset,
  isOpen,
  onClose,
  onEdit,
}) => {
  const { currency, depreciationRuns, vehicles } = useFleet();
  const { openVehicleDetail } = useUI();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit', 'fixed-assets');

  if (!asset) return null;

  // Depreciation runs that touched this asset
  const assetRuns = (depreciationRuns || [])
    .filter(r => (r.breakdown || []).some(b => b.assetId === asset.id))
    .sort((a, b) => b.runDate.localeCompare(a.runDate));

  const assignedVehicle = vehicles?.find(
    v => (asset.assignedVehiclePlate && v.plateNumber === asset.assignedVehiclePlate) ||
         (asset.serialOrPlateNumber && v.plateNumber === asset.serialOrPlateNumber)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-forest-100 text-forest-700 flex items-center justify-center font-bold text-sm shrink-0 border border-forest-500/20">
            <Sparkles className="w-5 h-5 text-forest-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100">{asset.name}</h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  asset.status === 'Active'
                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'
                    : asset.status === 'Fully Depreciated'
                    ? 'bg-amber-950/70 text-amber-300 border border-amber-800'
                    : 'bg-rose-950/70 text-rose-300 border border-rose-800'
                }`}
              >
                {asset.status}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Asset Tag: {asset.assetCode} • {asset.category}
            </p>
          </div>
        </div>
      }
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit(asset);
                }}
                leftIcon={<Pencil className="w-4 h-4" />}
              >
                Edit Asset
              </Button>
            )}
            {assignedVehicle && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  openVehicleDetail(assignedVehicle.id);
                }}
                leftIcon={<Car className="w-4 h-4" />}
              >
                Assigned Vehicle ({assignedVehicle.plateNumber})
              </Button>
            )}
          </div>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-6 text-xs text-slate-300">
        {/* Three-Way Valuation Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Purchase Cost</span>
            <span className="text-lg font-bold text-slate-100 mt-1 block">
              {formatCurrency(asset.purchaseCost, currency)}
            </span>
            <span className="text-[10px] text-slate-500">Acquired {formatDate(asset.purchaseDate)}</span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Accumulated Depr</span>
            <span className="text-lg font-bold text-rose-400 mt-1 block">
              -{formatCurrency(asset.accumulatedDepreciation, currency)}
            </span>
            <span className="text-[10px] text-slate-500">
              {(asset.purchaseCost > 0 ? (asset.accumulatedDepreciation / asset.purchaseCost) * 100 : 0).toFixed(1)}% amortized
            </span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Current Book Value</span>
            <span className="text-lg font-bold text-emerald-400 mt-1 block">
              {formatCurrency(asset.currentBookValue, currency)}
            </span>
            <span className="text-[10px] text-slate-500">Salvage: {formatCurrency(asset.salvageValue, currency)}</span>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Estimated Market Value</span>
            <span className="text-lg font-bold text-indigo-300 mt-1 block">
              {asset.currentMarketValue ? formatCurrency(asset.currentMarketValue, currency) : 'N/A'}
            </span>
            <span className="text-[10px] text-slate-500">Resale assessment</span>
          </div>
        </div>

        {/* Depreciation Parameters & General Ledger Mapping */}
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Depreciation & Accounting Config</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Depreciation Method</span>
              <span className="font-semibold text-slate-200">{asset.depreciationMethod}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Useful Life</span>
              <span className="font-semibold text-slate-200">{asset.usefulLifeYears} Years</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Annual Rate</span>
              <span className="font-semibold text-indigo-400">{asset.annualRatePercentage}% p.a.</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">GL Asset Account</span>
              <span className="font-mono text-slate-200">{asset.glAssetAccount || '1530 Equipment'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">GL Depreciation Expense</span>
              <span className="font-mono text-slate-200">{asset.glDepreciationExpenseAccount || '5080 Depreciation'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">GL Accumulated Depreciation</span>
              <span className="font-mono text-slate-200">{asset.glAccumulatedDepreciationAccount || '1520 Accum Depr'}</span>
            </div>
          </div>
        </div>

        {/* Physical Asset Location & Specs */}
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">Asset Deployment & Serial Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Serial / VIN Number</span>
              <span className="font-mono text-slate-200">{asset.serialNumber || 'Not recorded'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Assigned Yard / Location</span>
              <span className="text-slate-200">{asset.location || 'Head Office'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Assigned Department</span>
              <span className="text-slate-200">{asset.department || 'Workshop'}</span>
            </div>
          </div>
          {asset.notes && (
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Notes</span>
              <p className="text-xs text-slate-300 mt-0.5 italic">{asset.notes}</p>
            </div>
          )}
        </div>

        {/* Depreciation Run History */}
        <div className="space-y-3">
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">
            Amortization Cycles Run ({assetRuns.length})
          </h3>
          {assetRuns.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center border border-slate-800/80 rounded-xl bg-slate-950/30">
              No auto-depreciation runs executed for this asset yet.
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="px-3 py-2">Batch #</th>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Run Date</th>
                    <th className="px-3 py-2 text-right">Depreciation Posted</th>
                    <th className="px-3 py-2 text-right">Remaining Book Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {assetRuns.map(run => {
                    const item = (run.breakdown || []).find(b => b.assetId === asset.id);
                    if (!item) return null;
                    return (
                      <tr key={run.id} className="hover:bg-slate-900/40">
                        <td className="px-3 py-2 font-mono font-bold text-slate-100">{run.batchNumber}</td>
                        <td className="px-3 py-2 font-semibold text-slate-200">{run.periodLabel}</td>
                        <td className="px-3 py-2 text-slate-400">{formatDate(run.runDate)}</td>
                        <td className="px-3 py-2 text-right font-bold text-rose-400">-{formatCurrency(item.depreciationAmount, currency)}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-400">{formatCurrency(item.newBookValue, currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

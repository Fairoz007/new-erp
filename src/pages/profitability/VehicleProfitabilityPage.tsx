import React from 'react';
import { Sparkles, Car, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Vehicle } from '../../types/vehicle';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';

interface VehicleProfitabilityRow {
  vehicle: Vehicle;
  plateNumber: string;
  vehicleName: string;
  vehicleCategory: string;
  revenue: number;
  operatingCost: number;
  maintenanceCost: number;
  fuelCost: number;
  netProfit: number;
  costPerKm: number;
  maintenanceCostPerKm: number;
  profitMargin: number;
  recommendation: 'Retain & Maintain' | 'Monitor Costs' | 'Flagged for Replacement';
}

export const VehicleProfitabilityPage: React.FC = () => {
  const { vehicles: allVehicles, getVehicleFinancialSummary, currency, selectedCompanyId } = useFleet();
  const { openVehicleDetail } = useUI();

  const vehicles = allVehicles.filter(v => !selectedCompanyId || selectedCompanyId === 'all' || v.companyId === selectedCompanyId);

  const profitabilityRows: VehicleProfitabilityRow[] = vehicles.map(v => {
    const sum = getVehicleFinancialSummary(v.id);
    const rev = sum.totalRevenueGenerated;
    const opCost = sum.totalLifetimeVehicleCost - v.purchase.purchaseValue;
    const profit = rev - opCost;
    const margin = rev > 0 ? (profit / rev) * 100 : 0;

    let recommendation: VehicleProfitabilityRow['recommendation'] = 'Retain & Maintain';
    if (sum.maintenanceCostPerKm > 0.025 || opCost > v.purchase.purchaseValue * 0.7) {
      recommendation = 'Flagged for Replacement';
    } else if (sum.maintenanceCostPerKm > 0.015) {
      recommendation = 'Monitor Costs';
    }

    return {
      vehicle: v,
      plateNumber: v.plateNumber,
      vehicleName: `${v.brand} ${v.model}`,
      vehicleCategory: v.vehicleCategory,
      revenue: rev,
      operatingCost: opCost,
      maintenanceCost: sum.totalMaintenanceCost,
      fuelCost: opCost * 0.45,
      netProfit: profit,
      costPerKm: sum.costPerKilometer,
      maintenanceCostPerKm: sum.maintenanceCostPerKm,
      profitMargin: margin,
      recommendation,
    };
  });

  const columns: Column<VehicleProfitabilityRow>[] = [
    {
      key: 'vehicleName',
      header: 'Vehicle / Category',
      render: (row) => (
        <div className="cursor-pointer" onClick={() => openVehicleDetail(row.vehicle.id)}>
          <span className="font-bold text-slate-100">{row.vehicle.brand} {row.vehicle.model}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="px-2 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-forest-700 font-mono text-[10px] font-semibold">
              {row.vehicle.plateNumber}
            </span>
            <span className="text-[10px] text-slate-400">{row.vehicle.vehicleCategory}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'revenue',
      header: 'Attributed Revenue',
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <span className="font-bold text-emerald-400">{formatCurrency(row.revenue, currency)}</span>
        </div>
      ),
    },
    {
      key: 'operatingCost',
      header: 'Operating Expenses',
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <span className="font-bold text-slate-200">{formatCurrency(row.operatingCost, currency)}</span>
          <p className="text-[10px] text-slate-400">Mnt: {formatCurrency(row.maintenanceCost, currency)}</p>
        </div>
      ),
    },
    {
      key: 'netProfit',
      header: 'Net Vehicle Profit',
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <span className={`font-bold ${row.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(row.netProfit, currency)}
          </span>
          <p className="text-[10px] text-slate-400">{row.profitMargin.toFixed(1)}% Margin</p>
        </div>
      ),
    },
    {
      key: 'costPerKm',
      header: 'Cost / KM',
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <span className="font-mono font-bold text-amber-400">{row.costPerKm.toFixed(3)}</span>
          <p className="text-[9px] text-slate-400">OMR / KM</p>
        </div>
      ),
    },
    {
      key: 'recommendation',
      header: 'Fleet Recommendation',
      align: 'center',
      render: (row) => (
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
          row.recommendation === 'Retain & Maintain' ? 'bg-forest-100 text-forest-700 border-forest-200' :
          row.recommendation === 'Monitor Costs' ? 'bg-amber-50 text-amber-700 border-amber-200' :
          'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {row.recommendation}
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
            Vehicle Profitability & ROI Intelligence
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Identify high-cost underperforming units, cost-per-kilometer metrics, and AI replacement vs maintenance recommendations.
          </p>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Fleet Total Net ROI"
          value={formatCurrency(profitabilityRows.reduce((s, r) => s + r.netProfit, 0), currency)}
          subValue="Revenue minus all operating costs"
          icon={<TrendingUp className="w-4 h-4" />}
          variant="emerald"
          isHero={true}
        />
        <StatCard
          title="Average Cost per KM"
          value={`${(profitabilityRows.reduce((s, r) => s + r.costPerKm, 0) / (profitabilityRows.length || 1)).toFixed(3)} OMR`}
          subValue="Across active fleet"
          icon={<Car className="w-4 h-4" />}
          variant="indigo"
        />
        <StatCard
          title="Replacement Candidates"
          value={profitabilityRows.filter(r => r.recommendation === 'Flagged for Replacement').length}
          subValue="High maintenance intensity"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="rose"
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={profitabilityRows}
        columns={columns}
        keyExtractor={r => r.vehicle.id}
        title="Vehicle Profit & Cost Intelligence Analysis"
        searchPlaceholder="Search vehicles by plate, model, category..."
        searchFields={['plateNumber', 'vehicleName', 'vehicleCategory', 'recommendation']}
        exportFilename="FleetX_Vehicle_Profitability"
      />
    </div>
  );
};

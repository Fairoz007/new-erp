import React, { useState } from 'react';
import { Percent, Car, Download, TrendingDown, DollarSign } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { AssetDepreciationChart } from '../../components/charts/DashboardCharts';
import { Vehicle } from '../../types/vehicle';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency, calculateDepreciationSchedule, calculateCurrentBookValue } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const DepreciationPage: React.FC = () => {
  const { vehicles, currency } = useFleet();
  const { openVehicleDetail } = useUI();
  const [selectedMethod, setSelectedMethod] = useState<string>('all');

  const totalCost = vehicles.reduce((s, v) => s + (v.purchase.purchaseValue || 0), 0);
  let totalAccumulatedDepr = 0;
  let totalBookValue = 0;

  vehicles.forEach(v => {
    const { bookValue, accumulatedDepreciation } = calculateCurrentBookValue(v);
    totalBookValue += bookValue;
    totalAccumulatedDepr += accumulatedDepreciation;
  });

  const columns: Column<Vehicle>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle / Plate',
      render: (v) => (
        <div className="cursor-pointer" onClick={() => openVehicleDetail(v.id, 'depreciation')}>
          <span className="font-bold text-slate-100">{v.brand} {v.model}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-indigo-300 font-mono text-[10px]">
              {v.plateNumber}
            </span>
            <span className="text-[10px] text-slate-400">Year {v.manufacturingYear}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'depreciationMethod',
      header: 'Method & Useful Life',
      render: (v) => (
        <div>
          <span className="font-semibold text-slate-200">{v.depreciation.depreciationMethod}</span>
          <p className="text-[10px] text-slate-400">{v.depreciation.usefulLifeYears} Years • {v.depreciation.annualRatePercentage}%/Yr</p>
        </div>
      ),
    },
    {
      key: 'purchaseValue',
      header: 'Purchase Cost',
      align: 'right',
      render: (v) => (
        <div className="text-right">
          <span className="font-semibold text-slate-200">{formatCurrency(v.purchase.purchaseValue, currency)}</span>
          <p className="text-[10px] text-slate-400">{formatDate(v.purchase.purchaseDate)}</p>
        </div>
      ),
    },
    {
      key: 'accumulatedDepreciation',
      header: 'Acc. Depreciation',
      align: 'right',
      render: (v) => {
        const { accumulatedDepreciation } = calculateCurrentBookValue(v);
        return (
          <div className="text-right">
            <span className="font-mono text-rose-400">-{formatCurrency(accumulatedDepreciation, currency)}</span>
          </div>
        );
      },
    },
    {
      key: 'bookValue',
      header: 'Current Book Value',
      align: 'right',
      render: (v) => {
        const { bookValue } = calculateCurrentBookValue(v);
        return (
          <div className="text-right">
            <span className="font-mono font-bold text-indigo-300">{formatCurrency(bookValue, currency)}</span>
          </div>
        );
      },
    },
    {
      key: 'marketValue',
      header: 'Market Resale Value',
      align: 'right',
      render: (v) => (
        <div className="text-right">
          <span className="font-mono font-bold text-emerald-400">{formatCurrency(v.currentMarketValue, currency)}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Percent className="w-6 h-6 text-purple-400" />
            <span>Vehicle Asset Depreciation Engine</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Amortize fleet asset values using Straight-Line and Reducing Balance methods to track accurate book vs market values.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <StatCard
          title="Total Acquisition Cost"
          value={formatCurrency(totalCost, currency)}
          subValue={`${vehicles.length} Fleet assets`}
          icon={<Car className="w-4 h-4" />}
          variant="indigo"
        />
        <StatCard
          title="Accumulated Depreciation"
          value={formatCurrency(totalAccumulatedDepr, currency)}
          subValue="Total amortized to date"
          icon={<TrendingDown className="w-4 h-4" />}
          variant="rose"
        />
        <StatCard
          title="Net Book Value"
          value={formatCurrency(totalBookValue, currency)}
          subValue="Accounting balance"
          icon={<Percent className="w-4 h-4" />}
          variant="purple"
        />
        <StatCard
          title="Market Resale Value"
          value={formatCurrency(vehicles.reduce((s, v) => s + (v.currentMarketValue || 0), 0), currency)}
          subValue="Estimated realizable"
          icon={<DollarSign className="w-4 h-4" />}
          variant="emerald"
        />
      </div>

      {/* Depreciation Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Fleet Amortization Schedule Projection</CardTitle>
        </CardHeader>
        <CardContent>
          <AssetDepreciationChart />
        </CardContent>
      </Card>

      {/* Fleet Depreciation Table */}
      <DataTable
        data={vehicles}
        columns={columns}
        keyExtractor={v => v.id}
        title="Vehicle Depreciation Registry"
        searchPlaceholder="Search vehicles by plate, model, depreciation method..."
        exportFilename="FleetX_Vehicle_Depreciation"
      />
    </div>
  );
};

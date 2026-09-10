import React, { useState } from 'react';
import { Disc, Plus, AlertTriangle, CheckCircle2, RotateCw, Activity } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Tyre } from '../../types/vehicle';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const TyreManagementPage: React.FC = () => {
  const { tyres, tyreEvents, vehicles, currency } = useFleet();
  const { openQuickModal, openVehicleDetail } = useUI();
  const [filter, setFilter] = useState<string>('all');

  const totalTyres = tyres.length;
  const criticalTyres = tyres.filter(t => t.status === 'Critical').length;
  const dueSoonTyres = tyres.filter(t => t.status === 'Due Soon').length;
  const totalTyreInvestment = tyres.reduce((s, t) => s + (t.purchaseCost || 0), 0) + tyreEvents.reduce((s, te) => s + (te.cost || 0), 0);

  const filteredTyres = tyres.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    return true;
  });

  const columns: Column<Tyre>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle / Position',
      render: (t) => {
        const v = vehicles.find(veh => veh.id === t.vehicleId);
        return (
          <div className="cursor-pointer" onClick={() => openVehicleDetail(t.vehicleId, 'tyres')}>
            <span className="font-bold text-slate-100">{v?.brand} {v?.model}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-indigo-300 font-mono text-[10px]">
                {v?.plateNumber}
              </span>
              <span className="text-[10px] text-amber-300 font-semibold">{t.position}</span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'brandModel',
      header: 'Brand, Model & Size',
      render: (t) => (
        <div>
          <p className="font-semibold text-slate-200">{t.brand} {t.model}</p>
          <p className="text-[11px] text-slate-400 font-mono">{t.size} • SN: {t.serialNumber}</p>
        </div>
      ),
    },
    {
      key: 'treadDepthMm',
      header: 'Tread Depth',
      align: 'center',
      render: (t) => (
        <div className="text-center">
          <span className={`font-mono font-bold text-sm ${t.treadDepthMm <= 2.0 ? 'text-rose-400' : t.treadDepthMm <= 3.0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {t.treadDepthMm} mm
          </span>
          <p className="text-[9px] text-slate-500">Min 2.0 mm</p>
        </div>
      ),
    },
    {
      key: 'mileage',
      header: 'Mileage Run',
      align: 'right',
      render: (t) => (
        <div className="text-right">
          <span className="font-mono text-slate-200">{t.currentMileage.toLocaleString()} KM</span>
          <p className="text-[10px] text-slate-500">Exp: {t.expectedLifeKm.toLocaleString()} KM</p>
        </div>
      ),
    },
    {
      key: 'purchaseCost',
      header: 'Purchase Cost',
      align: 'right',
      render: (t) => (
        <div className="text-right">
          <span className="font-semibold text-slate-200">{formatCurrency(t.purchaseCost, currency)}</span>
          <p className="text-[10px] text-slate-400">{formatDate(t.purchaseDate)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Condition',
      align: 'center',
      render: (t) => <StatusBadge status={t.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Disc className="w-6 h-6 text-blue-400" />
            <span>Tyre Lifecycle & Tread Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track individual tyres by wheel position (FL, FR, RL, RR, Spare), tread wear depths, rotations, and replacement schedules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => openQuickModal('add-work-order')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Order Tyre Service
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Monitored Tyres"
          value={totalTyres}
          subValue="Active wheel positions"
          icon={<Disc className="w-4 h-4" />}
          variant="indigo"
        />
        <StatCard
          title="Critical Wear (< 2.0 mm)"
          value={criticalTyres}
          subValue="High blowout hazard"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="rose"
        />
        <StatCard
          title="Due Soon (< 3.0 mm)"
          value={dueSoonTyres}
          subValue="Scheduled for renewal"
          icon={<Activity className="w-4 h-4" />}
          variant="amber"
        />
        <StatCard
          title="Cumulative Tyre Spend"
          value={formatCurrency(totalTyreInvestment, currency)}
          subValue="New sets & wheel alignments"
          icon={<Disc className="w-4 h-4" />}
          variant="emerald"
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredTyres}
        columns={columns}
        keyExtractor={t => t.id}
        title="Fleet Tyre Registry"
        searchPlaceholder="Search by plate, tyre brand, size, serial number or position..."
        exportFilename="FleetX_Tyres_Register"
        filterComponent={
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All Conditions</option>
            <option value="Critical">Critical Wear Only</option>
            <option value="Due Soon">Due Soon</option>
            <option value="Good">Good Condition</option>
          </select>
        }
      />
    </div>
  );
};

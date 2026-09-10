import React, { useState } from 'react';
import { Droplet, Plus, AlertTriangle, CheckCircle2, Clock, Wrench } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { OilChange } from '../../types/vehicle';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const OilManagementPage: React.FC = () => {
  const { oilChanges, vehicles, currency } = useFleet();
  const { openQuickModal, openVehicleDetail } = useUI();
  const [filter, setFilter] = useState<string>('all');

  const overdueCount = oilChanges.filter(o => o.status === 'Overdue').length;
  const dueSoonCount = oilChanges.filter(o => o.status === 'Due Soon').length;
  const normalCount = oilChanges.filter(o => o.status === 'Normal').length;
  const totalCost = oilChanges.reduce((s, o) => s + (o.totalCost || 0), 0);

  const filteredOilChanges = oilChanges.filter(o => {
    if (filter !== 'all' && o.status !== filter) return false;
    return true;
  });

  const columns: Column<OilChange>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle / Plate',
      render: (o) => {
        const v = vehicles.find(veh => veh.id === o.vehicleId);
        return (
          <div className="cursor-pointer" onClick={() => openVehicleDetail(o.vehicleId, 'oil')}>
            <span className="font-bold text-slate-100">{v?.brand} {v?.model}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-indigo-300 font-mono text-[10px]">
                {v?.plateNumber}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Cur: {v?.currentMileage.toLocaleString()} KM</span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'oilProduct',
      header: 'Oil Brand & Grade',
      render: (o) => (
        <div>
          <p className="font-semibold text-slate-200">{o.oilBrand}</p>
          <p className="text-[11px] text-slate-400 font-mono">{o.oilGrade} • {o.quantityLitres} Litres</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Service Date',
      render: (o) => (
        <div>
          <span className="text-slate-300">{formatDate(o.date)}</span>
          <p className="text-[10px] text-slate-400 font-mono">At {o.odometer.toLocaleString()} KM</p>
        </div>
      ),
    },
    {
      key: 'nextDue',
      header: 'Next Service Due',
      render: (o) => (
        <div>
          <span className="font-mono font-bold text-indigo-300">{o.nextOilChangeMileage.toLocaleString()} KM</span>
          <p className="text-[10px] text-slate-400">Target: {formatDate(o.nextOilChangeDate)}</p>
        </div>
      ),
    },
    {
      key: 'totalCost',
      header: 'Total Cost',
      align: 'right',
      render: (o) => (
        <div className="text-right">
          <span className="font-bold text-slate-100">{formatCurrency(o.totalCost, currency)}</span>
          <p className="text-[10px] text-slate-400">Oil: {formatCurrency(o.oilCost, currency)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Warning Status',
      align: 'center',
      render: (o) => <StatusBadge status={o.status} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      sortable: false,
      render: (o) => (
        <Button variant="ghost" size="xs" onClick={() => openVehicleDetail(o.vehicleId, 'oil')}>
          History
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Droplet className="w-6 h-6 text-amber-400" />
            <span>Oil Service & Lubrication Tracker</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track engine oil grades, intervals, and automatic next service calculations with warning levels.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => openQuickModal('add-oil-change')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Record Oil Service
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Oil Services Logged"
          value={oilChanges.length}
          subValue="Total historical jobs"
          icon={<Droplet className="w-4 h-4" />}
          variant="indigo"
        />
        <StatCard
          title="Overdue Oil Changes"
          value={overdueCount}
          subValue="Exceeded KM interval limit"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="rose"
        />
        <StatCard
          title="Due Soon (< 1,000 KM)"
          value={dueSoonCount}
          subValue="Approaching threshold"
          icon={<Clock className="w-4 h-4" />}
          variant="amber"
        />
        <StatCard
          title="Cumulative Oil Cost"
          value={formatCurrency(totalCost, currency)}
          subValue="Lubricants & filters"
          icon={<Droplet className="w-4 h-4" />}
          variant="emerald"
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredOilChanges}
        columns={columns}
        keyExtractor={o => o.id}
        title="Engine Oil Service Register"
        searchPlaceholder="Search by vehicle, oil brand, grade, odometer..."
        exportFilename="FleetX_Oil_Services"
        filterComponent={
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All Warning Levels</option>
            <option value="Overdue">Overdue Only</option>
            <option value="Due Soon">Due Soon</option>
            <option value="Normal">Normal</option>
          </select>
        }
      />
    </div>
  );
};

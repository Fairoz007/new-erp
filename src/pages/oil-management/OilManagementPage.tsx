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
          <div className="cursor-pointer group" onClick={() => openVehicleDetail(o.vehicleId, 'oil')}>
            <span className="font-bold text-slate-100 text-sm group-hover:text-[#086343] transition-colors">
              {v?.brand} {v?.model}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-[#086343] font-mono font-bold text-xs">
                {v?.plateNumber}
              </span>
              <span className="text-xs text-slate-400 font-mono">Cur: {v?.currentMileage.toLocaleString()} KM</span>
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
          <p className="font-bold text-slate-200 text-sm">{o.oilBrand}</p>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{o.oilGrade} • {o.quantityLitres} Litres</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Service Date',
      render: (o) => (
        <div>
          <span className="text-slate-200 font-semibold text-sm">{formatDate(o.date)}</span>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{o.odometer.toLocaleString()} KM</p>
        </div>
      ),
    },
    {
      key: 'nextService',
      header: 'Next Target',
      render: (o) => (
        <div>
          <span className="font-mono font-bold text-slate-100 text-sm">{o.nextOilChangeMileage.toLocaleString()} KM</span>
          <p className="text-xs text-slate-400 mt-0.5">Target Odometer</p>
        </div>
      ),
    },
    {
      key: 'totalCost',
      header: 'Cost',
      align: 'right',
      render: (o) => (
        <div className="text-right">
          <span className="font-bold text-slate-100 text-sm font-mono">{formatCurrency(o.totalCost, currency)}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Health Status',
      align: 'center',
      render: (o) => <StatusBadge status={o.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Oil Service & Lubrication Tracker
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Track engine oil grades, intervals, and automatic next service calculations with warning levels.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="primary"
            size="md"
            onClick={() => openQuickModal('add-oil-change')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Record Oil Service
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Oil Services Logged"
          value={oilChanges.length}
          subValue="Total historical jobs"
          isHero={true}
        />
        <StatCard
          title="Overdue Oil Changes"
          value={overdueCount}
          subValue="Exceeded KM interval limit"
          trend={{ value: `${overdueCount} Critical`, direction: 'down' }}
        />
        <StatCard
          title="Due Soon (< 1,000 KM)"
          value={dueSoonCount}
          subValue="Approaching threshold"
          trend={{ value: `${dueSoonCount} Due`, direction: 'neutral' }}
        />
        <StatCard
          title="Cumulative Oil Cost"
          value={formatCurrency(totalCost, currency)}
          subValue="Lubricants & filters"
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
            className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
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

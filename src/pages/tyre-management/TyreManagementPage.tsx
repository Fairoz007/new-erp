import React, { useState } from 'react';
import { useVehicleTypeFilter } from '../../hooks/useVehicleTypeFilter';
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
import { useAuth } from '../../context/AuthContext';
import { TyreEditModal } from './TyreEditModal';
import { FilterSelect } from '../../components/ui/FilterControls';
import { PageHeader } from '../../components/ui/PageHeader';

type TyreRow = Tyre & { vehiclePlate: string; vehicleName: string };

export const TyreManagementPage: React.FC = () => {
  const { tyres: allTyres, tyreEvents: allTyreEvents, vehicles, currency, selectedCompanyId, updateTyre } = useFleet();
  const { openQuickModal, openVehicleDetail, addToast } = useUI();
  const { hasPermission } = useAuth();
  const [editing, setEditing] = useState<Tyre | null>(null);
  const [filter, setFilter] = useState<string>('all');

  // Scope to selected office and add searchable vehicle fields
  const inScope = (vehicleId: string) => {
    if (!selectedCompanyId || selectedCompanyId === 'all') return true;
    return vehicles.find(v => v.id === vehicleId)?.companyId === selectedCompanyId;
  };
  const tyres: TyreRow[] = allTyres
    .filter(t => inScope(t.vehicleId))
    .map(t => {
      const v = vehicles.find(veh => veh.id === t.vehicleId);
      return { ...t, vehiclePlate: v?.plateNumber || '', vehicleName: v ? `${v.brand} ${v.model}` : '' };
    });
  const tyreEvents = allTyreEvents.filter(te => inScope(te.vehicleId));

  const totalTyres = tyres.filter(t => !['Replaced', 'Scrapped'].includes(t.status)).length;
  const criticalTyres = tyres.filter(t => t.status === 'Critical').length;
  const dueSoonTyres = tyres.filter(t => t.status === 'Due Soon').length;
  const totalTyreInvestment = tyres.reduce((s, t) => s + (t.purchaseCost || 0), 0) + tyreEvents.reduce((s, te) => s + (te.cost || 0), 0);

  const vt = useVehicleTypeFilter();
  const filteredTyres = tyres.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (!vt.matches(t.vehicleId)) return false;
    return true;
  });

  const columns: Column<TyreRow>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle / Position',
      render: (t) => {
        const v = vehicles.find(veh => veh.id === t.vehicleId);
        return (
          <div className="cursor-pointer" onClick={() => openVehicleDetail(t.vehicleId, 'tyres')}>
            <span className="font-bold text-slate-100">{v?.brand} {v?.model}</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="px-2 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-[#086343] font-mono font-bold text-[10px]">
                {v?.plateNumber}
              </span>
              <span className="text-[10px] text-amber-700 font-bold px-2 py-0.5 rounded-full bg-amber-50">{t.position}</span>
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
          <p className="font-bold text-slate-200">{t.brand} {t.model}</p>
          <p className="text-[11px] text-slate-400 font-mono">{t.size} • SN: {t.serialNumber}</p>
        </div>
      ),
    },
    {
      key: 'treadDepthMm',
      header: 'Tread Depth',
      align: 'right',
      render: (t) => (
        <div className="text-right">
          <span className={`font-mono font-bold text-sm ${t.treadDepthMm <= 2.0 ? 'text-rose-600' : t.treadDepthMm <= 3.0 ? 'text-amber-700' : 'text-[#086343]'}`}>
            {t.treadDepthMm} mm
          </span>
          <p className="text-[9px] text-slate-400 font-medium">Min 2.0 mm</p>
        </div>
      ),
    },
    {
      key: 'purchaseCost',
      header: 'Cost',
      align: 'right',
      render: (t) => (
        <div className="text-right">
          <span className="font-bold text-slate-100">{formatCurrency(t.purchaseCost, currency)}</span>
          <p className="text-[10px] text-slate-400">{formatDate(t.installationDate)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Wear Status',
      align: 'center',
      render: (t) => <StatusBadge status={t.status} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      sortable: false,
      render: (t) => (
        <div className="flex items-center justify-end gap-1.5">
          {hasPermission('edit', 'tyres') && (
            <Button variant="ghost" size="xs" onClick={() => setEditing(t)}>
              Update
            </Button>
          )}
          <Button variant="ghost" size="xs" onClick={() => openVehicleDetail(t.vehicleId, 'tyres')}>
            Lifecycle
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Tyre Inventory & Lifecycle Management"
        description="Track individual tyres by wheel position (FL, FR, RL, RR, Spare), tread wear depths, rotations, and replacement schedules."
        actions={
          <>
            {hasPermission('create', 'tyres') && (
              <Button variant="outline" size="md" onClick={() => openQuickModal('add-tyre')} leftIcon={<Plus className="w-4 h-4" />}>
                Add Tyre
              </Button>
            )}
            {hasPermission('create', 'work-orders') && (
              <Button
                variant="primary"
                size="md"
                onClick={() => openQuickModal('add-work-order')}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Order Tyre Service
              </Button>
            )}
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Monitored Tyres"
          value={totalTyres}
          subValue="Active wheel positions"
          isHero={true}
        />
        <StatCard
          title="Critical Wear (< 2.0 mm)"
          value={criticalTyres}
          subValue="High blowout hazard"
          trend={{ value: `${criticalTyres} Hazards`, direction: 'down' }}
        />
        <StatCard
          title="Due Soon (< 3.0 mm)"
          value={dueSoonTyres}
          subValue="Scheduled for renewal"
          trend={{ value: `${dueSoonTyres} Tyres`, direction: 'neutral' }}
        />
        <StatCard
          title="Cumulative Tyre Spend"
          value={formatCurrency(totalTyreInvestment, currency)}
          subValue="New sets & wheel alignments"
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredTyres}
        collection={'tyres'}
        columns={columns}
        keyExtractor={t => t.id}
        title="Fleet Tyre Registry"
        searchPlaceholder="Search by plate, tyre brand, size, serial number or position..."
        searchFields={['vehiclePlate', 'vehicleName', 'brand', 'model', 'size', 'serialNumber', 'position']}
        exportFilename="Tyres_Register"
        filterComponent={
          <div className="flex flex-wrap items-center gap-1.5">
            {vt.ui}
          <FilterSelect
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="all">All Conditions</option>
            <option value="Critical">Critical Wear Only</option>
            <option value="Due Soon">Due Soon</option>
            <option value="Good">Good Condition</option>
            <option value="Fair">Fair</option>
            <option value="Replaced">Replaced</option>
            <option value="Scrapped">Scrapped</option>
          </FilterSelect>
          </div>
        }
      />
      {editing && (
        <TyreEditModal
          tyre={editing}
          onClose={() => setEditing(null)}
          onSubmit={async updates => {
            await updateTyre(editing.id, { ...updates, updatedAt: editing.updatedAt });
            addToast({ type: 'success', title: 'Tyre Updated', message: `${editing.brand} ${editing.position} was saved.` });
          }}
        />
      )}
    </div>
  );
};

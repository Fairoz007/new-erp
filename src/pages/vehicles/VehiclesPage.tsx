import React, { useState } from 'react';
import { Car, Plus, Download, Filter, Wrench, Receipt, Droplet, Disc, AlertTriangle, FileText, ArrowRight } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Vehicle, VehicleStatus } from '../../types/vehicle';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const VehiclesPage: React.FC = () => {
  const { vehicles, selectedCompanyId, currency } = useFleet();
  const { openVehicleDetail, openQuickModal } = useUI();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredVehicles = vehicles.filter(v => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && v.companyId !== selectedCompanyId) {
      return false;
    }
    if (statusFilter !== 'all' && v.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const columns: Column<Vehicle>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle / ID',
      render: (v) => (
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl overflow-hidden bg-slate-800 shrink-0 border border-slate-700 shadow-2xs">
            <img src={v.photoUrl} alt={v.model} className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="font-bold text-slate-100">{v.brand} {v.model}</p>
            <p className="text-[11px] text-slate-400 font-mono">{v.vehicleId} • {v.variant}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'plateNumber',
      header: 'Plate / Reg No',
      render: (v) => (
        <div>
          <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 font-mono text-slate-100 font-bold text-xs">
            {v.plateNumber}
          </span>
          <p className="text-[10px] text-slate-400 font-mono mt-1">VIN: {v.vin.slice(0, 10)}...</p>
        </div>
      ),
    },
    {
      key: 'vehicleType',
      header: 'Type & Category',
      render: (v) => (
        <div>
          <p className="font-bold text-slate-200">{v.vehicleType}</p>
          <p className="text-[11px] text-slate-400">{v.vehicleCategory} • {v.fuelType}</p>
        </div>
      ),
    },
    {
      key: 'currentMileage',
      header: 'Mileage (KM)',
      align: 'right',
      render: (v) => (
        <div className="text-right">
          <span className="font-bold text-slate-100 font-mono">{v.currentMileage.toLocaleString()} KM</span>
          <p className="text-[10px] text-slate-400">Year {v.manufacturingYear}</p>
        </div>
      ),
    },
    {
      key: 'purchaseValue',
      header: 'Purchase Value',
      align: 'right',
      render: (v) => (
        <div className="text-right">
          <span className="font-semibold text-slate-300">{formatCurrency(v.purchase.purchaseValue, currency)}</span>
          <p className="text-[10px] text-slate-400">{formatDate(v.purchase.purchaseDate)}</p>
        </div>
      ),
    },
    {
      key: 'currentMarketValue',
      header: 'Market Value',
      align: 'right',
      render: (v) => (
        <div className="text-right">
          <span className="font-bold text-[#086343]">{formatCurrency(v.currentMarketValue, currency)}</span>
          <p className="text-[10px] text-slate-400">Est. Resale</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (v) => <StatusBadge status={v.status} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Quick Actions',
      align: 'right',
      sortable: false,
      render: (v) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => openVehicleDetail(v.id)}
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            Profile
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Vehicles Fleet Master Database
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Manage company vehicles, operational assignments, mileage records, financial summaries, and life cycles.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="primary"
            size="md"
            onClick={() => openQuickModal('add-vehicle')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add New Vehicle
          </Button>
        </div>
      </div>

      {/* Fleet Table */}
      <DataTable
        data={filteredVehicles}
        columns={columns}
        keyExtractor={v => v.id}
        title="Fleet Vehicle Inventory"
        description="Click on any vehicle row to open the complete 10-tab vehicle management dossier."
        searchPlaceholder="Search by vehicle ID, plate number, brand, model, VIN or driver..."
        searchFields={['vehicleId', 'plateNumber', 'brand', 'model', 'vin', 'assignedDriver', 'department']}
        exportFilename="FleetX_Vehicles_Master"
        onRowClick={v => openVehicleDetail(v.id)}
        filterComponent={
          <div className="flex items-center gap-1.5">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
            >
              <option value="all">All Fleet Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Under Maintenance">Under Maintenance</option>
              <option value="Accident">Accident</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        }
      />
    </div>
  );
};

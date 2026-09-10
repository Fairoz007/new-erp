import React, { useState } from 'react';
import { Wrench, Plus, Download, Filter, FileText, ArrowRight } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { MaintenanceRecord } from '../../types/maintenance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const MaintenancePage: React.FC = () => {
  const { maintenanceRecords, selectedCompanyId, currency } = useFleet();
  const { openQuickModal, openVehicleDetail } = useUI();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filteredRecords = maintenanceRecords.filter(m => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && m.companyId !== selectedCompanyId) return false;
    if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
    return true;
  });

  const columns: Column<MaintenanceRecord>[] = [
    {
      key: 'recordNumber',
      header: 'Record # / Plate',
      render: (m) => (
        <div>
          <span className="font-mono font-bold text-slate-100">{m.recordNumber}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-indigo-300 font-mono text-[10px]">
              {m.vehiclePlate}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{m.odometerReading.toLocaleString()} KM</span>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category & Type',
      render: (m) => (
        <div>
          <span className="font-semibold text-slate-200">{m.category}</span>
          <p className="text-[11px] text-slate-400">{m.maintenanceType}</p>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Work Description',
      render: (m) => (
        <div className="max-w-md">
          <p className="text-slate-200 line-clamp-1">{m.description}</p>
          <p className="text-[10px] text-slate-400">Workshop: {m.serviceCentre}</p>
        </div>
      ),
    },
    {
      key: 'maintenanceDate',
      header: 'Service Date',
      render: (m) => (
        <div>
          <span className="text-slate-300">{formatDate(m.maintenanceDate)}</span>
          {m.nextServiceMileage && <p className="text-[10px] text-indigo-400">Next: {m.nextServiceMileage.toLocaleString()} KM</p>}
        </div>
      ),
    },
    {
      key: 'totalCost',
      header: 'Total Cost',
      align: 'right',
      render: (m) => (
        <div className="text-right">
          <span className="font-bold text-slate-100">{formatCurrency(m.totalCost, currency)}</span>
          <p className="text-[10px] text-slate-400">Parts: {formatCurrency(m.partsCost, currency)}</p>
        </div>
      ),
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      align: 'center',
      render: (m) => <StatusBadge status={m.paymentStatus} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Vehicle',
      align: 'right',
      sortable: false,
      render: (m) => (
        <Button variant="ghost" size="xs" onClick={() => openVehicleDetail(m.vehicleId, 'maintenance')}>
          Dossier
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
            <Wrench className="w-6 h-6 text-indigo-400" />
            <span>Vehicle Maintenance & Workshop Records</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Complete log of preventive maintenance, emergency breakdown repairs, replacement parts, labour costs, and warranty tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => openQuickModal('add-maintenance')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Record Maintenance
          </Button>
        </div>
      </div>

      <DataTable
        data={filteredRecords}
        columns={columns}
        keyExtractor={m => m.id}
        title="Fleet Maintenance Ledger"
        searchPlaceholder="Search maintenance by plate, record number, description, category or service centre..."
        searchFields={['recordNumber', 'vehiclePlate', 'category', 'description', 'serviceCentre', 'supplierName']}
        exportFilename="FleetX_Maintenance_Records"
        filterComponent={
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">All Service Categories</option>
            <option value="General Service">General Service</option>
            <option value="Brake Service">Brake Service</option>
            <option value="Transmission Repair">Transmission Repair</option>
            <option value="Engine Repair">Engine Repair</option>
            <option value="Electrical">Electrical</option>
            <option value="AC Repair">AC Repair</option>
          </select>
        }
      />
    </div>
  );
};

import React, { useState } from 'react';
import { Wrench, Plus, Download, Filter, FileText, ArrowRight } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { MaintenanceRecord, MaintenanceCategory } from '../../types/maintenance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

const MAINTENANCE_CATEGORIES: MaintenanceCategory[] = [
  'General Service', 'Preventive Maintenance', 'Corrective Maintenance', 'Engine Repair', 'Transmission Repair',
  'Brake Service', 'Suspension', 'Steering', 'Electrical', 'AC Repair', 'Battery', 'Oil Change', 'Filter Change',
  'Tyres', 'Wheel Alignment', 'Wheel Balancing', 'Body Repair', 'Painting', 'Accident Repair', 'Glass Replacement',
  'Interior Repair', 'Washing / Detailing', 'Inspection', 'Registration', 'Insurance', 'Other',
];

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
          <div className="flex items-center gap-1.5 mt-1">
            <span className="px-2 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-[#086343] font-mono font-bold text-[10px]">
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
          <span className="font-bold text-slate-200">{m.category}</span>
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
          <span className="text-slate-300 font-medium">{formatDate(m.maintenanceDate)}</span>
          {m.nextServiceMileage && <p className="text-[10px] text-[#086343] font-semibold">Next: {m.nextServiceMileage.toLocaleString()} KM</p>}
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Vehicle Maintenance & Workshop Records
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Complete log of preventive maintenance, emergency breakdown repairs, replacement parts, labour costs, and warranty tracking.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="primary"
            size="md"
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
            className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
          >
            <option value="all">All Service Categories</option>
            {MAINTENANCE_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        }
      />
    </div>
  );
};

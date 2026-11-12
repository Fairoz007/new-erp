import React, { useState } from 'react';
import { useVehicleTypeFilter } from '../../hooks/useVehicleTypeFilter';
import { Plus } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Accident } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { useAuth } from '../../context/AuthContext';
import { AccidentUpdateModal } from './AccidentUpdateModal';
import { FilterSelect } from '../../components/ui/FilterControls';
import { PageHeader } from '../../components/ui/PageHeader';
import { buttonLike } from '../../lib/a11y';

export const AccidentsPage: React.FC = () => {
  const { accidents, currency, selectedCompanyId, updateAccident } = useFleet();
  const { openQuickModal, openVehicleDetail, addToast } = useUI();
  const { hasPermission } = useAuth();
  const [editing, setEditing] = useState<Accident | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const vt = useVehicleTypeFilter();
  const filteredAccidents = accidents.filter(a => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && a.companyId !== selectedCompanyId) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (!vt.matches(a.vehicleId)) return false;
    return true;
  });

  // KPIs follow the selected office (not the status dropdown)
  const scopedAccidents = accidents.filter(a => !selectedCompanyId || selectedCompanyId === 'all' || a.companyId === selectedCompanyId);
  const totalAccidents = scopedAccidents.length;
  const activeCases = scopedAccidents.filter(a => !['Completed', 'Closed'].includes(a.status)).length;
  const totalRepairCost = scopedAccidents.reduce((s, a) => s + (a.actualRepairCost || 0), 0);
  const totalInsuranceRecovered = scopedAccidents.reduce((s, a) => s + (a.insuranceContribution || 0), 0);
  const netCompanyCost = scopedAccidents.reduce((s, a) => s + (a.netAccidentCostToCompany || 0), 0);
  const recoveryPct = totalRepairCost > 0 ? Math.round((totalInsuranceRecovered / totalRepairCost) * 100) : 0;

  const columns: Column<Accident>[] = [
    {
      key: 'accidentNumber',
      header: 'Accident # / Vehicle',
      render: (a) => (
        <div {...buttonLike} className="cursor-pointer" onClick={() => openVehicleDetail(a.vehicleId, 'accidents')}>
          <span className="font-mono font-bold text-slate-100">{a.accidentNumber}</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="px-2.5 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-[#086343] font-mono font-bold text-[10px]">
              {a.vehiclePlate}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Driver: {a.driverName}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'accidentType',
      header: 'Type & Location',
      render: (a) => (
        <div>
          <span className="font-bold text-slate-200">{a.accidentType}</span>
          <p className="text-[11px] text-slate-400 truncate max-w-xs" title={a.location}>{a.location}</p>
        </div>
      ),
    },
    {
      key: 'policeInsurance',
      header: 'Police & Claim #',
      render: (a) => (
        <div>
          <span className="font-mono text-xs text-slate-300">Police: {a.policeReportNumber || 'n/a'}</span>
          <p className="text-[10px] text-slate-400">Claim: {a.insuranceClaimNumber || 'n/a'}</p>
        </div>
      ),
    },
    {
      key: 'accidentDate',
      header: 'Date & Downtime',
      render: (a) => (
        <div>
          <span className="text-slate-300 font-medium">{formatDate(a.accidentDate)}</span>
          <p className="text-[10px] text-rose-600 font-semibold">{a.vehicleDowntimeDays} Days Inactive</p>
        </div>
      ),
    },
    {
      key: 'repairCost',
      header: 'Repair Cost',
      align: 'right',
      render: (a) => (
        <div className="text-right">
          <span className="font-bold text-slate-100">{formatCurrency(a.actualRepairCost, currency)}</span>
          <p className="text-[10px] text-[#086343] font-semibold">Recov: {formatCurrency(a.insuranceContribution, currency)}</p>
        </div>
      ),
    },
    {
      key: 'netCost',
      header: 'Net Co. Cost',
      align: 'right',
      render: (a) => (
        <div className="text-right">
          <span className="font-bold text-rose-600">{formatCurrency(a.netAccidentCostToCompany, currency)}</span>
          <p className="text-[10px] text-slate-400">After recoveries</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (a) => <StatusBadge status={a.status} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      sortable: false,
      render: (a) => (
        <div className="flex items-center justify-end gap-1.5">
          {hasPermission('edit', 'accidents') && (
            <Button variant="ghost" size="xs" onClick={() => setEditing(a)}>
              Update
            </Button>
          )}
          <Button variant="ghost" size="xs" onClick={() => openVehicleDetail(a.vehicleId, 'accidents')}>
            Claim File
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Accident & Insurance Claims Management"
        description="Track collision reports, police documentation, third-party liabilities, insurance recoveries, downtime days, and net costs."
        actions={
          <>
            {hasPermission('create', 'accidents') && (
              <Button
                variant="danger"
                size="md"
                onClick={() => openQuickModal('add-accident')}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Report Accident
              </Button>
            )}
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Collision Cases"
          value={totalAccidents}
          subValue={`${activeCases} Active Claims`}
          isHero={true}
        />
        <StatCard
          title="Gross Repair Cost"
          value={formatCurrency(totalRepairCost, currency)}
          subValue="Bodyshop estimates"
        />
        <StatCard
          title="Insurance Recovery"
          value={formatCurrency(totalInsuranceRecovered, currency)}
          subValue="Settled by underwriters"
          trend={{ value: `${recoveryPct}% Covered`, direction: 'up' }}
        />
        <StatCard
          title="Net Cost to Company"
          value={formatCurrency(netCompanyCost, currency)}
          subValue="Repair cost less insurance and third-party recoveries"
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredAccidents}
        collection={'accidents'}
        columns={columns}
        keyExtractor={a => a.id}
        title="Accident Registry"
        searchPlaceholder="Search by accident number, plate, police report, claim number or location..."
        searchFields={['accidentNumber', 'vehiclePlate', 'policeReportNumber', 'insuranceClaimNumber', 'location', 'driverName']}
        exportFilename="Accidents_Register"
        filterComponent={
          <div className="flex flex-wrap items-center gap-1.5">
            {vt.ui}
          <FilterSelect
            aria-label="Claim status"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Claim Statuses</option>
            <option value="Under Repair">Under Repair</option>
            <option value="Insurance Processing">Insurance Processing</option>
            <option value="Reported">Reported</option>
            <option value="Under Investigation">Under Investigation</option>
            <option value="Repair Approved">Repair Approved</option>
            <option value="Completed">Completed</option>
            <option value="Closed">Closed</option>
          </FilterSelect>
          </div>
        }
      />
      {editing && (
        <AccidentUpdateModal
          accident={editing}
          onClose={() => setEditing(null)}
          onSubmit={async updates => {
            await updateAccident(editing.id, { ...updates, updatedAt: editing.updatedAt });
            addToast({ type: 'success', title: 'Claim Updated', message: `${editing.accidentNumber} was saved.` });
          }}
        />
      )}
    </div>
  );
};

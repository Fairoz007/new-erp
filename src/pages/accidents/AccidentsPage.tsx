import React, { useState } from 'react';
import { AlertTriangle, Plus, ShieldCheck, Clock, FileText, CheckCircle2, Car } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { Accident } from '../../types/operations';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const AccidentsPage: React.FC = () => {
  const { accidents, vehicles, currency, selectedCompanyId } = useFleet();
  const { openQuickModal, openVehicleDetail } = useUI();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredAccidents = accidents.filter(a => {
    if (selectedCompanyId && selectedCompanyId !== 'all' && a.companyId !== selectedCompanyId) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    return true;
  });

  const totalAccidents = accidents.length;
  const activeCases = accidents.filter(a => !['Completed', 'Closed'].includes(a.status)).length;
  const totalRepairCost = accidents.reduce((s, a) => s + (a.actualRepairCost || 0), 0);
  const totalInsuranceRecovered = accidents.reduce((s, a) => s + (a.insuranceContribution || 0), 0);
  const netCompanyCost = accidents.reduce((s, a) => s + (a.netAccidentCostToCompany || 0), 0);

  const columns: Column<Accident>[] = [
    {
      key: 'accidentNumber',
      header: 'Accident # / Vehicle',
      render: (a) => (
        <div className="cursor-pointer" onClick={() => openVehicleDetail(a.vehicleId, 'accidents')}>
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
          <p className="text-[11px] text-slate-400 truncate max-w-xs">{a.location}</p>
        </div>
      ),
    },
    {
      key: 'policeInsurance',
      header: 'Police & Claim #',
      render: (a) => (
        <div>
          <span className="font-mono text-xs text-slate-300">Police: {a.policeReportNumber}</span>
          <p className="text-[10px] text-slate-400">Claim: {a.insuranceClaimNumber || 'Pending'}</p>
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
          <p className="text-[10px] text-slate-400">Deductible</p>
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
        <Button variant="ghost" size="xs" onClick={() => openVehicleDetail(a.vehicleId, 'accidents')}>
          Claim File
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
            Accident & Insurance Claims Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Track collision reports, police documentation, third-party liabilities, insurance recoveries, downtime days, and net costs.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="danger"
            size="md"
            onClick={() => openQuickModal('add-accident')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Report Accident
          </Button>
        </div>
      </div>

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
          trend={{ value: `${totalInsuranceRecovered > 0 ? '+78%' : '0%'} Covered`, direction: 'up' }}
        />
        <StatCard
          title="Net Cost to Company"
          value={formatCurrency(netCompanyCost, currency)}
          subValue="Policy deductibles & excesses"
          trend={{ value: 'Liability', direction: 'down' }}
        />
      </div>

      {/* DataTable */}
      <DataTable
        data={filteredAccidents}
        columns={columns}
        keyExtractor={a => a.id}
        title="Accident Registry"
        searchPlaceholder="Search by accident number, plate, police report, claim number or location..."
        exportFilename="FleetX_Accidents_Register"
        filterComponent={
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-850 border border-slate-700 rounded-full px-3.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-[#086343] cursor-pointer"
          >
            <option value="all">All Claim Statuses</option>
            <option value="Under Repair">Under Repair</option>
            <option value="Insurance Processing">Insurance Processing</option>
            <option value="Reported">Reported</option>
            <option value="Closed">Closed</option>
          </select>
        }
      />
    </div>
  );
};

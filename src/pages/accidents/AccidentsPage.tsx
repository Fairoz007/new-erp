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
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-indigo-300 font-mono text-[10px]">
              {a.vehiclePlate}
            </span>
            <span className="text-[10px] text-slate-400">Driver: {a.driverName}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'accidentType',
      header: 'Type & Location',
      render: (a) => (
        <div>
          <span className="font-semibold text-slate-200">{a.accidentType}</span>
          <p className="text-[11px] text-slate-400 truncate max-w-xs">{a.location}</p>
        </div>
      ),
    },
    {
      key: 'policeInsurance',
      header: 'Police & Claim #',
      render: (a) => (
        <div>
          <p className="text-[11px] font-mono text-slate-300">ROP: {a.policeReportNumber}</p>
          <p className="text-[10px] font-mono text-indigo-400">Claim: {a.insuranceClaimNumber || 'Pending'}</p>
        </div>
      ),
    },
    {
      key: 'accidentDate',
      header: 'Date & Downtime',
      render: (a) => (
        <div>
          <span className="text-slate-300">{formatDate(a.accidentDate)}</span>
          <p className="text-[10px] text-amber-400 font-semibold">{a.vehicleDowntimeDays} Days Downtime</p>
        </div>
      ),
    },
    {
      key: 'actualRepairCost',
      header: 'Repair Cost',
      align: 'right',
      render: (a) => (
        <div className="text-right">
          <span className="font-bold text-slate-100">{formatCurrency(a.actualRepairCost, currency)}</span>
          <p className="text-[10px] text-emerald-400">Ins: {formatCurrency(a.insuranceContribution, currency)}</p>
        </div>
      ),
    },
    {
      key: 'netAccidentCostToCompany',
      header: 'Net Company Cost',
      align: 'right',
      render: (a) => (
        <div className="text-right">
          <span className="font-bold text-rose-400">{formatCurrency(a.netAccidentCostToCompany, currency)}</span>
          <p className="text-[9px] text-slate-500">Deductible</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (a) => <StatusBadge status={a.status} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <AlertTriangle className="w-6 h-6 text-rose-400" />
            <span>Accident & Insurance Claims Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track collision reports, police documentation, third-party liabilities, insurance recoveries, downtime days, and net costs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={() => openQuickModal('add-accident')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Report Accident
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Total Collision Cases"
          value={totalAccidents}
          subValue={`${activeCases} Active Claims`}
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="rose"
        />
        <StatCard
          title="Gross Repair Cost"
          value={formatCurrency(totalRepairCost, currency)}
          subValue="Bodyshop estimates"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="amber"
        />
        <StatCard
          title="Insurance Recovery"
          value={formatCurrency(totalInsuranceRecovered, currency)}
          subValue="Settled by underwriters"
          icon={<ShieldCheck className="w-4 h-4" />}
          variant="emerald"
        />
        <StatCard
          title="Net Cost to Company"
          value={formatCurrency(netCompanyCost, currency)}
          subValue="Policy deductibles & excesses"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="purple"
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
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
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

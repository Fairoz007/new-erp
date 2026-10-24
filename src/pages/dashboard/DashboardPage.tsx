import React from 'react';
import {
  Car,
  Wrench,
  AlertTriangle,
  TrendingUp,
  Scale,
  Plus,
  FileText,
  Truck,
  CheckCircle2,
  Receipt,
  DollarSign,
  ArrowRight,
  Play,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  RevenueVsExpenseChart,
  MaintenanceTrendChart,
  ReferencePillBarChart,
  AssetDepreciationChart,
} from '../../components/charts/DashboardCharts';
import {
  FleetAvailabilityGaugeCard,
  OperationalShiftTrackerCard,
  OperatingCostBreakdownCard,
  AttentionRequiredCard,
  AttentionItem,
} from '../../components/dashboard/RightAnalyticsColumn';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const DashboardPage: React.FC = () => {
  const {
    vehicles,
    maintenanceRecords,
    workOrders,
    oilChanges,
    tyres,
    accidents,
    expenses,
    invoices,
    suppliers,
    customers,
    currency,
    getCompanyProfitLoss,
    getCompanyBalanceSheet,
  } = useFleet();

  const { setCurrentPage, openVehicleDetail, openQuickModal } = useUI();

  const pnl = getCompanyProfitLoss();
  const balanceSheet = getCompanyBalanceSheet();

  // Summary Metrics Calculations (Real ERP Data)
  const totalVehicles = vehicles.length;
  const activeVehicles = vehicles.filter(v => v.status === 'Active').length;
  const maintenanceVehicles = vehicles.filter(v => v.status === 'Under Maintenance').length;
  const accidentVehicles = vehicles.filter(v => v.status === 'Accident').length;
  const inactiveVehicles = vehicles.filter(v => ['Inactive', 'Sold', 'Scrapped'].includes(v.status)).length;

  const totalPurchaseValue = vehicles.reduce((s, v) => s + (v.purchase.purchaseValue || 0), 0);
  const currentAssetValue = balanceSheet.assets.netVehiclesValue;
  const totalDepreciation = balanceSheet.assets.accumulatedDepreciation;

  const lifetimeMaintenanceCost = maintenanceRecords.reduce((s, m) => s + (m.totalCost || 0), 0);
  const accidentCost = accidents.reduce((s, a) => s + (a.actualRepairCost || 0), 0);
  const oilChangeCost = oilChanges.reduce((s, o) => s + (o.totalCost || 0), 0);
  const tyreCost = tyres.reduce((s, t) => s + (t.purchaseCost || 0), 0);
  const insuranceCost = expenses.filter(e => e.category === 'Insurance').reduce((s, e) => s + e.total, 0) + vehicles.reduce((s, v) => s + (v.insurancePremiumAnnual || 0), 0);
  const totalExpensesLifetime = expenses.reduce((s, e) => s + e.total, 0) + lifetimeMaintenanceCost;

  const amountPayable = suppliers.reduce((s, sup) => s + sup.currentBalance, 0);
  const amountReceivable = customers.reduce((s, c) => s + c.currentBalance, 0);
  const outstandingSupplierInvoices = invoices.filter(i => i.invoiceType === 'Purchase' && i.paymentStatus !== 'Paid').length;
  const outstandingCustomerInvoices = invoices.filter(i => i.invoiceType === 'Sales' && i.paymentStatus !== 'Paid').length;

  // Real ERP Attention Items
  const attentionItems: AttentionItem[] = [];

  oilChanges.forEach(o => {
    if (o.status === 'Overdue' || o.status === 'Due Soon') {
      const v = vehicles.find(veh => veh.id === o.vehicleId);
      if (v) {
        attentionItems.push({
          id: `oil-${o.id}`,
          vehicleId: v.id,
          plate: v.plateNumber,
          name: `${v.brand} ${v.model}`,
          reason: `Oil service ${o.status.toLowerCase()} (Target: ${o.nextOilChangeMileage.toLocaleString()} KM | Current: ${v.currentMileage.toLocaleString()} KM)`,
          type: 'oil_overdue',
          severity: o.status === 'Overdue' ? 'critical' : 'warning',
          actionText: 'Schedule Oil Service',
          onClickAction: () => openQuickModal('add-oil-change'),
        });
      }
    }
  });

  tyres.forEach(t => {
    if (t.status === 'Critical' || t.status === 'Due Soon') {
      const v = vehicles.find(veh => veh.id === t.vehicleId);
      if (v && !attentionItems.some(item => item.vehicleId === v.id && item.type === 'tyre_critical')) {
        attentionItems.push({
          id: `tyr-${t.id}`,
          vehicleId: v.id,
          plate: v.plateNumber,
          name: `${v.brand} ${v.model}`,
          reason: `Tyre wear critical (${t.position}: ${t.treadDepthMm} mm tread depth remaining)`,
          type: 'tyre_critical',
          severity: 'critical',
          actionText: 'Replace Tyres',
          onClickAction: () => openQuickModal('add-work-order'),
        });
      }
    }
  });

  accidents.forEach(a => {
    if (a.status !== 'Closed' && a.status !== 'Completed') {
      const v = vehicles.find(veh => veh.id === a.vehicleId);
      if (v) {
        attentionItems.push({
          id: `acc-${a.id}`,
          vehicleId: v.id,
          plate: v.plateNumber,
          name: `${v.brand} ${v.model}`,
          reason: `Accident claim active: ${a.accidentType} (${a.status}) - Repair: ${formatCurrency(a.actualRepairCost, currency)}`,
          type: 'accident_pending',
          severity: 'critical',
          actionText: 'View Bodyshop Claim',
          onClickAction: () => setCurrentPage('accidents'),
        });
      }
    }
  });

  vehicles.forEach(v => {
    const isOverdue = v.registrationExpiryDate && new Date(v.registrationExpiryDate).getTime() < new Date().getTime();
    if (isOverdue) {
      attentionItems.push({
        id: `reg-${v.id}`,
        vehicleId: v.id,
        plate: v.plateNumber,
        name: `${v.brand} ${v.model}`,
        reason: `Mulkiya Registration Expired on ${v.registrationExpiryDate}`,
        type: 'registration_expiring',
        severity: 'critical',
        actionText: 'Renew Mulkiya',
        onClickAction: () => openQuickModal('upload-document'),
      });
    }
  });

  return (
    <div className="space-y-7">
      {/* Page Heading and Action Area (Exact Reference Match) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-100">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Plan, prioritize, and manage your enterprise fleet operations and accounting with ease.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="primary"
            size="md"
            onClick={() => openQuickModal('add-vehicle')}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Vehicle
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => setCurrentPage('reports')}
          >
            Export Data
          </Button>
        </div>
      </div>

      {/* Reference-Styled 4 Stat Metric Cards (First is deep forest green Hero) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Total Fleet Assets"
          value={totalVehicles}
          trend={{ value: `${activeVehicles} Units`, direction: 'up', label: 'Active on Road' }}
          isHero={true}
          onClick={() => setCurrentPage('vehicles')}
        />

        <StatCard
          title="In Workshop"
          value={maintenanceVehicles}
          trend={{ value: `${workOrders.filter(w => w.status === 'In Progress').length}`, direction: 'neutral', label: 'Work Orders in bay' }}
          onClick={() => setCurrentPage('work-orders')}
        />

        <StatCard
          title="Revenue YTD"
          value={formatCurrency(pnl.totalRevenue, currency)}
          trend={{ value: '+14.2%', direction: 'up', label: 'Increased from last month' }}
          onClick={() => setCurrentPage('profit-loss')}
        />

        <StatCard
          title="Pending Invoices (AP)"
          value={formatCurrency(amountPayable, currency)}
          trend={{ value: `${outstandingSupplierInvoices}`, direction: 'neutral', label: 'Bills On Discuss' }}
          onClick={() => setCurrentPage('invoices')}
        />
      </div>

      {/* Main Dashboard Layout (Reference 2-Column Split: 8 cols left, 4 cols right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 Cols on xl) */}
        <div className="xl:col-span-8 space-y-6">
          {/* Row 1: Operating Cost Analytics (Capsule Bar Chart) + Priority Reminder Card */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Project Analytics Capsule Bars (7 Cols) */}
            <Card className="md:col-span-7 bg-white">
              <CardHeader className="py-4 px-5">
                <CardTitle className="text-sm font-bold text-slate-100">Fleet Cost Analytics</CardTitle>
                <p className="text-xs text-slate-400">Weekly operational dispatch expenditure</p>
              </CardHeader>
              <div className="p-4">
                <ReferencePillBarChart />
              </div>
            </Card>

            {/* Reminders Card (5 Cols, Exact Reference Match) */}
            <Card className="md:col-span-5 bg-white flex flex-col justify-between">
              <CardHeader className="py-4 px-5">
                <CardTitle className="text-sm font-bold text-slate-100">Reminders</CardTitle>
              </CardHeader>
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <h4 className="text-base font-bold text-slate-100 leading-snug">
                    Mandatory PM Service: Volvo FH16
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 font-medium">
                    Time : 02.00 pm - 04.00 pm • Bay 3
                  </p>
                  <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-850 border border-slate-700 text-xs font-semibold text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-[#086343]" />
                    <span>Plate 4421-AA • Duqm Main Depot</span>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="md"
                    className="w-full"
                    onClick={() => openQuickModal('add-work-order')}
                    leftIcon={<Play className="w-4 h-4 fill-current" />}
                  >
                    Start Service Order
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Row 2: Team Collaboration (Drivers) + Project Progress (Semi-Circular Arc) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Team Collaboration / Driver Assignments (7 Cols) */}
            <Card className="md:col-span-7 bg-white">
              <CardHeader
                className="py-4 px-5"
                action={
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setCurrentPage('vehicles')}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Assign Driver
                  </Button>
                }
              >
                <CardTitle className="text-sm font-bold text-slate-100">Team Collaboration</CardTitle>
              </CardHeader>
              <div className="p-5 space-y-3.5">
                {vehicles.slice(0, 4).map((veh, idx) => (
                  <div
                    key={veh.id}
                    onClick={() => openVehicleDetail(veh.id)}
                    className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-slate-850/60 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                        <img src={veh.photoUrl} alt={veh.model} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-100 group-hover:text-[#086343] transition-colors truncate">
                          {veh.assignedDriver || `Operator Lead #0${idx + 1}`}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          Working on <span className="font-semibold text-slate-300">{veh.brand} {veh.model}</span> ({veh.plateNumber})
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                        veh.status === 'Active'
                          ? 'bg-[#DCEFE5] text-[#06452F]'
                          : veh.status === 'Under Maintenance'
                          ? 'bg-[#FEF3C7] text-[#92400E]'
                          : 'bg-[#FFE4E6] text-[#9F1239]'
                      }`}
                    >
                      {veh.status === 'Active' ? 'Completed' : veh.status === 'Under Maintenance' ? 'In Progress' : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Project Progress Gauge (5 Cols, Semi-Circular Gauge) */}
            <div className="md:col-span-5">
              <FleetAvailabilityGaugeCard
                totalVehicles={totalVehicles}
                activeVehicles={activeVehicles}
                workshopVehicles={maintenanceVehicles}
                accidentVehicles={accidentVehicles}
                inactiveVehicles={inactiveVehicles}
              />
            </div>
          </div>

          {/* Row 3: Comprehensive Charts (Revenue vs Expense + Maintenance Trend) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-white">
              <CardHeader className="py-4 px-5">
                <CardTitle className="text-sm font-bold text-slate-100">Revenue vs. Operating Cost</CardTitle>
                <p className="text-xs text-slate-400">Monthly financial performance ({currency})</p>
              </CardHeader>
              <div className="p-4">
                <RevenueVsExpenseChart />
              </div>
            </Card>

            <Card className="bg-white">
              <CardHeader className="py-4 px-5">
                <CardTitle className="text-sm font-bold text-slate-100">Maintenance by Category</CardTitle>
                <p className="text-xs text-slate-400">Routine service vs corrective vs breakdown</p>
              </CardHeader>
              <div className="p-4">
                <MaintenanceTrendChart />
              </div>
            </Card>
          </div>

          {/* Row 4: Fleet Master Summary Table */}
          <Card className="bg-white">
            <CardHeader
              className="py-4 px-5"
              action={
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setCurrentPage('vehicles')}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5 text-slate-400" />}
                >
                  View All ({vehicles.length})
                </Button>
              }
            >
              <CardTitle className="text-sm font-bold text-slate-100">Fleet Inventory Quick Summary</CardTitle>
              <p className="text-xs text-slate-400">Active vehicles, odometer, purchase value and status</p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-850 text-slate-400 border-b border-slate-700 uppercase tracking-wider text-[11px] font-bold">
                  <tr>
                    <th className="px-5 py-3">Vehicle</th>
                    <th className="px-5 py-3">Plate No</th>
                    <th className="px-5 py-3 text-right">Mileage</th>
                    <th className="px-5 py-3 text-right">Purchase Value</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/80 bg-white">
                  {vehicles.slice(0, 5).map(v => (
                    <tr
                      key={v.id}
                      onClick={() => openVehicleDetail(v.id)}
                      className="hover:bg-slate-850/60 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3.5 font-bold text-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-slate-700">
                            <img src={v.photoUrl} alt={v.model} className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-100">{v.brand} {v.model}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{v.vehicleId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-200">{v.plateNumber}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-xs text-slate-200">{v.currentMileage.toLocaleString()} KM</td>
                      <td className="px-5 py-3.5 text-right text-xs text-slate-300 font-semibold">{formatCurrency(v.purchase.purchaseValue, currency)}</td>
                      <td className="px-5 py-3.5 text-center">
                        <StatusBadge status={v.status} size="sm" />
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={(e) => { e.stopPropagation(); openVehicleDetail(v.id); }}
                        >
                          Profile
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Column (4 Cols on xl, Matches Reference Design) */}
        <div className="xl:col-span-4 space-y-6">
          {/* Section 1: Recent Projects / Work Orders (Exact Reference Match) */}
          <Card className="bg-white">
            <CardHeader
              className="py-4 px-5"
              action={
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => openQuickModal('add-work-order')}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  New
                </Button>
              }
            >
              <CardTitle className="text-sm font-bold text-slate-100">Work Orders</CardTitle>
            </CardHeader>
            <div className="p-4 space-y-3">
              {workOrders.slice(0, 5).map((wo) => (
                <div
                  key={wo.id}
                  onClick={() => setCurrentPage('work-orders')}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-850/60 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-slate-850 border border-slate-700 flex items-center justify-center text-[#086343] shrink-0 group-hover:bg-[#DCEFE5] transition-colors">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-100 truncate group-hover:text-[#086343] transition-colors">
                        {wo.problemDescription || wo.workOrderNumber}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {wo.vehiclePlate} • Due: {wo.expectedCompletion ? formatDate(wo.expectedCompletion) : formatDate(wo.reportedDate)}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-100 shrink-0" />
                </div>
              ))}
            </div>
          </Card>

          {/* Section 2: Time Tracker (Operational Shift & Odometer Telemetry) */}
          <OperationalShiftTrackerCard />

          {/* Section 3: Operating Cost Allocation */}
          <OperatingCostBreakdownCard
            maintenanceCost={lifetimeMaintenanceCost}
            oilCost={oilChangeCost}
            tyreCost={tyreCost}
            accidentCost={accidentCost}
            insuranceCost={insuranceCost}
            totalOperatingCost={totalExpensesLifetime}
            currency={currency}
          />

          {/* Section 4: Attention Required Alerts */}
          <AttentionRequiredCard
            items={attentionItems}
            onViewAll={() => setCurrentPage('notifications')}
          />
        </div>
      </div>
    </div>
  );
};

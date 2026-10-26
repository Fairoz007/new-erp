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
} from '../../components/charts/DashboardCharts';
import {
  FleetAvailabilityGaugeCard,
  OperatingCostBreakdownCard,
  AttentionRequiredCard,
  AttentionItem,
} from '../../components/dashboard/RightAnalyticsColumn';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useVehiclePhotoUrls } from '../vehicles/VehiclePhoto';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const DashboardPage: React.FC = () => {
  const {
    vehicles: allVehicles,
    maintenanceRecords: allMaintenanceRecords,
    workOrders: allWorkOrders,
    oilChanges: allOilChanges,
    tyres: allTyres,
    accidents: allAccidents,
    expenses: allExpenses,
    invoices: allInvoices,
    suppliers,
    customers,
    selectedCompanyId,
    currency,
    getCompanyProfitLoss,
    getCompanyBalanceSheet,
  } = useFleet();

  const { setCurrentPage, openVehicleDetail, openQuickModal } = useUI();

  // Scope all operational data to the selected office (or consolidated view)
  const scoped = !!selectedCompanyId && selectedCompanyId !== 'all';
  const vehicles = scoped ? allVehicles.filter(v => v.companyId === selectedCompanyId) : allVehicles;
  // photo_url is a path in the private media bucket: resolve to short-lived signed URLs
  const vehiclePhotoUrl = useVehiclePhotoUrls(vehicles.map(v => v.photoUrl));
  const scopedVehicleIds = new Set(vehicles.map(v => v.id));
  const maintenanceRecords = scoped ? allMaintenanceRecords.filter(m => m.companyId === selectedCompanyId) : allMaintenanceRecords;
  const workOrders = scoped ? allWorkOrders.filter(w => w.companyId === selectedCompanyId) : allWorkOrders;
  const accidents = scoped ? allAccidents.filter(a => a.companyId === selectedCompanyId) : allAccidents;
  const expenses = scoped ? allExpenses.filter(e => e.companyId === selectedCompanyId) : allExpenses;
  const invoices = scoped ? allInvoices.filter(i => i.companyId === selectedCompanyId) : allInvoices;
  const oilChanges = scoped ? allOilChanges.filter(o => scopedVehicleIds.has(o.vehicleId)) : allOilChanges;
  const tyres = scoped ? allTyres.filter(t => scopedVehicleIds.has(t.vehicleId)) : allTyres;

  const pnl = getCompanyProfitLoss();
  const balanceSheet = getCompanyBalanceSheet();

  // Summary Metrics Calculations (Real ERP Data)
  const totalVehicles = vehicles.length;
  const activeVehicles = vehicles.filter(v => v.status === 'Active').length;
  const maintenanceVehicles = vehicles.filter(v => v.status === 'Under Maintenance').length;
  const accidentVehicles = vehicles.filter(v => v.status === 'Accident').length;
  const inactiveVehicles = vehicles.filter(v => ['Inactive', 'Sold', 'Scrapped', 'Reserved'].includes(v.status)).length;

  const totalPurchaseValue = vehicles.reduce((s, v) => s + (v.purchase.purchaseValue || 0), 0);
  const currentAssetValue = balanceSheet.assets.netVehiclesValue;
  const totalDepreciation = balanceSheet.assets.accumulatedDepreciation;

  const lifetimeMaintenanceCost = maintenanceRecords.reduce((s, m) => s + (m.totalCost || 0), 0);
  const accidentCost = accidents.reduce((s, a) => s + (a.actualRepairCost || 0), 0);
  const oilChangeCost = oilChanges.reduce((s, o) => s + (o.totalCost || 0), 0);
  const tyreCost = tyres.reduce((s, t) => s + (t.purchaseCost || 0), 0);
  const insuranceCost = expenses.filter(e => e.category === 'Insurance').reduce((s, e) => s + e.total, 0) + vehicles.reduce((s, v) => s + (v.insurancePremiumAnnual || 0), 0);
  const totalExpensesLifetime = expenses.reduce((s, e) => s + e.total, 0) + lifetimeMaintenanceCost;

  const openPurchase = invoices.filter(i => i.invoiceType === 'Purchase' && !i.isCreditNote && i.paymentStatus !== 'Paid' && i.paymentStatus !== 'Cancelled' && i.outstandingAmount > 0);
  const amountPayable = openPurchase.reduce((s, i) => s + i.outstandingAmount, 0);
  const outstandingSupplierInvoices = openPurchase.length;

  // Revenue trend: this month vs previous month, from sales invoices (credit notes deducted). Null when there is no basis.
  const monthKey = (offset: number) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const salesIn = (key: string) =>
    invoices
      .filter(i => i.invoiceType === 'Sales' && i.paymentStatus !== 'Cancelled' && (i.invoiceDate || '').slice(0, 7) === key)
      .reduce((s, i) => s + (i.isCreditNote ? -Math.abs(i.subtotal) : i.subtotal), 0);
  const salesThisMonth = salesIn(monthKey(0));
  const salesLastMonth = salesIn(monthKey(-1));
  const revenueTrend =
    salesLastMonth > 0
      ? {
          value: `${salesThisMonth >= salesLastMonth ? '+' : ''}${(((salesThisMonth - salesLastMonth) / salesLastMonth) * 100).toFixed(1)}%`,
          direction: (salesThisMonth >= salesLastMonth ? 'up' : 'down') as 'up' | 'down',
          label: 'Sales this month vs last month',
        }
      : { value: formatCurrency(salesThisMonth, currency), direction: 'neutral' as const, label: 'Sales invoiced this month' };

  // Next scheduled service: earliest open work order, else the soonest oil service that is due
  const openStatuses = ['Draft', 'Requested', 'Approved', 'Scheduled', 'In Progress', 'Waiting for Parts'];
  const upcomingWorkOrder = workOrders
    .filter(w => openStatuses.includes(w.status))
    .sort((a, b) => (a.expectedCompletion || a.reportedDate || '').localeCompare(b.expectedCompletion || b.reportedDate || ''))[0];
  const upcomingOil = !upcomingWorkOrder
    ? oilChanges
        .filter(o => o.status !== 'Normal')
        .sort((a, b) => (a.nextOilChangeDate || '').localeCompare(b.nextOilChangeDate || ''))[0]
    : undefined;
  const upcomingOilVehicle = upcomingOil ? vehicles.find(v => v.id === upcomingOil.vehicleId) : undefined;
  const upcomingWoVehicle = upcomingWorkOrder ? vehicles.find(v => v.id === upcomingWorkOrder.vehicleId) : undefined;

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
          severity: t.status === 'Critical' ? 'critical' : 'warning',
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
    const isOverdue = !['Sold', 'Scrapped'].includes(v.status) && v.registrationExpiryDate && new Date(v.registrationExpiryDate).getTime() < new Date().getTime();
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
            Reports & Export
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
          trend={revenueTrend}
          onClick={() => setCurrentPage('profit-loss')}
        />

        <StatCard
          title="Pending Invoices (AP)"
          value={formatCurrency(amountPayable, currency)}
          trend={{ value: `${outstandingSupplierInvoices}`, direction: 'neutral', label: 'Unpaid supplier bills' }}
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
                <p className="text-xs text-slate-400">Expenses and maintenance, last 7 days</p>
              </CardHeader>
              <div className="p-4">
                <ReferencePillBarChart expenses={expenses} maintenanceRecords={maintenanceRecords} currency={currency} />
              </div>
            </Card>

            {/* Reminders Card (5 Cols, Exact Reference Match) */}
            <Card className="md:col-span-5 bg-white flex flex-col justify-between">
              <CardHeader className="py-4 px-5">
                <CardTitle className="text-sm font-bold text-slate-100">Reminders</CardTitle>
              </CardHeader>
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                {upcomingWorkOrder ? (
                  <div>
                    <h4 className="text-base font-bold text-slate-100 leading-snug">
                      {upcomingWorkOrder.problemDescription || upcomingWorkOrder.workOrderNumber}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 font-medium">
                      {upcomingWorkOrder.workOrderNumber} - {upcomingWorkOrder.status}
                      {upcomingWorkOrder.expectedCompletion ? ` - due ${formatDate(upcomingWorkOrder.expectedCompletion)}` : ''}
                    </p>
                    <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-850 border border-slate-700 text-xs font-semibold text-slate-400">
                      <Calendar className="w-3.5 h-3.5 text-[#086343]" />
                      <span>{upcomingWorkOrder.vehiclePlate}{upcomingWoVehicle ? ` - ${upcomingWoVehicle.companyName}` : ''}</span>
                    </div>
                  </div>
                ) : upcomingOil && upcomingOilVehicle ? (
                  <div>
                    <h4 className="text-base font-bold text-slate-100 leading-snug">
                      Oil service {upcomingOil.status.toLowerCase()}: {upcomingOilVehicle.brand} {upcomingOilVehicle.model}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 font-medium">
                      Target {upcomingOil.nextOilChangeMileage.toLocaleString()} KM
                      {upcomingOil.nextOilChangeDate ? ` / ${formatDate(upcomingOil.nextOilChangeDate)}` : ''}
                    </p>
                    <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-850 border border-slate-700 text-xs font-semibold text-slate-400">
                      <Calendar className="w-3.5 h-3.5 text-[#086343]" />
                      <span>{upcomingOilVehicle.plateNumber} - {upcomingOilVehicle.companyName}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">No open work orders or services due.</p>
                )}

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
                    Manage Vehicles
                  </Button>
                }
              >
                <CardTitle className="text-sm font-bold text-slate-100">Driver Assignments</CardTitle>
              </CardHeader>
              <div className="p-5 space-y-3.5">
                {vehicles.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No vehicles registered yet.</p>}
                {[...vehicles]
                  .sort((x, y) => Number(!!y.assignedDriver) - Number(!!x.assignedDriver))
                  .slice(0, 4)
                  .map(veh => (
                    <div
                      key={veh.id}
                      onClick={() => openVehicleDetail(veh.id)}
                      className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-slate-850/60 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-slate-700 flex items-center justify-center">
                          {vehiclePhotoUrl(veh.photoUrl) ? (
                            <img src={vehiclePhotoUrl(veh.photoUrl)!} alt={veh.model} className="w-full h-full object-cover" />
                          ) : (
                            <Car className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-100 group-hover:text-[#086343] transition-colors truncate">
                            {veh.assignedDriver || 'No driver assigned'}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            <span className="font-semibold text-slate-300">{veh.brand} {veh.model}</span> ({veh.plateNumber})
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={veh.status} size="sm" />
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
                <p className="text-xs text-slate-400">Last 6 months, invoiced sales vs expenses + maintenance ({currency})</p>
              </CardHeader>
              <div className="p-4">
                <RevenueVsExpenseChart invoices={invoices} expenses={expenses} maintenanceRecords={maintenanceRecords} />
              </div>
            </Card>

            <Card className="bg-white">
              <CardHeader className="py-4 px-5">
                <CardTitle className="text-sm font-bold text-slate-100">Maintenance by Category</CardTitle>
                <p className="text-xs text-slate-400">Routine vs corrective vs breakdown, last 6 months</p>
              </CardHeader>
              <div className="p-4">
                <MaintenanceTrendChart maintenanceRecords={maintenanceRecords} />
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
                  {vehicles.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-xs text-slate-400">No vehicles registered yet.</td></tr>
                  )}
                  {vehicles.slice(0, 5).map(v => (
                    <tr
                      key={v.id}
                      onClick={() => openVehicleDetail(v.id)}
                      className="hover:bg-slate-850/60 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3.5 font-bold text-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-800 shrink-0 border border-slate-700">
                            {vehiclePhotoUrl(v.photoUrl) && <img src={vehiclePhotoUrl(v.photoUrl)!} alt={v.model} className="w-full h-full object-cover" />}
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
              {workOrders.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No work orders yet.</p>}
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
                        {wo.vehiclePlate} - {wo.expectedCompletion ? `Due ${formatDate(wo.expectedCompletion)}` : `Reported ${formatDate(wo.reportedDate)}`}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-100 shrink-0" />
                </div>
              ))}
            </div>
          </Card>

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

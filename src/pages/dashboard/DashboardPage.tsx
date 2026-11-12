import React, { useState } from 'react';
import { ExecutiveDashboard, FinanceDashboard, HrDashboard, SponsorDashboard, useDashboardTabs } from './RoleDashboards';
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
import { FleetExpiryPanel } from './FleetExpiryPanel';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  RevenueVsExpenseChart,
  MaintenanceTrendChart,
  ReferencePillBarChart,
  ChartState,
} from '../../components/charts/DashboardCharts';
import {
  FleetAvailabilityGaugeCard,
  OperatingCostBreakdownCard,
  AttentionRequiredCard,
  AttentionItem,
} from '../../components/dashboard/RightAnalyticsColumn';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useVehiclePhotoUrls } from '../vehicles/VehiclePhoto';
import { formatCurrency } from '../../utils/financial';
import { formatDate, todayYmd } from '../../utils/date';
import { useDashboardSeries, useExpenseTotals, useInvoiceSummary, useProfitLoss } from '../../services/queries';

export const FleetDashboard: React.FC = () => {
  const {
    vehicles: allVehicles,
    maintenanceRecords: allMaintenanceRecords,
    workOrders: allWorkOrders,
    oilChanges: allOilChanges,
    tyres: allTyres,
    accidents: allAccidents,
    chartOfAccounts,
    selectedCompanyId,
    currency,
  } = useFleet();

  const { setCurrentPage, openVehicleDetail, openQuickModal, setInvoiceView } = useUI();
  const { hasPermission, canAccessPage } = useAuth();

  // Scope all operational data to the selected office (or consolidated view)
  const scoped = !!selectedCompanyId && selectedCompanyId !== 'all';
  const vehicles = scoped ? allVehicles.filter(v => v.companyId === selectedCompanyId) : allVehicles;
  // photo_url is a path in the private media bucket: resolve to short-lived signed URLs
  const vehiclePhotoUrl = useVehiclePhotoUrls(vehicles.map(v => v.photoUrl));
  const scopedVehicleIds = new Set(vehicles.map(v => v.id));
  const maintenanceRecords = scoped ? allMaintenanceRecords.filter(m => m.companyId === selectedCompanyId) : allMaintenanceRecords;
  const workOrders = scoped ? allWorkOrders.filter(w => w.companyId === selectedCompanyId) : allWorkOrders;
  const accidents = scoped ? allAccidents.filter(a => a.companyId === selectedCompanyId) : allAccidents;
  const oilChanges = scoped ? allOilChanges.filter(o => scopedVehicleIds.has(o.vehicleId)) : allOilChanges;
  const tyres = scoped ? allTyres.filter(t => scopedVehicleIds.has(t.vehicleId)) : allTyres;

  // Revenue YTD: posted ledger lines from 1 January of the current year to today (local dates),
  // totalled in the database (ledger_movements).
  const now = new Date();
  const today = todayYmd(now);
  const showRevenue = canAccessPage('profit-loss');
  const showPayables = canAccessPage('invoices');
  const pnlQ = useProfitLoss(chartOfAccounts, selectedCompanyId, { startDate: `${now.getFullYear()}-01-01`, endDate: today }, { enabled: showRevenue });
  const pnl = pnlQ.data;
  // Approved expenses by category (expense_totals) and open supplier bills (invoice_summary)
  const expenseTotals = useExpenseTotals({ company: selectedCompanyId }, 'category');
  const invoiceSummary = useInvoiceSummary(selectedCompanyId, { enabled: showPayables });
  // Daily sales / approved expenses / maintenance for the charts and the month-on-month trend:
  // first day of the month 5 months ago to the last day of this month.
  const monthYmd = (offset: number, last = false) => todayYmd(new Date(now.getFullYear(), now.getMonth() + offset + (last ? 1 : 0), last ? 0 : 1));
  const series = useDashboardSeries(selectedCompanyId, monthYmd(-5), monthYmd(0, true));

  // Summary Metrics Calculations (Real ERP Data)
  const totalVehicles = vehicles.length;
  const activeVehicles = vehicles.filter(v => v.status === 'Active').length;
  const maintenanceVehicles = vehicles.filter(v => v.status === 'Under Maintenance').length;
  const accidentVehicles = vehicles.filter(v => v.status === 'Accident').length;
  const inactiveVehicles = vehicles.filter(v => ['Inactive', 'Sold', 'Scrapped', 'Reserved'].includes(v.status)).length;

  const lifetimeMaintenanceCost = maintenanceRecords.reduce((s, m) => s + (m.totalCost || 0), 0);
  const accidentCost = accidents.reduce((s, a) => s + (a.actualRepairCost || 0), 0);
  const oilChangeCost = oilChanges.reduce((s, o) => s + (o.totalCost || 0), 0);
  const tyreCost = tyres.reduce((s, t) => s + (t.purchaseCost || 0), 0);
  const approvedExpenses = (expenseTotals.data ?? []).reduce((s, r) => s + r.total, 0);
  const insuranceExpenses = (expenseTotals.data ?? []).filter(r => r.category === 'Insurance').reduce((s, r) => s + r.total, 0);
  const insuranceCost = insuranceExpenses + vehicles.reduce((s, v) => s + (v.insurancePremiumAnnual || 0), 0);
  const totalExpensesLifetime = approvedExpenses + lifetimeMaintenanceCost;

  // Open supplier bills: approved purchase invoices (not credit notes), not paid or cancelled, with a balance
  const amountPayable = invoiceSummary.data?.open_purchase_outstanding ?? 0;
  const outstandingSupplierInvoices = invoiceSummary.data?.open_purchase_count ?? 0;

  // Revenue trend: this month vs previous month, from sales invoices (credit notes deducted). Null when there is no basis.
  const monthKey = (offset: number) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const salesIn = (key: string) =>
    (series.data ?? []).filter(d => d.day.slice(0, 7) === key).reduce((s, d) => s + d.sales, 0);
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

  // Only offer actions the signed-in role may perform
  const allowedAttention = attentionItems.filter(i =>
    i.type === 'oil_overdue' ? hasPermission('create', 'oil')
    : i.type === 'tyre_critical' ? hasPermission('create', 'work-orders')
    : i.type === 'accident_pending' ? canAccessPage('accidents')
    : i.type === 'registration_expiring' ? hasPermission('create', 'documents')
    : true);
  attentionItems.splice(0, attentionItems.length, ...allowedAttention);

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
          {hasPermission('create', 'vehicles') && (
            <Button
              variant="primary"
              size="md"
              onClick={() => openQuickModal('add-vehicle')}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add Vehicle
            </Button>
          )}
          {canAccessPage('reports') && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => setCurrentPage('reports')}
            >
              Reports & Export
            </Button>
          )}
        </div>
      </div>

      {/* Reference-Styled 4 Stat Metric Cards (First is deep forest green Hero) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {canAccessPage('vehicles') && (
        <StatCard
          title="Total Fleet Assets"
          value={totalVehicles}
          trend={{ value: `${activeVehicles} Units`, direction: 'up', label: 'Active on Road' }}
          isHero={true}
          onClick={() => setCurrentPage('vehicles')}
        />
        )}

        {canAccessPage('work-orders') && (
        <StatCard
          title="In Workshop"
          value={maintenanceVehicles}
          trend={{ value: `${workOrders.filter(w => w.status === 'In Progress').length}`, direction: 'neutral', label: 'Work Orders in bay' }}
          onClick={() => setCurrentPage('work-orders')}
        />
        )}

        {canAccessPage('profit-loss') && (
        <StatCard
          title="Revenue YTD"
          value={pnlQ.error ? 'Unavailable' : pnl ? formatCurrency(pnl.totalRevenue, currency) : '…'}
          trend={series.data ? revenueTrend : undefined}
          onClick={() => setCurrentPage('profit-loss')}
        />
        )}

        {canAccessPage('invoices') && (
        <StatCard
          title="Pending Invoices (AP)"
          value={invoiceSummary.error ? 'Unavailable' : invoiceSummary.data ? formatCurrency(amountPayable, currency) : '…'}
          trend={invoiceSummary.data ? { value: `${outstandingSupplierInvoices}`, direction: 'neutral', label: 'Unpaid supplier bills' } : undefined}
          onClick={() => { setInvoiceView('pending'); setCurrentPage('invoices'); }}
        />
        )}
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
                <ChartState height={230} loading={series.loading} error={series.error} onRetry={series.refetch}>
                  <ReferencePillBarChart series={series.data ?? []} currency={currency} />
                </ChartState>
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

                {hasPermission('create', 'work-orders') && (
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
                )}
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
                <ChartState loading={series.loading} error={series.error} onRetry={series.refetch}>
                  <RevenueVsExpenseChart series={series.data ?? []} />
                </ChartState>
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

          {(canAccessPage('vehicles') || canAccessPage('drivers')) && <FleetExpiryPanel />}

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
              action={hasPermission('create', 'work-orders') ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => openQuickModal('add-work-order')}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  New
                </Button>
              ) : undefined}
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

/** One dashboard per role; the user sees the tabs their permissions allow (the first is the default). */
export const DashboardPage: React.FC = () => {
  const tabs = useDashboardTabs();
  const [picked, setPicked] = useState<string | null>(null);
  const tab = tabs.find(t => t.id === picked)?.id ?? tabs[0]?.id;
  if (!tab) return <p className="p-6 text-sm text-slate-400">There is nothing on the dashboard for your role. Use the menu to open the pages you have access to.</p>;
  return (
    <div className="space-y-5">
      {tabs.length > 1 && (
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-700/80">
          {tabs.map(t => (
            <button key={t.id} role="tab" aria-selected={t.id === tab} onClick={() => setPicked(t.id)}
              className={`px-4 py-2 text-xs font-bold whitespace-nowrap border-b-2 -mb-px ${t.id === tab ? 'border-[#086343] text-forest-600' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {tab === 'executive' && <ExecutiveDashboard />}
      {tab === 'finance' && <FinanceDashboard />}
      {tab === 'fleet' && <FleetDashboard />}
      {tab === 'hr' && <HrDashboard />}
      {tab === 'sponsor' && <SponsorDashboard />}
    </div>
  );
};

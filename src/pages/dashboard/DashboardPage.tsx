import React from 'react';
import {
  Car,
  Wrench,
  AlertTriangle,
  Receipt,
  DollarSign,
  TrendingUp,
  Scale,
  Percent,
  Droplet,
  Disc,
  ShieldAlert,
  Clock,
  ArrowRight,
  Plus,
  FileText,
  Truck,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  RevenueVsExpenseChart,
  MaintenanceTrendChart,
  ExpenseCategoryPieChart,
  FleetStatusChart,
  AssetDepreciationChart,
} from '../../components/charts/DashboardCharts';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';

export const DashboardPage: React.FC = () => {
  const {
    companies,
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

  const { setCurrentPage, openVehicleDetail, openQuickModal, openInvoiceModal } = useUI();

  const pnl = getCompanyProfitLoss();
  const balanceSheet = getCompanyBalanceSheet();

  // Summary Metrics Calculations
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
  const insuranceCost = expenses.filter(e => e.category === 'Insurance').reduce((s, e) => s + e.total, 0) + 5400;
  const registrationCost = expenses.filter(e => e.category === 'Registration').reduce((s, e) => s + e.total, 0) + 1650;
  const totalExpensesLifetime = expenses.reduce((s, e) => s + e.total, 0) + lifetimeMaintenanceCost;

  const amountPayable = suppliers.reduce((s, sup) => s + sup.currentBalance, 0);
  const amountReceivable = customers.reduce((s, c) => s + c.currentBalance, 0);
  const outstandingSupplierInvoices = invoices.filter(i => i.invoiceType === 'Purchase' && i.paymentStatus !== 'Paid').length;
  const outstandingCustomerInvoices = invoices.filter(i => i.invoiceType === 'Sales' && i.paymentStatus !== 'Paid').length;

  // Vehicles Requiring Attention Items
  const attentionItems: {
    id: string;
    vehicleId: string;
    plate: string;
    name: string;
    reason: string;
    type: 'oil_overdue' | 'maintenance_overdue' | 'tyre_critical' | 'insurance_expiring' | 'registration_expiring' | 'accident_pending';
    severity: 'critical' | 'warning';
    actionText: string;
    onClickAction: () => void;
  }[] = [];

  // 1. Check oil changes
  oilChanges.forEach(o => {
    if (o.status === 'Overdue' || o.status === 'Due Soon') {
      const v = vehicles.find(veh => veh.id === o.vehicleId);
      if (v) {
        attentionItems.push({
          id: `oil-${o.id}`,
          vehicleId: v.id,
          plate: v.plateNumber,
          name: `${v.brand} ${v.model}`,
          reason: `Oil change ${o.status.toLowerCase()} (Target: ${o.nextOilChangeMileage.toLocaleString()} KM | Current: ${v.currentMileage.toLocaleString()} KM)`,
          type: 'oil_overdue',
          severity: o.status === 'Overdue' ? 'critical' : 'warning',
          actionText: 'Schedule Oil Service',
          onClickAction: () => openQuickModal('add-oil-change'),
        });
      }
    }
  });

  // 2. Check tyres
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

  // 3. Check accidents
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

  // 4. Check vehicle registrations
  vehicles.forEach(v => {
    const isOverdue = v.registrationExpiryDate && new Date(v.registrationExpiryDate).getTime() < new Date().getTime();
    if (isOverdue) {
      attentionItems.push({
        id: `reg-${v.id}`,
        vehicleId: v.id,
        plate: v.plateNumber,
        name: `${v.brand} ${v.model}`,
        reason: `Mulkiya Registration Expired on ${formatDate(v.registrationExpiryDate)}`,
        type: 'registration_expiring',
        severity: 'critical',
        actionText: 'Renew Mulkiya',
        onClickAction: () => openQuickModal('upload-document'),
      });
    }
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2.5">
            <span>Executive Fleet & Finance Dashboard</span>
          </h1>
          <p className="page-subtitle">
            Real-time fleet operations, workshop maintenance, accounts payable/receivable, P&L and balance sheet overview.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage('reports')} leftIcon={<FileText className="w-4 h-4" />}>
            Full Reports
          </Button>
          <Button variant="primary" size="sm" onClick={() => openQuickModal('add-vehicle')} leftIcon={<Plus className="w-4 h-4" />}>
            New Vehicle
          </Button>
        </div>
      </div>

      {/* SECTION 1: PRIMARY FLEET & VALUATION STATS (Row 1) */}
      <div>
        <h2 className="section-label">
          <Layers className="w-4 h-4 text-indigo-600" /> Fleet Assets & Health
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          <StatCard
            title="Total Vehicles"
            value={totalVehicles}
            subValue={`${activeVehicles} Active`}
            icon={<Car className="w-4 h-4" />}
            variant="indigo"
            onClick={() => setCurrentPage('vehicles')}
          />
          <StatCard
            title="Active Fleet"
            value={activeVehicles}
            subValue={`${((activeVehicles / (totalVehicles || 1)) * 100).toFixed(0)}% Fleet Availability`}
            icon={<CheckCircle2 className="w-4 h-4" />}
            variant="emerald"
            onClick={() => setCurrentPage('vehicles')}
          />
          <StatCard
            title="In Workshop"
            value={maintenanceVehicles}
            subValue={`${workOrders.filter(w => w.status === 'In Progress').length} Active WOs`}
            icon={<Wrench className="w-4 h-4" />}
            variant="amber"
            onClick={() => setCurrentPage('work-orders')}
          />
          <StatCard
            title="Accident Cases"
            value={accidentVehicles}
            subValue={`${accidents.filter(a => a.status === 'Under Repair').length} Under Repair`}
            icon={<AlertTriangle className="w-4 h-4" />}
            variant="rose"
            onClick={() => setCurrentPage('accidents')}
          />
          <StatCard
            title="Vehicle Asset Value"
            value={formatCurrency(currentAssetValue, currency)}
            subValue={`Cost: ${formatCurrency(totalPurchaseValue, currency)}`}
            icon={<Scale className="w-4 h-4" />}
            variant="blue"
            onClick={() => setCurrentPage('balance-sheet')}
          />
          <StatCard
            title="Total Depreciation"
            value={formatCurrency(totalDepreciation, currency)}
            subValue="Accumulated to date"
            icon={<Percent className="w-4 h-4" />}
            variant="purple"
            onClick={() => setCurrentPage('depreciation')}
          />
        </div>
      </div>

      {/* SECTION 2: OPERATIONAL & WORKSHOP COSTS (Row 2) */}
      <div>
        <h2 className="section-label">
          <Wrench className="w-4 h-4 text-indigo-600" /> Operational & Maintenance Costs
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          <StatCard
            title="Maintenance YTD"
            value={formatCurrency(lifetimeMaintenanceCost, currency)}
            subValue={`${maintenanceRecords.length} Records Logged`}
            icon={<Wrench className="w-4 h-4" />}
            variant="indigo"
            onClick={() => setCurrentPage('maintenance')}
          />
          <StatCard
            title="Oil Change Costs"
            value={formatCurrency(oilChangeCost, currency)}
            subValue={`${oilChanges.length} Services`}
            icon={<Droplet className="w-4 h-4" />}
            variant="amber"
            onClick={() => setCurrentPage('oil-management')}
          />
          <StatCard
            title="Tyre Replacement"
            value={formatCurrency(tyreCost, currency)}
            subValue={`${tyres.length} Tyres Monitored`}
            icon={<Disc className="w-4 h-4" />}
            variant="blue"
            onClick={() => setCurrentPage('tyre-management')}
          />
          <StatCard
            title="Accident Repair Cost"
            value={formatCurrency(accidentCost, currency)}
            subValue={`${accidents.length} Collision Claims`}
            icon={<AlertTriangle className="w-4 h-4" />}
            variant="rose"
            onClick={() => setCurrentPage('accidents')}
          />
          <StatCard
            title="Insurance Premium"
            value={formatCurrency(insuranceCost, currency)}
            subValue="Fleet Annual Cover"
            icon={<ShieldAlert className="w-4 h-4" />}
            variant="slate"
            onClick={() => setCurrentPage('expenses')}
          />
          <StatCard
            title="Total Operating Cost"
            value={formatCurrency(totalExpensesLifetime, currency)}
            subValue="Fuel, Parts & Overheads"
            icon={<Receipt className="w-4 h-4" />}
            variant="purple"
            onClick={() => setCurrentPage('expenses')}
          />
        </div>
      </div>

      {/* SECTION 3: FINANCIAL KPI SUMMARY (Row 3) */}
      <div>
        <h2 className="section-label">
          <DollarSign className="w-4 h-4 text-indigo-600" /> Executive Financial Position (P&L & AP/AR)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          <StatCard
            title="Revenue YTD"
            value={formatCurrency(pnl.totalRevenue, currency)}
            trend={{ value: '+14.2%', direction: 'up', label: 'vs last quarter' }}
            icon={<TrendingUp className="w-4 h-4" />}
            variant="emerald"
            onClick={() => setCurrentPage('profit-loss')}
          />
          <StatCard
            title="Total Expenses YTD"
            value={formatCurrency(pnl.totalDirectCosts + pnl.totalOperatingExpenses + pnl.depreciationExpense, currency)}
            subValue={`Depr: ${formatCurrency(pnl.depreciationExpense, currency)}`}
            icon={<Receipt className="w-4 h-4" />}
            variant="rose"
            onClick={() => setCurrentPage('profit-loss')}
          />
          <StatCard
            title="Gross Profit"
            value={formatCurrency(pnl.grossProfit, currency)}
            subValue={`${pnl.grossProfitMarginPercentage}% Margin`}
            icon={<DollarSign className="w-4 h-4" />}
            variant="emerald"
            onClick={() => setCurrentPage('profit-loss')}
          />
          <StatCard
            title="Net Profit"
            value={formatCurrency(pnl.netProfit, currency)}
            subValue={`${pnl.netProfitMarginPercentage}% Net Margin`}
            icon={<DollarSign className="w-4 h-4" />}
            variant="emerald"
            onClick={() => setCurrentPage('profit-loss')}
          />
          <StatCard
            title="Accounts Payable (AP)"
            value={formatCurrency(amountPayable, currency)}
            subValue={`${outstandingSupplierInvoices} Unpaid Invoices`}
            icon={<Truck className="w-4 h-4" />}
            variant="amber"
            onClick={() => setCurrentPage('invoices')}
          />
          <StatCard
            title="Accounts Receivable (AR)"
            value={formatCurrency(amountReceivable, currency)}
            subValue={`${outstandingCustomerInvoices} Pending Collections`}
            icon={<DollarSign className="w-4 h-4" />}
            variant="blue"
            onClick={() => setCurrentPage('invoices')}
          />
        </div>
      </div>

      {/* SECTION 4: VEHICLES REQUIRING ATTENTION ALERT BOARD */}
      <Card variant="glass" className="border-amber-200 bg-white">
        <CardHeader
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage('notifications')}
              leftIcon={<Clock className="w-3.5 h-3.5" />}
            >
              View All Alerts ({attentionItems.length})
            </Button>
          }
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <CardTitle>Vehicles Requiring Immediate Attention</CardTitle>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            High priority alerts for overdue oil changes, scheduled maintenance, tyre wear limits, and expiring registrations.
          </p>
        </CardHeader>

        <CardContent className="p-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {attentionItems.slice(0, 6).map(item => (
              <div
                key={item.id}
                className="bg-white border border-slate-700 hover:border-indigo-200 p-4 rounded-xl flex flex-col justify-between gap-4 transition-colors shadow-sm"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${item.severity === 'critical' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                        {item.severity === 'critical' ? 'Critical' : 'Warning'}
                      </span>
                      <span className="text-sm font-bold text-slate-100">{item.name}</span>
                    </div>
                    <span className="px-2 py-1 rounded-lg bg-slate-850 text-slate-300 font-mono text-xs border border-slate-700">
                      {item.plate}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 mt-3 leading-relaxed">{item.reason}</p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-700">
                  <button
                    onClick={() => openVehicleDetail(item.vehicleId)}
                    className="min-h-10 text-sm font-semibold text-indigo-700 hover:text-indigo-800 hover:underline cursor-pointer"
                  >
                    View Vehicle
                  </button>
                  <Button variant="secondary" size="xs" onClick={item.onClickAction}>
                    {item.actionText}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SECTION 5: CHARTS & VISUAL ANALYTICS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue vs Expenses */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue vs. Fleet Operating Expenses</CardTitle>
            <p className="text-sm text-slate-400">Monthly trend comparison in {currency}</p>
          </CardHeader>
          <CardContent>
            <RevenueVsExpenseChart />
          </CardContent>
        </Card>

        {/* Maintenance Cost Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Maintenance Cost by Category</CardTitle>
            <p className="text-sm text-slate-400">Routine service vs corrective repairs vs breakdown overhauls</p>
          </CardHeader>
          <CardContent>
            <MaintenanceTrendChart />
          </CardContent>
        </Card>

        {/* Expense Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Fleet Expense Distribution</CardTitle>
            <p className="text-sm text-slate-400">Fuel, maintenance, tyres, insurance, and licensing shares</p>
          </CardHeader>
          <CardContent>
            <ExpenseCategoryPieChart />
          </CardContent>
        </Card>

        {/* Asset Value vs Accumulated Depreciation */}
        <Card>
          <CardHeader>
            <CardTitle>Fleet Value vs. Depreciation Schedule</CardTitle>
            <p className="text-sm text-slate-400">Initial acquisition cost vs amortized net book value</p>
          </CardHeader>
          <CardContent>
            <AssetDepreciationChart />
          </CardContent>
        </Card>
      </div>

      {/* SECTION 6: QUICK FLEET OVERVIEW TABLE */}
      <Card>
        <CardHeader
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage('vehicles')}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              View All {vehicles.length} Vehicles
            </Button>
          }
        >
          <CardTitle>Fleet Master Quick Summary</CardTitle>
          <p className="text-sm text-slate-400">Current status, mileage, book value, and location for active vehicles</p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm text-slate-300">
            <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-700 uppercase tracking-wider text-xs">
              <tr>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Plate No</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3 text-right">Mileage</th>
                <th className="px-4 py-3 text-right">Purchase Value</th>
                <th className="px-4 py-3 text-right">Book Value</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {vehicles.slice(0, 5).map(v => (
                <tr
                  key={v.id}
                  onClick={() => openVehicleDetail(v.id)}
                  className="hover:bg-slate-850 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-4 font-semibold text-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-800 shrink-0 border border-slate-700">
                        <img src={v.photoUrl} alt={v.model} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p>{v.brand} {v.model}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{v.vehicleId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-200">{v.plateNumber}</td>
                  <td className="px-4 py-3 text-slate-400 truncate max-w-[150px]">{v.companyName.split(' ')[0]}</td>
                  <td className="px-4 py-3 text-right font-mono">{v.currentMileage.toLocaleString()} KM</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(v.purchase.purchaseValue, currency)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-indigo-300">{formatCurrency(v.purchase.purchaseValue * 0.75, currency)}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={v.status} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); openVehicleDetail(v.id); }}>
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

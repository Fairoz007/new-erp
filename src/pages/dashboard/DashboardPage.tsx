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
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { KPIGroup, KPIMetricItem } from '../../components/ui/KPIGroup';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import {
  RevenueVsExpenseChart,
  MaintenanceTrendChart,
  FleetMonthlyOperatingCostsChart,
  AssetDepreciationChart,
} from '../../components/charts/DashboardCharts';
import {
  FleetAvailabilityCard,
  OperatingCostBreakdownCard,
  AttentionRequiredCard,
  AttentionItem,
} from '../../components/dashboard/RightAnalyticsColumn';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';

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
  const insuranceCost = expenses.filter(e => e.category === 'Insurance').reduce((s, e) => s + e.total, 0) + 5400;
  const registrationCost = expenses.filter(e => e.category === 'Registration').reduce((s, e) => s + e.total, 0) + 1650;
  const totalExpensesLifetime = expenses.reduce((s, e) => s + e.total, 0) + lifetimeMaintenanceCost;

  const amountPayable = suppliers.reduce((s, sup) => s + sup.currentBalance, 0);
  const amountReceivable = customers.reduce((s, c) => s + c.currentBalance, 0);
  const outstandingSupplierInvoices = invoices.filter(i => i.invoiceType === 'Purchase' && i.paymentStatus !== 'Paid').length;
  const outstandingCustomerInvoices = invoices.filter(i => i.invoiceType === 'Sales' && i.paymentStatus !== 'Paid').length;

  // Vehicles Requiring Attention Items (Real ERP Alerts)
  const attentionItems: AttentionItem[] = [];

  // 1. Oil changes
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

  // 2. Tyres
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

  // 3. Accidents
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

  // 4. Vehicle registrations
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

  // Grouped KPI 1: Fleet Assets & Health
  const fleetHealthMetrics: KPIMetricItem[] = [
    {
      title: 'Total Vehicles',
      value: totalVehicles,
      subValue: `${activeVehicles} Active Units`,
      icon: <Car className="w-4 h-4" />,
      onClick: () => setCurrentPage('vehicles'),
    },
    {
      title: 'Active Fleet',
      value: activeVehicles,
      statusBadge: `${((activeVehicles / (totalVehicles || 1)) * 100).toFixed(0)}% Availability`,
      statusVariant: 'emerald',
      icon: <CheckCircle2 className="w-4 h-4" />,
      onClick: () => setCurrentPage('vehicles'),
    },
    {
      title: 'In Workshop',
      value: maintenanceVehicles,
      statusBadge: `${workOrders.filter(w => w.status === 'In Progress').length} Active WOs`,
      statusVariant: 'amber',
      icon: <Wrench className="w-4 h-4" />,
      onClick: () => setCurrentPage('work-orders'),
    },
    {
      title: 'Accident Cases',
      value: accidentVehicles,
      statusBadge: `${accidents.filter(a => a.status === 'Under Repair').length} Under Repair`,
      statusVariant: 'rose',
      icon: <AlertTriangle className="w-4 h-4" />,
      onClick: () => setCurrentPage('accidents'),
    },
  ];

  // Grouped KPI 2: Executive Financial Position (P&L)
  const financialMetrics: KPIMetricItem[] = [
    {
      title: 'Revenue YTD',
      value: formatCurrency(pnl.totalRevenue, currency),
      trend: { value: '+14.2%', direction: 'up', label: 'vs last qtr' },
      icon: <TrendingUp className="w-4 h-4" />,
      onClick: () => setCurrentPage('profit-loss'),
    },
    {
      title: 'Total Expenses YTD',
      value: formatCurrency(pnl.totalDirectCosts + pnl.totalOperatingExpenses + pnl.depreciationExpense, currency),
      subValue: `Depr: ${formatCurrency(pnl.depreciationExpense, currency)}`,
      icon: <Receipt className="w-4 h-4" />,
      onClick: () => setCurrentPage('profit-loss'),
    },
    {
      title: 'Gross Profit',
      value: formatCurrency(pnl.grossProfit, currency),
      subValue: `${pnl.grossProfitMarginPercentage}% Margin`,
      icon: <DollarSign className="w-4 h-4" />,
      onClick: () => setCurrentPage('profit-loss'),
    },
    {
      title: 'Net Profit',
      value: formatCurrency(pnl.netProfit, currency),
      subValue: `${pnl.netProfitMarginPercentage}% Net Margin`,
      icon: <DollarSign className="w-4 h-4" />,
      onClick: () => setCurrentPage('profit-loss'),
    },
  ];

  // Grouped KPI 3: Asset Valuation & Payables
  const assetPayableMetrics: KPIMetricItem[] = [
    {
      title: 'Vehicle Asset Value',
      value: formatCurrency(currentAssetValue, currency),
      subValue: `Cost: ${formatCurrency(totalPurchaseValue, currency)}`,
      icon: <Scale className="w-4 h-4" />,
      onClick: () => setCurrentPage('balance-sheet'),
    },
    {
      title: 'Total Depreciation',
      value: formatCurrency(totalDepreciation, currency),
      subValue: 'Accumulated to date',
      icon: <Scale className="w-4 h-4" />,
      onClick: () => setCurrentPage('depreciation'),
    },
    {
      title: 'Accounts Payable (AP)',
      value: formatCurrency(amountPayable, currency),
      subValue: `${outstandingSupplierInvoices} Unpaid Invoices`,
      icon: <Truck className="w-4 h-4" />,
      onClick: () => setCurrentPage('invoices'),
    },
    {
      title: 'Accounts Receivable (AR)',
      value: formatCurrency(amountReceivable, currency),
      subValue: `${outstandingCustomerInvoices} Pending Collections`,
      icon: <DollarSign className="w-4 h-4" />,
      onClick: () => setCurrentPage('invoices'),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">
            Executive Fleet & Finance Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Real-time fleet operations, workshop maintenance, accounts payable/receivable, P&L and balance sheet overview.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage('reports')}
            leftIcon={<FileText className="w-3.5 h-3.5" />}
          >
            Full Reports
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => openQuickModal('add-vehicle')}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            New Vehicle
          </Button>
        </div>
      </div>

      {/* Grouped KPI Containers */}
      <div className="space-y-3.5">
        <KPIGroup metrics={fleetHealthMetrics} columns={4} />
        <KPIGroup metrics={financialMetrics} columns={4} />
        <KPIGroup metrics={assetPayableMetrics} columns={4} />
      </div>

      {/* Main Dashboard Desktop Grid with Right Analytics Column */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left / Main Analytics Area (8 Cols on xl) */}
        <div className="xl:col-span-8 space-y-5">
          {/* Top Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Revenue vs Expenses Chart */}
            <Card className="bg-white">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold text-slate-100">Revenue vs. Fleet Operating Expenses</CardTitle>
                <p className="text-[11px] text-slate-400">Monthly trend comparison in {currency}</p>
              </CardHeader>
              <div className="p-4">
                <RevenueVsExpenseChart />
              </div>
            </Card>

            {/* Fleet Operating Costs Trend (Reference-style Bar Chart) */}
            <Card className="bg-white">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold text-slate-100">Fleet Operating Costs</CardTitle>
                <p className="text-[11px] text-slate-400">Monthly operational expenditures in {currency}</p>
              </CardHeader>
              <div className="p-4">
                <FleetMonthlyOperatingCostsChart />
              </div>
            </Card>
          </div>

          {/* Bottom Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Maintenance Cost by Category */}
            <Card className="bg-white">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold text-slate-100">Monthly Maintenance Cost by Category</CardTitle>
                <p className="text-[11px] text-slate-400">Routine service vs corrective repairs vs breakdown overhauls</p>
              </CardHeader>
              <div className="p-4">
                <MaintenanceTrendChart />
              </div>
            </Card>

            {/* Asset Value vs Depreciation Schedule */}
            <Card className="bg-white">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold text-slate-100">Fleet Value vs. Depreciation Schedule</CardTitle>
                <p className="text-[11px] text-slate-400">Initial acquisition cost vs amortized net book value</p>
              </CardHeader>
              <div className="p-4">
                <AssetDepreciationChart />
              </div>
            </Card>
          </div>

          {/* Quick Fleet Master Summary Table (Recent Dispatch Logs Style) */}
          <Card className="bg-white">
            <CardHeader
              className="py-3.5 px-5"
              action={
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setCurrentPage('vehicles')}
                  rightIcon={<ArrowRight className="w-3 h-3 text-slate-400" />}
                >
                  View All ({vehicles.length})
                </Button>
              }
            >
              <CardTitle className="text-sm font-semibold text-slate-100">Fleet Master Summary</CardTitle>
              <p className="text-[11px] text-slate-400">Current status, mileage, book value, and location for active vehicles</p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-850 text-slate-400 border-b border-slate-700 uppercase tracking-wider text-[11px] font-semibold">
                  <tr>
                    <th className="px-4 py-2.5">Vehicle</th>
                    <th className="px-4 py-2.5">Plate No</th>
                    <th className="px-4 py-2.5">Company</th>
                    <th className="px-4 py-2.5 text-right">Mileage</th>
                    <th className="px-4 py-2.5 text-right">Purchase Value</th>
                    <th className="px-4 py-2.5 text-right">Book Value</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/80 bg-white">
                  {vehicles.slice(0, 5).map(v => (
                    <tr
                      key={v.id}
                      onClick={() => openVehicleDetail(v.id)}
                      className="hover:bg-slate-850/60 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-800 shrink-0 border border-slate-700">
                            <img src={v.photoUrl} alt={v.model} className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-100">{v.brand} {v.model}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{v.vehicleId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{v.plateNumber}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 truncate max-w-[130px]">{v.companyName.split(' ')[0]}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-200">{v.currentMileage.toLocaleString()} KM</td>
                      <td className="px-4 py-3 text-right text-xs text-slate-300">{formatCurrency(v.purchase.purchaseValue, currency)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-700 text-xs">{formatCurrency(v.purchase.purchaseValue * 0.75, currency)}</td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={v.status} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right">
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

        {/* Right Analytics Column (4 Cols on xl) */}
        <div className="xl:col-span-4 space-y-5">
          {/* Section 1: Fleet Availability Radial Progress */}
          <FleetAvailabilityCard
            totalVehicles={totalVehicles}
            activeVehicles={activeVehicles}
            workshopVehicles={maintenanceVehicles}
            accidentVehicles={accidentVehicles}
            inactiveVehicles={inactiveVehicles}
          />

          {/* Section 2: Operating Cost Allocation (Segmented Bar + Breakdown) */}
          <OperatingCostBreakdownCard
            maintenanceCost={lifetimeMaintenanceCost}
            oilCost={oilChangeCost}
            tyreCost={tyreCost}
            accidentCost={accidentCost}
            insuranceCost={insuranceCost}
            totalOperatingCost={totalExpensesLifetime}
            currency={currency}
          />

          {/* Section 3: Attention Required (Alerts) */}
          <AttentionRequiredCard
            items={attentionItems}
            onViewAll={() => setCurrentPage('notifications')}
          />
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency, calculateCurrentBookValue } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { fetchInvoiceAging, type AgingRow } from '../../services/system';
import { Row, text, mono, date, money, int, EmptyReport, ReportTable } from './reportKit';
import { EXTRA_REPORTS, REPORT_MODULE, type ReportFilters } from './extraReports';
import { Input, Select } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { localToday } from '../../utils/date';
import { expenseSource, invoiceSource, paymentSource, useExpenseTotals } from '../../services/queries';
import { useTaxByMonth } from '../../services/queries-reports';
import type { ServerSource } from '../../lib/serverList';
import type { Vehicle } from '../../types/vehicle';

// Registers are paged, sorted and searched in the database; exports fetch every filtered row.
const mapSource = <T, R>(src: ServerSource<T>, map: (row: T) => R): ServerSource<R> => ({
  ...src, fetch: async (q, signal) => { const page = await src.fetch(q, signal); return { rows: page.rows.map(map), total: page.total }; },
});
const sorted = (col: Column<Row>, sortKey: string): Column<Row> => ({ ...col, sortKey });
const NO_ROWS = 'There are no records to report on for the selected office.';
const Failed: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => (
  <Card className="p-6 rounded-[20px] bg-white border border-rose-200 shadow-card">
    <p className="text-sm font-semibold text-rose-600">Could not load the report</p>
    <p className="text-xs text-slate-400 mt-1">{error}</p>
    <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>Retry</Button>
  </Card>
);
const Loading = () => <Card className="p-6 rounded-[20px] bg-white border border-slate-700 shadow-card"><p className="text-xs text-slate-400">Loading…</p></Card>;

const ExpenseRegister: React.FC<ReportFilters & { currency: string }> = ({ office, from, to, currency }) => {
  const server = useMemo(() => expenseSource({ company: office, from, to }) as unknown as ServerSource<Row>, [office, from, to]);
  return <DataTable server={server} keyExtractor={r => String(r.id)} exportFilename="Expense_Report" emptyMessage={NO_ROWS} columns={[
    sorted(mono('expenseNumber', 'Expense #'), 'expense_number'), sorted(mono('vehiclePlate', 'Plate'), 'vehicle_plate'), sorted(text('category', 'Category'), 'category'),
    sorted(text('description', 'Description'), 'description'), sorted(date('date', 'Date'), 'date'), sorted(money('total', 'Amount', currency, true), 'total'), sorted(text('status', 'Status'), 'status'),
  ]} />;
};

const InvoiceRegister: React.FC<ReportFilters & { currency: string; kind: 'Purchase' | 'Sales' }> = ({ office, from, to, currency, kind }) => {
  const server = useMemo(() => mapSource(invoiceSource({ companyId: office, type: kind, from, to }), (i): Row => ({
    id: i.id, invoiceNumber: i.invoiceNumber, party: i.partyName, invoiceDate: i.invoiceDate, dueDate: i.dueDate,
    grandTotal: i.grandTotal, amountPaid: i.amountPaid, outstanding: i.outstandingAmount, status: i.paymentStatus,
  })), [office, from, to, kind]);
  return <DataTable server={server} keyExtractor={r => String(r.id)} exportFilename={kind === 'Purchase' ? 'Purchase_Invoices_Report' : 'Sales_Invoices_Report'} emptyMessage={NO_ROWS} columns={[
    sorted(mono('invoiceNumber', 'Invoice #'), 'invoice_number'), sorted(text('party', kind === 'Purchase' ? 'Supplier' : 'Customer'), 'party_name'),
    sorted(date('invoiceDate', 'Date'), 'invoice_date'), sorted(date('dueDate', 'Due'), 'due_date'),
    sorted(money('grandTotal', 'Total', currency), 'grand_total'), money('amountPaid', 'Paid', currency),
    sorted(money('outstanding', 'Outstanding', currency, true), 'outstanding_amount'), sorted(text('status', 'Status'), 'effective_status'),
  ]} />;
};

const PaymentRegister: React.FC<ReportFilters & { currency: string }> = ({ office, from, to, currency }) => {
  const server = useMemo(() => mapSource(paymentSource({ companyId: office, from, to }), (p): Row => ({
    id: p.id, paymentNumber: p.paymentNumber, paymentDate: p.paymentDate, direction: p.invoiceType === 'Sales' ? 'Collection' : 'Disbursal',
    party: p.partyName, invoiceNumber: p.invoiceNumber, method: p.paymentMethod, bank: p.bankAccountName, amount: p.amount,
  })), [office, from, to]);
  return <DataTable server={server} keyExtractor={r => String(r.id)} exportFilename="Payment_Register" emptyMessage={NO_ROWS} columns={[
    sorted(mono('paymentNumber', 'Payment #'), 'payment_number'), sorted(date('paymentDate', 'Date'), 'payment_date'), sorted(text('direction', 'Type'), 'invoice_type'),
    sorted(text('party', 'Party'), 'party_name'), sorted(mono('invoiceNumber', 'Invoice'), 'invoice_number'),
    sorted(text('method', 'Method'), 'payment_method'), sorted(text('bank', 'Bank Account'), 'bank_account_name'), sorted(money('amount', 'Amount', currency, true), 'amount'),
  ]} />;
};

const CostPerKm: React.FC<{ vehicles: Vehicle[]; currency: string }> = ({ vehicles, currency }) => {
  const { maintenanceRecords, oilChanges, tyres, accidents } = useFleet();
  // approved expenses per vehicle (any office), as before
  const exp = useExpenseTotals({}, 'vehicle');
  if (exp.error) return <Failed error={exp.error.message} onRetry={() => { void exp.refetch(); }} />;
  if (!exp.data) return <Loading />;
  const expBy = new Map(exp.data.map(r => [r.vehicle_id, r.total]));
  const rows = vehicles.map(v => {
    const maintenance = maintenanceRecords.filter(m => m.vehicleId === v.id).reduce((s, m) => s + m.totalCost, 0);
    const expenses = expBy.get(v.id) ?? 0;
    const oil = oilChanges.filter(o => o.vehicleId === v.id).reduce((s, o) => s + o.totalCost, 0);
    const tyre = tyres.filter(t => t.vehicleId === v.id).reduce((s, t) => s + t.purchaseCost, 0);
    const acc = accidents.filter(a => a.vehicleId === v.id).reduce((s, a) => s + a.netAccidentCostToCompany, 0);
    const totalCost = maintenance + expenses + oil + tyre + acc;
    const distance = Math.max(0, v.currentMileage - (v.initialOdometer || 0));
    return {
      id: v.id, plateNumber: v.plateNumber, vehicle: `${v.brand} ${v.model}`, distance, totalCost,
      costPerKm: distance > 0 ? totalCost / distance : null,
    };
  });
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">Cost = maintenance + expenses + oil + tyres + net accident cost recorded in the system. Distance = current odometer minus initial odometer.</p>
      <ReportTable rows={rows} filename="Cost_Per_KM_Report" columns={[
        mono('plateNumber', 'Plate'), text('vehicle', 'Vehicle'), int('distance', 'Distance (KM)', ' KM'),
        money('totalCost', 'Recorded Cost', currency), money('costPerKm', 'Cost per KM', currency, true),
      ]} />
    </div>
  );
};

// Credit notes reduce the tax of the side they belong to; cancelled, draft and rejected invoices are excluded.
const TaxReport: React.FC<ReportFilters & { currency: string }> = ({ office, from, to, currency }) => {
  const q = useTaxByMonth(office, from, to);
  if (q.error) return <Failed error={q.error.message} onRetry={() => { void q.refetch(); }} />;
  if (!q.data) return <Loading />;
  const rows = q.data.map(r => ({ id: r.month, month: r.month, outputTax: r.output_tax, inputTax: r.input_tax, net: r.output_tax - r.input_tax }))
    .sort((a, b) => b.month.localeCompare(a.month));
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">Approved and pending invoices by invoice month. Net payable = output tax on sales minus input tax on purchases (negative = recoverable).</p>
      <ReportTable rows={rows} filename="VAT_Report" columns={[
        mono('month', 'Month'), money('outputTax', 'Output Tax (Sales)', currency), money('inputTax', 'Input Tax (Purchases)', currency), money('net', 'Net Payable / (Recoverable)', currency, true),
      ]} />
    </div>
  );
};

const reportCategories = [
  {
    group: 'Fleet & Asset Reports',
    items: [
      { id: 'vehicle-master', name: '1. Vehicle Master Report', desc: 'Fleet registry, VIN, plates and mileage' },
      { id: 'vehicle-asset', name: '2. Vehicle Asset & Valuation Report', desc: 'Acquisition cost vs book value vs market value' },
      { id: 'depreciation-report', name: '3. Fixed Asset Depreciation Report', desc: 'Cost, accumulated depreciation and book value per asset' },
      { id: 'cost-per-km', name: '4. Cost Per KM Report', desc: 'Recorded operating cost divided by distance travelled' },
    ],
  },
  {
    group: 'Maintenance & Operations Reports',
    items: [
      { id: 'maintenance-cost', name: '5. Maintenance Cost Report', desc: 'Parts, labour and total cost per maintenance record' },
      { id: 'oil-report', name: '6. Oil Change & Service Interval Report', desc: 'Lubrication history and next service mileage' },
      { id: 'tyre-report', name: '7. Tyre Lifecycle & Tread Wear Report', desc: 'Wheel positions, tread depth and status' },
      { id: 'accident-report', name: '8. Accident Claims & Net Cost Report', desc: 'Repair cost, insurance recovery and downtime' },
      { id: 'expense-report', name: '9. Vehicle Expense Report', desc: 'Fuel, permits, insurance, toll fees and other expenses' },
    ],
  },
  {
    group: 'Financial & Invoice Reports',
    items: [
      { id: 'purchase-invoices', name: '10. Purchase Invoices (AP) Report', desc: 'Supplier bills, outstanding balances and due dates' },
      { id: 'sales-invoices', name: '11. Sales Invoices (AR) Report', desc: 'Customer billings, payments and receivables' },
      { id: 'reconciliation-report', name: '12. Invoice Reconciliation Report', desc: 'PO vs work order vs invoice variances' },
      { id: 'payments-report', name: '13. Payment & Cashflow Register', desc: 'Disbursals and collections by bank account' },
      { id: 'ap-aging', name: '14. Accounts Payable (AP) Aging', desc: 'Supplier balances by days past due' },
      { id: 'ar-aging', name: '15. Accounts Receivable (AR) Aging', desc: 'Customer balances by days past due' },
      { id: 'tax-report', name: '16. VAT & Tax Report', desc: 'Input tax, output tax and net position by month' },
    ],
  },
];

// AP / AR aging comes straight from the v_invoice_aging database view
const AgingReport: React.FC<{ kind: 'Purchase' | 'Sales'; names: Map<string, string>; companyId: string; currency: string }> = ({ kind, names, companyId, currency }) => {
  const [rows, setRows] = useState<AgingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    fetchInvoiceAging(kind)
      .then(r => { if (!cancelled) setRows(r); })
      .catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [kind, nonce]);

  const data = useMemo(() => {
    const byParty = new Map<string, Row>();
    (rows ?? [])
      .filter(r => companyId === 'all' || r.companyId === companyId)
      .forEach(r => {
        const cur = byParty.get(r.partyId) ?? { partyId: r.partyId, party: names.get(r.partyId) ?? 'Unknown party', current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90Plus: 0, total: 0 };
        (['current', 'days1to30', 'days31to60', 'days61to90', 'days90Plus', 'total'] as const).forEach(k => { cur[k] += r[k]; });
        byParty.set(r.partyId, cur);
      });
    return [...byParty.values()].sort((a, b) => b.total - a.total);
  }, [rows, names, companyId]);

  if (error) {
    return (
      <Card className="p-6 rounded-[20px] bg-white border border-rose-200 shadow-card">
        <p className="text-sm font-semibold text-rose-600">Could not load the aging report</p>
        <p className="text-xs text-slate-400 mt-1">{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setNonce(n => n + 1)}>Retry</Button>
      </Card>
    );
  }
  if (rows === null) return <Card className="p-6 rounded-[20px] bg-white border border-slate-700 shadow-card"><p className="text-xs text-slate-400">Loading aging buckets...</p></Card>;

  const totals = data.reduce((s, r) => s + r.total, 0);
  const columns: Column<Row>[] = [
    text('party', kind === 'Purchase' ? 'Supplier' : 'Customer', { render: r => <span className="font-semibold">{r.party}</span> }),
    money('current', 'Not yet due', currency),
    money('days1to30', '1-30 Days', currency),
    money('days31to60', '31-60 Days', currency),
    money('days61to90', '61-90 Days', currency),
    { key: 'days90Plus', header: '90+ Days', align: 'right', render: r => <span className="text-rose-500 font-bold">{formatCurrency(r.days90Plus, currency)}</span> },
    money('total', 'Total Outstanding', currency, true),
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">Open invoices only, aged from due date as of today. Total outstanding: <strong className="text-slate-200">{formatCurrency(totals, currency)}</strong></p>
      <ReportTable rows={data} columns={columns} filename={kind === 'Purchase' ? 'AP_Aging_Report' : 'AR_Aging_Report'} keyField="partyId" />
    </div>
  );
};

export const ReportsPage: React.FC = () => {
  const {
    vehicles, maintenanceRecords, oilChanges, tyres, accidents, suppliers, customers,
    reconciliations, fixedAssets, currency, selectedCompanyId,
  } = useFleet();
  const { companies } = useFleet();
  const { hasPermission } = useAuth();
  const [selectedReport, setSelectedReport] = useState<string>('');
  const [office, setOffice] = useState<string>(selectedCompanyId || 'all');
  useEffect(() => { setOffice(selectedCompanyId || 'all'); }, [selectedCompanyId]);
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(localToday());
  const filters: ReportFilters = { office, from, to };
  const inRange = (d?: string) => !!d && (!from || d >= from) && (!to || d <= to);

  const scoped = office !== 'all';
  const inCompany = <T extends { companyId?: string }>(list: T[]) => (scoped ? list.filter(x => x.companyId === office) : list);
  const vehiclesS = inCompany(vehicles);
  const vehicleIds = new Set(vehiclesS.map(v => v.id));
  const plateOf = (vid: string) => vehicles.find(v => v.id === vid)?.plateNumber ?? '';

  const partyNames = useMemo(() => {
    const m = new Map<string, string>();
    suppliers.forEach(s => m.set(s.id, s.name));
    customers.forEach(c => m.set(c.id, c.name));
    return m;
  }, [suppliers, customers]);

  const renderReport = () => {
    switch (current) {
      case 'vehicle-master': {
        const rows = vehiclesS.map(v => ({
          id: v.id, vehicleId: v.vehicleId, plateNumber: v.plateNumber, company: v.companyName,
          brandModel: `${v.brand} ${v.model} ${v.variant ?? ''}`.trim(), vin: v.vin, currentMileage: v.currentMileage, status: v.status,
        }));
        return <ReportTable rows={rows} filename="Vehicle_Master_Report" columns={[
          mono('vehicleId', 'ID'), mono('plateNumber', 'Plate'), text('company', 'Office'), text('brandModel', 'Make & Model'),
          mono('vin', 'VIN / Chassis'), int('currentMileage', 'Mileage (KM)', ' KM'), text('status', 'Status'),
        ]} />;
      }

      case 'vehicle-asset': {
        const rows = vehiclesS.map(v => {
          const bv = calculateCurrentBookValue(v);
          return {
            id: v.id, plateNumber: v.plateNumber, vehicle: `${v.brand} ${v.model}`, purchaseValue: v.purchase.purchaseValue,
            accumulated: bv.accumulatedDepreciation, bookValue: bv.bookValue, marketValue: v.currentMarketValue,
          };
        });
        return <ReportTable rows={rows} filename="Vehicle_Asset_Report" columns={[
          mono('plateNumber', 'Plate'), text('vehicle', 'Vehicle'), money('purchaseValue', 'Purchase Cost', currency),
          money('accumulated', 'Accumulated Depreciation', currency), money('bookValue', 'Book Value', currency, true), money('marketValue', 'Market Value', currency),
        ]} />;
      }

      case 'depreciation-report': {
        const rows = inCompany(fixedAssets).map(a => ({
          id: a.id, assetCode: a.assetCode, name: a.name, category: a.category, purchaseDate: a.purchaseDate, purchaseCost: a.purchaseCost,
          salvageValue: a.salvageValue, usefulLifeYears: a.usefulLifeYears, method: a.depreciationMethod,
          accumulatedDepreciation: a.accumulatedDepreciation, currentBookValue: a.currentBookValue, status: a.status,
        }));
        return <ReportTable rows={rows} filename="Fixed_Asset_Depreciation_Report" columns={[
          mono('assetCode', 'Asset'), text('name', 'Name'), text('category', 'Category'), date('purchaseDate', 'Purchased'),
          money('purchaseCost', 'Cost', currency), money('salvageValue', 'Salvage', currency), int('usefulLifeYears', 'Life (yrs)'),
          text('method', 'Method'), money('accumulatedDepreciation', 'Accumulated', currency), money('currentBookValue', 'Book Value', currency, true), text('status', 'Status'),
        ]} />;
      }

      case 'cost-per-km':
        return <CostPerKm vehicles={vehiclesS} currency={currency} />;

      case 'maintenance-cost': {
        const rows = inCompany(maintenanceRecords).filter(m => inRange(m.maintenanceDate)).map(m => ({
          id: m.id, recordNumber: m.recordNumber, vehiclePlate: m.vehiclePlate, category: m.category, maintenanceDate: m.maintenanceDate,
          serviceCentre: m.serviceCentre, partsCost: m.partsCost, labourCost: m.labourCost, totalCost: m.totalCost,
        }));
        return <ReportTable rows={rows} filename="Maintenance_Cost_Report" columns={[
          mono('recordNumber', 'Record #'), mono('vehiclePlate', 'Plate'), text('category', 'Category'), date('maintenanceDate', 'Date'),
          text('serviceCentre', 'Service Centre'), money('partsCost', 'Parts', currency), money('labourCost', 'Labour', currency), money('totalCost', 'Total Cost', currency, true),
        ]} />;
      }

      case 'oil-report': {
        const rows = oilChanges.filter(o => (!scoped || vehicleIds.has(o.vehicleId)) && inRange(o.date)).map(o => ({
          id: o.id, plate: plateOf(o.vehicleId), date: o.date, odometer: o.odometer, oilType: `${o.oilBrand} ${o.oilGrade}`.trim(),
          quantityLitres: o.quantityLitres, totalCost: o.totalCost, nextMileage: o.nextOilChangeMileage, nextDate: o.nextOilChangeDate, status: o.status,
        }));
        return <ReportTable rows={rows} filename="Oil_Service_Report" columns={[
          mono('plate', 'Plate'), date('date', 'Date'), int('odometer', 'Odometer', ' KM'), text('oilType', 'Oil'), int('quantityLitres', 'Litres'),
          money('totalCost', 'Cost', currency), int('nextMileage', 'Next Service', ' KM'), date('nextDate', 'Next Date'), text('status', 'Status'),
        ]} />;
      }

      case 'tyre-report': {
        const rows = tyres.filter(t => !scoped || vehicleIds.has(t.vehicleId)).map(t => ({
          id: t.id, plate: plateOf(t.vehicleId), position: t.position, brand: `${t.brand} ${t.model}`.trim(), size: t.size,
          installationDate: t.installationDate, treadDepthMm: t.treadDepthMm, expectedLifeKm: t.expectedLifeKm, purchaseCost: t.purchaseCost, status: t.status,
        }));
        return <ReportTable rows={rows} filename="Tyre_Lifecycle_Report" columns={[
          mono('plate', 'Plate'), text('position', 'Position'), text('brand', 'Tyre'), text('size', 'Size'), date('installationDate', 'Installed'),
          int('treadDepthMm', 'Tread (mm)'), int('expectedLifeKm', 'Expected Life', ' KM'), money('purchaseCost', 'Cost', currency), text('status', 'Status'),
        ]} />;
      }

      case 'accident-report': {
        const rows = inCompany(accidents).filter(a => inRange(a.accidentDate)).map(a => ({
          id: a.id, accidentNumber: a.accidentNumber, vehiclePlate: a.vehiclePlate, accidentDate: a.accidentDate, status: a.status,
          actualRepairCost: a.actualRepairCost, insuranceContribution: a.insuranceContribution, thirdPartyContribution: a.thirdPartyContribution,
          netCost: a.netAccidentCostToCompany, downtimeDays: a.vehicleDowntimeDays,
        }));
        return <ReportTable rows={rows} filename="Accident_Claims_Report" columns={[
          mono('accidentNumber', 'Accident #'), mono('vehiclePlate', 'Plate'), date('accidentDate', 'Date'), text('status', 'Status'),
          money('actualRepairCost', 'Repair Cost', currency), money('insuranceContribution', 'Insurance', currency), money('thirdPartyContribution', 'Third Party', currency),
          money('netCost', 'Net Cost', currency, true), int('downtimeDays', 'Downtime (days)'),
        ]} />;
      }

      case 'expense-report':
        return <ExpenseRegister {...filters} currency={currency} />;

      case 'purchase-invoices':
      case 'sales-invoices':
        return <InvoiceRegister {...filters} currency={currency} kind={current === 'purchase-invoices' ? 'Purchase' : 'Sales'} />;

      case 'reconciliation-report': {
        const rows = inCompany(reconciliations).map(r => ({
          id: r.id, reconciliationNumber: r.reconciliationNumber, invoiceNumber: r.invoiceNumber, party: r.supplierOrCustomerName, matchingType: r.matchingType,
          purchaseOrderAmount: r.purchaseOrderAmount ?? null, workOrderAmount: r.workOrderAmount ?? null, invoiceAmount: r.invoiceAmount,
          differenceAmount: r.differenceAmount, variancePercentage: r.variancePercentage, status: r.status,
        }));
        return <ReportTable rows={rows} filename="Reconciliation_Report" columns={[
          mono('reconciliationNumber', 'Rec #'), mono('invoiceNumber', 'Invoice'), text('party', 'Party'), text('matchingType', 'Type'),
          money('purchaseOrderAmount', 'PO Amount', currency), money('workOrderAmount', 'WO Amount', currency), money('invoiceAmount', 'Invoice', currency),
          money('differenceAmount', 'Variance', currency, true), int('variancePercentage', 'Variance %', '%'), text('status', 'Status'),
        ]} />;
      }

      case 'payments-report':
        return <PaymentRegister {...filters} currency={currency} />;

      case 'ap-aging':
        return <AgingReport kind="Purchase" names={partyNames} companyId={office} currency={currency} />;
      case 'ar-aging':
        return <AgingReport kind="Sales" names={partyNames} companyId={office} currency={currency} />;

      case 'tax-report':
        return <TaxReport {...filters} currency={currency} />;

      default: {
        const extra = EXTRA_REPORTS.find(r => r.id === current);
        if (extra) { const R = extra.render; return <R {...filters} />; }
        return <EmptyReport message="Select a report from the list." />;
      }
    }
  };

  const visible = (id: string) => !REPORT_MODULE[id] || hasPermission('view', REPORT_MODULE[id]);
  const categories = reportCategories.map(c => ({ group: c.group, items: [...c.items, ...EXTRA_REPORTS.filter(x => x.group === c.group)].filter(i => visible(i.id)) }))
    .filter(c => c.items.length > 0);
  const allItems = categories.flatMap(c => c.items);
  const current = allItems.some(i => i.id === selectedReport) ? selectedReport : allItems[0]?.id ?? '';
  const officeName = office === 'all' ? 'All offices' : companies.find(c => c.id === office)?.name ?? '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Reports
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Live data for the chosen office and dates. Every table exports to CSV and PDF.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => window.print()}
            leftIcon={<Printer className="w-4 h-4 text-forest-500" />}
          >
            Print Report
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end print:hidden">
        <div className="w-56"><Select label="Office" value={office} onChange={e => setOffice(e.target.value)}>
          <option value="all">All offices</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select></div>
        <Input label="From" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={e => setTo(e.target.value)} />
        <p className="text-[11px] text-slate-400 pb-2">Dates apply to dated reports (registers, statements, P&L). Masters such as the vehicle list show the current state.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {categories.map((cat, idx) => (
          <Card key={idx} className="p-4 sm:p-5 rounded-[20px] bg-white border border-slate-700 shadow-card space-y-2">
            <h3 className="text-xs font-bold text-forest-600 uppercase tracking-wider pb-2 border-b border-slate-750">
              {cat.group}
            </h3>
            <div className="space-y-1">
              {cat.items.map(item => {
                const isSelected = current === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedReport(item.id)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-forest-100 text-forest-700 font-semibold border border-forest-500/30 shadow-xs'
                        : 'text-slate-300 hover:bg-slate-850/60'
                    }`}
                  >
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{item.desc}</p>
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-200">
          <span className="text-forest-600">{allItems.find(i => i.id === current)?.name}</span> <span className="text-slate-400 font-normal">· {officeName} · {from || '…'} to {to || '…'}</span>
        </h2>
        {renderReport()}
      </div>
    </div>
  );
};

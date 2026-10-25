import React, { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency, calculateCurrentBookValue } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { fetchInvoiceAging, type AgingRow } from '../../services/system';

type Row = Record<string, any>;

// Column builders. Rows are always flat so the DataTable CSV export contains the real raw values
// (the export reads row[key]); render() only formats them for display.
const text = (key: string, header: string, extra: Partial<Column<Row>> = {}): Column<Row> => ({
  key, header, render: r => <span>{r[key] ?? ''}</span>, ...extra,
});
const mono = (key: string, header: string): Column<Row> => ({
  key, header, render: r => <span className="font-mono">{r[key] ?? ''}</span>,
});
const date = (key: string, header: string): Column<Row> => ({
  key, header, render: r => <span>{r[key] ? formatDate(r[key]) : ''}</span>,
});
const money = (key: string, header: string, currency: string, bold = false): Column<Row> => ({
  key, header, align: 'right',
  render: r => <span className={bold ? 'font-bold' : ''}>{r[key] == null ? 'n/a' : formatCurrency(r[key], currency)}</span>,
});
const int = (key: string, header: string, suffix = ''): Column<Row> => ({
  key, header, align: 'right', render: r => <span>{r[key] == null ? 'n/a' : `${Number(r[key]).toLocaleString()}${suffix}`}</span>,
});

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

const EmptyReport: React.FC<{ message?: string }> = ({ message }) => (
  <Card className="p-6 rounded-[20px] bg-white border border-slate-700 shadow-card">
    <p className="text-sm font-semibold text-slate-200">No data for this report</p>
    <p className="text-xs text-slate-400 mt-1">{message ?? 'There are no records to report on for the selected office.'}</p>
  </Card>
);

const ReportTable: React.FC<{ rows: Row[]; columns: Column<Row>[]; filename: string; keyField?: string }> = ({ rows, columns, filename, keyField = 'id' }) =>
  rows.length === 0
    ? <EmptyReport />
    : <DataTable data={rows} columns={columns} keyExtractor={r => String(r[keyField])} exportFilename={filename} />;

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
    vehicles, maintenanceRecords, oilChanges, tyres, accidents, expenses, suppliers, customers,
    invoices, payments, reconciliations, fixedAssets, currency, selectedCompanyId,
  } = useFleet();
  const [selectedReport, setSelectedReport] = useState<string>('vehicle-master');

  const scoped = !!selectedCompanyId && selectedCompanyId !== 'all';
  const inCompany = <T extends { companyId?: string }>(list: T[]) => (scoped ? list.filter(x => x.companyId === selectedCompanyId) : list);
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
    switch (selectedReport) {
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

      case 'cost-per-km': {
        const rows = vehiclesS.map(v => {
          const maintenance = maintenanceRecords.filter(m => m.vehicleId === v.id).reduce((s, m) => s + m.totalCost, 0);
          const exp = expenses.filter(e => e.vehicleId === v.id).reduce((s, e) => s + e.total, 0);
          const oil = oilChanges.filter(o => o.vehicleId === v.id).reduce((s, o) => s + o.totalCost, 0);
          const tyre = tyres.filter(t => t.vehicleId === v.id).reduce((s, t) => s + t.purchaseCost, 0);
          const acc = accidents.filter(a => a.vehicleId === v.id).reduce((s, a) => s + a.netAccidentCostToCompany, 0);
          const totalCost = maintenance + exp + oil + tyre + acc;
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
      }

      case 'maintenance-cost': {
        const rows = inCompany(maintenanceRecords).map(m => ({
          id: m.id, recordNumber: m.recordNumber, vehiclePlate: m.vehiclePlate, category: m.category, maintenanceDate: m.maintenanceDate,
          serviceCentre: m.serviceCentre, partsCost: m.partsCost, labourCost: m.labourCost, totalCost: m.totalCost,
        }));
        return <ReportTable rows={rows} filename="Maintenance_Cost_Report" columns={[
          mono('recordNumber', 'Record #'), mono('vehiclePlate', 'Plate'), text('category', 'Category'), date('maintenanceDate', 'Date'),
          text('serviceCentre', 'Service Centre'), money('partsCost', 'Parts', currency), money('labourCost', 'Labour', currency), money('totalCost', 'Total Cost', currency, true),
        ]} />;
      }

      case 'oil-report': {
        const rows = oilChanges.filter(o => !scoped || vehicleIds.has(o.vehicleId)).map(o => ({
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
        const rows = inCompany(accidents).map(a => ({
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

      case 'expense-report': {
        const rows = inCompany(expenses).map(e => ({
          id: e.id, expenseNumber: e.expenseNumber, vehiclePlate: e.vehiclePlate, category: e.category, description: e.description, date: e.date, total: e.total,
        }));
        return <ReportTable rows={rows} filename="Expense_Report" columns={[
          mono('expenseNumber', 'Expense #'), mono('vehiclePlate', 'Plate'), text('category', 'Category'), text('description', 'Description'),
          date('date', 'Date'), money('total', 'Amount', currency, true),
        ]} />;
      }

      case 'purchase-invoices':
      case 'sales-invoices': {
        const kind = selectedReport === 'purchase-invoices' ? 'Purchase' : 'Sales';
        const rows = inCompany(invoices).filter(i => i.invoiceType === kind).map(i => ({
          id: i.id, invoiceNumber: i.invoiceNumber, party: i.partyName, invoiceDate: i.invoiceDate, dueDate: i.dueDate,
          grandTotal: i.grandTotal, amountPaid: i.amountPaid, outstanding: i.outstandingAmount, status: i.paymentStatus,
        }));
        return <ReportTable rows={rows} filename={kind === 'Purchase' ? 'Purchase_Invoices_Report' : 'Sales_Invoices_Report'} columns={[
          mono('invoiceNumber', 'Invoice #'), text('party', kind === 'Purchase' ? 'Supplier' : 'Customer'), date('invoiceDate', 'Date'), date('dueDate', 'Due'),
          money('grandTotal', 'Total', currency), money('amountPaid', 'Paid', currency), money('outstanding', 'Outstanding', currency, true), text('status', 'Status'),
        ]} />;
      }

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

      case 'payments-report': {
        const rows = inCompany(payments).map(p => ({
          id: p.id, paymentNumber: p.paymentNumber, paymentDate: p.paymentDate, direction: p.invoiceType === 'Sales' ? 'Collection' : 'Disbursal',
          party: p.partyName, invoiceNumber: p.invoiceNumber, method: p.paymentMethod, bank: p.bankAccountName, amount: p.amount,
        }));
        return <ReportTable rows={rows} filename="Payment_Register" columns={[
          mono('paymentNumber', 'Payment #'), date('paymentDate', 'Date'), text('direction', 'Type'), text('party', 'Party'), mono('invoiceNumber', 'Invoice'),
          text('method', 'Method'), text('bank', 'Bank Account'), money('amount', 'Amount', currency, true),
        ]} />;
      }

      case 'ap-aging':
        return <AgingReport kind="Purchase" names={partyNames} companyId={selectedCompanyId} currency={currency} />;
      case 'ar-aging':
        return <AgingReport kind="Sales" names={partyNames} companyId={selectedCompanyId} currency={currency} />;

      case 'tax-report': {
        // Credit notes reduce the tax of the side they belong to; cancelled invoices are excluded.
        const byMonth = new Map<string, Row>();
        inCompany(invoices).filter(i => i.paymentStatus !== 'Cancelled' && i.approvalStatus !== 'Draft' && i.approvalStatus !== 'Rejected' && i.approvalStatus !== 'Cancelled').forEach(i => {
          const key = (i.invoiceDate || '').slice(0, 7);
          const row = byMonth.get(key) ?? { id: key, month: key, outputTax: 0, inputTax: 0, net: 0 };
          const signed = i.isCreditNote ? -i.taxTotal : i.taxTotal;
          if (i.invoiceType === 'Sales') row.outputTax += signed; else row.inputTax += signed;
          byMonth.set(key, row);
        });
        const rows = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month)).map(r => ({ ...r, net: r.outputTax - r.inputTax }));
        return (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">Approved and pending invoices by invoice month. Net payable = output tax on sales minus input tax on purchases (negative = recoverable).</p>
            <ReportTable rows={rows} filename="VAT_Report" columns={[
              mono('month', 'Month'), money('outputTax', 'Output Tax (Sales)', currency), money('inputTax', 'Input Tax (Purchases)', currency), money('net', 'Net Payable / (Recoverable)', currency, true),
            ]} />
          </div>
        );
      }

      default:
        return <EmptyReport message="Select a report from the list." />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Executive Reports & Analytical Export Suite
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Reports computed from live ERP data for the selected office, with CSV export and browser print.
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {reportCategories.map((cat, idx) => (
          <Card key={idx} className="p-4 sm:p-5 rounded-[20px] bg-white border border-slate-700 shadow-card space-y-2">
            <h3 className="text-xs font-bold text-forest-600 uppercase tracking-wider pb-2 border-b border-slate-750">
              {cat.group}
            </h3>
            <div className="space-y-1">
              {cat.items.map(item => {
                const isSelected = selectedReport === item.id;
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
          Generated Report Output: <span className="text-forest-600">{reportCategories.flatMap(c => c.items).find(i => i.id === selectedReport)?.name}</span>
        </h2>
        {renderReport()}
      </div>
    </div>
  );
};

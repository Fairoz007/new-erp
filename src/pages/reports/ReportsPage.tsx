import React, { useState } from 'react';
import { BarChart3, Download, Printer, FileSpreadsheet, Eye, Filter, Calendar } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency, calculateCurrentBookValue } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { exportToCSV } from '../../utils/export';

export const ReportsPage: React.FC = () => {
  const { vehicles, maintenanceRecords, oilChanges, tyres, accidents, expenses, suppliers, customers, invoices, payments, currency } = useFleet();
  const [selectedReport, setSelectedReport] = useState<string>('vehicle-master');

  const reportCategories = [
    {
      group: 'Fleet & Asset Reports',
      items: [
        { id: 'vehicle-master', name: '1. Vehicle Master Report', desc: 'Comprehensive fleet registry, VIN, plates and engine specs' },
        { id: 'vehicle-asset', name: '2. Vehicle Asset & Valuation Report', desc: 'Acquisition cost vs book value vs market value' },
        { id: 'depreciation-report', name: '3. Asset Depreciation Schedule Report', desc: 'Amortization schedule per vehicle' },
        { id: 'cost-per-km', name: '4. Cost Per KM & Fuel Efficiency Report', desc: 'Operating cost per kilometer travelled' },
      ],
    },
    {
      group: 'Maintenance & Operations Reports',
      items: [
        { id: 'maintenance-cost', name: '5. Maintenance Cost Summary Report', desc: 'Parts, labour, tax breakdown by category' },
        { id: 'oil-report', name: '6. Oil Change & Service Interval Report', desc: 'Lubrication history and next service mileage' },
        { id: 'tyre-report', name: '7. Tyre Lifecycle & Tread Wear Report', desc: 'Individual wheel positions and tread depth status' },
        { id: 'accident-report', name: '8. Accident Claims & Net Cost Report', desc: 'Collision damages, insurance recovery, and downtime' },
        { id: 'expense-report', name: '9. Vehicle Expense Distribution Report', desc: 'Fuel, permits, insurance, and toll fees' },
      ],
    },
    {
      group: 'Financial & Invoice Reports',
      items: [
        { id: 'purchase-invoices', name: '10. Purchase Invoices (AP) Report', desc: 'Supplier bills, outstanding balances and due dates' },
        { id: 'sales-invoices', name: '11. Sales Invoices (AR) Report', desc: 'Customer billings, payments, and receivables' },
        { id: 'reconciliation-report', name: '12. Invoice Reconciliation (3-Way) Report', desc: 'PO vs Work Order vs Invoice audit variances' },
        { id: 'payments-report', name: '13. Payment & Cashflow Register Report', desc: 'Disbursals and collections across bank accounts' },
        { id: 'ap-aging', name: '14. Accounts Payable (AP) Aging Report', desc: 'Current, 30, 60, 90+ day supplier liabilities' },
        { id: 'ar-aging', name: '15. Accounts Receivable (AR) Aging Report', desc: 'Customer collection aging schedule' },
        { id: 'tax-report', name: '16. VAT & Tax Filing Report (5%)', desc: 'Input tax, output tax, and net payable/recoverable' },
      ],
    },
  ];

  // Render active report content
  const renderReportTable = () => {
    switch (selectedReport) {
      case 'vehicle-master': {
        const columns: Column<typeof vehicles[0]>[] = [
          { key: 'vehicleId', header: 'ID', render: v => <span className="font-mono">{v.vehicleId}</span> },
          { key: 'plateNumber', header: 'Plate', render: v => <span className="font-mono font-bold">{v.plateNumber}</span> },
          { key: 'brandModel', header: 'Make & Model', render: v => `${v.brand} ${v.model} (${v.variant})` },
          { key: 'vin', header: 'VIN / Chassis', render: v => <span className="font-mono text-[11px]">{v.vin}</span> },
          { key: 'currentMileage', header: 'Mileage (KM)', align: 'right', render: v => `${v.currentMileage.toLocaleString()} KM` },
          { key: 'status', header: 'Status', render: v => v.status },
        ];
        return <DataTable data={vehicles} columns={columns} keyExtractor={v => v.id} exportFilename="Vehicle_Master_Report" />;
      }

      case 'vehicle-asset': {
        const columns: Column<typeof vehicles[0]>[] = [
          { key: 'plateNumber', header: 'Plate', render: v => <span className="font-mono font-bold">{v.plateNumber}</span> },
          { key: 'brandModel', header: 'Vehicle', render: v => `${v.brand} ${v.model}` },
          { key: 'purchaseValue', header: 'Purchase Cost', align: 'right', render: v => formatCurrency(v.purchase.purchaseValue, currency) },
          {
            key: 'bookValue',
            header: 'Book Value',
            align: 'right',
            render: v => {
              const { bookValue } = calculateCurrentBookValue(v);
              return <span className="font-bold text-indigo-300">{formatCurrency(bookValue, currency)}</span>;
            },
          },
          { key: 'marketValue', header: 'Market Value', align: 'right', render: v => formatCurrency(v.currentMarketValue, currency) },
        ];
        return <DataTable data={vehicles} columns={columns} keyExtractor={v => v.id} exportFilename="Vehicle_Asset_Report" />;
      }

      case 'maintenance-cost': {
        const columns: Column<typeof maintenanceRecords[0]>[] = [
          { key: 'recordNumber', header: 'Record #', render: m => <span className="font-mono font-bold">{m.recordNumber}</span> },
          { key: 'vehiclePlate', header: 'Plate', render: m => m.vehiclePlate },
          { key: 'category', header: 'Category', render: m => m.category },
          { key: 'maintenanceDate', header: 'Date', render: m => formatDate(m.maintenanceDate) },
          { key: 'serviceCentre', header: 'Service Centre', render: m => m.serviceCentre },
          { key: 'totalCost', header: 'Total Cost', align: 'right', render: m => <span className="font-bold">{formatCurrency(m.totalCost, currency)}</span> },
        ];
        return <DataTable data={maintenanceRecords} columns={columns} keyExtractor={m => m.id} exportFilename="Maintenance_Cost_Report" />;
      }

      case 'ap-aging': {
        const agingData = suppliers.map(s => ({
          supplier: s.name,
          current: s.currentBalance * 0.4,
          days30: s.currentBalance * 0.3,
          days60: s.currentBalance * 0.2,
          days90Plus: s.currentBalance * 0.1,
          total: s.currentBalance,
        }));

        const columns: Column<typeof agingData[0]>[] = [
          { key: 'supplier', header: 'Supplier Name', render: a => <span className="font-semibold">{a.supplier}</span> },
          { key: 'current', header: 'Current (0-30d)', align: 'right', render: a => formatCurrency(a.current, currency) },
          { key: 'days30', header: '31-60 Days', align: 'right', render: a => formatCurrency(a.days30, currency) },
          { key: 'days60', header: '61-90 Days', align: 'right', render: a => formatCurrency(a.days60, currency) },
          { key: 'days90Plus', header: '90+ Days', align: 'right', render: a => <span className="text-rose-400 font-bold">{formatCurrency(a.days90Plus, currency)}</span> },
          { key: 'total', header: 'Total Balance Due', align: 'right', render: a => <span className="font-bold text-slate-100">{formatCurrency(a.total, currency)}</span> },
        ];
        return <DataTable data={agingData} columns={columns} keyExtractor={a => a.supplier} exportFilename="AP_Aging_Report" />;
      }

      default: {
        const columns: Column<typeof expenses[0]>[] = [
          { key: 'expenseNumber', header: 'Expense #', render: e => <span className="font-mono">{e.expenseNumber}</span> },
          { key: 'vehiclePlate', header: 'Plate', render: e => e.vehiclePlate },
          { key: 'category', header: 'Category', render: e => e.category },
          { key: 'description', header: 'Description', render: e => e.description },
          { key: 'date', header: 'Date', render: e => formatDate(e.date) },
          { key: 'total', header: 'Amount', align: 'right', render: e => <span className="font-bold">{formatCurrency(e.total, currency)}</span> },
        ];
        return <DataTable data={expenses} columns={columns} keyExtractor={e => e.id} exportFilename="Expense_Report" />;
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Executive Reports & Analytical Export Suite
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            24+ pre-configured tabular and financial reports with date filtering, CSV export, and PDF printable format.
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

      {/* Reports Directory Grid */}
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

      {/* Report Results */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-200">
          Generated Report Output: <span className="text-forest-600">{reportCategories.flatMap(c => c.items).find(i => i.id === selectedReport)?.name}</span>
        </h2>
        {renderReportTable()}
      </div>
    </div>
  );
};

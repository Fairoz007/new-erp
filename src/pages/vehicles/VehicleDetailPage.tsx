import React, { useEffect, useMemo, useState } from 'react';
import { setTimelineScope, getVehicleFinancialSummaryFromTotals } from '../../services/fleet';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { expenseSource, invoiceSource } from '../../services/queries';
import { useSourceCount, useVehicleTotals } from '../../services/queries-reports';
import type { VehicleExpense } from '../../types/operations';
import type { FinanceInvoice } from '../../services/finance';
import {
  Car,
  Wrench,
  Droplet,
  Disc,
  AlertTriangle,
  Receipt,
  FileText,
  Percent,
  FolderOpen,
  History,
  ArrowLeft,
  Calendar,
  DollarSign,
  Plus,
  ShieldCheck,
  Fuel,
  TrendingUp,
  MapPin,
  User,
  Clock,
  CheckCircle2,
  Trash2,
  Edit,
  Upload,
  ArrowRightLeft,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Tabs, TabItem } from '../../components/ui/Tabs';
import { StatusBadge } from '../../components/common/StatusBadge';
import { StatCard } from '../../components/ui/StatCard';
import { useFleet } from '../../context/FleetContext';
import { useUI, VehicleTab } from '../../context/UIContext';
import { formatCurrency, calculateDepreciationSchedule, calculateCostPerKm } from '../../utils/financial';
import { formatDate, isDateOverdue, isDateExpiringSoon } from '../../utils/date';
import { useAuth } from '../../context/AuthContext';
import { downloadDocument } from '../../services/documents';
import { VehiclePhoto, useVehiclePhotoUrls } from './VehiclePhoto';
import { VehicleEditModal } from './VehicleEditModal';
import { TransferOfficeModal, TransferHistory, useCanTransfer } from '../../components/common/TransferOfficeModal';

export const VehicleDetailPage: React.FC = () => {
  const {
    vehicles,
    maintenanceRecords,
    workOrders,
    oilChanges,
    tyres,
    tyreEvents,
    accidents,
    documents,
    timeline,
    currency,
    updateVehicle,
    reload,
    deleteVehicle,
  } = useFleet();

  const { selectedVehicleId, selectedVehicleTab, setSelectedVehicleTab, setCurrentPage, openQuickModal, openInvoiceModal, addToast } = useUI();

  const { hasPermission } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);

  const vehicle = vehicles.find(v => v.id === selectedVehicleId) || (selectedVehicleId ? undefined : vehicles[0]);
  const photoUrl = useVehiclePhotoUrls([vehicle?.photoUrl]);
  const vehicleKey = vehicle?.id;
  // Load this vehicle's timeline on demand (it is not part of the startup load)
  useEffect(() => {
    if (!vehicleKey) return;
    setTimelineScope(vehicleKey);
    reload(['timeline']).catch(() => undefined);
  }, [vehicleKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Expenses, invoices and their totals come from the database for this vehicle only
  const totals = useVehicleTotals(null, vehicleKey ?? null, { enabled: !!vehicleKey });
  const expSource = useMemo(() => expenseSource({ vehicle: vehicleKey ?? '' }), [vehicleKey]);
  const invSource = useMemo(() => invoiceSource({ vehicleId: vehicleKey ?? '' }), [vehicleKey]);
  const expenseCount = useSourceCount(expSource, { enabled: !!vehicleKey });
  const invoiceCount = useSourceCount(invSource, { enabled: !!vehicleKey });
  const canEdit = hasPermission('edit', 'vehicles', vehicle?.companyId);
  const canDelete = hasPermission('delete', 'vehicles', vehicle?.companyId);
  const canTransfer = useCanTransfer('vehicle', vehicle?.companyId ?? '');

  const handleDelete = async () => {
    if (!vehicle || deleting) return;
    if (!window.confirm(`Delete ${vehicle.brand} ${vehicle.model} (${vehicle.plateNumber})? This cannot be undone. Vehicles with linked records cannot be deleted: set them to Inactive instead.`)) return;
    setDeleting(true);
    try {
      await deleteVehicle(vehicle.id);
      addToast({ type: 'success', title: 'Vehicle Deleted', message: `${vehicle.plateNumber} was removed from the fleet.` });
      setCurrentPage('vehicles');
    } catch (e) {
      addToast({ type: 'error', title: 'Could not delete vehicle', message: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  if (!vehicle) {
    return (
      <div className="p-8 text-center text-slate-400">
        <Car className="w-12 h-12 mx-auto text-slate-600 mb-2" />
        <p>No vehicle selected or found.</p>
        <Button variant="secondary" size="sm" onClick={() => setCurrentPage('vehicles')} className="mt-4">
          Back to Fleet List
        </Button>
      </div>
    );
  }

  const financialSummary = getVehicleFinancialSummaryFromTotals(vehicle.id, { vehicles, maintenanceRecords, accidents, oilChanges, tyres, tyreEvents },
    totals.data?.get(vehicle.id));
  const depreciationSchedule = calculateDepreciationSchedule(vehicle);

  // Filtered records for this vehicle with robust foreign-key & plate connections
  const vehicleMaintenance = maintenanceRecords.filter(m => m.vehicleId === vehicle.id || (m as any).vehiclePlate === vehicle.plateNumber);
  const vehicleWorkOrders = (workOrders || []).filter(w => w.vehicleId === vehicle.id || w.vehiclePlate === vehicle.plateNumber);
  const vehicleOilChanges = oilChanges
    .filter(o => o.vehicleId === vehicle.id || (o as any).vehiclePlate === vehicle.plateNumber)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const vehicleTyres = tyres.filter(t => t.vehicleId === vehicle.id);
  const vehicleTyreEvents = tyreEvents.filter(te => te.vehicleId === vehicle.id);
  const vehicleAccidents = accidents.filter(a => a.vehicleId === vehicle.id || a.vehiclePlate === vehicle.plateNumber);
  // Expenses of the vehicle; invoices with the vehicle on the header or on any line (invoice_page p_vehicle)
  const expenseColumns: Column<VehicleExpense>[] = [
    { key: 'date', header: 'Date', sortKey: 'date', render: exp => formatDate(exp.date) },
    { key: 'category', header: 'Category', sortKey: 'category', render: exp => (
      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold text-[11px]">{exp.category}</span>) },
    { key: 'description', header: 'Description', truncate: 'max-w-md', sortKey: 'description', render: exp => <span className="text-slate-200 font-medium">{exp.description}</span> },
    { key: 'supplierName', header: 'Supplier / Merchant', truncate: true, sortKey: 'supplier_name', render: exp => <span className="text-slate-400">{exp.supplierName || '-'}</span> },
    { key: 'paymentMethod', header: 'Payment Method', render: exp => <span className="text-slate-400">{exp.paymentMethod}</span> },
    { key: 'total', header: 'Total', align: 'right', sortKey: 'total', render: exp => <span className="font-bold text-slate-100">{formatCurrency(exp.total, currency)}</span> },
  ];
  const invoiceColumns: Column<FinanceInvoice>[] = [
    { key: 'invoiceNumber', header: 'Invoice #', sortKey: 'invoice_number', render: inv => <span className="font-mono font-bold text-slate-100">{inv.invoiceNumber}</span> },
    { key: 'invoiceType', header: 'Type', sortKey: 'invoice_type', render: inv => inv.invoiceType },
    { key: 'partyName', header: 'Party', truncate: true, sortKey: 'party_name', render: inv => <span className="text-slate-200">{inv.partyName}</span> },
    { key: 'invoiceDate', header: 'Date', sortKey: 'invoice_date', render: inv => formatDate(inv.invoiceDate) },
    { key: 'dueDate', header: 'Due Date', sortKey: 'due_date', render: inv => formatDate(inv.dueDate) },
    { key: 'grandTotal', header: 'Amount', align: 'right', sortKey: 'grand_total', render: inv => <span className="font-bold">{formatCurrency(inv.grandTotal, currency)}</span> },
    { key: 'paymentStatus', header: 'Status', align: 'center', sortKey: 'effective_status', render: inv => <StatusBadge status={inv.paymentStatus} size="sm" /> },
    { key: 'action', header: 'Action', align: 'right', sortable: false, render: inv => (
      <Button variant="ghost" size="xs" onClick={() => openInvoiceModal(inv.id)}>Print Preview</Button>) },
  ];
  const vehicleDocuments = documents.filter(d => d.vehicleId === vehicle.id || (d.vehiclePlate && d.vehiclePlate === vehicle.plateNumber));
  const vehicleTimeline = timeline
    .filter(t => t.vehicleId === vehicle.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  // 10 Tabs Navigation Items
  const tabs: TabItem[] = [
    { id: 'overview', label: 'Overview', icon: <Car className="w-4 h-4" /> },
    { id: 'maintenance', label: 'Maintenance & Work Orders', count: vehicleMaintenance.length + vehicleWorkOrders.length, icon: <Wrench className="w-4 h-4" /> },
    { id: 'oil', label: 'Oil Service', count: vehicleOilChanges.length, icon: <Droplet className="w-4 h-4" /> },
    { id: 'tyres', label: 'Tyres', count: vehicleTyres.length, icon: <Disc className="w-4 h-4" /> },
    { id: 'accidents', label: 'Accidents', count: vehicleAccidents.length, icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'expenses', label: 'Expenses', count: expenseCount.data ?? 0, icon: <Receipt className="w-4 h-4" /> },
    { id: 'invoices', label: 'Invoices', count: invoiceCount.data ?? 0, icon: <FileText className="w-4 h-4" /> },
    { id: 'depreciation', label: 'Depreciation', icon: <Percent className="w-4 h-4" /> },
    { id: 'documents', label: 'Documents', count: vehicleDocuments.length, icon: <FolderOpen className="w-4 h-4" /> },
    { id: 'timeline', label: 'Timeline', count: vehicleTimeline.length, icon: <History className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Top Back Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage('vehicles')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            All Vehicles
          </Button>
          <span className="text-slate-600">|</span>
          <span className="text-xs text-slate-400 font-mono">Dossier #{vehicle.vehicleId}</span>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {hasPermission('create', 'maintenance') && (
<Button variant="secondary" size="xs" onClick={() => openQuickModal('add-maintenance')} leftIcon={<Wrench className="w-3.5 h-3.5" />}>
            + Service
          </Button>
)}
          {hasPermission('create', 'oil') && (
<Button variant="secondary" size="xs" onClick={() => openQuickModal('add-oil-change')} leftIcon={<Droplet className="w-3.5 h-3.5" />}>
            + Oil
          </Button>
)}
          {hasPermission('create', 'expenses') && (
<Button variant="secondary" size="xs" onClick={() => openQuickModal('add-expense')} leftIcon={<Receipt className="w-3.5 h-3.5" />}>
            + Expense
          </Button>
)}
          {hasPermission('create', 'documents') && (
<Button variant="secondary" size="xs" onClick={() => openQuickModal('upload-document')} leftIcon={<Upload className="w-3.5 h-3.5" />}>
            Upload Doc
          </Button>
)}
          {canEdit && (
            <Button variant="outline" size="xs" onClick={() => setEditOpen(true)} leftIcon={<Edit className="w-3.5 h-3.5" />}>
              Edit Vehicle
            </Button>
          )}
          {canTransfer && (
            <Button variant="outline" size="xs" onClick={() => setMoving(true)} leftIcon={<ArrowRightLeft className="w-3.5 h-3.5" />}>
              Transfer to office
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" size="xs" onClick={handleDelete} isLoading={deleting} leftIcon={<Trash2 className="w-3.5 h-3.5" />}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Profile Header Card */}
      <div className="bg-white border border-slate-700 rounded-[24px] p-6 sm:p-7 shadow-card relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4 sm:gap-6">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-slate-800 border-2 border-slate-700 shrink-0 shadow-sm">
              <VehiclePhoto src={photoUrl(vehicle.photoUrl)} alt={vehicle.model} />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 tracking-tight">
                  {vehicle.brand} {vehicle.model}
                </h1>
                <span className="px-3 py-1 rounded-full bg-slate-850 border border-slate-700 font-mono font-bold text-xs text-[#086343]">
                  {vehicle.plateNumber}
                </span>
                <StatusBadge status={vehicle.status} />
              </div>

              <p className="text-xs text-slate-400 mt-1 font-medium">
                {vehicle.variant} • {vehicle.manufacturingYear} • {vehicle.companyName}
              </p>

              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3.5 text-xs text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="text-slate-400">Mileage:</span>
                  <strong className="font-mono text-slate-100">{vehicle.currentMileage.toLocaleString()} KM</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-slate-400">Purchase:</span>
                  <strong className="text-slate-100">{formatCurrency(vehicle.purchase.purchaseValue, currency)}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-slate-400">Book Value:</span>
                  <strong className="text-[#086343]">{formatCurrency(financialSummary.currentBookValue, currency)}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-slate-400">Driver:</span>
                  <span className="text-slate-200 font-medium">{vehicle.assignedDriver || 'Pool Fleet'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Valuation Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto shrink-0 bg-slate-850 p-4 rounded-2xl border border-slate-700">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Lifetime Cost</p>
              <p className="text-sm font-extrabold text-slate-100 mt-0.5">{formatCurrency(financialSummary.totalLifetimeVehicleCost, currency)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Cost per KM</p>
              <p className="text-sm font-extrabold text-[#D9A441] mt-0.5">{financialSummary.costPerKilometer.toFixed(3)} {currency}/KM</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Net Profitability</p>
              <p className={`text-sm font-extrabold mt-0.5 ${financialSummary.netVehicleProfit >= 0 ? 'text-[#086343]' : 'text-rose-600'}`}>
                {formatCurrency(financialSummary.netVehicleProfit, currency)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 10-Tabs Navigation */}
      <Tabs
        tabs={tabs}
        activeTab={selectedVehicleTab}
        onChange={tab => setSelectedVehicleTab(tab as VehicleTab)}
        variant="underline"
      />

      {/* TAB 1: OVERVIEW */}
      {selectedVehicleTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Financial Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              title="Purchase Value"
              value={formatCurrency(vehicle.purchase.purchaseValue, currency)}
              subValue={`Date: ${formatDate(vehicle.purchase.purchaseDate)}`}
              icon={<DollarSign className="w-4 h-4" />}
              variant="indigo"
            />
            <StatCard
              title="Current Book Value"
              value={formatCurrency(financialSummary.currentBookValue, currency)}
              subValue={`Acc. Depr: ${formatCurrency(financialSummary.accumulatedDepreciation, currency)}`}
              icon={<Percent className="w-4 h-4" />}
              variant="purple"
            />
            <StatCard
              title="Market Value"
              value={formatCurrency(vehicle.currentMarketValue, currency)}
              subValue="Current Selling Est."
              icon={<TrendingUp className="w-4 h-4" />}
              variant="emerald"
            />
            <StatCard
              title="Lifetime Operating Cost"
              value={formatCurrency(financialSummary.totalLifetimeVehicleCost - vehicle.purchase.purchaseValue, currency)}
              subValue={`${financialSummary.costPerKilometer.toFixed(3)} ${currency} / KM`}
              icon={<Receipt className="w-4 h-4" />}
              variant="amber"
            />
          </div>

          {/* Technical Specs & Purchase Information */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Technical & Operational Specifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-slate-400 block">Chassis / VIN</span>
                    <span className="font-mono font-semibold text-slate-200">{vehicle.vin}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Engine Number</span>
                    <span className="font-mono font-semibold text-slate-200">{vehicle.engineNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Engine Capacity</span>
                    <span className="font-semibold text-slate-200">{vehicle.engineCapacityCc} CC</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Transmission</span>
                    <span className="font-semibold text-slate-200">{vehicle.transmission}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Fuel Type</span>
                    <span className="font-semibold text-slate-200">{vehicle.fuelType}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Number of Seats</span>
                    <span className="font-semibold text-slate-200">{vehicle.numberOfSeats}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Assigned Driver</span>
                    <span className="font-semibold text-slate-200">{vehicle.assignedDriver || 'Unassigned'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Department / Yard</span>
                    <span className="font-semibold text-slate-200">{[vehicle.department, vehicle.location].filter(Boolean).join(' / ') || 'Not recorded'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Route</span>
                    <span className="font-semibold text-slate-200">{vehicle.routeName || 'Not recorded'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Route permit</span>
                    <span className="font-mono font-semibold text-slate-200">{vehicle.permitNumber || 'Not recorded'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Permit expiry</span>
                    <span className={`font-semibold ${isDateOverdue(vehicle.permitExpiryDate) ? 'text-rose-400 font-bold' : isDateExpiringSoon(vehicle.permitExpiryDate) ? 'text-amber-400' : 'text-slate-200'}`}>{vehicle.permitExpiryDate ? formatDate(vehicle.permitExpiryDate) : 'Not recorded'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Last inspection</span>
                    <span className="font-semibold text-slate-200">{vehicle.lastInspectionDate ? formatDate(vehicle.lastInspectionDate) : 'Not recorded'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Next inspection due</span>
                    <span className={`font-semibold ${isDateOverdue(vehicle.nextInspectionDate) ? 'text-rose-400 font-bold' : isDateExpiringSoon(vehicle.nextInspectionDate) ? 'text-amber-400' : 'text-slate-200'}`}>{vehicle.nextInspectionDate ? formatDate(vehicle.nextInspectionDate) : 'Not recorded'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Registration (ROP/RTA) expiry</span>
                    <span className={`font-semibold ${isDateOverdue(vehicle.registrationExpiryDate) ? 'text-rose-400 font-bold' : isDateExpiringSoon(vehicle.registrationExpiryDate) ? 'text-amber-400' : 'text-slate-200'}`}>
                      {formatDate(vehicle.registrationExpiryDate)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Purchase & Insurance Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-slate-400 block">Supplier / Dealer</span>
                    <span className="font-semibold text-slate-200">{vehicle.purchase.supplierName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Purchase Invoice</span>
                    <span className="font-mono text-indigo-400">{vehicle.purchase.purchaseInvoiceNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Financing Method</span>
                    <span className="font-semibold text-slate-200">{vehicle.purchase.paymentMethod}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Warranty Period</span>
                    <span className="font-semibold text-slate-200">Until {formatDate(vehicle.purchase.warrantyExpiryDate)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Insurance Provider</span>
                    <span className="font-semibold text-slate-200">{vehicle.insuranceProvider}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Insurance Expiry</span>
                    <span className={`font-semibold ${isDateOverdue(vehicle.insuranceExpiryDate) ? 'text-rose-400 font-bold' : isDateExpiringSoon(vehicle.insuranceExpiryDate) ? 'text-amber-400' : 'text-slate-200'}`}>{formatDate(vehicle.insuranceExpiryDate)}</span>
                  </div>
                </div>

                {vehicle.notes && (
                  <div className="pt-3 border-t border-slate-700/60">
                    <p className="text-slate-400">Notes & Operational Instructions:</p>
                    <p className="text-slate-200 italic mt-1">{vehicle.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detailed Financial Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle>Cumulative Operating Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Maintenance Cost</span>
                  <span className="text-sm font-bold text-slate-100 mt-1 block">{formatCurrency(financialSummary.totalMaintenanceCost, currency)}</span>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Oil Services</span>
                  <span className="text-sm font-bold text-slate-100 mt-1 block">{formatCurrency(financialSummary.totalOilChangeCost, currency)}</span>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Tyre Replacements</span>
                  <span className="text-sm font-bold text-slate-100 mt-1 block">{formatCurrency(financialSummary.totalTyreCost, currency)}</span>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Accident Costs</span>
                  <span className="text-sm font-bold text-slate-100 mt-1 block">{formatCurrency(financialSummary.totalAccidentRepairCost, currency)}</span>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Insurance & Mulkiya</span>
                  <span className="text-sm font-bold text-slate-100 mt-1 block">{formatCurrency(financialSummary.totalInsuranceCost + financialSummary.totalRegistrationCost, currency)}</span>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Other Expenses</span>
                  <span className="text-sm font-bold text-slate-100 mt-1 block">{formatCurrency(financialSummary.otherExpenses, currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: MAINTENANCE & WORK ORDERS */}
      {selectedVehicleTab === 'maintenance' && (
        <div className="space-y-6">
          {/* Active / Scheduled Work Orders for this vehicle */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-200">
                Active & Scheduled Work Orders ({vehicleWorkOrders.length})
              </h3>
              {hasPermission('create', 'work-orders') && (
                <Button variant="outline" size="sm" onClick={() => openQuickModal('add-work-order')} leftIcon={<Plus className="w-4 h-4" />}>
                  Create Work Order
                </Button>
              )}
            </div>

            {vehicleWorkOrders.length > 0 ? (
              <div className="space-y-2.5">
                {vehicleWorkOrders.map(wo => (
                  <Card key={wo.id} className="border border-slate-750 hover:border-slate-600 transition-colors">
                    <CardHeader
                      action={
                        <div className="text-right">
                          <span className="text-sm font-bold text-slate-100">
                            {formatCurrency(wo.finalCost || wo.estimatedCost, currency)}
                          </span>
                          <div className="mt-1 flex items-center justify-end gap-1.5">
                            <StatusBadge status={wo.status} size="sm" />
                          </div>
                        </div>
                      }
                    >
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-amber-500" />
                        <span className="font-bold text-sm text-slate-100">{wo.workOrderNumber}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          wo.priority === 'Critical' ? 'bg-rose-950/70 text-rose-300 border border-rose-800' :
                          wo.priority === 'High' ? 'bg-amber-950/70 text-amber-300 border border-amber-800' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {wo.priority} Priority
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Reported: {formatDate(wo.reportedDate)} • Workshop: {wo.workshop || 'Internal'} • Tech: {wo.assignedTechnician || 'Unassigned'}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <p className="text-slate-200 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800">
                        {wo.problemDescription}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>Approval: <strong className={wo.approvalStatus === 'Approved' ? 'text-emerald-400' : 'text-amber-400'}>{wo.approvalStatus}</strong></span>
                        {wo.expectedCompletion && <span>Target completion: <strong>{formatDate(wo.expectedCompletion)}</strong></span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-400 border border-slate-800/80 rounded-xl bg-slate-950/20">
                No active work orders for this vehicle.
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-200">Historical Maintenance Records ({vehicleMaintenance.length})</h3>
            {hasPermission('create', 'maintenance') && (
              <Button variant="primary" size="sm" onClick={() => openQuickModal('add-maintenance')} leftIcon={<Plus className="w-4 h-4" />}>
                Record Maintenance
              </Button>
            )}
          </div>

          <div className="space-y-3">
            {vehicleMaintenance.length > 0 ? (
              vehicleMaintenance.map(m => (
                <Card key={m.id}>
                  <CardHeader
                    action={
                      <div className="text-right">
                        <span className="text-sm font-bold text-slate-100">{formatCurrency(m.totalCost, currency)}</span>
                        <div className="mt-1">
                          <StatusBadge status={m.paymentStatus} size="sm" />
                        </div>
                      </div>
                    }
                  >
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-indigo-400" />
                      <span className="font-bold text-sm text-slate-100">{m.category}</span>
                      <span className="text-xs text-slate-400 font-mono">({m.recordNumber})</span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px]">{m.maintenanceType}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Service Date: {formatDate(m.maintenanceDate)} • Odometer: {m.odometerReading.toLocaleString()} KM • Workshop: {m.serviceCentre}
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-3 text-xs">
                    <p className="text-slate-200">{m.description}</p>

                    {m.partsUsed && m.partsUsed.length > 0 && (
                      <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                        <p className="font-semibold text-slate-300 uppercase text-[10px] mb-2">Parts Installed</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {m.partsUsed.map((p, idx) => (
                            <div key={idx} className="flex justify-between text-[11px]">
                              <span className="text-slate-400">{p.name} ({p.partNumber}) x{p.quantity}</span>
                              <span className="font-mono text-slate-200">{formatCurrency(p.total, currency)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                      <span>Parts: {formatCurrency(m.partsCost, currency)} | Labour: {formatCurrency(m.labourCost, currency)} | Tax: {formatCurrency(m.tax, currency)}</span>
                      {m.nextServiceMileage && <span>Next Scheduled Service: <strong>{m.nextServiceMileage.toLocaleString()} KM</strong></span>}
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 border border-slate-800 rounded-xl">
                <Wrench className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p>No maintenance records logged for this vehicle yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: OIL SERVICE */}
      {selectedVehicleTab === 'oil' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Configured Oil Specifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Oil Type / Brand:</span>
                  <span className="font-semibold text-slate-200">{vehicle.oilConfig.oilBrand}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Recommended Grade:</span>
                  <span className="font-semibold text-slate-200">{vehicle.oilConfig.oilGrade}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Service Interval:</span>
                  <span className="font-semibold text-indigo-400">{vehicle.oilConfig.intervalKm.toLocaleString()} KM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sump Capacity:</span>
                  <span className="font-semibold text-slate-200">{vehicle.oilConfig.capacityLitres} Litres</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Next Due Calculation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Current Odometer:</span>
                  <span className="font-mono text-slate-200">{vehicle.currentMileage.toLocaleString()} KM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Next Service Target:</span>
                  <span className="font-mono font-bold text-slate-100">
                    {(vehicleOilChanges[0]?.nextOilChangeMileage || vehicle.currentMileage + vehicle.oilConfig.intervalKm).toLocaleString()} KM
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status Alert:</span>
                  <StatusBadge status={vehicleOilChanges[0]?.status || 'Normal'} size="sm" />
                </div>
              </CardContent>
            </Card>

            <Card className="flex flex-col justify-between">
              <CardHeader>
                <CardTitle>Oil Management Action</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col justify-end">
                {hasPermission('create', 'oil') && (
<Button variant="primary" size="md" onClick={() => openQuickModal('add-oil-change')} leftIcon={<Droplet className="w-4 h-4" />}>
                  Record Oil Service
                </Button>
)}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Historical Oil Changes</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-700/60 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Odometer</th>
                    <th className="px-4 py-3">Oil Product</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Next Due KM</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {vehicleOilChanges.map(o => (
                    <tr key={o.id}>
                      <td className="px-4 py-3">{formatDate(o.date)}</td>
                      <td className="px-4 py-3 text-right font-mono">{o.odometer.toLocaleString()} KM</td>
                      <td className="px-4 py-3 font-medium text-slate-200">{o.oilBrand} ({o.oilGrade})</td>
                      <td className="px-4 py-3 text-right">{o.quantityLitres} L</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(o.totalCost, currency)}</td>
                      <td className="px-4 py-3 text-right font-mono text-indigo-300">{o.nextOilChangeMileage.toLocaleString()} KM</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={o.status} size="sm" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: TYRES */}
      {selectedVehicleTab === 'tyres' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-200">Tyre Lifecycle & Position Health</h3>
            <div className="flex items-center gap-2">
              {hasPermission('create', 'tyres') && (
<Button variant="outline" size="sm" onClick={() => openQuickModal('add-tyre')} leftIcon={<Plus className="w-4 h-4" />}>
                Add Tyre
              </Button>
)}
              {hasPermission('create', 'work-orders') && (
<Button variant="primary" size="sm" onClick={() => openQuickModal('add-work-order')} leftIcon={<Disc className="w-4 h-4" />}>
                Replace / Service Tyres
              </Button>
)}
            </div>
          </div>

          {/* Interactive Visual Tyre Placement Diagram */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Wheel Position Tread Health Diagram</h4>

            <div className="grid grid-cols-2 gap-x-20 gap-y-10 max-w-md w-full relative py-4">
              {/* Front Axle */}
              {['Front Left', 'Front Right', 'Rear Left', 'Rear Right'].map(pos => {
                const tyre = vehicleTyres.find(t => t.position === pos);
                const tread = tyre ? tyre.treadDepthMm : null;
                const status = tyre?.status ?? 'Good';

                return (
                  <div key={pos} className="flex flex-col items-center p-4 bg-slate-950 border border-slate-800 rounded-xl text-center shadow-md">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{pos}</span>
                    <div className="w-12 h-12 rounded-full border-4 border-slate-700 bg-slate-900 flex items-center justify-center my-2 text-xs font-black text-slate-100 shadow-inner">
                      {tread !== null ? `${tread} mm` : 'N/A'}
                    </div>
                    <p className="text-xs font-semibold text-slate-200">{tyre ? tyre.brand : 'Not recorded'}</p>
                    <p className="text-[10px] text-slate-400">{tyre?.size || '-'}</p>
                    {tyre && (
                      <div className="mt-2">
                        <StatusBadge status={status} size="sm" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Spare Tyre */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-4 text-xs">
              <span className="text-slate-400">Spare Tyre in Trunk:</span>
              <strong className="text-slate-200">
                {(() => {
                  const spare = vehicleTyres.find(t => t.position === 'Spare');
                  return spare ? `${spare.brand} ${spare.model} (${spare.treadDepthMm} mm tread - ${spare.status})` : 'No spare tyre recorded';
                })()}
              </strong>
            </div>
          </div>

          {/* Tyre Event History */}
          <Card>
            <CardHeader>
              <CardTitle>Tyre Service & Rotation History</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-700/60 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Event Type</th>
                    <th className="px-4 py-3 text-right">Odometer</th>
                    <th className="px-4 py-3">Positions</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3">Technician / Supplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {vehicleTyreEvents.map(te => (
                    <tr key={te.id}>
                      <td className="px-4 py-3">{formatDate(te.date)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-200">{te.eventType}</td>
                      <td className="px-4 py-3 text-right font-mono">{te.odometer.toLocaleString()} KM</td>
                      <td className="px-4 py-3">{te.tyrePositionsAffected.join(', ')}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatCurrency(te.cost, currency)}</td>
                      <td className="px-4 py-3 text-slate-400">{te.technician || te.supplierName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 5: ACCIDENTS */}
      {selectedVehicleTab === 'accidents' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-200">Accident Claims & Downtime History</h3>
            {hasPermission('create', 'accidents') && (
<Button variant="danger" size="sm" onClick={() => openQuickModal('add-accident')} leftIcon={<AlertTriangle className="w-4 h-4" />}>
              Report Accident
            </Button>
)}
          </div>

          <div className="space-y-3">
            {vehicleAccidents.length > 0 ? (
              vehicleAccidents.map(a => (
                <Card key={a.id}>
                  <CardHeader
                    action={
                      <div className="text-right">
                        <span className="text-sm font-bold text-rose-400">Net Cost: {formatCurrency(a.netAccidentCostToCompany, currency)}</span>
                        <div className="mt-1">
                          <StatusBadge status={a.status} size="sm" />
                        </div>
                      </div>
                    }
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span className="font-bold text-sm text-slate-100">{a.accidentType}</span>
                      <span className="text-xs text-slate-400 font-mono">({a.accidentNumber})</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Date: {formatDate(a.accidentDate)} {a.accidentTime} • Location: {a.location} • Driver: {a.driverName}
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-3 text-xs">
                    <div>
                      <p className="text-slate-300"><strong>Damage Description:</strong> {a.damageDescription}</p>
                      <p className="text-slate-400 mt-1"><strong>Circumstances:</strong> {a.accidentDescription}</p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                      <div>
                        <span className="text-slate-400 block">Total Repair Cost</span>
                        <span className="font-bold text-slate-100">{formatCurrency(a.actualRepairCost, currency)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Insurance Recovery</span>
                        <span className="font-bold text-emerald-400">{formatCurrency(a.insuranceContribution, currency)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Police Report</span>
                        <span className="font-mono text-slate-300">{a.policeReportNumber}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Vehicle Downtime</span>
                        <span className="font-bold text-amber-400">{a.vehicleDowntimeDays} Days</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 border border-slate-800 rounded-xl">
                <ShieldCheck className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                <p>Clean record! No accident claims registered for this vehicle.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: EXPENSES */}
      {selectedVehicleTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-200">Vehicle Operational Expenses ({expenseCount.data ?? 0})</h3>
            {hasPermission('create', 'expenses') && (
<Button variant="primary" size="sm" onClick={() => openQuickModal('add-expense')} leftIcon={<Plus className="w-4 h-4" />}>
              Add Expense
            </Button>
)}
          </div>

          <DataTable
            server={expSource}
            columns={expenseColumns}
            keyExtractor={exp => exp.id}
            searchPlaceholder="Search expenses..."
            exportFilename={`Vehicle_Expenses_${vehicle.plateNumber}`}
            exportModule="expenses"
            emptyMessage="No expenses recorded for this vehicle."
          />
        </div>
      )}

      {/* TAB 7: INVOICES */}
      {selectedVehicleTab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-200">Linked Invoices (AP & AR)</h3>
            {hasPermission('create', 'invoices') && (
<Button variant="primary" size="sm" onClick={() => openQuickModal('add-invoice')} leftIcon={<Plus className="w-4 h-4" />}>
              Create Invoice
            </Button>
)}
          </div>

          <DataTable
            server={invSource}
            columns={invoiceColumns}
            keyExtractor={inv => inv.id}
            searchPlaceholder="Search invoices..."
            exportFilename={`Vehicle_Invoices_${vehicle.plateNumber}`}
            exportModule="invoices"
            emptyMessage="No invoices linked to this vehicle."
          />
        </div>
      )}

      {/* TAB 8: DEPRECIATION */}
      {selectedVehicleTab === 'depreciation' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Depreciation Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Method:</span>
                  <span className="font-bold text-slate-100">{vehicle.depreciation.depreciationMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Useful Life:</span>
                  <span className="font-semibold text-slate-200">{vehicle.depreciation.usefulLifeYears} Years</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Annual Rate:</span>
                  <span className="font-semibold text-indigo-400">{vehicle.depreciation.annualRatePercentage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Salvage Value:</span>
                  <span className="font-semibold text-slate-200">{formatCurrency(vehicle.depreciation.salvageValue, currency)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Three-Way Valuation Overview</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4 text-center text-xs">
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Purchase Value</span>
                  <span className="text-base font-bold text-slate-100 mt-1 block">{formatCurrency(vehicle.purchase.purchaseValue, currency)}</span>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Current Book Value</span>
                  <span className="text-base font-bold text-indigo-300 mt-1 block">{formatCurrency(financialSummary.currentBookValue, currency)}</span>
                </div>
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Market Resale Value</span>
                  <span className="text-base font-bold text-emerald-400 mt-1 block">{formatCurrency(vehicle.currentMarketValue, currency)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Year-by-Year Depreciation Table */}
          <Card>
            <CardHeader>
              <CardTitle>Amortization Schedule (Straight-Line / Reducing Balance)</CardTitle>
              <p className="text-xs text-slate-400">Calculated yearly depreciation until residual salvage threshold</p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-700/60 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Fiscal Year</th>
                    <th className="px-4 py-3 text-right">Opening Value</th>
                    <th className="px-4 py-3 text-right">Depreciation Amount</th>
                    <th className="px-4 py-3 text-right">Accumulated Depreciation</th>
                    <th className="px-4 py-3 text-right">Closing Book Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {depreciationSchedule.map(row => (
                    <tr key={row.year} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-bold text-slate-100">{row.year} ({row.date})</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(row.openingValue, currency)}</td>
                      <td className="px-4 py-3 text-right font-mono text-rose-400">-{formatCurrency(row.depreciationAmount, currency)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400">{formatCurrency(row.accumulatedDepreciation, currency)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-indigo-300">{formatCurrency(row.closingValue, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 9: DOCUMENTS */}
      {selectedVehicleTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-200">Vehicle Document Repository ({vehicleDocuments.length})</h3>
            {hasPermission('create', 'documents') && (
<Button variant="primary" size="sm" onClick={() => openQuickModal('upload-document')} leftIcon={<Upload className="w-4 h-4" />}>
              Upload Document
            </Button>
)}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {vehicleDocuments.map(doc => (
              <Card key={doc.id} className="p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-semibold text-[10px]">
                      {doc.category}
                    </span>
                    {doc.isExpired ? (
                      <span className="text-[10px] text-rose-400 font-bold">Expired</span>
                    ) : doc.isExpiringSoon ? (
                      <span className="text-[10px] text-amber-400 font-bold">Expiring Soon</span>
                    ) : null}
                  </div>
                  <h4 className="text-xs font-bold text-slate-100 mt-2 truncate" title={doc.documentName}>{doc.documentName}</h4>
                  {doc.documentNumber && <p className="text-[10px] text-slate-400 font-mono">No: {doc.documentNumber}</p>}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Expiry: {formatDate(doc.expiryDate)}</span>
                  <button
                    onClick={async () => {
                      if (!(doc.documentUrl || doc.url)) {
                        addToast({ type: 'warning', title: 'No File Attached', message: `${doc.documentName} has no downloadable file on record.` });
                        return;
                      }
                      try {
                        await downloadDocument(doc);
                      } catch (e) {
                        addToast({ type: 'error', title: 'Download failed', message: (e as Error).message });
                      }
                    }}
                    className="text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    Download
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {moving && (
        <TransferOfficeModal entity="vehicle" record={{ id: vehicle.id, label: `${vehicle.plateNumber} (${vehicle.vehicleId})`, officeId: vehicle.companyId }}
          onClose={() => setMoving(false)} />
      )}
      {editOpen && (
        <VehicleEditModal
          isOpen
          vehicle={vehicle}
          onClose={() => setEditOpen(false)}
          onSubmit={async updates => {
            await updateVehicle(vehicle.id, { ...updates, updatedAt: vehicle.updatedAt });
            addToast({ type: 'success', title: 'Vehicle Updated', message: `${vehicle.brand} ${vehicle.model} was saved.` });
          }}
        />
      )}

      {/* TAB 10: TIMELINE */}
      {selectedVehicleTab === 'timeline' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-200">Chronological Vehicle Lifecycle Timeline</h3>
          <div>
            <h4 className="text-xs font-bold text-slate-300 mb-1.5">Office transfers</h4>
            <TransferHistory entity="vehicle" recordId={vehicle.id} />
          </div>

          <div className="relative pl-6 border-l-2 border-slate-800 space-y-6 ml-3 my-4">
            {vehicleTimeline.map(item => (
              <div key={item.id} className="relative">
                {/* Dot */}
                <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-slate-900 border-2 border-indigo-500 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                </div>

                <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-100">{item.title}</span>
                    <span className="text-[11px] font-mono text-slate-400">{formatDate(item.date)}</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{item.description}</p>
                  {item.amount ? (
                    <p className="text-xs font-semibold text-indigo-400 mt-2">Amount: {formatCurrency(item.amount, currency)}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

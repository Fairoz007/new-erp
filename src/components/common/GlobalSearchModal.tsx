import React, { useState, useMemo } from 'react';
import { Search, Car, FileText, Wrench, Building2, ShieldAlert, Folder, ArrowRight, X } from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { StatusBadge } from './StatusBadge';
import { VehiclePhoto, useVehiclePhotoUrls } from '../../pages/vehicles/VehiclePhoto';

export const GlobalSearchModal: React.FC = () => {
  const { isSearchOpen, setIsSearchOpen, setCurrentPage, openVehicleDetail, openInvoiceModal } = useUI();
  const { vehicles, invoices, workOrders, maintenanceRecords, suppliers, documents, accidents } = useFleet();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return null;
    const q = query.toLowerCase();

    // Vehicles
    const matchedVehicles = vehicles.filter(
      v =>
        v.plateNumber.toLowerCase().includes(q) ||
        v.vehicleId.toLowerCase().includes(q) ||
        v.vin.toLowerCase().includes(q) ||
        v.brand.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q)
    );

    // Invoices
    const matchedInvoices = invoices.filter(
      i =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        i.partyName.toLowerCase().includes(q) ||
        (i.vehiclePlate && i.vehiclePlate.toLowerCase().includes(q))
    );

    // Work Orders
    const matchedWorkOrders = workOrders.filter(
      w =>
        w.workOrderNumber.toLowerCase().includes(q) ||
        w.vehiclePlate.toLowerCase().includes(q) ||
        w.problemDescription.toLowerCase().includes(q)
    );

    // Maintenance Records
    const matchedMaintenance = maintenanceRecords.filter(
      m =>
        m.recordNumber.toLowerCase().includes(q) ||
        m.vehiclePlate.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );

    // Suppliers
    const matchedSuppliers = suppliers.filter(
      s => s.name.toLowerCase().includes(q) || s.supplierType.toLowerCase().includes(q) || s.supplierId.toLowerCase().includes(q)
    );

    // Documents
    const matchedDocuments = documents.filter(
      d => d.documentName.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) || (d.vehiclePlate && d.vehiclePlate.toLowerCase().includes(q))
    );

    // Accidents
    const matchedAccidents = accidents.filter(
      a => a.accidentNumber.toLowerCase().includes(q) || a.vehiclePlate.toLowerCase().includes(q) || a.policeReportNumber.toLowerCase().includes(q)
    );

    const totalCount =
      matchedVehicles.length +
      matchedInvoices.length +
      matchedWorkOrders.length +
      matchedMaintenance.length +
      matchedSuppliers.length +
      matchedDocuments.length +
      matchedAccidents.length;

    return {
      totalCount,
      vehicles: matchedVehicles,
      invoices: matchedInvoices,
      workOrders: matchedWorkOrders,
      maintenance: matchedMaintenance,
      suppliers: matchedSuppliers,
      documents: matchedDocuments,
      accidents: matchedAccidents,
    };
  }, [query, vehicles, invoices, workOrders, maintenanceRecords, suppliers, documents, accidents]);
  const vehiclePhotoUrl = useVehiclePhotoUrls(results?.vehicles.map(v => v.photoUrl) ?? []);

  if (!isSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-100/35 backdrop-blur-sm transition-opacity duration-150"
        onClick={() => setIsSearchOpen(false)}
      />

      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800 bg-slate-850 gap-3">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search fleet by Plate Number, VIN, Invoice #, Work Order, Supplier, Driver, Document..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-6 divide-y divide-slate-800">
          {!results && (
            <div className="py-12 text-center text-slate-400 text-xs">
              <p className="font-medium text-slate-300">Quick Global ERP Search</p>
              <p className="text-slate-400 mt-1">Type at least 2 characters to search across vehicles, invoices, work orders, suppliers and records.</p>
              <div className="flex justify-center gap-2 mt-4">
                <span className="px-2 py-1 bg-slate-800/80 rounded border border-slate-700 text-slate-400 text-[11px]">1234 ABC</span>
                <span className="px-2 py-1 bg-slate-800/80 rounded border border-slate-700 text-slate-400 text-[11px]">PINV-2026</span>
                <span className="px-2 py-1 bg-slate-800/80 rounded border border-slate-700 text-slate-400 text-[11px]">WO-2026-104</span>
                <span className="px-2 py-1 bg-slate-800/80 rounded border border-slate-700 text-slate-400 text-[11px]">Bahwan</span>
              </div>
            </div>
          )}

          {results && results.totalCount === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs">
              <p className="text-slate-300 font-medium">No results found for &ldquo;{query}&rdquo;</p>
              <p className="text-slate-400 mt-1">Try searching by plate number, internal ID, supplier name or invoice reference.</p>
            </div>
          )}

          {results && results.vehicles.length > 0 && (
            <div className="pt-3">
              <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5" /> Vehicles ({results.vehicles.length})
              </p>
              <div className="space-y-1.5">
                {results.vehicles.map(v => (
                  <div
                    key={v.id}
                    onClick={() => {
                      openVehicleDetail(v.id);
                      setIsSearchOpen(false);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/70 border border-transparent hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                        <VehiclePhoto src={vehiclePhotoUrl(v.photoUrl)} alt={v.model} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">{v.brand} {v.model}</span>
                          <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded font-mono text-[11px]">{v.plateNumber}</span>
                          <StatusBadge status={v.status} size="sm" />
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          ID: {v.vehicleId} | VIN: {v.vin} | Mileage: {v.currentMileage.toLocaleString()} KM
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {results && results.invoices.length > 0 && (
            <div className="pt-3">
              <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Invoices ({results.invoices.length})
              </p>
              <div className="space-y-1.5">
                {results.invoices.map(inv => (
                  <div
                    key={inv.id}
                    onClick={() => {
                      openInvoiceModal(inv.id);
                      setIsSearchOpen(false);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/70 border border-transparent hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">{inv.invoiceNumber}</span>
                        <span className="text-[11px] text-slate-400">({inv.partyName})</span>
                        <StatusBadge status={inv.paymentStatus} size="sm" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Amount: {inv.currency} {inv.grandTotal.toFixed(3)} | Due: {inv.dueDate}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {results && results.workOrders.length > 0 && (
            <div className="pt-3">
              <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" /> Work Orders ({results.workOrders.length})
              </p>
              <div className="space-y-1.5">
                {results.workOrders.map(wo => (
                  <div
                    key={wo.id}
                    onClick={() => {
                      setCurrentPage('work-orders');
                      setIsSearchOpen(false);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/70 border border-transparent hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">{wo.workOrderNumber}</span>
                        <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded font-mono text-[10px]">{wo.vehiclePlate}</span>
                        <StatusBadge status={wo.status} size="sm" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{wo.problemDescription}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {results && results.suppliers.length > 0 && (
            <div className="pt-3">
              <p className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Suppliers ({results.suppliers.length})
              </p>
              <div className="space-y-1.5">
                {results.suppliers.map(sup => (
                  <div
                    key={sup.id}
                    onClick={() => {
                      setCurrentPage('suppliers');
                      setIsSearchOpen(false);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/70 border border-transparent hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200">{sup.name}</span>
                        <span className="text-[10px] text-slate-400">({sup.supplierType})</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">Contact: {sup.contactPerson} | Phone: {sup.phone}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

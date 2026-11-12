import React, { useState, useMemo, useRef } from 'react';
import { Search, Car, FileText, Wrench, Building2, ShieldAlert, Folder, ArrowRight, X, AlertTriangle } from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { StatusBadge } from './StatusBadge';
import { VehiclePhoto, useVehiclePhotoUrls } from '../../pages/vehicles/VehiclePhoto';
import { useDebounced, useInvoiceSearch } from '../../services/queries-expenses';
import { buttonLike } from '../../lib/a11y';
import { useDialog } from '../ui/useDialog';

// Invoices are searched in the database (v_invoice_list.search_text, every word must match); at most this many are listed.
const INVOICE_LIMIT = 8;
const NO_INVOICES: never[] = [];

export const GlobalSearchModal: React.FC = () => {
  const { isSearchOpen, setIsSearchOpen, setCurrentPage, openVehicleDetail, openInvoiceModal, openBillModal, openPartyDetail } = useUI();
  const { vehicles, workOrders, maintenanceRecords, suppliers, customers, documents, accidents } = useFleet();
  const { canAccessPage } = useAuth();
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  // dialog behaviour shared with Modal: focus trap, Escape, focus returns to the search button, no page scroll
  const { titleId } = useDialog(isSearchOpen, () => setIsSearchOpen(false), panelRef, { guardUnsaved: false });
  const debouncedQuery = useDebounced(query, 250);
  const invoiceSearchOn = isSearchOpen && canAccessPage('invoices') && !!debouncedQuery.trim() && debouncedQuery.length >= 2;
  const invoiceSearch = useInvoiceSearch(debouncedQuery.trim(), INVOICE_LIMIT, { enabled: invoiceSearchOn });
  // only results for the words typed now (the cache keeps the previous search on screen while loading)
  const invoiceResultsCurrent = invoiceSearchOn && debouncedQuery === query && !invoiceSearch.loading;
  const invoiceRows = invoiceResultsCurrent ? invoiceSearch.data?.rows ?? NO_INVOICES : NO_INVOICES;
  const invoiceTotal = invoiceResultsCurrent ? invoiceSearch.data?.total ?? 0 : 0;
  const invoicesPending = canAccessPage('invoices') && !!query.trim() && query.length >= 2 && !invoiceResultsCurrent && !invoiceSearch.error;

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return null;
    const q = query.toLowerCase();

    // Vehicles
    const matchedVehicles = !canAccessPage('vehicles') ? [] : vehicles.filter(
      v =>
        v.plateNumber.toLowerCase().includes(q) ||
        v.vehicleId.toLowerCase().includes(q) ||
        v.vin.toLowerCase().includes(q) ||
        v.brand.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q)
    );

    // Invoices (server-side search, first INVOICE_LIMIT rows)
    const matchedInvoices = invoiceRows;

    // Work Orders
    const matchedWorkOrders = !canAccessPage('work-orders') ? [] : workOrders.filter(
      w =>
        w.workOrderNumber.toLowerCase().includes(q) ||
        w.vehiclePlate.toLowerCase().includes(q) ||
        w.problemDescription.toLowerCase().includes(q)
    );

    // Maintenance Records
    const matchedMaintenance = !canAccessPage('maintenance') ? [] : maintenanceRecords.filter(
      m =>
        m.recordNumber.toLowerCase().includes(q) ||
        m.vehiclePlate.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );

    // Suppliers
    const matchedSuppliers = !canAccessPage('suppliers') ? [] : suppliers.filter(
      s => [s.name, s.supplierType, s.supplierId, s.vatNumber, s.crNumber, s.email].some(x => (x || '').toLowerCase().includes(q))
    );
    const matchedCustomers = !canAccessPage('customers') ? [] : customers.filter(
      c => [c.name, c.customerType, c.customerId, c.vatNumber, c.crNumber, c.email].some(x => (x || '').toLowerCase().includes(q))
    );

    // Documents
    const matchedDocuments = !canAccessPage('documents') ? [] : documents.filter(
      d => d.documentName.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) || (d.vehiclePlate && d.vehiclePlate.toLowerCase().includes(q))
    );

    // Accidents
    const matchedAccidents = !canAccessPage('accidents') ? [] : accidents.filter(
      a => a.accidentNumber.toLowerCase().includes(q) || a.vehiclePlate.toLowerCase().includes(q) || a.policeReportNumber.toLowerCase().includes(q)
    );

    const totalCount =
      matchedVehicles.length +
      invoiceTotal +
      matchedWorkOrders.length +
      matchedMaintenance.length +
      matchedSuppliers.length +
      matchedCustomers.length +
      matchedDocuments.length +
      matchedAccidents.length;

    return {
      totalCount,
      vehicles: matchedVehicles,
      invoices: matchedInvoices,
      invoiceTotal,
      workOrders: matchedWorkOrders,
      maintenance: matchedMaintenance,
      suppliers: matchedSuppliers,
      customers: matchedCustomers,
      documents: matchedDocuments,
      accidents: matchedAccidents,
    };
  }, [query, vehicles, invoiceRows, invoiceTotal, workOrders, maintenanceRecords, suppliers, customers, documents, accidents, canAccessPage]);
  const vehiclePhotoUrl = useVehiclePhotoUrls(results?.vehicles.map(v => v.photoUrl) ?? []);

  if (!isSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-100/35 backdrop-blur-sm transition-opacity duration-150"
        onClick={() => setIsSearchOpen(false)}
        aria-hidden="true"
      />

      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800 bg-slate-850 gap-3">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" aria-hidden="true" />
          <h2 id={titleId} className="sr-only">Search</h2>
          <input
            type="text"
            aria-label="Search records"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search fleet by Plate Number, VIN, Invoice #, Work Order, Supplier, Driver, Document..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search" className="text-slate-400 hover:text-slate-100 p-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          )}
          <span aria-hidden="true" className="hidden sm:inline text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-6 divide-y divide-slate-800">
          {!results && (
            <div className="py-12 text-center text-slate-400 text-xs">
              <p className="font-medium text-slate-300">Quick Global ERP Search</p>
              <p className="text-slate-400 mt-1">Type at least 2 characters to search across vehicles, invoices, work orders, suppliers and records.</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <span className="px-2 py-1 bg-slate-800/80 rounded border border-slate-700 text-slate-400 text-[11px]">1234 ABC</span>
                <span className="px-2 py-1 bg-slate-800/80 rounded border border-slate-700 text-slate-400 text-[11px]">PINV-2026</span>
                <span className="px-2 py-1 bg-slate-800/80 rounded border border-slate-700 text-slate-400 text-[11px]">WO-2026-104</span>
                <span className="px-2 py-1 bg-slate-800/80 rounded border border-slate-700 text-slate-400 text-[11px]">Bahwan</span>
              </div>
            </div>
          )}

          {results && invoiceSearch.error && (
            <p role="alert" className="text-xs text-rose-500 pt-3">
              Invoices could not be searched: {invoiceSearch.error.message}{' '}
              <button type="button" className="underline" onClick={() => void invoiceSearch.refetch()}>Retry</button>
            </p>
          )}

          {results && results.totalCount === 0 && invoicesPending && (
            <p className="py-6 text-center text-xs text-slate-400" role="status">Searching invoices…</p>
          )}

          {results && results.totalCount === 0 && !invoicesPending && (
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
                  <div {...buttonLike}
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
                <FileText className="w-3.5 h-3.5" /> Invoices ({results.invoiceTotal}){results.invoiceTotal > results.invoices.length && <span className="normal-case font-medium text-slate-400"> · first {results.invoices.length} shown, refine the search for more</span>}
              </p>
              <div className="space-y-1.5">
                {results.invoices.map(inv => (
                  <div {...buttonLike}
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
                  <div {...buttonLike}
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

          {results && results.maintenance.length > 0 && (
            <div className="pt-3">
              <p className="text-[11px] font-bold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" /> Maintenance Records ({results.maintenance.length})
              </p>
              <div className="space-y-1.5">
                {results.maintenance.map(m => (
                  <div {...buttonLike}
                    key={m.id}
                    onClick={() => {
                      if (m.vehicleId) {
                        openVehicleDetail(m.vehicleId, 'maintenance');
                      } else {
                        setCurrentPage('maintenance');
                      }
                      setIsSearchOpen(false);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/70 border border-transparent hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">{m.recordNumber}</span>
                        {m.vehiclePlate && (
                          <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded font-mono text-[10px]">{m.vehiclePlate}</span>
                        )}
                        <span className="text-[10px] text-slate-400">({m.category})</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{m.description}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {results && results.accidents.length > 0 && (
            <div className="pt-3">
              <p className="text-[11px] font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Accident Claims ({results.accidents.length})
              </p>
              <div className="space-y-1.5">
                {results.accidents.map(a => (
                  <div {...buttonLike}
                    key={a.id}
                    onClick={() => {
                      if (a.vehicleId) {
                        openVehicleDetail(a.vehicleId, 'accidents');
                      } else {
                        setCurrentPage('accidents');
                      }
                      setIsSearchOpen(false);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/70 border border-transparent hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">{a.accidentNumber}</span>
                        {a.vehiclePlate && (
                          <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded font-mono text-[10px]">{a.vehiclePlate}</span>
                        )}
                        <StatusBadge status={a.status} size="sm" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{a.damageDescription || a.accidentType}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {results && results.documents.length > 0 && (
            <div className="pt-3">
              <p className="text-[11px] font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5" /> Documents ({results.documents.length})
              </p>
              <div className="space-y-1.5">
                {results.documents.map(d => (
                  <div {...buttonLike}
                    key={d.id}
                    onClick={() => {
                      if (d.documentUrl) {
                        openBillModal(d.documentUrl, d.documentName, d.fileType, d.fileSize);
                      } else if (d.vehicleId) {
                        openVehicleDetail(d.vehicleId, 'documents');
                      } else {
                        setCurrentPage('documents');
                      }
                      setIsSearchOpen(false);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/70 border border-transparent hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">{d.documentName}</span>
                        <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded">{d.category}</span>
                        {d.vehiclePlate && (
                          <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded font-mono text-[10px]">{d.vehiclePlate}</span>
                        )}
                      </div>
                      {d.documentNumber && <p className="text-[11px] text-slate-400 mt-0.5">Doc #{d.documentNumber}</p>}
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
                  <div {...buttonLike}
                    key={sup.id}
                    onClick={() => {
                      openPartyDetail('supplier', sup.id);
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

          {results && results.customers.length > 0 && (
            <div className="pt-3">
              <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Clients ({results.customers.length})
              </p>
              <div className="space-y-1.5">
                {results.customers.map(cus => (
                  <div {...buttonLike}
                    key={cus.id}
                    onClick={() => {
                      openPartyDetail('customer', cus.id);
                      setIsSearchOpen(false);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-800/70 border border-transparent hover:border-slate-700 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200">{cus.name}</span>
                        <span className="text-[10px] text-slate-400">({cus.customerType})</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">Contact: {cus.contactPerson} | Phone: {cus.phone}</p>
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

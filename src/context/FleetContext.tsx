import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Company, ApprovalRule, ApprovalRequest } from '../types/system';
import { Vehicle, Tyre, TyreEvent, OilChange } from '../types/vehicle';
import { MaintenanceRecord, WorkOrder, WorkOrderStatus } from '../types/maintenance';
import { Accident, Supplier, Customer, DocumentItem, TimelineEvent } from '../types/operations';
import { InvoiceReconciliation, BankAccount, FixedAsset, DepreciationRun } from '../types/finance';
import { Employee, PayrollRun } from '../types/hr';
import { CollectionKey, Fetchers, dedupFetch } from '../services/core';
import type { LedgerAccount } from '../services/accounting';
import { invalidate, markAllStale, setCacheScope } from '../lib/queryCache';
import * as fleet from '../services/fleet';
import * as finance from '../services/finance';
import * as accounting from '../services/accounting';
import * as hr from '../services/hr';
import * as system from '../services/system';
import * as docs from '../services/documents';
import { useAuth } from './AuthContext';
import { useOptionalOrg } from './OrgContext';
import { supabase } from '../lib/supabase';

// All business data lives in Supabase. Two kinds of data:
//
// * Small reference collections (offices, vehicles, employees, parties, accounts, …) are bounded
//   by the size of the organisation (hundreds of rows). They load ON DEMAND: the first time a
//   component reads `fleet.vehicles`, that collection is fetched (in pages of ≤ 400 rows) and
//   kept per user. Nothing loads at sign-in except the offices.
// * High-volume data (invoices, payments, expenses, journals, audit logs, notifications) is never
//   held here. Pages query it on the server one page at a time (DataTable `server` mode) or ask the
//   database for aggregates (src/services/queries.ts), through the query cache (src/lib/queryCache.ts).
//
// Every mutation runs through its service and then invalidates what it changed: loaded
// collections are re-fetched and cached server queries reading the same tables refetch.
// Realtime events do the same for the table that changed. Mutations throw on failure.

const FETCHERS: Fetchers = {
  ...fleet.fetchers,
  ...finance.fetchers,
  ...accounting.fetchers,
  ...hr.fetchers,
  ...system.fetchers,
  ...docs.fetchers,
};

const AFFECTS: Record<string, CollectionKey[]> = {
  ...fleet.affects,
  ...finance.affects,
  ...accounting.affects,
  ...hr.affects,
  ...docs.affects,
  ...system.affects,
  // an approved invoice request posts the invoice to the GL (finance trigger on approval_requests)
  processApproval: Array.from(new Set<CollectionKey>([
    ...(system.affects.processApproval ?? []), 'journalEntries', 'chartOfAccounts', 'suppliers', 'customers', 'maintenanceRecords',
  ])),
};

// High-volume collections: queried on the server per page / aggregate, never loaded whole.
export const SERVER_ONLY_KEYS = ['invoices', 'payments', 'expenses', 'journalEntries', 'auditLogs', 'notifications'] as const;
type ServerOnlyKey = typeof SERVER_ONLY_KEYS[number];
type ClientKey = Exclude<CollectionKey, ServerOnlyKey>;
const CLIENT_KEYS = (Object.keys(FETCHERS) as CollectionKey[]).filter((k): k is ClientKey => !(SERVER_ONLY_KEYS as readonly string[]).includes(k));

// Tables behind each collection key: invalidating a key refetches cached server queries that read them.
export const KEY_TABLES: Record<CollectionKey, string[]> = {
  companies: ['companies'], vehicles: ['vehicles'], tyres: ['tyres'], tyreEvents: ['tyre_events'], oilChanges: ['oil_changes'],
  maintenanceRecords: ['maintenance_records'], workOrders: ['work_orders'], accidents: ['accidents'], expenses: ['expenses'],
  suppliers: ['suppliers'], customers: ['customers'], invoices: ['invoices', 'invoice_lines'], reconciliations: ['reconciliations'],
  payments: ['payments'], bankAccounts: ['bank_accounts'], chartOfAccounts: ['accounts', 'journal_entries', 'journal_lines'],
  journalEntries: ['journal_entries', 'journal_lines'], fixedAssets: ['fixed_assets'], depreciationRuns: ['depreciation_runs'],
  employees: ['employees'], payrollRuns: ['payroll_runs'], documents: ['documents'], timeline: ['vehicle_timeline'],
  notifications: ['notifications', 'notification_reads'], approvalRules: ['approval_rules'], approvalRequests: ['approval_requests'],
  auditLogs: ['audit_logs'],
};
const tablesOf = (keys: CollectionKey[]) => Array.from(new Set(keys.flatMap(k => KEY_TABLES[k] ?? [])));

// Realtime: table -> collection keys it feeds (client collections) — server queries are invalidated by table name.
const TABLE_KEYS: Record<string, ClientKey[]> = {
  companies: ['companies'],
  vehicles: ['vehicles', 'timeline'],
  maintenance_records: ['maintenanceRecords', 'timeline'],
  work_orders: ['workOrders', 'timeline'],
  oil_changes: ['oilChanges', 'timeline'],
  tyres: ['tyres', 'tyreEvents', 'timeline'],
  tyre_events: ['tyres', 'tyreEvents', 'timeline'],
  accidents: ['accidents', 'timeline'],
  expenses: ['timeline'],
  suppliers: ['suppliers'],
  customers: ['customers'],
  payments: ['bankAccounts'],
  bank_accounts: ['bankAccounts'],
  journal_entries: ['chartOfAccounts'],
  journal_lines: ['chartOfAccounts', 'bankAccounts'],
  accounts: ['chartOfAccounts'],
  fixed_assets: ['fixedAssets'],
  depreciation_runs: ['depreciationRuns', 'fixedAssets'],
  employees: ['employees'],
  payroll_runs: ['payrollRuns'],
  documents: ['documents'],
  approval_requests: ['approvalRequests'],
  approval_rules: ['approvalRules'],
  reconciliations: ['reconciliations'],
};

interface Collections {
  companies: Company[];
  vehicles: Vehicle[];
  tyres: Tyre[];
  tyreEvents: TyreEvent[];
  oilChanges: OilChange[];
  maintenanceRecords: MaintenanceRecord[];
  workOrders: WorkOrder[];
  accidents: Accident[];
  suppliers: Supplier[];
  customers: Customer[];
  reconciliations: InvoiceReconciliation[];
  bankAccounts: BankAccount[];
  chartOfAccounts: LedgerAccount[];
  fixedAssets: FixedAsset[];
  depreciationRuns: DepreciationRun[];
  employees: Employee[];
  payrollRuns: PayrollRun[];
  documents: DocumentItem[];
  timeline: TimelineEvent[];
  approvalRules: ApprovalRule[];
  approvalRequests: ApprovalRequest[];
}

const EMPTY: Collections = {
  companies: [], vehicles: [], tyres: [], tyreEvents: [], oilChanges: [], maintenanceRecords: [], workOrders: [],
  accidents: [], suppliers: [], customers: [], reconciliations: [],
  bankAccounts: [], chartOfAccounts: [], fixedAssets: [], depreciationRuns: [], employees: [],
  payrollRuns: [], documents: [], timeline: [], approvalRules: [], approvalRequests: [],
};

export interface FleetContextType extends Collections {
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
  selectedCompany: Company | undefined;
  currency: string;

  // Load state
  isLoaded: boolean;                                   // the offices have loaded (successfully or not)
  isRefreshing: boolean;
  loadErrors: Partial<Record<CollectionKey, string>>;  // collections that failed to load, with the reason
  /** True once this collection has loaded (or failed) at least once. */
  isCollectionLoaded: (key: CollectionKey) => boolean;
  /** Refresh after a change: re-fetches the given collections if loaded and refetches server queries reading their tables. */
  reload: (keys?: CollectionKey[]) => Promise<void>;

  // Mutations (async; throw ServiceError on failure)
  addCompany: typeof fleet.addCompany;
  updateCompany: typeof fleet.updateCompany;
  addVehicle: typeof fleet.addVehicle;
  updateVehicle: typeof fleet.updateVehicle;
  deleteVehicle: typeof fleet.deleteVehicle;
  addMaintenanceRecord: typeof fleet.addMaintenanceRecord;
  addWorkOrder: typeof fleet.addWorkOrder;
  updateWorkOrderStatus: typeof fleet.updateWorkOrderStatus;
  addOilChange: typeof fleet.addOilChange;
  addTyre: typeof fleet.addTyre;
  updateTyre: typeof fleet.updateTyre;
  addTyreEvent: typeof fleet.addTyreEvent;
  addAccident: typeof fleet.addAccident;
  updateAccident: typeof fleet.updateAccident;
  addExpense: typeof fleet.addExpense;

  addSupplier: typeof finance.addSupplier;
  updateSupplier: typeof finance.updateSupplier;
  addCustomer: typeof finance.addCustomer;
  updateCustomer: typeof finance.updateCustomer;
  addInvoice: typeof finance.addInvoice;
  updateInvoice: typeof finance.updateInvoice;
  submitInvoice: typeof finance.submitInvoice;
  duplicateInvoice: typeof finance.duplicateInvoice;
  createCreditNote: typeof finance.createCreditNote;
  addPayment: typeof finance.addPayment;
  addReconciliation: typeof finance.addReconciliation;

  addJournalEntry: typeof accounting.addJournalEntry;
  reverseJournalEntry: typeof accounting.reverseJournalEntry;
  addFixedAsset: typeof accounting.addFixedAsset;
  updateFixedAsset: typeof accounting.updateFixedAsset;
  deleteFixedAsset: typeof accounting.deleteFixedAsset;
  runAutoDepreciation: typeof accounting.runAutoDepreciation;

  addEmployee: typeof hr.addEmployee;
  updateEmployee: typeof hr.updateEmployee;
  deleteEmployee: typeof hr.deleteEmployee;

  addDocument: typeof docs.addDocument;
  deleteDocument: typeof docs.deleteDocument;

  markNotificationAsRead: typeof system.markNotificationAsRead;
  markAllNotificationsAsRead: typeof system.markAllNotificationsAsRead;
  processApproval: typeof system.processApproval;
  refreshExpiryNotifications: typeof system.refreshExpiryNotifications;

}

const FleetContext = createContext<FleetContextType | undefined>(undefined);

const STALE_AFTER_MS = 60_000;

export const FleetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { refresh: refreshAuth, memberCompanyIds, isSuperAdmin, currentUser } = useAuth();
  const cacheUserId = currentUser.id;
  setCacheScope(cacheUserId);

  const [data, setData] = useState<Collections>(EMPTY);
  const [loaded, setLoaded] = useState<Partial<Record<CollectionKey, boolean>>>({});
  const [inFlight, setInFlight] = useState(0);
  const [loadErrors, setLoadErrors] = useState<Partial<Record<CollectionKey, string>>>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');
  const currency = useOptionalOrg()?.baseCurrency ?? 'OMR'; // organization base currency (Setup Wizard step 2)

  // Collections a component has asked for (read) since sign-in. Only these are ever fetched or refreshed.
  const wanted = useRef(new Set<ClientKey>(['companies']));
  const loadedAt = useRef(new Map<ClientKey, number>());

  // Fetch the given collections (≤ 4 in parallel). A failing collection keeps its previous rows and
  // is reported in loadErrors; it is never silently replaced by an empty list.
  const fetchKeys = useCallback(async (keys: ClientKey[]) => {
    const queue = Array.from(new Set(keys)).filter(k => FETCHERS[k]);
    if (!queue.length) return;
    setInFlight(n => n + 1);
    const fetchWithRetry = (key: ClientKey) => dedupFetch(`reload:${cacheUserId}:${key}`, async () => {
      for (let attempt = 0; ; attempt++) {
        try { return await FETCHERS[key]!(); } catch (err) {
          if (attempt >= 1) throw err;
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    });
    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        try {
          const rows = await fetchWithRetry(key);
          setData(prev => ({ ...prev, [key]: rows }));
          loadedAt.current.set(key, Date.now());
          setLoadErrors(prev => { if (!(key in prev)) return prev; const m = { ...prev }; delete m[key]; return m; });
        } catch (r) {
          console.error(`Failed to load ${key}:`, r);
          setLoadErrors(prev => ({ ...prev, [key]: (r as Error)?.message || 'Failed to load' }));
        } finally {
          setLoaded(prev => (prev[key] ? prev : { ...prev, [key]: true }));
        }
      }
    };
    try { await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker)); }
    finally { setInFlight(n => n - 1); }
  }, [cacheUserId]);

  // Components read collections through getters (see `value` below); a read of a collection that
  // has not been requested yet schedules its first fetch.
  const pending = useRef(new Set<ClientKey>());
  const request = useCallback((key: ClientKey) => {
    if (wanted.current.has(key)) return;
    wanted.current.add(key);
    pending.current.add(key);
    queueMicrotask(() => {
      const keys = [...pending.current];
      pending.current.clear();
      if (keys.length) void fetchKeys(keys);
    });
  }, [fetchKeys]);

  /** Refresh after a change: server queries over the affected tables refetch; loaded collections re-fetch. */
  const reload = useCallback(async (keys?: CollectionKey[]) => {
    const all = keys ?? (Object.keys(KEY_TABLES) as CollectionKey[]);
    invalidate([...tablesOf(all), 'audit_logs']);
    await fetchKeys(all.filter((k): k is ClientKey => wanted.current.has(k as ClientKey)));
  }, [fetchKeys]);

  // Sign-in (or a different user): start over with only the offices.
  useEffect(() => {
    wanted.current = new Set<ClientKey>(['companies']);
    loadedAt.current.clear();
    setData(EMPTY);
    setLoaded({});
    void fetchKeys(['companies']);
  }, [cacheUserId, fetchKeys]);

  // Refresh what is in use when the tab becomes visible again after a while
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const stale = [...wanted.current].filter(k => Date.now() - (loadedAt.current.get(k) ?? 0) > STALE_AFTER_MS);
      if (stale.length) void fetchKeys(stale);
      markAllStale();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchKeys]);

  // Realtime: refresh only what changed. Events are coalesced per table for 400 ms so a burst
  // (e.g. a posting that writes 5 tables) causes one refresh.
  useEffect(() => {
    if (!cacheUserId) return;
    const tables = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      const changed = [...tables];
      tables.clear();
      invalidate(changed);
      const keys = changed.flatMap(t => TABLE_KEYS[t] ?? []).filter(k => wanted.current.has(k));
      if (keys.length) void fetchKeys(keys);
    };
    const channel = supabase
      .channel('public:erp_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        tables.add(payload.table);
        if (!timer) timer = setTimeout(flush, 400);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') console.warn('Realtime channel error, falling back to visibility refresh');
      });
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [cacheUserId, fetchKeys]);

  // Office selector: drop a selection the user no longer has access to
  const companiesLoaded = !!loaded.companies;
  useEffect(() => {
    if (selectedCompanyId === 'all' || !companiesLoaded) return;
    if (!data.companies.some(c => c.id === selectedCompanyId)) setSelectedCompanyId('all');
  }, [data.companies, selectedCompanyId, companiesLoaded]);

  const selectedCompany = useMemo(
    () => (selectedCompanyId === 'all' ? undefined : data.companies.find(c => c.id === selectedCompanyId)),
    [data.companies, selectedCompanyId],
  );

  // Run a service mutation, then refresh what it affects (non-blocking)
  const mutation = useCallback(<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(...args);
      } finally {
        void reload(AFFECTS[name] ?? []).catch(err => console.error(`Refresh after ${name} failed:`, err));
      }
    }, [reload]);

  const actions = useMemo(() => ({
    addCompany: mutation('addCompany', async (c: Omit<Company, 'id'>) => {
      const created = await fleet.addCompany(c);
      setData(prev => ({ ...prev, companies: [created, ...prev.companies] }));
      await refreshAuth().catch(() => undefined);
      return created;
    }),
    updateCompany: mutation('updateCompany', async (id: string, updates: Partial<Company>) => {
      const updated = await fleet.updateCompany(id, updates);
      setData(prev => ({ ...prev, companies: prev.companies.map(c => c.id === id ? { ...c, ...updated } : c) }));
      return updated;
    }),
    addVehicle: mutation('addVehicle', fleet.addVehicle),
    updateVehicle: mutation('updateVehicle', async (id: string, updates: Partial<Vehicle>) => {
      const updated = await fleet.updateVehicle(id, updates);
      setData(prev => ({ ...prev, vehicles: prev.vehicles.map(v => v.id === id ? { ...v, ...updated } : v) }));
      return updated;
    }),
    deleteVehicle: mutation('deleteVehicle', async (id: string) => {
      await fleet.deleteVehicle(id);
      setData(prev => ({ ...prev, vehicles: prev.vehicles.filter(v => v.id !== id) }));
    }),
    addMaintenanceRecord: mutation('addMaintenanceRecord', fleet.addMaintenanceRecord),
    addWorkOrder: mutation('addWorkOrder', fleet.addWorkOrder),
    updateWorkOrderStatus: mutation('updateWorkOrderStatus', async (id: string, status: WorkOrderStatus, actualCost?: number) => {
      await fleet.updateWorkOrderStatus(id, status, actualCost);
      setData(prev => ({
        ...prev,
        workOrders: prev.workOrders.map(w => w.id === id ? { ...w, status, ...(actualCost !== undefined ? { actualCost } : {}) } : w),
      }));
    }),
    addOilChange: mutation('addOilChange', fleet.addOilChange),
    addTyre: mutation('addTyre', fleet.addTyre),
    updateTyre: mutation('updateTyre', async (id: string, updates: Partial<Tyre>) => {
      const updated = await fleet.updateTyre(id, updates);
      setData(prev => ({ ...prev, tyres: prev.tyres.map(t => t.id === id ? { ...t, ...updated } : t) }));
      return updated;
    }),
    addTyreEvent: mutation('addTyreEvent', fleet.addTyreEvent),
    addAccident: mutation('addAccident', fleet.addAccident),
    updateAccident: mutation('updateAccident', async (id: string, updates: Partial<Accident>) => {
      const updated = await fleet.updateAccident(id, updates);
      setData(prev => ({ ...prev, accidents: prev.accidents.map(a => a.id === id ? { ...a, ...updated } : a) }));
      return updated;
    }),
    addExpense: mutation('addExpense', fleet.addExpense),

    addSupplier: mutation('addSupplier', finance.addSupplier),
    updateSupplier: mutation('updateSupplier', async (id: string, supplier: Partial<Supplier>) => {
      await finance.updateSupplier(id, supplier);
      setData(prev => ({ ...prev, suppliers: prev.suppliers.map(s => s.id === id ? { ...s, ...supplier } : s) }));
    }),
    addCustomer: mutation('addCustomer', finance.addCustomer),
    updateCustomer: mutation('updateCustomer', async (id: string, customer: Partial<Customer>) => {
      await finance.updateCustomer(id, customer);
      setData(prev => ({ ...prev, customers: prev.customers.map(c => c.id === id ? { ...c, ...customer } : c) }));
    }),
    addInvoice: mutation('addInvoice', finance.addInvoice),
    updateInvoice: mutation('updateInvoice', finance.updateInvoice),
    submitInvoice: mutation('submitInvoice', finance.submitInvoice),
    duplicateInvoice: mutation('duplicateInvoice', finance.duplicateInvoice),
    createCreditNote: mutation('createCreditNote', finance.createCreditNote),
    addPayment: mutation('addPayment', finance.addPayment),
    addReconciliation: mutation('addReconciliation', finance.addReconciliation),

    addJournalEntry: mutation('addJournalEntry', accounting.addJournalEntry),
    reverseJournalEntry: mutation('reverseJournalEntry', accounting.reverseJournalEntry),
    addFixedAsset: mutation('addFixedAsset', accounting.addFixedAsset),
    updateFixedAsset: mutation('updateFixedAsset', async (id: string, updates: Partial<FixedAsset>) => {
      await accounting.updateFixedAsset(id, updates);
      setData(prev => ({ ...prev, fixedAssets: prev.fixedAssets.map(a => a.id === id ? { ...a, ...updates } : a) }));
    }),
    deleteFixedAsset: mutation('deleteFixedAsset', async (id: string) => {
      await accounting.deleteFixedAsset(id);
      setData(prev => ({ ...prev, fixedAssets: prev.fixedAssets.filter(a => a.id !== id) }));
    }),
    runAutoDepreciation: mutation('runAutoDepreciation', accounting.runAutoDepreciation),

    addEmployee: mutation('addEmployee', hr.addEmployee),
    updateEmployee: mutation('updateEmployee', async (id: string, updates: Partial<Employee>) => {
      await hr.updateEmployee(id, updates);
      setData(prev => ({ ...prev, employees: prev.employees.map(e => e.id === id ? { ...e, ...updates } : e) }));
    }),
    deleteEmployee: mutation('deleteEmployee', async (id: string) => {
      await hr.deleteEmployee(id);
      setData(prev => ({ ...prev, employees: prev.employees.filter(e => e.id !== id) }));
    }),

    addDocument: mutation('addDocument', docs.addDocument),
    deleteDocument: mutation('deleteDocument', async (id: string) => {
      const res = await docs.deleteDocument(id);
      setData(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== id) }));
      return res;
    }),

    markNotificationAsRead: mutation('markNotificationAsRead', system.markNotificationAsRead),
    markAllNotificationsAsRead: mutation('markAllNotificationsAsRead', system.markAllNotificationsAsRead),
    processApproval: mutation('processApproval', system.processApproval),
    refreshExpiryNotifications: mutation('refreshExpiryNotifications', system.refreshExpiryNotifications),
  }), [mutation, refreshAuth]);

  // Membership changes (admin edits) change what RLS returns: refresh everything in use
  const membershipKey = `${isSuperAdmin}|${[...memberCompanyIds].sort().join(',')}`;
  const firstMembership = useRef(membershipKey);
  useEffect(() => {
    if (firstMembership.current === membershipKey) return;
    firstMembership.current = membershipKey;
    reload().catch(() => undefined);
  }, [membershipKey, reload]);

  const isCollectionLoaded = useCallback((key: CollectionKey) => !!loaded[key], [loaded]);

  // Collections are exposed through getters so that reading one requests it.
  const value = useMemo(() => {
    const v = {
      selectedCompanyId,
      setSelectedCompanyId,
      selectedCompany,
      currency,
      isLoaded: companiesLoaded,
      isRefreshing: inFlight > 0,
      loadErrors,
      isCollectionLoaded,
      reload,
      ...actions,
    } as FleetContextType;
    for (const key of CLIENT_KEYS) {
      Object.defineProperty(v, key, { enumerable: true, get: () => { request(key); return data[key as keyof Collections]; } });
    }
    return v;
  }, [selectedCompanyId, selectedCompany, currency, companiesLoaded, inFlight, loadErrors, isCollectionLoaded, reload, actions, data, request]);

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>;
};

/** FleetContext when rendered inside FleetProvider, otherwise undefined (shared UI components). */
export const useOptionalFleet = () => useContext(FleetContext);

export const useFleet = () => {
  const context = useContext(FleetContext);
  if (!context) throw new Error('useFleet must be used within a FleetProvider');
  return context;
};

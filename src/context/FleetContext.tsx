import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Company, AuditLog, NotificationItem, ApprovalRule, ApprovalRequest } from '../types/system';
import { Vehicle, Tyre, TyreEvent, OilChange, VehicleFinancialSummary } from '../types/vehicle';
import { MaintenanceRecord, WorkOrder, WorkOrderStatus } from '../types/maintenance';
import { VehicleExpense, Accident, Supplier, Customer, DocumentItem, TimelineEvent } from '../types/operations';
import { Invoice, InvoiceReconciliation, Payment, BankAccount, Account, JournalEntry, FixedAsset, DepreciationRun, TrialBalanceRow, GeneralLedgerAccountSummary, PartyStatementLine, ProfitLossStatement, BalanceSheetStatement } from '../types/finance';
import { Employee, PayrollRun } from '../types/hr';
import { CollectionKey, Fetchers, dedupFetch } from '../services/core';
import * as fleet from '../services/fleet';
import * as finance from '../services/finance';
import * as accounting from '../services/accounting';
import * as hr from '../services/hr';
import * as system from '../services/system';
import * as docs from '../services/documents';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

// All business data lives in Supabase. This provider loads each collection through the
// service-layer fetchers (RLS decides what the signed-in user sees), runs every mutation through
// its service, and afterwards re-fetches exactly the collections that mutation affects.
// Mutations throw on failure; callers show the error and never assume success.

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

const ALL_KEYS = Object.keys(FETCHERS) as CollectionKey[];
const STALE_AFTER_MS = 60_000;

// Load order: what the landing/active page needs first, the rest in the background. A page shows
// as soon as its own wave arrives instead of waiting for all 27 collections.
const CORE_KEYS: CollectionKey[] = ['companies', 'vehicles', 'notifications', 'approvalRequests'];
const PAGE_KEYS: Record<string, CollectionKey[]> = {
  dashboard: ['maintenanceRecords', 'workOrders', 'oilChanges', 'tyres', 'accidents', 'expenses', 'invoices', 'journalEntries', 'chartOfAccounts', 'suppliers', 'customers'],
  expenses: ['expenses', 'suppliers'],
  invoices: ['invoices', 'suppliers', 'customers', 'payments', 'bankAccounts'],
  payments: ['payments', 'invoices', 'bankAccounts', 'suppliers', 'customers'],
  reconciliation: ['reconciliations', 'invoices', 'suppliers', 'maintenanceRecords', 'workOrders'],
  'trial-balance': ['journalEntries', 'chartOfAccounts'],
  'general-ledger': ['journalEntries', 'chartOfAccounts', 'suppliers', 'customers', 'invoices', 'payments'],
  vehicles: ['tyres', 'oilChanges', 'maintenanceRecords', 'accidents', 'expenses'],
};
const currentHashPage = (): string => {
  try { return (window.location.hash.replace(/^#/, '').split('?')[0]) || 'dashboard'; } catch { return 'dashboard'; }
};
const CURRENCY_KEY = 'erp_display_currency';

interface Collections {
  companies: Company[];
  vehicles: Vehicle[];
  tyres: Tyre[];
  tyreEvents: TyreEvent[];
  oilChanges: OilChange[];
  maintenanceRecords: MaintenanceRecord[];
  workOrders: WorkOrder[];
  accidents: Accident[];
  expenses: VehicleExpense[];
  suppliers: Supplier[];
  customers: Customer[];
  invoices: Invoice[];
  reconciliations: InvoiceReconciliation[];
  payments: Payment[];
  bankAccounts: BankAccount[];
  chartOfAccounts: Account[];
  journalEntries: JournalEntry[];
  fixedAssets: FixedAsset[];
  depreciationRuns: DepreciationRun[];
  employees: Employee[];
  payrollRuns: PayrollRun[];
  documents: DocumentItem[];
  timeline: TimelineEvent[];
  notifications: NotificationItem[];
  approvalRules: ApprovalRule[];
  approvalRequests: ApprovalRequest[];
  auditLogs: AuditLog[];
}

const EMPTY: Collections = {
  companies: [], vehicles: [], tyres: [], tyreEvents: [], oilChanges: [], maintenanceRecords: [], workOrders: [],
  accidents: [], expenses: [], suppliers: [], customers: [], invoices: [], reconciliations: [], payments: [],
  bankAccounts: [], chartOfAccounts: [], journalEntries: [], fixedAssets: [], depreciationRuns: [], employees: [],
  payrollRuns: [], documents: [], timeline: [], notifications: [], approvalRules: [], approvalRequests: [], auditLogs: [],
};

export interface FleetContextType extends Collections {
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
  selectedCompany: Company | undefined;
  currency: string;
  setCurrency: (curr: string) => void;

  // Load state
  isLoaded: boolean;                                   // first load finished (successfully or not)
  isRefreshing: boolean;
  loadErrors: Partial<Record<CollectionKey, string>>;  // collections that failed to load, with the reason
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
  processPayrollRun: typeof hr.processPayrollRun;

  addDocument: typeof docs.addDocument;
  deleteDocument: typeof docs.deleteDocument;

  markNotificationAsRead: typeof system.markNotificationAsRead;
  markAllNotificationsAsRead: typeof system.markAllNotificationsAsRead;
  processApproval: typeof system.processApproval;
  refreshExpiryNotifications: typeof system.refreshExpiryNotifications;

  // Ledger & analytics (pure, computed from the loaded collections)
  getTrialBalance: (asOfDate?: string, companyId?: string) => {
    rows: TrialBalanceRow[];
    totalOpeningDebit: number;
    totalOpeningCredit: number;
    totalPeriodDebit: number;
    totalPeriodCredit: number;
    totalClosingDebit: number;
    totalClosingCredit: number;
    isBalanced: boolean;
    difference: number;
  };
  getGeneralLedger: (targetAccountCode?: string, startDate?: string, endDate?: string, companyId?: string) => GeneralLedgerAccountSummary[];
  getPartyLedger: (partyId: string, partyType: 'Supplier' | 'Customer') => {
    openingBalance: number;
    lines: PartyStatementLine[];
    totalDebit: number;
    totalCredit: number;
    closingBalance: number;
  };
  getVehicleFinancialSummary: (vehicleId: string) => VehicleFinancialSummary;
  getCompanyProfitLoss: (companyId?: string, range?: { startDate?: string; endDate?: string }) => ProfitLossStatement;
  getCompanyBalanceSheet: (companyId?: string) => BalanceSheetStatement;
}

const FleetContext = createContext<FleetContextType | undefined>(undefined);

// 'all' (every office the user can see) is represented as undefined in the services
const toScope = (companyId?: string) => (!companyId || companyId === 'all' ? undefined : companyId);

const readCurrency = (): string => {
  try { return localStorage.getItem(CURRENCY_KEY) || 'OMR'; } catch { return 'OMR'; }
};

export const FleetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { refresh: refreshAuth, memberCompanyIds, isSuperAdmin, currentUser } = useAuth();
  const cacheUserId = currentUser.id;

  const [data, setData] = useState<Collections>(EMPTY);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadErrors, setLoadErrors] = useState<Partial<Record<CollectionKey, string>>>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');
  const [currency, setCurrencyState] = useState<string>(readCurrency);
  const lastLoadedAt = useRef(0);

  // Fast memoization cache for ledger and analytical getters
  const calcCache = useRef(new Map<string, any>());

  // Invalidate memoization cache when underlying data references change
  useEffect(() => {
    calcCache.current.clear();
  }, [
    data.chartOfAccounts,
    data.journalEntries,
    data.invoices,
    data.payments,
    data.suppliers,
    data.customers,
    data.vehicles,
    data.maintenanceRecords,
    data.accidents,
    data.oilChanges,
    data.tyres,
    data.tyreEvents,
    data.expenses,
  ]);

  const setCurrency = useCallback((curr: string) => {
    setCurrencyState(curr);
    try { localStorage.setItem(CURRENCY_KEY, curr); } catch { /* display preference only */ }
  }, []);

  // Fetch the given collections in parallel. A failing collection keeps its previous rows and is
  // reported in loadErrors; it is never silently replaced by an empty list.
  const reload = useCallback(async (keys: CollectionKey[] = ALL_KEYS) => {
    const wanted = Array.from(new Set(keys)).filter(k => FETCHERS[k]);
    if (wanted.length === 0) return;
    setIsRefreshing(true);

    // Apply each collection the moment it arrives. Uses in-flight deduplication to coalesce
    // rapid identical requests from multiple components or lifecycle hooks.
    const fetchWithRetry = async (key: CollectionKey) => {
      return dedupFetch(`reload:${key}`, async () => {
        for (let attempt = 0; ; attempt++) {
          try { return await FETCHERS[key]!(); } catch (err) {
            if (attempt >= 1) throw err;
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
      });
    };

    const queue = [...wanted];
    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        try {
          const rows = await fetchWithRetry(key);
          setData(prev => ({ ...prev, [key]: rows }));
          setLoadErrors(prev => { if (!(key in prev)) return prev; const m = { ...prev }; delete m[key]; return m; });
        } catch (r) {
          console.error(`Failed to load ${key}:`, r);
          setLoadErrors(prev => ({ ...prev, [key]: (r as Error)?.message || 'Failed to load' }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, wanted.length) }, worker));
    if (wanted.length === ALL_KEYS.length) lastLoadedAt.current = Date.now();
    setIsRefreshing(false);
  }, [cacheUserId]);

  // Initial load: active page wave first, the rest in the background. Business data is never
  // cached in the browser: Supabase is the only source of truth.
  useEffect(() => {
    let alive = true;
    (async () => {
      const first = Array.from(new Set<CollectionKey>([...CORE_KEYS, ...(PAGE_KEYS[currentHashPage()] ?? [])]));
      await reload(first);
      if (!alive) return;
      setIsLoaded(true);
      await reload(ALL_KEYS.filter(k => !first.includes(k)));
      lastLoadedAt.current = Date.now();
    })();
    return () => { alive = false; };
  }, [reload, cacheUserId]);

  // Refresh stale data when the tab becomes visible again
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoadedAt.current > STALE_AFTER_MS) {
        reload().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  // Realtime database synchronization
  useEffect(() => {
    if (!cacheUserId) return;

    const tableToKeys: Record<string, CollectionKey[]> = {
      vehicles: ['vehicles', 'timeline'],
      maintenance_records: ['maintenanceRecords', 'timeline'],
      work_orders: ['workOrders', 'timeline'],
      oil_changes: ['oilChanges', 'timeline'],
      tyres: ['tyres', 'tyreEvents', 'timeline'],
      tyre_events: ['tyres', 'tyreEvents', 'timeline'],
      accidents: ['accidents', 'timeline'],
      expenses: ['expenses', 'timeline'],
      suppliers: ['suppliers'],
      customers: ['customers'],
      invoices: ['invoices'],
      payments: ['payments', 'invoices', 'bankAccounts'],
      bank_accounts: ['bankAccounts'],
      journal_entries: ['journalEntries', 'chartOfAccounts'],
      fixed_assets: ['fixedAssets'],
      depreciation_runs: ['depreciationRuns', 'fixedAssets', 'journalEntries'],
      employees: ['employees'],
      payroll_runs: ['payrollRuns', 'journalEntries'],
      documents: ['documents'],
      notifications: ['notifications'],
      approval_requests: ['approvalRequests'],
      audit_logs: ['auditLogs'],
    };

    const channel = supabase
      .channel('public:erp_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          const keys = tableToKeys[payload.table];
          if (keys) {
            reload(keys).catch(() => undefined);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('Realtime channel error, falling back to visibility polling');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cacheUserId, reload]);

  // Office selector: drop a selection the user no longer has access to
  useEffect(() => {
    if (selectedCompanyId === 'all' || !isLoaded) return;
    if (!data.companies.some(c => c.id === selectedCompanyId)) setSelectedCompanyId('all');
  }, [data.companies, selectedCompanyId, isLoaded]);

  const selectedCompany = useMemo(
    () => (selectedCompanyId === 'all' ? undefined : data.companies.find(c => c.id === selectedCompanyId)),
    [data.companies, selectedCompanyId],
  );

  // Run a service mutation, then re-fetch affected collections non-blocking in background
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
    addVehicle: mutation('addVehicle', async (v: Parameters<typeof fleet.addVehicle>[0]) => {
      const created = await fleet.addVehicle(v);
      setData(prev => ({ ...prev, vehicles: [created, ...prev.vehicles] }));
      return created;
    }),
    updateVehicle: mutation('updateVehicle', async (id: string, updates: Partial<Vehicle>) => {
      const updated = await fleet.updateVehicle(id, updates);
      setData(prev => ({ ...prev, vehicles: prev.vehicles.map(v => v.id === id ? { ...v, ...updated } : v) }));
      return updated;
    }),
    deleteVehicle: mutation('deleteVehicle', async (id: string) => {
      await fleet.deleteVehicle(id);
      setData(prev => ({ ...prev, vehicles: prev.vehicles.filter(v => v.id !== id) }));
    }),
    addMaintenanceRecord: mutation('addMaintenanceRecord', async (m: Parameters<typeof fleet.addMaintenanceRecord>[0]) => {
      const created = await fleet.addMaintenanceRecord(m);
      setData(prev => ({ ...prev, maintenanceRecords: [created, ...prev.maintenanceRecords] }));
      return created;
    }),
    addWorkOrder: mutation('addWorkOrder', async (w: Parameters<typeof fleet.addWorkOrder>[0]) => {
      const created = await fleet.addWorkOrder(w);
      setData(prev => ({ ...prev, workOrders: [created, ...prev.workOrders] }));
      return created;
    }),
    updateWorkOrderStatus: mutation('updateWorkOrderStatus', async (id: string, status: WorkOrderStatus, actualCost?: number) => {
      await fleet.updateWorkOrderStatus(id, status, actualCost);
      setData(prev => ({
        ...prev,
        workOrders: prev.workOrders.map(w => w.id === id ? { ...w, status, ...(actualCost !== undefined ? { actualCost } : {}) } : w),
      }));
    }),
    addOilChange: mutation('addOilChange', async (o: Parameters<typeof fleet.addOilChange>[0]) => {
      const created = await fleet.addOilChange(o);
      setData(prev => ({ ...prev, oilChanges: [created, ...prev.oilChanges] }));
      return created;
    }),
    addTyre: mutation('addTyre', async (t: Parameters<typeof fleet.addTyre>[0]) => {
      const created = await fleet.addTyre(t);
      setData(prev => ({ ...prev, tyres: [created, ...prev.tyres] }));
      return created;
    }),
    updateTyre: mutation('updateTyre', async (id: string, updates: Partial<Tyre>) => {
      const updated = await fleet.updateTyre(id, updates);
      setData(prev => ({ ...prev, tyres: prev.tyres.map(t => t.id === id ? { ...t, ...updated } : t) }));
      return updated;
    }),
    addTyreEvent: mutation('addTyreEvent', async (e: Parameters<typeof fleet.addTyreEvent>[0]) => {
      const created = await fleet.addTyreEvent(e);
      setData(prev => ({ ...prev, tyreEvents: [created, ...prev.tyreEvents] }));
      return created;
    }),
    addAccident: mutation('addAccident', async (a: Parameters<typeof fleet.addAccident>[0]) => {
      const created = await fleet.addAccident(a);
      setData(prev => ({ ...prev, accidents: [created, ...prev.accidents] }));
      return created;
    }),
    updateAccident: mutation('updateAccident', async (id: string, updates: Partial<Accident>) => {
      const updated = await fleet.updateAccident(id, updates);
      setData(prev => ({ ...prev, accidents: prev.accidents.map(a => a.id === id ? { ...a, ...updated } : a) }));
      return updated;
    }),
    addExpense: mutation('addExpense', async (e: Parameters<typeof fleet.addExpense>[0]) => {
      const created = await fleet.addExpense(e);
      setData(prev => ({ ...prev, expenses: [created, ...prev.expenses] }));
      return created;
    }),

    addSupplier: mutation('addSupplier', async (s: Parameters<typeof finance.addSupplier>[0]) => {
      const created = await finance.addSupplier(s);
      setData(prev => ({ ...prev, suppliers: [created, ...prev.suppliers] }));
      return created;
    }),
    updateSupplier: mutation('updateSupplier', async (id: string, supplier: Partial<Supplier>) => {
      await finance.updateSupplier(id, supplier);
      setData(prev => ({ ...prev, suppliers: prev.suppliers.map(s => s.id === id ? { ...s, ...supplier } : s) }));
    }),
    addCustomer: mutation('addCustomer', async (c: Parameters<typeof finance.addCustomer>[0]) => {
      const created = await finance.addCustomer(c);
      setData(prev => ({ ...prev, customers: [created, ...prev.customers] }));
      return created;
    }),
    updateCustomer: mutation('updateCustomer', async (id: string, customer: Partial<Customer>) => {
      await finance.updateCustomer(id, customer);
      setData(prev => ({ ...prev, customers: prev.customers.map(c => c.id === id ? { ...c, ...customer } : c) }));
    }),
    addInvoice: mutation('addInvoice', async (inv: Parameters<typeof finance.addInvoice>[0]) => {
      const created = await finance.addInvoice(inv);
      setData(prev => ({ ...prev, invoices: [created, ...prev.invoices] }));
      return created;
    }),
    updateInvoice: mutation('updateInvoice', async (id: string, inv: Partial<Invoice>) => {
      await finance.updateInvoice(id, inv);
      setData(prev => ({ ...prev, invoices: prev.invoices.map(i => i.id === id ? { ...i, ...inv } : i) }));
    }),
    submitInvoice: mutation('submitInvoice', finance.submitInvoice),
    duplicateInvoice: mutation('duplicateInvoice', async (id: string) => {
      const created = await finance.duplicateInvoice(id);
      setData(prev => ({ ...prev, invoices: [created, ...prev.invoices] }));
      return created;
    }),
    createCreditNote: mutation('createCreditNote', finance.createCreditNote),
    addPayment: mutation('addPayment', async (p: Parameters<typeof finance.addPayment>[0]) => {
      const created = await finance.addPayment(p);
      setData(prev => ({ ...prev, payments: [created, ...prev.payments] }));
      return created;
    }),
    addReconciliation: mutation('addReconciliation', finance.addReconciliation),

    addJournalEntry: mutation('addJournalEntry', async (j: Parameters<typeof accounting.addJournalEntry>[0]) => {
      const created = await accounting.addJournalEntry(j);
      setData(prev => ({ ...prev, journalEntries: [created, ...prev.journalEntries] }));
      return created;
    }),
    reverseJournalEntry: mutation('reverseJournalEntry', accounting.reverseJournalEntry),
    addFixedAsset: mutation('addFixedAsset', async (a: Parameters<typeof accounting.addFixedAsset>[0]) => {
      const created = await accounting.addFixedAsset(a);
      setData(prev => ({ ...prev, fixedAssets: [created, ...prev.fixedAssets] }));
      return created;
    }),
    updateFixedAsset: mutation('updateFixedAsset', async (id: string, updates: Partial<FixedAsset>) => {
      await accounting.updateFixedAsset(id, updates);
      setData(prev => ({ ...prev, fixedAssets: prev.fixedAssets.map(a => a.id === id ? { ...a, ...updates } : a) }));
    }),
    deleteFixedAsset: mutation('deleteFixedAsset', async (id: string) => {
      await accounting.deleteFixedAsset(id);
      setData(prev => ({ ...prev, fixedAssets: prev.fixedAssets.filter(a => a.id !== id) }));
    }),
    runAutoDepreciation: mutation('runAutoDepreciation', accounting.runAutoDepreciation),

    addEmployee: mutation('addEmployee', async (e: Parameters<typeof hr.addEmployee>[0]) => {
      const created = await hr.addEmployee(e);
      setData(prev => ({ ...prev, employees: [created, ...prev.employees] }));
      return created;
    }),
    updateEmployee: mutation('updateEmployee', async (id: string, updates: Partial<Employee>) => {
      await hr.updateEmployee(id, updates);
      setData(prev => ({ ...prev, employees: prev.employees.map(e => e.id === id ? { ...e, ...updates } : e) }));
    }),
    deleteEmployee: mutation('deleteEmployee', async (id: string) => {
      await hr.deleteEmployee(id);
      setData(prev => ({ ...prev, employees: prev.employees.filter(e => e.id !== id) }));
    }),
    processPayrollRun: mutation('processPayrollRun', hr.processPayrollRun),

    addDocument: mutation('addDocument', async (d: Parameters<typeof docs.addDocument>[0]) => {
      const created = await docs.addDocument(d);
      setData(prev => ({ ...prev, documents: [created, ...prev.documents] }));
      return created;
    }),
    deleteDocument: mutation('deleteDocument', async (id: string) => {
      const res = await docs.deleteDocument(id);
      setData(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== id) }));
      return res;
    }),

    markNotificationAsRead: mutation('markNotificationAsRead', async (id: string) => {
      await system.markNotificationAsRead(id);
      setData(prev => ({ ...prev, notifications: prev.notifications.map(n => n.id === id ? { ...n, read: true } : n) }));
    }),
    markAllNotificationsAsRead: mutation('markAllNotificationsAsRead', async () => {
      await system.markAllNotificationsAsRead();
      setData(prev => ({ ...prev, notifications: prev.notifications.map(n => ({ ...n, read: true })) }));
    }),
    processApproval: mutation('processApproval', system.processApproval),
    refreshExpiryNotifications: mutation('refreshExpiryNotifications', system.refreshExpiryNotifications),
  }), [mutation, refreshAuth]);

  // Ledger getters default to the office chosen in the header selector
  const scope = useCallback((companyId?: string) => toScope(companyId ?? selectedCompanyId), [selectedCompanyId]);

  const getTrialBalance = useCallback(
    (asOfDate?: string, companyId?: string) => {
      const sc = scope(companyId);
      const cacheKey = `tb:${asOfDate ?? ''}:${sc ?? 'all'}`;
      if (calcCache.current.has(cacheKey)) return calcCache.current.get(cacheKey);
      const res = accounting.getTrialBalance(data.chartOfAccounts as any, data.journalEntries, asOfDate, sc);
      calcCache.current.set(cacheKey, res);
      return res;
    },
    [data.chartOfAccounts, data.journalEntries, scope]
  );

  const getGeneralLedger = useCallback(
    (targetAccountCode?: string, startDate?: string, endDate?: string, companyId?: string) => {
      const sc = scope(companyId);
      const cacheKey = `gl:${targetAccountCode ?? ''}:${startDate ?? ''}:${endDate ?? ''}:${sc ?? 'all'}:${currency}`;
      if (calcCache.current.has(cacheKey)) return calcCache.current.get(cacheKey);
      const res = accounting.getGeneralLedger(data.chartOfAccounts as any, data.journalEntries, targetAccountCode, startDate, endDate, sc, currency);
      calcCache.current.set(cacheKey, res);
      return res;
    },
    [data.chartOfAccounts, data.journalEntries, currency, scope]
  );

  const getCompanyProfitLoss = useCallback(
    (companyId?: string, range?: { startDate?: string; endDate?: string }) => {
      const sc = scope(companyId);
      const cacheKey = `pl:${sc ?? 'all'}:${range?.startDate ?? ''}:${range?.endDate ?? ''}`;
      if (calcCache.current.has(cacheKey)) return calcCache.current.get(cacheKey);
      const res = accounting.getCompanyProfitLoss(data.chartOfAccounts as any, data.journalEntries, sc, range);
      calcCache.current.set(cacheKey, res);
      return res;
    },
    [data.chartOfAccounts, data.journalEntries, scope]
  );

  const getCompanyBalanceSheet = useCallback(
    (companyId?: string) => {
      const sc = scope(companyId);
      const cacheKey = `bs:${sc ?? 'all'}`;
      if (calcCache.current.has(cacheKey)) return calcCache.current.get(cacheKey);
      const res = accounting.getCompanyBalanceSheet(data.chartOfAccounts as any, data.journalEntries, sc);
      calcCache.current.set(cacheKey, res);
      return res;
    },
    [data.chartOfAccounts, data.journalEntries, scope]
  );

  const getPartyLedger = useCallback(
    (partyId: string, partyType: 'Supplier' | 'Customer') => {
      const sc = toScope(selectedCompanyId);
      const cacheKey = `party:${partyType}:${partyId}:${sc ?? 'all'}`;
      if (calcCache.current.has(cacheKey)) return calcCache.current.get(cacheKey);
      const res = finance.getPartyLedger(partyId, partyType, data.invoices, data.payments,
        partyType === 'Supplier' ? data.suppliers : data.customers, sc);
      calcCache.current.set(cacheKey, res);
      return res;
    },
    [data.invoices, data.payments, data.suppliers, data.customers, selectedCompanyId]
  );

  const getVehicleFinancialSummary = useCallback(
    (vehicleId: string) => {
      const cacheKey = `vehFin:${vehicleId}`;
      if (calcCache.current.has(cacheKey)) return calcCache.current.get(cacheKey);
      const res = fleet.getVehicleFinancialSummary(vehicleId, {
        vehicles: data.vehicles,
        maintenanceRecords: data.maintenanceRecords,
        accidents: data.accidents,
        oilChanges: data.oilChanges,
        tyres: data.tyres,
        tyreEvents: data.tyreEvents,
        expenses: data.expenses,
        invoices: data.invoices,
      });
      calcCache.current.set(cacheKey, res);
      return res;
    },
    [data.vehicles, data.maintenanceRecords, data.accidents, data.oilChanges, data.tyres, data.tyreEvents, data.expenses, data.invoices]
  );

  // Membership changes (admin edits) change what RLS returns: reload everything
  const membershipKey = `${isSuperAdmin}|${[...memberCompanyIds].sort().join(',')}`;
  const firstMembership = useRef(membershipKey);
  useEffect(() => {
    if (firstMembership.current === membershipKey) return;
    firstMembership.current = membershipKey;
    reload().catch(() => undefined);
  }, [membershipKey, reload]);

  const value: FleetContextType = {
    ...data,
    selectedCompanyId,
    setSelectedCompanyId,
    selectedCompany,
    currency,
    setCurrency,
    isLoaded,
    isRefreshing,
    loadErrors,
    reload,
    ...actions,
    getTrialBalance,
    getGeneralLedger,
    getPartyLedger,
    getVehicleFinancialSummary,
    getCompanyProfitLoss,
    getCompanyBalanceSheet,
  };

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>;
};

/** FleetContext when rendered inside FleetProvider, otherwise undefined (shared UI components). */
export const useOptionalFleet = () => useContext(FleetContext);

export const useFleet = () => {
  const context = useContext(FleetContext);
  if (!context) throw new Error('useFleet must be used within a FleetProvider');
  return context;
};

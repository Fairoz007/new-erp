import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Company, AuditLog, NotificationItem, ApprovalRule, ApprovalRequest } from '../types/system';
import { Vehicle, Tyre, TyreEvent, OilChange, VehicleFinancialSummary } from '../types/vehicle';
import { MaintenanceRecord, WorkOrder } from '../types/maintenance';
import { VehicleExpense, Accident, Supplier, Customer, DocumentItem, TimelineEvent } from '../types/operations';
import { Invoice, InvoiceReconciliation, Payment, BankAccount, Account, JournalEntry, FixedAsset, DepreciationRun, TrialBalanceRow, GeneralLedgerAccountSummary, PartyStatementLine, ProfitLossStatement, BalanceSheetStatement } from '../types/finance';
import { Employee, PayrollRun } from '../types/hr';
import type { CollectionKey, Fetchers } from '../services/core';
import * as fleet from '../services/fleet';
import * as finance from '../services/finance';
import * as accounting from '../services/accounting';
import * as hr from '../services/hr';
import * as system from '../services/system';
import * as docs from '../services/documents';
import { useAuth } from './AuthContext';
import { readCache, writeCache } from '../lib/cache';

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
    // Apply each collection the moment it arrives. Only a few requests run at once (27 at a time
    // exhausts a small database's connection pool and everything times out) and a failed fetch is
    // retried with a short back-off before it is reported.
    const fetchWithRetry = async (key: CollectionKey) => {
      for (let attempt = 0; ; attempt++) {
        try { return await FETCHERS[key]!(); } catch (err) {
          if (attempt >= 1) throw err;
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    };
    const queue = [...wanted];
    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        try {
          const rows = await fetchWithRetry(key);
          setData(prev => ({ ...prev, [key]: rows }));
          setLoadErrors(prev => { if (!(key in prev)) return prev; const m = { ...prev }; delete m[key]; return m; });
          if (cacheUserId) void writeCache(cacheUserId, { [key]: rows });
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

  // Initial load (the provider is mounted by AuthGate only once a user is signed in):
  // 1) paint last-known data from the local cache, 2) fetch the active page's collections,
  // 3) fetch everything else in the background.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (cacheUserId) {
        const cached = await readCache(cacheUserId);
        if (alive && Object.keys(cached).length) {
          setData(prev => ({ ...prev, ...(cached as Partial<Collections>) }));
          setIsLoaded(true);
        }
      }
      const first = Array.from(new Set<CollectionKey>([...CORE_KEYS, ...(PAGE_KEYS[currentHashPage()] ?? [])]));
      await reload(first);
      if (!alive) return;
      setIsLoaded(true);
      await reload(ALL_KEYS.filter(k => !first.includes(k)));
      lastLoadedAt.current = Date.now();
    })();
    return () => { alive = false; };
  }, [reload, cacheUserId]);

  // Refresh stale data when the tab becomes visible again (other users may have changed records)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoadedAt.current > STALE_AFTER_MS) {
        reload().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  // Office selector: drop a selection the user no longer has access to
  useEffect(() => {
    if (selectedCompanyId === 'all' || !isLoaded) return;
    if (!data.companies.some(c => c.id === selectedCompanyId)) setSelectedCompanyId('all');
  }, [data.companies, selectedCompanyId, isLoaded]);

  const selectedCompany = useMemo(
    () => (selectedCompanyId === 'all' ? undefined : data.companies.find(c => c.id === selectedCompanyId)),
    [data.companies, selectedCompanyId],
  );

  // Run a service mutation, then re-fetch what it changed. A refetch failure does not turn a
  // successful write into an error; it shows up in loadErrors instead.
  const mutation = useCallback(<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(...args);
      } finally {
        // also after a failure: a multi-step call can fail after its first write succeeded
        // (e.g. payment recorded but attachment not linked), and the UI must show what was saved
        // not awaited: the save is done, so the dialog closes at once while the lists refresh behind it
        void reload(AFFECTS[name] ?? []).catch(err => console.error(`Refresh after ${name} failed:`, err));
      }
    }, [reload]);

  const actions = useMemo(() => ({
    addCompany: mutation('addCompany', async (c: Omit<Company, 'id'>) => {
      const created = await fleet.addCompany(c);
      // the creator becomes a member of the new office (DB trigger): refresh their memberships
      await refreshAuth().catch(() => undefined);
      return created;
    }),
    updateCompany: mutation('updateCompany', fleet.updateCompany),
    addVehicle: mutation('addVehicle', fleet.addVehicle),
    updateVehicle: mutation('updateVehicle', fleet.updateVehicle),
    deleteVehicle: mutation('deleteVehicle', fleet.deleteVehicle),
    addMaintenanceRecord: mutation('addMaintenanceRecord', fleet.addMaintenanceRecord),
    addWorkOrder: mutation('addWorkOrder', fleet.addWorkOrder),
    updateWorkOrderStatus: mutation('updateWorkOrderStatus', fleet.updateWorkOrderStatus),
    addOilChange: mutation('addOilChange', fleet.addOilChange),
    addTyre: mutation('addTyre', fleet.addTyre),
    updateTyre: mutation('updateTyre', fleet.updateTyre),
    addTyreEvent: mutation('addTyreEvent', fleet.addTyreEvent),
    addAccident: mutation('addAccident', fleet.addAccident),
    updateAccident: mutation('updateAccident', fleet.updateAccident),
    addExpense: mutation('addExpense', fleet.addExpense),

    addSupplier: mutation('addSupplier', finance.addSupplier),
    updateSupplier: mutation('updateSupplier', finance.updateSupplier),
    addCustomer: mutation('addCustomer', finance.addCustomer),
    updateCustomer: mutation('updateCustomer', finance.updateCustomer),
    addInvoice: mutation('addInvoice', finance.addInvoice),
    updateInvoice: mutation('updateInvoice', finance.updateInvoice),
    submitInvoice: mutation('submitInvoice', finance.submitInvoice),
    duplicateInvoice: mutation('duplicateInvoice', finance.duplicateInvoice),
    createCreditNote: mutation('createCreditNote', finance.createCreditNote),
    addPayment: mutation('addPayment', finance.addPayment),
    addReconciliation: mutation('addReconciliation', finance.addReconciliation),

    addJournalEntry: mutation('addJournalEntry', accounting.addJournalEntry),
    addFixedAsset: mutation('addFixedAsset', accounting.addFixedAsset),
    updateFixedAsset: mutation('updateFixedAsset', accounting.updateFixedAsset),
    deleteFixedAsset: mutation('deleteFixedAsset', accounting.deleteFixedAsset),
    runAutoDepreciation: mutation('runAutoDepreciation', accounting.runAutoDepreciation),

    addEmployee: mutation('addEmployee', hr.addEmployee),
    updateEmployee: mutation('updateEmployee', hr.updateEmployee),
    deleteEmployee: mutation('deleteEmployee', hr.deleteEmployee),
    processPayrollRun: mutation('processPayrollRun', hr.processPayrollRun),

    addDocument: mutation('addDocument', docs.addDocument),
    deleteDocument: mutation('deleteDocument', docs.deleteDocument),

    markNotificationAsRead: mutation('markNotificationAsRead', system.markNotificationAsRead),
    markAllNotificationsAsRead: mutation('markAllNotificationsAsRead', system.markAllNotificationsAsRead),
    processApproval: mutation('processApproval', system.processApproval),
    refreshExpiryNotifications: mutation('refreshExpiryNotifications', system.refreshExpiryNotifications),
  }), [mutation, refreshAuth]);

  // Ledger getters default to the office chosen in the header selector
  const scope = useCallback((companyId?: string) => toScope(companyId ?? selectedCompanyId), [selectedCompanyId]);

  const getTrialBalance = useCallback(
    (asOfDate?: string, companyId?: string) =>
      accounting.getTrialBalance(data.chartOfAccounts as any, data.journalEntries, asOfDate, scope(companyId)),
    [data.chartOfAccounts, data.journalEntries, scope]);

  const getGeneralLedger = useCallback(
    (targetAccountCode?: string, startDate?: string, endDate?: string, companyId?: string) =>
      accounting.getGeneralLedger(data.chartOfAccounts as any, data.journalEntries, targetAccountCode, startDate, endDate, scope(companyId), currency),
    [data.chartOfAccounts, data.journalEntries, currency, scope]);

  const getCompanyProfitLoss = useCallback(
    (companyId?: string, range?: { startDate?: string; endDate?: string }) =>
      accounting.getCompanyProfitLoss(data.chartOfAccounts as any, data.journalEntries, scope(companyId), range),
    [data.chartOfAccounts, data.journalEntries, scope]);

  const getCompanyBalanceSheet = useCallback(
    (companyId?: string) => accounting.getCompanyBalanceSheet(data.chartOfAccounts as any, data.journalEntries, scope(companyId)),
    [data.chartOfAccounts, data.journalEntries, scope]);

  const getPartyLedger = useCallback(
    (partyId: string, partyType: 'Supplier' | 'Customer') =>
      finance.getPartyLedger(partyId, partyType, data.invoices, data.payments,
        partyType === 'Supplier' ? data.suppliers : data.customers, toScope(selectedCompanyId)),
    [data.invoices, data.payments, data.suppliers, data.customers, selectedCompanyId]);

  const getVehicleFinancialSummary = useCallback(
    (vehicleId: string) => fleet.getVehicleFinancialSummary(vehicleId, {
      vehicles: data.vehicles,
      maintenanceRecords: data.maintenanceRecords,
      accidents: data.accidents,
      oilChanges: data.oilChanges,
      tyres: data.tyres,
      tyreEvents: data.tyreEvents,
      expenses: data.expenses,
      invoices: data.invoices,
    }),
    [data.vehicles, data.maintenanceRecords, data.accidents, data.oilChanges, data.tyres, data.tyreEvents, data.expenses, data.invoices]);

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

export const useFleet = () => {
  const context = useContext(FleetContext);
  if (!context) throw new Error('useFleet must be used within a FleetProvider');
  return context;
};

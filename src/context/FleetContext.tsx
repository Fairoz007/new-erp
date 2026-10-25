import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { Company, User, AuditLog, NotificationItem, ApprovalRule, ApprovalRequest } from '../types/system';
import { Vehicle, Tyre, TyreEvent, OilChange, VehicleFinancialSummary, DepreciationScheduleRow } from '../types/vehicle';
import { MaintenanceRecord, WorkOrder, WorkOrderStatus } from '../types/maintenance';
import { VehicleExpense, Accident, Supplier, Customer, DocumentItem, TimelineEvent } from '../types/operations';
import { Invoice, InvoiceReconciliation, Payment, BankAccount, Account, JournalEntry, FixedAsset, DepreciationRun, TrialBalanceRow, GeneralLedgerAccountSummary, GeneralLedgerLine, PartyStatementLine, ProfitLossStatement, BalanceSheetStatement } from '../types/finance';
import { Employee, PayrollRun, PayrollLineItem } from '../types/hr';
import {
  INITIAL_COMPANIES,
  INITIAL_USERS,
  INITIAL_VEHICLES,
  INITIAL_TYRES,
  INITIAL_TYRE_EVENTS,
  INITIAL_OIL_CHANGES,
  INITIAL_MAINTENANCE_RECORDS,
  INITIAL_WORK_ORDERS,
  INITIAL_ACCIDENTS,
  INITIAL_EXPENSES,
  INITIAL_SUPPLIERS,
  INITIAL_CUSTOMERS,
  INITIAL_INVOICES,
  INITIAL_RECONCILIATIONS,
  INITIAL_PAYMENTS,
  INITIAL_BANK_ACCOUNTS,
  INITIAL_CHART_OF_ACCOUNTS,
  INITIAL_JOURNAL_ENTRIES,
  INITIAL_DOCUMENTS,
  INITIAL_TIMELINE,
  INITIAL_NOTIFICATIONS,
  INITIAL_APPROVAL_RULES,
  INITIAL_APPROVAL_REQUESTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_FIXED_ASSETS,
  INITIAL_DEPRECIATION_RUNS,
  INITIAL_EMPLOYEES,
  INITIAL_PAYROLL_RUNS,
} from '../data/initialSeedData';
import { calculateDepreciationSchedule, calculateCurrentBookValue, calculateCostPerKm, roundToPrecision } from '../utils/financial';
import { isDateOverdue, isDateExpiringSoon } from '../utils/date';

const STORAGE_KEY = 'alhakim_erp_offices_v7';
try {
  if (typeof window !== 'undefined') {
    [
      'fleetx_erp_unified_cache_v1',
      'alhakim_erp_unified_cache_v1',
      'alhakim_erp_unified_cache_v2',
      'alhakim_erp_unified_cache_v3',
      'alhakim_erp_unified_cache_v4',
      'alhakim_erp_unified_cache_v5',
      'alhakim_erp_offices_v6',
    ].forEach((k) => {
      localStorage.removeItem(k);
    });
  }
} catch {
  // ignore storage errors
}

export interface FleetContextType {
  // Data
  companies: Company[];
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
  selectedCompany: Company | undefined;
  
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
  currency: string;
  setCurrency: (curr: string) => void;

  // Actions
  addVehicle: (vehicle: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>) => Vehicle;
  updateVehicle: (id: string, vehicle: Partial<Vehicle>) => void;
  deleteVehicle: (id: string) => void;
  
  addMaintenanceRecord: (record: Omit<MaintenanceRecord, 'id' | 'recordNumber' | 'createdAt'>) => MaintenanceRecord;
  addWorkOrder: (order: Omit<WorkOrder, 'id' | 'workOrderNumber' | 'createdAt' | 'updatedAt'>) => WorkOrder;
  updateWorkOrderStatus: (id: string, status: WorkOrderStatus, actualCost?: number) => void;
  
  addOilChange: (oilChange: Omit<OilChange, 'id' | 'status'>) => OilChange;
  addTyre: (tyre: Omit<Tyre, 'id'>) => Tyre;
  updateTyre: (id: string, tyre: Partial<Tyre>) => void;
  addTyreEvent: (event: Omit<TyreEvent, 'id'>) => TyreEvent;
  
  addAccident: (accident: Omit<Accident, 'id' | 'accidentNumber' | 'createdAt' | 'netAccidentCostToCompany'>) => Accident;
  updateAccident: (id: string, accident: Partial<Accident>) => void;
  
  addExpense: (expense: Omit<VehicleExpense, 'id' | 'expenseNumber' | 'createdAt'>) => VehicleExpense;
  
  addSupplier: (supplier: Omit<Supplier, 'id' | 'supplierId' | 'currentBalance' | 'totalPurchases' | 'totalInvoicesCount' | 'amountPaid' | 'creditNotesAmount' | 'createdAt'>) => Supplier;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => void;
  
  addCustomer: (customer: Omit<Customer, 'id' | 'customerId' | 'currentBalance' | 'totalSales' | 'totalInvoicesCount' | 'amountReceived' | 'createdAt'>) => Customer;
  updateCustomer: (id: string, customer: Partial<Customer>) => void;
  
  addInvoice: (invoice: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt' | 'amountPaid' | 'outstandingAmount'>) => Invoice;
  updateInvoice: (id: string, invoice: Partial<Invoice>) => void;
  duplicateInvoice: (id: string) => Invoice;
  createCreditNote: (invoiceId: string, reason: string) => Invoice;
  
  addPayment: (payment: Omit<Payment, 'id' | 'paymentNumber' | 'createdAt'>) => Payment;
  addReconciliation: (rec: Omit<InvoiceReconciliation, 'id' | 'reconciliationNumber' | 'createdAt' | 'differenceAmount' | 'variancePercentage'>) => InvoiceReconciliation;
  
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'entryNumber' | 'createdAt'>) => JournalEntry;
  addDocument: (doc: Omit<DocumentItem, 'id' | 'uploadedAt'>) => DocumentItem;
  deleteDocument: (id: string) => void;

  // Fixed Asset & Automatic Depreciation Actions
  addFixedAsset: (asset: Omit<FixedAsset, 'id' | 'assetCode' | 'createdAt' | 'updatedAt'>) => FixedAsset;
  updateFixedAsset: (id: string, asset: Partial<FixedAsset>) => void;
  deleteFixedAsset: (id: string) => void;
  runAutoDepreciation: (params?: { periodLabel?: string; runDate?: string; notes?: string; processedBy?: string; autoPostGL?: boolean }) => DepreciationRun;

  // HR & Payroll Actions
  addEmployee: (emp: Omit<Employee, 'id' | 'employeeCode' | 'createdAt'>) => Employee;
  updateEmployee: (id: string, emp: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  processPayrollRun: (params: { month: number; year: number; paymentDate?: string; bankAccountId?: string; autoPostGL?: boolean }) => PayrollRun;

  // Financial Query & Ledger Helpers
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
  
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  
  processApproval: (requestId: string, action: 'Approved' | 'Rejected', comment?: string, approverUser?: User) => void;
  
  logAudit: (action: AuditLog['action'], entityType: AuditLog['entityType'], entityId: string, entityName: string, details: string, oldValue?: string, newValue?: string) => void;
  
  // Analytics & Summary helpers
  getVehicleFinancialSummary: (vehicleId: string) => VehicleFinancialSummary;
  getCompanyProfitLoss: (companyId?: string) => ProfitLossStatement;
  getCompanyBalanceSheet: (companyId?: string) => BalanceSheetStatement;
  
  // Storage controls
  resetToDefaultData: () => void;
  exportAllDataJSON: () => void;
  importDataJSON: (jsonData: string) => boolean;
}

// Collision-safe record id suffix
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

// Next document sequence: max existing trailing number + 1 (never reuses numbers after deletes)
const nextSeq = (items: any[], field: string, base: number): number => {
  const max = items.reduce((m: number, it: any) => {
    const n = parseInt(String(it?.[field] ?? '').split('-').pop() || '', 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, base - 1);
  return Math.max(max + 1, items.length + base);
};

const FleetContext = createContext<FleetContextType | undefined>(undefined);

export const FleetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Load initial state from localStorage or seed
  const [isLoaded, setIsLoaded] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');
  const [currency, setCurrency] = useState<string>('OMR');

  const [companies, setCompanies] = useState<Company[]>(INITIAL_COMPANIES);
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [tyres, setTyres] = useState<Tyre[]>(INITIAL_TYRES);
  const [tyreEvents, setTyreEvents] = useState<TyreEvent[]>(INITIAL_TYRE_EVENTS);
  const [oilChanges, setOilChanges] = useState<OilChange[]>(INITIAL_OIL_CHANGES);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>(INITIAL_MAINTENANCE_RECORDS);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(INITIAL_WORK_ORDERS);
  const [accidents, setAccidents] = useState<Accident[]>(INITIAL_ACCIDENTS);
  const [expenses, setExpenses] = useState<VehicleExpense[]>(INITIAL_EXPENSES);
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [reconciliations, setReconciliations] = useState<InvoiceReconciliation[]>(INITIAL_RECONCILIATIONS);
  const [payments, setPayments] = useState<Payment[]>(INITIAL_PAYMENTS);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(INITIAL_BANK_ACCOUNTS);
  const [chartOfAccounts, setChartOfAccounts] = useState<Account[]>(INITIAL_CHART_OF_ACCOUNTS);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(INITIAL_JOURNAL_ENTRIES);
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>(INITIAL_FIXED_ASSETS);
  const [depreciationRuns, setDepreciationRuns] = useState<DepreciationRun[]>(INITIAL_DEPRECIATION_RUNS);
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>(INITIAL_PAYROLL_RUNS);
  const [documents, setDocuments] = useState<DocumentItem[]>(INITIAL_DOCUMENTS);
  const [timeline, setTimeline] = useState<TimelineEvent[]>(INITIAL_TIMELINE);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [approvalRules, setApprovalRules] = useState<ApprovalRule[]>(INITIAL_APPROVAL_RULES);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>(INITIAL_APPROVAL_REQUESTS);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);

  // Initialize from cache
  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const hasLegacyEntities =
          !parsed.companies ||
          parsed.companies.length !== 2 ||
          parsed.companies.some((c: Company) => !c.name.includes('Al Hakim') || c.id === 'comp-3');

        if (hasLegacyEntities) {
          console.warn('Detected legacy company cache. Purging and applying Al Hakim National LLC structure.');
          localStorage.removeItem(STORAGE_KEY);
          setCompanies(INITIAL_COMPANIES);
          setVehicles(INITIAL_VEHICLES);
          setEmployees(INITIAL_EMPLOYEES);
          setInvoices(INITIAL_INVOICES);
          setBankAccounts(INITIAL_BANK_ACCOUNTS);
          setFixedAssets(INITIAL_FIXED_ASSETS);
          setPayrollRuns(INITIAL_PAYROLL_RUNS);
          setMaintenanceRecords(INITIAL_MAINTENANCE_RECORDS);
          setWorkOrders(INITIAL_WORK_ORDERS);
          setAccidents(INITIAL_ACCIDENTS);
          setExpenses(INITIAL_EXPENSES);
          setDocuments(INITIAL_DOCUMENTS);
        } else {
          setCompanies(INITIAL_COMPANIES);
          if (parsed.vehicles) setVehicles(parsed.vehicles);
          if (parsed.tyres) setTyres(parsed.tyres);
          if (parsed.tyreEvents) setTyreEvents(parsed.tyreEvents);
          if (parsed.oilChanges) setOilChanges(parsed.oilChanges);
          if (parsed.maintenanceRecords) setMaintenanceRecords(parsed.maintenanceRecords);
          if (parsed.workOrders) setWorkOrders(parsed.workOrders);
          if (parsed.accidents) setAccidents(parsed.accidents);
          if (parsed.expenses) setExpenses(parsed.expenses);
          if (parsed.suppliers) setSuppliers(parsed.suppliers);
          if (parsed.customers) setCustomers(parsed.customers);
          if (parsed.invoices) setInvoices(parsed.invoices);
          if (parsed.reconciliations) setReconciliations(parsed.reconciliations);
          if (parsed.payments) setPayments(parsed.payments);
          if (parsed.bankAccounts) setBankAccounts(parsed.bankAccounts);
          if (parsed.chartOfAccounts) setChartOfAccounts(parsed.chartOfAccounts);
          if (parsed.journalEntries) setJournalEntries(parsed.journalEntries);
          if (parsed.fixedAssets) setFixedAssets(parsed.fixedAssets);
          if (parsed.depreciationRuns) setDepreciationRuns(parsed.depreciationRuns);
          if (parsed.employees) setEmployees(parsed.employees);
          if (parsed.payrollRuns) setPayrollRuns(parsed.payrollRuns);
          if (parsed.documents) setDocuments(parsed.documents);
          if (parsed.timeline) setTimeline(parsed.timeline);
          if (parsed.notifications) setNotifications(parsed.notifications);
          if (parsed.approvalRules) setApprovalRules(parsed.approvalRules);
          if (parsed.approvalRequests) setApprovalRequests(parsed.approvalRequests);
          if (parsed.auditLogs) setAuditLogs(parsed.auditLogs);
        }
      } else {
        setCompanies(INITIAL_COMPANIES);
      }
    } catch (e) {
      console.error('Error loading state from localStorage:', e);
      setCompanies(INITIAL_COMPANIES);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save to cache on state change
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const stateToPersist = {
        companies,
        vehicles,
        tyres,
        tyreEvents,
        oilChanges,
        maintenanceRecords,
        workOrders,
        accidents,
        expenses,
        suppliers,
        customers,
        invoices,
        reconciliations,
        payments,
        bankAccounts,
        chartOfAccounts,
        journalEntries,
        fixedAssets,
        depreciationRuns,
        employees,
        payrollRuns,
        documents,
        timeline,
        notifications,
        approvalRules,
        approvalRequests,
        auditLogs,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToPersist));
    } catch (e) {
      console.error('Error saving state to localStorage:', e);
    }
  }, [
    isLoaded,
    companies,
    vehicles,
    tyres,
    tyreEvents,
    oilChanges,
    maintenanceRecords,
    workOrders,
    accidents,
    expenses,
    suppliers,
    customers,
    invoices,
    reconciliations,
    payments,
    bankAccounts,
    chartOfAccounts,
    journalEntries,
    fixedAssets,
    depreciationRuns,
    employees,
    payrollRuns,
    documents,
    timeline,
    notifications,
    approvalRules,
    approvalRequests,
    auditLogs,
  ]);

  const selectedCompany = useMemo(() => {
    if (selectedCompanyId === 'all') return undefined;
    return companies.find(c => c.id === selectedCompanyId);
  }, [companies, selectedCompanyId]);

  // Audit logging helper
  const logAudit = (
    action: AuditLog['action'],
    entityType: AuditLog['entityType'],
    entityId: string,
    entityName: string,
    details: string,
    oldValue?: string,
    newValue?: string
  ) => {
    const newLog: AuditLog = {
      id: `log-${uid()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      userId: 'usr-1',
      userName: 'Current User',
      userRole: 'Super Admin',
      action,
      entityType,
      entityId,
      entityName,
      details,
      oldValue,
      newValue,
      ipAddress: '192.168.1.100',
    };
    setAuditLogs(prev => [newLog, ...prev]);
  };

  // Add Vehicle
  const addVehicle = (vehicleData: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>): Vehicle => {
    const newId = `veh-${uid()}`;
    const newVehicle: Vehicle = {
      ...vehicleData,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setVehicles(prev => [newVehicle, ...prev]);

    // Add Timeline event
    const newTimeline: TimelineEvent = {
      id: `tl-${uid()}`,
      vehicleId: newId,
      date: newVehicle.purchase.purchaseDate || new Date().toISOString().slice(0, 10),
      title: 'Vehicle Added to Fleet',
      description: `Acquired ${newVehicle.brand} ${newVehicle.model} for ${newVehicle.purchase.purchaseValue.toFixed(3)} OMR.`,
      amount: newVehicle.purchase.purchaseValue,
      currency: 'OMR',
      category: 'Purchase',
      icon: 'Car',
      color: 'indigo',
    };
    setTimeline(prev => [newTimeline, ...prev]);

    // Add default 5 tyres (FL, FR, RL, RR, Spare)
    const defaultTyres: Tyre[] = (['Front Left', 'Front Right', 'Rear Left', 'Rear Right', 'Spare'] as const).map((pos, idx) => ({
      id: `tyr-${uid()}-${idx}`,
      vehicleId: newId,
      brand: 'Standard OEM',
      model: 'Factory Spec',
      size: 'Standard',
      serialNumber: `SN-${newVehicle.plateNumber.replace(/\s+/g, '')}-${idx + 1}`,
      position: pos,
      purchaseDate: newVehicle.purchase.purchaseDate || new Date().toISOString().slice(0, 10),
      purchaseCost: 60.000,
      installationDate: newVehicle.purchase.purchaseDate || new Date().toISOString().slice(0, 10),
      installationMileage: newVehicle.initialOdometer || 0,
      expectedLifeKm: 50000,
      currentMileage: 0,
      treadDepthMm: 8.0,
      status: 'Good',
    }));
    setTyres(prev => [...defaultTyres, ...prev]);

    logAudit('CREATE', 'Vehicle', newId, `${newVehicle.brand} ${newVehicle.model} (${newVehicle.plateNumber})`, `Added new vehicle with ID ${newVehicle.vehicleId}`);

    return newVehicle;
  };

  // Update Vehicle
  const updateVehicle = (id: string, updates: Partial<Vehicle>) => {
    setVehicles(prev =>
      prev.map(v => {
        if (v.id === id) {
          const updated = { ...v, ...updates, updatedAt: new Date().toISOString() };
          logAudit('UPDATE', 'Vehicle', id, `${updated.brand} ${updated.model} (${updated.plateNumber})`, `Updated vehicle fields: ${Object.keys(updates).join(', ')}`);
          return updated;
        }
        return v;
      })
    );
  };

  // Delete Vehicle
  const deleteVehicle = (id: string) => {
    const hasLinks = ([workOrders, maintenanceRecords, oilChanges, accidents, expenses, tyres] as any[][])
      .some(list => list.some(r => r.vehicleId === id));
    if (hasLinks) throw new Error('Vehicle has linked records; set its status to Inactive instead of deleting.');
    const target = vehicles.find(v => v.id === id);
    setVehicles(prev => prev.filter(v => v.id !== id));
    if (target) {
      logAudit('DELETE', 'Vehicle', id, `${target.brand} ${target.model} (${target.plateNumber})`, 'Vehicle removed from system.');
    }
  };

  // Add Maintenance Record
  const addMaintenanceRecord = (recordData: Omit<MaintenanceRecord, 'id' | 'recordNumber' | 'createdAt'>): MaintenanceRecord => {
    const newId = `mnt-${uid()}`;
    const recordNumber = `MNT-2026-${String(nextSeq(maintenanceRecords as any[], 'recordNumber', 1)).padStart(3, '0')}`;
    const newRecord: MaintenanceRecord = {
      ...recordData,
      id: newId,
      recordNumber,
      createdAt: new Date().toISOString(),
    };

    setMaintenanceRecords(prev => [newRecord, ...prev]);

    // Update vehicle mileage if higher
    if (newRecord.odometerReading) {
      setVehicles(prev =>
        prev.map(v => {
          if (v.id === newRecord.vehicleId && v.currentMileage < newRecord.odometerReading) {
            return { ...v, currentMileage: newRecord.odometerReading, updatedAt: new Date().toISOString() };
          }
          return v;
        })
      );
    }

    // Add Timeline event
    const newTimeline: TimelineEvent = {
      id: `tl-${uid()}`,
      vehicleId: newRecord.vehicleId,
      date: newRecord.maintenanceDate,
      title: `${newRecord.category}: ${newRecord.maintenanceType}`,
      description: newRecord.description,
      amount: newRecord.totalCost,
      currency: 'OMR',
      category: 'Maintenance',
      referenceId: newId,
      referenceType: 'MaintenanceRecord',
      icon: 'Wrench',
      color: 'blue',
    };
    setTimeline(prev => [newTimeline, ...prev]);

    // Auto-create Supplier Invoice if unpaid and supplier linked
    if (newRecord.supplierId && newRecord.totalCost > 0) {
      const supplier = suppliers.find(s => s.id === newRecord.supplierId);
      const newInvoiceNumber = `PINV-MNT-${Date.now().toString().slice(-4)}`;
      
      const newInvoice: Invoice = {
        id: `inv-${uid()}`,
        invoiceNumber: newRecord.invoiceNumber || newInvoiceNumber,
        invoiceType: 'Purchase',
        companyId: newRecord.companyId,
        companyName: companies.find(c => c.id === newRecord.companyId)?.name || 'Company',
        partyType: 'Supplier',
        partyId: newRecord.supplierId,
        partyName: newRecord.supplierName,
        invoiceDate: newRecord.maintenanceDate,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        workOrderNumber: newRecord.workOrderNumber,
        maintenanceRecordId: newId,
        vehicleId: newRecord.vehicleId,
        vehiclePlate: newRecord.vehiclePlate,
        currency: 'OMR',
        exchangeRate: 1.0,
        items: [
          {
            id: `li-${uid()}`,
            itemCode: 'MNT-SRV',
            description: `${newRecord.category} - ${newRecord.description}`,
            quantity: 1,
            unit: 'Job',
            unitPrice: newRecord.partsCost + newRecord.labourCost + newRecord.otherCharges,
            discountPercentage: 0,
            discountAmount: newRecord.discount || 0,
            taxRatePercentage: 5,
            taxAmount: newRecord.tax,
            lineTotal: newRecord.totalCost,
            vehicleId: newRecord.vehicleId,
            vehiclePlate: newRecord.vehiclePlate,
            expenseCategory: 'Maintenance',
            glAccountCode: '5000',
          },
        ],
        subtotal: newRecord.partsCost + newRecord.labourCost + newRecord.otherCharges,
        discountTotal: newRecord.discount || 0,
        taxTotal: newRecord.tax,
        otherCharges: 0,
        grandTotal: newRecord.totalCost,
        amountPaid: newRecord.paymentStatus === 'Paid' ? newRecord.totalCost : 0,
        outstandingAmount: newRecord.paymentStatus === 'Paid' ? 0 : newRecord.totalCost,
        paymentStatus: newRecord.paymentStatus,
        approvalStatus: 'Approved',
        paymentTermsDays: supplier?.paymentTermsDays || 30,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setInvoices(prev => [newInvoice, ...prev]);

      // Update supplier balance if unpaid
      if (newRecord.paymentStatus !== 'Paid') {
        setSuppliers(prev =>
          prev.map(s => {
            if (s.id === newRecord.supplierId) {
              return {
                ...s,
                currentBalance: roundToPrecision(s.currentBalance + newRecord.totalCost, 3),
                totalPurchases: roundToPrecision(s.totalPurchases + newRecord.totalCost, 3),
                totalInvoicesCount: s.totalInvoicesCount + 1,
              };
            }
            return s;
          })
        );
      }
    }

    logAudit('CREATE', 'Maintenance', newId, `${recordNumber} (${newRecord.vehiclePlate})`, `Created maintenance record of ${newRecord.totalCost.toFixed(3)} OMR`);

    return newRecord;
  };

  // Add Work Order
  const addWorkOrder = (orderData: Omit<WorkOrder, 'id' | 'workOrderNumber' | 'createdAt' | 'updatedAt'>): WorkOrder => {
    const newId = `wo-${uid()}`;
    const workOrderNumber = `WO-2026-${String(nextSeq(workOrders as any[], 'workOrderNumber', 101)).padStart(3, '0')}`;
    
    // Check approval rules
    let approvalStatus: WorkOrder['approvalStatus'] = 'Not Required';
    let approvalId: string | undefined;

    const applicableRule = approvalRules.find(r => r.module === 'maintenance' && r.active && orderData.estimatedCost >= r.thresholdAmount);
    if (applicableRule) {
      approvalStatus = 'Pending';
      approvalId = `app-${uid()}`;
      
      const newApprovalRequest: ApprovalRequest = {
        id: approvalId,
        referenceType: 'WorkOrder',
        referenceId: newId,
        referenceNumber: workOrderNumber,
        companyId: orderData.companyId,
        requestedBy: orderData.requestedBy,
        requestedByName: orderData.requestedByName,
        requestedDate: new Date().toISOString(),
        amount: orderData.estimatedCost,
        currency: 'OMR',
        status: 'Pending',
        currentLevel: 1,
        totalLevels: applicableRule.requiredRoles.length,
        requiredRoles: applicableRule.requiredRoles,
        history: [],
        notes: `Work order estimated cost (${orderData.estimatedCost.toFixed(3)} OMR) exceeds threshold ${applicableRule.thresholdAmount} OMR.`,
      };
      setApprovalRequests(prev => [newApprovalRequest, ...prev]);

      // Trigger notification
      const newNotif: NotificationItem = {
        id: `notif-${uid()}`,
        type: 'approval_required',
        title: `Work Order Approval Required: ${workOrderNumber}`,
        message: `Work order for ${orderData.vehiclePlate} (${orderData.estimatedCost.toFixed(3)} OMR) requires approval.`,
        severity: 'warning',
        date: new Date().toISOString(),
        read: false,
        vehicleId: orderData.vehicleId,
        referenceId: newId,
      };
      setNotifications(prev => [newNotif, ...prev]);
    }

    const newOrder: WorkOrder = {
      ...orderData,
      id: newId,
      workOrderNumber,
      approvalStatus,
      approvalId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setWorkOrders(prev => [newOrder, ...prev]);
    logAudit('CREATE', 'WorkOrder', newId, `${workOrderNumber} (${orderData.vehiclePlate})`, `Logged work order with status ${newOrder.status}`);

    return newOrder;
  };

  // Update Work Order Status
  const updateWorkOrderStatus = (id: string, status: WorkOrderStatus, actualCost?: number) => {
    // Side effects run once here, outside the state updater (StrictMode double-invokes updaters)
    const wo = workOrders.find(w => w.id === id);
    if (!wo) return;
    const finalCost = actualCost !== undefined ? actualCost : wo.finalCost || wo.estimatedCost;
    const updated: WorkOrder = {
      ...wo,
      status,
      finalCost,
      actualCompletion: status === 'Completed' ? new Date().toISOString().slice(0, 10) : wo.actualCompletion,
      updatedAt: new Date().toISOString(),
    };
    setWorkOrders(prev => prev.map(w => (w.id === id ? updated : w)));

    // If Completed, automatically create a linked Maintenance Record
    if (status === 'Completed' && wo.status !== 'Completed') {
      const vehicle = vehicles.find(v => v.id === wo.vehicleId);
      addMaintenanceRecord({
        vehicleId: wo.vehicleId,
        vehiclePlate: wo.vehiclePlate,
        companyId: wo.companyId,
        maintenanceDate: new Date().toISOString().slice(0, 10),
        maintenanceType: 'Corrective Maintenance',
        category: 'General Service',
        description: `Completed Work Order ${wo.workOrderNumber}: ${wo.problemDescription}`,
        odometerReading: vehicle?.currentMileage || 0,
        serviceCentre: wo.workshop,
        supplierId: wo.supplierId || 'sup-2',
        supplierName: wo.supplierName || wo.workshop,
        technician: wo.assignedTechnician,
        workOrderNumber: wo.workOrderNumber,
        partsCost: wo.partsCharges || roundToPrecision(finalCost * 0.65, 3),
        labourCost: wo.labourCharges || roundToPrecision(finalCost * 0.3, 3),
        tax: roundToPrecision(finalCost * 0.05, 3),
        discount: 0,
        otherCharges: wo.additionalCharges || 0,
        totalCost: finalCost,
        paymentStatus: 'Unpaid',
        nextServiceMileage: (vehicle?.currentMileage || 0) + 10000,
      });
    }

    logAudit('UPDATE', 'WorkOrder', id, wo.workOrderNumber, `Status updated from ${wo.status} to ${status}`);
  };

  // Add Oil Change
  const addOilChange = (oilData: Omit<OilChange, 'id' | 'status'>): OilChange => {
    const vehicle = vehicles.find(v => v.id === oilData.vehicleId);
    const intervalKm = vehicle?.oilConfig.intervalKm || 10000;
    const nextMileage = oilData.odometer + intervalKm;

    // Calculate status
    let status: OilChange['status'] = 'Normal';
    const currentMileage = vehicle?.currentMileage || oilData.odometer;
    if (currentMileage >= nextMileage) {
      status = 'Overdue';
    } else if (nextMileage - currentMileage <= 1000) {
      status = 'Due Soon';
    }

    const newId = `oil-${uid()}`;
    const newOilChange: OilChange = {
      ...oilData,
      id: newId,
      nextOilChangeMileage: nextMileage,
      status,
    };

    setOilChanges(prev => [newOilChange, ...prev]);

    // Update vehicle mileage if higher
    if (vehicle && oilData.odometer > vehicle.currentMileage) {
      setVehicles(prev =>
        prev.map(v => (v.id === vehicle.id ? { ...v, currentMileage: oilData.odometer, updatedAt: new Date().toISOString() } : v))
      );
    }

    // Add Timeline
    const newTimeline: TimelineEvent = {
      id: `tl-${uid()}`,
      vehicleId: oilData.vehicleId,
      date: oilData.date,
      title: `Oil Change: ${oilData.oilBrand} ${oilData.oilGrade}`,
      description: `Replaced ${oilData.quantityLitres}L engine oil and filter at ${oilData.odometer.toLocaleString()} KM. Next due at ${nextMileage.toLocaleString()} KM.`,
      amount: oilData.totalCost,
      currency: 'OMR',
      category: 'Oil',
      icon: 'Droplet',
      color: 'amber',
    };
    setTimeline(prev => [newTimeline, ...prev]);

    logAudit('CREATE', 'OilChange', newId, `Oil Service (${vehicle?.plateNumber})`, `Performed oil change for ${oilData.totalCost.toFixed(3)} OMR`);

    return newOilChange;
  };

  // Add Tyre
  const addTyre = (tyreData: Omit<Tyre, 'id'>): Tyre => {
    const newId = `tyr-${uid()}`;
    const newTyre: Tyre = { ...tyreData, id: newId };
    setTyres(prev => [newTyre, ...prev]);
    return newTyre;
  };

  // Update Tyre
  const updateTyre = (id: string, tyreUpdates: Partial<Tyre>) => {
    setTyres(prev => prev.map(t => (t.id === id ? { ...t, ...tyreUpdates } : t)));
  };

  // Add Tyre Event
  const addTyreEvent = (eventData: Omit<TyreEvent, 'id'>): TyreEvent => {
    const newId = `te-${uid()}`;
    const newEvent: TyreEvent = { ...eventData, id: newId };
    setTyreEvents(prev => [newEvent, ...prev]);

    const vehicle = vehicles.find(v => v.id === eventData.vehicleId);
    const newTimeline: TimelineEvent = {
      id: `tl-${uid()}`,
      vehicleId: eventData.vehicleId,
      date: eventData.date,
      title: `Tyre Event: ${eventData.eventType}`,
      description: `${eventData.eventType} performed on positions: ${eventData.tyrePositionsAffected.join(', ')}.`,
      amount: eventData.cost,
      currency: 'OMR',
      category: 'Tyre',
      icon: 'Disc',
      color: 'amber',
    };
    setTimeline(prev => [newTimeline, ...prev]);

    logAudit('CREATE', 'Tyre', newId, `Tyre Event (${vehicle?.plateNumber})`, `${eventData.eventType} cost ${eventData.cost.toFixed(3)} OMR`);

    return newEvent;
  };

  // Add Accident
  const addAccident = (accidentData: Omit<Accident, 'id' | 'accidentNumber' | 'createdAt' | 'netAccidentCostToCompany'>): Accident => {
    const newId = `acc-${uid()}`;
    const accidentNumber = `ACC-2026-${String(nextSeq(accidents as any[], 'accidentNumber', 1)).padStart(3, '0')}`;
    const netCost = Math.max(0, accidentData.actualRepairCost - accidentData.insuranceContribution - accidentData.thirdPartyContribution);

    const newAccident: Accident = {
      ...accidentData,
      id: newId,
      accidentNumber,
      netAccidentCostToCompany: netCost,
      createdAt: new Date().toISOString(),
    };

    setAccidents(prev => [newAccident, ...prev]);

    // Update vehicle status
    if (newAccident.status !== 'Closed' && newAccident.status !== 'Completed') {
      setVehicles(prev =>
        prev.map(v => (v.id === newAccident.vehicleId ? { ...v, status: 'Accident', updatedAt: new Date().toISOString() } : v))
      );
    }

    // Timeline event
    const newTimeline: TimelineEvent = {
      id: `tl-${uid()}`,
      vehicleId: newAccident.vehicleId,
      date: newAccident.accidentDate,
      title: `Accident Reported: ${newAccident.accidentType}`,
      description: `${newAccident.damageDescription} | Police Report: ${newAccident.policeReportNumber}`,
      amount: newAccident.actualRepairCost,
      currency: 'OMR',
      category: 'Accident',
      icon: 'AlertTriangle',
      color: 'rose',
    };
    setTimeline(prev => [newTimeline, ...prev]);

    logAudit('CREATE', 'Accident', newId, `${accidentNumber} (${newAccident.vehiclePlate})`, `Reported accident with net company cost ${netCost.toFixed(3)} OMR`);

    return newAccident;
  };

  // Update Accident
  const updateAccident = (id: string, updates: Partial<Accident>) => {
    setAccidents(prev =>
      prev.map(acc => {
        if (acc.id === id) {
          const updated = { ...acc, ...updates };
          updated.netAccidentCostToCompany = Math.max(
            0,
            (updated.actualRepairCost || 0) - (updated.insuranceContribution || 0) - (updated.thirdPartyContribution || 0)
          );
          
          if (updated.status === 'Closed' || updated.status === 'Completed') {
            setVehicles(vPrev =>
              vPrev.map(v => (v.id === updated.vehicleId && v.status === 'Accident' ? { ...v, status: 'Active', updatedAt: new Date().toISOString() } : v))
            );
          }

          logAudit('UPDATE', 'Accident', id, acc.accidentNumber, `Updated accident details.`);
          return updated;
        }
        return acc;
      })
    );
  };

  // Add Expense
  const addExpense = (expenseData: Omit<VehicleExpense, 'id' | 'expenseNumber' | 'createdAt'>): VehicleExpense => {
    const newId = `exp-${uid()}`;
    const expenseNumber = `EXP-2026-${String(nextSeq(expenses as any[], 'expenseNumber', 1)).padStart(4, '0')}`;
    const newExpense: VehicleExpense = {
      ...expenseData,
      id: newId,
      expenseNumber,
      createdAt: new Date().toISOString(),
    };

    setExpenses(prev => [newExpense, ...prev]);

    // Add Timeline
    const newTimeline: TimelineEvent = {
      id: `tl-${uid()}`,
      vehicleId: newExpense.vehicleId,
      date: newExpense.date,
      title: `${newExpense.category} Expense: ${newExpense.description}`,
      description: `Payment via ${newExpense.paymentMethod}. Cost Centre: ${newExpense.costCentre}`,
      amount: newExpense.total,
      currency: 'OMR',
      category: 'Expense',
      icon: 'Receipt',
      color: 'teal',
    };
    setTimeline(prev => [newTimeline, ...prev]);

    logAudit('CREATE', 'Expense', newId, `${expenseNumber} (${newExpense.vehiclePlate})`, `Recorded ${newExpense.category} expense of ${newExpense.total.toFixed(3)} OMR`);

    return newExpense;
  };

  // Add Supplier
  const addSupplier = (supplierData: Omit<Supplier, 'id' | 'supplierId' | 'currentBalance' | 'totalPurchases' | 'totalInvoicesCount' | 'amountPaid' | 'creditNotesAmount' | 'createdAt'>): Supplier => {
    const newId = `sup-${uid()}`;
    const supplierId = `SUP-${String(nextSeq(suppliers as any[], 'supplierId', 1)).padStart(3, '0')}`;
    const newSupplier: Supplier = {
      ...supplierData,
      id: newId,
      supplierId,
      currentBalance: supplierData.openingBalance || 0,
      totalPurchases: 0,
      totalInvoicesCount: 0,
      amountPaid: 0,
      creditNotesAmount: 0,
      createdAt: new Date().toISOString(),
    };

    setSuppliers(prev => [newSupplier, ...prev]);
    logAudit('CREATE', 'Company', newId, newSupplier.name, `Added supplier ${newSupplier.supplierId}`);
    return newSupplier;
  };

  // Update Supplier
  const updateSupplier = (id: string, updates: Partial<Supplier>) => {
    setSuppliers(prev => prev.map(s => (s.id === id ? { ...s, ...updates } : s)));
  };

  // Add Customer
  const addCustomer = (customerData: Omit<Customer, 'id' | 'customerId' | 'currentBalance' | 'totalSales' | 'totalInvoicesCount' | 'amountReceived' | 'createdAt'>): Customer => {
    const newId = `cust-${uid()}`;
    const customerId = `CUST-${String(nextSeq(customers as any[], 'customerId', 1)).padStart(3, '0')}`;
    const newCustomer: Customer = {
      ...customerData,
      id: newId,
      customerId,
      currentBalance: customerData.openingBalance || 0,
      totalSales: 0,
      totalInvoicesCount: 0,
      amountReceived: 0,
      createdAt: new Date().toISOString(),
    };

    setCustomers(prev => [newCustomer, ...prev]);
    logAudit('CREATE', 'Company', newId, newCustomer.name, `Added customer ${newCustomer.customerId}`);
    return newCustomer;
  };

  // Update Customer
  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    setCustomers(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));
  };

  // Add Invoice
  const addInvoice = (invoiceData: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt' | 'amountPaid' | 'outstandingAmount'>): Invoice => {
    const newId = `inv-${uid()}`;
    const prefix = invoiceData.invoiceType === 'Purchase' ? 'PINV-2026' : 'SINV-2026';
    const invoiceNumber = `${prefix}-${String(nextSeq(invoices as any[], 'invoiceNumber', 1)).padStart(4, '0')}`;

    const newInvoice: Invoice = {
      ...invoiceData,
      id: newId,
      invoiceNumber,
      amountPaid: 0,
      outstandingAmount: invoiceData.grandTotal,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setInvoices(prev => [newInvoice, ...prev]);

    // Update balances
    if (newInvoice.invoiceType === 'Purchase' && newInvoice.partyId) {
      setSuppliers(prev =>
        prev.map(s =>
          s.id === newInvoice.partyId
            ? {
                ...s,
                currentBalance: roundToPrecision(s.currentBalance + newInvoice.grandTotal, 3),
                totalPurchases: roundToPrecision(s.totalPurchases + newInvoice.grandTotal, 3),
                totalInvoicesCount: s.totalInvoicesCount + 1,
              }
            : s
        )
      );
    } else if (newInvoice.invoiceType === 'Sales' && newInvoice.partyId) {
      setCustomers(prev =>
        prev.map(c =>
          c.id === newInvoice.partyId
            ? {
                ...c,
                currentBalance: roundToPrecision(c.currentBalance + newInvoice.grandTotal, 3),
                totalSales: roundToPrecision(c.totalSales + newInvoice.grandTotal, 3),
                totalInvoicesCount: c.totalInvoicesCount + 1,
              }
            : c
        )
      );
    }

    logAudit('CREATE', 'Invoice', newId, invoiceNumber, `Created ${newInvoice.invoiceType} invoice for ${newInvoice.grandTotal.toFixed(3)} OMR`);

    return newInvoice;
  };

  // Update Invoice
  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    setInvoices(prev => prev.map(inv => (inv.id === id ? { ...inv, ...updates, updatedAt: new Date().toISOString() } : inv)));
  };

  // Duplicate Invoice
  const duplicateInvoice = (id: string): Invoice => {
    const original = invoices.find(inv => inv.id === id);
    if (!original) throw new Error('Invoice not found');

    const newId = `inv-${uid()}`;
    const prefix = original.invoiceType === 'Purchase' ? 'PINV-2026' : 'SINV-2026';
    const invoiceNumber = `${prefix}-${String(nextSeq(invoices as any[], 'invoiceNumber', 1)).padStart(4, '0')}`;

    const cloned: Invoice = {
      ...original,
      id: newId,
      invoiceNumber,
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      amountPaid: 0,
      outstandingAmount: original.grandTotal,
      paymentStatus: 'Unpaid',
      approvalStatus: 'Draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setInvoices(prev => [cloned, ...prev]);
    logAudit('CREATE', 'Invoice', newId, invoiceNumber, `Cloned from ${original.invoiceNumber}`);
    return cloned;
  };

  // Create Credit Note
  const createCreditNote = (invoiceId: string, reason: string): Invoice => {
    const original = invoices.find(inv => inv.id === invoiceId);
    if (!original) throw new Error('Invoice not found');

    const newId = `inv-cn-${uid()}`;
    const invoiceNumber = `CN-${original.invoiceNumber}`;

    const creditNote: Invoice = {
      ...original,
      id: newId,
      invoiceNumber,
      isCreditNote: true,
      parentInvoiceId: invoiceId,
      invoiceDate: new Date().toISOString().slice(0, 10),
      grandTotal: -original.grandTotal,
      subtotal: -original.subtotal,
      taxTotal: -original.taxTotal,
      amountPaid: 0,
      outstandingAmount: 0,
      paymentStatus: 'Paid',
      approvalStatus: 'Approved',
      notes: `Credit Note against ${original.invoiceNumber}. Reason: ${reason}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setInvoices(prev => [creditNote, ...prev]);
    logAudit('CREATE', 'Invoice', newId, invoiceNumber, `Issued credit note for ${original.invoiceNumber}`);
    return creditNote;
  };

  // Add Payment
  const addPayment = (paymentData: Omit<Payment, 'id' | 'paymentNumber' | 'createdAt'>): Payment => {
    const targetInvoice = invoices.find(i => i.id === paymentData.invoiceId);
    if (!targetInvoice) throw new Error('Invoice not found');
    if (!(paymentData.amount > 0) || paymentData.amount > targetInvoice.outstandingAmount + 0.0005) {
      throw new Error(`Payment amount must be between 0 and outstanding ${targetInvoice.outstandingAmount.toFixed(3)}`);
    }
    const newId = `pay-${uid()}`;
    const paymentNumber = `PAY-2026-${String(nextSeq(payments as any[], 'paymentNumber', 1)).padStart(4, '0')}`;
    const newPayment: Payment = {
      ...paymentData,
      id: newId,
      paymentNumber,
      createdAt: new Date().toISOString(),
    };

    setPayments(prev => [newPayment, ...prev]);

    // Update target invoice
    setInvoices(prev =>
      prev.map(inv => {
        if (inv.id === newPayment.invoiceId) {
          const newPaid = roundToPrecision(inv.amountPaid + newPayment.amount, 3);
          const newOutstanding = Math.max(0, roundToPrecision(inv.grandTotal - newPaid, 3));
          const newStatus: Invoice['paymentStatus'] = newOutstanding <= 0 ? 'Paid' : 'Partially Paid';
          return {
            ...inv,
            amountPaid: newPaid,
            outstandingAmount: newOutstanding,
            paymentStatus: newStatus,
            updatedAt: new Date().toISOString(),
          };
        }
        return inv;
      })
    );

    // Update Bank Account balance
    setBankAccounts(prev =>
      prev.map(ba => {
        if (ba.id === newPayment.bankAccountId) {
          const delta = newPayment.invoiceType === 'Purchase' ? -newPayment.amount : newPayment.amount;
          return { ...ba, currentBalance: roundToPrecision(ba.currentBalance + delta, 3) };
        }
        return ba;
      })
    );

    // Update Supplier/Customer balances
    if (newPayment.partyType === 'Supplier') {
      setSuppliers(prev =>
        prev.map(s =>
          s.id === newPayment.partyId
            ? {
                ...s,
                currentBalance: Math.max(0, roundToPrecision(s.currentBalance - newPayment.amount, 3)),
                amountPaid: roundToPrecision(s.amountPaid + newPayment.amount, 3),
              }
            : s
        )
      );
    } else {
      setCustomers(prev =>
        prev.map(c =>
          c.id === newPayment.partyId
            ? {
                ...c,
                currentBalance: Math.max(0, roundToPrecision(c.currentBalance - newPayment.amount, 3)),
                amountReceived: roundToPrecision(c.amountReceived + newPayment.amount, 3),
              }
            : c
        )
      );
    }

    logAudit('PAYMENT', 'Payment', newId, paymentNumber, `Recorded ${newPayment.currency} ${newPayment.amount.toFixed(3)} payment against ${newPayment.invoiceNumber}`);

    return newPayment;
  };

  // Add Reconciliation
  const addReconciliation = (recData: Omit<InvoiceReconciliation, 'id' | 'reconciliationNumber' | 'createdAt' | 'differenceAmount' | 'variancePercentage'>): InvoiceReconciliation => {
    const newId = `rec-${uid()}`;
    const reconciliationNumber = `REC-2026-${String(nextSeq(reconciliations as any[], 'reconciliationNumber', 1)).padStart(3, '0')}`;
    const expected = recData.matchingType === '3-Way' ? (recData.goodsServiceReceivedAmount || recData.workOrderAmount || recData.invoiceAmount) : (recData.purchaseOrderAmount || recData.invoiceAmount);
    const diff = roundToPrecision(recData.invoiceAmount - expected, 3);
    const variance = expected > 0 ? roundToPrecision((Math.abs(diff) / expected) * 100, 2) : 0;

    const newRec: InvoiceReconciliation = {
      ...recData,
      id: newId,
      reconciliationNumber,
      differenceAmount: diff,
      variancePercentage: variance,
      status: Math.abs(diff) === 0 ? 'Matched' : variance <= 5 ? 'Partially Matched' : 'Mismatch',
      createdAt: new Date().toISOString(),
    };

    setReconciliations(prev => [newRec, ...prev]);
    logAudit('RECONCILE', 'Invoice', newId, reconciliationNumber, `Reconciled invoice ${recData.invoiceNumber} with status ${newRec.status}`);
    return newRec;
  };

  // Add Journal Entry
  const addJournalEntry = (entryData: Omit<JournalEntry, 'id' | 'entryNumber' | 'createdAt'>): JournalEntry => {
    const totalDr = roundToPrecision(entryData.lines.reduce((sum, l) => sum + (l.debit || 0), 0), 3);
    const totalCr = roundToPrecision(entryData.lines.reduce((sum, l) => sum + (l.credit || 0), 0), 3);
    if (totalDr !== totalCr || totalDr === 0) throw new Error(`Unbalanced journal entry: Dr ${totalDr} / Cr ${totalCr}`);
    const newId = `je-${uid()}`;
    const entryNumber = `JE-${new Date().getFullYear()}-${String(nextSeq(journalEntries as any[], 'entryNumber', 1)).padStart(4, '0')}`;
    const newEntry: JournalEntry = {
      ...entryData,
      id: newId,
      entryNumber,
      createdAt: new Date().toISOString(),
    };

    setJournalEntries(prev => [newEntry, ...prev]);

    // Update Chart of Accounts balances if Posted
    if (newEntry.status === 'Posted') {
      setChartOfAccounts(prev =>
        prev.map(acc => {
          let delta = 0;
          newEntry.lines.forEach(line => {
            if (line.accountCode === acc.code) {
              if (acc.category === 'Asset' || acc.category === 'Expense') {
                delta += (line.debit - line.credit);
              } else {
                delta += (line.credit - line.debit);
              }
            }
          });
          return { ...acc, balance: roundToPrecision(acc.balance + delta, 3) };
        })
      );
    }

    logAudit('CREATE', 'Accounting', newId, entryNumber, `Posted journal entry with total ${newEntry.totalDebit.toFixed(3)} OMR`);
    return newEntry;
  };

  // Add Document
  const addDocument = (docData: Omit<DocumentItem, 'id' | 'uploadedAt'>): DocumentItem => {
    const newId = `doc-${uid()}`;
    const isExpiring = docData.expiryDate ? isDateExpiringSoon(docData.expiryDate, 30) : false;
    const isExp = docData.expiryDate ? isDateOverdue(docData.expiryDate) : false;

    const newDoc: DocumentItem = {
      ...docData,
      id: newId,
      isExpiringSoon: isExpiring,
      isExpired: isExp,
      uploadedAt: new Date().toISOString(),
    };

    setDocuments(prev => [newDoc, ...prev]);
    logAudit('CREATE', 'Document', newId, docData.documentName, `Uploaded document to repository`);
    return newDoc;
  };

  // Delete Document
  const deleteDocument = (id: string) => {
    const target = documents.find(d => d.id === id);
    setDocuments(prev => prev.filter(d => d.id !== id));
    if (target) logAudit('DELETE', 'Document' as any, id, (target as any).documentName || id, 'Document removed from registry.');
  };

  // Notification actions
  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  // Process Approval Request
  const processApproval = (requestId: string, action: 'Approved' | 'Rejected', comment?: string, approverUser?: User) => {
    setApprovalRequests(prev =>
      prev.map(req => {
        if (req.id === requestId) {
          const isFinal = action === 'Rejected' || req.currentLevel >= req.totalLevels;
          const nextStatus = action === 'Rejected' ? 'Rejected' : isFinal ? 'Approved' : 'Pending';

          const newHistory = [
            ...req.history,
            {
              level: req.currentLevel,
              approverId: approverUser?.id || 'usr-1',
              approverName: approverUser?.name || 'Ahmed Al-Harthy',
              approverRole: approverUser?.role || 'Super Admin',
              action,
              comment: comment || (action === 'Approved' ? 'Approved as per operational guidelines' : 'Rejected'),
              date: new Date().toISOString(),
            },
          ];

          // If linked to Work Order or Invoice, update target entity approvalStatus
          if (req.referenceType === 'WorkOrder' && isFinal) {
            setWorkOrders(wPrev =>
              wPrev.map(wo => (wo.id === req.referenceId ? { ...wo, approvalStatus: nextStatus, status: nextStatus === 'Approved' ? 'Approved' : 'Cancelled' } : wo))
            );
          } else if (req.referenceType === 'Invoice' && isFinal) {
            setInvoices(iPrev =>
              iPrev.map(inv =>
                inv.id === req.referenceId
                  ? {
                      ...inv,
                      approvalStatus: nextStatus === 'Approved' ? 'Approved' : 'Rejected',
                      approvalDate: nextStatus === 'Approved' ? new Date().toISOString() : undefined,
                      updatedAt: new Date().toISOString(),
                    }
                  : inv
              )
            );
          }

          logAudit('APPROVE', (req.referenceType === 'Invoice' ? 'Invoice' : 'WorkOrder') as any, requestId, req.referenceNumber, `${action} approval level ${req.currentLevel}/${req.totalLevels}`);

          return {
            ...req,
            status: nextStatus,
            currentLevel: action === 'Approved' && !isFinal ? req.currentLevel + 1 : req.currentLevel,
            history: newHistory,
          };
        }
        return req;
      })
    );
  };

  // Fixed Asset Actions
  const addFixedAsset = (assetData: Omit<FixedAsset, 'id' | 'assetCode' | 'createdAt' | 'updatedAt'>): FixedAsset => {
    const newId = `ast-${uid()}`;
    const prefix = assetData.category === 'Fleet Vehicle' ? 'AST-VEH' : assetData.category === 'Workshop Equipment' ? 'AST-EQP' : 'AST-GEN';
    const assetCode = `${prefix}-${String(nextSeq(fixedAssets as any[], 'assetCode', 1)).padStart(3, '0')}`;
    const newAsset: FixedAsset = {
      ...assetData,
      id: newId,
      assetCode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setFixedAssets(prev => [newAsset, ...prev]);
    logAudit('CREATE', 'Vehicle' as any, newId, assetCode, `Added fixed asset: ${newAsset.name} (${newAsset.purchaseCost.toFixed(3)} OMR)`);
    return newAsset;
  };

  const updateFixedAsset = (id: string, assetData: Partial<FixedAsset>) => {
    setFixedAssets(prev =>
      prev.map(a => (a.id === id ? { ...a, ...assetData, updatedAt: new Date().toISOString() } : a))
    );
    logAudit('UPDATE', 'Vehicle' as any, id, assetData.name || id, `Updated fixed asset parameters`);
  };

  const deleteFixedAsset = (id: string) => {
    setFixedAssets(prev => prev.filter(a => a.id !== id));
    logAudit('DELETE', 'Vehicle' as any, id, id, `Removed fixed asset from registry`);
  };

  // Run Automatic Depreciation Engine
  const runAutoDepreciation = (params?: {
    periodLabel?: string;
    runDate?: string;
    notes?: string;
    processedBy?: string;
    autoPostGL?: boolean;
  }): DepreciationRun => {
    const periodLabel = params?.periodLabel || 'August 2026';
    if (depreciationRuns.some(r => r.periodLabel === periodLabel)) throw new Error(`Depreciation already run for ${periodLabel}.`);
    const runDate = params?.runDate || new Date().toISOString().slice(0, 10);
    const processedBy = params?.processedBy || 'Fatima Al-Lawati';
    const notes = params?.notes || `Monthly automatic fixed asset depreciation amortization for ${periodLabel}.`;
    const autoPostGL = params?.autoPostGL ?? true;

    const newBatchId = `dep-run-${uid()}`;
    const batchNumber = `DEP-2026-${String(nextSeq(depreciationRuns as any[], 'batchNumber', 1)).padStart(2, '0')}`;
    
    let totalDepr = 0;
    const breakdown: DepreciationRun['breakdown'] = [];

    const updatedAssets = fixedAssets.map(asset => {
      if (asset.status !== 'Active') return asset;
      
      let periodDepr = 0;
      if (asset.depreciationMethod === 'Straight-Line') {
        const depreciableAmount = Math.max(0, asset.purchaseCost - asset.salvageValue);
        const annualDepr = (depreciableAmount * (asset.annualRatePercentage || 20)) / 100;
        periodDepr = roundToPrecision(annualDepr / 12, 3);
      } else {
        // Reducing balance / Written Down Value
        const annualDepr = (asset.currentBookValue * (asset.annualRatePercentage || 25)) / 100;
        periodDepr = roundToPrecision(annualDepr / 12, 3);
      }

      // Cap depreciation at salvage value
      const maxDeprPossible = Math.max(0, asset.currentBookValue - asset.salvageValue);
      periodDepr = Math.min(periodDepr, maxDeprPossible);

      const prevBookValue = asset.currentBookValue;
      const newBookValue = roundToPrecision(Math.max(asset.salvageValue, asset.currentBookValue - periodDepr), 3);
      const newAccDep = roundToPrecision(asset.accumulatedDepreciation + periodDepr, 3);

      totalDepr += periodDepr;
      breakdown.push({
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        category: asset.category,
        previousBookValue: prevBookValue,
        depreciationAmount: periodDepr,
        newBookValue,
      });

      return {
        ...asset,
        accumulatedDepreciation: newAccDep,
        currentBookValue: newBookValue,
        status: newBookValue <= asset.salvageValue ? ('Fully Depreciated' as const) : asset.status,
        updatedAt: new Date().toISOString(),
      };
    });

    setFixedAssets(updatedAssets);

    // Auto-post Balanced Journal Entry to GL
    let linkedJeId: string | undefined;
    let linkedJeNum: string | undefined;
    if (autoPostGL && totalDepr > 0) {
      const je = addJournalEntry({
        companyId: selectedCompanyId && selectedCompanyId !== 'all' ? selectedCompanyId : 'comp-1',
        date: runDate,
        reference: batchNumber,
        description: `Auto-Depreciation run for ${periodLabel} across ${breakdown.length} fixed assets`,
        lines: [
          {
            id: `jl-${uid()}-dep-dr`,
            accountCode: '5080',
            accountName: 'Depreciation Expense - Motor Vehicles & Fixed Assets',
            debit: roundToPrecision(totalDepr, 3),
            credit: 0,
            description: `Period Asset Amortization (${periodLabel})`,
          },
          {
            id: `jl-${uid()}-dep-cr`,
            accountCode: '1520',
            accountName: 'Accumulated Depreciation - Motor Vehicles',
            debit: 0,
            credit: roundToPrecision(totalDepr, 3),
            description: `Accumulated Depreciation (${periodLabel})`,
          },
        ],
        totalDebit: roundToPrecision(totalDepr, 3),
        totalCredit: roundToPrecision(totalDepr, 3),
        postedBy: 'System Auto-Depreciation',
        status: 'Posted',
        sourceModule: 'Depreciation',
      });
      linkedJeId = je.id;
      linkedJeNum = je.entryNumber;
    }

    const newRun: DepreciationRun = {
      id: newBatchId,
      batchNumber,
      companyId: selectedCompanyId && selectedCompanyId !== 'all' ? selectedCompanyId : 'comp-1',
      periodLabel,
      runDate,
      totalAssetsProcessed: breakdown.length,
      totalDepreciationAmount: roundToPrecision(totalDepr, 3),
      currency,
      journalEntryId: linkedJeId,
      journalEntryNumber: linkedJeNum,
      status: 'Posted',
      processedBy,
      notes,
      breakdown,
      createdAt: new Date().toISOString(),
    };

    setDepreciationRuns(prev => [newRun, ...prev]);
    logAudit('CREATE', 'Depreciation' as any, newBatchId, batchNumber, `Executed automatic depreciation for ${periodLabel} totaling ${totalDepr.toFixed(3)} ${currency}`);

    return newRun;
  };

  // Employee Actions
  const addEmployee = (empData: Omit<Employee, 'id' | 'employeeCode' | 'createdAt'>): Employee => {
    const newId = `emp-${uid()}`;
    const employeeCode = `EMP-${String(nextSeq(employees as any[], 'employeeCode', 1001)).padStart(4, '0')}`;
    const gross = empData.basicSalary + empData.housingAllowance + empData.transportAllowance + empData.otherAllowances;
    const newEmp: Employee = {
      ...empData,
      id: newId,
      employeeCode,
      totalGrossSalary: roundToPrecision(gross, 3),
      createdAt: new Date().toISOString(),
    };
    setEmployees(prev => [newEmp, ...prev]);
    logAudit('CREATE', 'User', newId, newEmp.name, `Registered new employee: ${newEmp.name} (${newEmp.designation})`);
    return newEmp;
  };

  const updateEmployee = (id: string, empData: Partial<Employee>) => {
    setEmployees(prev =>
      prev.map(e => {
        if (e.id === id) {
          const basic = empData.basicSalary !== undefined ? empData.basicSalary : e.basicSalary;
          const housing = empData.housingAllowance !== undefined ? empData.housingAllowance : e.housingAllowance;
          const transport = empData.transportAllowance !== undefined ? empData.transportAllowance : e.transportAllowance;
          const other = empData.otherAllowances !== undefined ? empData.otherAllowances : e.otherAllowances;
          const gross = basic + housing + transport + other;
          return { ...e, ...empData, totalGrossSalary: roundToPrecision(gross, 3) };
        }
        return e;
      })
    );
    logAudit('UPDATE', 'User', id, empData.name || id, `Updated employee profile & compensation`);
  };

  const deleteEmployee = (id: string) => {
    setEmployees(prev => prev.filter(e => e.id !== id));
    logAudit('DELETE', 'User', id, id, `Removed employee record`);
  };

  // HR Payroll Processing & GL Journal Posting
  const processPayrollRun = (params: {
    month: number;
    year: number;
    paymentDate?: string;
    bankAccountId?: string;
    autoPostGL?: boolean;
  }): PayrollRun => {
    const { month, year, paymentDate = new Date().toISOString().slice(0, 10), bankAccountId = 'ba-1', autoPostGL = true } = params;
    if (payrollRuns.some(r => r.month === month && r.year === year)) throw new Error(`Payroll already processed for ${month}/${year}.`);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const periodLabel = `${monthNames[month - 1]} ${year}`;
    const newRunId = `pr-${year}-${String(month).padStart(2, '0')}-${uid()}`;
    const payrollNumber = `PAYROLL-${year}-${String(month).padStart(2, '0')}`;

    const activeEmployees = employees.filter(e => e.status === 'Active');
    
    let totalBasic = 0;
    let totalAllow = 0;
    let totalGross = 0;
    let totalPasi = 0;
    let totalNet = 0;

    const lines: PayrollLineItem[] = activeEmployees.map(emp => {
      const basic = emp.basicSalary;
      const allowances = emp.housingAllowance + emp.transportAllowance + emp.otherAllowances;
      const gross = emp.totalGrossSalary;
      const pasi = emp.pasiContributionPercentage > 0 ? roundToPrecision((basic * emp.pasiContributionPercentage) / 100, 3) : 0;
      const net = roundToPrecision(gross - pasi, 3);

      totalBasic += basic;
      totalAllow += allowances;
      totalGross += gross;
      totalPasi += pasi;
      totalNet += net;

      return {
        id: `pli-${uid()}-${emp.id}`,
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        designation: emp.designation,
        department: emp.department,
        basicSalary: basic,
        housingAllowance: emp.housingAllowance,
        transportAllowance: emp.transportAllowance,
        otherAllowances: emp.otherAllowances,
        overtimeAmount: 0,
        bonusAmount: 0,
        grossPay: gross,
        pasiEmployeeDeduction: pasi,
        unpaidLeaveDeduction: 0,
        loanAdvanceDeduction: 0,
        otherDeductions: 0,
        totalDeductions: pasi,
        netPay: net,
        paymentMethod: emp.paymentMethod || 'Bank Transfer',
        bankName: emp.bankName,
        iban: emp.iban,
        status: 'Paid',
      };
    });

    // Auto-post double-entry journal entry to GL
    let linkedJeId: string | undefined;
    if (autoPostGL && totalGross > 0) {
      const bank = bankAccounts.find(b => b.id === bankAccountId) || bankAccounts[0];
      const je = addJournalEntry({
        companyId: selectedCompanyId && selectedCompanyId !== 'all' ? selectedCompanyId : 'comp-1',
        date: paymentDate,
        reference: payrollNumber,
        description: `WPS Salary Disbursal & Payroll for ${periodLabel} (${activeEmployees.length} Staff & Drivers)`,
        lines: [
          {
            id: `jl-${uid()}-sal-dr`,
            accountCode: '5070',
            accountName: 'Driver Allowances & Logistics Staff Salaries',
            debit: roundToPrecision(totalGross, 3),
            credit: 0,
            description: `Gross Payroll for ${periodLabel}`,
          },
          {
            id: `jl-${uid()}-bank-cr`,
            accountCode: '1020',
            accountName: bank ? `Bank - ${bank.bankName}` : 'Bank - Bank Muscat Corporate',
            debit: 0,
            credit: roundToPrecision(totalNet, 3),
            description: `Net Salary Direct Transfer to Employee Accounts`,
          },
          ...(totalPasi > 0
            ? [
                {
                  id: `jl-${uid()}-pasi-cr`,
                  accountCode: '2030',
                  accountName: 'Accrued Operational Expenses (PASI / Social Insurance Payable)',
                  debit: 0,
                  credit: roundToPrecision(totalPasi, 3),
                  description: `Statutory PASI Employee Contribution (7%)`,
                },
              ]
            : []),
        ],
        totalDebit: roundToPrecision(totalGross, 3),
        totalCredit: roundToPrecision(totalGross, 3),
        postedBy: 'Fatima Al-Lawati',
        status: 'Posted',
        sourceModule: 'Payroll',
      });
      linkedJeId = je.id;
    }

    const newPayroll: PayrollRun = {
      id: newRunId,
      payrollNumber,
      companyId: selectedCompanyId && selectedCompanyId !== 'all' ? selectedCompanyId : 'comp-1',
      companyName: companies.find(c => c.id === (selectedCompanyId && selectedCompanyId !== 'all' ? selectedCompanyId : 'comp-1'))?.name || 'Al Hakim National LLC',
      month,
      year,
      periodLabel,
      totalEmployees: activeEmployees.length,
      totalBasicSalary: roundToPrecision(totalBasic, 3),
      totalAllowances: roundToPrecision(totalAllow, 3),
      totalGrossPay: roundToPrecision(totalGross, 3),
      totalPasiDeduction: roundToPrecision(totalPasi, 3),
      totalOtherDeductions: 0,
      totalDeductions: roundToPrecision(totalPasi, 3),
      totalNetPayout: roundToPrecision(totalNet, 3),
      items: lines,
      status: 'Paid',
      approvedBy: 'Ahmed Al-Harthy',
      approvedDate: paymentDate,
      processedDate: paymentDate,
      paymentDate,
      bankAccountId,
      bankAccountName: 'Bank Muscat Corporate Main (OMR)',
      journalEntryId: linkedJeId,
      notes: `WPS Electronic Payroll settlement processed for ${periodLabel}.`,
      createdAt: new Date().toISOString(),
    };

    setPayrollRuns(prev => [newPayroll, ...prev]);
    logAudit('PAYMENT', 'Payment' as any, newRunId, payrollNumber, `Processed monthly payroll for ${periodLabel} with net payout of ${totalNet.toFixed(3)} ${currency}`);

    return newPayroll;
  };

  // Trial Balance Generation
  const getTrialBalance = (asOfDate?: string, companyId?: string) => {
    const targetCompanyId = companyId || selectedCompanyId;
    const rows: TrialBalanceRow[] = chartOfAccounts.map(account => {
      let periodDebit = 0;
      let periodCredit = 0;

      journalEntries.forEach(je => {
        if (je.status !== 'Posted') return;
        if (asOfDate && je.date > asOfDate) return;
        if (targetCompanyId && targetCompanyId !== 'all' && je.companyId !== targetCompanyId) return;

        je.lines.forEach(line => {
          if (line.accountCode === account.code) {
            periodDebit += line.debit;
            periodCredit += line.credit;
          }
        });
      });

      const isDebitNormal = account.category === 'Asset' || account.category === 'Expense';
      // Account.balance is the authoritative closing balance. Derive the
      // opening position by reversing posted period movement so journals are
      // never counted twice in the statement.
      const closingSignedDebit = isDebitNormal ? account.balance : -account.balance;
      const periodSignedDebit = periodDebit - periodCredit;
      const openingSignedDebit = closingSignedDebit - periodSignedDebit;
      const openingDebit = Math.max(openingSignedDebit, 0);
      const openingCredit = Math.max(-openingSignedDebit, 0);
      const closingDebit = Math.max(closingSignedDebit, 0);
      const closingCredit = Math.max(-closingSignedDebit, 0);

      return {
        accountCode: account.code,
        accountName: account.name,
        category: account.category,
        subcategory: account.subcategory,
        openingDebit: roundToPrecision(openingDebit, 3),
        openingCredit: roundToPrecision(openingCredit, 3),
        periodDebit: roundToPrecision(periodDebit, 3),
        periodCredit: roundToPrecision(periodCredit, 3),
        closingDebit: roundToPrecision(closingDebit, 3),
        closingCredit: roundToPrecision(closingCredit, 3),
        netBalance: roundToPrecision(closingDebit - closingCredit, 3),
      };
    });

    const totalOpeningDebit = rows.reduce((s, r) => s + r.openingDebit, 0);
    const totalOpeningCredit = rows.reduce((s, r) => s + r.openingCredit, 0);
    const totalPeriodDebit = rows.reduce((s, r) => s + r.periodDebit, 0);
    const totalPeriodCredit = rows.reduce((s, r) => s + r.periodCredit, 0);
    const totalClosingDebit = rows.reduce((s, r) => s + r.closingDebit, 0);
    const totalClosingCredit = rows.reduce((s, r) => s + r.closingCredit, 0);
    const diff = Math.abs(totalClosingDebit - totalClosingCredit);

    return {
      rows,
      totalOpeningDebit: roundToPrecision(totalOpeningDebit, 3),
      totalOpeningCredit: roundToPrecision(totalOpeningCredit, 3),
      totalPeriodDebit: roundToPrecision(totalPeriodDebit, 3),
      totalPeriodCredit: roundToPrecision(totalPeriodCredit, 3),
      totalClosingDebit: roundToPrecision(totalClosingDebit, 3),
      totalClosingCredit: roundToPrecision(totalClosingCredit, 3),
      isBalanced: diff < 0.01,
      difference: roundToPrecision(diff, 3),
    };
  };

  // General Ledger Generation with Running Balances
  const getGeneralLedger = (
    targetAccountCode?: string,
    startDate?: string,
    endDate?: string,
    companyId?: string
  ): GeneralLedgerAccountSummary[] => {
    const targetCompanyId = companyId || selectedCompanyId;
    const targetAccounts = targetAccountCode && targetAccountCode !== 'all'
      ? chartOfAccounts.filter(a => a.code === targetAccountCode)
      : chartOfAccounts;

    return targetAccounts.map(account => {
      const isDebitNormal = account.category === 'Asset' || account.category === 'Expense';
      let totalDebit = 0;
      let totalCredit = 0;

      const isPostedForCompany = (entry: JournalEntry) => {
        if (entry.status !== 'Posted') return false;
        if (targetCompanyId && targetCompanyId !== 'all' && entry.companyId !== targetCompanyId) return false;
        return true;
      };

      const normalMovement = (debit: number, credit: number) => isDebitNormal ? debit - credit : credit - debit;
      const movementAfterEnd = endDate
        ? journalEntries
            .filter(entry => isPostedForCompany(entry) && entry.date > endDate)
            .flatMap(entry => entry.lines)
            .filter(line => line.accountCode === account.code)
            .reduce((sum, line) => sum + normalMovement(line.debit, line.credit), 0)
        : 0;
      const endBalance = account.balance - movementAfterEnd;

      const filteredEntries = journalEntries
        .filter(je => {
          if (!isPostedForCompany(je)) return false;
          if (startDate && je.date < startDate) return false;
          if (endDate && je.date > endDate) return false;
          return je.lines.some(l => l.accountCode === account.code);
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const rangeMovement = filteredEntries.reduce((entrySum, entry) => entrySum + entry.lines
        .filter(line => line.accountCode === account.code)
        .reduce((lineSum, line) => lineSum + normalMovement(line.debit, line.credit), 0), 0);
      const openingBalance = endBalance - rangeMovement;
      let runningBalance = openingBalance;

      const lines: GeneralLedgerLine[] = [];

      filteredEntries.forEach(je => {
        je.lines.forEach(line => {
          if (line.accountCode === account.code) {
            totalDebit += line.debit;
            totalCredit += line.credit;

            runningBalance += normalMovement(line.debit, line.credit);

            lines.push({
              id: line.id,
              entryNumber: je.entryNumber,
              date: je.date,
              reference: je.reference,
              description: line.description || je.description,
              sourceModule: je.sourceModule || 'Manual',
              vehiclePlate: line.vehicleId ? vehicles.find(v => v.id === line.vehicleId)?.plateNumber : undefined,
              costCentre: line.costCentre,
              debit: line.debit,
              credit: line.credit,
              runningBalance: roundToPrecision(runningBalance, 3),
            });
          }
        });
      });

      return {
        accountCode: account.code,
        accountName: account.name,
        category: account.category,
        subcategory: account.subcategory,
        currency,
        openingBalance: roundToPrecision(openingBalance, 3),
        totalDebit: roundToPrecision(totalDebit, 3),
        totalCredit: roundToPrecision(totalCredit, 3),
        closingBalance: roundToPrecision(runningBalance, 3),
        lines,
      };
    });
  };

  // Party Sub-Ledger (Supplier & Customer Statement of Accounts)
  const getPartyLedger = (partyId: string, partyType: 'Supplier' | 'Customer') => {
    const partyInvoices = invoices.filter(i => i.partyId === partyId && i.partyType === partyType);
    const partyPayments = payments.filter(p => p.partyId === partyId && p.partyType === partyType);

    const lines: PartyStatementLine[] = [];
    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const events: { date: string; type: 'Invoice' | 'Payment'; data: any }[] = [
      ...partyInvoices.map(i => ({ date: i.invoiceDate, type: 'Invoice' as const, data: i })),
      ...partyPayments.map(p => ({ date: p.paymentDate, type: 'Payment' as const, data: p })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    events.forEach(ev => {
      if (ev.type === 'Invoice') {
        const inv = ev.data as Invoice;
        if (partyType === 'Supplier') {
          runningBalance += inv.grandTotal;
          totalCredit += inv.grandTotal;
          lines.push({
            id: `inv-${inv.id}`,
            date: inv.invoiceDate,
            type: 'Invoice',
            referenceNumber: inv.invoiceNumber,
            description: inv.notes || `Purchase Invoice (${inv.items.length} items)`,
            debit: 0,
            credit: inv.grandTotal,
            runningBalance: roundToPrecision(runningBalance, 3),
          });
        } else {
          runningBalance += inv.grandTotal;
          totalDebit += inv.grandTotal;
          lines.push({
            id: `inv-${inv.id}`,
            date: inv.invoiceDate,
            type: 'Invoice',
            referenceNumber: inv.invoiceNumber,
            description: inv.notes || `Sales Invoice (Fleet Freight / Rental)`,
            debit: inv.grandTotal,
            credit: 0,
            runningBalance: roundToPrecision(runningBalance, 3),
          });
        }
      } else {
        const pay = ev.data as Payment;
        if (partyType === 'Supplier') {
          runningBalance = Math.max(0, runningBalance - pay.amount);
          totalDebit += pay.amount;
          lines.push({
            id: `pay-${pay.id}`,
            date: pay.paymentDate,
            type: 'Payment',
            referenceNumber: pay.paymentNumber,
            description: pay.notes || `Payment settlement via ${pay.paymentMethod}`,
            debit: pay.amount,
            credit: 0,
            runningBalance: roundToPrecision(runningBalance, 3),
          });
        } else {
          runningBalance = Math.max(0, runningBalance - pay.amount);
          totalCredit += pay.amount;
          lines.push({
            id: `pay-${pay.id}`,
            date: pay.paymentDate,
            type: 'Payment',
            referenceNumber: pay.paymentNumber,
            description: pay.notes || `Collection received via ${pay.paymentMethod}`,
            debit: 0,
            credit: pay.amount,
            runningBalance: roundToPrecision(runningBalance, 3),
          });
        }
      }
    });

    return {
      openingBalance: 0,
      lines,
      totalDebit: roundToPrecision(totalDebit, 3),
      totalCredit: roundToPrecision(totalCredit, 3),
      closingBalance: roundToPrecision(runningBalance, 3),
    };
  };

  // Comprehensive Vehicle Financial Summary Engine
  const getVehicleFinancialSummary = (vehicleId: string): VehicleFinancialSummary => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) {
      return {
        purchaseValue: 0,
        currentBookValue: 0,
        accumulatedDepreciation: 0,
        currentMarketValue: 0,
        totalMaintenanceCost: 0,
        totalAccidentRepairCost: 0,
        totalOilChangeCost: 0,
        totalTyreCost: 0,
        totalInsuranceCost: 0,
        totalRegistrationCost: 0,
        otherExpenses: 0,
        totalLifetimeVehicleCost: 0,
        totalDistanceTravelled: 0,
        costPerKilometer: 0,
        maintenanceCostPerKm: 0,
        totalRevenueGenerated: 0,
        netVehicleProfit: 0,
      };
    }

    const purchaseVal = vehicle.purchase.purchaseValue || 0;
    const { bookValue, accumulatedDepreciation } = calculateCurrentBookValue(vehicle);

    // Sum Maintenance
    const totalMnt = maintenanceRecords
      .filter(m => m.vehicleId === vehicleId)
      .reduce((sum, m) => sum + (m.totalCost || 0), 0);

    // Sum Accidents
    const totalAcc = accidents
      .filter(a => a.vehicleId === vehicleId)
      .reduce((sum, a) => sum + (a.actualRepairCost || 0), 0);

    // Sum Oil
    const totalOil = oilChanges
      .filter(o => o.vehicleId === vehicleId)
      .reduce((sum, o) => sum + (o.totalCost || 0), 0);

    // Sum Tyres
    const totalTyre = tyres
      .filter(t => t.vehicleId === vehicleId)
      .reduce((sum, t) => sum + (t.purchaseCost || 0), 0) +
      tyreEvents.filter(te => te.vehicleId === vehicleId).reduce((sum, te) => sum + (te.cost || 0), 0);

    // Sum Categorized Expenses
    const vehicleExps = expenses.filter(e => e.vehicleId === vehicleId);
    const totalIns = vehicleExps.filter(e => e.category === 'Insurance').reduce((sum, e) => sum + e.total, 0) + (vehicle.insurancePremiumAnnual || 0);
    const totalReg = vehicleExps.filter(e => e.category === 'Registration').reduce((sum, e) => sum + e.total, 0);
    const otherExp = vehicleExps.filter(e => !['Insurance', 'Registration', 'Maintenance', 'Oil', 'Tyres', 'Accident'].includes(e.category)).reduce((sum, e) => sum + e.total, 0);

    // Lifetime vehicle cost
    const lifetimeCost = purchaseVal + totalMnt + totalAcc + totalOil + totalTyre + totalIns + totalReg + otherExp;

    const distance = Math.max(1, vehicle.currentMileage - (vehicle.initialOdometer || 0));
    const operatingCost = totalMnt + totalAcc + totalOil + totalTyre + totalIns + totalReg + otherExp;
    const costPerKm = calculateCostPerKm(operatingCost, distance);
    const mntCostPerKm = calculateCostPerKm(totalMnt, distance);

    // Calculate revenue attributed to vehicle
    const revenueInvoices = invoices.filter(inv => inv.invoiceType === 'Sales' && inv.vehicleId === vehicleId);
    const totalRev = revenueInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
    const netProfit = roundToPrecision(totalRev - operatingCost, 3);

    return {
      purchaseValue: purchaseVal,
      currentBookValue: bookValue,
      accumulatedDepreciation,
      currentMarketValue: vehicle.currentMarketValue || bookValue,
      totalMaintenanceCost: roundToPrecision(totalMnt, 3),
      totalAccidentRepairCost: roundToPrecision(totalAcc, 3),
      totalOilChangeCost: roundToPrecision(totalOil, 3),
      totalTyreCost: roundToPrecision(totalTyre, 3),
      totalInsuranceCost: roundToPrecision(totalIns, 3),
      totalRegistrationCost: roundToPrecision(totalReg, 3),
      otherExpenses: roundToPrecision(otherExp, 3),
      totalLifetimeVehicleCost: roundToPrecision(lifetimeCost, 3),
      totalDistanceTravelled: distance,
      costPerKilometer: costPerKm,
      maintenanceCostPerKm: mntCostPerKm,
      totalRevenueGenerated: totalRev,
      netVehicleProfit: netProfit,
    };
  };

  // Dynamic Company Profit & Loss Statement
  const getCompanyProfitLoss = (companyId?: string): ProfitLossStatement => {
    const cid = companyId || selectedCompanyId;

    // Revenues
    const revAccounts = chartOfAccounts.filter(a => a.category === 'Revenue');
    const revenues = revAccounts.map(a => ({
      accountCode: a.code,
      accountName: a.name,
      amount: a.balance,
    }));
    const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);

    // Direct Costs (Maintenance, Fuel, Tyres, Oil)
    const directCategories = ['Maintenance', 'Fuel', 'Tyres', 'Oil', 'Repair'];
    const directCosts = directCategories.map(cat => {
      const acc = chartOfAccounts.find(a => a.name.toLowerCase().includes(cat.toLowerCase()));
      return {
        category: cat,
        amount: acc ? acc.balance : 0,
      };
    });
    const totalDirectCosts = directCosts.reduce((s, c) => s + c.amount, 0);
    const grossProfit = totalRevenue - totalDirectCosts;
    const grossProfitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Operating Expenses
    const opexAccounts = chartOfAccounts.filter(a => a.category === 'Expense' && !directCategories.some(c => a.name.toLowerCase().includes(c.toLowerCase())) && a.code !== '5080');
    const operatingExpenses = opexAccounts.map(a => ({
      accountCode: a.code,
      accountName: a.name,
      amount: a.balance,
    }));
    const totalOpex = operatingExpenses.reduce((s, o) => s + o.amount, 0);

    const depAccount = chartOfAccounts.find(a => a.code === '5080');
    const depreciationExpense = depAccount?.balance || 0;

    const ebitda = grossProfit - totalOpex;
    const ebit = ebitda - depreciationExpense;
    const netProfit = ebit;
    const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      companyId: cid || 'all',
      period: `Year ${new Date().getFullYear()} (YTD)`,
      currency: 'OMR',
      revenues,
      totalRevenue: roundToPrecision(totalRevenue, 3),
      directCosts,
      totalDirectCosts: roundToPrecision(totalDirectCosts, 3),
      grossProfit: roundToPrecision(grossProfit, 3),
      grossProfitMarginPercentage: roundToPrecision(grossProfitMargin, 2),
      operatingExpenses,
      totalOperatingExpenses: roundToPrecision(totalOpex, 3),
      depreciationExpense: roundToPrecision(depreciationExpense, 3),
      ebitda: roundToPrecision(ebitda, 3),
      ebit: roundToPrecision(ebit, 3),
      netProfit: roundToPrecision(netProfit, 3),
      netProfitMarginPercentage: roundToPrecision(netProfitMargin, 2),
    };
  };

  // Dynamic Company Balance Sheet Statement
  const getCompanyBalanceSheet = (companyId?: string): BalanceSheetStatement => {
    const cid = companyId || selectedCompanyId;
    const byCode = (code: string) => chartOfAccounts.find(account => account.code === code)?.balance || 0;
    const toStatementItems = (category: Account['category'], subcategory: string) => chartOfAccounts
      .filter(account => account.category === category && account.subcategory === subcategory)
      .map(account => ({ name: account.name, amount: roundToPrecision(account.balance, 3) }));

    // Financial statements are sourced from posted GL account balances. No
    // balancing plugs or synthetic statement values are introduced here.
    const currentAssets = toStatementItems('Asset', 'Current Assets');
    const fixedAssetsList = toStatementItems('Asset', 'Fixed Assets');
    const currentLiabilities = toStatementItems('Liability', 'Current Liabilities');
    const longTermLiabilities = toStatementItems('Liability', 'Long Term Liabilities');
    
    // Sourced dynamically from P&L and posted equity accounts
    const pnl = getCompanyProfitLoss(cid);
    const netIncome = pnl.netProfit;
    const equityItems = chartOfAccounts
      .filter(account => account.category === 'Equity')
      .map(account => ({
        name: account.name,
        amount: roundToPrecision(account.code === '3030' ? (account.balance || netIncome) : account.balance, 3),
      }));

    const totalCurrentAssets = currentAssets.reduce((sum, item) => sum + item.amount, 0);
    const totalFixedAssets = fixedAssetsList.reduce((sum, item) => sum + item.amount, 0);
    const totalAssets = roundToPrecision(totalCurrentAssets + totalFixedAssets, 3);
    const totalCurrentLiabilities = currentLiabilities.reduce((sum, item) => sum + item.amount, 0);
    const totalLongTermLiabilities = longTermLiabilities.reduce((sum, item) => sum + item.amount, 0);
    const totalLiabilities = roundToPrecision(totalCurrentLiabilities + totalLongTermLiabilities, 3);
    const totalEquity = roundToPrecision(equityItems.reduce((sum, item) => sum + item.amount, 0), 3);
    const totalLiabilitiesAndEquity = roundToPrecision(totalLiabilities + totalEquity, 3);

    const vehiclesCost = byCode('1510');
    const accumulatedDepreciationBalance = byCode('1520');
    const totalAccDep = Math.abs(accumulatedDepreciationBalance);
    const netVehiclesValue = roundToPrecision(vehiclesCost + accumulatedDepreciationBalance, 3);
    const workshopEquipmentCost = byCode('1530');
    const ap = byCode('2010');
    const vehicleLoans = byCode('2510');
    const shareCapital = byCode('3010');
    const retainedEarnings = byCode('3020');
    const currentPeriodProfit = roundToPrecision(byCode('3030') || netIncome, 3);

    return {
      companyId: cid || 'all',
      asOfDate: new Date().toISOString().slice(0, 10),
      currency: 'OMR',
      assets: {
        currentAssets,
        totalCurrentAssets: roundToPrecision(totalCurrentAssets, 3),
        fixedAssets: fixedAssetsList,
        vehiclesCost: roundToPrecision(vehiclesCost, 3),
        accumulatedDepreciation: roundToPrecision(totalAccDep, 3),
        netVehiclesValue,
        workshopEquipmentCost: roundToPrecision(workshopEquipmentCost, 3),
        totalFixedAssets: roundToPrecision(totalFixedAssets, 3),
        totalAssets,
      },
      liabilities: {
        currentLiabilities,
        accountsPayable: roundToPrecision(ap, 3),
        totalCurrentLiabilities: roundToPrecision(totalCurrentLiabilities, 3),
        longTermLiabilities,
        vehicleLoans: roundToPrecision(vehicleLoans, 3),
        totalLongTermLiabilities: roundToPrecision(totalLongTermLiabilities, 3),
        totalLiabilities,
      },
      equity: {
        items: equityItems,
        shareCapital: roundToPrecision(shareCapital, 3),
        retainedEarnings,
        currentPeriodProfit: roundToPrecision(currentPeriodProfit, 3),
        totalEquity,
      },
      totalLiabilitiesAndEquity,
      isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
    };
  };

  // Reset to default seed
  const resetToDefaultData = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCompanies(INITIAL_COMPANIES);
    setVehicles(INITIAL_VEHICLES);
    setTyres(INITIAL_TYRES);
    setTyreEvents(INITIAL_TYRE_EVENTS);
    setOilChanges(INITIAL_OIL_CHANGES);
    setMaintenanceRecords(INITIAL_MAINTENANCE_RECORDS);
    setWorkOrders(INITIAL_WORK_ORDERS);
    setAccidents(INITIAL_ACCIDENTS);
    setExpenses(INITIAL_EXPENSES);
    setSuppliers(INITIAL_SUPPLIERS);
    setCustomers(INITIAL_CUSTOMERS);
    setInvoices(INITIAL_INVOICES);
    setReconciliations(INITIAL_RECONCILIATIONS);
    setPayments(INITIAL_PAYMENTS);
    setBankAccounts(INITIAL_BANK_ACCOUNTS);
    setChartOfAccounts(INITIAL_CHART_OF_ACCOUNTS);
    setJournalEntries(INITIAL_JOURNAL_ENTRIES);
    setFixedAssets(INITIAL_FIXED_ASSETS);
    setDepreciationRuns(INITIAL_DEPRECIATION_RUNS);
    setEmployees(INITIAL_EMPLOYEES);
    setPayrollRuns(INITIAL_PAYROLL_RUNS);
    setDocuments(INITIAL_DOCUMENTS);
    setTimeline(INITIAL_TIMELINE);
    setNotifications(INITIAL_NOTIFICATIONS);
    setApprovalRules(INITIAL_APPROVAL_RULES);
    setApprovalRequests(INITIAL_APPROVAL_REQUESTS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    logAudit('CREATE', 'Company', 'all', 'System Cache', 'Reset application state to initial enterprise seed dataset.');
  };

  // Export JSON
  const exportAllDataJSON = () => {
    const data = {
      companies,
      vehicles,
      tyres,
      tyreEvents,
      oilChanges,
      maintenanceRecords,
      workOrders,
      accidents,
      expenses,
      suppliers,
      customers,
      invoices,
      reconciliations,
      payments,
      bankAccounts,
      chartOfAccounts,
      journalEntries,
      fixedAssets,
      depreciationRuns,
      employees,
      payrollRuns,
      documents,
      timeline,
      notifications,
      approvalRules,
      approvalRequests,
      auditLogs,
      exportedAt: new Date().toISOString(),
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Al_Hakim_ERP_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Import JSON
  const importDataJSON = (jsonData: string): boolean => {
    try {
      const parsed = JSON.parse(jsonData);
      if (!parsed || typeof parsed !== 'object') return false;
      const arrayKeys = ['companies', 'vehicles', 'tyres', 'tyreEvents', 'oilChanges', 'maintenanceRecords', 'workOrders', 'accidents', 'expenses', 'suppliers', 'customers', 'invoices', 'reconciliations', 'payments', 'bankAccounts', 'chartOfAccounts', 'journalEntries', 'fixedAssets', 'depreciationRuns', 'employees', 'payrollRuns', 'documents', 'timeline', 'notifications', 'approvalRules', 'approvalRequests', 'auditLogs'];
      // Validate the whole backup before touching state so a bad file cannot leave a half-imported mix
      if (arrayKeys.some(k => parsed[k] !== undefined && !Array.isArray(parsed[k]))) return false;
      if (Array.isArray(parsed.vehicles)) {
        if (parsed.companies) setCompanies(parsed.companies);
        setVehicles(parsed.vehicles);
        if (parsed.tyres) setTyres(parsed.tyres);
        if (parsed.tyreEvents) setTyreEvents(parsed.tyreEvents);
        if (parsed.oilChanges) setOilChanges(parsed.oilChanges);
        if (parsed.maintenanceRecords) setMaintenanceRecords(parsed.maintenanceRecords);
        if (parsed.workOrders) setWorkOrders(parsed.workOrders);
        if (parsed.accidents) setAccidents(parsed.accidents);
        if (parsed.expenses) setExpenses(parsed.expenses);
        if (parsed.suppliers) setSuppliers(parsed.suppliers);
        if (parsed.customers) setCustomers(parsed.customers);
        if (parsed.invoices) setInvoices(parsed.invoices);
        if (parsed.reconciliations) setReconciliations(parsed.reconciliations);
        if (parsed.payments) setPayments(parsed.payments);
        if (parsed.bankAccounts) setBankAccounts(parsed.bankAccounts);
        if (parsed.chartOfAccounts) setChartOfAccounts(parsed.chartOfAccounts);
        if (parsed.journalEntries) setJournalEntries(parsed.journalEntries);
        if (parsed.fixedAssets) setFixedAssets(parsed.fixedAssets);
        if (parsed.depreciationRuns) setDepreciationRuns(parsed.depreciationRuns);
        if (parsed.employees) setEmployees(parsed.employees);
        if (parsed.payrollRuns) setPayrollRuns(parsed.payrollRuns);
        if (parsed.documents) setDocuments(parsed.documents);
        if (parsed.timeline) setTimeline(parsed.timeline);
        if (parsed.notifications) setNotifications(parsed.notifications);
        if (parsed.approvalRules) setApprovalRules(parsed.approvalRules);
        if (parsed.approvalRequests) setApprovalRequests(parsed.approvalRequests);
        if (parsed.auditLogs) setAuditLogs(parsed.auditLogs);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <FleetContext.Provider
      value={{
        companies,
        selectedCompanyId,
        setSelectedCompanyId,
        selectedCompany,
        vehicles,
        tyres,
        tyreEvents,
        oilChanges,
        maintenanceRecords,
        workOrders,
        accidents,
        expenses,
        suppliers,
        customers,
        invoices,
        reconciliations,
        payments,
        bankAccounts,
        chartOfAccounts,
        journalEntries,
        fixedAssets,
        depreciationRuns,
        employees,
        payrollRuns,
        documents,
        timeline,
        notifications,
        approvalRules,
        approvalRequests,
        auditLogs,
        currency,
        setCurrency,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        addMaintenanceRecord,
        addWorkOrder,
        updateWorkOrderStatus,
        addOilChange,
        addTyre,
        updateTyre,
        addTyreEvent,
        addAccident,
        updateAccident,
        addExpense,
        addSupplier,
        updateSupplier,
        addCustomer,
        updateCustomer,
        addInvoice,
        updateInvoice,
        duplicateInvoice,
        createCreditNote,
        addPayment,
        addReconciliation,
        addJournalEntry,
        addDocument,
        deleteDocument,
        addFixedAsset,
        updateFixedAsset,
        deleteFixedAsset,
        runAutoDepreciation,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        processPayrollRun,
        getTrialBalance,
        getGeneralLedger,
        getPartyLedger,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        processApproval,
        logAudit,
        getVehicleFinancialSummary,
        getCompanyProfitLoss,
        getCompanyBalanceSheet,
        resetToDefaultData,
        exportAllDataJSON,
        importDataJSON,
      }}
    >
      {children}
    </FleetContext.Provider>
  );
};

export const useFleet = () => {
  const context = useContext(FleetContext);
  if (!context) throw new Error('useFleet must be used within a FleetProvider');
  return context;
};

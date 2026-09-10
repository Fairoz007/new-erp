export type InvoiceType = 'Purchase' | 'Sales';

export type InvoicePaymentStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Cancelled';

export type InvoiceApprovalStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Cancelled';

export interface InvoiceLineItem {
  id: string;
  itemCode: string;
  description: string;
  quantity: number;
  unit: string; // 'Hrs', 'Pcs', 'Ltr', 'Set', 'Km', 'Month', 'Package'
  unitPrice: number;
  discountPercentage: number;
  discountAmount: number;
  taxRatePercentage: number; // e.g. 5% VAT in Oman
  taxAmount: number;
  lineTotal: number;
  vehicleId?: string;
  vehiclePlate?: string;
  expenseCategory?: string;
  glAccountCode?: string; // e.g. "5000" Maintenance Expense
  costCentre?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. "INV-2026-0038" or "PINV-2026-012"
  invoiceType: InvoiceType; // Purchase from Supplier vs Sales to Customer
  companyId: string;
  companyName: string;
  
  // Parties
  partyType: 'Supplier' | 'Customer';
  partyId: string;
  partyName: string;
  partyVatNumber?: string;
  partyAddress?: string;
  partyEmail?: string;
  partyPhone?: string;
  
  invoiceDate: string;
  dueDate: string;
  referenceNumber?: string; // Supplier's invoice or Customer PO
  purchaseOrderNumber?: string;
  workOrderNumber?: string;
  maintenanceRecordId?: string;
  vehicleId?: string;
  vehiclePlate?: string;
  costCentre?: string;
  currency: string;
  exchangeRate: number;
  
  // Line items & totals
  items: InvoiceLineItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  otherCharges: number;
  grandTotal: number;
  amountPaid: number;
  outstandingAmount: number;
  
  paymentStatus: InvoicePaymentStatus;
  approvalStatus: InvoiceApprovalStatus;
  approvedBy?: string;
  approvalDate?: string;
  
  // Bill / Receipt Attachment
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: string;
  attachmentType?: string;
  
  // Terms & bank
  paymentTermsDays: number;
  bankDetails?: string;
  termsAndConditions?: string;
  notes?: string;
  
  isCreditNote?: boolean;
  parentInvoiceId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReconciliationStatus = 'Matched' | 'Partially Matched' | 'Mismatch' | 'Pending Review' | 'Reconciled';

export interface InvoiceReconciliation {
  id: string;
  reconciliationNumber: string; // e.g. "REC-2026-004"
  companyId: string;
  invoiceId: string;
  invoiceNumber: string;
  supplierOrCustomerName: string;
  matchingType: '2-Way' | '3-Way';
  
  // Reference links
  purchaseOrderNumber?: string;
  purchaseOrderAmount?: number;
  workOrderNumber?: string;
  workOrderAmount?: number;
  goodsServiceReceivedAmount?: number;
  invoiceAmount: number;
  paidAmount: number;
  
  differenceAmount: number;
  variancePercentage: number;
  status: ReconciliationStatus;
  discrepancyReason?: string;
  reconciledBy?: string;
  reconciledDate?: string;
  notes?: string;
  createdAt: string;
}

export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'Cheque' | 'Credit Card' | 'Debit Card' | 'Online' | 'Other';

export interface Payment {
  id: string;
  paymentNumber: string; // e.g. "PAY-2026-0089"
  companyId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  partyType: 'Supplier' | 'Customer';
  partyId: string;
  partyName: string;
  paymentDate: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  bankAccountId: string;
  bankAccountName: string;
  transactionReference: string;
  chequeNumber?: string;
  notes?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  createdAt: string;
}

export interface BankAccount {
  id: string;
  companyId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban: string;
  currency: string;
  currentBalance: number;
  accountType: 'Current' | 'Savings' | 'Petty Cash' | 'Credit Facility';
  active: boolean;
}

export type AccountCategory = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface Account {
  code: string; // e.g. "1010"
  name: string; // e.g. "Bank - Oman Arab Bank"
  category: AccountCategory;
  subcategory: string; // e.g. "Current Assets", "Fixed Assets", "Direct Expense"
  balance: number;
  currency: string;
  description?: string;
  isSystem?: boolean;
}

export interface JournalLine {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
  vehicleId?: string;
  costCentre?: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string; // e.g. "JE-2026-0045"
  companyId: string;
  date: string;
  reference?: string;
  description: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  postedBy: string;
  status: 'Draft' | 'Posted' | 'Void';
  sourceModule?: 'Maintenance' | 'Invoice' | 'Payment' | 'Depreciation' | 'Expense' | 'Payroll' | 'Manual';
  
  // Bill / Receipt Attachment
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: string;
  
  createdAt: string;
}

// ----------------------------------------------------
// Fixed Assets & Auto-Depreciation
// ----------------------------------------------------
export type FixedAssetCategory =
  | 'Fleet Vehicle'
  | 'Workshop Equipment'
  | 'Heavy Machinery'
  | 'IT & GPS Hardware'
  | 'Facility & Garage Fixture'
  | 'Other Fixed Asset';

export type AssetDepreciationMethod = 'Straight-Line' | 'Reducing Balance' | 'Double Declining';

export interface FixedAsset {
  id: string;
  assetCode: string; // e.g. "AST-VEH-001" or "AST-EQP-014"
  companyId: string;
  name: string;
  category: FixedAssetCategory;
  serialOrPlateNumber?: string;
  serialNumber?: string;
  assignedVehiclePlate?: string;
  location: string;
  department: string;
  
  purchaseDate: string;
  purchaseCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  annualRatePercentage: number;
  depreciationMethod: AssetDepreciationMethod;
  
  accumulatedDepreciation: number;
  currentBookValue: number;
  currentMarketValue?: number;
  
  glAssetAccount: string; // e.g. "1510"
  glDepreciationExpenseAccount: string; // e.g. "5080"
  glAccumulatedDepreciationAccount: string; // e.g. "1520"
  
  status: 'Active' | 'Under Maintenance' | 'Fully Depreciated' | 'Disposed';
  vehicleId?: string;
  supplierName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepreciationRun {
  id: string;
  batchNumber: string; // e.g. "DEP-2026-08"
  companyId: string;
  periodLabel: string; // "August 2026" or "Q3 2026"
  runDate: string;
  totalAssetsProcessed: number;
  totalDepreciationAmount: number;
  currency: string;
  journalEntryId?: string;
  journalEntryNumber?: string;
  status: 'Draft' | 'Posted' | 'Reversed';
  processedBy: string;
  notes?: string;
  breakdown: {
    assetId: string;
    assetCode: string;
    assetName: string;
    category: FixedAssetCategory;
    previousBookValue: number;
    depreciationAmount: number;
    newBookValue: number;
  }[];
  createdAt: string;
}

// ----------------------------------------------------
// Trial Balance & General Ledger Models
// ----------------------------------------------------
export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  category: AccountCategory;
  subcategory: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  netBalance: number;
}

export interface GeneralLedgerLine {
  id: string;
  entryNumber: string;
  date: string;
  reference?: string;
  description: string;
  sourceModule: string;
  vehiclePlate?: string;
  costCentre?: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface GeneralLedgerAccountSummary {
  accountCode: string;
  accountName: string;
  category: AccountCategory;
  subcategory: string;
  currency: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  lines: GeneralLedgerLine[];
}

export interface PartyStatementLine {
  id: string;
  date: string;
  type: 'Invoice' | 'Payment' | 'Credit Note' | 'Opening Balance';
  referenceNumber: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

// ----------------------------------------------------
// Financial Statements
// ----------------------------------------------------
export interface ProfitLossStatement {
  companyId: string;
  period: string; // e.g. "Year 2026" or "Q1 2026" or "August 2026"
  currency: string;
  
  // Revenue
  revenues: {
    accountCode: string;
    accountName: string;
    amount: number;
  }[];
  totalRevenue: number;
  
  // Direct Operational Costs (COGS)
  directCosts: {
    category: string;
    amount: number;
  }[];
  totalDirectCosts: number;
  grossProfit: number;
  grossProfitMarginPercentage: number;
  
  // Operating Expenses / Overheads
  operatingExpenses: {
    accountCode: string;
    accountName: string;
    amount: number;
  }[];
  totalOperatingExpenses: number;
  
  depreciationExpense: number;
  ebitda: number;
  ebit: number;
  netProfit: number;
  netProfitMarginPercentage: number;
}

export interface BalanceSheetStatement {
  companyId: string;
  asOfDate: string;
  currency: string;
  
  assets: {
    currentAssets: { name: string; amount: number }[];
    totalCurrentAssets: number;
    fixedAssets: { name: string; amount: number }[];
    vehiclesCost: number;
    accumulatedDepreciation: number;
    netVehiclesValue: number;
    workshopEquipmentCost: number;
    totalFixedAssets: number;
    totalAssets: number;
  };
  
  liabilities: {
    currentLiabilities: { name: string; amount: number }[];
    accountsPayable: number;
    totalCurrentLiabilities: number;
    longTermLiabilities: { name: string; amount: number }[];
    vehicleLoans: number;
    totalLongTermLiabilities: number;
    totalLiabilities: number;
  };
  
  equity: {
    items: { name: string; amount: number }[];
    shareCapital: number;
    retainedEarnings: number;
    currentPeriodProfit: number;
    totalEquity: number;
  };
  
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

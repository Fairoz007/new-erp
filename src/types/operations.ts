export type ExpenseCategory =
  | 'Fuel'
  | 'Maintenance'
  | 'Repair'
  | 'Oil'
  | 'Tyres'
  | 'Insurance'
  | 'Registration'
  | 'Parking'
  | 'Toll'
  | 'Cleaning'
  | 'Inspection'
  | 'Fines'
  | 'Accident'
  | 'Loan'
  | 'Lease'
  | 'Driver Expense'
  | 'Roadside Assistance'
  | 'Other';

export interface VehicleExpense {
  id: string;
  expenseNumber: string; // e.g. "EXP-2026-0042"
  vehicleId: string;
  vehiclePlate: string;
  companyId: string;
  date: string;
  category: ExpenseCategory;
  supplierId?: string;
  supplierName?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  tax: number;
  total: number;
  paymentMethod: string;
  invoiceNumber?: string;
  receiptNumber?: string;
  costCentre: string;
  glAccountCode?: string; // e.g. "5010" Fuel Expense
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: string;
  attachmentType?: string;
  notes?: string;
  createdAt: string;
}

export type AccidentStatus =
  | 'Reported'
  | 'Under Investigation'
  | 'Insurance Processing'
  | 'Repair Approved'
  | 'Under Repair'
  | 'Completed'
  | 'Closed';

export interface Accident {
  id: string;
  accidentNumber: string; // e.g. "ACC-2026-009"
  vehicleId: string;
  vehiclePlate: string;
  companyId: string;
  accidentDate: string;
  accidentTime: string;
  location: string;
  driverName: string;
  accidentDescription: string;
  accidentType: 'Minor Scrape' | 'Rear-End Collision' | 'Side Impact' | 'Rollover' | 'Single Vehicle' | 'Total Loss' | 'Windshield Damage';
  damageDescription: string;
  policeReportNumber: string;
  insuranceClaimNumber: string;
  thirdPartyDetails?: string;
  
  // Cost breakdown & recovery calculations
  estimatedRepairCost: number;
  actualRepairCost: number;
  insuranceContribution: number;
  companyContribution: number;
  thirdPartyContribution: number;
  netAccidentCostToCompany: number; // calculated: repairCost - insurance - thirdParty
  
  workshop: string;
  supplierId?: string;
  repairStartDate?: string;
  repairCompletionDate?: string;
  vehicleDowntimeDays: number;
  status: AccidentStatus;
  
  attachments?: {
    id: string;
    name: string;
    type: 'Accident Photo' | 'Police Report' | 'Insurance Document' | 'Quotation' | 'Repair Invoice' | 'Document';
    url: string;
    storagePath?: string; // object path in the 'documents' storage bucket
  }[];
  notes?: string;
  createdAt: string;
}

export type SupplierType =
  | 'Vehicle Dealer'
  | 'Garage'
  | 'Workshop'
  | 'Tyre Supplier'
  | 'Oil Supplier'
  | 'Parts Supplier'
  | 'Insurance Company'
  | 'Fuel Supplier'
  | 'Rental Company'
  | 'Other';

export interface Supplier {
  id: string;
  supplierId: string; // e.g. "SUP-001"
  name: string;
  supplierType: SupplierType;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
  vatNumber: string;
  taxNumber: string;
  paymentTermsDays: number; // e.g. 30 days
  creditLimit: number;
  bankDetails: {
    bankName: string;
    accountNumber: string;
    iban: string;
    swiftCode: string;
  };
  openingBalance: number;
  currentBalance: number; // calculated accounts payable
  totalPurchases: number;
  totalInvoicesCount: number;
  amountPaid: number;
  creditNotesAmount: number;
  status: 'Active' | 'Inactive' | 'Blocked';
  notes?: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  customerId: string; // e.g. "CUST-001"
  name: string;
  customerType: 'Corporate' | 'Individual' | 'Government' | 'Partner';
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
  vatNumber: string;
  taxNumber: string;
  paymentTermsDays: number;
  creditLimit: number;
  openingBalance: number;
  currentBalance: number; // Accounts receivable
  totalSales: number;
  totalInvoicesCount: number;
  amountReceived: number;
  status: 'Active' | 'Inactive';
  notes?: string;
  createdAt: string;
}

export type DocumentCategory =
  | 'Registration'
  | 'Insurance'
  | 'Purchase Invoice'
  | 'Vehicle Invoice'
  | 'Warranty'
  | 'Maintenance Invoice'
  | 'Service Report'
  | 'Oil Invoice'
  | 'Tyre Invoice'
  | 'Accident Report'
  | 'Police Report'
  | 'Insurance Claim'
  | 'Loan Agreement'
  | 'Inspection Report'
  | 'Vehicle Photos'
  | 'Other';

export interface DocumentItem {
  id: string;
  documentName: string;
  documentNumber?: string;
  category: DocumentCategory;
  vehicleId?: string;
  vehiclePlate?: string;
  companyId: string;
  issueDate?: string;
  expiryDate?: string;
  fileSize?: string;
  fileType?: string;
  url?: string;
  documentUrl?: string;
  uploadedBy?: string;
  uploadedAt: string;
  isExpiringSoon?: boolean;
  isExpired?: boolean;
  notes?: string;
}

export interface TimelineEvent {
  id: string;
  vehicleId: string;
  date: string;
  title: string;
  description: string;
  amount?: number;
  currency?: string;
  category: 'Purchase' | 'Registration' | 'Maintenance' | 'Oil' | 'Tyre' | 'Accident' | 'Expense' | 'Depreciation' | 'Inspection' | 'Status';
  referenceId?: string;
  referenceType?: string;
  icon?: string;
  color?: string;
}

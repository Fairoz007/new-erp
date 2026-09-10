export type UserRole =
  | 'Super Admin'
  | 'Company Admin'
  | 'Fleet Manager'
  | 'Maintenance Manager'
  | 'Accountant'
  | 'Finance Manager'
  | 'Procurement'
  | 'Management'
  | 'Viewer';

export type Permission =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'export'
  | 'print';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  companyId?: string;
  department: string;
  phone?: string;
  status: 'active' | 'inactive';
}

export interface Company {
  id: string;
  name: string;
  code: string;
  registrationNumber: string;
  vatNumber: string;
  taxNumber: string;
  address: string;
  country: string;
  state: string;
  city: string;
  postalCode: string;
  phone: string;
  email: string;
  website: string;
  logo: string;
  currency: 'OMR' | 'USD' | 'EUR' | 'SAR' | 'AED';
  financialYear: string;
  bankDetails: {
    bankName: string;
    accountNumber: string;
    iban: string;
    swiftCode: string;
    branch: string;
  };
  notes?: string;
  active: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'PAYMENT' | 'LOGIN' | 'EXPORT' | 'RECONCILE';
  entityType: 'Vehicle' | 'Maintenance' | 'WorkOrder' | 'Invoice' | 'Payment' | 'Expense' | 'Accident' | 'Tyre' | 'OilChange' | 'Accounting' | 'Document' | 'Company' | 'User';
  entityId: string;
  entityName: string;
  details: string;
  oldValue?: string;
  newValue?: string;
  ipAddress?: string;
}

export type NotificationType =
  | 'oil_overdue'
  | 'oil_approaching'
  | 'maintenance_overdue'
  | 'maintenance_scheduled'
  | 'insurance_expiring'
  | 'registration_expiring'
  | 'warranty_expiring'
  | 'tyre_replacement_due'
  | 'inspection_due'
  | 'invoice_due'
  | 'invoice_overdue'
  | 'payment_due'
  | 'accident_pending'
  | 'approval_required'
  | 'document_expiry';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  date: string;
  read: boolean;
  link?: string;
  vehicleId?: string;
  referenceId?: string;
}

export interface ApprovalRule {
  id: string;
  module: 'maintenance' | 'invoice' | 'expense' | 'disposal';
  thresholdAmount: number; // e.g. 100 or 500
  currency: string;
  requiredRoles: UserRole[];
  description: string;
  active: boolean;
}

export interface ApprovalRequest {
  id: string;
  referenceType: 'WorkOrder' | 'Invoice' | 'Expense';
  referenceId: string;
  referenceNumber: string;
  companyId: string;
  requestedBy: string;
  requestedByName: string;
  requestedDate: string;
  amount: number;
  currency: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  currentLevel: number;
  totalLevels: number;
  requiredRoles: UserRole[];
  history: {
    level: number;
    approverId?: string;
    approverName?: string;
    approverRole?: string;
    action: 'Approved' | 'Rejected';
    comment?: string;
    date: string;
  }[];
  notes?: string;
}

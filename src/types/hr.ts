/** Name of a departments row (HR → Departments); the database keeps name and id in step. */
export type EmployeeDepartment = string;


export type EmployeeStatus = 'Active' | 'On Leave' | 'Probation' | 'Terminated';

export interface Employee {
  id: string;
  employeeCode: string; // e.g. "EMP-0101"
  companyId: string;
  customFields?: Record<string, unknown>;
  name: string;
  designation: string;
  department: EmployeeDepartment;
  email?: string;
  phone?: string;
  civilId?: string; // Oman National ID / Resident Card
  nationalId?: string;
  passportNumber?: string;
  nationality?: string;
  joiningDate: string;
  status: EmployeeStatus;
  avatar?: string;
  
  // Salary Structure (in OMR / base currency)
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  totalGrossSalary: number;
  
  // Bank Details for Wages Protection System (WPS)
  bankName: string;
  bankAccountNumber?: string;
  accountNumber?: string;
  iban: string;
  paymentMethod?: 'Bank Transfer' | 'Cash' | 'Cheque';
  
  // Social Security (PASI / Social Insurance)
  socialSecurityNumber?: string;
  pasiContributionPercentage: number; // typically 7% employee in Oman
  employerPasiPercentage?: number; // typically 11.5% employer
  
  assignedVehicleId?: string;
  assignedVehiclePlate?: string;
  notes?: string;
  createdAt: string;

  // Profile (Phase 6)
  departmentId?: string;
  designationId?: string;
  managerId?: string | null;
  sponsor?: string;
  dateOfBirth?: string;
  civilIdExpiryDate?: string;
  passportExpiryDate?: string;
  visaNumber?: string;
  visaExpiryDate?: string;
  labourCardNumber?: string;
  labourCardExpiryDate?: string;
  terminationDate?: string;
  gratuityPaidOn?: string;      // set by payroll when end-of-service is paid
}

export type PayrollStatus = 'Draft' | 'Under Review' | 'Approved' | 'Paid' | 'Cancelled';

export interface PayrollLineItem {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string;
  department: string;
  
  // Earnings
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  overtimeAmount: number;
  bonusAmount: number;
  grossPay: number;
  
  // Deductions
  pasiEmployeeDeduction: number; // 7%
  pasiEmployerContribution?: number; // employer share (company cost, not deducted)
  unpaidLeaveDeduction: number;
  loanAdvanceDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  
  // Net
  netPay: number;
  
  paymentMethod: 'Bank Transfer' | 'Cash' | 'Cheque';
  bankName: string;
  iban: string;
  status: 'Pending' | 'Processed' | 'Paid';
  // Phase 6 workflow
  overtimeHours?: number;
  unpaidLeaveDays?: number;
  daysWorked?: number | null;
  gratuityAmount?: number;
  notes?: string;
  lines?: { kind: 'Allowance' | 'Deduction' | 'Gratuity'; description: string; amount: number }[];
}

export interface PayrollRun {
  id: string;
  payrollNumber: string; // e.g. "PAYROLL-2026-08"
  companyId: string;
  companyName: string;
  month: number; // 1 - 12
  year: number; // e.g. 2026
  periodLabel: string; // "August 2026"
  
  totalEmployees: number;
  totalBasicSalary: number;
  totalAllowances: number;
  totalGrossPay: number;
  totalPasiDeduction: number;
  totalOtherDeductions: number;
  totalDeductions: number;
  totalNetPayout: number;
  totalEmployerPasi?: number; // employer PASI share booked to expense / PASI payable
  
  items: PayrollLineItem[];
  status: PayrollStatus;
  
  approvedBy?: string;
  approvedDate?: string;
  processedDate?: string;
  paymentDate?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  journalEntryId?: string;
  
  notes?: string;
  createdAt: string;
  submittedBy?: string;          // profile id of who submitted it for approval
  submittedByName?: string;
  paymentJournalEntryId?: string;
}

export interface PayslipModalData {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string;
  department: string;
  month: number;
  year: number;
  periodLabel: string;
  paymentDate: string;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  overtimeAmount: number;
  bonusAmount: number;
  grossPay: number;
  pasiEmployeeDeduction: number;
  unpaidLeaveDeduction: number;
  loanAdvanceDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
  bankName: string;
  iban: string;
  status: string;
  // itemised lines (recurring allowances / deductions, gratuity) and attendance figures
  lines?: { kind: 'Allowance' | 'Deduction' | 'Gratuity'; description: string; amount: number }[];
  overtimeHours?: number;
  unpaidLeaveDays?: number;
  daysWorked?: number | null;
  notes?: string;
}

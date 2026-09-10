export type MaintenanceCategory =
  | 'General Service'
  | 'Preventive Maintenance'
  | 'Corrective Maintenance'
  | 'Engine Repair'
  | 'Transmission Repair'
  | 'Brake Service'
  | 'Suspension'
  | 'Steering'
  | 'Electrical'
  | 'AC Repair'
  | 'Battery'
  | 'Oil Change'
  | 'Filter Change'
  | 'Tyres'
  | 'Wheel Alignment'
  | 'Wheel Balancing'
  | 'Body Repair'
  | 'Painting'
  | 'Accident Repair'
  | 'Glass Replacement'
  | 'Interior Repair'
  | 'Washing / Detailing'
  | 'Inspection'
  | 'Registration'
  | 'Insurance'
  | 'Other';

export type MaintenanceType = 'Routine' | 'Preventive' | 'Corrective' | 'Corrective Maintenance' | 'Breakdown' | 'Emergency' | 'Warranty' | 'Recall';

export type WorkOrderStatus =
  | 'Draft'
  | 'Requested'
  | 'Approved'
  | 'Scheduled'
  | 'In Progress'
  | 'Waiting for Parts'
  | 'Completed'
  | 'Cancelled';

export type WorkOrderPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface MaintenancePart {
  id: string;
  partNumber: string;
  name: string;
  quantity: number;
  unitPrice: number;
  tax: number;
  total: number;
}

export interface MaintenanceRecord {
  id: string;
  recordNumber: string; // e.g. "MNT-2026-001"
  vehicleId: string;
  vehiclePlate: string;
  companyId: string;
  maintenanceDate: string;
  maintenanceType: MaintenanceType;
  category: MaintenanceCategory;
  description: string;
  odometerReading: number;
  serviceCentre: string;
  supplierId: string;
  supplierName: string;
  technician?: string;
  workOrderNumber?: string;
  invoiceNumber?: string;
  
  // Cost breakdown
  partsCost: number;
  labourCost: number;
  tax: number;
  discount: number;
  otherCharges: number;
  totalCost: number;
  
  // Payment info
  paymentStatus: 'Unpaid' | 'Partially Paid' | 'Paid';
  paymentMethod?: string;
  
  // Scheduling & Warranties
  nextServiceDate?: string;
  nextServiceMileage?: number;
  warrantyPeriodMonths?: number;
  warrantyExpiryDate?: string;
  
  partsUsed?: MaintenancePart[];
  attachments?: {
    id: string;
    name: string;
    type: 'Invoice' | 'Receipt' | 'Quotation' | 'Work Order' | 'Before Photo' | 'After Photo' | 'Document';
    url: string;
    uploadedAt: string;
  }[];
  
  notes?: string;
  createdAt: string;
}

export interface WorkOrder {
  id: string;
  workOrderNumber: string; // e.g. "WO-2026-104"
  vehicleId: string;
  vehiclePlate: string;
  companyId: string;
  reportedDate: string;
  problemDescription: string;
  requestedBy: string;
  requestedByName: string;
  assignedTechnician?: string;
  workshop: string;
  supplierId?: string;
  supplierName?: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  expectedCompletion?: string;
  actualCompletion?: string;
  
  // Cost projections & actuals
  estimatedCost: number;
  partsCharges: number;
  labourCharges: number;
  additionalCharges: number;
  tax: number;
  finalCost: number;
  
  partsRequired?: string;
  approvalStatus: 'Not Required' | 'Pending' | 'Approved' | 'Rejected';
  approvalId?: string;
  invoiceNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type VehicleStatus =
  | 'Active'
  | 'Under Maintenance'
  | 'Accident'
  | 'Inactive'
  | 'Sold'
  | 'Scrapped'
  | 'Reserved';

export type FuelType = 'Petrol' | 'Diesel' | 'Hybrid' | 'Electric' | 'CNG';
export type TransmissionType = 'Automatic' | 'Manual' | 'CVT' | 'Dual-Clutch';

export type TyrePosition = 'Front Left' | 'Front Right' | 'Rear Left' | 'Rear Right' | 'Spare';
export type TyreStatus = 'Good' | 'Fair' | 'Due Soon' | 'Critical' | 'Replaced' | 'Scrapped';

export interface Tyre {
  id: string;
  vehicleId: string;
  brand: string;
  model: string;
  size: string; // e.g. "265/65 R17"
  serialNumber: string;
  position: TyrePosition;
  purchaseDate: string;
  purchaseCost: number;
  installationDate: string;
  installationMileage: number;
  expectedLifeKm: number;
  currentMileage: number;
  treadDepthMm: number; // e.g. 8.0 mm new, replace at <= 2.0 mm
  replacementDate?: string;
  replacementMileage?: number;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  status: TyreStatus;
  notes?: string;
}

export interface TyreEvent {
  id: string;
  vehicleId: string;
  date: string;
  eventType: 'Installation' | 'Rotation' | 'Alignment' | 'Balancing' | 'Puncture Repair' | 'Replacement';
  odometer: number;
  tyrePositionsAffected: TyrePosition[];
  cost: number;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  technician?: string;
  notes?: string;
}

export interface OilConfig {
  oilType: string; // e.g. Fully Synthetic
  oilBrand: string; // e.g. Mobil 1 / Shell Helix
  oilGrade: string; // e.g. 5W-30 / 10W-40
  intervalKm: number; // e.g. 10,000 KM
  intervalMonths: number; // e.g. 6 Months
  estimatedCost: number;
  capacityLitres: number;
}

export interface OilChange {
  id: string;
  vehicleId: string;
  date: string;
  odometer: number;
  oilType: string;
  oilBrand: string;
  oilGrade: string;
  quantityLitres: number;
  oilCost: number;
  filterCost: number;
  labourCost: number;
  tax: number;
  totalCost: number;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  nextOilChangeMileage: number;
  nextOilChangeDate: string;
  status: 'Normal' | 'Due Soon' | 'Overdue';
  performedBy?: string;
  notes?: string;
}

export interface VehiclePurchaseDetails {
  purchaseDate: string;
  purchaseValue: number;
  purchaseInvoiceNumber: string;
  supplierId: string;
  supplierName: string;
  paymentMethod: 'Cash' | 'Bank Transfer' | 'Finance / Loan' | 'Lease';
  financingType?: 'Bank Loan' | 'Lease-to-Own' | 'Direct Outright';
  loanAmount?: number;
  downPayment?: number;
  loanStartDate?: string;
  loanEndDate?: string;
  monthlyInstallment?: number;
  interestRate?: number;
  warrantyStartDate?: string;
  warrantyExpiryDate?: string;
  warrantyMileageLimit?: number;
}

export interface VehicleDepreciationConfig {
  depreciationMethod: 'Straight-Line' | 'Reducing Balance';
  usefulLifeYears: number; // e.g. 5 years
  annualRatePercentage: number; // e.g. 20%
  salvageValue: number; // e.g. 3,000 OMR
}

export interface DepreciationScheduleRow {
  year: number;
  date: string;
  openingValue: number;
  depreciationAmount: number;
  accumulatedDepreciation: number;
  closingValue: number;
}

export interface Vehicle {
  id: string;
  vehicleId: string; // internal code e.g. VH-001
  companyId: string;
  companyName: string;
  plateNumber: string; // e.g. "1234 ABC"
  registrationNumber: string;
  vin: string; // Chassis No.
  engineNumber: string;
  vehicleType: 'SUV' | 'Sedan' | 'Pickup' | 'Van' | 'Truck' | 'Bus' | 'Heavy Equipment';
  vehicleCategory: 'Executive' | 'Operations' | 'Logistics' | 'Sales' | 'Pool' | 'Service';
  brand: string; // Toyota
  manufacturer: string; // Toyota Motor Corp
  model: string; // Land Cruiser
  variant: string; // VXR 4.0L
  manufacturingYear: number;
  registrationDate: string;
  registrationExpiryDate: string;
  countryOfRegistration: string;
  color: string;
  fuelType: FuelType;
  transmission: TransmissionType;
  engineCapacityCc: number;
  numberOfSeats: number;
  currentMileage: number;
  initialOdometer: number;
  status: VehicleStatus;
  photoUrl: string;
  assignedDriver?: string;
  department?: string;
  location?: string;
  
  // Specs & Configs
  purchase: VehiclePurchaseDetails;
  depreciation: VehicleDepreciationConfig;
  oilConfig: OilConfig;
  
  // Market Valuation
  currentMarketValue: number;
  marketValueUpdatedDate: string;
  
  // Insurance details
  insuranceProvider: string;
  insurancePolicyNumber: string;
  insuranceExpiryDate: string;
  insurancePremiumAnnual: number;
  
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleFinancialSummary {
  purchaseValue: number;
  currentBookValue: number;
  accumulatedDepreciation: number;
  currentMarketValue: number;
  totalMaintenanceCost: number;
  totalAccidentRepairCost: number;
  totalOilChangeCost: number;
  totalTyreCost: number;
  totalInsuranceCost: number;
  totalRegistrationCost: number;
  otherExpenses: number;
  totalLifetimeVehicleCost: number;
  totalDistanceTravelled: number;
  costPerKilometer: number;
  maintenanceCostPerKm: number;
  totalRevenueGenerated: number;
  netVehicleProfit: number;
}

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Car, Wrench, Fuel, AlertTriangle, FileText, DollarSign, Upload, Disc, Droplet, Building2, BookOpen, Users, Calculator, Sparkles, Percent, Tag, Truck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { DocumentUploadZone, UploadedFileMeta } from './DocumentUploadZone';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { MaintenanceCategory, MaintenanceType, WorkOrderPriority } from '../../types/maintenance';
import { ExpenseCategory } from '../../types/operations';
import { InvoiceType, PaymentMethod } from '../../types/finance';
import { EmployeeDepartment } from '../../types/hr';

export const QuickActionModals: React.FC = () => {
  const { quickModal, closeQuickModal, addToast, selectedVehicleId } = useUI();
  const {
    companies,
    vehicles,
    suppliers,
    customers,
    invoices,
    bankAccounts,
    chartOfAccounts,
    employees,
    fixedAssets,
    addVehicle,
    addMaintenanceRecord,
    addWorkOrder,
    addOilChange,
    addTyre,
    addAccident,
    addExpense,
    addSupplier,
    addCustomer,
    addInvoice,
    addPayment,
    addJournalEntry,
    addDocument,
    addEmployee,
    addFixedAsset,
    processPayrollRun,
    runAutoDepreciation,
  } = useFleet();

  const defaultVehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];

  // 1. ADD VEHICLE STATE
  const [vehicleForm, setVehicleForm] = useState({
    vehicleId: `VH-00${vehicles.length + 1}`,
    companyId: companies[0]?.id || 'comp-1',
    plateNumber: '',
    registrationNumber: '',
    vin: '',
    engineNumber: '',
    vehicleType: 'SUV' as const,
    vehicleCategory: 'Operations' as const,
    brand: '',
    manufacturer: '',
    model: '',
    variant: '',
    manufacturingYear: new Date().getFullYear(),
    registrationDate: new Date().toISOString().slice(0, 10),
    registrationExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    countryOfRegistration: 'Oman',
    color: 'White',
    fuelType: 'Petrol' as const,
    transmission: 'Automatic' as const,
    engineCapacityCc: 2500,
    numberOfSeats: 5,
    currentMileage: 0,
    initialOdometer: 0,
    status: 'Active' as const,
    photoUrl: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80',
    assignedDriver: '',
    department: 'Operations',
    location: 'Muscat HQ',
    purchaseValue: 15000,
    supplierId: suppliers[0]?.id || 'sup-1',
    depreciationMethod: 'Straight-Line' as const,
    usefulLifeYears: 5,
    salvageValue: 2000,
    oilIntervalKm: 10000,
    oilBrand: 'Mobil 1 ESP',
    oilGrade: '5W-30',
  });

  // 2. ADD MAINTENANCE STATE
  const [mntForm, setMntForm] = useState({
    vehicleId: defaultVehicle?.id || '',
    companyId: defaultVehicle?.companyId || 'comp-1',
    maintenanceDate: new Date().toISOString().slice(0, 10),
    maintenanceType: 'Routine' as MaintenanceType,
    category: 'General Service' as MaintenanceCategory,
    description: '',
    odometerReading: defaultVehicle?.currentMileage || 0,
    serviceCentre: 'Authorized Service Center',
    supplierId: suppliers[0]?.id || 'sup-1',
    partsCost: 0,
    labourCost: 0,
    tax: 0,
    discount: 0,
    otherCharges: 0,
    paymentStatus: 'Unpaid' as const,
  });

  // 3. ADD WORK ORDER STATE
  const [woForm, setWoForm] = useState({
    vehicleId: defaultVehicle?.id || '',
    companyId: defaultVehicle?.companyId || 'comp-1',
    reportedDate: new Date().toISOString().slice(0, 10),
    problemDescription: '',
    requestedBy: 'usr-1',
    requestedByName: 'Fleet Operations',
    workshop: 'Central Workshop',
    supplierId: suppliers[0]?.id || 'sup-1',
    priority: 'Medium' as WorkOrderPriority,
    estimatedCost: 150,
    partsRequired: '',
    notes: '',
  });

  // 4. ADD OIL CHANGE STATE
  const [oilForm, setOilForm] = useState({
    vehicleId: defaultVehicle?.id || '',
    date: new Date().toISOString().slice(0, 10),
    odometer: defaultVehicle?.currentMileage || 0,
    oilType: 'Fully Synthetic 5W-30',
    oilBrand: 'Mobil 1 ESP',
    oilGrade: '5W-30',
    quantityLitres: 6.5,
    oilCost: 25,
    filterCost: 6,
    labourCost: 5,
    tax: 1.8,
    supplierId: suppliers[0]?.id || 'sup-1',
    notes: 'Engine oil and OEM filter replaced.',
  });

  // 5. ADD EXPENSE STATE
  const [expForm, setExpForm] = useState({
    vehicleId: defaultVehicle?.id || '',
    companyId: defaultVehicle?.companyId || 'comp-1',
    date: new Date().toISOString().slice(0, 10),
    category: 'Fuel' as ExpenseCategory,
    description: '',
    quantity: 1,
    unitPrice: 20,
    tax: 1,
    paymentMethod: 'Corporate Fuel Card',
    costCentre: 'CC-OPS-100',
    supplierId: suppliers[0]?.id || '',
    attachment: null as UploadedFileMeta | null,
  });

  // 6. ADD ACCIDENT STATE
  const [accForm, setAccForm] = useState({
    vehicleId: defaultVehicle?.id || '',
    companyId: defaultVehicle?.companyId || 'comp-1',
    accidentDate: new Date().toISOString().slice(0, 10),
    accidentTime: '14:00',
    location: '',
    driverName: '',
    accidentDescription: '',
    accidentType: 'Minor Scrape' as const,
    damageDescription: '',
    policeReportNumber: '',
    insuranceClaimNumber: '',
    estimatedRepairCost: 400,
    actualRepairCost: 400,
    insuranceContribution: 300,
    companyContribution: 100,
    thirdPartyContribution: 0,
    workshop: 'Bodyshop Workshop',
    vehicleDowntimeDays: 3,
    status: 'Reported' as const,
  });

  // 7. ADD INVOICE STATE (with multi-items)
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceType: 'Purchase' as InvoiceType,
    companyId: companies[0]?.id || 'comp-1',
    partyId: suppliers[0]?.id || 'sup-1',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    referenceNumber: '',
    purchaseOrderNumber: '',
    vehicleId: defaultVehicle?.id || '',
    currency: 'OMR',
    attachment: null as UploadedFileMeta | null,
    items: [
      {
        id: 'item-1',
        itemCode: 'SRV-01',
        description: 'Fleet Service & Spare Parts',
        quantity: 1,
        unit: 'Job',
        unitPrice: 100,
        discountPercentage: 0,
        discountAmount: 0,
        taxRatePercentage: 5,
        taxAmount: 5,
        lineTotal: 105,
      },
    ],
  });

  // 8. ADD PAYMENT STATE
  const [paymentForm, setPaymentForm] = useState({
    invoiceId: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: 100,
    currency: 'OMR',
    paymentMethod: 'Bank Transfer' as PaymentMethod,
    bankAccountId: bankAccounts[0]?.id || 'ba-1',
    transactionReference: '',
    notes: '',
  });

  // 9. UPLOAD DOCUMENT STATE
  const [docForm, setDocForm] = useState({
    documentName: '',
    documentNumber: '',
    category: 'Registration' as const,
    vehicleId: defaultVehicle?.id || '',
    companyId: defaultVehicle?.companyId || 'comp-1',
    issueDate: new Date().toISOString().slice(0, 10),
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notes: '',
  });

  // 10. ADD EMPLOYEE STATE
  const [empForm, setEmpForm] = useState({
    name: '',
    nationalId: '',
    passportNumber: '',
    designation: 'Heavy Fleet Driver',
    department: 'Fleet & Logistics' as EmployeeDepartment,
    joiningDate: new Date().toISOString().slice(0, 10),
    basicSalary: 650,
    housingAllowance: 150,
    transportAllowance: 100,
    otherAllowances: 50,
    pasiContributionPercentage: 7.0,
    paymentMethod: 'Bank Transfer' as const,
    bankName: 'Bank Muscat',
    accountNumber: '0421098877665544',
    iban: 'OM68BMSC00000421098877665544',
    assignedVehiclePlate: defaultVehicle?.plateNumber || '',
    status: 'Active' as const,
  });

  // 11. RUN PAYROLL STATE
  const [payrollForm, setPayrollForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    paymentDate: new Date().toISOString().slice(0, 10),
    bankAccountId: bankAccounts[0]?.id || 'ba-1',
    autoPostGL: true,
  });

  // 12. RUN DEPRECIATION STATE
  const [deprForm, setDeprForm] = useState({
    periodLabel: 'August 2026',
    runDate: new Date().toISOString().slice(0, 10),
    notes: 'Monthly automatic depreciation amortization run for fleet and workshop fixed assets.',
    autoPostGL: true,
  });

  // 13. ADD SUPPLIER STATE
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    supplierType: 'Garage' as const,
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    city: 'Muscat',
    country: 'Oman',
    vatNumber: '',
    taxNumber: '',
    paymentTermsDays: 30,
    creditLimit: 20000,
    openingBalance: 0,
    status: 'Active' as const,
  });

  // 14. ADD CUSTOMER STATE
  const [customerForm, setCustomerForm] = useState({
    name: '',
    customerType: 'Corporate' as const,
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    city: 'Muscat',
    country: 'Oman',
    vatNumber: '',
    taxNumber: '',
    paymentTermsDays: 45,
    creditLimit: 50000,
    openingBalance: 0,
    status: 'Active' as const,
  });

  // 15. ADD TYRE STATE
  const [tyreForm, setTyreForm] = useState({
    vehicleId: defaultVehicle?.id || '',
    companyId: defaultVehicle?.companyId || 'comp-1',
    serialNumber: '',
    brand: 'Bridgestone',
    model: 'R22.5 Heavy Haulage',
    size: '295/80R22.5',
    position: 'Front Left (Steer)',
    dotNumber: 'DOT-2026',
    treadDepthMm: 16.0,
    psi: 120,
    purchaseDate: new Date().toISOString().slice(0, 10),
    purchaseCost: 150,
    supplierId: suppliers[0]?.id || 'sup-5',
    notes: '',
  });

  // 16. ADD FIXED ASSET STATE
  const [assetForm, setAssetForm] = useState({
    name: '',
    category: 'Workshop Equipment' as import('../../types/finance').FixedAssetCategory,
    companyId: companies[0]?.id || 'comp-1',
    purchaseDate: new Date().toISOString().slice(0, 10),
    purchaseCost: 5000,
    salvageValue: 500,
    depreciationMethod: 'Straight-Line' as const,
    annualRatePercentage: 20,
    usefulLifeYears: 5,
    location: 'Muscat Central Workshop',
    serialNumber: '',
    assignedVehicleId: '',
    notes: '',
  });

  // Sync modal form targets when selectedVehicleId changes
  useEffect(() => {
    if (selectedVehicleId && quickModal) {
      const target = vehicles.find(v => v.id === selectedVehicleId);
      if (target) {
        setMntForm(prev => ({ ...prev, vehicleId: target.id, companyId: target.companyId, odometerReading: target.currentMileage }));
        setWoForm(prev => ({ ...prev, vehicleId: target.id, companyId: target.companyId }));
        setOilForm(prev => ({ ...prev, vehicleId: target.id, odometer: target.currentMileage }));
        setExpForm(prev => ({ ...prev, vehicleId: target.id, companyId: target.companyId }));
        setAccForm(prev => ({ ...prev, vehicleId: target.id, companyId: target.companyId }));
        setDocForm(prev => ({ ...prev, vehicleId: target.id, companyId: target.companyId }));
        setInvoiceForm(prev => ({ ...prev, vehicleId: target.id, companyId: target.companyId }));
        setTyreForm(prev => ({ ...prev, vehicleId: target.id, companyId: target.companyId }));
      }
    }
  }, [selectedVehicleId, quickModal, vehicles]);

  // Handlers
  const handleCreateVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleForm.plateNumber || !vehicleForm.brand || !vehicleForm.model) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Plate number, Brand, and Model are required.' });
      return;
    }
    const comp = companies.find(c => c.id === vehicleForm.companyId);
    const sup = suppliers.find(s => s.id === vehicleForm.supplierId);

    addVehicle({
      vehicleId: vehicleForm.vehicleId,
      companyId: vehicleForm.companyId,
      companyName: comp?.name || 'Company',
      plateNumber: vehicleForm.plateNumber,
      registrationNumber: vehicleForm.registrationNumber || `REG-${vehicleForm.plateNumber}`,
      vin: vehicleForm.vin || `VIN-${Date.now()}`,
      engineNumber: vehicleForm.engineNumber || 'ENG-10029',
      vehicleType: vehicleForm.vehicleType,
      vehicleCategory: vehicleForm.vehicleCategory,
      brand: vehicleForm.brand,
      manufacturer: vehicleForm.manufacturer || vehicleForm.brand,
      model: vehicleForm.model,
      variant: vehicleForm.variant || 'Standard',
      manufacturingYear: Number(vehicleForm.manufacturingYear),
      registrationDate: vehicleForm.registrationDate,
      registrationExpiryDate: vehicleForm.registrationExpiryDate,
      countryOfRegistration: vehicleForm.countryOfRegistration,
      color: vehicleForm.color,
      fuelType: vehicleForm.fuelType,
      transmission: vehicleForm.transmission,
      engineCapacityCc: Number(vehicleForm.engineCapacityCc),
      numberOfSeats: Number(vehicleForm.numberOfSeats),
      currentMileage: Number(vehicleForm.currentMileage),
      initialOdometer: Number(vehicleForm.initialOdometer),
      status: vehicleForm.status,
      photoUrl: vehicleForm.photoUrl,
      assignedDriver: vehicleForm.assignedDriver,
      department: vehicleForm.department,
      location: vehicleForm.location,
      purchase: {
        purchaseDate: vehicleForm.registrationDate,
        purchaseValue: Number(vehicleForm.purchaseValue),
        purchaseInvoiceNumber: `PINV-ACQ-${Date.now().toString().slice(-4)}`,
        supplierId: vehicleForm.supplierId,
        supplierName: sup?.name || 'Dealer',
        paymentMethod: 'Bank Transfer',
      },
      depreciation: {
        depreciationMethod: vehicleForm.depreciationMethod,
        usefulLifeYears: Number(vehicleForm.usefulLifeYears),
        annualRatePercentage: 100 / Number(vehicleForm.usefulLifeYears),
        salvageValue: Number(vehicleForm.salvageValue),
      },
      oilConfig: {
        oilType: vehicleForm.oilGrade,
        oilBrand: vehicleForm.oilBrand,
        oilGrade: vehicleForm.oilGrade,
        intervalKm: Number(vehicleForm.oilIntervalKm),
        intervalMonths: 6,
        estimatedCost: 35,
        capacityLitres: 6.5,
      },
      currentMarketValue: Number(vehicleForm.purchaseValue) * 0.9,
      marketValueUpdatedDate: new Date().toISOString().slice(0, 10),
      insuranceProvider: 'Oman United Insurance Co',
      insurancePolicyNumber: `POL-${Date.now().toString().slice(-4)}`,
      insuranceExpiryDate: vehicleForm.registrationExpiryDate,
      insurancePremiumAnnual: 300,
    });

    addToast({ type: 'success', title: 'Vehicle Created', message: `${vehicleForm.brand} ${vehicleForm.model} (${vehicleForm.plateNumber}) added to fleet.` });
    closeQuickModal();
  };

  const handleCreateMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === mntForm.vehicleId);
    const sup = suppliers.find(s => s.id === mntForm.supplierId);
    const total = Number(mntForm.partsCost) + Number(mntForm.labourCost) + Number(mntForm.tax) + Number(mntForm.otherCharges) - Number(mntForm.discount);

    addMaintenanceRecord({
      vehicleId: mntForm.vehicleId,
      vehiclePlate: v?.plateNumber || 'Vehicle',
      companyId: v?.companyId || 'comp-1',
      maintenanceDate: mntForm.maintenanceDate,
      maintenanceType: mntForm.maintenanceType,
      category: mntForm.category,
      description: mntForm.description,
      odometerReading: Number(mntForm.odometerReading),
      serviceCentre: mntForm.serviceCentre,
      supplierId: mntForm.supplierId,
      supplierName: sup?.name || 'Workshop',
      partsCost: Number(mntForm.partsCost),
      labourCost: Number(mntForm.labourCost),
      tax: Number(mntForm.tax),
      discount: Number(mntForm.discount),
      otherCharges: Number(mntForm.otherCharges),
      totalCost: total,
      paymentStatus: mntForm.paymentStatus,
    });

    addToast({ type: 'success', title: 'Maintenance Logged', message: `Recorded ${mntForm.category} for ${v?.plateNumber}. Total: ${total.toFixed(3)} OMR` });
    closeQuickModal();
  };

  const handleCreateWorkOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === woForm.vehicleId);
    const sup = suppliers.find(s => s.id === woForm.supplierId);

    addWorkOrder({
      vehicleId: woForm.vehicleId,
      vehiclePlate: v?.plateNumber || 'Vehicle',
      companyId: v?.companyId || 'comp-1',
      reportedDate: woForm.reportedDate,
      problemDescription: woForm.problemDescription,
      requestedBy: 'usr-1',
      requestedByName: woForm.requestedByName,
      workshop: woForm.workshop,
      supplierId: woForm.supplierId,
      supplierName: sup?.name || woForm.workshop,
      priority: woForm.priority,
      status: 'Requested',
      estimatedCost: Number(woForm.estimatedCost),
      partsCharges: Number(woForm.estimatedCost) * 0.65,
      labourCharges: Number(woForm.estimatedCost) * 0.3,
      additionalCharges: 0,
      tax: Number(woForm.estimatedCost) * 0.05,
      finalCost: Number(woForm.estimatedCost),
      partsRequired: woForm.partsRequired,
      approvalStatus: 'Not Required',
      notes: woForm.notes,
    });

    addToast({ type: 'success', title: 'Work Order Created', message: `Work order dispatched for ${v?.plateNumber}.` });
    closeQuickModal();
  };

  const handleCreateOilChange = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === oilForm.vehicleId);
    const sup = suppliers.find(s => s.id === oilForm.supplierId);
    const total = Number(oilForm.oilCost) + Number(oilForm.filterCost) + Number(oilForm.labourCost) + Number(oilForm.tax);

    addOilChange({
      vehicleId: oilForm.vehicleId,
      date: oilForm.date,
      odometer: Number(oilForm.odometer),
      oilType: oilForm.oilType,
      oilBrand: oilForm.oilBrand,
      oilGrade: oilForm.oilGrade,
      quantityLitres: Number(oilForm.quantityLitres),
      oilCost: Number(oilForm.oilCost),
      filterCost: Number(oilForm.filterCost),
      labourCost: Number(oilForm.labourCost),
      tax: Number(oilForm.tax),
      totalCost: total,
      supplierId: oilForm.supplierId,
      supplierName: sup?.name,
      nextOilChangeMileage: Number(oilForm.odometer) + (v?.oilConfig.intervalKm || 10000),
      nextOilChangeDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      notes: oilForm.notes,
    });

    addToast({ type: 'success', title: 'Oil Service Saved', message: `Updated oil change interval for ${v?.plateNumber}.` });
    closeQuickModal();
  };

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === expForm.vehicleId);
    const sup = suppliers.find(s => s.id === expForm.supplierId);
    const total = Number(expForm.quantity) * Number(expForm.unitPrice) + Number(expForm.tax);

    addExpense({
      vehicleId: expForm.vehicleId,
      vehiclePlate: v?.plateNumber || 'Vehicle',
      companyId: v?.companyId || 'comp-1',
      date: expForm.date,
      category: expForm.category,
      supplierId: expForm.supplierId,
      supplierName: sup?.name,
      description: expForm.description,
      quantity: Number(expForm.quantity),
      unitPrice: Number(expForm.unitPrice),
      tax: Number(expForm.tax),
      total,
      paymentMethod: expForm.paymentMethod,
      costCentre: expForm.costCentre,
      attachmentUrl: expForm.attachment?.url,
      attachmentName: expForm.attachment?.name,
      attachmentSize: expForm.attachment?.size,
      attachmentType: expForm.attachment?.type,
    });

    addToast({ type: 'success', title: 'Expense Added', message: `Logged ${expForm.category} expense of ${total.toFixed(3)} OMR with attached receipt.` });
    closeQuickModal();
  };

  const handleCreateAccident = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === accForm.vehicleId);
    const sup = suppliers.find(s => s.id === mntForm.supplierId);

    addAccident({
      vehicleId: accForm.vehicleId,
      vehiclePlate: v?.plateNumber || 'Vehicle',
      companyId: accForm.companyId || 'comp-1',
      accidentDate: accForm.accidentDate,
      accidentTime: accForm.accidentTime,
      location: accForm.location,
      driverName: accForm.driverName,
      accidentDescription: accForm.accidentDescription,
      accidentType: accForm.accidentType,
      damageDescription: accForm.damageDescription,
      policeReportNumber: accForm.policeReportNumber,
      insuranceClaimNumber: accForm.insuranceClaimNumber,
      estimatedRepairCost: Number(accForm.estimatedRepairCost),
      actualRepairCost: Number(accForm.actualRepairCost),
      insuranceContribution: Number(accForm.insuranceContribution),
      companyContribution: Number(accForm.companyContribution),
      thirdPartyContribution: Number(accForm.thirdPartyContribution),
      workshop: accForm.workshop,
      vehicleDowntimeDays: Number(accForm.vehicleDowntimeDays),
      status: accForm.status,
    });

    addToast({ type: 'warning', title: 'Accident Recorded', message: `Reported accident case for ${v?.plateNumber}.` });
    closeQuickModal();
  };

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const isPurchase = invoiceForm.invoiceType === 'Purchase';
    const party = isPurchase ? suppliers.find(s => s.id === invoiceForm.partyId) : customers.find(c => c.id === invoiceForm.partyId);
    const comp = companies.find(c => c.id === invoiceForm.companyId);
    const v = vehicles.find(veh => veh.id === invoiceForm.vehicleId);

    const subtotal = invoiceForm.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const discount = invoiceForm.items.reduce((s, it) => s + it.discountAmount, 0);
    const tax = invoiceForm.items.reduce((s, it) => s + it.taxAmount, 0);
    const grandTotal = subtotal - discount + tax;

    addInvoice({
      invoiceType: invoiceForm.invoiceType,
      companyId: invoiceForm.companyId,
      companyName: comp?.name || 'Company',
      partyType: isPurchase ? 'Supplier' : 'Customer',
      partyId: invoiceForm.partyId,
      partyName: party?.name || 'Entity',
      partyVatNumber: party?.vatNumber,
      partyAddress: party?.address,
      partyEmail: party?.email,
      partyPhone: party?.phone,
      invoiceDate: invoiceForm.invoiceDate,
      dueDate: invoiceForm.dueDate,
      referenceNumber: invoiceForm.referenceNumber,
      purchaseOrderNumber: invoiceForm.purchaseOrderNumber,
      vehicleId: invoiceForm.vehicleId,
      vehiclePlate: v?.plateNumber,
      currency: invoiceForm.currency,
      exchangeRate: 1.0,
      items: invoiceForm.items,
      subtotal,
      discountTotal: discount,
      taxTotal: tax,
      otherCharges: 0,
      grandTotal,
      paymentStatus: 'Unpaid',
      approvalStatus: 'Approved',
      paymentTermsDays: 30,
      attachmentUrl: invoiceForm.attachment?.url,
      attachmentName: invoiceForm.attachment?.name,
      attachmentSize: invoiceForm.attachment?.size,
      attachmentType: invoiceForm.attachment?.type,
    });

    addToast({ type: 'success', title: 'Invoice Generated', message: `Created ${invoiceForm.invoiceType} invoice for ${grandTotal.toFixed(3)} OMR.` });
    closeQuickModal();
  };

  const handleCreatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    // find invoice
    const inv = invoices.find(i => i.id === paymentForm.invoiceId) || invoices[0];
    if (!inv) {
      addToast({ type: 'error', title: 'Select an invoice first' });
      return;
    }
    const ba = bankAccounts.find(b => b.id === paymentForm.bankAccountId);

    addPayment({
      companyId: inv.companyId,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      invoiceType: inv.invoiceType,
      partyType: inv.partyType,
      partyId: inv.partyId,
      partyName: inv.partyName,
      paymentDate: paymentForm.paymentDate,
      amount: Number(paymentForm.amount),
      currency: paymentForm.currency,
      paymentMethod: paymentForm.paymentMethod,
      bankAccountId: paymentForm.bankAccountId,
      bankAccountName: ba?.accountName || 'Bank Account',
      transactionReference: paymentForm.transactionReference || `TXN-${Date.now().toString().slice(-4)}`,
      notes: paymentForm.notes,
    });

    addToast({ type: 'success', title: 'Payment Processed', message: `Recorded payment of ${Number(paymentForm.amount).toFixed(3)} OMR.` });
    closeQuickModal();
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Supplier name is required.' });
      return;
    }
    addSupplier({
      name: supplierForm.name,
      supplierType: supplierForm.supplierType,
      contactPerson: supplierForm.contactPerson || 'Procurement',
      phone: supplierForm.phone || '+968 2400 0000',
      email: supplierForm.email || 'info@supplier.om',
      address: supplierForm.address || 'Muscat, Oman',
      city: supplierForm.city || 'Muscat',
      country: supplierForm.country || 'Oman',
      vatNumber: supplierForm.vatNumber || 'OM1100223344',
      taxNumber: supplierForm.taxNumber || 'OM-TAX-9988',
      paymentTermsDays: Number(supplierForm.paymentTermsDays) || 30,
      creditLimit: Number(supplierForm.creditLimit) || 10000,
      openingBalance: Number(supplierForm.openingBalance) || 0,
      status: supplierForm.status,
      bankDetails: {
        bankName: 'Bank Muscat',
        accountNumber: '0421000000000',
        iban: 'OM68BMSC00000000000000',
        swiftCode: 'BMSCOM2X',
      },
      notes: 'Registered via Quick Actions',
    });
    addToast({ type: 'success', title: 'Supplier Created', message: `Registered supplier ${supplierForm.name}.` });
    closeQuickModal();
  };

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Customer name is required.' });
      return;
    }
    addCustomer({
      name: customerForm.name,
      customerType: customerForm.customerType,
      contactPerson: customerForm.contactPerson || 'Accounts Payable',
      phone: customerForm.phone || '+968 2400 1111',
      email: customerForm.email || 'billing@client.om',
      address: customerForm.address || 'Muscat, Oman',
      city: customerForm.city || 'Muscat',
      country: customerForm.country || 'Oman',
      vatNumber: customerForm.vatNumber || 'OM2200334455',
      taxNumber: customerForm.taxNumber || 'OM-TAX-5544',
      paymentTermsDays: Number(customerForm.paymentTermsDays) || 45,
      creditLimit: Number(customerForm.creditLimit) || 50000,
      openingBalance: Number(customerForm.openingBalance) || 0,
      status: customerForm.status,
    });
    addToast({ type: 'success', title: 'Customer Created', message: `Registered customer ${customerForm.name}.` });
    closeQuickModal();
  };

  const handleCreateTyre = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === tyreForm.vehicleId) || vehicles[0];
    const sup = suppliers.find(s => s.id === tyreForm.supplierId);
    addTyre({
      vehicleId: v?.id || '',
      brand: tyreForm.brand || 'Bridgestone',
      model: tyreForm.model || 'R22.5 Heavy Haulage',
      size: tyreForm.size || '295/80R22.5',
      serialNumber: tyreForm.serialNumber || `TYR-${Date.now().toString().slice(-6)}`,
      position: tyreForm.position as any,
      purchaseDate: tyreForm.purchaseDate,
      purchaseCost: Number(tyreForm.purchaseCost) || 150,
      installationDate: tyreForm.purchaseDate,
      installationMileage: v?.currentMileage || 0,
      expectedLifeKm: 60000,
      currentMileage: 0,
      treadDepthMm: Number(tyreForm.treadDepthMm) || 16.0,
      supplierId: tyreForm.supplierId,
      supplierName: sup?.name,
      status: 'Good',
      notes: tyreForm.notes,
    });
    addToast({ type: 'success', title: 'Tyre Logged', message: `Added ${tyreForm.brand} tyre to vehicle ${v?.plateNumber || ''}.` });
    closeQuickModal();
  };

  const handleCreateFixedAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetForm.name || !assetForm.purchaseCost) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Asset name and purchase cost are required.' });
      return;
    }
    const cost = Number(assetForm.purchaseCost);
    const salvage = Number(assetForm.salvageValue) || 0;
    const lifeYears = Number(assetForm.usefulLifeYears) || 5;
    const annualRate = Number(assetForm.annualRatePercentage) || (lifeYears > 0 ? 100 / lifeYears : 20);
    const assignedVeh = vehicles.find(v => v.id === assetForm.assignedVehicleId);

    const isVehicle = assetForm.category === 'Fleet Vehicle';
    const isEquipment = assetForm.category === 'Workshop Equipment';

    addFixedAsset({
      name: assetForm.name,
      category: assetForm.category,
      companyId: assetForm.companyId || 'comp-1',
      location: assetForm.location || 'Muscat HQ',
      department: isVehicle ? 'Fleet Operations' : isEquipment ? 'Workshop' : 'Administration',
      purchaseDate: assetForm.purchaseDate,
      purchaseCost: cost,
      salvageValue: salvage,
      usefulLifeYears: lifeYears,
      annualRatePercentage: annualRate,
      depreciationMethod: assetForm.depreciationMethod,
      accumulatedDepreciation: 0,
      currentBookValue: cost,
      glAssetAccount: isVehicle ? '1500' : isEquipment ? '1530' : '1550',
      glDepreciationExpenseAccount: '5080',
      glAccumulatedDepreciationAccount: '1520',
      status: 'Active',
      vehicleId: assetForm.assignedVehicleId || undefined,
      serialNumber: assetForm.serialNumber || undefined,
      serialOrPlateNumber: assignedVeh?.plateNumber || assetForm.serialNumber || undefined,
      notes: assetForm.notes,
    });
    addToast({ type: 'success', title: 'Fixed Asset Registered', message: `Added ${assetForm.name} (${cost.toFixed(3)} OMR) to registry.` });
    closeQuickModal();
  };

  const handleUploadDocument = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === docForm.vehicleId);

    addDocument({
      documentName: docForm.documentName || 'Document_Attachment.pdf',
      documentNumber: docForm.documentNumber,
      category: docForm.category,
      vehicleId: docForm.vehicleId,
      vehiclePlate: v?.plateNumber,
      companyId: docForm.companyId,
      issueDate: docForm.issueDate,
      expiryDate: docForm.expiryDate,
      notes: docForm.notes,
      documentUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1000&auto=format&fit=crop&q=80',
    });

    addToast({ type: 'success', title: 'Document Uploaded', message: `Saved document ${docForm.documentName} to registry.` });
    closeQuickModal();
  };

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.name || !empForm.basicSalary) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Employee name and basic salary are required.' });
      return;
    }

    addEmployee({
      companyId: 'comp-1',
      name: empForm.name,
      nationalId: empForm.nationalId || `NID-${Date.now().toString().slice(-6)}`,
      passportNumber: empForm.passportNumber,
      designation: empForm.designation,
      department: empForm.department,
      joiningDate: empForm.joiningDate,
      basicSalary: Number(empForm.basicSalary),
      housingAllowance: Number(empForm.housingAllowance),
      transportAllowance: Number(empForm.transportAllowance),
      otherAllowances: Number(empForm.otherAllowances),
      totalGrossSalary: Number(empForm.basicSalary) + Number(empForm.housingAllowance) + Number(empForm.transportAllowance) + Number(empForm.otherAllowances),
      pasiContributionPercentage: Number(empForm.pasiContributionPercentage),
      paymentMethod: empForm.paymentMethod,
      bankName: empForm.bankName,
      accountNumber: empForm.accountNumber,
      iban: empForm.iban,
      assignedVehiclePlate: empForm.assignedVehiclePlate,
      status: empForm.status,
    });

    addToast({ type: 'success', title: 'Employee Enrolled', message: `Added ${empForm.name} to HR employee directory.` });
    closeQuickModal();
  };

  const handleRunPayroll = (e: React.FormEvent) => {
    e.preventDefault();
    const run = processPayrollRun({
      month: Number(payrollForm.month),
      year: Number(payrollForm.year),
      paymentDate: payrollForm.paymentDate,
      bankAccountId: payrollForm.bankAccountId,
      autoPostGL: payrollForm.autoPostGL,
    });

    addToast({
      type: 'success',
      title: 'Payroll Disbursed',
      message: `Processed WPS payroll ${run.periodLabel} with net payout of ${run.totalNetPayout.toFixed(3)} OMR.`,
    });
    closeQuickModal();
  };

  const handleRunDepreciation = (e: React.FormEvent) => {
    e.preventDefault();
    const run = runAutoDepreciation({
      periodLabel: deprForm.periodLabel,
      runDate: deprForm.runDate,
      notes: deprForm.notes,
      autoPostGL: deprForm.autoPostGL,
    });

    addToast({
      type: 'success',
      title: 'Auto-Depreciation Complete',
      message: `Depreciated ${run.totalAssetsProcessed} assets for ${run.totalDepreciationAmount.toFixed(3)} OMR. Posted to GL.`,
    });
    closeQuickModal();
  };

  return (
    <>
      {/* 1. ADD VEHICLE MODAL */}
      <Modal
        isOpen={quickModal === 'add-vehicle'}
        onClose={closeQuickModal}
        title="Add New Vehicle to Fleet"
        description="Register a new vehicle with specifications, purchase details, and maintenance config"
        size="2xl"
      >
        <form onSubmit={handleCreateVehicle} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Vehicle ID" value={vehicleForm.vehicleId} onChange={e => setVehicleForm({ ...vehicleForm, vehicleId: e.target.value })} required />
            <Input label="Plate Number" placeholder="e.g. 1234 ABC" value={vehicleForm.plateNumber} onChange={e => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })} required />
            <Select label="Assigned Office / Branch" value={vehicleForm.companyId} onChange={e => setVehicleForm({ ...vehicleForm, companyId: e.target.value })}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input label="Brand / Make" placeholder="e.g. Toyota" value={vehicleForm.brand} onChange={e => setVehicleForm({ ...vehicleForm, brand: e.target.value })} required />
            <Input label="Model" placeholder="e.g. Land Cruiser" value={vehicleForm.model} onChange={e => setVehicleForm({ ...vehicleForm, model: e.target.value })} required />
            <Input label="Variant" placeholder="e.g. VXR 4.0L" value={vehicleForm.variant} onChange={e => setVehicleForm({ ...vehicleForm, variant: e.target.value })} />
            <Input label="Year" type="number" value={vehicleForm.manufacturingYear} onChange={e => setVehicleForm({ ...vehicleForm, manufacturingYear: Number(e.target.value) })} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Select label="Type" value={vehicleForm.vehicleType} onChange={e => setVehicleForm({ ...vehicleForm, vehicleType: e.target.value as any })}>
              <option value="SUV">SUV</option>
              <option value="Sedan">Sedan</option>
              <option value="Pickup">Pickup</option>
              <option value="Truck">Truck</option>
              <option value="Van">Van</option>
              <option value="Bus">Bus</option>
            </Select>
            <Select label="Category" value={vehicleForm.vehicleCategory} onChange={e => setVehicleForm({ ...vehicleForm, vehicleCategory: e.target.value as any })}>
              <option value="Executive">Executive</option>
              <option value="Operations">Operations</option>
              <option value="Logistics">Logistics</option>
              <option value="Service">Service</option>
              <option value="Sales">Sales</option>
            </Select>
            <Select label="Fuel Type" value={vehicleForm.fuelType} onChange={e => setVehicleForm({ ...vehicleForm, fuelType: e.target.value as any })}>
              <option value="Petrol">Petrol</option>
              <option value="Diesel">Diesel</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Electric">Electric</option>
            </Select>
            <Input label="Current Mileage (KM)" type="number" value={vehicleForm.currentMileage} onChange={e => setVehicleForm({ ...vehicleForm, currentMileage: Number(e.target.value) })} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="VIN / Chassis Number" placeholder="17-character VIN" value={vehicleForm.vin} onChange={e => setVehicleForm({ ...vehicleForm, vin: e.target.value })} />
            <Input label="Purchase Value (OMR)" type="number" step="0.001" value={vehicleForm.purchaseValue} onChange={e => setVehicleForm({ ...vehicleForm, purchaseValue: Number(e.target.value) })} required />
            <Select label="Supplier / Dealer" value={vehicleForm.supplierId} onChange={e => setVehicleForm({ ...vehicleForm, supplierId: e.target.value })}>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Assigned Driver" placeholder="Driver name" value={vehicleForm.assignedDriver} onChange={e => setVehicleForm({ ...vehicleForm, assignedDriver: e.target.value })} />
            <Input label="Department" value={vehicleForm.department} onChange={e => setVehicleForm({ ...vehicleForm, department: e.target.value })} />
            <Input label="Location" value={vehicleForm.location} onChange={e => setVehicleForm({ ...vehicleForm, location: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Car className="w-4 h-4" />}>Save Vehicle</Button>
          </div>
        </form>
      </Modal>

      {/* 2. ADD MAINTENANCE MODAL */}
      <Modal
        isOpen={quickModal === 'add-maintenance'}
        onClose={closeQuickModal}
        title="Record Vehicle Maintenance"
        description="Log service history, replacement parts, labour cost, and supplier invoices"
        size="xl"
      >
        <form onSubmit={handleCreateMaintenance} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select label="Vehicle" value={mntForm.vehicleId} onChange={e => setMntForm({ ...mntForm, vehicleId: e.target.value })} required>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
            </Select>
            <Select label="Category" value={mntForm.category} onChange={e => setMntForm({ ...mntForm, category: e.target.value as any })}>
              <option value="General Service">General Service</option>
              <option value="Brake Service">Brake Service</option>
              <option value="Engine Repair">Engine Repair</option>
              <option value="Transmission Repair">Transmission Repair</option>
              <option value="Electrical">Electrical</option>
              <option value="AC Repair">AC Repair</option>
              <option value="Suspension">Suspension</option>
              <option value="Tyres">Tyres</option>
              <option value="Body Repair">Body Repair</option>
            </Select>
            <Input label="Date" type="date" value={mntForm.maintenanceDate} onChange={e => setMntForm({ ...mntForm, maintenanceDate: e.target.value })} required />
          </div>

          <Textarea label="Work Description" placeholder="Details of service performed and replacement parts fitted..." value={mntForm.description} onChange={e => setMntForm({ ...mntForm, description: e.target.value })} required />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Odometer Reading (KM)" type="number" value={mntForm.odometerReading} onChange={e => setMntForm({ ...mntForm, odometerReading: Number(e.target.value) })} />
            <Select label="Workshop / Supplier" value={mntForm.supplierId} onChange={e => setMntForm({ ...mntForm, supplierId: e.target.value })}>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input label="Service Centre Name" value={mntForm.serviceCentre} onChange={e => setMntForm({ ...mntForm, serviceCentre: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <Input label="Parts (OMR)" type="number" step="0.001" value={mntForm.partsCost} onChange={e => setMntForm({ ...mntForm, partsCost: Number(e.target.value) })} />
            <Input label="Labour (OMR)" type="number" step="0.001" value={mntForm.labourCost} onChange={e => setMntForm({ ...mntForm, labourCost: Number(e.target.value) })} />
            <Input label="Tax 5% (OMR)" type="number" step="0.001" value={mntForm.tax} onChange={e => setMntForm({ ...mntForm, tax: Number(e.target.value) })} />
            <Input label="Discount (OMR)" type="number" step="0.001" value={mntForm.discount} onChange={e => setMntForm({ ...mntForm, discount: Number(e.target.value) })} />
            <Select label="Payment Status" value={mntForm.paymentStatus} onChange={e => setMntForm({ ...mntForm, paymentStatus: e.target.value as any })}>
              <option value="Unpaid">Unpaid (Credit)</option>
              <option value="Paid">Paid</option>
              <option value="Partially Paid">Partially Paid</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Wrench className="w-4 h-4" />}>Save Maintenance Record</Button>
          </div>
        </form>
      </Modal>

      {/* 3. ADD WORK ORDER MODAL */}
      <Modal
        isOpen={quickModal === 'add-work-order'}
        onClose={closeQuickModal}
        title="Create Maintenance Work Order"
        description="Dispatch workshop job order with priority, cost estimate, and parts requirement"
        size="lg"
      >
        <form onSubmit={handleCreateWorkOrder} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Vehicle" value={woForm.vehicleId} onChange={e => setWoForm({ ...woForm, vehicleId: e.target.value })} required>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
            </Select>
            <Select label="Priority" value={woForm.priority} onChange={e => setWoForm({ ...woForm, priority: e.target.value as any })}>
              <option value="Low">Low Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="High">High Priority</option>
              <option value="Critical">Critical Emergency</option>
            </Select>
          </div>

          <Textarea label="Problem Description" placeholder="Describe reported vehicle fault, noises, or inspection findings..." value={woForm.problemDescription} onChange={e => setWoForm({ ...woForm, problemDescription: e.target.value })} required />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select label="Assigned Supplier / Workshop" value={woForm.supplierId} onChange={e => setWoForm({ ...woForm, supplierId: e.target.value })}>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input label="Estimated Cost (OMR)" type="number" step="0.001" value={woForm.estimatedCost} onChange={e => setWoForm({ ...woForm, estimatedCost: Number(e.target.value) })} required />
            <Input label="Requested By" value={woForm.requestedByName} onChange={e => setWoForm({ ...woForm, requestedByName: e.target.value })} />
          </div>

          <Input label="Parts Required" placeholder="e.g. Front Brake Pads, Brake Fluid DOT 4" value={woForm.partsRequired} onChange={e => setWoForm({ ...woForm, partsRequired: e.target.value })} />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Wrench className="w-4 h-4" />}>Dispatch Work Order</Button>
          </div>
        </form>
      </Modal>

      {/* 4. ADD OIL CHANGE MODAL */}
      <Modal
        isOpen={quickModal === 'add-oil-change'}
        onClose={closeQuickModal}
        title="Record Oil Change Service"
        description="Update engine lubrication service and automatically calculate next due mileage"
        size="lg"
      >
        <form onSubmit={handleCreateOilChange} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select label="Vehicle" value={oilForm.vehicleId} onChange={e => setOilForm({ ...oilForm, vehicleId: e.target.value })} required>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
            </Select>
            <Input label="Odometer (KM)" type="number" value={oilForm.odometer} onChange={e => setOilForm({ ...oilForm, odometer: Number(e.target.value) })} required />
            <Input label="Date" type="date" value={oilForm.date} onChange={e => setOilForm({ ...oilForm, date: e.target.value })} required />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Oil Brand" value={oilForm.oilBrand} onChange={e => setOilForm({ ...oilForm, oilBrand: e.target.value })} />
            <Input label="Oil Grade" value={oilForm.oilGrade} onChange={e => setOilForm({ ...oilForm, oilGrade: e.target.value })} />
            <Input label="Quantity (Litres)" type="number" step="0.1" value={oilForm.quantityLitres} onChange={e => setOilForm({ ...oilForm, quantityLitres: Number(e.target.value) })} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <Input label="Oil Cost (OMR)" type="number" step="0.001" value={oilForm.oilCost} onChange={e => setOilForm({ ...oilForm, oilCost: Number(e.target.value) })} />
            <Input label="Filter Cost (OMR)" type="number" step="0.001" value={oilForm.filterCost} onChange={e => setOilForm({ ...oilForm, filterCost: Number(e.target.value) })} />
            <Input label="Labour Cost (OMR)" type="number" step="0.001" value={oilForm.labourCost} onChange={e => setOilForm({ ...oilForm, labourCost: Number(e.target.value) })} />
            <Input label="Tax 5% (OMR)" type="number" step="0.001" value={oilForm.tax} onChange={e => setOilForm({ ...oilForm, tax: Number(e.target.value) })} />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Droplet className="w-4 h-4" />}>Save Oil Service</Button>
          </div>
        </form>
      </Modal>

      {/* 5. ADD EXPENSE MODAL */}
      <Modal
        isOpen={quickModal === 'add-expense'}
        onClose={closeQuickModal}
        title="Add Vehicle Expense & Entry Bill"
        description="Log operational costs such as fuel, tolls, insurance, permits, and fines with scanned receipts"
        size="lg"
      >
        <form onSubmit={handleCreateExpense} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select label="Vehicle" value={expForm.vehicleId} onChange={e => setExpForm({ ...expForm, vehicleId: e.target.value })} required>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
            </Select>
            <Select label="Category" value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value as any })}>
              <option value="Fuel">Fuel & Lubricants</option>
              <option value="Insurance">Insurance</option>
              <option value="Registration">Registration / Mulkiya</option>
              <option value="Toll">Tolls & Border Fees</option>
              <option value="Parking">Parking</option>
              <option value="Cleaning">Cleaning & Detailing</option>
              <option value="Fines">Traffic Fines</option>
              <option value="Driver Expense">Driver Allowances</option>
              <option value="Other">Other Expenses</option>
            </Select>
            <Input label="Date" type="date" value={expForm.date} onChange={e => setExpForm({ ...expForm, date: e.target.value })} required />
          </div>

          <Input label="Description" placeholder="e.g. Fuel Refill Mogas 95 (78 Litres)" value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} required />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input label="Quantity" type="number" step="0.1" value={expForm.quantity} onChange={e => setExpForm({ ...expForm, quantity: Number(e.target.value) })} />
            <Input label="Unit Price (OMR)" type="number" step="0.001" value={expForm.unitPrice} onChange={e => setExpForm({ ...expForm, unitPrice: Number(e.target.value) })} />
            <Input label="Tax 5% (OMR)" type="number" step="0.001" value={expForm.tax} onChange={e => setExpForm({ ...expForm, tax: Number(e.target.value) })} />
            <Input label="Payment Method" value={expForm.paymentMethod} onChange={e => setExpForm({ ...expForm, paymentMethod: e.target.value })} />
          </div>

          {/* Document Upload Zone for Entry Bill */}
          <DocumentUploadZone
            label="Attach Receipt / Entry Bill Scan"
            description="Upload scanned fuel bill, payment receipt or invoice voucher"
            value={expForm.attachment}
            onChange={file => setExpForm({ ...expForm, attachment: file })}
            onOcrExtract={data => {
              if (data.amount) {
                setExpForm(prev => ({ ...prev, unitPrice: data.amount!, tax: data.tax || prev.tax }));
              }
              if (data.description) {
                setExpForm(prev => ({ ...prev, description: data.description! }));
              }
            }}
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<DollarSign className="w-4 h-4" />}>Save Expense</Button>
          </div>
        </form>
      </Modal>

      {/* 6. ADD ACCIDENT MODAL */}
      <Modal
        isOpen={quickModal === 'add-accident'}
        onClose={closeQuickModal}
        title="Report Vehicle Accident Case"
        description="Record collision details, police report, insurance claims, and downtime days"
        size="xl"
      >
        <form onSubmit={handleCreateAccident} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select label="Vehicle" value={accForm.vehicleId} onChange={e => setAccForm({ ...accForm, vehicleId: e.target.value })} required>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
            </Select>
            <Input label="Accident Date" type="date" value={accForm.accidentDate} onChange={e => setAccForm({ ...accForm, accidentDate: e.target.value })} required />
            <Input label="Time" type="time" value={accForm.accidentTime} onChange={e => setAccForm({ ...accForm, accidentTime: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Location" placeholder="e.g. Sultan Qaboos Highway near Azaiba" value={accForm.location} onChange={e => setAccForm({ ...accForm, location: e.target.value })} required />
            <Input label="Driver Name" value={accForm.driverName} onChange={e => setAccForm({ ...accForm, driverName: e.target.value })} required />
          </div>

          <Textarea label="Accident Description" placeholder="Detailed account of how the accident occurred..." value={accForm.accidentDescription} onChange={e => setAccForm({ ...accForm, accidentDescription: e.target.value })} required />
          <Textarea label="Damage Description" placeholder="Visible vehicle damages (bumper, headlight, chassis, etc.)..." value={accForm.damageDescription} onChange={e => setAccForm({ ...accForm, damageDescription: e.target.value })} required />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Police Report Number" placeholder="e.g. ROP-AZB-2026-8819" value={accForm.policeReportNumber} onChange={e => setAccForm({ ...accForm, policeReportNumber: e.target.value })} required />
            <Input label="Insurance Claim Number" placeholder="e.g. OUI-CLM-2026-4410" value={accForm.insuranceClaimNumber} onChange={e => setAccForm({ ...accForm, insuranceClaimNumber: e.target.value })} />
            <Input label="Estimated Downtime (Days)" type="number" value={accForm.vehicleDowntimeDays} onChange={e => setAccForm({ ...accForm, vehicleDowntimeDays: Number(e.target.value) })} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <Input label="Actual Repair Cost (OMR)" type="number" step="0.001" value={accForm.actualRepairCost} onChange={e => setAccForm({ ...accForm, actualRepairCost: Number(e.target.value) })} />
            <Input label="Insurance Recovery (OMR)" type="number" step="0.001" value={accForm.insuranceContribution} onChange={e => setAccForm({ ...accForm, insuranceContribution: Number(e.target.value) })} />
            <Input label="3rd Party Recovery (OMR)" type="number" step="0.001" value={accForm.thirdPartyContribution} onChange={e => setAccForm({ ...accForm, thirdPartyContribution: Number(e.target.value) })} />
            <Input label="Company Net Cost (OMR)" type="number" step="0.001" value={Math.max(0, accForm.actualRepairCost - accForm.insuranceContribution - accForm.thirdPartyContribution)} disabled />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="danger" type="submit" leftIcon={<AlertTriangle className="w-4 h-4" />}>Submit Accident Report</Button>
          </div>
        </form>
      </Modal>

      {/* 7. ADD INVOICE MODAL (WITH PURCHASE BILL UPLOAD) */}
      <Modal
        isOpen={quickModal === 'add-invoice'}
        onClose={closeQuickModal}
        title="Create Invoice / Purchase Bill"
        description="Generate Purchase (Supplier) or Sales (Customer) invoice with document upload and OCR"
        size="xl"
      >
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Select label="Invoice Type" value={invoiceForm.invoiceType} onChange={e => setInvoiceForm({ ...invoiceForm, invoiceType: e.target.value as any })}>
              <option value="Purchase">Purchase Bill (Supplier)</option>
              <option value="Sales">Sales Invoice (Customer)</option>
            </Select>
            <Select label="Assigned Office / Branch" value={invoiceForm.companyId} onChange={e => setInvoiceForm({ ...invoiceForm, companyId: e.target.value })}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label={invoiceForm.invoiceType === 'Purchase' ? 'Supplier' : 'Customer'} value={invoiceForm.partyId} onChange={e => setInvoiceForm({ ...invoiceForm, partyId: e.target.value })}>
              {invoiceForm.invoiceType === 'Purchase'
                ? suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                : customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Vehicle (Optional)" value={invoiceForm.vehicleId} onChange={e => setInvoiceForm({ ...invoiceForm, vehicleId: e.target.value })}>
              <option value="">-- General Fleet --</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Invoice Date" type="date" value={invoiceForm.invoiceDate} onChange={e => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })} required />
            <Input label="Due Date" type="date" value={invoiceForm.dueDate} onChange={e => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} required />
            <Input label="Reference / PO #" placeholder="e.g. PO-2026-8812" value={invoiceForm.referenceNumber} onChange={e => setInvoiceForm({ ...invoiceForm, referenceNumber: e.target.value })} />
          </div>

          {/* Document Upload Zone with OCR Autofill */}
          <DocumentUploadZone
            label="Upload Purchase Bill / Scanned Invoice Document"
            description="Drag & drop or select sample invoice to auto-extract reference, items, and tax totals"
            value={invoiceForm.attachment}
            onChange={file => setInvoiceForm({ ...invoiceForm, attachment: file })}
            onOcrExtract={extracted => {
              const invoiceNumber = extracted.invoiceNumber;
              if (invoiceNumber) setInvoiceForm(prev => ({ ...prev, referenceNumber: invoiceNumber }));
              if (extracted.amount) {
                const items = [...invoiceForm.items];
                items[0].unitPrice = extracted.amount;
                if (extracted.description) items[0].description = extracted.description;
                items[0].taxAmount = extracted.tax || extracted.amount * 0.05;
                items[0].lineTotal = extracted.amount * items[0].quantity + items[0].taxAmount;
                setInvoiceForm(prev => ({ ...prev, items }));
              }
            }}
          />

          {/* Line Item */}
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Line Item Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <Input
                  label="Description"
                  value={invoiceForm.items[0]?.description}
                  onChange={e => {
                    const items = [...invoiceForm.items];
                    items[0].description = e.target.value;
                    setInvoiceForm({ ...invoiceForm, items });
                  }}
                  required
                />
              </div>
              <Input
                label="Quantity"
                type="number"
                value={invoiceForm.items[0]?.quantity}
                onChange={e => {
                  const qty = Number(e.target.value);
                  const price = invoiceForm.items[0].unitPrice;
                  const tax = qty * price * 0.05;
                  const items = [...invoiceForm.items];
                  items[0].quantity = qty;
                  items[0].taxAmount = tax;
                  items[0].lineTotal = qty * price + tax;
                  setInvoiceForm({ ...invoiceForm, items });
                }}
              />
              <Input
                label="Unit Price (OMR)"
                type="number"
                step="0.001"
                value={invoiceForm.items[0]?.unitPrice}
                onChange={e => {
                  const price = Number(e.target.value);
                  const qty = invoiceForm.items[0].quantity;
                  const tax = qty * price * 0.05;
                  const items = [...invoiceForm.items];
                  items[0].unitPrice = price;
                  items[0].taxAmount = tax;
                  items[0].lineTotal = qty * price + tax;
                  setInvoiceForm({ ...invoiceForm, items });
                }}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<FileText className="w-4 h-4" />}>Save Invoice</Button>
          </div>
        </form>
      </Modal>

      {/* 8. UPLOAD DOCUMENT MODAL */}
      <Modal
        isOpen={quickModal === 'upload-document'}
        onClose={closeQuickModal}
        title="Upload Vehicle Document"
        description="Store Mulkiya registration, insurance policies, inspection certificates, or warranties"
        size="md"
      >
        <form onSubmit={handleUploadDocument} className="space-y-4">
          <Input label="Document Title" placeholder="e.g. Mulkiya_Registration_2026.pdf" value={docForm.documentName} onChange={e => setDocForm({ ...docForm, documentName: e.target.value })} required />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Category" value={docForm.category} onChange={e => setDocForm({ ...docForm, category: e.target.value as any })}>
              <option value="Registration">Registration (Mulkiya)</option>
              <option value="Insurance">Insurance Policy</option>
              <option value="Warranty">Warranty Certificate</option>
              <option value="Inspection Report">Inspection Report</option>
              <option value="Purchase Invoice">Purchase Agreement</option>
              <option value="Accident Report">Police Accident Report</option>
              <option value="Other">Other Document</option>
            </Select>
            <Select label="Vehicle" value={docForm.vehicleId} onChange={e => setDocForm({ ...docForm, vehicleId: e.target.value })}>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Issue Date" type="date" value={docForm.issueDate} onChange={e => setDocForm({ ...docForm, issueDate: e.target.value })} />
            <Input label="Expiry Date" type="date" value={docForm.expiryDate} onChange={e => setDocForm({ ...docForm, expiryDate: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Upload className="w-4 h-4" />}>Save to Repository</Button>
          </div>
        </form>
      </Modal>

      {/* 9. ADD EMPLOYEE MODAL */}
      <Modal
        isOpen={quickModal === 'add-employee'}
        onClose={closeQuickModal}
        title="Enroll New Employee"
        description="Add staff, driver, or technician with salary structure and PASI social insurance"
        size="lg"
      >
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Full Name" placeholder="e.g. Salim Al-Harthy" value={empForm.name} onChange={e => setEmpForm({ ...empForm, name: e.target.value })} required />
            <Input label="National ID / Civil ID" placeholder="e.g. 10928374" value={empForm.nationalId} onChange={e => setEmpForm({ ...empForm, nationalId: e.target.value })} />
            <Input label="Passport / Resident Card" value={empForm.passportNumber} onChange={e => setEmpForm({ ...empForm, passportNumber: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Designation" value={empForm.designation} onChange={e => setEmpForm({ ...empForm, designation: e.target.value })} required />
            <Select label="Department" value={empForm.department} onChange={e => setEmpForm({ ...empForm, department: e.target.value as any })}>
              <option value="Fleet & Logistics">Fleet & Logistics</option>
              <option value="Workshop & Maintenance">Workshop & Maintenance</option>
              <option value="Operations">Operations</option>
              <option value="Finance & Accounts">Finance & Accounts</option>
              <option value="Human Resources">Human Resources</option>
              <option value="Executive Management">Executive Management</option>
            </Select>
            <Input label="Joining Date" type="date" value={empForm.joiningDate} onChange={e => setEmpForm({ ...empForm, joiningDate: e.target.value })} required />
          </div>

          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Salary & Compensation Breakdown (OMR)</span>
              <span className="text-emerald-400 font-bold">
                Gross: {(Number(empForm.basicSalary) + Number(empForm.housingAllowance) + Number(empForm.transportAllowance) + Number(empForm.otherAllowances)).toFixed(3)} OMR
              </span>
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Input label="Basic Salary" type="number" step="0.001" value={empForm.basicSalary} onChange={e => setEmpForm({ ...empForm, basicSalary: Number(e.target.value) })} required />
              <Input label="Housing" type="number" step="0.001" value={empForm.housingAllowance} onChange={e => setEmpForm({ ...empForm, housingAllowance: Number(e.target.value) })} />
              <Input label="Transport" type="number" step="0.001" value={empForm.transportAllowance} onChange={e => setEmpForm({ ...empForm, transportAllowance: Number(e.target.value) })} />
              <Input label="Other Allowances" type="number" step="0.001" value={empForm.otherAllowances} onChange={e => setEmpForm({ ...empForm, otherAllowances: Number(e.target.value) })} />
              <Input label="PASI % (Omani 7%)" type="number" step="0.1" value={empForm.pasiContributionPercentage} onChange={e => setEmpForm({ ...empForm, pasiContributionPercentage: Number(e.target.value) })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Bank Name" value={empForm.bankName} onChange={e => setEmpForm({ ...empForm, bankName: e.target.value })} />
            <Input label="IBAN / Account Number" value={empForm.iban} onChange={e => setEmpForm({ ...empForm, iban: e.target.value })} />
            <Input label="Assigned Vehicle Plate" placeholder="e.g. 88123-A" value={empForm.assignedVehiclePlate} onChange={e => setEmpForm({ ...empForm, assignedVehiclePlate: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Users className="w-4 h-4" />}>Save Employee Record</Button>
          </div>
        </form>
      </Modal>

      {/* 10. RUN PAYROLL MODAL */}
      <Modal
        isOpen={quickModal === 'run-payroll'}
        onClose={closeQuickModal}
        title="Execute Monthly Payroll Disbursal"
        description="Process WPS electronic batch, generate payslips, and auto-post balanced double-entry GL journals"
        size="md"
      >
        <form onSubmit={handleRunPayroll} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Month" value={payrollForm.month} onChange={e => setPayrollForm({ ...payrollForm, month: Number(e.target.value) })}>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </Select>
            <Input label="Year" type="number" value={payrollForm.year} onChange={e => setPayrollForm({ ...payrollForm, year: Number(e.target.value) })} required />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Payment Date" type="date" value={payrollForm.paymentDate} onChange={e => setPayrollForm({ ...payrollForm, paymentDate: e.target.value })} required />
            <Select label="Disbursing Bank Account" value={payrollForm.bankAccountId} onChange={e => setPayrollForm({ ...payrollForm, bankAccountId: e.target.value })}>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumber})</option>)}
            </Select>
          </div>

          <div className="p-3 bg-indigo-950/40 rounded-xl border border-indigo-500/30 text-xs text-indigo-200 space-y-1.5">
            <div className="flex items-center justify-between font-semibold">
              <span>Active Staff Eligible:</span>
              <span className="text-indigo-300 font-mono">{employees.filter(e => e.status === 'Active').length} Employees</span>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <span>Estimated Payout:</span>
              <span className="text-emerald-300 font-mono">
                {employees.filter(e => e.status === 'Active').reduce((s, e) => s + e.totalGrossSalary, 0).toFixed(3)} OMR
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Automatic GL Posting: Dr 5070 (Salaries Expense) / Cr 1020 (Bank Account) / Cr 2030 (PASI Social Insurance).
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Calculator className="w-4 h-4" />}>Run & Post Payroll</Button>
          </div>
        </form>
      </Modal>

      {/* 11. RUN DEPRECIATION MODAL */}
      <Modal
        isOpen={quickModal === 'run-depreciation'}
        onClose={closeQuickModal}
        title="Execute Automatic Asset Depreciation"
        description="Amortize fixed asset registry and auto-post balanced double-entry journal entry to GL (Dr 5080 / Cr 1520)"
        size="md"
      >
        <form onSubmit={handleRunDepreciation} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Period Label" value={deprForm.periodLabel} onChange={e => setDeprForm({ ...deprForm, periodLabel: e.target.value })} required />
            <Input label="Run Date" type="date" value={deprForm.runDate} onChange={e => setDeprForm({ ...deprForm, runDate: e.target.value })} required />
          </div>

          <Textarea label="Accounting Notes" value={deprForm.notes} onChange={e => setDeprForm({ ...deprForm, notes: e.target.value })} />

          <div className="p-3 bg-amber-950/40 rounded-xl border border-amber-500/30 text-xs text-amber-200 space-y-1.5">
            <div className="flex items-center justify-between font-semibold">
              <span>Active Assets in Scope:</span>
              <span className="text-amber-300 font-mono">{fixedAssets.filter(a => a.status === 'Active').length} Assets</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Engine calculates Straight-Line and Written Down Value (Reducing Balance) depreciation up to residual salvage value.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Sparkles className="w-4 h-4" />}>Execute Depreciation</Button>
          </div>
        </form>
      </Modal>

      {/* 12. ADD PAYMENT MODAL */}
      <Modal
        isOpen={quickModal === 'add-payment'}
        onClose={closeQuickModal}
        title="Record Payment / Settlement"
        description="Record payment against an outstanding supplier bill or customer invoice"
        size="lg"
      >
        <form onSubmit={handleCreatePayment} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Select Invoice / Bill"
              value={paymentForm.invoiceId}
              onChange={e => {
                const inv = invoices.find(i => i.id === e.target.value);
                setPaymentForm(prev => ({
                  ...prev,
                  invoiceId: e.target.value,
                  amount: inv ? (inv.outstandingAmount ?? inv.grandTotal) : prev.amount,
                }));
              }}
              required
            >
              <option value="">-- Choose Invoice to Settle --</option>
              {invoices.map(inv => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} - {inv.partyName} ({inv.grandTotal.toFixed(3)} OMR - Status: {inv.paymentStatus})
                </option>
              ))}
            </Select>

            <Input
              label="Payment Date"
              type="date"
              value={paymentForm.paymentDate}
              onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Payment Amount (OMR)"
              type="number"
              step="0.001"
              value={paymentForm.amount}
              onChange={e => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
              required
            />
            <Select
              label="Payment Method"
              value={paymentForm.paymentMethod}
              onChange={e => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value as PaymentMethod })}
            >
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
              <option value="Cash">Cash</option>
              <option value="Credit Card">Credit Card</option>
            </Select>
            <Select
              label="Bank Account"
              value={paymentForm.bankAccountId}
              onChange={e => setPaymentForm({ ...paymentForm, bankAccountId: e.target.value })}
            >
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Reference / Cheque #"
              placeholder="e.g. TXN-998822 or CHQ-00123"
              value={paymentForm.transactionReference}
              onChange={e => setPaymentForm({ ...paymentForm, transactionReference: e.target.value })}
            />
            <Input
              label="Notes"
              placeholder="Settlement notes..."
              value={paymentForm.notes}
              onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<DollarSign className="w-4 h-4" />}>Post Payment</Button>
          </div>
        </form>
      </Modal>

      {/* 13. ADD SUPPLIER MODAL */}
      <Modal
        isOpen={quickModal === 'add-supplier'}
        onClose={closeQuickModal}
        title="Add New Vendor / Supplier"
        description="Register a new spare parts vendor, authorized workshop, fuel provider or equipment dealer"
        size="lg"
      >
        <form onSubmit={handleCreateSupplier} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Supplier Company Name"
              placeholder="e.g. Muscat Auto Spare Parts LLC"
              value={supplierForm.name}
              onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
              required
            />
            <Select
              label="Supplier Type"
              value={supplierForm.supplierType}
              onChange={e => setSupplierForm({ ...supplierForm, supplierType: e.target.value as any })}
            >
              <option value="Garage">Garage / Workshop</option>
              <option value="Spare Parts">Spare Parts Vendor</option>
              <option value="Fuel Station">Fuel Station</option>
              <option value="Insurance Company">Insurance Company</option>
              <option value="Tyre Dealer">Tyre Dealer</option>
              <option value="Vehicle Dealership">Vehicle Dealership</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Contact Person"
              placeholder="Key account manager"
              value={supplierForm.contactPerson}
              onChange={e => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })}
            />
            <Input
              label="Phone"
              placeholder="+968 2400 0000"
              value={supplierForm.phone}
              onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              placeholder="procurement@vendor.om"
              value={supplierForm.email}
              onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Oman VAT Number"
              placeholder="OM1100223344"
              value={supplierForm.vatNumber}
              onChange={e => setSupplierForm({ ...supplierForm, vatNumber: e.target.value })}
            />
            <Input
              label="Payment Terms (Days)"
              type="number"
              value={supplierForm.paymentTermsDays}
              onChange={e => setSupplierForm({ ...supplierForm, paymentTermsDays: Number(e.target.value) })}
            />
            <Input
              label="Credit Limit (OMR)"
              type="number"
              value={supplierForm.creditLimit}
              onChange={e => setSupplierForm({ ...supplierForm, creditLimit: Number(e.target.value) })}
            />
          </div>

          <Input
            label="Address / Location"
            placeholder="Ghala Industrial Area, Muscat"
            value={supplierForm.address}
            onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Building2 className="w-4 h-4" />}>Save Supplier</Button>
          </div>
        </form>
      </Modal>

      {/* 14. ADD CUSTOMER MODAL */}
      <Modal
        isOpen={quickModal === 'add-customer'}
        onClose={closeQuickModal}
        title="Add New Customer / Client"
        description="Register a corporate client or government entity for logistics and fleet contracts"
        size="lg"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Customer / Client Name"
              placeholder="e.g. Petroleum Development Oman"
              value={customerForm.name}
              onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })}
              required
            />
            <Select
              label="Customer Type"
              value={customerForm.customerType}
              onChange={e => setCustomerForm({ ...customerForm, customerType: e.target.value as any })}
            >
              <option value="Corporate">Corporate Enterprise</option>
              <option value="Government">Government Entity</option>
              <option value="Individual">Individual</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Contact Person"
              placeholder="Accounts manager"
              value={customerForm.contactPerson}
              onChange={e => setCustomerForm({ ...customerForm, contactPerson: e.target.value })}
            />
            <Input
              label="Phone"
              placeholder="+968 2400 1111"
              value={customerForm.phone}
              onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              placeholder="finance@client.om"
              value={customerForm.email}
              onChange={e => setCustomerForm({ ...customerForm, email: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Oman VAT Number"
              placeholder="OM2200334455"
              value={customerForm.vatNumber}
              onChange={e => setCustomerForm({ ...customerForm, vatNumber: e.target.value })}
            />
            <Input
              label="Credit Terms (Days)"
              type="number"
              value={customerForm.paymentTermsDays}
              onChange={e => setCustomerForm({ ...customerForm, paymentTermsDays: Number(e.target.value) })}
            />
            <Input
              label="Credit Limit (OMR)"
              type="number"
              value={customerForm.creditLimit}
              onChange={e => setCustomerForm({ ...customerForm, creditLimit: Number(e.target.value) })}
            />
          </div>

          <Input
            label="Head Office Address"
            placeholder="Mina Al Fahal, Muscat"
            value={customerForm.address}
            onChange={e => setCustomerForm({ ...customerForm, address: e.target.value })}
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Users className="w-4 h-4" />}>Save Customer</Button>
          </div>
        </form>
      </Modal>

      {/* 15. ADD TYRE MODAL */}
      <Modal
        isOpen={quickModal === 'add-tyre'}
        onClose={closeQuickModal}
        title="Register Fleet Tyre"
        description="Add a new tyre, assign it to a vehicle position, and log tread depth & PSI"
        size="lg"
      >
        <form onSubmit={handleCreateTyre} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Vehicle"
              value={tyreForm.vehicleId}
              onChange={e => setTyreForm({ ...tyreForm, vehicleId: e.target.value })}
              required
            >
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>
              ))}
            </Select>

            <Select
              label="Wheel Position"
              value={tyreForm.position}
              onChange={e => setTyreForm({ ...tyreForm, position: e.target.value })}
            >
              <option value="Front Left (Steer)">Front Left (Steer)</option>
              <option value="Front Right (Steer)">Front Right (Steer)</option>
              <option value="Rear Left Outer">Rear Left Outer</option>
              <option value="Rear Left Inner">Rear Left Inner</option>
              <option value="Rear Right Outer">Rear Right Outer</option>
              <option value="Rear Right Inner">Rear Right Inner</option>
              <option value="Spare">Spare Tyre</option>
            </Select>

            <Input
              label="Serial Number"
              placeholder="e.g. BR-882910"
              value={tyreForm.serialNumber}
              onChange={e => setTyreForm({ ...tyreForm, serialNumber: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Brand"
              value={tyreForm.brand}
              onChange={e => setTyreForm({ ...tyreForm, brand: e.target.value })}
              required
            />
            <Input
              label="Model / Pattern"
              value={tyreForm.model}
              onChange={e => setTyreForm({ ...tyreForm, model: e.target.value })}
            />
            <Input
              label="Tyre Size"
              placeholder="e.g. 295/80R22.5"
              value={tyreForm.size}
              onChange={e => setTyreForm({ ...tyreForm, size: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              label="Tread Depth (mm)"
              type="number"
              step="0.1"
              value={tyreForm.treadDepthMm}
              onChange={e => setTyreForm({ ...tyreForm, treadDepthMm: Number(e.target.value) })}
            />
            <Input
              label="Pressure (PSI)"
              type="number"
              value={tyreForm.psi}
              onChange={e => setTyreForm({ ...tyreForm, psi: Number(e.target.value) })}
            />
            <Input
              label="Purchase Cost (OMR)"
              type="number"
              step="0.001"
              value={tyreForm.purchaseCost}
              onChange={e => setTyreForm({ ...tyreForm, purchaseCost: Number(e.target.value) })}
            />
            <Select
              label="Supplier"
              value={tyreForm.supplierId}
              onChange={e => setTyreForm({ ...tyreForm, supplierId: e.target.value })}
            >
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Disc className="w-4 h-4" />}>Save Tyre</Button>
          </div>
        </form>
      </Modal>

      {/* 16. ADD FIXED ASSET MODAL */}
      <Modal
        isOpen={quickModal === 'add-fixed-asset'}
        onClose={closeQuickModal}
        title="Register Fixed Asset"
        description="Add workshop machinery, office IT hardware, or specialized tools to asset register"
        size="lg"
      >
        <form onSubmit={handleCreateFixedAsset} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Asset Name"
                placeholder="e.g. 5-Ton Hydraulic 2-Post Vehicle Lift"
                value={assetForm.name}
                onChange={e => setAssetForm({ ...assetForm, name: e.target.value })}
                required
              />
            </div>
            <Select
              label="Category"
              value={assetForm.category}
              onChange={e => setAssetForm({ ...assetForm, category: e.target.value as any })}
            >
              <option value="Workshop Equipment">Workshop Equipment</option>
              <option value="IT & GPS Hardware">IT & GPS Hardware</option>
              <option value="Fleet Vehicle">Fleet Vehicle</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Assigned Branch / Location"
              value={assetForm.companyId}
              onChange={e => setAssetForm({ ...assetForm, companyId: e.target.value })}
            >
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input
              label="Location"
              placeholder="e.g. Central Workshop Bay 3"
              value={assetForm.location}
              onChange={e => setAssetForm({ ...assetForm, location: e.target.value })}
            />
            <Input
              label="Serial Number"
              placeholder="e.g. HYD-LIFT-2026-009"
              value={assetForm.serialNumber}
              onChange={e => setAssetForm({ ...assetForm, serialNumber: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <Input
              label="Purchase Date"
              type="date"
              value={assetForm.purchaseDate}
              onChange={e => setAssetForm({ ...assetForm, purchaseDate: e.target.value })}
              required
            />
            <Input
              label="Cost (OMR)"
              type="number"
              step="0.001"
              value={assetForm.purchaseCost}
              onChange={e => setAssetForm({ ...assetForm, purchaseCost: Number(e.target.value) })}
              required
            />
            <Input
              label="Salvage Value (OMR)"
              type="number"
              step="0.001"
              value={assetForm.salvageValue}
              onChange={e => setAssetForm({ ...assetForm, salvageValue: Number(e.target.value) })}
            />
            <Input
              label="Useful Life (Years)"
              type="number"
              value={assetForm.usefulLifeYears}
              onChange={e => setAssetForm({ ...assetForm, usefulLifeYears: Number(e.target.value) })}
              required
            />
          </div>

          <Textarea
            label="Asset Notes & Warranty Details"
            placeholder="Warranty coverage, maintenance contracts, calibration dates..."
            value={assetForm.notes}
            onChange={e => setAssetForm({ ...assetForm, notes: e.target.value })}
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Sparkles className="w-4 h-4" />}>Register Asset</Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

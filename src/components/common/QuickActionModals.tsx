import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Car, Wrench, Fuel, AlertTriangle, FileText, DollarSign, Upload, Disc, Droplet, Building2, BookOpen, Users, Calculator, Sparkles, Percent, Tag, Truck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { DocumentUploadZone, UploadedFileMeta, UploadDocumentForm } from './DocumentUploadZone';
import { BUCKETS, formatFileSize, removeFiles, toStorageRef, uploadFile, validateFile } from '../../services/storage';
import { useAuth } from '../../context/AuthContext';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { MaintenanceCategory, MaintenanceType, WorkOrderPriority } from '../../types/maintenance';
import { ExpenseCategory } from '../../types/operations';
import { InvoiceType, PaymentMethod } from '../../types/finance';
import { EmployeeDepartment } from '../../types/hr';

export const QuickActionModals: React.FC = () => {
  const { quickModal, closeQuickModal, addToast, selectedVehicleId, paymentInvoiceId } = useUI();
  const { currentUser } = useAuth();
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
    selectedCompanyId,
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
    addDocument,
    addEmployee,
    addFixedAsset,
    processPayrollRun,
    runAutoDepreciation,
  } = useFleet();

  const defaultVehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];

  // 1. ADD VEHICLE STATE
  const [vehicleForm, setVehicleForm] = useState({
    companyId: '',
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
    assignedDriver: '',
    department: 'Operations',
    location: '',
    purchaseValue: 0,
    supplierId: '',
    depreciationMethod: 'Straight-Line' as const,
    usefulLifeYears: 5,
    salvageValue: 0,
    oilIntervalKm: 10000,
    oilBrand: 'Mobil 1 ESP',
    oilGrade: '5W-30',
  });

  // Optional vehicle photo: uploaded to the private `media` bucket on save
  const [vehiclePhoto, setVehiclePhoto] = useState<File | null>(null);
  const [vehiclePhotoError, setVehiclePhotoError] = useState('');

  const pickVehiclePhoto = (file: File | null) => {
    setVehiclePhotoError('');
    if (!file) { setVehiclePhoto(null); return; }
    try {
      validateFile(file, 'media');
      setVehiclePhoto(file);
    } catch (err) {
      setVehiclePhoto(null);
      setVehiclePhotoError((err as Error).message);
    }
  };

  // 2. ADD MAINTENANCE STATE
  const [mntForm, setMntForm] = useState({
    vehicleId: defaultVehicle?.id || '',
    companyId: defaultVehicle?.companyId || '',
    maintenanceDate: new Date().toISOString().slice(0, 10),
    maintenanceType: 'Routine' as MaintenanceType,
    category: 'General Service' as MaintenanceCategory,
    description: '',
    odometerReading: defaultVehicle?.currentMileage || 0,
    serviceCentre: '',
    supplierId: '',
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
    companyId: defaultVehicle?.companyId || '',
    reportedDate: new Date().toISOString().slice(0, 10),
    problemDescription: '',
    workshop: '',
    supplierId: '',
    priority: 'Medium' as WorkOrderPriority,
    estimatedCost: 0,
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
    oilCost: 0,
    filterCost: 0,
    labourCost: 0,
    tax: 0,
    supplierId: '',
    notes: '',
  });

  // 5. ADD EXPENSE STATE
  const [expForm, setExpForm] = useState({
    vehicleId: defaultVehicle?.id || '',
    companyId: defaultVehicle?.companyId || '',
    date: new Date().toISOString().slice(0, 10),
    category: 'Fuel' as ExpenseCategory,
    description: '',
    quantity: 1,
    unitPrice: 0,
    tax: 0,
    paymentMethod: 'Corporate Fuel Card',
    costCentre: '',
    supplierId: '',
    attachment: null as UploadedFileMeta | null,
  });

  // 6. ADD ACCIDENT STATE
  const [accForm, setAccForm] = useState({
    vehicleId: defaultVehicle?.id || '',
    companyId: defaultVehicle?.companyId || '',
    accidentDate: new Date().toISOString().slice(0, 10),
    accidentTime: '14:00',
    location: '',
    driverName: '',
    accidentDescription: '',
    accidentType: 'Minor Scrape' as const,
    damageDescription: '',
    policeReportNumber: '',
    insuranceClaimNumber: '',
    estimatedRepairCost: 0,
    actualRepairCost: 0,
    insuranceContribution: 0,
    companyContribution: 0,
    thirdPartyContribution: 0,
    workshop: '',
    vehicleDowntimeDays: 0,
    status: 'Reported' as const,
  });

  // 7. ADD INVOICE STATE (with multi-items)
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceType: 'Purchase' as InvoiceType,
    companyId: '',
    partyId: '',
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
        itemCode: '',
        description: '',
        quantity: 1,
        unit: 'Job',
        unitPrice: 0,
        discountPercentage: 0,
        discountAmount: 0,
        taxRatePercentage: 5,
        taxAmount: 0,
        lineTotal: 0,
      },
    ],
  });

  // 8. ADD PAYMENT STATE
  const [paymentForm, setPaymentForm] = useState({
    invoiceId: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: 0,
    currency: 'OMR',
    paymentMethod: 'Bank Transfer' as PaymentMethod,
    bankAccountId: '',
    transactionReference: '',
    chequeNumber: '',
    notes: '',
  });

  // 10. ADD EMPLOYEE STATE
  const [empForm, setEmpForm] = useState({
    name: '',
    nationalId: '',
    passportNumber: '',
    companyId: '',
    designation: '',
    department: 'Fleet & Logistics' as EmployeeDepartment,
    joiningDate: new Date().toISOString().slice(0, 10),
    basicSalary: 0,
    housingAllowance: 0,
    transportAllowance: 0,
    otherAllowances: 0,
    pasiContributionPercentage: 7.0,
    employerPasiPercentage: 11.5,
    paymentMethod: 'Bank Transfer' as const,
    bankName: '',
    accountNumber: '',
    iban: '',
    assignedVehicleId: '',
    status: 'Active' as const,
  });

  // 11. RUN PAYROLL STATE
  const [payrollForm, setPayrollForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    companyId: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    bankAccountId: '',
    autoPostGL: true,
  });

  // 12. RUN DEPRECIATION STATE
  const [deprForm, setDeprForm] = useState({
    companyId: '',
    period: new Date().toISOString().slice(0, 7),
    runDate: new Date().toISOString().slice(0, 10),
    notes: '',
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
    city: '',
    country: 'Oman',
    vatNumber: '',
    taxNumber: '',
    paymentTermsDays: 30,
    creditLimit: 0,
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
    city: '',
    country: 'Oman',
    vatNumber: '',
    taxNumber: '',
    paymentTermsDays: 30,
    creditLimit: 0,
    openingBalance: 0,
    status: 'Active' as const,
  });

  // 15. ADD TYRE STATE
  const [tyreForm, setTyreForm] = useState({
    vehicleId: defaultVehicle?.id || '',
    companyId: defaultVehicle?.companyId || '',
    serialNumber: '',
    brand: '',
    model: '',
    size: '',
    position: 'Front Left (Steer)',
    dotNumber: '',
    treadDepthMm: 0,
    psi: 0,
    purchaseDate: new Date().toISOString().slice(0, 10),
    purchaseCost: 0,
    supplierId: '',
    notes: '',
  });

  // 16. ADD FIXED ASSET STATE
  const [assetForm, setAssetForm] = useState({
    name: '',
    category: 'Workshop Equipment' as import('../../types/finance').FixedAssetCategory,
    companyId: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    purchaseCost: 0,
    salvageValue: 0,
    depreciationMethod: 'Straight-Line' as const,
    annualRatePercentage: 20,
    usefulLifeYears: 5,
    location: '',
    serialNumber: '',
    assignedVehicleId: '',
    notes: '',
  });

  useEffect(() => {
    if (!quickModal) return;
    const office = selectedCompanyId !== 'all' ? selectedCompanyId : companies.length === 1 ? companies[0].id : '';
    if (!office) return;
    const fill = <T extends { companyId: string }>(prev: T): T => (prev.companyId ? prev : { ...prev, companyId: office });
    setVehicleForm(fill);
    setInvoiceForm(fill);
    setAssetForm(fill);
    setEmpForm(fill);
    setPayrollForm(fill);
    setDeprForm(fill);
  }, [quickModal, selectedCompanyId, companies]);

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
        setInvoiceForm(prev => ({ ...prev, vehicleId: target.id, companyId: target.companyId }));
        setTyreForm(prev => ({ ...prev, vehicleId: target.id, companyId: target.companyId }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync only when the target changes, not on every data reload
  }, [selectedVehicleId, quickModal]);

  // ---------------------------------------------------------------------------------------------
  // Submit handling: every handler awaits the (async) context mutation. Success is reported only
  // after the write succeeded; any ServiceError is shown and the modal stays open.
  // ---------------------------------------------------------------------------------------------
  const [busy, setBusy] = useState(false);
  const run = async (failTitle: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      addToast({ type: 'error', title: failTitle, message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // Upload a picked attachment into the documents bucket; returns its storage ref (or undefined)
  const uploadAttachment = async (meta: UploadedFileMeta | null, companyId: string, entity: 'expenses' | 'invoices') => {
    if (!meta?.file) return undefined;
    const stored = await uploadFile(meta.file, companyId, entity);
    return { ref: toStorageRef('documents', stored.path), path: stored.path, name: stored.name, size: formatFileSize(stored.size), type: stored.mimeType };
  };

  const requireOffice = (companyId: string) => {
    if (!companyId) throw new Error('Select an office first.');
    return companyId;
  };

  // Handlers
  const handleCreateVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleForm.plateNumber || !vehicleForm.brand || !vehicleForm.model) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Plate number, Brand, and Model are required.' });
      return;
    }
    const sup = suppliers.find(s => s.id === vehicleForm.supplierId);
    let photoPath: string | undefined;
    run('Vehicle Not Saved', async () => {
      const companyId = requireOffice(vehicleForm.companyId);
      try {
        if (vehiclePhoto) {
          photoPath = (await uploadFile(vehiclePhoto, companyId, 'vehicles', { bucket: 'media' })).path;
        }
        // vehicleId / companyName are ignored: the DB assigns VH-### and the office name comes from the join
        await addVehicle({
          vehicleId: '',
          companyId,
          companyName: '',
          plateNumber: vehicleForm.plateNumber,
          registrationNumber: vehicleForm.registrationNumber,
          vin: vehicleForm.vin,
          engineNumber: vehicleForm.engineNumber,
          vehicleType: vehicleForm.vehicleType,
          vehicleCategory: vehicleForm.vehicleCategory,
          brand: vehicleForm.brand,
          manufacturer: vehicleForm.manufacturer || vehicleForm.brand,
          model: vehicleForm.model,
          variant: vehicleForm.variant,
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
          photoUrl: photoPath ?? '',
          assignedDriver: vehicleForm.assignedDriver,
          department: vehicleForm.department,
          location: vehicleForm.location,
          purchase: {
            purchaseDate: vehicleForm.registrationDate,
            purchaseValue: Number(vehicleForm.purchaseValue),
            purchaseInvoiceNumber: '',
            supplierId: vehicleForm.supplierId,
            supplierName: sup?.name || '',
            paymentMethod: 'Bank Transfer',
          },
          depreciation: {
            depreciationMethod: vehicleForm.depreciationMethod,
            usefulLifeYears: Number(vehicleForm.usefulLifeYears),
            annualRatePercentage: Number(vehicleForm.usefulLifeYears) > 0 ? 100 / Number(vehicleForm.usefulLifeYears) : 0,
            salvageValue: Number(vehicleForm.salvageValue),
          },
          oilConfig: {
            oilType: vehicleForm.oilGrade,
            oilBrand: vehicleForm.oilBrand,
            oilGrade: vehicleForm.oilGrade,
            intervalKm: Number(vehicleForm.oilIntervalKm),
            intervalMonths: 6,
            estimatedCost: 0,
            capacityLitres: 0,
          },
          // not appraised or insured yet: no invented market value or insurance policy
          currentMarketValue: 0,
          marketValueUpdatedDate: '',
          insuranceProvider: '',
          insurancePolicyNumber: '',
          insuranceExpiryDate: '',
          insurancePremiumAnnual: 0,
        });
      } catch (err) {
        // the vehicle row was not saved: do not leave an orphaned photo in storage
        if (photoPath) removeFiles('media', [photoPath]).catch(() => undefined);
        throw err;
      }
      addToast({ type: 'success', title: 'Vehicle Created', message: `${vehicleForm.brand} ${vehicleForm.model} (${vehicleForm.plateNumber}) added to fleet.` });
      setVehiclePhoto(null);
      closeQuickModal();
    });
  };

  const handleCreateMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === mntForm.vehicleId);
    const sup = suppliers.find(s => s.id === mntForm.supplierId);
    run('Maintenance Not Saved', async () => {
      if (!v) throw new Error('Select a vehicle.');
      // totalCost is recomputed by the database from the cost components
      const total = Number(mntForm.partsCost) + Number(mntForm.labourCost) + Number(mntForm.tax) + Number(mntForm.otherCharges) - Number(mntForm.discount);
      const rec = await addMaintenanceRecord({
        vehicleId: v.id,
        vehiclePlate: v.plateNumber,
        companyId: v.companyId,
        maintenanceDate: mntForm.maintenanceDate,
        maintenanceType: mntForm.maintenanceType,
        category: mntForm.category,
        description: mntForm.description,
        odometerReading: Number(mntForm.odometerReading),
        serviceCentre: mntForm.serviceCentre,
        supplierId: mntForm.supplierId,
        supplierName: sup?.name || '',
        partsCost: Number(mntForm.partsCost),
        labourCost: Number(mntForm.labourCost),
        tax: Number(mntForm.tax),
        discount: Number(mntForm.discount),
        otherCharges: Number(mntForm.otherCharges),
        totalCost: total,
        paymentStatus: mntForm.paymentStatus,
      });
      addToast({ type: 'success', title: 'Maintenance Logged', message: `Recorded ${rec.recordNumber} for ${v.plateNumber}. Total: ${rec.totalCost.toFixed(3)} OMR` });
      closeQuickModal();
    });
  };

  const handleCreateWorkOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === woForm.vehicleId);
    const sup = suppliers.find(s => s.id === woForm.supplierId);
    run('Work Order Not Saved', async () => {
      if (!v) throw new Error('Select a vehicle.');
      // Cost components are entered when the job is quoted/completed; approval is decided by the DB rules
      const wo = await addWorkOrder({
        vehicleId: v.id,
        vehiclePlate: v.plateNumber,
        companyId: v.companyId,
        reportedDate: woForm.reportedDate,
        problemDescription: woForm.problemDescription,
        requestedBy: currentUser.id,
        requestedByName: currentUser.name,
        workshop: woForm.workshop,
        supplierId: woForm.supplierId,
        supplierName: sup?.name || woForm.workshop,
        priority: woForm.priority,
        status: 'Requested',
        estimatedCost: Number(woForm.estimatedCost),
        partsCharges: 0,
        labourCharges: 0,
        additionalCharges: 0,
        tax: 0,
        finalCost: 0,
        partsRequired: woForm.partsRequired,
        approvalStatus: 'Not Required',
        notes: woForm.notes,
      });
      addToast({
        type: 'success',
        title: 'Work Order Created',
        message: wo.approvalStatus === 'Pending'
          ? `${wo.workOrderNumber} for ${v.plateNumber} is awaiting approval.`
          : `${wo.workOrderNumber} dispatched for ${v.plateNumber}.`,
      });
      closeQuickModal();
    });
  };

  const handleCreateOilChange = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === oilForm.vehicleId);
    const sup = suppliers.find(s => s.id === oilForm.supplierId);
    run('Oil Service Not Saved', async () => {
      if (!v) throw new Error('Select a vehicle.');
      const total = Number(oilForm.oilCost) + Number(oilForm.filterCost) + Number(oilForm.labourCost) + Number(oilForm.tax);
      const next = new Date(oilForm.date + 'T00:00:00');
      next.setMonth(next.getMonth() + (v.oilConfig?.intervalMonths || 6));
      await addOilChange({
        vehicleId: v.id,
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
        nextOilChangeMileage: Number(oilForm.odometer) + (v.oilConfig?.intervalKm || 10000),
        nextOilChangeDate: next.toISOString().slice(0, 10),
        notes: oilForm.notes,
      });
      addToast({ type: 'success', title: 'Oil Service Saved', message: `Recorded oil service for ${v.plateNumber}.` });
      closeQuickModal();
    });
  };

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === expForm.vehicleId);
    const sup = suppliers.find(s => s.id === expForm.supplierId);
    let uploadedPath: string | undefined;
    run('Expense Not Saved', async () => {
      const companyId = requireOffice(v?.companyId || expForm.companyId);
      if (!v) throw new Error('Select the vehicle this expense belongs to.');
      if (!(Number(expForm.quantity) > 0)) throw new Error('Quantity must be greater than zero.');
      if (Number(expForm.unitPrice) < 0 || Number(expForm.tax) < 0) throw new Error('Unit price and tax cannot be negative.');
      const total = Number(expForm.quantity) * Number(expForm.unitPrice) + Number(expForm.tax);
      if (!(total > 0)) throw new Error('The expense total must be greater than zero.');
      try {
        const att = await uploadAttachment(expForm.attachment, companyId, 'expenses');
        uploadedPath = att?.path;
        await addExpense({
          vehicleId: v?.id || '',
          vehiclePlate: v?.plateNumber || '',
          companyId,
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
          attachmentUrl: att?.ref,
          attachmentName: att?.name,
          attachmentSize: att?.size,
          attachmentType: att?.type,
        });
      } catch (err) {
        if (uploadedPath) removeFiles('documents', [uploadedPath]).catch(() => undefined);
        throw err;
      }
      addToast({ type: 'success', title: 'Expense Added', message: `Logged ${expForm.category} expense of ${total.toFixed(3)} OMR${uploadedPath ? ' with receipt' : ''}.` });
      closeQuickModal();
    });
  };

  const handleCreateAccident = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === accForm.vehicleId);
    run('Accident Not Saved', async () => {
      if (!v) throw new Error('Select a vehicle.');
      const acc = await addAccident({
        vehicleId: v.id,
        vehiclePlate: v.plateNumber,
        companyId: v.companyId,
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
      addToast({ type: 'warning', title: 'Accident Recorded', message: `${acc.accidentNumber} reported for ${v.plateNumber}.` });
      closeQuickModal();
    });
  };

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const isPurchase = invoiceForm.invoiceType === 'Purchase';
    const party = isPurchase ? suppliers.find(s => s.id === invoiceForm.partyId) : customers.find(c => c.id === invoiceForm.partyId);
    const v = vehicles.find(veh => veh.id === invoiceForm.vehicleId);
    let uploadedPath: string | undefined;
    run('Invoice Not Saved', async () => {
      const companyId = requireOffice(invoiceForm.companyId);
      if (!party) throw new Error(`Select a ${isPurchase ? 'supplier' : 'customer'}.`);
      if (invoiceForm.items.some(it => !it.description.trim() || Number(it.quantity) <= 0)) {
        throw new Error('Every line needs a description and a quantity above zero.');
      }
      let created;
      try {
        const att = await uploadAttachment(invoiceForm.attachment, companyId, 'invoices');
        uploadedPath = att?.path;
        // Totals, number and party snapshot are computed by create_invoice; a non-Draft status submits it:
        // posted at once when within the user's approval limit, otherwise an approval request is raised.
        created = await addInvoice({
          invoiceType: invoiceForm.invoiceType,
          companyId,
          companyName: '',
          partyType: isPurchase ? 'Supplier' : 'Customer',
          partyId: party.id,
          partyName: party.name,
          invoiceDate: invoiceForm.invoiceDate,
          dueDate: invoiceForm.dueDate,
          referenceNumber: invoiceForm.referenceNumber,
          purchaseOrderNumber: invoiceForm.purchaseOrderNumber,
          vehicleId: v?.id,
          vehiclePlate: v?.plateNumber,
          currency: invoiceForm.currency,
          exchangeRate: 1.0,
          items: invoiceForm.items,
          subtotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          otherCharges: 0,
          grandTotal: 0,
          paymentStatus: 'Unpaid',
          approvalStatus: 'Pending Approval',
          paymentTermsDays: party.paymentTermsDays ?? 30,
          attachmentUrl: att?.ref,
          attachmentName: att?.name,
          attachmentSize: att?.size,
          attachmentType: att?.type,
        });
      } catch (err) {
        if (uploadedPath) removeFiles('documents', [uploadedPath]).catch(() => undefined);
        throw err;
      }
      addToast({
        type: 'success',
        title: created.approvalStatus === 'Approved' ? 'Invoice Posted' : 'Invoice Submitted',
        message: created.approvalStatus === 'Approved'
          ? `${created.invoiceNumber} posted to the ledger for ${created.grandTotal.toFixed(3)} ${created.currency}.`
          : `${created.invoiceNumber} (${created.grandTotal.toFixed(3)} ${created.currency}) is awaiting approval.`,
      });
      closeQuickModal();
    });
  };

  // Only posted, unpaid invoices can receive a payment (record_payment enforces the same)
  const payableInvoices = invoices.filter(i =>
    i.approvalStatus === 'Approved' && !i.isCreditNote && i.paymentStatus !== 'Cancelled' && i.outstandingAmount > 0.0005);
  const paymentInvoice = payableInvoices.find(i => i.id === paymentForm.invoiceId);
  // Opened from an invoice row: preselect that invoice and its outstanding balance
  useEffect(() => {
    if (quickModal !== 'add-payment' || !paymentInvoiceId) return;
    const inv = invoices.find(i => i.id === paymentInvoiceId);
    if (inv) setPaymentForm(prev => ({ ...prev, invoiceId: inv.id, amount: inv.outstandingAmount, bankAccountId: '' }));
  }, [quickModal, paymentInvoiceId]); // eslint-disable-line react-hooks/exhaustive-deps
  const paymentBanks = bankAccounts.filter(b => b.active !== false && (!paymentInvoice || b.companyId === paymentInvoice.companyId));

  const handleCreatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    run('Payment Rejected', async () => {
      const inv = paymentInvoice;
      if (!inv) throw new Error('Select a posted invoice with an outstanding balance.');
      const ba = paymentBanks.find(b => b.id === paymentForm.bankAccountId);
      if (!ba) throw new Error('Select a bank account of the invoice office.');
      const pay = await addPayment({
        companyId: inv.companyId,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceType: inv.invoiceType,
        partyType: inv.partyType,
        partyId: inv.partyId,
        partyName: inv.partyName,
        paymentDate: paymentForm.paymentDate,
        amount: Number(paymentForm.amount),
        currency: inv.currency,
        paymentMethod: paymentForm.paymentMethod,
        bankAccountId: ba.id,
        bankAccountName: ba.accountName,
        transactionReference: paymentForm.transactionReference,
        chequeNumber: paymentForm.paymentMethod === 'Cheque' ? paymentForm.chequeNumber : undefined,
        notes: paymentForm.notes,
      });
      addToast({ type: 'success', title: 'Payment Processed', message: `${pay.paymentNumber}: ${pay.amount.toFixed(3)} ${pay.currency} against ${inv.invoiceNumber}.` });
      closeQuickModal();
    });
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Supplier name is required.' });
      return;
    }
    run('Supplier Not Saved', async () => {
      const s = await addSupplier({
        name: supplierForm.name.trim(),
        supplierType: supplierForm.supplierType,
        contactPerson: supplierForm.contactPerson,
        phone: supplierForm.phone,
        email: supplierForm.email,
        address: supplierForm.address,
        city: supplierForm.city,
        country: supplierForm.country,
        vatNumber: supplierForm.vatNumber,
        taxNumber: supplierForm.taxNumber,
        paymentTermsDays: Number(supplierForm.paymentTermsDays) || 0,
        creditLimit: Number(supplierForm.creditLimit) || 0,
        openingBalance: Number(supplierForm.openingBalance) || 0,
        status: supplierForm.status,
        bankDetails: { bankName: '', accountNumber: '', iban: '', swiftCode: '' },
        notes: '',
      });
      addToast({ type: 'success', title: 'Supplier Created', message: `Registered ${s.supplierId} ${s.name}.` });
      closeQuickModal();
    });
  };

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name.trim()) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Customer name is required.' });
      return;
    }
    run('Customer Not Saved', async () => {
      const c = await addCustomer({
        name: customerForm.name.trim(),
        customerType: customerForm.customerType,
        contactPerson: customerForm.contactPerson,
        phone: customerForm.phone,
        email: customerForm.email,
        address: customerForm.address,
        city: customerForm.city,
        country: customerForm.country,
        vatNumber: customerForm.vatNumber,
        taxNumber: customerForm.taxNumber,
        paymentTermsDays: Number(customerForm.paymentTermsDays) || 0,
        creditLimit: Number(customerForm.creditLimit) || 0,
        openingBalance: Number(customerForm.openingBalance) || 0,
        status: customerForm.status,
      });
      addToast({ type: 'success', title: 'Customer Created', message: `Registered ${c.customerId} ${c.name}.` });
      closeQuickModal();
    });
  };

  const handleCreateTyre = (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(veh => veh.id === tyreForm.vehicleId);
    const sup = suppliers.find(s => s.id === tyreForm.supplierId);
    run('Tyre Not Saved', async () => {
      if (!v) throw new Error('Select a vehicle.');
      if (!tyreForm.brand.trim()) throw new Error('Tyre brand is required.');
      await addTyre({
        vehicleId: v.id,
        brand: tyreForm.brand,
        model: tyreForm.model,
        size: tyreForm.size,
        serialNumber: tyreForm.serialNumber,
        position: tyreForm.position as any,
        purchaseDate: tyreForm.purchaseDate,
        purchaseCost: Number(tyreForm.purchaseCost) || 0,
        installationDate: tyreForm.purchaseDate,
        installationMileage: v.currentMileage || 0,
        expectedLifeKm: 60000,
        currentMileage: 0,
        treadDepthMm: Number(tyreForm.treadDepthMm) || 0,
        supplierId: tyreForm.supplierId,
        supplierName: sup?.name,
        status: 'Good',
        notes: tyreForm.notes,
      });
      addToast({ type: 'success', title: 'Tyre Logged', message: `Added ${tyreForm.brand} tyre to vehicle ${v.plateNumber}.` });
      closeQuickModal();
    });
  };

  const handleCreateFixedAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetForm.name || !Number(assetForm.purchaseCost)) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Asset name and purchase cost are required.' });
      return;
    }
    run('Asset Not Saved', async () => {
      const companyId = requireOffice(assetForm.companyId);
      const cost = Number(assetForm.purchaseCost);
      const salvage = Number(assetForm.salvageValue) || 0;
      const lifeYears = Number(assetForm.usefulLifeYears);
      if (!(lifeYears > 0)) throw new Error('Useful life must be above zero.');
      const annualRate = Number(assetForm.annualRatePercentage) || 100 / lifeYears;
      const assignedVeh = vehicles.find(v => v.id === assetForm.assignedVehicleId);
      const isVehicle = assetForm.category === 'Fleet Vehicle';
      const isEquipment = assetForm.category === 'Workshop Equipment';
      // GL codes from the per-company chart of accounts template (1510 vehicles, 1530 equipment & other)
      const asset = await addFixedAsset({
        name: assetForm.name,
        category: assetForm.category,
        companyId,
        location: assetForm.location,
        department: isVehicle ? 'Fleet Operations' : isEquipment ? 'Workshop' : 'Administration',
        purchaseDate: assetForm.purchaseDate,
        purchaseCost: cost,
        salvageValue: salvage,
        usefulLifeYears: lifeYears,
        annualRatePercentage: annualRate,
        depreciationMethod: assetForm.depreciationMethod,
        accumulatedDepreciation: 0,
        currentBookValue: cost,
        glAssetAccount: isVehicle ? '1510' : '1530',
        glDepreciationExpenseAccount: '5080',
        glAccumulatedDepreciationAccount: '1520',
        status: 'Active',
        vehicleId: assetForm.assignedVehicleId || undefined,
        serialNumber: assetForm.serialNumber || undefined,
        serialOrPlateNumber: assignedVeh?.plateNumber || assetForm.serialNumber || undefined,
        notes: assetForm.notes,
      });
      addToast({ type: 'success', title: 'Fixed Asset Registered', message: `Added ${asset.assetCode} ${asset.name} (${cost.toFixed(3)} OMR).` });
      closeQuickModal();
    });
  };

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.name || !Number(empForm.basicSalary)) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Employee name and basic salary are required.' });
      return;
    }
    run('Employee Not Saved', async () => {
      const companyId = requireOffice(empForm.companyId);
      const emp = await addEmployee({
        companyId,
        name: empForm.name,
        nationalId: empForm.nationalId,
        passportNumber: empForm.passportNumber,
        designation: empForm.designation,
        department: empForm.department,
        joiningDate: empForm.joiningDate,
        basicSalary: Number(empForm.basicSalary),
        housingAllowance: Number(empForm.housingAllowance),
        transportAllowance: Number(empForm.transportAllowance),
        otherAllowances: Number(empForm.otherAllowances),
        totalGrossSalary: 0, // generated by the database
        pasiContributionPercentage: Number(empForm.pasiContributionPercentage),
        employerPasiPercentage: Number(empForm.employerPasiPercentage),
        paymentMethod: empForm.paymentMethod,
        bankName: empForm.bankName,
        accountNumber: empForm.accountNumber,
        iban: empForm.iban,
        assignedVehicleId: empForm.assignedVehicleId || undefined,
        status: empForm.status,
      });
      addToast({ type: 'success', title: 'Employee Enrolled', message: `Added ${emp.employeeCode} ${emp.name}.` });
      closeQuickModal();
    });
  };

  const payrollStaff = employees.filter(e => e.companyId === payrollForm.companyId && (e.status === 'Active' || e.status === 'Probation'));
  const payrollBanks = bankAccounts.filter(b => b.active !== false && b.companyId === payrollForm.companyId);

  const handleRunPayroll = (e: React.FormEvent) => {
    e.preventDefault();
    run('Payroll Not Processed', async () => {
      const companyId = requireOffice(payrollForm.companyId);
      const prun = await processPayrollRun({
        companyId,
        month: Number(payrollForm.month),
        year: Number(payrollForm.year),
        paymentDate: payrollForm.paymentDate,
        bankAccountId: payrollForm.bankAccountId || undefined,
        autoPostGL: payrollForm.autoPostGL,
      });
      addToast({
        type: 'success',
        title: payrollForm.bankAccountId ? 'Payroll Paid' : 'Payroll Accrued',
        message: `Processed payroll ${prun.periodLabel}: net ${prun.totalNetPayout.toFixed(3)} OMR.`,
      });
      closeQuickModal();
    });
  };

  const handleRunDepreciation = (e: React.FormEvent) => {
    e.preventDefault();
    run('Depreciation Not Run', async () => {
      const companyId = requireOffice(deprForm.companyId);
      const drun = await runAutoDepreciation({
        companyId,
        period: deprForm.period,
        runDate: deprForm.runDate,
        notes: deprForm.notes,
        autoPostGL: deprForm.autoPostGL,
      });
      addToast({
        type: 'success',
        title: 'Depreciation Complete',
        message: `Depreciated ${drun.totalAssetsProcessed} assets for ${drun.totalDepreciationAmount.toFixed(3)} OMR${deprForm.autoPostGL ? ', posted to the GL' : ''}.`,
      });
      closeQuickModal();
    });
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
            <Input label="Plate Number" placeholder="e.g. 1234 ABC" value={vehicleForm.plateNumber} onChange={e => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })} required />
            <Select label="Assigned Office / Branch" value={vehicleForm.companyId} onChange={e => setVehicleForm({ ...vehicleForm, companyId: e.target.value })} required>
              <option value="">Select office</option>
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

          <div className="flex flex-col gap-1.5">
            <label className="text-xs sm:text-sm font-semibold text-slate-100">Vehicle photo (optional)</label>
            <input
              type="file"
              accept={BUCKETS.media.mimeTypes.join(',')}
              onChange={e => pickVehiclePhoto(e.target.files?.[0] ?? null)}
              className="text-xs text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-slate-850 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
            />
            {vehiclePhotoError
              ? <p className="text-xs font-semibold text-rose-600">{vehiclePhotoError}</p>
              : <p className="text-xs text-slate-400">{BUCKETS.media.label} up to 5 MB.</p>}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal} disabled={busy}>Cancel</Button>
            <Button variant="primary" type="submit" leftIcon={<Car className="w-4 h-4" />} isLoading={busy} disabled={busy}>Save Vehicle</Button>
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
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<Wrench className="w-4 h-4" />}>Save Maintenance Record</Button>
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
              <option value="">Not assigned</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input label="Estimated Cost (OMR)" type="number" step="0.001" value={woForm.estimatedCost} onChange={e => setWoForm({ ...woForm, estimatedCost: Number(e.target.value) })} required />
            <Input label="Requested By" value={currentUser.name} readOnly />
          </div>

          <Input label="Parts Required" placeholder="e.g. Front Brake Pads, Brake Fluid DOT 4" value={woForm.partsRequired} onChange={e => setWoForm({ ...woForm, partsRequired: e.target.value })} />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<Wrench className="w-4 h-4" />}>Dispatch Work Order</Button>
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
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<Droplet className="w-4 h-4" />}>Save Oil Service</Button>
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
            <Input label="VAT amount (OMR)" type="number" step="0.001" min="0" hint="5% of the net amount in Oman" value={expForm.tax} onChange={e => setExpForm({ ...expForm, tax: Number(e.target.value) })} />
            <Input label="Payment Method" value={expForm.paymentMethod} onChange={e => setExpForm({ ...expForm, paymentMethod: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Supplier / Vendor (optional)" value={expForm.supplierId} onChange={e => setExpForm({ ...expForm, supplierId: e.target.value })}>
              <option value="">-- None --</option>
              {suppliers.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </Select>
            <Input label="Cost Centre (optional)" placeholder="e.g. Operations" value={expForm.costCentre} onChange={e => setExpForm({ ...expForm, costCentre: e.target.value })} />
          </div>

          {/* Document Upload Zone for Entry Bill */}
          <DocumentUploadZone
            label="Attach Receipt / Entry Bill Scan"
            description="Upload scanned fuel bill, payment receipt or invoice voucher"
            value={expForm.attachment}
            onChange={file => setExpForm({ ...expForm, attachment: file })}
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<DollarSign className="w-4 h-4" />}>Save Expense</Button>
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
            <Button variant="danger" type="submit" isLoading={busy} disabled={busy} leftIcon={<AlertTriangle className="w-4 h-4" />}>Submit Accident Report</Button>
          </div>
        </form>
      </Modal>

      {/* 7. ADD INVOICE MODAL (WITH PURCHASE BILL UPLOAD) */}
      <Modal
        isOpen={quickModal === 'add-invoice'}
        onClose={closeQuickModal}
        title="Create Invoice / Purchase Bill"
        description="Purchase (supplier) or sales (customer) invoice. Posted to the ledger on save when within your approval limit, otherwise sent for approval."
        size="xl"
      >
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Select label="Invoice Type" value={invoiceForm.invoiceType} onChange={e => setInvoiceForm({ ...invoiceForm, invoiceType: e.target.value as any, partyId: '' })}>
              <option value="Purchase">Purchase Bill (Supplier)</option>
              <option value="Sales">Sales Invoice (Customer)</option>
            </Select>
            <Select label="Assigned Office / Branch" value={invoiceForm.companyId} onChange={e => setInvoiceForm({ ...invoiceForm, companyId: e.target.value })} required>
              <option value="">Select office</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label={invoiceForm.invoiceType === 'Purchase' ? 'Supplier' : 'Customer'} value={invoiceForm.partyId} onChange={e => setInvoiceForm({ ...invoiceForm, partyId: e.target.value })} required>
              <option value="">Select {invoiceForm.invoiceType === 'Purchase' ? 'supplier' : 'customer'}</option>
              {invoiceForm.invoiceType === 'Purchase'
                ? suppliers.filter(s => s.status === 'Active').map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                : customers.filter(c => c.status === 'Active').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<FileText className="w-4 h-4" />}>Save Invoice</Button>
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
        <UploadDocumentForm defaultVehicleId={defaultVehicle?.id} onDone={closeQuickModal} />
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Select label="Office" value={empForm.companyId} onChange={e => setEmpForm({ ...empForm, companyId: e.target.value, assignedVehicleId: '' })} required>
              <option value="">Select office</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
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
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Input label="Basic Salary" type="number" step="0.001" value={empForm.basicSalary} onChange={e => setEmpForm({ ...empForm, basicSalary: Number(e.target.value) })} required />
              <Input label="Housing" type="number" step="0.001" value={empForm.housingAllowance} onChange={e => setEmpForm({ ...empForm, housingAllowance: Number(e.target.value) })} />
              <Input label="Transport" type="number" step="0.001" value={empForm.transportAllowance} onChange={e => setEmpForm({ ...empForm, transportAllowance: Number(e.target.value) })} />
              <Input label="Other Allowances" type="number" step="0.001" value={empForm.otherAllowances} onChange={e => setEmpForm({ ...empForm, otherAllowances: Number(e.target.value) })} />
              <Input label="Employee PASI %" type="number" step="0.1" value={empForm.pasiContributionPercentage} onChange={e => setEmpForm({ ...empForm, pasiContributionPercentage: Number(e.target.value) })} />
              <Input label="Employer PASI %" type="number" step="0.1" value={empForm.employerPasiPercentage} onChange={e => setEmpForm({ ...empForm, employerPasiPercentage: Number(e.target.value) })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Bank Name" value={empForm.bankName} onChange={e => setEmpForm({ ...empForm, bankName: e.target.value })} />
            <Input label="IBAN / Account Number" value={empForm.iban} onChange={e => setEmpForm({ ...empForm, iban: e.target.value })} />
            <Select label="Assigned Vehicle" value={empForm.assignedVehicleId} onChange={e => setEmpForm({ ...empForm, assignedVehicleId: e.target.value })}>
              <option value="">None</option>
              {vehicles.filter(v => v.companyId === empForm.companyId).map(v => <option key={v.id} value={v.id}>{v.plateNumber} ({v.brand} {v.model})</option>)}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<Users className="w-4 h-4" />}>Save Employee Record</Button>
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
          <Select label="Office" value={payrollForm.companyId} onChange={e => setPayrollForm({ ...payrollForm, companyId: e.target.value, bankAccountId: '' })} required>
            <option value="">Select office</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
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
              <option value="">No bank: accrue to Salaries Payable (2050)</option>
              {payrollBanks.map(b => <option key={b.id} value={b.id}>{b.bankName} ({b.accountNumber})</option>)}
            </Select>
          </div>

          <div className="p-3 bg-indigo-950/40 rounded-xl border border-indigo-500/30 text-xs text-indigo-200 space-y-1.5">
            <div className="flex items-center justify-between font-semibold">
              <span>Eligible Staff (Active + Probation):</span>
              <span className="text-indigo-300 font-mono">{payrollStaff.length} Employees</span>
            </div>
            <div className="flex items-center justify-between font-semibold">
              <span>Estimated Net Payout:</span>
              <span className="text-emerald-300 font-mono">
                {payrollStaff.reduce((s, e) => s + e.totalGrossSalary * (1 - (e.pasiContributionPercentage || 0) / 100), 0).toFixed(3)} OMR
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              GL posting: Dr 5070 Salaries + Dr 5075 Employer PASI / Cr 2040 PASI Payable / Cr selected bank (or 2050 Salaries Payable).
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<Calculator className="w-4 h-4" />}>Run & Post Payroll</Button>
          </div>
        </form>
      </Modal>

      {/* 11. RUN DEPRECIATION MODAL */}
      <Modal
        isOpen={quickModal === 'run-depreciation'}
        onClose={closeQuickModal}
        title="Execute Automatic Asset Depreciation"
        description="Depreciate the office's fixed assets for one month and post a balanced journal to each asset's own GL accounts"
        size="md"
      >
        <form onSubmit={handleRunDepreciation} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Office" value={deprForm.companyId} onChange={e => setDeprForm({ ...deprForm, companyId: e.target.value })} required>
              <option value="">Select office</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input label="Period (month)" type="month" value={deprForm.period} onChange={e => setDeprForm({ ...deprForm, period: e.target.value })} required />
            <Input label="Run Date" type="date" value={deprForm.runDate} onChange={e => setDeprForm({ ...deprForm, runDate: e.target.value })} required />
          </div>

          <Textarea label="Accounting Notes" value={deprForm.notes} onChange={e => setDeprForm({ ...deprForm, notes: e.target.value })} />

          <div className="p-3 bg-amber-950/40 rounded-xl border border-amber-500/30 text-xs text-amber-200 space-y-1.5">
            <div className="flex items-center justify-between font-semibold">
              <span>Active Assets in Scope:</span>
              <span className="text-amber-300 font-mono">{fixedAssets.filter(a => a.companyId === deprForm.companyId && (a.status === 'Active' || a.status === 'Under Maintenance')).length} Assets</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Engine calculates Straight-Line and Written Down Value (Reducing Balance) depreciation up to residual salvage value.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<Sparkles className="w-4 h-4" />}>Execute Depreciation</Button>
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
                const inv = payableInvoices.find(i => i.id === e.target.value);
                setPaymentForm(prev => ({
                  ...prev,
                  invoiceId: e.target.value,
                  amount: inv ? inv.outstandingAmount : 0,
                  bankAccountId: '',
                }));
              }}
              required
            >
              <option value="">-- Choose Invoice to Settle --</option>
              {payableInvoices.map(inv => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} - {inv.partyName} (outstanding {inv.outstandingAmount.toFixed(3)} {inv.currency})
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
              label={`Payment Amount (${paymentInvoice?.currency ?? 'OMR'})`}
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
              required
            >
              <option value="">Select bank account</option>
              {paymentBanks.map(b => (
                <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paymentForm.paymentMethod === 'Cheque' ? (
              <Input
                label="Cheque Number"
                placeholder="e.g. CHQ-00123"
                value={paymentForm.chequeNumber}
                onChange={e => setPaymentForm({ ...paymentForm, chequeNumber: e.target.value })}
                required
              />
            ) : (
              <Input
                label="Transaction Reference"
                placeholder="e.g. TXN-998822"
                value={paymentForm.transactionReference}
                onChange={e => setPaymentForm({ ...paymentForm, transactionReference: e.target.value })}
              />
            )}
            <Input
              label="Notes"
              placeholder="Settlement notes..."
              value={paymentForm.notes}
              onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={closeQuickModal}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<DollarSign className="w-4 h-4" />}>Post Payment</Button>
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
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<Building2 className="w-4 h-4" />}>Save Supplier</Button>
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
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<Users className="w-4 h-4" />}>Save Customer</Button>
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
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<Disc className="w-4 h-4" />}>Save Tyre</Button>
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
              required
            >
              <option value="">Select office</option>
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
            <Button variant="primary" type="submit" isLoading={busy} disabled={busy} leftIcon={<Sparkles className="w-4 h-4" />}>Register Asset</Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

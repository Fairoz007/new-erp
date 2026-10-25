import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Vehicle, VehicleStatus } from '../../types/vehicle';
import { removeFiles, uploadFile } from '../../services/storage';

const STATUSES: VehicleStatus[] = ['Active', 'Under Maintenance', 'Accident', 'Inactive', 'Reserved', 'Sold', 'Scrapped'];
const TYPES: Vehicle['vehicleType'][] = ['SUV', 'Sedan', 'Pickup', 'Van', 'Truck', 'Bus', 'Heavy Equipment'];
const CATEGORIES: Vehicle['vehicleCategory'][] = ['Executive', 'Operations', 'Logistics', 'Sales', 'Pool', 'Service'];
const FUELS: Vehicle['fuelType'][] = ['Petrol', 'Diesel', 'Hybrid', 'Electric', 'CNG'];
const TRANSMISSIONS: Vehicle['transmission'][] = ['Automatic', 'Manual', 'CVT', 'Dual-Clutch'];
const opts = (list: string[]) => list.map(v => ({ value: v, label: v }));

interface Props {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle;
  onSubmit: (updates: Partial<Vehicle>) => Promise<void>; // must throw on failure
}

/** Edit a vehicle's master data and lifecycle status. Purchase, depreciation and oil settings are merged into their JSON groups. */
export const VehicleEditModal: React.FC<Props> = ({ isOpen, onClose, vehicle, onSubmit }) => {
  const [form, setForm] = useState<Vehicle>(vehicle);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) { setForm(vehicle); setPhoto(null); setError(''); }
  }, [isOpen, vehicle]);

  const set = <K extends keyof Vehicle>(key: K, value: Vehicle[K]) => setForm(f => ({ ...f, [key]: value }));
  const setNum = (key: keyof Vehicle) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value === '' ? 0 : Number(e.target.value) }));
  const setGroup = <G extends 'purchase' | 'depreciation' | 'oilConfig'>(group: G, key: keyof Vehicle[G], value: string | number) =>
    setForm(f => ({ ...f, [group]: { ...f[group], [key]: value } }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.plateNumber.trim() || !form.brand.trim() || !form.model.trim()) {
      setError('Plate number, brand and model are required.');
      return;
    }
    setSaving(true);
    setError('');
    let uploadedPath: string | null = null;
    try {
      const updates: Partial<Vehicle> = {
        plateNumber: form.plateNumber, registrationNumber: form.registrationNumber, vin: form.vin, engineNumber: form.engineNumber,
        vehicleType: form.vehicleType, vehicleCategory: form.vehicleCategory, brand: form.brand, manufacturer: form.manufacturer,
        model: form.model, variant: form.variant, manufacturingYear: form.manufacturingYear,
        registrationDate: form.registrationDate, registrationExpiryDate: form.registrationExpiryDate,
        countryOfRegistration: form.countryOfRegistration, color: form.color, fuelType: form.fuelType,
        transmission: form.transmission, engineCapacityCc: form.engineCapacityCc, numberOfSeats: form.numberOfSeats,
        currentMileage: form.currentMileage, initialOdometer: form.initialOdometer, status: form.status,
        assignedDriver: form.assignedDriver, department: form.department, location: form.location,
        purchase: form.purchase, depreciation: form.depreciation, oilConfig: form.oilConfig,
        currentMarketValue: form.currentMarketValue,
        marketValueUpdatedDate: form.currentMarketValue !== vehicle.currentMarketValue ? new Date().toISOString().slice(0, 10) : form.marketValueUpdatedDate,
        insuranceProvider: form.insuranceProvider, insurancePolicyNumber: form.insurancePolicyNumber,
        insuranceExpiryDate: form.insuranceExpiryDate, insurancePremiumAnnual: form.insurancePremiumAnnual, notes: form.notes,
      };
      if (photo) {
        const stored = await uploadFile(photo, vehicle.companyId, 'vehicles', { bucket: 'media' });
        uploadedPath = stored.path;
        updates.photoUrl = stored.path;
      }
      await onSubmit(updates);
      // the row now points at the new photo: drop the previous stored file (best effort)
      if (uploadedPath && vehicle.photoUrl && !/^(https?:|data:|blob:)/i.test(vehicle.photoUrl)) {
        removeFiles('media', [vehicle.photoUrl]).catch(() => undefined);
      }
      onClose();
    } catch (err) {
      if (uploadedPath) removeFiles('media', [uploadedPath]).catch(() => undefined); // row not saved: do not leave an orphan
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => undefined : onClose}
      title={`Edit Vehicle ${vehicle.vehicleId}`}
      description={`${vehicle.brand} ${vehicle.model} - ${vehicle.plateNumber}`}
      size="2xl"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" type="submit" form="vehicle-edit-form" isLoading={saving} disabled={saving}>Save Changes</Button>
        </>
      }
    >
      <form id="vehicle-edit-form" onSubmit={submit} className="space-y-6">
        {error && <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select label="Status" value={form.status} onChange={e => set('status', e.target.value as VehicleStatus)} options={opts(STATUSES)} />
          <Input label="Plate number" required value={form.plateNumber} onChange={e => set('plateNumber', e.target.value)} />
          <Input label="Registration number" value={form.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} />
          <Input label="Brand" required value={form.brand} onChange={e => set('brand', e.target.value)} />
          <Input label="Model" required value={form.model} onChange={e => set('model', e.target.value)} />
          <Input label="Variant" value={form.variant} onChange={e => set('variant', e.target.value)} />
          <Input label="Manufacturer" value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)} />
          <Input label="Year" type="number" value={form.manufacturingYear || ''} onChange={setNum('manufacturingYear')} />
          <Input label="Colour" value={form.color} onChange={e => set('color', e.target.value)} />
          <Select label="Type" value={form.vehicleType} onChange={e => set('vehicleType', e.target.value as Vehicle['vehicleType'])} options={opts(TYPES)} />
          <Select label="Category" value={form.vehicleCategory} onChange={e => set('vehicleCategory', e.target.value as Vehicle['vehicleCategory'])} options={opts(CATEGORIES)} />
          <Select label="Fuel" value={form.fuelType} onChange={e => set('fuelType', e.target.value as Vehicle['fuelType'])} options={opts(FUELS)} />
          <Select label="Transmission" value={form.transmission} onChange={e => set('transmission', e.target.value as Vehicle['transmission'])} options={opts(TRANSMISSIONS)} />
          <Input label="Engine capacity (cc)" type="number" value={form.engineCapacityCc || ''} onChange={setNum('engineCapacityCc')} />
          <Input label="Seats" type="number" value={form.numberOfSeats || ''} onChange={setNum('numberOfSeats')} />
          <Input label="Chassis / VIN" value={form.vin} onChange={e => set('vin', e.target.value)} />
          <Input label="Engine number" value={form.engineNumber} onChange={e => set('engineNumber', e.target.value)} />
          <Input label="Country of registration" value={form.countryOfRegistration} onChange={e => set('countryOfRegistration', e.target.value)} />
          <Input label="Registration date" type="date" value={form.registrationDate} onChange={e => set('registrationDate', e.target.value)} />
          <Input label="Registration expiry" type="date" value={form.registrationExpiryDate} onChange={e => set('registrationExpiryDate', e.target.value)} />
          <Input label="Current mileage (KM)" type="number" min={0} value={form.currentMileage} onChange={setNum('currentMileage')} />
          <Input label="Assigned driver" value={form.assignedDriver ?? ''} onChange={e => set('assignedDriver', e.target.value)} />
          <Input label="Department" value={form.department ?? ''} onChange={e => set('department', e.target.value)} />
          <Input label="Location / yard" value={form.location ?? ''} onChange={e => set('location', e.target.value)} />
        </section>

        <section>
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Purchase & valuation</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Purchase date" type="date" value={form.purchase.purchaseDate} onChange={e => setGroup('purchase', 'purchaseDate', e.target.value)} />
            <Input label="Purchase value" type="number" min={0} step="0.001" value={form.purchase.purchaseValue} onChange={e => setGroup('purchase', 'purchaseValue', Number(e.target.value))} />
            <Input label="Purchase invoice no." value={form.purchase.purchaseInvoiceNumber} onChange={e => setGroup('purchase', 'purchaseInvoiceNumber', e.target.value)} />
            <Input label="Warranty expiry" type="date" value={form.purchase.warrantyExpiryDate ?? ''} onChange={e => setGroup('purchase', 'warrantyExpiryDate', e.target.value)} />
            <Input label="Market value" type="number" min={0} step="0.001" value={form.currentMarketValue} onChange={setNum('currentMarketValue')} />
          </div>
        </section>

        <section>
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Depreciation & oil service</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Depreciation method"
              value={form.depreciation.depreciationMethod}
              onChange={e => setGroup('depreciation', 'depreciationMethod', e.target.value)}
              options={opts(['Straight-Line', 'Reducing Balance'])}
            />
            <Input label="Useful life (years)" type="number" min={1} value={form.depreciation.usefulLifeYears || ''} onChange={e => setGroup('depreciation', 'usefulLifeYears', Number(e.target.value))} />
            <Input label="Annual rate (%)" type="number" min={0} step="0.01" value={form.depreciation.annualRatePercentage || ''} onChange={e => setGroup('depreciation', 'annualRatePercentage', Number(e.target.value))} />
            <Input label="Salvage value" type="number" min={0} step="0.001" value={form.depreciation.salvageValue} onChange={e => setGroup('depreciation', 'salvageValue', Number(e.target.value))} />
            <Input label="Oil change interval (KM)" type="number" min={0} value={form.oilConfig.intervalKm || ''} onChange={e => setGroup('oilConfig', 'intervalKm', Number(e.target.value))} />
            <Input label="Oil grade" value={form.oilConfig.oilGrade} onChange={e => setGroup('oilConfig', 'oilGrade', e.target.value)} />
          </div>
        </section>

        <section>
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Insurance</h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Input label="Provider" value={form.insuranceProvider} onChange={e => set('insuranceProvider', e.target.value)} />
            <Input label="Policy number" value={form.insurancePolicyNumber} onChange={e => set('insurancePolicyNumber', e.target.value)} />
            <Input label="Expiry" type="date" value={form.insuranceExpiryDate} onChange={e => set('insuranceExpiryDate', e.target.value)} />
            <Input label="Annual premium" type="number" min={0} step="0.001" value={form.insurancePremiumAnnual} onChange={setNum('insurancePremiumAnnual')} />
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs sm:text-sm font-semibold text-slate-100">Vehicle photo</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={e => setPhoto(e.target.files?.[0] ?? null)}
              className="text-xs text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-slate-850 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
            />
            <p className="text-xs text-slate-400">PNG, JPEG or WebP up to 5 MB. Leave empty to keep the current photo.</p>
          </div>
          <Textarea label="Notes" value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} />
        </section>
      </form>
    </Modal>
  );
};

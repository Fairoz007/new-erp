// Step 6: vehicle types (bus-first defaults) and custom fields. Also Settings → Vehicle types / Custom fields.
import React from 'react';
import type { VehicleType } from '../../../services/org';
import { MasterEditor } from '../MasterEditor';
import { FieldBuilder } from '../FieldBuilder';
import { Section } from '../shared';

export const VehicleTypesEditor: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => (
  <Section title="Vehicle types" description="Bus, Mini-bus, Coaster, Car, Pickup, Truck, SUV and Van are provided. Defaults can be renamed or deactivated but not deleted.">
    <MasterEditor<VehicleType>
      master="vehicleTypes" readOnly={readOnly} rowKey={r => r.id} addLabel="Add vehicle type"
      blank={{ name: '', category: 'Passenger', isBus: false, seatCapacity: null, licenceClass: '', serviceIntervalKm: 10000, serviceIntervalMonths: 6, active: true }}
      canDelete={r => (r.isSystem ? 'Default types cannot be deleted; untick Active instead' : null)}
      columns={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'category', label: 'Category', type: 'select', options: ['Passenger', 'Light', 'Heavy', 'Other'].map(v => ({ value: v, label: v })) },
        { key: 'isBus', label: 'Bus', type: 'checkbox' },
        { key: 'seatCapacity', label: 'Seats', type: 'number', min: 0, max: 200, nullable: true, width: '80px' },
        { key: 'licenceClass', label: 'Licence class', type: 'text' },
        { key: 'serviceIntervalKm', label: 'Service every (km)', type: 'number', min: 1, nullable: true, width: '110px' },
        { key: 'serviceIntervalMonths', label: '…or months', type: 'number', min: 1, max: 60, nullable: true, width: '90px' },
        { key: 'active', label: 'Active', type: 'checkbox' },
      ]}
    />
  </Section>
);

export const VehicleTypesStep: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => (
  <div className="space-y-4">
    <VehicleTypesEditor readOnly={readOnly} />
    <FieldBuilder readOnly={readOnly} />
  </div>
);

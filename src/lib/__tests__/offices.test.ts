import { describe, expect, it } from 'vitest';
import { officeFigures, officeLocationLines, officeMapsUrl } from '../offices';

const HO = 'ho', DQ = 'dq', NS = 'ns';

describe('office location', () => {
  const ho = { address: 'Al Jami Al Akbar Street, Ghala', city: 'Muscat', state: 'Muscat', postalCode: '117', country: 'Oman' };
  it('builds the lines without empty parts', () => {
    expect(officeLocationLines(ho)).toEqual(['Al Jami Al Akbar Street, Ghala', 'Muscat, Muscat 117', 'Oman']);
    expect(officeLocationLines({ address: '', city: 'Duqm', state: '', postalCode: '', country: 'Oman' })).toEqual(['Duqm', 'Oman']);
  });
  it('links to a Google Maps search with the encoded address', () => {
    expect(officeMapsUrl(ho)).toBe('https://www.google.com/maps/search/?api=1&query=Al%20Jami%20Al%20Akbar%20Street%2C%20Ghala%2C%20Muscat%2C%20Muscat%2C%20117%2C%20Oman');
  });
  it('has no link when the office has no address line', () => {
    expect(officeMapsUrl({ address: '  ', city: 'Duqm', state: '', postalCode: '', country: 'Oman' })).toBeNull();
  });
});

describe('office figures', () => {
  const data = {
    vehicles: [
      { companyId: HO, status: 'Active' }, { companyId: HO, status: 'Active' }, { companyId: HO, status: 'Under Maintenance' },
      { companyId: DQ, status: 'Accident' }, { companyId: DQ, status: 'Sold' }, { companyId: NS, status: 'Active' },
    ],
    workOrders: [
      { companyId: HO, status: 'In Progress' }, { companyId: HO, status: 'Completed' }, { companyId: DQ, status: 'Draft' },
      { companyId: DQ, status: 'Cancelled' }, { companyId: NS, status: 'Waiting for Parts' },
    ],
    expiries: [{ companyId: HO }, { companyId: HO }, { companyId: NS }],
    invoiceByOffice: [
      { company_id: HO, ar_open: 2677.5, ar_overdue_sum: 0 },
      { company_id: DQ, ar_open: 1050.125, ar_overdue_sum: 1050.125 },
      { company_id: NS, ar_open: 99, ar_overdue_sum: 0 },
    ],
    bankAccounts: [{ companyId: HO, currentBalance: 5185.69 }, { companyId: HO, currentBalance: 0.31 }, { companyId: DQ, currentBalance: 100 }],
    expensesByOffice: [{ company_id: HO, total: 45.5 }, { company_id: DQ, total: 12.25 }, { company_id: NS, total: 1 }],
  };

  it('counts and totals one office', () => {
    const f = officeFigures([HO, DQ], data).get(HO)!;
    expect(f).toEqual({
      vehiclesActive: 2, vehiclesOffRoad: 1, vehiclesTotal: 3, openWorkOrders: 1, expiringDocuments: 2,
      receivablesOpen: 2677.5, receivablesOverdue: 0, cashAndBank: 5186, expensesThisMonth: 45.5,
    });
  });

  it('All offices is the sum of the given offices only (an office not given is left out)', () => {
    const all = officeFigures([HO, DQ], data).get('all')!;
    expect(all.vehiclesActive).toBe(2);
    expect(all.vehiclesOffRoad).toBe(2);
    expect(all.openWorkOrders).toBe(2);
    expect(all.expiringDocuments).toBe(2);
    expect(all.receivablesOpen).toBe(3727.625);
    expect(all.receivablesOverdue).toBe(1050.125);
    expect(all.cashAndBank).toBe(5286);
    expect(all.expensesThisMonth).toBe(57.75);
  });
});

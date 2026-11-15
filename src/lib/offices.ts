// Offices home screen: location lines, the "Open in Maps" link and the per-office figures.
// Pure functions (unit-tested in src/lib/__tests__/offices.test.ts). Every input is data the user
// may already see (RLS); the figures use the same definitions as the dashboards they come from.
import type { Company } from '../types/system';

type Place = Pick<Company, 'address' | 'city' | 'state' | 'postalCode' | 'country'>;

/** "Al Jami Al Akbar Street, Ghala" / "Muscat, Muscat Governorate 117" / "Oman": empty parts left out. */
export function officeLocationLines(o: Place): string[] {
  const t = (v?: string) => (v ?? '').trim();
  const cityLine = [t(o.city), [t(o.state), t(o.postalCode)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [t(o.address), cityLine, t(o.country)].filter(Boolean);
}

/** Google Maps search link for the office address, or null when the office has no address line. */
export function officeMapsUrl(o: Place): string | null {
  if (!(o.address ?? '').trim()) return null;
  const query = [o.address, o.city, o.state, o.postalCode, o.country].map(v => (v ?? '').trim()).filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Work orders that are still open (same list as the fleet dashboard's "next scheduled service"). */
export const OPEN_WORK_ORDER_STATUSES = ['Draft', 'Requested', 'Approved', 'Scheduled', 'In Progress', 'Waiting for Parts'] as const;
/** Vehicles that cannot be driven today (dashboard: "In Workshop" plus accident repairs). */
export const OFF_ROAD_STATUSES = ['Under Maintenance', 'Accident'] as const;

export interface OfficeFigureInputs {
  vehicles: { companyId: string; status: string }[];
  workOrders: { companyId: string; status: string }[];
  expiries: { companyId: string }[];                       // v_fleet_expiries rows due within the alert window (overdue included)
  invoiceByOffice: { company_id: string; ar_open: number; ar_overdue_sum: number }[];   // invoice_summary.by_office
  bankAccounts: { companyId: string; currentBalance: number; active?: boolean }[];
  expensesByOffice: { company_id: string | null; total: number }[];                     // expense_totals(office), this month, approved
}

export interface OfficeFigures {
  vehiclesActive: number;
  vehiclesOffRoad: number;
  vehiclesTotal: number;
  openWorkOrders: number;
  expiringDocuments: number;
  receivablesOpen: number;
  receivablesOverdue: number;
  cashAndBank: number;
  expensesThisMonth: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Figures for each office id, plus "all" = the sum over the given offices only. */
export function officeFigures(officeIds: string[], d: OfficeFigureInputs): Map<string, OfficeFigures> {
  const out = new Map<string, OfficeFigures>();
  const ids = new Set(officeIds);
  for (const id of officeIds) {
    const v = d.vehicles.filter(x => x.companyId === id);
    const inv = d.invoiceByOffice.find(b => b.company_id === id);
    out.set(id, {
      vehiclesActive: v.filter(x => x.status === 'Active').length,
      vehiclesOffRoad: v.filter(x => (OFF_ROAD_STATUSES as readonly string[]).includes(x.status)).length,
      vehiclesTotal: v.length,
      openWorkOrders: d.workOrders.filter(w => w.companyId === id && (OPEN_WORK_ORDER_STATUSES as readonly string[]).includes(w.status)).length,
      expiringDocuments: d.expiries.filter(e => e.companyId === id).length,
      receivablesOpen: r3(inv?.ar_open ?? 0),
      receivablesOverdue: r3(inv?.ar_overdue_sum ?? 0),
      cashAndBank: r3(d.bankAccounts.filter(b => b.companyId === id).reduce((s, b) => s + (b.currentBalance || 0), 0)),
      expensesThisMonth: r3(d.expensesByOffice.filter(e => e.company_id === id).reduce((s, e) => s + (e.total || 0), 0)),
    });
  }
  const all: OfficeFigures = {
    vehiclesActive: 0, vehiclesOffRoad: 0, vehiclesTotal: 0, openWorkOrders: 0, expiringDocuments: 0,
    receivablesOpen: 0, receivablesOverdue: 0, cashAndBank: 0, expensesThisMonth: 0,
  };
  for (const [id, f] of out) {
    if (!ids.has(id)) continue;
    for (const k of Object.keys(all) as (keyof OfficeFigures)[]) all[k] = r3(all[k] + f[k]);
  }
  out.set('all', all);
  return out;
}

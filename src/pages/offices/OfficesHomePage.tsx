// Offices home: the first screen after sign-in. One card per office the user may open (the office
// list comes from FleetContext, so RLS decides), plus "All offices" for users who see more than one.
// A card opens that office: it sets the office selector and goes to the role dashboard.
// Figures come from the same queries as the dashboards (vehicles, work orders, v_fleet_expiries,
// invoice_summary, bank balances, expense_totals); money only for roles that see it there.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Car, CircleAlert, ClipboardList, ExternalLink, FileClock, Landmark, Mail, MapPin, Pencil, Phone, Receipt, Wallet } from 'lucide-react';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useOptionalOrg } from '../../context/OrgContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { AllOfficesBadge, OfficeBadge, useOfficeLogoUrls } from '../../components/common/OfficeBadge';
import { fetchFleetExpiries } from '../../services/drivers';
import { useExpenseTotals, useInvoiceSummary } from '../../services/queries';
import { formatCurrency } from '../../utils/financial';
import { addDaysYmd, localToday } from '../../utils/date';
import { officeFigures, officeLocationLines, officeMapsUrl, type OfficeFigures } from '../../lib/offices';
import type { Company } from '../../types/system';
import { CompanyFormModal } from '../companies/CompanyFormModal';

// A one-office user skips this screen once per visit; the header link still brings them here.
let landingDone = false;

const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

interface Shown { fleet: boolean; workOrders: boolean; expiries: boolean; receivables: boolean; cash: boolean; expenses: boolean }

const Figure: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'warn' | 'bad' }> = ({ icon: Icon, label, value, sub, tone }) => (
  <div className="min-w-0 rounded-xl border border-slate-700 bg-slate-850/60 px-3 py-2.5">
    <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-slate-400">
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> <span className="truncate">{label}</span>
    </p>
    <p className={`mt-1 text-sm font-bold tabular-nums truncate ${tone === 'bad' ? 'text-danger-700' : tone === 'warn' ? 'text-warning-700' : 'text-slate-100'}`}>{value}</p>
    {sub && <p className="text-2xs text-slate-400 truncate">{sub}</p>}
  </div>
);

const FiguresGrid: React.FC<{ f?: OfficeFigures; shown: Shown; currency: string; loading: boolean }> = ({ f, shown, currency, loading }) => {
  const money = (n: number) => formatCurrency(n, currency);
  const items: React.ReactNode[] = [];
  if (shown.fleet) items.push(<Figure key="v" icon={Car} label="Vehicles" value={f ? `${f.vehiclesActive} active` : '…'} sub={f ? `${f.vehiclesOffRoad} off road · ${f.vehiclesTotal} in all` : undefined} tone={f && f.vehiclesOffRoad > 0 ? 'warn' : undefined} />);
  if (shown.workOrders) items.push(<Figure key="w" icon={ClipboardList} label="Open work orders" value={f ? f.openWorkOrders : '…'} />);
  if (shown.expiries) items.push(<Figure key="e" icon={FileClock} label="Documents expiring" value={f ? f.expiringDocuments : '…'} tone={f && f.expiringDocuments > 0 ? 'warn' : undefined} />);
  if (shown.receivables) items.push(<Figure key="r" icon={Receipt} label="Receivables due" value={f ? money(f.receivablesOpen) : '…'} sub={f && f.receivablesOverdue > 0 ? `${money(f.receivablesOverdue)} overdue` : undefined} tone={f && f.receivablesOverdue > 0 ? 'bad' : undefined} />);
  if (shown.cash) items.push(<Figure key="c" icon={Landmark} label="Cash and bank" value={f ? money(f.cashAndBank) : '…'} />);
  if (shown.expenses) items.push(<Figure key="x" icon={Wallet} label="Expenses this month" value={f ? money(f.expensesThisMonth) : '…'} />);
  if (items.length === 0) return null;
  if (loading) {
    return <div className="grid grid-cols-2 gap-2" aria-busy="true">{items.map((_, i) => <Skeleton key={i} className="h-[62px] rounded-xl" />)}</div>;
  }
  return <div className="grid grid-cols-2 gap-2">{items}</div>;
};

export const OfficesHomePage: React.FC = () => {
  const { companies, vehicles, workOrders, bankAccounts, isCollectionLoaded, setSelectedCompanyId, selectedCompanyId, currency, updateCompany } = useFleet();
  const { currentUser, isSuperAdmin, hasPermission, canAccessPage } = useAuth();
  const { setCurrentPage, addToast } = useUI();
  const alertDays = useOptionalOrg()?.organization?.expiryAlertDays ?? 30;
  const logoUrl = useOfficeLogoUrls(companies.map(c => c.logo));
  const codes = companies.map(c => c.code);
  const ids = companies.map(c => c.id);
  const multi = isSuperAdmin || !!currentUser.allOffices || companies.length > 1;
  const companiesLoaded = isCollectionLoaded('companies');

  // One office only: open it straight away (once per visit)
  useEffect(() => {
    if (landingDone || !companiesLoaded) return;
    landingDone = true;
    if (!multi && companies.length === 1) {
      setSelectedCompanyId(companies[0].id);
      setCurrentPage('dashboard');
    }
  }, [companiesLoaded, multi, companies, setSelectedCompanyId, setCurrentPage]);

  // What this user may see, per office (decision 7: money only where the dashboards show it)
  const shownFor = (id?: string): Shown => ({
    fleet: canAccessPage('vehicles'),
    workOrders: canAccessPage('work-orders'),
    expiries: canAccessPage('vehicles') || canAccessPage('drivers'),
    receivables: hasPermission('view', 'invoices', id),
    cash: hasPermission('view', 'accounting', id) || hasPermission('view', 'financial-statements', id),
    expenses: hasPermission('view', 'expenses', id),
  });
  const shownAll: Shown = useMemo(() => {
    const per = ids.map(id => shownFor(id));
    const every = (k: keyof Shown) => per.length > 0 && per.every(s => s[k]);
    return { fleet: every('fleet'), workOrders: every('workOrders'), expiries: every('expiries'), receivables: every('receivables'), cash: every('cash'), expenses: every('expenses') };
  }, [ids.join(','), hasPermission, canAccessPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const anyReceivables = ids.some(id => shownFor(id).receivables);
  const anyExpenses = ids.some(id => shownFor(id).expenses);
  const anyExpiries = canAccessPage('vehicles') || canAccessPage('drivers');

  const summary = useInvoiceSummary(null, { enabled: anyReceivables });
  const expenses = useExpenseTotals({ from: monthStart(), to: localToday() }, 'office', { enabled: anyExpenses });
  const [expiries, setExpiries] = useState<{ companyId: string }[] | null>(null);
  useEffect(() => {
    if (!anyExpiries) { setExpiries([]); return; }
    let live = true;
    fetchFleetExpiries(addDaysYmd(alertDays)).then(r => live && setExpiries(r)).catch(() => live && setExpiries(null));
    return () => { live = false; };
  }, [alertDays, anyExpiries]);

  const figures = useMemo(() => officeFigures(ids, {
    vehicles, workOrders, expiries: expiries ?? [],
    invoiceByOffice: summary.data?.by_office ?? [],
    bankAccounts,
    expensesByOffice: expenses.data ?? [],
  }), [ids.join(','), vehicles, workOrders, expiries, summary.data, bankAccounts, expenses.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = !isCollectionLoaded('vehicles') || !isCollectionLoaded('workOrders')
    || (anyReceivables && summary.loading) || (anyExpenses && expenses.loading) || (anyExpiries && expiries === null);
  const loadError = summary.error ?? expenses.error;

  const open = (id: string) => { setSelectedCompanyId(id); setCurrentPage('dashboard'); };

  // Edit (companies: edit permission per office)
  const [editing, setEditing] = useState<Company | null>(null);
  const saveOffice = async (data: Omit<Company, 'id'>) => {
    if (!editing) return;
    await updateCompany(editing.id, { ...data, updatedAt: editing.updatedAt });
    addToast({ type: 'success', title: 'Office saved', message: `${data.name} was saved.` });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offices"
        description={multi ? 'Choose an office to open its dashboard. Every figure on the dashboard then belongs to that office only.' : 'Your office.'}
      />

      {loadError && (
        <p role="alert" className="text-xs text-danger-700">
          Some figures could not be loaded: {loadError.message}{' '}
          <button type="button" className="font-semibold underline" onClick={() => { void summary.refetch(); void expenses.refetch(); }}>Retry</button>
        </p>
      )}

      {companiesLoaded && companies.length === 0 && (
        <div className="bg-white border border-slate-700 rounded-card">
          <EmptyState title="No offices yet" description="No office is assigned to your account. Ask an administrator to give you access in Users & Roles." />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
        {multi && companies.length > 0 && (
          <article
            onClick={() => { setSelectedCompanyId('all'); setCurrentPage('dashboard'); }}
            className={`group bg-white border rounded-card shadow-card p-5 flex flex-col gap-4 cursor-pointer transition-shadow motion-safe:transition-transform hover:shadow-elevated ${selectedCompanyId === 'all' ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-700'}`}
          >
            <div className="flex items-center gap-3">
              <AllOfficesBadge size="lg" />
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-100">All offices</h2>
                <p className="text-xs text-slate-400">Combined figures of {companies.length} office{companies.length === 1 ? '' : 's'}</p>
              </div>
            </div>
            <FiguresGrid f={figures.get('all')} shown={shownAll} currency={currency} loading={loading} />
            <div className="mt-auto flex justify-end">
              <Button size="sm" rightIcon={<ArrowRight className="w-4 h-4" />} onClick={e => { e.stopPropagation(); setSelectedCompanyId('all'); setCurrentPage('dashboard'); }}>
                Open all offices
              </Button>
            </div>
          </article>
        )}

        {companies.map(c => {
          const lines = officeLocationLines(c);
          const maps = officeMapsUrl(c);
          const canEdit = hasPermission('edit', 'companies', c.id);
          const selected = selectedCompanyId === c.id;
          return (
            <article
              key={c.id}
              onClick={() => open(c.id)}
              className={`group bg-white border rounded-card shadow-card p-5 flex flex-col gap-4 cursor-pointer transition-shadow hover:shadow-elevated ${selected ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-700'}`}
            >
              <div className="flex items-start gap-3">
                <OfficeBadge office={c} allCodes={codes} logoUrl={logoUrl(c.logo)} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-slate-100 break-words">{c.name}</h2>
                  <p className="text-xs text-slate-400 font-mono">{c.code}</p>
                </div>
                <Badge variant={c.active ? 'emerald' : 'slate'}>{c.active ? 'Active' : 'Inactive'}</Badge>
              </div>

              <div className="space-y-1.5 text-xs text-slate-300">
                {lines.length > 0 && (
                  <p className="flex items-start gap-2"><MapPin className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" aria-hidden="true" /><span>{lines.join(', ')}</span></p>
                )}
                {c.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" /><span>{c.phone}</span></p>}
                {c.email && <p className="flex items-center gap-2 min-w-0"><Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" /><span className="truncate">{c.email}</span></p>}
                {!lines.length && !c.phone && !c.email && (
                  <p className="flex items-center gap-2 text-slate-400"><CircleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />No address or contact details recorded.</p>
                )}
                {maps && (
                  <a href={maps} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 font-semibold text-brand-600 hover:underline">
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Open in Maps<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </div>

              <FiguresGrid f={figures.get(c.id)} shown={shownFor(c.id)} currency={currency} loading={loading} />

              <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
                {canEdit && (
                  <Button variant="outline" size="sm" leftIcon={<Pencil className="w-4 h-4" />} onClick={e => { e.stopPropagation(); setEditing(c); }}>
                    Edit<span className="sr-only"> {c.name}</span>
                  </Button>
                )}
                <Button size="sm" rightIcon={<ArrowRight className="w-4 h-4" />} onClick={e => { e.stopPropagation(); open(c.id); }}>
                  Open<span className="sr-only"> {c.name}</span>
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <CompanyFormModal isOpen={!!editing} onClose={() => setEditing(null)} company={editing ?? undefined} onSubmit={saveOffice} />
    </div>
  );
};

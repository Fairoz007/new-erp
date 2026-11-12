// HR → Payroll. A month's payroll goes Draft → Under Review → Approved (journal posted) → Paid
// (from a bank account). The HR team prepares and edits drafts; an approver in the office approves
// within their limit (not their own submission); finance pays. The database enforces every step.
import React, { useMemo, useState } from 'react';
import { Calculator, Printer, Play, RefreshCw, Send, CheckCircle2, Banknote, Trash2, Pencil, Eye } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate, localToday } from '../../utils/date';
import type { PayrollLineItem, PayrollRun } from '../../types/hr';
import {
  approvePayroll, deletePayrollDraft, payPayroll, recalculatePayroll, submitPayroll, updatePayrollItem,
} from '../../services/hr';
import { GeneratePayrollModal } from './GeneratePayrollModal';
import { toPayslip } from './payslip';

const STATUS_VARIANT: Record<string, 'slate' | 'amber' | 'blue' | 'emerald' | 'rose'> = {
  Draft: 'slate', 'Under Review': 'amber', Approved: 'blue', Paid: 'emerald', Cancelled: 'rose',
};

export const PayrollPage: React.FC = () => {
  const { payrollRuns: allRuns, currency, selectedCompanyId, companies, reload } = useFleet();
  const { hasPermission } = useAuth();
  const runs = selectedCompanyId === 'all' ? allRuns : allRuns.filter(r => r.companyId === selectedCompanyId);
  const [generating, setGenerating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = allRuns.find(r => r.id === openId) ?? null;
  const canPrepare = companies.some(c => hasPermission('create', 'payroll', c.id));
  const office = (id: string) => companies.find(c => c.id === id)?.name ?? '—';
  const year = new Date().getFullYear();
  const ytd = runs.filter(r => r.year === year && (r.status === 'Approved' || r.status === 'Paid'));

  const columns: Column<PayrollRun>[] = [
    { key: 'payrollNumber', header: 'Payroll', render: r => (
      <button type="button" className="text-left" onClick={() => setOpenId(r.id)}>
        <p className="font-bold text-slate-100 hover:text-forest-400">{r.periodLabel}</p>
        <p className="text-[11px] text-slate-400 font-mono">{r.payrollNumber} · {office(r.companyId)}</p>
      </button>
    ) },
    { key: 'totalEmployees', header: 'Payslips', align: 'center' },
    { key: 'totalGrossPay', header: 'Gross', align: 'right', render: r => <span className="font-mono text-xs">{formatCurrency(r.totalGrossPay, currency)}</span> },
    { key: 'totalDeductions', header: 'Deductions', align: 'right', render: r => <span className="font-mono text-xs text-rose-500">{formatCurrency(r.totalDeductions, currency)}</span> },
    { key: 'totalNetPayout', header: 'Net pay', align: 'right', render: r => <span className="font-mono text-xs font-bold">{formatCurrency(r.totalNetPayout, currency)}</span> },
    { key: 'status', header: 'Status', align: 'center', render: r => <Badge variant={STATUS_VARIANT[r.status] ?? 'slate'}>{r.status}</Badge> },
    { key: 'paymentDate', header: 'Paid on', render: r => <span className="text-xs">{r.status === 'Paid' && r.paymentDate ? formatDate(r.paymentDate) : '—'}</span> },
    { key: 'open', header: '', sortable: false, align: 'right', render: r => <Button variant="ghost" size="xs" leftIcon={<Eye className="w-3 h-3" />} onClick={() => setOpenId(r.id)}>Open</Button> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">Payroll</h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">Prepare, review, approve and pay monthly salaries. Approval posts the journal; payment comes from a bank account.</p>
        </div>
        {canPrepare && <Button size="sm" className="rounded-full" leftIcon={<Play className="w-4 h-4" />} onClick={() => setGenerating(true)}>Prepare payroll</Button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={`Net salaries ${year}`} value={formatCurrency(ytd.reduce((t, r) => t + r.totalNetPayout, 0), currency)} subValue={`${ytd.length} approved or paid month(s)`} icon={<Calculator className="w-4 h-4" />} variant="indigo" isHero />
        <StatCard title="Waiting for approval" value={runs.filter(r => r.status === 'Under Review').length} subValue="Submitted payroll runs" icon={<Send className="w-4 h-4" />} variant="amber" />
        <StatCard title="Approved, not paid" value={formatCurrency(runs.filter(r => r.status === 'Approved').reduce((t, r) => t + r.totalNetPayout, 0), currency)} subValue="Net salaries payable" icon={<Banknote className="w-4 h-4" />} variant="blue" />
      </div>
      <DataTable data={runs} collection="payrollRuns" columns={columns} keyExtractor={r => r.id} title="Payroll runs"
        searchFields={['payrollNumber', 'periodLabel', 'status']} exportFilename="Payroll_Runs" exportModule="payroll" emptyMessage="No payroll yet. Prepare the first month." />
      <GeneratePayrollModal isOpen={generating} onClose={() => setGenerating(false)} onCreated={r => setOpenId(r.id)} />
      {open && <RunModal run={open} onClose={() => setOpenId(null)} onChanged={() => reload(['payrollRuns', 'journalEntries', 'bankAccounts', 'employees'])} />}
    </div>
  );
};

const RunModal: React.FC<{ run: PayrollRun; onClose: () => void; onChanged: () => Promise<void> }> = ({ run, onClose, onChanged }) => {
  const { currency, bankAccounts } = useFleet();
  const { hasPermission, canApprove, currentUser, isSuperAdmin } = useAuth();
  const { addToast, openPayslipModal } = useUI();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<PayrollLineItem | null>(null);
  const [paying, setPaying] = useState(false);
  const [approving, setApproving] = useState(false);
  const c = run.companyId;
  const canEdit = hasPermission('edit', 'payroll', c);
  const own = run.submittedBy === currentUser.id && !isSuperAdmin;
  const canApproveRun = hasPermission('approve', 'payroll', c) && canApprove('payroll', run.totalNetPayout, c) && !own;
  const canPay = hasPermission('create', 'payments', c);
  const draft = run.status === 'Draft';

  const act = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label); setErr(null);
    try { await fn(); await onChanged(); addToast({ type: 'success', title: ok, message: `${run.payrollNumber} · ${run.periodLabel}` }); return true; }
    catch (e) { setErr((e as Error).message); return false; }
    finally { setBusy(null); }
  };

  const cols: Column<PayrollLineItem>[] = [
    { key: 'employeeName', header: 'Employee', render: i => (
      <div><p className="font-semibold text-slate-100">{i.employeeName}</p><p className="text-[11px] text-slate-400">{i.employeeCode} · {i.designation}{i.daysWorked != null && i.daysWorked < 28 ? ` · ${i.daysWorked} days` : ''}</p></div>
    ) },
    { key: 'basicSalary', header: 'Basic', align: 'right', render: i => <span className="font-mono text-xs">{i.basicSalary.toFixed(3)}</span> },
    { key: 'allow', header: 'Allowances', align: 'right', value: i => i.housingAllowance + i.transportAllowance + i.otherAllowances,
      render: i => <span className="font-mono text-xs">{(i.housingAllowance + i.transportAllowance + i.otherAllowances).toFixed(3)}{i.gratuityAmount ? <Badge variant="violet" className="ml-1">EOS</Badge> : null}</span> },
    { key: 'overtimeAmount', header: 'Overtime', align: 'right', render: i => <span className="font-mono text-xs">{i.overtimeAmount.toFixed(3)}{i.overtimeHours ? <span className="text-slate-400"> ({i.overtimeHours}h)</span> : null}</span> },
    { key: 'bonusAmount', header: 'Bonus', align: 'right', render: i => <span className="font-mono text-xs">{i.bonusAmount.toFixed(3)}</span> },
    { key: 'totalDeductions', header: 'Deductions', align: 'right', render: i => <span className="font-mono text-xs text-rose-500" title={`PASI ${i.pasiEmployeeDeduction} · unpaid leave ${i.unpaidLeaveDeduction} · loan ${i.loanAdvanceDeduction} · other ${i.otherDeductions}`}>{i.totalDeductions.toFixed(3)}</span> },
    { key: 'netPay', header: 'Net', align: 'right', render: i => <span className={`font-mono text-xs font-bold ${i.netPay < 0 ? 'text-rose-500' : ''}`}>{i.netPay.toFixed(3)}</span> },
    { key: 'actions', header: '', sortable: false, align: 'right', render: i => (
      <div className="flex justify-end gap-1">
        {draft && canEdit && <Button variant="ghost" size="xs" leftIcon={<Pencil className="w-3 h-3" />} onClick={() => setEditing(i)}>Edit</Button>}
        <Button variant="ghost" size="xs" leftIcon={<Printer className="w-3 h-3" />} onClick={() => openPayslipModal(toPayslip(run, i))}>{draft || run.status === 'Under Review' ? 'Preview' : 'Payslip'}</Button>
      </div>
    ) },
  ];

  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="2xl" title={`${run.periodLabel} · ${run.payrollNumber}`}
      description={`${run.companyName} · ${run.status}${run.submittedByName ? ` · submitted by ${run.submittedByName}` : ''}${run.approvedBy ? ` · approved by ${run.approvedBy}` : ''}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          {[['Payslips', String(run.totalEmployees)], ['Gross', formatCurrency(run.totalGrossPay, currency)], ['Deductions', formatCurrency(run.totalDeductions, currency)],
            ['Employer PASI', formatCurrency(run.totalEmployerPasi, currency)], ['Net pay', formatCurrency(run.totalNetPayout, currency)]].map(([k, v]) => (
            <div key={k} className="p-3 rounded-xl border border-slate-700"><p className="text-slate-400">{k}</p><p className="font-bold text-slate-100">{v}</p></div>
          ))}
        </div>
        {err && <p role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</p>}
        <div className="flex flex-wrap gap-2">
          {(draft || run.status === 'Under Review') && canEdit && (
            <Button variant="outline" size="sm" leftIcon={<RefreshCw className="w-4 h-4" />} isLoading={busy === 'recalc'} disabled={!!busy}
              onClick={() => void act('recalc', () => recalculatePayroll(run.id), 'Payroll recalculated')}>
              {draft ? 'Recalculate' : 'Reopen and recalculate'}
            </Button>
          )}
          {draft && canEdit && (
            <Button variant="secondary" size="sm" leftIcon={<Send className="w-4 h-4" />} isLoading={busy === 'submit'} disabled={!!busy}
              onClick={() => void act('submit', () => submitPayroll(run.id), 'Submitted for approval')}>Submit for approval</Button>
          )}
          {(draft || run.status === 'Under Review') && canApproveRun && (
            <Button variant="success" size="sm" leftIcon={<CheckCircle2 className="w-4 h-4" />} disabled={!!busy} onClick={() => setApproving(true)}>Approve and post</Button>
          )}
          {(draft || run.status === 'Under Review') && own && hasPermission('approve', 'payroll', c) && (
            <span className="text-xs text-slate-400 self-center">You submitted this payroll; another approver must approve it.</span>
          )}
          {run.status === 'Approved' && canPay && (
            <Button variant="success" size="sm" leftIcon={<Banknote className="w-4 h-4" />} disabled={!!busy} onClick={() => setPaying(true)}>Pay salaries</Button>
          )}
          {(draft || run.status === 'Under Review') && hasPermission('delete', 'payroll', c) && (
            <Button variant="danger" size="sm" leftIcon={<Trash2 className="w-4 h-4" />} isLoading={busy === 'delete'} disabled={!!busy}
              onClick={() => { if (window.confirm('Delete this draft payroll?')) void act('delete', () => deletePayrollDraft(run.id), 'Draft deleted').then(ok => ok && onClose()); }}>
              Delete draft
            </Button>
          )}
        </div>
        <DataTable data={run.items} columns={cols} keyExtractor={i => i.id} title="Payslips" searchFields={['employeeName', 'employeeCode', 'designation']}
          exportFilename={`Payroll_${run.payrollNumber}`} exportModule="payroll" pageSizeDefault={25} />
      </div>
      {editing && <ItemModal item={editing} onClose={() => setEditing(null)} onSaved={async () => { await onChanged(); setEditing(null); }} />}
      {paying && <PayModal run={run} banks={bankAccounts.filter(b => b.companyId === c && b.active !== false)} onClose={() => setPaying(false)}
        onPay={(bank, date) => act('pay', () => payPayroll(run.id, bank, date), 'Salaries paid').then(ok => { if (ok) setPaying(false); })} />}
      {approving && <ApproveModal run={run} onClose={() => setApproving(false)}
        onApprove={note => act('approve', () => approvePayroll(run.id, note), 'Payroll approved and posted').then(ok => { if (ok) setApproving(false); })} />}
    </Modal>
  );
};

const ItemModal: React.FC<{ item: PayrollLineItem; onClose: () => void; onSaved: () => Promise<void> }> = ({ item, onClose, onSaved }) => {
  const [v, setV] = useState({ bonus: item.bonusAmount, loan: item.loanAdvanceDeduction, overtimeHours: item.overtimeHours ?? 0, notes: item.notes ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (v.bonus < 0 || v.loan < 0 || v.overtimeHours < 0) { setErr('Amounts cannot be negative.'); return; }
    setBusy(true); setErr(null);
    try { await updatePayrollItem(item.id, v); await onSaved(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="sm" title={`Adjust ${item.employeeName}`}
      description="Overtime hours come from attendance; change them here only to correct this month.">
      <div className="space-y-3">
        <Input label="Overtime hours" type="number" min={0} step="0.25" value={v.overtimeHours} onChange={e => setV({ ...v, overtimeHours: Number(e.target.value) })} />
        <Input label="Bonus" type="number" min={0} step="0.001" value={v.bonus} onChange={e => setV({ ...v, bonus: Number(e.target.value) })} />
        <Input label="Loan / advance recovery" type="number" min={0} step="0.001" value={v.loan} onChange={e => setV({ ...v, loan: Number(e.target.value) })} />
        <Textarea label="Note on the payslip" value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} />
        {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={() => void save()} isLoading={busy} disabled={busy}>Save</Button></div>
      </div>
    </Modal>
  );
};

const ApproveModal: React.FC<{ run: PayrollRun; onClose: () => void; onApprove: (note: string) => Promise<void> }> = ({ run, onClose, onApprove }) => {
  const { currency } = useFleet();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="sm" title={`Approve ${run.periodLabel}`}
      description={`Posts salaries ${formatCurrency(run.totalGrossPay, currency)}, PASI and deductions to the ledger, with net pay ${formatCurrency(run.totalNetPayout, currency)} owed to staff. Approved payroll cannot be edited.`}>
      <div className="space-y-3">
        <Textarea label="Approval note (optional)" value={note} onChange={e => setNote(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="success" isLoading={busy} disabled={busy} onClick={() => { setBusy(true); void onApprove(note).finally(() => setBusy(false)); }}>Approve and post</Button>
        </div>
      </div>
    </Modal>
  );
};

const PayModal: React.FC<{ run: PayrollRun; banks: ReturnType<typeof useFleet>['bankAccounts']; onClose: () => void; onPay: (bank: string, date: string) => Promise<void> }> = ({ run, banks, onClose, onPay }) => {
  const { currency } = useFleet();
  const [bank, setBank] = useState(banks[0]?.id ?? '');
  const [date, setDate] = useState(localToday());
  const [busy, setBusy] = useState(false);
  const cashOrCheque = useMemo(() => run.items.filter(i => i.paymentMethod && i.paymentMethod !== 'Bank Transfer').length, [run.items]);
  return (
    <Modal isOpen onClose={busy ? () => undefined : onClose} size="sm" title={`Pay ${run.periodLabel}`}
      description={`Pays net salaries of ${formatCurrency(run.totalNetPayout, currency)} from the chosen bank account (Dr salaries payable, Cr bank).`}>
      <div className="space-y-3">
        <Select label="Bank account" value={bank} onChange={e => setBank(e.target.value)}>
          {banks.length === 0 && <option value="">No active bank account in this office</option>}
          {banks.map(b => <option key={b.id} value={b.id}>{b.bankName} · {b.accountName} ({b.accountNumber})</option>)}
        </Select>
        <Input label="Payment date" type="date" value={date} onChange={e => setDate(e.target.value)} />
        {cashOrCheque > 0 && <p className="text-xs text-amber-600">{cashOrCheque} employee(s) are paid by cash or cheque; the full net amount is still recorded against this account.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="success" isLoading={busy} disabled={busy || !bank || !date} onClick={() => { setBusy(true); void onPay(bank, date).finally(() => setBusy(false)); }}>Pay</Button>
        </div>
      </div>
    </Modal>
  );
};

import React, { useMemo, useState } from 'react';
import { useRequestKey } from '../../lib/requestKey';
import { RULES, fieldForDbMessage, focusFirstInvalid, hasErrors, required, validate, type Errors } from '../../lib/validation';
import { Plus, Scale, Trash2, Undo2 } from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Account, JournalEntry } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate, todayYmd } from '../../utils/date';
import { Tabs } from '../../components/ui/Tabs';
import { FinanceOverview } from './FinanceOverview';
import { useAuth } from '../../context/AuthContext';
import { consolidateAccounts } from '../../services/accounting';
import { journalRegisterSource, useJournalCount, type JournalListRow } from '../../services/queries-dashboards';

type FormLine = { id: string; accountCode: string; debit: number; credit: number; description: string };

const blankLines = (): FormLine[] => [
  { id: `${Date.now()}-1`, accountCode: '', debit: 0, credit: 0, description: '' },
  { id: `${Date.now()}-2`, accountCode: '', debit: 0, credit: 0, description: '' },
];

export const AccountingPage: React.FC = () => {
  const { chartOfAccounts, addJournalEntry, reverseJournalEntry, currency, selectedCompanyId, companies } = useFleet();
  // same key for every attempt to post this journal; renewed after it is posted
  const journalKey = useRequestKey();
  const [reversing, setReversing] = useState<JournalEntry | null>(null);
  const [reverseForm, setReverseForm] = useState({ date: todayYmd(), reason: '' });
  const [reverseError, setReverseError] = useState('');
  const [reverseErrors, setReverseErrors] = useState<Errors<'date' | 'reason'>>({});
  const [isReversing, setIsReversing] = useState(false);
  // `reversed`: another entry reverses this one (looked up per page in the database)
  const canReverse = (j: JournalListRow) => j.status === 'Posted' && !j.reversed && !j.reversesEntryId
    && (j.sourceModule === 'Manual' || j.sourceModule === 'Opening Balance') && hasPermission('create', 'accounting');
  const submitReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversing) return;
    const found = validate(reverseForm, {
      date: [required('Reversal date', 'Choose the reversal date.')],
      reason: [required('Reason', 'Enter the reason for the reversal.')],
    });
    setReverseErrors(found);
    setReverseError('');
    if (hasErrors(found)) return;
    setIsReversing(true);
    try {
      const rev = await reverseJournalEntry(reversing.id, reverseForm.date, reverseForm.reason);
      addToast({ type: 'success', title: 'Journal Reversed', message: `${reversing.entryNumber} reversed by ${rev.entryNumber}.` });
      setReversing(null);
    } catch (err) {
      setReverseError((err as Error).message);
    } finally {
      setIsReversing(false);
    }
  };
  const { addToast } = useUI();
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'coa' | 'journal'>('overview');
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  // inline errors of the journal form; line fields use `line-<id>-account|debit|credit`, `lines` is the whole set
  const [jErrors, setJErrors] = useState<Errors>({});
  const clearJournalError = (e: React.FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name;
    if (!name) return;
    // any amount change can fix the debit/credit set
    const keys = /-(debit|credit)$/.test(name) ? [name, 'lines'] : [name];
    setJErrors(prev => (keys.some(k => prev[k]) ? Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.includes(k))) : prev));
  };

  // The chart of accounts is per company: one row per code here (balances summed across offices for 'all').
  const scopedAccounts = consolidateAccounts(chartOfAccounts, selectedCompanyId);

  // A journal always belongs to ONE company; with the 'all' filter the user picks it in the form.
  const defaultPostingCompany = selectedCompanyId && selectedCompanyId !== 'all' ? selectedCompanyId : '';
  const [journalForm, setJournalForm] = useState({
    companyId: defaultPostingCompany,
    date: todayYmd(),
    description: '',
    reference: '',
    lines: blankLines(),
  });
  const postingAccounts = journalForm.companyId ? consolidateAccounts(chartOfAccounts, journalForm.companyId) : [];

  const totalDebit = journalForm.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = journalForm.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.0005 && totalDebit > 0;

  const openJournalModal = () => {
    setJournalForm({ companyId: defaultPostingCompany, date: todayYmd(), description: '', reference: '', lines: blankLines() });
    setJErrors({});
    setIsJournalModalOpen(true);
  };

  const handleCreateJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPosting) return;
    if (!hasPermission('create', 'accounting')) {
      addToast({ type: 'error', title: 'Permission Denied', message: 'You do not have permission to post journal entries.' });
      return;
    }
    const activeLines = journalForm.lines.filter(l => Number(l.debit || 0) !== 0 || Number(l.credit || 0) !== 0);
    const found: Errors = validate(journalForm, {
      companyId: [required('Company', 'Choose the company (office) this journal belongs to.')],
      date: [required('Journal date', RULES.journalDateRequired)],
      description: [required('Description', RULES.journalDescriptionRequired)],
    });
    for (const l of activeLines) {
      if (Number(l.debit) < 0) found[`line-${l.id}-debit`] = RULES.journalLineSide;
      if (Number(l.credit) < 0) found[`line-${l.id}-credit`] = RULES.journalLineSide;
      if (!postingAccounts.some(a => a.code === l.accountCode)) found[`line-${l.id}-account`] = "Choose an account from this company's chart";
    }
    if (activeLines.length < 2) found.lines = RULES.journalTwoLines;
    else if (!activeLines.some(l => Number(l.debit) > 0) || !activeLines.some(l => Number(l.credit) > 0)) found.lines = 'A journal needs at least one debit line and one credit line.';
    else if (!isBalanced) found.lines = 'Debits must equal Credits in double-entry bookkeeping.';
    setJErrors(found);
    if (hasErrors(found)) return;

    setIsPosting(true);
    try {
      // Entry number, poster and balance are assigned/verified by the database (post_journal_entry RPC).
      const res = await journalKey.run(() => addJournalEntry({
        companyId: journalForm.companyId,
        date: journalForm.date,
        description: journalForm.description,
        reference: journalForm.reference,
        lines: activeLines.map(line => ({
          id: line.id,
          accountCode: line.accountCode,
          accountName: postingAccounts.find(a => a.code === line.accountCode)?.name || line.accountCode,
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
          description: line.description || journalForm.description,
        })),
        totalDebit: Math.round(totalDebit * 1000) / 1000,
        totalCredit: Math.round(totalCredit * 1000) / 1000,
        postedBy: '',
        status: 'Posted',
        sourceModule: 'Manual',
      }));
      journalKey.renew();   // posted or sent for approval: the next save is a new journal
      if (res.entry) addToast({ type: 'success', title: 'Journal Entry Posted', message: `Posted ${res.entry.entryNumber} for ${totalDebit.toFixed(3)} ${currency}.` });
      else addToast({ type: 'info', title: 'Sent for approval', message: `${res.pending.requestNumber}: this journal is above your approval limit. It will be posted when an approver approves it.` });
      setIsJournalModalOpen(false);
    } catch (err) {
      const message = (err as Error).message;
      // a rule the database checks (RULES): show it where it applies as well
      const field = fieldForDbMessage(message, {
        date: [RULES.journalDateRequired], description: [RULES.journalDescriptionRequired],
        lines: [RULES.journalTwoLines, RULES.journalLineSide, 'Unbalanced journal entry'],
      });
      if (field) { setJErrors({ [field]: message }); focusFirstInvalid(); }
      addToast({ type: 'error', title: 'Journal Rejected', message });
    } finally {
      setIsPosting(false);
    }
  };

  // Journal register: paged, sorted and searched in the database (v_journal_list)
  const journalSource = useMemo(() => journalRegisterSource(selectedCompanyId), [selectedCompanyId]);
  const journalCount = useJournalCount(selectedCompanyId);

  const updateLine = (idx: number, patch: Partial<FormLine>) =>
    setJournalForm(prev => ({ ...prev, lines: prev.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));

  const addJournalLine = () => {
    setJournalForm(previous => ({
      ...previous,
      lines: [...previous.lines, { id: `${Date.now()}-${previous.lines.length}`, accountCode: '', debit: 0, credit: 0, description: '' }],
    }));
  };

  const removeJournalLine = (lineId: string) => {
    if (journalForm.lines.length <= 2) return;
    setJournalForm(previous => ({ ...previous, lines: previous.lines.filter(line => line.id !== lineId) }));
  };

  const coaColumns: Column<Account>[] = [
    {
      key: 'code',
      header: 'Account Code',
      render: (a) => <span className="font-mono font-bold text-slate-100">{a.code}</span>,
    },
    {
      key: 'name',
      header: 'Account Title',
      render: (a) => (
        <div>
          <span className="font-semibold text-slate-200">{a.name}</span>
          <p className="text-[10px] text-slate-400">{a.subcategory}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (a) => (
        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
          a.category === 'Asset' ? 'bg-indigo-950/70 text-indigo-300 border border-indigo-800/60' :
          a.category === 'Liability' ? 'bg-amber-950/70 text-amber-300 border border-amber-800/60' :
          a.category === 'Equity' ? 'bg-purple-950/70 text-purple-300 border border-purple-800/60' :
          a.category === 'Revenue' ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/60' :
          'bg-rose-950/70 text-rose-300 border border-rose-800/60'
        }`}>
          {a.category}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'GL Balance',
      align: 'right',
      render: (a) => (
        <div className="text-right">
          <span className="font-bold text-slate-100 font-mono">{formatCurrency(a.balance, currency)}</span>
        </div>
      ),
    },
  ];

  const journalColumns: Column<JournalListRow>[] = [
    {
      key: 'entryNumber',
      sortKey: 'entry_number',
      header: 'Entry # / Date',
      render: (j) => (
        <div>
          <span className="font-mono font-bold text-slate-100">{j.entryNumber}</span>
          <p className="text-[10px] text-slate-400">{formatDate(j.date)}</p>
        </div>
      ),
    },
    {
      key: 'description',
      sortKey: 'description',
      header: 'Description & Reference',
      render: (j) => (
        <div className="max-w-md">
          <p className="font-medium text-slate-200">{j.description}</p>
          {j.reference && <p className="text-[10px] font-mono text-indigo-400">Ref: {j.reference}</p>}
        </div>
      ),
    },
    {
      key: 'sourceModule',
      sortKey: 'source_module',
      header: 'Source',
      render: (j) => (
        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">
          {j.sourceModule || 'Manual'}
        </span>
      ),
    },
    {
      key: 'totalDebit',
      sortKey: 'total_debit',
      header: 'Debit Amount',
      align: 'right',
      render: (j) => <span className="font-mono text-slate-200">{formatCurrency(j.totalDebit, currency)}</span>,
    },
    {
      key: 'totalCredit',
      sortKey: 'total_credit',
      header: 'Credit Amount',
      align: 'right',
      render: (j) => <span className="font-mono text-slate-200">{formatCurrency(j.totalCredit, currency)}</span>,
    },
    {
      key: 'status',
      sortKey: 'status',
      header: 'Status',
      align: 'center',
      render: (j) => (
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
          j.status === 'Posted' ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
            : j.status === 'Void' ? 'bg-rose-950 text-rose-400 border-rose-800'
            : 'bg-amber-950 text-amber-400 border-amber-800'
        }`}>
          {j.status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      render: (j) => canReverse(j) ? (
        <Button variant="ghost" size="xs" leftIcon={<Undo2 className="w-3 h-3" />}
          onClick={() => { setReversing(j); setReverseForm({ date: todayYmd(), reason: '' }); setReverseError(''); setReverseErrors({}); }}>
          Reverse
        </Button>
      ) : j.reversed ? <span className="text-[10px] text-slate-400">Reversed</span> : null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Finance Control Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Financial position, period controls, accounts, and double-entry postings in one precise workspace.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Tabs
            variant="segmented"
            activeTab={activeTab}
            onChange={id => setActiveTab(id as 'overview' | 'coa' | 'journal')}
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'coa', label: 'Accounts' },
              { id: 'journal', label: 'Journals', count: journalCount.data },
            ]}
          />

          {hasPermission('create', 'accounting') && (
            <Button
              variant="primary"
              size="md"
              onClick={openJournalModal}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Post Journal Entry
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'overview' && <FinanceOverview />}

      {/* View: Chart of Accounts */}
      {activeTab === 'coa' && (
        <DataTable
          data={scopedAccounts}
          collection={'chartOfAccounts'}
          columns={coaColumns}
          keyExtractor={a => a.code}
          title="Chart of Accounts Master"
          description={selectedCompanyId === 'all' ? 'Balances summed by account code across your companies.' : undefined}
          searchPlaceholder="Search accounts by code, name, category..."
          searchFields={['code', 'name', 'category', 'subcategory']}
          exportFilename="Chart_of_Accounts"
          emptyMessage="No chart of accounts is set up for this company yet."
        />
      )}

      {/* View: Journal Entries */}
      {activeTab === 'journal' && (
        <DataTable
          server={journalSource}
          columns={journalColumns}
          keyExtractor={j => j.id}
          title="General Journal Entries"
          searchPlaceholder="Search journal entries by number, description, reference..."
          searchFields={['entryNumber', 'description', 'reference', 'sourceModule']}
          exportFilename="Journal_Entries"
          emptyMessage="No journal entries have been posted yet."
        />
      )}

      {/* Post Journal Entry Modal */}
      <Modal
        isOpen={isJournalModalOpen}
        onClose={() => !isPosting && setIsJournalModalOpen(false)}
        title="Post Manual Journal Voucher"
        description="Double-entry debit and credit allocation with real-time balance validation"
        size="xl"
      >
        <form onSubmit={handleCreateJournal} onChange={clearJournalError} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              label="Company"
              value={journalForm.companyId}
              onChange={e => setJournalForm({ ...journalForm, companyId: e.target.value, lines: blankLines() })}
              disabled={!!defaultPostingCompany}
              required
              name="companyId"
              error={jErrors.companyId}
            >
              <option value="">-- Select company --</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input label="Posting Date" type="date" value={journalForm.date} onChange={e => setJournalForm({ ...journalForm, date: e.target.value })} required name="date" error={jErrors.date} />
            <Input label="Reference" placeholder="e.g. MNT-JV-0042" value={journalForm.reference} onChange={e => setJournalForm({ ...journalForm, reference: e.target.value })} />
          </div>

          <Textarea label="Voucher Description" placeholder="Explain the business transaction or adjustment..." value={journalForm.description} onChange={e => setJournalForm({ ...journalForm, description: e.target.value })} required name="description" error={jErrors.description} />

          {/* Journal Lines */}
          <div className="space-y-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <span className="text-xs font-bold uppercase text-slate-300">Journal Lines (Debits & Credits)</span>
              <Button type="button" variant="outline" size="xs" onClick={addJournalLine} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                Add line
              </Button>
            </div>

            {journalForm.companyId && postingAccounts.length === 0 && (
              <p className="text-xs text-amber-400">This company has no chart of accounts yet, so nothing can be posted.</p>
            )}

            {journalForm.lines.map((line, idx) => (
              <div key={line.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-5">
                  <Select
                    label={idx === 0 ? 'Account' : undefined}
                    value={line.accountCode}
                    onChange={e => updateLine(idx, { accountCode: e.target.value })}
                    disabled={!journalForm.companyId}
                    name={`line-${line.id}-account`}
                    error={jErrors[`line-${line.id}-account`]}
                  >
                    <option value="">-- Account --</option>
                    {postingAccounts.map(a => (
                      <option key={a.code} value={a.code}>{a.code} - {a.name} ({a.category})</option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Input
                    label={idx === 0 ? `Debit (${currency})` : undefined}
                    type="number"
                    step="0.001"
                    min="0"
                    value={line.debit}
                    name={`line-${line.id}-debit`}
                    error={jErrors[`line-${line.id}-debit`]}
                    onChange={e => updateLine(idx, Number(e.target.value) > 0 ? { debit: Number(e.target.value), credit: 0 } : { debit: Number(e.target.value) })}
                  />
                </div>
                <div className="md:col-span-3">
                  <Input
                    label={idx === 0 ? `Credit (${currency})` : undefined}
                    type="number"
                    step="0.001"
                    min="0"
                    value={line.credit}
                    name={`line-${line.id}-credit`}
                    error={jErrors[`line-${line.id}-credit`]}
                    onChange={e => updateLine(idx, Number(e.target.value) > 0 ? { credit: Number(e.target.value), debit: 0 } : { credit: Number(e.target.value) })}
                  />
                </div>
                <div className="md:col-span-1 md:self-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="w-full text-slate-400 hover:text-rose-700"
                    onClick={() => removeJournalLine(line.id)}
                    disabled={journalForm.lines.length <= 2}
                    aria-label={`Remove journal line ${idx + 1}`}
                    title="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {jErrors.lines && <p role="alert" className="text-xs text-rose-600 font-medium">{jErrors.lines}</p>}

            {/* Balancing Indicator */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs font-bold">
              <span className={isBalanced ? 'text-emerald-400' : 'text-rose-400'}>
                {isBalanced ? '✓ Journal is Balanced' : `✗ Out of Balance: Diff ${Math.abs(totalDebit - totalCredit).toFixed(3)} ${currency}`}
              </span>
              <div className="flex gap-6">
                <span>Total Debit: {totalDebit.toFixed(3)}</span>
                <span>Total Credit: {totalCredit.toFixed(3)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsJournalModalOpen(false)} disabled={isPosting}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isPosting} leftIcon={<Scale className="w-4 h-4" />}>
              {isPosting ? 'Posting…' : 'Post to Ledger'}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal isOpen={!!reversing} onClose={() => setReversing(null)} title={`Reverse ${reversing?.entryNumber ?? ''}`} size="md"
        description="Posts a mirror entry that cancels this journal. The original entry stays in the ledger.">
        <form onSubmit={submitReversal} className="space-y-4" noValidate>
          <Input label="Reversal date" type="date" required value={reverseForm.date}
            onChange={e => { setReverseForm(f => ({ ...f, date: e.target.value })); setReverseErrors(x => ({ ...x, date: undefined })); }} error={reverseErrors.date} />
          <Textarea label="Reason" required value={reverseForm.reason} rows={3}
            onChange={e => { setReverseForm(f => ({ ...f, reason: e.target.value })); setReverseErrors(x => ({ ...x, reason: undefined })); }} error={reverseErrors.reason} />
          {reverseError && <p className="text-xs text-rose-500 font-medium" role="alert">{reverseError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setReversing(null)}>Cancel</Button>
            <Button type="submit" variant="danger" size="sm" isLoading={isReversing}>Post reversal</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

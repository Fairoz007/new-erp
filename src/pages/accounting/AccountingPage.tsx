import React, { useState } from 'react';
import { Plus, Scale, Landmark, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, Textarea } from '../../components/ui/Input';
import { Account, JournalEntry } from '../../types/finance';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatCurrency } from '../../utils/financial';
import { formatDate } from '../../utils/date';
import { Tabs } from '../../components/ui/Tabs';
import { FinanceOverview } from './FinanceOverview';
import { useAuth } from '../../context/AuthContext';

export const AccountingPage: React.FC = () => {
  const { chartOfAccounts, journalEntries, addJournalEntry, currency, selectedCompanyId } = useFleet();
  const { addToast } = useUI();
  const { hasPermission, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'coa' | 'journal'>('overview');
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);

  // Journal Entry Form State with balanced Debit/Credit lines
  const [journalForm, setJournalForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: '',
    reference: '',
    lines: [
      { id: '1', accountCode: '5000', debit: 0, credit: 0, description: '' },
      { id: '2', accountCode: '2010', debit: 0, credit: 0, description: '' },
    ],
  });

  const totalDebit = journalForm.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = journalForm.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  const handleCreateJournal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) {
      addToast({ type: 'error', title: 'Unbalanced Journal', message: 'Debits must equal Credits in double-entry bookkeeping.' });
      return;
    }

    const linesWithNames = journalForm.lines.map(line => {
      const acc = chartOfAccounts.find(a => a.code === line.accountCode);
      return {
        id: `jl-${Date.now()}-${Math.random()}`,
        accountCode: line.accountCode,
        accountName: acc?.name || 'General Account',
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        description: line.description || journalForm.description,
      };
    });

    addJournalEntry({
      companyId: selectedCompanyId === 'all' ? 'comp-1' : selectedCompanyId,
      date: journalForm.date,
      description: journalForm.description,
      reference: journalForm.reference,
      lines: linesWithNames,
      totalDebit,
      totalCredit,
      postedBy: currentUser.name,
      status: 'Posted',
      sourceModule: 'Manual',
    });

    addToast({ type: 'success', title: 'Journal Entry Posted', message: `Posted entry for ${totalDebit.toFixed(3)} OMR.` });
    setIsJournalModalOpen(false);
    setJournalForm({
      date: new Date().toISOString().slice(0, 10),
      description: '',
      reference: '',
      lines: [
        { id: `${Date.now()}-1`, accountCode: '5000', debit: 0, credit: 0, description: '' },
        { id: `${Date.now()}-2`, accountCode: '2010', debit: 0, credit: 0, description: '' },
      ],
    });
  };

  const scopedJournalEntries = selectedCompanyId === 'all'
    ? journalEntries
    : journalEntries.filter(entry => entry.companyId === selectedCompanyId);

  const addJournalLine = () => {
    setJournalForm(previous => ({
      ...previous,
      lines: [
        ...previous.lines,
        { id: `${Date.now()}-${previous.lines.length}`, accountCode: chartOfAccounts[0]?.code || '', debit: 0, credit: 0, description: '' },
      ],
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

  const journalColumns: Column<JournalEntry>[] = [
    {
      key: 'entryNumber',
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
      header: 'Source',
      render: (j) => (
        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">
          {j.sourceModule || 'Manual'}
        </span>
      ),
    },
    {
      key: 'totalDebit',
      header: 'Debit Amount',
      align: 'right',
      render: (j) => <span className="font-mono text-slate-200">{formatCurrency(j.totalDebit, currency)}</span>,
    },
    {
      key: 'totalCredit',
      header: 'Credit Amount',
      align: 'right',
      render: (j) => <span className="font-mono text-slate-200">{formatCurrency(j.totalCredit, currency)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (j) => (
        <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">
          {j.status}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2.5">
            <Landmark className="w-7 h-7 text-indigo-600" />
            <span>Finance Control Center</span>
          </h1>
          <p className="page-subtitle">
            Financial position, period controls, accounts, and double-entry postings in one precise workspace.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Tabs
            variant="segmented"
            activeTab={activeTab}
            onChange={id => setActiveTab(id as 'overview' | 'coa' | 'journal')}
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'coa', label: 'Accounts' },
              { id: 'journal', label: 'Journals', count: scopedJournalEntries.length },
            ]}
          />

          {hasPermission('create', 'accounting') && <Button
            variant="primary"
            size="sm"
            onClick={() => setIsJournalModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Post Journal Entry
          </Button>}
        </div>
      </div>

      {activeTab === 'overview' && <FinanceOverview />}

      {/* View: Chart of Accounts */}
      {activeTab === 'coa' && (
        <DataTable
          data={chartOfAccounts}
          columns={coaColumns}
          keyExtractor={a => a.code}
          title="Chart of Accounts Master"
          searchPlaceholder="Search accounts by code, name, category..."
          searchFields={['code', 'name', 'category', 'subcategory']}
          exportFilename="FleetX_Chart_of_Accounts"
        />
      )}

      {/* View: Journal Entries */}
      {activeTab === 'journal' && (
        <DataTable
          data={scopedJournalEntries}
          columns={journalColumns}
          keyExtractor={j => j.id}
          title="General Journal Entries"
          searchPlaceholder="Search journal entries by number, description, reference..."
          searchFields={['entryNumber', 'description', 'reference', 'sourceModule']}
          exportFilename="FleetX_Journal_Entries"
        />
      )}

      {/* Post Journal Entry Modal */}
      <Modal
        isOpen={isJournalModalOpen}
        onClose={() => setIsJournalModalOpen(false)}
        title="Post Manual Journal Voucher"
        description="Double-entry debit and credit allocation with real-time balance validation"
        size="xl"
      >
        <form onSubmit={handleCreateJournal} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Posting Date" type="date" value={journalForm.date} onChange={e => setJournalForm({ ...journalForm, date: e.target.value })} required />
            <Input label="Reference" placeholder="e.g. MNT-JV-0042" value={journalForm.reference} onChange={e => setJournalForm({ ...journalForm, reference: e.target.value })} />
          </div>

          <Textarea label="Voucher Description" placeholder="Explain the business transaction or adjustment..." value={journalForm.description} onChange={e => setJournalForm({ ...journalForm, description: e.target.value })} required />

          {/* Journal Lines */}
          <div className="space-y-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <span className="text-xs font-bold uppercase text-slate-300">Journal Lines (Debits & Credits)</span>
              <Button type="button" variant="outline" size="xs" onClick={addJournalLine} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                Add line
              </Button>
            </div>

            {journalForm.lines.map((line, idx) => (
              <div key={line.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <div className="md:col-span-5">
                  <Select
                    label={idx === 0 ? 'Account' : undefined}
                    value={line.accountCode}
                    onChange={e => {
                      const lines = [...journalForm.lines];
                      lines[idx].accountCode = e.target.value;
                      setJournalForm({ ...journalForm, lines });
                    }}
                  >
                    {chartOfAccounts.map(a => (
                      <option key={a.code} value={a.code}>{a.code} - {a.name} ({a.category})</option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Input
                    label={idx === 0 ? 'Debit (OMR)' : undefined}
                    type="number"
                    step="0.001"
                    value={line.debit}
                    onChange={e => {
                      const lines = [...journalForm.lines];
                      lines[idx].debit = Number(e.target.value);
                      if (Number(e.target.value) > 0) lines[idx].credit = 0;
                      setJournalForm({ ...journalForm, lines });
                    }}
                  />
                </div>
                <div className="md:col-span-3">
                  <Input
                    label={idx === 0 ? 'Credit (OMR)' : undefined}
                    type="number"
                    step="0.001"
                    value={line.credit}
                    onChange={e => {
                      const lines = [...journalForm.lines];
                      lines[idx].credit = Number(e.target.value);
                      if (Number(e.target.value) > 0) lines[idx].debit = 0;
                      setJournalForm({ ...journalForm, lines });
                    }}
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

            {/* Balancing Indicator */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs font-bold">
              <span className={isBalanced ? 'text-emerald-400' : 'text-rose-400'}>
                {isBalanced ? '✓ Journal is Balanced' : `✗ Out of Balance: Diff ${Math.abs(totalDebit - totalCredit).toFixed(3)} OMR`}
              </span>
              <div className="flex gap-6">
                <span>Total Debit: {totalDebit.toFixed(3)}</span>
                <span>Total Credit: {totalCredit.toFixed(3)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsJournalModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={!isBalanced} leftIcon={<Scale className="w-4 h-4" />}>
              Post to Ledger
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

// Step 8: opening balances at go-live, imported from CSV. Every row posts a balanced journal
// against 3900 Opening Balance Equity on the server:
//   banks          -> bank account with opening balance (Dr bank / Cr 3900)
//   clients/suppl. -> posted opening invoice per party (AR or AP vs 3900), payable/collectable like any invoice
//   fixed assets   -> asset at cost with accumulated depreciation (Dr asset / Cr acc. dep. / Cr 3900)
import React, { useState } from 'react';
import { Download, Upload, Play } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { supabase } from '../../../lib/supabase';
import * as org from '../../../services/org';
import type { Company } from '../../../types/system';
import { NoticeBar, Section, downloadText, errText, parseCsv, tableCls, tdCls, thCls, useNotice, useOffices } from '../shared';

type Kind = 'banks' | 'parties' | 'assets';
type Row = Record<string, string>;
type Checked = { row: Row; errors: string[]; status?: 'posted' | 'failed'; message?: string };

const TEMPLATES: Record<Kind, { headers: string[]; example: string[]; title: string; help: string }> = {
  banks: {
    title: 'Bank & cash accounts',
    help: 'One row per account. GL account defaults to 1020 (bank); use 1010 for petty cash.',
    headers: ['office_code', 'bank_name', 'account_name', 'account_number', 'iban', 'account_type', 'currency', 'gl_account_code', 'opening_balance', 'opening_date'],
    example: ['HO', 'Bank Muscat', 'Operations', '0123456789', 'OM810180000001299123456', 'Current', '', '1020', '15000.000', ''],
  },
  parties: {
    title: 'Client & supplier balances',
    help: 'Amount owed to you (client) or by you (supplier). Parties not found by code or exact name are created.',
    headers: ['office_code', 'party_type', 'name', 'code', 'vat_number', 'amount', 'date', 'due_date', 'reference'],
    example: ['HO', 'Client', 'Oman Oil Services LLC', '', 'OM1100012345', '2500.000', '', '', 'Opening balance'],
  },
  assets: {
    title: 'Fixed assets',
    help: 'Cost and depreciation to date. Defaults: asset GL 1510, accumulated depreciation 1520, straight-line.',
    headers: ['office_code', 'name', 'category', 'serial_number', 'purchase_date', 'purchase_cost', 'accumulated_depreciation', 'useful_life_years', 'salvage_value', 'gl_asset_account', 'gl_accum_dep_account'],
    example: ['HO', 'Coaster bus 30 seats', 'Motor Vehicles', 'JTF...', '2022-03-01', '28000.000', '8400.000', '10', '2000', '', ''],
  },
};

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isAmount = (s: string) => /^-?\d+(\.\d{1,3})?$/.test(s.replace(/,/g, ''));
const amt = (s: string) => Number(s.replace(/,/g, ''));
const csvLine = (cells: string[]) => cells.map(c => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');

function validate(kind: Kind, r: Row, offices: Company[], goLive: string): string[] {
  const e: string[] = [];
  if (!offices.some(o => o.code.toLowerCase() === (r.office_code ?? '').toLowerCase())) e.push(`Unknown office code "${r.office_code ?? ''}"`);
  const date = (k: string) => (r[k] ? (isDate(r[k]) ? null : `${k} must be YYYY-MM-DD`) : null);
  if (kind === 'banks') {
    for (const k of ['bank_name', 'account_name', 'account_number']) if (!r[k]) e.push(`${k} is required`);
    if (r.account_type && !['Current', 'Savings', 'Petty Cash', 'Credit Facility'].includes(r.account_type)) e.push('account_type must be Current, Savings, Petty Cash or Credit Facility');
    if (!isAmount(r.opening_balance ?? '')) e.push('opening_balance must be a number');
    const d = date('opening_date'); if (d) e.push(d);
  } else if (kind === 'parties') {
    if (!['client', 'customer', 'supplier'].includes((r.party_type ?? '').toLowerCase())) e.push('party_type must be Client or Supplier');
    if (!r.name && !r.code) e.push('name or code is required');
    if (!isAmount(r.amount ?? '') || amt(r.amount) <= 0) e.push('amount must be greater than zero');
    for (const k of ['date', 'due_date']) { const d = date(k); if (d) e.push(d); }
  } else {
    if (!r.name) e.push('name is required');
    if (!isAmount(r.purchase_cost ?? '') || amt(r.purchase_cost) <= 0) e.push('purchase_cost must be greater than zero');
    if (r.accumulated_depreciation && (!isAmount(r.accumulated_depreciation) || amt(r.accumulated_depreciation) < 0 || amt(r.accumulated_depreciation) > amt(r.purchase_cost || '0')))
      e.push('accumulated_depreciation must be between 0 and the cost');
    if (r.useful_life_years && (!isAmount(r.useful_life_years) || amt(r.useful_life_years) <= 0)) e.push('useful_life_years must be positive');
    const d = date('purchase_date'); if (d) e.push(d);
  }
  if (!goLive) e.push('Set the go-live date above');
  return e;
}

// find a client/supplier by code, VAT number or exact name; create it when missing
async function resolveParty(kind: 'Customer' | 'Supplier', r: Row): Promise<string> {
  const table = kind === 'Customer' ? 'customers' : 'suppliers';
  const codeCol = kind === 'Customer' ? 'customer_code' : 'supplier_code';
  const db = supabase as any;
  const tryFind = async (col: string, val: string) => {
    if (!val) return null;
    const { data, error } = await db.from(table).select('id').ilike(col, val.trim().replace(/[\\%_]/g, m => '\\' + m)).limit(2);
    if (error) throw new Error(error.message);
    if ((data ?? []).length > 1) throw new Error(`More than one ${kind.toLowerCase()} matches ${col} "${val}"`);
    return data?.[0]?.id ?? null;
  };
  const found = (await tryFind(codeCol, r.code)) ?? (await tryFind('vat_number', r.vat_number)) ?? (await tryFind('name', r.name));
  if (found) return found;
  if (!r.name) throw new Error(`No ${kind.toLowerCase()} with code ${r.code}`);
  const row: Record<string, unknown> = { name: r.name.trim(), vat_number: r.vat_number || null, [codeCol]: r.code || null };
  row[kind === 'Customer' ? 'customer_type' : 'supplier_type'] = kind === 'Customer' ? 'Corporate' : 'General';
  const { data, error } = await db.from(table).insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

const Importer: React.FC<{ kind: Kind; offices: Company[]; goLive: string; currency: string; readOnly?: boolean }> = ({ kind, offices, goLive, currency, readOnly }) => {
  const t = TEMPLATES[kind];
  const [rows, setRows] = useState<Checked[]>([]);
  const [fileName, setFileName] = useState('');
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useNotice();

  const load = async (file?: File) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setNotice({ tone: 'error', text: 'CSV must be 2 MB or smaller.' }); return; }
    try {
      const { headers, rows: data } = parseCsv(await file.text());
      const missing = t.headers.filter(h => ['office_code', 'name', 'amount', 'opening_balance', 'purchase_cost', 'party_type', 'bank_name'].includes(h) && !headers.includes(h));
      if (missing.length) { setNotice({ tone: 'error', text: `Missing column(s): ${missing.join(', ')}. Download the template.` }); return; }
      if (data.length > 1000) { setNotice({ tone: 'error', text: 'Import up to 1,000 rows at a time.' }); return; }
      setFileName(file.name);
      setRows(data.map(r => ({ row: r, errors: validate(kind, r, offices, goLive) })));
      setNotice(null);
    } catch (e) {
      setNotice({ tone: 'error', text: `Could not read the file: ${errText(e)}` });
    }
  };

  const post = async () => {
    if (running) return;
    const todo = rows.filter(r => r.errors.length === 0 && r.status !== 'posted');
    if (!todo.length) return;
    if (!window.confirm(`Post ${todo.length} opening balance row(s)? Each creates a posted journal entry; corrections are made with reversing entries.`)) return;
    setRunning(true);
    let ok = 0;
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      const c = next[i];
      if (c.errors.length || c.status === 'posted') continue;
      const r = c.row;
      const office = offices.find(o => o.code.toLowerCase() === r.office_code.toLowerCase())!;
      try {
        if (kind === 'banks') {
          await org.createBankAccount({
            companyId: office.id, bankName: r.bank_name, accountName: r.account_name, accountNumber: r.account_number, iban: r.iban,
            accountType: r.account_type || (r.gl_account_code === '1010' ? 'Petty Cash' : 'Current'), currency: r.currency || office.currency || currency,
            glAccountCode: r.gl_account_code || '1020', openingBalance: amt(r.opening_balance), openingDate: r.opening_date || goLive,
          });
        } else if (kind === 'parties') {
          const type = r.party_type.toLowerCase() === 'supplier' ? 'Supplier' : 'Customer';
          const partyId = await resolveParty(type, r);
          await org.postOpeningPartyBalance({ companyId: office.id, partyType: type, partyId, amount: amt(r.amount), date: r.date || goLive, dueDate: r.due_date, reference: r.reference });
        } else {
          await org.postOpeningFixedAsset(office.id, {
            name: r.name, category: r.category, serial_number: r.serial_number, purchase_date: r.purchase_date, purchase_cost: amt(r.purchase_cost),
            accumulated_depreciation: r.accumulated_depreciation ? amt(r.accumulated_depreciation) : 0, useful_life_years: r.useful_life_years ? amt(r.useful_life_years) : undefined,
            salvage_value: r.salvage_value ? amt(r.salvage_value) : undefined, gl_asset_account: r.gl_asset_account, gl_accum_dep_account: r.gl_accum_dep_account,
          }, goLive);
        }
        next[i] = { ...c, status: 'posted' };
        ok++;
      } catch (e) {
        next[i] = { ...c, status: 'failed', message: errText(e) };
      }
      setRows([...next]);
    }
    setRunning(false);
    const failed = next.filter(r => r.status === 'failed').length;
    setNotice(failed ? { tone: 'error', text: `${ok} posted, ${failed} failed. Fix the failed rows in the file and import it again (posted rows are skipped only within this screen).` }
      : { tone: 'success', text: `${ok} row(s) posted.` });
  };

  const valid = rows.filter(r => r.errors.length === 0 && r.status !== 'posted').length;
  const invalid = rows.filter(r => r.errors.length).length;

  return (
    <Section title={t.title} description={t.help}
      action={<Button size="xs" variant="outline" leftIcon={<Download className="w-3 h-3" />}
        onClick={() => downloadText(`opening_${kind}_template.csv`, [csvLine(t.headers), csvLine(t.example)].join('\r\n') + '\r\n')}>Template</Button>}>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <label className={`inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-slate-700 text-xs font-semibold ${readOnly ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-slate-850'}`}>
          <Upload className="w-4 h-4" /> {fileName || 'Choose CSV file'}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={readOnly} onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {rows.length > 0 && (
          <span className="text-xs text-slate-400">{rows.length} rows · {invalid ? <span className="text-rose-500">{invalid} with errors</span> : 'no errors'}</span>
        )}
        {rows.length > 0 && !readOnly && (
          <Button size="sm" className="sm:ml-auto" onClick={post} isLoading={running} disabled={valid === 0} leftIcon={<Play className="w-4 h-4" />}>Post {valid} row(s)</Button>
        )}
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-700 rounded-xl">
          <table className={tableCls}>
            <thead className="sticky top-0 bg-white"><tr><th className={thCls}>#</th>{t.headers.slice(0, 6).map(h => <th key={h} className={thCls}>{h}</th>)}<th className={thCls}>Result</th></tr></thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={i} className={c.errors.length || c.status === 'failed' ? 'bg-rose-50/50' : c.status === 'posted' ? 'bg-emerald-50/50' : ''}>
                  <td className={tdCls}>{i + 2}</td>
                  {t.headers.slice(0, 6).map(h => <td key={h} className={`${tdCls} max-w-[160px] truncate`}>{c.row[h]}</td>)}
                  <td className={tdCls}>
                    {c.status === 'posted' ? <Badge variant="emerald">Posted</Badge>
                      : c.status === 'failed' ? <span className="text-rose-600">{c.message}</span>
                      : c.errors.length ? <span className="text-rose-600">{c.errors.join('; ')}</span> : <Badge variant="blue">Ready</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
};

export const OpeningBalancesStep: React.FC<{ readOnly?: boolean; currency: string }> = ({ readOnly, currency }) => {
  const { offices } = useOffices();
  const [goLive, setGoLive] = useState(() => `${new Date().getFullYear()}-01-01`);
  return (
    <div className="space-y-4">
      <Section title="Go-live date" description="Opening balances are dated on this day unless a row gives its own date. This step is optional; you can import balances later from Settings.">
        <Input type="date" label="Go-live date" value={goLive} onChange={e => setGoLive(e.target.value)} className="max-w-xs" disabled={readOnly} />
      </Section>
      {offices.length === 0 ? <p className="text-xs text-slate-400">Add an office first (step 3).</p> : (
        <>
          <Importer kind="banks" offices={offices} goLive={goLive} currency={currency} readOnly={readOnly} />
          <Importer kind="parties" offices={offices} goLive={goLive} currency={currency} readOnly={readOnly} />
          <Importer kind="assets" offices={offices} goLive={goLive} currency={currency} readOnly={readOnly} />
        </>
      )}
    </div>
  );
};

// Settings → Approval rules. A rule raises an approval request for work orders or invoices at or
// above its threshold and names the roles (custom roles included) that may decide it. A request
// is also limited by each approver's signing limit (Users & Roles). Other documents (expenses,
// payments, journals, payroll, budgets) use the signing limits only.
import React, { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { ApprovalRule } from '../../types/system';
import { deleteApprovalRule, saveApprovalRule } from '../../services/system';

type Draft = { id?: string; module: 'maintenance' | 'invoice'; thresholdAmount: string; requiredRoleIds: string[]; description: string; active: boolean };
const toDraft = (r: ApprovalRule): Draft => ({ id: r.id, module: r.module === 'invoice' ? 'invoice' : 'maintenance', thresholdAmount: String(r.thresholdAmount), requiredRoleIds: r.requiredRoleIds, description: r.description, active: r.active });

export const ApprovalRulesEditor: React.FC<{ readOnly: boolean }> = ({ readOnly }) => {
  const { approvalRules, currency, reload } = useFleet();
  const { roles } = useAuth();
  const { addToast } = useUI();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? 'Deleted role';
  const legacyOnly = (r: ApprovalRule) => r.requiredRoleIds.length === 0 && r.requiredRoles.length > 0;

  const save = async () => {
    if (!editing) return;
    setBusy(true); setErr(null);
    try {
      await saveApprovalRule({ ...editing, thresholdAmount: Number(editing.thresholdAmount) });
      await reload(['approvalRules']);
      addToast({ type: 'success', title: 'Approval rule saved', message: `${editing.module === 'invoice' ? 'Invoices' : 'Work orders'} from ${Number(editing.thresholdAmount).toFixed(3)} ${currency}` });
      setEditing(null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (r: ApprovalRule) => {
    if (!window.confirm('Delete this approval rule? Requests already raised are not affected.')) return;
    try { await deleteApprovalRule(r.id); await reload(['approvalRules']); addToast({ type: 'success', title: 'Approval rule deleted', message: r.module }); }
    catch (e) { addToast({ type: 'error', title: 'Not deleted', message: (e as Error).message }); }
  };
  const toggleRole = (id: string) => editing && setEditing({ ...editing, requiredRoleIds: editing.requiredRoleIds.includes(id) ? editing.requiredRoleIds.filter(x => x !== id) : [...editing.requiredRoleIds, id] });

  return (
    <div className="space-y-3 text-xs">
      <p className="text-[11px] text-slate-400">
        A work order or invoice at or above a rule's threshold needs approval by one of the roles listed (for work orders, one approval per role in order).
        With no roles listed, anyone whose signing limit covers the amount may decide. Expenses, payments, journals, payroll and budgets use the signing limits in Users & Roles only.
      </p>
      {approvalRules.length === 0 && <p className="text-slate-400">No approval rules. Work orders and invoices within the submitter's limit are approved directly.</p>}
      {approvalRules.map(rule => (
        <div key={rule.id} className="p-3.5 bg-slate-850/60 rounded-xl border border-slate-700/80 space-y-1">
          <div className="flex justify-between items-center gap-2">
            <span className="font-bold text-slate-200 text-[11px]">{rule.module === 'invoice' ? 'Invoices' : rule.module === 'maintenance' ? 'Work orders' : rule.module}{!rule.active ? ' (inactive)' : ''}</span>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-forest-100 text-forest-700 font-mono font-bold text-[10px]">from {rule.thresholdAmount.toFixed(3)} {currency}</span>
              {!readOnly && (rule.module === 'invoice' || rule.module === 'maintenance') && <Button variant="ghost" size="xs" onClick={() => { setEditing(toDraft(rule)); setErr(null); }}>Edit</Button>}
              {!readOnly && <Button variant="ghost" size="xs" leftIcon={<Trash2 className="w-3 h-3" />} onClick={() => void remove(rule)}>Delete</Button>}
            </div>
          </div>
          {rule.description && <p className="text-slate-400 text-[11px]">{rule.description}</p>}
          <p className="text-[10px] text-slate-400 font-semibold">
            Approvers: <span className="text-forest-600">{rule.requiredRoleIds.length ? rule.requiredRoleIds.map(roleName).join(' → ') : legacyOnly(rule) ? rule.requiredRoles.join(' → ') : 'Anyone within their signing limit'}</span>
          </p>
        </div>
      ))}
      {!readOnly && !editing && <Button size="sm" variant="outline" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing({ module: 'maintenance', thresholdAmount: '0', requiredRoleIds: [], description: '', active: true }); setErr(null); }}>Add rule</Button>}
      {editing && (
        <div className="p-4 rounded-xl border border-slate-600 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Applies to" value={editing.module} onChange={e => setEditing({ ...editing, module: e.target.value as Draft['module'] })}>
              <option value="maintenance">Work orders (estimated cost)</option>
              <option value="invoice">Invoices and bills (total)</option>
            </Select>
            <Input label={`From amount (${currency})`} type="number" min="0" step="0.001" value={editing.thresholdAmount} onChange={e => setEditing({ ...editing, thresholdAmount: e.target.value })} />
            <Input label="Description" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-300 mb-1">Approving roles, in order</p>
            <div className="flex flex-wrap gap-2">
              {roles.map(r => {
                const i = editing.requiredRoleIds.indexOf(r.id);
                return (
                  <button key={r.id} type="button" onClick={() => toggleRole(r.id)}
                    className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${i >= 0 ? 'bg-forest-100 border-forest-500 text-forest-700' : 'border-slate-700 text-slate-300'}`}>
                    {i >= 0 && <Badge variant="emerald">{i + 1}</Badge>} {r.name}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} /> Active</label>
          {err && <p role="alert" className="text-xs text-rose-500">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button size="sm" leftIcon={<Save className="w-4 h-4" />} isLoading={busy} disabled={busy || !(Number(editing.thresholdAmount) >= 0)} onClick={() => void save()}>Save rule</Button>
          </div>
        </div>
      )}
    </div>
  );
};

// Custom fields builder: define fields per entity, drag to reorder, set per-office visibility and
// preview the form. Values are stored in each record's custom_fields column and validated by the
// database (validate_custom_fields trigger). Fields are deactivated, not deleted, so stored values stay valid.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, GripVertical, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import * as org from '../../services/org';
import type { FieldDefinition, FieldEntity, FieldOfficeSetting, FieldType } from '../../services/org';
import { CustomFieldsForm, applicableFields, type CustomValues } from '../../components/common/CustomFieldsForm';
import { LoadState, NoticeBar, Section, Toggle, errText, tableCls, tdCls, thCls, useMaster, useNotice, useOffices } from './shared';

export const ENTITY_LABELS: Record<FieldEntity, string> = {
  vehicle: 'Vehicles', client: 'Clients', supplier: 'Suppliers', employee: 'Employees', expense: 'Expenses', office: 'Offices',
};
const TYPE_LABELS: Record<FieldType, string> = { text: 'Text', number: 'Number', date: 'Date', dropdown: 'Dropdown', file: 'File', boolean: 'Yes / no' };

const toKey = (label: string) => label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 40);

type Draft = {
  id: string | null; label: string; key: string; fieldType: FieldType; options: string; required: boolean; officeId: string;
  vehicleTypeId: string; helpText: string; showInList: boolean; active: boolean;
};

export const FieldBuilder: React.FC<{ readOnly?: boolean; entities?: FieldEntity[] }> = ({ readOnly, entities = ['vehicle', 'client', 'supplier', 'employee', 'expense', 'office'] }) => {
  const [entity, setEntity] = useState<FieldEntity>(entities[0]);
  const fields = useMaster('fieldDefinitions');
  const types = useMaster('vehicleTypes');
  const { offices } = useOffices();
  const [settings, setSettings] = useState<FieldOfficeSetting[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ officeId: string; vehicleTypeId: string; values: CustomValues } | null>(null);
  const [notice, setNotice] = useNotice();

  const loadSettings = useCallback(async () => {
    try { setSettings(await org.listFieldOfficeSettings()); } catch (e) { setNotice({ tone: 'error', text: errText(e) }); }
  }, [setNotice]);
  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const list = useMemo(() => fields.rows.filter(f => f.entity === entity).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)), [fields.rows, entity]);

  // how many records hold a value: a used field can be deactivated but not deleted or retyped
  const [usage, setUsage] = useState<Record<string, number>>({});
  const listIds = list.map(f => f.id).join(',');
  useEffect(() => {
    let live = true;
    Promise.all(list.map(async f => [f.id, await org.customFieldUsage(f.id).catch(() => -1)] as const))
      .then(pairs => { if (live) setUsage(Object.fromEntries(pairs)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listIds]);

  const removeField = async (f: FieldDefinition) => {
    if (!window.confirm(`Delete the field "${f.label}"? It holds no data. This cannot be undone.`)) return;
    setBusy(true);
    try {
      await org.deleteMaster('fieldDefinitions', f.id);
      setNotice({ tone: 'success', text: 'Field deleted.' });
      await fields.reload();
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const openDraft = (f?: FieldDefinition) => {
    setErrors({});
    setDraft(f ? {
      id: f.id, label: f.label, key: f.key, fieldType: f.fieldType, options: f.options.join(', '), required: f.required, officeId: f.officeId,
      vehicleTypeId: f.vehicleTypeId, helpText: f.helpText, showInList: f.showInList, active: f.active,
    } : { id: null, label: '', key: '', fieldType: 'text', options: '', required: false, officeId: '', vehicleTypeId: '', helpText: '', showInList: false, active: true });
  };

  const save = async () => {
    if (!draft || busy) return;
    const e: Record<string, string> = {};
    const options = draft.options.split(',').map(s => s.trim()).filter(Boolean);
    if (!draft.label.trim()) e.label = 'Label is required.';
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(draft.key)) e.key = 'Key: lowercase letters, digits and _; must start with a letter.';
    else if (fields.rows.some(f => f.entity === entity && f.key === draft.key && f.id !== draft.id)) e.key = 'Another field already uses this key.';
    if (draft.fieldType === 'dropdown' && options.length === 0) e.options = 'Add at least one option.';
    if (new Set(options).size !== options.length) e.options = 'Options must be unique.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await org.saveMaster('fieldDefinitions', draft.id, {
        entity, label: draft.label, fieldType: draft.fieldType, options: draft.fieldType === 'dropdown' ? options : [],
        required: draft.required, officeId: draft.officeId, vehicleTypeId: entity === 'vehicle' ? draft.vehicleTypeId : '', helpText: draft.helpText,
        showInList: draft.showInList, active: draft.active,
        ...(draft.id ? {} : { key: draft.key, sortOrder: (list[list.length - 1]?.sortOrder ?? 0) + 10 }),
      });
      setNotice({ tone: 'success', text: `Field "${draft.label.trim()}" saved.` });
      setDraft(null);
      await fields.reload();
    } catch (err) {
      setNotice({ tone: 'error', text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  // drag-and-drop reorder: renumber in steps of 10 and save only rows whose position changed
  const drop = async (targetId: string) => {
    if (!dragId || dragId === targetId || readOnly) return;
    const ids = list.map(f => f.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    const changed = ids.map((id, i) => ({ id, sortOrder: (i + 1) * 10 })).filter(x => list.find(f => f.id === x.id)?.sortOrder !== x.sortOrder);
    fields.setRows(rows => rows.map(r => ({ ...r, sortOrder: changed.find(c => c.id === r.id)?.sortOrder ?? r.sortOrder })));
    try {
      await Promise.all(changed.map(c => org.saveMaster('fieldDefinitions', c.id, { sortOrder: c.sortOrder })));
    } catch (e) {
      setNotice({ tone: 'error', text: `Order not saved: ${errText(e)}` });
      await fields.reload();
    }
  };

  const setVisibility = async (fieldId: string, officeId: string, v: string) => {
    try {
      await org.setFieldOfficeVisibility(fieldId, officeId, v === '' ? null : (v as FieldOfficeSetting['visibility']));
      await loadSettings();
    } catch (e) {
      setNotice({ tone: 'error', text: errText(e) });
    }
  };

  const previewFields = preview ? applicableFields(fields.rows, settings, entity, preview.officeId || undefined, preview.vehicleTypeId || undefined) : [];
  const typeName = (id: string) => types.rows.find(t => t.id === id)?.name;
  const officeName = (id: string) => offices.find(o => o.id === id)?.name;

  return (
    <Section title="Custom fields" description="Add your own fields to records. Required fields are enforced by the database for every office where they apply.">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <Tabs variant="pills" activeTab={entity} onChange={id => { setEntity(id as FieldEntity); setDraft(null); setPreview(null); }}
        tabs={entities.map(e => ({ id: e, label: ENTITY_LABELS[e], count: fields.rows.filter(f => f.entity === e && f.active).length || undefined }))} />
      <LoadState loading={fields.loading} error={fields.error} onRetry={fields.reload}>
        {list.length === 0 && !draft && <p className="text-xs text-slate-400">No custom fields for {ENTITY_LABELS[entity].toLowerCase()} yet.</p>}
        {list.length > 0 && (
          <ul className="divide-y divide-slate-700/60 border border-slate-700 rounded-xl">
            {list.map(f => (
              <li key={f.id} draggable={!readOnly} onDragStart={() => setDragId(f.id)} onDragOver={e => e.preventDefault()} onDrop={() => void drop(f.id)}
                className={`flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 ${dragId === f.id ? 'opacity-50' : ''} ${f.active ? '' : 'bg-slate-850/50'}`}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {!readOnly && <GripVertical className="w-4 h-4 text-slate-400 cursor-grab shrink-0" aria-label="Drag to reorder" />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{f.label} <span className="font-mono text-[10px] text-slate-400">{f.key}</span></p>
                    <p className="text-[11px] text-slate-400">
                      {TYPE_LABELS[f.fieldType]}{f.fieldType === 'dropdown' ? `: ${f.options.join(', ')}` : ''}
                      {' · '}{f.officeId ? `Only ${officeName(f.officeId) ?? 'one office'}` : 'All offices'}
                      {f.vehicleTypeId ? ` · ${typeName(f.vehicleTypeId) ?? 'one type'} only` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {f.required && <Badge variant="rose">Required</Badge>}
                  {f.showInList && <Badge variant="blue">List column</Badge>}
                  {!f.active && <Badge variant="slate">Inactive</Badge>}
                  {usage[f.id] >= 0 && <span className="text-[11px] text-slate-400">{usage[f.id]} record{usage[f.id] === 1 ? '' : 's'}</span>}
                  {!readOnly && <Button size="xs" variant="outline" leftIcon={<Pencil className="w-3 h-3" />} onClick={() => openDraft(f)}>Edit</Button>}
                  {!readOnly && usage[f.id] === 0 && (
                    <Button size="xs" variant="ghost" aria-label={`Delete ${f.label}`} disabled={busy} onClick={() => void removeField(f)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {!readOnly && !draft && <Button size="xs" variant="outline" leftIcon={<Plus className="w-3 h-3" />} onClick={() => openDraft()}>Add field</Button>}
          {list.some(f => f.active) && <Button size="xs" variant="ghost" leftIcon={<Eye className="w-3 h-3" />}
            onClick={() => setPreview(preview ? null : { officeId: offices[0]?.id ?? '', vehicleTypeId: types.rows.find(t => t.isBus)?.id ?? '', values: {} })}>{preview ? 'Hide preview' : 'Preview form'}</Button>}
        </div>
      </LoadState>

      {draft && (
        <div className="border border-slate-700 rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-100">{draft.id ? 'Edit field' : `New ${ENTITY_LABELS[entity].toLowerCase().replace(/s$/, '')} field`}</p>
            <Button size="xs" variant="ghost" aria-label="Close" onClick={() => setDraft(null)}><X className="w-4 h-4" /></Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Label" required value={draft.label} error={errors.label} maxLength={80}
              onChange={e => setDraft({ ...draft, label: e.target.value, key: draft.id ? draft.key : toKey(e.target.value) })} />
            <Input label="Key" required value={draft.key} error={errors.key} disabled={!!draft.id} hint={draft.id ? 'Cannot change after creation' : 'Used in CSV import/export'}
              onChange={e => setDraft({ ...draft, key: e.target.value })} />
            <Select label="Type" value={draft.fieldType} disabled={!!draft.id} hint={draft.id ? 'Type is fixed once values may exist' : undefined}
              onChange={e => setDraft({ ...draft, fieldType: e.target.value as FieldType })} options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            {draft.fieldType === 'dropdown' && (
              <Input label="Options" required className="sm:col-span-3" value={draft.options} error={errors.options} hint="Separate with commas"
                onChange={e => setDraft({ ...draft, options: e.target.value })} />
            )}
            <Select label="Applies to" value={draft.officeId} onChange={e => setDraft({ ...draft, officeId: e.target.value })}
              options={[{ value: '', label: 'All offices' }, ...offices.map(o => ({ value: o.id, label: `Only ${o.name}` }))]} />
            {entity === 'vehicle' && (
              <Select label="Vehicle type" value={draft.vehicleTypeId} onChange={e => setDraft({ ...draft, vehicleTypeId: e.target.value })}
                options={[{ value: '', label: 'All vehicle types' }, ...types.rows.map(t => ({ value: t.id, label: t.name }))]} />
            )}
            <Input label="Help text" value={draft.helpText} maxLength={200} onChange={e => setDraft({ ...draft, helpText: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Toggle label="Required (default for every office)" checked={draft.required} onChange={v => setDraft({ ...draft, required: v })} />
            <Toggle label="Show as list column" checked={draft.showInList} onChange={v => setDraft({ ...draft, showInList: v })} />
            {draft.id && <Toggle label="Active" checked={draft.active} onChange={v => setDraft({ ...draft, active: v })} />}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={save} isLoading={busy} leftIcon={<Save className="w-4 h-4" />}>Save field</Button>
          </div>
        </div>
      )}

      {list.some(f => f.active && !f.officeId) && offices.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-100">Per-office visibility</p>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr><th scope="col" className={thCls}>Field</th>{offices.map(o => <th scope="col" key={o.id} className={thCls}>{o.code}</th>)}</tr></thead>
              <tbody>
                {list.filter(f => f.active && !f.officeId).map(f => (
                  <tr key={f.id}>
                    <td className={tdCls}>{f.label}</td>
                    {offices.map(o => {
                      const s = settings.find(x => x.fieldId === f.id && x.officeId === o.id);
                      return (
                        <td key={o.id} className={tdCls}>
                          <select aria-label={`${f.label} in ${o.name}`} className="h-8 rounded-lg border border-slate-700 px-1 text-xs bg-white" disabled={readOnly}
                            value={s?.visibility ?? ''} onChange={e => void setVisibility(f.id, o.id, e.target.value)}>
                            <option value="">Default ({f.required ? 'required' : 'shown'})</option>
                            <option value="shown">Shown</option>
                            <option value="required">Required</option>
                            <option value="hidden">Hidden</option>
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preview && (
        <div className="border border-dashed border-slate-700 rounded-xl p-3 space-y-3 bg-slate-850/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Preview as office" value={preview.officeId} onChange={e => setPreview({ ...preview, officeId: e.target.value })}
              options={offices.length ? offices.map(o => ({ value: o.id, label: o.name })) : [{ value: '', label: 'No offices yet' }]} />
            {entity === 'vehicle' && (
              <Select label="Vehicle type" value={preview.vehicleTypeId} onChange={e => setPreview({ ...preview, vehicleTypeId: e.target.value })}
                options={types.rows.map(t => ({ value: t.id, label: t.name }))} />
            )}
          </div>
          {previewFields.length === 0 ? <p className="text-xs text-slate-400">No custom fields apply here.</p>
            : <CustomFieldsForm fields={previewFields} values={preview.values} onChange={values => setPreview({ ...preview, values })} />}
          <p className="text-[11px] text-slate-400">Preview only: nothing is saved. File fields upload on the real record form.</p>
        </div>
      )}
    </Section>
  );
};

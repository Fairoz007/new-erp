import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, CheckCircle2, X, Image as ImageIcon, AlertCircle, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, Select, Textarea } from '../ui/Input';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { BUCKETS, formatFileSize, validateFile } from '../../services/storage';
import type { BucketId } from '../../services/storage';
import type { DocumentCategory } from '../../types/operations';

export interface UploadedFileMeta {
  /** Local preview URL (blob:) for a freshly picked file; empty for an already stored file. */
  url: string;
  name: string;
  size: string;
  type: string;
  uploadDate: string;
  /** The real File picked by the user. The submit handler uploads it with services/storage.uploadFile. */
  file?: File;
  /** Storage path of an already stored file (edit screens), so the zone can show it as attached. */
  path?: string;
}

interface DocumentUploadZoneProps {
  label?: string;
  description?: string;
  accept?: string;
  /** Which bucket rules to validate against (default 'documents': PDF/PNG/JPEG up to 10 MB). */
  bucket?: BucketId;
  value?: UploadedFileMeta | null;
  onChange: (file: UploadedFileMeta | null) => void;
  /** @deprecated OCR was a simulation with fabricated sample bills and has been removed. Never called. */
  onOcrExtract?: (extractedData: {
    invoiceNumber?: string;
    partyName?: string;
    date?: string;
    amount?: number;
    tax?: number;
    description?: string;
  }) => void;
  required?: boolean;
  disabled?: boolean;
}

export const DocumentUploadZone: React.FC<DocumentUploadZoneProps> = ({
  label = 'Upload Scanned Bill / Document Receipt',
  description = 'Attach scanned invoice, PDF voucher, or receipt photo (PDF, JPG, PNG up to 10MB)',
  accept = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg',
  bucket = 'documents',
  value,
  onChange,
  required = false,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null);

  const releasePreview = () => {
    if (previewUrl.current) { URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; }
  };
  useEffect(() => releasePreview, []);

  const limitText = `${BUCKETS[bucket].label} up to ${formatFileSize(BUCKETS[bucket].maxBytes).replace('.00', '')}`;

  const processFile = (file: File) => {
    try {
      validateFile(file, bucket);
    } catch (e) {
      setError((e as Error).message);
      return; // keep the previous valid selection, if any
    }
    setError(null);
    releasePreview();
    previewUrl.current = URL.createObjectURL(file);
    onChange({
      url: previewUrl.current,
      name: file.name,
      size: formatFileSize(file.size),
      type: file.type || 'application/octet-stream',
      uploadDate: new Date().toISOString(),
      file,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = ''; // allow re-picking the same file after an error
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const remove = () => {
    releasePreview();
    setError(null);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-200">
            {label} {required && <span className="text-rose-400">*</span>}
          </label>
          <span className="text-[10px] text-slate-400">{limitText}</span>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept={accept} onChange={handleFileChange} className="hidden" disabled={disabled} />

      {value ? (
        <div className="p-3.5 bg-slate-900 border border-slate-700/80 rounded-xl flex items-center justify-between gap-3 group hover:border-indigo-500/50 transition-all">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-indigo-950/80 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              {value.type.includes('pdf') ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-slate-200 truncate">{value.name}</p>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {value.size} • {value.file ? 'Selected, uploads when you save' : 'Stored'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={() => fileInputRef.current?.click()}>
              Replace
            </Button>
            <button
              type="button"
              disabled={disabled}
              onClick={remove}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="Remove attachment"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${
            isDragging
              ? 'border-indigo-500 bg-indigo-950/20'
              : 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/50 hover:border-slate-700'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
              <UploadCloud className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">Click to upload or drag and drop a file</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-[11px] text-rose-400 font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {error}
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Upload form for the documents repository. Used by the 'upload-document' quick modal
// (QuickActionModals renders <UploadDocumentForm onDone={closeQuickModal} /> inside its Modal).
// ---------------------------------------------------------------------------------------------
const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'Registration', label: 'Registration (Mulkiya)' },
  { value: 'Insurance', label: 'Insurance Policy' },
  { value: 'Warranty', label: 'Warranty Certificate' },
  { value: 'Inspection Report', label: 'Inspection Report' },
  { value: 'Purchase Invoice', label: 'Purchase Agreement' },
  { value: 'Accident Report', label: 'Police Accident Report' },
  { value: 'Other', label: 'Other Document' },
];

export const UploadDocumentForm: React.FC<{ defaultVehicleId?: string; onDone: () => void }> = ({ defaultVehicleId, onDone }) => {
  const { vehicles, companies, selectedCompanyId, addDocument } = useFleet();
  const { addToast } = useUI();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    documentName: '',
    documentNumber: '',
    category: 'Registration' as DocumentCategory,
    vehicleId: defaultVehicleId ?? '',
    companyId: selectedCompanyId !== 'all' ? selectedCompanyId : '',
    issueDate: today,
    expiryDate: '',
    notes: '',
  });
  const [attachment, setAttachment] = useState<UploadedFileMeta | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const vehicle = vehicles.find(v => v.id === form.vehicleId);
  const companyId = vehicle?.companyId || form.companyId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (!attachment?.file) { setFormError('Choose a file to upload.'); return; }
    if (!companyId) { setFormError('Select a company or a vehicle.'); return; }
    const name = form.documentName.trim() || attachment.name;
    setSubmitting(true);
    try {
      await addDocument({
        documentName: name,
        documentNumber: form.documentNumber || undefined,
        category: form.category,
        vehicleId: form.vehicleId || undefined,
        companyId,
        issueDate: form.issueDate || undefined,
        expiryDate: form.expiryDate || undefined,
        notes: form.notes || undefined,
        file: attachment.file,
      });
      addToast({ type: 'success', title: 'Document Uploaded', message: `Saved "${name}" to the repository.` });
      onDone();
    } catch (err) {
      setFormError((err as Error).message);
      addToast({ type: 'error', title: 'Upload failed', message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <DocumentUploadZone
        label="File"
        description="Mulkiya, insurance policy, permit or warranty scan"
        required
        value={attachment}
        disabled={submitting}
        onChange={f => {
          setAttachment(f);
          if (f && !form.documentName) setForm(p => ({ ...p, documentName: f.name.replace(/\.[^.]+$/, '') }));
        }}
      />

      <Input label="Document Title" placeholder="e.g. Mulkiya Registration 2026" value={form.documentName}
        onChange={e => setForm({ ...form, documentName: e.target.value })} required />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value as DocumentCategory })}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Input label="Document Number" value={form.documentNumber} onChange={e => setForm({ ...form, documentNumber: e.target.value })} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select label="Vehicle" value={form.vehicleId} onChange={e => setForm({ ...form, vehicleId: e.target.value })}>
          <option value="">None (company / corporate document)</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} ({v.plateNumber})</option>)}
        </Select>
        {!vehicle && (
          <Select label="Company" value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })} required>
            <option value="">Select company</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Issue Date" type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} />
        <Input label="Expiry Date" type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
      </div>

      <Textarea label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

      {formError && <p role="alert" className="text-xs text-rose-400 font-medium">{formError}</p>}

      <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
        <Button variant="secondary" type="button" onClick={onDone} disabled={submitting}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={submitting} leftIcon={<Upload className="w-4 h-4" />}>
          {submitting ? 'Uploading...' : 'Save to Repository'}
        </Button>
      </div>
    </form>
  );
};

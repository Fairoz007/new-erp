import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, X, Eye, Sparkles, Image as ImageIcon } from 'lucide-react';
import { Button } from '../ui/Button';

export interface UploadedFileMeta {
  url: string;
  name: string;
  size: string;
  type: string;
  uploadDate: string;
}

interface DocumentUploadZoneProps {
  label?: string;
  description?: string;
  accept?: string;
  value?: UploadedFileMeta | null;
  onChange: (file: UploadedFileMeta | null) => void;
  onOcrExtract?: (extractedData: {
    invoiceNumber?: string;
    partyName?: string;
    date?: string;
    amount?: number;
    tax?: number;
    description?: string;
  }) => void;
  required?: boolean;
}

const SAMPLE_BILLS: { name: string; type: string; size: string; url: string; ocr: any }[] = [
  {
    name: 'Saud_Bahwan_Auto_Maintenance_Bill_INV-8812.pdf',
    type: 'application/pdf',
    size: '1.2 MB',
    url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1000&auto=format&fit=crop&q=80',
    ocr: {
      invoiceNumber: 'PINV-SB-2026-8812',
      partyName: 'Saud Bahwan Automotive LLC',
      date: new Date().toISOString().slice(0, 10),
      amount: 145.500,
      tax: 7.275,
      description: 'Scheduled Fleet Maintenance, Oil Filter & Brake Pad Replacement',
    },
  },
  {
    name: 'Shell_Fleet_Fuel_Statement_Receipt_SHL990.jpg',
    type: 'image/jpeg',
    size: '840 KB',
    url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1000&auto=format&fit=crop&q=80',
    ocr: {
      invoiceNumber: 'RCPT-SHL-2026-990',
      partyName: 'Shell Oman Marketing SAOG',
      date: new Date().toISOString().slice(0, 10),
      amount: 48.750,
      tax: 2.321,
      description: 'Mogas 95 Bulk Vehicle Refuel (204 Litres)',
    },
  },
  {
    name: 'Muscat_Tyre_Replacement_Invoice_MTR-411.pdf',
    type: 'application/pdf',
    size: '1.8 MB',
    url: 'https://images.unsplash.com/photo-1578844251758-2f71da64c96f?w=1000&auto=format&fit=crop&q=80',
    ocr: {
      invoiceNumber: 'PINV-MTR-2026-411',
      partyName: 'Muscat Tyre & Rubber Co LLC',
      date: new Date().toISOString().slice(0, 10),
      amount: 220.000,
      tax: 11.000,
      description: '4x Heavy Duty All-Terrain Commercial Tyres & Wheel Alignment',
    },
  },
];

export const DocumentUploadZone: React.FC<DocumentUploadZoneProps> = ({
  label = 'Upload Scanned Bill / Document Receipt',
  description = 'Attach scanned invoice, PDF voucher, or receipt photo (PDF, JPG, PNG up to 10MB)',
  accept = 'image/*,.pdf',
  value,
  onChange,
  onOcrExtract,
  required = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const fileUrl = URL.createObjectURL(file);
    const sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    const meta: UploadedFileMeta = {
      url: fileUrl,
      name: file.name,
      size: sizeStr,
      type: file.type || 'application/octet-stream',
      uploadDate: new Date().toISOString(),
    };
    onChange(meta);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleLoadSample = (sample: typeof SAMPLE_BILLS[0]) => {
    setIsScanning(true);
    setTimeout(() => {
      const meta: UploadedFileMeta = {
        url: sample.url,
        name: sample.name,
        size: sample.size,
        type: sample.type,
        uploadDate: new Date().toISOString(),
      };
      onChange(meta);
      if (onOcrExtract) {
        onOcrExtract(sample.ocr);
      }
      setIsScanning(false);
    }, 600);
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-200">
            {label} {required && <span className="text-rose-400">*</span>}
          </label>
          <span className="text-[10px] text-slate-400">PDF, JPG, PNG up to 10MB</span>
        </div>
      )}

      {/* Hidden native input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />

      {value ? (
        /* File Uploaded Preview Card */
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
                {value.size} • Attached on {new Date(value.uploadDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => fileInputRef.current?.click()}
            >
              Replace
            </Button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Remove attachment"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Dropzone Box */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-950/20'
              : 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/50 hover:border-slate-700'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-indigo-400">
              <UploadCloud className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">
                Click to upload or drag and drop bill document
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Sample Bill Loader & OCR Simulation */}
      {!value && (
        <div className="pt-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
            <span className="flex items-center gap-1 text-slate-400 font-medium">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Quick Fill with Sample Scanned Bill:
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {SAMPLE_BILLS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                disabled={isScanning}
                onClick={() => handleLoadSample(sample)}
                className="text-left px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-indigo-500/40 hover:bg-slate-850 text-[10px] text-slate-300 transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="truncate pr-1">
                  <p className="font-semibold text-slate-200 truncate">{sample.name.split('_')[0]} Bill</p>
                  <p className="text-indigo-400 font-mono">{sample.ocr.amount.toFixed(3)} OMR</p>
                </div>
                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-400 group-hover:text-indigo-300 shrink-0">
                  {sample.type.includes('pdf') ? 'PDF' : 'JPG'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

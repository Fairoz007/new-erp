import React from 'react';
import { Printer, FileDown, FileSpreadsheet } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  columns: string[];
  rows: string[][];
  onDownloadPdf: () => void;
  onDownloadCsv: () => void;
}

/** Document-style view of a register: read it on screen, print it, or download it as PDF / CSV. */
export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  isOpen, onClose, title, subtitle, columns, rows, onDownloadPdf, onDownloadCsv,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Document view"
    description="Print-ready view of the records currently listed (filters and sorting applied)."
    size="4xl"
    footer={
      <div className="flex flex-wrap justify-end gap-2 no-print">
        <Button variant="outline" size="sm" onClick={onDownloadCsv} leftIcon={<FileSpreadsheet className="w-4 h-4" />}>Download CSV</Button>
        <Button variant="outline" size="sm" onClick={onDownloadPdf} leftIcon={<FileDown className="w-4 h-4" />}>Download PDF</Button>
        <Button variant="primary" size="sm" onClick={() => window.print()} leftIcon={<Printer className="w-4 h-4" />}>Print</Button>
      </div>
    }
  >
    <div id="printable-report" className="bg-white text-slate-100">
      <h2 className="text-lg font-extrabold">{title}</h2>
      <p className="text-[11px] text-slate-400 mb-3">
        Al Hakim National LLC · Generated {new Date().toLocaleString()} · {rows.length} record{rows.length === 1 ? '' : 's'}
        {subtitle ? ` · ${subtitle}` : ''}
      </p>
      <div className="overflow-auto max-h-[60vh] print:max-h-none">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c} className="text-left font-bold px-2 py-1.5 bg-slate-850 border border-slate-700 whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-2 py-6 text-center text-slate-400 italic border border-slate-700">No records to show.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => <td key={j} className="px-2 py-1 border border-slate-700 align-top">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </Modal>
);

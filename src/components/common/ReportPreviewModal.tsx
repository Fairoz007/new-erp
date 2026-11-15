import { orgName } from '../../lib/branding';
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
  /** Prints the same A4 pages as Download PDF. */
  onPrint: () => void;
  /** A PDF is being made (Download PDF / Print show as busy). */
  pdfBusy?: boolean;
  /** Error or notice from the last PDF action. */
  message?: string | null;
}

const PREVIEW_LIMIT = 500;

/** Document-style view of a register: read it on screen, print it, or download it as PDF / CSV. */
export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  isOpen, onClose, title, subtitle, columns, rows, onDownloadPdf, onDownloadCsv, onPrint, pdfBusy = false, message,
}) => {
  // which button started the PDF, so only that one shows the spinner
  const [pending, setPending] = React.useState<'pdf' | 'print'>('print');
  return (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Document view"
    description="Print-ready view of the records currently listed (filters and sorting applied)."
    size="4xl"
    footer={
      <div className="flex flex-wrap items-center justify-end gap-2 no-print">
        {message && <span role="alert" className="text-xs text-rose-600 mr-auto">{message}</span>}
        <Button variant="outline" size="sm" onClick={onDownloadCsv} leftIcon={<FileSpreadsheet className="w-4 h-4" />}>Download CSV</Button>
        <Button variant="outline" size="sm" onClick={() => { setPending('pdf'); onDownloadPdf(); }} isLoading={pdfBusy && pending === 'pdf'} disabled={pdfBusy} leftIcon={<FileDown className="w-4 h-4" />}>Download PDF</Button>
        <Button variant="primary" size="sm" onClick={() => { setPending('print'); onPrint(); }} isLoading={pdfBusy && pending === 'print'} disabled={pdfBusy} leftIcon={<Printer className="w-4 h-4" />}>Print</Button>
      </div>
    }
  >
    <div id="printable-report" className="bg-white text-slate-100">
      <h2 className="text-lg font-extrabold">{title}</h2>
      <p className="text-[11px] text-slate-400 mb-3">
        {orgName()} · Generated {new Date().toLocaleString()} · {rows.length} record{rows.length === 1 ? '' : 's'}
        {subtitle ? ` · ${subtitle}` : ''}
      </p>
      <div className="overflow-auto max-h-[60vh] print:max-h-none">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              {columns.map(c => (
                <th scope="col" key={c} className="text-left font-bold px-2 py-1.5 bg-slate-850 border border-slate-700 whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-2 py-6 text-center text-slate-400 italic border border-slate-700">No records to show.</td></tr>
            )}
            {rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => <td key={j} className="px-2 py-1 border border-slate-700 align-top">{cell}</td>)}
              </tr>
            ))}
            {rows.length > PREVIEW_LIMIT && (
              <tr><td colSpan={columns.length} className="px-2 py-3 text-center text-slate-400 italic border border-slate-700">Showing the first {PREVIEW_LIMIT} of {rows.length} records. The PDF and CSV downloads contain all of them.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </Modal>
  );
};

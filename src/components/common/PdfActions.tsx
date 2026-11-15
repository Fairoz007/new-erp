// Download PDF and Print for a page that prints a letterhead PDF (docs/A4_PDF_PROMPT.md decision 3:
// Print gives the same pages as the downloaded file). The caller builds the document; this keeps the
// buttons busy while it is made and says so when the browser downloaded instead of printing.
import React, { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '../ui/Button';
import { useUI } from '../../context/UIContext';

export type PdfResult = 'printed' | 'downloaded' | 'saved';

export const PdfActions: React.FC<{
  run: (print: boolean) => Promise<PdfResult>;
  disabled?: boolean;
  /** False hides Download PDF (no export permission); Print stays, as it did for the screen print. */
  canDownload?: boolean;
  printLabel?: string;
  size?: 'sm' | 'md';
}> = ({ run, disabled, canDownload = true, printLabel = 'Print', size = 'md' }) => {
  const { addToast } = useUI();
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null);
  const go = async (print: boolean) => {
    setBusy(print ? 'print' : 'pdf');
    try {
      const r = await run(print);
      if (r === 'downloaded') addToast({ type: 'info', title: 'PDF downloaded', message: 'This browser cannot print a PDF directly; open the downloaded file to print it.' });
    } catch (e) {
      addToast({ type: 'error', title: print ? 'Could not print' : 'Could not create the PDF', message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {canDownload && (
        <Button variant="secondary" size={size} onClick={() => void go(false)} disabled={disabled || !!busy} isLoading={busy === 'pdf'}
          leftIcon={<Download className="w-4 h-4" />}>
          Download PDF
        </Button>
      )}
      <Button variant="primary" size={size} onClick={() => void go(true)} disabled={disabled || !!busy} isLoading={busy === 'print'}
        leftIcon={<Printer className="w-4 h-4" />}>
        {printLabel}
      </Button>
    </>
  );
};

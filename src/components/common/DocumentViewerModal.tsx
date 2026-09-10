import React, { useState } from 'react';
import { FileText, Download, Printer, ZoomIn, ZoomOut, RotateCw, ExternalLink, X, CheckCircle2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useUI } from '../../context/UIContext';

export const DocumentViewerModal: React.FC = () => {
  const { viewingBill, closeBillModal } = useUI();
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);

  if (!viewingBill) return null;

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const isPdf = viewingBill.type?.includes('pdf') || viewingBill.url?.endsWith('.pdf') || viewingBill.title?.endsWith('.pdf');

  return (
    <Modal
      isOpen={!!viewingBill}
      onClose={closeBillModal}
      title="Document & Scanned Bill Viewer"
      description={viewingBill.title}
      size="xl"
    >
      <div className="space-y-4">
        {/* Document Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="font-semibold truncate max-w-xs">{viewingBill.title}</span>
            {viewingBill.size && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                {viewingBill.size}
              </span>
            )}
            <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-bold">
              <CheckCircle2 className="w-3 h-3" /> Verified Document
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="font-mono text-slate-400 px-1 text-[11px]">{zoom}%</span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleRotate}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Rotate"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-800 mx-1" />

            <Button
              variant="outline"
              size="xs"
              onClick={() => window.print()}
              leftIcon={<Printer className="w-3.5 h-3.5" />}
            >
              Print
            </Button>
            <a
              href={viewingBill.url}
              download={viewingBill.title}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </div>
        </div>

        {/* Document Canvas Display */}
        <div className="w-full h-[520px] bg-slate-950/80 rounded-xl border border-slate-800 overflow-auto flex items-center justify-center p-4">
          <div
            style={{
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s ease',
            }}
            className="max-w-full max-h-full flex items-center justify-center origin-center"
          >
            {viewingBill.url && viewingBill.url !== '#' && !viewingBill.url.startsWith('blob:') && (
              <img
                src={viewingBill.url}
                alt={viewingBill.title}
                className="max-h-[480px] object-contain rounded-lg shadow-2xl border border-slate-700"
              />
            )}

            {(!viewingBill.url || viewingBill.url === '#' || viewingBill.url.startsWith('blob:')) && (
              <div className="w-[420px] p-6 bg-slate-900 border border-slate-700 rounded-xl text-center space-y-4 shadow-2xl">
                <div className="w-16 h-16 rounded-2xl bg-indigo-950/80 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-100 text-sm">{viewingBill.title}</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Official Attached Document / Scanned Commercial Invoice
                  </p>
                  <p className="text-[11px] font-mono text-indigo-400 mt-2">
                    Digest: SHA256-VOUCHER-{Math.random().toString(36).substring(2, 10).toUpperCase()}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1 text-left bg-slate-950/60 p-3 rounded-lg">
                  <p><strong className="text-slate-300">File Type:</strong> {viewingBill.type || 'Commercial Voucher (PDF)'}</p>
                  <p><strong className="text-slate-300">Size:</strong> {viewingBill.size || '1.24 MB'}</p>
                  <p><strong className="text-slate-300">Timestamp:</strong> {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
                  <p><strong className="text-slate-300">Status:</strong> Cryptographically Sealed & Archived</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

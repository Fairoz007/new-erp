import React, { useEffect, useState } from 'react';
import { FileText, Download, ExternalLink, ZoomIn, ZoomOut, RotateCw, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useUI } from '../../context/UIContext';
import { createSignedUrl, downloadFile, parseStorageRef } from '../../services/storage';

// viewingBill.url may be:
//   storage://<bucket>/<path>  -> resolved to a short-lived signed URL (preferred; see toStorageRef)
//   blob:... / https:... / data: -> shown as is (a file picked but not yet uploaded)
export const DocumentViewerModal: React.FC = () => {
  const { viewingBill, closeBillModal } = useUI();
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [resolved, setResolved] = useState<{ src: string | null; error: string | null; loading: boolean }>({ src: null, error: null, loading: false });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const rawUrl = viewingBill?.url;
  const ref = parseStorageRef(rawUrl);

  useEffect(() => {
    setZoom(100); setRotation(0); setActionError(null);
    if (!rawUrl) { setResolved({ src: null, error: null, loading: false }); return; }
    if (!ref) { setResolved({ src: rawUrl === '#' ? null : rawUrl, error: null, loading: false }); return; }
    let cancelled = false;
    setResolved({ src: null, error: null, loading: true });
    createSignedUrl(ref.bucket, ref.path, { expiresIn: 300 })
      .then(src => { if (!cancelled) setResolved({ src, error: null, loading: false }); })
      .catch(e => { if (!cancelled) setResolved({ src: null, error: (e as Error).message, loading: false }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawUrl]);

  if (!viewingBill) return null;

  const title = viewingBill.title;
  const isPdf = (viewingBill.type?.includes('pdf') ?? false) || /\.pdf$/i.test(title) || (ref?.path ?? '').toLowerCase().endsWith('.pdf');
  const { src, error, loading } = resolved;

  const handleDownload = async () => {
    setActionError(null);
    setBusy(true);
    try {
      if (ref) {
        await downloadFile(ref.bucket, ref.path, title);
      } else if (src) {
        const a = document.createElement('a');
        a.href = src; a.download = title; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenNewTab = async () => {
    setActionError(null);
    try {
      const url = ref ? await createSignedUrl(ref.bucket, ref.path, { expiresIn: 60 }) : src;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const toolBtn = 'p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer';

  return (
    <Modal isOpen={!!viewingBill} onClose={closeBillModal} title="Document Viewer" description={title} size="xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-300 min-w-0">
            <span className="font-semibold truncate max-w-xs">{title}</span>
            {viewingBill.size && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">{viewingBill.size}</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {!isPdf && src && (
              <>
                <button onClick={() => setZoom(z => Math.max(z - 25, 50))} className={toolBtn} title="Zoom Out"><ZoomOut className="w-4 h-4" /></button>
                <span className="font-mono text-slate-400 px-1 text-[11px]">{zoom}%</span>
                <button onClick={() => setZoom(z => Math.min(z + 25, 200))} className={toolBtn} title="Zoom In"><ZoomIn className="w-4 h-4" /></button>
                <button onClick={() => setRotation(r => (r + 90) % 360)} className={toolBtn} title="Rotate"><RotateCw className="w-4 h-4" /></button>
                <div className="h-4 w-px bg-slate-800 mx-1" />
              </>
            )}
            <button
              onClick={handleOpenNewTab}
              disabled={!src}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
            </button>
            <button
              onClick={handleDownload}
              disabled={busy || !src}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download
            </button>
          </div>
        </div>

        {actionError && (
          <p role="alert" className="flex items-center gap-1.5 text-xs text-rose-400 font-medium"><AlertCircle className="w-3.5 h-3.5" /> {actionError}</p>
        )}

        <div className="w-full h-[520px] bg-slate-950/80 rounded-xl border border-slate-800 overflow-auto flex items-center justify-center p-4">
          {loading && <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />}

          {!loading && error && (
            <div className="text-center space-y-2 max-w-sm">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-100">The file could not be opened</p>
              <p className="text-xs text-slate-400">{error}</p>
            </div>
          )}

          {!loading && !error && !src && (
            <div className="text-center space-y-2 max-w-sm">
              <FileText className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-100">No file stored</p>
              <p className="text-xs text-slate-400">This record has no attached file.</p>
            </div>
          )}

          {!loading && !error && src && isPdf && (
            <iframe src={src} title={title} className="w-full h-full rounded-lg bg-white" />
          )}

          {!loading && !error && src && !isPdf && (
            <div
              style={{ transform: `scale(${zoom / 100}) rotate(${rotation}deg)`, transition: 'transform 0.2s ease' }}
              className="max-w-full max-h-full flex items-center justify-center origin-center"
            >
              <img
                src={src}
                alt={title}
                className="max-h-[480px] object-contain rounded-lg shadow-2xl border border-slate-700"
                onError={() => setResolved(r => ({ ...r, src: null, error: 'The file could not be displayed.' }))}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

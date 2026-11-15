import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Download, ExternalLink, ZoomIn, ZoomOut, RotateCw, AlertCircle, Loader2, Maximize2, RefreshCw } from 'lucide-react';
import { createSignedUrl, downloadFile, parseStorageRef } from '../../services/storage';

interface ImageViewerProps {
  /** storage://<bucket>/<path> (resolved to a short-lived signed URL), or a blob:/https:/data: URL. */
  source: string | null | undefined;
  title: string;
  /** MIME type when known; PDFs are shown in a frame. */
  type?: string;
  size?: string;
}

const ZOOMS = [50, 75, 100, 125, 150, 200, 300];

/**
 * Viewer for receipts, bills and documents: images with zoom, fit and rotate; PDFs in a frame;
 * download and open in a new tab through signed URLs. Keys: + / - zoom, 0 fit, R rotate.
 */
export const ImageViewer: React.FC<ImageViewerProps> = ({ source, title, type, size }) => {
  const ref = parseStorageRef(source);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [state, setState] = useState<{ src: string | null; error: string | null; loading: boolean }>({ src: null, error: null, loading: false });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setZoom(100); setRotation(0); setActionError(null);
    if (!source || source === '#') { setState({ src: null, error: null, loading: false }); return; }
    if (!ref) { setState({ src: source, error: null, loading: false }); return; }
    let cancelled = false;
    setState({ src: null, error: null, loading: true });
    createSignedUrl(ref.bucket, ref.path, { expiresIn: 300 })
      .then(src => { if (!cancelled) setState({ src, error: null, loading: false }); })
      .catch(e => { if (!cancelled) setState({ src: null, error: (e as Error).message, loading: false }); });
    return () => { cancelled = true; };
    // ref is derived from source
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, attempt]);

  const isPdf = (type?.includes('pdf') ?? false) || /\.pdf$/i.test(title) || (ref?.path ?? '').toLowerCase().endsWith('.pdf');
  const { src, error, loading } = state;
  const step = useCallback((dir: 1 | -1) => setZoom(z => {
    const i = ZOOMS.indexOf(z);
    return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir))];
  }), []);

  const onKey = (e: React.KeyboardEvent) => {
    if (isPdf || !src) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); step(1); }
    else if (e.key === '-') { e.preventDefault(); step(-1); }
    else if (e.key === '0') { e.preventDefault(); setZoom(100); setRotation(0); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setRotation(r => (r + 90) % 360); }
  };

  const download = async () => {
    setActionError(null);
    setBusy(true);
    try {
      if (ref) await downloadFile(ref.bucket, ref.path, title);
      else if (src) {
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

  const openTab = async () => {
    setActionError(null);
    try {
      const url = ref ? await createSignedUrl(ref.bucket, ref.path, { expiresIn: 60 }) : src;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const toolBtn = 'min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] inline-flex items-center justify-center rounded-control border border-slate-700 bg-white text-slate-300 hover:text-slate-100 hover:bg-slate-850 cursor-pointer';
  const textBtn = 'inline-flex items-center gap-1 px-3 min-h-[44px] sm:min-h-[32px] text-xs font-semibold rounded-control border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-850 rounded-card border border-slate-700 text-xs">
        <div className="flex items-center gap-2 text-slate-300 min-w-0">
          <span className="font-semibold truncate max-w-[16rem]" title={title}>{title}</span>
          {size && <span className="px-2 py-0.5 rounded bg-white border border-slate-700 text-slate-400 text-2xs">{size}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!isPdf && src && (
            <>
              <button type="button" onClick={() => step(-1)} className={toolBtn} aria-label="Zoom out" title="Zoom out (-)"><ZoomOut className="w-4 h-4" /></button>
              <span className="font-mono text-slate-400 px-1 text-2xs w-10 text-center" aria-live="polite">{zoom}%</span>
              <button type="button" onClick={() => step(1)} className={toolBtn} aria-label="Zoom in" title="Zoom in (+)"><ZoomIn className="w-4 h-4" /></button>
              <button type="button" onClick={() => { setZoom(100); setRotation(0); }} className={toolBtn} aria-label="Fit to the window" title="Fit (0)"><Maximize2 className="w-4 h-4" /></button>
              <button type="button" onClick={() => setRotation(r => (r + 90) % 360)} className={toolBtn} aria-label="Rotate" title="Rotate (R)"><RotateCw className="w-4 h-4" /></button>
            </>
          )}
          <button type="button" onClick={openTab} disabled={!src} className={`${textBtn} border-slate-700 bg-white text-slate-200 hover:bg-slate-850`}>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Open in new tab
          </button>
          <button type="button" onClick={download} disabled={busy || !src} className={`${textBtn} border-transparent bg-brand-500 hover:bg-brand-600 text-white`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <Download className="w-3.5 h-3.5" aria-hidden="true" />} Download
          </button>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-danger-700 font-medium"><AlertCircle className="w-3.5 h-3.5" /> {actionError}</p>
      )}

      <div
        tabIndex={src && !isPdf ? 0 : -1}
        onKeyDown={onKey}
        aria-label={src && !isPdf ? `${title}. Use plus and minus to zoom, R to rotate, 0 to fit.` : undefined}
        className="w-full h-[60vh] sm:h-[520px] bg-slate-850 rounded-card border border-slate-700 overflow-auto flex items-center justify-center p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {loading && <Loader2 className="w-6 h-6 text-slate-400 motion-safe:animate-spin" aria-label="Loading" />}

        {!loading && error && (
          <div className="text-center space-y-2 max-w-sm" role="alert">
            <AlertCircle className="w-8 h-8 text-danger mx-auto" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-100">The file could not be opened</p>
            <p className="text-xs text-slate-400">{error}</p>
            {ref && (
              <button type="button" onClick={() => setAttempt(a => a + 1)} className={`${textBtn} border-slate-700 bg-white text-slate-200 mx-auto`}>
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Try again
              </button>
            )}
          </div>
        )}

        {!loading && !error && !src && (
          <div className="text-center space-y-2 max-w-sm">
            <FileText className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-100">No file stored</p>
            <p className="text-xs text-slate-400">This record has no attached file.</p>
          </div>
        )}

        {!loading && !error && src && isPdf && (
          <iframe src={src} title={title} className="w-full h-full rounded-lg bg-white" />
        )}

        {!loading && !error && src && !isPdf && (
          <div
            style={{ transform: `scale(${zoom / 100}) rotate(${rotation}deg)` }}
            className="max-w-full max-h-full flex items-center justify-center origin-center motion-safe:transition-transform motion-safe:duration-200"
          >
            <img
              src={src}
              alt={title}
              className="max-h-[56vh] sm:max-h-[480px] object-contain rounded-lg shadow-card border border-slate-700 bg-white"
              onError={() => setState(s => ({ ...s, src: null, error: 'The file could not be displayed. The link may have expired.' }))}
            />
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { BUCKETS, BucketId, createSignedUrl, removeFiles } from '../../services/storage';
import { ImageKind, prepareImage } from '../../lib/images';

type Phase = 'idle' | 'preparing' | 'uploading' | 'error';

interface ImageUploadProps {
  label: string;
  kind: ImageKind;
  bucket?: BucketId;
  /** Stored object path, or '' for none. */
  value: string;
  /** Upload the prepared file; resolves to the stored object path. */
  upload: (file: File) => Promise<string>;
  /** Called with the new path after an upload, or '' when the user removes the image. */
  onChange: (path: string) => void;
  hint?: string;
  disabled?: boolean;
  /** Shape of the preview box. */
  shape?: 'square' | 'wide';
}

const ACCEPT: Record<BucketId, string> = {
  media: 'image/png,image/jpeg,image/webp',
  documents: 'application/pdf,image/png,image/jpeg,image/webp',
};

/**
 * Choose an image, resize/compress it in the browser (logos also squared), upload it and show it.
 * The caller saves `value` with its record and removes replaced files (see useStoredFileCleanup).
 */
export const ImageUpload: React.FC<ImageUploadProps> = ({
  label, kind, bucket = 'media', value, upload, onChange, hint, disabled, shape = 'square',
}) => {
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const localUrl = useRef<string | null>(null);
  const id = React.useId();

  // preview of the stored file (signed URL; private bucket)
  useEffect(() => {
    let live = true;
    if (!value) { setPreview(null); return; }
    if (localUrl.current) { setPreview(localUrl.current); return; }
    createSignedUrl(bucket, value, { expiresIn: 3600 })
      .then(u => { if (live) setPreview(u); })
      .catch(() => { if (live) setPreview(null); });
    return () => { live = false; };
  }, [value, bucket]);

  useEffect(() => () => { if (localUrl.current) URL.revokeObjectURL(localUrl.current); }, []);

  const run = useCallback(async (file: File) => {
    setError('');
    setLastFile(file);
    try {
      setPhase('preparing');
      const prepared = await prepareImage(file, kind, bucket);
      setPhase('uploading');
      const path = await upload(prepared);
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
      localUrl.current = URL.createObjectURL(prepared);
      setPreview(localUrl.current);
      setPhase('idle');
      setLastFile(null);
      onChange(path);
    } catch (e) {
      setPhase('error');
      setError((e as Error).message);
    }
  }, [kind, bucket, upload, onChange]);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void run(file);
  };

  const remove = () => {
    if (localUrl.current) { URL.revokeObjectURL(localUrl.current); localUrl.current = null; }
    setPreview(null);
    setError('');
    setPhase('idle');
    onChange('');
  };

  const busy = phase === 'preparing' || phase === 'uploading';
  const box = shape === 'square' ? 'w-24 h-24' : 'w-40 h-20';

  return (
    <div className="space-y-2">
      <span id={`${id}-label`} className="block text-xs font-semibold text-slate-300">{label}</span>
      <div className="flex items-start gap-4">
        <div className={`${box} shrink-0 rounded-card border border-slate-700 bg-slate-850 flex items-center justify-center overflow-hidden`}>
          {busy ? (
            <Loader2 className="w-6 h-6 text-slate-400 motion-safe:animate-spin" aria-hidden="true" />
          ) : preview ? (
            <img src={preview} alt={`${label} preview`} className="max-w-full max-h-full object-contain" />
          ) : (
            <ImagePlus className="w-6 h-6 text-slate-400" aria-hidden="true" />
          )}
        </div>
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={disabled || busy}
              onClick={() => input.current?.click()} leftIcon={<ImagePlus className="w-4 h-4" />}
              aria-describedby={`${id}-hint`}>
              {value ? 'Replace image' : 'Choose image'}
            </Button>
            {value && !busy && (
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={remove}
                leftIcon={<Trash2 className="w-4 h-4" />}>
                Remove
              </Button>
            )}
          </div>
          <p id={`${id}-hint`} className="text-2xs text-slate-400">
            {hint ?? `${BUCKETS[bucket].label}. Large images are resized before upload.`}
          </p>
          <p role="status" aria-live="polite" className="text-xs text-slate-300">
            {phase === 'preparing' ? 'Preparing the image…' : phase === 'uploading' ? 'Uploading…' : ''}
          </p>
          {phase === 'error' && (
            <div role="alert" className="text-xs text-danger-700 flex flex-wrap items-center gap-2">
              <span>{error}</span>
              {lastFile && (
                <button type="button" className="inline-flex items-center gap-1 font-semibold underline cursor-pointer"
                  onClick={() => void run(lastFile)}>
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept={ACCEPT[bucket]} className="sr-only" tabIndex={-1}
        aria-labelledby={`${id}-label`} onChange={pick} disabled={disabled || busy} />
    </div>
  );
};

/**
 * Keeps a bucket tidy around a form that uploads before it saves:
 * `track(path)` after each upload; `commit(saved, original)` after the record is saved removes every
 * uploaded file except the saved one, and the original when it was replaced or removed;
 * `abandon()` when the form is closed without saving removes everything uploaded meanwhile.
 * Removal failures are not shown: the file stays in the bucket and the orphan report
 * (storage_orphans) lists it.
 */
export function useStoredFileCleanup(bucket: BucketId) {
  const uploaded = useRef<string[]>([]);
  const track = useCallback((path: string) => { if (path) uploaded.current.push(path); }, []);
  const commit = useCallback((saved: string, original: string) => {
    const drop = uploaded.current.filter(p => p !== saved);
    if (original && original !== saved) drop.push(original);
    uploaded.current = [];
    if (drop.length) removeFiles(bucket, drop).catch(() => undefined);
  }, [bucket]);
  const abandon = useCallback(() => {
    const drop = uploaded.current;
    uploaded.current = [];
    if (drop.length) removeFiles(bucket, drop).catch(() => undefined);
  }, [bucket]);
  return { track, commit, abandon };
}

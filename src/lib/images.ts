// Image preparation before upload: resize, compress, and (logos only) fit into a square.
//
// The sizing and validation parts are pure functions (unit tested in __tests__/images.test.ts);
// `prepareImage` does the canvas work in the browser.
//
// Limits come from the buckets (src/services/storage.ts BUCKETS, mirrored from the migrations):
//   media      PNG, JPEG, WebP up to 5 MB   (office logos, organization logo, vehicle photos)
//   documents  PDF, PNG, JPEG up to 10 MB   (receipts, bills, documents)
import { BUCKETS, BucketId, formatFileSize, resolveMimeType } from '../services/storage';
import { ServiceError } from '../services/core';

export type ImageKind = 'logo' | 'photo' | 'scan';

export interface ImageRule {
  /** Longest side after resizing, in pixels. Smaller images are never enlarged. */
  maxSide: number;
  /** Logos: draw onto a square canvas (centred, transparent padding, nothing cut off). */
  square: boolean;
  /** Output type. Logos keep transparency (PNG); photos and scans are JPEG. */
  output: 'image/png' | 'image/jpeg';
  quality: number;
}

export const IMAGE_RULES: Record<ImageKind, ImageRule> = {
  logo: { maxSide: 512, square: true, output: 'image/png', quality: 1 },
  photo: { maxSide: 1600, square: false, output: 'image/jpeg', quality: 0.85 },
  scan: { maxSide: 2400, square: false, output: 'image/jpeg', quality: 0.85 },
};

/** Files larger than this are refused before decoding (a 60 MB photo would stall a phone). */
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Size after fitting the longest side into `maxSide` (never enlarges; at least 1 px). */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new ServiceError('The image has no size.');
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Where to draw a `width`×`height` image on a square canvas of side `side` so that all of it shows
 * (contain): returns the target rectangle. Used for logos, which must not lose their edges.
 */
export function squareLayout(width: number, height: number, side: number): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(side / width, side / height);
  const w = Math.round(width * scale), h = Math.round(height * scale);
  return { x: Math.round((side - w) / 2), y: Math.round((side - h) / 2), w, h };
}

/** Canvas size and drawing rectangle for an image of the given size under a rule. */
export function plan(width: number, height: number, rule: ImageRule) {
  if (rule.square) {
    const side = Math.min(rule.maxSide, Math.max(width, height));
    return { canvas: { width: side, height: side }, draw: squareLayout(width, height, side) };
  }
  const size = fitWithin(width, height, rule.maxSide);
  return { canvas: size, draw: { x: 0, y: 0, w: size.width, h: size.height } };
}

/**
 * Check a chosen file before any work: allowed type for the bucket (PDF passes through untouched
 * in `documents`), not empty, not absurdly large. The final size is checked after compressing.
 */
export function checkInput(file: Pick<File, 'name' | 'type' | 'size'>, bucket: BucketId): 'image' | 'pdf' {
  const cfg = BUCKETS[bucket];
  const mime = resolveMimeType(file);
  if (file.size === 0) throw new ServiceError(`"${file.name}" is empty.`);
  if (mime === 'application/pdf' && cfg.mimeTypes.includes(mime)) {
    if (file.size > cfg.maxBytes) throw new ServiceError(`"${file.name}" is ${formatFileSize(file.size)}; the limit is ${formatFileSize(cfg.maxBytes)}.`);
    return 'pdf';
  }
  // WebP input is accepted for either bucket: it is converted to PNG or JPEG before upload.
  if (!IMAGE_TYPES.includes(mime)) throw new ServiceError(`"${file.name}" is not an allowed file type. Allowed: ${cfg.label}.`);
  if (file.size > MAX_INPUT_BYTES) throw new ServiceError(`"${file.name}" is ${formatFileSize(file.size)}; choose an image under ${formatFileSize(MAX_INPUT_BYTES)}.`);
  return 'image';
}

/** Check the prepared file against the bucket limit (the same rule the server applies). */
export function checkOutput(size: number, mime: string, bucket: BucketId): void {
  const cfg = BUCKETS[bucket];
  if (!cfg.mimeTypes.includes(mime)) throw new ServiceError(`The ${bucket} store does not accept ${mime}.`);
  if (size > cfg.maxBytes) throw new ServiceError(`The image is still ${formatFileSize(size)} after compressing; the limit is ${formatFileSize(cfg.maxBytes)}. Choose a smaller image.`);
}

/** `photo.HEIC.jpeg` style names: keep the stem, set the extension of the output type. */
export function outputName(name: string, mime: string): string {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'application/pdf' ? 'pdf' : 'jpg';
  const base = name.split(/[\\/]/).pop() || 'image';
  const dot = base.lastIndexOf('.');
  return `${dot > 0 ? base.slice(0, dot) : base}.${ext}`;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new ServiceError('The image could not be converted.'))), type, quality));
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* fall back to <img> below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ServiceError('This image could not be read. Choose a PNG, JPEG or WebP file.');
  }
}

/**
 * Resize/compress an image for upload. PDFs (documents bucket only) are returned unchanged.
 * Throws ServiceError with a message for the user.
 */
export async function prepareImage(file: File, kind: ImageKind, bucket: BucketId): Promise<File> {
  if (checkInput(file, bucket) === 'pdf') return file;
  const rule = IMAGE_RULES[kind];
  const img = await decode(file);
  try {
    const p = plan(img.width, img.height, rule);
    const canvas = document.createElement('canvas');
    canvas.width = p.canvas.width;
    canvas.height = p.canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ServiceError('This browser cannot prepare images.');
    if (rule.output === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.source, p.draw.x, p.draw.y, p.draw.w, p.draw.h);
    let blob = await toBlob(canvas, rule.output, rule.quality);
    // JPEG: step the quality down until it fits the bucket
    for (let q = rule.quality - 0.1; rule.output === 'image/jpeg' && blob.size > BUCKETS[bucket].maxBytes && q >= 0.5; q -= 0.1) {
      blob = await toBlob(canvas, rule.output, q);
    }
    checkOutput(blob.size, rule.output, bucket);
    return new File([blob], outputName(file.name, rule.output), { type: rule.output });
  } finally {
    img.close();
  }
}

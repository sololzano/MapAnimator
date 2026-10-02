// Sign photos: imported once (downscaled, EXIF-rotated), stored as Blobs in
// IndexedDB, decoded to ImageBitmaps on demand and cached for drawing.
import { rid } from '../core/model';
import { getAsset, putAsset } from '../storage/db';

const MAX_SIDE = 1600;

const bitmaps = new Map<string, ImageBitmap>();
const pending = new Map<string, Promise<ImageBitmap | null>>();
const listeners = new Set<() => void>();

/** Decoded photo if ready; otherwise starts loading it and returns null (redraw on onPhotoLoaded). */
export function photoBitmap(id: string): ImageBitmap | null {
  const b = bitmaps.get(id);
  if (b) return b;
  void loadPhoto(id);
  return null;
}

export function loadPhoto(id: string): Promise<ImageBitmap | null> {
  const hit = bitmaps.get(id);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(id);
  if (!p) {
    p = (async () => {
      const a = await getAsset(id);
      if (!a) return null;
      const bmp = await createImageBitmap(a.blob);
      bitmaps.set(id, bmp);
      listeners.forEach((fn) => fn());
      return bmp;
    })().catch(() => null);
    pending.set(id, p);
  }
  return p;
}

export function preloadPhotos(ids: Iterable<string>): Promise<unknown> {
  return Promise.all([...new Set(ids)].map(loadPhoto));
}

export function onPhotoLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Read an image file, respect its EXIF orientation, shrink it to at most 1600 px on the
 * long side and store it as a JPEG asset of the project. Returns the asset id.
 */
export async function importPhoto(file: File, projectId: string): Promise<string> {
  let src: ImageBitmap;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(/heic|heif/i.test(file.type + file.name)
      ? 'This browser cannot read HEIC photos. Export the photo as JPEG first (or use Safari).'
      : 'That file is not an image this browser can read.');
  }
  const k = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  src.close();
  const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the photo'))), 'image/jpeg', 0.88));
  const id = rid('a');
  await putAsset({ id, projectId, blob, w, h, createdAt: Date.now() });
  return id;
}

/** Draw `img` to fill the box (cover), with rounded corners. */
export function drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap | null, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  if (!img) {
    ctx.fillStyle = '#ccd0da';
    ctx.fillRect(x, y, w, h);
  } else {
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  ctx.restore();
}

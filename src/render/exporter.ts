// Frame-accurate video export. A hidden MapLibre instance is laid out at the
// exact output size; for every frame we set the camera, wait until every tile
// is loaded, composite map + overlay onto a 2D canvas and hand it to
// Mediabunny (WebCodecs, hardware-accelerated where available). No frame is
// ever captured half-loaded, and nothing leaves the machine.
import { Map as MlMap } from 'maplibre-gl';
import {
  BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, StreamTarget, WebMOutputFormat, canEncodeVideo,
  type VideoCodec,
} from 'mediabunny';
import { logicalSize, outputSize, type Scene } from '../core/model';
import { evaluate, runtime } from '../core/runtime';
import { loadCountries, visitedCountries } from '../map/countries';
import { attributionText, buildStyle } from '../map/style';
import { drawOverlay } from './overlay';
import { preloadPhotos } from './photos';
import { SIGN_FONT } from './signs';

export interface ExportProgress {
  frame: number;
  frames: number;
  fraction: number;
  /** Average milliseconds per frame spent waiting for the map, compositing and encoding. */
  ms: { map: number; draw: number; encode: number };
  codec?: string;
}

export interface ExportJob {
  scene: Scene;
  /** Where to write; when omitted the result is returned as a Blob. */
  writable?: FileSystemWritableFileStream;
  signal?: AbortSignal;
  onProgress?: (p: ExportProgress) => void;
  /** Human-readable status while not rendering frames (loading, paused…). */
  onStatus?: (msg: string) => void;
}

const HIDDEN_MSG = 'Paused — bring this tab back to the front to continue';

/**
 * Resolve when `ready()` is true. Browsers stop animation frames in hidden tabs,
 * and MapLibre needs them to load, so report that instead of hanging silently.
 */
function until(ready: () => boolean, poke: () => void, job: ExportJob, label: string, timeoutMs = 60000): Promise<void> {
  return new Promise((resolve, reject) => {
    let waited = 0, lastHidden = false;
    const tick = () => {
      if (job.signal?.aborted) return reject(new DOMException('Export cancelled', 'AbortError'));
      poke();
      if (ready()) return resolve();
      const hidden = document.visibilityState === 'hidden';
      if (hidden !== lastHidden) { job.onStatus?.(hidden ? HIDDEN_MSG : label); lastHidden = hidden; }
      if (!hidden) waited += 20;
      if (waited > timeoutMs) return reject(new Error(`Timed out while ${label.toLowerCase()} — check your internet connection (map tiles are needed).`));
      setTimeout(tick, 20);
    };
    tick();
  });
}

export function fileName(scene: Scene): string {
  const base = scene.name.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'scene';
  return `${base}.${scene.exp.fmt}`;
}

const GIF_MAX_SHORT = 540;

export function exportDims(scene: Scene): [number, number] {
  const [w, h] = outputSize(scene.ratio, scene.exp.res);
  if (scene.exp.fmt !== 'gif') return [w, h];
  const k = Math.min(1, GIF_MAX_SHORT / Math.min(w, h));
  const even = (n: number) => Math.round((n * k) / 2) * 2;
  return [even(w), even(h)];
}

export function exportFps(scene: Scene): number {
  return scene.exp.fmt === 'gif' ? Math.min(15, scene.exp.fps) : scene.exp.fps;
}

async function pickCodec(scene: Scene, w: number, h: number): Promise<VideoCodec> {
  const prefs: VideoCodec[] = scene.exp.fmt === 'mp4' ? ['avc', 'hevc', 'av1'] : ['vp9', 'av1', 'vp8'];
  for (const c of prefs) {
    if (await canEncodeVideo(c, { width: w, height: h, quality: QUALITY_HIGH, frameRate: scene.exp.fps })) return c;
  }
  throw new Error(`This browser cannot encode ${scene.exp.fmt.toUpperCase()} at ${w}×${h}. Try WebM, a lower resolution, or a Chromium-based browser.`);
}

export async function exportScene(job: ExportJob): Promise<Blob | null> {
  const { scene } = job;
  await document.fonts.load(`600 20px ${SIGN_FONT}`);
  // Every sign photo must be decoded before the first frame.
  await preloadPhotos(scene.signs.flatMap((g) => (g.photo ? [g.photo] : [])));
  const rt = runtime(scene);
  const [W, H] = exportDims(scene);
  const fps = exportFps(scene);
  const [lw] = logicalSize(scene.ratio);
  const scale = W / lw;
  const frames = Math.max(1, Math.ceil(rt.tm.T * fps));

  let countriesUrl: string | undefined, visited: string[] = [];
  if (scene.look.regions !== 'off') {
    const c = await loadCountries();
    countriesUrl = c.url;
    visited = visitedCountries(c.countries, rt.route.ll);
  }

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:${-W - 200}px;top:0;width:${W}px;height:${H}px;pointer-events:none;`;
  document.body.appendChild(host);
  const map = new MlMap({
    container: host,
    style: buildStyle(scene.look, { scale, countriesUrl, visited }),
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    pixelRatio: 1,
    maxCanvasSize: [8192, 8192],
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  });
  if (import.meta.env.DEV) (window as unknown as { __exportMap: MlMap }).__exportMap = map;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  // CPU-backed canvas: the software encoders read pixels from CPU memory, and
  // handing them a GPU-backed frame forces a slow cross-process readback.
  const ctx = out.getContext('2d', { willReadFrequently: true, alpha: false })!;
  const attribution = attributionText(scene.look);

  try {
    job.onStatus?.('Loading the map…');
    let loaded = false;
    map.once('load', () => { loaded = true; });
    await until(() => loaded, () => {}, job, 'Loading the map…');
    const zoomShift = Math.log2(W / lw);
    // Read the map's pixels straight from WebGL. Copying the WebGL canvas with
    // drawImage() makes Chromium wait on the compositor (~200 ms per frame);
    // readPixels is a direct GPU→CPU copy (~10 ms at 720p).
    const gl = map.getCanvas().getContext('webgl2') as WebGL2RenderingContext | null;
    const px = new Uint8ClampedArray(W * H * 4);
    const img = new ImageData(px, W, H);
    const grabMap = async () => {
      if (gl && gl.drawingBufferWidth === W && gl.drawingBufferHeight === H) {
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const bmp = await createImageBitmap(img, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
      } else {
        ctx.drawImage(map.getCanvas(), 0, 0, W, H);
      }
    };

    const ms = { map: 0, draw: 0, encode: 0 };
    let codecName: string | undefined;
    const report = (i: number) => job.onProgress?.({
      frame: i + 1, frames, fraction: (i + 1) / frames, codec: codecName,
      ms: { map: ms.map / (i + 1), draw: ms.draw / (i + 1), encode: ms.encode / (i + 1) },
    });
    const renderFrame = async (i: number) => {
      const t = i / fps;
      const cam = rt.camera.at(t);
      let t0 = performance.now();
      map.jumpTo({ center: cam.center, zoom: cam.zoom + zoomShift, bearing: cam.bearing, pitch: cam.pitch });
      // Frame-exact: never capture until every tile for this view is in.
      await until(() => !!map.isStyleLoaded() && map.areTilesLoaded(), () => map.redraw(), job, 'Loading map tiles…', 25000).catch((e) => {
        if (e instanceof DOMException) throw e; // cancelled
      });
      ms.map += performance.now() - t0;
      t0 = performance.now();
      await grabMap();
      drawOverlay({
        ctx, project: (lng, lat) => map.project([lng, lat]), scene, rt, frame: evaluate(scene, rt, t), scale,
        frameRect: { x: 0, y: 0, w: W, h: H }, attribution,
      });
      ms.draw += performance.now() - t0;
    };

    if (scene.exp.fmt === 'gif') return await encodeGif(renderFrame, ctx, W, H, fps, frames, report, ms, job.writable);

    const codec = await pickCodec(scene, W, H);
    codecName = codec;
    const target = job.writable ? new StreamTarget(job.writable as unknown as WritableStream) : new BufferTarget();
    const output = new Output({ format: scene.exp.fmt === 'mp4' ? new Mp4OutputFormat({ fastStart: job.writable ? false : 'in-memory' }) : new WebMOutputFormat(), target });
    const source = new CanvasSource(out, { codec, quality: QUALITY_HIGH });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();
    try {
      for (let i = 0; i < frames; i++) {
        await renderFrame(i);
        const t0 = performance.now();
        await source.add(i / fps, 1 / fps);
        ms.encode += performance.now() - t0;
        report(i);
      }
      await output.finalize();
    } catch (e) {
      await output.cancel().catch(() => {});
      throw e;
    }
    if (job.writable) { await job.writable.close().catch(() => {}); return null; }
    return new Blob([(target as BufferTarget).buffer!], { type: scene.exp.fmt === 'mp4' ? 'video/mp4' : 'video/webm' });
  } finally {
    map.remove();
    host.remove();
  }
}

async function encodeGif(
  renderFrame: (i: number) => Promise<void>, ctx: CanvasRenderingContext2D, W: number, H: number, fps: number, frames: number,
  report: (i: number) => void, ms: { encode: number }, writable?: FileSystemWritableFileStream,
): Promise<Blob | null> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < frames; i++) {
    await renderFrame(i);
    const t0 = performance.now();
    const { data } = ctx.getImageData(0, 0, W, H);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay });
    ms.encode += performance.now() - t0;
    report(i);
  }
  gif.finish();
  const blob = new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
  if (writable) { await writable.write(blob); await writable.close(); return null; }
  return blob;
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

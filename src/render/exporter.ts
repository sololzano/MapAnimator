// Frame-accurate video export. A hidden MapLibre instance is laid out at the
// exact output size; for every frame we set the camera, wait until every tile
// is loaded, composite map + overlay onto a 2D canvas and hand it to
// Mediabunny (WebCodecs, hardware-accelerated where available). No frame is
// ever captured half-loaded, and nothing leaves the machine.
import maplibregl from 'maplibre-gl';
import {
  BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, StreamTarget, WebMOutputFormat, canEncodeVideo,
  type VideoCodec,
} from 'mediabunny';
import { logicalSize, outputSize, type Scene } from '../core/model';
import { evaluate, runtime } from '../core/runtime';
import { loadCountries, visitedCountries } from '../map/countries';
import { attributionText, buildStyle } from '../map/style';
import { drawOverlay } from './overlay';
import { SIGN_FONT } from './signs';

export interface ExportProgress { frame: number; frames: number; fraction: number }

export interface ExportJob {
  scene: Scene;
  /** Where to write; when omitted the result is returned as a Blob. */
  writable?: FileSystemWritableFileStream;
  signal?: AbortSignal;
  onProgress?: (p: ExportProgress) => void;
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

function waitFor(map: maplibregl.Map, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      if (signal?.aborted) return reject(new DOMException('Export cancelled', 'AbortError'));
      map.redraw();
      if ((map.isStyleLoaded() && map.areTilesLoaded()) || performance.now() - t0 > 25000) return resolve();
      setTimeout(tick, 20);
    };
    tick();
  });
}

export async function exportScene(job: ExportJob): Promise<Blob | null> {
  const { scene, signal } = job;
  await document.fonts.load(`600 20px ${SIGN_FONT}`);
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
  const map = new maplibregl.Map({
    container: host,
    style: buildStyle(scene.look, { scale, countriesUrl, visited }),
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    pixelRatio: 1,
    maxCanvasSize: [8192, 8192],
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  });
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d', { willReadFrequently: scene.exp.fmt === 'gif' })!;
  const attribution = attributionText(scene.look);

  try {
    await new Promise<void>((res) => map.once('load', () => res()));
    const zoomShift = Math.log2(W / lw);

    const renderFrame = async (i: number) => {
      const t = i / fps;
      const cam = rt.camera.at(t);
      map.jumpTo({ center: cam.center, zoom: cam.zoom + zoomShift, bearing: cam.bearing, pitch: cam.pitch });
      await waitFor(map, signal);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(map.getCanvas(), 0, 0, W, H);
      drawOverlay({
        ctx, project: (lng, lat) => map.project([lng, lat]), scene, rt, frame: evaluate(scene, rt, t), scale,
        frameRect: { x: 0, y: 0, w: W, h: H }, attribution,
      });
      job.onProgress?.({ frame: i + 1, frames, fraction: (i + 1) / frames });
    };

    if (scene.exp.fmt === 'gif') return await encodeGif(renderFrame, ctx, W, H, fps, frames, job);

    const codec = await pickCodec(scene, W, H);
    const target = job.writable ? new StreamTarget(job.writable as unknown as WritableStream) : new BufferTarget();
    const output = new Output({ format: scene.exp.fmt === 'mp4' ? new Mp4OutputFormat({ fastStart: job.writable ? false : 'in-memory' }) : new WebMOutputFormat(), target });
    const source = new CanvasSource(out, { codec, quality: QUALITY_HIGH });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();
    try {
      for (let i = 0; i < frames; i++) {
        await renderFrame(i);
        await source.add(i / fps, 1 / fps);
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

async function encodeGif(renderFrame: (i: number) => Promise<void>, ctx: CanvasRenderingContext2D, W: number, H: number, fps: number, frames: number, job: ExportJob): Promise<Blob | null> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (let i = 0; i < frames; i++) {
    await renderFrame(i);
    const { data } = ctx.getImageData(0, 0, W, H);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay });
  }
  gif.finish();
  const blob = new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
  if (job.writable) { await job.writable.write(blob); await job.writable.close(); return null; }
  return blob;
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

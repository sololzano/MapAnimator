// Project files: a zip containing manifest.json, project.json and assets/<id>.jpg
// (sign photos). Plain .json project files are accepted too.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';
import { SCHEMA_VERSION, makeScene, normalizeProject, rid, signPointIndex, type Project, type Sign } from '../core/model';
import { MUSIC_MAX_BYTES } from '../render/audio';
import { getAsset, referencedAssets, type Asset } from './db';

export const PROJECT_EXT = '.chilaquil';

const num = z.number().refine(Number.isFinite);
const modeEnum = z.enum(['car', 'moto', 'walk', 'bike', 'bus', 'train', 'plane', 'boat', 'other']);
const point = z.object({
  id: z.string().optional(), lng: num, lat: num, name: z.string().max(200).optional(), time: num.optional(),
  mode: modeEnum.optional(), hidden: z.boolean().optional(),
});
const sign = z.object({
  id: z.string().optional(), pointId: z.string().optional(), lng: num.optional(), lat: num.optional(), dx: num.optional(), dy: num.optional(), title: z.string().max(200), sub: z.string().max(200),
  style: z.enum(['postcard', 'post', 'ticket', 'tag']), trigger: z.enum(['reach', 'pause', 'always']), pause: num, size: num,
  photo: z.string().max(64).optional(),
});
const scene = z.object({
  id: z.string().optional(), name: z.string().max(200), ratio: z.enum(['16:9', '9:16', '1:1', '4:5']), smooth: z.boolean().optional(), travel: modeEnum.optional(),
  points: z.array(point).max(200000), signs: z.array(sign).max(5000),
  look: z.record(z.string(), z.unknown()).optional(),
  hud: z.object({
    date: z.boolean(), distance: z.boolean(), dateStyle: z.enum(['date', 'day', 'both']), units: z.enum(['km', 'mi']), corner: z.enum(['tl', 'tr', 'bl', 'br']),
  }).partial().optional(), cam: z.record(z.string(), z.unknown()).optional(), exp: z.record(z.string(), z.unknown()).optional(),
});
const projectSchema = z.object({ name: z.string().max(200), scenes: z.array(scene).min(1).max(500) });

/** Zip the project with its sign photos (JPEGs are stored, not recompressed). */
export async function projectToFile(p: Project): Promise<Blob> {
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    'manifest.json': strToU8(JSON.stringify({ app: 'ElChilaquilWasHere', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString() })),
    'project.json': strToU8(JSON.stringify(p)),
  };
  for (const id of referencedAssets(p)) {
    const a = await getAsset(id);
    if (a) files[`assets/${id}.${a.kind === 'audio' ? 'audio' : 'jpg'}`] = [new Uint8Array(await a.blob.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

const MAX_ASSET_BYTES = 15 * 1024 * 1024;

/** MP3 (ID3 or frame sync), MP4/M4A (ftyp), Ogg, WAV, FLAC, WebM/Matroska. */
const isAudio = (b: Uint8Array) =>
  (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) ||
  (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) ||
  (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) ||
  (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41) ||
  (b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) ||
  (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3);

const musicSchema = z.object({
  asset: z.string().max(64), name: z.string().max(200), duration: num, volume: num, offset: num, fadeIn: num, fadeOut: num,
});

/** Validated soundtrack with its asset re-linked; null when absent or its audio isn't in the file. */
function musicOf(exp: unknown, ids: Map<string, string>) {
  const r = musicSchema.safeParse((exp as { music?: unknown } | undefined)?.music);
  if (!r.success) return null;
  const asset = ids.get(r.data.asset);
  return asset ? { ...r.data, asset, volume: Math.max(0, Math.min(1, r.data.volume)) } : null;
}
const isImage = (b: Uint8Array) =>
  (b[0] === 0xff && b[1] === 0xd8) || // JPEG
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || // PNG
  (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45); // WebP

async function imageSize(blob: Blob): Promise<[number, number] | null> {
  try { const b = await createImageBitmap(blob); const s: [number, number] = [b.width, b.height]; b.close(); return s; } catch { return null; }
}

export function projectFileName(p: Project): string {
  return (p.name.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'project') + PROJECT_EXT;
}

const kf = z.object({ p: num, z: num });
const camView = z.object({ center: z.tuple([num, num]), zoom: num, bearing: num, pitch: num });

function viewOf(cam: unknown) {
  const r = camView.safeParse((cam as { view?: unknown } | undefined)?.view);
  return r.success ? r.data : null;
}

function kfsOf(cam: unknown) {
  const r = z.array(kf).safeParse((cam as { kfs?: unknown } | undefined)?.kfs);
  return r.success ? r.data.map((k) => ({ id: rid('k'), p: Math.max(0, Math.min(1, k.p)), z: k.z })) : [];
}

/**
 * Parse and validate an untrusted project file. Always returns a fresh copy with new ids,
 * plus its photos (to be stored by the caller); only real image files are accepted.
 */
export async function projectFromFile(file: File): Promise<{ project: Project; assets: Asset[] }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let json: unknown;
  const photoIds = new Map<string, string>(), audioIds = new Map<string, string>();
  const pendingAssets: { id: string; blob: Blob }[] = [], audioAssets: { id: string; blob: Blob }[] = [];
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const files = unzipSync(buf, {
      filter: (f) => f.name === 'project.json'
        || (/^assets\/[\w-]{1,64}\.jpg$/.test(f.name) && f.originalSize <= MAX_ASSET_BYTES)
        || (/^assets\/[\w-]{1,64}\.audio$/.test(f.name) && f.originalSize <= MUSIC_MAX_BYTES),
    });
    if (!files['project.json']) throw new Error('That file has no project inside.');
    json = JSON.parse(strFromU8(files['project.json']));
    for (const [name, data] of Object.entries(files)) {
      if (!name.startsWith('assets/')) continue;
      const audio = name.endsWith('.audio');
      if (audio ? !isAudio(data) : !isImage(data)) continue;
      const id = rid('a');
      (audio ? audioIds : photoIds).set(name.slice(7, name.lastIndexOf('.')), id);
      if (audio) audioAssets.push({ id, blob: new Blob([data as Uint8Array<ArrayBuffer>]) });
      else pendingAssets.push({ id, blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }) });
    }
  } else {
    json = JSON.parse(strFromU8(buf));
  }
  const raw = (json as { project?: unknown }).project ?? json;
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) throw new Error('That file is not an ElChilaquilWasHere project.');
  const now = Date.now();
  const projectId = rid('p');
  const assets: Asset[] = [];
  for (const a of pendingAssets) {
    const size = await imageSize(a.blob);
    if (size) assets.push({ id: a.id, projectId, blob: a.blob, w: size[0], h: size[1], createdAt: now });
    else for (const [k, v] of photoIds) if (v === a.id) photoIds.delete(k);
  }
  for (const a of audioAssets) assets.push({ id: a.id, projectId, blob: a.blob, w: 0, h: 0, createdAt: now, kind: 'audio' });
  const project = normalizeProject({
    schemaVersion: SCHEMA_VERSION, id: projectId, name: parsed.data.name, createdAt: now, updatedAt: now,
    scenes: parsed.data.scenes.map((s) => {
      const base = makeScene(s.name);
      const idMap = new Map<string, string>();
      const points = s.points.map((q) => { const id = rid('r'); if (q.id) idMap.set(q.id, id); return { ...q, id }; });
      return {
        ...base, ratio: s.ratio, smooth: s.smooth ?? true, travel: s.travel ?? base.travel,
        points,
        signs: points.length ? s.signs.map(({ lng, lat, pointId, photo, ...g }) => ({
          ...g, id: rid('g'), dx: g.dx ?? 110, dy: g.dy ?? -70,
          photo: photo ? photoIds.get(photo) : undefined,
          // Re-link to the renamed point; legacy signs (free position) attach to their nearest point.
          pointId: (pointId && idMap.get(pointId)) || points[signPointIndex(points, { pointId: '', lng, lat } as Sign)].id,
        })) : [],
        look: { ...base.look, ...(s.look as object) },
        hud: { ...base.hud, ...s.hud },
        cam: { ...base.cam, ...(s.cam as object), kfs: kfsOf(s.cam), view: viewOf(s.cam) },
        exp: { ...base.exp, ...(s.exp as object), music: musicOf(s.exp, audioIds) },
      };
    }),
  });
  return { project, assets };
}
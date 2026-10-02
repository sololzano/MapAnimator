// Project files: a zip containing manifest.json + project.json (room for
// photos/assets later). Plain .json project files are accepted too.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';
import { SCHEMA_VERSION, makeScene, rid, type Project } from '../core/model';

export const PROJECT_EXT = '.chilaquil';

const num = z.number().refine(Number.isFinite);
const point = z.object({ id: z.string().optional(), lng: num, lat: num, name: z.string().optional(), time: num.optional() });
const sign = z.object({
  id: z.string().optional(), lng: num, lat: num, dx: num.optional(), dy: num.optional(), title: z.string().max(200), sub: z.string().max(200),
  style: z.enum(['postcard', 'post', 'ticket', 'tag']), trigger: z.enum(['reach', 'pause', 'always']), pause: num, size: num,
});
const scene = z.object({
  id: z.string().optional(), name: z.string().max(200), ratio: z.enum(['16:9', '9:16', '1:1', '4:5']), smooth: z.boolean().optional(),
  points: z.array(point).max(200000), signs: z.array(sign).max(5000),
  look: z.record(z.string(), z.unknown()).optional(), cam: z.record(z.string(), z.unknown()).optional(), exp: z.record(z.string(), z.unknown()).optional(),
});
const projectSchema = z.object({ name: z.string().max(200), scenes: z.array(scene).min(1).max(500) });

export function projectToFile(p: Project): Blob {
  const files = {
    'manifest.json': strToU8(JSON.stringify({ app: 'ElChilaquilWasHere', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString() })),
    'project.json': strToU8(JSON.stringify(p)),
  };
  return new Blob([zipSync(files, { level: 6 }) as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

export function projectFileName(p: Project): string {
  return (p.name.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'project') + PROJECT_EXT;
}

const kf = z.object({ p: num, z: num });

function kfsOf(cam: unknown) {
  const r = z.array(kf).safeParse((cam as { kfs?: unknown } | undefined)?.kfs);
  return r.success ? r.data.map((k) => ({ id: rid('k'), p: Math.max(0, Math.min(1, k.p)), z: k.z })) : [];
}

/** Parse and validate an untrusted project file. Always returns a fresh copy with new ids. */
export async function projectFromFile(file: File): Promise<Project> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let json: unknown;
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const files = unzipSync(buf, { filter: (f) => f.name === 'project.json' });
    if (!files['project.json']) throw new Error('That file has no project inside.');
    json = JSON.parse(strFromU8(files['project.json']));
  } else {
    json = JSON.parse(strFromU8(buf));
  }
  const raw = (json as { project?: unknown }).project ?? json;
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) throw new Error('That file is not an ElChilaquilWasHere project.');
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION, id: rid('p'), name: parsed.data.name, createdAt: now, updatedAt: now,
    scenes: parsed.data.scenes.map((s) => {
      const base = makeScene(s.name);
      return {
        ...base, ratio: s.ratio, smooth: s.smooth ?? true,
        points: s.points.map((q) => ({ ...q, id: rid('r') })),
        signs: s.signs.map((g) => ({ ...g, id: rid('g'), dx: g.dx ?? 110, dy: g.dy ?? -70 })),
        look: { ...base.look, ...(s.look as object) },
        cam: { ...base.cam, ...(s.cam as object), kfs: kfsOf(s.cam) },
        exp: { ...base.exp, ...(s.exp as object) },
      };
    }),
  };
}

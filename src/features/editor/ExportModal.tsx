import { useEffect, useRef, useState } from 'react';
import type { Scene } from '../../core/model';
import { downloadBlob, exportDims, exportFps, exportScene, fileName } from '../../render/exporter';
import { Button, Modal } from '../../ui/controls';

type RowState = { status: 'waiting' | 'rendering' | 'done' | 'error'; fraction: number; note?: string };

interface FsWindow {
  showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle>;
  showDirectoryPicker?: (o?: object) => Promise<FileSystemDirectoryHandle>;
}

const MIME: Record<Scene['exp']['fmt'], [string, string]> = { mp4: ['video/mp4', '.mp4'], webm: ['video/webm', '.webm'], gif: ['image/gif', '.gif'] };

/**
 * Pick where files go *before* rendering (pickers need the click's user
 * activation). Chromium: save dialog / folder. Elsewhere: browser downloads.
 */
export async function chooseTargets(scenes: Scene[]): Promise<(() => Promise<FileSystemWritableFileStream | undefined>) | null> {
  const w = window as unknown as FsWindow;
  try {
    if (scenes.length === 1 && w.showSaveFilePicker) {
      const s = scenes[0], [mime, ext] = MIME[s.exp.fmt];
      const h = await w.showSaveFilePicker({ suggestedName: fileName(s), types: [{ description: 'Video', accept: { [mime]: [ext] } }] });
      return async () => h.createWritable();
    }
    if (scenes.length > 1 && w.showDirectoryPicker) {
      const dir = await w.showDirectoryPicker({ mode: 'readwrite' });
      const used = new Set<string>();
      let i = 0;
      return async () => {
        const s = scenes[i++];
        let name = fileName(s), n = 2;
        while (used.has(name)) name = fileName(s).replace(/(\.\w+)$/, `-${n++}$1`);
        used.add(name);
        return (await dir.getFileHandle(name, { create: true })).createWritable();
      };
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
  return async () => undefined;
}

export function ExportModal({ scenes, next, onClose }: { scenes: Scene[]; next: () => Promise<FileSystemWritableFileStream | undefined>; onClose: () => void }) {
  const [rows, setRows] = useState<RowState[]>(() => scenes.map(() => ({ status: 'waiting', fraction: 0 })));
  const [done, setDone] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // Start exactly once. React StrictMode mounts effects twice in development; the
  // export must not be tied to the effect's cleanup (that used to cancel it
  // immediately). Only the Cancel button or closing the dialog aborts it.
  useEffect(() => {
    if (abort.current) return;
    const ctl = (abort.current = new AbortController());
    const upd = (i: number, r: Partial<RowState>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...r } : x)));
    (async () => {
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        if (ctl.signal.aborted) { upd(i, { status: 'error', note: 'cancelled' }); continue; }
        upd(i, { status: 'rendering', note: 'preparing…' });
        try {
          const writable = await next();
          const t0 = performance.now();
          const blob = await exportScene({
            scene: s, writable, signal: ctl.signal,
            onStatus: (msg) => upd(i, { note: msg }),
            onProgress: (p) => {
              const el = (performance.now() - t0) / 1000, eta = p.fraction > 0.02 ? el / p.fraction - el : NaN;
              upd(i, { fraction: p.fraction, note: `${p.codec ? p.codec.toUpperCase() + ' · ' : ''}frame ${p.frame}/${p.frames}${Number.isFinite(eta) ? ` · ~${Math.ceil(eta)} s left` : ''}` });
            },
          });
          if (blob) downloadBlob(blob, fileName(s));
          upd(i, { status: 'done', fraction: 1, note: `saved · ${fileName(s)}` });
        } catch (e) {
          const aborted = ctl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError');
          if (!aborted) console.error(`[export] ${s.name}:`, e);
          upd(i, { status: 'error', note: aborted ? 'cancelled' : e instanceof Error ? e.message : String(e) });
        }
      }
      setDone(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors = rows.map((r, i) => ({ r, s: scenes[i] })).filter(({ r }) => r.status === 'error' && r.note !== 'cancelled');
  const allDone = done;
  const title = allDone ? (rows.some((r) => r.status === 'error') ? 'Export finished with problems' : 'Export complete') : `Rendering ${scenes.length > 1 ? scenes.length + ' scenes' : '1 scene'}…`;

  return (
    <Modal title={title} width={540}>
      <div className="flex flex-col gap-3">
        {scenes.map((s, i) => {
          const r = rows[i], [w, h] = exportDims(s);
          return (
            <div key={s.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-3 text-[13.5px]">
                <span className="truncate font-semibold">{s.name}</span>
                <span className={'num truncate text-[11.5px] ' + (r.status === 'error' ? 'text-red' : 'text-muted')}>
                  {r.note ?? `${w}×${h} · ${exportFps(s)} fps · ${s.exp.fmt.toUpperCase()}`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-panel-2">
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${r.fraction * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {errors.length > 0 && (
        <div className="flex flex-col gap-1 rounded-[10px] border border-red/40 bg-card px-3.5 py-3 text-[12.5px] leading-normal text-red">
          {errors.map(({ r, s }) => <div key={s.id}><b>{s.name}:</b> {r.note}</div>)}
        </div>
      )}
      {!allDone && <div className="text-[12px] text-muted">Frames render only when every map tile has loaded, so nothing comes out blurry. Keep this tab in front — browsers slow down hidden tabs.</div>}
      <div className="flex justify-end">
        <Button className="h-10 px-5 font-semibold" onClick={() => { abort.current?.abort(); onClose(); }}>{allDone ? 'Done' : 'Cancel'}</Button>
      </div>
    </Modal>
  );
}

import { useEffect, useRef, useState } from 'react';
import { RATIOS, logicalSize, type Ratio, type Scene } from '../../core/model';
import { parseGpx, parseTimelineFile, type RouteImport } from '../../importers';
import type { ParsedTimeline } from '../../importers/timeline';
import { goProjects } from '../../nav';
import { downloadBlob } from '../../render/exporter';
import { projectFileName, projectToFile } from '../../storage/projectFile';
import { currentScene, useApp, type Step } from '../../state/store';
import { Button, cx } from '../../ui/controls';
import { Icon } from '../../ui/icons';
import { ThemeToggle } from '../projects/ProjectsPage';
import { stageBus } from './bus';
import { ExportModal, chooseTargets } from './ExportModal';
import { GpxImportModal, TimelineImportModal, type ImportResult } from './ImportModals';
import { pendingImport } from './pending';
import { Sidebar, StepNav } from './Sidebar';
import { Stage } from './Stage';
import { Timeline, togglePlay, usePlayback } from './Timeline';

type ImportState =
  | { kind: 'gpx'; data: RouteImport; name: string }
  | { kind: 'json'; data: ParsedTimeline; name: string }
  | { kind: 'loading'; name: string }
  | null;

function RatioPicker() {
  const scene = useApp((s) => currentScene(s)!);
  const update = useApp((s) => s.updateScene);
  return (
    <div className="flex gap-0.5 rounded-[10px] bg-panel p-[3px]">
      {RATIOS.map((r) => {
        const [w, h] = logicalSize(r), gh = w >= h ? 9 : 13, gw = Math.round((gh * w) / h);
        return (
          <button key={r} title={r} onClick={() => update((s) => { s.ratio = r as Ratio; })}
            className={cx('num flex h-[30px] items-center gap-[7px] rounded-[7px] border-0 px-2.5 text-[12px] font-medium', scene.ratio === r ? 'bg-card text-text shadow-[0_1px_3px_rgba(0,0,0,.15)]' : 'bg-transparent text-text-2 hover:text-text')}>
            <span className="block rounded-[2px] border-[1.5px] border-current" style={{ width: gw, height: gh }} />{r}
          </button>
        );
      })}
    </div>
  );
}

function SceneBar() {
  const project = useApp((s) => s.project!);
  const si = useApp((s) => s.si);
  const setSceneIndex = useApp((s) => s.setSceneIndex);
  const addScene = useApp((s) => s.addScene);
  const removeScene = useApp((s) => s.removeScene);
  const update = useApp((s) => s.updateScene);
  return (
    <div className="flex h-10 flex-none items-center gap-1.5 overflow-x-auto border-b border-line bg-panel px-3.5">
      <span className="eyebrow mr-1.5 text-[10.5px]!">Scenes</span>
      {project.scenes.map((s, i) => {
        const active = i === si;
        return (
          <div key={s.id} onClick={() => !active && setSceneIndex(i)}
            className={cx('flex h-7 cursor-pointer items-center gap-1.5 rounded-lg pr-1.5 pl-3 whitespace-nowrap', active ? 'border border-accent bg-card shadow-[0_1px_3px_rgba(0,0,0,.15)]' : 'border border-transparent hover:bg-panel-2')}>
            {active
              ? <input value={s.name} onChange={(e) => update((x) => { x.name = e.target.value; }, 'scene-name')} className="border-0 bg-transparent p-0 text-[13px] font-semibold text-text outline-none" style={{ width: `${Math.max(6, s.name.length + 1)}ch` }} />
              : <span className="text-[13px] text-text-2">{s.name}</span>}
            {active && project.scenes.length > 1 && (
              <button title="Delete scene" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete scene “${s.name}”?`)) removeScene(i); }}
                className="grid h-5 w-5 place-items-center rounded-[5px] border-0 bg-transparent p-0 text-muted hover:bg-panel-2 hover:text-text"><Icon name="x" size={12} /></button>
            )}
          </div>
        );
      })}
      <button onClick={() => addScene(false)} className="h-7 rounded-lg border border-dashed border-line-x bg-transparent px-2.5 text-[13px] whitespace-nowrap text-text-2 hover:bg-panel-2">+ Scene</button>
      <button onClick={() => addScene(true)} className="h-7 rounded-lg border-0 bg-transparent px-2.5 text-[13px] whitespace-nowrap text-text-2 hover:bg-panel-2">Duplicate</button>
      <div className="flex-1" />
      <span className="text-[12px] whitespace-nowrap text-muted">Each scene is independent — export one or all</span>
    </div>
  );
}

function TopBar({ onExportStep }: { onExportStep: () => void }) {
  const project = useApp((s) => s.project!);
  const rename = useApp((s) => s.renameProject);
  return (
    <div className="flex h-[52px] flex-none items-center gap-4 border-b border-line px-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Button className="h-[34px] flex-none px-3" onClick={goProjects}><Icon name="back" size={15} />Projects</Button>
        <div className="h-5 w-px bg-line" />
        <input value={project.name} onChange={(e) => rename(e.target.value)} aria-label="Project name"
          className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-[16px] font-semibold tracking-[-0.015em] text-text outline-none" />
        <span className="flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-muted"><span className="h-1.5 w-1.5 rounded-full bg-green" />saved locally</span>
      </div>
      <StepNav />
      <div className="flex flex-1 items-center justify-end gap-2.5">
        <RatioPicker />
        <ThemeToggle />
        <button title="Download project file" onClick={() => downloadBlob(projectToFile(project), projectFileName(project))}
          className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-line bg-card hover:bg-panel"><Icon name="download" size={16} /></button>
        <Button variant="primary" className="h-[34px] px-4" onClick={onExportStep}>Export</Button>
      </div>
    </div>
  );
}

export function Editor() {
  const set = useApp((s) => s.set);
  const say = useApp((s) => s.say);
  const update = useApp((s) => s.updateScene);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<ImportState>(null);
  const [exp, setExp] = useState<{ scenes: Scene[]; next: () => Promise<FileSystemWritableFileStream | undefined> } | null>(null);
  const acceptRef = useRef('.gpx');
  usePlayback();

  const goStep = (n: Step) => set({ step: n, playing: false, tm: n >= 4 ? 0 : -1, sel: -1 });

  const pickFile = (kind: 'gpx' | 'json') => {
    acceptRef.current = kind === 'gpx' ? '.gpx,.xml,.kml' : '.json';
    if (fileRef.current) { fileRef.current.accept = acceptRef.current; fileRef.current.click(); }
  };

  useEffect(() => {
    if (pendingImport.kind) { const k = pendingImport.kind; pendingImport.kind = null; pickFile(k); }
  }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      if (/\.json$/i.test(f.name)) {
        setImp({ kind: 'loading', name: f.name });
        const data = await parseTimelineFile(f);
        if (!data.samples.length) throw new Error('No locations found in that file.');
        setImp({ kind: 'json', data, name: f.name });
      } else {
        setImp({ kind: 'gpx', data: parseGpx(await f.text(), /\.kml$/i.test(f.name)), name: f.name });
      }
    } catch (e) {
      setImp(null);
      say(e instanceof Error ? e.message : 'Could not read that file');
    }
  };

  const applyImport = (r: ImportResult) => {
    update((s) => { s.points = r.points; if (r.signs.length) s.signs = r.signs; });
    setImp(null);
    set({ sel: -1, tm: -1, tool: 'edit' });
    say(`Imported ${r.points.length} points${r.signs.length ? ` · ${r.signs.length} stops became signs` : ''}`);
    setTimeout(() => stageBus.emit('fit'), 50);
  };

  const startExport = async (all: boolean) => {
    const st = useApp.getState();
    const scenes = (all ? st.project!.scenes : [currentScene(st)!]).filter((s) => s.points.length >= 2);
    if (!scenes.length) { say(all ? 'No scene has a route yet' : 'Draw a route with at least 2 points first'); return; }
    set({ playing: false });
    try {
      const next = await chooseTargets(scenes);
      if (next) setExp({ scenes, next });
    } catch (e) {
      say(e instanceof Error ? e.message : 'Could not open the save dialog');
    }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tg = (e.target as HTMLElement).tagName;
      if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || document.querySelector('[role=dialog]')) return;
      const st = useApp.getState(), mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.redo(); return; }
      if (mod) return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.step === 1 && st.sel >= 0) { const i = st.sel; st.updateScene((s) => { s.points.splice(i, 1); }); st.set({ sel: -1 }); }
        if (st.step === 3 && st.selSign) { const id = st.selSign; st.updateScene((s) => { s.signs = s.signs.filter((g) => g.id !== id); }); st.set({ selSign: null }); }
      } else if (/^[1-5]$/.test(e.key)) goStep(Number(e.key) as Step);
      else if (e.key === 'f') stageBus.emit('fit');
      else if (e.key === 'Escape') st.set({ sel: -1, selSign: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      <input ref={fileRef} type="file" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <TopBar onExportStep={() => goStep(5)} />
      <SceneBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar onImport={pickFile} onExport={(all) => void startExport(all)} />
        <main className="flex min-w-0 flex-1 flex-col">
          <Stage onImport={pickFile} />
          <Timeline />
        </main>
      </div>
      {imp?.kind === 'loading' && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-(--scrim)">
          <div className="rounded-2xl bg-bg px-7 py-5 text-[14px] shadow-(--shadow)">Reading <b>{imp.name}</b>… (on this device)</div>
        </div>
      )}
      {imp?.kind === 'gpx' && <GpxImportModal data={imp.data} fileName={imp.name} onDone={applyImport} onCancel={() => setImp(null)} />}
      {imp?.kind === 'json' && <TimelineImportModal tl={imp.data} fileName={imp.name} onDone={applyImport} onCancel={() => setImp(null)} />}
      {exp && <ExportModal scenes={exp.scenes} next={exp.next} onClose={() => setExp(null)} />}
    </div>
  );
}

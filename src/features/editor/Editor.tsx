import { useEffect, useRef, useState } from 'react';
import { RATIOS, logicalSize, removePoint, type Ratio, type Scene } from '../../core/model';
import { kmzToKml, parseGpx, parseTimelineFile, type RouteImport } from '../../importers';
import type { ParsedTimeline } from '../../importers/timeline';
import { goProjects } from '../../nav';
import { currentScene, useApp, type Step } from '../../state/store';
import { Button, cx } from '../../ui/controls';
import { Icon } from '../../ui/icons';
import { AboutDialog } from '../about/AboutPage';
import { SupportModal } from '../projects/SupportModal';
import { ThemeToggle } from '../projects/ProjectsPage';
import { stageBus } from './bus';
import { ExportModal, chooseTargets } from './ExportModal';
import { GpxImportModal, TimelineImportModal, type ImportResult } from './ImportModals';
import { pendingImport } from './pending';
import { Sidebar, StepNav } from './Sidebar';
import { Stage } from './Stage';
import { Timeline, togglePlay, usePlayback, useSoundtrack } from './Timeline';

type ImportState =
  | { kind: 'gpx'; data: RouteImport; name: string }
  | { kind: 'json'; data: ParsedTimeline; name: string }
  | { kind: 'loading'; name: string }
  | null;

function RatioPicker() {
  const scene = useApp((s) => currentScene(s)!);
  const update = useApp((s) => s.updateScene);
  return (
    <div className="ratio-picker flex gap-0.5 rounded-[10px] bg-panel p-[3px]" role="group" aria-label="Video aspect ratio">
      {RATIOS.map((r) => {
        const [w, h] = logicalSize(r), gh = w >= h ? 9 : 13, gw = Math.round((gh * w) / h);
        return (
          <button key={r} title={`${r} video`} aria-label={`${r} video ratio`} aria-pressed={scene.ratio === r} onClick={() => update((s) => { s.ratio = r as Ratio; })}
            className={cx('num flex h-[30px] items-center gap-[7px] rounded-[7px] border-0 px-2.5 text-[12px] font-medium', scene.ratio === r ? 'bg-card text-text shadow-[0_1px_3px_rgba(0,0,0,.15)]' : 'bg-transparent text-text-2 hover:text-text')}>
            <span className="block rounded-[2px] border-[1.5px] border-current" style={{ width: gw, height: gh }} /><span className={scene.ratio === r ? '' : 'max-[1180px]:hidden'}>{r}</span>
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
    <div className="scene-bar flex h-11 flex-none items-center gap-1.5 overflow-x-auto border-b border-line bg-panel px-3.5">
      <span className="eyebrow mr-1.5 text-[10.5px]!">Scenes</span>
      {project.scenes.map((s, i) => {
        const active = i === si;
        return (
          <div key={s.id}
            className={cx('flex h-7 cursor-pointer items-center gap-1.5 rounded-lg pr-1.5 pl-3 whitespace-nowrap', active ? 'border border-accent bg-card shadow-[0_1px_3px_rgba(0,0,0,.15)]' : 'border border-transparent hover:bg-panel-2')}>
            {active
              ? <input aria-label="Scene name" value={s.name} onChange={(e) => update((x) => { x.name = e.target.value; }, 'scene-name')} className="max-w-[200px] border-0 bg-transparent p-0 text-[13px] font-semibold text-text" style={{ width: `${Math.max(6, s.name.length + 1)}ch` }} />
              : <button onClick={() => setSceneIndex(i)} className="max-w-[200px] truncate bg-transparent text-[13px] text-text-2" title={`Open scene: ${s.name}`}>{s.name}</button>}
            {active && project.scenes.length > 1 && (
              <button title="Delete scene" aria-label={`Delete scene ${s.name}`} onClick={(e) => { e.stopPropagation(); if (confirm(`Delete scene “${s.name}”?`)) removeScene(i); }}
                className="grid h-5 w-5 place-items-center rounded-[5px] border-0 bg-transparent p-0 text-muted hover:bg-panel-2 hover:text-text"><Icon name="x" size={12} /></button>
            )}
          </div>
        );
      })}
      <button onClick={() => addScene(false)} className="h-7 rounded-lg border border-dashed border-line-x bg-transparent px-2.5 text-[13px] whitespace-nowrap text-text-2 hover:bg-panel-2">+ Scene</button>
      <button title="Duplicate current scene" onClick={() => addScene(true)} className="h-7 rounded-lg border-0 bg-transparent px-2.5 text-[13px] whitespace-nowrap text-text-2 hover:bg-panel-2">Duplicate</button>
      <div className="flex-1" />
      <span className="hidden text-[12px] whitespace-nowrap text-muted min-[1200px]:inline">{project.scenes.length} {project.scenes.length === 1 ? 'scene' : 'scenes'}</span>
    </div>
  );
}

function TopBar({ onExportStep }: { onExportStep: () => void }) {
  const project = useApp((s) => s.project!);
  const rename = useApp((s) => s.renameProject);
  const [dialog, setDialog] = useState<'about' | 'support' | null>(null);
  const aboutButton = useRef<HTMLButtonElement>(null);
  const closeDialog = () => { setDialog(null); aboutButton.current?.focus(); };
  return (
    <header className="editor-topbar flex min-h-[56px] flex-none items-center gap-3 border-b border-line px-3.5 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Button className="h-[34px] flex-none px-3" onClick={goProjects}><Icon name="back" size={15} />Projects</Button>
        <div className="h-5 w-px bg-line" />
        <input value={project.name} onChange={(e) => rename(e.target.value)} aria-label="Project name"
          className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-[16px] font-semibold tracking-[-0.015em] text-text" />
        <span className="flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-muted max-[1100px]:hidden"><span className="h-1.5 w-1.5 rounded-full bg-green" />saved locally</span>
      </div>
      <div className="editor-actions flex items-center justify-end gap-2">
        <RatioPicker />
        <button ref={aboutButton} title="About ElChilaquilWasHere" aria-label="About ElChilaquilWasHere" onClick={() => setDialog('about')}
          className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-line bg-card hover:bg-panel"><Icon name="info" size={16} /></button>
        <ThemeToggle />
        <Button variant="primary" className="h-[34px] px-4" onClick={onExportStep}>Export video</Button>
      </div>
      {dialog === 'about' && <AboutDialog onClose={closeDialog} onSupport={() => setDialog('support')} />}
      {dialog === 'support' && <SupportModal onClose={closeDialog} />}
    </header>
  );
}

export function Editor() {
  const hasRoute = useApp((s) => (currentScene(s)?.points.length ?? 0) > 0);
  const set = useApp((s) => s.set);
  const say = useApp((s) => s.say);
  const update = useApp((s) => s.updateScene);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<ImportState>(null);
  const [exp, setExp] = useState<{ scenes: Scene[]; next: () => Promise<FileSystemWritableFileStream | undefined> } | null>(null);
  const acceptRef = useRef('.gpx');
  usePlayback();
  useSoundtrack();

  const goStep = (n: Step) => set({ step: n, playing: false, tm: n >= 4 ? 0 : -1, sel: -1, selSign: null });

  const pickFile = (kind: 'gpx' | 'json') => {
    acceptRef.current = kind === 'gpx' ? '.gpx,.xml,.kml,.kmz' : '.json';
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
        const text = /\.kmz$/i.test(f.name) ? kmzToKml(new Uint8Array(await f.arrayBuffer())) : await f.text();
        setImp({ kind: 'gpx', data: parseGpx(text, /\.km[lz]$/i.test(f.name)), name: f.name });
      }
    } catch (e) {
      setImp(null);
      say(e instanceof Error ? e.message : 'Could not read that file');
    }
  };

  const applyImport = (r: ImportResult) => {
    update((s) => { s.points = r.points; s.signs = r.signs; });
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
        if (st.step === 1 && st.sel >= 0) { const i = st.sel; st.updateScene((s) => removePoint(s, i)); st.set({ sel: -1 }); }
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
    <div className="editor-shell absolute inset-0 flex flex-col bg-bg">
      <input ref={fileRef} type="file" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <TopBar onExportStep={() => goStep(5)} />
      <div className="editor-workflow flex-none border-b border-line bg-bg px-3.5 py-1.5"><StepNav /></div>
      <SceneBar />
      <div className="editor-body flex min-h-0 flex-1">
        <Sidebar onImport={pickFile} onExport={(all) => void startExport(all)} />
        <main className="editor-preview flex min-w-0 flex-1 flex-col" aria-label="Map and animation preview">
          <Stage />
          <Timeline />
        </main>
      </div>
      {imp?.kind === 'loading' && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-(--scrim)">
          <div role="status" className="rounded-2xl bg-bg px-7 py-5 text-[14px] shadow-(--shadow)">Reading <b>{imp.name}</b>… (on this device)</div>
        </div>
      )}
      {imp?.kind === 'gpx' && <GpxImportModal replacing={hasRoute} data={imp.data} fileName={imp.name} onDone={applyImport} onCancel={() => setImp(null)} />}
      {imp?.kind === 'json' && <TimelineImportModal replacing={hasRoute} tl={imp.data} fileName={imp.name} onDone={applyImport} onCancel={() => setImp(null)} />}
      {exp && <ExportModal scenes={exp.scenes} next={exp.next} onClose={() => setExp(null)} />}
    </div>
  );
}

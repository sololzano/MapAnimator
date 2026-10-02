import { useEffect, useRef, useState } from 'react';
import { goProject } from '../../nav';
import { toMerc } from '../../core/geo';
import { RATIOS, sampleProject, type Project, type Ratio } from '../../core/model';
import { mapTheme } from '../../map/themes';
import { downloadBlob } from '../../render/exporter';
import { storageInfo } from '../../storage/db';
import { PROJECT_EXT, projectFileName, projectFromFile, projectToFile } from '../../storage/projectFile';
import { useApp } from '../../state/store';
import { Button, Modal, PillChoice, TextField, cx } from '../../ui/controls';
import { Icon, Logo } from '../../ui/icons';
import { pendingImport, type StartWith } from '../editor/pending';

function ago(ts: number): string {
  const d = (Date.now() - ts) / 1000;
  if (d < 90) return 'just now';
  if (d < 3600) return Math.round(d / 60) + ' min ago';
  if (d < 86400) return Math.round(d / 3600) + ' h ago';
  return Math.round(d / 86400) + ' d ago';
}

function bytes(n: number): string {
  if (n < 1e6) return Math.max(1, Math.round(n / 1e3)) + ' KB';
  if (n < 1e9) return (n / 1e6).toFixed(1) + ' MB';
  return (n / 1e9).toFixed(1) + ' GB';
}

export function ThemeToggle() {
  const theme = useApp((s) => s.uiTheme);
  const setTheme = useApp((s) => s.setUiTheme);
  const dark = theme === 'frappe';
  return (
    <button onClick={() => setTheme(dark ? 'latte' : 'frappe')} title={dark ? 'Switch to Latte (light)' : 'Switch to Frappé (dark)'}
      className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-line bg-card text-text-2 hover:bg-panel">
      <Icon name={dark ? 'sun' : 'moon'} size={17} />
    </button>
  );
}

function Thumb({ p }: { p: Project }) {
  const s = p.scenes[0];
  const th = mapTheme(s.look.theme);
  const P = (s.points.length ? s.points : [{ lng: -9.14, lat: 38.72 }, { lng: -8.63, lat: 41.16 }]).map((q) => toMerc(q.lng, q.lat));
  const xs = P.map((q) => q.x), ys = P.map((q) => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min(200 / (x1 - x0 || 1e-9), 100 / (y1 - y0 || 1e-9));
  const pts = P.map((q) => [140 + (q.x - (x0 + x1) / 2) * k, 75 + (q.y - (y0 + y1) / 2) * k]);
  const step = Math.max(1, Math.floor(pts.length / 300));
  const line = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
  return (
    <div className="relative h-[150px] cursor-pointer" style={{ background: `linear-gradient(100deg, ${th.water} 0 16%, ${th.land} 16%)` }}>
      <svg viewBox="0 0 280 150" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
        <polyline points={line} fill="none" stroke={s.look.color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
        {pts[0] && <circle cx={pts[0][0]} cy={pts[0][1]} r={5} fill={th.halo} stroke={s.look.color} strokeWidth={2.5} />}
      </svg>
      <div className="num absolute top-3 left-3 rounded-full bg-[rgba(239,241,245,.92)] px-2 py-[3px] text-[10.5px] font-semibold text-[#4c4f69]">{s.ratio}</div>
    </div>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const remove = useApp((s) => s.removeProject);
  const [confirming, setConfirming] = useState(false);
  const n = p.scenes.length;
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-shadow hover:shadow-[0_8px_28px_rgba(20,20,19,.12)]">
      <div onClick={() => goProject(p.id)}><Thumb p={p} /></div>
      <div className="flex flex-col gap-1 px-[18px] pt-4 pb-3.5">
        <div className="truncate text-[18px] font-semibold tracking-[-0.015em]">{p.name}</div>
        <div className="num text-[12px] text-muted">{n} {n === 1 ? 'scene' : 'scenes'} · {ago(p.updatedAt)}</div>
      </div>
      <div className="mt-auto flex items-center gap-2 px-[18px] pb-4">
        {confirming ? (
          <>
            <span className="flex-1 text-[13px] text-text-2">Delete permanently?</span>
            <Button className="h-[34px]" onClick={() => setConfirming(false)}>Keep</Button>
            <Button variant="inverse" className="h-[34px]" onClick={() => remove(p.id)}>Delete</Button>
          </>
        ) : (
          <>
            <Button className="h-[34px] flex-1 font-semibold" onClick={() => goProject(p.id)}>Open</Button>
            <Button className="h-[34px]" title="Download project file" onClick={() => downloadBlob(projectToFile(p), projectFileName(p))}>
              <Icon name="download" size={15} /> Download
            </Button>
            <Button className="h-[34px] w-[34px] px-0 text-muted hover:text-text" title="Delete" onClick={() => setConfirming(true)}>
              <Icon name="x" size={15} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const create = useApp((s) => s.createProject);
  const [name, setName] = useState('Untitled journey');
  const [ratio, setRatio] = useState<Ratio>('16:9');
  const [start, setStart] = useState<StartWith>('draw');
  const go = () => {
    const p = create(name, ratio);
    pendingImport.kind = start === 'draw' ? null : start;
    onClose();
    goProject(p.id);
  };
  return (
    <Modal title="New project" onClose={onClose}>
      <TextField label={<span className="text-text-2">Name</span>} value={name} onChange={setName} autoFocus />
      <div className="flex flex-col gap-1.5 text-[13px] text-text-2">First scene video ratio
        <PillChoice mono value={ratio} options={RATIOS.map((r) => [r, r])} onChange={setRatio} />
      </div>
      <div className="flex flex-col gap-1.5 text-[13px] text-text-2">Start with
        <PillChoice value={start} options={[['draw', 'Draw on map'], ['gpx', 'Import GPX'], ['json', 'Import JSON timeline']]} onChange={setStart} />
      </div>
      <div className="mt-1 flex justify-end gap-2.5">
        <Button className="h-[42px] px-[18px] text-[14px]" onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="h-[42px] px-[22px] text-[14px]" onClick={go}>Create &amp; open editor</Button>
      </div>
    </Modal>
  );
}

export function ProjectsPage() {
  const projects = useApp((s) => s.projects);
  const addProject = useApp((s) => s.addProject);
  const [newOpen, setNewOpen] = useState(false);
  const [error, setError] = useState('');
  const [store, setStore] = useState<{ persisted: boolean; usage: number; quota: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void storageInfo().then(setStore); }, [projects.length]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try { addProject(await projectFromFile(f)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not open that file.'); }
  };
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="absolute inset-0 overflow-auto bg-bg" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files[0]); }}>
      <input ref={fileRef} type="file" accept={`${PROJECT_EXT},.zip,.json`} className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="mx-auto flex max-w-[1160px] flex-col gap-10 px-10 pt-7 pb-[72px]">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[19px] font-semibold tracking-[-0.02em]">ElChilaquil<span className="text-accent">WasHere</span></span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-[7px] text-[12.5px] text-text-2">
              <span className="h-[7px] w-[7px] rounded-full bg-green" />Stored in this browser only · no account
            </div>
            <ThemeToggle />
          </div>
        </header>

        <section className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[620px] flex-col gap-3">
            <div className="eyebrow">Projects</div>
            <h1 className="m-0 text-[52px] leading-[1.04] font-semibold tracking-[-0.035em]">Your journeys, <span className="text-accent">in motion.</span></h1>
            <p className="m-0 text-[16px] leading-normal text-text-2 text-pretty">Draw a route, dress the map, drop signs, direct the camera, export. Every project lives on this device and holds as many scenes as you like.</p>
          </div>
          <div className="flex gap-2.5">
            <Button className="h-[42px] px-[18px] text-[14px]" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Open from file</Button>
            <Button variant="primary" className="h-[42px] px-5 text-[14px]" onClick={() => setNewOpen(true)}><Icon name="plus" size={16} />New project</Button>
          </div>
        </section>

        {error && <div className="rounded-xl border border-red/40 bg-card px-4 py-3 text-[13.5px] text-red">{error}</div>}

        <section className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
          <button onClick={() => setNewOpen(true)}
            className="flex min-h-[268px] flex-col items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-line-x bg-transparent text-text-2 hover:border-accent hover:bg-panel">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-panel-2"><Icon name="plus" size={20} /></span>
            <span className="text-[17px] font-semibold text-text">New project</span>
            <span className="text-[13px] text-muted">Draw, or import GPX / JSON</span>
          </button>
          {sorted.map((p) => <ProjectCard key={p.id} p={p} />)}
          {!projects.length && (
            <button onClick={() => addProject(sampleProject())}
              className="flex min-h-[268px] flex-col items-center justify-center gap-2.5 rounded-2xl border border-line bg-panel text-text-2 hover:border-accent">
              <span className="text-[17px] font-semibold text-text">Try a sample</span>
              <span className="max-w-[220px] text-center text-[13px] text-muted">A Lisbon → Porto road trip with signs, ready to preview and export.</span>
            </button>
          )}
        </section>

        <section className="flex items-start gap-3.5 rounded-[14px] bg-panel px-5 py-[18px]">
          <span className={cx('mt-1.5 h-2 w-2 flex-none rounded-full', store?.persisted ? 'bg-green' : 'bg-accent')} />
          <p className="m-0 text-[13.5px] leading-[1.55] text-text-2 text-pretty">
            <strong className="text-text">Using a private window?</strong> Browsers clear local data when the window closes. Hit <em>Download</em> on any project to keep a copy, then <em>Open from file</em> next time.
            {store && store.quota > 0 && <span className="num text-muted"> · {bytes(store.usage)} used{store.persisted ? ', protected from automatic clean-up' : ''}.</span>}
          </p>
        </section>
      </div>
      {newOpen && <NewProjectModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}

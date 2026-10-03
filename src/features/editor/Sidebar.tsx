import { useEffect, useRef, useState } from 'react';
import { BLUR, TRAVEL_MODES, legMode, makeSign, outputSize, removePoint, rid, signPointIndex, type Scene, type SignStyle, type TipKind, type TravelMode } from '../../core/model';
import { ModeIcon } from '../../ui/ModeIcon';
import { importPhoto } from '../../render/photos';
import { importMusic } from '../../render/audio';
import { getAsset } from '../../storage/db';
import { runtime } from '../../core/runtime';
import { formatTime } from '../../core/timing';
import { MAP_THEMES } from '../../map/themes';
import { exportDims, exportFps } from '../../render/exporter';
import { currentScene, useApp, type Step } from '../../state/store';
import { Button, Cards, Group, Info, Segmented, Slider, Swatches, TextField, Toggle, cx } from '../../ui/controls';
import { Icon } from '../../ui/icons';
import { GpxHelp, TimelineHelp } from './FileHelp';

/** 850 m · 12.3 km · 297 km · 1,240 km */
export function fmtDist(m: number): string {
  if (m < 1000) return Math.round(m) + ' m';
  const km = m / 1000;
  return (km < 100 ? km.toFixed(1) : Math.round(km).toLocaleString()) + ' km';
}

const TITLES = ['Route', 'Look', 'Signs', 'Camera', 'Preview & export'];
const DESCS = [
  'Draw on the map or import a route to get started.',
  'Choose a map theme and style your route.',
  'Add places, photos and counters to tell your story. Optional.',
  'Follow the route or frame a fixed overview. The defaults are ready to preview.',
  'Preview your animation, then save a video. Adjust its pace with Timing below.',
];
export const STEP_LABELS = ['Route', 'Look', 'Signs', 'Camera', 'Export'];

const LINE_COLORS = ['#179299', '#4c4f69', '#ffffff', '#1e66f5', '#40a02b', '#ea76cb', '#df8e1d', '#fe640b', '#d20f39'];
const TIPS: [TipKind, string, React.ReactNode][] = [
  ['moto', 'Motorcycle', <ModeIcon mode="moto" size={22} />], ['mode', 'Transport', <ModeIcon mode="bus" size={22} />],
  ['pulse', 'Pulse', '◉'], ['dot', 'Dot', '●'], ['arrow', 'Arrow', '▲'], ['pin', 'Pin', '◎'], ['diamond', 'Diamond', '◆'], ['plane', 'Plane', '✈\uFE0E'],
];
const SIGNS: [SignStyle, string, string][] = [
  ['postcard', 'Postcard', 'background:#fffdf8;border:1px solid #bcc0cc;border-top:4px solid var(--accent);border-radius:2px'],
  ['post', 'Signpost', 'background:#7a5238;clip-path:polygon(0 0,80% 0,100% 50%,80% 100%,0 100%)'],
  ['ticket', 'Ticket', 'background:var(--accent);border-radius:4px'],
  ['tag', 'Tag', 'background:#232634;border-radius:99px'],
];

function css(s: string): React.CSSProperties {
  return Object.fromEntries(s.split(';').filter(Boolean).map((d) => {
    const [k, ...v] = d.split(':');
    return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v.join(':').trim()];
  }));
}

export function Sidebar({ onImport, onExport }: { onImport: (kind: 'gpx' | 'json') => void; onExport: (all: boolean) => void }) {
  const step = useApp((s) => s.step);
  const set = useApp((s) => s.set);
  const go = (n: Step) => set({ step: n, playing: false, tm: n >= 4 ? 0 : -1, sel: -1, selSign: null });
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }); }, [step]);
  return (
    <aside className="editor-sidebar flex min-h-0 w-[312px] flex-none flex-col border-r border-line bg-panel" aria-label={`${TITLES[step - 1]} settings`}>
      <div className="flex flex-col gap-1.5 px-5 pt-5 pb-4">
        <div className="eyebrow">Step {step} of 5</div>
        <h1 className="text-[24px] leading-[1.1] font-semibold tracking-[-0.025em]">{TITLES[step - 1]}</h1>
        <div className="text-[13px] leading-normal text-text-2 text-pretty">{DESCS[step - 1]}</div>
      </div>
      <div ref={scroll} className="sidebar-content min-h-0 flex-1 overflow-y-auto">
        {step === 1 && <RoutePanel onImport={onImport} />}
        {step === 2 && <LookPanel />}
        {step === 3 && <SignsPanel />}
        {step === 4 && <CameraPanel />}
        {step === 5 && <ExportPanel onExport={onExport} />}
      </div>
      <div className="flex flex-none items-center gap-2 border-t border-line bg-bg px-5 py-3">
        {step > 1 && <Button className="h-10 px-3" onClick={() => go((step - 1) as Step)}><Icon name="back" size={14} />Back</Button>}
        {step < 5
          ? <Button variant="primary" className="h-10 flex-1" onClick={() => go((step + 1) as Step)}>Next: {STEP_LABELS[step]} <span aria-hidden="true">→</span></Button>
          : <span className="text-[12px] text-muted">Your project saves automatically.</span>}
      </div>
    </aside>
  );
}

function useScene(): [Scene, (fn: (s: Scene) => void, key?: string) => void] {
  const scene = useApp((s) => currentScene(s)!);
  const update = useApp((s) => s.updateScene);
  return [scene, update];
}

function RoutePanel({ onImport }: { onImport: (kind: 'gpx' | 'json') => void }) {
  const [scene, update] = useScene();
  const sel = useApp((s) => s.sel);
  const set = useApp((s) => s.set);
  const showNumbers = useApp((s) => s.showNumbers);
  const setShowNumbers = useApp((s) => s.setShowNumbers);
  const rt = runtime(scene);
  const big = scene.points.length > 40;
  const km = rt.route.metresAt(1) / 1000;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 px-5 pb-4">
        <Button title="Import a GPX or KML route" className="h-[38px] px-2" onClick={() => onImport('gpx')}>GPX / KML</Button>
        <Button title="Import Google Timeline or a JSON route" className="h-[38px] px-2" onClick={() => onImport('json')}>Google Timeline</Button>
      </div>
      <Group title="Where do I get these files?" collapsible>
        <TimelineHelp />
        <GpxHelp />
      </Group>
      <Group title="Drawing & shortcuts" collapsible>
        <Info>Use the toolbar on the map. <b>Draw</b>: click the map to add points. <b>Edit</b>: drag a point to move it, or drag the small circles on the line to add a point in between; right-click a point or press <kbd>Delete</kbd> to remove it. <b>Pan</b>: drag without adding points. In any mode, drag the map to move around and scroll to zoom. <kbd>Ctrl+Z</kbd> undoes.</Info>
      </Group>
      {sel >= 0 && sel < scene.points.length && <PointEditor i={sel} />}
      <Group title={`Route points · ${scene.points.length}`}
        right={scene.points.length > 0 && <button aria-label="Clear route and signs" title="Clear route and signs (undo with Ctrl+Z)" className="eyebrow bg-transparent p-0 text-red! hover:underline" onClick={() => { update((s) => { s.points = []; s.signs = []; }); set({ sel: -1, selSign: null, tm: -1, playing: false }); }}>Clear</button>}>
        {km > 0 && <div className="num -mt-1 text-[12px] text-muted">{fmtDist(km * 1000)} · {rt.tm.T.toFixed(1)} s animation</div>}
        {big ? (
          <div className="rounded-[10px] border border-line bg-card px-3.5 py-3 text-[12.5px] leading-normal text-text-2">
            <div className="num mb-1 text-[20px] font-semibold text-text">{scene.points.length} points</div>
            Too many to list. Edit them directly on the map, or Clear to start over.
          </div>
        ) : (
          <div className="-mx-2 flex flex-col gap-0.5">
            {scene.points.map((q, i) => (
              <div key={q.id} onClick={() => set({ sel: i })}
                className={cx('flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5', sel === i ? 'bg-card shadow-[inset_0_0_0_1px_var(--accent)]' : 'hover:bg-panel-2')}>
                <button aria-label={`Edit point ${i + 1}${q.name ? `: ${q.name}` : ''}`} aria-pressed={sel === i} onClick={() => set({ sel: i })} className={cx('num grid h-7 w-7 flex-none place-items-center rounded-full text-[11px] font-semibold', sel === i ? 'bg-accent text-on-accent' : 'bg-panel-2')}>{i + 1}</button>
                <input value={q.name ?? ''} placeholder={`Point ${i + 1}`} onClick={(e) => e.stopPropagation()}
                  onChange={(e) => update((s) => { s.points[i].name = e.target.value || undefined; }, 'name-' + q.id)}
                  aria-label={`Name of point ${i + 1}`} className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-[13.5px] placeholder:text-text" />
                {i > 0 && (
                  <span title={`${q.hidden ? 'Hidden leg · ' : ''}${TRAVEL_MODES.find(([m]) => m === legMode(scene, i))?.[1]}`}
                    className={cx('flex-none', q.hidden ? 'text-faint opacity-50' : q.mode ? 'text-accent' : 'text-muted')}>
                    <ModeIcon mode={legMode(scene, i)} size={15} />
                  </span>
                )}
                <span className={cx('num text-right text-[11px] leading-tight text-muted', q.hidden && 'line-through opacity-60')} title={i ? (q.hidden ? 'Hidden leg' : 'Distance from the previous point') : 'Start'}>
                  {i ? '+' + fmtDist(rt.route.M[rt.route.idx[i]] - rt.route.M[rt.route.idx[i - 1]]) : 'start'}
                  {q.time != null && <span className="block">{new Date(q.time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}
                </span>
                <button title="Delete point" aria-label={`Delete point ${i + 1}`} onClick={(e) => { e.stopPropagation(); update((s) => removePoint(s, i)); set({ sel: -1 }); }}
                  className="grid h-7 w-7 place-items-center rounded-[5px] border-0 bg-transparent p-0 text-muted hover:bg-panel-2 hover:text-text">
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
            {!scene.points.length && <div className="px-2"><Info>No points yet — click on the map to start.</Info></div>}
          </div>
        )}
      </Group>
      <Group title={`Travel mode · ${TRAVEL_MODES.find(([m]) => m === scene.travel)?.[1]}`} collapsible>
        <ModeGrid value={scene.travel} onChange={(m) => update((s) => { s.travel = m ?? 'car'; })} />
        <Info>Used for every leg unless a leg sets its own. Pick <b>Transport</b> as the tip symbol in step 2 to show it on the line.</Info>
      </Group>
      <Group title="Route options" collapsible>
        <Toggle label="Smooth spline through points" value={scene.smooth} onChange={(v) => update((s) => { s.smooth = v; })} />
        <Toggle label="Number the points on the map" value={showNumbers} onChange={setShowNumbers} />
      </Group>
    </>
  );
}

const PICKABLE_MODES = TRAVEL_MODES.filter(([m]) => m !== 'other');

function ModeGrid({ value, onChange, allowDefault }: { value: TravelMode | null; onChange: (m: TravelMode | null) => void; allowDefault?: string }) {
  const opts: [TravelMode | null, string][] = [...(allowDefault ? [[null, allowDefault] as [null, string]] : []), ...PICKABLE_MODES];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {opts.map(([m, label]) => (
        <button key={m ?? 'default'} onClick={() => onChange(m)} title={label} aria-label={label} aria-pressed={value === m}
          className={cx('flex h-[54px] flex-col items-center justify-center gap-1 rounded-[9px] border text-[11px]',
            value === m ? 'border-accent bg-card font-semibold text-text' : 'border-transparent bg-panel-2 text-text-2 hover:text-text')}>
          {m ? <ModeIcon mode={m} size={20} /> : <span className="text-[15px] leading-5">↺</span>}
          <span className="max-w-full truncate px-1">{m === 'moto' ? 'Moto' : m ? label : 'Default'}</span>
        </button>
      ))}
    </div>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Epoch ms → yyyy-mm-dd in local time (for <input type="date">). */
function toDateInput(t?: number): string {
  if (t == null || !Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The selected point: its date, and the leg arriving at it. */
function PointEditor({ i }: { i: number }) {
  const [scene, update] = useScene();
  const q = scene.points[i], prev = scene.points[i - 1];
  const rt = runtime(scene);
  const name = (x: typeof q, j: number) => x.name || `Point ${j + 1}`;
  const defaultLabel = `Default (${TRAVEL_MODES.find(([m]) => m === scene.travel)?.[1]})`;
  return (
    <>
      <Group title={<>Point {i + 1} · date & details</>} collapsible>
        <label className="flex flex-col gap-1.5 text-[13.5px]">
          <span className="flex justify-between">Date at this point
            {q.time != null && <button className="border-0 bg-transparent p-0 text-[12px] text-accent hover:underline" onClick={() => update((s) => { s.points[i].time = undefined; })}>Clear</button>}
          </span>
          <input type="date" value={toDateInput(q.time)}
            onChange={(e) => { const v = e.target.value; update((s) => { s.points[i].time = v ? new Date(v + 'T12:00:00').getTime() : undefined; }, 'date-' + q.id); }}
            className="num h-[38px] rounded-[9px] border border-line-strong bg-card px-2.5 text-[14px] text-text outline-none focus:border-accent" />
        </label>
        <Info>Used by the on-screen date counter (step 3). Dates between dated points are filled in as the line travels.</Info>
      </Group>
      {i > 0 && (
        <Group title={<>Leg · {name(prev, i - 1)} → {name(q, i)}</>} collapsible>
          <div className="num -mt-1.5 text-[12px] text-muted">{fmtDist(rt.route.M[rt.route.idx[i]] - rt.route.M[rt.route.idx[i - 1]])}{q.hidden ? ' · hidden' : ''}</div>
          <ModeGrid value={q.mode ?? null} allowDefault={defaultLabel} onChange={(m) => update((s) => { s.points[i].mode = m ?? undefined; }, 'leg-mode-' + q.id)} />
          <Toggle label="Hide this leg" value={!!q.hidden} onChange={(v) => update((s) => { s.points[i].hidden = v || undefined; })} />
          <Info>A hidden leg isn't drawn: the line stops at {name(prev, i - 1)} and picks up again at {name(q, i)}, and the camera hops across it quickly. Handy for flights or parts you don't want to show.</Info>
        </Group>
      )}
    </>
  );
}

function LookPanel() {
  const [scene, update] = useScene();
  const look = scene.look;
  const setL = <K extends keyof Scene['look']>(k: K) => (v: Scene['look'][K]) => update((s) => { s.look[k] = v; }, 'look-' + String(k));
  return (
    <>
      <Group title="Map">
        <Cards label="Theme" value={look.theme} onChange={setL('theme')}
          options={MAP_THEMES.map((t) => ({ id: t.id, label: t.name, preview: '', previewStyle: { background: `linear-gradient(115deg, ${t.water} 0 30%, ${t.land} 30%)` } }))} />
        {look.theme === 'satellite' && <Info>Sentinel‑2 cloudless imagery by EOX — free for non-commercial use, credited in the video.</Info>}
        <Segmented label="Place names" value={look.labels} options={[['off', 'Off'], ['cities', 'Cities'], ['all', 'All']]} onChange={setL('labels')} />
        {look.labels !== 'off' && <Segmented label="Label language" value={look.labelLang} options={[['local', 'Local'], ['en', 'English']]} onChange={setL('labelLang')} />}
        <Segmented label="Country shading" value={look.regions} options={[['off', 'Off'], ['visited', 'Visited'], ['all', 'All']]} onChange={setL('regions')} />
        <Toggle label="Streets & roads" value={look.roads} onChange={setL('roads')} />
        <Toggle label="3D terrain & relief" value={look.terrain} onChange={setL('terrain')} />
        {look.terrain && <Slider label="Relief strength" value={look.relief} min={0} max={100} step={5} format={(v) => v + '%'} onChange={setL('relief')} />}
      </Group>
      <Group title="Route line">
        <Swatches label="Colour" value={look.color} colors={LINE_COLORS} onChange={setL('color')} />
        <Slider label="Thickness" value={look.width} min={2} max={18} step={1} format={(v) => v + ' px'} onChange={setL('width')} />
        <Segmented label="Style" value={look.style} options={[['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]} onChange={setL('style')} />
        <Toggle label="Outline (solid only)" value={look.casing} onChange={setL('casing')} disabled={look.style !== 'solid'} />
        <Toggle label="Glow" value={look.glow} onChange={setL('glow')} />
        <Toggle label="Show full route ahead" value={look.ghost} onChange={setL('ghost')} />
      </Group>
      <Group title="Markers">
        <Cards label="Symbol at the tip" value={look.tip} onChange={setL('tip')}
          options={TIPS.map(([id, label, glyph]) => ({ id, label, preview: glyph, previewStyle: { background: 'var(--panel-2)', color: look.color } }))} />
        <Slider label="Symbol size" value={look.tipSize} min={0.5} max={2.5} step={0.1} format={(v) => '×' + v.toFixed(1)} onChange={setL('tipSize')} />
        <Toggle label="Initial dot" value={look.startDot} onChange={setL('startDot')} />
        <Toggle label="End marker" value={look.endDot} onChange={setL('endDot')} />
      </Group>
    </>
  );
}

function pointLabel(q: Scene['points'][number], i: number) {
  return `${i + 1} · ${q.name || `Point ${i + 1}`}`;
}

function PointSelect({ scene, value, onChange, label }: { scene: Scene; value: number; onChange: (i: number) => void; label: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13.5px]">
      {label}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="h-[38px] rounded-[9px] border border-line-strong bg-card px-2.5 text-[14px] text-text outline-none focus:border-accent">
        {scene.points.map((q, i) => <option key={q.id} value={i}>{pointLabel(q, i)}</option>)}
      </select>
    </label>
  );
}

const BEHAVIOURS: [Scene['signs'][number]['trigger'], string, string][] = [
  ['pause', 'Pause here', 'The line stops at this point while the sign pops in, then carries on.'],
  ['reach', 'Appear here', 'The sign pops in when the line reaches this point and stays.'],
  ['always', 'Always on', 'The sign is visible for the whole video.'],
];

function SignsPanel() {
  const [scene, update] = useScene();
  const selSign = useApp((s) => s.selSign);
  const sel = useApp((s) => s.sel);
  const set = useApp((s) => s.set);
  const say = useApp((s) => s.say);
  const rt = runtime(scene);
  const sg = scene.signs.find((g) => g.id === selSign);
  // Where a new sign goes: the picked point, else the point nearest the playhead, else the first one.
  const target = (() => {
    if (sel >= 0 && sel < scene.points.length) return sel;
    const st = useApp.getState();
    if (st.tm < 0 || !scene.points.length) return scene.points.length ? 0 : -1;
    const p = rt.tm.progressAt(st.tm);
    let best = 0;
    rt.route.pointP.forEach((q, i) => { if (Math.abs(q - p) < Math.abs(rt.route.pointP[best] - p)) best = i; });
    return best;
  })();
  const add = (style: SignStyle) => {
    if (target < 0) { say('Draw a route first'); return; }
    const q = scene.points[target];
    const g = makeSign(q.id, { style, title: q.name || 'New place' });
    update((s) => { s.signs.push(g); });
    set({ selSign: g.id, sel: target });
  };
  const patch = (key: string, fn: (g: Scene['signs'][number]) => void) => update((s) => { const g = s.signs.find((x) => x.id === selSign); if (g) fn(g); }, key + selSign);
  const sgIndex = sg ? signPointIndex(scene.points, sg) : -1;
  return (
    <>
      <div className="flex flex-col gap-2.5 px-5 pb-4">
        <div className="eyebrow">Add a sign</div>
        {scene.points.length > 0 ? (
          <>
            <PointSelect label="New sign at point" scene={scene} value={Math.max(0, target)} onChange={(i) => set({ sel: i, selSign: null })} />
            <div className="grid grid-cols-2 gap-2">
              {SIGNS.map(([id, label, chip]) => (
                <button key={id} onClick={() => add(id)} className="flex h-14 items-center gap-2.5 rounded-[10px] border border-line-strong bg-card px-3 text-left text-[13px] font-medium hover:border-accent">
                  <span className="h-5 w-[26px] flex-none" style={css(chip)} />{label}
                </button>
              ))}
            </div>
            <Info>Tip: click a point on the map to pick it. Points that already have a sign are ringed.</Info>
          </>
        ) : <Info>Draw a route first — signs hang from its points.</Info>}
      </div>
      <Group title="Selected sign">
        {sg ? (
          <>
            <TextField label="Title" value={sg.title} onChange={(v) => patch('title', (g) => { g.title = v; })} />
            <TextField label="Subtitle" value={sg.sub} onChange={(v) => patch('sub', (g) => { g.sub = v; })} />
            <PhotoField photo={sg.photo} onChange={(id) => patch('photo', (g) => { g.photo = id; })} />
            <PointSelect label="Attached to point" scene={scene} value={Math.max(0, sgIndex)} onChange={(i) => { patch('point', (g) => { g.pointId = scene.points[i].id; }); set({ sel: i }); }} />
            <Segmented label="Design" value={sg.style} options={SIGNS.map(([id, l]) => [id, l])} onChange={(v) => patch('style', (g) => { g.style = v; })} />
            <Segmented label="At this point" value={sg.trigger} options={BEHAVIOURS.map(([v, l]) => [v, l])} onChange={(v) => patch('trigger', (g) => { g.trigger = v; })} />
            <Info>{BEHAVIOURS.find((b) => b[0] === sg.trigger)?.[2]}</Info>
            {sg.trigger === 'pause' && <Slider label="Pause for" value={sg.pause} min={0.5} max={8} step={0.5} format={(v) => v + ' s'} onChange={(v) => patch('pause', (g) => { g.pause = v; })} />}
            <Slider label="Size" value={sg.size} min={0.5} max={2} step={0.1} format={(v) => '×' + v.toFixed(1)} onChange={(v) => patch('size', (g) => { g.size = v; })} />
            <Info>Drag the card on the map to place it; a dashed leader keeps it tied to its point.</Info>
            <Button className="h-9 text-red" onClick={() => { update((s) => { s.signs = s.signs.filter((g) => g.id !== sg.id); }); set({ selSign: null }); }}>Delete sign</Button>
          </>
        ) : <Info>Pick a sign on the map or in the list to edit its text, design and timing.</Info>}
      </Group>
      <Group title={`Signs · ${scene.signs.length}`}>
        <div className="-mx-2 flex flex-col gap-0.5">
          {[...scene.signs].sort((a, b) => (rt.tm.signP.get(a.id) ?? 0) - (rt.tm.signP.get(b.id) ?? 0)).map((g) => {
            const i = signPointIndex(scene.points, g);
            return (
              <button key={g.id} aria-label={`Edit sign: ${g.title}`} aria-pressed={selSign === g.id} onClick={() => set({ selSign: g.id, sel: i })}
                className={cx('flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-[9px] py-[7px] text-left', selSign === g.id ? 'bg-card shadow-[inset_0_0_0_1px_var(--accent)]' : 'hover:bg-panel-2')}>
                <span className="num grid h-[22px] min-w-[22px] flex-none place-items-center rounded-full bg-panel-2 px-1 text-[11px] font-semibold">{i + 1}</span>
                <span className="flex-1 truncate text-[13.5px]">{g.title}</span>
                <span className="num text-[11px] text-muted">{{ reach: 'appears', pause: `pause ${g.pause}s`, always: 'always' }[g.trigger]} · {formatTime(g.trigger === 'always' ? 0 : rt.tm.timeAtP(rt.tm.signP.get(g.id) ?? 0))}</span>
              </button>
            );
          })}
          {!scene.signs.length && <div className="px-2"><Info>No signs yet. Choose a point above, then select a sign design to add one.</Info></div>}
        </div>
      </Group>
      <CountersGroup />
    </>
  );
}

/** Photo on a sign: pick, preview, replace, remove. Stored only in this browser (and in project files). */
function PhotoField({ photo, onChange }: { photo?: string; onChange: (id: string | undefined) => void }) {
  const projectId = useApp((s) => s.project?.id ?? '');
  const say = useApp((s) => s.say);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null, live = true;
    setUrl(null);
    if (photo) void getAsset(photo).then((a) => { if (a && live) { u = URL.createObjectURL(a.blob); setUrl(u); } });
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [photo]);
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { onChange(await importPhoto(f, projectId)); } catch (e) { say(e instanceof Error ? e.message : 'Could not read that photo'); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-1.5 text-[13.5px]">
      Photo
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      {photo ? (
        <div className="flex items-center gap-3">
          <div className="h-16 w-24 flex-none overflow-hidden rounded-lg border border-line bg-panel-2">
            {url && <img src={url} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="flex flex-col items-start gap-1.5">
            <button className="border-0 bg-transparent p-0 text-[12.5px] text-accent hover:underline" onClick={() => input.current?.click()}>{busy ? 'Reading…' : 'Replace…'}</button>
            <button className="border-0 bg-transparent p-0 text-[12.5px] text-red hover:underline" onClick={() => onChange(undefined)}>Remove</button>
          </div>
        </div>
      ) : (
        <Button className="h-[38px] border-dashed" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? 'Reading photo…' : '+ Add a photo'}
        </Button>
      )}
    </div>
  );
}

function CountersGroup() {
  const [scene, update] = useScene();
  const hud = scene.hud;
  const setH = <K extends keyof Scene['hud']>(k: K) => (v: Scene['hud'][K]) => update((s) => { s.hud[k] = v; }, 'hud-' + String(k));
  const dated = scene.points.filter((q) => q.time != null).length;
  return (
    <Group title="On-screen counters">
      <Toggle label="Date" value={hud.date} onChange={setH('date')} />
      {hud.date && (
        <>
          <Segmented value={hud.dateStyle} options={[['date', '3 Oct 2025'], ['day', 'Day 3'], ['both', 'Both']]} onChange={setH('dateStyle')} />
          {dated === 0 && <Info>No point has a date yet. Import a dated GPX or timeline, or pick a point in step 1 and set its date.</Info>}
          {dated === 1 && <Info>Only one point has a date, so the counter stays on that day. Date a few more points (step 1) to make it run.</Info>}
        </>
      )}
      <Toggle label="Distance travelled" value={hud.distance} onChange={setH('distance')} />
      {hud.distance && <Segmented value={hud.units} options={[['km', 'Kilometres'], ['mi', 'Miles']]} onChange={setH('units')} />}
      {(hud.date || hud.distance) && (
        <Segmented label="Corner" value={hud.corner} options={[['tl', '↖'], ['tr', '↗'], ['bl', '↙'], ['br', '↘']]} onChange={setH('corner')} />
      )}
    </Group>
  );
}

function CameraPanel() {
  const [scene, update] = useScene();
  const cam = scene.cam;
  const setC = <K extends keyof Scene['cam']>(k: K) => (v: Scene['cam'][K]) => update((s) => { s.cam[k] = v; }, 'cam-' + String(k));
  const rt = runtime(scene);
  const addKf = () => {
    const st = useApp.getState();
    const t = st.tm < 0 ? 0 : st.tm, p = rt.tm.progressAt(t);
    update((s) => { s.cam.kfs.push({ id: rid('k'), p, z: s.cam.zoom }); });
  };
  const zfmt = (v: number) => '×' + (2 ** v).toFixed(v >= 4 ? 0 : 1);
  return (
    <>
      <Group title="Movement">
        <Segmented label="Camera mode" value={cam.mode} options={[['follow', 'Follow the line'], ['overview', 'Overview (static)']]} onChange={setC('mode')} />
        {cam.mode === 'overview' && <Info>The camera holds one shot while the line draws itself.</Info>}
      </Group>
      <Group title="Framing" right={cam.view && <button className="eyebrow bg-transparent p-0 text-accent! hover:underline" onClick={() => update((s) => { s.cam.view = null; })}>Reset</button>}>
        <Info>
          {cam.mode === 'overview'
            ? <>Frame the shot right on the map: <b>drag</b> to pan, <b>scroll</b> to zoom, <b>right-drag</b> to rotate and tilt.</>
            : <>On the map, with the playhead mid-route: <b>scroll</b> to zoom the camera there, <b>right-drag</b> up/down to tilt. With the playhead at the start or end you frame the <b>overview</b> shot used for the opening and closing.</>}
        </Info>
        <div className="num rounded-[10px] border border-line bg-card px-3 py-2.5 text-[12px] text-text-2">
          Overview: {cam.view
            ? <>custom · zoom {cam.view.zoom.toFixed(1)} · {Math.round(cam.view.bearing)}° · tilt {Math.round(cam.view.pitch)}°</>
            : 'automatic fit of the whole route'}
        </div>
      </Group>
      {cam.mode === 'follow' && (
        <>
          <Group title="Following">
            <Segmented label="Orientation" value={cam.orient} options={[['north', 'North up'], ['heading', 'Heading up']]} onChange={setC('orient')} />
            <Slider label="Zoom" value={cam.zoom} min={0} max={8} step={0.1} format={zfmt} onChange={setC('zoom')} />
            <Slider label="Look-ahead" value={cam.ahead} min={0} max={40} step={1} format={(v) => v + '%'} onChange={setC('ahead')} />
            <Slider label="Smoothing" value={cam.smooth} min={0} max={100} step={5} format={(v) => v + '%'} onChange={setC('smooth')} />
            <Slider label="Tilt (3D)" value={cam.tilt} min={0} max={60} step={1} format={(v) => v + '°'} onChange={setC('tilt')} />
            {cam.tilt > 0 && !scene.look.terrain && <Info>Tip: turn on <b>3D terrain</b> in step 2 to see mountains when tilted.</Info>}
          </Group>
          <Group title="Opening & closing">
            <Toggle label="Start on the overview, then zoom in" value={cam.intro} onChange={setC('intro')} />
            <Toggle label="Pull back to the overview at the end" value={cam.outro} onChange={setC('outro')} />
          </Group>
      <Group title={`Advanced: zoom keyframes · ${cam.kfs.length}`} collapsible>
        <Info>Move the playhead, then add a keyframe. The camera eases between keyframes.</Info>
        <Button className="h-9 hover:border-accent" onClick={addKf}><Icon name="diamond" size={14} />Add keyframe at playhead</Button>
        {[...cam.kfs].sort((a, b) => a.p - b.p).map((k) => (
          <div key={k.id} className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-card px-3 py-2.5">
            <div className="num flex items-center justify-between text-[12px] font-medium">
              <span>◆ {formatTime(rt.tm.timeAtP(k.p))}</span>
              <span className="text-text-2">{zfmt(k.z)}</span>
              <button aria-label={`Delete keyframe at ${formatTime(rt.tm.timeAtP(k.p))}`} className="border-0 bg-transparent px-1 text-muted hover:text-text" onClick={() => update((s) => { s.cam.kfs = s.cam.kfs.filter((q) => q.id !== k.id); })}><Icon name="x" size={13} /></button>
            </div>
            <input aria-label={`Zoom at ${formatTime(rt.tm.timeAtP(k.p))}`} type="range" min={0} max={8} step={0.1} value={k.z} onChange={(e) => { const z = parseFloat(e.target.value); update((s) => { const q = s.cam.kfs.find((x) => x.id === k.id); if (q) q.z = z; }, 'kf-' + k.id); }} />
          </div>
        ))}
      </Group>
        </>
      )}
    </>
  );
}

function ExportPanel({ onExport }: { onExport: (all: boolean) => void }) {
  const [scene, update] = useScene();
  const count = useApp((s) => s.project?.scenes.length ?? 1);
  const readyCount = useApp((s) => s.project?.scenes.filter((x) => x.points.length >= 2).length ?? 0);
  const set = useApp((s) => s.set);
  const ex = scene.exp;
  const setE = <K extends keyof Scene['exp']>(k: K) => (v: Scene['exp'][K]) => update((s) => { s.exp[k] = v; }, 'exp-' + String(k));
  const rt = runtime(scene);
  const T = rt.tm.T;
  const [w, h] = exportDims(scene), fps = exportFps(scene);
  const [fw, fh] = outputSize(scene.ratio, ex.res);
  // Rough size estimate at "high" quality.
  const mb = ex.fmt === 'gif' ? (w * h * fps * T) / 2.2e6 : ((fw * fh * fps) / (1920 * 1080 * 30)) * 8 * T / 8 * (ex.fmt === 'webm' ? 0.8 : 1);
  const summary: [string, string][] = [
    ['Duration', `${T.toFixed(1)} s`], ['Output', `${w}×${h}`],
    ['Frames', `${Math.ceil(T * fps)}${ex.blur !== 'off' ? ` ×${BLUR[ex.blur].samples}` : ''}`],
    ['Est. size', `${(mb + (ex.music && ex.fmt !== 'gif' ? (T * 160) / 8 / 1024 : 0)).toFixed(1)} MB`],
  ];
  return (
    <>
      <Group title="Output">
        <Segmented label="Resolution" value={ex.res} options={[['720p', '720p'], ['1080p', '1080p'], ['1440p', '1440p'], ['4K', '4K']]} onChange={setE('res')} />
        <Segmented label="Frame rate" value={ex.fps} options={[[24, '24'], [30, '30'], [60, '60']]} onChange={setE('fps')} />
        <Segmented label="Format" value={ex.fmt} options={[['mp4', 'MP4'], ['webm', 'WebM'], ['gif', 'GIF']]} onChange={setE('fmt')} />
        {ex.fmt === 'gif' && <Info>GIFs are capped at 540p and 15 fps to keep files reasonable, and have no sound.</Info>}
        <Segmented label="Motion blur" value={ex.blur} options={[['off', 'Off'], ['soft', 'Soft'], ['strong', 'Strong']]} onChange={setE('blur')} />
        {ex.blur !== 'off' && <Info>Blends {BLUR[ex.blur].samples} sub-frames into every frame, like a film camera's shutter, so fast moves look smooth. Export takes about {BLUR[ex.blur].samples}× longer; the preview doesn't show it.</Info>}
      </Group>
      <MusicGroup />
      <div className="flex flex-col gap-3.5 border-t border-line px-5 pt-4 pb-6">
        <div className="grid grid-cols-2 gap-2">
          {summary.map(([k, v]) => (
            <div key={k} className="rounded-[10px] border border-line bg-card px-3 py-2.5">
              <div className="eyebrow text-[10px]!">{k}</div>
              <div className="num text-[16px] leading-snug font-semibold">{v}</div>
            </div>
          ))}
        </div>
        {scene.points.length < 2 && <div className="rounded-lg bg-accent-soft p-3 text-[13px]">Add at least two route points to export this scene. <button className="font-semibold underline" onClick={() => set({ step: 1, tool: 'draw', tm: -1, playing: false })}>Draw a route</button></div>}
        <Button variant="primary" className="h-11 text-[14px]" disabled={scene.points.length < 2} onClick={() => onExport(false)}>Export this scene</Button>
        {count > 1 && <>
          <Button variant="outline" className="h-11 text-[14px]" disabled={!readyCount} onClick={() => onExport(true)}>Export {readyCount === count ? `all ${count}` : readyCount} {readyCount === 1 ? 'scene' : 'scenes'}</Button>
          {readyCount < count && <Info>{count - readyCount} {count - readyCount === 1 ? 'scene has' : 'scenes have'} fewer than two points and will be skipped.</Info>}
        </>}
        <div className="text-[12px] leading-normal text-muted">Rendered in your browser with your GPU. Nothing is uploaded. Keep this tab visible while exporting.</div>
      </div>
    </>
  );
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Soundtrack: pick a local audio file, then volume, start point and fades. */
function MusicGroup() {
  const [scene, update] = useScene();
  const projectId = useApp((s) => s.project?.id ?? '');
  const say = useApp((s) => s.say);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const m = scene.exp.music;
  const T = runtime(scene).tm.T;
  const setM = <K extends keyof NonNullable<Scene['exp']['music']>>(k: K) => (v: NonNullable<Scene['exp']['music']>[K]) =>
    update((s) => { if (s.exp.music) s.exp.music[k] = v; }, 'music-' + String(k));
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { const music = await importMusic(f, projectId); update((s) => { s.exp.music = music; }); } catch (e) { say(e instanceof Error ? e.message : 'Could not read that audio file'); }
    setBusy(false);
  };
  const silentTail = m ? T - (m.duration - m.offset) : 0;
  return (
    <Group title="Music">
      <input ref={input} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      {!m ? (
        <>
          <Button className="h-[38px] border-dashed" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Reading audio…' : '+ Add a soundtrack'}</Button>
          <Info>Pick a song from your computer. It stays on this device and is mixed into the video when you export. Make sure you have the right to use it if you publish the video.</Info>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-[10px] border border-line bg-card px-3 py-2.5">
            <Icon name="music" size={18} className="flex-none text-accent" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold">{m.name}</div>
              <div className="num text-[11.5px] text-muted" title="Plays along with Preview">{fmtClock(m.duration)}</div>
            </div>
            <button className="border-0 bg-transparent p-0 text-[12px] text-accent hover:underline" onClick={() => input.current?.click()}>{busy ? '…' : 'Replace'}</button>
            <button className="border-0 bg-transparent p-0 text-[12px] text-red hover:underline" onClick={() => update((s) => { s.exp.music = null; })}>Remove</button>
          </div>
          <Slider label="Volume" value={Math.round(m.volume * 100)} min={0} max={100} step={5} format={(v) => v + '%'} onChange={(v) => setM('volume')(v / 100)} />
          <Slider label="Start the song at" value={m.offset} min={0} max={Math.max(0, Math.floor(m.duration - 1))} step={0.5} format={fmtClock} onChange={setM('offset')} />
          <Slider label="Fade in" value={m.fadeIn} min={0} max={5} step={0.5} format={(v) => v + ' s'} onChange={setM('fadeIn')} />
          <Slider label="Fade out" value={m.fadeOut} min={0} max={10} step={0.5} format={(v) => v + ' s'} onChange={setM('fadeOut')} />
          {silentTail > 0.5 && <Info>The song ends {silentTail.toFixed(1)} s before the video does; the rest is silent. Start it earlier or slow the pace to fit.</Info>}
          {scene.exp.fmt === 'gif' && <Info>GIFs can't carry sound. Choose MP4 or WebM to include the music.</Info>}
        </>
      )}
    </Group>
  );
}

export function StepNav() {
  const step = useApp((s) => s.step);
  const set = useApp((s) => s.set);
  const go = (n: Step) => set({ step: n, playing: false, tm: n >= 4 ? 0 : -1, sel: -1, selSign: null });
  return (
    <nav aria-label="Animation workflow" className="step-nav mx-auto flex max-w-[720px] items-center gap-1 rounded-xl bg-panel p-[3px]">
      {STEP_LABELS.map((label, i) => {
        const n = (i + 1) as Step, on = step === n;
        return (
          <button key={label} aria-label={`Step ${n}: ${label}`} aria-current={on ? 'step' : undefined} title={`${label} (keyboard: ${n})`} onClick={() => go(n)}
            className={cx('flex h-[34px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[9px] border-0 px-2 text-[13px] whitespace-nowrap', on ? 'bg-card font-semibold text-text shadow-[0_1px_3px_rgba(0,0,0,.15)]' : 'bg-transparent text-text-2 hover:text-text')}>
            <span className={cx('num grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold',
              on ? 'bg-accent text-on-accent' : step > n ? 'bg-accent-soft text-text' : 'border border-line-x text-muted')}>{n}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

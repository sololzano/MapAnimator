import { useEffect, useMemo, useRef, useState } from 'react';
import { runtime } from '../../core/runtime';
import { formatTime } from '../../core/timing';
import type { MusicSettings, Pace, Scene } from '../../core/model';
import { SoundtrackPlayer, songPeaks } from '../../render/audio';
import { currentScene, useApp } from '../../state/store';
import { Button, Modal, Segmented, Slider } from '../../ui/controls';
import { Icon } from '../../ui/icons';

const LABEL_W = 108;

/** Playback loop: advances the playhead in real time while playing. */
export function usePlayback() {
  const playing = useApp((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), id = 0;
    const loop = (now: number) => {
      const st = useApp.getState(), sc = currentScene(st);
      if (!sc || !st.playing) return;
      const T = runtime(sc).tm.T;
      const t = Math.max(0, st.tm) + (now - last) / 1000;
      last = now;
      if (t >= T) { st.set({ tm: T, playing: false }); return; }
      st.set({ tm: t });
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [playing]);
}

/** Plays the scene's soundtrack in step with preview playback. */
export function useSoundtrack() {
  const playing = useApp((s) => s.playing);
  const music = useApp((s) => currentScene(s)?.exp.music ?? null);
  const T = useApp((s) => { const sc = currentScene(s); return sc && sc.points.length > 1 ? runtime(sc).tm.T : 0; });
  const player = useRef<SoundtrackPlayer | null>(null);
  useEffect(() => {
    player.current ??= new SoundtrackPlayer();
    const pl = player.current;
    if (!playing || !music || !T) { pl.stop(); return; }
    void pl.play(music, T, () => Math.max(0, useApp.getState().tm));
    return () => pl.stop();
  }, [playing, music, T]);
}

export function togglePlay() {
  const st = useApp.getState(), sc = currentScene(st);
  if (!sc) return;
  if (st.playing) { st.set({ playing: false }); return; }
  if (sc.points.length < 2) { st.say('Add at least two points to preview your animation'); return; }
  const T = runtime(sc).tm.T;
  let t = st.tm < 0 ? T : Math.min(st.tm, T);
  if (t >= T - 0.02) t = 0;
  st.set({ playing: true, tm: t, sel: -1, selSign: null });
}

function SeekControl({ T }: { T: number }) {
  const tm = useApp((s) => s.tm);
  const set = useApp((s) => s.set);
  return <input aria-label="Animation playhead" aria-valuetext={formatTime(tm < 0 ? T : Math.min(tm, T))} className="sr-only" type="range" min={0} max={T} step={0.1} value={tm < 0 ? T : Math.min(tm, T)} onChange={(e) => set({ tm: Number(e.target.value), playing: false })} />;
}

function TimeReadout({ T }: { T: number }) {
  const tm = useApp((s) => s.tm);
  const t = tm < 0 ? T : Math.min(tm, T);
  return (
    <div className="num flex items-baseline gap-1.5 text-[13px] font-medium">
      <span>{formatTime(t)}</span><span className="text-[12px] text-muted">/ {formatTime(T)}</span>
    </div>
  );
}

function Playhead({ T }: { T: number }) {
  const tm = useApp((s) => s.tm);
  const f = (tm < 0 ? T : Math.min(tm, T)) / (T || 1);
  return (
    <div className="pointer-events-none absolute top-0 bottom-0 w-0" style={{ left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${f})` }}>
      <div className="absolute top-0 bottom-0 left-[-1px] w-0.5 bg-inverse" />
      <div className="absolute top-0 left-[-7px] h-4 w-3.5 bg-inverse [clip-path:polygon(0_0,100%_0,100%_55%,50%_100%,0_55%)]" />
    </div>
  );
}

export function Timeline() {
  const scene = useApp((s) => currentScene(s)!);
  const playing = useApp((s) => s.playing);
  const set = useApp((s) => s.set);
  const rt = useMemo(() => runtime(scene), [scene]);
  const { T, pre, post, pauses } = rt.tm;
  const cam = scene.cam;
  const tlRef = useRef<HTMLDivElement>(null);

  const timeFromX = (clientX: number) => {
    const r = tlRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left - LABEL_W) / (r.width - LABEL_W))) * T;
  };
  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    set({ tm: timeFromX(e.clientX), playing: false });
    const move = (ev: MouseEvent) => set({ tm: timeFromX(ev.clientX) });
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const pct = (t: number) => `${(t / T) * 100}%`;
  const stp = T <= 12 ? 1 : T <= 30 ? 2 : T <= 70 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= T + 1e-6; t += stp) ticks.push(t);

  // Line track: hold → travel → pause → travel … → hold
  const segs: { a: number; b: number; kind: 'hold' | 'travel' | 'pause'; label: string }[] = [];
  const push = (a: number, b: number, kind: 'hold' | 'travel' | 'pause', label = '') => { if (b - a > 1e-6) segs.push({ a, b, kind, label }); };
  push(0, pre, 'hold', pre >= 1 ? 'hold' : '');
  let cur = pre, first = true;
  for (const q of pauses) {
    const a = rt.tm.timeAtP(q.p);
    push(cur, a, 'travel', first ? `Route · ${rt.tm.travel.toFixed(1)} s` : '');
    first = false;
    push(a, a + q.dur, 'pause', `${q.dur}s`);
    cur = a + q.dur;
  }
  push(cur, T - post, 'travel', first ? `Route · ${rt.tm.travel.toFixed(1)} s` : '');
  push(T - post, T, 'hold', post >= 1 ? 'hold' : '');

  const camLabel = cam.mode === 'overview'
    ? `Overview · ${cam.view ? 'custom framing' : 'auto fit'}`
    : `Follow line · ${cam.orient === 'heading' ? 'heading up' : 'north up'} · ×${(2 ** cam.zoom).toFixed(1)}`;

  return (
    <div className={'editor-timeline flex flex-none flex-col border-t border-line bg-bg ' + (scene.exp.music ? 'h-[clamp(180px,30vh,256px)]' : 'h-[clamp(150px,26vh,216px)]')}>
      <div className="timeline-toolbar flex h-[48px] flex-none items-center gap-2 border-b border-line px-3.5">
        <button title="Back to start" aria-label="Back to start" disabled={scene.points.length < 2} onClick={() => set({ tm: 0, playing: false })} className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-line bg-card p-0 hover:bg-panel disabled:opacity-40">
          <Icon name="rewind" size={14} strokeWidth={2} />
        </button>
        <button title="Preview animation (Space)" disabled={scene.points.length < 2} onClick={togglePlay} className="flex h-8 flex-none items-center gap-2 rounded-lg border-0 bg-inverse pr-3 pl-3 text-[13px] font-semibold text-on-inverse disabled:opacity-40">
          <Icon name={playing ? 'pause' : 'play'} size={13} strokeWidth={playing ? 3 : 1.5} className={playing ? '' : 'fill-current'} />
          {playing ? 'Pause' : 'Preview'}
        </button>
        <TimeReadout T={T} />
        <div className="flex-1" />
        <MotionBar />
      </div>
      {scene.points.length < 2 ? <div className="grid flex-1 place-items-center px-4 text-center text-[13px] text-muted">Your animation timeline will appear after you add two route points.</div> :
      <div ref={tlRef} onMouseDown={onDown} title="Drag to scrub your animation" className="relative flex min-h-0 flex-1 cursor-col-resize flex-col overflow-hidden select-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent">
        <SeekControl T={T} />
        <div className="grid h-6 flex-none" style={{ gridTemplateColumns: `${LABEL_W}px 1fr` }}>
          <div />
          <div className="timeline-ticks relative border-b border-line">
            {ticks.map((t) => (
              <div key={t} className="num absolute top-0 bottom-0 border-l border-line pt-[5px] pl-[5px] text-[10px] text-muted" style={{ left: pct(t) }}>{t}s</div>
            ))}
          </div>
        </div>
        <Track label="Line" color="var(--accent)">
          {segs.map((s, i) => (
            <div key={i} className={'num absolute top-0 bottom-0 flex items-center overflow-hidden rounded-[5px] px-2 text-[11px] font-medium whitespace-nowrap ' +
              (s.kind === 'hold' ? 'hatch text-muted' : s.kind === 'pause' ? 'bg-inverse text-on-inverse' : 'bg-accent text-on-accent shadow-[inset_0_0_0_1px_var(--bg)]')}
              style={{ left: pct(s.a), width: pct(s.b - s.a) }}>{s.label}</div>
          ))}
        </Track>
        <Track label="Camera" color="var(--blue)">
          <div className="num absolute top-0 bottom-0 flex items-center overflow-hidden rounded-[5px] bg-blue-soft px-2.5 text-[11px] font-medium whitespace-nowrap text-blue-ink" style={{ left: pct(pre), width: pct(T - pre - post) }}>{camLabel}</div>
          {cam.kfs.map((k) => (
            <div key={k.id} className="absolute top-1/2 -mt-1.5 -ml-1.5 h-[13px] w-[13px] rotate-45 border-2 border-bg bg-blue-ink shadow-[0_0_0_1px_var(--blue-ink)]" style={{ left: pct(rt.tm.timeAtP(k.p)) }} />
          ))}
        </Track>
        <Track label="Signs" color="var(--green)" last={!scene.exp.music}>
          {scene.signs.map((g) => {
            const a = rt.tm.timeAtP(rt.tm.signP.get(g.id) ?? 0), d = g.trigger === 'pause' ? g.pause : 0;
            return (
              <div key={g.id} className="absolute top-0 bottom-0 flex items-center gap-1.5 overflow-hidden rounded-[5px] border-l-[3px] border-green bg-green-soft px-[9px] text-[11.5px] font-semibold whitespace-nowrap text-green-ink"
                style={{ left: pct(g.trigger === 'always' ? 0 : a), ...(d ? { width: pct(d), minWidth: 60 } : { maxWidth: 110 }) }}>{g.title}</div>
            );
          })}
        </Track>
        {scene.exp.music && (
          <Track label="Music" color="var(--peach)" last>
            <MusicWave music={scene.exp.music} T={T} />
          </Track>
        )}
        <Playhead T={T} />
      </div>}
    </div>
  );
}

const PACES: [Pace, string][] = [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['custom', 'Custom']];

/** Pace, easing and holds: they shape the timeline, so they live on it. */
function MotionBar() {
  const scene = useApp((s) => currentScene(s)!);
  const update = useApp((s) => s.updateScene);
  const ex = scene.exp;
  const auto = runtime(scene).tm.auto;
  const [open, setOpen] = useState(false);
  const setE = <K extends keyof Scene['exp']>(k: K, v: Scene['exp'][K]) => update((s) => { s.exp[k] = v; }, 'exp-' + String(k));
  return (
    <>
      <Button className="h-8 flex-none px-2.5" onClick={() => { useApp.getState().set({ playing: false }); setOpen(true); }} aria-haspopup="dialog">Timing<span className="timing-summary text-[12px] font-normal text-muted">· {PACES.find(([v]) => v === ex.pace)?.[1]}</span></Button>
      {open && <Modal title="Animation timing" onClose={() => setOpen(false)}>
        <Segmented label="Pace" value={ex.pace} options={PACES} onChange={(v) => setE('pace', v)} />
        <p className="text-[13px] text-text-2">Normal pace draws this route in {auto.toFixed(1)} seconds. Signs and holds add to the total duration.</p>
        {ex.pace === 'custom' && (
          <Slider label="Playback speed" min={0.25} max={4} step={0.05} value={ex.speed} onChange={(v) => setE('speed', v)} format={(v) => `×${v.toFixed(2)}`} />
        )}
        <Slider label="Ease in & out" min={0} max={100} step={5} value={ex.ease} onChange={(v) => setE('ease', v)} format={(v) => `${v}%`} />
        <Slider label="Hold first frame" min={0} max={5} step={0.5} value={ex.pre} onChange={(v) => setE('pre', v)} format={(v) => `${v} s`} />
        <Slider label="Hold last frame" min={0} max={8} step={0.5} value={ex.post} onChange={(v) => setE('post', v)} format={(v) => `${v} s`} />
        <Button variant="primary" className="h-10 self-end px-6" onClick={() => setOpen(false)}>Done</Button>
      </Modal>}
    </>
  );
}

/** Waveform of the part of the song that plays under the video, shaped by volume and fades. */
function MusicWave({ music, T }: { music: MusicSettings; T: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => { let live = true; void songPeaks(music.asset).then((p) => { if (live) setPeaks(p); }); return () => { live = false; }; }, [music.asset]);
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !w) return;
    const dpr = window.devicePixelRatio || 1, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cs = getComputedStyle(cv);
    ctx.fillStyle = cs.getPropertyValue('--peach').trim() || '#fe640b';
    const bar = 3, mid = h / 2;
    for (let x = 0; x < w; x += bar) {
      const t = ((x + bar / 2) / w) * T, songT = music.offset + t;
      if (songT >= music.duration) break;
      const fi = music.fadeIn > 0 ? Math.min(1, t / music.fadeIn) : 1, fo = music.fadeOut > 0 ? Math.min(1, (T - t) / music.fadeOut) : 1;
      const g = music.volume * Math.max(0, Math.min(fi, fo));
      const amp = peaks ? peaks[Math.min(peaks.length - 1, Math.floor((songT / music.duration) * peaks.length))] : 0.15;
      const hh = Math.max(1, amp * g * (h - 2));
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x, mid - hh / 2, bar - 1, hh);
    }
  }, [peaks, w, music, T]);
  return (
    <div className="absolute inset-0 flex items-center overflow-hidden rounded-[5px] bg-panel" title={`${music.name} · from ${Math.floor(music.offset / 60)}:${String(Math.floor(music.offset % 60)).padStart(2, '0')}`}>
      <canvas ref={ref} className="h-full w-full" />
      <span className="pointer-events-none absolute left-2 max-w-[60%] truncate rounded bg-bg/80 px-1.5 text-[11px] font-semibold">{music.name}</span>
    </div>
  );
}

function Track({ label, color, children, last }: { label: string; color: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={'grid min-h-0 flex-1 ' + (last ? '' : 'border-b border-line')} style={{ gridTemplateColumns: `${LABEL_W}px 1fr` }}>
      <div className="flex items-center gap-2 pl-3.5 text-[12.5px] font-semibold"><span className="h-2 w-2 rounded-sm" style={{ background: color }} />{label}</div>
      <div className="relative my-1.5">{children}</div>
    </div>
  );
}

import { produce } from 'immer';
import { create } from 'zustand';
import { makeProject, makeScene, normalizeProject, rid, type Project, type Ratio, type Scene } from '../core/model';
import { deleteProject, listProjects, requestPersistence, saveProject } from '../storage/db';

export type Step = 1 | 2 | 3 | 4 | 5;
export type Tool = 'draw' | 'edit' | 'pan';
export type UiTheme = 'latte' | 'frappe';

interface History { past: Project[]; future: Project[]; mergeKey: string | null; mergeAt: number }

interface AppState {
  ready: boolean;
  projects: Project[];
  /** Open project (editor), or null on the projects page. */
  project: Project | null;
  si: number;
  step: Step;
  tool: Tool;
  sel: number;
  selSign: string | null;
  /** Playhead seconds; -1 = "show the finished route" (editing steps). */
  tm: number;
  playing: boolean;
  toast: string;
  uiTheme: UiTheme;
  /** Editor preference: show numbers on the route point handles. */
  showNumbers: boolean;
  history: History;

  load(): Promise<void>;
  setUiTheme(t: UiTheme): void;
  setShowNumbers(v: boolean): void;
  createProject(name: string, ratio: Ratio): Project;
  addProject(p: Project): void;
  removeProject(id: string): void;
  openProject(id: string): void;
  closeProject(): void;
  renameProject(name: string): void;
  /** Mutate the current scene with an Immer recipe. Same mergeKey within 1.2 s = one undo step. */
  updateScene(recipe: (s: Scene) => void, mergeKey?: string): void;
  setSceneIndex(i: number): void;
  addScene(copyCurrent: boolean): void;
  removeScene(i: number): void;
  undo(): void;
  redo(): void;
  set(p: Partial<Pick<AppState, 'step' | 'tool' | 'sel' | 'selSign' | 'tm' | 'playing'>>): void;
  say(msg: string): void;
}

const THEME_KEY = 'ecwh.uiTheme';
const NUMBERS_KEY = 'ecwh.showNumbers';

function readPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function initialTheme(): UiTheme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'latte' || t === 'frappe') return t;
  } catch { /* storage may be blocked */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'frappe' : 'latte';
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useApp = create<AppState>((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const p = get().project;
      if (p) void saveProject(p);
    }, 400);
  };

  /** Replace the open project, recording history. */
  const commit = (next: Project, mergeKey?: string) => {
    const { project, history } = get();
    if (!project || next === project) return;
    const now = performance.now();
    const merge = mergeKey != null && mergeKey === history.mergeKey && now - history.mergeAt < 1200;
    const past = merge ? history.past : [...history.past, project].slice(-200);
    const stamped = { ...next, updatedAt: Date.now() };
    set({
      project: stamped,
      projects: get().projects.map((p) => (p.id === stamped.id ? stamped : p)),
      history: { past, future: [], mergeKey: mergeKey ?? null, mergeAt: now },
    });
    scheduleSave();
  };

  const freshHistory = (): History => ({ past: [], future: [], mergeKey: null, mergeAt: 0 });

  return {
    ready: false, projects: [], project: null, si: 0, step: 1, tool: 'draw', sel: -1, selSign: null, tm: -1, playing: false,
    toast: '', uiTheme: initialTheme(), showNumbers: readPref(NUMBERS_KEY) === '1', history: freshHistory(),

    async load() {
      const projects = (await listProjects()).map(normalizeProject);
      set({ projects, ready: true });
    },
    setUiTheme(t) {
      try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
      set({ uiTheme: t });
    },
    setShowNumbers(v) {
      try { localStorage.setItem(NUMBERS_KEY, v ? '1' : '0'); } catch { /* ignore */ }
      set({ showNumbers: v });
    },
    createProject(name, ratio) {
      const p = makeProject(name.trim() || 'Untitled journey', [makeScene('Scene 1', { ratio })]);
      void saveProject(p);
      void requestPersistence();
      set({ projects: [p, ...get().projects] });
      return p;
    },
    addProject(p) {
      void saveProject(p);
      set({ projects: [p, ...get().projects.filter((x) => x.id !== p.id)] });
    },
    removeProject(id) {
      void deleteProject(id);
      set({ projects: get().projects.filter((p) => p.id !== id) });
    },
    openProject(id) {
      const p = get().projects.find((x) => x.id === id);
      if (!p) return;
      set({ project: p, si: 0, step: 1, tool: p.scenes[0].points.length ? 'edit' : 'draw', sel: -1, selSign: null, tm: -1, playing: false, history: freshHistory() });
    },
    closeProject() {
      clearTimeout(saveTimer);
      const p = get().project;
      if (p) void saveProject(p);
      set({ project: null, playing: false, history: freshHistory() });
    },
    renameProject(name) {
      const p = get().project;
      if (p) commit({ ...p, name }, 'rename-project');
    },
    updateScene(recipe, mergeKey) {
      const { project, si } = get();
      if (!project) return;
      commit(produce(project, (d) => { recipe(d.scenes[si]); }), mergeKey);
    },
    setSceneIndex(i) {
      set({ si: i, sel: -1, selSign: null, tm: get().step >= 4 ? 0 : -1, playing: false });
    },
    addScene(copyCurrent) {
      const { project, si } = get();
      if (!project) return;
      const cur = project.scenes[si];
      const s: Scene = copyCurrent
        ? { ...structuredClone(cur), id: rid('s'), name: cur.name + ' copy' }
        : makeScene('Scene ' + (project.scenes.length + 1), { ratio: cur.ratio, look: { ...cur.look }, cam: { ...cur.cam, kfs: [] }, exp: { ...cur.exp } });
      commit({ ...project, scenes: [...project.scenes, s] });
      set({ si: project.scenes.length, sel: -1, selSign: null, tm: get().step >= 4 ? 0 : -1, playing: false });
    },
    removeScene(i) {
      const { project, si } = get();
      if (!project || project.scenes.length < 2) return;
      commit({ ...project, scenes: project.scenes.filter((_, j) => j !== i) });
      set({ si: Math.max(0, Math.min(si, project.scenes.length - 2)), tm: -1 });
    },
    undo() {
      const { project, history } = get();
      if (!project || !history.past.length) return;
      const prev = history.past[history.past.length - 1];
      set({
        project: prev, projects: get().projects.map((p) => (p.id === prev.id ? prev : p)),
        si: Math.min(get().si, prev.scenes.length - 1), sel: -1,
        history: { past: history.past.slice(0, -1), future: [project, ...history.future], mergeKey: null, mergeAt: 0 },
      });
      scheduleSave();
    },
    redo() {
      const { project, history } = get();
      if (!project || !history.future.length) return;
      const next = history.future[0];
      set({
        project: next, projects: get().projects.map((p) => (p.id === next.id ? next : p)),
        si: Math.min(get().si, next.scenes.length - 1), sel: -1,
        history: { past: [...history.past, project], future: history.future.slice(1), mergeKey: null, mergeAt: 0 },
      });
      scheduleSave();
    },
    set(p) { set(p); },
    say(msg) {
      clearTimeout(toastTimer);
      set({ toast: msg });
      toastTimer = setTimeout(() => set({ toast: '' }), 2800);
    },
  };
});

export function currentScene(s: { project: Project | null; si: number }): Scene | null {
  return s.project ? s.project.scenes[s.si] ?? s.project.scenes[0] : null;
}

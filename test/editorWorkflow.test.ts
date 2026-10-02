import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProject, makeScene } from '../src/core/model';
import { runtime } from '../src/core/runtime';

vi.mock('../src/storage/db', () => ({
  deleteProject: vi.fn(), listProjects: vi.fn(async () => []), pruneAssets: vi.fn(),
  requestPersistence: vi.fn(), saveProject: vi.fn(),
}));

let useApp: typeof import('../src/state/store').useApp;
let togglePlay: typeof import('../src/features/editor/Timeline').togglePlay;

beforeAll(async () => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  ({ useApp } = await import('../src/state/store'));
  ({ togglePlay } = await import('../src/features/editor/Timeline'));
});

beforeEach(() => {
  vi.useFakeTimers();
  const scene = makeScene('Route', { points: [
    { id: 'a', lng: -9.14, lat: 38.72 }, { id: 'b', lng: -8.63, lat: 41.16 },
  ] });
  const project = makeProject('Journey', [scene]);
  useApp.setState({ project, projects: [project], si: 0, step: 1, tool: 'edit',
    tm: -1, playing: false, sel: -1, selSign: null, toast: '',
    history: { past: [], future: [], mergeKey: null, mergeAt: 0 },
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
afterAll(() => vi.unstubAllGlobals());

describe('map animation workflow', () => {
  it('previews from the beginning in the animation camera view', () => {
    togglePlay();
    expect(useApp.getState()).toMatchObject({ step: 5, playing: true, tm: 0 });
  });

  it('resumes a paused camera preview and restarts a finished one', () => {
    useApp.setState({ step: 4, tm: 2 });
    togglePlay();
    expect(useApp.getState()).toMatchObject({ step: 4, playing: true, tm: 2 });
    togglePlay();
    expect(useApp.getState().playing).toBe(false);
    useApp.setState({ tm: runtime(useApp.getState().project!.scenes[0]).tm.T });
    togglePlay();
    expect(useApp.getState()).toMatchObject({ playing: true, tm: 0 });
  });

  it('keeps an incomplete route editable instead of starting a blank preview', () => {
    useApp.getState().updateScene((s) => { s.points.pop(); });
    togglePlay();
    expect(useApp.getState()).toMatchObject({ step: 1, playing: false, tm: -1 });
    expect(useApp.getState().toast).toContain('at least two points');
  });

  it('starts an empty scene in Draw mode and switches existing routes to Edit mode', () => {
    useApp.setState({ step: 5, tm: 2 });
    useApp.getState().addScene(false);
    expect(useApp.getState()).toMatchObject({ si: 1, step: 1, tool: 'draw', tm: -1 });
    useApp.getState().setSceneIndex(0);
    expect(useApp.getState()).toMatchObject({ si: 0, tool: 'edit' });
    useApp.getState().setSceneIndex(1);
    expect(useApp.getState()).toMatchObject({ si: 1, tool: 'draw' });
  });

  it('keeps a duplicated route ready to edit', () => {
    const points = useApp.getState().project!.scenes[0].points;
    useApp.getState().addScene(true);
    expect(useApp.getState()).toMatchObject({ si: 1, tool: 'edit' });
    expect(useApp.getState().project!.scenes[1].points).toEqual(points);
  });
});

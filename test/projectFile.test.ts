import { describe, expect, it } from 'vitest';
import { makeProject, makeScene, makeSign, normalizeScene } from '../src/core/model';
import { projectFromFile } from '../src/storage/projectFile';

describe('project files', () => {
  it('keep travel modes, hidden legs and the scene travel mode', async () => {
    const s = makeScene('s', {
      travel: 'moto',
      points: [
        { id: 'a', lng: 0, lat: 0 },
        { id: 'b', lng: 1, lat: 0, mode: 'train', hidden: true },
      ],
    });
    s.signs = [makeSign('b', { title: 'B' })];
    const file = new File([JSON.stringify(makeProject('p', [s]))], 'p.json');
    const { project, assets } = await projectFromFile(file);
    const out = project.scenes[0];
    expect(out.travel).toBe('moto');
    expect(out.points[1].mode).toBe('train');
    expect(out.points[1].hidden).toBe(true);
    expect(out.signs[0].pointId).toBe(out.points[1].id);
    expect(assets).toEqual([]);
  });
  it('drops photo references whose image is missing from the file', async () => {
    const s = makeScene('s', { points: [{ id: 'a', lng: 0, lat: 0 }] });
    s.signs = [makeSign('a', { photo: 'a123' })];
    const { project } = await projectFromFile(new File([JSON.stringify(makeProject('p', [s]))], 'p.json'));
    expect(project.scenes[0].signs[0].photo).toBeUndefined();
  });
});

describe('soundtrack & motion blur settings', () => {
  it('older scenes get motion blur off and no music', () => {
    const s = makeScene('old');
    const legacy = { ...s, exp: { ...s.exp, blur: undefined, music: undefined } } as unknown as typeof s;
    const n = normalizeScene(legacy);
    expect(n.exp.blur).toBe('off');
    expect(n.exp.music).toBeNull();
  });
  it('drops a soundtrack whose audio is not in the file', async () => {
    const s = makeScene('m', { points: [{ id: 'a', lng: 0, lat: 0 }, { id: 'b', lng: 1, lat: 0 }] });
    s.exp = { ...s.exp, blur: 'soft', music: { asset: 'a1', name: 'Song', duration: 120, volume: 0.8, offset: 10, fadeIn: 1, fadeOut: 3 } };
    const { project } = await projectFromFile(new File([JSON.stringify(makeProject('p', [s]))], 'p.json'));
    expect(project.scenes[0].exp.music).toBeNull();
    expect(project.scenes[0].exp.blur).toBe('soft');
  });
});

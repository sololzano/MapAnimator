// Soundtrack: the original audio file is stored locally; it is decoded with the
// Web Audio API and mixed once (volume, start offset, fades) with an
// OfflineAudioContext. Preview plays that exact mix; export encodes it.
import { rid, type MusicSettings } from '../core/model';
import { getAsset, putAsset } from '../storage/db';

export const MUSIC_MAX_BYTES = 60 * 1024 * 1024;
const SAMPLE_RATE = 48000;

let ctx: AudioContext | null = null;
function audioContext(): AudioContext {
  ctx ??= new AudioContext({ sampleRate: SAMPLE_RATE });
  return ctx;
}

const decoded = new Map<string, Promise<AudioBuffer | null>>();

/** Decoded song (cached per asset). */
export function decodeMusic(asset: string): Promise<AudioBuffer | null> {
  let p = decoded.get(asset);
  if (!p) {
    p = (async () => {
      const a = await getAsset(asset);
      if (!a) return null;
      return audioContext().decodeAudioData(await a.blob.arrayBuffer());
    })().catch(() => null);
    decoded.set(asset, p);
  }
  return p;
}

/** Store an audio file as a project asset. Throws a friendly error for unsupported files. */
export async function importMusic(file: File, projectId: string): Promise<MusicSettings> {
  if (file.size > MUSIC_MAX_BYTES) throw new Error('That audio file is larger than 60 MB. Try a shorter or more compressed version (MP3, M4A, OGG).');
  let buf: AudioBuffer;
  try {
    buf = await audioContext().decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error('This browser cannot play that audio file. MP3, M4A/AAC, OGG, WAV and FLAC usually work.');
  }
  const id = rid('a');
  await putAsset({ id, projectId, blob: file.slice(0, file.size, file.type || 'application/octet-stream'), w: 0, h: 0, createdAt: Date.now(), kind: 'audio' });
  decoded.set(id, Promise.resolve(buf));
  return {
    asset: id, name: file.name.replace(/\.[^.]+$/, ''), duration: buf.duration,
    volume: 0.8, offset: 0, fadeIn: 0.5, fadeOut: Math.min(3, Math.max(0, buf.duration / 4)),
  };
}

const mixes = new Map<string, Promise<AudioBuffer | null>>();

/**
 * The soundtrack exactly as it will be in the video: `seconds` long, stereo 48 kHz,
 * song started at `offset`, scaled by `volume`, faded in and out.
 */
export function renderSoundtrack(music: MusicSettings, seconds: number): Promise<AudioBuffer | null> {
  const key = JSON.stringify([music.asset, music.volume, music.offset, music.fadeIn, music.fadeOut, seconds.toFixed(3)]);
  let p = mixes.get(key);
  if (!p) {
    p = (async () => {
      const song = await decodeMusic(music.asset);
      if (!song) return null;
      const length = Math.max(1, Math.ceil(seconds * SAMPLE_RATE));
      const off = new OfflineAudioContext(2, length, SAMPLE_RATE);
      const src = off.createBufferSource();
      src.buffer = song;
      const gain = off.createGain();
      const v = Math.max(0, Math.min(1, music.volume));
      const fi = Math.min(music.fadeIn, seconds / 2), fo = Math.min(music.fadeOut, seconds / 2);
      gain.gain.setValueAtTime(fi > 0 ? 0 : v, 0);
      if (fi > 0) gain.gain.linearRampToValueAtTime(v, fi);
      gain.gain.setValueAtTime(v, Math.max(fi, seconds - fo));
      if (fo > 0) gain.gain.linearRampToValueAtTime(0, seconds);
      src.connect(gain).connect(off.destination);
      src.start(0, Math.max(0, Math.min(music.offset, song.duration)));
      return off.startRendering();
    })().catch(() => null);
    mixes.set(key, p);
    // Keep the cache small: only the latest few mixes.
    if (mixes.size > 6) mixes.delete(mixes.keys().next().value!);
  }
  return p;
}

const peaksCache = new Map<string, Float32Array>();

/** Peak amplitude per bin over the whole song, for the timeline waveform. */
export async function songPeaks(asset: string, bins = 2000): Promise<Float32Array | null> {
  const key = asset + ':' + bins;
  const hit = peaksCache.get(key);
  if (hit) return hit;
  const song = await decodeMusic(asset);
  if (!song) return null;
  const out = new Float32Array(bins);
  const chans = Array.from({ length: song.numberOfChannels }, (_, c) => song.getChannelData(c));
  const per = song.length / bins;
  for (let b = 0; b < bins; b++) {
    let m = 0;
    const a = Math.floor(b * per), e = Math.min(song.length, Math.floor((b + 1) * per));
    for (let i = a; i < e; i += 8) for (const ch of chans) { const x = Math.abs(ch[i]); if (x > m) m = x; }
    out[b] = m;
  }
  peaksCache.set(key, out);
  return out;
}

/** Plays the rendered soundtrack from a given time, in sync with the preview. */
export class SoundtrackPlayer {
  private node: AudioBufferSourceNode | null = null;
  private token = 0;

  /** `from` is read after the mix is ready, so a slow first render doesn't put the sound behind the picture. */
  async play(music: MusicSettings, seconds: number, from: () => number) {
    this.stop();
    const token = ++this.token;
    const ac = audioContext();
    if (ac.state === 'suspended') await ac.resume().catch(() => {});
    const mix = await renderSoundtrack(music, seconds);
    if (!mix || token !== this.token) return;
    const at = from();
    if (at >= mix.duration) return;
    const node = ac.createBufferSource();
    node.buffer = mix;
    node.connect(ac.destination);
    node.start(0, Math.max(0, at));
    this.node = node;
  }

  stop() {
    this.token++;
    try { this.node?.stop(); } catch { /* already stopped */ }
    this.node?.disconnect();
    this.node = null;
  }
}

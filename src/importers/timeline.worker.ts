/// <reference lib="webworker" />
import { parseTimelineJson } from './timeline';

// Parses a (possibly huge) Google Timeline JSON off the UI thread.
self.onmessage = async (e: MessageEvent<File>) => {
  try {
    const text = await e.data.text();
    const result = parseTimelineJson(JSON.parse(text));
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

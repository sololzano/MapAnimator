// On-screen counters card, drawn inside the video frame (preview and export).
import type { HudItem } from '../core/hud';
import type { HudSettings } from '../core/model';
import type { Rect } from './overlay';
import { SIGN_FONT } from './signs';

/** Width of `text` when every digit gets the same cell (tabular figures by hand). */
function tabularWidth(ctx: CanvasRenderingContext2D, text: string, digitW: number): number {
  let w = 0;
  for (const ch of text) w += /\d/.test(ch) ? digitW : ctx.measureText(ch).width;
  return w;
}

function drawTabular(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, digitW: number) {
  ctx.textAlign = 'left';
  for (const ch of text) {
    if (/\d/.test(ch)) {
      const cw = ctx.measureText(ch).width;
      ctx.fillText(ch, x + (digitW - cw) / 2, y);
      x += digitW;
    } else {
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width;
    }
  }
}

export function drawHud(ctx: CanvasRenderingContext2D, items: HudItem[], hud: HudSettings, frame: Rect, k: number, dark: boolean, accent: string) {
  if (!items.length) return;
  const pad = 12 * k, gap = 18 * k, labelPx = 9.5 * k, valuePx = 21 * k, margin = 22 * k;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${valuePx}px ${SIGN_FONT}`;
  const digitW = Math.max(...'0123456789'.split('').map((d) => ctx.measureText(d).width));
  const widths = items.map((it) => {
    ctx.font = `600 ${valuePx}px ${SIGN_FONT}`;
    const v = Math.max(tabularWidth(ctx, it.widest, digitW), tabularWidth(ctx, it.value, digitW));
    ctx.font = `700 ${labelPx}px ${SIGN_FONT}`;
    ctx.letterSpacing = `${1.2 * k}px`;
    const l = ctx.measureText(it.label.toUpperCase()).width;
    ctx.letterSpacing = '0px';
    return Math.max(v, l);
  });
  const bar = 3.5 * k;
  const w = bar + pad * 2 + widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  const h = pad * 1.7 + labelPx + 6 * k + valuePx * 0.95;
  const x = hud.corner.endsWith('l') ? frame.x + margin : frame.x + frame.w - margin - w;
  // Bottom-right shares the corner with the map credits: sit above them.
  const bottomLift = hud.corner === 'br' ? 22 * k : 0;
  const y = hud.corner.startsWith('t') ? frame.y + margin : frame.y + frame.h - margin - h - bottomLift;

  ctx.shadowColor = 'rgba(20,20,19,0.25)'; ctx.shadowBlur = 14 * k; ctx.shadowOffsetY = 4 * k;
  ctx.fillStyle = dark ? 'rgba(35,38,52,0.86)' : 'rgba(255,255,255,0.92)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 9 * k); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 9 * k); ctx.clip();
  ctx.fillStyle = accent; ctx.fillRect(x, y, bar, h);
  ctx.restore();

  let cx = x + bar + pad;
  items.forEach((it, i) => {
    if (i) {
      ctx.fillStyle = dark ? 'rgba(198,208,245,0.18)' : 'rgba(76,79,105,0.15)';
      ctx.fillRect(cx - gap / 2, y + pad * 0.8, Math.max(1, k), h - pad * 1.6);
    }
    ctx.font = `700 ${labelPx}px ${SIGN_FONT}`;
    ctx.letterSpacing = `${1.2 * k}px`;
    ctx.fillStyle = dark ? 'rgba(198,208,245,0.7)' : 'rgba(76,79,105,0.75)';
    ctx.textAlign = 'left';
    ctx.fillText(it.label.toUpperCase(), cx, y + pad * 0.85 + labelPx);
    ctx.letterSpacing = '0px';
    ctx.font = `600 ${valuePx}px ${SIGN_FONT}`;
    ctx.fillStyle = dark ? '#eff1f5' : '#232634';
    drawTabular(ctx, it.value, cx, y + pad * 0.85 + labelPx + 6 * k + valuePx * 0.82, digitW);
    cx += widths[i] + gap;
  });
  ctx.restore();
}

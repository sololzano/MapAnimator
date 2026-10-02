import type { Sign } from '../core/model';
import { drawCover } from './photos';

export const SIGN_FONT = '"Inter Variable", Inter, system-ui, sans-serif';

const font = (weight: number, px: number) => `${weight} ${px}px ${SIGN_FONT}`;

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function textW(ctx: CanvasRenderingContext2D, text: string, f: string, spacing = 0): number {
  ctx.font = f;
  ctx.letterSpacing = `${spacing}px`;
  const w = ctx.measureText(text).width;
  ctx.letterSpacing = '0px';
  return w;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function shadow(ctx: CanvasRenderingContext2D, blur: number, dy: number, alpha: number) {
  ctx.shadowColor = `rgba(20,20,19,${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
}

function noShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

export interface SignBox {
  w: number;
  h: number;
  /** Centre of the drawn bounds relative to the sign origin (unscaled). */
  ox: number;
  oy: number;
}

/** Photo box size for a design width, following the photo's shape (clamped to sane aspect ratios). */
function photoBox(img: ImageBitmap | null, width: number, minAspect = 0.75, maxAspect = 1.8): [number, number] {
  const aspect = img ? Math.max(minAspect, Math.min(maxAspect, img.width / img.height)) : 1.5;
  return [width, width / aspect];
}

/**
 * Draws a signboard centred at (0,0) in the current transform, in unscaled design units
 * (callers apply scale). `photo` is the decoded sign photo: undefined = the sign has no
 * photo, null = it has one that is still loading (a placeholder is drawn).
 */
export function drawSignBody(ctx: CanvasRenderingContext2D, g: Sign, accent: string, photo?: ImageBitmap | null): SignBox {
  const title = g.title || ' ', sub = g.sub || '';
  const hasPhoto = photo !== undefined;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  switch (g.style) {
    case 'postcard': {
      const tw = textW(ctx, title, font(600, 21)), sw = textW(ctx, sub.toUpperCase(), font(600, 10), 0.8);
      // With a photo it becomes a polaroid: photo on top, caption below.
      const [pw, ph] = hasPhoto ? photoBox(photo ?? null, 168) : [0, 0];
      const w = Math.max(hasPhoto ? pw + 18 : 130, Math.max(tw, sw) + 32);
      const capH = sub ? 60 : 44;
      const h = hasPhoto ? 9 + ph + capH - 6 : capH;
      ctx.save();
      ctx.rotate((-2 * Math.PI) / 180);
      shadow(ctx, 22, 8, 0.28);
      ctx.fillStyle = '#fffdf8';
      roundRect(ctx, -w / 2, -h / 2, w, h, 3); ctx.fill();
      noShadow(ctx);
      let ty = -h / 2;
      if (hasPhoto) {
        drawCover(ctx, photo ?? null, -pw / 2, -h / 2 + 9, pw, ph, 1.5);
        ty += 9 + ph - 6;
      }
      ctx.fillStyle = '#141413'; ctx.font = font(600, 21);
      ctx.fillText(title, -w / 2 + 16, ty + 32);
      if (sub) {
        ctx.fillStyle = '#5c5f77'; ctx.font = font(600, 10); ctx.letterSpacing = '0.8px';
        ctx.fillText(sub.toUpperCase(), -w / 2 + 16, ty + 49);
        ctx.letterSpacing = '0px';
      }
      // Tape strip
      ctx.save();
      ctx.translate(0, -h / 2);
      ctx.rotate((2 * Math.PI) / 180);
      ctx.globalAlpha *= 0.78;
      ctx.fillStyle = accent;
      ctx.fillRect(-22, -8, 44, 16);
      ctx.restore();
      ctx.restore();
      return { w, h, ox: 0, oy: 0 };
    }
    case 'post': {
      const tw = textW(ctx, title, font(650, 17)), sw = textW(ctx, sub, font(450, 10.5));
      const w = Math.max(130, Math.max(tw, sw) + 50), h = sub ? 52 : 38;
      const x = -w / 2, y = -h / 2, tip = w * 0.1;
      // A framed photo pinned to the post, above the board.
      const [pw, ph] = hasPhoto ? photoBox(photo ?? null, 112, 0.75, 1.6) : [0, 0];
      const frame = 5;
      ctx.save();
      // Pole
      ctx.fillStyle = '#4f3322';
      ctx.fillRect(x + 22, hasPhoto ? y - 10 : y + h - 2, 7, hasPhoto ? h + 36 : 26);
      if (hasPhoto) {
        const fx = x + 25.5 - pw / 2 - frame, fy = y - 10 - ph - frame * 2;
        shadow(ctx, 14, 5, 0.3);
        ctx.fillStyle = '#fffdf8';
        ctx.fillRect(fx, fy, pw + frame * 2, ph + frame * 2);
        noShadow(ctx);
        drawCover(ctx, photo ?? null, fx + frame, fy + frame, pw, ph, 0);
      }
      shadow(ctx, 20, 8, 0.3);
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + w - tip, y); ctx.lineTo(x + w, 0); ctx.lineTo(x + w - tip, y + h); ctx.lineTo(x, y + h); ctx.closePath();
      ctx.fillStyle = '#7a5238'; ctx.fill();
      noShadow(ctx);
      ctx.lineWidth = 2; ctx.strokeStyle = '#4f3322'; ctx.stroke();
      ctx.fillStyle = '#faf9f5'; ctx.font = font(650, 17);
      ctx.fillText(title, x + 16, y + (sub ? 24 : 25));
      if (sub) { ctx.globalAlpha *= 0.9; ctx.font = font(450, 10.5); ctx.fillText(sub, x + 16, y + 41); }
      ctx.restore();
      // Bounds: board + pole below (+ photo above).
      const top = hasPhoto ? y - 10 - ph - frame * 2 : y, bottom = y + h + 24;
      const left = Math.min(x, hasPhoto ? x + 25.5 - pw / 2 - frame : x), right = x + w;
      return { w: right - left, h: bottom - top, ox: (left + right) / 2, oy: (top + bottom) / 2 };
    }
    case 'ticket': {
      const ink = luminance(accent) > 0.35 ? '#141413' : '#faf9f5';
      const tw = Math.max(textW(ctx, title, font(600, 20)), textW(ctx, 'ADMIT ONE', font(600, 10), 1.2));
      const stub = sub ? Math.min(120, textW(ctx, sub, font(500, 11)) + 24) : 0;
      // With a photo, the ticket grows taller and the photo fills a panel on the left.
      const h = hasPhoto ? 84 : 56;
      const pw = hasPhoto ? 84 : 0;
      const left = Math.max(110, tw + 28), w = pw + left + stub;
      const x = -w / 2, y = -h / 2;
      ctx.save();
      shadow(ctx, 20, 8, 0.28);
      ctx.fillStyle = accent;
      roundRect(ctx, x, y, w, h, 8); ctx.fill();
      noShadow(ctx);
      if (hasPhoto) {
        ctx.save();
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.clip();
        drawCover(ctx, photo ?? null, x, y, pw, h, 0);
        ctx.restore();
      }
      const tx = x + pw + 14, ty = y + (h - 56) / 2;
      ctx.fillStyle = ink;
      ctx.font = font(600, 10); ctx.letterSpacing = '1.2px';
      ctx.fillText('ADMIT ONE', tx, ty + 20);
      ctx.letterSpacing = '0px';
      ctx.font = font(600, 20);
      ctx.fillText(title, tx, ty + 43);
      if (sub) {
        const sx = x + pw + left;
        ctx.strokeStyle = ink; ctx.globalAlpha *= 0.55; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, y + 4); ctx.lineTo(sx, y + h - 4); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha /= 0.55;
        ctx.font = font(500, 11);
        ctx.fillText(sub, sx + 12, y + h / 2 + 4, stub - 20);
      }
      ctx.restore();
      return { w, h, ox: 0, oy: 0 };
    }
    case 'tag': {
      const tw = textW(ctx, title, font(600, 14)), sw = sub ? textW(ctx, sub, font(400, 11)) : 0;
      // With a photo, a round avatar replaces the dot and the pill grows a little.
      const h = hasPhoto ? 44 : 34, lead = hasPhoto ? 4 + 36 + 10 : 11 + 9 + 9;
      const w = lead + tw + (sub ? 9 + sw : 0) + 15;
      const x = -w / 2, y = -h / 2;
      ctx.save();
      shadow(ctx, 16, 6, 0.3);
      ctx.fillStyle = '#232634';
      roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
      noShadow(ctx);
      if (hasPhoto) {
        drawCover(ctx, photo ?? null, x + 4, -18, 36, 36, 18);
        ctx.beginPath(); ctx.arc(x + 22, 0, 18, 0, Math.PI * 2);
        ctx.lineWidth = 2; ctx.strokeStyle = accent; ctx.stroke();
      } else {
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(x + 11 + 4.5, 0, 4.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#faf9f5'; ctx.font = font(600, 14);
      ctx.fillText(title, x + lead, 5);
      if (sub) { ctx.globalAlpha *= 0.75; ctx.font = font(400, 11); ctx.fillText(sub, x + lead + tw + 9, 4.5); }
      ctx.restore();
      return { w, h, ox: 0, oy: 0 };
    }
  }
}

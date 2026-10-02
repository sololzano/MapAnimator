import type { Sign } from '../core/model';

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

/**
 * Draws a signboard centred at (0,0) in the current transform, in unscaled
 * design units (callers apply scale). Returns its unscaled size.
 */
export function drawSignBody(ctx: CanvasRenderingContext2D, g: Sign, accent: string): { w: number; h: number } {
  const title = g.title || ' ', sub = g.sub || '';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  switch (g.style) {
    case 'postcard': {
      const tw = textW(ctx, title, font(600, 21)), sw = textW(ctx, sub.toUpperCase(), font(600, 10), 0.8);
      const w = Math.max(130, Math.max(tw, sw) + 32), h = sub ? 60 : 44;
      ctx.save();
      ctx.rotate((-2 * Math.PI) / 180);
      shadow(ctx, 22, 8, 0.28);
      ctx.fillStyle = '#fffdf8';
      roundRect(ctx, -w / 2, -h / 2, w, h, 3); ctx.fill();
      noShadow(ctx);
      ctx.fillStyle = '#141413'; ctx.font = font(600, 21);
      ctx.fillText(title, -w / 2 + 16, -h / 2 + 32);
      if (sub) {
        ctx.fillStyle = '#5c5f77'; ctx.font = font(600, 10); ctx.letterSpacing = '0.8px';
        ctx.fillText(sub.toUpperCase(), -w / 2 + 16, -h / 2 + 49);
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
      return { w, h };
    }
    case 'post': {
      const tw = textW(ctx, title, font(650, 17)), sw = textW(ctx, sub, font(450, 10.5));
      const w = Math.max(130, Math.max(tw, sw) + 50), h = sub ? 52 : 38;
      const x = -w / 2, y = -h / 2, tip = w * 0.1;
      ctx.save();
      // Pole
      ctx.fillStyle = '#4f3322';
      ctx.fillRect(x + 22, y + h - 2, 7, 26);
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
      return { w, h: h + 24 };
    }
    case 'ticket': {
      const ink = luminance(accent) > 0.35 ? '#141413' : '#faf9f5';
      const tw = Math.max(textW(ctx, title, font(600, 20)), textW(ctx, 'ADMIT ONE', font(600, 10), 1.2));
      const stub = sub ? Math.min(120, textW(ctx, sub, font(500, 11)) + 24) : 0;
      const left = Math.max(110, tw + 28), w = left + stub, h = 56;
      const x = -w / 2, y = -h / 2;
      ctx.save();
      shadow(ctx, 20, 8, 0.28);
      ctx.fillStyle = accent;
      roundRect(ctx, x, y, w, h, 8); ctx.fill();
      noShadow(ctx);
      ctx.fillStyle = ink;
      ctx.font = font(600, 10); ctx.letterSpacing = '1.2px';
      ctx.fillText('ADMIT ONE', x + 14, y + 20);
      ctx.letterSpacing = '0px';
      ctx.font = font(600, 20);
      ctx.fillText(title, x + 14, y + 43);
      if (sub) {
        ctx.strokeStyle = ink; ctx.globalAlpha *= 0.55; ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + left, y + 4); ctx.lineTo(x + left, y + h - 4); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha /= 0.55;
        ctx.font = font(500, 11);
        ctx.fillText(sub, x + left + 12, y + h / 2 + 4, stub - 20);
      }
      ctx.restore();
      return { w, h };
    }
    case 'tag': {
      const tw = textW(ctx, title, font(600, 14)), sw = sub ? textW(ctx, sub, font(400, 11)) : 0;
      const w = 11 + 9 + 9 + tw + (sub ? 9 + sw : 0) + 15, h = 34;
      const x = -w / 2, y = -h / 2;
      ctx.save();
      shadow(ctx, 16, 6, 0.3);
      ctx.fillStyle = '#232634';
      roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
      noShadow(ctx);
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(x + 11 + 4.5, 0, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#faf9f5'; ctx.font = font(600, 14);
      ctx.fillText(title, x + 29, 5);
      if (sub) { ctx.globalAlpha *= 0.75; ctx.font = font(400, 11); ctx.fillText(sub, x + 29 + tw + 9, 4.5); }
      ctx.restore();
      return { w, h };
    }
  }
}

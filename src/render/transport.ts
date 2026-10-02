// Transport icons for the tip of the line.
// Badge icons: Tabler Icons (MIT, https://tabler.io/icons), 24×24 outline paths.
// The motorcycle is drawn by hand: side view with rider, spinning wheels.
import type { TravelMode } from '../core/model';

export const MODE_PATHS: Record<TravelMode, string[]> = {
  car: ['M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6m-6 -6h15m-6 0v-5'],
  moto: ['M2 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M16 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M7.5 14h5l4 -4h-10.5m1.5 4l4 -4', 'M13 6h2l1.5 3l2 4'],
  walk: ['M12 4a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M7 21l3 -4', 'M16 21l-2 -4l-3 -3l1 -6', 'M6 12l2 -3l4 -1l3 3l3 1'],
  bike: ['M2 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0', 'M16 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0', 'M12 19v-4l-3 -3l5 -4l2 3h3', 'M13.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0'],
  bus: ['M4 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M16 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M4 17h-2v-11a1 1 0 0 1 1 -1h14a5 7 0 0 1 5 7v5h-2m-4 0h-8', 'M16 5l1.5 7l4.5 0', 'M2 10l15 0', 'M7 5l0 5', 'M12 5l0 5'],
  train: ['M21 13c0 -3.87 -3.37 -7 -10 -7h-8', 'M3 15h16a2 2 0 0 0 2 -2', 'M3 6v5h17.5', 'M3 11v4', 'M8 11v-5', 'M13 11v-4.5', 'M3 19h18'],
  plane: ['M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3l4 7'],
  boat: ['M2 20a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1', 'M4 18l-1 -5h18l-2 4', 'M5 13v-6h8l4 6', 'M7 7v-4h-1'],
  other: ['M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3'],
};

const pathCache = new Map<string, Path2D>();
const p2d = (d: string) => {
  let p = pathCache.get(d);
  if (!p) { p = new Path2D(d); pathCache.set(d, p); }
  return p;
};

/** Pose of a side-view icon: which way it faces and how much it tilts with the climb (radians). */
export interface Pose { facingLeft: boolean; tilt: number }

/** Round badge with a white mode icon, facing the direction of travel. */
export function drawModeBadge(ctx: CanvasRenderingContext2D, mode: TravelMode, color: string, ring: string, s: number, pose: Pose) {
  ctx.save();
  ctx.scale(s, s);
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
  ctx.fillStyle = color; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 3; ctx.strokeStyle = ring; ctx.stroke();
  ctx.rotate(pose.facingLeft ? -pose.tilt : pose.tilt);
  if (pose.facingLeft) ctx.scale(-1, 1);
  ctx.translate(-10.2, -10.2);
  ctx.scale(0.85, 0.85);
  ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const d of MODE_PATHS[mode]) ctx.stroke(p2d(d));
  ctx.restore();
}

/**
 * Side-view motorcycle with rider, facing right in a 64×44 box centred between the
 * wheels at axle height. `wheel` is the wheel rotation in radians.
 */
export function drawMotorcycle(ctx: CanvasRenderingContext2D, color: string, ring: string, s: number, pose: Pose, wheel: number, bob: number) {
  ctx.save();
  ctx.scale(s, s);
  // Ground shadow (does not tilt or flip).
  ctx.beginPath(); ctx.ellipse(0, 8, 27, 2.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,20,19,0.25)'; ctx.fill();
  ctx.rotate(pose.facingLeft ? -pose.tilt : pose.tilt);
  if (pose.facingLeft) ctx.scale(-1, 1);
  ctx.translate(0, -2 + bob);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const dark = '#232634', frame = '#414559', chrome = '#b5bfe2', rider = '#303446';
  // Two passes: a halo in the ring colour so the bike reads on any map, then the bike.
  for (const halo of [true, false]) {
    const fill = (c: string) => { ctx.fillStyle = halo ? ring : c; ctx.fill(); if (halo) { ctx.lineWidth = 3; ctx.strokeStyle = ring; ctx.stroke(); } };
    const line = (c: string, w: number, pts: number[]) => {
      ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.strokeStyle = halo ? ring : c; ctx.lineWidth = w + (halo ? 3 : 0); ctx.stroke();
    };
    const wheelAt = (cx: number) => {
      ctx.beginPath(); ctx.arc(cx, 0, 9, 0, Math.PI * 2); fill(dark);
      if (halo) return;
      ctx.beginPath(); ctx.arc(cx, 0, 6, 0, Math.PI * 2); ctx.strokeStyle = chrome; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        const a = wheel + (k * Math.PI * 2) / 5;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 1.6, Math.sin(a) * 1.6); ctx.lineTo(cx + Math.cos(a) * 6, Math.sin(a) * 6); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, 0, 1.8, 0, Math.PI * 2); ctx.fillStyle = chrome; ctx.fill();
    };

    wheelAt(-20);
    wheelAt(20);
    line(frame, 3, [-20, 0, -5, -5]); // swingarm
    line(chrome, 3, [20, 0, 13, -17]); // fork
    line(chrome, 2.6, [-2, -2, -22, -6.5]); // exhaust
    // Engine
    ctx.beginPath(); ctx.roundRect(-6, -10, 13, 9, 2.5); fill(frame);
    // Front fender
    ctx.beginPath(); ctx.arc(20, 0, 11.5, (-160 * Math.PI) / 180, (-35 * Math.PI) / 180);
    ctx.strokeStyle = halo ? ring : color; ctx.lineWidth = 2.6 + (halo ? 3 : 0); ctx.stroke();
    // Tail and rear fender
    ctx.beginPath(); ctx.moveTo(-6, -12.5); ctx.lineTo(-24, -12); ctx.quadraticCurveTo(-28.5, -11.5, -27, -7.5); ctx.lineTo(-15, -8.5); ctx.closePath(); fill(color);
    // Tank
    ctx.beginPath(); ctx.moveTo(-3, -12.5); ctx.quadraticCurveTo(3, -18.5, 12, -16); ctx.lineTo(10, -9); ctx.lineTo(-1, -9); ctx.closePath(); fill(color);
    // Seat
    ctx.beginPath(); ctx.moveTo(-17, -12.2); ctx.quadraticCurveTo(-10, -15.5, -2.5, -13.2); ctx.lineTo(-3, -11.2); ctx.lineTo(-17, -10.8); ctx.closePath(); fill(dark);
    line(dark, 2.4, [13, -17, 8.5, -21.5]); // handlebar
    // Headlight on the front of the fork, clear of the rider's hands
    ctx.beginPath(); ctx.ellipse(18.4, -12.2, 2, 2.6, -0.35, 0, Math.PI * 2); fill('#f9e2af');
    // Rider: leg, torso, arm, helmet
    line(rider, 4.6, [-7.5, -15.5, 3, -10.5, -0.5, -2.5]);
    line(rider, 7, [-7.5, -16.5, -1, -27]);
    line(rider, 3.6, [-0.5, -26, 6, -22.5, 9.5, -21.5]);
    ctx.beginPath(); ctx.arc(1.5, -32.5, 5.4, 0, Math.PI * 2); fill(color);
    if (!halo) {
      // Visor
      ctx.beginPath(); ctx.moveTo(3, -34.5); ctx.quadraticCurveTo(7.5, -33.5, 6.6, -30.2); ctx.lineTo(2.8, -30.8); ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
    }
  }
  ctx.restore();
}

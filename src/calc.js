import { Vector3 as V3 } from 'three';
import { DEG, fmtLen, fmtCm } from './format.js';

export const CAM_HOLE_MM = 9;

/** Area of a polygon lying in the XZ plane. */
function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}

/** Largest vent hole (mm) that a spider of this leg span (inches) cannot squeeze through. */
export function suggestedVentMm(legSpanIn) {
  return legSpanIn < 1.5 ? 1 : legSpanIn < 4 ? 2 : 3;
}

/** Grid of vent hole positions (inches, centred on each wall). */
export function ventLayout(g) {
  const pitch = 0.36;
  const rows = g.hw > 3.5 ? 3 : 2;
  const ys = [];
  for (let k = 0; k < rows; k++) ys.push(g.H - 0.75 - k * 0.38);
  const nz = Math.max(2, Math.floor((g.D - 2 * g.t - 0.8) / pitch) + 1);
  const nx = Math.max(2, Math.floor((g.W - 2 * g.t - 0.8) / pitch) + 1);
  const zs = Array.from({ length: nz }, (_, i) => (i - (nz - 1) / 2) * pitch);
  const xs = Array.from({ length: nx }, (_, i) => (i - (nx - 1) / 2) * pitch);
  return { ys, zs, xs };
}

/** True when a right-wall vent would collide with the side-camera hole. */
export function ventBlockedByCamera(s, g, z, y) {
  return s.cam && s.cpos === 'side' && Math.abs(z) < 1 && Math.abs(y - g.camY) < 0.9;
}

/**
 * Derive all geometry, fit checks and the cut list from the design state.
 * Lengths are in inches, as in the saved state.
 */
export function analyze(s) {
  const { w: W, d: D, h: H, t } = s;
  const hw = H - t; // wall height
  const f = (v) => fmtLen(v, s.unit);
  const sd = s.decor ? Math.min(s.sd, Math.max(0.5, hw - 1)) : 0;
  const free = hw - sd;
  const L = s.ls;
  const m0 = Math.min(W, D);
  const iw = W - 2 * t;
  const idp = D - 2 * t;
  const fy = (s.decor ? t + sd : t) + 0.01; // floor (substrate) height
  const il = Math.max(W, D) - 2 * t; // longer inside dimension
  const is = Math.min(W, D) - 2 * t; // shorter inside dimension
  const tanH = Math.tan(26 * DEG);
  const tanV = Math.tan(20 * DEG);
  const dd = W - 2 * t - 0.05; // camera-to-far-wall distance (side camera)
  const dcl = H - 0.05 - fy; // camera-to-floor distance (top/corner camera)
  const arm = Math.min(s.brk, m0 * 0.4);

  const g = {
    W, D, H, t, hw, sd, free, L, m0, iw, idp, fy, il, is, dd, dcl, arm,
    camY: 0, cam: null, rows: [], cut: [], sheetNote: null,
    ventMm: s.ventMm == null ? suggestedVentMm(L) : s.ventMm,
  };

  if (s.cam && s.cpos === 'side') {
    const reach = dd * tanV;
    let y = Math.max(t + sd + 0.6, Math.min(t + sd + reach, H - 1.2));
    if (H - 1.2 < t + sd + 0.6) y = t + sd + reach;
    g.camY = y;
  }

  let camRow = null;
  let camCut = null;

  if (s.cam && s.cpos === 'top') {
    const sc = Math.max(0.5, Math.min(1, (m0 - 0.9) / 2));
    camCut = ['Lid camera hole', '9 mm, lid centre'];
    const cam = { mode: 'top', sc, C: null, pts: null };
    if (dcl > 0.3) {
      const vw = 0.975 * dcl;
      const vd = 0.728 * dcl;
      cam.C = new V3(0, H - 0.05, 0);
      const cw = Math.min(vw, iw);
      const cd = Math.min(vd, idp);
      cam.pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new V3((a * cw) / 2, fy, (b * cd) / 2));
      const ok = vw >= il && vd >= is;
      camRow = {
        ok,
        text: ok
          ? `The camera sees the whole floor at substrate level (about ${f(vw)} × ${f(vd)} of view).`
          : `The camera sees about ${f(vw)} × ${f(vd)} at substrate level, less than the ${f(il)} × ${f(is)} floor. Try the corner position, a wide-angle lens or a taller box.`,
      };
    } else {
      camRow = { ok: false, text: 'The camera is too close to the floor for a useful view. Raise the box or lower the substrate.' };
    }
    g.cam = cam;
  }

  if (s.cam && s.cpos === 'side') {
    const sc = Math.max(0.5, Math.min(1, Math.min(free, D - 0.9) / 1.9));
    camCut = ['Wall camera hole', `9 mm, right wall, ${f(g.camY)} up`];
    const C = new V3(W / 2 - t - 0.05, g.camY, 0);
    const halfW = Math.min(dd * tanH, idp / 2);
    const reach = dd * tanV;
    const lo = Math.max(t + 0.01, g.camY - reach);
    const hi = Math.min(H - 0.01, g.camY + reach);
    const x = -(W / 2 - t) + 0.01;
    const pts = [[-1, lo], [1, lo], [1, hi], [-1, hi]].map(([a, y]) => new V3(x, y, a * halfW));
    const ok = g.camY - reach <= t + sd + 0.3;
    camRow = {
      ok,
      text: ok
        ? `The side camera sees about ${f(2 * dd * tanH)} of the far wall, from the substrate up to ${f(g.camY + reach)} high, so ground and wall climbing are both in frame.`
        : `The side camera view starts about ${f(g.camY - reach - (t + sd))} above the substrate, so a spider on the ground may be out of frame. Lower the substrate or make the box taller.`,
    };
    g.cam = { mode: 'side', s: sc, C, pts };
  }

  if (s.cam && s.cpos === 'corner') {
    const px = 1 * (W / 2 - 0.95);
    const pz = -1 * (D / 2 - 0.95);
    let ux = -px;
    let uz = -pz;
    const len = Math.hypot(ux, uz);
    if (len < 0.05) { ux = -1 / Math.SQRT2; uz = 1 / Math.SQRT2; } else { ux /= len; uz /= len; }
    const diag = Math.max(2 * Math.hypot(px, pz), 0.5);
    const al = Math.max(20 * DEG, Math.min(45 * DEG, Math.atan(diag / Math.max(dcl, 0.5))));
    const lft = 0.65 * Math.sin(al);
    const ext = (lft + t + 0.05) / Math.cos(al) - t - 0.05;
    camCut = ['Lid camera slot', `9 mm, angled ${Math.round(al / DEG)}° at back-right corner`];
    const cam = { mode: 'corner', px, pz, ux, uz, al, lft, ext, C: null, pts: null, pct: 0 };
    if (dcl > 0.3) {
      const reach = (t + 0.05 + ext) * Math.sin(al);
      const C = new V3(px + ux * reach, H - 0.05, pz + uz * reach);
      const dir = new V3(ux * Math.sin(al), -Math.cos(al), uz * Math.sin(al));
      const right = new V3().crossVectors(dir, new V3(0, 1, 0)).normalize();
      const up = new V3().crossVectors(right, dir).normalize();
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
        const r = dir.clone().addScaledVector(right, a * tanH).addScaledVector(up, b * tanV);
        const k = r.y < -0.05 ? (fy - C.y) / r.y : 20;
        return new V3(
          Math.max(-iw / 2, Math.min(iw / 2, C.x + r.x * k)),
          fy,
          Math.max(-idp / 2, Math.min(idp / 2, C.z + r.z * k)),
        );
      });
      const pct = Math.min(100, Math.round((polyArea(pts) / (iw * idp)) * 100));
      cam.C = C; cam.pts = pts; cam.pct = pct;
      camRow = {
        ok: pct >= 80,
        text: `The corner camera looks diagonally across the box and sees roughly ${pct}% of the floor${pct >= 80 ? '.' : '. For more, try the top position or a wide-angle lens.'}`,
      };
    } else {
      camRow = { ok: false, text: 'The camera is too close to the floor for a useful view. Raise the box or lower the substrate.' };
    }
    g.cam = cam;
  }

  const rows = [];
  if (s.type === 'terr') {
    const floorOk = il >= 3 * L && is >= 2 * L;
    rows.push({
      ok: floorOk,
      text: floorOk
        ? `Floor space fits a ${fmtCm(L)} leg span (${f(il)} × ${f(is)} inside).`
        : `Floor is tight for a ${fmtCm(L)} leg span. Aim for about ${f(3 * L)} × ${f(2 * L)} inside.`,
    });
    const heightOk = free <= 1.5 * L && free >= 0.75 * L;
    rows.push({
      ok: heightOk,
      text: heightOk
        ? `Free height above the substrate is ${f(free)}, a good range for a ground dweller.`
        : free > 1.5 * L
          ? `Free height is ${f(free)}, quite tall for a ground dweller. Raise the substrate to about ${f(Math.max(0, hw - 1.5 * L))} or lower the box to reduce fall risk.`
          : `Free height is only ${f(free)}. Lower the substrate or raise the box.`,
    });
  } else {
    const floorOk = is >= 2 * L && il >= 2 * L;
    rows.push({
      ok: floorOk,
      text: floorOk
        ? `Floor space fits a ${fmtCm(L)} leg span (${f(il)} × ${f(is)} inside).`
        : `Floor is tight for a ${fmtCm(L)} leg span. Aim for at least ${f(2 * L)} on each side inside.`,
    });
    const heightOk = free >= 3 * L;
    rows.push({
      ok: heightOk,
      text: heightOk
        ? `Free height is ${f(free)}, enough climbing room for a tree dweller.`
        : `Free height is ${f(free)}. Tree dwellers do best with about ${f(3 * L)} or more.`,
    });
  }
  rows.push({
    ok: true,
    text: `Suggested vent hole size for this spider: ${g.ventMm} mm or smaller. Holes must be smaller than the spider can squeeze through.`,
  });
  if (camRow) rows.push(camRow);
  g.rows = rows;

  g.cut = [
    ['Front and back (2)', `${f(W)} × ${f(hw)}`],
    ['Left and right (2)', `${f(D - 2 * t)} × ${f(hw)}`],
    ['Base and lid (2)', `${f(W)} × ${f(D)}`],
    ['Thickness', `${t > 0.15 ? 5 : 3} mm`],
    ['Corner brackets (4)', `${f(arm)} arms`],
  ];
  if (camCut) g.cut.push(camCut);
  return g;
}

/** Magnet size used by the corner brackets, in inches. */
export function magnetRadius(g) {
  const c = g.arm * 0.6;
  return Math.min(0.15, c * 0.32);
}

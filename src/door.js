import * as THREE from 'three';
import { csgKit } from './toys.js';
import { MM_PER_IN } from './format.js';

/**
 * Side-opening door. The front panel becomes a door hung on two or three printed hinges at one front corner.
 * Everything here is in millimetres, in "corner coordinates" for a LEFT-hinged door:
 *   origin = outer front corner of the hinge-side wall, x to the right, y up (0 = bottom of the wall), z toward the viewer.
 *   The side wall sits at x in [0, T], z <= -T. The door plate sits at x >= DOOR_GAP, z in [-T, 0].
 * A right-hinged door is the same thing mirrored in x.
 */
export const R = 5.5;          // hinge knuckle radius
export const LT = 3;           // hinge leaf thickness
export const KGAP = 0.5;       // gap between knuckles
export const BORE = 1.7;       // pin hole radius (fits a 3 mm rod, M3 bolt or 3 mm filament)
export const SCREW = 1.6;      // M3 clearance hole radius
export const DOOR_GAP = 1;     // clearance between the door and the hinge-side wall
export const FAR_GAP = 1;      // and between the closing edge and the far wall, so it clears the lid bracket arm there
export const BOT_GAP = 0.6;    // door sits slightly above the base
export const TOP_GAP = 3.2;    // and below the lid brackets' feet
export const LEAF = 24;        // leaf length along the acrylic
export const PIVOT = [-R, R];  // hinge axis (x, z)
// The door's catch block is inset from the far wall: as the door starts to open, blocks behind it swing toward that wall.
export const DOOR_MAX_DEG = 150; // how far the preview slider opens the door (the swing is collision-free to 180)
export const CATCH = { w: 14, t: 8, pocket: 3.15, depth: 3.2, inset: 2 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Box from coordinate ranges. */
const bx = (k, x0, x1, y0, y1, z0, z1) => k.box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
const cy = (k, r, y0, y1, x, z) => k.cylY(r, y1 - y0, x, (y0 + y1) / 2, z);

export const hingeHeight = (kn) => 3 * kn + 2 * KGAP;
const knuckles = (kn) => [[0, kn], [kn + KGAP, 2 * kn + KGAP], [2 * (kn + KGAP), 3 * kn + 2 * KGAP]];

/** Door and hinge dimensions for a design, or { on: false }. */
export function doorLayout(s, g) {
  if (!s.door) return { on: false };
  const T = g.t * MM_PER_IN, hw = g.hw * MM_PER_IN, W = g.W * MM_PER_IN, sideW = (g.D - 2 * g.t) * MM_PER_IN;
  const doorH = hw - BOT_GAP - TOP_GAP, doorW = W - DOOR_GAP - FAR_GAP;
  const kn = clamp(Math.round(doorH * 0.1), 6, 12), Hh = hingeHeight(kn);
  const legH = Math.min(g.arm * 1.1, g.hw * 0.5) * MM_PER_IN; // lid bracket legs on the side wall
  const lowC = BOT_GAP + 4 + Hh / 2;
  const upC = hw - Math.max(4 + TOP_GAP, legH + 3) - Hh / 2;
  const span = upC - lowC;
  const centers = span < Hh + 4 ? [(lowC + upC) / 2] : span >= 2 * (Hh + 4) ? [lowC, (lowC + upC) / 2, upC] : [lowC, upC];
  const knobXd = doorW * 0.8, knobLeft = knobXd - 11 - 4;           // knob head is 22 mm across
  const logoSize = Math.max(12, Math.min((knobLeft - LEAF) * 0.95, doorH * 0.5, 60));
  return {
    on: true, side: s.hinge === 'right' ? 'right' : 'left',
    T, hw, W, sideW, doorW, doorH, kn, Hh,
    count: centers.length,
    hinges: centers.map((c) => ({ yc: c, yb: c - Hh / 2 })), // yc, yb: mm above the wall bottom
    knob: { x: DOOR_GAP + knobXd, y: BOT_GAP + doorH / 2, xd: knobXd },
    logo: { x: DOOR_GAP + (LEAF + knobLeft) / 2, xd: (LEAF + knobLeft) / 2, y: BOT_GAP + doorH * 0.5, size: logoSize },
    catchX: W - T - CATCH.inset - CATCH.w / 2,   // block on the door
    catchFX: W - T - CATCH.w / 2,                // partner block on the far wall
    catchY: BOT_GAP + doorH / 2,
  };
}

// ---------------------------------------------------------------- solids

/** Frame half: two knuckles on arms, joined to a spine that screws onto the side wall. */
export function frameHingeSolid(k, kn, T) {
  const Hh = hingeHeight(kn), ks = knuckles(kn);
  const parts = [bx(k, -LT, 0, 0, Hh, -(T + LEAF), -1)];
  [ks[0], ks[2]].forEach(([y0, y1]) => {
    parts.push(bx(k, -LT, 0, y0, y1, -1.5, R), cy(k, R, y0, y1, PIVOT[0], PIVOT[1]));
  });
  let r = k.union(...parts);
  r = k.sub(r, cy(k, BORE, -1, Hh + 1, PIVOT[0], PIVOT[1]));
  [8, 18].forEach((d) => { r = k.sub(r, k.cylX(SCREW, LT + 2, -LT / 2, Hh / 2, -(T + d))); });
  return r;
}

/** Door half: the middle knuckle on a neck, joined to a plate that screws onto the door's outer face. */
export function doorHingeSolid(k, kn) {
  const Hh = hingeHeight(kn), [, k2] = knuckles(kn);
  let r = k.union(
    cy(k, R, k2[0], k2[1], PIVOT[0], PIVOT[1]),
    bx(k, PIVOT[0], 0.9, k2[0], k2[1], 0, LT),
    bx(k, 0.5, DOOR_GAP + LEAF, 0, Hh, 0, LT),
  );
  r = k.sub(r, cy(k, BORE, -1, Hh + 1, PIVOT[0], PIVOT[1]));
  [8, 18].forEach((d) => { r = k.sub(r, k.cylZ(SCREW, LT + 2, DOOR_GAP + d, Hh / 2, LT / 2)); });
  return r;
}

/** Printed hinge pin with a head (or use a 3 mm rod). Axis along y, head at the bottom. */
export function pinSolid(k, kn) {
  const Hh = hingeHeight(kn);
  return k.union(cy(k, 1.4, 0, Hh + 1, 0, 0), cy(k, 3, 0, 1.6, 0, 0));
}

/** Mushroom door knob. Base on y = 0; the screw comes from inside the door into the pilot hole. */
export function knobSolid(k) {
  let r = k.union(
    cy(k, 9, 0, 2, 0, 0),
    cy(k, 4, 1.5, 10, 0, 0),
    k.cone(3.9, 11, 7, 0, 12.5, 0), // 45 degree flare, so no supports
    cy(k, 11, 15.5, 21, 0, 0),
  );
  return k.sub(r, cy(k, 1.3, -1, 12, 0, 0)); // M3 self-tapping pilot hole
}

/** Block with a magnet pocket on its top face (y = CATCH.t). */
export function catchSolid(k) {
  const { w, t, pocket, depth } = CATCH;
  const r = k.box(w, t, w, 0, t / 2, 0);
  return k.sub(r, k.cylY(pocket, depth + 1, 0, t - depth / 2 + 0.5, 0));
}

export const PARTS = {
  hingeFrame: { name: 'Hinge, frame half', note: 'Screws to the side wall. Print standing up; the upper knuckle may need supports.' },
  hingeDoor: { name: 'Hinge, door half', note: 'Screws to the door. Print standing up.' },
  pin: { name: 'Hinge pin', note: 'Or use a 3 mm steel rod, an M3 bolt or 3 mm filament.' },
  knob: { name: 'Door knob', note: 'Mushroom shape, no supports. Fix with an M3 self-tapping screw from inside the door.' },
  catch: { name: 'Magnet catch', note: 'Two needed. Glue a 6 × 3 mm disc magnet in each, facing each other.' },
};

export function partSolid(name, k, layout) {
  switch (name) {
    case 'hingeFrame': return frameHingeSolid(k, layout.kn, layout.T);
    case 'hingeDoor': return doorHingeSolid(k, layout.kn);
    case 'pin': return pinSolid(k, layout.kn);
    case 'knob': return knobSolid(k);
    case 'catch': return catchSolid(k);
    default: throw new Error(`Unknown part: ${name}`);
  }
}

const geoCache = new Map();
/** Geometry (mm) for a hardware part, cached by the dimensions that shape it. */
export function partGeometry(name, layout) {
  const key = `${name}:${layout.kn}:${layout.T.toFixed(2)}`;
  if (!geoCache.has(key)) {
    const k = csgKit();
    geoCache.set(key, k.finish(partSolid(name, k, layout)));
  }
  return geoCache.get(key).clone();
}

/** Binary STL (Z up, flat on the bed) for a hardware part. Hinge and catch parts keep their natural stand-up pose. */
export async function partStl(name, layout) {
  const { STLExporter } = await import('three/addons/exporters/STLExporter.js');
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(partGeometry(name, layout), new THREE.MeshBasicMaterial()));
  grp.rotation.x = Math.PI / 2; // Y-up to Z-up
  grp.updateMatrixWorld(true);
  return new STLExporter().parse(grp, { binary: true });
}

// ---------------------------------------------------------------- where things go on the panels

/** Distance from the hinge-side wall's front edge covered by the hinge leaf, plus a margin, in mm. */
const TAB_REACH = LEAF + 4;

/** True when a vent hole at (z, y) in inches on the given wall would sit under a hinge leaf. */
export function ventBlockedByHinge(s, g, wall, z, y) {
  if (!s.door || (s.hinge === 'right' ? 'right' : 'left') !== wall) return false;
  const L = doorLayout(s, g);
  const dist = ((g.D - 2 * g.t) / 2 - z) * MM_PER_IN; // mm back from the wall's front edge
  const yy = (y - g.t) * MM_PER_IN;
  return dist < TAB_REACH && L.hinges.some((h) => Math.abs(yy - h.yc) < L.Hh / 2 + 4);
}

/** Fit-check rows for the door. */
export function doorChecks(s, g, openDeg) {
  const L = doorLayout(s, g);
  if (!L.on) return [];
  const rows = [{ ok: true, text: `The door swings open outward to about ${openDeg}° on the ${L.side}, hung on ${L.count} printed hinge${L.count > 1 ? 's' : ''}.` }];
  if (L.count < 2) rows.push({ ok: false, text: 'The door is short, so it gets one hinge. Use a taller box for two.' });
  if (L.doorW < 70) rows.push({ ok: false, text: `The door is only ${L.doorW.toFixed(0)} mm wide, which is tight for a knob and magnet catch. Use a wider box.` });
  if (s.cam && s.cpos === 'side' && L.side === 'right' && L.sideW < 70) {
    rows.push({ ok: false, text: 'The side camera hole and the hinge leaf share the right wall, and the wall is too narrow for both. Hang the door on the left.' });
  }
  return rows;
}

// Door swing simulation. Run: node tests/doorsim.mjs
import { Manifold } from '../src/manifold.js';
import { csgKit } from '../src/toys.js';
import { analyze } from '../src/calc.js';
import { defaults } from '../src/state.js';
import { doorLayout, frameHingeSolid, doorHingeSolid, knobSolid, catchSolid, pinSolid, DOOR_GAP, BOT_GAP, PIVOT, CATCH } from '../src/door.js';

/** Largest opening angle (degrees, in 5 degree steps) with no overlap between the frame and the swinging door. */
export function simulate(s, { step = 5, limit = 180 } = {}) {
  const g = analyze(s), L = doorLayout(s, g);
  const k = csgKit();
  const T = L.T, Dmm = g.D * 25.4;
  const frame = [
    k.box(T, L.hw, Dmm - 2 * T, T / 2, L.hw / 2, -T - (Dmm - 2 * T) / 2),                 // hinge-side wall
    k.box(T, L.hw, Dmm - 2 * T, L.W - T / 2, L.hw / 2, -T - (Dmm - 2 * T) / 2),            // far wall
    k.box(L.W, 5, Dmm, L.W / 2, -2.5, -Dmm / 2 + 0),                                       // base, just under the wall bottoms
  ];
  // Lid brackets at the two front corners: a side arm on the outside of each wall and a foot on top (the front arm is omitted when there is a door).
  const th = 2.54, arm = g.arm * 25.4, pad = arm * 0.6, legH = Math.min(g.arm * 1.1, g.hw * 0.5) * 25.4, top = L.hw;
  [[-th, 0, 1], [L.W, L.W + th, -1]].forEach(([x0, x1, dir]) => {
    frame.push(k.box(x1 - x0, legH, arm, (x0 + x1) / 2, top - legH / 2, th - arm / 2));                                 // side arm
    const fx0 = dir === 1 ? -th : L.W - T - pad, fx1 = dir === 1 ? T + pad : L.W + th;
    frame.push(k.box(fx1 - fx0, 2.54, T + pad + th, (fx0 + fx1) / 2, top - 1.27, th - (T + pad + th) / 2));            // corner foot
  });
  const door = [k.box(L.doorW, L.doorH, T, DOOR_GAP + L.doorW / 2, BOT_GAP + L.doorH / 2, -T / 2)];
  L.hinges.forEach((h) => {
    frame.push(k.tr(frameHingeSolid(k, L.kn, T), 0, h.yb, 0), k.tr(pinSolid(k, L.kn), PIVOT[0], h.yb - 0.5, PIVOT[1]));
    door.push(k.tr(doorHingeSolid(k, L.kn), 0, h.yb, 0));
  });
  door.push(k.tr(k.rot(knobSolid(k), 90, 0, 0), L.knob.x, L.knob.y, 0));                  // knob out of the front face
  door.push(k.tr(k.rot(catchSolid(k), -90, 0, 0), L.catchX, L.catchY, -T));               // catch inside, behind the door
  frame.push(k.tr(k.rot(catchSolid(k), 90, 0, 0), L.catchFX, L.catchY, -T - 8.6 - CATCH.t)); // its partner on the far wall
  const F = k.union(...frame), D = k.union(...door);
  let ok = 0;
  const overlaps = {};
  for (let a = 0; a <= limit; a += step) {
    const moved = k.keep(k.tr(k.rot(k.tr(D, -PIVOT[0], 0, -PIVOT[1]), 0, -a, 0), PIVOT[0], 0, PIVOT[1]));
    const v = k.keep(Manifold.intersection(F, moved)).volume();
    overlaps[a] = v;
    if (v > 0.05 && a > 0) return { maxOpen: ok, firstHit: a, hitVolume: v, overlaps, layout: L };
    ok = a;
  }
  return { maxOpen: ok, overlaps, layout: L };
}

if (process.argv[1].endsWith('doorsim.mjs')) {
  for (const o of [{}, { w: 10, d: 8, h: 6 }, { w: 6, d: 6, h: 11.5 }, { w: 3, d: 3, h: 3 }, { t: 0.197 }]) {
    const r = simulate({ ...defaults(), door: true, hinge: 'left', ...o });
    console.log(JSON.stringify(o).padEnd(34), 'hinges', r.layout.count, 'max open', r.maxOpen, r.firstHit ? `hit at ${r.firstHit} (${r.hitVolume.toFixed(1)} mm3)` : '(no hit up to 180)');
  }
}

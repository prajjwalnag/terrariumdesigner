import test from 'node:test';
import assert from 'node:assert/strict';
import { Manifold } from '../src/manifold.js';
import { csgKit } from '../src/toys.js';
import { analyze } from '../src/calc.js';
import { defaults } from '../src/state.js';
import { doorLayout, frameHingeSolid, doorHingeSolid, knobSolid, catchSolid, pinSolid, DOOR_GAP, BOT_GAP, PIVOT, CATCH } from '../src/door.js';

const design = (o = {}) => ({ ...defaults(), door: true, hinge: 'left', ...o });

test('door layout is sensible for default and larger boxes', () => {
  for (const o of [{}, { w: 10, d: 8, h: 6 }, { w: 6, d: 6, h: 11.5 }]) {
    const s = design(o), g = analyze(s), L = doorLayout(s, g);
    assert.ok(L.on && L.count >= 1 && L.count <= 3, JSON.stringify(o));
    L.hinges.forEach((h) => assert.ok(h.yb >= BOT_GAP && h.yb + L.Hh <= L.hw, `hinge inside the door height ${JSON.stringify(o)}`));
    assert.ok(L.knob.x > DOOR_GAP && L.knob.x < DOOR_GAP + L.doorW);
  }
  assert.equal(doorLayout({ ...defaults(), door: false }, analyze(defaults())).on, false);
});

test('hardware parts are single watertight solids', () => {
  const s = design(), L = doorLayout(s, analyze(s));
  for (const make of [(k) => frameHingeSolid(k, L.kn, L.T), (k) => doorHingeSolid(k, L.kn), (k) => pinSolid(k, L.kn), (k) => knobSolid(k), (k) => catchSolid(k)]) {
    const k = csgKit();
    const m = make(k);
    assert.equal(m.status(), 'NoError');
    assert.ok(m.volume() > 50);
    assert.equal(m.decompose().length, 1, 'one connected piece');
  }
});

import { simulate } from './doorsim.mjs';
test('the door swings open without touching the frame (simulated to 180 degrees)', () => {
  for (const o of [{}, { w: 10, d: 8, h: 6 }, { w: 6, d: 6, h: 11.5 }, { w: 3, d: 3, h: 3 }, { t: 0.197 }, { w: 14, d: 14, h: 14 }]) {
    const r = simulate(design(o), { step: 10 });
    assert.equal(r.maxOpen, 180, `${JSON.stringify(o)} stuck at ${r.maxOpen} (hit ${r.hitVolume})`);
  }
});

test('without the catch inset the door would hit the far wall (guards the clearance)', () => {
  assert.ok(CATCH.inset >= 1.5);
});

import { buildPanels, buildBom } from '../src/panels.js';
import { sanitize, shareUrl } from '../src/state.js';
import { ventBlockedByHinge, SCREW } from '../src/door.js';

const panelsFor = (o) => { const s = design(o), g = analyze(s); return { s, g, L: doorLayout(s, g), p: Object.fromEntries(buildPanels(s, g).map((x) => [x.id, x])) }; };

test('the front panel becomes a door with knob and hinge holes', () => {
  const { p, L } = panelsFor({ w: 8, d: 6, h: 7 });
  assert.ok(p.door && !p.front);
  assert.ok(Math.abs(p.door.w - L.doorW) < 1e-6 && Math.abs(p.door.h - L.doorH) < 1e-6);
  const hw = p.door.holes.filter((h) => h.hw);
  assert.equal(hw.length, 1 + 2 * L.count);
  hw.forEach((h) => assert.ok(h.x > 0 && h.x < p.door.w && h.y > 0 && h.y < p.door.h && h.d === 2 * SCREW));
  assert.equal(panelsFor({ w: 8, d: 6, h: 7 }).p.door.holes.filter((h) => h.hw && Math.abs(h.x - 8) < 1e-6).length, L.count, 'hinge screws sit 8 mm from the hinge edge');
});

test('hinge-side wall gets matching screw holes, mirrored for a right-hinged door', () => {
  for (const side of ['left', 'right']) {
    const { p, L } = panelsFor({ w: 8, d: 6, h: 7, hinge: side });
    const wall = p[side], other = p[side === 'left' ? 'right' : 'left'];
    const holes = wall.holes.filter((h) => h.hw);
    assert.equal(holes.length, 2 * L.count, side);
    holes.forEach((h) => {
      const back = side === 'left' ? wall.w - h.x : h.x; // distance back from the front edge
      assert.ok(Math.abs(back - 8) < 1e-6 || Math.abs(back - 18) < 1e-6, `${side} hole ${back}`);
    });
    assert.equal(other.holes.filter((h) => h.hw).length, 0);
    const door = p.door.holes.filter((h) => h.hw && h.y > 0);
    door.forEach((h) => { const d = side === 'left' ? h.x : p.door.w - h.x; assert.ok(d === 8 || d === 18 || Math.abs(d - L.knob.xd) < 1e-6, `${side} door hole ${d}`); });
  }
});

test('vent holes keep clear of the hinge leaves', () => {
  const { s, g, L, p } = panelsFor({ w: 8, d: 6, h: 7 });
  const wall = p.left;
  const dist = (x) => wall.w - x; // back from the front edge on the left wall
  wall.holes.filter((h) => !h.hw && !h.cam).forEach((h) => {
    const near = L.hinges.some((hg) => Math.abs(h.y - hg.yc) < L.Hh / 2 + 4);
    assert.ok(!(dist(h.x) < 28 && near), 'vent under a hinge leaf');
  });
  assert.equal(ventBlockedByHinge({ ...s, door: false }, g, 'left', 0, 0), false);
});

test('shopping list gains door hardware, and the design saves and shares', () => {
  const { s, g, p } = panelsFor({ w: 8, d: 6, h: 7 });
  const names = buildBom(s, g, Object.values(p)).map((i) => i.name);
  ['Door hinges (3D-printed)', 'Hinge pins', 'M3 screws and nuts', 'Door knob (3D-printed)', 'Magnet catch'].forEach((n) => assert.ok(names.includes(n), n));
  assert.ok(!buildBom({ ...s, door: false }, g, Object.values(p)).some((i) => /hinge/i.test(i.name)));
  assert.equal(sanitize({ door: true, hinge: 'right', doorOpen: 1 }).hinge, 'right');
  assert.equal(sanitize({ hinge: 'up' }).hinge, undefined);
  assert.equal(sanitize({ doorOpen: 1 }).doorOpen, undefined, 'the open angle is not saved');
  globalThis.location = { origin: 'http://x', pathname: '/' };
  assert.ok(/door=1/.test(shareUrl(s)) && /hinge=left/.test(shareUrl(s)));
});

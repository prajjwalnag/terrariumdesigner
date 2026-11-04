import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import { MM_PER_IN, fmtLen } from './format.js';

export const MAX_TOYS = 8;
export const BEDS_3D = { 120: '120 × 120 mm (mini)', 180: '180 × 180 mm', 220: '220 × 220 mm (common)', 256: '256 × 256 mm' };

/**
 * Each toy is built in millimetres, centred on the origin, with its base on y = 0.
 * `s` is the base size in mm. `dims` are the footprint (w across x, l along z) and height as
 * multiples of s, used for placement and fit checks before any geometry exists.
 */
export const KINDS = {
  tunnel:     { cat: 'hide',  name: 'Tunnel hide',     blurb: 'Arched tunnel to hide in',   dims: (s) => ({ w: 1.1 * s, l: 1.4 * s, h: 0.62 * s }) },
  cave:       { cat: 'hide',  name: 'Dome cave',       blurb: 'Hollow dome, arched door',   dims: (s) => ({ w: 1.2 * s, l: 1.2 * s, h: 0.5 * s }) },
  log:        { cat: 'hide',  name: 'Log hide',        blurb: 'Half log with closed back',  dims: (s) => ({ w: s, l: 1.4 * s, h: 0.5 * s }) },
  pyramid:    { cat: 'climb', name: 'Step pyramid',    blurb: 'Three climbable steps',      dims: (s) => ({ w: s, l: s, h: 0.54 * s }) },
  ramp:       { cat: 'climb', name: 'Ramp',            blurb: 'Rung ramp up to a ledge',    dims: (s) => ({ w: 0.5 * s, l: 1.6 * s, h: 0.7 * s }) },
  post:       { cat: 'climb', name: 'Climbing post',   blurb: 'Post with pegs',             dims: (s) => ({ w: s, l: s, h: 1.8 * s }) },
  platform:   { cat: 'climb', name: 'Platform',        blurb: 'Raised ledge on legs',       dims: (s) => ({ w: 0.9 * s, l: 0.9 * s, h: 0.8 * s }) },
  bridge:     { cat: 'climb', name: 'Arch bridge',     blurb: 'Walkable stone arch',        dims: (s) => ({ w: 1.6 * s, l: 0.5 * s, h: 0.65 * s }) },
  ladder:     { cat: 'climb', name: 'Ladder',          blurb: 'Tall ladder on a base',      dims: (s) => ({ w: 0.8 * s, l: 0.5 * s, h: 1.5 * s }) },
  tower:      { cat: 'climb', name: 'Twisted tower',   blurb: 'Rotated stacked blocks',     dims: (s) => ({ w: s, l: s, h: 0.84 * s }) },
  webframe:   { cat: 'climb', name: 'Web frame',       blurb: 'Gate for webs to anchor to', dims: (s) => ({ w: 1.2 * s, l: 0.4 * s, h: 1.4 * s }) },
  skull:      { cat: 'skull', name: 'Skull hide',      blurb: 'Hollow, enter by the mouth', dims: (s) => ({ w: s, l: 1.1 * s, h: 1.05 * s }) },
  skullbig:   { cat: 'skull', name: 'Skull cave',      blurb: 'Wide mouth, big sockets',    dims: (s) => ({ w: s, l: 1.1 * s, h: 1.05 * s }) },
  skullcap:   { cat: 'skull', name: 'Skull cap',       blurb: 'Low dome with eye holes',    dims: (s) => ({ w: 1.1 * s, l: 1.2 * s, h: 0.5 * s }) },
  skullrock:  { cat: 'skull', name: 'Skull rock',      blurb: 'Solid skull to climb on',    dims: (s) => ({ w: s, l: 1.1 * s, h: 1.05 * s }) },
  crossbones: { cat: 'skull', name: 'Crossbones',      blurb: 'Crossed bones to climb',     dims: (s) => ({ w: 1.4 * s, l: 1.4 * s, h: 0.25 * s }) },
  skullbones: { cat: 'skull', name: 'Skull and bones', blurb: 'Small skull on crossbones',  dims: (s) => ({ w: 1.4 * s, l: 1.4 * s, h: 0.65 * s }) },
  mound:      { cat: 'other', name: 'Mound',          blurb: 'Smooth dome to sit on',      dims: (s) => ({ w: s, l: s, h: 0.4 * s }) },
  dish:       { cat: 'other', name: 'Water dish',     blurb: 'Shallow dish, flat base',    dims: (s) => ({ w: 0.8 * s, l: 0.8 * s, h: Math.max(8, 0.12 * s) }) },
};
export const CATEGORIES = { hide: 'Hides', climb: 'Climbing', skull: 'Skulls', other: 'Other' };

const wallFor = (s) => Math.max(2.4, 0.07 * s);

function addBox(g, mat, w, h, d, x, y, z, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.z = rz;
  g.add(m);
  return m;
}
function addCyl(g, mat, rt, rb, h, x, y, z, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key).clone();
}

/** Small boolean-geometry toolkit. evaluate() returns geometry in the first brush's local space, so each step bakes its transform in. */
function csgKit() {
  const ev = new Evaluator();
  ev.attributes = ['position', 'normal'];
  ev.useGroups = false;
  const brush = (geo, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    geo.deleteAttribute('uv');
    const b = new Brush(geo);
    b.position.set(x, y, z);
    b.scale.set(sx, sy, sz);
    b.updateMatrixWorld();
    return b;
  };
  const run = (a, b, op) => {
    const m = ev.evaluate(a, b, op);
    m.updateMatrixWorld();
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    const nb = new Brush(g);
    nb.updateMatrixWorld();
    return nb;
  };
  const sph = (r = 1) => new THREE.SphereGeometry(r, 40, 28);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cylZ = (r, len) => { const g = new THREE.CylinderGeometry(r, r, len, 32); g.rotateX(Math.PI / 2); return g; };
  const cylY = (r, h) => new THREE.CylinderGeometry(r, r, h, 40);
  return { brush, run, sph, box, cylZ, cylY, add: (a, b) => run(a, b, ADDITION), sub: (a, b) => run(a, b, SUBTRACTION) };
}

/** Hollow dome (upper half of an ellipsoid) with an open base. */
function domeShell(k, s, rx, ry, rz, wall) {
  const big = 4 * s;
  const outer = k.sub(k.brush(k.sph(), 0, 0, 0, rx, ry, rz), k.brush(k.box(big, big, big), 0, -big / 2, 0));
  return k.sub(outer, k.brush(k.sph(), 0, 0, 0, rx - wall, ry - wall, rz - wall));
}

/**
 * Skull facing +z with its base on y = 0. Hollow skulls are open underneath; solid ones keep shallow sockets.
 * o: hollow, eye (socket radius), mw / mh (mouth size), md (mouth depth), all as multiples of s.
 */
function skullGeometry(s, o = {}) {
  const { hollow = true, eye = 0.15, mw = 0.44, mh = 0.26, md = 0.6 } = o;
  const key = `skull:${Math.round(s * 2)}:${hollow}:${eye}:${mw}:${mh}:${md}`;
  return cached(key, () => {
    const wall = wallFor(s);
    const k = csgKit();
    const cy = 0.55 * s;
    let r = k.add(k.brush(k.sph(), 0, cy, 0, 0.5 * s, 0.5 * s, 0.55 * s), k.brush(k.box(0.62 * s, 0.34 * s, 0.7 * s), 0, 0.17 * s, 0.2 * s));
    if (hollow) {
      const cavity = k.add(
        k.brush(k.sph(), 0, cy, 0, 0.5 * s - wall, 0.5 * s - wall, 0.55 * s - wall),
        k.brush(k.box(0.62 * s - 2 * wall, 0.34 * s + 2, 0.7 * s - 2 * wall), 0, 0.17 * s - 1, 0.2 * s),
      );
      r = k.sub(r, cavity);
    }
    const eyeZ = hollow ? 0 : 0.34 * s; // solid skulls only get shallow sockets
    [-1, 1].forEach((side) => { r = k.sub(r, k.brush(k.cylZ(eye * s, s), side * 0.2 * s, 0.66 * s, eyeZ + s / 2)); });
    r = k.sub(r, k.brush(k.cylZ(0.06 * s, s), 0, 0.46 * s, (hollow ? 0 : 0.4 * s) + s / 2)); // nose
    const depth = md * s + 0.2 * s;
    r = k.sub(r, k.brush(k.box(mw * s, mh * s + 2, depth), 0, (mh * s) / 2 - 1, 0.55 * s - (md * s) / 2)); // mouth
    return r.geometry;
  });
}

/** Low skull dome with eye holes and a door at the front. */
function skullCapGeometry(s) {
  return cached(`skullcap:${Math.round(s * 2)}`, () => {
    const k = csgKit();
    let r = domeShell(k, s, 0.55 * s, 0.5 * s, 0.6 * s, wallFor(s));
    [-1, 1].forEach((side) => { r = k.sub(r, k.brush(k.cylZ(0.12 * s, s), side * 0.2 * s, 0.26 * s, 0.6 * s)); });
    r = k.sub(r, k.brush(k.box(0.46 * s, 0.22 * s + 2, 0.5 * s), 0, 0.11 * s - 1, 0.5 * s));
    return r.geometry;
  });
}

function caveGeometry(s) {
  return cached(`cave:${Math.round(s * 2)}`, () => {
    const k = csgKit();
    let r = domeShell(k, s, 0.6 * s, 0.5 * s, 0.6 * s, wallFor(s));
    r = k.sub(r, k.brush(k.cylZ(0.22 * s, s), 0, 0.2 * s, 0.6 * s));
    r = k.sub(r, k.brush(k.box(0.44 * s, 0.2 * s + 2, s), 0, 0.1 * s - 1, 0.6 * s));
    return r.geometry;
  });
}

function logGeometry(s) {
  return cached(`log:${Math.round(s * 2)}`, () => {
    const k = csgKit();
    const wall = wallFor(s);
    const len = 1.4 * s;
    let r = k.sub(k.brush(k.cylZ(0.5 * s, len)), k.brush(k.box(2 * s, s, 2 * len), 0, -s / 2, 0));
    const inner = len - wall + 2;
    r = k.sub(r, k.brush(k.cylZ(0.5 * s - wall, inner), 0, 0, -len / 2 + wall + inner / 2));
    return r.geometry;
  });
}

function dishGeometry(s) {
  return cached(`dish:${Math.round(s * 2)}`, () => {
    const k = csgKit();
    const h = Math.max(8, 0.12 * s);
    const wall = wallFor(s);
    const r = k.sub(k.brush(k.cylY(0.4 * s, h), 0, h / 2, 0), k.brush(k.cylY(0.4 * s - wall, h), 0, h / 2 + wall, 0));
    return r.geometry;
  });
}

function addCrossbones(g, mat, s) {
  const lenB = 1.3 * s, rb = 0.06 * s, kn = 0.1 * s;
  addCyl(g, mat, 0.7 * s, 0.7 * s, 3, 0, 0, 0, 48);
  [Math.PI / 5, -Math.PI / 5].forEach((a) => {
    const bone = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(rb, rb, lenB, 16), mat);
    shaft.rotation.z = Math.PI / 2;
    bone.add(shaft);
    [-1, 1].forEach((e) => [-1, 1].forEach((f) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(kn, 14, 10), mat);
      ball.position.set((e * lenB) / 2, 0, f * kn * 0.8);
      bone.add(ball);
    }));
    bone.rotation.y = a;
    bone.position.y = 3 + kn;
    g.add(bone);
  });
}

export function buildToy(kind, s, mat) {
  const g = new THREE.Group();
  const wall = wallFor(s);
  if (kind === 'tunnel') {
    const w = 1.1 * s, len = 1.4 * s, R = w / 2, r = R - wall, straight = 0.12 * s;
    const outer = new THREE.Shape();
    outer.moveTo(-R, 0); outer.lineTo(R, 0); outer.lineTo(R, straight);
    outer.absarc(0, straight, R, 0, Math.PI, false);
    outer.lineTo(-R, 0);
    const hole = new THREE.Path();
    hole.moveTo(-r, 0); hole.lineTo(-r, straight);
    hole.absarc(0, straight, r, Math.PI, 0, true);
    hole.lineTo(r, 0); hole.closePath();
    outer.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(outer, { depth: len, bevelEnabled: false, curveSegments: 24 });
    geo.translate(0, 0, -len / 2);
    g.add(new THREE.Mesh(geo, mat));
  } else if (kind === 'pyramid') {
    const step = 0.18 * s;
    [1, 0.7, 0.4].forEach((k, i) => addBox(g, mat, s * k, step, s * k, 0, i * step, 0));
  } else if (kind === 'ramp') {
    const len = 1.6 * s, h = 0.7 * s, wd = 0.5 * s;
    const tri = new THREE.Shape();
    tri.moveTo(-len / 2, 0); tri.lineTo(len / 2, 0); tri.lineTo(len / 2, h); tri.closePath();
    const geo = new THREE.ExtrudeGeometry(tri, { depth: wd, bevelEnabled: false });
    geo.translate(0, 0, -wd / 2);
    g.add(new THREE.Mesh(geo, mat));
    const ang = Math.atan2(h, len);
    const nx = -Math.sin(ang), ny = Math.cos(ang); // surface normal
    for (let i = 1; i <= 5; i++) {
      const f = i / 6;
      const px = (f - 0.5) * len, py = f * h;
      const rung = addBox(g, mat, 2.5, 2.5, wd, px + nx * 1, 0, 0, ang);
      rung.position.set(px + nx * 1, py + ny * 1, 0);
    }
  } else if (kind === 'post') {
    const h = 1.8 * s, pr = 0.1 * s;
    addCyl(g, mat, 0.5 * s, 0.5 * s, 4, 0, 0, 0, 36);
    addCyl(g, mat, pr, pr, h - 4, 0, 4, 0, 24);
    [0.3, 0.55, 0.8].forEach((f, i) => {
      const len = 0.4 * s;
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, len, 12), mat);
      peg.rotation.z = Math.PI / 2;
      peg.rotation.y = i * 2.1;
      const a = i * 2.1;
      peg.position.set(Math.cos(a) * (pr + len / 2 - 1), h * f, -Math.sin(a) * (pr + len / 2 - 1));
      g.add(peg);
    });
  } else if (kind === 'mound') {
    const R = s / 2;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    dome.scale.y = 0.8;
    g.add(dome);
    const base = new THREE.Mesh(new THREE.CircleGeometry(R, 40), mat);
    base.rotation.x = Math.PI / 2;
    g.add(base);
  } else if (kind === 'skull') {
    g.add(new THREE.Mesh(skullGeometry(s), mat));
  } else if (kind === 'skullbig') {
    g.add(new THREE.Mesh(skullGeometry(s, { eye: 0.19, mw: 0.56, mh: 0.3 }), mat));
  } else if (kind === 'skullrock') {
    g.add(new THREE.Mesh(skullGeometry(s, { hollow: false, md: 0.12 }), mat));
  } else if (kind === 'skullcap') {
    g.add(new THREE.Mesh(skullCapGeometry(s), mat));
  } else if (kind === 'crossbones') {
    addCrossbones(g, mat, s);
  } else if (kind === 'skullbones') {
    addCrossbones(g, mat, s);
    const small = 0.55 * s;
    const sk = new THREE.Mesh(skullGeometry(small, { hollow: false, md: 0.12 }), mat);
    sk.position.set(0, 3 + 0.05 * s, 0);
    g.add(sk);
  } else if (kind === 'cave') {
    g.add(new THREE.Mesh(caveGeometry(s), mat));
  } else if (kind === 'log') {
    g.add(new THREE.Mesh(logGeometry(s), mat));
  } else if (kind === 'dish') {
    g.add(new THREE.Mesh(dishGeometry(s), mat));
  } else if (kind === 'bridge') {
    const len = 1.6 * s, wd = 0.5 * s, deck = 0.65 * s, r0 = 0.45 * s;
    const sh = new THREE.Shape();
    sh.moveTo(-len / 2, 0); sh.lineTo(-len / 2, deck); sh.lineTo(len / 2, deck); sh.lineTo(len / 2, 0);
    sh.lineTo(r0, 0); sh.absarc(0, 0, r0, 0, Math.PI, false); sh.lineTo(-len / 2, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: wd, bevelEnabled: false, curveSegments: 24 });
    geo.translate(0, 0, -wd / 2);
    g.add(new THREE.Mesh(geo, mat));
  } else if (kind === 'ladder') {
    const h = 1.5 * s, rail = 0.08 * s, dp = 0.1 * s, gap = 0.6 * s;
    addBox(g, mat, 0.8 * s, 3, 0.5 * s, 0, 0, 0);
    [-1, 1].forEach((sd) => addBox(g, mat, rail, h, dp, (sd * gap) / 2, 0, 0));
    for (let i = 1; i <= 6; i++) addBox(g, mat, gap, 0.05 * s, dp, 0, (i / 7) * h, 0);
  } else if (kind === 'tower') {
    const hb = 0.14 * s;
    for (let i = 0; i < 6; i++) {
      const w = s * (0.74 - 0.05 * i);
      addBox(g, mat, w, hb, w, 0, i * hb, 0).rotation.y = (i * 20 * Math.PI) / 180;
    }
  } else if (kind === 'webframe') {
    const h = 1.4 * s, post = 0.07 * s, dp = 0.1 * s;
    addBox(g, mat, 1.2 * s, 3, 0.4 * s, 0, 0, 0);
    [-1, 1].forEach((sd) => addBox(g, mat, post, h, dp, sd * 0.5 * s, 0, 0));
    addBox(g, mat, 1.07 * s, post, dp, 0, h - post, 0);
    [0.35, 0.68].forEach((f) => addBox(g, mat, 1 * s, post * 0.8, dp, 0, h * f, 0));
  } else if (kind === 'platform') {
    const w = 0.9 * s, h = 0.8 * s, top = Math.max(3, 0.05 * s), lr = 0.06 * s;
    addBox(g, mat, w, top, w, 0, h - top, 0);
    const o = w / 2 - lr - 1;
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => addCyl(g, mat, lr, lr, h - top, a * o, 0, b * o, 16));
  }
  return g;
}

/** Overall size in mm of a placed toy: base size follows the spider's leg span and the toy's own scale. */
export function toySizeMm(toy, legSpanIn) {
  return Math.max(25, legSpanIn * MM_PER_IN * 0.9 * toy.scale);
}
export function toyDims(toy, legSpanIn) {
  const s = toySizeMm(toy, legSpanIn);
  return { s, ...KINDS[toy.kind].dims(s) };
}

/** Where a toy sits (inches from box centre), keeping it inside the walls. */
export function toyPlacement(toy, g) {
  const d = toyDims(toy, g.L);
  const r = (0.5 * Math.hypot(d.w, d.l)) / MM_PER_IN;
  const ax = Math.max(0, g.iw / 2 - r - 0.02);
  const az = Math.max(0, g.idp / 2 - r - 0.02);
  return { x: toy.x * ax, z: toy.z * az, ax, az, r };
}

/** Extra fit-check rows for placed toys. */
export function toyChecks(state, g) {
  const rows = [];
  if (!state.toys.length) return rows;
  const f = (v) => fmtLen(v, state.unit);
  const floor = g.iw * g.idp;
  const foot = state.toys.reduce((a, t) => { const d = toyDims(t, g.L); return a + (d.w * d.l) / (MM_PER_IN * MM_PER_IN); }, 0);
  const pct = Math.round((foot / floor) * 100);
  rows.push({
    ok: pct <= 40,
    text: pct <= 40 ? `Toys cover about ${pct}% of the floor, which leaves room to roam.` : `Toys cover about ${pct}% of the floor. Remove one or shrink them so your spider keeps open space.`,
  });
  const tall = state.toys.filter((t) => toyDims(t, g.L).h / MM_PER_IN > g.free - 0.4);
  if (tall.length) {
    rows.push({ ok: false, text: `${tall.map((t) => KINDS[t.kind].name).join(', ')} ${tall.length > 1 ? 'reach' : 'reaches'} nearly to the lid (free height ${f(g.free)}). Scale ${tall.length > 1 ? 'them' : 'it'} down so there is a gap to climb past.` });
  }
  return rows;
}

/** Binary STL for printing: Z-up, base flat on the build plate, millimetres. */
export function toyStl(kind, s) {
  const grp = buildToy(kind, s, new THREE.MeshBasicMaterial());
  grp.rotation.x = Math.PI / 2;
  grp.updateMatrixWorld(true);
  return new STLExporter().parse(grp, { binary: true });
}

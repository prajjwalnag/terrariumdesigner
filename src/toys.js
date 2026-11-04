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
  tunnel:   { name: 'Tunnel hide',   blurb: 'Arched tunnel to hide in', dims: (s) => ({ w: 1.1 * s, l: 1.4 * s, h: 0.62 * s }) },
  pyramid:  { name: 'Step pyramid',  blurb: 'Three climbable steps',     dims: (s) => ({ w: s, l: s, h: 0.54 * s }) },
  ramp:     { name: 'Ramp',          blurb: 'Rung ramp up to a ledge',   dims: (s) => ({ w: 0.5 * s, l: 1.6 * s, h: 0.7 * s }) },
  post:     { name: 'Climbing post', blurb: 'Post with pegs',            dims: (s) => ({ w: s, l: s, h: 1.8 * s }) },
  mound:    { name: 'Mound',         blurb: 'Smooth dome to sit on',     dims: (s) => ({ w: s, l: s, h: 0.4 * s }) },
  skull:    { name: 'Skull hide',    blurb: 'Hollow skull, enter by the mouth', dims: (s) => ({ w: s, l: 1.1 * s, h: 1.05 * s }) },
  crossbones: { name: 'Crossbones', blurb: 'Crossed bones to climb',  dims: (s) => ({ w: 1.4 * s, l: 1.4 * s, h: 0.25 * s }) },
  platform: { name: 'Platform',      blurb: 'Raised ledge on legs',      dims: (s) => ({ w: 0.9 * s, l: 0.9 * s, h: 0.8 * s }) },
};

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

const skullCache = new Map();
/** Hollow skull: ellipsoid cranium plus jaw, with the inside, eyes, nose and mouth cut out. Faces +z. */
function skullGeometry(s) {
  const key = Math.round(s * 2);
  if (skullCache.has(key)) return skullCache.get(key).clone();
  const wall = wallFor(s);
  const ev = new Evaluator();
  ev.attributes = ['position', 'normal'];
  ev.useGroups = false;
  const brush = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => {
    geo.deleteAttribute('uv');
    const b = new Brush(geo);
    b.position.set(x, y, z);
    b.scale.set(sx, sy, sz);
    b.updateMatrixWorld();
    return b;
  };
  const sph = (r) => new THREE.SphereGeometry(r, 40, 28);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, len) => { const g = new THREE.CylinderGeometry(r, r, len, 28); g.rotateX(Math.PI / 2); return g; };
  // evaluate() returns geometry in the first brush's local space, so bake its transform in.
  const run = (a, b, op) => {
    const m = ev.evaluate(a, b, op);
    m.updateMatrixWorld();
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    const nb = new Brush(g);
    nb.updateMatrixWorld();
    return nb;
  };
  const cy = 0.55 * s;
  const outer = run(brush(sph(1), 0, cy, 0, 0.5 * s, 0.5 * s, 0.55 * s), brush(box(0.62 * s, 0.34 * s, 0.7 * s), 0, 0.17 * s, 0.2 * s), ADDITION);
  const cavity = run(
    brush(sph(1), 0, cy, 0, 0.5 * s - wall, 0.5 * s - wall, 0.55 * s - wall),
    brush(box(0.62 * s - 2 * wall, 0.34 * s + 2, 0.7 * s - 2 * wall), 0, 0.17 * s - 1, 0.2 * s),
    ADDITION,
  );
  let r = run(outer, cavity, SUBTRACTION);
  [-1, 1].forEach((side) => { r = run(r, brush(cyl(0.15 * s, s), side * 0.2 * s, 0.66 * s, 0.5 * s), SUBTRACTION); }); // eyes
  r = run(r, brush(cyl(0.06 * s, s), 0, 0.46 * s, 0.5 * s), SUBTRACTION); // nose
  r = run(r, brush(box(0.44 * s, 0.26 * s + 2, 0.6 * s), 0, 0.13 * s - 1, 0.4 * s), SUBTRACTION); // mouth
  const geo = r.geometry;
  skullCache.set(key, geo);
  return geo.clone();
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
  } else if (kind === 'crossbones') {
    const lenB = 1.3 * s, rb = 0.06 * s, kn = 0.1 * s;
    addCyl(g, mat, 0.7 * s, 0.7 * s, 3, 0, 0, 0, 48);
    [Math.PI / 5, -Math.PI / 5].forEach((a) => {
      const bone = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(rb, rb, lenB, 16), mat);
      shaft.rotation.z = Math.PI / 2;
      bone.add(shaft);
      [-1, 1].forEach((e) => [-1, 1].forEach((f) => {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(kn, 14, 10), mat);
        ball.position.set(e * lenB / 2, 0, f * kn * 0.8);
        bone.add(ball);
      }));
      bone.rotation.y = a;
      bone.position.y = 3 + kn;
      g.add(bone);
    });
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

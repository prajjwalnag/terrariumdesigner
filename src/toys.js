import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { Manifold } from './manifold.js';
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
  archway:    { cat: 'climb', name: 'Archway',         blurb: 'Ruined arch to walk through', dims: (s) => ({ w: 1.2 * s, l: 0.3 * s, h: 1.1 * s }) },
  sensor:     { cat: 'other', fixed: true, name: 'Sensor holder', blurb: 'Pocket for a DHT22 (fixed size)', dims: () => ({ w: 22, l: 36, h: 18 }) },
  mound:      { cat: 'other', name: 'Mound',          blurb: 'Smooth dome to sit on',      dims: (s) => ({ w: s, l: s, h: 0.4 * s }) },
  dish:       { cat: 'other', name: 'Water dish',     blurb: 'Shallow dish, flat base',    dims: (s) => ({ w: 0.8 * s, l: 0.8 * s, h: Math.max(8, 0.12 * s) }) },
};
export const CATEGORIES = { hide: 'Hides', climb: 'Climbing', skull: 'Skulls', other: 'Other' };

const wallFor = (s) => Math.max(2.4, 0.07 * s);

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key).clone();
}

/**
 * Boolean geometry on the manifold engine, which guarantees watertight output as 3D printing needs.
 * Every toy is built as ONE unioned solid (no overlapping shells for the slicer to repair).
 * Shapes use centre positions; solids made by a kit are freed when the result is converted.
 */
export function csgKit() {
  const pool = [];
  const keep = (m) => { pool.push(m); return m; };
  const tr = (m, x, y, z) => keep(m.translate([x, y, z]));
  const kit = {
    keep,
    sph: (rx, ry, rz, x = 0, y = 0, z = 0) => tr(keep(keep(Manifold.sphere(1, 48)).scale([rx, ry, rz])), x, y, z),
    box: (w, h, d, x = 0, y = 0, z = 0) => tr(Manifold.cube([w, h, d], true), x, y, z),
    cylZ: (r, len, x = 0, y = 0, z = 0) => tr(Manifold.cylinder(len, r, r, 40, true), x, y, z),
    cylX: (r, len, x = 0, y = 0, z = 0) => tr(keep(Manifold.cylinder(len, r, r, 24, true)).rotate([0, 90, 0]), x, y, z),
    cylY: (r, h, x = 0, y = 0, z = 0) => tr(keep(Manifold.cylinder(h, r, r, 48, true)).rotate([-90, 0, 0]), x, y, z),
    /** Cone along y: radius rLow at the bottom, rHigh at the top. */
    cone: (rLow, rHigh, h, x = 0, y = 0, z = 0) => tr(keep(Manifold.cylinder(h, rLow, rHigh, 48, true)).rotate([-90, 0, 0]), x, y, z),
    rot: (m, rx, ry, rz) => keep(m.rotate([rx, ry, rz])),
    tr,
    add: (a, b) => keep(a.add(b)),
    sub: (a, b) => keep(a.subtract(b)),
    union: (...ms) => ms.reduce((a, b) => keep(a.add(b))),
    /** Convert to a flat-shaded three.js geometry and free every solid made by this kit. */
    finish(m) {
      const mesh = m.getMesh();
      const n = mesh.vertProperties.length / mesh.numProp;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) pos[i * 3 + c] = mesh.vertProperties[i * mesh.numProp + c];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
      const flat = geo.toNonIndexed(); // flat shading, so cut edges stay crisp
      flat.computeVertexNormals();
      geo.dispose();
      pool.forEach((p) => { try { p.delete(); } catch { /* already freed */ } });
      return flat;
    },
  };
  return kit;
}

/** Hollow dome (upper half of an ellipsoid) with an open base. */
function domeShell(k, s, rx, ry, rz, wall) {
  const outer = k.sub(k.sph(rx, ry, rz), k.box(4 * s, 4 * s, 4 * s, 0, -2 * s, 0));
  return k.sub(outer, k.sph(rx - wall, ry - wall, rz - wall));
}

/** Solid arch profile (straight sides, round top) extruded along z, flat on y = 0. */
function archSolid(k, R, straight, len, zc = 0) {
  const body = k.add(k.box(2 * R, straight, len, 0, straight / 2, zc), k.cylZ(R, len, 0, straight, zc));
  return k.sub(body, k.box(4 * R, 2 * R, len + 2, 0, -R, zc));
}

/**
 * Skull facing +z with its base on y = 0. Hollow skulls are open underneath; solid ones keep shallow sockets.
 * o: hollow, eye (socket radius), mw / mh (mouth size), md (mouth depth), all as multiples of s.
 */
function skullSolid(k, s, o = {}) {
  const { hollow = true, eye = 0.15, mw = 0.44, mh = 0.26, md = 0.6 } = o;
  const wall = wallFor(s);
  const cy = 0.55 * s;
  let r = k.add(k.sph(0.5 * s, 0.5 * s, 0.55 * s, 0, cy, 0), k.box(0.62 * s, 0.34 * s, 0.7 * s, 0, 0.17 * s, 0.2 * s));
  if (hollow) {
    const cavity = k.add(
      k.sph(0.5 * s - wall, 0.5 * s - wall, 0.55 * s - wall, 0, cy, 0),
      k.box(0.62 * s - 2 * wall, 0.34 * s + 2, 0.7 * s - 2 * wall, 0, 0.17 * s - 1, 0.2 * s),
    );
    r = k.sub(r, cavity);
  }
  const eyeZ = hollow ? 0 : 0.34 * s; // solid skulls only get shallow sockets
  [-1, 1].forEach((side) => { r = k.sub(r, k.cylZ(eye * s, s, side * 0.2 * s, 0.66 * s, eyeZ + s / 2)); });
  r = k.sub(r, k.cylZ(0.06 * s, s, 0, 0.46 * s, (hollow ? 0 : 0.4 * s) + s / 2)); // nose
  const depth = md * s + 0.2 * s;
  return k.sub(r, k.box(mw * s, mh * s + 2, depth, 0, (mh * s) / 2 - 1, 0.55 * s - (md * s) / 2)); // mouth
}

/** Two crossed bones with knobbed ends on a thin round base. */
function crossbonesSolid(k, s) {
  const lenB = 1.3 * s, rb = 0.06 * s, kn = 0.1 * s;
  const parts = [k.cylY(0.7 * s, 3, 0, 1.5, 0)];
  [36, -36].forEach((deg) => {
    const bone = k.union(
      k.cylX(rb, lenB),
      ...[-1, 1].flatMap((e) => [-1, 1].map((f) => k.sph(kn, kn, kn, (e * lenB) / 2, 0, f * kn * 0.8))),
    );
    parts.push(k.tr(k.rot(bone, 0, deg, 0), 0, 3 + kn, 0));
  });
  return k.union(...parts);
}

/** Fixed-size holder for a DHT22-style sensor body (about 15 x 25 x 8 mm) with air slots in the front. */
function sensorSolid(k) {
  let r = k.box(22, 18, 36, 0, 9, 0);
  r = k.sub(r, k.box(16.6, 12, 27.6, 0, 12.5, -0.2)); // pocket, open at the top
  for (const x of [-5, 0, 5]) r = k.sub(r, k.box(2.4, 8, 12, x, 9, 17));
  return r;
}

function solidFor(kind, s, k) {
  const wall = wallFor(s);
  switch (kind) {
    case 'tunnel': {
      const R = 0.55 * s, straight = 0.12 * s, len = 1.4 * s;
      return k.sub(archSolid(k, R, straight, len), archSolid(k, R - wall, straight, len + 2));
    }
    case 'cave': {
      const r = domeShell(k, s, 0.6 * s, 0.5 * s, 0.6 * s, wall);
      return k.sub(k.sub(r, k.cylZ(0.22 * s, s, 0, 0.2 * s, 0.6 * s)), k.box(0.44 * s, 0.2 * s + 2, s, 0, 0.1 * s - 1, 0.6 * s));
    }
    case 'log': {
      const len = 1.4 * s, inner = len - wall + 2;
      const r = k.sub(k.cylZ(0.5 * s, len), k.box(2 * s, s, 2 * len, 0, -s / 2, 0));
      return k.sub(r, k.cylZ(0.5 * s - wall, inner, 0, 0, -len / 2 + wall + inner / 2));
    }
    case 'pyramid': {
      const step = 0.18 * s;
      return k.union(...[1, 0.7, 0.4].map((f, i) => k.box(s * f, step, s * f, 0, i * step + step / 2, 0)));
    }
    case 'ramp': {
      const len = 1.6 * s, h = 0.7 * s, wd = 0.5 * s, a = Math.atan2(h, len), deg = (a * 180) / Math.PI;
      const nx = -Math.sin(a), ny = Math.cos(a); // slope normal
      const cutter = k.tr(k.rot(k.box(4 * len, 4 * len, wd + 2), 0, 0, deg), nx * 2 * len, h / 2 + ny * 2 * len, 0);
      const wedge = k.sub(k.box(len, h, wd, 0, h / 2, 0), cutter);
      const rungs = [1, 2, 3, 4, 5].map((i) => {
        const f = i / 6;
        return k.tr(k.rot(k.box(2.5, 2.5, wd), 0, 0, deg), (f - 0.5) * len + nx, f * h + ny, 0);
      });
      return k.union(wedge, ...rungs);
    }
    case 'post': {
      const h = 1.8 * s, pr = 0.1 * s, parts = [k.cylY(0.5 * s, 4, 0, 2, 0), k.cylY(pr, h - 3, 0, 4 + (h - 4) / 2 - 0.5, 0)];
      [0.3, 0.55, 0.8].forEach((f, i) => {
        const len = 0.4 * s;
        parts.push(k.tr(k.rot(k.cylX(0.05 * s, len, pr + len / 2 - 1, 0, 0), 0, ((i * 2.1) * 180) / Math.PI, 0), 0, h * f, 0));
      });
      return k.union(...parts);
    }
    case 'platform': {
      // Pedestal table: the disc is carried on a flare shallower than 45 degrees, so it needs no supports.
      const R = 0.45 * s, h = 0.8 * s, top = Math.max(3, 0.05 * s), col = 0.16 * s, flare = 1.15 * (R - col);
      // Parts overlap by 1 mm so the engine fuses them into one solid (touching faces can pinch).
      const colH = h - top - flare - 3 + 1;
      return k.union(
        k.cylY(0.28 * s, 4, 0, 2, 0),
        k.cylY(col, colH, 0, 3 + colH / 2, 0),
        k.cone(col, R, flare, 0, h - top - flare / 2, 0),
        k.cylY(R, top + 1, 0, h - (top + 1) / 2, 0),
      );
    }
    case 'bridge': {
      const len = 1.6 * s, wd = 0.5 * s, deck = 0.65 * s;
      return k.sub(k.box(len, deck, wd, 0, deck / 2, 0), archSolid(k, 0.45 * s, 0, wd + 2));
    }
    case 'ladder': {
      const h = 1.5 * s, rail = 0.08 * s, dp = 0.1 * s, gap = 0.6 * s;
      const parts = [k.box(0.8 * s, 3, 0.5 * s, 0, 1.5, 0), ...[-1, 1].map((sd) => k.box(rail, h, dp, (sd * gap) / 2, h / 2, 0))];
      for (let i = 1; i <= 6; i++) parts.push(k.box(gap, 0.05 * s, dp, 0, (i / 7) * h, 0));
      return k.union(...parts);
    }
    case 'tower': {
      // Each block is turned 15 degrees and shrunk so its corners stay inside the block below: nothing overhangs.
      const hb = 0.14 * s;
      return k.union(...Array.from({ length: 6 }, (_, i) => k.tr(k.rot(k.box(s * 0.8 ** i, hb + (i < 5 ? 0.5 : 0), s * 0.8 ** i), 0, i * 15, 0), 0, i * hb + hb / 2, 0)));
    }
    case 'archway':
      return k.sub(archSolid(k, 0.6 * s, 0.5 * s, 0.3 * s), archSolid(k, 0.3 * s, 0.5 * s, 0.3 * s + 2));
    case 'webframe': {
      const h = 1.4 * s, post = 0.07 * s, dp = 0.1 * s;
      return k.union(
        k.box(1.2 * s, 3, 0.4 * s, 0, 1.5, 0),
        ...[-1, 1].map((sd) => k.box(post, h, dp, sd * 0.5 * s, h / 2, 0)),
        k.box(1.0 * s, post, dp, 0, h - post / 2, 0),
        ...[0.35, 0.68].map((f) => k.box(1.0 * s, post * 0.8, dp, 0, h * f, 0)),
      );
    }
    case 'skull': return skullSolid(k, s);
    case 'skullbig': return skullSolid(k, s, { eye: 0.19, mw: 0.56, mh: 0.3 });
    case 'skullrock': return skullSolid(k, s, { hollow: false, md: 0.12 });
    case 'skullcap': {
      let r = domeShell(k, s, 0.55 * s, 0.5 * s, 0.6 * s, wall);
      [-1, 1].forEach((side) => { r = k.sub(r, k.cylZ(0.12 * s, s, side * 0.2 * s, 0.26 * s, 0.6 * s)); });
      return k.sub(r, k.box(0.46 * s, 0.22 * s + 2, 0.5 * s, 0, 0.11 * s - 1, 0.5 * s));
    }
    case 'crossbones': return crossbonesSolid(k, s);
    case 'skullbones': return k.add(crossbonesSolid(k, s), k.tr(skullSolid(k, 0.55 * s, { hollow: false, md: 0.12 }), 0, 3 + 0.05 * s, 0));
    case 'mound': return k.sub(k.sph(0.5 * s, 0.4 * s, 0.5 * s), k.box(2 * s, s, 2 * s, 0, -0.5 * s, 0));
    case 'dish': {
      const h = Math.max(8, 0.12 * s);
      return k.sub(k.cylY(0.4 * s, h, 0, h / 2, 0), k.cylY(0.4 * s - wall, h, 0, h / 2 + wall, 0));
    }
    case 'sensor': return sensorSolid(k);
    default: throw new Error(`Unknown toy: ${kind}`);
  }
}

/** A toy as a three.js group (one mesh), in millimetres with its base on y = 0. */
export function buildToy(kind, s, mat) {
  const geo = cached(`${kind}:${KINDS[kind].fixed ? 0 : Math.round(s * 2)}`, () => {
    const k = csgKit();
    return k.finish(solidFor(kind, s, k));
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  return g;
}

/** Overall size in mm of a placed toy: base size follows the spider's leg span and the toy's own scale. */
export function toySizeMm(toy, legSpanIn) {
  if (KINDS[toy.kind].fixed) return 1;
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
  const spots = state.toys.map((t) => ({ t, ...toyPlacement(t, g) }));
  const clash = [];
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      if (Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) < 0.7 * (spots[i].r + spots[j].r)) clash.push(`${KINDS[spots[i].t.kind].name} and ${KINDS[spots[j].t.kind].name}`);
    }
  }
  if (clash.length) rows.push({ ok: false, text: `Overlapping toys: ${clash.slice(0, 3).join('; ')}${clash.length > 3 ? '…' : ''}. Drag them apart.` });
  if (state.decor) {
    const dish = Math.max(0.25, Math.min(0.5, g.m0 * 0.1));
    const dx = g.iw / 2 - dish - 0.15, dz = g.idp / 2 - dish - 0.15; // same spot the scene puts the water bowl
    const hit = spots.filter((o) => Math.hypot(o.x - dx, o.z - dz) < 0.7 * (o.r + dish));
    if (hit.length) rows.push({ ok: false, text: `${hit.map((o) => KINDS[o.t.kind].name).join(', ')} covers the water bowl. Move ${hit.length > 1 ? 'them' : 'it'} away from the front-right corner.` });
  }
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

/** Approximate solid volume of a toy in mm^3 (overlapping parts are counted twice, so treat as an upper bound). */
export function toyVolumeMm3(kind, s) {
  const grp = buildToy(kind, s, new THREE.MeshBasicMaterial());
  grp.updateMatrixWorld(true);
  let v = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  grp.traverse((m) => {
    if (!m.isMesh) return;
    const geo = m.geometry, pos = geo.attributes.position, idx = geo.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const [i0, i1, i2] = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2];
      a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
      v += a.dot(b.cross(c)) / 6;
    }
  });
  return Math.abs(v);
}

/** Rough PLA/PETG use in grams: walls plus 15% infill come to roughly 40% of the solid volume. */
export function toyGrams(kind, s) {
  return (toyVolumeMm3(kind, s) / 1000) * 1.24 * 0.4;
}

/** One-click groups of toys, positions as -1..1 fractions of the free floor. */
export const SETS = {
  skull:   { name: 'Skull set',      items: [['skullbig', 0.5, -0.5, 20], ['crossbones', -0.6, 0.5, 0], ['skullrock', 0.55, 0.55, -25]] },
  jungle:  { name: 'Jungle gym',     items: [['tower', -0.6, -0.5, 0], ['ladder', 0.6, -0.5, 0], ['webframe', 0, 0.6, 0], ['mound', 0.65, 0.55, 0]] },
  starter: { name: 'Starter hides',  items: [['tunnel', -0.5, -0.45, 0], ['ramp', 0.5, -0.5, 90], ['pyramid', -0.6, 0.55, 0], ['mound', 0.6, 0.5, 0]] },
  tree:    { name: 'Tree dweller',   items: [['post', -0.6, -0.55, 0], ['platform', 0.55, -0.45, 0], ['ladder', 0.6, 0.55, 0], ['archway', -0.4, 0.55, 0]] },
};

const GRID = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * Find a spot for a toy that causes no new warnings (no overlap, floor coverage, height or water bowl clash).
 * Tries full size first, then 80% (hides stop being usable if they shrink further). Returns the toy or null.
 */
export function placeToy(kind, existing, state, g, pref = [0, 0], rot = 0) {
  const spots = GRID.flatMap((x) => GRID.map((z) => [x, z])).sort((a, b) => Math.hypot(a[0] - pref[0], a[1] - pref[1]) - Math.hypot(b[0] - pref[0], b[1] - pref[1]));
  for (const scale of KINDS[kind].fixed ? [1] : [1, 0.8]) {
    for (const [x, z] of spots) {
      const toy = { id: newId(), kind, x, z, rot, scale };
      if (toyChecks({ ...state, toys: [...existing, toy] }, g).every((r) => r.ok)) return toy;
    }
  }
  return null;
}

/** Lay out a set inside the current box, skipping anything that does not fit. */
export function fitSet(set, state, g) {
  const toys = [];
  set.items.forEach(([kind, x, z, rot]) => {
    const t = placeToy(kind, toys, state, g, [x, z], rot);
    if (t) toys.push(t);
  });
  return { toys, skipped: set.items.length - toys.length };
}

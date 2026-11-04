import * as THREE from 'three';

// ---- small deterministic noise helpers ----
function hash(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct = 4) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, z * f); norm += amp; f *= 2.03; amp *= 0.5; }
  return s / norm;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Moss at a point (inches from the floor centre) in a floor of size iw x idp.
 * cover 0..1 (soft edges), tone 0..1 (dark to light green), fine 0..1 (fibre speckle), height in inches.
 * Moss is denser near the walls, where moisture collects, and patchy in the open.
 */
export function mossField(x, z, iw, idp) {
  const wall = Math.min(iw / 2 - Math.abs(x), idp / 2 - Math.abs(z));
  const edge = Math.max(0, 1 - wall / 2.2);
  const m = fbm(x * 0.5 + 11, z * 0.5 + 7) * 0.86 + 0.16 * edge + (fbm(x * 2.2 + 3, z * 2.2 + 9, 3) - 0.5) * 0.14;
  const cover = smooth(0.49, 0.6, m);
  const tone = fbm(x * 3 + 3, z * 3 - 5, 3);
  const fine = vnoise(x * 16 + 5, z * 16 + 2);
  return { cover, tone, fine, height: cover * (0.016 + 0.032 * vnoise(x * 9 + 1, z * 9 + 4)) };
}

// ---- textures (cached per floor size so slider drags stay cheap) ----
const texCache = new Map();
function mossTextures(iw, idp) {
  const key = `${iw.toFixed(1)}|${idp.toFixed(1)}`;
  if (texCache.has(key)) return texCache.get(key);
  const w = 512, h = Math.min(1024, Math.max(128, Math.round((512 * idp) / iw)));
  const color = document.createElement('canvas');
  color.width = w; color.height = h;
  const bump = document.createElement('canvas');
  bump.width = w; bump.height = h;
  const cimg = color.getContext('2d').createImageData(w, h);
  const bimg = bump.getContext('2d').createImageData(w, h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = (px / w - 0.5) * iw, z = (py / h - 0.5) * idp;
      const f = mossField(x, z, iw, idp);
      const i = (py * w + px) * 4;
      // dark mossy green to a fresh yellow-green, with fibre speckle and darker, shaded edges
      const shade = (0.72 + 0.28 * f.cover * f.cover) * (0.86 + 0.28 * f.fine);
      const t = Math.min(1, f.tone * 1.25 + 0.18);
      cimg.data[i] = lerp(58, 140, t) * shade + (f.fine > 0.88 ? 28 : 0);
      cimg.data[i + 1] = lerp(92, 178, t) * shade + (f.fine > 0.88 ? 30 : 0);
      cimg.data[i + 2] = lerp(30, 58, t) * shade;
      cimg.data[i + 3] = 255 * Math.min(1, f.cover * (0.85 + 0.3 * f.fine));
      const b = 255 * Math.min(1, (f.height / 0.048) * (0.8 + 0.4 * f.fine));
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = b;
      bimg.data[i + 3] = 255;
    }
  }
  color.getContext('2d').putImageData(cimg, 0, 0);
  bump.getContext('2d').putImageData(bimg, 0, 0);
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bumpMap = new THREE.CanvasTexture(bump);
  if (texCache.size > 4) texCache.delete(texCache.keys().next().value);
  const entry = { map, bumpMap };
  texCache.set(key, entry);
  return entry;
}

/**
 * A thin, patchy moss layer for a floor of iw x idp inches: a lightly displaced surface with a soft-edged
 * texture, plus a scatter of tiny fronds so the patch edges look fuzzy. Origin is the floor centre.
 */
export function createMoss(iw, idp) {
  const group = new THREE.Group();
  const { map, bumpMap } = mossTextures(iw, idp);

  const sx = Math.min(160, Math.max(24, Math.round(iw * 9)));
  const sz = Math.min(160, Math.max(24, Math.round(idp * 9)));
  const geo = new THREE.PlaneGeometry(iw, idp, sx, sz);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, mossField(p.getX(i), p.getZ(i), iw, idp).height);
  geo.computeVertexNormals();
  const layer = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map, bumpMap, bumpScale: 1.5, roughness: 1, metalness: 0,
    transparent: true, alphaTest: 0.02, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  }));
  group.add(layer);

  // Tiny fronds standing on the thicker patches.
  const tufts = [];
  let seed = 1234567;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const budget = Math.min(1800, Math.round(iw * idp * 22));
  for (let tries = 0; tries < budget * 4 && tufts.length < budget; tries++) {
    const x = (rnd() - 0.5) * iw, z = (rnd() - 0.5) * idp;
    const f = mossField(x, z, iw, idp);
    if (f.cover > 0.55 && rnd() < f.cover) tufts.push({ x, z, f });
  }
  if (tufts.length) {
    const cone = new THREE.ConeGeometry(0.011, 0.07, 4, 1);
    cone.translate(0, 0.035, 0);
    const inst = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }), tufts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pos = new THREE.Vector3(), c = new THREE.Color();
    tufts.forEach(({ x, z, f }, i) => {
      const k = 0.6 + rnd() * 0.9;
      e.set((rnd() - 0.5) * 0.7, rnd() * 6.28, (rnd() - 0.5) * 0.7);
      q.setFromEuler(e);
      s.set(k, k * (0.7 + rnd() * 0.8), k);
      pos.set(x, f.height - 0.004, z);
      inst.setMatrixAt(i, m.compose(pos, q, s));
      c.setRGB(lerp(0.22, 0.55, f.tone) * (0.8 + 0.4 * rnd()), lerp(0.36, 0.7, f.tone) * (0.8 + 0.4 * rnd()), 0.12 + 0.08 * rnd());
      inst.setColorAt(i, c);
    });
    group.add(inst);
  }
  return group;
}

/** Gritty brown soil texture (fine grain plus a few light and dark specks) for the substrate. */
export function makeSoilTexture() {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const grain = 0.82 + 0.3 * hash(x, y) + 0.25 * (fbm(x / 22, y / 22, 3) - 0.5);
      const speck = hash(x * 7 + 1, y * 13 + 3);
      let r = 92 * grain, g = 64 * grain, b = 42 * grain;
      if (speck > 0.985) { r += 55; g += 45; b += 30; } else if (speck < 0.012) { r *= 0.45; g *= 0.45; b *= 0.45; }
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = 4;
  return tex;
}

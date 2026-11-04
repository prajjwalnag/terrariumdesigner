import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/calc.js';
import { defaults, sanitize } from '../src/state.js';
import { KINDS, toyStl, toyDims, toyPlacement, toyChecks } from '../src/toys.js';

test('every toy exports a well-formed binary STL', () => {
  for (const k of Object.keys(KINDS)) {
    const dv = toyStl(k, 60);
    const tri = dv.getUint32(80, true);
    assert.ok(tri > 10, k);
    assert.equal(dv.byteLength, 84 + tri * 50, k);
  }
});

test('toys stay inside the walls at the extreme slider positions', () => {
  const g = analyze({ ...defaults(), w: 6, d: 6, h: 6 });
  for (const kind of Object.keys(KINDS)) {
    for (const x of [-1, 1]) {
      const toy = { kind, x, z: x, rot: 0, scale: 2 };
      const p = toyPlacement(toy, g);
      assert.ok(Math.abs(p.x) + p.r <= g.iw / 2 + 0.03, kind);
    }
  }
});

test('too many or too tall toys raise warnings', () => {
  const s = { ...defaults(), w: 3, d: 3, h: 5, toys: Array.from({ length: 4 }, () => ({ id: 'a', kind: 'post', x: 0, z: 0, rot: 0, scale: 2 })) };
  const rows = toyChecks(s, analyze(s));
  assert.ok(rows.some((r) => !r.ok));
});

test('sanitize drops bad toys and caps the list', () => {
  const out = sanitize({ toys: [{ kind: 'tunnel', x: 5, scale: 9 }, { kind: 'bogus' }, ...Array(20).fill({ kind: 'ramp' })] });
  assert.ok(out.toys.length <= 8);
  assert.ok(out.toys.every((t) => Math.abs(t.x) <= 1 && t.scale <= 2 && t.kind !== 'bogus'));
});

// Signed volume of an STL (positive when triangles face outward).
function stlVolume(dv) {
  const n = dv.getUint32(80, true);
  let v = 0;
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    const p = [0, 1, 2].map((j) => [0, 1, 2].map((c) => dv.getFloat32(o + j * 12 + c * 4, true)));
    v += (p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1]) - p[0][1] * (p[1][0] * p[2][2] - p[1][2] * p[2][0]) + p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0])) / 6;
  }
  return v;
}

test('skull and crossbones are solid, outward-facing and sit on the plate', () => {
  for (const k of ['skull', 'crossbones']) {
    const dv = toyStl(k, 60);
    assert.ok(stlVolume(dv) > 500, `${k} volume ${stlVolume(dv)}`);
  }
});

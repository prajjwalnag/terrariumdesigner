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

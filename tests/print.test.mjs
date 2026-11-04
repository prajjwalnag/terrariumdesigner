import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, toyStl } from '../src/toys.js';
import { analyseStl } from '../src/printcheck.js';

test('every toy mesh is closed (no open edges) at several sizes', () => {
  for (const s of [30, 60, 110]) {
    for (const k of Object.keys(KINDS)) {
      const r = analyseStl(toyStl(k, s));
      assert.equal(r.openEdges, 0, `${k} @ ${s} mm has ${r.openEdges} open edges`);
      assert.equal(r.nonManifold, 0, `${k} @ ${s} mm has ${r.nonManifold} non-manifold edges`);
    }
  }
});

test('no toy needs a lot of support material', () => {
  for (const k of Object.keys(KINDS)) {
    const r = analyseStl(toyStl(k, 60));
    assert.ok(r.overhangPct < 20, `${k} overhang ${r.overhangPct.toFixed(1)}%`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mossField } from '../src/moss.js';

function stats(iw, idp) {
  let covered = 0, n = 0, edgeCov = 0, edgeN = 0, centreCov = 0, centreN = 0, maxH = 0;
  for (let x = -iw / 2; x <= iw / 2; x += 0.1) {
    for (let z = -idp / 2; z <= idp / 2; z += 0.1) {
      const f = mossField(x, z, iw, idp);
      n++; if (f.cover > 0.5) covered++;
      maxH = Math.max(maxH, f.height);
      const wall = Math.min(iw / 2 - Math.abs(x), idp / 2 - Math.abs(z));
      if (wall < 1) { edgeN++; if (f.cover > 0.5) edgeCov++; } else if (wall > 2.5) { centreN++; if (f.cover > 0.5) centreCov++; }
    }
  }
  return { cover: covered / n, edge: edgeCov / edgeN, centre: centreCov / Math.max(1, centreN), maxH };
}

test('moss is a patchy layer: partial coverage, thin, and denser near the walls', () => {
  for (const [w, d] of [[6, 6], [10, 8], [14, 14]]) {
    const s = stats(w, d);
    assert.ok(s.cover > 0.2 && s.cover < 0.7, `${w}x${d} cover ${s.cover.toFixed(2)}`);
    assert.ok(s.maxH <= 0.05, `${w}x${d} height ${s.maxH}`);
    if (w >= 10) assert.ok(s.edge > s.centre, `${w}x${d} edge ${s.edge.toFixed(2)} vs centre ${s.centre.toFixed(2)}`);
  }
});

test('moss is deterministic', () => {
  assert.deepEqual(mossField(1.3, -0.7, 8, 8), mossField(1.3, -0.7, 8, 8));
});

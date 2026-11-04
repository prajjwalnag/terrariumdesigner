import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, suggestedVentMm } from '../src/calc.js';
import { defaults } from '../src/state.js';
import { PRESETS } from '../src/presets.js';
import { buildPanels, packSheets, BEDS } from '../src/panels.js';

const apply = (p) => ({ ...defaults(), type: p.type, ls: p.ls / 2.54, w: p.w, d: p.d, h: p.h, sd: p.sd });

test('every preset passes its own species fit checks', () => {
  for (const p of PRESETS) {
    const g = analyze(apply(p));
    const [floor, height] = g.rows;
    assert.ok(floor.ok, `${p.id} floor: ${floor.text}`);
    assert.ok(height.ok, `${p.id} height: ${height.text}`);
  }
});

test('vent size scales with leg span', () => {
  assert.equal(suggestedVentMm(1), 1);
  assert.equal(suggestedVentMm(3), 2);
  assert.equal(suggestedVentMm(5), 3);
});

test('panels pack onto the chosen bed without overlapping', () => {
  for (const key of Object.keys(BEDS)) {
    for (const p of PRESETS) {
      const s = apply(p);
      const panels = buildPanels(s, analyze(s));
      assert.equal(panels.length, 6);
      const { sheets, oversize } = packSheets(panels, BEDS[key]);
      const placed = sheets.reduce((n, sh) => n + sh.panels.length, 0);
      assert.equal(placed + oversize.length, 6, `${p.id} on ${key}`);
    }
  }
});

test('camera positions all produce a camera description', () => {
  for (const cpos of ['top', 'side', 'corner']) {
    const g = analyze({ ...defaults(), cpos, w: 5, d: 5, h: 7 });
    assert.ok(g.cam && g.cam.mode === cpos);
    assert.ok(g.cut.some((r) => /camera/i.test(r[0])));
  }
});

test('the default design opens with no warnings', () => {
  const g = analyze(defaults());
  assert.deepEqual(g.rows.filter((r) => !r.ok).map((r) => r.text), []);
});

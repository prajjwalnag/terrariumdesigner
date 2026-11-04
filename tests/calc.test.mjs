import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, suggestedVentMm } from '../src/calc.js';
import { defaults } from '../src/state.js';
import { buildPanels, packSheets, BEDS } from '../src/panels.js';

test('vent size scales with leg span', () => {
  assert.equal(suggestedVentMm(1), 1);
  assert.equal(suggestedVentMm(3), 2);
  assert.equal(suggestedVentMm(5), 3);
});

const SIZES = [{ w: 3, d: 3, h: 5, sd: 1 }, { w: 10, d: 7, h: 4.5, sd: 2 }, { w: 7, d: 7, h: 11.5, sd: 1.5 }];
test('panels pack onto the chosen bed without losing any', () => {
  for (const key of Object.keys(BEDS)) {
    for (const z of SIZES) {
      const s = { ...defaults(), ...z };
      const panels = buildPanels(s, analyze(s));
      assert.equal(panels.length, 6);
      const { sheets, oversize } = packSheets(panels, BEDS[key]);
      const placed = sheets.reduce((n, sh) => n + sh.panels.length, 0);
      assert.equal(placed + oversize.length, 6, `${JSON.stringify(z)} on ${key}`);
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

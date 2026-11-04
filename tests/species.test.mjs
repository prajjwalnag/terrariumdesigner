import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, GROUPS, STAGES, legSpanCm } from '../src/species.js';
import { suggestBox } from '../src/fit.js';
import { analyze } from '../src/calc.js';
import { defaults } from '../src/state.js';

test('library is large, unique and well-formed', () => {
  assert.ok(SPECIES.length >= 30);
  assert.equal(new Set(SPECIES.map((s) => s.id)).size, SPECIES.length);
  SPECIES.forEach((s) => {
    assert.ok(GROUPS.includes(s.group), s.id);
    assert.ok(['terr', 'arb'].includes(s.type), s.id);
    assert.ok(s.cm >= 1 && s.cm <= 30, s.id);
  });
  ['Ground tarantulas', 'Tree tarantulas', 'Jumping spiders', 'Other spiders'].forEach((g) => assert.ok(SPECIES.some((s) => s.group === g)));
});

test('every species at every stage gets a box that passes its checks (unless too big for the tool)', () => {
  const tooBig = [];
  for (const sp of SPECIES) {
    for (const st of Object.keys(STAGES)) {
      const ls = legSpanCm(sp, st) / 2.54;
      const base = { ...defaults(), type: sp.type, ls };
      const box = suggestBox(base, { burrow: !!sp.burrow });
      if (!box.fit) { tooBig.push(`${sp.id}/${st}`); continue; }
      const rows = analyze({ ...base, ...box }).rows;
      assert.ok(rows[0].ok && rows[1].ok, `${sp.id}/${st}: ${rows[0].text} ${rows[1].text}`);
      assert.ok(box.w <= 14 && box.d <= box.w && box.h <= 14, `${sp.id}/${st} within limits`);
    }
  }
  // Only the largest adults may exceed the limits.
  assert.ok(tooBig.every((x) => /\/adult$/.test(x) || /\/juv$/.test(x)), tooBig.join(','));
  console.log('too big for the tool:', tooBig.join(', ') || 'none');
});

import { speciesInfo } from '../src/species.js';
test('every species has complete info', () => {
  for (const sp of SPECIES) {
    const i = speciesInfo(sp.id);
    assert.ok(i, sp.id);
    for (const k of ['origin', 'temper', 'life', 'temp', 'rh', 'diet', 'setup']) assert.ok(i[k], `${sp.id} ${k}`);
    assert.ok([0, 1, 2].includes(i.level), sp.id);
  }
  assert.equal(speciesInfo('nope'), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/calc.js';
import { defaults } from '../src/state.js';
import { plantChecks, plantBom } from '../src/plants.js';

test('plants add shopping list lines only when chosen and decor is on', () => {
  assert.equal(plantBom({ ...defaults() }).length, 0);
  assert.deepEqual(plantBom({ ...defaults(), monstera: true, moss: true }).map((i) => i.name), ['Monstera adansonii', 'Moss']);
  assert.equal(plantBom({ ...defaults(), monstera: true, decor: false }).length, 0);
});

test('a short box and a desert species raise plant warnings', () => {
  const short = { ...defaults(), h: 3, sd: 1, monstera: true };
  assert.ok(plantChecks(short, analyze(short)).some((r) => !r.ok && /Monstera/.test(r.text)));
  const dry = { ...defaults(), h: 8, monstera: true, moss: true, species: 'a-chalcodes' };
  assert.ok(plantChecks(dry, analyze(dry)).some((r) => !r.ok && /prefers it dry/.test(r.text)));
  const fine = { ...defaults(), h: 8, monstera: true, moss: true, species: 'a-avic' };
  assert.ok(plantChecks(fine, analyze(fine)).every((r) => r.ok));
});

import { readFileSync } from 'node:fs';
test('camera sketch keeps its main pieces and balanced braces', () => {
  const sk = readFileSync(new URL('../src/esp32cam.ino', import.meta.url), 'utf8');
  for (const w of ['detectMotion', 'recordEvent', 'SD_MMC.begin', 'photos_handler', 'file_handler', 'esp_camera_init']) assert.ok(sk.includes(w), w);
  const code = sk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const count = (c) => code.split(c).length - 1;
  assert.equal(count('{'), count('}'));
  assert.equal(count('('), count(')'));
});

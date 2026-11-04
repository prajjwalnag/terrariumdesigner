// Prints a printability report for every toy: mesh integrity and overhang area.
// Run with: node tests/printability.mjs
import { KINDS, toyStl } from '../src/toys.js';
import { analyseStl } from '../src/printcheck.js';

console.log('toy'.padEnd(12), 'tris'.padStart(6), 'open'.padStart(6), 'nonman'.padStart(7), 'overhang%'.padStart(10));
for (const k of Object.keys(KINDS)) {
  const r = analyseStl(toyStl(k, 60));
  console.log(k.padEnd(12), String(r.tris).padStart(6), String(r.openEdges).padStart(6), String(r.nonManifold).padStart(7), r.overhangPct.toFixed(1).padStart(10));
}

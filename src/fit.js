import { analyze } from './calc.js';
import { LIMITS } from './state.js';

const steps = (lo, hi, by) => { const out = []; for (let v = lo; v <= hi + 1e-9; v += by) out.push(+v.toFixed(2)); return out; };

/**
 * Find the smallest box (by volume) that passes the spider's fit checks.
 * Tries to satisfy the camera too; if that is impossible it ignores the camera check.
 * Returns { w, d, h, sd, fit } where fit=false means nothing within the tool's limits works.
 */
export function suggestBox(base, { burrow = false } = {}) {
  const t = base.t;
  const L = base.ls;
  const sdMin = burrow ? 3 : base.type === 'terr' && L >= 2 ? 1.5 : 1;
  const floorOk = (w, d) => {
    const il = w - 2 * t, is = d - 2 * t;
    return base.type === 'terr' ? il >= 2 * L && is >= 1.5 * L : il >= 2 * L && is >= 2 * L;
  };
  const sizes = steps(LIMITS.min, LIMITS.max, 0.5);
  const floors = [];
  sizes.forEach((w) => sizes.forEach((d) => { if (d <= w && floorOk(w, d)) floors.push({ w, d, a: w * d }); }));
  floors.sort((x, y) => x.a - y.a);

  const solve = (speciesOnly, cands) => {
    let best = null;
    cands.forEach(({ w, d }) => {
      steps(LIMITS.minH, LIMITS.max, 0.5).forEach((h) => {
        steps(sdMin, 4, 0.5).forEach((sd) => {
          const rows = analyze({ ...base, w, d, h, sd, decor: true, toys: [] }).rows;
          const ok = speciesOnly ? rows[0].ok && rows[1].ok : rows.every((r) => r.ok);
          const v = w * d * h;
          if (ok && (!best || v < best.v)) best = { w, d, h, sd, v };
        });
      });
    });
    return best;
  };

  const near = floors.slice(0, 10);
  const hit = solve(false, near) || solve(true, near);
  if (hit) return { w: hit.w, d: hit.d, h: hit.h, sd: hit.sd, fit: true };
  // Too big for the tool's limits: show the largest box with the best height we can find.
  const big = solve(true, [{ w: LIMITS.max, d: LIMITS.max }]);
  return big
    ? { w: LIMITS.max, d: LIMITS.max, h: big.h, sd: big.sd, fit: false }
    : { w: LIMITS.max, d: LIMITS.max, h: LIMITS.max, sd: sdMin, fit: false };
}

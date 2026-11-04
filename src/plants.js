import { speciesInfo } from './species.js';
import { fmtLen } from './format.js';

/** Fit-check rows for the live plants and moss. */
export function plantChecks(state, g) {
  const rows = [];
  if (!state.decor || (!state.monstera && !state.moss)) return rows;
  const f = (v) => fmtLen(v, state.unit);
  const names = [state.monstera && 'Monstera', state.moss && 'moss'].filter(Boolean).join(' and ');
  if (state.monstera) {
    const ok = g.free >= 3;
    rows.push({ ok, text: ok ? `There is ${f(g.free)} of free height for the Monstera cutting to climb.` : `Free height is only ${f(g.free)}. A Monstera cutting needs about ${f(3)} or more, so use a taller box or less substrate.` });
  }
  const info = speciesInfo(state.species);
  if (info && info.rhRange[1] < 60) {
    rows.push({ ok: false, text: `${names[0].toUpperCase()}${names.slice(1)} hold moisture, but ${info.name} prefers it dry (${info.rh} humidity). Leave them out for this species.` });
  }
  return rows;
}

/** Shopping-list lines for the live plants and moss. */
export function plantBom(state) {
  if (!state.decor) return [];
  const items = [];
  if (state.monstera) {
    items.push({
      name: 'Monstera adansonii',
      qty: '1 small cutting or plant',
      note: 'Buy it pesticide-free, rinse the roots, and give it bright indirect light or a grow light. The sap irritates skin and mouths, so wash your hands after handling.',
    });
  }
  if (state.moss) {
    items.push({
      name: 'Moss',
      qty: 'about 1 handful of sheet or sphagnum moss',
      note: 'Choose pesticide-free moss. It holds humidity, so it suits damp set-ups and not desert species.',
    });
  }
  return items;
}

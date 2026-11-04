import { CM_PER_IN } from './format.js';

export const LIMITS = { min: 2, max: 14, minH: 2.5 };
export const THIN = 0.118; // 3 mm acrylic, in inches
export const THICK = 0.197; // 5 mm acrylic, in inches
const KEY = 'spider-enclosure-v1';

export const defaults = () => ({
  w: 3, d: 3, h: 5,
  t: THIN,
  brk: 0.5,
  unit: 'in',
  ls: 2 / CM_PER_IN, // leg span, stored in inches
  sd: 1, // substrate depth, inches
  type: 'arb',
  decor: true,
  cam: true,
  cpos: 'top',
  camview: true,
  vents: true,
  logo: true,
  lift: 0,
  auto: true,
  spider: true,
  ventMm: null,
  logoData: null,
  bed: '600x300',
  toys: [],
  pbed: '220',
});

const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

/** Apply ?w=&d=&h=&ls=&sd=&t=&cpos=&type=&unit= overrides (used by share links). */
function applyQuery(s, search) {
  const q = new URLSearchParams(search);
  const num = (k, lo, hi) => {
    const v = parseFloat(q.get(k));
    return q.has(k) && inRange(v, lo, hi) ? v : null;
  };
  const w = num('w', LIMITS.min, LIMITS.max);
  const d = num('d', LIMITS.min, LIMITS.max);
  const h = num('h', LIMITS.minH, LIMITS.max);
  if (w != null) s.w = w;
  if (d != null) s.d = d;
  if (h != null) s.h = h;
  const ls = num('ls', 1, 20); // cm
  if (ls != null) s.ls = ls / CM_PER_IN;
  const sd = num('sd', 0.5, 4);
  if (sd != null) s.sd = sd;
  const t = num('t', 3, 5); // mm
  if (t != null) s.t = t >= 4 ? THICK : THIN;
  const vm = num('vm', 0.5, 6);
  if (vm != null) s.ventMm = vm;
  const pick = (k, list) => (list.includes(q.get(k)) ? q.get(k) : null);
  s.cpos = pick('cpos', ['top', 'side', 'corner']) ?? s.cpos;
  s.type = pick('type', ['terr', 'arb']) ?? s.type;
  s.unit = pick('unit', ['in', 'cm']) ?? s.unit;
  for (const k of ['cam', 'decor', 'vents', 'logo', 'spider']) {
    if (q.get(k) === '0' || q.get(k) === '1') s[k] = q.get(k) === '1';
  }
  return s;
}

export function loadState() {
  const s = defaults();
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) s.auto = false;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) Object.assign(s, JSON.parse(saved));
  } catch { /* storage unavailable */ }
  applyQuery(s, location.search);
  s.toys = sanitizeToys(s.toys);
  s.lift = 0;
  return s;
}

export function saveState(s) {
  try {
    const copy = { ...s };
    if (copy.logoData && copy.logoData.length > 1.5e6) copy.logoData = null;
    localStorage.setItem(KEY, JSON.stringify(copy));
  } catch { /* storage unavailable or full */ }
}

/** Build a URL that reproduces the current design (logo image is not included). */
export function shareUrl(s) {
  const q = new URLSearchParams({
    w: +s.w.toFixed(3), d: +s.d.toFixed(3), h: +s.h.toFixed(3),
    ls: +(s.ls * CM_PER_IN).toFixed(1), sd: s.sd, t: s.t > 0.15 ? 5 : 3,
    type: s.type, cpos: s.cpos, unit: s.unit,
    cam: +s.cam, decor: +s.decor, vents: +s.vents, logo: +s.logo, spider: +s.spider,
  });
  if (s.ventMm != null) q.set('vm', s.ventMm);
  return `${location.origin}${location.pathname}?${q}`;
}

const LOGO_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/** Validate a design loaded from a JSON file; unknown or badly-typed fields are dropped. */
export function sanitize(obj) {
  const base = defaults();
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, def] of Object.entries(base)) {
    const v = obj[k];
    if (v === undefined || k === 'lift') continue;
    if (k === 'toys') { out.toys = sanitizeToys(v); continue; }
    if (k === 'pbed') { if (['120', '180', '220', '256'].includes(String(v))) out.pbed = String(v); continue; }
    if (k === 'logoData') { out[k] = typeof v === 'string' && LOGO_RE.test(v) ? v : null; continue; }
    if (k === 'ventMm') { if (v === null || inRange(v, 0.5, 6)) out[k] = v; continue; }
    if (typeof v !== typeof def) continue;
    if (typeof def === 'number') {
      const [lo, hi] = { w: [LIMITS.min, LIMITS.max], d: [LIMITS.min, LIMITS.max], h: [LIMITS.minH, LIMITS.max], ls: [0.4, 8], sd: [0.5, 4], brk: [0.35, 1], t: [0.1, 0.2] }[k] || [-Infinity, Infinity];
      if (inRange(v, lo, hi)) out[k] = v;
    } else if (k === 'unit') { if (['in', 'cm'].includes(v)) out[k] = v; }
    else if (k === 'type') { if (['terr', 'arb'].includes(v)) out[k] = v; }
    else if (k === 'cpos') { if (['top', 'side', 'corner'].includes(v)) out[k] = v; }
    else if (k === 'bed') { if (typeof v === 'string' && /^\d+x\d+$/.test(v)) out[k] = v; }
    else out[k] = v;
  }
  return out;
}

const TOY_KINDS = ['tunnel', 'pyramid', 'ramp', 'post', 'mound', 'platform'];
function sanitizeToys(list) {
  if (!Array.isArray(list)) return [];
  const num = (v, lo, hi, d) => (inRange(v, lo, hi) ? v : d);
  return list.slice(0, 8).filter((t) => t && TOY_KINDS.includes(t.kind)).map((t) => ({
    id: String(t.id ?? Math.random().toString(36).slice(2)).slice(0, 24).replace(/[^\w-]/g, ''),
    kind: t.kind, x: num(t.x, -1, 1, 0), z: num(t.z, -1, 1, 0), rot: num(t.rot, -360, 360, 0), scale: num(t.scale, 0.5, 2, 1),
  }));
}

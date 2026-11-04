import './style.css';
import { analyze } from './calc.js';
import { createViewer } from './scene.js';
import { fmtLen, fmtCm, CM_PER_IN, MM_PER_IN, escapeHtml } from './format.js';
import { loadState, saveState, shareUrl, sanitize, defaults, LIMITS } from './state.js';
import { buildPanels, packSheets, buildBom, panelSvg, panelCard, BEDS } from './panels.js';
import { SPECIES, GROUPS, STAGES, speciesById, legSpanCm } from './species.js';
import { suggestBox } from './fit.js';
import { LOGOS, rasterise, thumb } from './logos.js';
import sketch from './esp32cam.ino?raw';
import { analyseStl, supportsHint } from './printcheck.js';
import { KINDS, CATEGORIES, SETS, toyGrams, placeToy, fitSet, BEDS_3D, MAX_TOYS, toyDims, toyChecks, toyPlacement, toyStl } from './toys.js';

const $ = (id) => document.getElementById(id);
const all = (sel) => [...document.querySelectorAll(sel)];

const state = loadState();
const viewer = createViewer($('c'));
viewer.setLogo(state.logoData);
let geo = null;
let panels = [];

const unitScale = () => (state.unit === 'cm' ? CM_PER_IN : 1);
const fmt = (v) => fmtLen(v, state.unit);

// ---------- helpers ----------
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const tag = () => `${(state.w * MM_PER_IN).toFixed(0)}x${(state.d * MM_PER_IN).toFixed(0)}x${(state.h * MM_PER_IN).toFixed(0)}mm`;
const same = (a, b) => (typeof a === 'number' ? Math.abs(a - Number(b)) < 0.001 : String(a) === String(b));

// ---------- reflect state into the controls ----------
function syncControls() {
  all('[data-set]').forEach((b) => {
    const [k, v] = b.dataset.set.split(':');
    const on = same(state[k], v);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
  all('[data-size]').forEach((b) => {
    const [w, d, h] = b.dataset.size.split(',').map(Number);
    const on = same(state.w, w) && same(state.d, d) && same(state.h, h);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
  all('[data-view]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  all('[data-bind]').forEach((el) => { el.checked = !!state[el.dataset.bind]; });
  $('ls').value = (state.ls * CM_PER_IN).toFixed(1);
  $('sb').value = state.sd;
  $('brk').value = state.brk;
  $('lid').value = Math.round(state.lift * 100);
  const digits = state.unit === 'cm' ? 1 : 2;
  $('iw').value = (state.w * unitScale()).toFixed(digits);
  $('idp').value = (state.d * unitScale()).toFixed(digits);
  $('ih').value = (state.h * unitScale()).toFixed(digits);
  $('bed').value = BEDS[state.bed] ? state.bed : '600x300';
  describeSpecies();
}

// ---------- render results ----------
function renderResults() {
  const warn = geo.rows.filter((r) => !r.ok).length;
  const badge = $('badge');
  badge.className = `badge ${warn ? 'warn' : 'ok'}`;
  badge.textContent = warn ? `${warn} to review` : 'All good';
  $('fit').innerHTML = geo.rows
    .map((r) => `<div class="fitrow ${r.ok ? 'ok' : 'warn'}"><span class="ic" aria-hidden="true">${r.ok ? '✓' : '!'}</span><span>${escapeHtml(r.text)}</span></div>`)
    .join('');
  $('cut').innerHTML = geo.cut
    .map(([k, v]) => `<div class="cell"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`)
    .join('');
  $('bv').textContent = fmt(state.brk);
  $('lsv').textContent = fmtCm(state.ls);
  $('sbv').textContent = fmt(state.sd);
  if (document.activeElement !== $('vm')) $('vm').value = geo.ventMm;

  panels = buildPanels(state, geo);
  $('panels').innerHTML = panels.map(panelCard).join('');
  $('bom').innerHTML = buildBom(state, geo, panels)
    .map((i) => `<li><span class="nm">${escapeHtml(i.name)}</span><span class="q">${escapeHtml(i.qty)}</span><span class="n">${escapeHtml(i.note)}</span></li>`)
    .join('');

  const bed = BEDS[state.bed] || BEDS['600x300'];
  const { sheets, oversize } = packSheets(panels, bed);
  $('sheetinfo').textContent = oversize.length
    ? `${oversize.map((p) => p.name).join(', ')} ${oversize.length > 1 ? 'are' : 'is'} too big for this bed. Choose a larger bed or a smaller box.`
    : `All six panels fit on ${sheets.length} sheet${sheets.length > 1 ? 's' : ''} of ${bed.w} × ${bed.h} mm.`;
}

function update() {
  geo = analyze(state);
  geo.rows.push(...toyChecks(state, geo));
  viewer.rebuild(state, geo);
  renderResults();
  saveState(state);
}

function change(patch) {
  Object.assign(state, patch);
  syncControls();
  update();
  if (typeof renderToys === 'function') renderToys();
}

// ---------- box size ----------
function applySize() {
  const k = unitScale();
  const w = parseFloat($('iw').value) / k;
  const d = parseFloat($('idp').value) / k;
  const h = parseFloat($('ih').value) / k;
  const ok = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  if (!ok(w, LIMITS.min, LIMITS.max) || !ok(d, LIMITS.min, LIMITS.max) || !ok(h, LIMITS.minH, LIMITS.max)) {
    $('err').textContent = `Enter width and depth from ${(LIMITS.min * k).toFixed(0)} to ${(LIMITS.max * k).toFixed(0)} ${state.unit}, and height from ${(LIMITS.minH * k).toFixed(1)} to ${(LIMITS.max * k).toFixed(0)} ${state.unit}`;
    return;
  }
  $('err').textContent = '';
  change({ w, d, h });
}
$('ap').onclick = applySize;
['iw', 'idp', 'ih'].forEach((id) => {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') applySize(); });
  $(id).addEventListener('input', () => { $('err').textContent = ''; });
});

// ---------- generic bindings ----------
all('[data-set]').forEach((b) => b.addEventListener('click', () => {
  const [k, v] = b.dataset.set.split(':');
  $('err').textContent = '';
  change({ [k]: typeof defaults()[k] === 'number' ? Number(v) : v });
}));
all('[data-size]').forEach((b) => b.addEventListener('click', () => {
  const [w, d, h] = b.dataset.size.split(',').map(Number);
  $('err').textContent = '';
  change({ w, d, h });
}));
all('[data-bind]').forEach((el) => el.addEventListener('change', () => {
  const k = el.dataset.bind;
  if (k === 'auto') { state.auto = el.checked; viewer.setAuto(el.checked); saveState(state); return; }
  change({ [k]: el.checked });
}));
$('ls').oninput = (e) => { state.ls = parseFloat(e.target.value) / CM_PER_IN; update(); };
$('ls').onchange = () => renderToys();
$('sb').oninput = (e) => { state.sd = parseFloat(e.target.value); update(); };
$('brk').oninput = (e) => { state.brk = parseFloat(e.target.value); update(); };
$('lid').oninput = (e) => { state.lift = e.target.value / 100; viewer.applyLift(state); };

// ---------- species ----------
$('species').innerHTML = `<option value="">Choose a spider…</option>${GROUPS.map((g) => `<optgroup label="${escapeHtml(g)}">${SPECIES.filter((x) => x.group === g).map((x) => `<option value="${x.id}">${escapeHtml(x.name)} (${escapeHtml(x.sci)})</option>`).join('')}</optgroup>`).join('')}`;

function describeSpecies() {
  const sp = speciesById(state.species);
  $('species').value = sp ? sp.id : '';
  all('[data-stage]').forEach((b) => { const on = b.dataset.stage === state.stage; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $('speciesinfo').textContent = sp
    ? `${sp.sci} · ${sp.type === 'terr' ? 'ground dweller' : 'tree dweller'} · adults about ${sp.cm} cm.${sp.note ? ` ${sp.note}` : ''}`
    : 'Pick a species to set the type, leg span and a box that fits.';
}

function fitBox(announce = true) {
  const sp = speciesById(state.species);
  const box = suggestBox(state, { burrow: !!(sp && sp.burrow) });
  change({ w: box.w, d: box.d, h: box.h, sd: box.sd, decor: true });
  if (announce) toast(box.fit ? 'Box sized to fit this spider.' : 'This spider needs more room than the 14 in limit. Showing the largest box.');
}

function applySpecies(id, stage = state.stage) {
  const sp = speciesById(id);
  state.stage = stage;
  if (!sp) { state.species = ''; change({}); describeSpecies(); return; }
  Object.assign(state, { species: id, type: sp.type, ls: legSpanCm(sp, stage) / CM_PER_IN, ventMm: null });
  fitBox(false);
  describeSpecies();
  toast(`Loaded ${sp.name}, ${STAGES[stage].label.toLowerCase()} size.`);
}
$('species').onchange = (e) => applySpecies(e.target.value);
all('[data-stage]').forEach((b) => b.addEventListener('click', () => {
  if (speciesById(state.species)) applySpecies(state.species, b.dataset.stage);
  else { state.stage = b.dataset.stage; describeSpecies(); saveState(state); }
}));
$('fitbox').onclick = () => fitBox();

// ---------- logo ----------
$('up').onclick = () => $('fi').click();
$('fi').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/png');
      viewer.setLogo(data);
      change({ logoData: data, logo: true });
    };
    img.onerror = () => toast('That file could not be read as an image.');
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
};
$('logos').innerHTML = LOGOS.map((l) => `<button type="button" class="btn" data-logo="${l.id}" aria-label="${escapeHtml(l.name)} logo" title="${escapeHtml(l.name)}">${thumb(l.svg)}<span>${escapeHtml(l.name)}</span></button>`).join('');
$('logos').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-logo]');
  const l = b && LOGOS.find((x) => x.id === b.dataset.logo);
  if (!l) return;
  try {
    const data = await rasterise(l.svg);
    viewer.setLogo(data);
    change({ logoData: data, logo: true });
  } catch { toast('Could not load that logo.'); }
});
$('upclr').onclick = () => { viewer.setLogo(null); change({ logoData: null }); };

// ---------- viewer tools ----------
all('[data-view]').forEach((b) => b.addEventListener('click', () => {
  viewer.setView(b.dataset.view);
  all('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  all('[data-view]').forEach((x) => x.classList.toggle('on', x === b));
}));
$('zin').onclick = () => viewer.zoom(0.8);
$('zout').onclick = () => viewer.zoom(1.25);
$('full').onclick = () => {
  const el = $('stage');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen().catch(() => toast('Full screen is not available here.'));
  else toast('Full screen is not available here.');
};
$('shot').onclick = () => {
  const src = viewer.snapshot();
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = getComputedStyle($('stage')).backgroundColor || '#e9e4d6';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  out.toBlob((blob) => {
    if (!blob) return toast('Could not save the picture.');
    download(`spider-enclosure-${tag()}.png`, blob, 'image/png');
  });
};

// ---------- export ----------
$('bed').innerHTML = Object.entries(BEDS).map(([k, b]) => `<option value="${k}">${escapeHtml(b.label)}</option>`).join('');
$('bed').onchange = (e) => change({ bed: e.target.value });
const currentSheets = () => packSheets(panels, BEDS[state.bed] || BEDS['600x300']);

$('exsheet').onclick = () => {
  const { sheets, oversize } = currentSheets();
  if (oversize.length) { toast(`${oversize.map((p) => p.name).join(', ')} won't fit this bed.`); }
  sheets.forEach((sh, i) => {
    setTimeout(() => download(`spider-enclosure-${tag()}-sheet${sheets.length > 1 ? sh.index : ''}.svg`, sh.svg, 'image/svg+xml'), i * 250);
  });
};
$('exeach').onclick = () => panels.forEach((p, i) => {
  setTimeout(() => download(`spider-enclosure-${tag()}-${p.id}.svg`, panelSvg(p), 'image/svg+xml'), i * 250);
});
$('exjson').onclick = () => {
  const data = { ...state, logoData: state.logoData ? '[embedded logo omitted]' : null };
  download(`spider-enclosure-${tag()}.json`, JSON.stringify(data, null, 2), 'application/json');
};
$('imjson').onclick = () => $('jsonfile').click();
$('jsonfile').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const patch = sanitize(JSON.parse(await f.text()));
    if (!Object.keys(patch).length) throw new Error('empty');
    if ('logoData' in patch) viewer.setLogo(patch.logoData);
    change(patch);
    toast('Design loaded.');
  } catch {
    toast('That file is not a valid design.');
  }
};
$('share').onclick = async () => {
  const url = shareUrl(state);
  try { await navigator.clipboard.writeText(url); toast('Link copied. The logo image is not included.'); }
  catch { window.prompt('Copy this link:', url); }
};
$('vm').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  if (!Number.isFinite(v) || v < 0.5 || v > 6) {
    $('vmerr').textContent = 'Enter a diameter from 0.5 to 6 mm';
    e.target.value = geo.ventMm;
  } else {
    $('vmerr').textContent = '';
    change({ ventMm: v });
  }
});
$('vmauto').onclick = () => { $('vmerr').textContent = ''; change({ ventMm: null }); };

$('reset').onclick = () => {
  if (!confirm('Reset the design to its defaults?')) return;
  const d = defaults();
  d.auto = state.auto;
  viewer.setLogo(null);
  change(d);
};

// ---------- theme ----------
$('theme').onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('terrarium-theme', root.dataset.theme); } catch { /* ignore */ }
};

syncControls();
update();
viewer.setAuto(state.auto);

// ---------- toys ----------
let toyCat = 'hide';
function renderToyKinds() {
  $('toytabs').innerHTML = Object.entries(CATEGORIES).map(([k, l]) => `<button type="button" data-cat="${k}" class="${k === toyCat ? 'on' : ''}" aria-pressed="${k === toyCat}">${escapeHtml(l)}</button>`).join('');
  $('toykinds').innerHTML = Object.entries(KINDS).filter(([, v]) => v.cat === toyCat)
    .map(([k, v]) => `<button type="button" class="btn" data-toy="${k}" ${state.toys.length >= MAX_TOYS ? 'disabled' : ''}><b>+ ${escapeHtml(v.name)}</b><span>${escapeHtml(v.blurb)}</span></button>`).join('');
}
$('toytabs').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { toyCat = b.dataset.cat; renderToyKinds(); } });
renderToyKinds();
$('pbed').innerHTML = Object.entries(BEDS_3D).map(([k, l]) => `<option value="${k}">${escapeHtml(l)}</option>`).join('');
$('pbed').value = state.pbed;
$('pbed').onchange = (e) => { state.pbed = e.target.value; renderToys(); saveState(state); };

const hintCache = new Map();
function printHint(t, d) {
  const key = `${t.kind}:${Math.round(d.s * 2)}`;
  if (!hintCache.has(key)) hintCache.set(key, supportsHint(analyseStl(toyStl(t.kind, d.s)).overhangPct));
  return hintCache.get(key);
}
const SLIDERS = [['x', 'Left–right', -100, 100, 100], ['z', 'Front–back', -100, 100, 100], ['rot', 'Rotate', -180, 180, 1], ['scale', 'Size', 50, 200, 100]];
function renderToys() {
  const bed = Number(state.pbed);
  $('toylist').innerHTML = state.toys.map((t) => {
    const d = toyDims(t, geo.L);
    const big = Math.max(d.w, d.l) > bed || false;
    const rows = SLIDERS.filter(([k]) => !(k === 'scale' && KINDS[t.kind].fixed)).map(([k, lbl, lo, hi, div]) => `<label class="slider">${lbl}<input type="range" data-toyid="${t.id}" data-k="${k}" min="${lo}" max="${hi}" step="1" value="${Math.round(t[k] * div)}"><output></output></label>`).join('');
    return `<div class="toy" data-id="${t.id}"><div class="toy-head"><span>${escapeHtml(KINDS[t.kind].name)}<small>${d.w.toFixed(0)} × ${d.l.toFixed(0)} × ${d.h.toFixed(0)} mm · about <b>${toyGrams(t.kind, d.s).toFixed(0)} g</b> of filament · ${printHint(t, d)}</small></span>
      <span class="toy-btns"><button type="button" class="btn" data-act="stl" data-toyid="${t.id}">STL</button><button type="button" class="btn" data-act="del" data-toyid="${t.id}" aria-label="Remove ${escapeHtml(KINDS[t.kind].name)}">✕</button></span></div>${rows}
      ${big ? `<p class="warn">Wider than your ${bed} mm print bed. Reduce the size.</p>` : ''}</div>`;
  }).join('');
  all('#toylist input[type=range]').forEach(syncToyOut);
  $('toykinds').querySelectorAll('button').forEach((b) => { b.disabled = state.toys.length >= MAX_TOYS; });
}
function syncToyOut(el) {
  const t = state.toys.find((x) => x.id === el.dataset.toyid);
  if (!t) return;
  const k = el.dataset.k;
  el.nextElementSibling.textContent = k === 'rot' ? `${Math.round(t.rot)}°` : k === 'scale' ? `${Math.round(t.scale * 100)}%` : `${Math.round(t[k] * 100)}`;
}
const saveStl = (t) => {
  const s = toyDims(t, geo.L).s;
  download(`toy-${t.kind}-${Math.round(s)}mm.stl`, toyStl(t.kind, s), 'model/stl');
};
$('toykinds').addEventListener('click', (e) => {
  const b = e.target.closest('[data-toy]');
  if (!b || state.toys.length >= MAX_TOYS) return;
  const placed = placeToy(b.dataset.toy, state.toys, state, geo, [0.5, -0.5]);
  // If nothing fits cleanly, still add it so the warnings explain why.
  state.toys.push(placed || { id: Math.random().toString(36).slice(2, 10), kind: b.dataset.toy, x: 0, z: 0, rot: 0, scale: 1 });
  update(); renderToys();
  if (!placed) toast('No clear spot left. Use a bigger box or remove a toy.');
});
$('toylist').addEventListener('input', (e) => {
  const el = e.target.closest('input[data-toyid]');
  const t = el && state.toys.find((x) => x.id === el.dataset.toyid);
  if (!t) return;
  const [, , , , div] = SLIDERS.find(([k]) => k === el.dataset.k);
  t[el.dataset.k] = el.dataset.k === 'rot' ? Number(el.value) : Number(el.value) / div;
  syncToyOut(el);
  update();
});
$('toylist').addEventListener('change', (e) => {
  // Refresh sizes and bed warnings once a drag ends, keeping keyboard focus on the same slider.
  const id = e.target.dataset && e.target.dataset.toyid;
  const k = e.target.dataset && e.target.dataset.k;
  renderToys();
  if (id && k) { const el = $('toylist').querySelector(`input[data-toyid="${id}"][data-k="${k}"]`); if (el) el.focus(); }
});
$('toylist').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  const t = b && state.toys.find((x) => x.id === b.dataset.toyid);
  if (!t) return;
  if (b.dataset.act === 'del') { state.toys = state.toys.filter((x) => x !== t); update(); renderToys(); } else saveStl(t);
});
$('toyall').onclick = () => {
  if (!state.toys.length) return toast('Add a toy first.');
  state.toys.forEach((t, i) => setTimeout(() => saveStl(t), i * 300));
};
renderToys();

// ---------- drag toys in the 3D view ----------
let dragFrame = 0;
viewer.onToyMove((id, x, z) => {
  const t = state.toys.find((q) => q.id === id);
  if (!t) return;
  t.x = x; t.z = z;
  if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; update(); });
});
viewer.onToyDragEnd(() => { update(); renderToys(); });

// ---------- toy sets ----------
$('toysets').innerHTML = Object.entries(SETS).map(([k, v]) => `<button type="button" class="btn" data-toyset="${k}">${escapeHtml(v.name)}</button>`).join('');
$('toysets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-toyset]');
  const set = b && SETS[b.dataset.toyset];
  if (!set) return;
  if (state.toys.length && !confirm(`Replace your ${state.toys.length} toy${state.toys.length > 1 ? 's' : ''} with the ${set.name.toLowerCase()}?`)) return;
  let { toys, skipped } = fitSet(set, state, geo);
  if (skipped) {
    // Offer a bigger floor so the whole set fits.
    for (let i = 1; i <= 24 && skipped; i++) {
      const w = Math.min(LIMITS.max, state.w + i * 0.5), d = Math.min(LIMITS.max, state.d + i * 0.5);
      const trial = { ...state, w, d };
      const r = fitSet(set, trial, analyze(trial));
      if (!r.skipped) {
        if (confirm(`The whole ${set.name.toLowerCase()} needs a bigger floor. Enlarge the box to ${fmt(w)} × ${fmt(d)}?`)) { Object.assign(state, { w, d }); ({ toys, skipped } = r); }
        break;
      }
    }
  }
  state.toys = toys;
  change({});
  renderToys();
  toast(!toys.length ? 'This box is too small for that set. Try a bigger box.' : skipped ? `Added ${toys.length} of ${set.items.length} toys that fit. A bigger box fits the rest.` : `${set.name} added. Drag the toys to move them.`);
});
$('toyclear').onclick = () => { state.toys = []; update(); renderToys(); };

// ---------- camera sketch ----------
$('skdl').onclick = () => download('spider-cam.ino', sketch, 'text/plain');
$('skcopy').onclick = async () => {
  try { await navigator.clipboard.writeText(sketch); toast('Sketch copied.'); } catch { toast('Copy failed. Use Download instead.'); }
};

// ---------- print summary ----------
$('print').onclick = () => {
  const sp = speciesById(state.species);
  const src = viewer.snapshot();
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  const c = out.getContext('2d');
  c.fillStyle = '#f3efe4'; c.fillRect(0, 0, out.width, out.height); c.drawImage(src, 0, 0);
  const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  const bom = buildBom(state, geo, panels).map((i) => `<tr><td><b>${escapeHtml(i.name)}</b></td><td>${escapeHtml(i.qty)}</td><td class="muted">${escapeHtml(i.note)}</td></tr>`).join('');
  const toys = state.toys.map((t) => { const d = toyDims(t, geo.L); return `<tr><td><b>${escapeHtml(KINDS[t.kind].name)}</b></td><td>${d.w.toFixed(0)} × ${d.l.toFixed(0)} × ${d.h.toFixed(0)} mm</td><td>about ${toyGrams(t.kind, d.s).toFixed(0)} g</td></tr>`; }).join('');
  $('printsheet').innerHTML = `<h1>Spider enclosure ${fmt(state.w)} × ${fmt(state.d)} × ${fmt(state.h)}</h1>
    <div class="muted">${sp ? `${escapeHtml(sp.name)} (${escapeHtml(sp.sci)}), ` : ''}leg span ${fmtCm(state.ls)}, ${state.type === 'terr' ? 'ground' : 'tree'} dweller, ${state.t > 0.15 ? 5 : 3} mm acrylic</div>
    <img alt="3D preview" src="${out.toDataURL('image/png')}">
    <h2>Fit checks</h2>${list(geo.rows.map((r) => `${r.ok ? '✓' : '!'} ${escapeHtml(r.text)}`))}
    <h2>Cut list</h2><table>${geo.cut.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
    <h2>Shopping list</h2><table>${bom}</table>
    ${toys ? `<h2>3D-printed toys</h2><table>${toys}</table>` : ''}
    <h2>Assembly</h2><ol>${[...document.querySelectorAll('.steps li')].map((li) => `<li>${li.innerHTML}</li>`).join('')}</ol>
    <p class="muted">Check all dimensions before cutting. This tool checks geometry only; research your species' needs.</p>`;
  window.print();
};

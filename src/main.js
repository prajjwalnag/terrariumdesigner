import './style.css';
import { analyze } from './calc.js';
import { createViewer } from './scene.js';
import { fmtLen, fmtCm, CM_PER_IN, MM_PER_IN, escapeHtml } from './format.js';
import { loadState, saveState, shareUrl, sanitize, defaults, LIMITS } from './state.js';
import { buildPanels, packSheets, buildBom, panelSvg, panelCard, BEDS } from './panels.js';
import { PRESETS } from './presets.js';
import { KINDS, BEDS_3D, MAX_TOYS, toyDims, toyChecks, toyPlacement, toyStl } from './toys.js';

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

// ---------- presets ----------
$('preset').innerHTML = `<option value="">Choose…</option>${PRESETS.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}`;
$('preset').onchange = (e) => {
  const p = PRESETS.find((x) => x.id === e.target.value);
  if (!p) return;
  change({ type: p.type, ls: p.ls / CM_PER_IN, w: p.w, d: p.d, h: p.h, sd: p.sd, ventMm: null });
  toast(`Loaded: ${p.name}`);
};

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
  $('preset').value = '';
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
$('toykinds').innerHTML = Object.entries(KINDS)
  .map(([k, v]) => `<button type="button" class="btn" data-toy="${k}"><b>+ ${escapeHtml(v.name)}</b><span>${escapeHtml(v.blurb)}</span></button>`).join('');
$('pbed').innerHTML = Object.entries(BEDS_3D).map(([k, l]) => `<option value="${k}">${escapeHtml(l)}</option>`).join('');
$('pbed').value = state.pbed;
$('pbed').onchange = (e) => { state.pbed = e.target.value; renderToys(); saveState(state); };

const SLIDERS = [['x', 'Left–right', -100, 100, 100], ['z', 'Front–back', -100, 100, 100], ['rot', 'Rotate', -180, 180, 1], ['scale', 'Size', 50, 200, 100]];
function renderToys() {
  const bed = Number(state.pbed);
  $('toylist').innerHTML = state.toys.map((t) => {
    const d = toyDims(t, geo.L);
    const big = Math.max(d.w, d.l) > bed || false;
    const rows = SLIDERS.map(([k, lbl, lo, hi, div]) => `<label class="slider">${lbl}<input type="range" data-toyid="${t.id}" data-k="${k}" min="${lo}" max="${hi}" step="1" value="${Math.round(t[k] * div)}"><output></output></label>`).join('');
    return `<div class="toy" data-id="${t.id}"><div class="toy-head"><span>${escapeHtml(KINDS[t.kind].name)}<small>${d.w.toFixed(0)} × ${d.l.toFixed(0)} × ${d.h.toFixed(0)} mm</small></span>
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
  const n = state.toys.length;
  state.toys.push({ id: Math.random().toString(36).slice(2, 10), kind: b.dataset.toy, x: [0.6, -0.6, 0, 0.6][n % 4], z: [-0.6, 0.6, 0.6, 0.6][n % 4], rot: 0, scale: 1 });
  update(); renderToys();
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

import { MM_PER_IN, round2, escapeHtml } from './format.js';
import { plantBom } from './plants.js';
import { doorLayout, ventBlockedByHinge, SCREW, DOOR_GAP, BOT_GAP } from './door.js';
import { CAM_HOLE_MM, ventLayout, ventBlockedByCamera, magnetRadius } from './calc.js';

export const BEDS = {
  '300x200': { label: '300 × 200 mm (small desktop)', w: 300, h: 200 },
  '600x300': { label: '600 × 300 mm (common)', w: 600, h: 300 },
  '600x400': { label: '600 × 400 mm', w: 600, h: 400 },
  '900x600': { label: '900 × 600 mm (large)', w: 900, h: 600 },
};

/** Build the flat panels (millimetres) with their cut holes and engraving. */
export function buildPanels(s, g) {
  const { W, D, t, hw } = g;
  const mm = MM_PER_IN;
  const vent = s.vents ? ventLayout(g) : { ys: [], zs: [], xs: [] };
  const mk = (id, name, w, h) => ({ id, name, w, h, holes: [], engrave: [] });
  const panels = [];

  const DL = doorLayout(s, g);
  const front = DL.on ? mk('door', 'Door', DL.doorW, DL.doorH) : mk('front', 'Front', W * mm, hw * mm);
  if (DL.on) {
    // Door: hinge-side coordinates run from the hinge edge; mirror them for a right-hinged door.
    const px = (xd) => (DL.side === 'left' ? xd : DL.doorW - xd);
    front.holes.push({ x: px(DL.knob.xd), y: DL.knob.y - BOT_GAP, d: 2 * SCREW, hw: true });
    DL.hinges.forEach((h) => [8, 18].forEach((d) => front.holes.push({ x: px(d), y: h.yc - BOT_GAP, d: 2 * SCREW, hw: true })));
    if (s.logo) {
      const L = DL.logo, size = L.size;
      const box = { x: px(L.xd) - size / 2, y: L.y - BOT_GAP - size / 2, w: size, h: size };
      front.engrave.push(s.logoData ? { type: 'image', ...box, href: s.logoData } : { type: 'rect', ...box, label: 'logo area' });
    }
  } else if (s.logo) {
    const size = Math.min(W * 0.5, hw * 0.6) * mm;
    const cx = (W * mm) / 2;
    const cy = hw * 0.45 * mm;
    const box = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
    front.engrave.push(
      s.logoData ? { type: 'image', ...box, href: s.logoData } : { type: 'rect', ...box, label: 'logo area' },
    );
  }
  panels.push(front);

  const back = mk('back', 'Back', W * mm, hw * mm);
  vent.ys.forEach((y) => vent.xs.forEach((x) => back.holes.push({ x: (W / 2 + x) * mm, y: (y - t) * mm, d: g.ventMm })));
  panels.push(back);

  const sideW = (D - 2 * t) * mm;
  const left = mk('left', 'Left', sideW, hw * mm);
  const right = mk('right', 'Right', sideW, hw * mm);
  vent.ys.forEach((y) => {
    vent.zs.forEach((z) => {
      const x = ((D - 2 * t) / 2 + z) * mm;
      if (!ventBlockedByHinge(s, g, 'left', z, y)) left.holes.push({ x, y: (y - t) * mm, d: g.ventMm });
      if (!ventBlockedByCamera(s, g, z, y) && !ventBlockedByHinge(s, g, 'right', z, y)) right.holes.push({ x, y: (y - t) * mm, d: g.ventMm });
    });
  });
  if (g.cam && g.cam.mode === 'side') {
    right.holes.push({ x: ((D - 2 * t) / 2) * mm, y: (g.camY - t) * mm, d: CAM_HOLE_MM, cam: true });
  }
  if (DL.on) {
    // Hinge leaves screw onto the outside of the hinge-side wall, 8 and 18 mm back from its front edge.
    // Viewed from outside the left wall the front edge is on the right; for the right wall it is on the left.
    const wall = DL.side === 'left' ? left : right;
    DL.hinges.forEach((h) => [8, 18].forEach((d) => wall.holes.push({ x: DL.side === 'left' ? wall.w - d : d, y: h.yc, d: 2 * SCREW, hw: true })));
  }
  panels.push(left, right, mk('base', 'Base', W * mm, D * mm));

  const lid = mk('lid', 'Lid', W * mm, D * mm);
  if (g.cam && g.cam.mode === 'top') lid.holes.push({ x: (W / 2) * mm, y: (D / 2) * mm, d: CAM_HOLE_MM, cam: true });
  if (g.cam && g.cam.mode === 'corner') {
    const c = g.cam;
    // The slot is drilled at an angle, so the hole is stretched by the plate thickness.
    const d = CAM_HOLE_MM + t * mm * Math.tan(c.al);
    lid.holes.push({ x: (W / 2 + c.px) * mm, y: (D / 2 - c.pz) * mm, d, cam: true });
  }
  panels.push(lid);
  return panels;
}

const CUT = 'fill="none" stroke="#ff0000" stroke-width="0.1"';

/** One panel as an SVG group. `rot` places it rotated 90° (long side along the bed). */
function panelGroup(p, x, y, rot = false) {
  const tf = rot ? `translate(${round2(x + p.h)} ${round2(y)}) rotate(90)` : `translate(${round2(x)} ${round2(y)})`;
  let out = `<g id="${p.id}" transform="${tf}">`;
  out += `<rect x="0" y="0" width="${round2(p.w)}" height="${round2(p.h)}" ${CUT}/>`;
  p.holes.forEach((h) => {
    out += `<circle cx="${round2(h.x)}" cy="${round2(p.h - h.y)}" r="${round2(h.d / 2)}" ${CUT}/>`;
  });
  p.engrave.forEach((e) => {
    const ey = round2(p.h - e.y - e.h);
    if (e.type === 'rect') {
      out += `<rect x="${round2(e.x)}" y="${ey}" width="${round2(e.w)}" height="${round2(e.h)}" fill="none" stroke="#0000ff" stroke-width="0.1" stroke-dasharray="2 2"/>`;
    } else if (e.type === 'image') {
      out += `<image x="${round2(e.x)}" y="${ey}" width="${round2(e.w)}" height="${round2(e.h)}" href="${e.href}" preserveAspectRatio="xMidYMid meet"/>`;
    }
  });
  return `${out}</g>`;
}

const svgDoc = (w, h, body) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${round2(w)}mm" height="${round2(h)}mm" viewBox="0 0 ${round2(w)} ${round2(h)}">${body}</svg>\n`;

export const panelSvg = (p) => svgDoc(p.w, p.h, panelGroup(p, 0, 0));

/**
 * Shelf-pack panels onto one or more sheets of the given bed size.
 * Panels are rotated 90° when that is the only way they fit.
 */
export function packSheets(panels, bed, gap = 6) {
  const sheets = [];
  const oversize = [];
  const queue = [];
  panels.forEach((p) => {
    const fits = p.w + 2 * gap <= bed.w && p.h + 2 * gap <= bed.h;
    const fitsRot = p.h + 2 * gap <= bed.w && p.w + 2 * gap <= bed.h;
    if (!fits && !fitsRot) { oversize.push(p); return; }
    queue.push({ p, rot: !fits && fitsRot });
  });
  queue.sort((a, b) => (b.rot ? b.p.w : b.p.h) - (a.rot ? a.p.w : a.p.h));

  let cur = null;
  const fresh = () => ({ items: [], x: gap, y: gap, rowH: 0, usedW: 0 });
  queue.forEach((q) => {
    const w = q.rot ? q.p.h : q.p.w;
    const h = q.rot ? q.p.w : q.p.h;
    for (;;) {
      if (!cur) { cur = fresh(); sheets.push(cur); }
      if (cur.x + w + gap > bed.w && cur.x > gap) { cur.x = gap; cur.y += cur.rowH + gap; cur.rowH = 0; }
      if (cur.y + h + gap > bed.h) { cur = null; continue; } // start a new sheet
      cur.items.push({ ...q, x: cur.x, y: cur.y });
      cur.x += w + gap;
      cur.rowH = Math.max(cur.rowH, h);
      cur.usedW = Math.max(cur.usedW, cur.x);
      break;
    }
  });

  const out = sheets.map((sh, i) => {
    const height = sh.y + sh.rowH + gap;
    const width = Math.max(sh.usedW, 1);
    return {
      index: i + 1,
      width,
      height,
      svg: svgDoc(width, height, sh.items.map((it) => panelGroup(it.p, it.x, it.y, it.rot)).join('')),
      panels: sh.items.map((it) => it.p.name),
    };
  });
  return { sheets: out, oversize };
}

/** Sizes and shopping list derived from the design. */
export function buildBom(s, g, panels) {
  const holes = panels.reduce((n, p) => n + p.holes.filter((h) => !h.cam && !h.hw).length, 0);
  const areaMm2 = panels.reduce((a, p) => a + p.w * p.h, 0);
  const IN3_TO_L = 0.016387;
  const substrateL = s.decor ? g.iw * g.idp * g.sd * IN3_TO_L : 0;
  const magDiaMm = +(magnetRadius(g) * 2 * MM_PER_IN).toFixed(1);
  const items = [
    { name: 'Acrylic sheet', qty: `${s.t > 0.15 ? 5 : 3} mm, about ${(areaMm2 / 100).toFixed(0)} cm² of panels`, note: 'Cast acrylic cuts cleaner and is easier to solvent-weld than extruded.' },
    { name: '3D-printed corner brackets', qty: '4', note: `${(g.arm * MM_PER_IN).toFixed(0)} mm arms. PETG or ASA handle humidity better than PLA.` },
    { name: 'Disc magnets', qty: `8 (4 pairs), about ${magDiaMm} mm × 2 mm`, note: 'Glue into the bracket pockets and under the lid with matching polarity.' },
  ];
  if (s.cam) items.push({ name: 'ESP32-CAM module', qty: '1', note: `Needs a ${CAM_HOLE_MM} mm hole${s.cpos === 'corner' ? ' (angled slot)' : ''} and a 5 V supply. Keep the board outside the humid box.` });
  if (s.vents) items.push({ name: 'Vent holes', qty: `${holes} × ${g.ventMm} mm`, note: 'Cut by the laser. Optionally cover with fine mesh from the outside.' });
  if (s.decor) items.push({ name: 'Substrate', qty: `about ${substrateL.toFixed(1)} L`, note: `${(g.sd * MM_PER_IN).toFixed(0)} mm deep. Slightly more if you plan to burrow-pack it.` });
  const DL = doorLayout(s, g);
  if (DL.on) {
    const T = s.t > 0.15 ? 5 : 3, screw = Math.ceil((3 + T + 2.4 + 1) / 2) * 2;
    items.push(
      { name: 'Door hinges (3D-printed)', qty: `${DL.count} pairs (frame half and door half)`, note: `Hinge on the ${DL.side}. Each stands ${DL.Hh.toFixed(0)} mm tall. The frame half screws to the side wall and the door half to the door.` },
      { name: 'Hinge pins', qty: `${DL.count}, about ${(DL.Hh + 2).toFixed(0)} mm long`, note: '3 mm steel rod, an M3 bolt or 3 mm filament. A printed pin also works.' },
      { name: 'M3 screws and nuts', qty: `${DL.count * 4} × M3 × ${screw} mm with nuts`, note: 'Hinge leaves. Holes are cut 3.2 mm wide. Fit with the nut on the inside; a drop of thread-lock keeps them tight.' },
      { name: 'Door knob (3D-printed)', qty: `1, with one M3 × ${Math.ceil((T + 11) / 2) * 2} mm self-tapping screw`, note: 'The screw goes in from inside the door into the knob’s pilot hole.' },
      { name: 'Magnet catch', qty: '2 printed blocks, 2 disc magnets 6 × 3 mm', note: 'Glue one block to the inside of the door and one to the far wall, with the magnets facing each other. Check polarity first.' },
    );
  }
  items.push(...plantBom(s));
  items.push({ name: 'Acrylic cement', qty: '1 small bottle', note: 'Thin solvent cement (for example Weld-On 4) for the wall seams.' });
  return items;
}

export function panelCard(p) {
  return `<div class="pn">${panelSvg(p).replace(/^<\?xml[^>]*\?>\s*/, '')}<b>${escapeHtml(p.name)}</b><span>${p.w.toFixed(1)} × ${p.h.toFixed(1)} mm</span></div>`;
}

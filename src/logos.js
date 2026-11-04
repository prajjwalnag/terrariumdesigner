/** Built-in engraving logos: simple one-colour SVGs, rasterised to PNG when chosen. */
const INK = '#1b1b1b';
const wrap = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512" fill="${INK}" stroke="none">${body}</svg>`;

const SKULL_PATH = 'M50 6C27 6 13 22 13 43c0 12 5 20 13 26v12c0 4 3 7 7 7h34c4 0 7-3 7-7V69c8-6 13-14 13-26C87 22 73 6 50 6Z M23 40a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z M57 40a10 10 0 1 0 20 0a10 10 0 1 0-20 0Z M50 50 43 63h14Z M38 76h5v10h-5Z M47.5 76h5v10h-5Z M57 76h5v10h-5Z';
const skull = `<path fill-rule="evenodd" d="${SKULL_PATH}"/>`;

const bone = (x1, y1, x2, y2, w = 7) => {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy), nx = (-dy / l) * 5, ny = (dx / l) * 5;
  const knob = (x, y) => `<circle cx="${x + nx}" cy="${y + ny}" r="6"/><circle cx="${x - nx}" cy="${y - ny}" r="6"/>`;
  return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" fill="none"/>${knob(x1, y1)}${knob(x2, y2)}`;
};

function web() {
  const c = 50, rays = 10, rings = [12, 24, 36, 46];
  const pt = (r, i) => [(c + r * Math.cos((i / rays) * 2 * Math.PI - Math.PI / 2)).toFixed(1), (c + r * Math.sin((i / rays) * 2 * Math.PI - Math.PI / 2)).toFixed(1)];
  let d = '';
  for (let i = 0; i < rays; i++) d += `M${c} ${c}L${pt(46, i).join(' ')}`;
  rings.forEach((r) => { d += `M${pt(r, 0).join(' ')}`; for (let i = 1; i <= rays; i++) d += `L${pt(r, i % rays).join(' ')}`; });
  return `<path d="${d}" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linejoin="round"/>`;
}

const spiderLegs = [-1, 1].map((s) => [[-26, -8, -42, -22], [-30, 4, -46, 0], [-30, 16, -44, 24], [-24, 28, -34, 44]]
  .map(([cx, cy, ex, ey]) => `<path d="M${50 + s * 6} ${58 + 0}Q${50 + s * -cx} ${58 + cy - 14} ${50 + s * -ex} ${58 + ey}" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" fill="none"/>`).join('')).join('');

export const LOGOS = [
  { id: 'spider', name: 'Spider', svg: wrap(`<ellipse cx="50" cy="62" rx="15" ry="19"/><ellipse cx="50" cy="38" rx="9" ry="10"/>${spiderLegs}`) },
  { id: 'skull', name: 'Skull', svg: wrap(skull) },
  { id: 'skullbones', name: 'Skull and bones', svg: wrap(`${bone(14, 62, 86, 94)}${bone(86, 62, 14, 94)}<g transform="translate(14 0) scale(.72)">${skull}</g>`) },
  { id: 'bone', name: 'Bone', svg: wrap(bone(18, 72, 82, 28, 9)) },
  { id: 'web', name: 'Web', svg: wrap(web()) },
];

/** Rasterise an SVG string to a PNG data URL. */
export function rasterise(svg, size = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, 0, 0, size, size);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Small preview that follows the page text colour. */
export const thumb = (svg) => svg.replace(/width="512" height="512"/, 'width="34" height="34"').split(INK).join('currentColor');

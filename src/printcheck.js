/** Mesh checks for 3D printing, run on a binary STL (Z up, base on z = 0). */
export function analyseStl(dv) {
  const n = dv.getUint32(80, true);
  const key = (x, y, z) => `${Math.round(x * 20000)},${Math.round(y * 20000)},${Math.round(z * 20000)}`;
  const edges = new Map();
  let area = 0, overhang = 0;
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    const v = [0, 1, 2].map((j) => [0, 1, 2].map((c) => dv.getFloat32(o + j * 12 + c * 4, true)));
    const k = v.map((p) => key(...p));
    [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => {
      const e = k[a] < k[b] ? `${k[a]}|${k[b]}` : `${k[b]}|${k[a]}`;
      edges.set(e, (edges.get(e) || 0) + 1);
    });
    const u = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
    const w = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) continue;
    const a = len / 2;
    area += a;
    const zMin = Math.min(v[0][2], v[1][2], v[2][2]);
    if (nz / len < -0.7071 && zMin > 0.3) overhang += a; // faces pointing down more than 45 degrees, not on the bed
  }
  let open = 0, over = 0;
  edges.forEach((c) => { if (c === 1) open++; else if (c > 2) over++; });
  return { tris: n, openEdges: open, nonManifold: over, overhangPct: (100 * overhang) / area };
}

/** Plain-language supports advice from the share of faces that overhang more than 45 degrees. */
export function supportsHint(overhangPct) {
  return overhangPct < 10 ? 'no supports needed' : overhangPct < 20 ? 'supports maybe' : 'use supports';
}

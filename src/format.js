export const MM_PER_IN = 25.4;
export const CM_PER_IN = 2.54;
export const DEG = Math.PI / 180;

/** Format a length given in inches for display in the chosen unit. */
export function fmtLen(inches, unit) {
  return unit === 'cm' ? `${(inches * CM_PER_IN).toFixed(1)} cm` : `${inches.toFixed(2)} in`;
}

/** Leg spans are stored in inches but always displayed in cm. */
export const fmtCm = (inches) => `${(inches * CM_PER_IN).toFixed(1)} cm`;

export const round2 = (n) => (Math.round(n * 100) / 100).toString();

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

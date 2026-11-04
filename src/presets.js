/**
 * Starting points, not care sheets. Leg span is in cm; box and substrate sizes are in inches.
 * Each one passes its own fit checks (see tests/calc.test.mjs).
 */
export const PRESETS = [
  { id: 'jumper', name: 'Jumping spider (about 2 cm)', type: 'arb', ls: 2, w: 3, d: 3, h: 5, sd: 1 },
  { id: 'sling', name: 'Tarantula sling (about 4 cm)', type: 'terr', ls: 4, w: 5, d: 4, h: 3, sd: 1 },
  { id: 'juv-terr', name: 'Juvenile ground tarantula (about 8 cm)', type: 'terr', ls: 8, w: 10, d: 7, h: 4.5, sd: 2 },
  { id: 'adult-terr', name: 'Adult ground tarantula (about 10 cm)', type: 'terr', ls: 10, w: 12.5, d: 8.5, h: 6, sd: 2.5 },
  { id: 'juv-arb', name: 'Juvenile tree tarantula (about 8 cm)', type: 'arb', ls: 8, w: 7, d: 7, h: 11.5, sd: 1.5 },
];

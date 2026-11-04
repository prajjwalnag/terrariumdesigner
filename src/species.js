/**
 * Species library. `cm` is a typical adult leg span in centimetres (approximate, varies by
 * individual and source). `burrow` species get deeper substrate. This is a sizing aid, not a care sheet.
 */
export const GROUPS = ['Ground tarantulas', 'Tree tarantulas', 'Jumping spiders', 'Other spiders'];

const S = (group, id, name, sci, type, cm, extra = {}) => ({ group, id, name, sci, type, cm, ...extra });
const EXP = 'Fast and defensive with potent venom. Suited to experienced keepers.';

export const SPECIES = [
  // Ground tarantulas
  S('Ground tarantulas', 'g-rosea', 'Chilean rose', 'Grammostola rosea', 'terr', 13),
  S('Ground tarantulas', 'g-pulchripes', 'Chaco golden knee', 'Grammostola pulchripes', 'terr', 15),
  S('Ground tarantulas', 'g-pulchra', 'Brazilian black', 'Grammostola pulchra', 'terr', 15),
  S('Ground tarantulas', 'b-hamorii', 'Mexican red knee', 'Brachypelma hamorii', 'terr', 14, { burrow: true }),
  S('Ground tarantulas', 'b-boehmei', 'Mexican fireleg', 'Brachypelma boehmei', 'terr', 13, { burrow: true }),
  S('Ground tarantulas', 't-albopilosus', 'Curly hair', 'Tliltocatl albopilosus', 'terr', 13, { burrow: true }),
  S('Ground tarantulas', 't-vagans', 'Mexican red rump', 'Tliltocatl vagans', 'terr', 13, { burrow: true }),
  S('Ground tarantulas', 'a-chalcodes', 'Desert blonde', 'Aphonopelma chalcodes', 'terr', 12, { burrow: true }),
  S('Ground tarantulas', 'a-seemanni', 'Costa Rican zebra', 'Aphonopelma seemanni', 'terr', 12),
  S('Ground tarantulas', 'a-hentzi', 'Texas brown', 'Aphonopelma hentzi', 'terr', 12, { burrow: true }),
  S('Ground tarantulas', 'c-cyano', 'Greenbottle blue', 'Chromatopelma cyaneopubescens', 'terr', 13, { note: 'Webs heavily across the floor, so leave open space.' }),
  S('Ground tarantulas', 'l-parahybana', 'Brazilian salmon pink', 'Lasiodora parahybana', 'terr', 20, { note: 'Very large, so it may need more room than this tool allows.' }),
  S('Ground tarantulas', 'p-murinus', 'Orange baboon', 'Pterinochilus murinus', 'terr', 12, { burrow: true, note: 'Defensive and fast. Experienced keepers only.' }),
  S('Ground tarantulas', 'c-lividus', 'Cobalt blue', 'Cyriopagopus lividus', 'terr', 13, { burrow: true, note: 'Deep burrower with potent venom. Experienced keepers only.' }),
  S('Ground tarantulas', 'h-formosus', 'Pumpkin patch', 'Hapalopus sp. Colombia large', 'terr', 7),
  S('Ground tarantulas', 'c-elegans', 'Dwarf Cyriocosmus', 'Cyriocosmus elegans', 'terr', 5),
  // Tree tarantulas
  S('Tree tarantulas', 'a-avic', 'Common pink toe', 'Avicularia avicularia', 'arb', 13),
  S('Tree tarantulas', 'c-versicolor', 'Antilles pink toe', 'Caribena versicolor', 'arb', 12),
  S('Tree tarantulas', 'y-diversipes', 'Amazon sapphire', 'Ybyrapora diversipes', 'arb', 12),
  S('Tree tarantulas', 'p-irminia', 'Venezuelan sun tiger', 'Psalmopoeus irminia', 'arb', 14),
  S('Tree tarantulas', 'p-cambridgei', 'Trinidad chevron', 'Psalmopoeus cambridgei', 'arb', 14),
  S('Tree tarantulas', 't-seladonia', 'Brazilian jewel', 'Typhochlaena seladonia', 'arb', 8),
  S('Tree tarantulas', 'poe-regalis', 'Indian ornamental', 'Poecilotheria regalis', 'arb', 17, { note: EXP }),
  S('Tree tarantulas', 'poe-metallica', 'Gooty sapphire', 'Poecilotheria metallica', 'arb', 16, { note: EXP }),
  // Jumping spiders
  S('Jumping spiders', 'p-regius', 'Regal jumper', 'Phidippus regius', 'arb', 2.5),
  S('Jumping spiders', 'p-audax', 'Bold jumper', 'Phidippus audax', 'arb', 2),
  S('Jumping spiders', 'p-johnsoni', 'Red-backed jumper', 'Phidippus johnsoni', 'arb', 2),
  S('Jumping spiders', 'h-diardi', 'Giant orange-black jumper', 'Hyllus diardi', 'arb', 3),
  S('Jumping spiders', 'm-volans', 'Peacock spider', 'Maratus volans', 'arb', 1),
  S('Jumping spiders', 's-scenicus', 'Zebra jumper', 'Salticus scenicus', 'arb', 1),
  // Other spiders
  S('Other spiders', 'hogna', 'Wolf spider', 'Hogna / Lycosa species', 'terr', 6, { burrow: true, note: 'Active hunter that digs. Give a lot of floor and secure lid.' }),
  S('Other spiders', 'heteropoda', 'Giant crab spider', 'Heteropoda venatoria', 'arb', 12, { note: 'Very fast and flat. Needs a tightly sealed lid.' }),
  S('Other spiders', 'tegenaria', 'Giant house spider', 'Eratigena atrica', 'terr', 8),
];

export const STAGES = { sling: { label: 'Sling', k: 0.3 }, juv: { label: 'Juvenile', k: 0.6 }, adult: { label: 'Adult', k: 1 } };

export const speciesById = (id) => SPECIES.find((s) => s.id === id);
/** Leg span in cm for a species at a growth stage (never below 1 cm). */
export const legSpanCm = (sp, stage) => Math.max(1, +(sp.cm * (STAGES[stage]?.k ?? 1)).toFixed(1));

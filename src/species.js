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

/**
 * General facts per species. Ranges are typical keeper guidance, rounded and approximate (not verified against
 * sources). temp is in °C, rh is relative humidity %, life is a typical female lifespan in years.
 * level: 0 calm, 1 skittish or flicks hairs, 2 fast or defensive.
 */
const I = (origin, temper, level, life, temp, rh) => ({ origin, temper, level, life, temp, rh });
const INFO = {
  'g-rosea': I('Chile and nearby dry scrub', 'Docile, can be unpredictable', 0, '15–20+', [20, 26], [50, 65]),
  'g-pulchripes': I('Chaco grassland, Paraguay to Argentina', 'Docile', 0, '20+', [22, 26], [55, 65]),
  'g-pulchra': I('Brazilian scrub and forest edge', 'Very docile', 0, '20+', [22, 26], [60, 70]),
  'b-hamorii': I('Pacific coast of Mexico', 'Docile, slow growing', 0, '25+', [21, 27], [55, 65]),
  'b-boehmei': I('Guerrero, Mexico', 'Docile, may flick hairs', 1, '20+', [22, 27], [60, 70]),
  't-albopilosus': I('Costa Rica and Nicaragua', 'Docile, hardy', 0, '15–20', [22, 27], [65, 75]),
  't-vagans': I('Mexico to Central America', 'Docile, flicks hairs', 1, '15+', [22, 27], [65, 75]),
  'a-chalcodes': I('Sonoran Desert, south-west USA', 'Docile', 0, '25+', [21, 27], [40, 55]),
  'a-seemanni': I('Costa Rica and Central America', 'Skittish, can be defensive', 1, '~20', [22, 27], [65, 75]),
  'a-hentzi': I('Texas and south-central USA', 'Docile', 0, '25+', [21, 27], [40, 55]),
  'c-cyano': I('Paraguaná peninsula, Venezuela', 'Skittish and quick', 1, '12–14', [24, 28], [50, 60]),
  'l-parahybana': I('Eastern Brazil', 'Usually calm, flicks hairs', 1, '15–20', [24, 28], [65, 75]),
  'p-murinus': I('East African savanna', 'Fast and defensive', 2, '12–14', [22, 28], [50, 65]),
  'c-lividus': I('Myanmar and Thailand', 'Defensive, fast', 2, '12–14', [24, 28], [70, 80]),
  'h-formosus': I('Colombia', 'Docile', 0, '~15', [22, 26], [60, 70]),
  'c-elegans': I('Venezuela', 'Docile, tiny', 0, '~10', [22, 27], [60, 70]),
  'a-avic': I('Northern South America', 'Calm but jumpy', 1, '10–15', [24, 28], [70, 80]),
  'c-versicolor': I('Martinique, Caribbean', 'Calm', 0, '10–12', [24, 28], [70, 80]),
  'y-diversipes': I('Brazil', 'Calm', 0, '~12', [24, 28], [70, 80]),
  'p-irminia': I('Venezuela', 'Fast, defensive', 2, '12–14', [24, 28], [65, 75]),
  'p-cambridgei': I('Trinidad', 'Fast, defensive', 2, '12–14', [24, 28], [70, 80]),
  't-seladonia': I('Brazil', 'Skittish', 1, '~12', [24, 28], [70, 80]),
  'poe-regalis': I('India', 'Very fast, defensive', 2, '12–14', [24, 28], [70, 80]),
  'poe-metallica': I('Andhra Pradesh, India (critically endangered in the wild)', 'Very fast, defensive', 2, '12–14', [24, 28], [70, 80]),
  'p-regius': I('Florida and the Caribbean', 'Curious and bold', 0, '2–3', [22, 27], [50, 70]),
  'p-audax': I('North America', 'Bold, quick', 0, '1–2', [21, 27], [50, 60]),
  'p-johnsoni': I('Western North America', 'Bold, quick', 0, '1–2', [20, 27], [50, 60]),
  'h-diardi': I('South-east Asia', 'Active, bold', 0, '2–3', [24, 28], [60, 75]),
  'm-volans': I('Australia', 'Shy, tiny', 1, '~1', [20, 26], [50, 65]),
  's-scenicus': I('Europe and widespread', 'Shy, tiny', 1, '~1', [18, 24], [50, 60]),
  hogna: I('Many habitats worldwide', 'Quick, may bite if handled', 2, '1–3+', [20, 26], [40, 60]),
  heteropoda: I('Tropics and subtropics worldwide', 'Very fast, flat and shy', 2, '2–3', [24, 28], [60, 70]),
  tegenaria: I('Europe, introduced elsewhere', 'Shy, fast', 1, '2–5', [15, 22], [50, 65]),
};

const DIET = {
  'Ground tarantulas': 'Crickets, roaches or similar, about the size of the spider’s body. Adults every 1–2 weeks, slings more often.',
  'Tree tarantulas': 'Crickets, roaches or similar, about the size of the spider’s body. Adults every 1–2 weeks, slings more often.',
  'Jumping spiders': 'Fruit flies or small flies for tiny ones, small crickets or flies for larger. A few meals a week. Drip water on a side wall.',
  'Other spiders': 'Crickets or roaches smaller than the spider, a few times a week.',
};
const SUBSTRATE = { terr: 'Deep, slightly damp substrate and a hide.', arb: 'Climbing surfaces, plus cross-ventilation.' };

/** Facts for the info panel, or null if the species is unknown. */
export function speciesInfo(id) {
  const sp = speciesById(id);
  if (!sp || !INFO[id]) return null;
  const f = (c) => Math.round((c * 9) / 5 + 32);
  const { origin, temper, level, life, temp, rh } = INFO[id];
  return {
    name: sp.name, sci: sp.sci, group: sp.group, type: sp.type, cm: sp.cm, origin, temper, level,
    life: `${life} years`,
    temp: `${temp[0]}–${temp[1]} °C (${f(temp[0])}–${f(temp[1])} °F)`,
    rh: `${rh[0]}–${rh[1]}%`,
    rhRange: rh,
    diet: DIET[sp.group],
    setup: `${SUBSTRATE[sp.type]}${sp.burrow ? ' Likes to burrow, so give deeper substrate.' : ''}`,
    note: sp.note || '',
  };
}

/** Filter the library by text (name, scientific name, origin, group), group and temperament level. */
export function filterSpecies({ q = '', group = '', level = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return SPECIES.filter((sp) => {
    if (group && sp.group !== group) return false;
    const info = speciesInfo(sp.id);
    if (level !== '' && String(info.level) !== String(level)) return false;
    if (!needle) return true;
    return [sp.name, sp.sci, info.origin, sp.group].some((t) => t.toLowerCase().includes(needle));
  });
}

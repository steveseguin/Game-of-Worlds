/**
 * sector-names.js - Naming swept shoals after whoever first survived them.
 * Shoal rules below remain permanent and curated. Planet catalog names and
 * owner-editable planet names have separate helpers at the end of this module.
 *
 * Canon, from lore/07-glossary.md and lore/18-naming-the-dark.md:
 *
 *   Named places are named after the ship or captain that first survived them - Anselm's
 *   Reach, the Vail Shoal, Kettering. This is how real charts work, and it embeds the theme
 *   in the map: every named place in the galaxy is named after somebody's expensive mistake.
 *
 * A sector arrives at a name exactly once, at the moment a fleet sweeps it, and keeps it
 * afterwards - including through conquest. Whoever takes the sector inherits the name the
 * people who bought it gave it, which is the entire point.
 *
 * WHY THE SERVER CHOOSES FROM A CURATED SET rather than accepting free text: a name is
 * permanent, shared, and visible to strangers, so free text is a moderation queue with a game
 * attached. Generating the candidates here means nothing a player types ever reaches another
 * player's map. The picker exists now and preserves that property: it renders `candidates()` and
 * sends back an index, which `nameSector` in server.js resolves through `nameByIndex`. No string
 * a client sends is ever a name.
 *
 * Determinism matters: the same sector must offer the same candidates on every call, or a
 * reconnect changes the menu and a client's selected index means something else.
 */

// Charting vocabulary. Feature words a surveyor would actually write on a chart - see the
// glossary. Deliberately plain: these are working documents, not poetry.
const FEATURES = [
    'Reach', 'Shoal', 'Bar', 'Crossing', 'Narrows',
    'Margin', 'Gate', 'Sweep', 'Ground', 'Bank'
];

// Surnames for crews and captains. Two syllables, no apostrophes, easy to say aloud - the
// naming convention in lore/03-themes.md, which exists so voice work does not become
// expensive. Several are already people in the setting; a chart naming a shoal after a
// Chart-Warden or a courier is exactly how this is supposed to read.
const NAMES = [
    'Ames', 'Halloway', 'Marn', 'Rell', 'Vance', 'Ito', 'Keth', 'Onn',
    'Sten', 'Vey', 'Ossa', 'Tessen', 'Sable', 'Ash', 'Pell', 'Kell',
    'Vaun', 'Ordry', 'Anselm', 'Vail', 'Kettering', 'Ordel', 'Bell', 'Ilsa'
];

const MAX_LENGTH = 48;

/**
 * Deterministic non-negative hash. Small, stable, and not required to be good - it only has
 * to give the same answer for the same sector every time the process restarts.
 */
function seedFrom(gameId, sectorId) {
    const text = `${gameId}:${sectorId}`;
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
}

function compose(name, feature) {
    // "Ames's Reach" reads as a person; "the Vail Shoal" reads as a place. Both are in the
    // canon examples, so alternate on the feature rather than picking one house style.
    return feature === 'Shoal' || feature === 'Bar' || feature === 'Narrows'
        ? `the ${name} ${feature}`
        : `${name}'s ${feature}`;
}

/**
 * The candidate names for a sector. Stable for a given (gameId, sectorId), distinct from one
 * another, and always at least `count` long.
 */
function candidates(gameId, sectorId, count = 6) {
    const seed = seedFrom(gameId, sectorId);
    const out = [];
    const ceiling = NAMES.length * FEATURES.length;
    for (let i = 0; out.length < count && i < ceiling; i += 1) {
        const name = NAMES[(seed + i * 7) % NAMES.length];
        const feature = FEATURES[(seed + i * 3) % FEATURES.length];
        const candidate = compose(name, feature);
        if (!out.includes(candidate)) out.push(candidate);
    }
    return out;
}

/**
 * The name a sector gets when nobody chose one - the first candidate. The sweep writes this
 * immediately, so a swept sector is never nameless and ignoring the picker costs nothing; the
 * player's choice, if they make one, replaces it.
 */
function defaultName(gameId, sectorId) {
    return candidates(gameId, sectorId, 1)[0];
}

/**
 * Validate a proposed name. Only ever accepts something this module could have produced, so a
 * crafted wire message cannot put arbitrary text on a shared map.
 */
function isAllowedName(gameId, sectorId, proposed) {
    if (typeof proposed !== 'string') return false;
    if (proposed.length === 0 || proposed.length > MAX_LENGTH) return false;
    return candidates(gameId, sectorId, FEATURES.length).includes(proposed);
}

/**
 * Resolve a name by index, for a picker. Returns null on any out-of-range or bad input.
 *
 * The type check is not decoration. This reads a wire value, and Number() coerces generously:
 * Number(null), Number(''), Number(false) and Number([]) are all 0, so a missing or malformed
 * index would silently resolve to candidate zero and stamp a name nobody picked onto a shared
 * map. Accept a real number or a string of digits, and nothing else.
 */
function nameByIndex(gameId, sectorId, index, count = 6) {
    if (typeof index === 'string') {
        if (!/^\d+$/.test(index.trim())) return null;
    } else if (typeof index !== 'number') {
        return null;
    }
    const n = Number(index);
    if (!Number.isInteger(n) || n < 0 || n >= count) return null;
    return candidates(gameId, sectorId, count)[n] || null;
}

/**
 * What the feed and the map should call a sector: its name if it has one, otherwise the hex
 * token the client has always shown. Never throws, because it is called from message
 * composition.
 */
function sectorLabel(sectorId, storedName) {
    if (typeof storedName === 'string' && storedName.trim()) return storedName.trim();
    return Number(sectorId).toString(16).toUpperCase();
}

const PLANET_NAMES = ['Aster', 'Meridian', 'Vesper', 'Caldera', 'Iona', 'Halcyon', 'Neris', 'Orison', 'Cinder', 'Elysia', 'Talos', 'Auriga', 'Lumen', 'Sereia', 'Oriel', 'Caelum'];

function planetDefaultName(gameId, sectorId) {
    return `${PLANET_NAMES[seedFrom(gameId, sectorId) % PLANET_NAMES.length]} ${sectorId}`;
}

function nameForSector(gameId, sector) {
    if (typeof sector.sectorname === 'string' && sector.sectorname.trim()) return sector.sectorname.trim();
    const type = Number(sector.type ?? sector.sectortype);
    return type >= 6 && type <= 10 ? planetDefaultName(gameId, sector.sectorid) : null;
}

function normalizePlanetName(value) {
    if (typeof value !== 'string' || value.length > MAX_LENGTH || /[\p{C}]/u.test(value)) return null;
    const name = value.trim().replace(/ +/g, ' ');
    return /^[\p{L}\p{N}][\p{L}\p{N} .'’\-]{0,47}$/u.test(name) ? name : null;
}

module.exports = {
    planetDefaultName,
    nameForSector,
    normalizePlanetName,
    FEATURES,
    NAMES,
    MAX_LENGTH,
    candidates,
    defaultName,
    isAllowedName,
    nameByIndex,
    sectorLabel
};

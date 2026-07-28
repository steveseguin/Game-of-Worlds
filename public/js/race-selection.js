/**
 * race-selection.js - Client-side race selection UI
 *
 * The commitment screen: twelve factions, one pick, for the whole match. It has
 * two jobs and they pull in different directions — sell each faction as its own
 * thing, and let a player compare all twelve on a single honest scale.
 *
 * IDENTITY — THREE PAINTED ASSETS PER FACTION, no procedural glyphs anywhere.
 * lore/visual-reference/production/ was built for this game and this screen now
 * spends all three of its faction-scoped groups:
 *
 *   crests/     the registry crest — riveted hazard-striped plate for the
 *               Mechanicus, a bone ring cut by a vermilion route for the Void
 *               Walkers. It is the card art AND the dossier medallion.
 *   homeworlds/ a 960x540 painted backdrop of the faction's canon homeworld —
 *               Terra, Sill, Churn, Sarn's World, Bell, the Works, Ossa's Delta,
 *               Kettering, the Ancient Installation, Osk's Flux, Ordel Deep,
 *               Sable's Dark. This is the dossier's hero plate and the void
 *               behind the whole console, and it is the reason the frame has a
 *               value range at all: the crests and the chrome are painted dark,
 *               these are painted lit.
 *   fleets/     THREE separately painted hulls per faction — the light hull, the
 *               colony hull and the capital hull. Not the contact sheet: on all
 *               twelve of those the three panels are one model at three scales,
 *               so captioning them SCOUT / COLONY SHIP / DREADNOUGHT printed
 *               three ship classes over three copies of the same ship.
 *
 * HOW THE CREST IS FITTED: the aperture is cut to the plate.
 * The published crests are 256x193. The port is 256/193 and the art is mounted
 * `contain` on a black mat, so nothing is cropped and nothing letterboxes — the
 * plates' border pixels measure luma 5 against the port's own 8. The previous
 * revision mounted them `cover` in a 3:2 aperture, threw away 13% of every
 * crest's height, and carried a hand-tuned per-faction `object-position` to
 * manage the damage; at the extremes it still cut the tops off the Titan Lords
 * monument and the Silicon Collective's tallest bars.
 *
 * COMPARISON — ONE instrument, two sizes, seven channels, one shared scale.
 * The roster card and the dossier draw the SAME chart: a machined channel of
 * seven bays, a bright ×1.00 rule running unbroken across all of them, a fill
 * growing out of that rule and a fixed-height cap on its end. Up is advantage,
 * down is penalty, length is distance from ×1.00 on a log scale with rails at
 * ×0.50 / ×2.00, and thickness is a constant so the value is encoded once. Ship
 * cost is plotted as its EFFECT (1/raw) so a dearer hull sits below the rule
 * where the axis says a penalty goes, while the printed reading stays the raw
 * multiplier the engine applies.
 *
 * Nothing here invents mechanics — every number comes from race.bonuses /
 * race.unitModifiers and every restriction from race.doctrine, all
 * server-authored; every hull name is the name of a shipped art asset; and the
 * homeworld line names a place, not an effect.
 */

const RaceSelection = (function() {
    'use strict';

    let selectedRace = null;
    let unlockedRaces = [];
    let onSelectCallback = null;
    let detailPane = null;
    let confirmButton = null;
    let modalRef = null;
    let preferredRaceId = null;
    let parallaxHandler = null;

    const STYLE_ID = 'race-selection-styles';
    const STYLE_HREF = 'css/race-selection.css?v=20260728r8';
    // Holds one symbol: the padlock. The twelve crests are bitmaps now, so
    // there is nothing else left to keep in an SVG sprite.
    const SPRITE_ID = 'race-selection-sprite';

    // ---------------------------------------------------------------------
    // Faction identity
    //
    // The server payload has no art field; the picker owns it.
    //
    // `crest`, `world` and `hulls[].src` are published derivatives. The
    // filenames are written out in full, not assembled from parts, because
    // tools/publish-art.js --audit (and the test that wraps it) proves every
    // shipped byte is referenced by scanning sources for the literal name — a
    // template-built path would read as an orphan and get deleted from the web
    // root.
    //
    // THERE IS NO PER-FACTION HUE ANY MORE, and losing it is a fix rather than a
    // simplification. Every port used to lay a radial of its faction's colour
    // OVER the painted crest; read as a twelve-tile wall that made the roster
    // visibly green (Bioform), cyan (Crystalline), magenta (Quantum), purple
    // (Void Walkers) and chartreuse (Zephyr) — five hues that appear nowhere
    // else on this console and flatly contradict its steel-and-amber brief. The
    // rake across all thirteen ports is now the same warm key light, and the
    // faction is identified by the painting under it, which is the thing that
    // was commissioned to do that job.
    //
    // No `crestY` either. The port's aperture now matches the plates' own
    // 256x193 and the art is mounted `contain` on a black mat, so nothing is
    // cropped and there is nothing to steer: the per-faction object-position
    // nudges only ever existed to manage a cover-crop that should not have been
    // happening, and at crestY 6 (Titan Lords) and 77 (Silicon) they visibly
    // failed — the monument's pylons and the tallest bars ran off the top edge.
    //
    // `hulls` is the faction's three-hull ship language: the light hull, the
    // colony hull and the capital hull, each its own painting. It used to be one
    // 512x171 CONTACT SHEET per faction captioned in thirds — but on every one
    // of the twelve, that sheet is one model rendered at three scales, so
    // captioning its panels SCOUT / COLONY SHIP / DREADNOUGHT printed three
    // different ship classes over three copies of the same hull. The
    // separately-painted 512px hulls in the same library folder ARE distinct
    // designs (the Mechanicus frigate, work vessel and dreadnought share a
    // material language and nothing else), so the dossier shows those three and
    // the sheets are no longer published at all.
    //
    // `world` / `worldName` are the faction's canon homeworld backdrop and its
    // name (lore/07-glossary.md; the art library is named for the same places).
    // It is a place, not a mechanic: nothing on this screen claims the homeworld
    // does anything, because in the engine it does not.
    // ---------------------------------------------------------------------
    const RACE_IDENTITY = {
        1:  { code: 'TER',
              crest: 'images/ui/crests-512-01-terran.png',
              world: 'images/ui/homeworlds-01-terra-960x540.png', worldName: 'Terra',
              hulls: [
                  { name: 'Scout',       src: 'images/ui/fleets-01-terran-scout-512.png' },
                  { name: 'Colony ship', src: 'images/ui/fleets-01-terran-colony-ship-512.png' },
                  { name: 'Dreadnought', src: 'images/ui/fleets-01-terran-dreadnought-512.png' }] },
        2:  { code: 'SIL',
              crest: 'images/ui/crests-512-02-silicon.png',
              world: 'images/ui/homeworlds-02-sill-960x540.png', worldName: 'Sill',
              hulls: [
                  { name: 'Scout',              src: 'images/ui/fleets-02-silicon-scout-512.png' },
                  { name: 'Colony processor',   src: 'images/ui/fleets-02-silicon-colony-processor-512.png' },
                  { name: 'Carrier battleship', src: 'images/ui/fleets-02-silicon-carrier-battleship-512.png' }] },
        3:  { code: 'ZEP',
              crest: 'images/ui/crests-512-03-zephyr.png',
              world: 'images/ui/homeworlds-03-churn-960x540.png', worldName: 'Churn',
              hulls: [
                  { name: 'Frigate swarm',    src: 'images/ui/fleets-03-zephyr-frigate-swarm-512.png' },
                  { name: 'Colony migration', src: 'images/ui/fleets-03-zephyr-colony-migration-512.png' },
                  { name: 'Cruiser mass',     src: 'images/ui/fleets-03-zephyr-cruiser-mass-512.png' }] },
        4:  { code: 'XTL',
              crest: 'images/ui/crests-512-04-crystalline.png',
              world: 'images/ui/homeworlds-04-sarns-world-960x540.png', worldName: "Sarn's World",
              hulls: [
                  { name: 'Scout shard',    src: 'images/ui/fleets-04-crystalline-scout-shard-512.png' },
                  { name: 'Colony lattice', src: 'images/ui/fleets-04-crystalline-colony-lattice-512.png' },
                  { name: 'Dreadnought',    src: 'images/ui/fleets-04-crystalline-dreadnought-512.png' }] },
        5:  { code: 'VOI',
              crest: 'images/ui/crests-512-05-void-walkers.png',
              world: 'images/ui/homeworlds-05-bell-960x540.png', worldName: 'Bell',
              hulls: [
                  { name: 'Courier scout',       src: 'images/ui/fleets-05-void-walkers-courier-scout-512.png' },
                  { name: 'Colony route holder', src: 'images/ui/fleets-05-void-walkers-colony-route-holder-512.png' },
                  { name: 'Carrier',             src: 'images/ui/fleets-05-void-walkers-carrier-512.png' }] },
        6:  { code: 'MEC',
              crest: 'images/ui/crests-512-06-mechanicus.png',
              world: 'images/ui/homeworlds-06-works-960x540.png', worldName: 'The Works',
              hulls: [
                  { name: 'Frigate',            src: 'images/ui/fleets-06-mechanicus-frigate-512.png' },
                  { name: 'Colony work vessel', src: 'images/ui/fleets-06-mechanicus-colony-work-vessel-512.png' },
                  { name: 'Dreadnought',        src: 'images/ui/fleets-06-mechanicus-dreadnought-512.png' }] },
        7:  { code: 'BIO',
              crest: 'images/ui/crests-512-07-bioform.png',
              world: 'images/ui/homeworlds-07-ossas-delta-960x540.png', worldName: "Ossa's Delta",
              hulls: [
                  { name: 'Scout organism',       src: 'images/ui/fleets-07-bioform-scout-organism-512.png' },
                  { name: 'Colony seed vessel',   src: 'images/ui/fleets-07-bioform-colony-seed-vessel-512.png' },
                  { name: 'Dreadnought organism', src: 'images/ui/fleets-07-bioform-dreadnought-organism-512.png' }] },
        8:  { code: 'NOM',
              crest: 'images/ui/crests-512-08-star-nomads.png',
              world: 'images/ui/homeworlds-08-kettering-960x540.png', worldName: 'Kettering',
              hulls: [
                  { name: 'Trace scout',    src: 'images/ui/fleets-08-star-nomads-trace-scout-512.png' },
                  { name: 'Colony caravan', src: 'images/ui/fleets-08-star-nomads-colony-caravan-512.png' },
                  { name: 'Dreadnought',    src: 'images/ui/fleets-08-star-nomads-dreadnought-512.png' }] },
        9:  { code: 'ANC',
              crest: 'images/ui/crests-512-09-ancients.png',
              world: 'images/ui/homeworlds-09-ancient-installation-960x540.png', worldName: 'The Installation',
              hulls: [
                  { name: 'Scout instrument', src: 'images/ui/fleets-09-ancients-scout-instrument-512.png' },
                  { name: 'Colony vessel',    src: 'images/ui/fleets-09-ancients-colony-vessel-512.png' },
                  { name: 'Dreadnought',      src: 'images/ui/fleets-09-ancients-dreadnought-512.png' }] },
        10: { code: 'QNT',
              crest: 'images/ui/crests-512-10-quantum.png',
              world: 'images/ui/homeworlds-10-osks-flux-960x540.png', worldName: "Osk's Flux",
              hulls: [
                  { name: 'Phase scout',        src: 'images/ui/fleets-10-quantum-phase-scout-512.png' },
                  { name: 'Colony anchor',      src: 'images/ui/fleets-10-quantum-colony-anchor-512.png' },
                  { name: 'Carrier battleship', src: 'images/ui/fleets-10-quantum-carrier-battleship-512.png' }] },
        11: { code: 'TTN',
              crest: 'images/ui/crests-512-11-titan-lords.png',
              world: 'images/ui/homeworlds-11-ordel-deep-960x540.png', worldName: 'Ordel Deep',
              hulls: [
                  { name: 'Cruiser',     src: 'images/ui/fleets-11-titan-lords-cruiser-512.png' },
                  { name: 'Colony ship', src: 'images/ui/fleets-11-titan-lords-colony-ship-512.png' },
                  { name: 'Dreadnought', src: 'images/ui/fleets-11-titan-lords-dreadnought-512.png' }] },
        12: { code: 'SHD',
              crest: 'images/ui/crests-512-12-shadow-realm.png',
              world: 'images/ui/homeworlds-12-sables-dark-960x540.png', worldName: "Sable's Dark",
              hulls: [
                  { name: 'Stealth scout',       src: 'images/ui/fleets-12-shadow-realm-stealth-scout-512.png' },
                  { name: 'Colony vessel',       src: 'images/ui/fleets-12-shadow-realm-colony-vessel-512.png' },
                  { name: 'Intruder battleship', src: 'images/ui/fleets-12-shadow-realm-intruder-battleship-512.png' }] }
    };

    const FALLBACK_IDENTITY = {
        code: '---', crest: '', world: '', worldName: '', hulls: []
    };

    // ---------------------------------------------------------------------
    // MOUNTING TABLE — how each painting is HUNG, not what it is.
    //
    // Twelve separately painted crests and thirty-six separately painted hulls
    // do not arrive on one scale, and a roster that shows them raw is twelve
    // unrelated pictures rather than one faction system. Measured over the
    // published PNGs before any of this was written:
    //
    //   crest peak luma   134 (Shadow Realm) .. 238 (Crystalline)
    //                     — Shadow Realm's BRIGHTEST pixel is darker than most
    //                       crests' midtone, so it and Quantum sat in row 3 as
    //                       smudges beside a lit gold gem in row 1.
    //   crest optical ht  67.7% (Star Nomads) .. 84.5% (Titan Lords) of plate
    //                     — the emblems were drawn at eight different sizes.
    //   crest peak sat    Void Walkers 241, everything else <= 213
    //                     — one fully saturated hue in an otherwise steel and
    //                       bronze frame.
    //   hull peak luma    66 (Shadow Realm) .. 200 (Silicon Collective)
    //                     — the Terran set at 101 read as three dark smudges on
    //                       its own plate while other factions' read as lit.
    //
    // So each faction carries four mounting numbers, and every one of them is a
    // ratio against a measured target rather than a taste:
    //
    //   gain      crest brightness multiplier onto a common peak of ~185/255.
    //             brightness() is a MULTIPLY, so the black mat stays black and
    //             no crest grows a visible box on the aperture.
    //   scale     crest transform scale onto a common OPTICAL HEIGHT of ~80% of
    //             the plate. Height and not area: the Crystalline gem is
    //             genuinely narrow, and normalising it on area would have drawn
    //             it a fifth taller than every other emblem on the wall. Every
    //             value above 1 here is smaller than the empty margin measured
    //             above and below that crest's own ink, so the aperture still
    //             crops nothing painted.
    //   sat       one clamp, on the Void Walkers' vermilion route: 211/255 of
    //             peak chroma against a roster whose next highest is 184, so
    //             0.80 lands it inside the pack rather than draining it. It is
    //             multiplied into the port's saturate() in every state — sealed,
    //             inspected and open — see .race-port-art; the sealed state used
    //             to replace the whole filter and drop it, which made the clamp
    //             dead on all eleven cards that are sealed by default.
    //   hullGain  the same treatment for the three fleet paintings, onto a
    //             common peak of ~145. Its own number, because a faction's
    //             crest and its hulls were painted at different values —
    //             Terran's crest is mid and its hulls are dark.
    //
    // A faction with no row here renders untouched: the CSS defaults are the
    // identity transform.
    // ---------------------------------------------------------------------
    //
    // HOW `scale` IS DERIVED, so the next pass can redo it rather than nudge it.
    // Each plate's ink bounding box is measured with a threshold set at a
    // FRACTION OF THAT PLATE'S OWN PEAK — not an absolute one. brightness() is
    // applied before anything is measured on screen, so an absolute threshold
    // reads a dark crest (Shadow Realm peaks at 143, Quantum at 164) as smaller
    // than it renders, and the previous table under-scaled exactly those two.
    // The measure is stable across thresholds from 0.20 to 0.35 of peak on every
    // plate, and `scale` is the median of that range: target 80% optical height
    // / measured fraction, capped at the largest scale that still keeps the ink
    // inside the aperture (no cap binds — the loosest, Quantum, has 4% to spare).
    //
    // The table is then CORRECTED ON THE RENDER, not left at the value the
    // source measurement predicts, because a crest with a soft glow (Quantum,
    // Shadow Realm) and one with a hard edge (Crystalline) do not project the
    // same optical height from the same ink box. Both metrics are measured on a
    // capture of the real ports — ink bbox above a fixed threshold, and the
    // y-range carrying the central 96% of luma mass — and each scale carries the
    // geometric mean of the two corrections toward the roster median. Rendered
    // spread across the eleven sealed ports: ink bbox 1.12x -> 1.08x, luma mass
    // 1.16x -> 1.09x, and 1.04x on the two blended — which is where the two
    // metrics stop agreeing, because a soft-glow crest (Quantum, Shadow Realm)
    // and a hard-edged one (Crystalline) genuinely do not project the same
    // visible extent from the same weight of ink.
    const MOUNTING = {
        1:  { gain: 1.03, scale: 1.02, hullGain: 1.43 },
        2:  { gain: 0.95, scale: 0.98, hullGain: 0.78 },
        3:  { gain: 0.92, scale: 0.98, hullGain: 1.30 },
        4:  { gain: 0.78, scale: 1.01, hullGain: 0.90 },
        5:  { gain: 1.00, scale: 1.02, hullGain: 0.92, sat: 0.80 },
        6:  { gain: 1.18, scale: 1.10, hullGain: 1.31 },
        7:  { gain: 1.35, scale: 1.02, hullGain: 1.11 },
        8:  { gain: 1.09, scale: 1.20, hullGain: 1.03 },
        9:  { gain: 0.82, scale: 1.11, hullGain: 1.18 },
        10: { gain: 1.25, scale: 1.03, hullGain: 1.13 },
        11: { gain: 1.06, scale: 0.97, hullGain: 1.23 },
        12: { gain: 1.38, scale: 1.02, hullGain: 1.50 }
    };
    const FLAT_MOUNTING = { gain: 1, scale: 1, sat: 1, hullGain: 1 };

    function mounting(raceId) {
        return MOUNTING[Number(raceId)] || FLAT_MOUNTING;
    }

    // The three crest variables as an inline style, emitted on the PORT so the
    // art, the sealed knock-back and the inspect lift all read the same gain.
    function crestVars(raceId) {
        const m = mounting(raceId);
        return ` style="--crest-gain:${m.gain || 1};--crest-scale:${m.scale || 1};--crest-sat:${m.sat || 1}"`;
    }

    function applyCrestTuning(element, raceId) {
        const m = mounting(raceId);
        element.style.setProperty('--crest-gain', String(m.gain || 1));
        element.style.setProperty('--crest-scale', String(m.scale || 1));
        element.style.setProperty('--crest-sat', String(m.sat || 1));
    }

    // ---------------------------------------------------------------------
    // Instrumentation
    //
    // Seven channels, one scale. A bar's DIRECTION is advantage (up good, down
    // bad) and its LENGTH is how far the multiplier sits from 1.00, with the
    // rails at ×0.50 and ×2.00.
    //
    // The scale is logarithmic because the quantity is a multiplier: ×2.00 and
    // ×0.50 are the same size of change in opposite directions, and a linear
    // percent scale would make them 100 and 50 — the meter would lie about
    // symmetry.
    //
    // `inverse` marks the channel where a smaller multiplier is the better
    // outcome, so cheap hulls read as gain rather than as a shortfall. On that
    // channel the axis plots the EFFECT (1 / raw) and not the raw number: a ship
    // cost of x1.20 is the effect x0.83, so its slab is drawn BELOW the x1.00
    // rule where the axis says a value under 1.00 belongs. Plotting the raw
    // number's direction while printing the raw number was the flagship
    // instrument's worst defect — the chart contradicted its own axis, with a
    // slab captioned x1.20 sitting under the x1.00 line. The printed reading is
    // still the raw multiplier, because that is the number the engine applies
    // and the number a player quotes; it just carries the word `cost` so the
    // reading and the geometry cannot be read as the same quantity.
    // ---------------------------------------------------------------------
    const CHANNELS = [
        { key: 'metalProduction',   code: 'MET', short: 'metal',    label: 'Metal Production',   inverse: false },
        { key: 'crystalProduction', code: 'CRY', short: 'crystal',  label: 'Crystal Production', inverse: false },
        { key: 'researchSpeed',     code: 'RSC', short: 'research', label: 'Research Speed',     inverse: false },
        { key: 'shipCost',          code: 'CST', short: 'cost',     label: 'Ship Cost',          inverse: true  },
        { key: 'shipSpeed',         code: 'SPD', short: 'speed',    label: 'Fleet Speed',        inverse: false },
        { key: 'shipAttack',        code: 'ATK', short: 'attack',   label: 'Fleet Attack',       inverse: false },
        { key: 'shipDefense',       code: 'DEF', short: 'defense',  label: 'Fleet Defense',      inverse: false }
    ];

    const RAIL = 2; // the effect that pegs a meter: x2.00 up, x0.50 down

    // The shortest deviation a bar is allowed to draw, as a fraction of the
    // half-plot. Fleet Attack x1.10 is 0.14 of the rail and would otherwise
    // render as a 3px stub indistinguishable from a channel at rest; this floors
    // it so the cap clears the baseline rule and reads as "off the stop". The
    // printed reading is always exact — only the geometry is floored, and only
    // at the very bottom of the range.
    const MIN_DRAW = 0.17;

    // Per-hull modifiers the engine actually applies (races.applyShipModifiers).
    // `stealth` is the odd one out: it is an ADDITIVE concealment score, not a
    // multiplier, so it is never printed with a × sign.
    const HULL_NAMES = {
        all: 'All hulls', scout: 'Scout', frigate: 'Frigate', destroyer: 'Destroyer',
        cruiser: 'Cruiser', battleship: 'Battleship', dreadnought: 'Dreadnought',
        colony: 'Colony ship', intruder: 'Intruder', bomber: 'Bomber'
    };
    const HULL_ORDER = ['all', 'scout', 'intruder', 'frigate', 'destroyer', 'cruiser', 'bomber', 'battleship', 'dreadnought', 'colony'];
    const MOD_META = {
        speed:   { code: 'SPD', inverse: false, kind: 'mult' },
        attack:  { code: 'ATK', inverse: false, kind: 'mult' },
        defense: { code: 'DEF', inverse: false, kind: 'mult' },
        cost:    { code: 'CST', inverse: true,  kind: 'mult' },
        shields: { code: 'SHL', inverse: false, kind: 'mult' },
        stealth: { code: 'STL', inverse: false, kind: 'score' }
    };

    function esc(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function identity(raceId) {
        return RACE_IDENTITY[Number(raceId)] || FALLBACK_IDENTITY;
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    // =====================================================================
    // Seeded procedural surfaces
    //
    // Everything below is deterministic: same seed, same pixels, every run. A
    // Date.now()-seeded texture would make screenshot diffs meaningless.
    // =====================================================================

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function() {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function makeCanvas(size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        return canvas;
    }

    // Brushed steel: white noise per row, convolved CIRCULARLY along the row so
    // the tile has no vertical seam, giving horizontal machining streaks. Alpha
    // peaks around 4% — enough to kill the "flat dark rectangle" read, far too
    // little to be seen as texture noise.
    let brushTile = null;
    function brushedSteelTile() {
        if (brushTile) return brushTile;
        const N = 128;
        const canvas = makeCanvas(N);
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        const image = ctx.createImageData(N, N);
        const data = image.data;
        const rnd = mulberry32(0x51F7A3);
        const kernel = [0.05, 0.09, 0.14, 0.18, 0.20, 0.18, 0.14, 0.09, 0.05];
        const half = (kernel.length - 1) / 2;
        const row = new Float32Array(N);
        const out = new Float32Array(N);
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) row[x] = rnd() * 2 - 1;
            for (let x = 0; x < N; x++) {
                let sum = 0;
                for (let k = 0; k < kernel.length; k++) {
                    sum += row[(x + k - half + N) % N] * kernel[k];
                }
                out[x] = sum;
            }
            for (let x = 0; x < N; x++) {
                const v = Math.max(-1, Math.min(1, out[x] * 2.6));
                const lit = v > 0;
                const i = (y * N + x) * 4;
                data[i] = lit ? 226 : 0;
                data[i + 1] = lit ? 238 : 0;
                data[i + 2] = lit ? 255 : 2;
                data[i + 3] = Math.round(Math.abs(v) * 13);
            }
        }
        ctx.putImageData(image, 0, 0);
        brushTile = canvas.toDataURL('image/png');
        return brushTile;
    }

    // Two star layers at different densities so the void behind the console has
    // depth instead of being 25% of the frame doing nothing.
    //
    // A star is drawn as one of THREE classes, not one: a 1px point, a 2px point
    // with a faint halo, and — for the brightest tenth — a 3px core inside a real
    // bloom with a cross flare. Colour runs on a two-temperature ramp, warm amber
    // white through cold blue white. The previous field was uniform 1px hard
    // white squares at one alpha with a bloom branch that a gamma of 2.2 almost
    // never reached, so a quarter of the frame carried a flat dot screen that
    // photographed as noise rather than as sky.
    const starTiles = {};
    function starfieldTile(seed, count, maxAlpha) {
        const key = `${seed}:${count}`;
        if (starTiles[key]) return starTiles[key];
        const N = 512;
        const canvas = makeCanvas(N);
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        const rnd = mulberry32(seed);
        for (let i = 0; i < count; i++) {
            const x = Math.floor(rnd() * N);
            const y = Math.floor(rnd() * N);
            // 1.4 rather than 2.2: the old exponent pushed 93% of the field into
            // the dimmest class, so the bright classes essentially never drew.
            const bright = Math.pow(rnd(), 1.4);
            const alpha = 0.12 + bright * maxAlpha;
            // two colour temperatures, mixed continuously rather than switched
            const warm = rnd();
            const r = Math.round(212 + warm * 43);
            const g = Math.round(228 - warm * 6);
            const b = Math.round(255 - warm * 74);
            if (bright > 0.88) {
                // the brightest tenth: core, bloom and a short cross flare
                const grad = ctx.createRadialGradient(x + 1.5, y + 1.5, 0, x + 1.5, y + 1.5, 7);
                grad.addColorStop(0, `rgba(${r},${g},${b},${(alpha * 0.85).toFixed(3)})`);
                grad.addColorStop(0.45, `rgba(${r},${g},${b},${(alpha * 0.22).toFixed(3)})`);
                grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(x - 6, y - 6, 15, 15);
                ctx.fillStyle = `rgba(${r},${g},${b},${(alpha * 0.30).toFixed(3)})`;
                ctx.fillRect(x - 4, y + 1, 11, 1);
                ctx.fillRect(x + 1, y - 4, 1, 11);
                ctx.fillStyle = `rgba(255,255,255,${Math.min(0.98, alpha + 0.3).toFixed(3)})`;
                ctx.fillRect(x, y, 3, 3);
            } else if (bright > 0.55) {
                const grad = ctx.createRadialGradient(x + 1, y + 1, 0, x + 1, y + 1, 3.6);
                grad.addColorStop(0, `rgba(${r},${g},${b},${(alpha * 0.55).toFixed(3)})`);
                grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(x - 3, y - 3, 9, 9);
                ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(0.92, alpha + 0.16).toFixed(3)})`;
                ctx.fillRect(x, y, 2, 2);
            } else {
                ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        starTiles[key] = canvas.toDataURL('image/png');
        return starTiles[key];
    }

    // =====================================================================
    // Crest ports
    //
    // A PORT is a machined aperture with a painted crest lit EDGE TO EDGE
    // inside it. Two sizes — the roster card and the dossier medallion — one
    // construction:
    //
    //   * the APERTURE IS CUT TO THE PLATE, 256x193, and the art is mounted
    //     `contain` on a black mat. Nothing is cropped. The previous aperture
    //     was 3:2 with a cover fit, which silently discarded 13% of every
    //     crest's height: the Titan Lords monument lost the tops of its three
    //     pylons AND the foot of its base, on a source PNG that carries clear
    //     margin above and below the whole monument. The crests are painted on
    //     black — their border pixels measure luma 5 against the port's own 8 —
    //     so a contain fit shows no letterbox even where the plate is a pixel
    //     shorter than the aperture;
    //   * ONE warm key light rakes the GLASS from the top-left, the same colour
    //     on all thirteen ports. It used to be the faction's own hue at 22%,
    //     which read as a coloured gel over the painting and turned the roster
    //     into a rainbow — green, cyan, magenta, purple, chartreuse — against a
    //     console that is steel and amber everywhere else.
    //
    // The <img> carries no width/height attributes on purpose: the derivative's
    // pixel size depends on how it was published and this screen must not
    // hard-code it. The port's own aspect-ratio reserves the box before the
    // bytes land, so there is no layout shift either way.
    //
    // The alt is empty because the faction name is set in text immediately
    // beside every port on this screen — a described crest would just make a
    // screen reader say the name twice.
    // =====================================================================

    function ensureLockSprite() {
        if (document.getElementById(SPRITE_ID)) {
            return;
        }
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = SPRITE_ID;
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
        // Drawn at 48 units and displayed at 12-16px so the shackle arc has
        // four times the resolution it needs; geometricPrecision keeps the
        // rasteriser from snapping the curve to the pixel grid and stair-
        // stepping it, which is exactly what the old 24-unit path did.
        svg.innerHTML =
            '<symbol id="rsLock" viewBox="0 0 48 48" shape-rendering="geometricPrecision">'
          + '<path d="M14.6 21.4v-6.2a9.4 9.4 0 0 1 18.8 0v6.2" fill="none" stroke="currentColor" '
          + 'stroke-width="5" stroke-linecap="round"/>'
          + '<rect x="9.2" y="20.6" width="29.6" height="21.4" rx="1.6" fill="currentColor"/>'
          + '</symbol>';
        document.body.appendChild(svg);
    }

    // `variant` is 'card' or 'hero'; both draw the same file, because one crest
    // derivative sharp enough for a 217px card is more than sharp enough for a
    // 132px medallion and the roster would otherwise fetch two copies of every
    // faction. Loading is eager: twelve of these ARE the screen.
    function crestPort(raceId, opts) {
        const options = opts || {};
        const id = Number(raceId);
        const ident = identity(id);
        const cls = `race-port${options.variant === 'hero' ? ' is-hero' : ''}`;
        return `<span class="${cls}" data-state="${options.locked ? 'locked' : 'ready'}"${crestVars(id)}>`
             + (ident.crest
                ? `<img class="race-port-art" src="${esc(ident.crest)}" alt=""`
                  + ' decoding="async" draggable="false">'
                : '')
             + '<span class="race-port-glass" aria-hidden="true"></span>'
             + (options.locked ? `<span class="race-port-seal" aria-hidden="true">${lockGlyph()}</span>` : '')
             + (options.extras || '')
             + '</span>';
    }

    function lockGlyph() {
        return '<svg class="race-lock-glyph" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><use href="#rsLock"/></svg>';
    }

    // =====================================================================
    // Readings
    // =====================================================================

    // One reading, two numbers, and they are not the same number.
    //
    //   raw     what the engine multiplies by. This is what gets PRINTED.
    //   effect  what the axis PLOTS. Identical to raw on six of the seven
    //           channels; on ship cost it is 1/raw, so that a dearer hull sits
    //           below the x1.00 rule instead of above it while being coloured as
    //           a penalty. Geometry and meaning now agree, and the axis is
    //           readable as an axis.
    function reading(race, channel) {
        const raw = race && race.bonuses ? race.bonuses[channel.key] : undefined;
        if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) {
            return null;
        }
        const effect = channel.inverse ? 1 / raw : raw;
        const benefit = Math.log(effect) / Math.log(RAIL);
        const k = Math.min(1, Math.abs(benefit));
        const tone = benefit > 0.0001 ? 'up' : benefit < -0.0001 ? 'down' : 'flat';
        return {
            raw,
            effect,
            delta: Math.round((raw - 1) * 100),
            benefit,
            k,
            // what the bar actually draws — see MIN_DRAW
            draw: tone === 'flat' ? 0 : Math.max(MIN_DRAW, k),
            tone
        };
    }

    function multiplierText(value) {
        return `×${value.toFixed(2)}`;
    }

    // The printed reading. On the inverted channel it carries the noun as well
    // as the figure — "×1.20 cost" — because that slab is drawn at the effect
    // (×0.83) and the two numbers must never be read as the same quantity. A
    // channel at rest prints the bare ×1.00: there is nothing to disambiguate.
    function readoutText(channel, r) {
        if (!r) return '--';
        if (channel.inverse && r.tone !== 'flat') {
            return `${multiplierText(r.raw)} cost`;
        }
        return multiplierText(r.raw);
    }

    function readingTitle(channel, r) {
        if (!r) {
            return `${channel.label} — not reported`;
        }
        if (r.delta === 0) {
            return `${channel.label} ${multiplierText(r.raw)} — galactic baseline`;
        }
        const swing = `${r.delta > 0 ? '+' : ''}${r.delta}%`;
        const plotted = channel.inverse ? `, plotted as effect ${multiplierText(r.effect)}` : '';
        return `${channel.label} ${multiplierText(r.raw)} (${swing})${plotted} — ${r.benefit > 0 ? 'advantage' : 'penalty'}`;
    }

    function deviationSummary(race) {
        const rows = CHANNELS.map(channel => ({ channel, r: reading(race, channel) })).filter(row => row.r);
        const count = tone => rows.filter(row => row.r.tone === tone).length;
        const peak = rows.reduce((best, row) => (!best || row.r.k > best.r.k ? row : best), null);
        return {
            up: count('up'),
            down: count('down'),
            flat: count('flat'),
            reported: rows.length,
            peak: peak && peak.r.k > 0 ? peak : null
        };
    }

    // How many doctrines in the whole registry carry no penalty at all. Used so
    // a flat profile can state its actual distinction instead of asserting one.
    function unpenalisedCount() {
        return unlockedRaces.filter(race => {
            const s = deviationSummary(race);
            return s.reported > 0 && s.down === 0;
        }).length;
    }

    // Where this faction sits against the rest of the registry on one channel.
    // Ties share the better rank. This is the comparative layer the picker owes
    // a player: a multiplier alone does not say whether ×1.00 metal is good.
    function standing(race, channel) {
        const mine = reading(race, channel);
        if (!mine) return null;
        const all = unlockedRaces.map(other => reading(other, channel)).filter(Boolean);
        if (all.length < 2) return null;
        const better = all.filter(other => other.benefit > mine.benefit + 1e-6).length;
        return { rank: better + 1, of: all.length };
    }

    function ordinal(n) {
        const rem100 = n % 100;
        if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
        switch (n % 10) {
            case 1: return `${n}st`;
            case 2: return `${n}nd`;
            case 3: return `${n}rd`;
            default: return `${n}th`;
        }
    }

    function plural(count, one, many) {
        return `${count} ${count === 1 ? one : many}`;
    }

    // The plot is announced as one image with one label, so the label has to
    // carry everything the plot draws — including the rank printed under each
    // column, which is otherwise invisible to a screen reader because it sits
    // inside the role="img" subtree.
    function rackLabel(race, withRanks) {
        const parts = CHANNELS.map(channel => {
            const r = reading(race, channel);
            const s = withRanks ? standing(race, channel) : null;
            const value = r ? multiplierText(r.raw) : 'n/a';
            return s
                ? `${channel.label} ${value}, ${ordinal(s.rank)} of ${s.of}`
                : `${channel.label} ${value}`;
        });
        return `Doctrine profile against the 1.00 baseline: ${parts.join('; ')}.`;
    }

    // The card's deviation chart — THE SAME INSTRUMENT AS THE DOSSIER PLOT, at
    // card scale. That is the whole point of this rebuild. The previous version
    // was a second, incompatible grammar for the identical dataset: free-
    // floating segments at irregular heights, irregular gaps between them, no
    // axis and no channel names, so at 216px it photographed as a corrupt
    // progress bar while the dossier drew the same seven numbers as slabs in a
    // machined box.
    //
    // Now both are one channel rail: a continuous inset channel divided into
    // seven bays by machined walls with NO gaps, a bright ×1.00 rule running
    // unbroken across all seven, a fill growing out of that rule and a
    // fixed-height cap on its end. Same colours, same baseline, same encoding,
    // same order — one chart language for one dataset — with the three-letter
    // channel codes stencilled underneath so the rail names its own axes instead
    // of relying on a legend 800px away in the header.
    function meterRack(race) {
        const bars = CHANNELS.map(channel => {
            const r = reading(race, channel);
            const tone = r ? r.tone : 'flat';
            const k = r ? r.draw.toFixed(3) : '0';
            return `<span class="race-meter" data-tone="${tone}" style="--k:${k}" title="${esc(readingTitle(channel, r))}">`
                + '<i class="race-meter-fill"></i><i class="race-meter-cap"></i></span>';
        }).join('');
        const codes = CHANNELS.map(channel => `<span>${channel.code}</span>`).join('');
        return '<span class="race-meters">'
            + `<span class="race-meter-well" role="img" aria-label="${esc(rackLabel(race))}">`
            + '<span class="race-meter-rule"></span>'
            + `<span class="race-meter-cols">${bars}</span>`
            + '</span>'
            + `<span class="race-meter-codes" aria-hidden="true">${codes}</span>`
            + '</span>';
    }

    // ---------------------------------------------------------------------
    // Doctrine (tech branches and hulls a race gives up) — server-supplied.
    // ---------------------------------------------------------------------
    function doctrineChips(race) {
        const d = race.doctrine || {};
        const chips = [];
        (d.lockedBranches || []).forEach(name => chips.push({ kind: 'lock', tag: 'LOCK', text: name }));
        (d.cappedBranches || []).forEach(name => chips.push({ kind: 'cap', tag: 'CAP', text: name }));
        // "NO", not "HULL": the tag has to say the hull is denied, not name the
        // category, or the chip reads as a hull this race gets.
        (d.lockedShips || []).forEach(name => chips.push({ kind: 'hull', tag: 'NO', text: name }));
        return chips;
    }

    function restrictionCount(race) {
        const d = race.doctrine || {};
        return (d.lockedBranches || []).length + (d.cappedBranches || []).length + (d.lockedShips || []).length;
    }

    function compactDoctrine(race) {
        const d = race.doctrine || {};
        const parts = [];
        if (Array.isArray(d.lockedBranches) && d.lockedBranches.length) parts.push(`No ${d.lockedBranches.join('/')}`);
        if (Array.isArray(d.lockedShips) && d.lockedShips.length) parts.push(`No ${d.lockedShips.join('/')}`);
        if (!parts.length && Array.isArray(d.cappedBranches) && d.cappedBranches.length) {
            parts.push(`Capped: ${d.cappedBranches.length} branch${d.cappedBranches.length > 1 ? 'es' : ''}`);
        }
        return parts.length ? parts.join(' · ') : 'Full tech · all hulls';
    }

    // The card's one-line headline, computed rather than written: the channel
    // this doctrine bends hardest.
    function signatureChip(race) {
        const s = deviationSummary(race);
        if (!s.peak) {
            return { tone: 'flat', text: 'FLAT ×1.00' };
        }
        return {
            tone: s.peak.r.tone,
            // readoutText, not a bare multiplier: the cost channel has to carry
            // its noun here for the same reason it does in the dossier — "CST
            // ×2.00" in penalty red is otherwise read as a doubled stat.
            text: `${s.peak.channel.code} ${readoutText(s.peak.channel, s.peak.r)}`
        };
    }

    // ---------------------------------------------------------------------
    // Unlock objectives. A locked race is a target, not an error.
    //
    // Two gates, two treatments. A SERVICE gate is earned by playing, so it
    // wears hazard chevrons — the sealed-hatch language. A REQUISITION gate is
    // bought, so it wears a bronze plate: paid content must never read as an
    // error state.
    // ---------------------------------------------------------------------
    function unlockObjective(race) {
        const req = race.unlockRequirement || {};
        switch (race.unlockType) {
            case 'achievement':
                switch (req.type) {
                    case 'wins': return `Win ${req.count} games`;
                    case 'games_played': return `Play ${req.count} games`;
                    case 'planets_colonized': return `Colonize ${req.count} planets`;
                    case 'total_crystal': return `Earn ${req.count} crystal`;
                    case 'ships_built': return `Build ${req.count} ships`;
                    case 'battles_won': return `Win ${req.count} battles`;
                    case 'sectors_explored': return `Explore ${req.count} sectors`;
                    default: return 'Complete achievement';
                }
            case 'referral':
                return `Refer ${req.count} commanders`;
            case 'premium':
                return `Acquire for $${req.amount}`;
            default:
                return 'Clearance required';
        }
    }

    function unlockChannel(race) {
        switch (race.unlockType) {
            case 'achievement': return 'SERVICE RECORD';
            case 'referral': return 'RECRUITMENT';
            case 'premium': return 'REQUISITION';
            default: return 'CLEARANCE';
        }
    }

    function gateKind(race) {
        if (race.unlocked) return 'open';
        return race.unlockType === 'premium' ? 'requisition' : 'service';
    }

    function ensureStyles() {
        const existing = document.getElementById(STYLE_ID);
        if (existing) {
            // Static assets are served immutable for a year, so the sheet only
            // refreshes when its ?v= changes. The host page owns that <link>,
            // and this module is versioned separately — if a release bumps the
            // script but not the stylesheet tag, a returning player gets new
            // markup against a year-old sheet. Re-point it when they disagree;
            // when the host page is in step this is a no-op.
            const href = existing.getAttribute('href') || '';
            if (href.split('?')[0] === STYLE_HREF.split('?')[0] && href !== STYLE_HREF) {
                existing.setAttribute('href', STYLE_HREF);
            }
            return;
        }
        // Fallback for a host page that never shipped the tag at all.
        const link = document.createElement('link');
        link.id = STYLE_ID;
        link.rel = 'stylesheet';
        link.href = STYLE_HREF;
        document.head.appendChild(link);
    }

    function initialize(callback, activeRaceId) {
        onSelectCallback = callback;
        preferredRaceId = Number(activeRaceId) || null;
        loadUnlockedRaces();
    }

    function loadUnlockedRaces() {
        if (window.websocket && window.websocket.readyState === WebSocket.OPEN) {
            window.websocket.send('//getunlockedraces');
        }
    }

    // The header's channel key. It is the legend for every meter on the screen
    // AND it is what fills the run of bare plate between the title and the
    // authorization gauge — real instrumentation instead of 600px of nothing.
    function channelKey() {
        return CHANNELS.map(channel =>
            `<span><b>${channel.code}</b><em>${esc(channel.short)}</em></span>`
        ).join('');
    }

    function showRaceSelection(races) {
        unlockedRaces = Array.isArray(races) ? races : [];
        ensureStyles();
        ensureLockSprite();

        const existing = document.getElementById('raceSelectionModal');
        if (existing) {
            existing.remove();
        }
        detachParallax();

        const available = unlockedRaces.filter(race => race.unlocked).length;
        const total = unlockedRaces.length;

        const modal = document.createElement('div');
        modal.id = 'raceSelectionModal';
        modal.style.setProperty('--rs-brush', `url("${brushedSteelTile()}")`);
        modal.style.setProperty('--rs-stars-far', `url("${starfieldTile(0x2A17B3, 300, 0.42)}")`);
        modal.style.setProperty('--rs-stars-near', `url("${starfieldTile(0x77C41D, 120, 0.75)}")`);

        // The void is a quarter of a 1920 frame. It used to be black with two
        // starfields in it, which is most of the reason the whole screen
        // photographed below luma 51. It now carries the SELECTED FACTION'S
        // HOMEWORLD as a deep backdrop — the same painted plate the dossier
        // shows, held well back behind a scrim and a vignette so it gives the
        // frame depth and a value range without ever competing with the
        // console bolted on top of it.
        const void_ = document.createElement('div');
        void_.className = 'race-void';
        void_.setAttribute('aria-hidden', 'true');
        void_.innerHTML =
            `<span class="race-void-world"><img src="${esc(RACE_IDENTITY[1].world)}" alt=""`
          + ' decoding="async" draggable="false"></span>'
          + '<span class="race-void-far"></span>'
          + '<span class="race-void-near"></span>'
          + '<span class="race-void-haze"></span>'
          // Gutter signage: a bolted plate carrying the selected faction's crest
          // in a machined aperture, with its registry designation stencilled
          // under it. It used to be the bare crest PNG masked into an ellipse
          // and screen-blended onto the starfield with nothing around it, which
          // photographed as a leaked render rather than as signage.
          + `<span class="race-void-mark"><img src="${esc(RACE_IDENTITY[1].crest)}" alt=""`
          + ' decoding="async" draggable="false"><span>FAC-01</span></span>'
          + '<span class="race-void-tag"></span>'
          + '<span class="race-rail" data-side="l"></span>'
          + '<span class="race-rail" data-side="r"></span>';
        modal.appendChild(void_);

        const container = document.createElement('div');
        container.className = 'race-selection-container';
        container.innerHTML = `
            <header class="race-selector-header">
                <div class="race-selector-heading">
                    <div class="race-selector-eyebrow">Faction database // command authorization</div>
                    <h2 data-text="Select Your Race">Select Your Race</h2>
                    <p>Choose an empire doctrine. Strengths are powerful; restrictions are permanent for this match.</p>
                </div>
                <div class="race-selector-rail" aria-hidden="true"><span class="race-selector-rail-tag">PNL-RS-01</span></div>
                <div class="race-selector-key" aria-hidden="true">
                    <span class="race-selector-key-bar">Channel key</span>
                    <span class="race-selector-key-grid">${channelKey()}</span>
                </div>
                <div class="race-selector-gauge">
                    <span class="race-selector-gauge-label">Authorized</span>
                    <span class="race-selector-gauge-read"><strong>${pad2(available)}</strong><i>/${pad2(total)}</i></span>
                    <span class="race-selector-gauge-note">factions</span>
                </div>
            </header>
            <div class="race-selection-main">
                <section class="race-grid-shell" aria-label="Race roster">
                    <div class="race-grid-heading">
                        <span>Faction roster</span>
                        <small>up is advantage &middot; rails &times;0.50 / &times;2.00</small>
                    </div>
                    <div class="race-grid">
                        ${unlockedRaces.map(race => createRaceCard(race)).join('')}
                    </div>
                    <!-- The bay's foot. Whatever slack a 3x4 roster leaves under
                         the last row used to be bare brushed plate with nothing
                         on it; the bay now ends in the same machined graduation
                         channel and stencilled panel code as the header rail, so
                         the roster closes on hardware instead of trailing off. -->
                    <div class="race-grid-foot" aria-hidden="true">
                        <span class="race-grid-foot-code">PNL-RS-02</span>
                        <span class="race-grid-foot-channel"></span>
                        <span class="race-grid-foot-code">REG//12</span>
                    </div>
                </section>
                <aside class="race-detail-panel" aria-live="polite">
                    <div class="race-detail-content"></div>
                    <div class="race-confirm-bar">
                        <div class="race-confirm-note"><span></span> Selection locks when you confirm</div>
                        <button class="race-confirm-btn" id="confirmRaceBtn">Confirm Selection</button>
                    </div>
                </aside>
            </div>
        `;

        modal.appendChild(container);
        document.body.appendChild(modal);

        modalRef = modal;
        detailPane = container.querySelector('.race-detail-content');
        confirmButton = container.querySelector('#confirmRaceBtn');

        const cards = Array.from(container.querySelectorAll('.race-card'));
        cards.forEach(card => {
            card.addEventListener('click', () => selectRace(Number(card.dataset.raceId)));
            card.addEventListener('keydown', event => handleRosterKeys(event, cards, card));
        });

        confirmButton.addEventListener('click', confirmSelection);
        attachParallax(modal);

        const preferred = preferredRaceId
            ? unlockedRaces.find(r => r.id === preferredRaceId && r.unlocked)
            : null;
        const firstUnlocked = preferred || unlockedRaces.find(r => r.unlocked) || unlockedRaces[0];
        if (firstUnlocked) {
            selectRace(firstUnlocked.id);
        } else {
            renderEmptyState();
        }
        preferredRaceId = null;
    }

    // Depth without motion: the two star layers offset by different amounts as
    // the pointer moves, and sit at exactly 0 when it has not, so a headless
    // screenshot is byte-stable.
    function attachParallax(modal) {
        let queued = false;
        let nx = 0;
        let ny = 0;
        const apply = () => {
            queued = false;
            modal.style.setProperty('--rs-px', nx.toFixed(4));
            modal.style.setProperty('--rs-py', ny.toFixed(4));
        };
        parallaxHandler = event => {
            const w = window.innerWidth || 1;
            const h = window.innerHeight || 1;
            nx = (event.clientX / w) * 2 - 1;
            ny = (event.clientY / h) * 2 - 1;
            if (!queued) {
                queued = true;
                window.requestAnimationFrame(apply);
            }
        };
        modal.addEventListener('pointermove', parallaxHandler);
    }

    function detachParallax() {
        if (modalRef && parallaxHandler) {
            modalRef.removeEventListener('pointermove', parallaxHandler);
        }
        parallaxHandler = null;
    }

    function handleRosterKeys(event, cards, card) {
        const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 0, ArrowUp: 0 };
        if (!(event.key in step)) {
            return;
        }
        const columns = columnCount(cards);
        const delta = event.key === 'ArrowDown' ? columns
            : event.key === 'ArrowUp' ? -columns
            : step[event.key];
        const next = cards[cards.indexOf(card) + delta];
        if (!next) {
            return;
        }
        event.preventDefault();
        next.focus();
        selectRace(Number(next.dataset.raceId));
    }

    function columnCount(cards) {
        if (cards.length < 2) {
            return 1;
        }
        const top = cards[0].offsetTop;
        let columns = 0;
        while (columns < cards.length && cards[columns].offsetTop === top) {
            columns += 1;
        }
        return Math.max(1, columns);
    }

    function createRaceCard(race) {
        const id = Number(race.id);
        const ident = identity(id);
        const locked = !race.unlocked;
        const sig = signatureChip(race);
        const gate = gateKind(race);
        const noteTag = locked ? unlockChannel(race) : 'DOCTRINE';
        const noteText = locked ? unlockObjective(race) : compactDoctrine(race);
        // The port carries the card's furniture — designation top-left, widest
        // swing top-right — stencilled ONTO the art's dark margin instead of
        // stacked above it. That is what buys the crest 96px of card height in
        // the same 250px row the four-line version used, and it is the reason
        // the roster still lands all twelve factions on a 1080p screen.
        //
        // The prose description moved to the dossier and to a screen-reader-only
        // span here: on a 216px card it was two clamped lines of flavour sitting
        // where the faction art should be, and the dossier restates it in full
        // the moment the card is selected.
        const extras =
            `<span class="race-card-index"><i class="race-led"></i>FAC-${pad2(id)}<em>${ident.code}</em></span>`
          + `<span class="race-card-sig" data-tone="${sig.tone}">${esc(sig.text)}</span>`;
        return `
            <button type="button" id="race-${id}" class="race-card ${locked ? 'locked' : 'unlocked'}"
                    data-race-id="${id}" aria-pressed="false">
                ${crestPort(id, { locked, extras })}
                <h3>${esc(race.name)}</h3>
                <span class="rs-sr">${esc(race.description)}</span>
                ${meterRack(race)}
                <span class="race-card-note" data-gate="${gate}">
                    <i class="race-note-flag">${locked ? lockGlyph() : ''}</i>
                    <span class="race-note-body"><b>${esc(noteTag)}</b><em>${esc(noteText)}</em></span>
                </span>
                <span class="race-card-mark" aria-hidden="true">Selected</span>
            </button>
        `;
    }

    function selectRace(raceId) {
        const race = unlockedRaces.find(r => r.id === raceId);
        if (!race) {
            return;
        }

        selectedRace = race.unlocked ? raceId : null;

        document.querySelectorAll('.race-card').forEach(card => {
            const isTarget = card.dataset.raceId === String(raceId);
            card.classList.toggle('active', isTarget && race.unlocked);
            card.classList.toggle('inspecting', isTarget);
            card.setAttribute('aria-pressed', isTarget && race.unlocked ? 'true' : 'false');
        });

        const ident = identity(raceId);
        if (modalRef) {
            // The void behind the console belongs to the faction you are
            // inspecting: its homeworld as the deep backdrop, its crest on the
            // gutter signage plate. No hue is set anywhere — see
            // RACE_IDENTITY; the paintings are the identity.
            const world = modalRef.querySelector('.race-void-world img');
            if (world && ident.world) {
                world.setAttribute('src', ident.world);
            }
            const markPlate = modalRef.querySelector('.race-void-mark');
            const mark = markPlate && markPlate.querySelector('img');
            if (mark && ident.crest) {
                mark.setAttribute('src', ident.crest);
                // The plate's own gain, so the signage crest is knocked back
                // from the SAME normalized value the roster ports are held at.
                applyCrestTuning(markPlate, raceId);
            }
            const markCode = markPlate && markPlate.querySelector('span');
            if (markCode) {
                markCode.textContent = `FAC-${pad2(raceId)} · ${ident.code}`;
            }
            const tag = modalRef.querySelector('.race-void-tag');
            if (tag) {
                tag.textContent = `SYS://FACTION-REGISTRY · FAC-${pad2(raceId)} · ${ident.code} · ${String(race.name).toUpperCase()}`;
            }
        }

        renderRaceDetails(race);
    }

    function renderEmptyState() {
        if (!detailPane) {
            return;
        }
        detailPane.innerHTML = `
            <div class="race-detail-empty">
                <strong>No factions authorized</strong>
                <span>Play or win games to bring factions online.</span>
            </div>
        `;
        if (confirmButton) {
            confirmButton.disabled = true;
        }
    }

    function renderRaceDetails(race) {
        if (!detailPane || !race) {
            return;
        }

        const id = Number(race.id);
        const ident = identity(id);
        const locked = !race.unlocked;

        const best = CHANNELS.map(channel => ({ channel, s: standing(race, channel) }))
            .filter(row => row.s)
            .reduce((acc, row) => (!acc || row.s.rank < acc.s.rank ? row : acc), null);

        detailPane.className = `race-detail-content${locked ? ' is-locked' : ''}`;
        // The hero: the faction's painted homeworld across the head of the bay
        // with the crest medallion bolted into its bottom-left corner and the
        // name set on the plate beside it. This panel used to open with a crest
        // in a black box on a black panel and an art review called the frame
        // "a well-skinned spreadsheet" and then "a telemetry dashboard".
        //
        // The plate is the flexible track in this column (see the sheet): every
        // spare pixel in the bay is collected here and spent on the painting,
        // so the confirm rail never moves between factions and there is never a
        // band of empty textured panel anywhere in the dossier.
        detailPane.innerHTML = `
            <div class="race-detail-hero">
                ${worldPlate(race, ident, locked)}
                <div class="race-hero-foot">
                    ${crestPort(id, { variant: 'hero', locked })}
                    <div class="race-detail-ident">
                        <span class="race-detail-kicker">FAC-${pad2(id)} &middot; ${ident.code} &middot; ${locked ? 'restricted' : 'authorized'}</span>
                        <h3>${esc(race.name)}</h3>
                        <span class="race-detail-tagline">${esc(race.description)}</span>
                        ${locked ? heroGate(race) : ''}
                    </div>
                </div>
            </div>
            <div class="race-detail-special">
                <strong>Signature</strong>
                <span>${esc(race.specialAbility)}</span>
            </div>
            <div class="race-detail-instrument">
                <div class="race-detail-instrument-bar">
                    <span>Doctrine profile</span>
                    <small>${best ? `best ${best.channel.code} ${best.s.rank}/${best.s.of}` : 'deviation from &times;1.00'}</small>
                </div>
                ${doctrinePlot(race)}
                ${deviationStrip(race)}
            </div>
            ${fleetProfile(race)}
            ${accessModules(race)}
            <div class="race-detail-stamp-line" aria-hidden="true">SYS://FACTION-REGISTRY &middot; FAC-${pad2(id)} &middot; ${locked ? 'ACCESS DENIED' : 'DOSSIER COMPLETE'}</div>
        `;

        if (locked) {
            const btn = detailPane.querySelector('.race-purchase-btn');
            if (btn) {
                btn.addEventListener('click', () => purchaseRace(id));
            }
        }

        if (confirmButton) {
            confirmButton.disabled = locked;
            confirmButton.textContent = locked ? 'Faction Locked' : 'Confirm Selection';
        }

        markScrollState();
    }

    // ------------------------------------------------------------------
    // The homeworld plate.
    //
    // production/homeworlds/ holds a 960x540 painting of each faction's canon
    // world: Terra's flooded gantries, the Works' plated hemisphere, the
    // Ancients' installation adrift on its cross. They are the only assets in
    // the library painted LIT — a third of their pixels sit above luma 100 —
    // and mounting one at the head of the dossier is what gives this screen a
    // value structure instead of twelve dark crests on a dark console.
    //
    // The caption names a place and stops. The engine gives every player a
    // homeworld sector and nothing about it varies by race, so any line here
    // claiming otherwise would be advertising a mechanic that does not exist.
    // ------------------------------------------------------------------
    function worldPlate(race, ident, locked) {
        if (!ident.world) {
            return '';
        }
        const name = ident.worldName || race.name;
        // The tag and the seal live on their own rail at the head of the plate,
        // not floated over it: the medallion is docked to the plate's bottom
        // edge and on a faction whose dossier squeezes the plate short, an
        // absolutely-positioned tag ends up underneath the medallion. A rail
        // and a foot in one column cannot collide however far the plate flexes.
        return `<img class="race-world-art" src="${esc(ident.world)}"`
             + ` alt="${esc(name)}, the ${race.name} homeworld" decoding="async" draggable="false">`
             + '<span class="race-world-glass" aria-hidden="true"></span>'
             + '<span class="race-hero-rail">'
             + `<span class="race-world-tag"><i>Homeworld</i>${esc(name)}</span>`
             + (locked ? '<span class="race-world-seal" aria-hidden="true"><b>Restricted</b></span>' : '')
             + '</span>';
    }

    // A faction with a long restriction list has a taller dossier than the bay.
    // The bay scrolls, which is correct, but the cut has to read as "there is
    // more below" rather than as a panel title sliced in half — so the fade is
    // only mounted when the content genuinely overflows.
    function markScrollState() {
        const panel = modalRef && modalRef.querySelector('.race-detail-panel');
        if (!panel || !detailPane) {
            return;
        }
        const apply = () => panel.classList.toggle(
            'is-scrollable',
            detailPane.scrollHeight > detailPane.clientHeight + 1
        );
        apply();
        // Art decodes after the first layout and the fleet sheet is the tallest
        // thing in the bay, so re-check once the panel has settled.
        window.requestAnimationFrame(apply);
    }

    // ------------------------------------------------------------------
    // The doctrine plot — one instrument, every faction.
    //
    // Bars grow out of the ×1.00 rule: up is advantage, down is penalty, and the
    // rails are the ×2.00 and ×0.50 lines the axis is labelled with.
    //
    // FOUR THINGS ARE FIXED HERE AND EVERY ONE OF THEM WAS A LIE ABOUT THE DATA.
    //
    //   1. The chart contradicted its own axis. Ship cost ×1.20 printed ×1.20
    //      and drew BELOW the ×1.00 line. It now plots the effect (×0.83), which
    //      is where the axis says a penalty belongs, and prints "×1.20 cost" so
    //      the raw multiplier is still the number on the screen.
    //   2. There was no continuous baseline. The ×1.00 rule existed only as
    //      short dashes in the gutters BETWEEN columns — never across a bar —
    //      so an out-of-band slab had nothing to be out of band OF. All three
    //      gridlines are now drawn inside every channel's own recess as well as
    //      across the well, so they run edge to edge behind the slabs, and the
    //      ×1.00 one is the brightest line in the instrument.
    //   3. The value was double-encoded: a slab's y AND its thickness both moved
    //      with the reading, so ×1.40 was a chunky block and ×1.10 a hairline.
    //      Thickness is now a constant — the CAP is 6px on every channel at
    //      every value — and length-from-baseline is the single encoding.
    //   4. The readings alternated sides, amber above a slab and red below it,
    //      so reading the row zig-zagged. They are now one straight readout rail
    //      across the head of the plot, all seven at the same y, colour carrying
    //      advantage and penalty.
    //
    // A flat doctrine — the Terran Empire, the faction this screen opens on —
    // draws seven steel detents parked on the rule, and still says something
    // loudly: its registry rank under every column. Baseline metal is 4th of 12.
    // A multiplier alone could never carry that.
    // ------------------------------------------------------------------
    function doctrinePlot(race) {
        const summary = deviationSummary(race);
        // A DOCTRINE THAT BENDS NOTHING DOES NOT GET SEVEN COPIES OF ×1.00.
        // The default faction is all-baseline, so the readout rail printed the
        // same figure seven times over seven identical detents under seven
        // identical ranks: 435x130px of the dossier's prime real estate saying
        // one thing three ways, and the first instrument a player's eye lands on
        // reading as an unpopulated widget. When every channel is at standard
        // the rail carries the FINDING instead — which is a fact about the
        // registry that no per-column figure can state — and the detents and the
        // rank row below still carry the data.
        const allBaseline = summary.reported > 0 && summary.up === 0 && summary.down === 0;
        const readout = allBaseline
            ? `<b>${baselineFinding()}</b>`
            : CHANNELS.map(channel => {
                const r = reading(race, channel);
                const tone = r ? r.tone : 'flat';
                return `<span data-tone="${tone}" title="${esc(readingTitle(channel, r))}">`
                     + `${esc(readoutText(channel, r))}</span>`;
            }).join('');
        const cols = CHANNELS.map(channel => {
            const r = reading(race, channel);
            const tone = r ? r.tone : 'flat';
            const k = r ? r.draw : 0;
            return `<span class="rs-col" data-tone="${tone}" style="--k:${k.toFixed(3)}"`
                 + ` title="${esc(readingTitle(channel, r))}">`
                 + '<i class="rs-col-slot"></i>'
                 + '<i class="rs-col-bar"></i>'
                 + '<i class="rs-col-cap"></i>'
                 + '</span>';
        }).join('');
        const codes = CHANNELS.map(channel => {
            const s = standing(race, channel);
            const r = reading(race, channel);
            const title = s
                ? `${channel.label} ${r ? multiplierText(r.raw) : ''} — ${ordinal(s.rank)} of ${s.of} in the registry`
                : channel.label;
            return `<span title="${esc(title)}"${s && s.rank <= 3 ? ' data-top="1"' : ''}>`
                 + `<b>${channel.code}</b>`
                 + `<em>${s ? `${s.rank}/${s.of}` : '--'}</em></span>`;
        }).join('');
        return `
            <div class="rs-plot" role="img" aria-label="${esc(rackLabel(race, true))}">
                <div class="rs-plot-read"${allBaseline ? ' data-flat="1"' : ''} aria-hidden="true">${readout}</div>
                <div class="rs-plot-axis" aria-hidden="true">
                    <span>&times;2.00</span><span>&times;1.00</span><span>&times;0.50</span>
                </div>
                <div class="rs-plot-well">
                    <span class="rs-plot-rule" data-at="hi"></span>
                    <span class="rs-plot-rule" data-at="lo"></span>
                    <span class="rs-plot-base"></span>
                    <span class="rs-plot-cols">${cols}</span>
                </div>
                <div class="rs-plot-codes" aria-hidden="true">${codes}</div>
            </div>
        `;
    }

    // ------------------------------------------------------------------
    // Fleet profile — the second identity signal, and THREE PAINTINGS, not one.
    //
    // This module used to mount the faction's contact sheet and caption it in
    // thirds. That was a visible lie: on every one of the twelve sheets the
    // three panels are the SAME model at three scales — same silhouette, same
    // greebles, same three-quarter yaw, same specular hits — so a bay captioned
    // DREADNOUGHT held a scaled-up scout. It was also cropped, because a 2.99
    // sheet was shown in a 4.3 box under object-fit:cover, which threw away 30%
    // of every hull's height and clipped the capital ship's stern at the frame.
    //
    // The individually painted 512px hulls in the same library folder are
    // genuinely distinct designs — the Mechanicus frigate is a knife, its work
    // vessel is a barge and its dreadnought is a slab with gun decks — so each
    // bay now mounts its own hull, at its own name, uncropped horizontally in a
    // 4:3 aperture that takes its overscan off the top and bottom of a square
    // painting whose ship sits in the middle third.
    //
    // The three images together carry one alt naming the three designs; the
    // per-bay captions repeat those names visually and are hidden from the
    // accessibility tree so the module is announced exactly once. Nothing here
    // claims a stat: these are the names of the shipped designs and no more.
    // ------------------------------------------------------------------
    function fleetProfile(race) {
        const ident = identity(Number(race.id));
        const hulls = (Array.isArray(ident.hulls) ? ident.hulls : []).filter(h => h && h.src);
        if (hulls.length !== 3) {
            return '';
        }
        const alt = `${race.name} hull designs, left to right: ${hulls.map(h => h.name).join(', ')}`;
        // THE NAME IS NOT SET ON THE SHIP. It used to be: three captions laid
        // over the paintings on a scrim, and on the dreadnought — the widest
        // hull in every set — the glyph stems landed on deck plating in both
        // states. Each bay is now a machined port with its OWN label rail
        // beneath it, treated like the meter code row: mono, near-black seat,
        // nothing overlapping the art.
        const bays = hulls.map((hull, index) => {
            // One alt on the first image carries all three designs; the other two
            // are decorative, so a screen reader hears the module once.
            const altText = index === 0 ? esc(alt) : '';
            return '<span class="race-fleet-bay">'
                 + '<span class="race-fleet-port">'
                 + `<img class="race-fleet-art" src="${esc(hull.src)}" alt="${altText}"`
                 + ' width="160" height="160" decoding="async" draggable="false">'
                 + '</span>'
                 + `<b>${esc(hull.name)}</b></span>`;
        }).join('');
        return `
            <div class="race-detail-fleet">
                <div class="race-detail-instrument-bar">
                    <span>Fleet profile</span>
                    <small>hull designs on record</small>
                </div>
                <div class="race-fleet-frame" style="--hull-gain:${mounting(race.id).hullGain || 1}">${bays}</div>
            </div>
        `;
    }

    // The one read that replaces seven repeated ×1.00 captions in the plot. It
    // has to say what the notches mean AND why that is worth something, using a
    // fact the registry can prove. It is stated ONCE — promoted into the plot's
    // own readout rail, where the seven redundant figures used to sit — so the
    // strip below drops its finding rather than printing this twice.
    function baselineFinding() {
        const clean = unpenalisedCount();
        return clean === 1
            ? 'All seven channels at standard &middot; the only doctrine in the registry with no penalty'
            : `All seven channels at standard &middot; one of ${clean} doctrines with no penalty`;
    }

    // Full-width row under the plot: the tally, then the finding in words. This
    // used to float in the empty half of the plot well aligned to nothing.
    function deviationStrip(race) {
        const s = deviationSummary(race);
        const finding = s.peak
            ? `Widest swing &middot; ${esc(s.peak.channel.label)} ${multiplierText(s.peak.r.raw)}`
            : '';
        return `
            <div class="race-detail-summary">
                <span data-tone="up"><i></i>${plural(s.up, 'advantage', 'advantages')}</span>
                <span data-tone="down"><i></i>${plural(s.down, 'penalty', 'penalties')}</span>
                <span data-tone="flat"><i></i>${s.flat} at baseline</span>
                ${finding ? `<small>${finding}</small>` : ''}
            </div>
        `;
    }

    // Per-hull modifiers the engine applies on top of the doctrine multipliers.
    // Real data (races.applyShipModifiers), so the panel that fills the bottom
    // of the bay carries content rather than a watermark.
    function hullCalibration(race) {
        const mods = race.unitModifiers && typeof race.unitModifiers === 'object' ? race.unitModifiers : {};
        const keys = HULL_ORDER.filter(key => mods[key] && Object.keys(mods[key]).length)
            .concat(Object.keys(mods).filter(key => HULL_ORDER.indexOf(key) === -1 && mods[key] && Object.keys(mods[key]).length));

        const rows = keys.map(key => {
            const readings = Object.keys(mods[key])
                .filter(field => MOD_META[field] && typeof mods[key][field] === 'number')
                .map(field => {
                    const meta = MOD_META[field];
                    const value = mods[key][field];
                    if (meta.kind === 'score') {
                        // Additive concealment score, not a multiplier — never printed with ×.
                        return `<span class="race-hull-read" data-tone="up"><i>${meta.code}</i>+${Math.round(value * 100)}%</span>`;
                    }
                    const gain = meta.inverse ? value < 1 : value > 1;
                    const flat = Math.abs(value - 1) < 0.0001;
                    const tone = flat ? 'flat' : gain ? 'up' : 'down';
                    return `<span class="race-hull-read" data-tone="${tone}"><i>${meta.code}</i>${multiplierText(value)}</span>`;
                }).join('');
            if (!readings) return '';
            // A leader channel between the hull name and its right-aligned chip
            // pair. Without it a calibration row was a 35% label and 65% of empty
            // field — the row was bounded on the left and nowhere else, twice
            // over on the Mechanicus dossier.
            return `<div class="race-hull-row"><span class="race-hull-name">${esc(HULL_NAMES[key] || key)}</span>`
                 + '<span class="race-hull-lead" aria-hidden="true"></span>'
                 + `<span class="race-hull-reads">${readings}</span></div>`;
        }).filter(Boolean).join('');

        return rows;
    }

    // ------------------------------------------------------------------
    // Restrictions and per-hull calibration.
    //
    // These used to be two full-width instrument boxes ALWAYS, and on the
    // default faction — the first thing anyone sees — one held a single chip and
    // the other held a single sentence. Two framed boxes to say "nothing to
    // report" twice.
    //
    // Now the shape follows the data. A faction that seals nothing gets a
    // stamped plate instead of a box; a faction that also calibrates no hull
    // gets ONE plate that says both. Only a faction with something to declare
    // gets a framed instrument, and then it is full.
    // ------------------------------------------------------------------
    function accessModules(race) {
        const chips = doctrineChips(race);
        const restrictions = restrictionCount(race);
        const rows = hullCalibration(race);
        const d = race.doctrine || {};
        const sealed = (d.lockedBranches || []).length;
        const capped = (d.cappedBranches || []).length;
        const denied = (d.lockedShips || []).length;

        if (!restrictions) {
            // One line, and it has to STAY one line: the plate is ~430px of mono
            // at 11px and a wrap turns a stamp into a paragraph.
            const plate = '<div class="race-detail-clear"><i aria-hidden="true"></i>'
                        + '<b>Restrictions &middot; none on record</b>'
                        + (rows ? '' : '<em>All hulls standard</em>')
                        + '</div>';
            return plate + (rows ? hullBox(rows) : '');
        }

        const tally = `<span class="race-chip race-chip-meta"><i>TALLY</i>${sealed} sealed &middot; ${capped} capped &middot; ${denied} denied</span>`;
        const chipMarkup = chips
            .map(chip => `<span class="race-chip" data-kind="${chip.kind}"><i>${chip.tag}</i>${esc(chip.text)}</span>`)
            .join('') + tally;
        return `
            <div class="race-detail-doctrine">
                <div class="race-detail-instrument-bar">
                    <span>Tech &amp; hull access</span>
                    <small>${plural(restrictions, 'restriction', 'restrictions')}</small>
                </div>
                <div class="race-chips">${chipMarkup}</div>
            </div>
        ` + (rows ? hullBox(rows) : '');
    }

    function hullBox(rows) {
        return `
            <div class="race-detail-hulls">
                <div class="race-detail-instrument-bar">
                    <span>Hull calibration</span>
                    <small>applied on top of doctrine</small>
                </div>
                <div class="race-hull-list">${rows}</div>
            </div>
        `;
    }

    // The clearance gate, set INSIDE the hero's identity lockup — under the
    // faction's own name, beside its medallion — rather than as its own slab
    // below the plate. Two reasons, and the second is the important one:
    //
    //   1. it costs the bay NOTHING. The hero foot's height is set by the 132px
    //      medallion in its left column, and the kicker + name + tagline stack
    //      beside it only fills ~55px of that, so the gate drops into slack that
    //      was already paid for. As a sibling under the hero it cost 47px on a
    //      service gate and 89px on a requisition one, on a column that was
    //      already overflowing the bay by up to 194px;
    //   2. the price of a faction belongs beside the faction, not in a separate
    //      warning box underneath it. Crest, name, what it is, what it costs —
    //      that is one thought, and reading it as one thought is what makes a
    //      sealed faction aspirational instead of blocked.
    function heroGate(race) {
        const premium = race.unlockType === 'premium';
        const amount = race.unlockRequirement && race.unlockRequirement.amount;
        return `
            <span class="race-hero-gate" data-gate="${gateKind(race)}">
                <i class="race-hero-gate-flag">${lockGlyph()}</i>
                <span class="race-hero-gate-body">
                    <b>${esc(unlockChannel(race))}</b>
                    <em>${esc(unlockObjective(race))}</em>
                </span>
                ${premium ? `<button type="button" class="race-purchase-btn">Unlock $${esc(amount)}</button>` : ''}
            </span>
        `;
    }

    function confirmSelection() {
        if (!selectedRace) {
            return;
        }

        detachParallax();
        if (modalRef) {
            modalRef.remove();
            modalRef = null;
        }

        if (onSelectCallback) {
            onSelectCallback(selectedRace);
            onSelectCallback = null;
        }
    }

    function purchaseRace(raceId) {
        const race = unlockedRaces.find(r => r.id === raceId);
        if (!race || race.unlockType !== 'premium') return;

        window.location.href = `/purchase-race.html?race=${encodeURIComponent(raceId)}`;
    }

    // Handle server response with unlocked races
    function handleUnlockedRaces(data) {
        if (typeof onSelectCallback !== 'function') {
            return;
        }
        try {
            const races = JSON.parse(data);
            showRaceSelection(races);
        } catch (e) {
            console.error('Error parsing race data:', e);
        }
    }

    return {
        initialize,
        handleUnlockedRaces,
        purchaseRace
    };
})();

// Make purchaseRace globally accessible for onclick
window.RaceSelection = RaceSelection;

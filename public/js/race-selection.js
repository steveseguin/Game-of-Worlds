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

    // TWO POINTERS, NOT ONE, AND THEY MEAN DIFFERENT THINGS.
    //
    //   selectedRace   what the player is COMMITTING TO. Only ever an
    //                  authorized faction, and nothing but choosing another
    //                  authorized faction may change it.
    //   inspectedRace  what the dossier, the backdrop and the gutter signage
    //                  are SHOWING. Any faction, locked or not.
    //
    // They used to be the same variable, and the cost of that was the worst
    // defect on this screen: pick the Terran Empire, click Titan Lords to read
    // what a paid faction offers, and the choice you had already made was gone —
    // .active dropped, aria-checked flipped to false on all twelve, the SELECTED
    // badge went to display:none, the radiogroup was left with no checked radio
    // for a screen reader to land on, and the confirm plate went disabled
    // reading "FACTION LOCKED". Nothing announced the loss. Escape then pulsed a
    // dead button. Recovering meant noticing, and then re-finding your faction
    // in a twelve-card grid, on the highest-stakes screen in the game.
    //
    // Looking at a faction is not choosing it. The two are separated here.
    let selectedRace = null;
    let inspectedRace = null;
    let unlockedRaces = [];
    let onSelectCallback = null;
    let detailPane = null;
    let confirmButton = null;
    let modalRef = null;
    let preferredRaceId = null;
    let parallaxHandler = null;
    let resizeHandler = null;

    const STYLE_ID = 'race-selection-styles';
    // KEEP THIS IN STEP WITH THE <link> IN lobby.html. When the two disagree,
    // ensureStyles() re-points the host page's tag and the browser fetches the
    // WHOLE 120 KB sheet a SECOND time — measured on the audit before this pass:
    // race-selection.css appeared twice in the resource list at 120 KB each, 7%
    // of the screen's entire 1754 KB, spent on bytes the page already had.
    const STYLE_HREF = 'css/race-selection.css?v=20260728r10';
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
    // THE 1x DERIVATIVES — the same paintings, at the same pixel dimensions,
    // for a twentieth of the bytes.
    //
    // Measured before this pass: the console pulled 1694 KB, and 1015 KB of it
    // was art — twelve 256x193 crest PNGs at 56-78 KB each (805 KB) plus a
    // 960x540 homeworld PNG at 159-247 KB. The PNGs are unoptimised RGBA
    // exports, so that weight buys nothing: re-encoding the IDENTICAL raster as
    // WebP q92 takes the twelve crests from 805 KB to 89 KB and the twelve
    // homeworlds from 2323 KB to 206 KB, with no resampling anywhere.
    //
    // The homeworld number is the one that matters most and it is invisible in
    // a single-frame measurement: the void backdrop and the dossier hero both
    // swap to the INSPECTED faction's world, so a player arrowing across the
    // roster to compare twelve factions used to pull 2.3 MB of backdrops doing
    // it. That is now 206 KB.
    //
    // Both are mounted as `srcset: webp 1x, png 2x`, so a 2x display still gets
    // the full-fat original and nothing regresses on a retina panel; `src`
    // stays the PNG, which is both the no-srcset fallback and the reason the
    // originals remain referenced assets rather than orphans.
    //
    // Written out in full, like every other asset name in this module, because
    // tools/publish-art.js --audit proves each shipped byte is referenced by
    // scanning sources for the LITERAL filename — an assembled path reads as an
    // orphan and gets deleted from the web root.
    // ---------------------------------------------------------------------
    const CREST_1X = {
        1:  'images/ui/crests-256-01-terran.webp',
        2:  'images/ui/crests-256-02-silicon.webp',
        3:  'images/ui/crests-256-03-zephyr.webp',
        4:  'images/ui/crests-256-04-crystalline.webp',
        5:  'images/ui/crests-256-05-void-walkers.webp',
        6:  'images/ui/crests-256-06-mechanicus.webp',
        7:  'images/ui/crests-256-07-bioform.webp',
        8:  'images/ui/crests-256-08-star-nomads.webp',
        9:  'images/ui/crests-256-09-ancients.webp',
        10: 'images/ui/crests-256-10-quantum.webp',
        11: 'images/ui/crests-256-11-titan-lords.webp',
        12: 'images/ui/crests-256-12-shadow-realm.webp'
    };
    const WORLD_1X = {
        1:  'images/ui/homeworlds-01-terra-960.webp',
        2:  'images/ui/homeworlds-02-sill-960.webp',
        3:  'images/ui/homeworlds-03-churn-960.webp',
        4:  'images/ui/homeworlds-04-sarns-world-960.webp',
        5:  'images/ui/homeworlds-05-bell-960.webp',
        6:  'images/ui/homeworlds-06-works-960.webp',
        7:  'images/ui/homeworlds-07-ossas-delta-960.webp',
        8:  'images/ui/homeworlds-08-kettering-960.webp',
        9:  'images/ui/homeworlds-09-ancient-installation-960.webp',
        10: 'images/ui/homeworlds-10-osks-flux-960.webp',
        11: 'images/ui/homeworlds-11-ordel-deep-960.webp',
        12: 'images/ui/homeworlds-12-sables-dark-960.webp'
    };

    // The thirty-six hull paintings get the same treatment, and on this screen
    // they are the heaviest thing a player can spend: three of them are mounted
    // in every dossier, so INSPECTING ALL TWELVE FACTIONS — which is the entire
    // purpose of the roster — pulled 1.2 MB of ship art. The 1x derivatives are
    // 99 KB for the whole set.
    const HULL_1X = {
        'images/ui/fleets-01-terran-colony-ship-512.png': 'images/ui/fleets-01-terran-colony-ship-256.webp',
        'images/ui/fleets-01-terran-dreadnought-512.png': 'images/ui/fleets-01-terran-dreadnought-256.webp',
        'images/ui/fleets-01-terran-scout-512.png': 'images/ui/fleets-01-terran-scout-256.webp',
        'images/ui/fleets-02-silicon-carrier-battleship-512.png': 'images/ui/fleets-02-silicon-carrier-battleship-256.webp',
        'images/ui/fleets-02-silicon-colony-processor-512.png': 'images/ui/fleets-02-silicon-colony-processor-256.webp',
        'images/ui/fleets-02-silicon-scout-512.png': 'images/ui/fleets-02-silicon-scout-256.webp',
        'images/ui/fleets-03-zephyr-colony-migration-512.png': 'images/ui/fleets-03-zephyr-colony-migration-256.webp',
        'images/ui/fleets-03-zephyr-cruiser-mass-512.png': 'images/ui/fleets-03-zephyr-cruiser-mass-256.webp',
        'images/ui/fleets-03-zephyr-frigate-swarm-512.png': 'images/ui/fleets-03-zephyr-frigate-swarm-256.webp',
        'images/ui/fleets-04-crystalline-colony-lattice-512.png': 'images/ui/fleets-04-crystalline-colony-lattice-256.webp',
        'images/ui/fleets-04-crystalline-dreadnought-512.png': 'images/ui/fleets-04-crystalline-dreadnought-256.webp',
        'images/ui/fleets-04-crystalline-scout-shard-512.png': 'images/ui/fleets-04-crystalline-scout-shard-256.webp',
        'images/ui/fleets-05-void-walkers-carrier-512.png': 'images/ui/fleets-05-void-walkers-carrier-256.webp',
        'images/ui/fleets-05-void-walkers-colony-route-holder-512.png': 'images/ui/fleets-05-void-walkers-colony-route-holder-256.webp',
        'images/ui/fleets-05-void-walkers-courier-scout-512.png': 'images/ui/fleets-05-void-walkers-courier-scout-256.webp',
        'images/ui/fleets-06-mechanicus-colony-work-vessel-512.png': 'images/ui/fleets-06-mechanicus-colony-work-vessel-256.webp',
        'images/ui/fleets-06-mechanicus-dreadnought-512.png': 'images/ui/fleets-06-mechanicus-dreadnought-256.webp',
        'images/ui/fleets-06-mechanicus-frigate-512.png': 'images/ui/fleets-06-mechanicus-frigate-256.webp',
        'images/ui/fleets-07-bioform-colony-seed-vessel-512.png': 'images/ui/fleets-07-bioform-colony-seed-vessel-256.webp',
        'images/ui/fleets-07-bioform-dreadnought-organism-512.png': 'images/ui/fleets-07-bioform-dreadnought-organism-256.webp',
        'images/ui/fleets-07-bioform-scout-organism-512.png': 'images/ui/fleets-07-bioform-scout-organism-256.webp',
        'images/ui/fleets-08-star-nomads-colony-caravan-512.png': 'images/ui/fleets-08-star-nomads-colony-caravan-256.webp',
        'images/ui/fleets-08-star-nomads-dreadnought-512.png': 'images/ui/fleets-08-star-nomads-dreadnought-256.webp',
        'images/ui/fleets-08-star-nomads-trace-scout-512.png': 'images/ui/fleets-08-star-nomads-trace-scout-256.webp',
        'images/ui/fleets-09-ancients-colony-vessel-512.png': 'images/ui/fleets-09-ancients-colony-vessel-256.webp',
        'images/ui/fleets-09-ancients-dreadnought-512.png': 'images/ui/fleets-09-ancients-dreadnought-256.webp',
        'images/ui/fleets-09-ancients-scout-instrument-512.png': 'images/ui/fleets-09-ancients-scout-instrument-256.webp',
        'images/ui/fleets-10-quantum-carrier-battleship-512.png': 'images/ui/fleets-10-quantum-carrier-battleship-256.webp',
        'images/ui/fleets-10-quantum-colony-anchor-512.png': 'images/ui/fleets-10-quantum-colony-anchor-256.webp',
        'images/ui/fleets-10-quantum-phase-scout-512.png': 'images/ui/fleets-10-quantum-phase-scout-256.webp',
        'images/ui/fleets-11-titan-lords-colony-ship-512.png': 'images/ui/fleets-11-titan-lords-colony-ship-256.webp',
        'images/ui/fleets-11-titan-lords-cruiser-512.png': 'images/ui/fleets-11-titan-lords-cruiser-256.webp',
        'images/ui/fleets-11-titan-lords-dreadnought-512.png': 'images/ui/fleets-11-titan-lords-dreadnought-256.webp',
        'images/ui/fleets-12-shadow-realm-colony-vessel-512.png': 'images/ui/fleets-12-shadow-realm-colony-vessel-256.webp',
        'images/ui/fleets-12-shadow-realm-intruder-battleship-512.png': 'images/ui/fleets-12-shadow-realm-intruder-battleship-256.webp',
        'images/ui/fleets-12-shadow-realm-stealth-scout-512.png': 'images/ui/fleets-12-shadow-realm-stealth-scout-256.webp'
    };

    // `src` + `srcset` for one painting. Returns the attribute pair as text so
    // the markup builders stay one-liners, and sets both when an <img> is
    // re-pointed at a different faction (setting src alone would leave the
    // previous faction's srcset winning, which is how a "swap the backdrop"
    // bug looks: the picture never changes on a 1x display).
    function artAttrs(full, lite) {
        if (!full) return '';
        return ` src="${esc(full)}"` + (lite ? ` srcset="${esc(lite)} 1x, ${esc(full)} 2x"` : '');
    }
    function setArt(img, full, lite) {
        if (!img || !full) return;
        img.setAttribute('src', full);
        if (lite) img.setAttribute('srcset', `${lite} 1x, ${full} 2x`);
        else img.removeAttribute('srcset');
    }

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

    function crestLite(raceId) { return CREST_1X[Number(raceId)] || ''; }
    function worldLite(raceId) { return WORLD_1X[Number(raceId)] || ''; }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    // =====================================================================
    // THE SURFACE TILES ARE NOT GENERATED HERE ANY MORE. THEY ARE NOT
    // GENERATED AT ALL.
    //
    // 280 lines used to live at this point: a seeded noise field convolved
    // per row for the brushed-steel plate, two seeded starfields with three
    // brightness classes and real blooms for the void, an idle scheduler to
    // spread them out, and an encoder to turn each canvas into a URL a
    // stylesheet could use.
    //
    // The drawing was 2 ms. The ENCODING — canvas.toDataURL(), which
    // compresses a PNG synchronously on the main thread — measured 2357 ms
    // across the three tiles on the real page, 99.7% of all canvas time on
    // the open, and it is what made this console freeze for two seconds while
    // a player waited to choose a faction. canvas.toBlob() did not help and
    // neither did requestIdleCallback: the cost is not the codec, it is the
    // codec queuing behind twelve crest decodes and the software raster of a
    // thousand new nodes, so every slot this work could be moved to was a slot
    // where it was still expensive.
    //
    // The drawing was already deterministic — same seed, same pixels, every
    // run — which means it never needed to happen at runtime at all. The
    // identical rasters are baked into race-selection.css as three inlined
    // lossless WebP tiles, 25 KB for the set, with the full recipe written out
    // beside them so they can be regenerated. The console now draws its texture
    // on the first frame instead of two seconds in, and this module touches no
    // canvas at all.
    // =====================================================================

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
                ? `<img class="race-port-art"${artAttrs(ident.crest, crestLite(id))} alt=""`
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
        // The legend resolves its own abbreviations on hover. The row itself is
        // aria-hidden — the rail's role="img" label already names all seven
        // channels in words for a screen reader — so `title` here is for the
        // sighted player who cannot tell CST from "construction".
        const codes = CHANNELS.map(channel =>
            `<span title="${esc(channel.label)}">${channel.code}</span>`).join('');
        // The chart's label carries the RANKS as well as the readings. A bar's
        // length is the one thing a screen reader can never be handed, and the
        // ranks are the part a sighted player cannot get from a card either —
        // they are the comparison the roster is for.
        return '<span class="race-meters">'
            + `<span class="race-meter-well" role="img" aria-label="${esc(rackLabel(race, true))}">`
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

    // ---------------------------------------------------------------------
    // THE CARD'S TRADE-OFF READOUT — a PAIR, never a single figure.
    //
    // This replaces a chip that carried whichever channel deviated most in
    // EITHER direction and distinguished a strength from a weakness by INK
    // COLOUR ALONE. On the round-1 capture the roster printed "DEF ×1.40" on
    // Mechanicus and "MET ×0.80" on the Bioform Collective in the same corner of
    // the card, at the same size, in the same face — one an advantage, one a
    // permanent penalty — and the only thing separating them was bronze versus
    // oxide. A player with a red/green or a low-contrast deficit read twelve
    // identical badges. It was also the worst possible summary of a faction:
    // seven of the twelve cards led with their WEAKNESS and never showed what
    // they were good at.
    //
    // Every card now prints BOTH poles, stacked, at equal size and weight:
    //
    //   ▲ RSC ×1.30     what this doctrine is best at
    //   ▼ CST ×1.20     what it gives up, permanently, for that
    //
    // Three redundant encodings, so no single one is load-bearing: the ARROW
    // (shape), the ROW (up chip always above down chip), and the colour. The
    // restriction is the part a new player regrets ignoring, so it is the same
    // size as the bonus and it is never omitted — a doctrine with no penalty
    // says so in words rather than leaving the slot blank, which reads as
    // missing data rather than as good news.
    // ---------------------------------------------------------------------
    function poles(race) {
        const rows = CHANNELS.map(channel => ({ channel, r: reading(race, channel) })).filter(row => row.r);
        const strongest = tone => rows
            .filter(row => row.r.tone === tone)
            .reduce((best, row) => (!best || row.r.k > best.r.k ? row : best), null);
        return { reported: rows.length, up: strongest('up'), down: strongest('down') };
    }

    // One pole as { tone, code, text }. `text` is always the RAW multiplier the
    // engine applies (see readoutText) so the chip and the dossier quote the
    // same number.
    function poleChips(race) {
        const p = poles(race);
        if (!p.reported) {
            return [{ tone: 'flat', code: '', text: 'no data' }];
        }
        if (!p.up && !p.down) {
            return [{ tone: 'flat', code: '', text: 'all ×1.00' }];
        }
        const chips = [];
        chips.push(p.up
            ? { tone: 'up', code: p.up.channel.code, text: readoutText(p.up.channel, p.up.r) }
            : { tone: 'none-up', code: '', text: 'no bonus' });
        chips.push(p.down
            ? { tone: 'down', code: p.down.channel.code, text: readoutText(p.down.channel, p.down.r) }
            : { tone: 'none-down', code: '', text: 'no penalty' });
        return chips;
    }

    // The arrow is a CSS triangle rather than a glyph: Russo One, Rajdhani and
    // Share Tech Mono between them do not carry ▲/▼, and a fallback face
    // substituting for two characters on twelve cards is exactly the kind of
    // mismatched-metric detail this console is trying not to have.
    function poleStrip(race) {
        const chips = poleChips(race).map(chip =>
            `<span class="race-card-pole" data-tone="${chip.tone}">`
          + '<i aria-hidden="true"></i>'
          + (chip.code ? `<b>${esc(chip.code)}</b>` : '')
          + `<em>${esc(chip.text)}</em></span>`
        ).join('');
        return `<span class="race-card-poles" aria-hidden="true">${chips}</span>`;
    }

    // The same pair as one sentence, for the card's accessible name. Screen
    // readers get the words the arrows stand for, not the arrows.
    function poleSentence(race) {
        const p = poles(race);
        if (!p.reported) return 'No doctrine readings on record.';
        if (!p.up && !p.down) return 'Every channel at the ×1.00 baseline; no bonus and no penalty.';
        const best = p.up
            ? `Best ${p.up.channel.label} ${readoutText(p.up.channel, p.up.r)}`
            : 'No channel above baseline';
        const worst = p.down
            ? `worst ${p.down.channel.label} ${readoutText(p.down.channel, p.down.r)}`
            : 'no channel below baseline';
        return `${best}; ${worst}.`;
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

    // =====================================================================
    // OPENING THE CONSOLE — before the data, not after it.
    //
    // This module used to build its dialog INSIDE showRaceSelection(), which is
    // only ever called from handleUnlockedRaces(). Three consequences, and all
    // three were felt by a player rather than by a linter:
    //
    //   1. NOTHING HAPPENED FOR A SECOND AND A HALF — 1858 ms at 1366x768 from
    //      the click on Create Game to the console being on screen, with long
    //      tasks of 1135/73/167 ms inside it and the lobby just sitting there.
    //      A wait with no loading state does not read as "loading", it reads as
    //      "the game hung".
    //   2. A DROPPED REQUEST WAS A DEAD END. loadUnlockedRaces() sent its
    //      command only if the socket happened to be OPEN and returned silently
    //      otherwise. Click Create Game while the socket is reconnecting and the
    //      player was never asked to pick a race AT ALL: no console, no error,
    //      no retry, and the lobby cannot reopen it because it is still waiting
    //      for the selection that will never come.
    //   3. A MALFORMED PAYLOAD DID THE SAME THING — console.error and a blank
    //      lobby.
    //
    // So the console opens FIRST, in a loading state, and the registry fills it
    // in when it arrives. Every branch after that ends somewhere a player can
    // act: the roster, an empty state, or an error with a Retry button.
    // =====================================================================
    const REGISTRY_TIMEOUT_MS = 6000;
    const SOCKET_POLL_MS = 250;
    let registryTimer = null;
    let socketPoll = null;
    let registryState = 'idle';   // idle | loading | ready | error
    let rosterSignature = '';

    function clearRegistryTimers() {
        if (registryTimer) { window.clearTimeout(registryTimer); registryTimer = null; }
        if (socketPoll) { window.clearInterval(socketPoll); socketPoll = null; }
        // A dossier scheduled behind a settle timer must not survive the console
        // it was scheduled against — see scheduleDossier.
        cancelDossier();
    }

    function initialize(callback, activeRaceId) {
        onSelectCallback = callback;
        preferredRaceId = Number(activeRaceId) || null;
        // Paint the console on this task. Everything expensive is deferred (see
        // buildConsole / paintRoster), so this is the frame the player gets.
        showRaceSelection(null);
        loadUnlockedRaces();
    }

    function loadUnlockedRaces() {
        clearRegistryTimers();
        registryState = 'loading';
        setBusy(true);
        const socketReady = () => window.websocket && window.websocket.readyState === WebSocket.OPEN;
        const send = () => {
            try {
                window.websocket.send('//getunlockedraces');
                return true;
            } catch (err) {
                return false;
            }
        };
        // QUEUE, don't drop. A socket that is still handshaking becomes OPEN a
        // few hundred ms later on a normal connection, and the old code threw
        // the request away at exactly the moment it was most likely to be
        // mid-handshake — right after a page-load-and-create-a-game sequence.
        if (!socketReady() || !send()) {
            socketPoll = window.setInterval(() => {
                if (socketReady() && send()) {
                    window.clearInterval(socketPoll);
                    socketPoll = null;
                }
            }, SOCKET_POLL_MS);
        }
        // And a deadline, because a queued request that is never answered is
        // the same dead end as a dropped one.
        registryTimer = window.setTimeout(() => {
            if (registryState === 'loading') {
                renderRegistryError('The faction registry did not answer in time.');
            }
        }, REGISTRY_TIMEOUT_MS);
    }

    // aria-busy is the machine-readable half of a loading state; the skeleton
    // roster is the human half. Both go up and come down together.
    function setBusy(busy) {
        if (!modalRef) return;
        modalRef.setAttribute('aria-busy', busy ? 'true' : 'false');
        const shell = modalRef.querySelector('.race-grid-shell');
        if (shell) shell.classList.toggle('is-loading', !!busy);
    }

    // =====================================================================
    // THE COMPARATOR — the answer to "can I compare twelve factions without
    // clicking through all twelve".
    //
    // The header used to hold a static KEY: seven codes and the words they
    // stand for, printed once, doing nothing. It was the right information in
    // the wrong form. A player choosing a faction is not asking "what does RSC
    // mean", they are asking "who is the best at research, and what does that
    // cost me" — and the only way to answer that on the old screen was to open
    // twelve dossiers and hold twelve numbers in your head, because the ranks
    // (`4/12`) existed ONLY inside the selected faction's plot.
    //
    // The key is now a TOOLBAR. Arm a channel and the whole roster answers on
    // that channel at once:
    //
    //   * every card's rail lights the bay for that channel and knocks the
    //     other six back, so twelve seven-bay charts become twelve single
    //     readings that can be scanned down a column;
    //   * every card swaps its trade-off pair for that channel's own figure AND
    //     its registry rank — "×1.30  2/12" — so the ordering is printed, not
    //     inferred from bar lengths four cards apart;
    //   * the roster's own title bar names the leader and the trailer outright.
    //
    // It is a toolbar and not eight tab stops: one Tab reaches it, Left/Right
    // move along it, and the roster is the next stop. Eight extra stops in
    // front of the thing a player came here to use is not an accessibility win.
    // =====================================================================
    let compareIndex = -1;   // index into CHANNELS, or -1 for the overview

    // EVERY THREE-LETTER CODE ON THIS SCREEN RESOLVES SOMEWHERE.
    //
    // Three instruments are keyed to the same seven abbreviations — this
    // toolbar, the rail legend under every card, and the dossier plot's axis —
    // and below 1500px the toolbar used to drop its words, at which point
    // MET CRY RSC CST SPD ATK DEF appeared three times on the screen and was
    // expanded nowhere on it. A new player on a mainstream laptop could not
    // work out whether CST was cost or construction, or whether a longer SPD
    // bar was good, on the one screen where the answer is permanent.
    //
    // The words stay visible now (the sheet reclaims the space from the
    // decorative rail beside them instead), and each key ALSO carries the full
    // channel name as its accessible name and its tooltip — so the code
    // resolves on hover, under a screen reader, and in print, not just when the
    // viewport is wide enough.
    function compareBar() {
        const cell = (index, code, word, name, pressed) =>
            `<button type="button" class="rs-chan" data-chan="${index}"`
          + ` aria-pressed="${pressed ? 'true' : 'false'}" tabindex="${pressed ? '0' : '-1'}"`
          + ` title="${esc(name)}" aria-label="${esc(name)}">`
          + `<b>${esc(code)}</b><em>${esc(word)}</em></button>`;
        return cell(-1, 'ALL', 'overview', 'All channels — overview', true)
            + CHANNELS.map((channel, index) =>
                cell(index, channel.code, channel.short,
                    `${channel.label} — compare all factions`, false)).join('');
    }

    // What the roster's title bar says while a channel is armed. Naming the
    // leader is the whole point: a rank is only meaningful next to the name of
    // whoever holds first place.
    function compareCaption() {
        if (compareIndex < 0) {
            return 'up is advantage &middot; rails &times;0.50 / &times;2.00';
        }
        const channel = CHANNELS[compareIndex];
        const rows = unlockedRaces
            .map(race => ({ race, r: reading(race, channel) }))
            .filter(row => row.r);
        if (!rows.length) {
            return `${esc(channel.label)} &middot; not reported`;
        }
        const best = rows.reduce((a, b) => (b.r.benefit > a.r.benefit ? b : a));
        const worst = rows.reduce((a, b) => (b.r.benefit < a.r.benefit ? b : a));
        const one = row => `${esc(row.race.name)} ${esc(readoutText(channel, row.r))}`;
        return best === worst
            ? `${esc(channel.label)} &middot; every faction at ${esc(readoutText(channel, best.r))}`
            : `${esc(channel.label)} &middot; best ${one(best)} &middot; worst ${one(worst)}`;
    }

    // The seven per-channel readouts a card carries for the comparator. All
    // seven are rendered once, at card build, and CSS shows the armed one — so
    // arming a channel is a class flip on ONE element (the grid) rather than
    // twelve DOM rewrites, and the roster cannot drop a frame doing it.
    function compareReadouts(race) {
        const cells = CHANNELS.map((channel, index) => {
            const r = reading(race, channel);
            const s = standing(race, channel);
            const tone = r ? r.tone : 'flat';
            const rank = s ? `${s.rank}/${s.of}` : '--';
            return `<span data-chan="${index}" data-tone="${tone}"${s && s.rank === 1 ? ' data-lead="1"' : ''}>`
                 + `<b>${esc(readoutText(channel, r))}</b><i>${esc(rank)}</i></span>`;
        }).join('');
        return `<span class="race-card-compare" aria-hidden="true">${cells}</span>`;
    }

    function setCompareChannel(index, announce) {
        compareIndex = Number(index);
        if (!(compareIndex >= 0 && compareIndex < CHANNELS.length)) {
            compareIndex = -1;
        }
        if (!modalRef) {
            return;
        }
        const grid = modalRef.querySelector('.race-grid');
        if (grid) {
            if (compareIndex < 0) {
                grid.removeAttribute('data-compare');
            } else {
                grid.setAttribute('data-compare', String(compareIndex));
            }
        }
        modalRef.querySelectorAll('.rs-chan').forEach(button => {
            const on = Number(button.dataset.chan) === compareIndex;
            button.setAttribute('aria-pressed', on ? 'true' : 'false');
            button.tabIndex = on ? 0 : -1;
        });
        const caption = modalRef.querySelector('.race-grid-heading small');
        if (caption) {
            caption.innerHTML = compareCaption();
        }
        // A control that changes twelve other things has to say what it did.
        if (announce) {
            const status = modalRef.querySelector('.race-compare-status');
            if (status) {
                status.textContent = compareIndex < 0
                    ? 'Comparator off. Every card shows its own strongest and weakest channel.'
                    : `Comparing ${CHANNELS[compareIndex].label} across all ${unlockedRaces.length} factions. `
                      + `${compareCaption().replace(/&middot;/g, '·').replace(/&times;/g, '×')}`;
            }
        }
    }

    // Left/Right walk the toolbar, Home/End jump to its ends — the ARIA toolbar
    // pattern, so the whole comparator is one tab stop.
    function handleCompareKeys(event, buttons, button) {
        const last = buttons.length - 1;
        const at = buttons.indexOf(button);
        let next = -1;
        if (event.key === 'ArrowRight') next = at === last ? 0 : at + 1;
        else if (event.key === 'ArrowLeft') next = at === 0 ? last : at - 1;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = last;
        else return;
        event.preventDefault();
        buttons[next].focus();
        setCompareChannel(buttons[next].dataset.chan, true);
    }

    // Twelve empty machined bays, so the roster's geometry is on screen before
    // its content is. A skeleton is not decoration here: it is the difference
    // between "the registry is coming online" and "the game hung", and it also
    // reserves the exact space the cards will take, so nothing jumps when they
    // land.
    function skeletonRoster(count) {
        let out = '';
        for (let i = 0; i < count; i++) {
            out += '<span class="race-card-skeleton" aria-hidden="true">'
                 + '<span class="rsk-port"></span><span class="rsk-name"></span>'
                 + '<span class="rsk-rail"></span><span class="rsk-note"></span></span>';
        }
        return out;
    }

    function showRaceSelection(races) {
        const list = Array.isArray(races) ? races : null;
        // A re-open with data in hand (the normal path from handleUnlockedRaces)
        // fills the console that is already up rather than rebuilding it, so the
        // player never sees the frame flash.
        if (list && modalRef && document.body.contains(modalRef)) {
            paintRoster(list);
            return;
        }
        unlockedRaces = list || [];
        ensureStyles();
        ensureLockSprite();

        // Read the caller's focus BEFORE the old console is torn out from under
        // it: removing the focused node drops focus to <body>, and a re-open
        // (the retry path, a second registry payload) is focused on the console
        // it is about to replace. Read after, and the borrowed focus is <body>.
        const borrowed = document.activeElement;

        const existing = document.getElementById('raceSelectionModal');
        if (existing) {
            existing.remove();
        }
        detachParallax();
        // Release before re-sealing, or a second open captures its own seal as
        // the "previous" state and the lobby never comes back.
        releaseBackground();

        // The comparator opens disarmed on every visit: a channel armed in a
        // previous session is a filter a player did not set and cannot see the
        // origin of. The two selection pointers start clear for the same reason
        // — a stale pick from a previous open would put a SELECTED badge on a
        // card the player has not touched this time.
        compareIndex = -1;
        selectedRace = null;
        inspectedRace = null;

        // Borrow the caller's focus. sealBackground() sets `inert` on the lobby
        // and inert blurs whatever is inside it, so this can only be read before
        // the seal — and only a REAL control counts. <body> and the console that
        // was just removed are both "the active element" at moments like this
        // and neither is somewhere to hand a player back to, so they are dropped
        // here rather than stored and discovered to be useless at teardown.
        restoreFocusTo = isRestorable(borrowed) ? borrowed : null;

        const available = unlockedRaces.filter(race => race.unlocked).length;
        const total = unlockedRaces.length;

        const modal = document.createElement('div');
        modal.id = 'raceSelectionModal';
        // The header plate is a <div role="region">, not a <header>: axe flags
        // role=region on a <header> as a role the element does not permit, and
        // a <header> inside a dialog is a generic box anyway — it was carrying
        // no semantics to lose. The landmark is what matters, because while this
        // dialog is sealed the lobby's own landmarks are out of the tree and
        // every word in this console needs one of its own.
        //
        // A MODAL THAT IS ACTUALLY MODAL.
        // This console covers the viewport and blocks the flow behind it, but it
        // was a plain <div>: no dialog role, no name, and — the part a player
        // feels — nothing stopping Tab from walking straight out of it into the
        // lobby form underneath. Measured on the round-1 audit, 10 of the 23
        // focusable controls on this screen belonged to the page BEHIND it,
        // three of them with no focus ring at all, so a keyboard player's cursor
        // could vanish into a form they cannot see. A screen reader had it
        // worse: the lobby's banner, its headings and eighteen blocks of its
        // content were still in the tree, in front of the twelve factions.
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'rsTitle');
        modal.setAttribute('aria-describedby', 'rsIntro');
        modal.setAttribute('aria-busy', 'true');
        // THE THREE PROCEDURAL TILES ARE NOT ON THE CLICK PATH ANY MORE, and
        // they are not on any path: they were generated here, before the dialog
        // was appended, and they are now baked into the stylesheet. See the note
        // where the generator used to live.

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
            `<span class="race-void-world"><img${artAttrs(RACE_IDENTITY[1].world, WORLD_1X[1])} alt=""`
          + ' decoding="async" draggable="false"></span>'
          + '<span class="race-void-far"></span>'
          + '<span class="race-void-near"></span>'
          + '<span class="race-void-haze"></span>'
          // Gutter signage: a bolted plate carrying the selected faction's crest
          // in a machined aperture, with its registry designation stencilled
          // under it. It used to be the bare crest PNG masked into an ellipse
          // and screen-blended onto the starfield with nothing around it, which
          // photographed as a leaked render rather than as signage.
          + `<span class="race-void-mark"><img${artAttrs(RACE_IDENTITY[1].crest, CREST_1X[1])} alt=""`
          + ' decoding="async" draggable="false"><span>FAC-01</span></span>'
          + '<span class="race-void-tag"></span>'
          + '<span class="race-rail" data-side="l"></span>'
          + '<span class="race-rail" data-side="r"></span>';
        modal.appendChild(void_);

        const container = document.createElement('div');
        container.className = 'race-selection-container';
        // LANDMARKS, DELIBERATELY. While this dialog is up the page behind it is
        // sealed (see sealBackground), which means the lobby's own banner, main
        // and headings leave the accessibility tree — and every word inside this
        // console becomes content that has to sit in a landmark of its own or it
        // is announced as orphaned. Three, and no more: the header plate is a
        // named region, the roster is a named region, the dossier is the
        // complementary. The container itself is deliberately NOT a landmark, so
        // the dossier's <aside> stays top-level inside the dialog.
        //
        // The title is an <h1>, not the <h2> it used to be, for the same reason.
        // A modal that owns the whole viewport and inerts everything behind it
        // IS the page while it is open; leaving the document's only h1 in the
        // sealed lobby left this screen with no level-one heading at all.
        container.innerHTML = `
            <div class="race-selector-header" role="region" aria-label="Registry controls">
                <div class="race-selector-heading">
                    <div class="race-selector-eyebrow">Faction database // command authorization</div>
                    <h1 id="rsTitle" data-text="Select Your Race">Select Your Race</h1>
                    <p id="rsIntro">Choose an empire doctrine. Strengths are powerful; restrictions last the whole match.</p>
                </div>
                <div class="race-selector-rail" aria-hidden="true"><span class="race-selector-rail-tag">PNL-RS-01</span></div>
                <div class="race-selector-key">
                    <span class="race-selector-key-bar" id="rsCompareLabel">Compare channel</span>
                    <span class="race-selector-key-grid" role="toolbar"
                          aria-labelledby="rsCompareLabel" aria-controls="raceRoster">${compareBar()}</span>
                </div>
                <div class="race-selector-gauge">
                    <span class="race-selector-gauge-label">Authorized</span>
                    <span class="race-selector-gauge-read">${total
                        ? `<strong>${pad2(available)}</strong><i>/${pad2(total)}</i>`
                        : '<strong>--</strong><i>/--</i>'}</span>
                    <span class="race-selector-gauge-note">factions</span>
                </div>
            </div>
            <div class="race-selection-main">
                <section class="race-grid-shell is-loading" aria-labelledby="rsRosterHeading">
                    <div class="race-grid-heading">
                        <h2 id="rsRosterHeading">Faction roster</h2>
                        <small>up is advantage &middot; rails &times;0.50 / &times;2.00</small>
                    </div>
                    <!-- ALWAYS THE SKELETON HERE, even when the roster is
                         already in hand. This block is parsed, styled and laid
                         out in the SAME task that creates the dialog, so putting
                         twelve real cards in it fused the console's first paint
                         and the whole roster build into one long task. The bays
                         go up empty and paintRoster fills them a row per frame;
                         the skeleton is the card's own geometry, so nothing
                         moves when the factions land. -->
                    <div class="race-grid" id="raceRoster" role="radiogroup" aria-labelledby="rsRosterHeading">
                        ${skeletonRoster(unlockedRaces.length || 12)}
                    </div>
                    <!-- THE BAY'S FOOT IS THE ROSTER'S STATUS RAIL.
                         It was a stencilled panel code and a graduation channel,
                         which is correct furniture when all twelve factions are
                         on screen — and a lie when they are not, because it sat
                         flush against the clip line and made a sliced third row
                         read as a finished bottom edge. It now says which of the
                         two is true: the panel code when the roster fits, and
                         the count still below the fold, in words, when it does
                         not. The hidden-from-AT attribute is gone with it: a
                         count of unseen options is content, not decoration. -->
                    <div class="race-grid-foot">
                        <span class="race-grid-foot-code" aria-hidden="true">PNL-RS-02</span>
                        <span class="race-grid-foot-channel" aria-hidden="true"></span>
                        <span class="race-grid-foot-more" id="rsRosterMore" hidden></span>
                        <span class="race-grid-foot-code" aria-hidden="true">REG//12</span>
                    </div>
                </section>
                <aside class="race-detail-panel" aria-label="Faction dossier">
                    <!-- NO aria-live HERE, DELIBERATELY.
                         This region carries 599 characters (83 words) of dossier
                         for an authorized faction and 841 for a sealed one, and
                         it is replaced WHOLESALE on every selection change — so
                         with aria-live="polite" on it, walking the roster with
                         the arrow keys queued about 1,400 words of speech that
                         NVDA and JAWS append rather than replace, on top of the
                         card name the focus move already spoke, with no way to
                         skip past it. The card's hand-written accessible name is
                         the summary; the full dossier is reachable through the
                         scroll port markScrollState() gives this element; and
                         the one-line "what just changed" goes to the role=status
                         line at the foot of the dialog. -->
                    <div class="race-detail-content"></div>
                    <!-- THE DOSSIER GETS THE AFFORDANCE THE ROSTER ALREADY HAD.
                         Measured at 1366x768 — the most common PC gaming
                         resolution there is — .race-detail-content ran
                         scrollHeight 737 against clientHeight 559: 178px below
                         an invisible fold, and the blocks that fell entirely
                         under it were TECH & HULL ACCESS and HULL CALIBRATION.
                         A screen whose own subtitle reads "restrictions last the
                         whole match" was hiding the restrictions, with a 0px
                         platform overlay scrollbar and nothing else to say they
                         existed — while the roster panel two inches to the left
                         printed "4 MORE BELOW ▼". Same rail, same words, same
                         count, and it NAMES the restrictions when they are the
                         thing below the cut. -->
                    <div class="race-detail-foot">
                        <span class="race-detail-foot-code" aria-hidden="true">DOS-RS-03</span>
                        <span class="race-detail-foot-channel" aria-hidden="true"></span>
                        <span class="race-detail-foot-more" id="rsDossierMore" hidden></span>
                    </div>
                    <!-- THE CONFIRM RAIL TELLS THE TRUTH NOW.
                         It used to read "Selection locks when you confirm". It
                         does not: lobby.js keeps a "Choose / Change" control in
                         the waiting view that reopens this console and sends
                         //changerace, and it reopens PRE-SELECTED on whatever you
                         picked. So the screen was talking a player out of
                         experimenting with a consequence that does not exist,
                         under the one heading — commitment — where being wrong
                         costs the most. The line now states what is actually
                         true and WHEN it stops being true. -->
                    <div class="race-confirm-bar">
                        <div class="race-confirm-note"><i aria-hidden="true"></i><span><em>Not
                            final</em> &mdash; change faction from the lobby until the match starts</span></div>
                        <button class="race-confirm-btn" id="confirmRaceBtn">
                            <b>Confirm Selection</b><em></em>
                        </button>
                    </div>
                </aside>
            </div>
            <p class="race-compare-status rs-sr" role="status"></p>
        `;

        modal.appendChild(container);
        document.body.appendChild(modal);

        modalRef = modal;
        detailPane = container.querySelector('.race-detail-content');
        confirmButton = container.querySelector('#confirmRaceBtn');

        const chanButtons = Array.from(container.querySelectorAll('.rs-chan'));
        chanButtons.forEach(button => {
            button.addEventListener('click', () => setCompareChannel(button.dataset.chan, true));
            button.addEventListener('keydown', event => handleCompareKeys(event, chanButtons, button));
        });

        confirmButton.addEventListener('click', confirmSelection);
        confirmButton.disabled = true;
        // Every wait gets a state, including this one. A seated plate reading
        // "CONFIRM SELECTION" over a blank sub-line while the registry is still
        // answering reads as a broken button rather than as a pending one.
        confirmButton.innerHTML = '<b>Confirm Selection</b><em>Reading the registry…</em>';
        modal.addEventListener('keydown', handleModalKeys);
        attachParallax(modal);

        // The bay is measured, never assumed — so it is re-measured whenever the
        // thing it was measured against moves. A window resize changes the
        // budget; a scroll changes how many factions are still below the fold,
        // and a count that does not update as you scroll is worse than no count.
        const grid = container.querySelector('.race-grid');
        if (grid) {
            grid.addEventListener('scroll', markRosterScrollState, { passive: true });
            // DELEGATED, so the roster can be built a row at a time without a
            // second pass over twelve cards to wire them up, and so a rebuild
            // (retry, a changed roster) cannot leak listeners.
            grid.addEventListener('click', event => {
                const card = event.target.closest && event.target.closest('.race-card');
                if (card && grid.contains(card)) {
                    selectRace(Number(card.dataset.raceId), { announce: true });
                }
            });
            grid.addEventListener('keydown', event => {
                const card = event.target.closest && event.target.closest('.race-card');
                if (card && grid.contains(card)) {
                    handleRosterKeys(event, Array.from(grid.querySelectorAll('.race-card')), card);
                }
            });
        }
        resizeHandler = () => {
            if (!modalRef) return;
            fitRoster();
            markScrollState();
        };
        window.addEventListener('resize', resizeHandler);

        // Seal the page behind the dialog LAST, so nothing above this line has
        // to care whether the lobby is inert while it works.
        sealBackground(modal);
        // NOT `restoreFocusTo = document.activeElement` again here. That line
        // used to sit exactly at this point and it is the bug the comment 240
        // lines above warns about, written out in full: sealBackground() sets
        // `inert` on every lobby sibling, inert synchronously blurs whatever is
        // inside it, so this read returned <body> EVERY time and clobbered the
        // good value taken before the seal. confirmSelection() then called
        // document.body.focus() — a guard that passes and a call that does
        // nothing — and a player who had just made the one permanent choice in
        // the game was left on <body> with the next Tab restarting at the top of
        // the lobby. Measured after Enter on Confirm: activeElement <body>, next
        // Tab a.hud-brand.
        //
        // Focus goes to the console itself and not to a card: a screen reader
        // then opens on "Select Your Race, dialog" and the description, rather
        // than dropping the player mid-roster on faction four with no idea what
        // screen they are on. The first Tab from here reaches the comparator,
        // the second the roster.
        container.tabIndex = -1;
        container.focus({ preventScroll: true });

        if (unlockedRaces.length) {
            paintRoster(unlockedRaces);
        } else {
            detailPane.innerHTML =
                '<div class="race-detail-empty is-loading"><strong>Reading the faction registry</strong>'
              + '<span>Twelve doctrines, one pick. Standby.</span></div>';
            announce('Loading the faction registry.');
            fitRoster();
        }
    }

    // ---------------------------------------------------------------------
    // PAINTING THE ROSTER — in two passes, so no single task blocks a frame.
    //
    // Twelve cards is ~700 elements resolved against a 3,300-line sheet, and
    // building them in one synchronous pass was a measurable part of the 1.1 s
    // block on open. The first row goes in immediately (it is the row a player
    // looks at) and the rest follow on the next animation frame, so the longest
    // task the build can produce is roughly a third of what it was — and the
    // skeleton underneath means the bay is never empty while it happens.
    // ---------------------------------------------------------------------
    function paintRoster(races) {
        if (!modalRef) return;
        clearRegistryTimers();
        // THE HOST ASKS TWICE. lobby.js fires //getunlockedraces from
        // loadRaceSelectionScript AND this module fires it from initialize, so
        // the registry answers twice on every open — and a second full rebuild
        // of twelve cards is ~700 ms of main thread spent redrawing a roster
        // that is already correct, landing squarely on top of the first one.
        // Same roster, same answer: keep the one on screen.
        const signature = JSON.stringify((races || []).map(r => [r.id, !!r.unlocked]));
        if (registryState === 'ready' && signature === rosterSignature) {
            setBusy(false);
            return;
        }
        rosterSignature = signature;
        registryState = 'ready';
        unlockedRaces = Array.isArray(races) ? races : [];
        const grid = modalRef.querySelector('.race-grid');
        const shell = modalRef.querySelector('.race-grid-shell');
        if (!grid) return;
        shell.classList.remove('is-error');

        const available = unlockedRaces.filter(race => race.unlocked).length;
        const total = unlockedRaces.length;
        const gauge = modalRef.querySelector('.race-selector-gauge-read');
        if (gauge) gauge.innerHTML = `<strong>${pad2(available)}</strong><i>/${pad2(total)}</i>`;

        if (!total) {
            grid.innerHTML = '';
            setBusy(false);
            renderEmptyState();
            return;
        }

        // The skeleton is already up and already the right size, so the cards go
        // in once, on the next frame. Building a first row synchronously and
        // then rebuilding the whole roster was sixteen card builds to show
        // twelve, and the frame it saved was a frame the skeleton was already
        // holding.
        if (!grid.querySelector('.race-card-skeleton')) {
            grid.innerHTML = skeletonRoster(total);
        }

        // ONE ROW PER FRAME, SO NO SINGLE TASK OWNS THE THREAD.
        //
        // Twelve cards is ~1,180 elements resolved against a 3,700-line sheet
        // with 82 box-shadows and 75 gradients in it, and posting all of them in
        // one innerHTML made the parse, the style recalc, the layout and the
        // first paint of the whole roster into ONE task. A row at a time keeps
        // each of those tasks to a third of a roster, and — because the chunk is
        // spliced in over the skeleton rather than replacing it — the bay stays
        // full the whole way through: the twelve bays fill in, they do not blink
        // from empty furniture to a finished wall.
        //
        // The card listeners are DELEGATED on the grid (see showRaceSelection),
        // not bound per card, so a progressively-built roster needs no second
        // pass to wire up and twelve identical closures are not allocated.
        const markup = unlockedRaces.map(race => createRaceCard(race));
        const CHUNK = 4;

        const settle = () => {
            setBusy(false);
            const preferred = preferredRaceId
                ? unlockedRaces.find(r => r.id === preferredRaceId && r.unlocked)
                : null;
            const firstUnlocked = preferred || unlockedRaces.find(r => r.unlocked) || unlockedRaces[0];
            if (firstUnlocked) {
                selectRace(firstUnlocked.id, { announce: false });
            } else {
                renderEmptyState();
            }
            preferredRaceId = null;
            setCompareChannel(compareIndex, false);
            fitRoster();
        };

        const step = at => {
            if (!modalRef || !document.body.contains(grid)) return;
            const chunk = markup.slice(at, at + CHUNK).join('');
            const skeletons = grid.querySelectorAll('.race-card-skeleton');
            if (skeletons.length) {
                skeletons[0].insertAdjacentHTML('beforebegin', chunk);
                for (let i = 0; i < CHUNK && skeletons[i]; i++) skeletons[i].remove();
            } else {
                grid.insertAdjacentHTML('beforeend', chunk);
            }
            if (at + CHUNK < markup.length) {
                window.requestAnimationFrame(() => step(at + CHUNK));
                return;
            }
            settle();
        };
        window.requestAnimationFrame(() => step(0));
    }

    // ---------------------------------------------------------------------
    // THE REGISTRY CAN FAIL, AND WHEN IT DOES IT SAYS SO AND OFFERS A WAY OUT.
    //
    // Previously both failure modes — socket not open, payload not parseable —
    // ended in a console.error and a lobby that never opened this console at
    // all. The host sets isAwaitingRaceSelection before opening and only clears
    // it when a race comes back, so that state is terminal: the player cannot
    // join, cannot retry, and is given no reason.
    // ---------------------------------------------------------------------
    function renderRegistryError(reason) {
        clearRegistryTimers();
        registryState = 'error';
        if (!modalRef) return;
        const grid = modalRef.querySelector('.race-grid');
        const shell = modalRef.querySelector('.race-grid-shell');
        if (!grid || !shell) return;
        setBusy(false);
        shell.classList.add('is-error');
        // BOTH SENTENCES NAME A CONTROL THAT IS IN THIS DIALOG.
        //
        // The error panel used to end on "You can also leave the game from the
        // lobby and create it again" — an instruction the player cannot follow
        // from where they are standing. This dialog inerts the entire lobby (8
        // subtrees; the Create Game button is inside one of them), Escape
        // deliberately does not close, and the only two controls on the screen
        // were RETRY and a dead confirm plate. If RETRY kept failing the screen
        // was a terminal dead end whose only real exit — reloading the browser —
        // the copy never mentioned.
        //
        // So the second route is now a REAL CONTROL, next to the first. Nothing
        // can be stranded by it: this state is only ever reached before a
        // faction has been chosen, so leaving costs the player nothing but the
        // game they were about to set up, and the lobby it lands on is live.
        grid.innerHTML =
            '<div class="race-registry-error" role="alert">'
          + '<b>Could not reach the faction registry</b>'
          + `<span>${esc(reason || 'The connection dropped before the roster arrived.')}</span>`
          + '<span class="race-registry-actions">'
          + '<button type="button" class="race-retry-btn" id="raceRegistryRetry">Retry</button>'
          + '<button type="button" class="race-leave-btn" id="raceRegistryLeave">Back to lobby</button>'
          + '</span>'
          + '<small>Retry asks the registry again. Back to lobby reloads it from scratch — '
          + 'no faction has been chosen yet, so nothing is lost.</small>'
          + '</div>';
        const retry = grid.querySelector('#raceRegistryRetry');
        if (retry) {
            retry.addEventListener('click', () => {
                shell.classList.remove('is-error');
                grid.innerHTML = skeletonRoster(12);
                announce('Retrying the faction registry.');
                loadUnlockedRaces();
            });
            retry.focus({ preventScroll: true });
        }
        const leave = grid.querySelector('#raceRegistryLeave');
        if (leave) {
            leave.addEventListener('click', () => {
                announce('Returning to the lobby.');
                // The seal has to come off before the navigation, or a browser
                // that restores this page from the back/forward cache restores
                // it with the lobby still inert underneath a dead dialog.
                releaseBackground();
                window.location.assign('lobby.html');
            });
        }
        selectedRace = null;
        inspectedRace = null;
        if (confirmButton) {
            confirmButton.disabled = true;
            confirmButton.innerHTML = '<b>Registry Offline</b><em>Retry, or go back to the lobby</em>';
        }
        if (detailPane) {
            detailPane.innerHTML =
                '<div class="race-detail-empty"><strong>No dossier available</strong>'
              + '<span>The registry has to answer before a faction can be inspected.</span></div>';
        }
        markScrollState();
    }

    // =====================================================================
    // Modal containment.
    //
    // `inert` does the real work — it takes the sealed subtree out of hit
    // testing, out of the tab order and out of the accessibility tree in one
    // attribute — and aria-hidden is the belt and braces for the browsers that
    // have the second without the first. Both are recorded and restored, so a
    // page that already had either keeps it when the dialog closes. This must
    // never leak: the lobby's own Leave Game button lives in the sealed
    // subtree, and an unreleased seal would strand a player in the waiting view.
    // =====================================================================
    let backgroundSeal = [];
    let restoreFocusTo = null;

    function sealBackground(modal) {
        backgroundSeal = [];
        Array.from(document.body.children).forEach(el => {
            if (el === modal || el.id === SPRITE_ID) {
                return;
            }
            backgroundSeal.push({
                el,
                inert: el.hasAttribute('inert'),
                hidden: el.getAttribute('aria-hidden')
            });
            el.setAttribute('inert', '');
            el.setAttribute('aria-hidden', 'true');
        });
    }

    function releaseBackground() {
        backgroundSeal.forEach(entry => {
            if (!entry.inert) {
                entry.el.removeAttribute('inert');
            }
            if (entry.hidden === null) {
                entry.el.removeAttribute('aria-hidden');
            } else {
                entry.el.setAttribute('aria-hidden', entry.hidden);
            }
        });
        backgroundSeal = [];
    }

    // The trap. `inert` on the siblings already keeps focus inside on every
    // browser that ships it; this keeps the cycle inside on the ones that do
    // not, and it is what makes Shift+Tab from the first control land on the
    // last instead of on the browser chrome.
    //
    // There is no Escape-to-close on purpose, and it is not an oversight. The
    // host flow (lobby.js joinGame / openRaceSelectorForCurrentGame) has no
    // cancel path: it sets isAwaitingRaceSelection before opening this console
    // and only clears it when a race comes back, so a dismissed dialog would
    // leave the lobby unable to reopen it and the player unable to join. A
    // required step that says so is better than an exit that strands you.
    function handleModalKeys(event) {
        if (!modalRef) {
            return;
        }
        // ESCAPE ANSWERS. It does not close — see above, there is no cancel path
        // in the host flow and a dismissed dialog strands the player — but a
        // required step that refuses to SAY it is required is a different defect
        // from a required step. Pressing the universal dismiss key and getting
        // absolute silence reads as "the interface is frozen", which is exactly
        // the wrong conclusion to invite on a screen that already asks a player
        // to wait for it. So the key gets an answer in words, in the status
        // region, and the confirm plate pulses to point at the way out.
        if (event.key === 'Escape' || event.key === 'Esc') {
            event.preventDefault();
            // The answer names the way out that is actually live. It used to
            // pulse the confirm plate unconditionally, which on a locked-card
            // view meant the dialog's advertised exit was a dead, disabled
            // button — the reflex key answered with a control that cannot be
            // pressed. The plate is live whenever a faction is chosen, and this
            // says which one; when nothing is chosen it says that instead.
            announce('Faction required — choose one to enter the match. There is no cancel; '
                   + 'you can change faction from the lobby until the match starts. '
                   + heldSentence());
            const bar = modalRef.querySelector('.race-confirm-bar');
            if (bar) {
                bar.classList.remove('is-nudged');
                // reflow, or a second Escape inside the animation is a no-op
                void bar.offsetWidth;
                bar.classList.add('is-nudged');
                window.setTimeout(() => bar.classList.remove('is-nudged'), 900);
            }
            return;
        }
        if (event.key !== 'Tab') {
            return;
        }
        // `el.tabIndex >= 0` and not the `[tabindex]:not([tabindex="-1"])`
        // selector: two of the three controls on this console rove, so twenty of
        // its twenty-one buttons carry tabindex="-1" at any moment while still
        // matching `button:not([disabled])`. Filtering on the resolved property
        // is the only reading that matches the browser's own tab order.
        const stops = Array.from(modalRef.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),'
            + ' textarea:not([disabled]), [tabindex]'
        )).filter(el => el.tabIndex >= 0 && (el.offsetWidth > 0 || el.offsetHeight > 0));
        if (!stops.length) {
            return;
        }
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (event.shiftKey && (document.activeElement === first || !modalRef.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    // Depth without motion: the two star layers offset by different amounts as
    // the pointer moves, and sit at exactly 0 when it has not, so a headless
    // screenshot is byte-stable.
    //
    // REDUCED MOTION IS HONOURED HERE, NOT JUST DECLARED IN THE SHEET.
    // The listener used to be bound unconditionally, so under
    // prefers-reduced-motion: reduce the starfield still tracked the cursor —
    // measured live at --rs-px 0.7708 / --rs-py 0.6667 with the far layer at
    // translate(-5.4, -3.3) and the near layer at (-13.9, -8.0). The only
    // reduced-motion rule that existed set `transition: none` on exactly those
    // layers, which stripped the easing and left the parallax SNAPPING to the
    // pointer: for a vestibular-sensitive player that is strictly worse than
    // shipping no rule at all. The listener is now never attached, and the
    // sheet pins the two offsets to 0 as well, so neither half can fail alone.
    function prefersReducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function attachParallax(modal) {
        if (prefersReducedMotion()) {
            return;
        }
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

    // ---------------------------------------------------------------------
    // THE ROSTER IS ONE CONTROL, NOT TWELVE TAB STOPS.
    //
    // Twelve cards in a 4x3 grid is the textbook case for a radiogroup with a
    // roving tabindex, and this used to be twelve tabbable <button>s carrying
    // aria-pressed — the toggle-button contract, which says each card is an
    // independent on/off. It is not: exactly one faction can be chosen, which is
    // what role="radio" and aria-checked mean, and it is the difference between
    // a screen reader announcing "Mechanicus, not pressed" and "Mechanicus,
    // radio button, 6 of 12, not selected".
    //
    // Arrows walk the grid AND WRAP — off the right edge onto the next row's
    // left, off the last card back to the first — because a wall that dead-ends
    // makes a player think the control is broken rather than that they reached
    // the end. Home and End jump to the ends. Enter commits: arrow to a faction,
    // press Enter, you are in the game, without ever leaving the roster.
    // ---------------------------------------------------------------------
    function handleRosterKeys(event, cards, card) {
        const at = cards.indexOf(card);
        const last = cards.length - 1;

        if (event.key === 'Enter') {
            // Arrow-and-Enter has to work end to end, so Enter on an authorized
            // faction is the commit. On a sealed one it cannot be, so it says
            // why instead of failing silently.
            event.preventDefault();
            const race = unlockedRaces.find(r => Number(r.id) === Number(card.dataset.raceId));
            if (race && race.unlocked) {
                // `defer` on the commit path is not a preview, it is a refusal
                // to do work for a panel that is about to be removed: the
                // dossier this would paint is torn down by the next line, and
                // confirmSelection() cancels the scheduled render. Rebuilding it
                // first was ~200 ms of parse, layout and decode charged to the
                // highest-stakes keypress in the game.
                selectRace(Number(card.dataset.raceId), { defer: true });
                confirmSelection();
            } else if (race) {
                // A refusal that does not say what survived it is half an
                // answer: the sentence names the gate AND the faction the
                // confirm plate is still holding.
                announce(`${race.name} is locked. ${unlockObjective(race)} to authorize it. ${heldSentence()}`);
            }
            return;
        }

        const columns = columnCount(cards);
        let next = -1;
        switch (event.key) {
            case 'ArrowRight': next = at === last ? 0 : at + 1; break;
            case 'ArrowLeft':  next = at === 0 ? last : at - 1; break;
            case 'ArrowDown':  next = at + columns > last ? at % columns : at + columns; break;
            case 'ArrowUp':    next = at - columns < 0
                ? at + columns * Math.floor((last - at) / columns) : at - columns; break;
            case 'Home':       next = 0; break;
            case 'End':        next = last; break;
            default: return;
        }
        if (next < 0 || next > last) {
            return;
        }
        event.preventDefault();
        // KEYBOARD IS HOW YOU REACH THE ROW BELOW THE FOLD.
        // The roster is one control with a roving tabindex, so it is one tab
        // stop and the arrows do the walking — which means the arrows also have
        // to do the SCROLLING when the bay cannot show all twelve. `nearest`
        // scrolls the minimum needed, so walking along a visible row never
        // jumps the view. Making the grid itself a tab stop, the other way of
        // reaching an overflowing scroll port, would put a second stop in front
        // of Confirm and break the radiogroup contract that a group with
        // focusable children is not itself focusable.
        cards[next].focus({ preventScroll: true });
        if (cards[next].scrollIntoView) {
            cards[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        // Silent: the focus move itself speaks the card's hand-written
        // accessible name, which already carries the faction, its gate, its best
        // channel and what it gives up. Announcing a second summary on top of
        // that is the queue-flooding defect this pass removed from the dossier,
        // rebuilt one layer up.
        //
        // `defer` is what makes an arrow walk a walk. A pointer click is one
        // deliberate selection and paints at once; the arrows are a browse, and
        // rebuilding the dossier inside every keydown is what turned comparing
        // twelve factions into a slideshow. See scheduleDossier.
        selectRace(Number(cards[next].dataset.raceId), { announce: false, defer: true });
    }

    // The one place this module speaks to assistive tech out of band. Everything
    // else is announced by the dossier's own live region.
    function announce(text) {
        const status = modalRef && modalRef.querySelector('.race-compare-status');
        if (status) {
            status.textContent = text;
        }
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

    // A SEALED CARD IS NOT A DISABLED CONTROL, AND MUST NOT CLAIM TO BE.
    //
    // `aria-disabled="true"` was the obvious-looking way to say "you cannot pick
    // this one" and it is wrong twice over. It is wrong for the player, because
    // a locked card IS operable — clicking it opens that faction's dossier, its
    // hulls and its homeworld, which is the entire "aspirational, not broken"
    // premise of the locked treatment; announcing it as unavailable tells a
    // screen-reader user not to bother with eleven of the twelve factions. And
    // it is wrong for every automated agent that drives this screen: Playwright
    // treats aria-disabled as not-actionable, so `locked.click()` blocks until
    // the suite times out — lobby.spec.js does exactly that click, and this was
    // caught by it hanging.
    //
    // The lock is stated where it is true instead: in the card's accessible name
    // ("Locked — win 3 games to authorize it"), on its gate strip, and on the
    // confirm button, which IS genuinely disabled and now says why.
    //
    // THE CARD'S ACCESSIBLE NAME, WRITTEN RATHER THAN INHERITED.
    //
    // Left to the default computation a radio built out of this much markup is
    // announced as its faction name, then its prose, then the meter rail's
    // 220-character chart label, then its gate — one unbroken sentence that
    // takes twelve seconds to hear per card, times twelve cards. The name is now
    // the four things a player is choosing between, in the order they matter:
    // who it is, whether they can take it, what it is best at, what it costs
    // them. The prose and the full seven-channel reading stay on the card as its
    // DESCRIPTION, so nothing is lost — it is just no longer in front of the
    // next faction's name.
    function cardLabel(race, locked) {
        const bits = [`${race.name}.`];
        bits.push(locked ? `Locked — ${unlockObjective(race)} to authorize it.` : 'Authorized.');
        bits.push(poleSentence(race));
        const d = race.doctrine || {};
        const denied = (d.lockedBranches || []).concat(d.lockedShips || []);
        if (denied.length) {
            bits.push(`Gives up ${denied.join(', ')}.`);
        } else if ((d.cappedBranches || []).length) {
            bits.push(`${plural((d.cappedBranches || []).length, 'capped tech branch', 'capped tech branches')}.`);
        } else {
            bits.push('No permanent restrictions.');
        }
        return bits.join(' ');
    }

    function createRaceCard(race) {
        const id = Number(race.id);
        const ident = identity(id);
        const locked = !race.unlocked;
        const gate = gateKind(race);
        const restricted = restrictionCount(race) > 0;
        // THE NOTE STRIP NAMES THE THING IT IS SHOWING.
        // An authorized card's tag used to read "DOCTRINE", which is the name of
        // the topic and not of the fact — so the single most consequential line
        // on the card ("No Shields/Cloaking", permanent, whole match) was filed
        // under a heading that could equally have introduced a bonus. It now
        // says RESTRICTED or NO LIMITS, which is the finding itself, and the
        // restricted variant is set in the same ink weight the gate captions get
        // rather than the muted body grey.
        const noteTag = locked ? unlockChannel(race) : (restricted ? 'Restricted' : 'No limits');
        const noteText = locked ? unlockObjective(race) : compactDoctrine(race);
        const noteKind = locked ? 'gate' : (restricted ? 'restriction' : 'clear');
        // The port carries the card's furniture — designation top-left, the
        // trade-off pair under it — stencilled ONTO the art's dark margin
        // instead of stacked above it. That is what buys the crest 96px of card
        // height in the same 250px row the four-line version used, and it is the
        // reason the roster still lands all twelve factions on a 1080p screen.
        //
        // The prose description moved to the dossier and to a screen-reader-only
        // span here: on a 216px card it was two clamped lines of flavour sitting
        // where the faction art should be, and the dossier restates it in full
        // the moment the card is selected.
        const extras =
            `<span class="race-card-index"><i class="race-led"></i>FAC-${pad2(id)}<em>${ident.code}</em></span>`
          + poleStrip(race)
          + compareReadouts(race);
        return `
            <button type="button" id="race-${id}" class="race-card ${locked ? 'locked' : 'unlocked'}"
                    data-race-id="${id}" role="radio" aria-checked="false" tabindex="-1"
                    aria-label="${esc(cardLabel(race, locked))}"
                    aria-describedby="race-brief-${id}">
                ${crestPort(id, { locked, extras })}
                <h3>${esc(race.name)}</h3>
                <span class="rs-sr" id="race-brief-${id}">${esc(race.description)}</span>
                ${meterRack(race)}
                <span class="race-card-note" data-gate="${gate}" data-note="${noteKind}">
                    <i class="race-note-flag">${locked ? lockGlyph() : ''}</i>
                    <span class="race-note-body"><b>${esc(noteTag)}</b><em>${esc(noteText)}</em></span>
                </span>
                <span class="race-card-mark" aria-hidden="true">Selected</span>
            </button>
        `;
    }

    function selectRace(raceId, opts) {
        const race = unlockedRaces.find(r => r.id === raceId);
        if (!race) {
            return;
        }
        const options = opts || {};

        // A LOCKED CARD IS INSPECTED, NEVER CHOSEN — and inspecting one leaves
        // the player's actual pick exactly where it was.
        inspectedRace = raceId;
        if (race.unlocked) {
            selectedRace = raceId;
        }
        // The roving stop belongs to the CHOSEN faction while there is one, so a
        // screen-reader user who tabs out of the roster and back lands on the
        // radio that is checked, hears its selection state, and can arrow on
        // from there. It falls back to whatever is being inspected only while
        // nothing has been chosen yet — a radiogroup with no reachable stop at
        // all is unusable.
        const rovingId = selectedRace !== null ? selectedRace : inspectedRace;

        document.querySelectorAll('.race-card').forEach(card => {
            const cardId = Number(card.dataset.raceId);
            const isChosen = selectedRace !== null && cardId === selectedRace;
            card.classList.toggle('active', isChosen);
            card.classList.toggle('inspecting', cardId === inspectedRace);
            // aria-checked, not aria-pressed: exactly one faction can be chosen,
            // which is the radio contract, not the toggle-button one. It tracks
            // the COMMITMENT, so the roster never reports "nothing is selected"
            // while the player has in fact selected something.
            card.setAttribute('aria-checked', isChosen ? 'true' : 'false');
            // The roving stop. The roster is the tab order's single entry for
            // twelve factions, so Tab reaches it once and the arrows do the
            // walking — and Shift+Tab out of it lands back on the comparator
            // instead of stepping through eleven factions in reverse.
            card.tabIndex = cardId === rovingId ? 0 : -1;
        });

        syncConfirm();

        // Everything above this line is the KEYPRESS ANSWER — the roving stop,
        // the selection ring, the confirm plate — and it is ~1 ms of attribute
        // writes. Everything below is the DOSSIER, which is 112 fresh nodes and
        // five paintings, and it is scheduled rather than run when the caller
        // says the player is still walking. See scheduleDossier.
        if (options.defer) {
            scheduleDossier(race);
        } else {
            cancelDossier();
            paintDossier(race);
        }

        // THE ONE-LINE "WHAT JUST CHANGED", where the 83-word dossier live
        // region used to be. It is written only when the selection did NOT come
        // from an arrow key: a focus move already speaks the card's accessible
        // name, and stacking a second description of the same faction on top of
        // it is the queue flooding this pass exists to remove. A pointer click
        // announces nothing on its own, so that is where this earns its place.
        if (options.announce) {
            const locked = !race.unlocked;
            const bits = [race.name, locked ? 'locked' : 'selected'];
            const p = poles(race);
            if (p.up) bits.push(`best ${p.up.channel.label.toLowerCase()} ${readoutText(p.up.channel, p.up.r)}`);
            if (p.down) bits.push(`worst ${p.down.channel.label.toLowerCase()} ${readoutText(p.down.channel, p.down.r)}`);
            if (locked) bits.push(`${unlockObjective(race)} to authorize it`);
            // AND WHAT DID NOT CHANGE. Opening a locked faction's dossier leaves
            // the pick alone, and silence about that is indistinguishable from
            // silence about losing it — so the line says which faction is still
            // on the confirm plate.
            announce(`${bits.join(', ')}.${locked ? ` ${heldSentence()}` : ''}`);
        }
    }

    // =====================================================================
    // THE DOSSIER IS COALESCED, AND ITS PAINTINGS ARE DECODED BEFORE IT IS
    // MOUNTED.
    //
    // Walking the roster with the arrows used to rebuild the whole dossier on
    // every step, inside the keydown that moved the focus. Measured over 10
    // presses at a browsing cadence of 250 ms: median frame a clean 16.6 ms but
    // p95 106.6 and worst 568.6, roughly one long frame per keypress, against an
    // idle worst of 32.4 on the same surface. Comparing twelve factions is the
    // entire purpose of this screen and it ran as a slideshow.
    //
    // Two things were happening in that frame and only one of them was script.
    // The script — 112 nodes of parsed HTML, a 12-card class sweep and two
    // forced layouts — profiles at ~2.5 ms. The rest was the FIVE PAINTINGS the
    // rebuild threw away and asked for again: a 960px homeworld for the hero, a
    // second copy of it for the backdrop, a crest and three hulls, all of them
    // fresh <img> elements whose fetch, decode and raster landed in the frame
    // that mounted them.
    //
    // So the work is moved rather than made faster, in the two ways that
    // actually move it:
    //
    //   COALESCE. A keypress answers with the roving stop, the selection ring
    //   and the confirm plate — the things under the player's eye — and the
    //   dossier is scheduled behind a settle timer that each further press
    //   cancels. Holding an arrow down now repaints the bay once, at the end,
    //   instead of once per step.
    //
    //   DECODE OFF THREAD FIRST. The settle window is not spent idle: the target
    //   faction's paintings are decoded on a detached Image() while it runs, and
    //   the subtree is only mounted once they are ready. That is a real decode
    //   on a real worker thread — `decoding: async` plus `img.decode()` — and
    //   not an API that merely looks asynchronous, so the decode genuinely
    //   leaves the main thread instead of being wrapped in a resolved promise.
    //   The cap is what stops a slow or missing painting from holding the bay
    //   hostage; past it the dossier mounts anyway and the art arrives when it
    //   arrives, exactly as it did before.
    // =====================================================================
    const DOSSIER_SETTLE_MS = 120;
    const DOSSIER_DECODE_CAP_MS = 200;
    let dossierTimer = null;
    let dossierToken = 0;
    const decodedArt = new Set();

    // Every painting the dossier and the void behind it will mount for a
    // faction, as the SAME src/srcset pair the <img> will carry. Warming the
    // bare `src` would be warming the wrong file: everything on this screen is
    // published at two densities and mounted `srcset="<lite> 1x, <full> 2x"`, so
    // a 1x display shows the lite variant and a pre-decode of the full one is
    // both a wasted 960px decode and a miss on the file that is actually needed.
    function dossierArt(race) {
        const id = Number(race.id);
        const ident = identity(id);
        const pairs = [
            { full: ident.world, lite: worldLite(id) },
            { full: ident.crest, lite: crestLite(id) }
        ];
        (Array.isArray(ident.hulls) ? ident.hulls : []).forEach(hull => {
            if (hull && hull.src) pairs.push({ full: hull.src, lite: HULL_1X[hull.src] });
        });
        return pairs.filter(pair => pair.full);
    }

    // Prime the decoded-image cache off the main thread. A rejection is a
    // resolution here: a painting that will not decode must not be able to stop
    // the dossier that describes it.
    function warmArt(pairs) {
        const cold = pairs.filter(pair => !decodedArt.has(pair.full));
        if (!cold.length) {
            return Promise.resolve();
        }
        const all = Promise.all(cold.map(pair => {
            const img = new Image();
            img.decoding = 'async';
            if (pair.lite) img.srcset = `${pair.lite} 1x, ${pair.full} 2x`;
            img.src = pair.full;
            const settle = () => decodedArt.add(pair.full);
            return (img.decode ? img.decode() : Promise.resolve()).then(settle, settle);
        }));
        const cap = new Promise(resolve => window.setTimeout(resolve, DOSSIER_DECODE_CAP_MS));
        return Promise.race([all, cap]);
    }

    function cancelDossier() {
        dossierToken += 1;
        if (dossierTimer) {
            window.clearTimeout(dossierTimer);
            dossierTimer = null;
        }
    }

    function scheduleDossier(race) {
        cancelDossier();
        const token = dossierToken;
        // The warm starts on the keypress, not on the timer, so the settle
        // window and the decode overlap instead of running end to end.
        const warm = warmArt(dossierArt(race));
        dossierTimer = window.setTimeout(() => {
            dossierTimer = null;
            warm.then(() => {
                if (token !== dossierToken) return;
                window.requestAnimationFrame(() => {
                    if (token !== dossierToken) return;
                    paintDossier(race);
                });
            });
        }, DOSSIER_SETTLE_MS);
    }

    // The heavy half of a selection: the void backdrop, the signage plate and
    // the dossier itself. Everything here reads `race` and nothing here reads
    // the module's selection state, so it is safe to run a frame late.
    function paintDossier(race) {
        if (!modalRef || !document.contains(modalRef)) {
            return;
        }
        const raceId = Number(race.id);
        const ident = identity(raceId);
        // The void behind the console belongs to the faction you are
        // inspecting: its homeworld as the deep backdrop, its crest on the
        // gutter signage plate. No hue is set anywhere — see
        // RACE_IDENTITY; the paintings are the identity.
        const world = modalRef.querySelector('.race-void-world img');
        setArt(world, ident.world, worldLite(raceId));
        const markPlate = modalRef.querySelector('.race-void-mark');
        const mark = markPlate && markPlate.querySelector('img');
        if (mark && ident.crest) {
            setArt(mark, ident.crest, crestLite(raceId));
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

        renderRaceDetails(race);
    }

    // What the confirm plate is still holding, in words. Used by the locked-card
    // announcement and by the Escape answer.
    function heldSentence() {
        const held = selectedRace !== null ? unlockedRaces.find(r => r.id === selectedRace) : null;
        return held
            ? `Your selection is still ${held.name}.`
            : 'No faction is selected yet — choose an authorized one to continue.';
    }

    // ---------------------------------------------------------------------
    // THE CONFIRM PLATE ANSWERS TO ONE THING: WHAT THE PLAYER HAS CHOSEN.
    //
    // It used to be written from renderRaceDetails, i.e. from whatever faction
    // the dossier happened to be showing — so browsing a locked faction seated
    // the button and replaced the player's pick with "FACTION LOCKED / Acquire
    // for $4.99". The global commit control now states the global commitment and
    // nothing else; a locked faction's gate is stated in the dossier beside that
    // faction, where it is true (see heroGate).
    // ---------------------------------------------------------------------
    function syncConfirm() {
        if (!confirmButton || registryState === 'error') {
            return;
        }
        const chosen = selectedRace !== null ? unlockedRaces.find(r => r.id === selectedRace) : null;
        if (chosen) {
            confirmButton.disabled = false;
            confirmButton.innerHTML = `<b>Confirm Selection</b><em>${esc(chosen.name)}</em>`;
            return;
        }
        confirmButton.disabled = true;
        confirmButton.innerHTML = unlockedRaces.some(r => r.unlocked)
            ? '<b>Choose a Faction</b><em>Pick an authorized faction</em>'
            : '<b>No Faction Available</b><em>Play or win games to unlock one</em>';
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
        selectedRace = null;
        syncConfirm();
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
            ${heldStrip(race)}
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

        // NOTHING HERE TOUCHES THE CONFIRM PLATE. The dossier shows whatever is
        // being INSPECTED and the plate carries what has been CHOSEN; those were
        // one variable and writing the button from here is what threw a player's
        // faction away every time they opened a locked one. See syncConfirm.

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
        return `<img class="race-world-art"${artAttrs(ident.world, worldLite(race.id))}`
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
    // The block whose absence a player will regret. If THIS is what is below the
    // cut the foot rail names it rather than counting it, because "2 more below"
    // and "restrictions below" are not the same warning. Hull calibration is
    // deliberately not on this list: it is a set of modifiers, not a permanent
    // restriction, and claiming "restrictions below" while the restrictions are
    // on screen is the kind of small lie that teaches a player to stop reading
    // the rail.
    const COST_BLOCKS = '.race-detail-doctrine, .race-detail-clear';

    function markScrollState() {
        const panel = modalRef && modalRef.querySelector('.race-detail-panel');
        if (!panel || !detailPane) {
            return;
        }
        const more = panel.querySelector('.race-detail-foot-more');
        // READ EVERYTHING, THEN WRITE EVERYTHING.
        //
        // This used to interleave: read scrollHeight, toggle a class, set four
        // attributes, then read a bounding rect for every block in the dossier —
        // and every one of those reads after a write forces a fresh layout of a
        // 1,200-node console. It ran twice per pass and the pass runs on every
        // selection change, which made it the single largest item left in the
        // open's profile at 138 ms of self time. Same answers, one layout.
        const apply = () => {
            const overflows = detailPane.scrollHeight > detailPane.clientHeight + 1;
            let text = '';
            if (overflows) {
                const floor = detailPane.getBoundingClientRect().bottom;
                const below = Array.from(detailPane.children)
                    .filter(el => el.getBoundingClientRect().top > floor - 12)
                    // the footer stencil is furniture; counting it as a block a
                    // player is missing would inflate every count by one
                    .filter(el => !el.classList.contains('race-detail-stamp-line'));
                // The restrictions get the stricter test: a block that is CUT by
                // the fold is as unread as one entirely under it, and this is the
                // one block where finding that out later is a match-long regret.
                // Everything else is counted when it is fully below.
                const costsBelow = Array.from(detailPane.querySelectorAll(COST_BLOCKS))
                    .some(el => el.getBoundingClientRect().bottom > floor + 1);
                text = costsBelow
                    ? 'Restrictions below ▼ scroll or use the arrow keys'
                    : `${below.length || 1} more below ▼ scroll or use the arrow keys`;
            }

            panel.classList.toggle('is-scrollable', overflows);
            // A scroll port a mouse can reach and a keyboard cannot is a
            // half-built control. When the dossier genuinely overruns the bay it
            // becomes a tab stop so the arrow keys can scroll it — and only
            // then, because an unnecessary stop in front of CONFIRM is its own
            // defect. It gets a name and a focus ring like every other stop.
            //
            // The count is CONTENT, not decoration: it is what tells a player
            // that the permanent costs of this faction exist at all. It is the
            // port's description, so a screen reader entering the dossier hears
            // "Faction dossier, scrollable, restrictions below — scroll or use
            // the arrow keys" without a fourth tab stop being invented.
            if (overflows) {
                detailPane.setAttribute('tabindex', '0');
                detailPane.setAttribute('role', 'group');
                detailPane.setAttribute('aria-label', 'Faction dossier, scrollable');
                detailPane.setAttribute('aria-describedby', 'rsDossierMore');
            } else {
                detailPane.removeAttribute('tabindex');
                detailPane.removeAttribute('role');
                detailPane.removeAttribute('aria-label');
                detailPane.removeAttribute('aria-describedby');
            }
            if (!more) return;
            more.hidden = !overflows;
            if (more.textContent !== text) more.textContent = text;
        };
        apply();
        // Art decodes after the first layout and the fleet sheet is the tallest
        // thing in the bay, so re-check once the panel has settled.
        window.requestAnimationFrame(apply);
        // NOT markRosterScrollState() as well. This runs on every selection
        // change, and the roster does not change when the dossier does — so
        // that call was two extra forced layouts of a 1,200-node console per
        // arrow keypress, measured as the largest remaining item in the open's
        // profile. The roster re-measures where it can actually change: from
        // fitRoster, from its own scroll listener and from the resize handler.
    }

    // ---------------------------------------------------------------------
    // THE ROSTER FITS ITSELF TO THE BAY.
    //
    // At 1366x768 — the single most common laptop resolution there is — the
    // roster measured scrollHeight 669 against clientHeight 522: four of the
    // twelve factions were sliced through the middle of their own bodies, their
    // NAME, their stat rail and their unlock objective all below the clip, with
    // no scrollbar (the platform draws an overlay one, measured width 0), no
    // fade, no mask, and a chrome bar sitting flush against the cut so the
    // amputated row read as a finished edge. At 1280x720 it was six of twelve.
    // A player was choosing the one permanent setting in the game from two
    // thirds of the options and was never told the rest existed.
    //
    // The fix is arithmetic, not a breakpoint. Everything below the crest port
    // on a card — name, rail, legend, gate strip — is type at a legibility
    // floor and must not shrink. The port is the one part with slack in it,
    // because the crests are mounted `contain` on a black mat and most of a
    // wide aperture is mat. So: measure the bay, measure what one card needs
    // BELOW its port, divide, and give the port whatever height is left. It can
    // only ever get SHORTER than the sheet's own aspect — a taller port on a
    // big screen is the sheet's call, not this function's — and it stops at a
    // floor where the crest is still an emblem rather than a stamp.
    //
    // When even the floor will not fit (a very short window, a big zoom, the
    // single-column phone layout) the roster scrolls, and markRosterScrollState
    // below makes that legible instead of hiding it.
    // ---------------------------------------------------------------------
    const PORT_MIN_H = 62;        // below this a crest stops reading as art
    const PORT_MAX_ASPECT = 3.4;  // and the aperture stops reading as a port
    const FIT_MARGIN = 6;         // slack, so the scroll state cannot oscillate

    function fitRoster() {
        if (!modalRef) return;
        const grid = modalRef.querySelector('.race-grid');
        if (!grid) return;
        const shell = modalRef.querySelector('.race-grid-shell');
        // The SKELETON is fitted too, and by the same arithmetic. It exists to
        // hold the roster's geometry while the registry answers; a skeleton at
        // the sheet's aspect and cards at the fitted one is a skeleton that
        // holds the WRONG geometry, so the whole bay jumps the moment the
        // factions land — which is the layout shift a skeleton is there to
        // prevent.
        const cards = grid.querySelectorAll('.race-card, .race-card-skeleton');
        const port = grid.querySelector('.race-port, .rsk-port');
        if (cards.length < 2 || !port || !shell) return;
        // THE SHEET DECIDES WHETHER THERE IS A BUDGET TO SOLVE FOR.
        //
        // Squeezing the ports only ever pays when it can land the whole roster
        // in the bay. On a phone the roster is six rows of card in half a
        // viewport: the fit can never succeed, so all it did was drive every
        // crest to the aperture's flattest legal aspect and leave the roster
        // scrolling ANYWAY — twelve factions identified by a 49px letterbox of
        // their own art, for nothing. `--rs-fit: 0` is how the stylesheet says
        // "this layout scrolls on purpose, leave the cards alone"; the roster's
        // own overflow treatment carries it from there.
        if (getComputedStyle(grid).getPropertyValue('--rs-fit').trim() === '0'
            || getComputedStyle(grid).gridTemplateColumns === 'none') {
            grid.style.removeProperty('--rs-port-aspect');
            markRosterScrollState();
            return;
        }
        // Measure the bay WITHOUT the overflow affordance on it. The scroll
        // state adds a bottom apron and a gutter, so leaving it applied while
        // solving for "does this fit" makes the answer depend on the previous
        // answer — the roster would settle one row short of fitting and stay
        // there. Strip it, solve, then let markRosterScrollState decide again.
        shell.classList.remove('is-scrollable');
        // MEASURE THE SHEET, NOT THE LAST ANSWER. Reading the port's rendered
        // aspect while this function's own override is still on the element
        // makes the measurement a function of its own output: the second call
        // sees the fitted aspect as the "natural" one, decides no change is
        // needed, and removes the property — so the roster sprang back to eight
        // visible cards on every re-selection. Drop the override first and let
        // layout settle at the stylesheet's value.
        grid.style.removeProperty('--rs-port-aspect');
        const first = cards[0].getBoundingClientRect();
        const portBox = port.getBoundingClientRect();
        if (!first.height || !portBox.height || !first.width) return;

        const columns = columnCount(Array.from(cards));
        const rows = Math.ceil(cards.length / columns);
        if (rows < 2) {
            return;
        }
        const gs = getComputedStyle(grid);
        const gap = parseFloat(gs.rowGap) || 0;
        const padY = (parseFloat(gs.paddingTop) || 0) + (parseFloat(gs.paddingBottom) || 0);
        const belowPort = first.height - portBox.height;      // measured, so CSS can move
        // FIT_MARGIN keeps the answer off the knife edge. Landing three rows
        // exactly on the bay's height means a pixel of rounding decides whether
        // the roster reports itself as scrolling, and the scroll state reserves
        // a gutter, which changes the card width, which changes the row height —
        // a loop that shows up as the fade and the scrollbar flickering on and
        // off. A few pixels of slack costs nothing and makes the state settle.
        const budget = grid.clientHeight - padY - gap * (rows - 1) - FIT_MARGIN;
        const targetRow = budget / rows;
        const targetPort = targetRow - belowPort;
        if (!isFinite(targetPort)) return;

        // Only ever tighter than the sheet, never looser.
        const naturalAspect = portBox.width / portBox.height;
        const wanted = portBox.width / Math.max(PORT_MIN_H, targetPort);
        const aspect = Math.min(PORT_MAX_ASPECT, Math.max(naturalAspect, wanted));
        if (aspect - naturalAspect > 0.02) {
            grid.style.setProperty('--rs-port-aspect', aspect.toFixed(3));
        }
        markRosterScrollState();
    }

    // ---------------------------------------------------------------------
    // AND WHEN IT STILL DOES NOT FIT, THE ROSTER SAYS SO.
    //
    // Three signals, because one is not enough on a wall of near-identical
    // plates: the bottom of the bay fades into the plate so the cut cannot be
    // mistaken for an edge, the gutter carries a real machined scrollbar
    // instead of the platform's invisible overlay, and the foot rail — which
    // used to sit flush against the clip line printing a panel code — states
    // the count that is still below in words.
    //
    // No tabindex on the grid: it is a role="radiogroup" whose children are
    // focusable, and a focusable group is both an ARIA contract violation and a
    // fourth tab stop in front of Confirm. Keyboard reach is handled where it
    // belongs, in handleRosterKeys, which scrolls the focused card into view.
    // ---------------------------------------------------------------------
    function markRosterScrollState() {
        if (!modalRef) return;
        const grid = modalRef.querySelector('.race-grid');
        const shell = modalRef.querySelector('.race-grid-shell');
        if (!grid || !shell) return;
        const more = shell.querySelector('.race-grid-foot-more');
        const apply = () => {
            const scrolls = getComputedStyle(grid).overflowY === 'auto';
            const was = shell.classList.contains('is-scrollable');
            // Hysteresis. The state reserves a scrollbar gutter, which narrows
            // the cards, which shortens their ports, which can make the content
            // fit — and dropping the state then widens them again and makes it
            // overflow. Coming OUT of the state therefore needs enough clearance
            // to survive giving the gutter back; going in only needs a pixel.
            const overflows = scrolls && (was
                ? grid.scrollHeight > grid.clientHeight - 18
                : grid.scrollHeight > grid.clientHeight + 1);
            // Measured before anything is written, for the same reason the
            // dossier's pass is: toggling the state changes the bay's gutter, so
            // reading twelve card rects after the toggle forces a second full
            // layout of the roster on every pass.
            let text = '';
            if (overflows) {
                const floor = grid.getBoundingClientRect().bottom;
                const hidden = Array.from(grid.querySelectorAll('.race-card'))
                    .filter(c => c.getBoundingClientRect().bottom > floor + 1).length;
                text = hidden
                    ? `${hidden} more below ▼ scroll or use the arrow keys`
                    : 'scroll for the rest of the roster';
            }
            shell.classList.toggle('is-scrollable', overflows);
            // The roster's DESCRIPTION, not a fourth tab stop. A screen reader
            // entering the radiogroup hears "Faction roster, radio group, 4 more
            // below, scroll or use the arrow keys" — which is the fact that
            // matters — while the group itself stays unfocusable, as a group
            // with focusable children must be, and the tab order stays at three
            // stops. The arrows already scroll what they walk onto.
            if (overflows) grid.setAttribute('aria-describedby', 'rsRosterMore');
            else grid.removeAttribute('aria-describedby');
            if (!more) return;
            more.hidden = !overflows;
            if (more.textContent !== text) more.textContent = text;
        };
        apply();
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
            // loading="lazy" on these three and on nothing else. The twelve
            // crests ARE the roster and every one of them is on screen from the
            // first frame, so deferring them would be deferring the screen; the
            // hull sheet is the last instrument in a scrolling dossier and is
            // below the fold on the shorter viewports, where three 30 KB fetches
            // competing with the crests is three fetches too many. Chrome still
            // loads them immediately when they are in view — this only changes
            // their priority and their behaviour when they are not.
            return '<span class="race-fleet-bay">'
                 + '<span class="race-fleet-port">'
                 + `<img class="race-fleet-art"${artAttrs(hull.src, HULL_1X[hull.src])} alt="${altText}"`
                 + ' width="160" height="160" loading="lazy" decoding="async" draggable="false">'
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
    //
    // AND IT IS THE ONLY PLACE THE WORDS "FACTION LOCKED" APPEAR.
    // They used to be stamped on the global confirm plate, which made a locked
    // faction's gate look like a verdict on the player's whole session rather
    // than a fact about the faction they are reading. The gate says it here,
    // next to the faction it is true of, and — when there is one — it also names
    // the faction the confirm plate is still holding, so the reassurance is
    // where the confusion is instead of 900px away.
    function heroGate(race) {
        const premium = race.unlockType === 'premium';
        const amount = race.unlockRequirement && race.unlockRequirement.amount;
        return `
            <span class="race-hero-gate" data-gate="${gateKind(race)}">
                <i class="race-hero-gate-flag">${lockGlyph()}</i>
                <span class="race-hero-gate-body">
                    <b>Faction locked</b>
                    <em>${esc(unlockObjective(race))}</em>
                    <!-- The gate lives INSIDE the hero plate, which is
                         overflow:hidden at a height set by the medallion beside
                         it, so this line has a hard two-line budget at 1366x768.
                         The channel name (SERVICE RECORD / REQUISITION) is not
                         prefixed here for that reason: it is already stencilled
                         on this faction's own roster card, and pushing this to a
                         third line clipped the mechanism off the plate. -->
                    <small>${unlockMechanism(race)}</small>
                </span>
                ${premium ? `<button type="button" class="race-purchase-btn">Unlock $${esc(amount)}</button>` : ''}
            </span>
        `;
    }

    // The retention notice, and it is a SIBLING of the hero rather than a line
    // inside its gate. The hero plate is `overflow: hidden` with a min-height set
    // by the medallion beside it, so anything added to the gate is clipped the
    // moment a faction's objective runs to two lines — which is exactly what
    // happened to the first draft of this notice: it lost the faction name off
    // the bottom edge, on the one message whose whole job is to name a faction.
    //
    // Full width, directly under the plate, first thing above the fold. It is
    // only drawn where it is both true and useful: a locked faction being read
    // while an authorized one is already chosen.
    function heldStrip(race) {
        if (race.unlocked || selectedRace === null || selectedRace === Number(race.id)) {
            return '';
        }
        const held = unlockedRaces.find(r => r.id === selectedRace);
        if (!held) return '';
        return '<div class="race-detail-held"><i aria-hidden="true"></i>'
             + `<span>Your pick is unchanged &mdash; confirm still takes <b>${esc(held.name)}</b></span></div>`;
    }

    // HOW a gate opens, not just what it asks for.
    //
    // "Win 3 games" is a number with no frame around it, and the two questions a
    // player actually has are the ones it does not answer: does this reset when
    // I leave, and does it have to happen in ONE match. Both answers are good
    // news and both are provable from the engine — server/lib/races.js reads the
    // user_stats row, which is a lifetime total per account, and re-checks the
    // gate on every visit to this screen — so saying so is the difference
    // between a wall and a goal.
    function unlockMechanism(race) {
        switch (race.unlockType) {
            case 'achievement':
                return 'Counts across every match &middot; unlocks for good';
            case 'referral':
                return 'Counts for your whole account &middot; unlocks for good';
            case 'premium':
                return 'One purchase &middot; yours in every match from then on';
            default:
                return 'Authorization is granted per account';
        }
    }

    function confirmSelection() {
        if (!selectedRace) {
            return;
        }

        detachParallax();
        clearRegistryTimers();
        registryState = 'idle';
        rosterSignature = '';
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }
        if (modalRef) {
            modalRef.remove();
            modalRef = null;
        }
        // Unseal FIRST. Everything the host does next — the waiting view, its
        // Leave Game button, its Choose / Change control — lives in the subtree
        // this dialog made inert, and a seal that outlives the dialog is a
        // locked-out player rather than a cosmetic bug.
        releaseBackground();

        // THE HANDOFF RUNS AFTER THE HOST, NOT BEFORE IT.
        //
        // Removing the dialog drops focus to <body>, so something has to catch
        // it — but the thing worth catching it with is the view that REPLACES
        // this one, and that view does not exist yet at this line: the callback
        // sends `//joingame` / `//changerace` over the socket and the waiting
        // room is rendered when the server answers. Handing focus back to the
        // lobby control here and letting the host re-render on top of it is how
        // a player who just made the one permanent choice in the game ended up
        // on <body> with the next Tab restarting at a.hud-brand.
        const restore = restoreFocusTo;
        restoreFocusTo = null;

        if (onSelectCallback) {
            onSelectCallback(selectedRace);
            onSelectCallback = null;
        }

        handOffFocus(restore);
    }

    // Somewhere to put a keyboard player down, in order of how much it tells
    // them: the waiting room the dialog became, then the control the dialog was
    // opened from, then the lobby's own primary action.
    function focusTarget(restore, waitingOnly) {
        const view = document.querySelector('.waiting-view');
        if (view) {
            const first = firstFocusable(view);
            if (first) return first;
            // No control in it yet (the countdown view is a paragraph and two
            // chips). The container itself takes the focus so the announcement
            // still lands on the thing that just appeared.
            if (!view.hasAttribute('tabindex')) view.setAttribute('tabindex', '-1');
            return view;
        }
        // The waiting room arrives on the socket, not on this stack — so for the
        // first few frames "not yet" is the right answer rather than the lobby
        // fallback, or the handoff always wins the race and never lands on the
        // view the player is actually waiting for.
        if (waitingOnly) return null;
        if (isRestorable(restore)) return restore;
        return document.getElementById('createGameBtn');
    }

    function firstFocusable(root) {
        const candidates = root.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),'
          + ' textarea:not([disabled]), [tabindex]'
        );
        for (const el of candidates) {
            if (el.tabIndex >= 0 && (el.offsetWidth > 0 || el.offsetHeight > 0)) return el;
        }
        return null;
    }

    function isRestorable(el) {
        return !!el
            && el !== document.body
            && el.nodeType === 1
            && typeof el.focus === 'function'
            && document.contains(el);
    }

    // How long the handoff holds out for the waiting room, and how long it keeps
    // watch in total.
    const HANDOFF_WAIT_MS = 800;
    const HANDOFF_WINDOW_MS = 1500;

    // ASSERT THE OUTCOME. focus() is not a promise and it fails SILENTLY — on a
    // hidden element, on an inert ancestor, and on <body>, which is precisely
    // how the old restore no-opped in plain sight for so long. So the result is
    // read back rather than assumed, and the handoff keeps watch for a beat
    // afterwards: the host renders the waiting room from a socket reply, and it
    // re-renders that whole subtree on every later lobby update, either of which
    // can drop focus back onto <body> a frame after this call returned.
    //
    // It only ever acts when NOTHING holds focus, so it cannot take a cursor off
    // a control the player moved it to themselves.
    function handOffFocus(restore, startedAt) {
        // A console reopened inside the watch window (the waiting room's
        // Choose / Change) owns focus from that point on, and everything this
        // function would reach for is sealed inert behind it. Stand down.
        if (modalRef) {
            return;
        }
        const started = startedAt || Date.now();
        const elapsed = Date.now() - started;
        const active = document.activeElement;
        if (!active || active === document.body) {
            const target = focusTarget(restore, elapsed < HANDOFF_WAIT_MS);
            if (target) {
                target.focus({ preventScroll: true });
            }
        }
        if (elapsed < HANDOFF_WINDOW_MS) {
            window.requestAnimationFrame(() => handOffFocus(restore, started));
        }
    }

    function purchaseRace(raceId) {
        const race = unlockedRaces.find(r => r.id === raceId);
        if (!race || race.unlockType !== 'premium') return;

        window.location.href = `/purchase-race.html?race=${encodeURIComponent(raceId)}`;
    }

    // Handle server response with unlocked races.
    //
    // A payload this screen cannot read used to end at console.error and a blank
    // lobby — the same dead end as a dropped request. It now lands in the error
    // state inside the dialog, which has a Retry that re-fires the request, so
    // there is no path through this module that leaves a player with nothing to
    // press.
    function handleUnlockedRaces(data) {
        if (typeof onSelectCallback !== 'function') {
            return;
        }
        let races = null;
        try {
            races = JSON.parse(data);
        } catch (e) {
            console.error('Error parsing race data:', e);
            if (modalRef) {
                renderRegistryError('The registry sent a roster this console could not read.');
            }
            return;
        }
        if (!Array.isArray(races)) {
            if (modalRef) renderRegistryError('The registry sent no faction list.');
            return;
        }
        showRaceSelection(races);
    }

    return {
        initialize,
        handleUnlockedRaces,
        purchaseRace
    };
})();

// Make purchaseRace globally accessible for onclick
window.RaceSelection = RaceSelection;

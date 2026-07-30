/**
 * ui.js - Client-side map visualization system
 *
 * Implements the interactive galaxy map using SVG for visualization.
 * Handles sector rendering, selection, and status updates.
 * This is the GalaxyMap module for the client-side UI.
 *
 * This module is client-side only and does not directly access the database.
 * It communicates sector selections to the server via the main code.
 *
 * Dependencies:
 * - Used by game.js for map rendering and interaction
 */
// Forward map updates to the 3D galaxy view; queue them if it hasn't loaded yet
// (galaxy3d.js is an ES module, so it executes after the classic scripts).
function g3dCall(method, ...args) {
    if (window.Galaxy3D && typeof window.Galaxy3D[method] === 'function') {
        window.Galaxy3D[method](...args);
    } else {
        (window.__g3dQueue = window.__g3dQueue || []).push([method, args]);
    }
}

window.GalaxyMap = (function() {
    // Sector status constants
    const SECTOR_STATUS = {
        UNKNOWN: 0,      // Gray - unexplored
        OWNED: 1,        // Green - controlled by player
        ENEMY: 2,        // Red - controlled by enemy
        HAZARD: 3,       // Brown/Orange - hazardous sector
        BLACKHOLE: 4,    // Black - black hole
        COLONIZED: 5,    // Blue-green - colonized owned sector
        HOMEWORLD: 6,    // Gold - homeworld
        WARPGATE: 7,     // Purple - contains warp gate
        ARTIFACT: 8,     // Cyan - contains artifact
        FLEET: 9         // Teal - your ships hold this unclaimed sector
    };

    // Status colors.
    //
    // OWNED and ENEMY moved apart on the LIGHTNESS axis, not the hue axis. The
    // old pair measured #40C040 (relative luminance 0.392) against #C04040
    // (0.152) — 2.18:1 — and under deuteranopia or protanopia both collapse to
    // the same yellow-brown, so "mine or theirs" was a hue judgement a
    // red-green colour-blind player could not make. #58D858 against #B03A3A is
    // 3.24:1, which survives full desaturation as light-green vs dark-red.
    // Hue is unchanged, so nothing a player has already learned is invalidated.
    const STATUS_COLORS = {
        [SECTOR_STATUS.UNKNOWN]: "#2e3442",
        [SECTOR_STATUS.OWNED]: "#58D858",
        [SECTOR_STATUS.ENEMY]: "#B03A3A",
        [SECTOR_STATUS.HAZARD]: "#C08040",
        [SECTOR_STATUS.BLACKHOLE]: "#202020",
        [SECTOR_STATUS.COLONIZED]: "#40C0A0",
        [SECTOR_STATUS.HOMEWORLD]: "#FFC040",
        [SECTOR_STATUS.WARPGATE]: "#8040C0",
        [SECTOR_STATUS.ARTIFACT]: "#40C0FF",
        [SECTOR_STATUS.FLEET]: "#3FC1C9"
    };

    // Stroke colors
    const STROKE_COLORS = {
        [SECTOR_STATUS.UNKNOWN]: "#596176",
        [SECTOR_STATUS.OWNED]: "#2c8f2c",
        [SECTOR_STATUS.ENEMY]: "#6d1f1f",
        [SECTOR_STATUS.HAZARD]: "#805020",
        [SECTOR_STATUS.BLACKHOLE]: "#000000",
        [SECTOR_STATUS.COLONIZED]: "#208060",
        [SECTOR_STATUS.HOMEWORLD]: "#C09020",
        [SECTOR_STATUS.WARPGATE]: "#602080",
        [SECTOR_STATUS.ARTIFACT]: "#2080C0",
        [SECTOR_STATUS.FLEET]: "#1F8A91"
    };

    // ---------------------------------------------------------------------
    // THE SECOND CHANNEL. Ten status fills cannot all be pulled 3:1 apart on
    // lightness — the range does not hold ten steps — so a state that a player
    // has to tell apart under a colour deficiency carries a TEXTURE as well as
    // a hue. Texture survives desaturation, survives dimming to memory opacity,
    // and costs nothing per tile: these are paint servers defined once, and a
    // tile just points its `fill` at one.
    //
    // The previous revision gave a texture to ENEMY, HAZARD and BLACKHOLE only,
    // and argued the rest could stay flat because "clean plate is itself the
    // mark for ground that is yours and safe". That argument does not survive
    // contact with the palette: measured relative-luminance contrast put your
    // COLONY against a sector your FLEET merely sits on at 1.05:1, FLEET
    // against ARTIFACT at 1.05:1, and OWNED against HOMEWORLD at 1.13:1. Those
    // are different OBJECTS — ground you can build on, ground you are only
    // parked on, a capital-class world, a relic — and they were separated by
    // hue alone, which is exactly the thing a colour-blind player does not have.
    //
    // So every state on the crowded green-cyan-blue-gold ramp now carries a
    // distinct GEOMETRY, and the geometries are chosen to survive being shrunk
    // to a ~50px cell and desaturated to grey:
    //
    //   OWNED      flat            — the reference state: bare ground you hold
    //   COLONIZED  vertical rows   — worked ground, a settled world
    //   HOMEWORLD  dense grid      — a built-up capital
    //   FLEET      horizontal bars — an open lattice: ships, not ground
    //   ARTIFACT   dot field       — something scattered and found
    //   WARPGATE   chevrons        — direction, transit
    //   ENEMY      crossed blades  — unchanged, and quoted from the map key
    //   HAZARD     caution stripes — unchanged
    //   BLACKHOLE  void            — unchanged in meaning, redrawn below
    //
    // Hue is untouched. Nothing a player has already learned is invalidated;
    // they gain a channel rather than swapping one.
    // ---------------------------------------------------------------------
    const STATUS_TEXTURE = {
        [SECTOR_STATUS.ENEMY]: "gm-tex-enemy",
        [SECTOR_STATUS.HAZARD]: "gm-tex-hazard",
        [SECTOR_STATUS.BLACKHOLE]: "gm-tex-void",
        [SECTOR_STATUS.COLONIZED]: "gm-tex-colony",
        [SECTOR_STATUS.HOMEWORLD]: "gm-tex-home",
        [SECTOR_STATUS.FLEET]: "gm-tex-fleet",
        [SECTOR_STATUS.ARTIFACT]: "gm-tex-relic",
        [SECTOR_STATUS.WARPGATE]: "gm-tex-gate"
    };

    function statusPaint(status) {
        const texture = STATUS_TEXTURE[status];
        return texture ? `url(#${texture})` : STATUS_COLORS[status];
    }

    const PATTERN_DEFS_ID = 'galaxymap-chart-defs';
    function ensurePatternDefs() {
        if (typeof document === 'undefined' || document.getElementById(PATTERN_DEFS_ID)) return;
        const svgNS = "http://www.w3.org/2000/svg";
        const host = document.createElementNS(svgNS, "svg");
        host.setAttribute("id", PATTERN_DEFS_ID);
        host.setAttribute("width", String(Object.keys(STATUS_TEXTURE).length));
        host.setAttribute("height", "1");
        host.setAttribute("focusable", "false");
        // Genuinely decorative: it holds paint servers and draws nothing legible.
        // The meaning each texture carries is also in the tile's accessible name.
        host.setAttribute("aria-hidden", "true");
        // ONE PIXEL PER TEXTURE, PAINTED AT SETUP.
        //
        // The first time a tile points its `fill` at a pattern, Blink builds that
        // paint server, and it does it synchronously inside whatever task made
        // the assignment. Measured: a 112-tile sweep that assigns flat colours
        // costs 31ms, and the same sweep assigning the eight textures for the
        // first time costs 98ms — a ~67ms hitch landing on the first map
        // snapshot, which is the exact moment the player is watching the chart
        // fill in. Referencing each pattern once here, from a strip the size of a
        // full stop, moves that cost into setup where nothing is animating.
        // The strip must be REAL — a 0x0 host paints nothing and primes nothing —
        // so it is one CSS pixel tall, inert, and behind everything.
        host.style.position = 'absolute';
        host.style.left = '0';
        host.style.top = '0';
        host.style.zIndex = '-1';
        host.style.opacity = '0.01';
        host.style.pointerEvents = 'none';
        host.style.overflow = 'hidden';
        // patternUnits="userSpaceOnUse" resolves in the REFERENCING element's
        // user space, which for every tile is its own 100 x 86.6 viewBox — so
        // one definition scales with the chart instead of needing a copy per
        // zoom level, and the hatch pitch stays constant relative to a cell.
        host.innerHTML = `
            <defs>
              <pattern id="gm-tex-enemy" patternUnits="userSpaceOnUse" width="12" height="12">
                <rect width="12" height="12" fill="${STATUS_COLORS[SECTOR_STATUS.ENEMY]}"/>
                <path d="M-3 3 L3 -3 M0 12 L12 0 M9 15 L15 9" fill="none" stroke="#5d1717" stroke-width="2.4"/>
                <path d="M-3 9 L3 15 M0 0 L12 12 M9 -3 L15 3" fill="none" stroke="#5d1717" stroke-width="2.4"/>
              </pattern>
              <pattern id="gm-tex-hazard" patternUnits="userSpaceOnUse" width="11" height="11"
                       patternTransform="rotate(45)">
                <rect width="11" height="11" fill="${STATUS_COLORS[SECTOR_STATUS.HAZARD]}"/>
                <rect width="11" height="4.4" fill="#6b3f14"/>
              </pattern>
              <pattern id="gm-tex-colony" patternUnits="userSpaceOnUse" width="9" height="9">
                <rect width="9" height="9" fill="${STATUS_COLORS[SECTOR_STATUS.COLONIZED]}"/>
                <rect width="3.2" height="9" fill="#1c6b53"/>
              </pattern>
              <pattern id="gm-tex-home" patternUnits="userSpaceOnUse" width="8" height="8">
                <rect width="8" height="8" fill="${STATUS_COLORS[SECTOR_STATUS.HOMEWORLD]}"/>
                <rect width="8" height="1.8" fill="#9d6c16"/>
                <rect width="1.8" height="8" fill="#9d6c16"/>
              </pattern>
              <pattern id="gm-tex-fleet" patternUnits="userSpaceOnUse" width="9" height="9">
                <rect width="9" height="9" fill="${STATUS_COLORS[SECTOR_STATUS.FLEET]}"/>
                <rect width="9" height="3.2" fill="#186970"/>
              </pattern>
              <!-- Coarse and high-contrast on purpose. A fine, low-contrast
                   stipple photographed as a FLAT tile at the shipped chart scale
                   (a cell is about 50px, so a 10-unit pattern pitch is 5.5px),
                   which put ARTIFACT back to being 1.05:1 of hue away from FLEET
                   with no second channel at all. A texture that does not survive
                   the size it ships at is not a second channel. -->
              <pattern id="gm-tex-relic" patternUnits="userSpaceOnUse" width="9" height="9">
                <rect width="9" height="9" fill="${STATUS_COLORS[SECTOR_STATUS.ARTIFACT]}"/>
                <circle cx="2.25" cy="2.25" r="2.5" fill="#12506f"/>
                <circle cx="6.75" cy="6.75" r="2.5" fill="#12506f"/>
              </pattern>
              <pattern id="gm-tex-gate" patternUnits="userSpaceOnUse" width="12" height="10">
                <rect width="12" height="10" fill="${STATUS_COLORS[SECTOR_STATUS.WARPGATE]}"/>
                <path d="M-1 8.5 L6 2.5 L13 8.5" fill="none" stroke="#431e69" stroke-width="2.3"
                      stroke-linejoin="round"/>
              </pattern>
              <radialGradient id="gm-tex-void-core">
                <stop offset="0.12" stop-color="#000000"/>
                <stop offset="0.58" stop-color="#0d0d12"/>
                <stop offset="1" stop-color="#2f2f38"/>
              </radialGradient>
              <!-- THE VOID MARK LIVES IN THE LABEL GAP, NOT ON TOP OF THE LABELS.
                   It used to be a concentric r=20 annulus with an r=7.5 core, both
                   centred on the tile — which is exactly where the sector number and
                   the marker letter are centred too, so the one tile type whose whole
                   job is to say "do not fly here" had its identifier cut by its own
                   decoration.
                   It is now an accretion disc seen EDGE ON: a flat lens that fits
                   inside the clear band between the two label rows (see LABEL_GAP
                   below), so it can never cross a glyph at any tile size. Reading it
                   as a disc rather than a ring is also simply truer to the object.

                   THIS MARK IS NOW THE WHOLE WARNING, so it is drawn to be seen. It
                   used to be a 1.5-unit stroke, which at the shipped chart scale of
                   0.4713 is 0.71 CSS px — a sub-pixel hairline on a lens 3.8px tall —
                   with the actual "do not enter" carried by a capital B stamped over
                   the sector number. On a chart whose entire label vocabulary is
                   digits, that B scanned as an 8: sector 32 read as "328". The letter
                   is gone (see the block above MARKER_WORDS) and the disc carries it: 3-unit
                   strokes (1.4px) and rims lifted out of the tile's own black. The
                   lens is trimmed to ry 3.4 so the 3-unit stroke still lands inside
                   LABEL_GAP (38.25..48.25) rather than reaching into the number's row. -->
              <pattern id="gm-tex-void" patternUnits="userSpaceOnUse" width="100" height="86.6">
                <rect width="100" height="86.6" fill="url(#gm-tex-void-core)"/>
                <ellipse cx="50" cy="43.3" rx="26" ry="3.4" fill="#0b0b11" stroke="#8e93b0" stroke-width="3"/>
                <ellipse cx="50" cy="43.3" rx="11" ry="2" fill="#000000" stroke="#575a70" stroke-width="1.4"/>
                <circle cx="50" cy="43.3" r="2.4" fill="#000000" stroke="#b9bdd6" stroke-width="1.4"/>
              </pattern>
            </defs>`
            // The priming strip. One 1x1 rect per texture, in the same order the
            // tiles will ask for them.
            + Object.keys(STATUS_TEXTURE).map((status, i) =>
                `<rect x="${i}" y="0" width="1" height="1" fill="url(#${STATUS_TEXTURE[status]})"/>`).join('');
        (document.body || document.documentElement).appendChild(host);
    }

    // ---------------------------------------------------------------------
    // TILE TYPE GEOMETRY, in the tile's own 100 x 86.6 user space.
    //
    // Everything below is derived from ONE constraint, so it is written down
    // once here rather than scattered as magic numbers down the file: the
    // selection reticle is a hexagon at r = 35 with an 8.5-unit casing, so its
    // flat top and bottom edges occupy y 8.74..17.24 and y 69.36..77.86, and
    // ANY glyph ink outside 17.5..69 is struck through by the ring on the one
    // cell the player has actually committed to. That is what used to happen to
    // the marker letter, which sat at y = 68.
    //
    // Inside that window there is room for two rows of type and not three. The
    // old layout stacked the number at 40, the fleet count at 55 and the marker
    // at 68 with a struck outline on each, so the number's halo ended at 42.25
    // and the fleet's began at 41.95 — they physically overlapped, and every
    // populated cell rendered its labels as one smear. So fleet and marker are
    // now ONE string on ONE baseline.
    //
    // Rows (ink extents include the TEXT_HALO outline struck around each):
    //   number, alone       baseline 50   ink 34.8..51.5   optically centred
    //   number, with a row  baseline 36   ink 20.8..37.5
    //   annotation          baseline 61   ink 45.8..62.5
    //
    // The widths are the same constraint read horizontally: the ring's flanks
    // close in as you move away from the tile's waist, so a row placed high or
    // low has less room than one at the centre. Text past these budgets is
    // condensed to fit rather than allowed to run under the ring.
    // ---------------------------------------------------------------------
    const NUMBER_Y_SOLO = 50;
    const NUMBER_Y_STACKED = 36;
    const ANNOTATION_Y = 61;
    const NUMBER_WIDTH_SOLO = 48;
    const NUMBER_WIDTH_STACKED = 33;
    const ANNOTATION_WIDTH = 38;

    // ---------------------------------------------------------------------
    // THE SIZE OF THE TYPE, DECIDED HERE FOR BOTH ROWS.
    //
    // The annotation row used to inherit 15 user units from style.css while the
    // number took 19. A tile ships 47.13 CSS px wide against a 100-unit viewBox,
    // so the chart scale is 0.4713 and those 15 units rendered at 7.07 px — with
    // a 4.5-unit outline, which is 1.06px on each side and therefore WIDER THAN
    // THE STEM. The counters closed and every 'F:12' came out as four smudges,
    // on the row carrying the time-critical number: how many ships are on that
    // cell. style.css's own comment condemns ~8px as sub-pixel illegible and
    // pins the sector number to 19 for exactly that reason; this row was left
    // under the floor. Both rows are now set here, inline, at the same 19 units
    // (~9 px), and the halo is cut to 3 units (1.4px total) so it stops eating
    // the letterforms it exists to carry.
    //
    // Setting both from ONE constant in this file also removes the last reason
    // to measure anything: Share Tech Mono is monospaced at 0.6 em, so at a
    // known size a string's width is its length times a constant, and the
    // getComputedTextLength() call that used to derive it — a forced synchronous
    // layout of all 112 tiles, paid on the first turn update the player watches —
    // is simply gone. 19 x 0.6 = 11.4, which is what that call used to measure.
    // ---------------------------------------------------------------------
    const TEXT_SIZE = 19;
    const TEXT_HALO = 3;
    const GLYPH_ADVANCE = TEXT_SIZE * 0.6;

    // Written once per node at creation, not per update: neither value ever
    // changes, and the hot path is already 112 tiles wide on a turn boundary.
    function styleTypeRow(node) {
        node.style.fontSize = `${TEXT_SIZE}px`;
        node.style.strokeWidth = `${TEXT_HALO}px`;
    }

    // ---------------------------------------------------------------------
    // GLYPH INK, AND WHICH WAY ROUND IT GOES.
    //
    // Every numeral used to be light with a near-black outline under it, on the
    // theory that the outline was the background the glyph had to contrast
    // against. It is not. style.css strikes its outline around a 19-unit glyph,
    // which at the shipped chart scale (0.4713) is well under one CSS pixel on
    // each side of a 9px numeral — a fringe anti-aliasing eats, not a plate.
    // WCAG measures the glyph against what is actually behind it, and what is
    // behind it is the TILE. Light ink measured 1.44:1 on homeworld gold, 1.62:1
    // on a world you own and 2.00:1 on a colony: on precisely the tiles a player
    // navigates by, the sector number was a pale smudge. The memory tier was
    // worse still, because it dimmed the ink TOWARDS the fill it sits on.
    //
    // So the ink flips with the plate: dark ink under a light halo on a bright
    // tile, light ink over a dark halo on a dark one. Which tiles count as
    // bright is not hand-listed and not a taste judgement — it is measured
    // below, once, from the same STATUS_COLORS the tiles are painted with,
    // blended over the chart plate at the opacity style.css dims that intel tier
    // to. Deriving it matters because the crossover MOVES with the tier: HAZARD
    // is a bright amber plate while live and a dark brown one at memory opacity,
    // and it needs opposite ink in the two states. A hand-written list would go
    // quietly wrong the day either the palette or that opacity changed, and the
    // failure mode is text you cannot read.
    //
    // The tier itself is NOT carried by the ink any more. It never needed to be:
    // a remembered tile is already dimmed, dashed, and says so in the tooltip
    // and in its accessible name. Dimming the ink as well was the one channel
    // that cost legibility to say something three other channels already said.
    // ---------------------------------------------------------------------
    // Full black and full white, not the HUD's #05070D ink and #EAF1FC bright.
    // Those tokens exist to keep large areas of the console in one family; at a
    // 9px glyph the cast is invisible and the last 4% of luminance is not. The
    // tightest square on the board is a remembered FLEET tile — mid-teal dimmed
    // to 0.62 sits almost exactly on the crossover, where NEITHER token reaches
    // 4.5:1 (4.39 light, 4.37 dark) and the two pure ends do (4.61 and 4.56).
    const INK_ON_DARK = "#FFFFFF";
    const INK_ON_LIGHT = "#000000";
    const INK_FOG = "#7A8AA6";
    const HALO_ON_DARK = "rgba(0,0,0,0.92)";
    const HALO_ON_LIGHT = "rgba(240,246,255,0.92)";
    // Mirrors `#minimapid path[data-intel=...]` in style.css and the chart
    // plate's own gradient. Fog needs no entry: a fogged tile is painted
    // UNKNOWN_FILL whatever its status, so its ink is the same on all of them.
    const TILE_ALPHA = { live: 1, memory: 0.62 };
    const CHART_BACKDROP = "#0a1322";

    function channels(hex) {
        const value = parseInt(String(hex).replace('#', ''), 16);
        return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    }
    function relativeLuminance(rgb) {
        const linear = rgb.map(c => {
            const s = c / 255;
            return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }
    function contrastRatio(a, b) {
        const la = relativeLuminance(a);
        const lb = relativeLuminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
    // What the player's eye actually receives off a tile: the status colour at
    // the tier's opacity, composited onto the chart plate behind it.
    function effectiveFill(hex, alpha) {
        const fill = channels(hex);
        const back = channels(CHART_BACKDROP);
        return fill.map((c, i) => c * alpha + back[i] * (1 - alpha));
    }

    const INK_PLAN = (function buildInkPlan() {
        const plan = {};
        const dark = channels(INK_ON_LIGHT);
        const light = channels(INK_ON_DARK);
        Object.keys(STATUS_COLORS).forEach(status => {
            const tiers = { fog: { fill: INK_FOG, stroke: HALO_ON_DARK } };
            Object.keys(TILE_ALPHA).forEach(intel => {
                const seen = effectiveFill(STATUS_COLORS[status], TILE_ALPHA[intel]);
                tiers[intel] = contrastRatio(dark, seen) > contrastRatio(light, seen)
                    ? { fill: INK_ON_LIGHT, stroke: HALO_ON_LIGHT }
                    : { fill: INK_ON_DARK, stroke: HALO_ON_DARK };
            });
            plan[status] = tiers;
        });
        return plan;
    })();

    function inkFor(sector) {
        const tiers = INK_PLAN[sector.status] || INK_PLAN[SECTOR_STATUS.UNKNOWN];
        return tiers[sector.intel] || tiers.fog;
    }

    const UNKNOWN_FILL = "#101522";
    const UNKNOWN_STROKE = "#263149";
    const MEMORY_OPACITY = "0.50";

    // Spoken form of each status. The chart says these in colour; a screen reader,
    // and a colour-blind player reading the tooltip, need the word.
    const STATUS_WORDS = {
        [SECTOR_STATUS.UNKNOWN]: "unclaimed",
        [SECTOR_STATUS.OWNED]: "yours",
        [SECTOR_STATUS.ENEMY]: "enemy held",
        [SECTOR_STATUS.HAZARD]: "hazard, unclaimed",
        [SECTOR_STATUS.BLACKHOLE]: "black hole, do not enter",
        [SECTOR_STATUS.COLONIZED]: "your colony",
        [SECTOR_STATUS.HOMEWORLD]: "homeworld",
        [SECTOR_STATUS.WARPGATE]: "warp gate",
        [SECTOR_STATUS.ARTIFACT]: "artifact",
        [SECTOR_STATUS.FLEET]: "your fleet holds it, unclaimed"
    };

    // The single letters stamped into a tile, spelled out. The key in game.html
    // teaches these to a sighted player; nothing taught them to anyone else.
    const MARKER_WORDS = {
        H: "home",
        C: "colony ship",
        T: "orbital turret",
        W: "warp gate",
        E: "enemy fleet",
        P: "probe lost",
        B: "black hole",
        A: "artifact"
    };

    // NO LETTER IS STAMPED ON A BLACK HOLE ANY MORE.
    //
    // This module used to add its own "B" to the marker string, because
    // mapFlagsToIndicator() in connect.js has no bit for a black hole and the
    // most dangerous cell on the chart was otherwise relying on colour alone.
    // But B is a glyph the number alphabet contains the shape of: rendered a
    // size step below the sector number, in the same white mono, on a chart
    // whose entire label vocabulary is digits, tile 32 read as "328". It was
    // also the only annotation the chart ever drew as a bare letter — every
    // other one carries an "X:" prefix — and the MAP KEY teaches H, C, T, W, E
    // and P but never taught B, so it was a glyph the legend could not decode.
    //
    // The warning is carried by the accretion disc in gm-tex-void instead, drawn
    // at a stroke that survives a 47px cell, and by STATUS_WORDS / hazardWords in
    // the accessible name and the readout panel ("black hole, do not enter",
    // "Lethal: a fleet entering is lost"). A shape, not a letter.

    // How hard the annotation may be condensed before it stops being type and
    // starts being a smear. Below this the row drops content instead — see
    // annotationText — because a legible "F:12" beats an illegible "F:12 HT",
    // and the tooltip and the accessible name carry the full marker set anyway.
    const ANNOTATION_MIN_SQUEEZE = 0.80;

    // Internal state
    let state = {
        initialized: false,
        width: 14,
        height: 8,
        sectors: {},
        selectedSector: null,
        containerElement: null,
        tooltip: null,
        lastHoverSound: 0,
        // Lattice origin inside the bezel. The chart used to be pinned to the
        // container's top-left corner, so whichever axis was not the binding
        // constraint left a dead strip down one side of the instrument.
        offsetX: 0,
        offsetY: 0,
        // Roving tabindex: the chart is ONE tab stop, not 112. This is the id of
        // the tile currently carrying tabindex="0".
        rovingId: null,
        focusedId: null,
        keysBound: false,
        focusRing: null,
        selectRing: null,
        // Tiles currently lifted above their neighbours so a reticle is not drawn
        // under the next cell along; kept so only the two that changed are touched.
        raisedTiles: new Set(),
        // True for the duration of a mousedown, so focusin can tell a click from a Tab.
        pointerFocus: false,
        // Tiles currently carrying the sensor-coverage outline, so the next
        // selection clears exactly those instead of sweeping all 112.
        sensorTiles: [],
        // True once the player has moved the chart cursor themselves. Until then
        // the module is allowed to re-park it (see parkOnHomeworld).
        rovingUserMoved: false,
        homeParked: false,
        // Which sector the tooltip is currently describing, or null when hidden.
        tooltipSectorId: null,
        // The hover bridge and the Escape dismissal: a pending close, whether the
        // pointer is on the panel itself, and which sector's panel the player
        // dismissed. See createTooltip / releaseTooltip.
        tooltipHold: null,
        tooltipHovered: false,
        tooltipDismissed: null,
        // The chart's arrow-key hint is shown once, on first keyboard arrival.
        hintShown: false,
        // Set when the server revises the sector the open panel is describing:
        // the panel's contents are no longer true and the fast path must not
        // serve them.
        tooltipStale: false
    };

    // ---------------------------------------------------------------------
    // Chart chrome that has to travel with the behaviour rather than with the
    // theme. Whether a tile is focusable at all is decided in this file (see the
    // roving tabindex above), so the focus ring is decided here too — a ring
    // living in a stylesheet this module does not own can silently stop matching
    // the day this markup changes, and an unfocusable-looking focus is the exact
    // defect being fixed. Scoped to #minimapid so it cannot leak into the HUD.
    // ---------------------------------------------------------------------
    const CHART_STYLE_ID = 'galaxymap-chart-style';
    function ensureChartStyle() {
        if (typeof document === 'undefined' || document.getElementById(CHART_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = CHART_STYLE_ID;
        style.textContent = [
            // OVERFLOW: VISIBLE IS LOAD-BEARING. A tile is an <svg> element and the
            // UA stylesheet gives every outermost <svg> `overflow: hidden`, so the
            // previous `border-radius: 50%` did not merely round a focus outline —
            // it clipped the TILE to the ellipse inscribed in its 100x86.6 box. The
            // four hex corners at (25,0),(75,0),(25,86.6),(75,86.6) were cut by 5.8
            // user units, which put a notch at every three-hex junction of the
            // lattice and opened lens-shaped gaps between neighbours that should
            // share an edge, and it sliced the corners off the focus reticle so the
            // keyboard cursor read as a scalloped circle on a hexagonal cell.
            //
            // The focus ring is the SVG reticle (buildReticle('focus')): one shape
            // language, dashed for the cursor and solid for the selection, both
            // hexagons on a hex chart. border-radius survives only to shape the
            // box-shadow below, and it no longer clips anything.
            '#minimapid [role="option"] { outline: none; cursor: pointer; overflow: visible; border-radius: 50%; }',
            // The lamp. A focused cell is raised above its neighbours anyway (see
            // mountReticle); this is what that lift LOOKS like from across the
            // board — a low amber bloom under the cell, so the chart reads as
            // holding keyboard focus before you have found which cell the cursor
            // is on. It is DELIBERATELY blurred and shapeless: a hard-edged
            // shadow here is shaped by border-radius, and any border-radius on a
            // hexagon draws a second silhouette that fights the reticle, which is
            // exactly what this rule used to get wrong. The mark that says WHICH
            // cell is the hexagonal reticle; this only says THAT the chart is live.
            '#minimapid [role="option"]:focus { box-shadow: 0 0 12px 1px rgba(240,162,51,0.50); }',
            // A cell focused by a click already has the pointer on it and the
            // survey panel open beside it, so the lamp drops to a hint.
            '#minimapid [role="option"]:focus:not(:focus-visible) { box-shadow: 0 0 8px 0 rgba(240,162,51,0.22); }',
            '#minimapid .chart-reticle { pointer-events: none; }',

            // ------------------------------------------------------------------
            // THE HINT THAT THE CHART IS ARROW-DRIVEN.
            //
            // It already existed — "Arrow keys move the cursor, Enter selects the
            // sector" — but only inside the listbox's aria-label, which a sighted
            // keyboard or gamepad player never hears. What they got instead was
            // one tile lighting up and Tab immediately leaving the instrument,
            // from which the reasonable conclusion is that the chart is mouse-only:
            // the roving tabindex made invisible to the players it was built for.
            //
            // So on the chart's FIRST keyboard arrival it is printed as well, once,
            // in the same stencil as the instrument's bottom rail, across the top
            // of the plate where the corner ticks leave the middle clear. It is
            // decoration to assistive tech — the aria-label already says it — and
            // inert to the pointer.
            // ------------------------------------------------------------------
            '#minimapid .chart-keyhint {'
                + 'position: absolute; top: 7px; left: 50%; transform: translateX(-50%);'
                + 'z-index: 8; pointer-events: none; max-width: calc(100% - 56px);'
                + 'padding: 3px 9px 2px; text-align: center;'
                + 'background: rgba(7,10,17,0.94);'
                + 'border: 1px solid var(--ink, #05070d);'
                + 'box-shadow: inset 1px 1px 0 rgba(176,198,232,0.16), 0 2px 8px rgba(0,0,0,0.72);'
                + 'font-family: var(--font-mono, "Share Tech Mono", monospace); font-size: 9px;'
                + 'letter-spacing: 0.14em; color: var(--bronze, #c79a47); text-shadow: 0 1px 0 #000;'
                + 'opacity: 1; transition: opacity 520ms linear;'
            + '}',
            '#minimapid .chart-keyhint[data-fading="true"] { opacity: 0; }',

            // ------------------------------------------------------------------
            // The readout plate. This panel was the last rounded translucent glass
            // card in a console of square beveled plates: 10px radius, a hairline
            // white rim and a 0.92 alpha body, appearing over the instrument dozens
            // of times a minute. It is now built like SECTOR SURVEY, MAP KEY and
            // RECENT EVENTS — square corners, ink border, inset light rim, Russo
            // One caps head with a mono panel code, mono field labels. Plain
            // neutral border; the only colour is on the type.
            // ------------------------------------------------------------------
            // NOT `pointer-events: none`. The panel is the only place the chart
            // prints yields, buildings and the terrain line, and a player who
            // wants to magnify or select that text has to be able to put a
            // pointer on it — WCAG 2.1 AA 1.4.13 requires exactly that. It used
            // to evaporate as the cursor travelled towards it, because the tile's
            // own mouseleave hid it and the panel could not receive the mouseenter
            // that would have kept it alive. It can now: see the hover bridge in
            // createTooltip().
            '#sector-tooltip {'
                + 'position: fixed; z-index: 2000; display: none;'
                + 'min-width: 196px; max-width: 300px; padding: 0;'
                + 'border: 2px solid var(--ink, #05070d); border-radius: 3px;'
                + 'background: linear-gradient(180deg, #151b28 0, #0d121c 58%, #090d15 100%);'
                + 'box-shadow: inset 2px 2px 0 rgba(176,198,232,0.22),'
                + ' inset 3px 3px 14px rgba(0,0,0,0.85), 0 10px 24px rgba(0,0,0,0.62);'
                + 'font-family: var(--font-ui, "Rajdhani", "Segoe UI", sans-serif);'
                + 'color: var(--text, #cdd6e6); font-size: 13px; line-height: 1.32;'
            + '}',
            '#sector-tooltip .tip-head {'
                + 'display: flex; align-items: baseline; justify-content: space-between; gap: 12px;'
                + 'padding: 5px 9px 4px;'
                + 'background: linear-gradient(180deg, rgba(176,198,232,0.09), rgba(0,0,0,0.30));'
                + 'border-bottom: 1px solid rgba(0,0,0,0.78);'
                + 'box-shadow: 0 1px 0 rgba(176,198,232,0.10);'
            + '}',
            '#sector-tooltip .tip-name {'
                + 'font-family: var(--font-head, "Russo One", sans-serif); font-size: 11.5px;'
                + 'letter-spacing: 0.05em; text-transform: uppercase; color: var(--amber-hi, #ffce80);'
            + '}',
            '#sector-tooltip .tip-code {'
                + 'font-family: var(--font-mono, "Share Tech Mono", monospace); font-size: 10px;'
                + 'letter-spacing: 0.14em; color: var(--stencil, #a3adc0); white-space: nowrap;'
            + '}',
            '#sector-tooltip .tip-body { padding: 6px 9px 7px; }',
            '#sector-tooltip .tip-class {'
                + 'font-family: var(--font-mono, "Share Tech Mono", monospace); font-size: 10px;'
                + 'letter-spacing: 0.12em; text-transform: uppercase; color: var(--bronze, #c79a47);'
                + 'margin-bottom: 5px;'
            + '}',
            '#sector-tooltip .tip-rows { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; }',
            '#sector-tooltip .tip-k {'
                + 'font-family: var(--font-mono, "Share Tech Mono", monospace); font-size: 10px;'
                + 'letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted, #8b94a8);'
                + 'align-self: center;'
            + '}',
            '#sector-tooltip .tip-v { color: var(--bright, #eef3fb); }',
            '#sector-tooltip .tip-lore {'
                + 'margin-top: 7px; padding-top: 6px; border-top: 1px solid rgba(0,0,0,0.7);'
                + 'box-shadow: inset 0 1px 0 rgba(176,198,232,0.10);'
                + 'color: var(--stencil, #a3adc0); font-style: italic; line-height: 1.35; max-width: 280px;'
            + '}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(style);
    }

    // Hexagon outline in the tile's own viewBox (0 0 100 86.6). Shared by the
    // tile itself and by both reticles so a ring can never drift off the shape.
    function hexPathData(radius) {
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            points.push(`${(50 + radius * Math.cos(angle)).toFixed(2)},${(43.3 + radius * Math.sin(angle)).toFixed(2)}`);
        }
        return `M ${points.join(" L ")} Z`;
    }

    /**
     * The two reticles are SINGLETONS that get re-parented into whichever tile
     * owns them, not 112 hidden copies: only one tile is focused and only one is
     * selected, so 224 permanently-parked nodes would be 224 nodes of layout and
     * paint cost for two visible rings.
     *
     * Each is a dark casing stroke under a bright stroke. The chart's fills run
     * from black-hole black to homeworld gold, so a single-colour ring is
     * invisible on at least one legal tile; the casing is what makes one ring
     * legible on all of them.
     */
    function buildReticle(kind) {
        const svgNS = "http://www.w3.org/2000/svg";
        const group = document.createElementNS(svgNS, "g");
        group.setAttribute("class", `chart-reticle chart-reticle-${kind}`);
        // Genuinely decorative: focus is carried by DOM focus and selection by
        // aria-selected, both on the option itself. This is the picture of them.
        group.setAttribute("aria-hidden", "true");
        group.style.pointerEvents = "none";

        // Nested with a gap the eye can resolve. Both rings used to sit at 47 and
        // 39 with 8-unit casings, which is 43..51 against 34.75..43.25 — they
        // touched, and only the clipping that ate the outer ring's corners made
        // them look separate. 47 against 35 leaves a clear 3.75-unit channel, so
        // a cell that is both focused and selected reads as two marks.
        const focus = kind === 'focus';
        const d = hexPathData(focus ? 47 : 35);
        const layers = focus
            ? [["#05070c", "8"], ["#ffcf6b", "4.5"]]
            : [["#05070c", "8.5"], ["#ffffff", "4.5"]];
        layers.forEach(([stroke, width], layer) => {
            const ring = document.createElementNS(svgNS, "path");
            ring.setAttribute("d", d);
            ring.setAttribute("fill", "none");
            ring.setAttribute("stroke", stroke);
            ring.setAttribute("stroke-width", width);
            ring.setAttribute("stroke-linejoin", "round");
            // SOLID CASING, DASHED FACE. The casing has to be continuous or the
            // whole ring disappears on a homeworld: amber dashes on gold are
            // amber on gold, and if the dark layer is dashed too there is nothing
            // left holding the edge. Continuous dark reads on every bright fill,
            // the amber dashes read on every dark one, and the dash pattern is
            // what tells the cursor apart from the solid selection ring without
            // relying on the colour of either.
            // 9.4 + 4.7 = 14.1, and the r=47 hexagon's perimeter is 6 x 47 = 282,
            // exactly twenty periods — so the dashes close at the join instead of
            // ending on a stub, which at this size reads as a broken ring.
            if (focus && layer === 1) ring.setAttribute("stroke-dasharray", "9.4 4.7");
            group.appendChild(ring);
        });
        return group;
    }

    // Park a reticle on a tile (or nowhere). appendChild MOVES an existing node,
    // which is the whole point — there is only ever one of each.
    function mountReticle(kind, sectorId) {
        const key = kind === 'focus' ? 'focusRing' : 'selectRing';
        if (!state[key]) state[key] = buildReticle(kind);
        const ring = state[key];
        const sector = sectorId ? state.sectors[sectorId] : null;
        if (!sector) {
            if (ring.parentNode) ring.parentNode.removeChild(ring);
        } else if (ring.parentNode !== sector.element) {
            sector.element.appendChild(ring);
        }
        // Tiles are absolutely positioned and their boxes overlap at the corners,
        // so a marked tile has to come forward or its ring is drawn under the
        // neighbour that happens to have been created after it.
        //
        // Only the two tiles that changed are touched. Sweeping all 112 on every
        // selection is 112 style writes and a forced recalc for a two-cell edit,
        // on a path that runs on every server sector update.
        const raised = state.raisedTiles || (state.raisedTiles = new Set());
        const wanted = new Set([state.selectedSector, state.focusedId].filter(Boolean));
        raised.forEach(id => {
            if (!wanted.has(id) && state.sectors[id]) state.sectors[id].element.style.zIndex = '';
        });
        wanted.forEach(id => {
            if (!raised.has(id) && state.sectors[id]) state.sectors[id].element.style.zIndex = '6';
        });
        state.raisedTiles = wanted;
    }

    // ---------------------------------------------------------------------
    // What a tile SAYS.
    //
    // The old label was `Unexplored sector 47` and it was written onto a bare
    // <path>, which has no implicit role, so ARIA prohibits a name there and
    // assistive technology threw all 112 of them away. The chart was completely
    // unreadable while looking, in source, like it had been labelled.
    //
    // The name now lives on the tile's <svg role="option"> where it is legal,
    // and it answers the four questions a player asks of a cell: which sector,
    // whose it is, what is on it, and whether this is intel I can act on or
    // intel I merely remember.
    // ---------------------------------------------------------------------

    function isSelfOwner(owner) {
        if (owner === null || owner === undefined || owner === '') return false;
        if (typeof getCookie !== 'function') return false;
        const self = Number(getCookie('userId'));
        return Number.isFinite(self) && self > 0 && Number(owner) === self;
    }

    function resolveOwnerName(owner) {
        if (owner === null || owner === undefined || owner === '') return null;
        const text = String(owner);
        if (!/^\d+$/.test(text)) return text;
        // A raw player id is not a name. Only speak it if the roster can turn it
        // into one; otherwise the caller falls back to "enemy held", which is
        // true and useful, where "held by 3" is neither.
        const roster = window.GAME_STATE && window.GAME_STATE.players;
        const entry = roster && roster[text];
        return (entry && entry.name) ? String(entry.name) : null;
    }

    function ownerWords(sector) {
        const name = resolveOwnerName(sector.owner);
        switch (sector.status) {
            case SECTOR_STATUS.OWNED:
            case SECTOR_STATUS.COLONIZED:
                return 'yours';
            case SECTOR_STATUS.HOMEWORLD:
                if (isSelfOwner(sector.owner)) return 'yours';
                if (name) return `held by ${name}`;
                return sector.owner ? 'enemy held' : 'unclaimed';
            case SECTOR_STATUS.ENEMY:
                return name ? `held by ${name}` : 'enemy held';
            case SECTOR_STATUS.FLEET:
                return 'unclaimed, your fleet holds it';
            default:
                if (!sector.owner) return 'unclaimed';
                return name ? `held by ${name}` : 'held by a rival';
        }
    }

    // Fleet and markers are read from the SECTOR, not from the text nodes that
    // draw them. They used to be parsed back out of the DOM — `fleetText`'s
    // textContent through a regex, `colonizedText`'s display property as the
    // has-a-marker test — which is why the two could not be merged onto one
    // rendered line without silently emptying the accessible name. The picture
    // is now downstream of the model in one direction only.
    function fleetWords(sector) {
        const code = String(sector.fleetLabel || '');
        const match = code.match(/^([A-Z]):(\d+)$/);
        if (!match) return code;
        const count = Number(match[2]);
        const noun = count === 1 ? 'ship' : 'ships';
        return match[1] === 'E' ? `${count} enemy ${noun}` : `${count} of your ${noun}`;
    }

    function markerWords(sector) {
        const code = String(sector.markerLabel || '').trim();
        if (!code) return '';
        const words = code.split('').map(ch => MARKER_WORDS[ch]).filter(Boolean);
        return words.length ? words.join(', ') : code;
    }

    // ---------------------------------------------------------------------
    // THE ANNOTATION ROW. One baseline, one string: `F:7`.
    //
    // Fitting it is not optional. The row shares its band with the selection
    // reticle's lower flanks, so a string wider than ANNOTATION_WIDTH runs out
    // under the ring and gets struck through at both ends — the same defect the
    // marker letter had vertically. SVG's own textLength/lengthAdjust condenses
    // it instead, which for a monospace face degrades to a narrower cut of the
    // same letterforms rather than to overlapping glyphs.
    //
    // NOTHING IS MEASURED TO DECIDE THIS. Both rows are set from TEXT_SIZE in a
    // monospaced face, and `font-size` inside an SVG viewBox is in USER UNITS,
    // so a string's width is its length times GLYPH_ADVANCE — a constant of the
    // chart, not of the current tile size. This used to call
    // getComputedTextLength() once per row style, which is a forced synchronous
    // layout, landing on the first turn update the player watches.
    // ---------------------------------------------------------------------
    function fitText(node, text, maxWidth) {
        node.textContent = text;
        if (!text) return;
        if (GLYPH_ADVANCE * text.length > maxWidth) {
            node.setAttribute('textLength', String(maxWidth));
            node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        } else {
            node.removeAttribute('textLength');
            node.removeAttribute('lengthAdjust');
        }
    }

    /**
     * What the annotation row can actually SAY in a fifty-pixel cell.
     *
     * Ranked by what a player needs first, and the widest form that still reads
     * wins. The fleet count leads because it is the time-critical number; marker
     * letters degrade to a leading letter plus '+', then to a bare '+', then
     * away entirely. The '+' is the promise that the readout has more.
     *
     * At TEXT_SIZE the budget is 4.16 characters, so on a cell that has BOTH a
     * fleet and markers the row resolves to the bare fleet count and the letters
     * fall to the readout panel and the accessible name, which carry the full
     * set anyway. That is the right trade: the count is the number a player is
     * reading the chart FOR, and it used to be rendered at 7px with a halo wider
     * than its own stems in order to keep a trailing letter beside it.
     */
    function annotationText(sector) {
        const fleet = String(sector.fleetLabel || '');
        const marker = String(sector.markerLabel || '');
        if (!fleet && !marker) return '';
        const candidates = [];
        if (fleet && marker) {
            candidates.push(`${fleet} ${marker}`);
            if (marker.length > 1) candidates.push(`${fleet} ${marker[0]}+`);
            candidates.push(`${fleet}+`);
            candidates.push(fleet);
        } else if (marker) {
            candidates.push(marker);
            if (marker.length > 1) candidates.push(`${marker[0]}+`);
            candidates.push(marker[0]);
        } else {
            candidates.push(fleet);
        }
        const budget = ANNOTATION_WIDTH / ANNOTATION_MIN_SQUEEZE;
        // The last candidate is the shortest there is; take it rather than
        // rendering nothing if even that overruns.
        return candidates.find(text => GLYPH_ADVANCE * text.length <= budget)
            || candidates[candidates.length - 1];
    }

    // Draw the two rows. The number's baseline and width budget depend on
    // whether it is sharing the cell, which is the whole reason the collision
    // existed: the old code parked it at a fixed y=40 whether or not anything
    // was underneath it, so it was simultaneously too low when alone (reading as
    // hung off the top of the hex) and too low when stacked (touching the row
    // below).
    function renderTileText(sector) {
        const intel = sector.intel || 'fog';
        const annotation = intel === 'fog' ? '' : annotationText(sector);
        // A black hole's accretion disc lives in the clear band across the middle
        // of the cell, which is exactly where a SOLO number's ink reaches. It is
        // the one tile whose number always takes the upper baseline, annotation
        // or not, so the mark and the coordinate never cross.
        const stacked = Boolean(annotation) || sector.status === SECTOR_STATUS.BLACKHOLE;
        const ink = inkFor(sector);

        sector.text.setAttribute('y', String(stacked ? NUMBER_Y_STACKED : NUMBER_Y_SOLO));
        // Never fade the node — see the ink block. Opacity composites the struck
        // outline away along with the glyph it exists to carry.
        sector.text.setAttribute('opacity', '1');
        sector.text.style.fill = ink.fill;
        sector.text.style.stroke = ink.stroke;
        fitText(sector.text, String(sector.id),
            stacked ? NUMBER_WIDTH_STACKED : NUMBER_WIDTH_SOLO);

        if (!annotation) {
            sector.annotation.style.display = 'none';
            sector.annotation.textContent = '';
            return;
        }
        sector.annotation.style.display = 'block';
        sector.annotation.style.fill = ink.fill;
        sector.annotation.style.stroke = ink.stroke;
        fitText(sector.annotation, annotation, ANNOTATION_WIDTH);
    }

    /**
     * The terrain entry for a sector, or null if we do not know its type.
     *
     * `SECTOR_LORE[Number(sector.type)]` is a trap: a tile that has never been
     * reported carries `type: null`, `Number(null)` is 0, and 0 is Empty Space.
     * Every unexplored cell on the chart therefore described itself as charted
     * empty space.
     */
    function sectorLore(sector) {
        if (sector.type === null || sector.type === undefined || sector.type === '') return null;
        const type = Number(sector.type);
        return Number.isFinite(type) ? (SECTOR_LORE[type] || null) : null;
    }

    // Hazards must survive being read aloud, or read by someone who cannot tell
    // the amber tile from the gold one. The fill says this; nothing else did.
    function hazardWords(sector) {
        if (sector.status === SECTOR_STATUS.BLACKHOLE || Number(sector.type) === 2) {
            return 'Lethal: a fleet entering is lost';
        }
        if (sector.status === SECTOR_STATUS.HAZARD) return 'Hazard';
        return '';
    }

    // Is this ground the player actually holds? Only then does "no buildings"
    // mean "produces nothing" rather than "I cannot see inside".
    function isMine(sector) {
        if (sector.status === SECTOR_STATUS.OWNED || sector.status === SECTOR_STATUS.COLONIZED) return true;
        if (sector.status === SECTOR_STATUS.HOMEWORLD) {
            return isSelfOwner(sector.owner) || Boolean(Number(sector.flags) & 1);
        }
        return false;
    }

    /**
     * What the sector PRODUCES, in one place, because the tooltip and the spoken
     * label were drifting: the panel printed buildings and estimated yields for
     * every live cell and the accessible name printed neither, so a screen-reader
     * player could hear who holds a world but not what it is worth — and "which
     * of these two is worth taking" was a sighted-only judgement on a chart built
     * for comparing sectors.
     *
     * IT MUST NOT INVENT A NUMBER. The yield row was emitted unconditionally
     * from a building list the player often cannot see, so an enemy capital —
     * the most valuable object on the board — reported "YIELD/TURN M 0 · C 0 ·
     * R 0", and a player choosing between two enemy worlds was told the capital
     * produces nothing. Three separate cases, three different truths:
     *
     *   terrain you cannot build on   no row at all; there is nothing to say
     *   ground that is not yours      "Unknown" — you have not surveyed inside
     *   ground that is yours          the figure, labelled as an ESTIMATE,
     *                                 because the per-building multipliers here
     *                                 are flat and the real ones scale with the
     *                                 sector richness the SECTOR SURVEY panel
     *                                 shows on the same screen
     */
    function sectorOutput(sector) {
        const counts = normalizeBuildingCounts(sector.buildings);
        const yields = estimateProduction(counts);
        const built = [];
        if (counts[0]) built.push(`${counts[0]} metal`);
        if (counts[1]) built.push(`${counts[1]} crystal`);
        if (counts[2]) built.push(`${counts[2]} research`);
        const hasBuildings = built.length > 0;
        const type = Number(sector.type);
        // Types 0-5 are empty space, belts, black holes, unstable stars, brown
        // dwarfs and moons: positions, not worlds. Nothing is ever built there.
        const colonisable = !Number.isFinite(type) || type >= 6;
        const mine = isMine(sector);
        let text = '';
        let spokenYield = '';
        if (!colonisable) {
            text = '';
        } else if (hasBuildings || mine) {
            text = `M ${yields.metal} · C ${yields.crystal} · R ${yields.research}`;
            spokenYield = `Estimated yield ${yields.metal} metal, ${yields.crystal} crystal, `
                + `${yields.research} research per turn.`;
        } else {
            text = 'Unknown — not surveyed';
            spokenYield = 'Yield unknown; you have not surveyed inside.';
        }
        const spokenParts = [];
        if (hasBuildings) spokenParts.push(`Buildings: ${built.join(', ')}.`);
        else if (colonisable && mine) spokenParts.push('Nothing built here yet.');
        if (spokenYield) spokenParts.push(spokenYield);
        return {
            yields,
            hasBuildings,
            // Nothing is ever built on empty space or in a belt, so the panel
            // says nothing about buildings there rather than reporting "None"
            // as if it were an observation.
            showBuilt: colonisable,
            buildingsText: hasBuildings ? built.join(', ') : (mine ? 'None' : 'Unknown'),
            showYield: Boolean(text),
            yieldsText: text,
            spoken: spokenParts.join(' ')
        };
    }

    function describeSector(sector) {
        const coords = `column ${Number(sector.gridX) + 1}, row ${Number(sector.gridY) + 1}`;
        const head = sector.chartName ? `Sector ${sector.id}, ${sector.chartName}` : `Sector ${sector.id}`;

        // `sector.intel` is the state updateSectorStatus actually concluded and
        // stamped onto the tile, so the label cannot disagree with the picture.
        // Recomputing the predicate here got it wrong in the one direction that
        // matters: a freshly built tile has live === false and type === null,
        // which read as "remembered", and every fog cell narrated its terrain.
        // Under fog the label says nothing about what is there, on purpose —
        // a helpful screen-reader label that leaked terrain would hand blind
        // players the one advantage the exploration loop is built on withholding.
        if (sector.intel === 'fog') return `${head}, ${coords}. Unexplored, no intel.`;

        const parts = [`${head}, ${coords}.`];
        const lore = sectorLore(sector);
        if (lore) parts.push(`${lore.name}.`);
        const hazard = hazardWords(sector);
        if (hazard) parts.push(`${hazard}.`);
        parts.push(`${ownerWords(sector)}.`);
        const fleet = fleetWords(sector);
        if (fleet) parts.push(`${fleet}.`);
        const markers = markerWords(sector);
        if (markers) parts.push(`${markers}.`);
        const output = sectorOutput(sector);
        if (output.spoken) parts.push(output.spoken);
        parts.push(sector.intel === 'live' ? 'Live intel.' : 'Remembered intel, may be out of date.');
        return parts.join(' ');
    }

    function setTileLabel(sector) {
        if (!sector || !sector.element) return;
        sector.element.setAttribute('aria-label', describeSector(sector));
    }

    // ---------------------------------------------------------------------
    // Keyboard. 112 clickable tiles used to be reachable only with a mouse.
    //
    // They are ONE tab stop, not 112: a roving tabindex parks tabindex="0" on a
    // single tile and the arrow keys move it. Moving the cursor deliberately
    // does NOT select — selection round-trips to the server and flies the 3D
    // camera, so it is committed with Enter or Space.
    // ---------------------------------------------------------------------
    function setRovingTile(sectorId) {
        const next = state.sectors[sectorId];
        if (!next) return;
        if (state.rovingId && state.sectors[state.rovingId]) {
            state.sectors[state.rovingId].element.setAttribute('tabindex', '-1');
        }
        state.rovingId = next.id;
        next.element.setAttribute('tabindex', '0');
    }

    function focusTile(sectorId) {
        const sector = state.sectors[sectorId];
        if (!sector) return;
        state.rovingUserMoved = true;
        setRovingTile(sector.id);
        sector.element.focus();
    }

    // WHERE THE CHART CURSOR STARTS. It started on sector 1 — the top-left fog
    // cell, which in the shipped layout is also under the compass badge — so a
    // keyboard player's first contact with the instrument was an empty cell
    // reading "Fog — nothing charted here", with an arrow crawl across the board
    // to find their own capital. The board is not knowable at initialize() time;
    // the homeworld arrives with the first map snapshot, so the cursor is parked
    // when that lands.
    //
    // It fires ONCE, and never against the player: any deliberate cursor move,
    // and any selection that has already parked the cursor somewhere, wins.
    function parkOnHomeworld(sector) {
        if (state.homeParked || state.rovingUserMoved || state.selectedSector !== null) return;
        if (sector.status !== SECTOR_STATUS.HOMEWORLD) return;
        if (!isSelfOwner(sector.owner) && !(Number(sector.flags) & 1)) return;
        state.homeParked = true;
        setRovingTile(sector.id);
    }

    function handleChartKeydown(evt) {
        if (evt.altKey || evt.ctrlKey || evt.metaKey) return;
        const current = state.sectors[state.focusedId || state.rovingId];
        if (!current) return;

        // Column/row steps, not hex-neighbour steps. The sector numbering IS the
        // lattice (id = row * width + column + 1), so left/right is +/-1 sector
        // and up/down is +/- one row — which is what the sector numbers on the
        // tiles already teach the player.
        let gridX = Number(current.gridX);
        let gridY = Number(current.gridY);
        switch (evt.key) {
            case 'ArrowLeft':  gridX -= 1; break;
            case 'ArrowRight': gridX += 1; break;
            case 'ArrowUp':    gridY -= 1; break;
            case 'ArrowDown':  gridY += 1; break;
            case 'Home':       gridX = 0; break;
            case 'End':        gridX = state.width - 1; break;
            case 'PageUp':     gridY = 0; break;
            case 'PageDown':   gridY = state.height - 1; break;
            case 'Enter':
            case ' ':
            case 'Spacebar':
                evt.preventDefault();
                selectSector(current.id);
                return;
            case 'Escape':
                dismissTooltip();
                return;
            default:
                return;
        }
        // Claim the key even when the cursor is already against that edge of the
        // chart. Arrow / Page / Home keys scroll the document by default, so
        // "already at the top row" would otherwise scroll the HUD out from under
        // the player instead of doing nothing.
        evt.preventDefault();
        gridX = Math.min(state.width - 1, Math.max(0, gridX));
        gridY = Math.min(state.height - 1, Math.max(0, gridY));
        const targetId = gridY * state.width + gridX + 1;
        if (targetId === current.id) return;
        focusTile(targetId);
    }

    function handleChartFocusIn(evt) {
        const tile = evt.target && evt.target.closest ? evt.target.closest('[data-sector-id]') : null;
        if (!tile) return;
        const id = Number(tile.getAttribute('data-sector-id'));
        if (!state.sectors[id]) return;
        state.focusedId = id;
        state.rovingUserMoved = true;
        setRovingTile(id);
        mountReticle('focus', id);
        // The hover tooltip carries yields, buildings and the sector's lore line.
        // A keyboard player was getting none of it, so focus opens it too — but
        // only when focus came from the keyboard. A click already puts the same
        // panel under the pointer; pinning a second copy beside the instrument on
        // every click would be noise, and it would fight the hover placement.
        if (!state.pointerFocus) {
            showTooltipForTile(id);
            showKeyboardHint();
        }
    }

    // The instruction, said once, where a sighted keyboard player can see it.
    // Six seconds is long enough to read eleven words and short enough that it
    // is gone before it becomes furniture; it never returns, because a player
    // who has used the arrows once does not need telling again.
    const KEYHINT_TEXT = 'ARROWS MOVE · ENTER SELECTS · ESC CLOSES';
    const KEYHINT_DWELL_MS = 6000;
    const KEYHINT_FADE_MS = 520;

    function showKeyboardHint() {
        if (state.hintShown || !state.containerElement) return;
        state.hintShown = true;
        const hint = document.createElement('div');
        hint.className = 'chart-keyhint';
        hint.setAttribute('aria-hidden', 'true');
        hint.textContent = KEYHINT_TEXT;
        state.containerElement.appendChild(hint);
        setTimeout(() => {
            hint.setAttribute('data-fading', 'true');
            setTimeout(() => {
                if (hint.parentNode) hint.parentNode.removeChild(hint);
            }, KEYHINT_FADE_MS);
        }, KEYHINT_DWELL_MS);
    }

    function handleChartFocusOut() {
        state.focusedId = null;
        // ...and this is that moment for the keyboard cursor.
        state.tooltipDismissed = null;
        mountReticle('focus', null);
        hideTooltip();
    }

    function bindChartKeys(container) {
        if (!container || state.keysBound) return;
        container.addEventListener('keydown', handleChartKeydown);
        container.addEventListener('focusin', handleChartFocusIn);
        container.addEventListener('focusout', handleChartFocusOut);
        // A tile carries a tabindex, so pressing the mouse on one focuses it.
        // This is how focusin tells "the player tabbed here" from "the player
        // clicked here"; the two want different feedback.
        container.addEventListener('mousedown', () => {
            state.pointerFocus = true;
            setTimeout(() => { state.pointerFocus = false; }, 0);
        }, true);
        state.keysBound = true;
    }

    // The instrument's own chrome, in CSS px, taken from `#minimapid::after` in
    // style.css: a 19px hull rail across the bottom carrying the TACTICAL CHART
    // stencil and the "1 CELL = 1 SECTOR" scale, and registration ticks inset
    // 10px from the corners.
    //
    // The lattice used to be centred in the FULL clientHeight, which reserved
    // none of it: at the shipped 540x390 chart the bottom row's last fifth was
    // already under the rail, and whenever the chart is height-bound the centring
    // slack goes to zero and the entire 19px is buried — which takes the fleet
    // count and the H/C/T/W/E/P/B marker of all fourteen bottom-row sectors with
    // it. Reserving the chrome costs about one hex-size of scale and is the
    // difference between fourteen cells having a readout and not having one.
    // 19px of hull rail plus the 8px the bottom registration ticks stand above
    // it: the ticks are drawn at calc(100% - 27px), so 27 is where the
    // instrument's bottom chrome actually starts. The top ticks are at y=10 and
    // the lattice's own corner notch already clears them, so the top only has to
    // keep the first row off the bezel.
    const CHART_BOTTOM = 27;
    const CHART_TICK = 10;

    // Where the lattice starts inside the bezel. Only one of the two axes can be
    // the binding constraint, so without this the leftover space always piled up
    // on one side and the chart sat in a corner of its own instrument.
    function layoutMetrics() {
        const containerWidth = state.containerElement.clientWidth;
        const containerHeight = state.containerElement.clientHeight;
        // Below this the chrome is a larger share of the box than the chart is;
        // a chart that small is already hidden by the responsive rules, so give
        // the lattice everything rather than compute a nonsense hex size.
        const roomy = containerWidth > 200 && containerHeight > 150;
        const insetX = roomy ? CHART_TICK : 0;
        const insetTop = roomy ? CHART_TICK : 0;
        const insetBottom = roomy ? CHART_BOTTOM : 0;
        const usableWidth = containerWidth - insetX * 2;
        const usableHeight = containerHeight - insetTop - insetBottom;
        const cols = state.width;
        const rows = state.height;
        const hexSizeFromWidth = usableWidth / (2 * (0.75 * cols + 0.25));
        const hexSizeFromHeight = usableHeight / (Math.sqrt(3) * (rows + 0.5));
        const hexSize = Math.min(hexSizeFromWidth, hexSizeFromHeight);
        const gridWidth = 2 * hexSize * (0.75 * cols + 0.25);
        const gridHeight = Math.sqrt(3) * hexSize * (rows + 0.5);
        return {
            hexSize,
            offsetX: insetX + Math.max(0, (usableWidth - gridWidth) / 2),
            offsetY: insetTop + Math.max(0, (usableHeight - gridHeight) / 2)
        };
    }

    // Initialize the map
    function initialize(width, height, containerId) {
        const nextWidth = width || 14;
        const nextHeight = height || 8;
        const nextContainer = document.getElementById(containerId);

        g3dCall('initialize', nextWidth, nextHeight);

        if (state.initialized) {
            if (state.width === nextWidth && state.height === nextHeight && state.containerElement === nextContainer) {
                resetSectorStatuses();
                return true;
            }
            state.sectors = {};
            state.selectedSector = null;
            state.initialized = false;
        }

        state.width = nextWidth;
        state.height = nextHeight;
        state.containerElement = nextContainer;

        if (!state.containerElement) {
            console.error(`Container element ${containerId} not found`);
            return;
        }

        state.initialized = true;
        state.rovingId = null;
        state.focusedId = null;

        // Clear existing content
        state.containerElement.innerHTML = '';
        ensureChartStyle();
        ensurePatternDefs();
        createTooltip();

        // The chart is a single-select collection of sectors, so it is a listbox
        // of options. That is what buys the tiles a role that legally carries a
        // name, and it is what lets 112 cells be one tab stop with arrow keys
        // inside — the label states that contract, because a screen reader
        // announces the container's name on entry.
        state.containerElement.setAttribute('role', 'listbox');
        state.containerElement.setAttribute('aria-label',
            `Tactical chart, ${state.width * state.height} sectors in a ${state.width} by ${state.height} grid. `
            + 'Arrow keys move the cursor, Enter selects the sector.');

        // For flat-top hexagons:
        // - Total width = hexWidth * (0.75 * columns + 0.25)
        // - Total height = hexHeight * (rows + 0.5) for column offset
        // Where hexWidth = 2 * hexSize, hexHeight = sqrt(3) * hexSize
        const metrics = layoutMetrics();
        const hexSize = metrics.hexSize;
        state.offsetX = metrics.offsetX;
        state.offsetY = metrics.offsetY;

        // Create sectors
        let id = 1;
        for (let y = 0; y < state.height; y++) {
            for (let x = 0; x < state.width; x++) {
                createHexagon(id, x, y, hexSize);
                id++;
            }
        }
        setRovingTile(1);
        bindChartKeys(state.containerElement);

        // Handle window resize
        window.addEventListener('resize', function() {
            if (state.resizeTimer) {
                clearTimeout(state.resizeTimer);
            }
            state.resizeTimer = setTimeout(function() {
                resize();
            }, 250);
        });

        return true;
    }

    function resetSectorStatuses() {
        Object.values(state.sectors).forEach(sector => {
            sector.status = SECTOR_STATUS.UNKNOWN;
            sector.owner = null;
            sector.buildings = [];
            sector.path.setAttribute("fill", UNKNOWN_FILL);
            sector.path.setAttribute("data-original-fill", UNKNOWN_FILL);
            sector.path.setAttribute("data-intel", "fog");
            sector.element.setAttribute("data-intel", "fog");
            sector.path.setAttribute("stroke", UNKNOWN_STROKE);
            sector.path.setAttribute("stroke-dasharray", "2 4");
            sector.path.setAttribute("opacity", "0.42");
            sector.live = false;
            sector.flags = 0;
            sector.type = null;
            sector.intel = 'fog';
            sector.fleetLabel = '';
            sector.markerLabel = '';
            sector.indicatorLabel = '';
            renderTileText(sector);
            setTileLabel(sector);
        });
    }

    // The readout is a PLATE now, not a glass card. Everything about how it looks
    // is in ensureChartStyle()'s `#sector-tooltip` rules, so the panel can be
    // restyled without touching the code that decides what it says — the inline
    // style block that used to live here is what kept it in the rejected
    // rounded-translucent language while the rest of the HUD moved on.
    function createTooltip() {
        if (state.tooltip) return;
        const tip = document.createElement('div');
        tip.id = 'sector-tooltip';
        // THE HOVER BRIDGE. The pointer leaves the tile before it reaches the
        // panel, so the tile's mouseleave now only SCHEDULES the close; landing
        // on the panel inside that window cancels it, and leaving the panel
        // closes it. This is the "hoverable" half of WCAG 1.4.13.
        tip.addEventListener('mouseenter', () => {
            state.tooltipHovered = true;
            if (state.tooltipHold) { clearTimeout(state.tooltipHold); state.tooltipHold = null; }
        });
        tip.addEventListener('mouseleave', evt => {
            state.tooltipHovered = false;
            releaseTooltip(evt);
        });
        document.body.appendChild(tip);
        state.tooltip = tip;
    }

    // ---------------------------------------------------------------------
    // ESCAPE CLOSES IT, WHEREVER FOCUS IS.
    //
    // The "dismissible" half of 1.4.13 was bound to #minimapid's own keydown, so
    // it only fired while a chart tile held focus. Park the cursor on a tile,
    // tab away to End Turn, press Escape — the panel sat there over the board
    // with no keyboard way to clear it. The listener is attached to the document
    // for exactly as long as a panel is open, and removed again when it closes,
    // so nothing global is left listening when there is nothing to dismiss.
    //
    // A dismissed panel stays dismissed until the pointer or the cursor moves to
    // a DIFFERENT sector — otherwise the next mousemove sample over the same
    // cell would reopen what the player just closed.
    // ---------------------------------------------------------------------
    function handleDocumentEscape(evt) {
        if (evt.key !== 'Escape' || evt.altKey || evt.ctrlKey || evt.metaKey) return;
        if (!state.tooltip || state.tooltip.style.display === 'none') return;
        dismissTooltip();
    }

    function dismissTooltip() {
        state.tooltipDismissed = state.tooltipSectorId;
        hideTooltip();
    }

	function fade(from, to, element) {
		if (!element) return;

		// Use the element's stored original fill if available (so fade restores
		// real status color, not a hard-coded gray).
		const originalFill = element.getAttribute('data-original-fill');
		const targetHex = (originalFill && /^#[0-9a-fA-F]{6}$/.test(originalFill))
			? originalFill.slice(1)
			: to;

		const fromColor = parseInt(from, 16);
		const toColor = parseInt(targetHex, 16);
		if (!Number.isFinite(fromColor) || !Number.isFinite(toColor)) {
			element.setAttribute("fill", `#${targetHex}`);
			return;
		}

		// Interpolate per channel so we always emit a valid 6-char hex.
		const fromR = (fromColor >> 16) & 0xff;
		const fromG = (fromColor >> 8) & 0xff;
		const fromB = fromColor & 0xff;
		const toR = (toColor >> 16) & 0xff;
		const toG = (toColor >> 8) & 0xff;
		const toB = toColor & 0xff;

		let step = 0;
		const steps = 8;
		const fadeInterval = setInterval(() => {
			step += 1;
			const t = step / steps;
			if (step >= steps) {
				clearInterval(fadeInterval);
				element.setAttribute("fill", `#${targetHex}`);
				return;
			}
			const r = Math.round(fromR + (toR - fromR) * t);
			const g = Math.round(fromG + (toG - fromG) * t);
			const b = Math.round(fromB + (toB - fromB) * t);
			const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
			element.setAttribute("fill", `#${hex}`);
		}, 40);
	}

    // Create a hexagon
    function createHexagon(id, gridX, gridY, hexSize) {
        const svgNS = "http://www.w3.org/2000/svg";

        // Flat-top hexagon dimensions
        const hexWidth = hexSize * 2;
        const hexHeight = hexSize * Math.sqrt(3);

        // Horizontal spacing: 3/4 of hex width for proper tessellation
        const horizSpacing = hexWidth * 0.75;
        // Vertical spacing: full hex height
        const vertSpacing = hexHeight;

        // Calculate position - offset odd columns by half height
        const xPos = state.offsetX + gridX * horizSpacing;
        const yPos = state.offsetY + gridY * vertSpacing + (gridX % 2 === 1 ? vertSpacing / 2 : 0);

        // Create SVG element
        // Use viewBox that matches hex proportions: width=100, height=100*sqrt(3)/2 = 86.6
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("id", `tileholder${id}`);
        svg.setAttribute("viewBox", "0 0 100 86.6");
        svg.setAttribute("width", `${hexWidth}px`);
        svg.setAttribute("height", `${hexHeight}px`);
        svg.style.position = "absolute";
        svg.style.left = `${xPos}px`;
        svg.style.top = `${yPos}px`;
        // The tile, not the shape inside it, is the thing a player picks: it is
        // the option, it carries the name, and it is what takes focus.
        svg.setAttribute("role", "option");
        svg.setAttribute("aria-selected", "false");
        svg.setAttribute("aria-posinset", String(id));
        svg.setAttribute("aria-setsize", String(state.width * state.height));
        svg.setAttribute("tabindex", "-1");
        svg.setAttribute("data-sector-id", String(id));
        svg.setAttribute("data-intel", "fog");

        // Create hexagon path. NO aria-label here: a bare <path> has no implicit
        // role, ARIA prohibits a name on it, and every label written here was
        // silently discarded. The name is on the <svg role="option"> above.
        const hexPath = document.createElementNS(svgNS, "path");
        hexPath.setAttribute("id", `tile${id}`);
        hexPath.setAttribute("fill", UNKNOWN_FILL);
        hexPath.setAttribute("data-original-fill", UNKNOWN_FILL);
        hexPath.setAttribute("data-intel", "fog");
        hexPath.setAttribute("stroke", UNKNOWN_STROKE);
        hexPath.setAttribute("stroke-width", "2");
        hexPath.setAttribute("stroke-dasharray", "2 4");
        hexPath.setAttribute("opacity", "0.42");

        // Flat-top hexagon that fills the viewBox exactly
        // ViewBox is 100 x 86.6, hex radius = 50, centered at (50, 43.3)
        hexPath.setAttribute("d", hexPathData(50));

        // Add event listeners
        hexPath.addEventListener("mouseover", function(evt) {
            window.tilefading = evt.target;
            // Preserve current fill so we can restore it on mouseout
            const currentFill = evt.target.getAttribute('data-original-fill') || evt.target.getAttribute('fill');
            if (currentFill && /^#[0-9a-fA-F]{6}$/.test(currentFill)) {
                evt.target.setAttribute('data-original-fill', currentFill);
            }
            evt.target.setAttribute('fill-opacity', '0.85');
            evt.target.style.filter = 'brightness(1.18)';
        });

        hexPath.addEventListener("mouseout", function(evt) {
            window.tilefading = "";
            evt.target.setAttribute('fill-opacity', '1');
            evt.target.style.filter = '';
        });
        hexPath.addEventListener("mousemove", function(evt) {
            showTooltip(evt, id);
        });
        hexPath.addEventListener("mouseleave", releaseTooltip);

        hexPath.addEventListener("mousedown", function(evt) {
            // Don't overwrite fill — selectSector will handle visual state
            selectSector(id);
        });

        // Add hexagon to SVG
        svg.appendChild(hexPath);

        // Add sector ID text
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("id", `textid${id}`);
        text.setAttribute("x", "50");
        text.setAttribute("y", String(NUMBER_Y_SOLO));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-weight", "bold");
        text.style.pointerEvents = "none";
        styleTypeRow(text);
        // THE COORDINATE IS NOT SECRET INTEL. It used to be hidden under fog
        // (opacity 0), so with 22 of 112 cells charted the chart carried twelve
        // numbers and ninety blanks — and every server message, every event in
        // the feed and the SECTOR SURVEY heading address sectors BY NUMBER
        // ("Sector 112"). Nothing on the board said where 112 was, so locating a
        // sector you had just been told about meant hovering cells one at a
        // time. The tooltip printed the number on a fog tile anyway. Terrain,
        // ownership, fleets and markers stay hidden; only the coordinate shows,
        // and only at the dimmest of the three ink tiers.
        text.style.fill = INK_FOG;
        text.style.stroke = HALO_ON_DARK;
        // Decimal labels: server messages refer to sectors by decimal number.
        text.textContent = String(id);

        // Add event listeners to text
        text.addEventListener("mouseover", function() {
            const tile = document.getElementById(`tile${id}`);
            if (!tile) return;
            window.tilefading = tile;
            tile.setAttribute('fill-opacity', '0.85');
            tile.style.filter = 'brightness(1.18)';
        });

        text.addEventListener("mouseout", function() {
            const tile = document.getElementById(`tile${id}`);
            if (!tile) return;
            window.tilefading = "";
            tile.setAttribute('fill-opacity', '1');
            tile.style.filter = '';
        });
        text.addEventListener("mousemove", function(evt) {
            showTooltip(evt, id);
        });
        text.addEventListener("mouseleave", releaseTooltip);

        text.addEventListener("mousedown", function(evt) {
            // Do NOT paint the tile here. This used to slam the hex to a flat
            // #888888, which on a textured status also threw away its pattern
            // paint until the next server update — so clicking a cell ON THE
            // NUMBER, which is the easiest part of a small hex to hit, wiped the
            // one channel a colour-blind player reads it by. selectSector owns
            // the visual state, exactly as the hex's own handler already says.
            selectSector(id);
            evt.preventDefault();
            return false;
        });

        svg.appendChild(text);

        // ONE annotation row, not two. The fleet count sat at y=55 and the
        // marker letter at y=68; with the shipped type both halos overlapped the
        // row above them, so "10"/"F:2" fused, and the marker was struck through
        // by the selection ring. They are one string on one baseline now — see
        // the geometry block at the top of the file — which also means a tile
        // holds two <text> nodes instead of three: 112 fewer nodes to lay out.
        // It keeps the id `txtfleetid${id}`, which is what style.css sizes.
        const annotation = document.createElementNS(svgNS, "text");
        annotation.setAttribute("id", `txtfleetid${id}`);
        annotation.setAttribute("x", "50");
        annotation.setAttribute("y", String(ANNOTATION_Y));
        annotation.setAttribute("text-anchor", "middle");
        annotation.setAttribute("font-weight", "bold");
        styleTypeRow(annotation);
        annotation.style.fill = INK_ON_DARK;
        annotation.style.stroke = HALO_ON_DARK;
        annotation.style.pointerEvents = "none";
        annotation.style.display = "none";
        svg.appendChild(annotation);

        // Store in state
        state.sectors[id] = {
            id,
            element: svg,
            path: hexPath,
            text: text,
            annotation: annotation,
            // What the two rendered rows MEAN, kept on the sector rather than
            // scraped back out of the DOM by the code that speaks about it.
            // `indicatorLabel` is the last marker string the server actually
            // sent; `markerLabel` is what the tile currently shows, which is the
            // same thing except while the cell is unknown.
            fleetLabel: '',
            indicatorLabel: '',
            markerLabel: '',
            status: SECTOR_STATUS.UNKNOWN,
            x: xPos,
            y: yPos,
            gridX,
            gridY,
            owner: null,
            buildings: [],
            type: null,
            live: false,
            flags: 0,
            // Authoritative fog / memory / live state, mirrored onto the tile as
            // data-intel. Everything that speaks about the sector reads THIS, so
            // the label, the tooltip and the picture cannot drift apart.
            intel: 'fog'
        };

        setTileLabel(state.sectors[id]);

        // Add to container
        state.containerElement.appendChild(svg);
    }

    // Select a sector
    // Record the selection and refresh the sensor overlay WITHOUT re-requesting the
    // sector from the server. The 3D view drives its own click handling, so it calls
    // this to keep the minimap's idea of "selected" in step (see markSelected below).
    /**
     * The SIX cells that actually touch this one.
     *
     * The sensor overlay used to outline a square 8-neighbourhood (dx <= 1 &&
     * dy <= 1), which is not the neighbourhood this lattice has: createHexagon
     * offsets odd columns DOWN by half a row, so of the eight cells in that
     * square two are not adjacent at all — they are three hex-radii away. For an
     * even column it wrongly outlined (x-1,y+1) and (x+1,y+1); for an odd
     * column, (x-1,y-1) and (x+1,y-1). The outline is drawn in pale steel and
     * the survey panel beside it says "Inside your current one-tile sensor
     * range", so a player planning a move — or spending 300 crystals on a probe
     * — was planning against a range claim the chart was drawing wrong.
     *
     * Six lookups instead of a 112-cell sweep, which is also the cheaper answer.
     */
    function hexNeighbourIds(sector) {
        const gridX = Number(sector.gridX);
        const gridY = Number(sector.gridY);
        // Odd columns hang half a row lower, so their diagonal neighbours are the
        // row BELOW; even columns' are the row above.
        const skew = gridX % 2 === 1 ? 1 : -1;
        const cells = [
            [gridX, gridY - 1], [gridX, gridY + 1],
            [gridX - 1, gridY], [gridX + 1, gridY],
            [gridX - 1, gridY + skew], [gridX + 1, gridY + skew]
        ];
        const ids = [];
        cells.forEach(([x, y]) => {
            if (x < 0 || y < 0 || x >= state.width || y >= state.height) return;
            ids.push(y * state.width + x + 1);
        });
        return ids;
    }

    function applySelection(sectorId) {
        const previous = state.selectedSector;
        state.selectedSector = sectorId;
        // Only the cells that changed. A full 112-tile sweep per selection is a
        // forced style recalc for a two-cell edit, on a path the server drives.
        if (previous && state.sectors[previous]) {
            state.sectors[previous].element.setAttribute('aria-selected', 'false');
        }
        if (state.sectors[sectorId]) {
            state.sectors[sectorId].element.setAttribute('aria-selected', 'true');
        }
        (state.sensorTiles || []).forEach(id => {
            if (state.sectors[id]) state.sectors[id].path.removeAttribute('data-sensor-neighbor');
        });
        state.sensorTiles = [];
        // THE CHART NOW SAYS WHICH CELL IS SELECTED. It never did: you clicked a
        // tile, the survey panel changed and the 3D camera flew somewhere, and
        // the chart itself gave no sign of which of its 112 cells you were now
        // looking at. This ring is also the closest thing the chart has to a
        // viewport marker, because selectSector() is what points the 3D camera.
        mountReticle('select', sectorId);
        // Tab should land where the player last was, not back at sector 1.
        if (state.sectors[sectorId] && state.focusedId === null) setRovingTile(sectorId);
        const selected = state.sectors[sectorId];
        const projectsSensors = selected && [
            SECTOR_STATUS.OWNED,
            SECTOR_STATUS.COLONIZED,
            SECTOR_STATUS.HOMEWORLD,
            SECTOR_STATUS.WARPGATE,
            SECTOR_STATUS.FLEET
        ].includes(selected.status);
        if (projectsSensors) {
            state.sensorTiles = hexNeighbourIds(selected);
            state.sensorTiles.forEach(id => {
                if (state.sectors[id]) state.sectors[id].path.setAttribute('data-sensor-neighbor', 'true');
            });
        }
    }

    function selectSector(sectorId) {
        applySelection(sectorId);
        changeSector(sectorId.toString(16).toUpperCase());
        // COMMITTING A CELL MUST NOT BLANK ITS READOUT. A keyboard player arrows
        // onto a sector, focusin opens the panel beside the instrument — the only
        // place the chart shows yields, buildings and the terrain line — reads it,
        // presses Enter, and the unconditional hide here took the panel away at
        // the exact moment the sector became the selected one. It did not come
        // back either: only focusin reopens it, so the player had to arrow off the
        // cell and back to see what they had just chosen.
        //
        // The pointer path still hides: there the panel is under the cursor, the
        // cursor is about to move, and the survey panel is the readout that
        // matters. So Enter confirms the cell; a click dismisses the hover.
        //
        // `pointerFocus` is what separates them. A mousedown focuses the tile as
        // its default action, so on a second click of an already-focused cell
        // focusedId would equal sectorId and the panel would jump from under the
        // pointer to beside the instrument and back on the next mousemove.
        if (state.focusedId === sectorId && !state.pointerFocus) showTooltipForTile(sectorId, true);
        else hideTooltip();
        g3dCall('setSelected', sectorId);
        g3dCall('focusSector', sectorId);
        if (window.MediaManager?.playSfx) {
            window.MediaManager.playSfx('click');
        }
    }

    // Update sector status
    function updateSectorStatus(sectorId, status, details = {}) {
        g3dCall('updateSector', sectorId, status, details);
        const sector = state.sectors[sectorId];
        if (!sector) return;
        const normalizedStatus = STATUS_COLORS[status] ? status : SECTOR_STATUS.UNKNOWN;
        const hasTerrainMemory = details.live === false ||
            (details.type !== undefined && details.type !== null && Number.isFinite(Number(details.type)));
        const known = normalizedStatus !== SECTOR_STATUS.UNKNOWN || hasTerrainMemory;

        // Update status
        sector.status = normalizedStatus;
        if (details.owner !== undefined) {
            sector.owner = details.owner;
        }
        if (details.buildings !== undefined) {
            sector.buildings = details.buildings;
        }
        if (details.type !== undefined) {
            sector.type = details.type;
        }
        if (details.live !== undefined) {
            sector.live = Boolean(details.live);
        } else if (normalizedStatus !== SECTOR_STATUS.UNKNOWN) {
            sector.live = true;
        } else if (known) {
            sector.live = details.live !== false;
        }
        if (details.flags !== undefined) {
            sector.flags = Number(details.flags) || 0;
        }
        // Chart name, and who put it there. Both `mapstate::` and focused `sector::` detail can
        // carry these. Do not clear a known name when an older server or stale optional payload
        // omits it: the name is permanent.
        if (details.chartName !== undefined && details.chartName) {
            sector.chartName = String(details.chartName);
        }
        if (details.namedBy !== undefined && details.namedBy) {
            sector.namedBy = String(details.namedBy);
        }
        if (details.namedById !== undefined && details.namedById) {
            sector.namedById = Number(details.namedById) || null;
        }
        if (details.namedTurn !== undefined && details.namedTurn) {
            sector.namedTurn = Number(details.namedTurn) || null;
        }

        // Update colors. Unknown tiles remain selectable, but they do not reveal
        // labels or terrain until the server marks them explored.
        //
        // `fill` is the PAINT — a flat colour, or one of the hatch patterns for
        // the three states that a colour-blind player could not otherwise tell
        // apart. `data-original-fill` stays the flat base colour, because it is a
        // colour cache and a `url(#…)` in it would be a lie.
        const fill = known ? statusPaint(normalizedStatus) : UNKNOWN_FILL;
        const baseFill = known ? STATUS_COLORS[normalizedStatus] : UNKNOWN_FILL;
        const stroke = known ? STROKE_COLORS[normalizedStatus] : UNKNOWN_STROKE;
        sector.path.setAttribute("fill", fill);
        sector.path.setAttribute("data-original-fill", baseFill);
        sector.path.setAttribute("stroke", stroke);
        sector.path.setAttribute("opacity", known ? (sector.live ? "1" : MEMORY_OPACITY) : "0.42");
        sector.path.setAttribute("stroke-dasharray", known ? (sector.live ? "" : "4 3") : "2 4");
        const intelState = known ? (sector.live ? "live" : "memory") : "fog";
        sector.intel = intelState;
        sector.path.setAttribute("data-intel", intelState);
        sector.element.setAttribute("data-intel", intelState);

        // Update fleet size
        if (details.fleetSize !== undefined) {
            sector.fleetLabel = (known && details.fleetSize > 0)
                ? `${(sector.flags & 16) ? 'E' : 'F'}:${details.fleetSize}`
                : '';
        }

        // Update markers.
        //
        // A STRING is authority — including the empty string, which is what
        // mapFlagsToIndicator() returns for a sector with no flags set and which
        // therefore has to be able to CLEAR the letters. `null` is not authority,
        // it is the absence of an opinion, and the difference is load-bearing:
        // the vestigial minimap.js forwards every focused `sector::` reply into
        // this module as `indicator: null` (public/js/minimap.js updateSector),
        // so treating null as "no markers" meant that merely SELECTING one of
        // your own sectors erased its H / C / T / W / E / P letters from the
        // chart until the next full map snapshot put them back.
        if (typeof details.indicator === 'string') {
            sector.indicatorLabel = known ? details.indicator : '';
        }
        sector.markerLabel = known ? (sector.indicatorLabel || '') : '';

        // Both rows, from the model above. Must run before setTileLabel: the
        // spoken name is built from the same fleet and marker state.
        renderTileText(sector);
        setTileLabel(sector);
        parkOnHomeworld(sector);
        if (state.tooltipSectorId === sector.id) {
            // The panel on screen is now describing a sector that has changed
            // under it. Mark it so the hover fast path below cannot serve the
            // stale copy, and repaint immediately if a keyboard cursor is
            // sitting on the cell and nothing else will come along to do it.
            state.tooltipStale = true;
            if (state.focusedId === sector.id) showTooltipForTile(sector.id, true);
        }
    }

    // Resize handler
    function resize() {
        if (!state.containerElement) return;

        // Same metrics as initialize, including the centring offsets.
        const metrics = layoutMetrics();
        const hexSize = metrics.hexSize;
        state.offsetX = metrics.offsetX;
        state.offsetY = metrics.offsetY;

        // Calculate spacing (same as createHexagon)
        const actualHexWidth = hexSize * 2;
        const actualHexHeight = hexSize * Math.sqrt(3);
        const horizSpacing = actualHexWidth * 0.75;
        const vertSpacing = actualHexHeight;

        // Update size and position of all hexagons
        let id = 1;
        for (let y = 0; y < state.height; y++) {
            for (let x = 0; x < state.width; x++) {
                // Same positioning as createHexagon - offset odd columns
                const xPos = state.offsetX + x * horizSpacing;
                const yPos = state.offsetY + y * vertSpacing + (x % 2 === 1 ? vertSpacing / 2 : 0);

                const sector = state.sectors[id];
                if (sector && sector.element) {
                    sector.element.setAttribute("width", `${actualHexWidth}px`);
                    sector.element.setAttribute("height", `${actualHexHeight}px`);
                    sector.element.style.left = `${xPos}px`;
                    sector.element.style.top = `${yPos}px`;
                }

                id++;
            }
        }
    }

    function hideTooltip() {
        if (state.tooltipHold) { clearTimeout(state.tooltipHold); state.tooltipHold = null; }
        if (state.tooltip) {
            state.tooltip.style.display = 'none';
        }
        state.tooltipHovered = false;
        document.removeEventListener('keydown', handleDocumentEscape);
        state.tooltipSectorId = null;
        state.tooltipStale = false;
    }

    // The pointer leaving a tile must not silently cancel the keyboard cursor's
    // readout: a player driving the chart from the keyboard can still have a
    // mouse resting on the screen.
    //
    // Nor must it cancel a readout the pointer is on its way TO. The panel is
    // docked beside the instrument, so reaching it means crossing the gap
    // between, and hiding on the tile's own mouseleave made the panel
    // unreachable by pointer — see the bridge in createTooltip. The close is
    // deferred by one short beat instead; landing on the panel cancels it.
    // Long enough for a hand to cross the gap between the instrument and the
    // panel docked beside it without the target vanishing mid-reach, short
    // enough that a pointer leaving for the HUD does not drag the panel along.
    // It is a BACKSTOP, not the mechanism: where the browser can tell us where
    // the pointer went, the answer is exact and no timing is involved.
    const TOOLTIP_BRIDGE_MS = 500;
    function releaseTooltip(evt) {
        // 1.4.13 says a dismissed panel stays dismissed until hover or focus
        // leaves the thing that triggered it. This is that moment for the pointer.
        state.tooltipDismissed = null;
        // A mouseleave knows what the pointer entered. If it went to the panel
        // there is nothing to close, and no timer to race.
        const to = evt && evt.relatedTarget;
        if (to && to.nodeType === 1 && state.tooltip
            && (to === state.tooltip || state.tooltip.contains(to))) return;
        if (state.tooltipHold) clearTimeout(state.tooltipHold);
        state.tooltipHold = setTimeout(() => {
            state.tooltipHold = null;
            if (state.tooltipHovered) return;
            hideTooltip();
            if (state.focusedId) showTooltipForTile(state.focusedId);
        }, TOOLTIP_BRIDGE_MS);
    }

    function normalizeBuildingCounts(buildings) {
        const counts = { 0: 0, 1: 0, 2: 0 };
        if (Array.isArray(buildings)) {
            buildings.forEach(entry => {
                const type = typeof entry === 'object' ? Number(entry.type) : Number(entry);
                if (Number.isFinite(type)) {
                    counts[type] = (counts[type] || 0) + 1;
                }
            });
        } else if (buildings && typeof buildings === 'object') {
            const mapping = {
                metalExtractor: 0,
                crystalRefinery: 1,
                researchAcademy: 2
            };
            Object.keys(mapping).forEach(key => {
                const type = mapping[key];
                const value = Number(buildings[key]) || 0;
                if (value > 0) counts[type] = value;
            });
        }
        return counts;
    }

    // Deliberately an ESTIMATE, and labelled as one wherever it is shown. These
    // multipliers are flat; the real ones scale with the sector richness the
    // SECTOR SURVEY panel prints on the same screen, so this is an order of
    // magnitude for comparing two worlds, not a figure to plan a turn against.
    function estimateProduction(counts) {
        const metal = (counts[0] || 0) * 10;
        const crystal = (counts[1] || 0) * 10;
        const research = (counts[2] || 0) * 5;
        return { metal, crystal, research };
    }

    // Sector types, named and explained, for the hover tooltip.
    //
    // Two problems, one table. The tooltip has never named the type at all - a player hovering a
    // black hole was told Owner/Status/Intel/Markers/Fleet and not that it was a black hole.
    // (sectorTypeLabel() exists, but in GUI.js, feeding the detail panel rather than this.) And the
    // setting had no way of reaching a player who does not read a codex.
    //
    // So each entry carries the name and one line of why it matters. Ids and names are from
    // SECTOR_TYPES in server/lib/map.js and are pinned by tests/lore-sector-types-match-code.test.js;
    // the lines are condensed from lore/26-encyclopedia.md. Keep them to roughly a dozen words - this
    // is a hover, not a panel.
    /**
     * Minimal HTML escape for wire strings that end up inside an innerHTML template. The tooltip
     * is built as markup, and the chart name is the one piece of it that comes off the socket.
     */
    function escapeText(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const SECTOR_LORE = {
        0:  { name: 'Empty Space',   line: 'Open dark. Nothing to hold, nothing to fear, nothing to gain.' },
        1:  { name: 'Asteroid Belt', line: 'A shoal. Half your hulls crossing, a quarter arriving — and safe forever once swept.' },
        2:  { name: 'Black Hole',    line: 'A mouth. No roll, no survivors. Every one on the chart was found by a fleet that did not come back.' },
        3:  { name: 'Unstable Star', line: 'Free to cross, impossible to keep. The inverse of a shoal: it will not touch a fleet, and it will never be yours.' },
        4:  { name: 'Brown Dwarf',   line: 'A failed star. Too dim to fight over, bright enough to fix a position by. Permanent.' },
        5:  { name: 'Small Moon',    line: 'Worthless as ground, decisive as a position. A rock at a junction of traces is a door.' },
        6:  { name: 'Micro Planet',  line: 'Ore, and somewhere to put a yard. Nobody is from a micro planet.' },
        7:  { name: 'Small Planet',  line: 'It will grow something if you argue with it.' },
        8:  { name: 'Medium Planet', line: 'Grows willingly, and hides a problem. You find the problem in year three.' },
        9:  { name: 'Large Planet',  line: 'Good ground. Every one within reach was fought over before the Lamps went out.' },
        10: { name: 'Homeworld',     line: 'Where you were standing when the Lamps went out. Nobody chose their capital.' }
    };

    function showTooltipForTile(sectorId, force) {
        const sector = state.sectors[sectorId];
        if (!state.tooltip || !sector) return;
        renderTooltip(sectorId, force === true);
    }

    // ---------------------------------------------------------------------
    // THE READOUT NEVER COVERS THE INSTRUMENT IT IS DESCRIBING.
    //
    // The panel used to be pinned at pointer + 12 with nothing but a viewport
    // clamp. The chart is installed in the bottom-right corner of the screen, so
    // "just below and right of the cursor" is, for most of the board, on top of
    // the rest of the chart: a 298x238 panel over a 535x380 instrument hid about
    // a third of it, including the neighbouring cells a player hovers a tile in
    // order to compare. The module already knew how to place clear of the chart
    // and used it only on the keyboard path, so the common case was the broken
    // one.
    //
    // Pointer anchoring cannot be rescued by flipping the offset: the pointer is
    // always INSIDE the chart when a tile is hovered, and no offset from a point
    // inside a 535x380 box puts a 298x238 panel outside it. So both paths now
    // dock the panel to a side of the instrument. That is also the better
    // behaviour: a readout at a fixed, learnable place beside the equipment is
    // how this kind of console works, it stops the panel strobing around the
    // screen on every mousemove sample, and it makes the hover fast path a true
    // no-op — nothing to reposition at all while the pointer stays on one cell.
    //
    // Sides are tried in order of how much room they leave the eye to travel:
    // left of the chart first (the HUD's own reading direction), then above,
    // right, below. A side is only taken if the panel fits ON SCREEN there.
    // ---------------------------------------------------------------------
    function placeTooltipBesideChart() {
        const tip = state.tooltip;
        tip.style.visibility = 'hidden';
        tip.style.display = 'block';
        tip.style.left = '0px';
        tip.style.top = '0px';
        const box = tip.getBoundingClientRect();
        const w = box.width;
        const h = box.height;
        const chart = state.containerElement.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pad = 12;
        const edge = 8;
        // Align the long axis with the instrument, so the panel reads as docked
        // to it rather than as floating loose next to it.
        const alignY = Math.max(edge, Math.min(chart.top, vh - h - edge));
        const alignX = Math.max(edge, Math.min(chart.left, vw - w - edge));
        const candidates = [
            { x: chart.left - w - pad, y: alignY },
            { x: alignX, y: chart.top - h - pad },
            { x: chart.right + pad, y: alignY },
            { x: alignX, y: chart.bottom + pad }
        ];
        let placed = candidates.find(c =>
            c.x >= edge && c.y >= edge && c.x + w <= vw - edge && c.y + h <= vh - edge);
        if (!placed) {
            // Nowhere beside it fits. Take the largest gap around the chart and
            // clamp into it; covering the corner of the instrument beats being
            // half off screen, which is what the unclamped version did.
            const gaps = [
                { room: chart.left, x: Math.max(edge, chart.left - w - pad), y: alignY },
                { room: vh - chart.bottom, x: alignX, y: Math.min(vh - h - edge, chart.bottom + pad) },
                { room: vw - chart.right, x: Math.min(vw - w - edge, chart.right + pad), y: alignY },
                { room: chart.top, x: alignX, y: Math.max(edge, chart.top - h - pad) }
            ];
            placed = gaps.sort((a, b) => b.room - a.room)[0];
        }
        const left = Math.round(Math.max(edge, Math.min(placed.x, vw - w - edge)));
        const top = Math.round(Math.max(edge, Math.min(placed.y, vh - h - edge)));
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        tip.style.visibility = '';
        // The panel takes the pointer so a player can reach the figures on it
        // (WCAG 1.4.13) — but only where it is genuinely BESIDE the instrument.
        // In the fallback above it can be clamped over the chart, and a panel
        // that both covers cells and swallows their clicks is worse than one a
        // magnifier cannot reach on a viewport where the chart is already being
        // suppressed by the responsive rules.
        const clear = left + w <= chart.left || left >= chart.right
            || top + h <= chart.top || top >= chart.bottom;
        tip.style.pointerEvents = clear ? 'auto' : 'none';
        // Arming Escape here rather than at every call site is what guarantees
        // the listener's lifetime matches the panel's: this is the one function
        // that puts it on screen, and hideTooltip is the one that takes it off.
        // Re-registering the same reference is a no-op, so this cannot stack.
        document.addEventListener('keydown', handleDocumentEscape);
    }

    // The pointer event is no longer part of the placement — the panel docks to
    // the instrument, not to the cursor — but the hover handlers still hand it
    // over, and keeping the parameter is what documents that this is the mouse
    // path rather than the keyboard one.
    function showTooltip(_evt, sectorId) {
        renderTooltip(sectorId, false);
    }

    function renderTooltip(sectorId, force) {
        if (!state.tooltip) return;
        const sector = state.sectors[sectorId];
        if (!sector) return;
        // A panel the player dismissed with Escape stays dismissed until the
        // pointer or the chart cursor moves to a different cell.
        if (state.tooltipDismissed != null) {
            if (state.tooltipDismissed === sectorId && !force) return;
            state.tooltipDismissed = null;
        }
        // The pointer is back on a tile, so whatever close was pending is off.
        if (state.tooltipHold) { clearTimeout(state.tooltipHold); state.tooltipHold = null; }
        // THE HOVER FAST PATH. mousemove fires on every pointer sample, and a
        // single cell is dozens of samples wide; each one used to re-parse a
        // ten-element innerHTML template and then force two synchronous layouts
        // to reposition the result, on a main thread this surface already has to
        // share with a 3D map. The code knew the pointer had not left the cell —
        // it guards the hover chirp on exactly this comparison — it just did not
        // use it. Now that the panel is docked to the instrument rather than
        // dragged behind the cursor, "same sector, same content" is a complete
        // no-op: nothing to rebuild and nothing to move.
        const showing = state.tooltip.style.display !== 'none';
        if (!force && showing && sectorId === state.tooltipSectorId && !state.tooltipStale) return;
        const place = placeTooltipBesideChart;
        // Same authority as the label and the tile fill. The old predicate here
        // treated `live === false` as evidence of memory, which is true of every
        // tile that has never been reported at all, so hovering an unexplored
        // cell described its terrain.
        const hasKnownIntel = sector.intel !== 'fog';
        // Words, not the enum's identifier. This printed `Status: BLACKHOLE` and
        // `Owner: 3` — an internal constant name and a database key, shown to a
        // player as if they were English.
        const statusLabel = sector.status === SECTOR_STATUS.UNKNOWN && hasKnownIntel
            ? 'Unclaimed'
            : (STATUS_WORDS[sector.status] || 'Unknown');
        const ownerLabel = hasKnownIntel ? ownerWords(sector) : 'Unknown';
        const freshness = sector.intel === 'live' ? 'Live' : (sector.intel === 'memory' ? 'Memory' : 'Fog');
        // The panel code doubles as the sector number, so the head can carry the
        // sector's NAME where a panel would carry its title without losing the
        // one identifier every server message uses.
        const code = `SEC-${String(sectorId).padStart(3, '0')}`;
        const head = name => `<div class="tip-head"><span class="tip-name">${name}</span>`
            + `<span class="tip-code">${code}</span></div>`;
        const row = (k, v) => `<span class="tip-k">${k}</span><span class="tip-v">${v}</span>`;
        if (!hasKnownIntel) {
            state.tooltip.innerHTML = head(`Sector ${sectorId}`)
                + '<div class="tip-body"><div class="tip-rows">'
                + row('Intel', 'Fog — nothing charted here')
                + '</div></div>';
            place();
            state.tooltipSectorId = sectorId;
            state.tooltipStale = false;
            return;
        }
        // The panel is where the FULL marker set lives: the chart's annotation
        // row shows at most MARKER_DISPLAY_MAX letters plus a '+', because a
        // longer string cannot be condensed into a cell and stay readable.
        const markers = markerWords(sector) || 'None';
        const fleetText = fleetWords(sector) || 'None';
        // Same helper the spoken label uses, so the panel and the accessible name
        // cannot say different things about what a sector produces.
        const output = sectorOutput(sector);
        // The type is only shown once we actually know it. Under fog the branch above returns
        // early, so a player is never told what is in a sector they have not reached - which is
        // the whole point of the setting and would be undone by a helpful tooltip.
        const lore = sectorLore(sector);
        // The chart name is the sector's identity and the type is its classification, so the name
        // leads and the type follows it. This is the only place a player's own decision is shown
        // back to them on the map, which is the whole reason the naming feature is not cosmetic.
        //
        // escapeText, not raw interpolation: the name arrives over the socket. The server composes
        // it from a fixed word list so it cannot currently contain markup, but "cannot currently"
        // is not a property worth relying on inside an innerHTML template.
        const named = sector.chartName ? escapeText(sector.chartName) : '';
        const namerId = Number(sector.namedById) || null;
        const resolvedNamer = sector.namedBy
            || (namerId && typeof getCookie === 'function' && Number(getCookie('userId')) === namerId
                ? 'you'
                : (namerId && window.GAME_STATE?.players?.[namerId]?.name) || null);
        const credit = named && (resolvedNamer || sector.namedTurn)
            ? [
                resolvedNamer ? `named by ${escapeText(resolvedNamer)}` : 'named',
                sector.namedTurn ? `turn ${sector.namedTurn}` : ''
            ].filter(Boolean).join(', ')
            : '';
        // Classification line: what the sector IS, and who put its name on the
        // chart. Both are subordinate to the name in the head, which is why they
        // are one stencil line rather than two more fields.
        const classLine = [lore ? lore.name : '', credit].filter(Boolean).join(' · ');
        state.tooltip.innerHTML = head(named || `Sector ${sectorId}`)
            + '<div class="tip-body">'
            + (classLine ? `<div class="tip-class">${classLine}</div>` : '')
            + '<div class="tip-rows">'
            + row('Owner', escapeText(ownerLabel))
            + row('Status', escapeText(statusLabel))
            + row('Intel', freshness)
            + row('Markers', escapeText(markers))
            + row('Fleet', escapeText(fleetText))
            + (output.showBuilt ? row('Built', escapeText(output.buildingsText)) : '')
            // "Est." because the multipliers behind it are flat and the real
            // ones scale with sector richness, and no row at all on terrain
            // nobody can build on. See sectorOutput().
            + (output.showYield ? row('Est. yield/turn', escapeText(output.yieldsText)) : '')
            + '</div>'
            + (lore ? `<div class="tip-lore">${lore.line}</div>` : '')
            + '</div>';
        place();
        state.tooltipStale = false;
        // Only chirp when the tooltip moves to a DIFFERENT sector. mousemove
        // fires continuously across one tile, and a live map update now repaints
        // the panel under a keyboard cursor; neither is a new thing to hear.
        if (window.MediaManager?.playSfx && state.tooltipSectorId !== sectorId) {
            const now = Date.now();
            if (now - state.lastHoverSound > 300) {
                window.MediaManager.playSfx('hover');
                state.lastHoverSound = now;
            }
        }
        state.tooltipSectorId = sectorId;
    }

    // Return public API
    return {
        initialize,
        selectSector,
        // Selection made elsewhere (3D map click, server sector:: reply). Keeps this
        // module's selectedSector authoritative so callers can't read a stale sector.
        markSelected: function(sectorId) {
            const id = Number(sectorId);
            if (!Number.isFinite(id) || id <= 0) return;
            applySelection(id);
        },
        focusSector: function(sectorId) {
            g3dCall('focusSector', Number(sectorId));
        },
        updateSectorStatus,
        SECTOR_STATUS,
        highlightSector: function(sectorId) {
            g3dCall('highlightSector', sectorId);
            const sector = state.sectors[sectorId];
            if (!sector) return;
            sector.path.setAttribute('stroke', '#ffd166');
            sector.path.setAttribute('stroke-width', '3');
            setTimeout(() => {
                sector.path.setAttribute('stroke-width', '2');
                sector.path.setAttribute('stroke', STROKE_COLORS[sector.status] || '#555');
            }, 1800);
        },
        // Brief stroke pulse used for fleet arrivals (teal for yours, red for enemy).
        flashSector: function(sectorId, color) {
            const sector = state.sectors[Number(sectorId)];
            if (!sector) return;
            sector.path.setAttribute('stroke', color || '#66d9ff');
            sector.path.setAttribute('stroke-width', '4');
            setTimeout(() => {
                sector.path.setAttribute('stroke-width', '2');
                sector.path.setAttribute('stroke', STROKE_COLORS[sector.status] || '#555');
            }, 1400);
        },
        clearBattleSector: function(sectorId) {
            g3dCall('clearBattleSector', sectorId);
        },
        getSelectedSector: function() {
            return state.selectedSector;
        },
        resize
    };
})();

// Map initialization is handled by game.js to ensure proper ordering

/**
 * battle3d.js — the battle theater.
 *
 * When fleets collide the server freezes the whole game and every player watches
 * this. It is the only moment the game stops for, so it has to be worth stopping
 * for: two forces in real formation, closing, firing at each other, dying.
 *
 * This module owns ONLY the visualization. The outcome is already decided by the
 * server; we replay the per-round timeline it sends (battle.js wire format:
 * `battle:` followed by 20-field blocks — [9 attacker][9 defender][ground][orbital]
 * — block 0 = initial, each following block = end-of-round state).
 *
 * Exposes window.Battle3D with the same surface as the 2D BattleSystem so
 * connect.js can pick whichever is available:
 *   isAvailable()
 *   createBattleVisualization(message, options)
 *   cleanupBattleVisualization()
 *
 * ---------------------------------------------------------------------------
 * HOW IT IS BUILT (and why)
 *
 * 1. ONE MERGED SHIP, FOUR DRAW CALLS. The hulls are procedural: a dreadnought is
 *    ~110 boxes, cylinders, spheres and torii. Built naively that is 110 meshes
 *    and 110 geometries PER SHIP, and a 35-ship battle was issuing several
 *    thousand draw calls before a single tracer was fired. Every part now writes
 *    its colour into a VERTEX COLOUR and the whole ship is merged, per surface
 *    class, into four meshes: matte metal, gloss, self-lit, additive. Four
 *    materials serve every ship in the game, and each (class, faction) hull is
 *    merged exactly once and then cloned — clones share geometry and material, so
 *    the sixth destroyer costs one matrix.
 *
 * 2. THE LIGHTS ARE HDR AND THE BLOOM IS REAL. Self-lit vertex colours are
 *    written ABOVE 1.0 (engine cores ~3.5x, windows ~2x) into a half-float
 *    buffer, so UnrealBloomPass has something genuinely over-bright to bloom and
 *    the threshold can sit high enough that the hull plating does not smear. The
 *    bloom mip chain runs at half resolution — it is the one pass whose cost
 *    scales with pixels and buys nothing at full res — and the whole composer is
 *    dropped automatically if the measured frame time says the machine cannot
 *    afford it.
 *
 * 3. COMPOSITION IS AUTHORED, NOT DEFAULTED. Ships sit in role formations —
 *    screen ahead, line abreast, capitals anchoring the rear, colony hulls
 *    hiding behind everything — swept back into a wedge, tiered in height, and
 *    the two fleets CLOSE on each other while they fight. The camera is a shot
 *    list, not an orbit: establish wide, hard cut to an over-the-shoulder on the
 *    exchange, cut low into the crossfire, cut to a capital, then pull back for
 *    the verdict. Cuts land on round boundaries, and the whole list is scaled to
 *    whatever `options.durationMs` the server handed us — never longer.
 *
 * 4. ROUNDS RESOLVE WITH VISIBLE VIOLENCE. Every loss the timeline reports is
 *    preceded by an actual killing blow from an actual enemy hardpoint: tracer
 *    or lance, shield flare, then the hull detonates, sheds wreckage, and stays
 *    on the battlefield as a dark tumbling hulk. Ship type 6 (colony) is
 *    `armed:false` and never fires, in any code path.
 *
 * Built on the same Three.js the galaxy map uses; the backdrop world comes from
 * the same generator the map paints its planets with. When WebGL is unavailable
 * the caller falls back to the 2D BattleSystem.
 */
import * as THREE from './vendor/three.module.min.js';
// Same generator the galaxy map uses, so the world a battle is fought over looks
// like the world on the map. Imported as a namespace on purpose: this file only
// needs two of its ~30 exports and a namespace import cannot throw a link error
// if the generator's surface shifts under us — it degrades to the legacy path.
// The ?v MUST match galaxy3d.js's exactly. There is no bundler, so a differing
// query string is a different module URL: the generator would be instantiated
// twice, its texture cache would not be shared, and every world in the battle
// would be regenerated from scratch alongside the identical one the map already
// built. Bump the two together, always.
import * as PlanetTex from './planet-texture.js?v=20260728a';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/addons/postprocessing/OutputPass.js';
import { ShaderPass } from './vendor/addons/postprocessing/ShaderPass.js';

(function () {
    // --- Ship roster -------------------------------------------------------
    // scale drives on-screen size (bigger = more powerful). Colony is large but
    // unarmed. hull is the base tint, blended toward the faction accent.
    // role drives where the hull stands in the formation; weapon drives how it
    // shoots. code is the two-letter stencil the HUD roster reads out.
    const SHIP_META = {
        1: { name: 'Frigate',     code: 'FF', scale: 0.62, hull: 0x9fb2d6, family: 'escort',  guns: 1, armed: true,  role: 'line',   weapon: 'bolt' },
        2: { name: 'Destroyer',   code: 'DD', scale: 0.80, hull: 0x9aa8c8, family: 'escort',  guns: 2, armed: true,  role: 'line',   weapon: 'bolt' },
        3: { name: 'Scout',       code: 'SC', scale: 0.50, hull: 0xbfe0ff, family: 'dart',    guns: 1, armed: true,  role: 'screen', weapon: 'bolt' },
        4: { name: 'Cruiser',     code: 'CA', scale: 1.05, hull: 0x8fa0c4, family: 'cruiser', guns: 2, armed: true,  role: 'line',   weapon: 'bolt' },
        5: { name: 'Battleship',  code: 'BB', scale: 1.50, hull: 0x7f8cb0, family: 'capital', guns: 3, armed: true,  role: 'heavy',  weapon: 'beam' },
        6: { name: 'Colony Ship', code: 'CO', scale: 1.65, hull: 0xc9b48a, family: 'colony',  guns: 0, armed: false, role: 'rear',   weapon: null },
        7: { name: 'Dreadnought', code: 'DN', scale: 2.00, hull: 0x6f7aa0, family: 'capital', guns: 4, armed: true,  role: 'heavy',  weapon: 'beam' },
        8: { name: 'Intruder',    code: 'IN', scale: 1.05, hull: 0x8c93b8, family: 'dart',    guns: 2, armed: true,  role: 'screen', weapon: 'bolt' },
        9: { name: 'Carrier',     code: 'CV', scale: 2.10, hull: 0x76849c, family: 'carrier', guns: 2, armed: true,  role: 'heavy',  weapon: 'bolt' }
    };
    const SHIP_TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const VISIBLE_CAP = 6;      // hulls drawn per type per side; the HUD count carries the rest
    const HULL_BUDGET = 52;     // total hulls on screen before the per-type cap tightens
    const MAX_HULKS = 16;       // wrecks kept on the battlefield before the oldest is retired

    // Warm bronze against cold steel. The pair has to survive being read at a
    // glance in a frozen game: hue, not brightness, is what tells a player which
    // half of the screen is theirs.
    // `tint` is how far the hull plating is pulled toward the faction accent.
    // It has to be high. The class hull colours are all cool greys, and at a
    // gentle 0.22 both fleets came out the same blue-lavender — the only thing
    // telling a player which half of the screen was theirs was the engine glow.
    // Hue is the read here, so the plating carries it too: warm bronze against
    // cold steel, which is also the console palette the rest of the game uses.
    // `plating` is the faction's painted hull, and it is a stated colour rather
    // than a tint applied to the class colour. Deriving it produced two
    // problems at once: every class hull is a cool grey, so a gentle tint left
    // both fleets the same blue-lavender and only the engine glow told them
    // apart; and lightening those greys enough to take a warm tint blew the
    // near hulls to white under the key light. Stating the plating fixes the
    // value as well as the hue — warm bronze against cold steel, mid-dark, with
    // the class colour mixed back in only far enough to keep classes distinct.
    // These are stated BEFORE the plate atlas multiplies them, which lands the
    // painted hull near #9c7a4e / #6d7480 on screen.
    //
    // ROUND 3: the separation was MEASURED off the delivered frame and it was
    // not enough. A defender deck sampled (40,42,48) and an attacker deck
    // (62,53,52) — a twenty-unit warm/cool delta, at a luminance where 85% of
    // the frame sat below L=12. Any hull not currently thrusting toward the
    // lens was ambiguous, which in a strategy game means the player cannot see
    // who is winning: a legibility failure, not a taste one. The plating is now
    // stated as a genuinely brass hull against a genuinely steel-blue one, at
    // roughly three times the old separation, and the read is backed up by an
    // emissive running-light strip (see addSpine) that does not depend on the
    // hull being lit at all.
    const FACTION = {
        attacker: { label: 'Attackers', accent: 0xff8a3c, engine: 0xff7a30, bolt: 0xffb066, hud: '#ffb676', plating: 0xc47f2c },
        defender: { label: 'Defenders', accent: 0x74aee6, engine: 0x62c8ff, bolt: 0x9fdcff, hud: '#8fcbff', plating: 0x64809e }
    };

    // Surface classes every ship part is sorted into before merging.
    const B_METAL = 0, B_GLOSS = 1, B_LIGHT = 2, B_GLOW = 3, B_DECAL = 4;
    const BUCKETS = 5;

    const BASE_INTRO_MS = 2000;
    const BASE_OUTRO_MS = 2600;
    const MIN_ROUND_MS = 900;

    // --- Module state ------------------------------------------------------
    let webglOK = null;
    let renderer = null;
    let composer = null;
    let bloomPass = null;
    let sharpenPass = null;
    let scene = null;
    let camera = null;
    // THE FRAME CLOCK.
    //
    // This was a THREE.Clock, and it was silently broken in a way no screenshot
    // could show: `getElapsedTime()` is implemented AS a `getDelta()` call, so
    // `const now = clock.getElapsedTime(); const dt = clock.getDelta();` handed
    // the whole frame's delta to `now` and left `dt` at roughly zero. Everything
    // integrated per-frame — sparks, embers, tumbling wreckage, hulk rotation,
    // shake decay, recoil recovery, the backdrop's spin — advanced by nothing
    // and simply hung in space where it was born. Worse, every timer callback
    // that asked the clock what time it was ALSO consumed a delta, so the next
    // frame's dt was whatever had elapsed since the last explosion.
    //
    // A monotonic reading that costs nothing to take fixes both: `nowSec()` is a
    // query, never a consumption, and the frame delta is measured exactly once
    // per frame by the only code entitled to measure it.
    let clockOrigin = 0;
    let lastFrameSec = 0;
    function nowSec() { return (performance.now() - clockOrigin) / 1000; }
    let animHandle = null;
    let theaterEl = null;        // full-screen overlay (canvas + HUD live here)
    let hud = null;
    let running = false;
    const battleQueue = [];      // pending battles, played sequentially
    let current = null;          // active playback context
    let timers = [];             // scheduled round events
    let stage = null;            // persistent scene furniture (backdrop, lights, pools)
    let frameSamples = [];       // rolling frame times, for the quality governor

    // ----------------------------------------------------------------------
    // Capability check
    // ----------------------------------------------------------------------
    function isAvailable() {
        if (webglOK !== null) return webglOK;
        try {
            const canvas = document.createElement('canvas');
            webglOK = !!(window.WebGLRenderingContext &&
                (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch (e) {
            webglOK = false;
        }
        return webglOK;
    }

    // ----------------------------------------------------------------------
    // Deterministic randomness. Formations, greeble jitter and debris all have
    // to look scattered and still be identical on every replay — a battle that
    // re-rolls its layout every frame cannot be judged from a screenshot.
    // ----------------------------------------------------------------------
    function rng(seed) {
        let a = (seed >>> 0) || 1;
        return function next() {
            a += 0x6D2B79F5;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ----------------------------------------------------------------------
    // Wire-format parsing -> timeline of round states
    // ----------------------------------------------------------------------
    function parseTimeline(message) {
        const parts = String(message).split(':'); // parts[0] === 'battle'
        const fields = parts.slice(1).map(n => parseInt(n, 10) || 0);
        const blocks = [];
        for (let i = 0; i + 20 <= fields.length; i += 20) {
            const block = fields.slice(i, i + 20);
            blocks.push({
                attackers: block.slice(0, 9),
                defenders: block.slice(9, 18),
                ground: block[18] || 0,
                orbital: block[19] || 0
            });
        }
        if (blocks.length === 0) return null;
        // If only the initial block exists, synthesize a "nothing changed" round.
        if (blocks.length === 1) blocks.push(blocks[0]);
        return blocks;
    }

    function sumCounts(arr) { return arr.reduce((s, n) => s + n, 0); }
    function blend(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex(); }
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }
    function easeOut(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }

    // ----------------------------------------------------------------------
    // Shared canvas textures. Built once, kept forever — a battle is a rare
    // event and rebuilding half a megabyte of noise every time one starts is
    // exactly the kind of hitch that shows up as a dropped intro.
    // ----------------------------------------------------------------------
    const tex = {};

    function radialTexture(stops, size) {
        const c = document.createElement('canvas');
        c.width = c.height = size || 64;
        const ctx = c.getContext('2d');
        const h = c.width / 2;
        const g = ctx.createRadialGradient(h, h, 0, h, h, h);
        stops.forEach(s => g.addColorStop(s[0], s[1]));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, c.width);
        const t = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
        return t;
    }

    function glowTexture() {
        if (!tex.glow) {
            tex.glow = radialTexture([
                [0, 'rgba(255,255,255,1)'],
                [0.18, 'rgba(255,255,255,0.72)'],
                [0.48, 'rgba(255,255,255,0.20)'],
                [1, 'rgba(255,255,255,0)']
            ], 64);
        }
        return tex.glow;
    }

    function sparkTexture() {
        if (!tex.spark) {
            // A tight core with a short halo. The old profile held half its
            // brightness out to a third of the radius, which reads as a filled
            // disc rather than as a spark the moment the point is more than a
            // few pixels across.
            tex.spark = radialTexture([
                [0, 'rgba(255,255,255,1)'],
                [0.16, 'rgba(255,255,255,0.72)'],
                [0.38, 'rgba(255,255,255,0.16)'],
                [1, 'rgba(255,255,255,0)']
            ], 32);
        }
        return tex.spark;
    }

    /**
     * Beam profile. A weapon drawn as a solid-coloured cylinder reads as a
     * painted BAR: its silhouette is a hard rectangle whatever the camera does,
     * and a frame with four of them looks like scaffolding. Everything that
     * shoots is drawn instead as a camera-facing quad carrying this profile —
     * a hot centre line falling off to nothing at the edges, and a short fade
     * at each end so the beam does not stop with a straight cut.
     */
    function beamTexture() {
        if (tex.beam) return tex.beam;
        const W = 64, H = 128;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(W, H);
        const px = img.data;
        for (let y = 0; y < H; y++) {
            const v = (y + 0.5) / H;
            const ends = Math.min(smooth01(v / 0.06), smooth01((1 - v) / 0.1));
            for (let x = 0; x < W; x++) {
                const u = (x + 0.5) / W;
                const d = Math.abs(u * 2 - 1);
                const core = Math.pow(Math.max(0, 1 - d), 3.4);
                const wide = Math.pow(Math.max(0, 1 - d), 1.15) * 0.42;
                const a = Math.min(1, (core + wide) * ends);
                const o = (y * W + x) * 4;
                px[o] = px[o + 1] = px[o + 2] = 255;
                px[o + 3] = a * 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.beam = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.beam.colorSpace = THREE.SRGBColorSpace;
        return tex.beam;
    }
    function smooth01(t) { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); }

    /**
     * Tracer profile — ASYMMETRIC, which is the whole point.
     *
     * The beam profile above fades at both ends, and a short quad carrying it
     * reads as a capsule: a uniform amber pill with no core, no direction and no
     * sense of travel. A round in flight has a hot head and a tail that thins
     * and dies behind it. v = 1 is the head.
     *
     * THE HEAD IS ROUND, AND IT IS ROUND IN WORLD SPACE. The previous profile
     * was WIDEST at v=1 and then cut its alpha to zero over the last 7% of the
     * length — a chisel: a square, flat, stair-stepped chop at the leading end
     * with the full quad width behind it. The head is now a genuine 2D gaussian
     * whose v-extent is corrected for the quad's 16:1 world aspect, so it
     * projects as a hot circular nose rather than as an ellipse or a blade, and
     * the streak fades out UNDER it instead of ending in mid-air.
     */
    // Length-to-width of the tracer quad (see fireShot: 9.5 units long, 0.60
    // wide), expressed in half-widths, which is the unit `x` below is in.
    const TRACER_ASPECT = 31.7;
    function tracerTexture() {
        if (tex.tracer) return tex.tracer;
        const W = 64, H = 128;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(W, H);
        const px = img.data;
        const VHEAD = 0.935, SIG = 0.62;
        for (let y = 0; y < H; y++) {
            const v = (y + 0.5) / H;                 // 0 = tail, 1 = head
            const dv = (v - VHEAD) * TRACER_ASPECT;
            // The streak dies out just past the head's centre, where the head
            // itself is at full brightness and hides the transition.
            const along = Math.pow(v, 2.4) * smooth01((VHEAD + 0.03 - v) / 0.06);
            const halfWidth = 0.26 + v * 0.34;
            for (let x = 0; x < W; x++) {
                const dx = (x + 0.5) / W * 2 - 1;
                const d = Math.abs(dx) / halfWidth;
                let a = 0;
                if (d < 1) {
                    const core = Math.pow(1 - d, 5.0);
                    const wide = Math.pow(1 - d, 1.4) * 0.34;
                    a = clamp((core + wide) * along, 0, 1);
                }
                a = clamp(a + Math.exp(-(dx * dx + dv * dv) / (2 * SIG * SIG)), 0, 1);
                // Ordered dither. An undithered 8-bit ramp down a 128-texel
                // gradient shows four or five discrete steps across the round
                // once it is magnified onto a quad crossing the frame.
                const dth = (((x & 1) ^ (y & 1)) - 0.5) * 1.0;
                const o = (y * W + x) * 4;
                px[o] = px[o + 1] = px[o + 2] = 255;
                px[o + 3] = clamp(a * 255 + dth, 0, 255);
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.tracer = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.tracer.colorSpace = THREE.SRGBColorSpace;
        tex.tracer.flipY = false;
        return tex.tracer;
    }

    /**
     * Fireball profile. Explosions were spheres: an additive low-poly sphere is
     * a flat disc with a hard, visibly faceted silhouette, and two of them
     * stacked read as a billiard ball parked in the fleet. A billboard carrying
     * a radial falloff with a RAGGED edge — angular noise on the radius — reads
     * as burning gas, costs one quad, and never shows a polygon.
     */
    function fireTexture() {
        if (tex.fire) return tex.fire;
        const S = 128;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(S, S);
        const px = img.data;
        const lobes = [];
        const rnd = rng(20260728);
        for (let i = 0; i < 5; i++) lobes.push({ f: 2 + i * 2, p: rnd() * Math.PI * 2, a: 0.13 / (i + 1) });
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
                const r = Math.sqrt(dx * dx + dy * dy);
                const th = Math.atan2(dy, dx);
                let wob = 1;
                for (let i = 0; i < lobes.length; i++) wob += Math.sin(th * lobes[i].f + lobes[i].p) * lobes[i].a;
                const rr = r / Math.max(0.35, wob);
                const a = rr >= 1 ? 0 : Math.pow(1 - rr, 2.1) * (0.55 + 0.45 * Math.pow(1 - rr, 3));
                const o = (y * S + x) * 4;
                px[o] = px[o + 1] = px[o + 2] = 255;
                px[o + 3] = clamp(a, 0, 1) * 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.fire = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.fire.colorSpace = THREE.SRGBColorSpace;
        return tex.fire;
    }

    /**
     * SMOKE — the only thing in an explosion that has mass.
     *
     * Everything else in a blast is additive, and additive light cannot hide
     * anything: a purely additive explosion is transparent by construction, so
     * the hull behind it keeps showing through and the whole event reads as a
     * decal painted over the picture rather than as burning wreckage occupying
     * space. This is drawn with NORMAL blending and a dark tint, so for the
     * beat it lives it genuinely occludes what is behind it. Ragged and lumpy —
     * two octaves of value noise on the alpha — because a smooth disc of soot
     * is just a grey circle.
     */
    function smokeTexture() {
        if (tex.smoke) return tex.smoke;
        const S = 128;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(S, S);
        const px = img.data;
        const lobes = [];
        const rnd = rng(0x51043);
        for (let i = 0; i < 4; i++) lobes.push({ f: 3 + i * 2, p: rnd() * Math.PI * 2, a: 0.17 / (i + 1) });
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
                const r = Math.sqrt(dx * dx + dy * dy);
                const th = Math.atan2(dy, dx);
                let wob = 1;
                for (let i = 0; i < lobes.length; i++) wob += Math.sin(th * lobes[i].f + lobes[i].p) * lobes[i].a;
                const rr = r / Math.max(0.3, wob);
                let a = rr >= 1 ? 0 : Math.pow(1 - rr, 1.25);
                // Interior lumps, so the soot has billows rather than a smooth
                // gradient. Sampled in the plane, not radially, so they do not
                // form rings.
                const lump = vnoise(dx * 4.2, dy * 4.2, 0.5, 7717) * 0.55
                    + vnoise(dx * 9.5, dy * 9.5, 1.5, 3391) * 0.28;
                a *= 0.52 + lump;
                const o = (y * S + x) * 4;
                px[o] = px[o + 1] = px[o + 2] = 255;
                px[o + 3] = clamp(a, 0, 1) * 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.smoke = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.smoke.colorSpace = THREE.SRGBColorSpace;
        return tex.smoke;
    }

    /**
     * LANCE profile — for the ribbon a capital's main gun is drawn with.
     *
     * The beam profile above fades at BOTH ends, which is right for a short
     * bolt and wrong for a lance: a capital's lance is at full power the
     * instant it leaves the muzzle, and the previous build's flat 7-pixel
     * Gaussian held one constant width and one constant intensity across
     * fifteen hundred pixels of screen. This gives the cross-section a genuine
     * white core (the texture writes 255 and the material multiplies well above
     * 1.0, so the core clips through ACES and the halo keeps the faction tint),
     * and a travelling pulse along the axis so the shaft reads as something
     * being pumped down a channel rather than as a line drawn on the frame.
     * The WIDTH profile is geometry, not texture — see shapeRibbon().
     */
    function lanceTexture() {
        if (tex.lance) return tex.lance;
        const W = 64, H = 128;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(W, H);
        const px = img.data;
        for (let y = 0; y < H; y++) {
            const v = (y + 0.5) / H;
            // Barely any end fade: the ribbon's own taper does that job.
            const ends = Math.min(smooth01(v / 0.025), smooth01((1 - v) / 0.035));
            const pulse = 1 + 0.20 * Math.sin(v * 41.0) + 0.11 * Math.sin(v * 103.0 + 1.7);
            for (let x = 0; x < W; x++) {
                const u = (x + 0.5) / W;
                const d = Math.abs(u * 2 - 1);
                const core = Math.pow(Math.max(0, 1 - d), 4.2);
                const wide = Math.pow(Math.max(0, 1 - d), 1.10) * 0.40;
                const a = Math.min(1, (core * pulse + wide) * ends);
                const o = (y * W + x) * 4;
                px[o] = px[o + 1] = px[o + 2] = 255;
                px[o + 3] = a * 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.lance = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.lance.colorSpace = THREE.SRGBColorSpace;
        return tex.lance;
    }

    /**
     * Shockwave profile: a soft Gaussian annulus painted on a flat disc, not a
     * RingGeometry. An annulus of triangles has two hard geometric edges, and
     * at any size it reads as a drawn hoop rather than as a wave front.
     *
     * A WAVE FRONT HAS A TEMPERATURE. Writing 255,255,255 at every texel gave a
     * hoop that was flat white from the leading edge to the trailing edge — a
     * chalk circle, with no direction and nothing to say which way it was
     * travelling. The ring expands, so the OUTER edge is the front: near-white
     * there, falling through amber and into a cooling orange behind it.
     */
    function ringTexture() {
        if (tex.ring) return tex.ring;
        const S = 128;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(S, S);
        const px = img.data;
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
                const r = Math.sqrt(dx * dx + dy * dy);
                let a = 0;
                if (r <= 1) {
                    const g = (r - 0.86) / 0.072;
                    a = Math.exp(-g * g) * smooth01((1 - r) / 0.12);
                }
                let cg, cb;
                if (r >= 0.88) { cg = 250; cb = 240; }
                else if (r >= 0.84) { const u = (r - 0.84) / 0.04; cg = 194 + 56 * u; cb = 122 + 118 * u; }
                else if (r >= 0.80) { const u = (r - 0.80) / 0.04; cg = 106 + 88 * u; cb = 32 + 90 * u; }
                else { cg = 106; cb = 32; }
                const o = (y * S + x) * 4;
                px[o] = 255; px[o + 1] = cg; px[o + 2] = cb;
                px[o + 3] = a * 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.ring = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.ring.colorSpace = THREE.SRGBColorSpace;
        return tex.ring;
    }

    /**
     * Shield facet texture: concentric hex rings that only exist where the
     * shield is being struck. It is what separates "a hull took a hit" from
     * "a hull is about to die" — a legibility job, not decoration.
     */
    function shieldTexture() {
        if (tex.shield) return tex.shield;
        const S = 256;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, S, S);
        // Radial falloff from the impact point, which sits at the cap's pole =
        // the centre of the UV patch we map onto it.
        const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(0.28, 'rgba(255,255,255,0.16)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, S, S);
        // Hex lattice, brightest near the impact. It carries most of the read:
        // a plain radial blob is indistinguishable from an explosion, and the
        // player has to be able to tell "held" from "hit".
        ctx.lineWidth = 2.4;
        const R = 15;
        for (let row = -1; row * R * 1.5 < S + R; row++) {
            for (let col = -1; col * R * 1.732 < S + R * 2; col++) {
                const cx = col * R * 1.732 + (row % 2 ? R * 0.866 : 0);
                const cy = row * R * 1.5;
                const d = Math.hypot(cx - S / 2, cy - S / 2) / (S / 2);
                if (d > 1) continue;
                ctx.strokeStyle = `rgba(255,255,255,${(0.92 * (1 - d) * (1 - d)).toFixed(3)})`;
                ctx.beginPath();
                for (let k = 0; k < 6; k++) {
                    const a = (Math.PI / 3) * k + Math.PI / 6;
                    const x = cx + Math.cos(a) * R * 0.92;
                    const y = cy + Math.sin(a) * R * 0.92;
                    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }
        tex.shield = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.shield.colorSpace = THREE.SRGBColorSpace;
        return tex.shield;
    }

    /**
     * Plume profile: what a drive actually looks like from the side. The old
     * plume was a cone — a hard-edged opaque polygon stuck on the hull, with
     * flat facets and a straight silhouette, which reads as a clip-art flame
     * decal rather than as mass being accelerated. This is the alternative: a
     * ramp along the axis (hot at the throat, gone by the tail) crossed with a
     * soft profile, perturbed by a couple of low-frequency wobbles so the edge
     * is never a straight line. V runs from the throat (0) to the tail (1).
     */
    function plumeTexture() {
        if (tex.plume) return tex.plume;
        const W = 64, H = 160;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(W, H);
        const px = img.data;
        for (let y = 0; y < H; y++) {
            const v = (y + 0.5) / H;
            // Hot core right at the throat, dying over the last third — never a
            // hard cut, which is the whole point.
            const along = Math.pow(1 - v, 1.7) * smooth01(v / 0.05);
            // The plume flares, so the useful width grows down the axis.
            const halfWidth = 0.30 + v * 0.68;
            for (let x = 0; x < W; x++) {
                const u = (x + 0.5) / W;
                const d = Math.abs(u * 2 - 1) / halfWidth;
                if (d >= 1) { const o = (y * W + x) * 4; px[o] = px[o + 1] = px[o + 2] = 255; px[o + 3] = 0; continue; }
                // Two frequencies of shear so the flame licks instead of tapering.
                const lick = 1
                    + 0.16 * Math.sin(v * 21 + u * 7)
                    + 0.10 * Math.sin(v * 47 - u * 13 + 2.1);
                const prof = Math.pow(1 - d, 2.0) * 0.55 + Math.pow(1 - d, 7.0) * 0.62;
                const a = clamp(prof * along * lick, 0, 1);
                const o = (y * W + x) * 4;
                px[o] = px[o + 1] = px[o + 2] = 255;
                px[o + 3] = a * 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.plume = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.plume.colorSpace = THREE.SRGBColorSpace;
        // v = 0 is the THROAT. Without this the ramp arrives upside down and the
        // plume is brightest where it should have faded out.
        tex.plume.flipY = false;
        return tex.plume;
    }

    /** Four-point diffraction flare for the handful of hero stars. */
    function flareTexture() {
        if (tex.flare) return tex.flare;
        const S = 128;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(S, S);
        const px = img.data;
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
                const r = Math.hypot(dx, dy);
                const core = Math.pow(Math.max(0, 1 - r * 2.6), 3.0);
                const ax = Math.max(0, 1 - Math.abs(dx) * 1.02) * Math.pow(Math.max(0, 1 - Math.abs(dy) * 16), 2);
                const ay = Math.max(0, 1 - Math.abs(dy) * 1.02) * Math.pow(Math.max(0, 1 - Math.abs(dx) * 16), 2);
                const a = clamp(core + (ax + ay) * 0.5, 0, 1);
                const o = (y * S + x) * 4;
                px[o] = px[o + 1] = px[o + 2] = 255;
                px[o + 3] = a * 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.flare = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.flare.colorSpace = THREE.SRGBColorSpace;
        return tex.flare;
    }

    // ----------------------------------------------------------------------
    // HULL SURFACE — the plate atlas
    //
    // Every hull in the first pass was `vertexColors: true` and nothing else:
    // no map, no normal map, no roughness map. At any distance where the hull
    // fills the frame that reads as clay, because the only thing varying across
    // a plate is the lighting gradient. This is the fix, and it is one shared
    // tileable atlas rather than per-ship UV work:
    //
    //   albedo    an irregular plate grid, seams, rivet rows, weather streaks
    //   normal    Sobel of the albedo's luminance, so seams and rivets have
    //             relief and the key light breaks over them
    //   ORM       roughness in G / metalness in B, derived from the same
    //             luminance so seams read as grimy and plate faces as steel
    //
    // The UVs are generated in mergeParts() by a per-triangle planar projection
    // at a CONSTANT world-space texel density (PLATE_WORLD units per tile), so a
    // frigate and a dreadnought carry plating at exactly the same scale and the
    // texture never has to know which hull it is on.
    // ----------------------------------------------------------------------
    const PLATE_SIZE = 1024;      // albedo + normal
    const PLATE_ORM_SIZE = 512;   // roughness/metalness — lower frequency
    // World units spanned by one UV tile. This is the single number that sets
    // how big a plate is on every hull in the game, and it was measured, not
    // guessed: at 2.6 a dreadnought carried thirty-two plate courses and rivets
    // 2.5 screen pixels apart in the hero shot, which resolves as a quilt of
    // blocky noise rather than as plating. At 4.2 a dreadnought reads about
    // seventeen courses — the count a real capital hull has — and the rivets
    // land far enough apart to be rivets.
    const PLATE_WORLD = 4.2;      // world units spanned by one UV tile

    function plateMaps() {
        if (tex.plate) return tex.plate;
        const S = PLATE_SIZE;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        // willReadFrequently is NOT a micro-optimisation here. The normal map is
        // derived from this canvas, so it has to be read back — and on an
        // accelerated 2D context a single 1024^2 getImageData is a GPU->CPU
        // round trip that measured SIX AND A HALF SECONDS in the capture
        // harness, which is most of a battle's entire startup budget. Asking for
        // a CPU-backed surface up front makes the same read effectively free.
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const rnd = rng(0x5af3b1);

        // Anything drawn near a tile border has to be drawn on the far side too
        // or the seam shows as a break in the plating.
        const wrapEach = (x, y, fn) => {
            const xs = x < 10 ? [x, x + S] : x > S - 10 ? [x, x - S] : [x];
            const ys = y < 10 ? [y, y + S] : y > S - 10 ? [y, y - S] : [y];
            for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length; j++) fn(xs[i], ys[j]);
        };

        // The atlas MULTIPLIES the faction paint, so its mean has to sit high:
        // a mid-grey texture halves every hull in the fleet and the paint scheme
        // stops being the thing that carries ownership. Bright plate, dark
        // seams, so the structure comes from contrast rather than from value.
        ctx.fillStyle = '#dcdcdc';
        ctx.fillRect(0, 0, S, S);

        // --- plate grid. Irregular, but pinned to 0 and S so the tile wraps.
        const edges = (n, jitter) => {
            const e = [0];
            for (let i = 1; i < n; i++) e.push(Math.round(S * (i / n + (rnd() - 0.5) * jitter)));
            e.push(S);
            return e;
        };
        const gx = edges(5, 0.05), gy = edges(4, 0.055);

        // Plate faces: each one a slightly different value, so the hull is a
        // patchwork of welded plate rather than one continuous skin.
        for (let j = 0; j < gy.length - 1; j++) {
            for (let i = 0; i < gx.length - 1; i++) {
                const v = Math.round(218 + rnd() * 26);
                ctx.fillStyle = `rgb(${v},${v},${v})`;
                ctx.fillRect(gx[i], gy[j], gx[i + 1] - gx[i], gy[j + 1] - gy[j]);
                // One or two sub-panels inside the bigger plates.
                const w = gx[i + 1] - gx[i], h = gy[j + 1] - gy[j];
                if (w > 90 && rnd() < 0.8) {
                    const sx = gx[i] + Math.round(w * (0.25 + rnd() * 0.4));
                    ctx.fillStyle = 'rgba(52,54,58,0.42)';
                    ctx.fillRect(sx, gy[j] + 6, 4, h - 12);
                    ctx.fillStyle = 'rgba(255,255,255,0.18)';
                    ctx.fillRect(sx + 4, gy[j] + 6, 2, h - 12);
                }
                if (h > 90 && rnd() < 0.7) {
                    const sy = gy[j] + Math.round(h * (0.3 + rnd() * 0.4));
                    ctx.fillStyle = 'rgba(52,54,58,0.42)';
                    ctx.fillRect(gx[i] + 6, sy, w - 12, 4);
                    ctx.fillStyle = 'rgba(255,255,255,0.18)';
                    ctx.fillRect(gx[i] + 6, sy + 4, w - 12, 2);
                }
            }
        }

        // --- seams: a dark recess with a bright lip on the light-facing side.
        const seam = (x0, y0, x1, y1) => {
            ctx.strokeStyle = 'rgba(22,24,28,0.9)'; ctx.lineWidth = 7;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.34)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(x0 + 4.5, y0 + 4.5); ctx.lineTo(x1 + 4.5, y1 + 4.5); ctx.stroke();
        };
        gx.forEach(x => seam(x, 0, x, S));
        gy.forEach(y => seam(0, y, S, y));

        // --- rivets. The single detail that says "riveted metal" at any
        // distance: a dark pit with a bright cap, run along every plate edge.
        const rivet = (x, y, r) => {
            ctx.fillStyle = 'rgba(26,28,32,0.85)';
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.80)';
            ctx.beginPath(); ctx.arc(x - r * 0.30, y - r * 0.32, r * 0.60, 0, Math.PI * 2); ctx.fill();
        };
        const RIV = 38;
        gx.forEach(x => {
            for (let y = RIV * 0.5; y < S; y += RIV) wrapEach(x + 13, y, (a, b) => rivet(a, b, 5.2));
        });
        gy.forEach(y => {
            for (let x = RIV * 0.5; x < S; x += RIV) wrapEach(x, y + 13, (a, b) => rivet(a, b, 5.2));
        });

        // --- weathering. Streaks trailing from the seams and a little blotch,
        // so the plating is not uniformly new.
        for (let i = 0; i < 90; i++) {
            const x = rnd() * S, y = rnd() * S;
            const len = 22 + rnd() * 130, w = 2 + rnd() * 7;
            wrapEach(x, y, (a, b) => {
                const g = ctx.createLinearGradient(a, b, a, b + len);
                g.addColorStop(0, 'rgba(52,48,44,0.30)');
                g.addColorStop(1, 'rgba(52,48,44,0)');
                ctx.fillStyle = g;
                ctx.fillRect(a - w / 2, b, w, len);
            });
        }
        for (let i = 0; i < 42; i++) {
            const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 26;
            wrapEach(x, y, (a, b) => {
                const g = ctx.createRadialGradient(a, b, 0, a, b, r);
                g.addColorStop(0, `rgba(${rnd() < 0.5 ? '40,42,46' : '210,205,196'},0.16)`);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.fillRect(a - r, b - r, r * 2, r * 2);
            });
        }
        // --- a few maintenance hatches: a designed element, not noise.
        for (let i = 0; i < 12; i++) {
            const x = 40 + rnd() * (S - 140), y = 40 + rnd() * (S - 140);
            const w = 44 + rnd() * 52, h = 30 + rnd() * 34;
            ctx.strokeStyle = 'rgba(26,28,32,0.85)'; ctx.lineWidth = 4.5;
            ctx.strokeRect(x, y, w, h);
            ctx.strokeStyle = 'rgba(255,255,255,0.26)'; ctx.lineWidth = 2;
            ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
            rivet(x + 8, y + 8, 3.4); rivet(x + w - 8, y + 8, 3.4);
            rivet(x + 8, y + h - 8, 3.4); rivet(x + w - 8, y + h - 8, 3.4);
        }

        const albedo = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) albedo.colorSpace = THREE.SRGBColorSpace;
        albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
        // A hull is almost always seen at a grazing angle — that is what a long
        // thin ship IS — so the plating's mip selection is dominated by the
        // steep axis and 4x anisotropy was still fetching a blurred mip along
        // the deck. Take whatever the driver will give, up to 16.
        albedo.anisotropy = maxAnisotropy(16);

        // --- normal map, straight off the albedo's luminance. Cheap, and it is
        // the correct relief here because the albedo IS the relief: seams are
        // recesses, rivets are domes, streaks are flat.
        const src = ctx.getImageData(0, 0, S, S).data;
        const lum = new Float32Array(S * S);
        for (let i = 0, n = S * S; i < n; i++) lum[i] = src[i * 4] / 255;
        const nc = document.createElement('canvas');
        nc.width = nc.height = S;
        const nctx = nc.getContext('2d');
        const nimg = nctx.createImageData(S, S);
        const np = nimg.data;
        const STR = 2.6;
        for (let y = 0; y < S; y++) {
            const ym = ((y - 1 + S) % S) * S, yp = ((y + 1) % S) * S, yc = y * S;
            for (let x = 0; x < S; x++) {
                const xm = (x - 1 + S) % S, xp = (x + 1) % S;
                const dx = (lum[yc + xp] - lum[yc + xm]) * STR;
                const dy = (lum[yp + x] - lum[ym + x]) * STR;
                let nx = -dx, ny = dy, nz = 1;
                const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
                nx *= inv; ny *= inv; nz *= inv;
                const o = (yc + x) * 4;
                np[o] = (nx * 0.5 + 0.5) * 255;
                np[o + 1] = (ny * 0.5 + 0.5) * 255;
                np[o + 2] = (nz * 0.5 + 0.5) * 255;
                np[o + 3] = 255;
            }
        }
        nctx.putImageData(nimg, 0, 0);
        const normal = new THREE.CanvasTexture(nc);
        normal.wrapS = normal.wrapT = THREE.RepeatWrapping;

        // --- ORM. G = roughness, B = metalness, both driven off the same
        // luminance: seams and grime are rough and less metallic, plate faces
        // are polished steel. Half resolution — it is the lowest-frequency of
        // the three and doubling it buys nothing.
        // ROUGHNESS HAS TO KNOW WHAT THE NORMAL MAP IS DOING.
        //
        // This is where the white shatter came from. The normal map above is
        // derived from the albedo at STR 2.6, so a rivet cap or a seam lip
        // tilts its texels by tens of degrees over one or two texels — and a
        // near-mirror roughness under a 2.75-intensity key means every one of
        // those texels that happens to land on the half-vector clips to white
        // while its neighbour does not. Magnified across a deck that is exactly
        // where the light is coming from, the result was an aliased white crust
        // with 47x the high-frequency energy of the same hull's side plating.
        //
        // The standard answer, and the correct one, is to fold the sub-texel
        // NORMAL VARIANCE into the roughness: a surface whose micro-normals are
        // scattered IS rough, and saying so widens the specular lobe exactly
        // where it was shattering. Three.js already does this for geometric
        // normals (`geometryRoughness` off dFdx(nonPerturbedNormal)); it cannot
        // do it for a normal map, so it is baked here. It costs one pass over
        // the luminance we already have and nothing at all at runtime.
        const O = PLATE_ORM_SIZE, step = S / O;
        const oc = document.createElement('canvas');
        oc.width = oc.height = O;
        const octx = oc.getContext('2d');
        const oimg = octx.createImageData(O, O);
        const op = oimg.data;
        for (let y = 0; y < O; y++) {
            for (let x = 0; x < O; x++) {
                const sx0 = Math.floor(x * step), sy0 = Math.floor(y * step);
                const l = lum[(sy0 * S) + sx0];
                let grad = 0;
                for (let j = 0; j < step; j++) {
                    const yy = (sy0 + j) % S;
                    const ym = ((yy - 1 + S) % S) * S, yp = ((yy + 1) % S) * S, yc = yy * S;
                    for (let i = 0; i < step; i++) {
                        const xx = (sx0 + i) % S;
                        const gx = lum[yc + ((xx + 1) % S)] - lum[yc + ((xx - 1 + S) % S)];
                        const gy = lum[yp + xx] - lum[ym + xx];
                        grad += Math.sqrt(gx * gx + gy * gy);
                    }
                }
                const varRough = clamp(grad / (step * step) * 0.55, 0, 0.42);
                const rough = clamp(0.88 - l * 0.52 + varRough, 0.36, 0.94);
                // PAINTED steel, not bare. A warship's plating is coated; at
                // near-metal values the diffuse term vanishes and every hull
                // reflects a black sky, which is exactly how the fleet ended up
                // reading as silhouettes with a rim light. Metal shows through
                // where the paint has worn, and nowhere else.
                const metal = clamp(0.04 + l * 0.34, 0.04, 0.40);
                const o = (y * O + x) * 4;
                op[o] = 255;
                op[o + 1] = rough * 255;
                op[o + 2] = metal * 255;
                op[o + 3] = 255;
            }
        }
        octx.putImageData(oimg, 0, 0);
        const orm = new THREE.CanvasTexture(oc);
        orm.wrapS = orm.wrapT = THREE.RepeatWrapping;

        // --- EMBER. What a wreck looks like an hour after it stopped being a
        // ship: the plate faces have radiated their heat away and the recesses
        // — seams, hatch surrounds, the shadowed side of every rivet — are
        // still glowing. It is the INVERSE of the albedo's luminance, so it
        // lands exactly in the geometry that already reads as a recess, and it
        // is the difference between a dead hull with form and a black hole
        // punched in the picture. Only the hulk material uses it.
        const emc = document.createElement('canvas');
        emc.width = emc.height = O;
        const emctx = emc.getContext('2d');
        const eimg = emctx.createImageData(O, O);
        const ep = eimg.data;
        for (let y = 0; y < O; y++) {
            for (let x = 0; x < O; x++) {
                const l = lum[(Math.floor(y * step) * S) + Math.floor(x * step)];
                const glow = Math.pow(clamp(1 - l, 0, 1), 3.0);
                const o = (y * O + x) * 4;
                ep[o] = clamp(glow * 255, 0, 255);
                ep[o + 1] = clamp(glow * 104, 0, 255);
                ep[o + 2] = clamp(glow * 46, 0, 255);
                ep[o + 3] = 255;
            }
        }
        emctx.putImageData(eimg, 0, 0);
        const ember = new THREE.CanvasTexture(emc);
        if (THREE.SRGBColorSpace) ember.colorSpace = THREE.SRGBColorSpace;
        ember.wrapS = ember.wrapT = THREE.RepeatWrapping;

        tex.plate = { albedo, normal, orm, ember };
        return tex.plate;
    }

    /** Whatever anisotropy the context actually supports, capped. */
    function maxAnisotropy(want) {
        try {
            const cap = renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy
                ? renderer.capabilities.getMaxAnisotropy() : 4;
            return Math.max(1, Math.min(want, cap));
        } catch (e) { return 4; }
    }

    /**
     * Stencil atlas. A hull with no markings on it is a prop; a hull with a
     * class code and a faction sigil welded to the flank is a SHIP, and it is
     * also the only ownership read that survives the drives being dark or
     * pointed away from the lens. 4x4 cells of 128px, white on transparent, so
     * the vertex colour paints them.
     */
    const DECAL_CODES = ['FF', 'DD', 'SC', 'CA', 'BB', 'CO', 'DN', 'IN', 'CV'];
    const DECAL_CHEVRON = 9, DECAL_ATT = 10, DECAL_DEF = 11, DECAL_BAR = 12;
    const DECAL_NUM = [13, 14, 15];
    function decalAtlas() {
        if (tex.decal) return tex.decal;
        const S = 512, C = 128;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, S, S);
        const cell = i => [(i % 4) * C, Math.floor(i / 4) * C];

        // Stencilled type: bridges punched through the glyphs, exactly how a
        // real hull number is sprayed.
        const stencil = (i, text, size) => {
            const [x, y] = cell(i);
            ctx.save();
            ctx.beginPath(); ctx.rect(x, y, C, C); ctx.clip();
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `700 ${size}px 'Russo One','Arial Narrow',Impact,sans-serif`;
            ctx.fillText(text, x + C / 2, y + C / 2 + 2);
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = '#000';
            ctx.fillRect(x, y + C * 0.42, C, 5);
            ctx.fillRect(x, y + C * 0.66, C, 5);
            ctx.restore();
        };
        DECAL_CODES.forEach((code, i) => stencil(i, code, 74));
        DECAL_NUM.forEach((idx, i) => stencil(idx, ['02', '07', '13'][i], 74));

        // Hazard chevrons — the marking that goes next to anything that will
        // kill you, which on a warship is the drive.
        {
            const [x, y] = cell(DECAL_CHEVRON);
            ctx.save();
            ctx.beginPath(); ctx.rect(x + 4, y + 30, C - 8, C - 60); ctx.clip();
            ctx.fillStyle = '#fff';
            for (let k = -2; k < 8; k++) {
                ctx.beginPath();
                const px = x + k * 20;
                ctx.moveTo(px, y + 30); ctx.lineTo(px + 11, y + 30);
                ctx.lineTo(px + 25, y + C - 30); ctx.lineTo(px + 14, y + C - 30);
                ctx.closePath(); ctx.fill();
            }
            ctx.restore();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
            ctx.strokeRect(x + 5, y + 31, C - 10, C - 62);
        }
        // Faction sigils: a boxed letter, the sort of thing painted on a fin.
        const sigil = (i, ch) => {
            const [x, y] = cell(i);
            ctx.save();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(x + 20, y + 20); ctx.lineTo(x + C - 20, y + 20);
            ctx.lineTo(x + C - 20, y + C - 34); ctx.lineTo(x + C / 2, y + C - 16);
            ctx.lineTo(x + 20, y + C - 34); ctx.closePath();
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = `700 60px 'Russo One','Arial Narrow',Impact,sans-serif`;
            ctx.fillText(ch, x + C / 2, y + C / 2 - 2);
            ctx.restore();
        };
        sigil(DECAL_ATT, 'A');
        sigil(DECAL_DEF, 'D');
        // Faction bar: a solid band with notches, for the prow stripe.
        {
            const [x, y] = cell(DECAL_BAR);
            ctx.fillStyle = '#fff';
            ctx.fillRect(x + 6, y + 44, C - 12, 40);
            ctx.globalCompositeOperation = 'destination-out';
            for (let k = 0; k < 5; k++) ctx.fillRect(x + 18 + k * 22, y + 44, 6, 40);
            ctx.globalCompositeOperation = 'source-over';
        }

        tex.decal = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.decal.colorSpace = THREE.SRGBColorSpace;
        tex.decal.anisotropy = maxAnisotropy(16);
        return tex.decal;
    }

    /** Point a unit plane's UVs at one cell of the stencil atlas. */
    function setCellUV(geo, index) {
        const uv = geo.attributes.uv;
        const cx = (index % 4) / 4, cy = 1 - (Math.floor(index / 4) + 1) / 4;
        for (let i = 0; i < uv.count; i++) {
            uv.setXY(i, cx + uv.getX(i) * 0.25, cy + uv.getY(i) * 0.25);
        }
        uv.needsUpdate = true;
        return geo;
    }

    // --- Nebula ------------------------------------------------------------
    // 3D value noise sampled at the sphere direction, so the sky has no seam and
    // no polar pinwheel.
    function nHash(h) {
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }
    function vnoise(x, y, z, seed) {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        const fx = x - ix, fy = y - iy, fz = z - iz;
        const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
        const hx0 = Math.imul(ix, 374761393), hx1 = hx0 + 374761393;
        const hy0 = Math.imul(iy, 668265263), hy1 = hy0 + 668265263;
        const hz0 = Math.imul(iz, 1442695041), hz1 = hz0 + 1442695041;
        const s = seed | 0;
        const b00 = hy0 + hz0 + s, b10 = hy1 + hz0 + s, b01 = hy0 + hz1 + s, b11 = hy1 + hz1 + s;
        const x00 = nHash(hx0 + b00) + (nHash(hx1 + b00) - nHash(hx0 + b00)) * u;
        const x10 = nHash(hx0 + b10) + (nHash(hx1 + b10) - nHash(hx0 + b10)) * u;
        const x01 = nHash(hx0 + b01) + (nHash(hx1 + b01) - nHash(hx0 + b01)) * u;
        const x11 = nHash(hx0 + b11) + (nHash(hx1 + b11) - nHash(hx0 + b11)) * u;
        const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
        return y0 + (y1 - y0) * w;
    }
    function nfbm(x, y, z, seed, oct) {
        let amp = 1, f = 1, sum = 0, norm = 0;
        for (let i = 0; i < oct; i++) {
            sum += amp * vnoise(x * f, y * f, z * f, seed + i * 1013);
            norm += amp; amp *= 0.52; f *= 2.11;
        }
        return sum / norm;
    }
    /** Two cheap octaves in 0..1, for modulating something already shaped. */
    function nfbmFine(x, y, z) {
        return vnoise(x * 3.7, y * 3.7, z * 3.7, 1553) * 0.62
            + vnoise(x * 8.9, y * 8.9, z * 8.9, 2917) * 0.38;
    }

    /**
     * The backdrop.
     *
     * The first pass composited one broad wash per hue and read exactly like
     * what it was: an out-of-focus blob with no structure at any scale smaller
     * than the whole sky, banding in the falloff, and one texel stretched across
     * forty screen pixels. Three things fix that, and none of them is "more
     * resolution" — which would cost seconds of generation time on the machines
     * that need this most:
     *
     *  1. TWO SCALES, ONE COST. The expensive fBm is evaluated at HALF
     *     resolution into a float field and bilinearly upsampled; a single cheap
     *     high-frequency octave is then added per full-res texel. That gives
     *     structure from sky-sized down to texel-sized for roughly the noise
     *     budget of the old version at 1.8x the resolution.
     *  2. DUST LANES. A cloud with only soft interior gradients has no
     *     silhouette. A second field MULTIPLIES the emission down to nothing
     *     along filaments, so the nebula has dark edges to be read against.
     *  3. DITHER. +-1/255 of ordered noise before upload, which is what kills
     *     the contour rings an 8-bit ramp shows across a wide dark falloff.
     *  4. A GALACTIC BAND. Measured on the previous build, 85% of the delivered
     *     frame sat below L=12 and the bottom quarter was 99.9% below it: the
     *     sky was contributing nothing and the picture was a void with ships in
     *     it. "Space is dark" is true and is not an excuse for a frame with no
     *     content in three of its quadrants. A broad river of unresolved stars
     *     crossing the sphere diagonally, warped by its own noise and eaten
     *     into by the dust lanes, is the one large-scale structure that gives
     *     an empty half-frame somewhere for the eye to go — and it is also what
     *     the environment cube map picks up, so the hulls and the wrecks get
     *     something to be silhouetted against.
     */
    function nebulaTexture() {
        if (tex.nebula) return tex.nebula;
        // 1536 wide, not 1024. The shell is 720 units out and fills the frame:
        // at 1024 one texel spanned about fifteen screen pixels at the shot
        // list's tightest lens, which is why the sky read as an out-of-focus
        // wall rather than as distance. The COARSE field stays at 512x256 —
        // that pass is the expensive one and it only carries structure the
        // upsample can reconstruct anyway; the resolution is spent where it
        // shows, on the high-frequency octaves below.
        const W = 1536, H = 768;
        const LW = 512, LH = 256;
        const SX = LW / W, SY = LH / H;
        // Steel, bronze and a cold teal. Deliberately narrow: three hues that
        // could sit on the same painted metal panel, not a rainbow. The GAINS
        // are up roughly three stops from the first pass, which was measured at
        // a peak contribution of about L=18 in a frame whose median luminance
        // was 4 — i.e. invisible.
        // CLOUDS, NOT A WASH. The window each hue lights up in (`lo`..`lo+sp`)
        // is the single control that decides whether this reads as structure or
        // as fog: a wide window lights most of the sky at a middling value and
        // gives an out-of-focus brown smear with no edge anywhere, which is
        // exactly what the first attempt at brightening produced. Narrow the
        // window and raise the gain and the same noise field resolves into
        // separate clouds with dark space between them.
        const HUES = [
            { c: [52, 84, 158], seed: 1201, scale: 1.95, warp: 0.62, gain: 0.92, lo: 0.522, sp: 0.094 },
            { c: [156, 88, 36], seed: 5507, scale: 2.85, warp: 0.78, gain: 0.56, lo: 0.534, sp: 0.078 },
            { c: [26, 96, 108], seed: 9109, scale: 3.90, warp: 0.44, gain: 0.50, lo: 0.531, sp: 0.077 }
        ];
        // The band's pole. Deliberately NOT the star field's (STAR_BAND), so the
        // two structures cross rather than stack — one diagonal river of stars
        // and one diagonal river of gas, at an angle to each other.
        const BAND = new THREE.Vector3(-0.30, 0.90, 0.32).normalize();
        // --- coarse pass, half res ---
        const field = new Float32Array(LW * LH * 4);   // 3 hues + dust
        for (let y = 0; y < LH; y++) {
            const lat = (0.5 - (y + 0.5) / LH) * Math.PI;
            const sy = Math.sin(lat), cy = Math.cos(lat);
            for (let x = 0; x < LW; x++) {
                const lon = ((x + 0.5) / LW) * Math.PI * 2;
                const dx = cy * Math.cos(lon), dy = sy, dz = cy * Math.sin(lon);
                const o = (y * LW + x) * 4;
                for (let k = 0; k < 3; k++) {
                    const h = HUES[k];
                    const wx = vnoise(dx * 1.7, dy * 1.7, dz * 1.7, h.seed + 31) - 0.5;
                    const wz = vnoise(dx * 1.7 + 5.1, dy * 1.7, dz * 1.7, h.seed + 97) - 0.5;
                    const n = nfbm(dx * h.scale + wx * h.warp, dy * h.scale + wz * h.warp,
                        dz * h.scale + wx * h.warp, h.seed, 4);
                    // fBm clusters hard around 0.5; the window is measured to
                    // that, not to an imagined 0..1 range. Narrow, so the clouds
                    // have edges and the space between them stays empty.
                    field[o + k] = clamp((n - h.lo) / h.sp, 0, 1);
                }
                // Dust: ridged noise, so it forms LANES rather than patches.
                // WIDE lanes — at 0.085 they were hairlines and the cloud they
                // were meant to cut into came out as one continuous wash with
                // no silhouette anywhere. A nebula is read by its dark edges.
                const d = nfbm(dx * 2.4 + 11.3, dy * 2.4, dz * 2.4 - 4.7, 3313, 3);
                const d2 = nfbm(dx * 4.9 - 3.1, dy * 4.9 + 7.7, dz * 4.9, 6151, 3);
                field[o + 3] = Math.max(
                    1 - clamp(Math.abs(d - 0.5) / 0.165, 0, 1),
                    (1 - clamp(Math.abs(d2 - 0.5) / 0.085, 0, 1)) * 0.7);
            }
        }
        const sample = (fx, fy, k) => {
            const x0 = Math.floor(fx), y0 = clamp(Math.floor(fy), 0, LH - 1);
            const tx = fx - x0, ty = fy - y0;
            const xa = ((x0 % LW) + LW) % LW, xb = (xa + 1) % LW;
            const yb = Math.min(LH - 1, y0 + 1);
            const a = field[(y0 * LW + xa) * 4 + k], b = field[(y0 * LW + xb) * 4 + k];
            const cc = field[(yb * LW + xa) * 4 + k], d = field[(yb * LW + xb) * 4 + k];
            return (a + (b - a) * tx) * (1 - ty) + (cc + (d - cc) * tx) * ty;
        };

        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(W, H);
        const px = img.data;
        for (let y = 0; y < H; y++) {
            const lat = (0.5 - (y + 0.5) / H) * Math.PI;
            const sy = Math.sin(lat), cy = Math.cos(lat);
            const fy = (y + 0.5) * SY - 0.5;
            for (let x = 0; x < W; x++) {
                const lon = ((x + 0.5) / W) * Math.PI * 2;
                const dx = cy * Math.cos(lon), dy = sy, dz = cy * Math.sin(lon);
                const fx = (x + 0.5) * SX - 0.5;
                // One full-res octave, shared by all three hues: enough to give
                // the cloud grain at texel scale for one noise lookup.
                // THREE octaves, and the top one is genuinely fine. A frequency
                // of 11 over the unit sphere gives features about thirty
                // degrees across — the previous "high-frequency detail" was
                // nothing of the kind, and the cloud had no grain at any scale
                // the eye could resolve. 78 puts structure at roughly four
                // texels, which is what stops the wash reading as a blur.
                const fine = (vnoise(dx * 13.0, dy * 13.0, dz * 13.0, 2251) - 0.5)
                    + (vnoise(dx * 31.0, dy * 31.0, dz * 31.0, 8837) - 0.5) * 0.55
                    + (vnoise(dx * 78.0, dy * 78.0, dz * 78.0, 4409) - 0.5) * 0.32;
                const dust = 1 - sample(fx, fy, 3) * 0.92;
                // Base sky. Not zero, and NOT L=8 either: measured across the
                // delivered frames, a third of every picture sat below L=8 —
                // functionally #000 — with whole 180x192 tiles at 92-100% below
                // L=10. The shell covers those pixels and was delivering
                // nothing there, so the two star layers had nothing to be
                // parallax AGAINST and the negative space had no depth in it.
                //
                // The fix is a FLOOR, not exposure: exposure would push the
                // decks further past the shoulder. One very large, very
                // low-amplitude dust term over a raised base, so no region of
                // the shell is truly black and the bright nebula still rides on
                // top of it with all its contrast intact.
                //
                // THE NUMBERS ARE IN TEXTURE SPACE AND THE SHELL IS TONE
                // MAPPED. That is not a detail: ACES at this exposure attenuates
                // the bottom of the range by about 5.6x in linear, so a texel
                // written at L=18 — which reads as a perfectly respectable deep
                // space floor in a paint program — arrives on screen at L=4,
                // i.e. still functionally black. Solved backwards through the
                // whole chain instead: (27,29,39) lands at screen L~12 and the
                // top of the dust term at L~22.
                const deep = 0.5 + (vnoise(dx * 0.85 + 3.7, dy * 0.85, dz * 0.85 - 2.3, 6473) - 0.5) * 1.7
                    + (vnoise(dx * 1.9, dy * 1.9 + 8.1, dz * 1.9, 2917) - 0.5) * 0.8;
                const floorK = clamp(deep, 0, 1);
                let r = 27 + 10 * floorK, g = 29 + 10 * floorK, b = 39 + 11 * floorK;
                for (let k = 0; k < 3; k++) {
                    let a = sample(fx, fy, k);
                    if (a <= 0) continue;
                    a = clamp(a + fine * 0.45, 0, 1);
                    // The grain is applied AFTER the shaping curve, not folded
                    // into the coverage before it: inside a bright cloud the
                    // coverage term is already clamped at 1, so grain added
                    // beforehand vanishes exactly where it was needed most.
                    a = a * a * HUES[k].gain * dust * (0.66 + 0.68 * (fine + 0.5));
                    r += HUES[k].c[0] * a; g += HUES[k].c[1] * a; b += HUES[k].c[2] * a;
                }
                // The band. A Gaussian about a tilted great circle, its centre
                // line pushed around by its own low-frequency noise so it is a
                // river rather than a ruled stripe, cut into by the same dust
                // lanes that shape the clouds. Warm ivory: unresolved stars,
                // not gas.
                const bt = dx * BAND.x + dy * BAND.y + dz * BAND.z;
                const wob = (vnoise(dx * 2.05, dy * 2.05, dz * 2.05, 7717) - 0.5) * 0.34
                    + (vnoise(dx * 5.4, dy * 5.4, dz * 5.4, 4423) - 0.5) * 0.11;
                const bd = (bt + wob) / 0.15;
                let band = Math.exp(-bd * bd * 2.4) * dust;
                // Mottle it, so the river has clumps and gaps like a real one.
                band *= 0.28 + 1.15 * nfbmFine(dx, dy, dz);
                // Cool ivory, not amber: the bronze hue above already carries
                // the warm half of the palette and a warm band on top of it
                // turned the whole sky into one brown wash.
                r += 40 * band; g += 42 * band; b += 46 * band;
                // A hotter core inside the band: the bright dust lane the eye
                // actually follows across the frame.
                const core = Math.exp(-bd * bd * 11.0) * dust;
                r += 34 * core; g += 32 * core; b += 30 * core;
                // Ordered dither: reproducible, and it removes the contour rings
                // an 8-bit ramp shows across a wide dark falloff.
                const dth = (((x & 1) ^ (y & 1)) - 0.5) * 1.1;
                const o = (y * W + x) * 4;
                px[o] = clamp(r + dth, 0, 255);
                px[o + 1] = clamp(g + dth, 0, 255);
                px[o + 2] = clamp(b + dth, 0, 255);
                px[o + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.nebula = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.nebula.colorSpace = THREE.SRGBColorSpace;
        tex.nebula.wrapS = THREE.RepeatWrapping;
        return tex.nebula;
    }

    // ----------------------------------------------------------------------
    // Procedural ships.
    //
    // Local convention: nose points +X, engines at -X. Every part is recorded
    // rather than instantiated, so the whole hull can be merged per surface
    // class into four meshes before it ever reaches the scene.
    // ----------------------------------------------------------------------
    function recorder() {
        const parts = [];
        const guns = [];
        const engines = [];
        return {
            parts, guns, engines,
            add(geometry, desc, pos, rot) {
                parts.push({ geometry, desc, pos: pos || null, rot: rot || null });
            }
        };
    }

    function addPart(R, geometry, desc, pos, rot) { R.add(geometry, desc, pos, rot); return R; }

    /**
     * A WING, not a slab.
     *
     * The first pass built every wing as a 0.05-thick BoxGeometry, which is
     * effectively zero thickness: seen edge-on it disappears, and seen at any
     * other angle it is a rectangle with a hard silhouette and no highlight on
     * its leading edge. This builds a real one — a six-sided section (chamfered
     * top and bottom, sharp leading and trailing edges) swept across the span
     * with taper and sweep, so the edge catches the rim light and the plan-form
     * reads as designed rather than as a cut-out.
     *
     * Local axes: +X chord (nose-ward), +Y thickness, +Z span.
     */
    function makeWing(chord, span, thick, opts) {
        const o = opts || {};
        const taper = o.taper === undefined ? 0.55 : o.taper;
        const sweep = o.sweep === undefined ? chord * 0.35 : o.sweep;   // tip trails
        const dihedral = o.dihedral || 0;
        // `side` mirrors across Z for the opposite wing. It has to be a MIRROR,
        // not a 180-degree yaw: yawing a swept wing points its leading edge aft.
        const side = o.side === undefined ? 1 : (o.side < 0 ? -1 : 1);
        const ch = chord * 0.26, ct = chord * 0.34, t = thick * 0.5;
        // section, counter-clockwise seen from +Z
        const sec = [
            [chord * 0.5, 0], [chord * 0.5 - ch, t], [-chord * 0.5 + ct, t],
            [-chord * 0.5, 0], [-chord * 0.5 + ct, -t], [chord * 0.5 - ch, -t]
        ];
        const N = sec.length;
        const root = [], tip = [];
        for (let i = 0; i < N; i++) {
            root.push([sec[i][0], sec[i][1], 0]);
            tip.push([sec[i][0] * taper - sweep, sec[i][1] * taper + dihedral, span]);
        }
        const pos = [];
        const push = p => { pos.push(p[0], p[1], p[2]); };
        for (let i = 0; i < N; i++) {
            const j = (i + 1) % N;
            push(root[i]); push(root[j]); push(tip[j]);
            push(root[i]); push(tip[j]); push(tip[i]);
        }
        // caps
        for (let i = 1; i < N - 1; i++) {
            push(root[0]); push(root[i + 1]); push(root[i]);
            push(tip[0]); push(tip[i]); push(tip[i + 1]);
        }
        if (side < 0) {
            for (let i = 2; i < pos.length; i += 3) pos[i] = -pos[i];
            for (let i = 0; i < pos.length; i += 9) {   // reverse winding
                for (let k = 0; k < 3; k++) {
                    const t2 = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t2;
                }
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.computeVertexNormals();
        return g;
    }

    /**
     * A hard shoulder ring. Dropped at every junction of a lathed or cylindrical
     * hull so the silhouette NOTCHES instead of blending — the difference
     * between a ship built in sections and a string of tangent spheres.
     */
    function addCollar(R, mat, x, radius, width, depth) {
        addPart(R, new THREE.CylinderGeometry(radius + (depth || 0.06), radius + (depth || 0.06), width, 16),
            mat, [x, 0, 0], [0, 0, Math.PI / 2]);
    }

    /**
     * Spine greebles: vent blocks, cable runs and sensor masts scattered along a
     * hull's back. Cheap boxes, but they are what stops the outline being a
     * smooth curve from every angle.
     */
    function addGreebles(R, mat, x0, x1, y, z, n, seed, scale) {
        const rnd = rng(seed);
        const s = scale === undefined ? 1 : scale;
        for (let i = 0; i < n; i++) {
            const x = x0 + (x1 - x0) * ((i + 0.5) / n + (rnd() - 0.5) * 0.14);
            const w = (0.10 + rnd() * 0.22) * s, h = (0.07 + rnd() * 0.20) * s, d = (0.10 + rnd() * 0.26) * s;
            const dz = (rnd() - 0.5) * z * 1.3;
            addPart(R, new THREE.BoxGeometry(w, h, d), mat, [x, y + h * 0.5, dz]);
            if (rnd() < 0.34) {
                addPart(R, new THREE.CylinderGeometry(0.014 * s, 0.02 * s, (0.18 + rnd() * 0.3) * s, 5),
                    mat, [x, y + h + 0.12 * s, dz]);
            }
        }
    }

    /** Stencil decal: one quad, UV'd into a cell of the shared atlas. */
    function addDecal(R, M, cell, pos, w, h, rot) {
        const g = setCellUV(new THREE.PlaneGeometry(w, h), cell);
        addPart(R, g, M.stencil, pos, rot);
    }

    /**
     * The whole marking set for a hull flank: class code, faction sigil and a
     * pennant number, mirrored to both sides. `z` is the flank half-width.
     */
    function addMarkings(R, M, typeId, factionKey, x, y, z, size, seed) {
        const codeCell = DECAL_CODES.indexOf(SHIP_META[typeId].code);
        const sigil = factionKey === 'attacker' ? DECAL_ATT : DECAL_DEF;
        const num = DECAL_NUM[seed % DECAL_NUM.length];
        for (const s of [1, -1]) {
            const rot = s > 0 ? [0, 0, 0] : [0, Math.PI, 0];
            addDecal(R, M, codeCell >= 0 ? codeCell : DECAL_BAR, [x, y, z * s], size * 1.15, size, rot);
            addDecal(R, M, sigil, [x - size * 1.25, y, z * s], size * 0.9, size * 0.9, rot);
            addDecal(R, M, num, [x + size * 1.3, y, z * s], size * 0.95, size * 0.8, rot);
        }
    }

    // Detailed engine cluster: metal bell + glowing throat. The exhaust itself
    // is NOT geometry — see the plume system: a cone is an opaque polygon with
    // a hard silhouette, and no amount of colour makes one read as thrust.
    function addEngines(R, M, count, x, spread, size) {
        for (let i = 0; i < count; i++) {
            const z = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
            // Housing, mount ring, bell, throat. Four steps of radius so the
            // nacelle has a machined silhouette instead of one taper.
            addPart(R, new THREE.CylinderGeometry(size * 1.15, size * 1.34, size * 0.9, 14),
                M.plate, [x + size * 1.05, 0, z], [0, 0, Math.PI / 2]);
            addPart(R, new THREE.CylinderGeometry(size * 1.42, size * 1.42, size * 0.22, 14),
                M.trim, [x + size * 0.52, 0, z], [0, 0, Math.PI / 2]);
            addPart(R, new THREE.CylinderGeometry(size * 1.34, size * 0.92, size * 0.85, 14),
                M.hull, [x + size * 0.02, 0, z], [0, 0, Math.PI / 2]);
            addPart(R, new THREE.TorusGeometry(size * 1.0, size * 0.13, 6, 14),
                M.trim, [x - size * 0.36, 0, z], [0, Math.PI / 2, 0]);
            // The throat glows; it does not detonate. Held well under the sun so
            // the core does not clip to white next to an unlit hull.
            addPart(R, new THREE.SphereGeometry(size * 0.7, 10, 8), M.engine, [x - size * 0.18, 0, z]);
            R.engines.push({ pos: [x - size * 0.5, 0, z], size });
        }
    }

    // Detailed turret: base ring + housing + twin barrels with muzzle glow. The
    // muzzle tip is recorded as a hardpoint — every tracer in the battle leaves
    // from one of these, never from the ship's origin.
    function addTurret(R, M, pos, size) {
        addPart(R, new THREE.CylinderGeometry(size * 1.3, size * 1.5, size * 0.3, 12), M.trim, [pos[0], pos[1] - size * 0.25, pos[2]]);
        addPart(R, new THREE.CylinderGeometry(size, size * 1.1, size * 0.7, 12), M.hull, pos);
        addPart(R, new THREE.BoxGeometry(size * 1.3, size * 0.7, size * 1.7), M.plate, [pos[0] + size * 0.25, pos[1] + size * 0.12, pos[2]]);
        for (const dz of [-size * 0.42, size * 0.42]) {
            addPart(R, new THREE.CylinderGeometry(size * 0.14, size * 0.17, size * 2.1, 6),
                M.barrel, [pos[0] + size * 1.3, pos[1] + size * 0.22, pos[2] + dz], [0, 0, Math.PI / 2]);
            addPart(R, new THREE.SphereGeometry(size * 0.11, 6, 5), M.muzzle,
                [pos[0] + size * 2.35, pos[1] + size * 0.22, pos[2] + dz]);
        }
        R.guns.push([pos[0] + size * 2.6, pos[1] + size * 0.22, pos[2]]);
    }

    // --- Greeble helpers: the small surface detail that sells "built" ---------
    /**
     * A lit port, not a marker-pen dash.
     *
     * The first pass drew every window as an identical flat emissive box sitting
     * proud of the hull at one brightness, which reads as a texture stamp. Three
     * things separate "a ship with people in it" from that: the pane is INSET so
     * the surrounding plate casts a lip over it, each port gets its own
     * intensity (+-35%, and roughly one in seven is dark), and each carries a
     * small additive halo quad on the same normal so it blooms faintly rather
     * than ending at its own outline.
     *
     * The halo is merged geometry, not a sprite: fifty hulls x a dozen ports is
     * six hundred sprites and four hundred extra draw calls for something that
     * has to cost nothing.
     */
    let _winSeed = 1;
    let _winRow = 0;
    function addWindows(R, M, mat, x0, x1, y, z, n, mirrorZ, axis) {
        const rnd = rng(0x51F0 + _winSeed * 7919 + (_winRow++) * 104729);
        const zs = mirrorZ ? [z, z - mirrorZ] : [z];
        for (let i = 0; i < n; i++) {
            const x = n === 1 ? x0 : x0 + (x1 - x0) * (i / (n - 1));
            for (let k = 0; k < zs.length; k++) {
                const zz = zs[k];
                const dark = rnd() < 0.15;
                const inten = (mat.i || 1) * (dark ? 0.10 : (0.72 + rnd() * 0.62));
                const pane = { b: mat.b, c: mat.c, i: inten };
                const sign = zz >= 0 ? 1 : -1;
                if (axis === 'y') {
                    addPart(R, new THREE.BoxGeometry(0.075, 0.03, 0.05), pane, [x, y - 0.012, zz]);
                    if (!dark) addPart(R, new THREE.PlaneGeometry(0.20, 0.15),
                        { b: B_GLOW, c: mat.c, i: inten * 0.34 }, [x, y + 0.02, zz], [-Math.PI / 2, 0, 0]);
                } else {
                    addPart(R, new THREE.BoxGeometry(0.075, 0.05, 0.03), pane, [x, y, zz - 0.012 * sign]);
                    if (!dark) addPart(R, new THREE.PlaneGeometry(0.20, 0.15),
                        { b: B_GLOW, c: mat.c, i: inten * 0.34 }, [x, y, zz + 0.02 * sign],
                        [0, sign > 0 ? 0 : Math.PI, 0]);
                }
            }
        }
    }
    /**
     * THE FACTION RUNNING-LIGHT STRIP.
     *
     * A continuous rail welded along the spine, plus a dashed row of larger
     * marker lights down each flank with a faint additive wash over each. This
     * is the ownership read that survives everything else failing: it needs no
     * key light, no thrust, and no particular camera angle, and because it is
     * merged into the same self-lit bucket as the windows it costs zero extra
     * draw calls on a fleet of fifty hulls.
     *
     * It is deliberately DASHED on the flanks rather than a continuous glowing
     * line — a thin uninterrupted light pipe is the sleek holographic register
     * this art direction explicitly rules out; a row of chunky lit markers is
     * the industrial one.
     */
    function addSpine(R, M, x0, x1, topY, flankY, flankZ, n) {
        const len = x1 - x0, mid = (x0 + x1) / 2;
        if (topY !== null && topY !== undefined) {
            addPart(R, new THREE.BoxGeometry(len, 0.05, 0.11), M.spine, [mid, topY, 0]);
        }
        if (!flankZ) return;
        const seg = len / n;
        for (const s of [1, -1]) {
            for (let i = 0; i < n; i++) {
                const x = x0 + seg * (i + 0.5);
                addPart(R, new THREE.BoxGeometry(seg * 0.58, 0.085, 0.045), M.spine, [x, flankY, s * flankZ]);
                addPart(R, new THREE.PlaneGeometry(seg * 0.92, 0.30),
                    { b: B_GLOW, c: M.spine.c, i: M.spine.i * 0.42 },
                    [x, flankY, s * (flankZ + 0.035)], [0, s > 0 ? 0 : Math.PI, 0]);
            }
        }
    }

    function addAntenna(R, mat, pos, len) {
        addPart(R, new THREE.CylinderGeometry(0.018, 0.028, len, 5), mat, [pos[0], pos[1] + len / 2, pos[2]]);
        addPart(R, new THREE.SphereGeometry(0.05, 5, 4), mat, [pos[0], pos[1] + len, pos[2]]);
    }
    function addDish(R, mat, pos, r) {
        addPart(R, new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), mat, pos, [Math.PI / 2.1, 0, 0]);
        addPart(R, new THREE.CylinderGeometry(0.02, 0.02, r * 0.9, 5), mat, [pos[0], pos[1] - r * 0.45, pos[2]]);
    }
    function addRidges(R, mat, length, width, topY, z, gap) {
        const n = Math.max(2, Math.round(length / (gap || 0.7)));
        for (let i = 0; i < n; i++) {
            const x = -length / 2 + (i + 0.5) * (length / n);
            addPart(R, new THREE.BoxGeometry(0.06, 0.07, width), mat, [x, topY, z]);
        }
    }

    /**
     * Part descriptors: {bucket, colour}. Colour goes into the vertex stream, so
     * a whole fleet shares four materials. Self-lit colours are written ABOVE
     * 1.0 — that headroom is what the bloom threshold keys off, and it is why
     * an engine reads as a light source rather than a bright triangle.
     */
    function shipPalette(typeId, factionKey) {
        const meta = SHIP_META[typeId];
        const fac = FACTION[factionKey];
        // The class colour is mixed back in only far enough to keep classes
        // distinct. Any more and both fleets converge on the same beige, which
        // is exactly what happened when the faction read was carried by the
        // engine glow alone.
        const hullColor = blend(fac.plating, meta.hull, 0.17);
        const M = {
            hull: { b: B_METAL, c: hullColor },
            plate: { b: B_METAL, c: blend(hullColor, 0xffffff, 0.16) },
            trim: { b: B_METAL, c: blend(hullColor, 0x05070d, 0.6) },
            paint: { b: B_METAL, c: blend(hullColor, fac.accent, 0.55) },
            glass: { b: B_GLOSS, c: blend(0x0a1830, fac.accent, 0.25) },
            solar: { b: B_GLOSS, c: 0x12203f },
            stencil: { b: B_DECAL, c: blend(0xd8dee8, fac.accent, 0.22) },
            // Self-lit intensities. These are the only colours in the scene
            // written above 1.0, and they are what the bloom threshold keys off.
            // The engine throat used to sit at 3.4 — brighter than anything but
            // the sun — and it clipped to a pure white core against a hull that
            // received no light from it at all. It is now just over the bloom
            // threshold, and the drive light (see stage.driveLights) puts the
            // missing mid-tones back onto the hull ahead of the bell.
            window: { b: B_LIGHT, c: 0xffdca2, i: 1.35 },
            run: { b: B_LIGHT, c: fac.accent, i: 1.45 },
            // The faction stripe, carried as LIGHT rather than as paint. Paint
            // needs the hull to be lit to be read; a strip of emissive geometry
            // reads from any angle, on the dark side, at the back of the
            // formation, and when the drives are pointed away from the lens.
            spine: { b: B_LIGHT, c: fac.accent, i: 1.30 },
            engine: { b: B_LIGHT, c: fac.engine, i: 1.95 },
            muzzle: { b: B_LIGHT, c: fac.bolt, i: 1.5 }
        };
        M.barrel = M.trim;
        return M;
    }

    function buildShipParts(typeId, factionKey) {
        const meta = SHIP_META[typeId];
        const R = recorder();
        const M = shipPalette(typeId, factionKey);
        // Window layouts are randomised but must be REPRODUCIBLE: templates are
        // built in whatever order the fleets happen to need them, so the seed
        // has to come from the hull, never from a running counter.
        _winSeed = typeId * 131 + (factionKey === 'attacker' ? 7 : 23);
        _winRow = 0;

        switch (meta.family) {
            case 'dart': { // Scout / Intruder — sleek faceted interceptor
                const body = new THREE.ConeGeometry(0.42, 2.9, 24); body.rotateZ(-Math.PI / 2);
                addPart(R, body, M.hull);
                addCollar(R, M.trim, -0.55, 0.34, 0.14, 0.05);
                addPart(R, new THREE.BoxGeometry(1.9, 0.12, 0.5), M.plate, [-0.1, 0.17, 0]);
                addPart(R, new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.5), M.glass, [0.7, 0.16, 0], [0.4, 0, 0]);
                for (const dz of [-1, 1]) {
                    // Real wings: 0.16 thick with a chamfered section, swept and
                    // tapered, so the edge takes a rim highlight.
                    addPart(R, makeWing(1.05, 0.62, 0.16, { taper: 0.45, sweep: 0.4, side: dz }),
                        M.plate, [-0.45, 0, dz * 0.34]);
                    addPart(R, new THREE.BoxGeometry(0.06, 0.06, 0.06), M.run, [-0.9, 0.04, dz * 0.9]);
                }
                addPart(R, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), M.barrel, [1.1, -0.12, 0], [0, 0, Math.PI / 2]);
                R.guns.push([1.7, -0.12, 0]);
                if (meta.guns >= 2) R.guns.push([1.5, 0.16, 0]);
                addGreebles(R, M.trim, -0.9, 0.5, 0.2, 0.22, 4, 4001, 0.8);
                addAntenna(R, M.trim, [-0.2, 0.24, 0], 0.5);
                addDecal(R, M, DECAL_CODES.indexOf(meta.code), [0.1, 0.24, 0], 0.62, 0.5, [-Math.PI / 2, 0, 0]);
                addSpine(R, M, -1.1, 0.9, 0.25, 0.0, 0.30, 4);
                addEngines(R, M, 1, -1.5, 0, 0.25);
                break;
            }
            case 'escort': { // Frigate / Destroyer — slim warship
                const body = new THREE.CylinderGeometry(0.3, 0.46, 3.4, 14); body.rotateZ(-Math.PI / 2);
                addPart(R, body, M.hull);
                addCollar(R, M.trim, 0.9, 0.36, 0.16, 0.06);
                addCollar(R, M.trim, -0.85, 0.43, 0.18, 0.06);
                addPart(R, new THREE.BoxGeometry(2.4, 0.18, 0.7), M.plate, [0, 0.29, 0]);
                addPart(R, new THREE.BoxGeometry(0.55, 0.1, 0.74), M.paint, [1.55, 0.3, 0]);
                addRidges(R, M.trim, 2.2, 0.7, 0.44, 0, 0.5);
                const nose = new THREE.ConeGeometry(0.3, 1.3, 24); nose.rotateZ(-Math.PI / 2);
                addPart(R, nose, M.hull, [2.2, 0, 0]);
                addPart(R, new THREE.BoxGeometry(0.85, 0.45, 0.42), M.trim, [0.25, 0.44, 0]);
                addWindows(R, M, M.window, 0.0, 0.55, 0.5, 0.22, 3, 0.44);
                addGreebles(R, M.trim, -1.5, 1.4, 0.16, 0.3, 7, 4111, 0.9);
                addAntenna(R, M.trim, [-0.2, 0.5, 0], 0.6);
                if (meta.guns >= 1) addTurret(R, M, [0.95, 0.44, 0], 0.2);
                if (meta.guns >= 2) addTurret(R, M, [-0.45, 0.44, 0], 0.2);
                addSpine(R, M, -1.7, 1.5, 0.40, -0.02, 0.45, 6);
                addMarkings(R, M, typeId, factionKey, 0.45, -0.02, 0.46, 0.4, typeId);
                addDecal(R, M, DECAL_CHEVRON, [-1.55, 0.0, 0.47], 0.55, 0.34, [0, 0, 0]);
                addDecal(R, M, DECAL_CHEVRON, [-1.55, 0.0, -0.47], 0.55, 0.34, [0, Math.PI, 0]);
                addEngines(R, M, 2, -1.9, 0.5, 0.24);
                break;
            }
            case 'cruiser': { // Cruiser — medium hull with swept wings
                addPart(R, new THREE.BoxGeometry(3.8, 0.72, 1.0), M.hull);
                addPart(R, new THREE.BoxGeometry(3.4, 0.4, 1.2), M.plate, [0, 0.16, 0]);
                addPart(R, new THREE.BoxGeometry(3.9, 0.26, 0.66), M.trim, [0, -0.4, 0]);
                addPart(R, new THREE.BoxGeometry(0.7, 0.16, 1.06), M.paint, [1.75, 0.34, 0]);
                addRidges(R, M.trim, 3.0, 1.0, 0.42, 0, 0.55);
                const nose = new THREE.ConeGeometry(0.55, 1.6, 24); nose.rotateZ(-Math.PI / 2);
                addPart(R, nose, M.hull, [2.4, 0, 0]);
                addCollar(R, M.trim, 1.85, 0.56, 0.2, 0.07);
                for (const dz of [-1, 1]) {
                    addPart(R, makeWing(1.75, 1.0, 0.26, { taper: 0.6, sweep: 0.62, side: dz }),
                        M.plate, [-0.4, 0, dz * 0.5]);
                    addPart(R, new THREE.BoxGeometry(0.07, 0.07, 0.07), M.run, [-1.05, 0.02, dz * 1.44]);
                }
                addPart(R, new THREE.BoxGeometry(1.0, 0.55, 0.6), M.trim, [0.3, 0.55, 0]);
                addWindows(R, M, M.window, -0.1, 0.7, 0.62, 0.31, 3, 0.62);
                addDish(R, M.trim, [-0.5, 0.72, 0], 0.2);
                addGreebles(R, M.trim, -1.6, 1.5, 0.38, 0.42, 8, 4211, 1.0);
                addAntenna(R, M.trim, [-0.85, 0.5, 0], 0.55);
                addTurret(R, M, [1.1, 0.5, 0], 0.26);
                addTurret(R, M, [-0.7, 0.5, 0], 0.26);
                addSpine(R, M, -1.8, 1.6, 0.40, -0.06, 0.52, 7);
                addMarkings(R, M, typeId, factionKey, 0.55, 0.02, 0.52, 0.46, typeId);
                addEngines(R, M, 2, -2.1, 0.7, 0.3);
                break;
            }
            case 'capital': { // Battleship / Dreadnought — armored, bristling
                addPart(R, new THREE.BoxGeometry(5.4, 1.0, 1.5), M.hull);
                addPart(R, new THREE.BoxGeometry(5.0, 0.45, 1.7), M.plate, [0, 0.2, 0]);
                addPart(R, new THREE.BoxGeometry(5.6, 0.4, 0.8), M.trim, [0, -0.22, 0]);
                // Belt armour: stepped strakes down each flank. This is the read
                // that says "armoured" from any distance.
                for (const dz of [-0.78, 0.78]) {
                    addPart(R, new THREE.BoxGeometry(4.9, 0.3, 0.16), M.trim, [0, 0.26, dz]);
                    addPart(R, new THREE.BoxGeometry(4.6, 0.22, 0.13), M.plate, [0, -0.16, dz]);
                }
                addRidges(R, M.trim, 4.6, 1.5, 0.56, 0, 0.5);
                const prow = new THREE.ConeGeometry(0.85, 2.2, 24); prow.rotateZ(-Math.PI / 2);
                addPart(R, prow, M.hull, [3.4, 0, 0]);
                addCollar(R, M.trim, 2.55, 0.86, 0.24, 0.1);
                // The prow is the biggest single surface on the hull and it was
                // also the emptiest: two square metres of untouched taper
                // sitting at 300px across in the close shots. A band a third of
                // the way back from the tip and a small cluster of blisters
                // ahead of it give the eye something to measure the taper
                // against — the same reason the flanks carry strakes.
                addCollar(R, M.trim, 3.72, 0.30, 0.13, 0.05);
                addGreebles(R, M.trim, 3.86, 4.24, 0.20, 0.11, 3, 4317, 0.5);
                addPart(R, new THREE.BoxGeometry(0.6, 0.5, 1.0), M.trim, [2.5, 0.1, 0]);
                addPart(R, new THREE.BoxGeometry(0.55, 0.2, 1.56), M.paint, [1.75, 0.44, 0]);
                addPart(R, new THREE.BoxGeometry(1.2, 0.9, 1.0), M.plate, [-0.6, 0.9, 0]);
                addPart(R, new THREE.BoxGeometry(1.3, 0.14, 1.1), M.trim, [-0.6, 1.36, 0]);
                addPart(R, new THREE.BoxGeometry(0.7, 0.8, 0.7), M.trim, [-0.6, 1.6, 0]);
                addPart(R, new THREE.BoxGeometry(0.4, 0.4, 0.4), M.hull, [-0.6, 2.1, 0]);
                addWindows(R, M, M.window, -1.0, -0.2, 0.95, 0.52, 4, 1.04);
                addWindows(R, M, M.window, -0.9, -0.3, 1.6, 0.36, 3, 0.72);
                addDish(R, M.trim, [-1.2, 1.25, 0.0], 0.28);
                addAntenna(R, M.trim, [-0.2, 1.4, 0], 0.9);
                addAntenna(R, M.trim, [-1.05, 1.0, 0.3], 0.6);
                addGreebles(R, M.trim, -2.4, 2.2, 0.42, 0.6, 11, 4311, 1.15);
                const turretXs = meta.guns >= 4 ? [1.9, 0.8, -0.5, -1.7] : [1.7, 0.4, -1.0];
                turretXs.forEach(x => addTurret(R, M, [x, 0.72, 0], 0.34));
                for (const dz of [-0.85, 0.85]) {
                    addPart(R, new THREE.BoxGeometry(2.6, 0.45, 0.45), M.plate, [0.3, 0, dz]);
                    addTurret(R, M, [1.4, 0.05, dz], 0.2);
                    addTurret(R, M, [-0.6, 0.05, dz], 0.2);
                }
                addSpine(R, M, -2.6, 2.4, 0.60, -0.14, 0.79, 9);
                addMarkings(R, M, typeId, factionKey, 0.75, 0.2, 0.78, 0.82, typeId);
                addDecal(R, M, DECAL_CHEVRON, [-2.55, 0.24, 0.79], 0.9, 0.5, [0, 0, 0]);
                addDecal(R, M, DECAL_CHEVRON, [-2.55, 0.24, -0.79], 0.9, 0.5, [0, Math.PI, 0]);
                addDecal(R, M, DECAL_BAR, [2.0, 0.455, 0], 1.0, 0.7, [-Math.PI / 2, 0, 0]);
                addEngines(R, M, 3, -3.1, 0.8, 0.38);
                break;
            }
            case 'carrier': { // Carrier — wide flight deck + island superstructure
                addPart(R, new THREE.BoxGeometry(5.2, 0.4, 2.8), M.hull);
                addPart(R, new THREE.BoxGeometry(5.4, 0.4, 1.8), M.trim, [0, -0.36, 0]);
                addPart(R, new THREE.BoxGeometry(4.6, 0.42, 2.4), M.plate, [0, 0.02, 0]);
                for (const dz of [-1.42, 1.42]) addPart(R, new THREE.BoxGeometry(5.1, 0.3, 0.14), M.trim, [0, 0.06, dz]);
                addWindows(R, M, M.run, -2.0, 2.0, 0.24, 0, 9, 0, 'y'); // runway centerline
                addDecal(R, M, DECAL_BAR, [1.2, 0.245, 0], 1.5, 1.0, [-Math.PI / 2, 0, 0]);
                addDecal(R, M, DECAL_CODES.indexOf('CV'), [-1.7, 0.245, 0], 1.1, 0.95, [-Math.PI / 2, 0, Math.PI / 2]);
                addPart(R, new THREE.BoxGeometry(0.5, 0.55, 2.0), M.engine, [2.6, 0, 0]); // hangar mouth
                addPart(R, new THREE.BoxGeometry(0.62, 0.66, 2.15), M.trim, [2.75, 0, 0]);
                addPart(R, new THREE.BoxGeometry(0.9, 1.0, 0.8), M.plate, [-0.8, 0.7, 1.0]);
                addPart(R, new THREE.BoxGeometry(0.5, 0.6, 0.5), M.trim, [-0.8, 1.4, 1.0]);
                addWindows(R, M, M.window, -1.1, -0.5, 0.8, 1.4, 3);
                addDish(R, M.trim, [-0.8, 1.75, 1.0], 0.22);
                addAntenna(R, M.trim, [-0.4, 1.7, 1.0], 0.7);
                addGreebles(R, M.trim, -2.2, 2.2, 0.24, 2.3, 10, 4411, 1.0);
                for (const dz of [-1.35, 1.35]) addWindows(R, M, M.run, -2.2, 2.2, 0.22, dz, 6, 0, 'y');
                addTurret(R, M, [1.7, 0.3, -1.0], 0.22);
                addTurret(R, M, [-1.6, 0.3, -1.1], 0.22);
                addMarkings(R, M, typeId, factionKey, 0.6, -0.1, 1.42, 0.5, typeId);
                addSpine(R, M, -2.4, 2.4, null, -0.10, 1.44, 9);
                addEngines(R, M, 4, -2.9, 0.66, 0.32);
                break;
            }
            case 'colony': { // Colony — large civilian hab. Detailed, NO weapons.
                // A SEGMENTED HULL, not a string of tangent spheres. The lathe
                // profile steps at every module junction and a collar ring sits
                // on each step, so the silhouette notches from any angle instead
                // of reading as beads on a wire.
                const prof = [];
                const seg = (x, r) => prof.push(new THREE.Vector2(r, x));
                seg(-1.95, 0.0); seg(-1.9, 0.52); seg(-1.55, 0.62); seg(-1.5, 0.86);
                seg(-0.55, 0.9); seg(-0.5, 0.72); seg(0.15, 0.76); seg(0.2, 0.95);
                seg(1.15, 0.92); seg(1.2, 0.66); seg(1.75, 0.6); seg(1.95, 0.0);
                const body = new THREE.LatheGeometry(prof, 20);
                body.rotateZ(-Math.PI / 2);
                addPart(R, body, M.hull);
                [-1.5, -0.52, 0.18, 1.18].forEach((x, i) =>
                    addCollar(R, M.trim, x, [0.86, 0.9, 0.95, 0.92][i], 0.13, 0.07));
                // Hab dome + its cupola.
                addPart(R, new THREE.CylinderGeometry(0.72, 0.86, 0.34, 16), M.plate, [0.45, 0.75, 0]);
                addPart(R, new THREE.SphereGeometry(0.68, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.hull, [0.45, 0.86, 0]);
                addPart(R, new THREE.SphereGeometry(0.5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2.05), M.glass, [0.45, 0.92, 0]);
                addWindows(R, M, M.window, 0.05, 0.9, 0.5, 0.88, 5, 1.76);
                addWindows(R, M, M.window, 0.15, 0.78, 1.02, 0.4, 3, 0.8);
                // Spin ring on real spokes.
                addPart(R, new THREE.TorusGeometry(1.16, 0.12, 8, 22), M.plate, [-0.85, 0, 0], [0, Math.PI / 2, 0]);
                addPart(R, new THREE.TorusGeometry(1.16, 0.05, 6, 22), M.trim, [-0.68, 0, 0], [0, Math.PI / 2, 0]);
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    addPart(R, new THREE.BoxGeometry(0.1, 0.1, 1.15), M.trim,
                        [-0.85, Math.sin(a) * 0.58, Math.cos(a) * 0.58], [a, 0, 0]);
                }
                // Cargo/tank modules, boxed and braced — not spheres.
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                    const sy = Math.sin(a) * 0.98, sz = Math.cos(a) * 0.98;
                    addPart(R, new THREE.CylinderGeometry(0.26, 0.26, 1.15, 10), M.plate, [-0.3, sy, sz], [0, 0, Math.PI / 2]);
                    addPart(R, new THREE.BoxGeometry(0.18, 0.34, 0.34), M.trim, [0.28, sy, sz]);
                    addPart(R, new THREE.BoxGeometry(0.18, 0.34, 0.34), M.trim, [-0.88, sy, sz]);
                }
                // Solar wings with real thickness and a chamfered leading edge.
                for (const dz of [-1, 1]) {
                    addPart(R, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), M.trim, [-0.3, 0, dz * 1.05], [Math.PI / 2, 0, 0]);
                    addPart(R, makeWing(0.95, 1.5, 0.14, { taper: 0.92, sweep: 0.06, side: dz }),
                        M.solar, [-0.3, 0, dz * 1.45]);
                    addPart(R, new THREE.BoxGeometry(1.0, 0.1, 0.09), M.trim, [-0.3, 0.09, dz * 2.2]);
                }
                addGreebles(R, M.trim, -1.6, 1.4, 0.9, 0.5, 9, 4511, 1.1);
                addAntenna(R, M.trim, [1.0, 0.72, 0], 0.7);
                addDish(R, M.trim, [-1.2, 0.95, 0.2], 0.3);
                addMarkings(R, M, typeId, factionKey, 0.0, 0.1, 0.97, 0.55, typeId);
                addSpine(R, M, -1.4, 1.5, null, -0.42, 0.86, 6);
                addEngines(R, M, 2, -2.15, 0.85, 0.34);
                // A colony hull carries no hardpoints. Nothing downstream can
                // make it fire because there is nowhere for a shot to come from.
                R.guns.length = 0;
                break;
            }
        }
        return R;
    }

    /**
     * Orbital defence platform: the fortification a defender's `orbital` count
     * actually represents. Static, heavily gunned, no engines.
     */
    function buildPlatformParts(factionKey) {
        const R = recorder();
        const M = shipPalette(4, factionKey);
        addPart(R, new THREE.CylinderGeometry(1.5, 1.8, 0.45, 14), M.trim, [0, -0.5, 0]);
        addPart(R, new THREE.CylinderGeometry(1.0, 1.3, 0.9, 14), M.hull, [0, 0.1, 0]);
        addPart(R, new THREE.CylinderGeometry(1.36, 1.36, 0.16, 14), M.trim, [0, -0.3, 0]);
        addPart(R, new THREE.TorusGeometry(1.62, 0.13, 8, 22), M.plate, [0, -0.35, 0], [Math.PI / 2, 0, 0]);
        addPart(R, new THREE.SphereGeometry(0.55, 24, 14), M.plate, [0, 0.75, 0]);
        addWindows(R, M, M.window, -0.5, 0.5, 0.2, 0.98, 4, 1.96);
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            addPart(R, new THREE.BoxGeometry(0.9, 0.2, 0.3), M.trim, [Math.cos(a) * 1.3, -0.2, Math.sin(a) * 1.3], [0, -a, 0]);
            addTurret(R, M, [Math.cos(a) * 1.55, 0.35, Math.sin(a) * 1.55], 0.24);
        }
        addAntenna(R, M.trim, [0, 1.15, 0], 0.8);
        return R;
    }

    // ----------------------------------------------------------------------
    // Merge: parts -> four meshes, colour baked into the vertex stream.
    // ----------------------------------------------------------------------
    const _mat4 = new THREE.Matrix4();
    const _mat3 = new THREE.Matrix3();
    const _euler = new THREE.Euler();
    const _vec = new THREE.Vector3();
    const _scl = new THREE.Vector3();
    const _col = new THREE.Color();

    function mergeParts(R, uniformScale) {
        const buckets = [];
        for (let i = 0; i < BUCKETS; i++) buckets.push({ pos: [], nrm: [], col: [], uv: [] });

        R.parts.forEach(part => {
            const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
            const posAttr = g.attributes.position;
            const nrmAttr = g.attributes.normal;
            const uvAttr = g.attributes.uv;
            _euler.set(part.rot ? part.rot[0] : 0, part.rot ? part.rot[1] : 0, part.rot ? part.rot[2] : 0);
            // ORDER MATTERS. Matrix4.scale() multiplies the basis columns and
            // leaves the translation column alone, so scaling AFTER setPosition
            // would shrink every hull around its own parts while leaving them
            // spread at full-size offsets — a ship that comes apart on the bench.
            // Scale into the rotation first, then place the part at a position
            // that has been scaled by hand.
            _mat4.makeRotationFromEuler(_euler);
            _mat4.scale(_scl.set(uniformScale, uniformScale, uniformScale));
            if (part.pos) {
                _mat4.setPosition(part.pos[0] * uniformScale, part.pos[1] * uniformScale, part.pos[2] * uniformScale);
            }
            // Uniform scale + rotation: the normal matrix is the rotation part,
            // and re-normalising after transform is enough.
            _mat3.setFromMatrix4(_mat4);
            const b = buckets[part.desc.b];
            _col.setHex(part.desc.c);
            const inten = part.desc.i === undefined ? 1 : part.desc.i;
            const cr = _col.r * inten, cg = _col.g * inten, cb = _col.b * inten;
            const isDecal = part.desc.b === B_DECAL;
            const base = b.pos.length / 3;
            for (let i = 0; i < posAttr.count; i++) {
                _vec.fromBufferAttribute(posAttr, i).applyMatrix4(_mat4);
                b.pos.push(_vec.x, _vec.y, _vec.z);
                if (nrmAttr) {
                    _vec.fromBufferAttribute(nrmAttr, i).applyMatrix3(_mat3).normalize();
                    b.nrm.push(_vec.x, _vec.y, _vec.z);
                } else b.nrm.push(0, 1, 0);
                b.col.push(cr, cg, cb);
                // Stencils carry their own atlas UVs; everything else is
                // projected below, per triangle, off the transformed position.
                if (isDecal && uvAttr) b.uv.push(uvAttr.getX(i), uvAttr.getY(i));
                else b.uv.push(0, 0);
            }
            // PLANAR UVs AT CONSTANT WORLD DENSITY. The projection axis is
            // chosen from the TRIANGLE's normal, not the vertex's: a per-vertex
            // choice splits the axis mid-triangle on any curved surface and
            // tears the plating apart across the seam. One tile is PLATE_WORLD
            // units on every hull in the game, so a destroyer and a dreadnought
            // are plated at the same scale without either knowing about it.
            if (!isDecal) {
                const P = b.pos, U = b.uv, K = 1 / PLATE_WORLD;
                for (let t = base; t + 2 < b.pos.length / 3; t += 3) {
                    const o0 = t * 3, o1 = o0 + 3, o2 = o0 + 6;
                    const ax = P[o1] - P[o0], ay = P[o1 + 1] - P[o0 + 1], az = P[o1 + 2] - P[o0 + 2];
                    const bx = P[o2] - P[o0], by = P[o2 + 1] - P[o0 + 1], bz = P[o2 + 2] - P[o0 + 2];
                    const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
                    let iu = 0, iv = 1;                 // dominant +Z: project X,Y
                    if (nx >= ny && nx >= nz) { iu = 2; iv = 1; }        // +X: Z,Y
                    else if (ny >= nx && ny >= nz) { iu = 0; iv = 2; }   // +Y: X,Z
                    for (let k = 0; k < 3; k++) {
                        const p = (t + k) * 3, u = (t + k) * 2;
                        U[u] = P[p + iu] * K;
                        U[u + 1] = P[p + iv] * K;
                    }
                }
            }
            if (g !== part.geometry) g.dispose();
            part.geometry.dispose();
        });

        const group = new THREE.Group();
        const mats = stageMaterials();
        for (let i = 0; i < BUCKETS; i++) {
            const b = buckets[i];
            if (!b.pos.length) continue;
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
            g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
            g.computeBoundingSphere();
            const mesh = new THREE.Mesh(g, mats.ship[i]);
            mesh.userData.bucket = i;
            // Frustum culling is ON: the shadow pass renders from a light, not
            // from the lens, and a hull that is "always inside the framing" is
            // very often outside the shadow camera. Culling there is most of why
            // a second depth pass is affordable at all.
            mesh.frustumCulled = true;
            if (i === B_METAL || i === B_GLOSS) { mesh.castShadow = true; mesh.receiveShadow = true; }
            else if (i === B_DECAL) mesh.receiveShadow = true;
            group.add(mesh);
        }
        return group;
    }

    const templateCache = new Map();
    function shipTemplate(typeId, factionKey) {
        const key = typeId + ':' + factionKey;
        if (templateCache.has(key)) return templateCache.get(key);
        const meta = SHIP_META[typeId];
        const R = buildShipParts(typeId, factionKey);
        const group = mergeParts(R, meta.scale);
        const s = meta.scale;
        const t = {
            group,
            guns: R.guns.map(p => new THREE.Vector3(p[0] * s, p[1] * s, p[2] * s)),
            engines: R.engines.map(e => ({ pos: new THREE.Vector3(e.pos[0] * s, e.pos[1] * s, e.pos[2] * s), size: e.size * s })),
            radius: hullRadius(group),
            half: hullHalfExtents(group),
            // The blast scale is the CLASS scale, not the bounding radius. A
            // dreadnought's bounding radius is ~12 units because the hull is
            // long, and driving explosions off it produced shockwave rings
            // eighty units across — bigger than the gap between the fleets.
            blast: s
        };
        templateCache.set(key, t);
        return t;
    }

    function platformTemplate(factionKey) {
        const key = 'plat:' + factionKey;
        if (templateCache.has(key)) return templateCache.get(key);
        const R = buildPlatformParts(factionKey);
        const group = mergeParts(R, 1.35);
        const t = {
            group,
            guns: R.guns.map(p => new THREE.Vector3(p[0] * 1.35, p[1] * 1.35, p[2] * 1.35)),
            engines: [],
            radius: hullRadius(group),
            half: hullHalfExtents(group),
            blast: 1.1
        };
        templateCache.set(key, t);
        return t;
    }

    /**
     * The radius a shield bubble should have — NOT the bounding sphere. Warships
     * here are long and thin, so the bounding sphere of a dreadnought is about
     * twelve units and driving the shield flare off it produced a white ball
     * bigger than the ship inside it. Weighted toward the cross-section, with
     * only a quarter of the length, this hugs the hull.
     */
    const _bbox = new THREE.Box3();
    const _bsize = new THREE.Vector3();
    function hullBox(group) {
        _bbox.makeEmpty();
        group.children.forEach(m => {
            if (!m.geometry || !m.geometry.boundingBox) m.geometry.computeBoundingBox();
            if (m.geometry.boundingBox) _bbox.union(m.geometry.boundingBox);
        });
        return _bbox;
    }
    function hullRadius(group) {
        if (hullBox(group).isEmpty()) return 1;
        _bbox.getSize(_bsize);
        return Math.max(0.6, 0.5 * Math.max(_bsize.y, _bsize.z) + 0.25 * _bsize.x);
    }
    /**
     * True half-extents, used only by the formation separation pass. The shield
     * radius above is deliberately NOT this — a long thin hull needs a tight
     * bubble and a generous exclusion box, and one number cannot be both.
     */
    function hullHalfExtents(group) {
        if (hullBox(group).isEmpty()) return new THREE.Vector3(1, 1, 1);
        _bbox.getSize(_bsize);
        return new THREE.Vector3(_bsize.x * 0.5, _bsize.y * 0.5, _bsize.z * 0.5);
    }

    /** Instantiate a hull: clone the merged meshes (geometry + material shared). */
    function instantiate(template, factionKey) {
        const g = new THREE.Group();
        template.group.children.forEach(m => {
            const c = new THREE.Mesh(m.geometry, m.material);
            c.userData.bucket = m.userData.bucket;
            c.castShadow = m.castShadow;
            c.receiveShadow = m.receiveShadow;
            g.add(c);
        });
        // Engine glow: the throat halo the merged geometry cannot give us,
        // because a billboard is the only thing that reads as light rather than
        // as a lit cone. Capped at two sprites per hull — a sprite is its own
        // draw call and a four-engine carrier does not need four of them, so a
        // wide cluster collapses into one halo sized to cover it.
        const fac = FACTION[factionKey];
        const eng = template.engines;
        const halos = [];
        if (eng.length <= 2) {
            eng.forEach(e => halos.push({ pos: e.pos, size: e.size * 3.1 }));
        } else if (eng.length) {
            const mid = new THREE.Vector3();
            let spread = 0;
            eng.forEach(e => mid.add(e.pos));
            mid.multiplyScalar(1 / eng.length);
            eng.forEach(e => { spread = Math.max(spread, e.pos.distanceTo(mid)); });
            halos.push({ pos: mid, size: (eng[0].size * 2.6) + spread * 1.5 });
        }
        halos.forEach(hgl => {
            const s = new THREE.Sprite(stageMaterials().engineHalo[factionKey]);
            s.position.copy(hgl.pos);
            s.scale.setScalar(hgl.size);
            s.userData.halo = true;
            g.add(s);
        });
        g.userData.guns = template.guns;
        g.userData.radius = template.radius;
        g.userData.half = template.half;
        g.userData.blast = template.blast;
        g.userData.faction = factionKey;
        g.userData.accent = fac.accent;
        // Exhausts are registered, not built: the plume system draws every drive
        // in the battle as ONE camera-facing additive mesh (see updatePlumes).
        g.userData.plumes = eng.map((e, i) => ({
            local: e.pos.clone(), size: e.size, phase: (i * 1.7 + template.radius * 3.1) % 6.283
        }));
        return g;
    }

    // ----------------------------------------------------------------------
    // Stage: renderer, scene furniture and pools. Built once and reused — a
    // second battle in the same turn starts instantly.
    // ----------------------------------------------------------------------
    /**
     * Add a Fresnel rim term to a standard material, in the shader.
     *
     * A back light would do the same job and cost every MeshStandardMaterial in
     * the scene another per-fragment light — and three.js has no per-object
     * light filtering, so "a dim rim light on the wreck layer" is not something
     * a fourth DirectionalLight can actually express. Injected into the
     * fragment stage instead it is exact (it applies to these materials and
     * nothing else), free (one dot product), and view-relative, so a tumbling
     * wreck keeps its edge from every angle the shot list can find.
     *
     * IT MUST NOT USE `normal`. By the time the fragment stage reaches the
     * tone-mapping anchor, `normal` is the NORMAL-MAPPED normal — and on a
     * plated deck there are grazing texels EVERYWHERE, one per rivet cap and
     * seam lip, so the Fresnel fired all over the surface instead of catching
     * the silhouette and the term shattered into a white crust. Three.js keeps
     * the interpolated vertex normal as `nonPerturbedNormal` for exactly this
     * class of problem; driving the rim off that makes it a SILHOUETTE term
     * again, which is the only thing it was ever for. Clamped as well, so no
     * combination of angle and power can push a face past the shoulder.
     */
    function rimLit(material, colorHex, strength, power) {
        const col = new THREE.Color(colorHex);
        material.onBeforeCompile = shader => {
            shader.uniforms.uRimColor = { value: col };
            shader.uniforms.uRimStrength = { value: strength };
            shader.uniforms.uRimPower = { value: power };
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;'
            );
            const anchor = '#include <tonemapping_fragment>';
            if (shader.fragmentShader.indexOf(anchor) >= 0) {
                shader.fragmentShader = shader.fragmentShader.replace(anchor,
                    'gl_FragColor.rgb += uRimColor * min(0.35, uRimStrength * pow(1.0 - clamp(dot(normalize(nonPerturbedNormal), normalize(vViewPosition)), 0.0, 1.0), uRimPower));\n' + anchor);
            }
        };
        material.customProgramCacheKey = () => 'b3dRim:' + colorHex + ':' + strength + ':' + power;
        return material;
    }

    let stageMats = null;
    function stageMaterials() {
        if (stageMats) return stageMats;
        const P = plateMaps();
        const D = decalAtlas();
        _mark('materials');
        stageMats = {
            ship: [
                // Metal, but not mirror: at 0.74/0.42 the direct specular off
                // three lights pushed the plating past 1.0 and every hull near
                // the lens bloomed into a white slab.
                //
                // The plate atlas does the rest. `map` multiplies the vertex
                // colour, so the faction paint still drives hue and the texture
                // only supplies structure; `normalMap` gives the seams and
                // rivets relief; the ORM breaks specular across plates so the
                // highlight is not one smooth sweep down the hull.
                new THREE.MeshStandardMaterial({
                    vertexColors: true, map: P.albedo, normalMap: P.normal,
                    roughnessMap: P.orm, metalnessMap: P.orm,
                    normalScale: new THREE.Vector2(0.85, 0.85),
                    metalness: 1, roughness: 1, envMapIntensity: 1.0
                }),
                new THREE.MeshStandardMaterial({
                    vertexColors: true, map: P.albedo, normalMap: P.normal,
                    normalScale: new THREE.Vector2(0.35, 0.35),
                    metalness: 0.5, roughness: 0.16, envMapIntensity: 1.35
                }),
                new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
                new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
                // Stencils: painted ON the plate, so they take the light but
                // add no relief. polygonOffset keeps them off the hull's own
                // depth values without needing a visible standoff gap.
                new THREE.MeshStandardMaterial({
                    vertexColors: true, map: D, alphaTest: 0.32,
                    metalness: 0.1, roughness: 0.72, envMapIntensity: 0.5,
                    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
                    side: THREE.DoubleSide
                })
            ],
            // A WRECK IS A SHAPE, NOT AN ABSENCE.
            //
            // At 0x14161c with envMapIntensity 0.35, against a sky that was
            // itself below L=12, a dead capital hull measured as essentially
            // 100% black: a hole punched in the picture, with a single specular
            // streak on the nose cone as the only readable detail. Three things
            // fix it and all three are physical rather than "make it lighter":
            // the captured sky cube is allowed to actually light it (1.25), the
            // recesses still glow (the ember map is the inverse of the plate
            // albedo's luminance, so seams and hatch surrounds carry the heat),
            // and a Fresnel rim term separates the top edge of the hull from
            // whatever is behind it — an edge light, which is what a wreck needs
            // to read as form, without adding a fourth light to every material
            // in the scene.
            hulk: rimLit(new THREE.MeshStandardMaterial({
                color: 0x23262e, map: P.albedo, normalMap: P.normal, roughnessMap: P.orm,
                emissive: 0xffffff, emissiveMap: P.ember, emissiveIntensity: 0.11,
                // 0.55 normal scale and 0.32 metalness, not 0.9 and 0.55. A
                // wreck is BURNT PAINTED PLATE, and at half a metal's F0 with a
                // violent normal map every rivet cap on the deck caught the rim
                // light at grazing and clipped — the shattered white crust, in
                // its worst form, lived on this material. Less metal also means
                // more diffuse, which is what stops a dead hull going black.
                normalScale: new THREE.Vector2(0.55, 0.55),
                metalness: 0.32, roughness: 1, envMapIntensity: 1.25
                // Tight, and weak. A Fresnel term on a hull built out of boxes
                // will light a WHOLE FACE the moment that face turns near
                // grazing, and at 0.34/3.2 the wrecks came back with flat white
                // panels stamped across the superstructure. At a fifth of the
                // strength and a fifth power it only catches the silhouette,
                // which is the one thing it is for.
            }), 0x9db8dc, 0.16, 5.0),
            hulkDecal: new THREE.MeshBasicMaterial({
                color: 0x16191f, map: D, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide
            }),
            engineHalo: {
                attacker: new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(FACTION.attacker.engine), transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false }),
                defender: new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(FACTION.defender.engine), transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false })
            },
            plume: new THREE.MeshBasicMaterial({
                map: plumeTexture(), vertexColors: true, transparent: true,
                blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
                toneMapped: true
            })
        };
        return stageMats;
    }

    /**
     * The sky.
     *
     * A uniform scatter of same-size same-value dots is what a particle system
     * looks like with its defaults untouched, and across the empty half of an
     * establishing shot it is the dominant content in frame. Three things make
     * it a sky instead:
     *
     *  - STRUCTURE. Only about half the stars are uniform. The rest fall into a
     *    broad galactic band (Gaussian about a tilted great circle) or into a
     *    handful of open clusters, which is what gives the field somewhere for
     *    the eye to rest.
     *  - COLOUR TEMPERATURE. Each star is sampled off a blackbody ramp from hot
     *    blue-white through solar to cool amber, weighted the way a real
     *    magnitude-limited sample is: mostly cool, a few hot.
     *  - MAGNITUDE. Point size cannot vary per vertex without a custom shader,
     *    so brightness classes are separate layers built by the caller; within
     *    a layer, value follows a power law so a few stars anchor it.
     */
    const STAR_BAND = new THREE.Vector3(0.36, 0.86, -0.36).normalize();
    // Blackbody ramp: ~9000K, ~6500K, ~5200K, ~3800K.
    const STAR_RAMP = [
        [0.62, 0.71, 1.00], [0.80, 0.86, 1.00], [1.00, 0.98, 0.94],
        [1.00, 0.90, 0.76], [1.00, 0.74, 0.47]
    ];
    function starDirection(rnd, clusters) {
        const roll = rnd();
        let v;
        if (roll < 0.26 && clusters.length) {
            // Open cluster: Gaussian scatter about a seeded centre.
            const c = clusters[Math.floor(rnd() * clusters.length)];
            v = c.dir.clone();
            for (let k = 0; k < 3; k++) {
                v.x += (rnd() + rnd() + rnd() - 1.5) * c.spread;
                v.y += (rnd() + rnd() + rnd() - 1.5) * c.spread;
                v.z += (rnd() + rnd() + rnd() - 1.5) * c.spread;
            }
        } else if (roll < 0.58) {
            // Galactic band: uniform around the plane, Gaussian across it.
            const a = rnd() * Math.PI * 2;
            const up = STAR_BAND;
            const t1 = new THREE.Vector3(up.y, -up.x, 0).normalize();
            const t2 = new THREE.Vector3().crossVectors(up, t1);
            v = t1.multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
            v.addScaledVector(up, (rnd() + rnd() + rnd() - 1.5) * 0.30);
        } else {
            const theta = rnd() * Math.PI * 2, phi = Math.acos(2 * rnd() - 1);
            v = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
        }
        return v.normalize();
    }
    function buildStarLayer(count, radiusMin, radiusMax, size, brightness, seed, uniform) {
        const rnd = rng(seed);
        const clusters = [];
        for (let i = 0; i < 6; i++) {
            const theta = rnd() * Math.PI * 2, phi = Math.acos(2 * rnd() - 1);
            clusters.push({
                dir: new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)),
                spread: 0.07 + rnd() * 0.11
            });
        }
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const r = radiusMin + rnd() * (radiusMax - radiusMin);
            const d = uniform
                ? (() => { const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
                    return new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)); })()
                : starDirection(rnd, clusters);
            positions[i * 3] = d.x * r;
            positions[i * 3 + 1] = d.y * r;
            positions[i * 3 + 2] = d.z * r;
            // Power law: most stars are faint, a few genuinely anchor the field.
            const b = brightness * (0.34 + 1.5 * Math.pow(rnd(), 2.2));
            const k = Math.pow(rnd(), 0.7) * (STAR_RAMP.length - 1);
            const i0 = Math.min(STAR_RAMP.length - 2, Math.floor(k)), f = k - i0;
            const t0 = STAR_RAMP[i0], t1 = STAR_RAMP[i0 + 1];
            colors[i * 3] = (t0[0] + (t1[0] - t0[0]) * f) * b;
            colors[i * 3 + 1] = (t0[1] + (t1[1] - t0[1]) * f) * b;
            colors[i * 3 + 2] = (t0[2] + (t1[2] - t0[2]) * f) * b;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const m = new THREE.PointsMaterial({
            size, sizeAttenuation: true, vertexColors: true, map: sparkTexture(),
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const p = new THREE.Points(g, m);
        p.frustumCulled = false;
        return p;
    }

    /** The half-dozen named stars, with a diffraction cross. */
    function buildHeroStars(parent, seed) {
        const rnd = rng(seed);
        const clusters = [];
        const tints = [0xbfd4ff, 0xffffff, 0xfff0d2, 0xffd4a0, 0xd8e4ff, 0xffe7bb];
        for (let i = 0; i < 6; i++) {
            const d = starDirection(rnd, clusters).multiplyScalar(660);
            const s = new THREE.Sprite(new THREE.SpriteMaterial({
                map: flareTexture(), color: new THREE.Color(tints[i]).multiplyScalar(1.5 + rnd() * 0.9),
                transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
                depthWrite: false, fog: false
            }));
            s.position.copy(d);
            s.scale.setScalar(26 + rnd() * 22);
            s.material.rotation = rnd() * 0.6 - 0.3;
            parent.add(s);
        }
    }

    // --- Particle systems --------------------------------------------------
    /**
     * A SPARK IS A STREAK, AND NO TWO ARE THE SAME SIZE.
     *
     * These were a THREE.Points system, which has exactly ONE size for the
     * whole field and no orientation at all — so a kill left a hundred and
     * twenty IDENTICAL orange discs in a spherical scatter and a shield hit
     * left forty identical pale-blue ones. That is the textbook default
     * particle-puff tell, and shrinking the discs (2.1 -> 0.95, as a previous
     * pass did) only made them smaller circles.
     *
     * Instanced camera-facing quads instead, each STRETCHED along its own
     * velocity as projected into the screen plane. A fast ember becomes a
     * streak, a slow one stays a mote, and the per-instance scale roll is 4:1,
     * so the field has a size distribution rather than a size. Same emit/update
     * bookkeeping, same capacity, one draw call as before.
     */
    // How far a particle travels while the shutter is open, in seconds, and the
    // hardest a streak may be stretched relative to its own width. Short and
    // narrow: at a 55ms shutter and 7x the embers came out as fat soft lozenges
    // — bokeh, not sparks — which is the same failure as the discs wearing a
    // different shape.
    const SPARK_SHUTTER = 0.030;
    const SPARK_MAX_STREAK = 5;

    function makeParticles(capacity, size) {
        const m = new THREE.MeshBasicMaterial({
            map: sparkTexture(), transparent: true, blending: THREE.AdditiveBlending,
            depthWrite: false, side: THREE.DoubleSide, toneMapped: true
        });
        const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = capacity;
        const col = new Float32Array(capacity * 3);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, hidden);
        return {
            mesh, capacity, next: 0, size, col, hidden,
            live: new Array(capacity).fill(null),
            mat: new THREE.Matrix4()
        };
    }

    function emitParticle(sys, p) {
        const i = sys.next;
        sys.next = (sys.next + 1) % sys.capacity;
        sys.live[i] = p;
        return i;
    }

    const _pR = new THREE.Vector3(), _pU = new THREE.Vector3(), _pF = new THREE.Vector3();
    const _pv = new THREE.Vector3(), _pax = new THREE.Vector3(), _pay = new THREE.Vector3();
    function updateParticles(sys, dt) {
        let any = false;
        const col = sys.col, hidden = sys.hidden, mesh = sys.mesh;
        // One billboard basis for the whole field: camera +Z is toward the lens.
        camera.matrixWorld.extractBasis(_pR, _pU, _pF);
        const el = sys.mat.elements;
        el[3] = el[7] = el[11] = 0; el[15] = 1;
        for (let i = 0; i < sys.capacity; i++) {
            const p = sys.live[i];
            const o = i * 3;
            if (!p) { col[o] = col[o + 1] = col[o + 2] = 0; continue; }
            p.t += dt;
            if (p.t >= p.ttl) {
                sys.live[i] = null;
                col[o] = col[o + 1] = col[o + 2] = 0;
                mesh.setMatrixAt(i, hidden);
                any = true;
                continue;
            }
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            const k = 1 - p.t / p.ttl;
            const f = k * k;
            // Colour over life: white-hot at the tear, the burst's own hue
            // through the middle, dark and red-shifted as it dies.
            const hot = smooth01((k - 0.84) / 0.16) * 0.5;
            const em = 1 - smooth01(k / 0.5);
            const peak = Math.max(p.r, p.g, p.b);
            const r = p.r + (peak - p.r) * hot;
            const g = p.g + (peak - p.g) * hot;
            const b = p.b + (peak - p.b) * hot;
            col[o] = r * f;
            col[o + 1] = g * f * (1 - 0.55 * em);
            col[o + 2] = b * f * (1 - 0.80 * em);

            // Stretch along the screen-space projection of the velocity. A
            // particle moving straight at the lens has no projected velocity
            // and correctly stays a mote.
            _pv.set(p.vx, p.vy, p.vz);
            _pv.addScaledVector(_pF, -_pv.dot(_pF));
            const sp = _pv.length();
            if (sp > 1e-4) _pay.copy(_pv).multiplyScalar(1 / sp);
            else _pay.copy(_pU);
            _pax.crossVectors(_pay, _pF);
            const w = p.s;
            const len = clamp(sp * SPARK_SHUTTER, w, w * SPARK_MAX_STREAK);
            el[0] = _pax.x * w; el[1] = _pax.y * w; el[2] = _pax.z * w;
            el[4] = _pay.x * len; el[5] = _pay.y * len; el[6] = _pay.z * len;
            el[8] = _pF.x; el[9] = _pF.y; el[10] = _pF.z;
            el[12] = p.x; el[13] = p.y; el[14] = p.z;
            mesh.setMatrixAt(i, sys.mat);
            any = true;
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        return any;
    }

    // --- Wreckage ----------------------------------------------------------
    /**
     * DEBRIS IS TORN HULL, NOT BLACK GRAVEL.
     *
     * The previous build instanced ONE 20-triangle icosahedron 140 times with a
     * bare `{color:0x2a2c33, metalness:0.6}` — no map, no normal, no emissive.
     * Metalness kills most of the diffuse term, so with nothing to reflect they
     * rendered as flat pure-black spikes, and in the victory frame twenty of
     * them sat as the highest-contrast objects in the picture: black silhouettes
     * against the bright nebula, visibly the SAME shard at different rolls.
     *
     * Three things fix it, all of them reuse:
     *  - the plate atlas the hulls already generate, so a chunk is a piece of
     *    plating with seams and rivets on it rather than an untextured solid;
     *  - the ember map, driven by a PER-INSTANCE heat attribute that decays over
     *    the chunk's first 1.5s, so a fresh tear glows at the break and then
     *    goes cold. A single shared emissiveIntensity cannot do that — the
     *    second ship to die would re-heat the first one's debris;
     *  - four distinct silhouettes, selected round-robin by slot, so the same
     *    shard cannot appear twenty times in one frame.
     */
    const CHUNK_VARIANTS = 4;
    function shardGeometry(variant) {
        const g = new THREE.IcosahedronGeometry(0.5, 0);
        const p = g.attributes.position;
        const rnd = rng(9931 + variant * 7717);
        // A splinter, a slab, a blocky lump and a flake. The proportions are the
        // read — a second seed on the same proportions is still one silhouette
        // to the eye. No axis goes past 1.4: the original single shard peaked at
        // 1.6 and these have to sit in the same size band, not a bigger one.
        const AX = [[1.40, 0.45, 0.68], [0.60, 1.05, 1.40], [1.00, 0.86, 1.10], [1.28, 1.15, 0.55]][variant];
        for (let i = 0; i < p.count; i++) {
            p.setXYZ(i,
                p.getX(i) * AX[0] * (0.6 + rnd() * 0.8),
                p.getY(i) * AX[1] * (0.6 + rnd() * 0.8),
                p.getZ(i) * AX[2] * (0.6 + rnd() * 0.8));
        }
        // A shard carries a FRAGMENT of one plate, not the whole atlas: the
        // sphere's own UVs span the tile, which would print five plates on a
        // half-metre splinter.
        const uv = g.attributes.uv;
        const ou = (variant * 0.37) % 1, ov = (variant * 0.61) % 1;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.3 + ou, uv.getY(i) * 0.3 + ov);
        g.computeVertexNormals();
        return g;
    }

    function makeChunks(capacity) {
        const P = plateMaps();
        const per = Math.ceil(capacity / CHUNK_VARIANTS);
        capacity = per * CHUNK_VARIANTS;
        // Torn PLATE, not broken glass. At metalness 0.85 / roughness 0.55 over
        // the bright plate atlas the shards mirrored the blue rim and came back
        // as pale blue flakes — as wrong in the other direction as pure black.
        // A painted hull fragment is mostly rough and mostly dielectric.
        const m = new THREE.MeshStandardMaterial({
            color: 0x3a3d45, map: P.albedo, normalMap: P.normal, roughnessMap: P.orm,
            // WHITE emissive over the ember map, not an orange one: the ember
            // map is already (255,104,46), and multiplying it by 0xff5a20
            // squares the saturation into neon red seams. The map carries the
            // colour; this only carries the amount. Same reason the hulk
            // material does it that way.
            emissive: 0xffffff, emissiveMap: P.ember, emissiveIntensity: 0.42,
            normalScale: new THREE.Vector2(0.8, 0.8),
            metalness: 0.45, roughness: 0.8, envMapIntensity: 1.0
        });
        // Per-instance heat -> emissive. Six lines, one float attribute.
        m.onBeforeCompile = shader => {
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute float aHeat;\nvarying float vHeat;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat;');
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nvarying float vHeat;')
                .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vHeat;');
        };
        m.customProgramCacheKey = () => 'b3dChunkHeat';

        const meshes = [], heat = [], heatAttr = [];
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let v = 0; v < CHUNK_VARIANTS; v++) {
            const g = shardGeometry(v);
            const h = new Float32Array(per);
            const ha = new THREE.InstancedBufferAttribute(h, 1);
            ha.setUsage(THREE.DynamicDrawUsage);
            g.setAttribute('aHeat', ha);
            const mesh = new THREE.InstancedMesh(g, m, per);
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.count = per;
            for (let i = 0; i < per; i++) mesh.setMatrixAt(i, hidden);
            meshes.push(mesh); heat.push(h); heatAttr.push(ha);
        }
        return {
            meshes, heat, heatAttr, capacity, per, next: 0,
            live: new Array(capacity).fill(null), hidden, tmp: new THREE.Matrix4(),
            q: new THREE.Quaternion(), e: new THREE.Euler(),
            s: new THREE.Vector3(), p: new THREE.Vector3()
        };
    }

    function emitChunk(sys, c) {
        const i = sys.next;
        // Round-robin over the slots, and slot -> variant is `i % 4`, so a burst
        // of debris cycles all four silhouettes by construction.
        sys.next = (sys.next + 1) % sys.capacity;
        sys.live[i] = c;
    }

    /** Blank every live chunk — used when the verdict beat takes the frame. */
    function clearChunks(sys) {
        for (let i = 0; i < sys.capacity; i++) {
            sys.live[i] = null;
            sys.meshes[i % CHUNK_VARIANTS].setMatrixAt((i / CHUNK_VARIANTS) | 0, sys.hidden);
        }
        for (let v = 0; v < CHUNK_VARIANTS; v++) {
            sys.heat[v].fill(0);
            sys.heatAttr[v].needsUpdate = true;
            sys.meshes[v].instanceMatrix.needsUpdate = true;
        }
    }

    // How long a fresh tear stays hot, in seconds.
    const CHUNK_COOL = 1.5;
    function updateChunks(sys, dt) {
        for (let i = 0; i < sys.capacity; i++) {
            const c = sys.live[i];
            const v = i % CHUNK_VARIANTS, j = (i / CHUNK_VARIANTS) | 0;
            if (!c) continue;
            c.t += dt;
            if (c.t >= c.ttl) {
                sys.live[i] = null;
                sys.meshes[v].setMatrixAt(j, sys.hidden);
                sys.heat[v][j] = 0;
                continue;
            }
            c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
            c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
            const k = clamp(1 - (c.t - c.ttl * 0.7) / (c.ttl * 0.3), 0, 1);
            sys.e.set(c.rx, c.ry, c.rz);
            sys.q.setFromEuler(sys.e);
            sys.s.setScalar(c.size * k);
            sys.p.set(c.x, c.y, c.z);
            sys.tmp.compose(sys.p, sys.q, sys.s);
            sys.meshes[v].setMatrixAt(j, sys.tmp);
            sys.heat[v][j] = clamp(1 - c.t / CHUNK_COOL, 0, 1);
        }
        for (let v = 0; v < CHUNK_VARIANTS; v++) {
            sys.meshes[v].instanceMatrix.needsUpdate = true;
            sys.heatAttr[v].needsUpdate = true;
        }
    }

    // --- Exhaust -----------------------------------------------------------
    /**
     * EVERY DRIVE IN THE BATTLE, ONE DRAW CALL.
     *
     * The plume used to be a ConeGeometry welded into the hull: an opaque
     * polygon with flat facets, a straight silhouette and a hard cut at the
     * tail. It read as a clip-art flame decal stuck on the ship, and nothing
     * about it said mass was being accelerated.
     *
     * A plume has to be a camera-facing billboard or it collapses to a line when
     * the lens looks down the axis — but a hundred billboards is a hundred draw
     * calls. So all of them live in ONE BufferGeometry whose vertices are
     * rewritten each frame: two stacked quads per drive (a narrow bright core
     * and a wash 2.3x wider at a quarter of the opacity), both additive, both
     * fading to nothing over the last third of their length, each modulated in
     * length by its own phase so the fleet does not pulse in unison.
     */
    const PLUME_CAP = 190;
    function makePlumes(capacity) {
        const verts = capacity * 12;                 // 2 quads x 6 verts
        const pos = new Float32Array(verts * 3);
        const col = new Float32Array(verts * 3);
        const uv = new Float32Array(verts * 2);
        // u across the plume, v from throat (0) to tail (1). Static.
        const QUV = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
        for (let i = 0; i < capacity * 2; i++) {
            for (let k = 0; k < 12; k++) uv[i * 12 + k] = QUV[k];
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setDrawRange(0, 0);
        const mesh = new THREE.Mesh(g, stageMaterials().plume);
        mesh.frustumCulled = false;
        mesh.renderOrder = 3;
        return { mesh, geom: g, pos, col, capacity };
    }

    const _pl0 = new THREE.Vector3(), _plD = new THREE.Vector3(), _plR = new THREE.Vector3(), _plV = new THREE.Vector3();
    const _engColor = {
        attacker: new THREE.Color(FACTION.attacker.engine),
        defender: new THREE.Color(FACTION.defender.engine)
    };
    function updatePlumes(sys, sides, now) {
        const P = sys.pos, C = sys.col;
        let slot = 0;
        for (let s = 0; s < sides.length; s++) {
            const list = sides[s].all;
            for (let i = 0; i < list.length; i++) {
                const ship = list[i];
                const ud = ship.userData;
                if (ud.dead || !ud.plumes) continue;
                const eng = _engColor[ud.faction] || _engColor.attacker;
                for (let e = 0; e < ud.plumes.length && slot < sys.capacity; e++) {
                    const pl = ud.plumes[e];
                    _pl0.copy(pl.local).applyMatrix4(ship.matrixWorld);
                    // The hull's local -X in world space: column 0, negated.
                    const m = ship.matrixWorld.elements;
                    _plD.set(-m[0], -m[1], -m[2]).normalize();
                    // Throttle: two incommensurate frequencies per drive, so a
                    // fleet of thirty never breathes in step.
                    const th = 1 + 0.13 * Math.sin(now * 6.1 + pl.phase) + 0.07 * Math.sin(now * 15.7 + pl.phase * 2.3);
                    const len = pl.size * 6.6 * th * (ud.recoil ? 1 + ud.recoil * 0.35 : 1);
                    _plV.subVectors(camera.position, _pl0);
                    _plR.crossVectors(_plD, _plV);
                    if (_plR.lengthSq() < 1e-8) _plR.set(0, 1, 0); else _plR.normalize();
                    for (let q = 0; q < 2; q++) {
                        const wide = q === 1;
                        const w0 = pl.size * (wide ? 2.3 : 0.95);
                        const w1 = pl.size * (wide ? 5.0 : 2.1);
                        const k = wide ? 0.30 : 1.05;
                        const o = (slot * 2 + q) * 18;
                        const c = (slot * 2 + q) * 18;
                        const ax = _pl0.x, ay = _pl0.y, az = _pl0.z;
                        const bx = ax + _plD.x * len, by = ay + _plD.y * len, bz = az + _plD.z * len;
                        const rx = _plR.x, ry = _plR.y, rz = _plR.z;
                        const put = (idx, px, py, pz, br) => {
                            P[o + idx * 3] = px; P[o + idx * 3 + 1] = py; P[o + idx * 3 + 2] = pz;
                            C[c + idx * 3] = eng.r * br; C[c + idx * 3 + 1] = eng.g * br; C[c + idx * 3 + 2] = eng.b * br;
                        };
                        const n0 = k * 1.25, n1 = k * 0.45;
                        put(0, ax - rx * w0, ay - ry * w0, az - rz * w0, n0);
                        put(1, ax + rx * w0, ay + ry * w0, az + rz * w0, n0);
                        put(2, bx + rx * w1, by + ry * w1, bz + rz * w1, n1);
                        put(3, ax - rx * w0, ay - ry * w0, az - rz * w0, n0);
                        put(4, bx + rx * w1, by + ry * w1, bz + rz * w1, n1);
                        put(5, bx - rx * w1, by - ry * w1, bz - rz * w1, n1);
                    }
                    slot++;
                }
            }
        }
        sys.geom.setDrawRange(0, slot * 12);
        sys.geom.attributes.position.needsUpdate = true;
        sys.geom.attributes.color.needsUpdate = true;
    }

    // --- Generic mesh pool -------------------------------------------------
    function makePool(factory) {
        const free = [];
        return {
            get() { return free.length ? free.pop() : factory(); },
            put(o) { if (free.length < 48) free.push(o); }
        };
    }

    function buildStage() {
        if (stage) return stage;
        const s = {};
        s.root = new THREE.Group();

        // Deep space. One inverted sphere carrying the nebula, plus two star
        // layers at different radii so the sky parallaxes when the camera cuts.
        const skyMat = new THREE.MeshBasicMaterial({
            map: nebulaTexture(), side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true
        });
        // 720, not 760: the sky texture is fixed, so pulling the shell in is
        // free angular resolution on every texel of it.
        const sky = new THREE.Mesh(new THREE.SphereGeometry(720, 40, 24), skyMat);
        sky.rotation.y = 1.1;
        // Drawn LAST in the opaque queue, not first. It covers every pixel of
        // the frame with a texture fetch, and drawn first every one of those
        // fetches is then painted over by the fleet. Behind the hulls, the
        // depth test rejects it for free. Nothing else changes: it writes no
        // depth, so it cannot occlude anything, and the transparent queue still
        // runs after it.
        sky.renderOrder = 10;
        sky.frustumCulled = false;
        s.root.add(sky);
        s.sky = sky;
        _mark('nebula');

        // Four magnitude classes rather than one: point size is a per-material
        // uniform, so a range of apparent sizes has to come from layering.
        s.root.add(buildStarLayer(1500, 500, 700, 2.7, 0.9, 4711));
        s.root.add(buildStarLayer(560, 500, 700, 4.4, 1.25, 5519));
        s.root.add(buildStarLayer(150, 500, 700, 7.0, 1.8, 8821));
        buildHeroStars(s.root, 6607);
        // Near-field motes: nothing sells camera movement like something small
        // and close moving faster than the sky.
        s.motes = buildStarLayer(280, 40, 150, 0.55, 0.35, 3313, true);
        s.root.add(s.motes);

        // The system's sun, far behind the defender's world. It motivates every
        // rim light in the scene, and with bloom on it becomes real glare.
        // Small and tight on purpose: at 46 units of core and 230 of halo it
        // was a 20-degree white disc that washed half the establishing shot.
        s.sunDir = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
        const sunPos = s.sunDir.clone().multiplyScalar(620);
        const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture(), color: new THREE.Color(0xfff2d8).multiplyScalar(3.4), transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        }));
        sunCore.position.copy(sunPos);
        sunCore.scale.setScalar(20);
        s.root.add(sunCore);
        const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture(), color: new THREE.Color(0xffc98a), transparent: true,
            opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        }));
        sunHalo.position.copy(sunPos);
        sunHalo.scale.setScalar(110);
        s.root.add(sunHalo);

        // Lights. High contrast on purpose — a warm key off the sun, a cold
        // hard rim opposite it for silhouettes, and only enough ambient to keep
        // the shadow side from crushing to black.
        // THE RIG TRACKS THE CAMERA. A rig nailed to world space cannot survive
        // a shot list: the same lamp that rims the fleet from one angle becomes
        // a frontal key from the opposite one — which is exactly what painted
        // the warm fleet cold blue — and the moment the lens cut round to the
        // unlit side, every hull went to silhouette. Key, fill and rim are all
        // placed relative to the lens each frame (see animate()), so every cut
        // lands on a hull with a lit side, a shadow side and a separated edge.
        // The sun sprite stays where it is: it motivates the backdrop and drives
        // the planet's terminator, both of which have to stay put.
        // 2.0/1.4, not 2.75/0.95. A key at 2.75 puts every UP-FACING plate on a
        // metal hull past the ACES shoulder — which is why the decks and turret
        // tops read as blown white slabs while the flanks were correctly
        // exposed, and why the bridge tower's contact shadow was invisible: the
        // deck under it was already at ceiling, so removing light from it
        // changed nothing. The ratio is what reads as high contrast, not the
        // absolute; taking two thirds of a stop off the key and putting most of
        // it back in the fill holds the ratio at roughly 1.4:1 while landing the
        // brightest plate inside the shoulder instead of on top of it.
        s.key = new THREE.DirectionalLight(0xfff0d6, 2.0);
        s.fill = new THREE.DirectionalLight(0x8ea6d8, 1.4);
        // The rim sits BEHIND the subject, so it meets every up-facing plate at
        // a grazing angle — where Schlick's Fresnel goes to 1.0 and the
        // specular is white regardless of what the hull is painted. At 2.0 it
        // was as strong as the key and it is what put the remaining white
        // streaks along the deck edges and the turret tops. Its job is
        // SILHOUETTE SEPARATION, and the sky now has a real floor behind the
        // hulls to separate them from, so it does not need to shout.
        s.rim = new THREE.DirectionalLight(0x9dbcf0, 1.45);
        s.root.add(s.key);
        s.root.add(s.fill);
        s.root.add(s.rim);
        // The ground colour is what the SHADOW side of a hull is lit by, and at
        // 0x14111c it was darker than the sky behind the ship — so an unlit
        // flank merged into the backdrop instead of separating from it.
        s.root.add(new THREE.HemisphereLight(0x6e83b8, 0x24202e, 0.70));

        // THE KEY CASTS. Without a shadow map nothing occludes anything: a
        // bridge tower sits on the deck with no contact, overlapping hulls have
        // no separation, and every surface is lit identically regardless of what
        // is in front of it — which is most of why untextured hulls read as
        // weightless. One extra depth pass, frustum-fitted per shot (see
        // placeRig) so 1024 texels are spent on what the lens is actually
        // looking at rather than on the whole engagement.
        s.keyTarget = new THREE.Object3D();
        s.root.add(s.keyTarget);
        s.key.target = s.keyTarget;
        s.key.castShadow = true;
        s.key.shadow.mapSize.set(768, 768);
        s.key.shadow.bias = -0.0004;
        // Small. A normal bias measured in map texels erases exactly the contact
        // shadows this exists for — a bridge tower onto the deck under it is a
        // few texels wide at this frustum size.
        s.key.shadow.normalBias = 0.035;
        s.key.shadow.camera.near = 40;
        s.key.shadow.camera.far = 420;

        // Drive lights. Four, assigned to the largest hulls in play. A drive
        // bell that clips to white next to a hull receiving no light from it is
        // bright void beside unlit void; this is what puts the mid-tones back.
        s.driveLights = [];
        for (let i = 0; i < 4; i++) {
            const L = new THREE.PointLight(0xffffff, 0, 26, 1.15);
            L.visible = false;
            s.root.add(L);
            s.driveLights.push(L);
        }

        // Blast lights. Two, pooled, and PERMANENTLY VISIBLE at zero intensity
        // rather than toggled: three.js keys its shader programs off the number
        // of visible lights, so switching these on and off would recompile
        // every standard material in the scene at the exact moment a capital
        // explodes. Idle they cost one dot product; live they are what puts the
        // fireball onto the hulls around it.
        s.blastLights = [];
        s.blastNext = 0;
        for (let i = 0; i < 2; i++) {
            const L = new THREE.PointLight(0xffa04a, 0, 60, 1.4);
            L.userData.live = 0;
            s.root.add(L);
            s.blastLights.push(L);
        }

        // Pools + particle systems. The two numbers are the BASE width of a
        // streak in world units; each instance rolls its own scale off it.
        s.sparks = makeParticles(620, 0.20);
        s.embers = makeParticles(180, 0.38);
        s.chunks = makeChunks(140);
        s.chunks.meshes.forEach(m => { m.castShadow = true; s.root.add(m); });
        s.root.add(s.sparks.mesh);
        s.root.add(s.embers.mesh);
        s.plumes = makePlumes(PLUME_CAP);
        s.root.add(s.plumes.mesh);

        s.geo = {
            quad: new THREE.PlaneGeometry(1, 1),
            ring: new THREE.CircleGeometry(1, 56),
            cap: new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, 0.62)
        };
        // The shield cap is a sphere segment around +Y, and a sphere's UVs run
        // in longitude/latitude — mapping the hex flare onto them would smear it
        // into a band. Re-project the cap's UVs as a flat disc seen from the
        // pole, so the flare's centre lands exactly on the impact point, then
        // turn the cap to face +Z (which is the axis Object3D.lookAt aims).
        {
            const cp = s.geo.cap.attributes.position;
            const cuv = s.geo.cap.attributes.uv;
            const capR = Math.sin(0.62);
            for (let i = 0; i < cp.count; i++) {
                cuv.setXY(i, 0.5 + cp.getX(i) / (2 * capR), 0.5 + cp.getZ(i) / (2 * capR));
            }
            cuv.needsUpdate = true;
            s.geo.cap.rotateX(Math.PI / 2);
        }

        s.pools = {
            quad: makePool(() => {
                const m = new THREE.Mesh(s.geo.quad, new THREE.MeshBasicMaterial({
                    map: beamTexture(), transparent: true, side: THREE.DoubleSide,
                    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true
                }));
                m.frustumCulled = false;
                m.matrixAutoUpdate = false;   // driven by orientBeamQuad()
                m.renderOrder = 2;            // always ON TOP of its dark backing
                return m;
            }),
            tracer: makePool(() => {
                const m = new THREE.Mesh(s.geo.quad, new THREE.MeshBasicMaterial({
                    map: tracerTexture(), transparent: true, side: THREE.DoubleSide,
                    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true
                }));
                m.frustumCulled = false;
                m.matrixAutoUpdate = false;
                m.renderOrder = 2;
                return m;
            }),
            // Contrast quad. Additive blending over an already-bright surface
            // adds nothing: a tracer crossing the lit face of a planet washes
            // straight out and reads as a decal painted on the sphere. This is
            // the fix — a slightly wider, DARK, normally-blended quad laid
            // behind the additive core, so the bolt carries its own contrast
            // against a bright background and is invisible against black.
            dark: makePool(() => {
                const m = new THREE.Mesh(s.geo.quad, new THREE.MeshBasicMaterial({
                    map: beamTexture(), transparent: true, side: THREE.DoubleSide,
                    color: 0x05060a, depthWrite: false, toneMapped: false
                }));
                m.frustumCulled = false;
                m.matrixAutoUpdate = false;
                m.renderOrder = 1;
                return m;
            }),
            // The lance. A tapered ribbon whose width is written per segment,
            // so it can neck down at the muzzle and swell into the hull it is
            // cutting — which a single quad cannot do.
            ribbon: makePool(() => {
                const m = new THREE.Mesh(makeRibbonGeometry(), new THREE.MeshBasicMaterial({
                    map: lanceTexture(), transparent: true, side: THREE.DoubleSide,
                    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true
                }));
                m.frustumCulled = false;
                m.renderOrder = 3;
                return m;
            }),
            ring: makePool(() => {
                const m = new THREE.Mesh(s.geo.ring, new THREE.MeshBasicMaterial({
                    map: ringTexture(), transparent: true, side: THREE.DoubleSide,
                    blending: THREE.AdditiveBlending, depthWrite: false
                }));
                m.frustumCulled = false;
                return m;
            }),
            fire: makePool(() => new THREE.Sprite(new THREE.SpriteMaterial({
                map: fireTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            }))),
            // Soot. NormalBlending on purpose: it is the only layer in a blast
            // that can hide anything, and an explosion that hides nothing has
            // no mass.
            smoke: makePool(() => new THREE.Sprite(new THREE.SpriteMaterial({
                map: smokeTexture(), transparent: true, depthWrite: false, opacity: 0.9,
                blending: THREE.NormalBlending
            }))),
            cap: makePool(() => {
                const m = new THREE.Mesh(s.geo.cap, new THREE.MeshBasicMaterial({
                    map: shieldTexture(), transparent: true, side: THREE.DoubleSide,
                    blending: THREE.AdditiveBlending, depthWrite: false
                }));
                m.frustumCulled = false;
                return m;
            }),
            sprite: makePool(() => {
                const m = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
                }));
                return m;
            }),
            // A muzzle and an impact are FLARES, not balls. The previous build
            // used the same soft radial gradient for the muzzle, the hit, the
            // shield marker and the afterglow, so every event in the battle
            // resolved into an identical circle — which is most of why the
            // explosions read as a default particle puff. This one carries the
            // four-point diffraction profile, rolled at random, so a hit looks
            // like something ignited rather than like a dot.
            flash: makePool(() => new THREE.Sprite(new THREE.SpriteMaterial({
                map: flareTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
            })))
        };

        s.vfx = [];
        stage = s;
        return s;
    }

    // ----------------------------------------------------------------------
    // Transients
    // ----------------------------------------------------------------------
    /**
     * `parent` defaults to the scene. Passing a ship instead is what lets a fire
     * ride a damaged hull: the sprite is a child, so it follows the ship's bob,
     * sway and eventual tumble without any per-frame bookkeeping here.
     */
    /**
     * THE TRANSIENT BUDGET.
     *
     * Every entry in this list is a transparent, usually additive, usually
     * LARGE quad: a fireball grown to five times a capital's beam, a shockwave
     * twenty-six units across, a lance spanning the frame. Their cost is pure
     * overdraw and it is the one thing in this scene that is unbounded by
     * design — the timeline decides how many ships die at once, and on a slow
     * machine the frame gap grows, which lets MORE transients accumulate
     * between frames, which makes the gap grow again. That feedback loop was
     * measured in the capture harness: forty-four live transients at a frame
     * every 1.4 seconds.
     *
     * A hard cap breaks the loop. The oldest transient is the one closest to
     * fading out anyway, so retiring it is the least visible thing that can be
     * dropped, and the picture degrades by losing the tail of an explosion
     * rather than by halving the frame rate.
     */
    const VFX_CAP = 34;
    function emit(obj, ttl, tick, poolName, parent) {
        obj.visible = true;
        (parent || scene).add(obj);
        const list = stage.vfx;
        while (list.length >= VFX_CAP) releaseVfx(list.shift());
        list.push({ obj, born: nowSec(), ttl, tick, pool: poolName, parent: parent || null });
        return obj;
    }

    function releaseVfx(v) {
        (v.parent || scene).remove(v.obj);
        if (v.pool) stage.pools[v.pool].put(v.obj);
    }

    function updateVfx(now) {
        const list = stage.vfx;
        for (let i = list.length - 1; i >= 0; i--) {
            const v = list[i];
            const t = (now - v.born) / v.ttl;
            if (t >= 1) {
                releaseVfx(v);
                list.splice(i, 1);
                continue;
            }
            v.tick(t, v.obj);
        }
    }

    function flushVfx() {
        stage.vfx.forEach(releaseVfx);
        stage.vfx.length = 0;
        [stage.sparks, stage.embers].forEach(sys => {
            sys.live.fill(null);
            sys.col.fill(0);
            for (let i = 0; i < sys.capacity; i++) sys.mesh.setMatrixAt(i, sys.hidden);
            sys.mesh.instanceMatrix.needsUpdate = true;
            sys.mesh.instanceColor.needsUpdate = true;
        });
        clearChunks(stage.chunks);
    }

    const _a = new THREE.Vector3();
    const _b = new THREE.Vector3();

    /**
     * Cylindrical billboard: lay a unit quad along from->to and roll it about
     * that axis until it faces the camera. This is what makes a beam read as a
     * beam from every angle instead of as a rectangle that happens to be lit.
     * The matrix is written directly — the quad's own position/quaternion/scale
     * are never used, which is why the pool builds these with
     * matrixAutoUpdate:false.
     */
    const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Vector3();
    function orientBeamQuad(mesh, from, to, width) {
        _bm.addVectors(from, to).multiplyScalar(0.5);
        _by.subVectors(to, from);
        const len = _by.length() || 0.001;
        _by.multiplyScalar(1 / len);
        _bz.subVectors(camera.position, _bm);
        _bx.crossVectors(_by, _bz);
        if (_bx.lengthSq() < 1e-8) _bx.set(1, 0, 0); else _bx.normalize();
        _bz.crossVectors(_bx, _by).normalize();
        const e = mesh.matrix.elements;
        e[0] = _bx.x * width; e[1] = _bx.y * width; e[2] = _bx.z * width; e[3] = 0;
        e[4] = _by.x * len; e[5] = _by.y * len; e[6] = _by.z * len; e[7] = 0;
        e[8] = _bz.x; e[9] = _bz.y; e[10] = _bz.z; e[11] = 0;
        e[12] = _bm.x; e[13] = _bm.y; e[14] = _bm.z; e[15] = 1;
        mesh.matrixWorldNeedsUpdate = true;
        return len;
    }

    // ----------------------------------------------------------------------
    // THE LANCE — a tapered ribbon, not a drawn line.
    //
    // A capital's main gun was one uniform quad: measured off the delivered
    // frame it held an identical ~7-pixel Gaussian and an identical peak colour
    // of RGB(226,196,180) at x=400, x=800 and x=1200 — constant width and
    // constant intensity across fifteen hundred pixels of screen, never
    // clipping a single channel to 255. That is a warm beige stripe, not
    // energy. Three things are wrong with a quad and all three are structural:
    //
    //   WIDTH is constant, so there is no muzzle taper and no impact swell.
    //   ORIENTATION is one billboard axis for the whole length, so a beam that
    //     crosses the frame twists visibly against the lens at its ends.
    //   INTENSITY never leaves the tint, so the core is never white-hot.
    //
    // The ribbon fixes the first two by construction — width is per-segment,
    // and each segment rolls to face the camera at its OWN position — and the
    // third is fixed by multiplying the core's colour well above 1.0 so ACES
    // clips it to white while the wider envelope keeps the faction tint.
    // ----------------------------------------------------------------------
    const BEAM_SEG = 20;
    function makeRibbonGeometry() {
        const g = new THREE.BufferGeometry();
        const n = (BEAM_SEG + 1) * 2;
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        const uv = new Float32Array(n * 2);
        const idx = [];
        for (let i = 0; i <= BEAM_SEG; i++) {
            const v = i / BEAM_SEG;
            uv[i * 4] = 0; uv[i * 4 + 1] = v;
            uv[i * 4 + 2] = 1; uv[i * 4 + 3] = v;
            if (i < BEAM_SEG) {
                const a = i * 2;
                idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
            }
        }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setIndex(idx);
        // The ribbon is written in world space with an identity transform, so a
        // computed bounding sphere would be wrong the moment it moved. Frustum
        // culling is off on these meshes; this only has to be non-null.
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
        return g;
    }

    /**
     * The width profile down the shaft: necked to 42% at the muzzle, holding
     * through the middle, swelling past 200% into the last eighth where it
     * meets the hull. `swell` scales only the impact end, so the same call can
     * draw the hot core (which swells hard) and the wide envelope (which does
     * not) without two profiles.
     */
    function beamWidthAt(v, swell) {
        const muzzle = 0.42 + 0.34 * smooth01(v / 0.30);
        const hit = Math.pow(clamp((v - 0.74) / 0.26, 0, 1), 1.7) * (swell === undefined ? 1.5 : swell);
        return muzzle + hit;
    }

    const _rbV = new THREE.Vector3(), _rbAx = new THREE.Vector3(), _rbSide = new THREE.Vector3();
    function shapeRibbon(mesh, from, to, width, swell) {
        const pos = mesh.geometry.attributes.position;
        _rbAx.subVectors(to, from);
        const len = _rbAx.length() || 1e-4;
        _rbAx.multiplyScalar(1 / len);
        for (let i = 0; i <= BEAM_SEG; i++) {
            const v = i / BEAM_SEG;
            _rbV.lerpVectors(from, to, v);
            // Rolled to face the lens AT THIS POINT, not once for the whole
            // beam: a lance a hundred units long is not at one angle to a
            // camera twenty units away.
            _rbSide.subVectors(camera.position, _rbV).cross(_rbAx);
            if (_rbSide.lengthSq() < 1e-9) _rbSide.set(0, 1, 0); else _rbSide.normalize();
            const w = width * beamWidthAt(v, swell);
            const o = i * 2;
            pos.setXYZ(o, _rbV.x - _rbSide.x * w, _rbV.y - _rbSide.y * w, _rbV.z - _rbSide.z * w);
            pos.setXYZ(o + 1, _rbV.x + _rbSide.x * w, _rbV.y + _rbSide.y * w, _rbV.z + _rbSide.z * w);
        }
        pos.needsUpdate = true;
    }

    /** One layer of a lance: a tapered ribbon that re-shapes itself each frame. */
    function ribbonBeam(from, to, width, swell, colorHex, intensity, opacity, ttl, power) {
        const m = stage.pools.ribbon.get();
        m.material.color.set(colorHex).multiplyScalar(intensity);
        m.material.opacity = opacity;
        const a = from.clone(), b = to.clone();
        shapeRibbon(m, a, b, width, swell);
        emit(m, ttl, (t, o) => {
            // Flicker: a power channel is not a steady lamp.
            const f = 0.86 + 0.14 * Math.sin(nowSec() * 61 + a.x);
            o.material.opacity = opacity * Math.pow(1 - t, power) * f;
            shapeRibbon(o, a, b, width * (1 + t * 0.12), swell);
        }, 'ribbon');
        return m;
    }

    /** A beam whose endpoints do not move: re-billboarded every frame. */
    function staticBeam(from, to, width, colorHex, intensity, opacity, ttl, power) {
        const m = stage.pools.quad.get();
        m.material.color.set(colorHex).multiplyScalar(intensity);
        m.material.opacity = opacity;
        const a = from.clone(), b = to.clone();
        orientBeamQuad(m, a, b, width);
        emit(m, ttl, (t, o) => {
            o.material.opacity = opacity * Math.pow(1 - t, power);
            orientBeamQuad(o, a, b, width);
        }, 'quad');
        return m;
    }

    /** The dark backing that gives a bolt or a lance contrast over a lit world. */
    function beamBacking(from, to, width, opacity, ttl, power) {
        const m = stage.pools.dark.get();
        m.material.opacity = opacity;
        const a = from.clone(), b = to.clone();
        orientBeamQuad(m, a, b, width);
        emit(m, ttl, (t, o) => {
            o.material.opacity = opacity * Math.pow(1 - t, power);
            orientBeamQuad(o, a, b, width);
        }, 'dark');
        return m;
    }

    /**
     * EDGE-ON QUAD GUARD.
     *
     * A shockwave is a flat disc, and a flat disc seen close to edge-on
     * rasterises as a one-or-two-pixel sliver — which is exactly the artifact
     * that showed up in the delivered frame as a thin double vertical hairline
     * running through the brightest explosion on screen (two humps at x=758-765
     * and x=771-775 over a background of L=0-1, persisting well above and below
     * the blast). Physically a wave front seen edge-on presents almost no area
     * to the lens, so the honest fix is also the cheap one: fade the ring out
     * as its normal turns perpendicular to the view, and it is fully gone
     * before it can ever render as a line.
     */
    const _rgN = new THREE.Vector3(), _rgV = new THREE.Vector3();
    function ringFade(mesh) {
        _rgN.set(0, 0, 1).applyQuaternion(mesh.quaternion);
        _rgV.subVectors(camera.position, mesh.position);
        if (_rgV.lengthSq() < 1e-9) return 1;
        _rgV.normalize();
        return smooth01((Math.abs(_rgN.dot(_rgV)) - 0.14) / 0.20);
    }

    /**
     * A fire sprite that is not a circle. Every blob in the previous build was
     * a uniformly scaled radial texture at the same rotation, so eight of them
     * stacked read as eight overlapping circles — the single most recognisable
     * "default particle system" tell there is. Non-uniform scale plus a random
     * roll means no two are the same shape.
     */
    function spawnFire(pos, colorHex, size, ttl, opts) {
        const o = opts || {};
        const rnd = o.rnd || Math.random;
        const s = stage.pools.fire.get();
        // A wide aspect range, because a circle is the tell. At 0.5..2.2 no two
        // lobes in a blast are the same shape even before the roll.
        const ratio = 0.50 + rnd() * 1.70;
        s.material.color.set(colorHex).multiplyScalar(o.intensity === undefined ? 1.6 : o.intensity);
        s.material.opacity = o.opacity === undefined ? 1 : o.opacity;
        s.material.rotation = rnd() * Math.PI * 2;
        s.position.copy(pos);
        s.scale.set(size * ratio, size / ratio, 1);
        const a0 = s.material.opacity;
        const grow = o.grow === undefined ? 1.6 : o.grow;
        const drift = o.drift || null;
        const p0 = drift ? pos.clone() : null;
        emit(s, ttl, (t, m) => {
            m.material.opacity = a0 * Math.pow(1 - t, o.fade === undefined ? 2.2 : o.fade);
            const k = size * (1 + easeOut(t) * grow);
            m.scale.set(k * ratio, k / ratio, 1);
            if (drift) m.position.set(p0.x + drift.x * t, p0.y + drift.y * t, p0.z + drift.z * t);
        }, 'fire');
        return s;
    }

    /**
     * Soot. Normally blended and dark, so it genuinely hides the hull behind
     * it; slower and longer-lived than the fire, so the blast leaves something
     * behind instead of vanishing.
     */
    function spawnSmoke(pos, size, ttl, rnd, drift) {
        const s = stage.pools.smoke.get();
        const ratio = 0.66 + rnd() * 0.9;
        const v = 0.055 + rnd() * 0.05;
        s.material.color.setRGB(v, v * 0.92, v * 0.86);
        s.material.opacity = 0;
        s.material.rotation = rnd() * Math.PI * 2;
        s.position.copy(pos);
        s.scale.set(size * ratio, size / ratio, 1);
        const p0 = pos.clone();
        const spin = (rnd() - 0.5) * 1.1;
        const r0 = s.material.rotation;
        emit(s, ttl, (t, m) => {
            // Up fast, out slow: soot is opaque long before it has spread.
            m.material.opacity = 0.92 * smooth01(t / 0.16) * Math.pow(1 - t, 1.5);
            const k = size * (1 + easeOut(t) * 1.5);
            m.scale.set(k * ratio, k / ratio, 1);
            m.material.rotation = r0 + spin * t;
            if (drift) m.position.set(p0.x + drift.x * t, p0.y + drift.y * t, p0.z + drift.z * t);
        }, 'smoke');
    }

    let _flashRoll = 0;
    function spawnFlash(pos, colorHex, size, ttl, intensity) {
        const s = stage.pools.flash.get();
        s.material.color.set(colorHex).multiplyScalar(intensity === undefined ? 2.6 : intensity);
        s.material.opacity = 1;
        // Rolled, and never the same roll twice in a row: identical stars at
        // identical angles are as much of a tell as identical circles.
        _flashRoll = (_flashRoll + 1.117) % 6.283;
        s.material.rotation = _flashRoll;
        s.position.copy(pos);
        const ratio = 0.82 + ((_flashRoll * 7) % 1) * 0.5;
        s.scale.set(size * ratio, size / ratio, 1);
        emit(s, ttl || 0.22, (t, o) => {
            o.material.opacity = 1 - t;
            const k = size * (1 + t * 0.9);
            o.scale.set(k * ratio, k / ratio, 1);
        }, 'flash');
    }

    function spawnSpark(pos, vel, colorHex, ttl, big) {
        const sys = big ? stage.embers : stage.sparks;
        _col.set(colorHex);
        const boost = big ? 2.4 : 3.2;
        // 4:1 per-instance size roll. A field where every mote is the same
        // radius is a field of confetti no matter what colour it is.
        const roll = (current && current.rnd) ? current.rnd() : Math.random();
        emitParticle(sys, {
            x: pos.x, y: pos.y, z: pos.z,
            vx: vel.x, vy: vel.y, vz: vel.z,
            r: _col.r * boost, g: _col.g * boost, b: _col.b * boost,
            s: sys.size * (0.5 + roll * roll * 1.6),
            t: 0, ttl
        });
    }

    function sparkBurst(pos, count, speed, colorHex, rnd, big) {
        for (let i = 0; i < count; i++) {
            const v = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5)
                .normalize().multiplyScalar(speed * (0.35 + rnd()));
            spawnSpark(pos, v, colorHex, 0.35 + rnd() * 0.7, big && i % 7 === 0);
        }
    }

    /** Shield facet flare, oriented so the impact is at the pole of the cap. */
    function shieldFlare(ship, point, colorHex, size, alpha, ttl) {
        const a0 = alpha === undefined ? 0.5 : alpha;
        const life = ttl === undefined ? 0.3 : ttl;
        const m = stage.pools.cap.get();
        ship.getWorldPosition(_a);
        m.position.copy(_a);
        m.scale.setScalar(size);
        m.lookAt(point);
        m.material.color.set(colorHex).multiplyScalar(1.4);
        m.material.opacity = a0;
        emit(m, life, (t, o) => {
            o.material.opacity = a0 * Math.pow(1 - t, 2.1);
            o.scale.setScalar(size * (1 + t * 0.14));
        }, 'cap');
        // The halo used to be sized off the shell and grown 2.6x, which on a
        // dreadnought put a fifteen-unit orange ball in a shot framed twenty
        // units wide. It marks the point of impact; it is not the event.
        spawnFlash(point, colorHex, size * 0.5, 0.24, 2.0);
    }

    // ----------------------------------------------------------------------
    // Weapons
    // ----------------------------------------------------------------------
    function gunWorld(ship, index) {
        const guns = ship.userData.guns;
        if (!guns || !guns.length) { ship.getWorldPosition(_a); return _a.clone(); }
        const g = guns[index % guns.length];
        return ship.localToWorld(g.clone());
    }

    function aimPoint(target, rnd) {
        target.getWorldPosition(_b);
        const r = target.userData.radius || 1;
        return _b.clone().add(new THREE.Vector3(
            (rnd() - 0.5) * r * 0.7, (rnd() - 0.5) * r * 0.5, (rnd() - 0.5) * r * 0.7));
    }

    /**
     * One shot. Bolts travel — a tracer with a visible flight time is what makes
     * two fleets read as shooting AT each other rather than as two light shows.
     * Capitals fire a lance instead: instant, thick, and it lingers long enough
     * that the eye can follow it back to the ship that fired it.
     */
    function fireShot(src, dst, opts) {
        if (!src || !dst) return;
        const o = opts || {};
        const meta = SHIP_META[src.userData.typeId];
        if (meta && !meta.armed) return;              // colony hulls never fire
        if (!src.userData.guns || !src.userData.guns.length) return;

        const rnd = current.rnd;
        const fac = FACTION[src.userData.faction];
        const from = gunWorld(src, Math.floor(rnd() * 8));
        const to = aimPoint(dst, rnd);
        const dist = from.distanceTo(to);
        // A lance is an EVENT. Firing one on every trigger pull turned the frame
        // into a light show — eight or nine full-length beams crossing the
        // picture at once, all of them the brightest thing on screen. A capital
        // spends most of its rate of fire on its secondaries and lands the main
        // battery occasionally; that is also what makes the lance read as the
        // heavy weapon rather than as the default one.
        const heavy = !!o.heavy || (meta && meta.weapon === 'beam' && rnd() < 0.22);
        const colour = heavy ? fac.accent : fac.bolt;

        src.userData.recoil = Math.min(1, (src.userData.recoil || 0) + (heavy ? 1 : 0.45));
        // EVERY ROUND HAS A MUZZLE. A lance got a ribbon stub off the hardpoint
        // and a bolt got a bare radial flash, which is why the light rounds read
        // as two bright streaks starting in empty space — scratches on the lens
        // rather than ordnance leaving a ship. Same treatment for both, sized
        // to the weapon.
        muzzleFlare(from, to, colour, heavy ? 1 : 0.55);

        if (heavy) {
            // Lance: dark backing, wide faction-coloured envelope, white-hot
            // core — all three TAPERED ribbons rather than uniform quads, so
            // the shaft necks at the muzzle and swells into the hull it hits.
            // The core is multiplied to 4.4x: that is what makes it clip to
            // white through ACES instead of settling at a warm beige, while the
            // envelope beneath it stays firmly in the faction's colour.
            beamBacking(from, to, 1.15, 0.26, 0.28, 1.6);
            // Envelope wide and firmly in the faction's colour; core thin and
            // barely tinted. Getting this ratio wrong in either direction is
            // what turns a lance into a painted bar: too wide a core and the
            // whole shaft is white, too little intensity and it is beige.
            ribbonBeam(from, to, 0.62, 2.1, colour, 1.25, 0.62, 0.30, 1.8);
            ribbonBeam(from, to, 0.085, 2.2, blend(colour, 0xffffff, 0.52), 3.4, 1.0, 0.24, 2.6);
            impactAfter(dst, to, colour, 0.09, o, heavy);
        } else {
            const speed = 190 + rnd() * 60;
            const travel = clamp(dist / speed, 0.06, 0.6);
            const burst = o.burst === undefined ? (meta && meta.guns > 1 ? 2 : 1) : o.burst;
            // Far tracers dim. Without it a bolt fired across the engagement is
            // as loud as one fired past the lens, and the frame flattens.
            const depth = clamp(1.25 - camera.position.distanceTo(from) / 340, 0.42, 1);
            for (let k = 0; k < burst; k++) {
                const delay = k * 0.07;
                const t0 = nowSec() + delay;
                const back = stage.pools.dark.get();
                back.material.opacity = 0;
                const bolt = stage.pools.tracer.get();
                bolt.material.color.set(colour).multiplyScalar(3.1 * depth);
                bolt.material.opacity = 1;
                const spread = new THREE.Vector3((rnd() - 0.5) * 1.4, (rnd() - 0.5) * 1.0, (rnd() - 0.5) * 1.4);
                const dest = to.clone().add(spread);
                const p0 = from.clone();
                // Tracer length as a FRACTION of the flight, so a shot across
                // the fleet and a shot at point-blank both read as a dart
                // rather than as a line joining the two ships.
                const tail = clamp(9.5 / Math.max(dist, 1), 0.06, 0.36);
                bolt.visible = false;
                back.visible = false;
                const drive = (t, m, width, alpha) => {
                    const now = nowSec();
                    if (now < t0) { m.visible = false; return; }
                    m.visible = true;
                    const u = clamp((now - t0) / travel, 0, 1);
                    _a.lerpVectors(p0, dest, u);
                    _b.lerpVectors(p0, dest, clamp(u - tail, 0, 1));
                    orientBeamQuad(m, _b, _a, width);
                    m.material.opacity = alpha;
                };
                emit(back, travel + delay, (t, m) => drive(t, m, 1.35, 0.5 * depth), 'dark');
                emit(bolt, travel + delay, (t, m) => drive(t, m, 0.60, 1), 'tracer');
            }
            impactAfter(dst, to, colour, travel + 0.01, o, heavy);
        }

        // Throttled. The rate of fire is a picture decision; sixteen overlapping
        // laser samples a second is not a sound, it is a buzz.
        const nowMs = performance.now();
        if (window.MediaManager?.playSfx && nowMs - _lastGunSfx > 150) {
            _lastGunSfx = nowMs;
            window.MediaManager.playSfx('laserFire', { overlap: true });
        }
    }
    let _lastGunSfx = 0;

    /**
     * The muzzle. A short, very wide, very hot stub of ribbon fired off the
     * hardpoint and gone in a tenth of a second — geometry, so it is anchored to
     * the barrel and lies along the shot rather than being a soft disc parked
     * near it. The previous build reused the same radial gradient for the
     * muzzle, the impact and the afterglow, which is why all three read as the
     * same generic blob.
     */
    const _mzTo = new THREE.Vector3();
    function muzzleFlare(from, to, colour, scale) {
        const k = scale === undefined ? 1 : scale;
        _mzTo.subVectors(to, from);
        const len = _mzTo.length() || 1;
        _mzTo.multiplyScalar(1 / len).multiplyScalar(Math.min(2.6 * k, len * 0.035)).add(from);
        // Small. At the first pass's width this was a two-unit-wide white wedge
        // hanging off the prow — a spotlight, not a gun going off.
        // NEGATIVE swell. beamWidthAt() flares a ribbon at its far end because a
        // lance swells into the hull it is cutting; a muzzle does the opposite —
        // it leaves the barrel and dissipates — and the default flare gave the
        // stub a blunt, chisel-cut far end, the same tell the tracer had.
        ribbonBeam(from, _mzTo, 0.34 * k, -0.55, blend(colour, 0xffffff, 0.5), 3.0, 0.9, 0.11 + 0.05 * k, 2.6);
        spawnFlash(from, blend(colour, 0xffffff, 0.4), 2.2 * k, 0.13 * (1 + k), 3.6);
    }

    /**
     * The impact. A hot white nucleus, a shockwave ring standing square across
     * the beam, and a spray of sparks thrown BACK along it — the three things
     * that separate a hit from a decal. The ring is oriented to the beam, which
     * is why it needs the edge-on guard in ringFade().
     */
    const _imp = new THREE.Vector3();
    function beamImpact(point, dirFrom, colour, scale) {
        spawnFlash(point, 0xfff4e2, 1.9 * scale, 0.15, 5.0);
        spawnFlash(point, colour, 3.2 * scale, 0.26, 2.0);
        const ring = stage.pools.ring.get();
        ring.material.color.set(blend(colour, 0xffffff, 0.5)).multiplyScalar(1.8);
        ring.material.opacity = 0.85;
        ring.position.copy(point);
        ring.lookAt(_imp.copy(point).add(dirFrom));
        emit(ring, 0.30, (t, m) => {
            m.material.opacity = 0.85 * Math.pow(1 - t, 2.0) * ringFade(m);
            m.scale.setScalar(0.4 * scale + easeOut(t) * 5.4 * scale);
        }, 'ring');
    }

    const _missTo = new THREE.Vector3(), _missDir = new THREE.Vector3();
    function impactAfter(target, point, colour, delaySec, o, heavy) {
        const tmr = setTimeout(() => {
            if (!current) return;
            const rnd = current.rnd;
            if (o.kill) {
                destroyShip(target, point);
            } else if (target.userData.dead) {
                // A MISS STILL GOES SOMEWHERE. The target died between the
                // trigger and the round arriving, and the tracer used to simply
                // stop in mid-air — which is the other half of why the rounds
                // read as scratches on the lens. Dimmer, cooler, and a hull
                // radius or two past where the ship was.
                _missDir.copy(point).sub(camera.position).normalize();
                _missTo.copy(point).addScaledVector(_missDir, (target.userData.radius || 2) * 1.6);
                spawnFlash(_missTo, blend(colour, 0x9fb6d8, 0.6), 1.1, 0.16, 1.1);
            } else {
                shieldFlare(target, point, target.userData.accent, (target.userData.radius || 2) * 0.55);
                if (heavy) {
                    target.getWorldPosition(_a);
                    beamImpact(point, _a.sub(point).normalize(), colour, 1.0);
                }
                sparkBurst(point, heavy ? 16 : 8, heavy ? 16 : 10, colour, rnd, heavy);
                // Some hits get through. A fire riding the hull is what carries
                // damage between rounds: without it a ship is either untouched
                // or gone, and a fleet that has been fought over for three
                // rounds looks exactly like one that just arrived.
                if (heavy || rnd() < 0.22) hullFire(target, point, rnd);
                if (window.MediaManager?.playSfx) window.MediaManager.playSfx('shieldHit', { overlap: true });
            }
        }, delaySec * 1000);
        timers.push(tmr);
    }

    /** A burning breach that rides the hull, with its own sparks. */
    function hullFire(ship, worldPoint, rnd) {
        const fires = ship.userData.fires || 0;
        if (fires >= 3) return;              // a hull can only carry so many
        ship.userData.fires = fires + 1;
        const local = ship.worldToLocal(worldPoint.clone());
        const size = (ship.userData.radius || 2) * 0.5;
        const s = stage.pools.fire.get();
        const ratio = 0.7 + rnd() * 0.8;
        s.material.color.set(0xff7a2a).multiplyScalar(1.5);
        s.material.opacity = 0.9;
        s.material.rotation = rnd() * Math.PI * 2;
        s.position.copy(local);
        s.scale.set(size * ratio, size / ratio, 1);
        const life = 3.4 + rnd() * 2.6;
        emit(s, life, (t, m) => {
            // Flicker, then burn out.
            const flick = 0.78 + 0.22 * Math.sin(nowSec() * 17 + local.x * 9);
            m.material.opacity = 0.9 * flick * Math.pow(1 - t, 0.9);
            const k = size * (0.75 + 0.25 * flick);
            m.scale.set(k * ratio, k / ratio, 1);
        }, 'fire', ship);
        const done = setTimeout(() => { if (ship.userData.fires) ship.userData.fires--; }, life * 1000);
        timers.push(done);
    }

    // ----------------------------------------------------------------------
    // Destruction
    // ----------------------------------------------------------------------
    function hullPoint(ship, rnd) {
        const r = (ship.userData.radius || 2);
        ship.getWorldPosition(_a);
        return _a.clone().add(new THREE.Vector3(
            (rnd() - 0.5) * r * 1.3, (rnd() - 0.5) * r * 0.6, (rnd() - 0.5) * r * 1.0));
    }

    function destroyShip(ship, hitPoint) {
        if (!ship || ship.userData.dead) return;
        ship.userData.dead = true;
        const rnd = current.rnd;
        const scale = ship.userData.blast || 1;

        // Shield collapses first, then the hull comes apart in stages: two
        // internal blasts, then the magazine. Instant vaporisation reads as a
        // sprite popping; a sequence reads as a ship dying.
        if (hitPoint) shieldFlare(ship, hitPoint, 0xf6f2ff, (ship.userData.radius || 2) * 0.55, 0.34, 0.24);
        for (let k = 0; k < 2; k++) {
            const tmr = setTimeout(() => {
                if (!current) return;
                const p = hullPoint(ship, rnd);
                spawnFlash(p, 0xffd08a, 1.6 * scale, 0.22, 4);
                // The internal blasts are venting fire, not more discs: each
                // gets its own ellipse, roll and direction out of the hull.
                spawnFire(p, 0xffb15a, 1.5 * scale, 0.34, {
                    rnd, intensity: 2.2, grow: 2.0,
                    drift: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(4 * scale)
                });
                sparkBurst(p, 10, 12, 0xffb265, rnd, true);
            }, 90 + k * 150);
            timers.push(tmr);
        }
        const tmr = setTimeout(() => { if (current) detonate(ship, scale, rnd); }, 380);
        timers.push(tmr);
    }

    /**
     * DETONATION.
     *
     * The previous build's blast was eight soft additive circles of near-
     * identical size on a dark core: no shockwave visible at onset, no smoke,
     * no anisotropy, nothing that occluded anything. That is a default particle
     * puff, and it is the loudest "not a funded studio" tell a space battle
     * has. This is built as an ordered event instead, in the order the physics
     * would give:
     *
     *   t=0     white nucleus + a fast shockwave ring standing across the hull
     *   t=0     an anisotropic spray of fire, each blob a different ellipse at
     *           a different roll, thrown along a blast axis rather than
     *           radiating evenly
     *   t=0.02  SOOT — normally blended, so it actually hides the ships behind
     *           it and the explosion finally has mass
     *   t=0.05  a second, slower body ring behind the leading edge
     *   then    debris on the blast axis, sparks, and a long afterglow
     */
    const _ringAim = new THREE.Vector3(), _ringQ = new THREE.Quaternion();
    function detonate(ship, scale, rnd) {
        ship.getWorldPosition(_a);
        const pos = _a.clone();
        // A blast axis. A real magazine going up vents through whatever gave
        // way first; radiating evenly is the thing that makes it read as a
        // sprite rather than as a hull coming apart.
        const axis = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();

        // Nucleus: very hot, very short. Everything else is the consequence.
        spawnFire(pos, 0xfff2dc, 1.8 * scale, 0.24,
            { rnd, intensity: 2.7, grow: 1.9, fade: 2.4 });

        // A MAGAZINE GOING UP MAKES LIGHT. Without it the hull sitting inside
        // the fireball's radius keeps a near-black facing side while the ship
        // beside it comes apart — which is what made the blast read as a decal
        // pasted over the render rather than as an event in the scene.
        {
            const L = stage.blastLights[stage.blastNext];
            stage.blastNext = (stage.blastNext + 1) % stage.blastLights.length;
            L.position.copy(pos);
            L.distance = 60 * scale;
            L.userData.born = nowSec();
            L.userData.dur = 0.62;
            L.userData.peak = 40 * scale;
            L.userData.live = 1;
        }

        // Leading shockwave, AT ONSET. Fast and bright, so the eye reads an
        // expanding front before it reads a fireball.
        //
        // BOTH WAVES SHARE ONE ORIENTATION, AND IT IS THE BLAST AXIS. Rolling
        // each ring independently gave two near-equal discs at unrelated tilts
        // intersecting in the middle of frame — a Venn diagram, not a blast
        // front. The disc's normal is the axis the wreck vented along, which is
        // the same axis the fire lobes and the debris are thrown down, so the
        // whole event finally agrees with itself.
        const ringMax = 3 + scale * 5.2;
        _ringAim.copy(pos).add(axis);
        {
            const ring = stage.pools.ring.get();
            ring.material.color.set(0xfff0d6).multiplyScalar(1.5);
            ring.material.opacity = 0.7;
            ring.position.copy(pos);
            ring.lookAt(_ringAim);
            _ringQ.copy(ring.quaternion);
            emit(ring, 0.30, (t, m) => {
                m.material.opacity = 0.7 * Math.pow(1 - t, 1.7) * ringFade(m);
                m.scale.setScalar(0.4 * scale + easeOut(t) * ringMax * 0.95);
            }, 'ring');
        }
        // Body wave behind it, slower and cooler — concentric with the front,
        // because that is what a second wave off the same event looks like.
        {
            const ring = stage.pools.ring.get();
            ring.material.color.set(0xffa552).multiplyScalar(0.9);
            ring.material.opacity = 0.24;
            ring.position.copy(pos);
            ring.quaternion.copy(_ringQ);
            emit(ring, 0.52, (t, m) => {
                m.material.opacity = 0.24 * Math.pow(1 - t, 1.9) * ringFade(m);
                m.scale.setScalar(0.5 * scale + easeOut(t) * ringMax * 0.55);
            }, 'ring');
        }

        // ONE FIREBALL, WITH LOBES — not a ring of separate blobs.
        //
        // The failure mode here is specific and it is what "default particle
        // puff" actually looks like: several same-sized sprites thrown far
        // enough apart that the eye resolves each one as its own circle. The
        // body is therefore a single large fireball at the centre, and the
        // lobes are launched from close in, at half its size, so they read as
        // that fireball tearing open along the blast axis rather than as
        // satellites orbiting it.
        spawnFire(pos, 0xffa04a, scale * 4.4, 0.62, {
            rnd, intensity: 1.15, opacity: 0.95, grow: 1.5, fade: 2.1
        });
        for (let k = 0; k < 3; k++) {
            const along = (rnd() * 1.7 - 0.35);
            const jitter = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.8);
            const dir = axis.clone().multiplyScalar(along).add(jitter);
            const p = pos.clone().addScaledVector(dir, scale * 0.55);
            spawnFire(p, k === 0 ? 0xffd489 : 0xff6f1c, scale * (2.6 + rnd() * 1.6), 0.52 + rnd() * 0.3, {
                rnd, intensity: k === 0 ? 2.1 : 1.1, opacity: 0.9,
                grow: 2.0 + rnd(), fade: 2.0,
                drift: dir.multiplyScalar(scale * (2.6 + rnd() * 2.6))
            });
        }

        // SOOT. The only layer with mass. Three billows on the same axis, held
        // long enough to hide what is behind the wreck for a beat.
        for (let k = 0; k < 3; k++) {
            const dir = axis.clone().multiplyScalar(rnd() * 1.3 - 0.2)
                .add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(1.1));
            const p = pos.clone().addScaledVector(dir, scale * 1.3);
            spawnSmoke(p, scale * (1.9 + rnd() * 1.5), 1.05 + rnd() * 0.5, rnd,
                dir.multiplyScalar(scale * (1.4 + rnd() * 1.6)));
        }

        // Afterglow: burning gas hanging where the ship was, long after the
        // flash. It is what keeps a kill legible for a beat once the shockwave
        // has gone, so a player who looks over a moment late still sees it.
        const glow = stage.pools.sprite.get();
        glow.material.color.set(0xff8c3a).multiplyScalar(1.2);
        glow.material.opacity = 0.7;
        glow.position.copy(pos);
        glow.scale.setScalar(2.1 * scale);
        emit(glow, 1.4, (t, m) => {
            m.material.opacity = 0.7 * Math.pow(1 - t, 1.6);
            m.scale.setScalar(2.1 * scale * (1 + t * 0.7));
        }, 'sprite');

        sparkBurst(pos, 46, 16 * scale, 0xffc27a, rnd, true);
        sparkBurst(pos, 18, 8 * scale, 0xff7a3a, rnd, true);

        // Wreckage, thrown ALONG the blast axis rather than radiating evenly —
        // debris with a direction reads as a hull failing on one side, debris
        // with none reads as a firework.
        const chunks = Math.round(6 + scale * 7);
        for (let i = 0; i < chunks; i++) {
            const dir = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5)
                .normalize().multiplyScalar(0.55)
                .addScaledVector(axis, (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.8))
                .normalize();
            const sp = (2 + rnd() * 8) * scale;
            emitChunk(stage.chunks, {
                x: pos.x, y: pos.y, z: pos.z,
                vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp,
                rx: rnd() * 6, ry: rnd() * 6, rz: rnd() * 6,
                wx: (rnd() - 0.5) * 5, wy: (rnd() - 0.5) * 5, wz: (rnd() - 0.5) * 5,
                size: (0.35 + rnd() * 1.1) * scale, t: 0, ttl: 3.6 + rnd() * 2.4
            });
        }

        hulkify(ship, rnd);
        shake(1.5 * scale, pos);
        if (window.MediaManager?.playSfx) window.MediaManager.playSfx('explosion');
    }

    /**
     * What is left of a ship stays on the battlefield. Vertex colours are baked
     * into the geometry, so the only way to char a single hull without touching
     * its five hundred siblings is to swap the material reference on this
     * clone's meshes — which is exactly what makes the merged layout worth it.
     */
    function hulkify(ship, rnd) {
        const mats = stageMaterials();
        for (let i = ship.children.length - 1; i >= 0; i--) {
            const c = ship.children[i];
            if (c.userData.halo) { ship.remove(c); continue; }
            // Anything without a bucket is not part of the hull — engine halos
            // are gone by here, and the rest is fire riding the wreck, which
            // stays. Swapping a hull material onto a Sprite would break it.
            if (c.userData.bucket === undefined) continue;
            if (c.userData.bucket === B_LIGHT || c.userData.bucket === B_GLOW) { c.visible = false; continue; }
            // The hull code stays legible on the wreck — burnt on, not lit.
            c.material = c.userData.bucket === B_DECAL ? mats.hulkDecal : mats.hulk;
        }
        ship.userData.hulk = {
            wx: (rnd() - 0.5) * 0.5, wy: (rnd() - 0.5) * 0.4, wz: (rnd() - 0.5) * 0.6,
            vx: (rnd() - 0.5) * 1.6, vy: (rnd() - 0.5) * 0.9, vz: (rnd() - 0.5) * 1.6
        };
        current.hulks.push(ship);
        while (current.hulks.length > MAX_HULKS) {
            const old = current.hulks.shift();
            if (old.parent) old.parent.remove(old);
        }
        // A burning wreck: two embers riding the hull for a few seconds.
        for (let k = 0; k < 2; k++) {
            ship.getWorldPosition(_a);
            spawnSpark(_a, new THREE.Vector3((rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.6),
                0xff8a3a, 2.5 + rnd(), true);
        }
    }

    // ----------------------------------------------------------------------
    // Camera: a shot list, not an orbit.
    // ----------------------------------------------------------------------
    const D2R = Math.PI / 180;

    /**
     * The shot list. `az` is measured from +X toward +Z; attackers sit at +X and
     * defenders at -X, so az near 0 puts the lens BEHIND the attacking fleet
     * looking down the axis, and az near 180 behind the defenders. `dist` is a
     * fraction of the distance that frames the whole engagement, `target` an
     * offset from the engagement centre in units of half the battle line's
     * length.
     *
     * The shoulder shots have to sit further out than they look: the fleet they
     * are shooting over is a HUNDRED units deep, so a distance that seems close
     * on paper puts the camera in the middle of no-man's-land with its own side
     * behind it. Both are pushed out until the near hulls are genuinely in the
     * foreground, then dolly forward through their own line.
     */
    function shotList() {
        return {
            // Tightened hard from [0.70,0.54]. At the old distance the
            // engagement occupied the lower-right third and the upper-left
            // quadrant was empty near-black with nothing in it — no silhouette,
            // no scale anchor, no leading element, so it read as the camera
            // being too far out rather than as negative space. Closer, with a
            // 10-degree roll, the fleet diagonal runs corner to corner and the
            // world anchors the opposite corner.
            establish: { az: [52, 66], el: [24, 15], dist: [0.52, 0.42], fov: [45, 42], target: [0.04, 0.05, 0], roll: [-10, -6] },
            attShoulder: { az: [12, 30], el: [17, 10], dist: [0.60, 0.46], fov: [50, 47], target: [-0.24, 0.03, 0] },
            // Telephoto, side-on, low. The two fleets are a hundred and sixty
            // units apart along the axis, so a wide lens in the middle of the
            // gap frames an empty corridor with a fleet at each edge. A long
            // lens from outside compresses that depth until the two lines
            // overlap and the tracers cross the frame — the war-film shot.
            // Pulled in from [0.62,0.50] and biased off the axis. At the old
            // distance the two lines sat in the outer thirds with the whole
            // middle of the frame empty, which reads as a stand-off rather than
            // as an engagement; closer and off-centre, one fleet is genuinely
            // in the foreground and the exchange crosses the frame diagonally.
            crossfire: { az: [99, 83], el: [-11, 6], dist: [0.55, 0.44], fov: [30, 27], target: [0.10, -0.03, 0], roll: [7, -5] },
            defShoulder: { az: [193, 211], el: [15, 9], dist: [0.60, 0.46], fov: [50, 47], target: [0.24, 0.03, 0] },
            capital: { az: [143, 120], el: [9, 17], dist: [0.20, 0.15], fov: [52, 48], target: [0, 0, 0] },
            // THE VERDICT BEAT IS STAGED, NOT INHERITED.
            //
            // It used to reuse a combat framing: the surviving flagship came in
            // at 390px of a 1920px frame — a fifth of the width, dead centre,
            // read against nothing — while the right half of the picture was
            // twenty pieces of black scrap. The one beat the whole sequence
            // exists for had the least deliberate staging in the set.
            //
            // Three deliberate choices now. The lens PUSHES IN hard and goes
            // long (0.125 of the framing distance at 34 degrees, against 0.30 at
            // 38), so the hero hull carries about half the frame width. The
            // azimuth is HELD near 50 degrees, which is where the defended world
            // sits directly behind the subject and the sun sits behind that —
            // depth and a rim, for free, from furniture that is already in the
            // scene. And `bias` slides the hull onto a third: because the shift
            // is a camera translation rather than a re-aim, the near subject
            // moves and the distant planet does not, which is exactly the
            // parallax that separates them.
            result: {
                az: [46, 58], el: [17, 11], dist: [0.16, 0.074], fov: [40, 32],
                target: [0, 0.10, 0], roll: [4, 0], lock: 1, bias: [0.24, -0.20]
            }
        };
    }
    // Round 1 gets the crossfire: it is the frame that shows two lines shooting
    // at each other, and it is the one a still has to carry.
    const ROUND_SHOTS = ['crossfire', 'attShoulder', 'capital', 'defShoulder'];

    /**
     * Pick the round's coverage. The rotation is only a starting point: a
     * shoulder shot over a fleet that has two hulls left frames an empty corner,
     * and the last round is where the decisive kill happens, so it always gets
     * the close lens.
     */
    function shotForRound(roundIndex, totalRounds) {
        if (roundIndex >= totalRounds) return 'capital';
        let name = ROUND_SHOTS[(roundIndex - 1) % ROUND_SHOTS.length];
        const attLeft = livingShips(current.attacker).length;
        const defLeft = livingShips(current.defender).length;
        if (name === 'attShoulder' && attLeft < 3) name = 'crossfire';
        if (name === 'defShoulder' && defLeft < 3) name = 'crossfire';
        return name;
    }

    function cutTo(name, durationSec, focusObj) {
        const c = current;
        c.shot = {
            spec: c.shots[name] || c.shots.establish,
            name,
            start: nowSec(),
            dur: Math.max(0.6, durationSec),
            focus: focusObj || null,
            // A cut is a cut. The first 0.18s of a new shot keeps a touch of the
            // previous framing so it lands as an edit rather than a teleport.
            fromPos: camera.position.clone(),
            fromTarget: c.lookAt ? c.lookAt.clone() : new THREE.Vector3()
        };
    }

    function shake(amount, at) {
        const c = current;
        if (!c) return;
        // Distance-weighted: a capital dying in the foreground should rattle the
        // rig, the same explosion two hundred units away should not.
        let w = 1;
        if (at) {
            const d = camera.position.distanceTo(at);
            w = clamp(1 - (d - 20) / 160, 0.12, 1);
        }
        c.shakeAmp = Math.min(2.6, (c.shakeAmp || 0) + amount * w);
    }

    function updateCamera(now, dt) {
        const c = current;
        const s = c.shot;
        const spec = s.spec;
        const u = clamp((now - s.start) / s.dur, 0, 1);
        const e = ease(u);

        const az = (spec.az[0] + (spec.az[1] - spec.az[0]) * e) * D2R;
        const el = (spec.el[0] + (spec.el[1] - spec.el[0]) * e) * D2R;
        const dist = (spec.dist[0] + (spec.dist[1] - spec.dist[0]) * e) * c.frameDist;
        const fov = spec.fov[0] + (spec.fov[1] - spec.fov[0]) * e;

        // Target: the engagement centre, offset along the axis per shot, or a
        // specific hull when the shot is about one.
        const tgt = _b.set(
            c.center.x + spec.target[0] * c.span,
            c.center.y + spec.target[1] * c.span,
            c.center.z + spec.target[2] * c.span
        );
        if (s.focus && s.focus.parent) {
            s.focus.getWorldPosition(_a);
            // 0.85 leaves 15% of the distance from the engagement centre to the
            // subject as a residual offset — invisible on a wide shot and worth
            // many units of frame on a close one. A shot that composes with
            // `bias` has to LOCK on, or the bias lands on top of an unknown
            // offset and the hull walks out of the corner.
            tgt.lerp(_a, spec.lock === undefined ? 0.85 : spec.lock);
        }

        // Handheld: two incommensurate low frequencies, so it never loops.
        const hx = Math.sin(now * 0.37) * 0.010 + Math.sin(now * 0.91) * 0.004;
        const hy = Math.cos(now * 0.29) * 0.008 + Math.sin(now * 1.13) * 0.003;

        const ce = Math.cos(el + hy), se = Math.sin(el + hy);
        _a.set(
            tgt.x + dist * ce * Math.cos(az + hx),
            tgt.y + dist * se,
            tgt.z + dist * ce * Math.sin(az + hx)
        );

        // Cut cushion.
        if (u < 0.16) {
            const k = 1 - ease(u / 0.16);
            _a.lerp(s.fromPos, k * 0.35);
            tgt.lerp(s.fromTarget, k * 0.35);
        }

        // Shake.
        c.shakeAmp = (c.shakeAmp || 0) * Math.exp(-dt * 5.5);
        if (c.shakeAmp > 0.002) {
            const a = c.shakeAmp;
            _a.x += Math.sin(now * 47.3) * a;
            _a.y += Math.sin(now * 39.1 + 1.7) * a;
            _a.z += Math.sin(now * 53.7 + 3.1) * a;
        }

        camera.position.copy(_a);
        camera.lookAt(tgt);
        // Roll is composed AFTER the look-at, in the lens's own frame: it is a
        // dutch angle, not a change of subject.
        if (spec.roll) {
            const roll = (spec.roll[0] + (spec.roll[1] - spec.roll[0]) * e) * D2R;
            camera.rotateZ(roll);
        }
        if (c.shakeAmp > 0.002) camera.rotation.z += Math.sin(now * 31.7) * c.shakeAmp * 0.006;
        c.lookAt = tgt.clone();
        if (Math.abs(camera.fov - fov) > 0.01) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
        }
        // OFF-CENTRE FRAMING. A shot whose subject is always dead centre has no
        // composition in it. Sliding the CAMERA in its own screen plane after
        // the look-at — rather than re-aiming — moves the near subject onto a
        // third while leaving distant backdrop elements where they are, which is
        // what lets the planet fill the space the hull just left.
        if (spec.bias && (spec.bias[0] || spec.bias[1])) {
            const half = Math.tan(fov * 0.5 * D2R) * dist;
            camera.translateX(-spec.bias[0] * half * camera.aspect);
            camera.translateY(-spec.bias[1] * half);
        }
    }

    /**
     * Place the three-point rig for the current lens.
     *
     * A DirectionalLight at P shines from P toward its target, which here is the
     * world origin — so the position IS the direction the light arrives from.
     * Key is 45 degrees off the lens axis and above, fill opposite and low, rim
     * directly behind the subject. Standard three-point, re-aimed every frame.
     */
    const _rf = new THREE.Vector3(), _rr = new THREE.Vector3(), _ru = new THREE.Vector3(), _rd = new THREE.Vector3();
    const _WORLD_UP = new THREE.Vector3(0, 1, 0);
    function placeRig(center, shadowRadius) {
        _rf.subVectors(center, camera.position);
        if (_rf.lengthSq() < 1e-6) _rf.set(0, 0, -1);
        _rf.normalize();
        _rr.crossVectors(_rf, _WORLD_UP);
        if (_rr.lengthSq() < 1e-6) _rr.set(1, 0, 0); else _rr.normalize();
        _ru.crossVectors(_rr, _rf).normalize();

        const place = (light, f, r, u, dist) => {
            _rd.set(0, 0, 0)
                .addScaledVector(_rf, f)
                .addScaledVector(_rr, r)
                .addScaledVector(_ru, u)
                .normalize()
                .multiplyScalar(dist);
            light.position.set(center.x + _rd.x, center.y + _rd.y, center.z + _rd.z);
        };
        // Lateral, not frontal. At -0.55 forward the key sat almost over the
        // lens's shoulder, so every cast shadow fell directly behind the object
        // that cast it and none of them were ever visible — an expensive depth
        // pass buying nothing. Swung round to the side it models form AND the
        // shadows land where the camera can see them.
        place(stage.key, -0.42, -0.80, 0.60, 200);
        place(stage.fill, -0.5, 0.78, -0.16, 200);
        place(stage.rim, 0.88, 0.1, 0.46, 220);

        // Aim the key at what the lens is looking at and shrink its ortho
        // frustum to fit. Fitted per frame the whole map is spent on the shot;
        // fitted to the engagement it would be spread over 200 units and the
        // contact shadows this exists for would be a texel wide.
        if (stage.key.castShadow) {
            stage.keyTarget.position.copy(center);
            stage.keyTarget.updateMatrixWorld();
            const R = clamp(shadowRadius || 40, 12, 90);
            const sc = stage.key.shadow.camera;
            if (Math.abs(sc.right - R) > 0.5) {
                sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R;
                sc.updateProjectionMatrix();
            }
        }
    }

    /**
     * Park the four drive lights on the biggest hulls still flying. They are
     * assigned once per battle and only moved here — a light per capital would
     * be a per-fragment cost on every standard material in the scene.
     */
    /** Ramp the blast lights: a very fast rise, then the fireball's own decay. */
    function updateBlastLights(now) {
        const list = stage.blastLights;
        for (let i = 0; i < list.length; i++) {
            const L = list[i], u = L.userData;
            if (!u.live) continue;
            const t = (now - u.born) / u.dur;
            if (t >= 1) { L.intensity = 0; u.live = 0; continue; }
            L.intensity = u.peak * Math.pow(1 - t, 2.0) * smooth01(t / 0.05);
        }
    }

    const _dl = new THREE.Vector3();
    function updateDriveLights() {
        const lights = stage.driveLights;
        const owners = current.driveOwners || [];
        for (let i = 0; i < lights.length; i++) {
            const ship = owners[i];
            const L = lights[i];
            if (!ship || ship.userData.dead || !ship.parent || !current.driveLightsOn) { L.visible = false; continue; }
            const pl = ship.userData.plumes && ship.userData.plumes[0];
            if (!pl) { L.visible = false; continue; }
            _dl.copy(pl.local).applyMatrix4(ship.matrixWorld);
            const m = ship.matrixWorld.elements;
            L.position.set(_dl.x - m[0] * 1.4, _dl.y - m[1] * 1.4, _dl.z - m[2] * 1.4);
            L.visible = true;
        }
    }

    // ----------------------------------------------------------------------
    // Fleet layout — role formations with real depth
    // ----------------------------------------------------------------------
    // Formation depth is a COMPOSITION budget, not a simulation. Every extra
    // unit between the screen and the capitals is a unit of empty space the
    // camera has to cross, and at the first pass's spacing the two fleets sat
    // 160 units apart with a void down the middle of every shot. Deep enough to
    // stagger and overlap, shallow enough that both lines share a frame.
    // `y` is the band's deck height. Without it every role sits on one plane and
    // the whole engagement reads as a line-up on a shelf: the screen rides high,
    // the battle line sits just under it, the capitals anchor low and the
    // auxiliaries hang back and above. That vertical order is also gameplay
    // signal — the shape of a fleet tells you what is in it.
    const ROLE_BANDS = {
        screen: { u: 5, spread: 10.5, jitter: 7.0, y: 8 },
        line: { u: 15, spread: 12, jitter: 6.5, y: -1 },
        heavy: { u: 27, spread: 15, jitter: 5.0, y: -9 },
        rear: { u: 39, spread: 14, jitter: 4.0, y: 6 }
    };
    const HALF_GAP = 16;
    // How far each fleet advances over the first third. Bounded by the screen
    // band: the two vanguards must still be a hull-length apart when the lines
    // stop closing, or the formations interpenetrate.
    const CLOSE_PUSH = 13;

    /**
     * SEPARATION.
     *
     * A formation laid out by index alone will put a wing-heavy cruiser and a
     * bulk hull on the same slot line, and the hero shot — which compresses
     * depth hardest — then shows one hull's wing terminating INSIDE another's
     * flank with a hard seam and no contact darkening. That is intersecting
     * geometry, and no amount of lighting hides it.
     *
     * Each hull carries the half-extents of its merged bounding box, so this is
     * just box relaxation: while two boxes overlap on all three axes, push them
     * apart along the axis of LEAST penetration, biased toward lateral and
     * vertical (moving along the fleet's own axis would break the wedge). Eight
     * passes is far more than convergence needs at these counts.
     */
    function separateFormation(ships, iterations) {
        const W = [0.55, 1.0, 1.15];   // prefer Z, then Y, then X
        for (let pass = 0; pass < iterations; pass++) {
            let moved = false;
            for (let i = 0; i < ships.length; i++) {
                for (let j = i + 1; j < ships.length; j++) {
                    const a = ships[i], b = ships[j];
                    const ha = a.userData.half, hb = b.userData.half;
                    if (!ha || !hb) continue;
                    const dx = b.position.x - a.position.x;
                    const dy = b.position.y - a.position.y;
                    const dz = b.position.z - a.position.z;
                    // Margins are up from 1.10/1.25/1.15: the hulls now bank by
                    // as much as 23 degrees, and an axis-aligned half-extent
                    // understates a rolled hull's real footprint.
                    const ox = (ha.x + hb.x) * 1.16 - Math.abs(dx);
                    const oy = (ha.y + hb.y) * 1.32 - Math.abs(dy);
                    const oz = (ha.z + hb.z) * 1.22 - Math.abs(dz);
                    if (ox <= 0 || oy <= 0 || oz <= 0) continue;
                    // Least-penetration axis, weighted so the fix lands where it
                    // costs the formation least.
                    const cx = ox * W[2], cy = oy * W[1], cz = oz * W[0];
                    let axis = 2, push = oz, d = dz;
                    if (cy < cz && cy <= cx) { axis = 1; push = oy; d = dy; }
                    else if (cx < cz && cx < cy) { axis = 0; push = ox; d = dx; }
                    const s = (d >= 0 ? 0.5 : -0.5) * (push + 0.05);
                    if (axis === 0) { a.position.x -= s; b.position.x += s; }
                    else if (axis === 1) { a.position.y -= s; b.position.y += s; }
                    else { a.position.z -= s; b.position.z += s; }
                    moved = true;
                }
            }
            if (!moved) break;
        }
        ships.forEach(s => s.userData.basePos.copy(s.position));
    }

    function layoutSide(factionKey, counts, orbital, rnd) {
        const group = new THREE.Group();
        const sign = factionKey === 'defender' ? -1 : 1;   // which side of the axis
        const fwd = -sign;                                  // +X for defenders
        const typeInstances = {};
        const spawnedOf = {};
        const all = [];
        const hulls = [];

        // Total hull budget: a 60-ship stack has to stay a fleet, not a wall.
        const total = sumCounts(counts);
        const capScale = total > HULL_BUDGET / 2 ? Math.max(0.45, (HULL_BUDGET / 2) / total) : 1;

        const present = SHIP_TYPES.filter(t => counts[t - 1] > 0);
        // Group by role so a role's hulls form ONE formation element rather than
        // one column per class — that is the difference between a battle line
        // and a spreadsheet.
        const byRole = {};
        present.forEach(t => {
            const role = SHIP_META[t].role;
            (byRole[role] = byRole[role] || []).push(t);
        });

        Object.keys(ROLE_BANDS).forEach(role => {
            const types = byRole[role];
            if (!types || !types.length) return;
            const band = ROLE_BANDS[role];
            // Every hull in this role, biggest in the middle of the line.
            const slots = [];
            types.forEach(typeId => {
                const n = Math.max(1, Math.min(VISIBLE_CAP, Math.round(counts[typeId - 1] * capScale)));
                spawnedOf[typeId] = n;
                typeInstances[typeId] = [];
                for (let k = 0; k < n; k++) slots.push(typeId);
            });
            slots.sort((a, b) => SHIP_META[b].scale - SHIP_META[a].scale);
            // Re-lay them out from the centre outward: heavy anchors, light wings.
            const ordered = [];
            slots.forEach((t, i) => { if (i % 2 === 0) ordered.push(t); else ordered.unshift(t); });

            const n = ordered.length;
            ordered.forEach((typeId, k) => {
                const template = shipTemplate(typeId, factionKey);
                const ship = instantiate(template, factionKey);
                ship.userData.typeId = typeId;

                const lateral = (k - (n - 1) / 2) * band.spread;
                // Swept-back wedge: the wings trail the centre.
                const sweep = Math.abs(k - (n - 1) / 2) * band.spread * 0.34;
                // Each CLASS gets its own depth lane inside the band, so a
                // wing-heavy hull and a bulk hull can never start life on the
                // same plane and hand the separation pass an impossible problem.
                const lane = (SHIP_TYPES.indexOf(typeId) % 3 - 1) * template.half.x * 1.4;
                const u = band.u + sweep + lane + (rnd() - 0.5) * band.jitter;
                // Tiered in height, three shallow decks — this is what stops the
                // formation reading as a single flat line.
                const tier = band.y + ((k % 3) - 1) * 6.5 + (rnd() - 0.5) * 3.0;

                const x = sign * (HALF_GAP + u);
                // DEPTH. The old jitter was +-1.6 units against a band spread
                // of 10-15, so every hull in a role sat on effectively the same
                // plane and the two fleets read as two flat plates of parallel
                // sprites at the same distance and the same screen size. At
                // three quarters of the band's own spacing the line is genuinely
                // ragged in depth and hulls overlap at different scales, which
                // is the difference between a battle and a diagram.
                ship.position.set(x, tier, lateral + (rnd() - 0.5) * band.spread * 0.75);
                ship.rotation.y = fwd > 0 ? 0 : Math.PI;
                // Yaw the wings inward so the formation converges on the enemy.
                ship.rotation.y += -fwd * (lateral / Math.max(1, band.spread * n)) * 0.5;
                // ATTITUDE, BY ROLE. +-4 degrees of roll and +-1.7 of pitch is
                // not "a little variation", it is level — every hull in the
                // frame sat at the same attitude and the fleet read as a
                // line-up. Escorts and interceptors bank two to three times as
                // hard as a capital, so CLASS reads from attitude the way it
                // does in any real formation: the small stuff is manoeuvring,
                // the big stuff is a gun platform and holds its line.
                const fam = SHIP_META[typeId].family;
                const bank = fam === 'capital' || fam === 'carrier' ? 0.26
                    : fam === 'colony' ? 0.20
                        : fam === 'dart' ? 0.80 : 0.58;
                ship.rotation.z = (rnd() - 0.5) * bank;
                ship.rotation.x = (rnd() - 0.5) * (bank * 0.5 + 0.10);

                ship.userData.basePos = ship.position.clone();
                ship.userData.baseRot = new THREE.Euler().copy(ship.rotation);
                ship.userData.phase = rnd() * Math.PI * 2;
                ship.userData.bobAmp = 0.25 + rnd() * 0.5;
                ship.userData.fwd = fwd;
                group.add(ship);
                typeInstances[typeId].push(ship);
                all.push(ship);
                hulls.push(ship);
            });
        });

        // Orbital defence platforms hold station behind the defender's line.
        const platforms = [];
        if (factionKey === 'defender' && orbital > 0) {
            const n = Math.min(4, orbital);
            const template = platformTemplate(factionKey);
            for (let k = 0; k < n; k++) {
                const p = instantiate(template, factionKey);
                p.userData.typeId = 4; // armed; never counted in the type roster
                p.userData.platform = true;
                p.position.set(
                    // Just behind the rear band. Parked further out they were
                    // the widest thing in the scene, and every shot's framing is
                    // derived from the engagement's bounding box — so four
                    // turrets nobody was looking at pushed the whole camera back.
                    sign * (HALF_GAP + 42 + (rnd() - 0.5) * 10),
                    ((k % 2) ? 7 : -6) + (rnd() - 0.5) * 4,
                    (k - (n - 1) / 2) * 20 + (rnd() - 0.5) * 6
                );
                p.rotation.y = rnd() * Math.PI;
                p.userData.basePos = p.position.clone();
                p.userData.baseRot = new THREE.Euler().copy(p.rotation);
                p.userData.phase = rnd() * Math.PI * 2;
                p.userData.bobAmp = 0.1;
                p.userData.fwd = fwd;
                group.add(p);
                platforms.push(p);
                all.push(p);
            }
        }

        // A HERO HULL, NEAR THE LENS.
        //
        // Every shot in the list sits on the +Z side of the engagement, so a
        // hull pushed hard toward +Z and dropped below the battle line is
        // reliably the nearest and largest thing in frame. Without one there is
        // no scale contrast at all: the fleet is a field of similar-sized
        // shapes at similar distances, which is the other half of why the
        // previous frames read as a diagram. This is the foreground element
        // that gives the picture a near, a middle and a far.
        const heavy = hulls.slice().sort((a, b) =>
            (SHIP_META[b.userData.typeId].scale) - (SHIP_META[a.userData.typeId].scale))[0];
        if (heavy) {
            // Each side takes its own end of the line, so the two heroes are
            // never the same distance from the lens and the composition never
            // comes out symmetrical.
            heavy.position.z = sign * (23 + rnd() * 7);
            heavy.position.y -= 6 + rnd() * 4;
            heavy.position.x = sign * (HALF_GAP + 8 + rnd() * 6);
            heavy.rotation.z = (rnd() - 0.5) * 0.34;
            heavy.rotation.x = (rnd() - 0.5) * 0.22;
            heavy.userData.hero = true;
        }

        // Nothing may interpenetrate anything. Platforms are in the pass too:
        // they hold station behind the rear band and the rear band is where the
        // biggest hulls are.
        separateFormation(all, 8);
        return { group, typeInstances, spawnedOf, all, hulls, platforms, sign };
    }

    function livingShips(side) {
        return side.all.filter(s => !s.userData.dead);
    }
    function livingArmed(side) {
        return side.all.filter(s => !s.userData.dead &&
            (s.userData.platform || SHIP_META[s.userData.typeId].armed) &&
            s.userData.guns && s.userData.guns.length);
    }

    // ----------------------------------------------------------------------
    // Rounds
    // ----------------------------------------------------------------------
    function pickDying(side, counts, initialCounts, orbitalNow, orbitalInit) {
        const doomed = [];
        SHIP_TYPES.forEach(typeId => {
            const list = side.typeInstances[typeId];
            if (!list) return;
            const spawned = side.spawnedOf[typeId] || list.length;
            const init = initialCounts[typeId - 1] || 1;
            const now = counts[typeId - 1] || 0;
            // Proportional: losing 5 of 30 hulls kills one of the six we drew.
            let target = init > 0 ? Math.round(spawned * (now / init)) : 0;
            if (now > 0) target = Math.max(1, target);
            target = clamp(target, 0, spawned);
            const alive = list.filter(s => !s.userData.dead && !s.userData.doomed);
            let toKill = alive.length - target;
            for (let i = alive.length - 1; i >= 0 && toKill > 0; i--) {
                alive[i].userData.doomed = true;
                doomed.push(alive[i]);
                toKill--;
            }
        });
        // Orbital platforms fall with the orbital count.
        if (side.platforms.length && orbitalInit > 0) {
            const target = Math.round(side.platforms.length * (orbitalNow / orbitalInit));
            const alive = side.platforms.filter(p => !p.userData.dead && !p.userData.doomed);
            let toKill = alive.length - clamp(target, 0, side.platforms.length);
            for (let i = alive.length - 1; i >= 0 && toKill > 0; i--) {
                alive[i].userData.doomed = true;
                doomed.push(alive[i]);
                toKill--;
            }
        }
        return doomed;
    }

    function playRound(roundIndex) {
        const c = current;
        const block = c.timeline[roundIndex];
        const initial = c.timeline[0];
        const per = c.perRoundMs;
        const rnd = c.rnd;
        const totalRounds = c.timeline.length - 1;

        if (hud.round) {
            hud.round.textContent = `ROUND ${String(roundIndex).padStart(2, '0')} / ${String(totalRounds).padStart(2, '0')}`;
        }

        const attDying = pickDying(c.attacker, block.attackers, initial.attackers, 0, 0);
        const defDying = pickDying(c.defender, block.defenders, initial.defenders, block.orbital, initial.orbital);

        // One cut per round. When the lens goes close it goes onto a hull that
        // is about to die — the camera should be looking at the round's biggest
        // event, not at whatever happens to be nearest the origin.
        const shotName = shotForRound(roundIndex, totalRounds);
        let focus = null;
        if (shotName === 'capital') {
            const doomed = attDying.concat(defDying).filter(s => !s.userData.platform);
            const pool = (doomed.length ? doomed : livingShips(c.attacker).concat(livingShips(c.defender)))
                .filter(s => !s.userData.platform);
            pool.sort((a, b) => (b.userData.radius || 0) - (a.userData.radius || 0));
            focus = pool[0] || null;
        }
        cutTo(shotName, per / 1000, focus);

        // --- the exchange --------------------------------------------------
        const shooters = { attacker: livingArmed(c.attacker), defender: livingArmed(c.defender) };
        const targets = { attacker: livingShips(c.defender), defender: livingShips(c.attacker) };
        // Rate of fire, not a fixed volley count. The server hands us anything
        // from 5s to 22s for the whole battle, so a constant number of shots
        // means a long round looks like a ceasefire and a short one looks like a
        // strobe. Scale to the time available and to how many guns are left.
        const guns = shooters.attacker.length + shooters.defender.length;
        // 0.92 of the round, not 0.66. A third of every round used to be a
        // ceasefire: the volleys all landed in the first two thirds and the
        // last third was two fleets coasting. Any frame sampled there — and a
        // still is sampled wherever it lands — showed a battle with no battle
        // in it.
        const window0 = per * 0.92;
        // Rate of fire, not a volley count. A still lands wherever it lands, so
        // the sky has to have rounds in it at every instant of a round — at the
        // old rate roughly two tracers were in flight at any moment across a
        // thirty-eight gun engagement, and the frame read as a stand-off.
        const density = clamp(Math.round((window0 / 1000) * Math.min(17, 3.0 + guns * 0.55)), 14, 96);
        for (let v = 0; v < density; v++) {
            const at = rnd() * window0;
            const tmr = setTimeout(() => {
                if (!current) return;
                const fromAtt = rnd() > 0.5;
                const key = fromAtt ? 'attacker' : 'defender';
                const src = shooters[key].filter(s => !s.userData.dead);
                const dst = targets[key].filter(s => !s.userData.dead);
                if (!src.length || !dst.length) return;
                fireShot(src[Math.floor(rnd() * src.length)], dst[Math.floor(rnd() * dst.length)], {});
            }, at);
            timers.push(tmr);
        }

        // --- the killing blows ---------------------------------------------
        const dying = attDying.map(s => ({ ship: s, from: 'defender' }))
            .concat(defDying.map(s => ({ ship: s, from: 'attacker' })));
        // Shuffle deterministically so the two sides interleave.
        for (let i = dying.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            const t = dying[i]; dying[i] = dying[j]; dying[j] = t;
        }
        const killStart = per * 0.22, killSpan = per * 0.64;
        dying.forEach((d, i) => {
            const at = killStart + (dying.length > 1 ? (i / (dying.length - 1)) : 0.5) * killSpan + rnd() * per * 0.05;
            const tmr = setTimeout(() => {
                if (!current || d.ship.userData.dead) return;
                const src = livingArmed(d.from === 'attacker' ? c.attacker : c.defender);
                if (src.length) {
                    const shooter = src[Math.floor(rnd() * src.length)];
                    fireShot(shooter, d.ship, { kill: true, heavy: (d.ship.userData.radius || 0) > 4 });
                } else {
                    destroyShip(d.ship, null);
                }
            }, at);
            timers.push(tmr);
        });

        const hudTimer = setTimeout(() => {
            if (current) updateHud(block, c.initialTotals);
        }, per * 0.86);
        timers.push(hudTimer);
    }

    // The verdict has to be READABLE, not merely emitted. Whatever the round
    // budget resolves to, the banner is on screen for at least this long before
    // anything tears the theater down.
    const BANNER_HOLD_MS = 2200;

    function scheduleRounds() {
        const c = current;
        const totalRounds = c.timeline.length - 1;
        let t = c.introMs;
        for (let r = 1; r <= totalRounds; r++) {
            const roundIndex = r;
            const tmr = setTimeout(() => { if (current) playRound(roundIndex); }, t);
            timers.push(tmr);
            t += c.perRoundMs;
        }
        // Result beat: hold on whoever is still flying. Framing the survivors
        // rather than the empty middle is the whole point of the shot — the
        // banner states the verdict, the picture has to show it.
        c.resultAt = t;
        const resultTimer = setTimeout(() => {
            if (!current) return;
            const survivors = livingShips(c.attacker).concat(livingShips(c.defender))
                .filter(s => !s.userData.platform);
            survivors.sort((a, b) => (b.userData.radius || 0) - (a.userData.radius || 0));
            cutTo('result', c.outroMs / 1000, survivors[0] || null);
            if (hud && hud.round) hud.round.textContent = 'ACTION COMPLETE';
            showBanner();
        }, t);
        timers.push(resultTimer);
        // Do NOT derive the close from `t + outroMs` alone. If anything ahead of
        // the banner runs long the verdict flashes up and is torn down in the
        // same breath — which is how the emotional payoff of the whole feature
        // ended up in none of the delivered frames. The close is gated on the
        // banner having actually been up for a readable beat, re-checked rather
        // than assumed. It still cannot outrun the server: the floor is smaller
        // than the slack the freeze already carries.
        const closeAt = t + c.outroMs;
        // Hard deadline. The retry below must never be able to hold the theater
        // open indefinitely if the banner somehow never fires: the server
        // unfreezes on ITS clock, and a theater that outlives the freeze is a
        // player staring at a cinematic over a live game.
        const deadline = performance.now() + closeAt + BANNER_HOLD_MS + 400;
        const tryClose = () => {
            if (!current) return;
            const held = current.bannerShownAt ? (performance.now() - current.bannerShownAt) : -1;
            if (held >= BANNER_HOLD_MS || performance.now() >= deadline) { finishBattle(false); return; }
            const wait = held < 0 ? 180 : Math.max(60, BANNER_HOLD_MS - held);
            timers.push(setTimeout(tryClose, wait));
        };
        timers.push(setTimeout(tryClose, closeAt));
    }

    // ----------------------------------------------------------------------
    // HUD
    // ----------------------------------------------------------------------
    /**
     * Naval stencil: hull code welded to its count, e.g. "DD5 CA3 BB2". Compact
     * on purpose — this line has to hold nine classes plus orbital defences
     * inside a fixed plate, and a separator wide enough to be pretty is a
     * separator wide enough to clip the last class off the end.
     */
    function rosterText(counts, orbital) {
        const parts = [];
        SHIP_TYPES.forEach(t => {
            const n = counts[t - 1];
            if (n > 0) parts.push(`${SHIP_META[t].code}${n}`);
        });
        if (orbital > 0) parts.push(`OD${orbital}`);
        return parts.length ? parts.join(' ') : 'NO HULLS';
    }

    function buildHud(sectorLabel) {
        const role = (current && current.options && current.options.viewerRole) || 'observer';
        const defTag = role === 'defender' ? 'YOUR FORCE' : 'HOSTILE';
        const attTag = role === 'attacker' ? 'YOUR FORCE' : 'HOSTILE';
        const opener = role === 'observer'
            ? 'LONG-RANGE SENSOR RELAY'
            : 'FLEET ACTION IN PROGRESS';

        const wrap = document.createElement('div');
        wrap.className = 'b3d-hud';
        wrap.innerHTML = `
            <div class="b3d-scrim b3d-scrim-top"></div>
            <div class="b3d-scrim b3d-scrim-bottom"></div>
            <div class="b3d-vignette"></div>
            <div class="b3d-header">
                <div class="b3d-header-plate">
                    <div class="b3d-title">${sectorLabel ? 'Battle for Sector ' + sectorLabel : 'Fleet Engagement'}</div>
                    <div class="b3d-subtitle">${opener}</div>
                </div>
                <div class="b3d-round" id="b3dRound">CLOSING TO RANGE</div>
            </div>
            <div class="b3d-panel b3d-panel-def">
                <div class="b3d-panel-head">
                    <span class="b3d-panel-name">Defenders</span>
                    <span class="b3d-panel-code">${defTag}</span>
                </div>
                <div class="b3d-panel-body">
                    <div class="b3d-strength">
                        <span class="b3d-num" id="b3dDefCount">0</span>
                        <span class="b3d-unit">UNITS</span>
                    </div>
                    <div class="b3d-meter">
                        <div class="b3d-meter-loss" id="b3dDefLoss"></div>
                        <div class="b3d-meter-fill b3d-meter-def" id="b3dDefBar"></div>
                        <div class="b3d-meter-ticks"></div>
                    </div>
                    <div class="b3d-roster" id="b3dDefRoster">—</div>
                </div>
            </div>
            <div class="b3d-panel b3d-panel-att">
                <div class="b3d-panel-head">
                    <span class="b3d-panel-name">Attackers</span>
                    <span class="b3d-panel-code">${attTag}</span>
                </div>
                <div class="b3d-panel-body">
                    <div class="b3d-strength">
                        <span class="b3d-num" id="b3dAttCount">0</span>
                        <span class="b3d-unit">SHIPS</span>
                    </div>
                    <div class="b3d-meter">
                        <div class="b3d-meter-loss" id="b3dAttLoss"></div>
                        <div class="b3d-meter-fill b3d-meter-att" id="b3dAttBar"></div>
                        <div class="b3d-meter-ticks"></div>
                    </div>
                    <div class="b3d-roster" id="b3dAttRoster">—</div>
                </div>
            </div>
            <div class="b3d-key" id="b3dKey">
                <div class="b3d-key-head">Hull Classes</div>
                <div class="b3d-key-rows" id="b3dKeyRows"></div>
            </div>
            <button class="b3d-skip" id="b3dSkip" type="button">SKIP</button>
            <div class="b3d-banner" id="b3dBanner">
                <span class="b3d-banner-text"></span>
                <span class="b3d-banner-sub"></span>
            </div>
        `;
        theaterEl.appendChild(wrap);
        hud = {
            root: wrap,
            round: wrap.querySelector('#b3dRound'),
            attCount: wrap.querySelector('#b3dAttCount'),
            defCount: wrap.querySelector('#b3dDefCount'),
            attBar: wrap.querySelector('#b3dAttBar'),
            defBar: wrap.querySelector('#b3dDefBar'),
            attLoss: wrap.querySelector('#b3dAttLoss'),
            defLoss: wrap.querySelector('#b3dDefLoss'),
            attRoster: wrap.querySelector('#b3dAttRoster'),
            defRoster: wrap.querySelector('#b3dDefRoster'),
            banner: wrap.querySelector('#b3dBanner'),
            bannerText: wrap.querySelector('.b3d-banner-text'),
            bannerSub: wrap.querySelector('.b3d-banner-sub'),
            keyRows: wrap.querySelector('#b3dKeyRows')
        };
        wrap.querySelector('#b3dSkip').addEventListener('click', () => finishBattle(true));
    }

    /**
     * The class key.
     *
     * The roster line reads "DD5 SC3 CA3 BB2 CO1 DN1 IN1 OD3" — eight
     * two-letter codes with nothing anywhere in the theater to decode them.
     * Naval stencil is the right register for the roster and the wrong thing to
     * leave unexplained in a game where the whole point of stopping the world
     * is to show the player what they have and what they are losing. This is
     * the legend, built only for the classes actually present so it never
     * becomes a wall, and staged as its own small instrument in the corner the
     * composition had nothing in.
     */
    function buildKey(initial) {
        if (!hud || !hud.keyRows) return;
        const present = SHIP_TYPES.filter(t =>
            (initial.attackers[t - 1] || 0) > 0 || (initial.defenders[t - 1] || 0) > 0);
        const rows = present.map(t =>
            `<span class="b3d-key-row"><b>${SHIP_META[t].code}</b>${SHIP_META[t].name}</span>`);
        if ((initial.orbital || 0) > 0) rows.push('<span class="b3d-key-row"><b>OD</b>Orbital Defence</span>');
        hud.keyRows.innerHTML = rows.join('');
        if (!rows.length) hud.keyRows.parentNode.style.display = 'none';
    }

    function updateHud(block, initialTotals) {
        if (!hud) return;
        const att = sumCounts(block.attackers);
        const def = sumCounts(block.defenders) + (block.orbital || 0);
        if (hud.attCount) hud.attCount.textContent = att;
        if (hud.defCount) hud.defCount.textContent = def;
        const ap = clamp((att / initialTotals.att) * 100, 0, 100);
        const dp = clamp((def / initialTotals.def) * 100, 0, 100);
        if (hud.attBar) hud.attBar.style.width = ap + '%';
        if (hud.defBar) hud.defBar.style.width = dp + '%';
        // The loss ghost trails the fill, so the eye reads the delta as damage
        // rather than as an unexplained shrink.
        if (hud.attLoss) setTimeout(() => { if (hud && hud.attLoss) hud.attLoss.style.width = ap + '%'; }, 520);
        if (hud.defLoss) setTimeout(() => { if (hud && hud.defLoss) hud.defLoss.style.width = dp + '%'; }, 520);
        if (hud.attRoster) hud.attRoster.textContent = rosterText(block.attackers, 0);
        if (hud.defRoster) hud.defRoster.textContent = rosterText(block.defenders, block.orbital || 0);
    }

    function showBanner() {
        const opts = current.options || {};
        const last = current.timeline[current.timeline.length - 1];
        const attLeft = sumCounts(last.attackers);
        const defLeft = sumCounts(last.defenders) + (last.orbital || 0);
        let text, tone;
        // Combatants get a personal verdict; observers get the neutral (but still
        // authoritative) outcome. Server result is the source of truth.
        if (opts.viewerWon === true) {
            text = 'VICTORY'; tone = 'win';
        } else if (opts.viewerWon === false) {
            text = 'DEFEAT'; tone = 'loss';
        } else {
            const result = opts.battleResult;
            if (result === 'att') text = 'Attackers Prevail';
            else if (result === 'def') text = 'Defense Holds';
            else {
                text = (attLeft > 0 && defLeft === 0) ? 'Attackers Prevail'
                    : (defLeft > 0 && attLeft === 0) ? 'Defense Holds'
                        : (attLeft >= defLeft) ? 'Attackers Prevail' : 'Defense Holds';
            }
            tone = 'neutral';
        }
        if (hud.bannerText) hud.bannerText.textContent = text;
        // The stencilled sub-line. It is what turns the banner from a word
        // floating in a box into a framed instrument that states a RESULT: who
        // holds the sector and what it cost. The counts come from the server's
        // own final block, so the plate never disagrees with the panels beside
        // it.
        if (hud.bannerSub) {
            const label = opts.sectorLabel ? 'SECTOR ' + opts.sectorLabel : 'ENGAGEMENT';
            const role = opts.viewerRole;
            const mine = role === 'defender' ? defLeft : attLeft;
            let sub;
            if (opts.viewerWon === true) sub = `${label} SECURED — ${mine} ${mine === 1 ? 'HULL' : 'HULLS'} SURVIVING`;
            else if (opts.viewerWon === false) sub = `${label} LOST — ${mine} ${mine === 1 ? 'HULL' : 'HULLS'} RECOVERED`;
            else sub = `${label} — ATT ${attLeft} · DEF ${defLeft}`;
            hud.bannerSub.textContent = sub;
        }
        if (hud.banner) hud.banner.classList.add('show', 'b3d-banner-' + tone);
        current.bannerShownAt = performance.now();
        // THE WIN READS AS SHIPS, NOT AS SCRAP. Free-flying debris is the wrong
        // subject for the one frame that says who holds the sector — it was
        // twenty black shards occupying the right third of the victory picture
        // and out-contrasting the survivor. The HULKS stay: they are narrative,
        // they are lit, and the push-in puts them behind the flagship rather
        // than beside it.
        if (stage && stage.chunks) clearChunks(stage.chunks);
        if (window.MediaManager?.playSfx) window.MediaManager.playSfx('shipDestroyed');
    }

    // ----------------------------------------------------------------------
    // Renderer / composer
    // ----------------------------------------------------------------------
    /**
     * UNSHARP MASK, CLAMPED TO THE LOCAL NEIGHBOURHOOD.
     *
     * This replaces FXAA, and the swap is the single biggest change to the
     * picture in this file. FXAA is a BLUR: it finds an edge and smears across
     * it, and every panel seam, rivet row and plate boundary in the procedural
     * atlas is exactly the kind of one-pixel feature it treats as aliasing.
     * Measured on the previous build, a modelled hull edge at 1080p ramped over
     * three to four pixels and the deck plating on a mid-distance destroyer had
     * no readable seams at all — a full PBR set generated and then thrown away
     * in the last pass of the chain.
     *
     * Geometric aliasing is now handled properly, by a MULTISAMPLED composer
     * target (see ensureComposer) which resolves edges without touching the
     * interior of a surface. That leaves this pass free to do the opposite job:
     * put the high-frequency energy back. It is a 5-tap unsharp mask whose
     * result is clamped to the min/max of the taps (plus a small overshoot
     * allowance), which is what stops it ringing into black haloes around the
     * bright cores — the usual failure of naive sharpening over a dark frame.
     */
    const SharpenShader = {
        name: 'BattleSharpen',
        uniforms: {
            tDiffuse: { value: null },
            texel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
            amount: { value: 0.55 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform vec2 texel;
            uniform float amount;
            varying vec2 vUv;
            void main() {
                vec3 c = texture2D(tDiffuse, vUv).rgb;
                vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb;
                vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
                vec3 e = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb;
                vec3 w = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
                vec3 lo = min(min(min(n, s), min(e, w)), c);
                vec3 hi = max(max(max(n, s), max(e, w)), c);
                vec3 sharp = c + (c - (n + s + e + w) * 0.25) * amount;
                gl_FragColor = vec4(clamp(sharp, lo - 0.055, hi + 0.075), 1.0);
            }`
    };

    function ensureRenderer() {
        if (renderer) return true;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
        } catch (e) {
            console.warn('Battle3D: WebGL renderer failed', e);
            renderer = null;
            return false;
        }
        // 1.4, not 2. The post chain's cost is purely a function of the drawing
        // buffer, and the machines most likely to struggle with it are exactly
        // the ones with a 2x panel in front of a weak integrated GPU — where an
        // uncapped ratio quadruples the bill for detail nobody can resolve in a
        // moving cinematic.
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
        renderer.setClearColor(0x02030a, 1);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.04;
        // One extra depth pass, and it is what gives the hulls weight: contact
        // shadows between overlapping ships, superstructure onto the deck below
        // it. Soft-filtered because a 1024 map fitted to a shot is coarse and a
        // hard edge would advertise its own resolution.
        renderer.shadowMap.enabled = true;
        // PCF, not PCFSoft. The soft variant costs thirteen depth comparisons
        // per lit fragment against four, on every hull surface in the frame,
        // and at a 768-texel map fitted to one shot the extra taps buy a
        // slightly kinder penumbra on a shadow that is already only there to
        // give contact between overlapping hulls.
        renderer.shadowMap.type = THREE.PCFShadowMap;
        // The shadow pass re-draws every hull in the engagement into a depth
        // target, and it is the second most expensive thing in the frame after
        // the main pass. Nothing in this scene moves fast enough for a shadow
        // that updates on alternate frames to be visible — the hulls bob at
        // under a unit a second — so it runs at half rate and the frame budget
        // gets the other half back for the multisampled main pass.
        renderer.shadowMap.autoUpdate = false;
        if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
            renderer.outputColorSpace = THREE.SRGBColorSpace;
        }
        clockOrigin = performance.now();
        lastFrameSec = 0;
        return true;
    }

    const _buf = new THREE.Vector2();

    function ensureComposer() {
        // Diagnostic escape hatch, tri-state:
        //   undefined  automatic — the governor decides
        //   true       force the direct path (measure the post chain's cost)
        //   false      force post on (capture what a healthy machine sees)
        // The explicit `false` matters: without it a capture harness that plays
        // several battles in one page photographs whatever the governor last
        // decided, and the pictures stop being comparable to each other.
        const override = window.__battle3dNoPost;
        if (override === true || (override !== false && !postAllowed)) {
            if (composer) { composer.passes.forEach(pass => pass.dispose?.()); composer.dispose(); composer = null; bloomPass = null; sharpenPass = null; }
            return;
        }
        if (composer) { sizePasses(); return; }
        try {
            // MULTISAMPLED COMPOSER TARGET.
            //
            // `antialias:true` on the renderer does nothing once a composer is in
            // the chain — the scene is drawn into an offscreen target and the
            // renderer's own multisampled default framebuffer is never used. The
            // previous build therefore rendered every hull edge with no antialias
            // at all and then ran FXAA over the result, which is a blur standing
            // in for coverage. Asking the composer's target for real MSAA samples
            // resolves edges from actual sub-pixel coverage and leaves the
            // interior of every surface — the plating, the seams, the rivets —
            // completely untouched.
            const rt = new THREE.WebGLRenderTarget(1, 1, {
                type: THREE.HalfFloatType,
                samples: msaaSamples()
            });
            composer = new EffectComposer(renderer, rt);
            // sizePasses supplies physical pixels, so never apply device scaling twice.
            composer.setPixelRatio(1);
            composer.addPass(new RenderPass(scene, camera));
            // Half-resolution mip chain: bloom is the one pass whose cost scales
            // with pixels and it is a blur — full res buys nothing you can see
            // and costs roughly four times as much.
            // strength/radius/threshold. Held low deliberately: the self-lit
            // parts of this scene are written well above 1.0, so a generous
            // bloom does not glow, it floods — the first pass turned every
            // lance into a searchlight that erased the fleet behind it. The
            // threshold sits above 1 so only genuinely over-bright things (fire,
            // engines, muzzles) bloom and lit hull plating never does.
            // Threshold up from 1.25 and strength down from 0.46: at the old
            // pair the whole aft third of a close shot was one low-frequency
            // orange smear with visible banding, because everything even
            // slightly over-bright bloomed rather than only the true cores.
            bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 288), 0.32, 0.42, 1.6);
            composer.addPass(bloomPass);
            composer.addPass(new OutputPass());
            sharpenPass = new ShaderPass(SharpenShader);
            composer.addPass(sharpenPass);
            sizePasses();
        } catch (e) {
            console.warn('Battle3D: post-processing unavailable, rendering direct', e);
            composer = null; bloomPass = null; sharpenPass = null;
        }
    }

    /**
     * MSAA sample count. 4 is the number that matters — it takes a modelled hull
     * edge from a 3-4 pixel ramp to a 1-2 pixel one — but it is a real cost on a
     * software rasteriser, so it steps down rather than off if the machine has
     * already told us it is struggling.
     */
    function msaaSamples() {
        if (window.__battle3dSamples !== undefined) return window.__battle3dSamples | 0;
        if (!renderer || !renderer.capabilities || !renderer.capabilities.isWebGL2) return 0;
        return heavyAllowed ? 2 : 0;
    }

    /**
     * The composer uses a pixel ratio of one. Pass physical drawing-buffer
     * dimensions once; applying DPR again wastes GPU work and misaligns FXAA.
     */
    function sizePasses() {
        if (!composer) return;
        renderer.getDrawingBufferSize(_buf);
        composer.setSize(_buf.x, _buf.y);
        // A THIRD of the drawing buffer, not a half. Bloom is a blur: its cost
        // is the only one in the chain that scales with pixels, and at 1080p the
        // half-res chain measured as roughly half the whole frame. Nothing in
        // the result survives being blurred five times, so the resolution buys
        // nothing you can see and costs latency you can feel.
        // A QUARTER of the drawing buffer, not a third. Bloom is five stacked
        // separable blurs and its cost is pure area; nothing in a five-times-
        // blurred image survives the extra resolution, and the pixels bought
        // back here are what pay for the multisampled main pass.
        if (bloomPass) bloomPass.setSize(Math.max(1, Math.round(_buf.x / 4)), Math.max(1, Math.round(_buf.y / 4)));
        if (sharpenPass) sharpenPass.material.uniforms.texel.value.set(1 / _buf.x, 1 / _buf.y);
    }

    function setupScene() {
        if (scene) return;
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.5, 2000);
        camera.position.set(0, 40, 140);
        const s = buildStage();
        scene.add(s.root);
        // Capture the sky into a cube map so the metal hulls carry real
        // reflections. Done before any ship exists so nothing reflects itself.
        try {
            const rt = new THREE.WebGLCubeRenderTarget(128);
            if (rt.texture) rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
            const cam = new THREE.CubeCamera(1, 2000, rt);
            scene.add(cam);
            cam.update(renderer, scene);
            scene.remove(cam);
            scene.environment = rt.texture;
        } catch (e) {
            console.warn('Battle3D: environment map unavailable', e);
        }
    }

    // ----------------------------------------------------------------------
    // Frame
    // ----------------------------------------------------------------------
    function animate() {
        animHandle = null;
        if (!current) return;
        animHandle = requestAnimationFrame(animate);
        if (document.hidden) {
            lastFrameSec = nowSec();
            return;
        }
        const now = nowSec();
        // Clamped BOTH ways: a tab that was hidden for a minute must not
        // teleport every particle, and a repeated timestamp must not stall the
        // integration.
        const rawDt = Math.max(now - lastFrameSec, 0);
        const dt = Math.min(rawDt, 0.06);
        lastFrameSec = now;
        governFrame(rawDt, now);
        const c = current;
        const elapsed = now - c.startedAt;

        // Two forces closing. The gap shuts over the first third and then holds
        // — a fleet that keeps sliding ends up interpenetrating the enemy line.
        const close = ease(clamp(elapsed / (c.durationSec * 0.34), 0, 1));
        const push = close * CLOSE_PUSH;
        c.attacker.group.position.x = -push;
        c.defender.group.position.x = push;

        // Hulls: bob, sway, recoil.
        for (let side = 0; side < 2; side++) {
            const list = (side ? c.defender : c.attacker).all;
            for (let i = 0; i < list.length; i++) {
                const ship = list[i];
                const ud = ship.userData;
                if (ud.dead) {
                    const h = ud.hulk;
                    if (h) {
                        ship.rotation.x += h.wx * dt;
                        ship.rotation.y += h.wy * dt;
                        ship.rotation.z += h.wz * dt;
                        ship.position.x += h.vx * dt;
                        ship.position.y += h.vy * dt;
                        ship.position.z += h.vz * dt;
                    }
                    continue;
                }
                const p = ud.phase;
                ud.recoil = (ud.recoil || 0) * Math.exp(-dt * 7);
                ship.position.set(
                    ud.basePos.x + ud.fwd * -ud.recoil * 0.9,
                    ud.basePos.y + Math.sin(now * 0.85 + p) * ud.bobAmp,
                    ud.basePos.z + Math.sin(now * 0.53 + p * 1.7) * ud.bobAmp * 0.8
                );
                ship.rotation.z = ud.baseRot.z + Math.sin(now * 0.62 + p) * 0.035;
                ship.rotation.x = ud.baseRot.x + Math.sin(now * 0.44 + p * 1.3) * 0.02;
            }
        }

        // Backdrop world: a slow turn, and its weather deck turning slower still.
        if (c.planet) {
            c.planet.rotation.y += dt * (c.planet.userData.spin || 0.012);
            if (c.planet.userData.update) c.planet.userData.update(dt);
        }
        if (c.backdrop && c.backdrop.userData.update) c.backdrop.userData.update(dt);
        // Motes drift with the camera so there is always near-field parallax.
        stage.motes.position.copy(camera.position).multiplyScalar(0.12);

        updateCamera(now, dt);
        // The plumes and the drive lights are built from world matrices, and the
        // hulls just moved — resolve the two fleet groups now rather than
        // reading last frame's transforms.
        c.attacker.group.updateMatrixWorld(true);
        c.defender.group.updateMatrixWorld(true);
        // Shadow budget follows the lens: a close shot spends all 1024 texels on
        // one hull, a wide shot spreads them over the line it can actually see.
        // The shadow frustum is fitted around what the LENS is looking at. Tied
        // to the engagement centre it covered the middle of no-man's-land while
        // the hero hull sat forty units outside it, casting nothing.
        placeRig(c.lookAt || c.center,
            c.shot && c.shot.spec ? c.shot.spec.dist[1] * c.frameDist * 0.7 : 45);
        updateDriveLights();
        updateBlastLights(now);
        updatePlumes(stage.plumes, [c.attacker, c.defender], now);
        updateVfx(now);
        updateParticles(stage.sparks, dt);
        updateParticles(stage.embers, dt);
        updateChunks(stage.chunks, dt);

        render(dt);
    }

    /**
     * Quality governor.
     *
     * Measured, not guessed: on software WebGL at 1080p the scene itself renders
     * in ~100 ms and the post chain adds ~500 ms on top, so post IS the cost and
     * it is the only thing worth switching off. Two rules make it safe:
     *
     *  - The decision is applied at the START OF THE NEXT BATTLE, never mid-shot.
     *    A governor that flips a pass off halfway through pops the whole image,
     *    and the player is watching this one thing.
     *  - The sample RESETS per battle. The first version accumulated across the
     *    session, so the third battle a player ever saw silently lost its bloom
     *    on a machine that was rendering it perfectly well — and it quietly
     *    invalidated every screenshot taken after the fortieth frame.
     *
     * The bar is deliberately low (about six frames a second). The world is
     * frozen while this plays and the animation is clock-driven, so a slow
     * machine gets a choppy cinematic rather than a broken game; only genuinely
     * unwatchable is worth downgrading for.
     */
    const POST_BUDGET_MS = 160;
    const POST_SAMPLE = 24;
    let postAllowed = true;

    /**
     * DYNAMIC RESOLUTION.
     *
     * The two governors below decide what to switch OFF, and both apply at the
     * start of the NEXT battle — which is right for anything that changes how
     * the scene looks, and useless for the battle a player is actually watching.
     * On a weak integrated GPU that meant the FIRST battle of a session, the one
     * that sets every expectation, ran as a two-frame-a-second slideshow and the
     * fix only arrived for a second battle the player might never see.
     *
     * Resolution is the exception, because it is the one lever that costs
     * nothing but sharpness: every pass in the chain is priced per pixel, the
     * canvas is stretched to the viewport by CSS regardless of its buffer size,
     * and a slightly soft cinematic at a watchable frame rate beats a crisp one
     * at three frames a second. So this one steps DOWN mid-battle — once, inside
     * the establishing shot, before anything the player is reading is on screen
     * — and the decision then persists for the session so no later battle pops.
     */
    // 500 ms, deliberately far above the other two thresholds. Resolution is
    // the only lever here that costs the PICTURE rather than the lighting, so it
    // is spent last and only where sharpness has stopped being the problem: at
    // two frames a second nobody is looking at a panel line. Merely-bad machines
    // are handled by the two tiers below, next battle, at full resolution.
    const RES_BUDGET_MS = 500;
    const RES_STEP = 0.82;              // 67% of the pixels
    let resScale = 1;
    /**
     * ...and the escape hatch, because a governed-down frame is not the frame
     * anyone is judging. `window.__battle3dLockRes = true` pins full resolution.
     * Headless automation is pinned automatically: the capture harness and the
     * store-page shots run through a software rasteriser where EVERY frame is
     * over budget, so without this the pictures the art is judged from are
     * always the degraded ones — which is exactly what happened.
     */
    function resLocked() {
        if (window.__battle3dLockRes !== undefined) return !!window.__battle3dLockRes;
        return !!(navigator && navigator.webdriver);
    }
    // Shadow map + the four drive lights. Cheaper than the post chain but not
    // free — a depth pass over the fleet plus four more per-fragment lights on
    // every standard material — so they are the SECOND thing to go, and they go
    // together because they are the same kind of cost: lighting fidelity, not
    // legibility. Nothing here is load-bearing for reading the battle.
    let heavyAllowed = true;

    function median(a) { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }

    function applyResolution() {
        if (!renderer) return;
        // updateStyle:false on purpose — the canvas is pinned to the viewport by
        // CSS, so the buffer size is free to differ from the display size and
        // the browser does the upscale. Everything downstream (composer targets,
        // bloom mip base, FXAA's texel uniform) is derived from the drawing
        // buffer, so sizePasses() picks the change up without knowing about it.
        renderer.setSize(Math.max(320, Math.round(window.innerWidth * resScale)),
            Math.max(180, Math.round(window.innerHeight * resScale)), false);
        sizePasses();
    }

    let _shadowTick = 0;
    function render(dt) {
        renderer.shadowMap.needsUpdate = renderer.shadowMap.enabled && ((_shadowTick++ & 1) === 0);
        if (composer && composer.passes.length) composer.render(dt);
        else renderer.render(scene, camera);
    }

    /**
     * Sample the frame and spend the budget.
     *
     * The sample is the FRAME-TO-FRAME interval, not the time spent inside
     * render(). That distinction is the whole reason this exists: WebGL command
     * submission returns long before the GPU has done the work, so the old
     * measurement — a stopwatch around composer.render() — read 38 ms on a
     * machine that was visibly delivering 1.3 frames a second, and every
     * governor keyed off it had therefore never fired in its life.
     *
     * Three tiers, cheapest first:
     *   resolution   NOW, once, inside the opening third. Costs sharpness only.
     *   post chain   next battle. Costs the bloom.
     *   shadows      next battle. Costs contact shadows and the drive lights.
     */
    function governFrame(rawDt, now) {
        if (!current || frameSamples.length >= POST_SAMPLE) return;
        // The first third of a second is shader compilation, not frame cost.
        if (now - current.startedAt < 0.35 || rawDt <= 0) return;
        frameSamples.push(rawDt * 1000);
        if (resScale === 1 && frameSamples.length === 4 && !resLocked() &&
            (now - current.startedAt) < current.durationSec * 0.3 &&
            median(frameSamples) > RES_BUDGET_MS) {
            resScale = RES_STEP;
            applyResolution();
            frameSamples.length = 0;   // re-measure at the new resolution
            console.info('Battle3D: dropped to', Math.round(RES_STEP * 100) + '% resolution');
            return;
        }
        if (frameSamples.length === POST_SAMPLE) {
            const med = median(frameSamples);
            if (composer && med > POST_BUDGET_MS) {
                postAllowed = false;
                console.info('Battle3D: post-processing will be dropped next battle, median frame',
                    Math.round(med), 'ms');
            }
            if (med > POST_BUDGET_MS * 1.75) {
                heavyAllowed = false;
                console.info('Battle3D: shadows and drive lights will be dropped next battle, median frame',
                    Math.round(med), 'ms');
            }
        }
    }

    // ----------------------------------------------------------------------
    // Backdrop world
    // ----------------------------------------------------------------------
    /**
     * The class atmosphere colour, pulled halfway to a pale sky. Returns
     * undefined when the generator does not publish a style for this class, in
     * which case the shell keeps its own default.
     */
    const SKY_TINT = [176, 214, 236];
    function atmoTint(planetType) {
        const styles = PlanetTex.PLANET_STYLES;
        const style = styles && styles[planetType];
        if (!style || !style.atmo) return undefined;
        return style.atmo.map((v, i) => Math.round(v * 0.5 + SKY_TINT[i] * 0.5));
    }

    function buildPlanet(planetType, sectorId, frameDist) {
        if (!(planetType >= 5 && planetType <= 10)) return null;
        // The backdrop is deliberately FAR and only moderately large. The old
        // one was scaled off the framing distance and parked close, so it filled
        // a third of the frame at roughly one texel per four pixels — an
        // out-of-focus green wall that was the worst-looking thing on screen.
        // Held to ~20 degrees it is crisp, it reads as a world, and it leaves
        // the frame to the fleets.
        const dist = frameDist * 2.6;
        const radius = dist * 0.18;
        const group = new THREE.Group();
        const pos = new THREE.Vector3(-0.74, -0.26, -0.62).normalize().multiplyScalar(dist);
        const light = stage.sunDir.clone().multiplyScalar(620).sub(pos).normalize();

        let world = null;
        if (typeof PlanetTex.createPlanetObject === 'function') {
            world = PlanetTex.createPlanetObject(planetType, sectorId, {
                radius,
                spin: 0.012,
                light: [light.x, light.y, light.z],
                // A backdrop, not the subject: pulled down so the fleets stay the
                // brightest thing in frame, and the exposure trimmed so the lit
                // limb does not fight the explosions for the eye.
                tint: [0.86, 0.88, 0.92],
                exposure: 0.9,
                rimStrength: 0.16,
                // Atmosphere shell. `strength`/`power` are what the generator
                // actually reads — the old call passed `rimStrength`, which the
                // shell ignores, so the halo ran at its default width all the
                // way round the limb including the night side. A wider falloff
                // and a lower gain make it air rather than an outline; the
                // generator already kills it at the terminator.
                strength: 0.23,
                power: 2.6,
                // Air, not a coloured outline of the ground. Sampling the class
                // hue put a constant-width GREEN band round a green world, which
                // reads as a sticker; halfway to a pale sky keeps the class
                // identity legible and makes the limb read as scattering. On the
                // map the generator's own default still applies — this is the
                // battle backdrop only, where hue is mood rather than signal.
                color: atmoTint(planetType)
            });
        } else if (typeof PlanetTex.getPlanetTexture === 'function') {
            // Legacy single-texture path, kept working so a generator API shift
            // degrades to a duller backdrop instead of an exception.
            const mat = new THREE.MeshStandardMaterial({ metalness: 0.04, roughness: 1, envMapIntensity: 0.2 });
            mat.map = PlanetTex.getPlanetTexture(planetType, sectorId);
            world = new THREE.Group();
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
            world.add(mesh);
            world.userData.spin = 0.012;
        }
        if (!world) return null;
        group.add(world);
        group.position.copy(pos);
        group.userData.spin = world.userData.spin || 0.012;
        group.userData.update = world.userData.update;
        group.userData.materials = [];
        world.traverse(o => { if (o.isMesh && o.material) group.userData.materials.push(o.material); });
        return group;
    }

    // ----------------------------------------------------------------------
    // THE REST OF THE FRAME
    //
    // Measured on the previous build: 84.9% of the establishing frame sat below
    // L=12, the median luminance was 4, and rows 810-1080 — the entire bottom
    // quarter, 1920x270 pixels — were 99.9% below L=12. Literally nothing
    // there. Worse, the shot that opens the sequence had NO backdrop element at
    // all: the planet only enters frame on the shots whose azimuth happens to
    // point at it, and the round-one telephoto does not.
    //
    // Three elements fix that, and all three are staged rather than scattered:
    //
    //   A ROCK DRIFT beneath and around the engagement. One InstancedMesh, so
    //     it is one draw call, and it is the element that guarantees the bottom
    //     of the frame carries something from EVERY azimuth in the shot list —
    //     which no single hero object can do.
    //   A DEAD MOON on the opposite side of the sky from the defended world, so
    //     that whichever way the lens is pointed there is a body in the
    //     background.
    //   A DERELICT: a capital hull that lost a battle here a long time ago,
    //     mid-distance and low, tumbling. It gives the middle ground a
    //     silhouette with recognisable scale, and it says something about the
    //     place.
    // ----------------------------------------------------------------------
    function rockGeometry() {
        if (tex.rockGeo) return tex.rockGeo;
        // Detail 2, not 1. At detail 1 an 80-triangle solid landing 40px across
        // in the lower third of the frame shows one flat value per facet and
        // reads as a paper model; the deformation below needs enough vertices
        // to be a shape rather than a bevel.
        const g = new THREE.IcosahedronGeometry(1, 2);
        const p = g.attributes.position;
        const rnd = rng(0x9c0b1);
        const v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).normalize();
            const k = 0.62 + 0.55 * nfbmFine(v.x * 1.7, v.y * 1.7, v.z * 1.7);
            p.setXYZ(i, v.x * k, v.y * k, v.z * k);
        }
        g.computeVertexNormals();
        tex.rockGeo = g;
        return g;
    }

    function buildRockDrift(frameDist, seed) {
        const rnd = rng(seed);
        const N = 96;
        // Dark and matte. This is scenery for the empty part of the frame, not
        // a second subject: the first pass had boulders bigger on screen than
        // the capitals and the fleet disappeared into them.
        //
        // But matte is not the same as BLANK. Untextured, these were flat brown
        // polyhedra with one solid value per facet — and the cratered greyscale
        // the dead moon is already generating is exactly the surface a rock
        // wants, as both albedo and (off the same height field) relief. It
        // costs nothing: the map exists whether or not the rocks use it.
        // envMapIntensity up from 0.7 so the field takes the nebula's colour
        // instead of sitting as a neutral brown in front of it.
        const mat = new THREE.MeshStandardMaterial({
            // The tint compensates for the map: the greyscale averages about
            // 0.45, so 0x33312d unmapped and 0x78736a mapped land on the same
            // mean value with the structure added rather than substituted.
            color: 0x78736a, map: moonTexture(), normalMap: moonNormalTexture(),
            normalScale: new THREE.Vector2(1.1, 1.1),
            roughness: 0.94, metalness: 0.03, envMapIntensity: 1.1
        });
        const mesh = new THREE.InstancedMesh(rockGeometry(), mat, N);
        mesh.frustumCulled = false;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(),
            s = new THREE.Vector3(), p = new THREE.Vector3();
        for (let i = 0; i < N; i++) {
            // Radius biased outward, so the drift reads as a field the
            // engagement is sitting inside rather than as a ring around it.
            const r = frameDist * (0.9 + Math.pow(rnd(), 0.5) * 2.2);
            const th = rnd() * Math.PI * 2;
            // Flattened and hung BELOW the battle line: the bottom of the frame
            // is where the hole was.
            const y = -frameDist * (0.22 + rnd() * 0.55) + (rnd() - 0.5) * frameDist * 0.20;
            p.set(Math.cos(th) * r, y, Math.sin(th) * r);
            e.set(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283);
            q.setFromEuler(e);
            // Roughly constant angular size — small. A rock in this field
            // subtends about a third of a degree; a handful subtend one.
            const k = r * (0.0035 + rnd() * 0.0075) * (rnd() < 0.07 ? 2.6 : 1);
            s.setScalar(k);
            m.compose(p, q, s);
            mesh.setMatrixAt(i, m);
        }
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }

    /**
     * A dead moon. Deliberately NOT the shared planet generator: that builds a
     * full 2048-square albedo/normal/ORM/cloud set per (class, seed) and this
     * body is 60 pixels across in the frame it appears in. One 256-square
     * cratered greyscale is indistinguishable at that size and costs about a
     * thousandth as much, which matters because everything in startBattle is
     * synchronous and the player is staring at a fade while it runs.
     */
    function moonTexture() {
        if (tex.moon) return tex.moon;
        const W = 256, H = 128;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(W, H);
        const px = img.data;
        const rnd = rng(0x6d00);
        const craters = [];
        for (let i = 0; i < 60; i++) {
            craters.push({
                u: rnd(), v: 0.08 + rnd() * 0.84,
                r: 0.008 + Math.pow(rnd(), 2.4) * 0.075
            });
        }
        // The height field is kept, not thrown away: the drift rocks want the
        // same cratered surface as a normal map and deriving it here costs one
        // extra array. Reading it back off the canvas later would be a GPU->CPU
        // round trip for a map we already have in hand.
        const hgt = new Float32Array(W * H);
        for (let y = 0; y < H; y++) {
            const v = (y + 0.5) / H;
            for (let x = 0; x < W; x++) {
                const u = (x + 0.5) / W;
                const lon = u * Math.PI * 2, lat = (0.5 - v) * Math.PI;
                const dx = Math.cos(lat) * Math.cos(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.sin(lon);
                let g = 96 + 46 * nfbmFine(dx * 2.6, dy * 2.6, dz * 2.6)
                    + 26 * nfbmFine(dx * 9.0, dy * 9.0, dz * 9.0);
                for (let i = 0; i < craters.length; i++) {
                    const cr = craters[i];
                    let du = Math.abs(u - cr.u); if (du > 0.5) du = 1 - du;
                    du *= Math.max(0.18, Math.cos(lat));
                    const d = Math.hypot(du, v - cr.v) / cr.r;
                    if (d < 1.25) {
                        // Dark floor, bright rim: the read that says "crater".
                        g += d < 0.86 ? -34 * (1 - d) : 30 * (1 - Math.abs(d - 1.0) / 0.25);
                    }
                }
                hgt[y * W + x] = g;
                const o = (y * W + x) * 4;
                px[o] = clamp(g * 1.02, 0, 255);
                px[o + 1] = clamp(g * 0.98, 0, 255);
                px[o + 2] = clamp(g * 0.92, 0, 255);
                px[o + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.moon = new THREE.CanvasTexture(c);
        if (THREE.SRGBColorSpace) tex.moon.colorSpace = THREE.SRGBColorSpace;

        // --- normal map, straight off the same height field.
        const nc = document.createElement('canvas');
        nc.width = W; nc.height = H;
        const nctx = nc.getContext('2d');
        const nimg = nctx.createImageData(W, H);
        const np = nimg.data;
        const NSTR = 0.024;
        for (let y = 0; y < H; y++) {
            const ym = Math.max(0, y - 1) * W, yp = Math.min(H - 1, y + 1) * W, yc = y * W;
            for (let x = 0; x < W; x++) {
                const xm = (x - 1 + W) % W, xp = (x + 1) % W;
                let nx = -(hgt[yc + xp] - hgt[yc + xm]) * NSTR;
                let ny = (hgt[yp + x] - hgt[ym + x]) * NSTR;
                const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
                const o = (yc + x) * 4;
                np[o] = (nx * inv * 0.5 + 0.5) * 255;
                np[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
                np[o + 2] = (inv * 0.5 + 0.5) * 255;
                np[o + 3] = 255;
            }
        }
        nctx.putImageData(nimg, 0, 0);
        tex.moonNormal = new THREE.CanvasTexture(nc);
        return tex.moon;
    }

    /** The moon's height field as a tangent-space normal map. */
    function moonNormalTexture() {
        if (!tex.moonNormal) moonTexture();
        return tex.moonNormal;
    }

    /** A dead capital hull. Same geometry as a live one, wearing the wreck kit. */
    function buildDerelict(factionKey, typeId) {
        const mats = stageMaterials();
        const t = shipTemplate(typeId, factionKey);
        const g = new THREE.Group();
        t.group.children.forEach(mesh => {
            // No windows, no engine glow, no running lights: it has been cold
            // for a very long time.
            if (mesh.userData.bucket === B_LIGHT || mesh.userData.bucket === B_GLOW) return;
            g.add(new THREE.Mesh(mesh.geometry,
                mesh.userData.bucket === B_DECAL ? mats.hulkDecal : mats.hulk));
        });
        return g;
    }

    function buildBackdrop(frameDist, sectorId) {
        const rnd = rng((Number(sectorId) || 3) * 7919 + 104729);
        const root = new THREE.Group();
        const mats = [];

        root.add(buildRockDrift(frameDist, (Number(sectorId) || 3) * 2654435761));

        // The dead moon, on the opposite side of the sky from the defended
        // world, so whichever way the shot list points there is a body behind
        // the fleets rather than a void.
        {
            const dist = frameDist * 2.15;
            const pos = new THREE.Vector3(0.34, 0.26, -0.90).normalize().multiplyScalar(dist);
            const mmat = new THREE.MeshStandardMaterial({
                map: moonTexture(), color: 0x8e8a82, roughness: 0.98, metalness: 0.0,
                envMapIntensity: 0.5
            });
            const moon = new THREE.Mesh(new THREE.SphereGeometry(dist * 0.062, 32, 20), mmat);
            moon.position.copy(pos);
            // Sized off the framing distance, so unlike the ship hulls this
            // geometry is genuinely per-battle and has to be freed with it.
            moon.userData.ownGeometry = true;
            mats.push(mmat);
            root.add(moon);
        }

        // The derelict. Big, low, mid-distance, tumbling very slowly. Built
        // from a hull class the fleets already use, so it costs a clone rather
        // than a template build.
        const wreck = buildDerelict('defender', 7);
        // Far enough back that the whole hull is inside the frame — a derelict
        // cropped by the edge reads as an unidentifiable dark mass, which is
        // the failure it was supposed to fix.
        const wscale = frameDist * 0.016;
        wreck.scale.setScalar(wscale);
        wreck.position.set(frameDist * 0.52, -frameDist * 0.30, -frameDist * 1.35);
        wreck.rotation.set(0.30, 2.32, -0.48);
        root.add(wreck);
        root.userData.wreck = wreck;
        root.userData.materials = mats;
        root.userData.spin = 0.0;
        root.userData.update = dt => {
            wreck.rotation.y += dt * 0.012;
            wreck.rotation.z += dt * 0.005;
        };
        return root;
    }

    // ----------------------------------------------------------------------
    // Lifecycle
    // ----------------------------------------------------------------------
    function ensureTheaterEl() {
        if (theaterEl) return;
        injectStyles();
        theaterEl = document.createElement('div');
        theaterEl.id = 'battleTheater';
        document.body.appendChild(theaterEl);
    }

    // Startup trace. Off unless `window.__battle3dTrace` is set, and worth
    // keeping: it is how a single 1024^2 getImageData was caught costing six and
    // a half seconds of a battle's build on a software rasteriser.
    let _T0 = 0;
    function _mark(label) {
        if (!window.__battle3dTrace) return;
        const n = performance.now();
        console.info('Battle3D-T', label, Math.round(n - _T0));
        _T0 = n;
    }

    function startBattle(entry) {
        running = true;
        _T0 = performance.now();
        ensureTheaterEl();
        if (!renderer) {
            if (!ensureRenderer()) throw new Error('no WebGL renderer');
            theaterEl.appendChild(renderer.domElement);
        }
        const w = window.innerWidth, h = window.innerHeight;
        applyResolution();

        // Raise the curtain BEFORE building the scene, not after. The first
        // battle of a session builds the nebula, fourteen merged hulls and a
        // cube environment map, and all of that is synchronous — so a fade that
        // was started afterwards began several hundred milliseconds late and the
        // galaxy map showed through the opening shot. Starting it first means
        // the player watches a black screen fade in while the work happens,
        // which is what the opening of a cinematic looks like anyway.
        document.body.classList.add('battle-theater-active');
        if (window.Galaxy3D?.setPaused) window.Galaxy3D.setPaused(true);
        void theaterEl.offsetHeight;      // resolve initial styles so the transition runs
        theaterEl.classList.add('on');

        _mark('renderer');
        setupScene();
        _mark('scene');
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        frameSamples = [];       // the governor judges THIS battle, not the session
        ensureComposer();
        // Applied HERE, at the start of a battle, never mid-shot: toggling the
        // shadow map recompiles every standard material in the scene, which is
        // a stall, and a lighting model that changes halfway through a cinematic
        // reads as a bug.
        const heavy = window.__battle3dNoHeavy === true ? false
            : (window.__battle3dNoHeavy === false ? true : heavyAllowed);
        renderer.shadowMap.enabled = heavy;
        stage.key.castShadow = heavy;

        const timeline = entry.timeline;
        const initial = timeline[0];
        const opts = entry.options || {};
        // One seed for the whole battle: same payload, same picture, every time.
        const seed = (Number(opts.sectorId) || 7) * 2654435761 + sumCounts(initial.attackers) * 97 + sumCounts(initial.defenders) * 31;
        const rnd = rng(seed);

        const defender = layoutSide('defender', initial.defenders, initial.orbital, rnd);
        const attacker = layoutSide('attacker', initial.attackers, 0, rnd);
        scene.add(defender.group);
        scene.add(attacker.group);
        _mark('layout');

        // Framing: fit the whole engagement, then let the shot list work in
        // fractions of that distance.
        const box = new THREE.Box3();
        box.expandByObject(defender.group);
        box.expandByObject(attacker.group);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        // Half the battle line's length: the natural unit for "shift the look-at
        // a quarter of the way toward the enemy".
        const span = Math.max(size.x, size.z, 40) * 0.5;
        const radius = Math.max(20, size.length() / 2);
        const frameDist = radius / Math.tan((44 * D2R) / 2);

        // --- timing: fit inside the budget the server handed us, always -----
        //
        // The outro is a FRACTION of the budget, not a constant. Held at 2.6s of
        // a 26s playback the verdict was 10% of the cinematic and the last
        // round ran to within a breath of the teardown; a quarter of the budget
        // buys a real beat — the closing kill, a push-in on the survivor, the
        // banner, and a hold on it — and every branch below still sums to
        // exactly `budget`, because the world unfreezes on the server's clock.
        const totalRounds = Math.max(1, timeline.length - 1);
        const budget = Math.max(4200, entry.durationMs || (BASE_INTRO_MS + BASE_OUTRO_MS + totalRounds * 1600));
        let introMs = BASE_INTRO_MS;
        let outroMs = clamp(budget * 0.38, BASE_OUTRO_MS, 9900);
        let perRoundMs = (budget - introMs - outroMs) / totalRounds;
        if (perRoundMs < MIN_ROUND_MS) {
            // Steal from the bookends before shortening the fight itself; if even
            // that is not enough, everything scales down together. The sum is
            // budget in every branch — the world unfreezes on the server's clock.
            const need = MIN_ROUND_MS * totalRounds;
            if (budget - need > 1200) {
                const k = (budget - need) / (introMs + outroMs);
                introMs = introMs * k;
                outroMs = outroMs * k;
                perRoundMs = MIN_ROUND_MS;
            } else {
                introMs = budget * 0.14;
                outroMs = budget * 0.26;
                perRoundMs = (budget - introMs - outroMs) / totalRounds;
            }
        }

        current = {
            timeline, attacker, defender, rnd,
            perRoundMs, introMs, outroMs,
            startedAt: nowSec(),
            durationSec: budget / 1000,
            center, span, frameDist,
            shots: shotList(),
            hulks: [],
            shakeAmp: 0,
            lookAt: center.clone(),
            initialTotals: {
                att: Math.max(1, sumCounts(initial.attackers)),
                def: Math.max(1, sumCounts(initial.defenders) + (initial.orbital || 0))
            },
            options: opts
        };
        cutTo('establish', introMs / 1000, null);

        // Four drive lights, on the four biggest hulls in play. Their whole job
        // is to put the missing mid-tones on the hull ahead of a bell that would
        // otherwise be a bright core against unlit metal, so they follow SIZE,
        // not importance: a dreadnought's cluster lights half its own aft deck.
        const heavies = [];
        [attacker, defender].forEach(side => {
            const ranked = side.hulls.slice().sort((a, b) => (b.userData.blast || 0) - (a.userData.blast || 0));
            heavies.push(ranked[0], ranked[1]);
        });
        current.driveOwners = heavies.filter(Boolean).slice(0, 4);
        current.driveLightsOn = heavy;
        current.driveOwners.forEach((ship, i) => {
            const L = stage.driveLights[i];
            L.color.set(FACTION[ship.userData.faction].engine);
            L.intensity = 3.4 * (ship.userData.blast || 1);
            L.distance = 12 + 9 * (ship.userData.blast || 1);
        });
        for (let i = current.driveOwners.length; i < stage.driveLights.length; i++) {
            stage.driveLights[i].visible = false;
            stage.driveLights[i].intensity = 0;
        }

        const planet = buildPlanet(Number(opts.planetType) || 0, Number(opts.sectorId) || 0, frameDist);
        if (planet) { scene.add(planet); current.planet = planet; }
        const backdrop = buildBackdrop(frameDist, opts.sectorId);
        scene.add(backdrop);
        current.backdrop = backdrop;
        _mark('planet');

        buildHud(opts.sectorLabel);
        buildKey(initial);
        updateHud(initial, current.initialTotals);
        if (hud.attLoss) hud.attLoss.style.width = '100%';
        if (hud.defLoss) hud.defLoss.style.width = '100%';

        if (!animHandle) animate();
        _mark('first-frame');
        scheduleRounds();
    }

    function clearTimers() {
        timers.forEach(t => clearTimeout(t));
        timers = [];
    }

    /**
     * Tear down the BATTLE, not the stage. Ship geometry, materials, textures
     * and pools are shared and cached on purpose — two battles can resolve in
     * one turn and the second must not pay for the first's furniture again.
     */
    function teardownBattle() {
        if (animHandle !== null) cancelAnimationFrame(animHandle);
        animHandle = null;
        if (!scene || !current) return;
        flushVfx();
        if (stage) {
            stage.driveLights.forEach(L => { L.visible = false; L.intensity = 0; });
            stage.blastLights.forEach(L => { L.intensity = 0; L.userData.live = 0; });
            stage.plumes.geom.setDrawRange(0, 0);
        }
        [current.attacker, current.defender].forEach(side => {
            if (side && side.group) scene.remove(side.group);
        });
        if (current.planet) {
            scene.remove(current.planet);
            // The generator's textures and sphere are flagged shared and defend
            // themselves; the per-battle shader materials are ours to free.
            (current.planet.userData.materials || []).forEach(m => m && m.dispose && m.dispose());
        }
        if (current.backdrop) {
            scene.remove(current.backdrop);
            (current.backdrop.userData.materials || []).forEach(m => m && m.dispose && m.dispose());
            current.backdrop.traverse(o => {
                // The rock drift owns its own InstancedMesh and material; the
                // shared rock geometry and the wreck's hull geometry do not
                // belong to it and must survive into the next battle.
                if (o.isInstancedMesh) { o.dispose(); o.material.dispose(); }
                else if (o.userData.ownGeometry && o.geometry) o.geometry.dispose();
            });
        }
    }

    function finishBattle(skipped) {
        if (!current) return;
        clearTimers();
        const opts = current.options || {};

        if (theaterEl) theaterEl.classList.remove('on');
        document.body.classList.remove('battle-theater-active');

        const sectorId = opts.sectorId;
        const onComplete = opts.onComplete;

        const teardown = () => {
            if (hud && hud.root && hud.root.parentNode) hud.root.parentNode.removeChild(hud.root);
            hud = null;
            teardownBattle();
            current = null;
            running = false;

            if (window.Galaxy3D?.setPaused) window.Galaxy3D.setPaused(false);
            if (sectorId && window.GalaxyMap?.clearBattleSector) window.GalaxyMap.clearBattleSector(sectorId);
            if (window.GameScreen?.restoreTitle) window.GameScreen.restoreTitle();
            if (typeof onComplete === 'function') onComplete();

            // Draining the queue has to go through the guarded entry point. The
            // theater hides the entire game UI while it is up, so a throw on the
            // SECOND battle of a turn would leave `battle-theater-active` on the
            // body with nothing on screen and every control dead.
            if (battleQueue.length > 0) {
                const next = battleQueue.shift();
                setTimeout(() => {
                    try {
                        startBattle(next);
                    } catch (err) {
                        console.error('Battle3D failed on a queued battle, falling back to 2D:', err);
                        cleanupBattleVisualization();
                        if (window.BattleSystem) {
                            window.BattleSystem.createBattleVisualization(
                                'battle:' + next.timeline.flatMap(b =>
                                    b.attackers.concat(b.defenders, [b.ground, b.orbital])).join(':'),
                                next.options);
                        }
                    }
                }, 200);
            }
        };

        setTimeout(teardown, skipped ? 60 : 520);
    }

    // ----------------------------------------------------------------------
    // Public API (mirrors BattleSystem)
    // ----------------------------------------------------------------------
    function createBattleVisualization(message, options) {
        options = options || {};
        const timeline = parseTimeline(message);
        if (!timeline) return;

        const entry = {
            timeline,
            durationMs: Number(options.durationMs) || 0,
            options
        };

        if (running) {
            battleQueue.push(entry);
            return;
        }
        try {
            startBattle(entry);
        } catch (err) {
            console.error('Battle3D failed, falling back to 2D:', err);
            cleanupBattleVisualization();
            if (window.BattleSystem) window.BattleSystem.createBattleVisualization(message, options);
        }
    }

    function cleanupBattleVisualization() {
        clearTimers();
        battleQueue.length = 0;
        if (theaterEl) theaterEl.classList.remove('on');
        document.body.classList.remove('battle-theater-active');
        if (hud && hud.root && hud.root.parentNode) hud.root.parentNode.removeChild(hud.root);
        hud = null;
        teardownBattle();
        current = null;
        running = false;
        if (window.Galaxy3D?.setPaused) window.Galaxy3D.setPaused(false);
    }

    function onResize() {
        if (!renderer || !camera || !theaterEl) return;
        const w = window.innerWidth, h = window.innerHeight;
        applyResolution();
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => { lastFrameSec = nowSec(); });

    // NOTE: we deliberately do NOT tear the battle down on tab-hide. The server
    // keeps the whole game frozen for the full playback window, so destroying the
    // theater when a player briefly alt-tabs would desync them (frozen clock, no
    // battle). The scheduled timers finish the battle on their own regardless.

    // ----------------------------------------------------------------------
    // Styles — beveled instrument panels, not web chrome.
    //
    // Every readout is a plate that looks screwed to the console: chunky steel
    // gradient, hard black outer edge, a bright top bevel and a dark bottom one,
    // corner rivets painted with radial gradients (no extra DOM), and the value
    // itself sunk into an inset well. Borders are neutral steel — the faction
    // colour appears only where it is FUNCTIONAL: the strength meter itself.
    // ----------------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('battle3d-styles')) return;
        const style = document.createElement('style');
        style.id = 'battle3d-styles';
        style.textContent = `
        #battleTheater {
            position: fixed; inset: 0; z-index: 5000;
            background: #02030a;
            opacity: 0; pointer-events: none; transition: opacity 0.45s ease;
        }
        #battleTheater.on { opacity: 1; pointer-events: auto; }
        #battleTheater canvas { display:block; width:100%!important; height:100%!important; }

        /* Fade ALL game chrome while the theater owns the screen. */
        body.battle-theater-active > *:not(#battleTheater):not(script):not(style) {
            opacity: 0 !important; pointer-events: none !important;
            transition: opacity 0.5s ease;
        }

        .b3d-hud {
            position:absolute; inset:0; z-index:2; pointer-events:none;
            font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;
            --b3d-steel-hi:#5c626d; --b3d-steel:#3a3f48; --b3d-steel-lo:#1d2027;
            --b3d-edge:#07080b; --b3d-ink:#e8ecf4; --b3d-dim:#8f98a8;
            --b3d-brass:#f0c674;
        }
        /* Scrims and vignette are BACKING for the panels, not a grade on the
           picture. At 0.72 top / 0.62 bottom plus a 0.55 vignette they were
           removing most of what the renderer had drawn — the bottom quarter of
           the delivered frame measured 99.9% below L=12, and a good part of
           that was this. Enough to seat the plates, and no more. */
        .b3d-scrim { position:absolute; left:0; right:0; height:19%; }
        .b3d-scrim-top { top:0; background:linear-gradient(to bottom, rgba(0,0,0,0.58), rgba(0,0,0,0)); }
        .b3d-scrim-bottom { bottom:0; height:12%; background:linear-gradient(to top, rgba(0,0,0,0.30), rgba(0,0,0,0)); }
        .b3d-vignette {
            position:absolute; inset:0;
            background:radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) 54%, rgba(0,0,0,0.34) 100%);
        }

        /* THE HEADER DOES NOT MOVE, AND THE TWO INSTRUMENTS DO NOT TOUCH.
           The plate and the status chip used to share one centred inline flow,
           so the pair was centred as a GROUP: the plate slid 9px sideways the
           moment the chip's text changed from "ROUND 01 / 03" to "ACTION
           COMPLETE", and sat 81px left of true centre the whole time.

           Absolute positioning fixed the drift and left a COLLISION: the chip
           sat at a magic 50% + 224px against a plate whose half-width was
           content-driven (243.5px for "Battle for Sector 19", and it grows with
           the label), so the chip's border cut twenty pixels into the plate's
           face and swallowed its right edge and top-right rivet.

           Both elements now have FIXED geometry — a content string can no
           longer change either one's width, so the gap between them is a
           constant. The header is a flex row purely so it takes the plate's
           height: that is what lets the chip centre on the plate vertically
           with top:50% instead of a hand-measured offset that goes stale the
           moment the title's line-height changes. */
        .b3d-header {
            position:absolute; top:2.4%; left:0; right:0;
            display:flex; justify-content:center; align-items:flex-start;
        }
        .b3d-header-plate {
            flex:0 0 560px; box-sizing:border-box;
            text-align:center; white-space:nowrap;
            padding:9px 34px 8px;
            background:linear-gradient(180deg,#525863 0%,#383d46 42%,#23262d 100%);
            border:2px solid var(--b3d-edge);
            box-shadow:
                inset 0 2px 0 rgba(255,255,255,0.20),
                inset 0 -3px 0 rgba(0,0,0,0.55),
                inset 2px 0 0 rgba(255,255,255,0.06),
                0 6px 20px rgba(0,0,0,0.65);
            background-image:
                radial-gradient(circle at 9px 9px, rgba(255,255,255,0.32) 0 1.6px, rgba(0,0,0,0.5) 2px 3px, transparent 3.2px),
                radial-gradient(circle at calc(100% - 9px) 9px, rgba(255,255,255,0.32) 0 1.6px, rgba(0,0,0,0.5) 2px 3px, transparent 3.2px),
                radial-gradient(circle at 9px calc(100% - 9px), rgba(255,255,255,0.32) 0 1.6px, rgba(0,0,0,0.5) 2px 3px, transparent 3.2px),
                radial-gradient(circle at calc(100% - 9px) calc(100% - 9px), rgba(255,255,255,0.32) 0 1.6px, rgba(0,0,0,0.5) 2px 3px, transparent 3.2px),
                linear-gradient(180deg,#525863 0%,#383d46 42%,#23262d 100%);
        }
        .b3d-title {
            font-family:'Russo One','Segoe UI',sans-serif; font-size:23px; letter-spacing:4px;
            text-transform:uppercase; color:var(--b3d-brass);
            text-shadow:0 2px 0 rgba(0,0,0,0.9), 0 0 18px rgba(240,180,90,0.28);
        }
        .b3d-subtitle {
            margin-top:3px; font-family:'Share Tech Mono',ui-monospace,monospace;
            font-size:10px; letter-spacing:3.4px; color:#9aa4b4; text-transform:uppercase;
        }
        /* The status chip: an installed instrument, not a flat rect with a
           1px hairline. Same recipe as every other plate — 2px edge, bevel,
           four corner rivets. FIXED width, not min-width: the longest string it
           will ever hold has to fit inside 184px rather than push past it, or
           the gap to the plate is a function of the text again. top:50% is
           against the header, whose height is the plate's, so the two
           instruments are centred on each other for free. */
        .b3d-round {
            position:absolute; left:calc(50% + 294px); top:50%;
            transform:translateY(-50%);
            width:184px; box-sizing:border-box; text-align:center;
            padding:6px 10px 5px;
            font-family:'Share Tech Mono',ui-monospace,monospace; font-size:12px;
            letter-spacing:3px; color:#d6dfec; text-transform:uppercase;
            background:linear-gradient(180deg,#474c56 0%,#2f333b 45%,#1b1e24 100%);
            border:2px solid var(--b3d-edge);
            text-shadow:0 1px 0 rgba(0,0,0,0.9);
            box-shadow:
                inset 0 2px 0 rgba(255,255,255,0.16),
                inset 0 -3px 0 rgba(0,0,0,0.6),
                0 5px 16px rgba(0,0,0,0.6);
            background-image:
                radial-gradient(circle at 7px 7px, rgba(255,255,255,0.30) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.7px, transparent 2.9px),
                radial-gradient(circle at calc(100% - 7px) 7px, rgba(255,255,255,0.30) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.7px, transparent 2.9px),
                radial-gradient(circle at 7px calc(100% - 7px), rgba(255,255,255,0.30) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.7px, transparent 2.9px),
                radial-gradient(circle at calc(100% - 7px) calc(100% - 7px), rgba(255,255,255,0.30) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.7px, transparent 2.9px),
                linear-gradient(180deg,#474c56 0%,#2f333b 45%,#1b1e24 100%);
        }

        .b3d-panel {
            position:absolute; top:3.2%; width:262px;
            background:linear-gradient(180deg,#4d525c 0%,#343941 40%,#20232a 100%);
            border:2px solid var(--b3d-edge);
            box-shadow:
                inset 0 2px 0 rgba(255,255,255,0.18),
                inset 0 -3px 0 rgba(0,0,0,0.6),
                0 8px 26px rgba(0,0,0,0.6);
            background-image:
                radial-gradient(circle at 8px 8px, rgba(255,255,255,0.3) 0 1.5px, rgba(0,0,0,0.5) 1.9px 2.9px, transparent 3.1px),
                radial-gradient(circle at calc(100% - 8px) 8px, rgba(255,255,255,0.3) 0 1.5px, rgba(0,0,0,0.5) 1.9px 2.9px, transparent 3.1px),
                radial-gradient(circle at 8px calc(100% - 8px), rgba(255,255,255,0.3) 0 1.5px, rgba(0,0,0,0.5) 1.9px 2.9px, transparent 3.1px),
                radial-gradient(circle at calc(100% - 8px) calc(100% - 8px), rgba(255,255,255,0.3) 0 1.5px, rgba(0,0,0,0.5) 1.9px 2.9px, transparent 3.1px),
                linear-gradient(180deg,#4d525c 0%,#343941 40%,#20232a 100%);
        }
        .b3d-panel-def { left:2.4%; }
        .b3d-panel-att { right:2.4%; }
        .b3d-panel-head {
            display:flex; align-items:baseline; justify-content:space-between; gap:10px;
            padding:7px 14px 6px; border-bottom:2px solid var(--b3d-edge);
            background:linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.30));
        }
        .b3d-panel-name {
            font-family:'Russo One','Segoe UI',sans-serif; font-size:14px; letter-spacing:2.4px;
            text-transform:uppercase; color:#eef2f8; text-shadow:0 2px 0 rgba(0,0,0,0.85);
        }
        .b3d-panel-code {
            font-family:'Share Tech Mono',ui-monospace,monospace; font-size:9px;
            letter-spacing:1.6px; color:#7f8a9b;
        }
        .b3d-panel-body { padding:9px 14px 11px; }
        .b3d-strength { display:flex; align-items:baseline; gap:8px; }
        .b3d-num {
            font-family:'Rajdhani','Segoe UI',sans-serif; font-weight:700; font-size:34px;
            line-height:1; color:#fdfefe; font-variant-numeric:tabular-nums;
            text-shadow:0 2px 0 rgba(0,0,0,0.8);
        }
        .b3d-unit {
            font-family:'Share Tech Mono',ui-monospace,monospace; font-size:10px;
            letter-spacing:2.2px; color:#8e98a8;
        }
        .b3d-meter {
            position:relative; height:13px; margin-top:8px; overflow:hidden;
            background:#0a0c11; border:1px solid #14171d;
            box-shadow:inset 0 2px 4px rgba(0,0,0,0.9), inset 0 -1px 0 rgba(255,255,255,0.05);
        }
        .b3d-meter-loss {
            position:absolute; inset:0 auto 0 0; width:100%;
            background:linear-gradient(180deg,#7a2118,#3d1109);
            transition:width 0.7s cubic-bezier(.3,.8,.4,1);
        }
        .b3d-meter-fill {
            position:absolute; inset:0 auto 0 0; width:100%;
            transition:width 0.35s cubic-bezier(.2,.9,.3,1);
        }
        .b3d-meter-att { background:linear-gradient(180deg,#ffc27a,#e0761f 60%,#a24c0c); }
        .b3d-meter-def { background:linear-gradient(180deg,#bfe4ff,#4d9fe0 60%,#1d5c96); }
        .b3d-meter-ticks {
            position:absolute; inset:0; pointer-events:none;
            background:repeating-linear-gradient(90deg, rgba(0,0,0,0) 0 9px, rgba(0,0,0,0.62) 9px 11px);
            box-shadow:inset 0 1px 0 rgba(255,255,255,0.16);
        }
        .b3d-roster {
            margin-top:8px; padding:4px 7px;
            font-family:'Share Tech Mono',ui-monospace,monospace; font-size:10px;
            letter-spacing:0.4px; color:#9fb0c4;
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
            background:rgba(6,8,12,0.72); border:1px solid #23272f;
            box-shadow:inset 0 1px 3px rgba(0,0,0,0.8);
        }

        /* THE CLASS KEY. The roster line is naval stencil and stays that way;
           this is the plate that says what the stencil means. Built only from
           the classes actually in the battle. */
        .b3d-key {
            position:absolute; left:2.4%; bottom:5.5%; padding:7px 12px 9px;
            background:linear-gradient(180deg,#474c56 0%,#2f333b 45%,#1b1e24 100%);
            border:2px solid var(--b3d-edge);
            box-shadow:
                inset 0 2px 0 rgba(255,255,255,0.16),
                inset 0 -3px 0 rgba(0,0,0,0.6),
                0 8px 22px rgba(0,0,0,0.6);
            background-image:
                radial-gradient(circle at 7px 7px, rgba(255,255,255,0.30) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.7px, transparent 2.9px),
                radial-gradient(circle at calc(100% - 7px) 7px, rgba(255,255,255,0.30) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.7px, transparent 2.9px),
                radial-gradient(circle at 7px calc(100% - 7px), rgba(255,255,255,0.30) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.7px, transparent 2.9px),
                radial-gradient(circle at calc(100% - 7px) calc(100% - 7px), rgba(255,255,255,0.30) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.7px, transparent 2.9px),
                linear-gradient(180deg,#474c56 0%,#2f333b 45%,#1b1e24 100%);
        }
        .b3d-key-head {
            font-family:'Russo One','Segoe UI',sans-serif; font-size:10px; letter-spacing:2.6px;
            text-transform:uppercase; color:#cbb489; text-shadow:0 2px 0 rgba(0,0,0,0.85);
            padding-bottom:5px; margin-bottom:5px; border-bottom:2px solid var(--b3d-edge);
        }
        .b3d-key-rows { display:grid; grid-template-columns:1fr 1fr; gap:2px 14px; }
        .b3d-key-row {
            font-family:'Share Tech Mono',ui-monospace,monospace; font-size:9.5px;
            letter-spacing:1.2px; color:#93a1b4; text-transform:uppercase; white-space:nowrap;
        }
        .b3d-key-row b { color:#e2e9f2; font-weight:400; margin-right:7px; }

        .b3d-skip {
            position:absolute; bottom:4.5%; right:2.6%; z-index:4; pointer-events:auto;
            padding:10px 26px; cursor:pointer; border-radius:0;
            font-family:'Russo One','Segoe UI',sans-serif; font-size:12px; letter-spacing:3px;
            text-transform:uppercase; color:#f2d79a;
            background:linear-gradient(180deg,#565c67 0%,#3a3f48 45%,#22252c 100%);
            border:2px solid var(--b3d-edge);
            text-shadow:0 2px 0 rgba(0,0,0,0.85);
            box-shadow:
                inset 0 2px 0 rgba(255,255,255,0.22),
                inset 0 -3px 0 rgba(0,0,0,0.6),
                0 5px 14px rgba(0,0,0,0.6);
            /* The one interactive control in the theater was the least on-brief
               object in it: a soft grey pill next to fully realised beveled
               instruments. Same rivets as every plate, and a real press. */
            background-image:
                radial-gradient(circle at 7px 7px, rgba(255,255,255,0.32) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.8px, transparent 3px),
                radial-gradient(circle at calc(100% - 7px) 7px, rgba(255,255,255,0.32) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.8px, transparent 3px),
                radial-gradient(circle at 7px calc(100% - 7px), rgba(255,255,255,0.32) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.8px, transparent 3px),
                radial-gradient(circle at calc(100% - 7px) calc(100% - 7px), rgba(255,255,255,0.32) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.8px, transparent 3px),
                linear-gradient(180deg,#565c67 0%,#3a3f48 45%,#22252c 100%);
        }
        .b3d-skip:hover {
            color:#ffe9b8;
            background-image:
                radial-gradient(circle at 7px 7px, rgba(255,255,255,0.32) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.8px, transparent 3px),
                radial-gradient(circle at calc(100% - 7px) 7px, rgba(255,255,255,0.32) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.8px, transparent 3px),
                radial-gradient(circle at 7px calc(100% - 7px), rgba(255,255,255,0.32) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.8px, transparent 3px),
                radial-gradient(circle at calc(100% - 7px) calc(100% - 7px), rgba(255,255,255,0.32) 0 1.4px, rgba(0,0,0,0.5) 1.8px 2.8px, transparent 3px),
                linear-gradient(180deg,#646b77 0%,#454b55 45%,#282c34 100%);
        }
        /* Pressed: the bevel inverts — the top edge goes dark and the bottom
           bright — and the whole plate drops a pixel. That is what a physical
           switch does, and it is the only honest way to make a button feel
           like one. */
        .b3d-skip:active {
            transform:translateY(1px);
            box-shadow:
                inset 0 -2px 0 rgba(255,255,255,0.16),
                inset 0 3px 7px rgba(0,0,0,0.78),
                0 1px 4px rgba(0,0,0,0.6);
        }
        .b3d-skip:focus-visible { outline:2px solid #ffc95c; outline-offset:3px; }

        /* THE PAYOFF PLATE.
           This is the beat the whole sequence exists for and it was a tooltip:
           a dark rectangle with a 1px top highlight, markedly less designed
           than the DEFENDERS panel sitting in the same frame, floating in dead
           centre over the surviving fleet at the exact moment the player wants
           to look at them. It is now the header-plate recipe at roughly double
           scale — 2px edge, inset bevel, four corner rivets, deep drop shadow,
           stencilled sub-line — and it is anchored to the UPPER third so the
           survivors keep the two thirds of frame the result shot frames them
           in. */
        .b3d-banner {
            position:absolute; top:15.5%; left:50%; transform:translateX(-50%) scale(0.72);
            padding:16px 58px 14px; opacity:0; text-align:center;
            border:2px solid var(--b3d-edge);
            box-shadow:
                inset 0 3px 0 rgba(255,255,255,0.20),
                inset 0 -4px 0 rgba(0,0,0,0.66),
                inset 3px 0 0 rgba(255,255,255,0.06),
                0 16px 52px rgba(0,0,0,0.8);
            background-image:
                radial-gradient(circle at 13px 13px, rgba(255,255,255,0.34) 0 2.2px, rgba(0,0,0,0.55) 2.7px 4.1px, transparent 4.4px),
                radial-gradient(circle at calc(100% - 13px) 13px, rgba(255,255,255,0.34) 0 2.2px, rgba(0,0,0,0.55) 2.7px 4.1px, transparent 4.4px),
                radial-gradient(circle at 13px calc(100% - 13px), rgba(255,255,255,0.34) 0 2.2px, rgba(0,0,0,0.55) 2.7px 4.1px, transparent 4.4px),
                radial-gradient(circle at calc(100% - 13px) calc(100% - 13px), rgba(255,255,255,0.34) 0 2.2px, rgba(0,0,0,0.55) 2.7px 4.1px, transparent 4.4px),
                linear-gradient(180deg,#4e535e 0%,#2b2f37 44%,#14161b 100%);
            transition:transform 0.34s cubic-bezier(.2,1.35,.4,1), opacity 0.18s ease;
        }
        .b3d-banner.show { opacity:1; transform:translateX(-50%) scale(1); }
        .b3d-banner-text {
            display:block;
            font-family:'Russo One','Segoe UI',sans-serif; font-size:46px; letter-spacing:9px;
            text-transform:uppercase; color:#fff;
            text-shadow:0 3px 0 rgba(0,0,0,0.9), 0 0 30px rgba(255,190,110,0.55);
        }
        .b3d-banner-sub {
            display:block; margin-top:8px; padding-top:8px;
            border-top:2px solid rgba(0,0,0,0.55);
            font-family:'Share Tech Mono',ui-monospace,monospace; font-size:11px;
            letter-spacing:3.4px; color:#a9b4c4; text-transform:uppercase;
            text-shadow:0 1px 0 rgba(0,0,0,0.9);
        }
        .b3d-banner-win .b3d-banner-text { color:#ffe6a8; text-shadow:0 3px 0 rgba(0,0,0,0.9), 0 0 34px rgba(255,205,110,0.8); }
        .b3d-banner-loss .b3d-banner-text { color:#ffb0ac; text-shadow:0 3px 0 rgba(0,0,0,0.9), 0 0 34px rgba(255,80,70,0.7); }
        .b3d-banner-neutral .b3d-banner-text { color:#e9f0fa; text-shadow:0 3px 0 rgba(0,0,0,0.9), 0 0 30px rgba(150,190,255,0.6); }

        /* The chip sits BESIDE the plate only while there is room beside the
           plate. Both are fixed-width, so where the collision starts is
           arithmetic rather than a guess: the chip's right edge is
           50%+478px and the attacker panel's left edge is 97.6%-262px, which
           cross at about 1600. Below that the pair narrows once, and below
           1400 the chip stacks UNDER the plate rather than being squeezed
           until it touches something. */
        @media (max-width: 1600px) {
            .b3d-header-plate { flex-basis:440px; }
            .b3d-round { left:calc(50% + 234px); width:150px; font-size:11px; letter-spacing:2px; }
        }
        @media (max-width: 1400px) {
            .b3d-round { left:50%; top:calc(100% + 8px); transform:translateX(-50%); }
        }
        @media (max-width: 1200px) {
            .b3d-header-plate { flex-basis:380px; padding:8px 22px 7px; }
        }
        @media (max-width: 900px) {
            .b3d-panel { width:190px; }
            .b3d-num { font-size:26px; }
            .b3d-title { font-size:16px; letter-spacing:2px; }
            .b3d-header-plate { flex-basis:300px; }
            .b3d-banner-text { font-size:28px; letter-spacing:4px; }
            .b3d-banner { padding:12px 26px 10px; }
            .b3d-banner-sub { font-size:9px; letter-spacing:2px; }
            .b3d-roster { font-size:9px; }
            .b3d-key-rows { grid-template-columns:1fr; }
        }
        @media (max-width: 620px) {
            .b3d-panel { width:132px; }
            .b3d-panel-code { display:none; }
            .b3d-num { font-size:20px; }
            .b3d-key { display:none; }
        }
        `;
        document.head.appendChild(style);
    }

    window.Battle3D = {
        isAvailable,
        createBattleVisualization,
        cleanupBattleVisualization
    };
})();

/** galaxy3d.js - Three.js main galaxy map view. Full rationale: docs/galaxy3d-design-notes.md#galaxy3d-js-three-js-main-galaxy-map-view */

import * as THREE from './vendor/three.module.min.js';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/addons/postprocessing/RenderPass.js';
import { ShaderPass } from './vendor/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from './vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/addons/postprocessing/OutputPass.js';
import { FXAAShader } from './vendor/addons/shaders/FXAAShader.js';
// The planet generator is shared with the battle theater so the same world looks
// the same in both views. See planet-texture.js for why the shipped jpgs are unusable.
import {
    PLANET_STYLES,
    PLANET_RIG,
    createPlanetObject,
    createStarObject,
    createAsteroidGeometry,
    createAsteroidMaterial,
    ASTEROID_VARIANTS,
    seededRandom
} from './planet-texture.js?v=20260728a';

/**
 * Where planet-texture.js lives, as an absolute URL, for the worker that bakes
 * worlds off the main thread. A blob-URL module worker resolves its own
 * relative imports against the blob, which is nowhere, so it has to be told.
 */
const PLANET_TEXTURE_URL = new URL('./planet-texture.js?v=20260728a', import.meta.url).href;

(function () {
    // The landing page, login, race select and lobby all honour this; the game… Full rationale: docs/galaxy3d-design-notes.md#the-landing-page-login-race-select-and-lobby-all-honour-this
    const motionQuery = typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let reduceMotion = Boolean(motionQuery && motionQuery.matches);
    if (motionQuery) {
        const onChange = event => { reduceMotion = Boolean(event.matches); };
        if (typeof motionQuery.addEventListener === 'function') {
            motionQuery.addEventListener('change', onChange);
        } else if (typeof motionQuery.addListener === 'function') {
            motionQuery.addListener(onChange); // Safari < 14
        }
    }

    const STATUS = {
        UNKNOWN: 0,
        OWNED: 1,
        ENEMY: 2,
        HAZARD: 3,
        BLACKHOLE: 4,
        COLONIZED: 5,
        HOMEWORLD: 6,
        WARPGATE: 7,
        ARTIFACT: 8,
        FLEET: 9
    };

    // Tile tints. These are the gameplay read of the board and they are checked
    // against the map key in the HUD — do not retune one without the other.
    const STATUS_COLORS = {
        [STATUS.UNKNOWN]: 0x2a3040,
        [STATUS.OWNED]: 0x37b24d,
        [STATUS.ENEMY]: 0xe03131,
        // Bronze, not safety-cone orange: the briefed palette is steel and
        // amber/bronze, and the previous 0xd9822b was a high-chroma swatch with
        // no steel in it that also flattened the plate relief underneath.
        [STATUS.HAZARD]: 0x9c6a34,
        [STATUS.BLACKHOLE]: 0x15151c,
        [STATUS.COLONIZED]: 0x2bb5a0,
        [STATUS.HOMEWORLD]: 0xffc04d,
        [STATUS.WARPGATE]: 0x9b59d0,
        [STATUS.ARTIFACT]: 0x3fc6ff,
        [STATUS.FLEET]: 0x3fc1c9
    };

    /** A star sector and an asteroid belt both arrive as STATUS.HAZARD, and they. Full rationale: docs/galaxy3d-design-notes.md#a-star-sector-and-an-asteroid-belt-both-arrive-as-status-haz */
    const HAZARD_TONE = {
        belt: { color: 0x9c6a34, stencil: 'belt' },
        star: { color: 0xbfa070, stencil: 'star' }
    };

    function hazardToneFor(entry) {
        if (entry.status !== STATUS.HAZARD) return null;
        if (entry.type === 3 || entry.type === 4) return 'star';
        return 'belt';
    }

    const HEX_SIZE = 1;
    const HORIZ = HEX_SIZE * 1.5;
    const VERT = HEX_SIZE * Math.sqrt(3);

    /** The scene key, as a direction. ONE definition: the DirectionalLight is. Full rationale: docs/galaxy3d-design-notes.md#the-scene-key-as-a-direction-one-definition-the-directionall */
    const KEY_LIGHT_DIR = { x: 6, y: 12, z: 4 };

    /** The direction the rig looks, as a ratio. The camera never rotates — it. Full rationale: docs/galaxy3d-design-notes.md#the-direction-the-rig-looks-as-a-ratio-the-camera-never-rota */
    const VIEW_DIR = { x: 0, y: -0.92, z: -0.5 };

    /** How high a star's photosphere floats above the plate it belongs to. This. Full rationale: docs/galaxy3d-design-notes.md#how-high-a-star-s-photosphere-floats-above-the-plate-it-belo */
    const STAR_BODY_Y = 0.50;

    // ONE definition of the hexagon, used by the plate, the selection marker, the
    // hover marker and the black-hole well. The whole class of bug where a marker
    // sits at a different radius or a different rotation from the tile it marks
    // exists because those were four separate constructions.
    const TILE_R = HEX_SIZE * 0.94;          // circumradius of the plate
    // CHUNKY. The brief asks for beveled riveted metal and the previous slab was
    // 0.1 units thick with a 0.032 chamfer — at map zoom that is a hairline, and
    // a hairline cannot carry a value step. The plate is now a 0.17-thick slab
    // with a 0.06 chamfer, which is a facet several pixels deep at every framing
    // the wheel allows and therefore something the eye can actually read as an
    // edge.
    const TILE_TOP = 0.07;                   // y of the plate's top face
    const TILE_BOTTOM = -0.10;
    const BEVEL_INSET = 0.882;               // where the chamfer starts, as a fraction of R
    const BEVEL_DROP = 0.060;                // how far the chamfer falls
    /** Unit hexagon corners, flat-top: vertices on +/-X, flat edges facing +/-Z. Full rationale: docs/galaxy3d-design-notes.md#unit-hexagon-corners-flat-top-vertices-on-x-flat-edges-facin */
    const HEX_CORNERS = [];
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        HEX_CORNERS.push([Math.cos(a), -Math.sin(a)]);
    }

    // Bloom threshold, in linear light. Anything authored below this does not. Full rationale: docs/galaxy3d-design-notes.md#bloom-threshold-in-linear-light-anything-authored-below-this
    const BLOOM_THRESHOLD = 1.05;
    // Bloom runs at half the canvas resolution. At 0.3 the glare was rendered
    // over so few pixels that a star's veil arrived as a soft mush ring rather
    // than as streaked light; 0.5 is the point where the first mip still
    // resolves the photosphere's shape. It is still a blur, and it is still the
    // most expensive pass here, so the quality governor below can drop it whole.
    const BLOOM_SCALE = 0.5;

    const state = {
        ready: false,
        width: 14,
        height: 8,
        container: null,
        renderer: null,
        // The composer is an UPGRADE, not a fixture: null until this machine has
        // been measured affording it, and null again if it stops. `post` is the
        // state machine that owns that decision — see governPost().
        composer: null,
        post: undefined,
        bloomPass: null,
        fxaaPass: null,
        software: false,
        lastFrameAt: 0,
        scene: null,
        camera: null,
        raycaster: null,
        pointer: new THREE.Vector2(),
        sectors: new Map(),        // id -> { group, tile, content, badge, status, type, fleetSize }
        // Sectors whose contents still have to be generated. Drained under a time
        // budget by the frame loop — see drainContentQueue().
        contentQueue: [],
        textures: new Map(),
        materials: new Map(),
        sharedGeo: {},
        selectionRing: null,
        hoverRing: null,
        selectedSector: null,
        pendingFocusSector: null,
        battlePulses: new Map(),
        fleetMoves: [],
        starSectors: [],           // world positions of visible stars, for planet lighting
        backdrop: null,
        center: new THREE.Vector3(),
        camTarget: new THREE.Vector3(),
        camOffset: new THREE.Vector3(),
        // HUD panels overlap the viewport (build pad bottom-left, minimap bottom-right,
        // status bars up top). These insets describe the clear band inside the canvas so
        // the focused sector lands somewhere the player can actually see it.
        safeInset: { left: 0, right: 0, top: 0, bottom: 0 },
        frameOffset: new THREE.Vector3(),
        drag: null,
        clock: new THREE.Clock(),
        animHandle: null,
        // --- startup staging & pacing -----------------------------------
        // Which shared bake the boot schedule has got to. See BOOT_STEPS.
        bootStep: 0,
        // Measured cost of one content item ON THIS MACHINE, in ms. Seeded low
        // and corrected upward by the first item that overruns. Two estimates,
        // not one: an assembly over forged maps and a local bake differ by three
        // orders of magnitude, and averaging them together held the whole board
        // to one tile a frame — see drainContentQueue().
        contentCost: 4,
        assembleCost: 2,
        // Frames that have actually reached the canvas. The governor will not
        // judge a machine on frames that were carrying startup work.
        framesPresented: 0,
        // Set by the window resize listener and by setSafeArea, consumed once per
        // frame. Both end in a forced layout; neither is worth more than one.
        resizeDirty: false,
        frameOffsetDirty: false,
        // Latest pointer position, picked once per frame rather than per event.
        hoverPointer: null,
        // When the player last touched the map, and when their last GESTURE
        // (drag, wheel) ended. Content generation waits for a hand that is not
        // in the middle of something — see drainContentQueue().
        lastInputAt: 0,
        lastGestureAt: 0,
        // What the previous frame spent on startup work, so this frame's rAF
        // interval can have it subtracted rather than being thrown away. See
        // animate() and governDetail().
        lastWorkMs: 0,
        detail: 0,               // quality rung — see governDetail()
        // Rung 3 walks every sector to drop the cloud shells. Batched over
        // frames, because the rescue must not itself be a stall.
        detailSweep: null,
        boardAnnounced: false,
        // --- the world forge: surface bakes on another thread ------------
        forge: null,                 // { workers, queue, failed } — see ensureForge()
        worldBundles: new Map(),     // forge key -> { textures, surface, ... } — see forgeKey()
        bundlePending: new Map(),    // forge key -> requested-at timestamp
        bundleStaging: new Map(),    // baked, still being pushed to the GPU a map a frame
        bundleFailed: new Set(),     // keys the forge could not do; built on the main thread
        bundleAsked: new Map(),      // forge key -> the message that asked for it
        // Whether this driver can link a program in the background. Undefined
        // until there is a GL context to ask — see parallelCompile().
        parallelCompile: undefined,
        lastWarmAt: 0,
        // --- loading state ----------------------------------------------
        bootPlate: null,
        bootPlateMode: null,         // 'full' | 'strip'
        // What the strip is currently saying and wearing, so a repaint that
        // changes nothing costs nothing — see paintBootPlate().
        stripText: '',
        stripCss: '',
        // The step the strip is naming while it happens ('compiling surface
        // shaders'), painted BEFORE the work starts rather than after it.
        surveyStep: '',
        // Rolling record of the survey: how many were done at the last change,
        // when that was, and how long the last few sectors took. Feeds both the
        // estimate and the watchdog — see stepSurveyStrip().
        surveyDone: -1,
        surveyChangedAt: 0,
        surveyRates: [],
        statusRegion: null,
        statusSaid: '',
        chartedTotal: 0,
        contextLost: false
        // Every map texture is generated at runtime; no image files to fetch.
    };

    function sectorPosition(id) {
        const index = Number(id) - 1;
        const gx = index % state.width;
        const gy = Math.floor(index / state.width);
        const x = gx * HORIZ;
        const z = gy * VERT + (gx % 2 === 1 ? VERT / 2 : 0);
        return new THREE.Vector3(x, 0, z);
    }

    // ------------------------------------------------------------------
    // Small deterministic noise. Everything painted here has to look the same
    // on every load and in every screenshot, so nothing uses Math.random().
    // ------------------------------------------------------------------

    function hash2(ix, iy, seed) {
        let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 69069)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967295;
    }

    function vnoise(x, y, seed) {
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const fx = x - x0, fy = y - y0;
        const ux = fx * fx * (3 - 2 * fx);
        const uy = fy * fy * (3 - 2 * fy);
        const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
        const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
        const top = a + (b - a) * ux;
        const bot = c + (d - c) * ux;
        return top + (bot - top) * uy;
    }

    function fbm2(x, y, seed, octaves) {
        let sum = 0, amp = 0.5, norm = 0, fx = x, fy = y;
        for (let i = 0; i < octaves; i++) {
            sum += vnoise(fx, fy, seed + i * 131) * amp;
            norm += amp;
            amp *= 0.5;
            fx *= 2.03;
            fy *= 2.01;
        }
        return sum / norm;
    }

    function rgba(c, alpha) {
        return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`;
    }

    /** Separable box blur over RGBA bytes, wrapping in x and clamping in y. Full rationale: docs/galaxy3d-design-notes.md#separable-box-blur-over-rgba-bytes-wrapping-in-x-and-clampin */
    function boxBlurWrapX(src, W, H, r) {
        const n = 2 * r + 1;
        const tmp = new Float32Array(W * H * 4);
        const out = new Float32Array(W * H * 4);
        for (let y = 0; y < H; y++) {
            for (let c = 0; c < 4; c++) {
                let sum = 0;
                for (let k = -r; k <= r; k++) sum += src[(y * W + ((k + W) % W)) * 4 + c];
                for (let x = 0; x < W; x++) {
                    tmp[(y * W + x) * 4 + c] = sum / n;
                    sum -= src[(y * W + ((x - r + W) % W)) * 4 + c];
                    sum += src[(y * W + ((x + r + 1) % W)) * 4 + c];
                }
            }
        }
        const rowAt = y => Math.min(H - 1, Math.max(0, y));
        for (let x = 0; x < W; x++) {
            for (let c = 0; c < 4; c++) {
                let sum = 0;
                for (let k = -r; k <= r; k++) sum += tmp[(rowAt(k) * W + x) * 4 + c];
                for (let y = 0; y < H; y++) {
                    out[(y * W + x) * 4 + c] = sum / n;
                    sum -= tmp[(rowAt(y - r) * W + x) * 4 + c];
                    sum += tmp[(rowAt(y + r + 1) * W + x) * 4 + c];
                }
            }
        }
        return out;
    }

    /** A generation canvas — and it is opened `willReadFrequently`, which is worth. Full rationale: docs/galaxy3d-design-notes.md#a-generation-canvas-and-it-is-opened-willreadfrequently-whic */
    function canvas2d(w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        // Claimed here so that a later plain getContext('2d') — which is what
        // every call site does — returns THIS context rather than an accelerated
        // one. getContext caches by type, so the first call wins and the
        // attributes on subsequent calls are ignored.
        canvas.getContext('2d', { willReadFrequently: true });
        return canvas;
    }

    function toTex(canvas, colorSpace, wrap) {
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = colorSpace || THREE.SRGBColorSpace;
        if (wrap) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; }
        // ANISOTROPY. The previous revision turned this off on the theory that a. Full rationale: docs/galaxy3d-design-notes.md#anisotropy-the-previous-revision-turned-this-off-on-the-theo
        if (state.renderer && state.renderer.capabilities && !state.software) {
            tex.anisotropy = Math.min(4, state.renderer.capabilities.getMaxAnisotropy() || 1);
        }
        tex.__shared = true;
        return tex;
    }

    const LINEAR_SPACE = THREE.LinearSRGBColorSpace || THREE.NoColorSpace || undefined;

    function cachedTexture(key, build) {
        if (!state.textures.has(key)) state.textures.set(key, build());
        return state.textures.get(key);
    }

    /** THE TWO BIG BAKES, BEHIND ACCESSORS. Full rationale: docs/galaxy3d-design-notes.md#the-two-big-bakes-behind-accessors */
    function plateMaps() {
        if (!state.plateMaps) state.plateMaps = buildPlateMaps();
        return state.plateMaps;
    }

    function fogTexture() {
        if (!state.fogTexture) state.fogTexture = buildFogCloudTexture();
        return state.fogTexture;
    }

    // . Full rationale: docs/galaxy3d-design-notes.md#the-plotting-table-hex-plate-geometry-and-its-material-set

    /** How much of the plate texture the TOP FACE is allowed to use. Full rationale: docs/galaxy3d-design-notes.md#how-much-of-the-plate-texture-the-top-face-is-allowed-to-use */
    const UV_K = 0.88;
    /** v range of the machined-rim strip, in the free band below the top face. */
    const RIM_V_LIP = 0.094;      // inner edge of the chamfer (highest point)
    const RIM_V_EDGE = 0.070;     // outer edge of the chamfer
    const RIM_V_BASE = 0.008;     // bottom of the side wall

    function buildHexPlateGeometry() {
        const positions = [];
        const uvs = [];
        const inner = TILE_R * BEVEL_INSET;

        function push(p, u, v) {
            positions.push(p[0], p[1], p[2]);
            if (u === undefined) {
                // Planar UV over the tile's own bounding box: the plate texture is one
                // image per tile, so hex-aware detail (the embossed frame, the corner
                // rivets) lands in the same place on every tile.
                uvs.push(0.5 + (p[0] / (2 * TILE_R)) * UV_K, 0.5 + (p[2] / (2 * TILE_R)) * UV_K);
            } else {
                uvs.push(u, v);
            }
        }

        for (let i = 0; i < 6; i++) {
            const c0 = HEX_CORNERS[i];
            const c1 = HEX_CORNERS[(i + 1) % 6];
            const i0 = [c0[0] * inner, TILE_TOP, c0[1] * inner];
            const i1 = [c1[0] * inner, TILE_TOP, c1[1] * inner];
            const e0 = [c0[0] * TILE_R, TILE_TOP - BEVEL_DROP, c0[1] * TILE_R];
            const e1 = [c1[0] * TILE_R, TILE_TOP - BEVEL_DROP, c1[1] * TILE_R];
            const b0 = [c0[0] * TILE_R, TILE_BOTTOM, c0[1] * TILE_R];
            const b1 = [c1[0] * TILE_R, TILE_BOTTOM, c1[1] * TILE_R];

            // The rim's own UV run: u is CUMULATIVE PERIMETER DISTANCE around the
            // hexagon (all six sides are TILE_R long), v walks down the machined
            // band. Every wall quad therefore samples a horizontal run of a strip
            // painted for it, instead of one vertical column of the top face.
            const u0 = i / 6;
            const u1 = (i + 1) / 6;

            // Top face fan.
            push([0, TILE_TOP, 0]); push(i0); push(i1);
            // Chamfer band: the bright lip of the rim.
            push(i0, u0, RIM_V_LIP); push(e0, u0, RIM_V_EDGE); push(e1, u1, RIM_V_EDGE);
            push(i0, u0, RIM_V_LIP); push(e1, u1, RIM_V_EDGE); push(i1, u1, RIM_V_LIP);
            // Side wall.
            push(e0, u0, RIM_V_EDGE); push(b0, u0, RIM_V_BASE); push(b1, u1, RIM_V_BASE);
            push(e0, u0, RIM_V_EDGE); push(b1, u1, RIM_V_BASE); push(e1, u1, RIM_V_EDGE);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        geo.computeVertexNormals();   // non-indexed -> flat facets, which is the point
        geo.computeBoundingSphere();
        return geo;
    }

    /**
     * A hex ANNULUS built from the same unit corner array as the plate, scaled by
     * one uniform factor. This is the fix for the marker that overshot its tile:
     * there is no second definition of "where the hexagon is" left to drift.
     */
    function buildHexRingGeometry(outerScale, innerScale) {
        const positions = [];
        const ro = TILE_R * outerScale;
        const ri = TILE_R * innerScale;
        for (let i = 0; i < 6; i++) {
            const c0 = HEX_CORNERS[i];
            const c1 = HEX_CORNERS[(i + 1) % 6];
            const o0 = [c0[0] * ro, 0, c0[1] * ro];
            const o1 = [c1[0] * ro, 0, c1[1] * ro];
            const n0 = [c0[0] * ri, 0, c0[1] * ri];
            const n1 = [c1[0] * ri, 0, c1[1] * ri];
            positions.push(...n0, ...o0, ...o1);
            positions.push(...n0, ...o1, ...n1);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.computeVertexNormals();
        return geo;
    }

    /** THE SELECTION MARKER: four chamfered clamps bolted onto the tile. Full rationale: docs/galaxy3d-design-notes.md#the-selection-marker-four-chamfered-clamps-bolted-onto-the-t */
    function buildSelectionClampGeometry() {
        const parts = [];

        /** One bracket: a mounting pad bedded onto the plate, a chamfered base. Full rationale: docs/galaxy3d-design-notes.md#one-bracket-a-mounting-pad-bedded-onto-the-plate-a-chamfered */
        function clamp(cx, cz, ang) {
            const pad = new THREE.BoxGeometry(0.62, 0.016, 0.24);
            pad.translate(0, 0.008, 0);
            const base = new THREE.BoxGeometry(0.54, 0.040, 0.185);
            base.translate(0, 0.036, 0);
            // The inset chamfer: a smaller slab above a larger one IS a chamfer
            // in this vocabulary, and it gives the key a step to catch.
            const chamfer = new THREE.BoxGeometry(0.48, 0.020, 0.145);
            chamfer.translate(0, 0.066, 0);
            const cap = new THREE.BoxGeometry(0.40, 0.024, 0.105);
            cap.translate(0, 0.088, 0);
            [pad, base, chamfer, cap].forEach(g => {
                g.rotateY(ang);
                g.translate(cx, 0, cz);
                parts.push(g.toNonIndexed());
            });
            for (const s of [-1, 1]) {
                const bolt = new THREE.CylinderGeometry(0.036, 0.044, 0.040, 8, 1);
                bolt.translate(s * 0.195, 0.098, 0);
                bolt.rotateY(ang);
                bolt.translate(cx, 0, cz);
                parts.push(bolt.toNonIndexed());
            }
        }

        // How far out the bracket's CENTRE line sits. Driven from the hexagon's
        // inradius minus the bracket's own half-depth and the plate's chamfer,
        // not from a magic 0.90: at that factor the outer face landed past the
        // rim and the upper-right pair visibly intersected the neighbouring
        // tile's plate geometry — actual geometry clipping between two tiles.
        const CLAMP_HALF_DEPTH = 0.12;      // half of the pad's 0.24 depth
        const seat = (HEX_INRADIUS * BEVEL_INSET - CLAMP_HALF_DEPTH) / HEX_INRADIUS;

        /** THE TWO UPPER DIAGONAL EDGES ONLY. Full rationale: docs/galaxy3d-design-notes.md#the-two-upper-diagonal-edges-only */
        // The two upper DIAGONAL edges (0-1, 2-3). The flat edges are
        // left clear on purpose: the register ticks and the sector number live
        // there, and a bracket across either of them would cover gameplay text.
        [[0, 1], [2, 3]].forEach(([i, j]) => {
            const c0 = HEX_CORNERS[i], c1 = HEX_CORNERS[j];
            const mx = (c0[0] + c1[0]) / 2 * TILE_R, mz = (c0[1] + c1[1]) / 2 * TILE_R;
            let dx = (c1[0] - c0[0]), dz = (c1[1] - c0[1]);
            const dl = Math.hypot(dx, dz) || 1;
            dx /= dl; dz /= dl;
            // A rotation of ang about +Y sends local +X to (cos ang, 0, -sin ang).
            clamp(mx * seat, mz * seat, Math.atan2(-dz, dx));
        });

        const geo = mergeGeometries(parts, true);
        // Every part's UVs are remapped into one small clean patch at the centre
        // of the tray — brushed grain with no frame stroke or rivet in it — so
        // the brackets are visibly the same milled steel as the table without
        // dragging a piece of the plate's own artwork onto a 10px face.
        const uv = geo.attributes.uv.array;
        for (let i = 0; i < uv.length; i++) uv[i] = 0.44 + uv[i] * 0.12;
        geo.attributes.uv.needsUpdate = true;
        return geo;
    }

    /** AN EMPTY SOCKET, NOT A PLATE. Full rationale: docs/galaxy3d-design-notes.md#an-empty-socket-not-a-plate */
    const FOG_DROP = 0.13;                   // how far an unexplored cell sits below the deck
    const FOG_RIM_SCALE = 0.995;             // outer lip of the socket
    // 0.925, not 0.80. A chamfer that eats a fifth of the tile is not a chamfer,
    // it is a funnel — and with the rim blown out (see below) that funnel was the
    // loudest thing on an unexplored cell. 7.5% reads as a machined seat.
    const FOG_FLOOR_SCALE = 0.925;           // where the funnel wall reaches the floor
    const FOG_FLOOR_Y = TILE_TOP - 0.115;

    /** @param {number} variant which slice of the haze texture this cell samples. Full rationale: docs/galaxy3d-design-notes.md#param-number-variant-which-slice-of-the-haze-texture-this-ce */
    function buildFogCellGeometry(variant) {
        const positions = [];
        const uvs = [];
        const colors = [];
        const ro = TILE_R * FOG_RIM_SCALE;
        const ri = TILE_R * FOG_FLOOR_SCALE;
        const yRim = TILE_TOP - 0.012;
        const v = Number(variant) || 0;
        const uRot = v * 0.897;                       // irrational-ish step: no cycle inside 7
        const cs = Math.cos(uRot), sn = Math.sin(uRot);
        const uOff = hash2(v, 17, 331), vOff = hash2(v, 23, 547);

        // The socket's chamfer is lifted by a VERTEX COLOUR rather than by a
        // texture, because the whole point of this cell is that it has no
        // texture. A ring of slightly brighter metal around a very dark floor is
        // what makes the shape read as an empty MOUNT — a place where a plate
        // would go — instead of as a flat dark hexagon.
        function push(x, y, z, tint) {
            positions.push(x, y, z);
            const lu = x / (2 * TILE_R), lv = z / (2 * TILE_R);
            uvs.push(0.5 + (lu * cs - lv * sn) + uOff, 0.5 + (lu * sn + lv * cs) + vOff);
            colors.push(tint, tint, tint);
        }

        for (let i = 0; i < 6; i++) {
            const c0 = HEX_CORNERS[i];
            const c1 = HEX_CORNERS[(i + 1) % 6];
            // Funnel wall: rim down to floor. Six flat facets, so the key light. Full rationale: docs/galaxy3d-design-notes.md#funnel-wall-rim-down-to-floor-six-flat-facets-so-the-key-lig
            const RIM = 1 + edgeFacing(i) * 0.35, FLOOR = 1.0;
            push(c0[0] * ro, yRim, c0[1] * ro, RIM);
            push(c1[0] * ri, FOG_FLOOR_Y, c1[1] * ri, FLOOR);
            push(c0[0] * ri, FOG_FLOOR_Y, c0[1] * ri, FLOOR);
            push(c0[0] * ro, yRim, c0[1] * ro, RIM);
            push(c1[0] * ro, yRim, c1[1] * ro, RIM);
            push(c1[0] * ri, FOG_FLOOR_Y, c1[1] * ri, FLOOR);
            // Floor fan.
            push(0, FOG_FLOOR_Y, 0, FLOOR);
            push(c0[0] * ri, FOG_FLOOR_Y, c0[1] * ri, FLOOR);
            push(c1[0] * ri, FOG_FLOOR_Y, c1[1] * ri, FLOOR);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        return geo;
    }

    /** A filled hexagon at a uniform scale of the tile — used for tile decals. */
    function buildHexDiscGeometry(scale) {
        const positions = [];
        const uvs = [];
        const r = TILE_R * scale;
        for (let i = 0; i < 6; i++) {
            const c0 = HEX_CORNERS[i];
            const c1 = HEX_CORNERS[(i + 1) % 6];
            positions.push(0, 0, 0, c0[0] * r, 0, c0[1] * r, c1[0] * r, 0, c1[1] * r);
            uvs.push(0.5, 0.5, 0.5 + c0[0] / 2, 0.5 + c0[1] / 2, 0.5 + c1[0] / 2, 0.5 + c1[1] / 2);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        geo.computeVertexNormals();
        return geo;
    }

    /** The deck plate: brushed gunmetal with an embossed hexagonal frame, corner. Full rationale: docs/galaxy3d-design-notes.md#the-deck-plate-brushed-gunmetal-with-an-embossed-hexagonal-f */
    /** A low-frequency fbm evaluated on a coarse grid and bilinearly resampled. Full rationale: docs/galaxy3d-design-notes.md#a-low-frequency-fbm-evaluated-on-a-coarse-grid-and-bilinearl */
    function coarseField(N, scale, seed, octaves) {
        const grid = new Float32Array(N * N);
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) grid[y * N + x] = fbm2(x * scale, y * scale, seed, octaves);
        }
        return function sample(u, v) {
            const fx = Math.min(N - 1.001, Math.max(0, u * (N - 1)));
            const fy = Math.min(N - 1.001, Math.max(0, v * (N - 1)));
            const x0 = fx | 0, y0 = fy | 0;
            const tx = fx - x0, ty = fy - y0;
            const a = grid[y0 * N + x0], b = grid[y0 * N + x0 + 1];
            const c = grid[(y0 + 1) * N + x0], d = grid[(y0 + 1) * N + x0 + 1];
            return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
        };
    }

    function buildPlateMaps() {
        // 1024, not 256. Tiles occupy ~380px on screen at the closeup framing,
        // so at 256 every painted feature was magnified 1.5x: rivets were
        // blurred blobs, the dashed scribe broke into smears and the stencil
        // ticks had mushy ends. This is generated once and cached, so the whole
        // cost is startup and it buys the one thing a AAA frame is judged on —
        // holding up when someone leans in.
        const S = 1024;
        const canvas = canvas2d(S, S);
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(S, S);
        const px = img.data;

        /** THE MACHINING HEIGHT FIELD, and where it belongs. Full rationale: docs/galaxy3d-design-notes.md#the-machining-height-field-and-where-it-belongs */
        const machining = new Float32Array(S * S);
        for (let y = 0; y < S; y++) {
            const yr = y / 0.68;
            const yr2 = y / 2.4;
            for (let x = 0; x < S; x++) {
                // Two passes at right angles, as a milled plate actually carries:
                // a dominant longitudinal cut and a faint cross-hatch.
                const cut = vnoise(x / 3.0, yr, 17);
                const cross = vnoise(x / 9.0, yr2, 43);
                machining[y * S + x] = (cut - 0.5) * 0.60 + (cross - 0.5) * 0.22;
            }
        }

        const blotch = coarseField(96, 0.09, 91, 3);
        const stain = coarseField(64, 0.16, 305, 2);
        for (let y = 0; y < S; y++) {
            const v = y / S;
            for (let x = 0; x < S; x++) {
                const u = x / S;
                // Steel is a mid grey. The variation left in the albedo is
                // service wear — heat staining and blotchy oxidation — at a
                // scale of tens of texels, not a directional grain.
                // 0.66. Measured against the fog cell below: the charted:
                // unexplored step has to be about 3:1 in L*, and the ladder moves
                // as a whole — pushing the fog down alone would take it to black,
                // which is the regression that once made a hundred tiles vanish.
                const val = 0.66 + (blotch(u, v) - 0.5) * 0.17 + (stain(u, v) - 0.5) * 0.10
                    // A whisper of the machining, so the tool marks are not
                    // PURELY specular; metal grain does dull the diffuse a
                    // little where it is torn.
                    + machining[y * S + x] * 0.035;
                const i = (y * S + x) * 4;
                px[i] = px[i + 1] = px[i + 2] = Math.max(0, Math.min(255, val * 255));
                px[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);

        const cx = S / 2;
        // Half-width of the top face's UV footprint, in texels. Every painted
        // feature is authored against THIS rather than S/2, so shrinking the top
        // face's UVs to make room for the rim strip moves nothing in world space.
        const half = (S / 2) * UV_K;
        // Everything below was authored against a 256px plate. K keeps the same
        // world-space design at any resolution instead of leaving a page of
        // magic pixel constants that silently shrink when S changes.
        const K = S / 256;

        function hexPath(scale) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const c = HEX_CORNERS[i];
                const x = cx + c[0] * half * scale;
                const y = cx + c[1] * half * scale;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
        }

        // Embossed frame: a bright lip above a dark groove. Two strokes at a
        // one-pixel offset is all an emboss is, and it survives the normal-map
        // derivation below as an actual ridge.
        ctx.lineWidth = 3 * K;
        ctx.strokeStyle = 'rgba(24,24,28,0.55)';
        hexPath(0.80); ctx.stroke();
        ctx.lineWidth = 2 * K;
        ctx.strokeStyle = 'rgba(226,226,232,0.42)';
        ctx.save(); ctx.translate(0, -2 * K); hexPath(0.80); ctx.stroke(); ctx.restore();

        // Inner tray, very slightly darker: the recess a plotting table has.
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        hexPath(0.78); ctx.fill();

        // Corner rivets, one per hex vertex, on the frame line. At 1024 there is
        // room for these to be TURNED metal rather than a blob: a bright crescent
        // where the key catches the domed head, a dark crescent opposite, and a
        // seating ring where it meets the plate.
        for (let i = 0; i < 6; i++) {
            const c = HEX_CORNERS[i];
            const x = cx + c[0] * half * 0.74;
            const y = cx + c[1] * half * 0.74;
            const r = 5.5 * K;
            ctx.fillStyle = 'rgba(10,12,16,0.42)';
            ctx.beginPath();
            ctx.arc(x + 0.8 * K, y + 0.9 * K, r * 1.16, 0, Math.PI * 2);
            ctx.fill();
            const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.06, x, y, r);
            g.addColorStop(0, 'rgba(240,242,248,0.92)');
            g.addColorStop(0.42, 'rgba(158,164,178,0.74)');
            g.addColorStop(0.82, 'rgba(58,62,74,0.66)');
            g.addColorStop(1, 'rgba(14,16,22,0.62)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            // Slot head: a rivet without a tool mark reads as a bead of solder.
            ctx.strokeStyle = 'rgba(16,18,24,0.5)';
            ctx.lineWidth = 1.2 * K;
            ctx.beginPath();
            ctx.moveTo(x - r * 0.52, y - r * 0.14);
            ctx.lineTo(x + r * 0.52, y + r * 0.14);
            ctx.stroke();
        }

        // Stencilled register ticks along the two flat edges: intentional, machined,
        // and the thing that keeps the tile from reading as a coloured polygon.
        ctx.strokeStyle = 'rgba(210,214,226,0.22)';
        ctx.lineWidth = 2 * K;
        for (let i = -3; i <= 3; i++) {
            const x = cx + i * 15 * UV_K * K;
            ctx.beginPath();
            ctx.moveTo(x, cx - half * 0.70);
            ctx.lineTo(x, cx - half * 0.70 + (i % 3 === 0 ? 9 : 5) * K);
            ctx.moveTo(x, cx + half * 0.70);
            ctx.lineTo(x, cx + half * 0.70 - (i % 3 === 0 ? 9 : 5) * K);
            ctx.stroke();
        }

        // Wear: a few long scuffs across the plate.
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1 * K;
        for (let i = 0; i < 26; i++) {
            const x0 = hash2(i, 3, 7) * S;
            const y0 = hash2(i, 9, 11) * S * 0.86;
            const len = (20 + hash2(i, 5, 23) * 90) * K;
            const ang = (hash2(i, 7, 31) - 0.5) * 0.5;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
            ctx.stroke();
        }

        paintRimStrip(ctx, S);

        const map = toTex(canvas, THREE.SRGBColorSpace);

        // Normal map by Sobel over the painted luminance PLUS the machining
        // height field. The features (frame, rivets, tray, ticks) come from the
        // albedo because they are relief that also happens to be visible; the
        // tool marks come only from here, because relief is ALL they are.
        const src = ctx.getImageData(0, 0, S, S).data;
        const height = new Float32Array(S * S);
        for (let i = 0; i < S * S; i++) {
            // 0.085, not 0.16. At the higher gain the tool marks were fine enough
            // that a 220-exponent lobe hit a different micro-facet in every
            // texel, and the plates picked up a blue-white glitter that read as
            // frost rather than as brushed steel. A tight lobe and a high-
            // frequency normal are each correct and together they alias; the
            // amplitude is the term that has to give.
            height[i] = src[i * 4] / 255 + machining[i] * 0.055;
        }
        const nCanvas = canvas2d(S, S);
        const nCtx = nCanvas.getContext('2d');
        const nImg = nCtx.createImageData(S, S);
        const nPx = nImg.data;
        const at = (x, y) => height[((y + S) % S) * S + ((x + S) % S)];
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
                         - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
                const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
                         - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
                // At 4x the resolution a Sobel step covers a quarter of the
                // world-space distance it used to, so the same slope needs four
                // times the gain to survive.
                const strength = 5.2;
                let nx = -dx * strength, ny = -dy * strength, nz = 1;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
                const i = (y * S + x) * 4;
                nPx[i] = ((nx / len) * 0.5 + 0.5) * 255;
                nPx[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
                nPx[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
                nPx[i + 3] = 255;
            }
        }
        /** THE RIM BAND GETS A FLAT NORMAL, deliberately. Full rationale: docs/galaxy3d-design-notes.md#the-rim-band-gets-a-flat-normal-deliberately */
        const rimRow = Math.floor((1 - 0.112) * S);
        for (let y = rimRow; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const i = (y * S + x) * 4;
                nPx[i] = 128; nPx[i + 1] = 128; nPx[i + 2] = 255; nPx[i + 3] = 255;
            }
        }
        nCtx.putImageData(nImg, 0, 0);

        return {
            map,
            normalMap: toTex(nCanvas, LINEAR_SPACE),
            // Kept so the hazard stencils can be composited over a finished plate
            // instead of repainting the (expensive) grain and re-running Sobel.
            base: canvas,
            size: S,
            scale: K,
            half: (S / 2) * UV_K
        };
    }

    /** The machined rim: the chamfer lip, the parting groove and the side wall. Full rationale: docs/galaxy3d-design-notes.md#the-machined-rim-the-chamfer-lip-the-parting-groove-and-the- */
    /** How strongly hex edge `i`'s outward face turns toward the key light. Full rationale: docs/galaxy3d-design-notes.md#how-strongly-hex-edge-i-s-outward-face-turns-toward-the-key- */
    function edgeFacing(i) {
        const c0 = HEX_CORNERS[i], c1 = HEX_CORNERS[(i + 1) % 6];
        let nx = (c0[0] + c1[0]) / 2, nz = (c0[1] + c1[1]) / 2;
        const l = Math.hypot(nx, nz) || 1;
        nx /= l; nz /= l;
        const kl = Math.hypot(KEY_LIGHT_DIR.x, KEY_LIGHT_DIR.z) || 1;
        return nx * (KEY_LIGHT_DIR.x / kl) + nz * (KEY_LIGHT_DIR.z / kl);
    }

    function paintRimStrip(ctx, S) {
        const K = S / 256;
        const rowOf = v => (1 - v) * S;
        const yTop = rowOf(0.108);         // a little above the lip, for mip bleed
        const yLip = rowOf(RIM_V_LIP);
        const yEdge = rowOf(RIM_V_EDGE);
        const yBase = rowOf(RIM_V_BASE);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, yTop, S, S - yTop);
        ctx.clip();

        /** THE CHAMFER IS PAINTED SIX TIMES, ONCE PER EDGE, AT ITS OWN VALUE. Full rationale: docs/galaxy3d-design-notes.md#the-chamfer-is-painted-six-times-once-per-edge-at-its-own-va */
        function band(from, to, lo, hi) {
            const g = ctx.createLinearGradient(0, from, 0, to);
            g.addColorStop(0, lo);
            g.addColorStop(1, hi);
            return g;
        }
        const shade = (v, k) => {
            const n = Math.max(0, Math.min(255, Math.round(v * k)));
            return `rgb(${n},${n},${n})`;
        };

        /** EXPOSURE FIRST, THEN CONTENT. Full rationale: docs/galaxy3d-design-notes.md#exposure-first-then-content */
        const K_CAP = 1.25;
        for (let i = 0; i < 6; i++) {
            const x0 = (i / 6) * S;
            const w = S / 6 + 1;                 // +1: no seam between segments
            const k = Math.min(K_CAP, 1 + edgeFacing(i) * 0.40);  // value step, per facet
            ctx.save();
            ctx.beginPath();
            ctx.rect(x0, yTop, w, S - yTop);
            ctx.clip();

            // The chamfer proper: a lit facet, at this edge's own value. The
            // base value is deliberately mid-grey rather than near-white — the
            // status tint and the key light both multiply through this, so a
            // chamfer authored bright blows out entirely on the up-key edges.
            ctx.fillStyle = band(yTop, yEdge, shade(96, k), shade(70, k));
            ctx.fillRect(x0, yTop, w, yEdge - yTop);
            // The parting line where the chamfer meets the wall. Dark on every
            // edge — a groove is a groove — but it still tracks the facet a
            // little so it never becomes a uniform black rule around the tile.
            ctx.fillStyle = shade(22, 0.6 + k * 0.4);
            ctx.fillRect(x0, yEdge, w, 3 * K);
            // The side wall, always in shadow relative to its own chamfer.
            ctx.fillStyle = band(yEdge + 3 * K, S, shade(44, k * 0.82), shade(15, k * 0.82));
            ctx.fillRect(x0, yEdge + 3 * K, w, S - yEdge - 3 * K);

            // A SECOND PARTING LINE low on the wall: the seam between two
            // courses of plate. One scribe is what tells the eye the skirt has a
            // thickness rather than being a painted band. It sits BELOW the bolt
            // line — a scribe through a row of bolt heads reads as a scratch.
            const yCourse = yEdge + (yBase - yEdge) * 0.84;
            ctx.fillStyle = shade(12, 0.7 + k * 0.3);
            ctx.fillRect(x0, yCourse, w, 2.2 * K);
            ctx.fillStyle = `rgba(214,222,238,${0.10 + Math.max(0, k - 1) * 0.22})`;
            ctx.fillRect(x0, yCourse + 2.2 * K, w, 1.2 * K);

            // A hot specular line ALONG the chamfer's inner lip, only on the
            // edges that face the key. This is the glint a milled edge throws,
            // and restricting it to the lit side is what stops it reading as the
            // banned decorative outline glow.
            if (k > 1.05) {
                ctx.fillStyle = `rgba(228,234,246,${Math.min(0.30, (k - 1) * 0.6)})`;
                ctx.fillRect(x0, yLip - 1.5 * K, w, 2.2 * K);
            }
            ctx.restore();
        }

        /** A STENCILLED PART CODE, on one facet only. Full rationale: docs/galaxy3d-design-notes.md#a-stencilled-part-code-on-one-facet-only */
        ctx.save();
        ctx.beginPath();
        ctx.rect((2 / 6) * S, yEdge + 4 * K, S / 6, yBase - yEdge - 4 * K);
        ctx.clip();
        ctx.font = `${13 * K}px "Share Tech Mono", "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const codeX = (2.5 / 6) * S, codeY = (yEdge + yBase) / 2 - 1 * K;
        ctx.fillStyle = 'rgba(6,8,12,0.72)';
        ctx.fillText('MK-7', codeX, codeY);
        ctx.fillStyle = 'rgba(198,206,222,0.30)';
        ctx.fillText('MK-7', codeX - 0.8 * K, codeY - 0.8 * K);
        ctx.restore();

        // Vertical ribs down the wall: rolled steel, and the thing that gives the
        // wall a direction so it cannot read as a smear.
        ctx.strokeStyle = 'rgba(226,232,244,0.10)';
        ctx.lineWidth = 1 * K;
        for (let x = 0; x < S; x += 4 * K) {
            const j = hash2(Math.round(x / K), 3, 41);
            ctx.globalAlpha = 0.35 + j * 0.65;
            ctx.beginPath();
            ctx.moveTo(x + 0.5 * K, yEdge + 3 * K);
            ctx.lineTo(x + 0.5 * K, yBase);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Bolt heads: two per hex edge, so twelve around the rim. Lit from the
        // same facet value as the wall they are sunk into.
        const wallMid = (yEdge + yBase) / 2 + 1 * K;
        for (let k = 0; k < 12; k++) {
            const x = (k + 0.5) * (S / 12);
            const lit = 0.62 + 0.38 * (1 + edgeFacing(Math.floor(k / 2)) * 0.4);
            const r = 3.9 * K;
            const rg = ctx.createRadialGradient(x - r * 0.3, wallMid - r * 0.38, r * 0.1, x, wallMid, r);
            rg.addColorStop(0, `rgba(214,220,232,${Math.min(0.95, 0.62 * lit)})`);
            rg.addColorStop(0.5, `rgba(120,127,142,${Math.min(0.9, 0.5 * lit)})`);
            rg.addColorStop(1, 'rgba(10,12,17,0.7)');
            ctx.fillStyle = rg;
            ctx.beginPath();
            ctx.arc(x, wallMid, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Wear along the lip: the edge a table gets knocked against.
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1 * K;
        for (let i = 0; i < 40; i++) {
            const x = hash2(i, 11, 77) * S;
            const len = (3 + hash2(i, 13, 79) * 14) * K;
            ctx.beginPath();
            ctx.moveTo(x, yLip + 1 * K);
            ctx.lineTo(x + len, yLip + 1 * K);
            ctx.stroke();
        }
        ctx.restore();

        /** A GRAIN AND WEAR MULTIPLY OVER THE WHOLE STRIP. Full rationale: docs/galaxy3d-design-notes.md#a-grain-and-wear-multiply-over-the-whole-strip */
        const y0 = Math.max(0, Math.floor(yTop));
        const rows = S - y0;
        if (rows > 0) {
            const strip = ctx.getImageData(0, y0, S, rows);
            const sp = strip.data;
            const soil = coarseField(48, 0.11, 461, 2);
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < S; x++) {
                    const g = 1
                        + (vnoise(x / 2.2, (y0 + y) / 1.6, 137) - 0.5) * 0.26
                        + (vnoise(x / 11, (y0 + y) / 5, 349) - 0.5) * 0.16
                        + (soil(x / S, y / rows) - 0.5) * 0.22;
                    const i = (y * S + x) * 4;
                    sp[i] = Math.min(255, sp[i] * g);
                    sp[i + 1] = Math.min(255, sp[i + 1] * g);
                    sp[i + 2] = Math.min(255, sp[i + 2] * g);
                }
            }
            ctx.putImageData(strip, 0, y0);
        }
    }

    /** A plate albedo carrying a stencilled hazard code. Composited over the. Full rationale: docs/galaxy3d-design-notes.md#a-plate-albedo-carrying-a-stencilled-hazard-code-composited- */
    function plateVariantMap(kind) {
        return cachedTexture(`plate:${kind}`, () => {
            const plate = plateMaps();
            const S = plate.size;
            const half = plate.half;
            const K = plate.scale || 1;
            const canvas = canvas2d(S, S);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(plate.base, 0, 0);
            const cx = S / 2;

            /** A SECOND, NON-HUE CHANNEL FOR THE HAZARD READ. Full rationale: docs/galaxy3d-design-notes.md#a-second-non-hue-channel-for-the-hazard-read */
            function hazardHatch(clipScale) {
                ctx.save();
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const c = HEX_CORNERS[i];
                    const x = cx + c[0] * half * clipScale;
                    const y = cx + c[1] * half * clipScale;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.clip();
                ctx.translate(cx, cx);
                ctx.rotate(-Math.PI / 4);
                const pitch = 32 * K;
                for (let x = -S; x < S; x += pitch) {
                    // +/-25% about the plate value, as a pair: the dark stripe
                    // does the work at thumbnail size, the bright edge beside it
                    // keeps the pattern from reading as dirt when you lean in.
                    ctx.fillStyle = 'rgba(9,10,14,0.50)';
                    ctx.fillRect(x, -S, pitch * 0.42, S * 2);
                    ctx.fillStyle = 'rgba(246,224,180,0.26)';
                    ctx.fillRect(x + pitch * 0.42, -S, pitch * 0.14, S * 2);
                }
                ctx.restore();
            }

            // Stencils are sprayed through a cut plate: a bright coat with a dark
            // registration shadow a pixel down-right, worn at the edges.
            function stencil(draw) {
                ctx.save();
                ctx.translate(1.5 * K, 1.5 * K);
                ctx.strokeStyle = 'rgba(12,13,18,0.55)';
                ctx.fillStyle = 'rgba(12,13,18,0.55)';
                draw();
                ctx.restore();
                ctx.strokeStyle = 'rgba(232,236,246,0.5)';
                ctx.fillStyle = 'rgba(232,236,246,0.5)';
                draw();
            }

            if (kind === 'belt') {
                hazardHatch(0.76);
                // A BROKEN RING: the belt is a circuit you can be hit crossing,
                // and the gaps are the lanes through it.
                stencil(() => {
                    ctx.lineWidth = 7 * K;
                    ctx.lineCap = 'butt';
                    for (let i = 0; i < 5; i++) {
                        const a0 = (i / 5) * Math.PI * 2 + 0.24;
                        const a1 = a0 + (Math.PI * 2 / 5) * 0.62;
                        ctx.beginPath();
                        ctx.arc(cx, cx, half * 0.50, a0, a1);
                        ctx.stroke();
                    }
                    for (let i = 0; i < 3; i++) {
                        const a = (i / 3) * Math.PI * 2 + 0.9;
                        ctx.beginPath();
                        ctx.arc(cx + Math.cos(a) * half * 0.30, cx + Math.sin(a) * half * 0.30,
                            3.4 * K, 0, Math.PI * 2);
                        ctx.fill();
                    }
                });
            } else if (kind === 'star') {
                hazardHatch(0.76);
                // A RADIAL BURST: rays out of a point. Nothing about it can be
                // mistaken for a ring, which is the whole job — the two hazard
                // classes have to separate in a monochrome screenshot.
                stencil(() => {
                    ctx.lineWidth = 5 * K;
                    ctx.lineCap = 'butt';
                    for (let i = 0; i < 12; i++) {
                        const a = (i / 12) * Math.PI * 2;
                        const r0 = half * 0.20;
                        const r1 = half * (i % 2 === 0 ? 0.58 : 0.40);
                        ctx.beginPath();
                        ctx.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
                        ctx.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
                        ctx.stroke();
                    }
                    ctx.beginPath();
                    ctx.arc(cx, cx, half * 0.10, 0, Math.PI * 2);
                    ctx.fill();
                });
            }
            return toTex(canvas, THREE.SRGBColorSpace);
        });
    }

    /** Unexplored space. It has to be SEEN — an earlier revision multiplied a fog. Full rationale: docs/galaxy3d-design-notes.md#unexplored-space-it-has-to-be-seen-an-earlier-revision-multi */
    function buildFogCloudTexture() {
        const S = 192;
        const canvas = canvas2d(S, S);
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(S, S);
        const px = img.data;
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                // FREQUENCY, not blobs. The previous version accumulated a few
                // hundred soft discs, which at tile scale magnified into bokeh —
                // dust on a lens, not a sensor return. Three octaves at a base
                // scale of about a twentieth of the tile give haze with a GRAIN,
                // and a slow scan modulation gives it a sweep direction, which is
                // what makes it read as an instrument's noise floor.
                const n = fbm2(x / 9.6, y / 9.6, 401, 3);
                const drift = fbm2(x / 30, y / 30, 733, 2);
                const scan = 1 + Math.sin((y / S) * Math.PI * 8) * 0.06;
                // FINE GRAIN, and the one place in this file where fine grain is
                // safe: this texture lands on a tile at roughly 1:1 (192 texels
                // across a ~200px hex), so a 2.6-texel feature is a 2-3px feature
                // on screen — the machined floor the field was missing. Contrast
                // the sky dome, where one texel is fifteen pixels and per-texel
                // content is a screen door. Always check the magnification first.
                const grain = (vnoise(x / 2.6, y / 2.6, 271) - 0.5) * 0.30
                    + (vnoise(x / 6.2, y / 6.2, 617) - 0.5) * 0.18;
                // A milled floor has a direction. Very low amplitude: this is the
                // difference between "out of focus" and "a surface", not a stripe.
                const mill = Math.sin((x + vnoise(x / 40, y / 40, 83) * 6) * 0.78) * 0.05;
                const v = Math.max(0, Math.min(1, ((n * 0.68 + drift * 0.32) - 0.30) * 2.0)) * scan;
                const i = (y * S + x) * 4;
                // Dim on purpose. This rides in as emissive on top of a lit
                // plate, and the first pass at double these values turned the
                // hundred unexplored tiles into the BRIGHTEST thing on the board
                // — the opposite failure to the black-fog one, and just as bad:
                // the eye goes to the part of the map you know nothing about.
                const fine = 1 + grain + mill;
                px[i] = (44 + v * 74) * fine;
                px[i + 1] = (56 + v * 82) * fine;
                px[i + 2] = (84 + v * 92) * fine;
                px[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        return toTex(canvas, THREE.SRGBColorSpace, true);
    }

    /** Soft round falloff. Used for glows, contact shadows and star points. */
    function buildRadialTexture(key, stops, size) {
        return cachedTexture(key, () => {
            const S = size || 128;
            const canvas = canvas2d(S, S);
            const ctx = canvas.getContext('2d');
            const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
            stops.forEach(([at, colour, alpha]) => g.addColorStop(at, rgba(colour, alpha)));
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, S, S);
            return toTex(canvas, THREE.SRGBColorSpace);
        });
    }

    // A radial gradient fills its SQUARE, so the corners of the quad sit at
    // radius 1.41 and keep whatever alpha the last stop had. Every one of these
    // therefore reaches zero at 0.97 and stays there — otherwise the sprite's
    // own rectangle becomes visible as a hard-edged patch, which is exactly the
    // tan rectangle that appeared around the fleet badge.
    function glowTexture(colour) {
        return buildRadialTexture(`glow:${colour.join(',')}`, [
            [0, colour, 0.95],
            [0.18, colour, 0.62],
            [0.45, colour, 0.2],
            [0.97, colour, 0],
            [1, colour, 0]
        ]);
    }

    function contactShadowTexture() {
        return buildRadialTexture('shadow', [
            [0, [0, 0, 0], 0.55],
            [0.42, [0, 0, 0], 0.34],
            [0.78, [0, 0, 0], 0.09],
            [0.97, [0, 0, 0], 0],
            [1, [0, 0, 0], 0]
        ]);
    }

    /**
     * The plotted course a fleet flies: a dashed centre line with a soft skirt,
     * laid on the plates it crosses. Painted along +u so a quad stretched from
     * origin to destination carries one continuous run of it.
     */
    function makeRouteTexture(colour) {
        const W = 128, H = 32;
        const canvas = canvas2d(W, H);
        const ctx = canvas.getContext('2d');
        const skirt = ctx.createLinearGradient(0, 0, 0, H);
        skirt.addColorStop(0, rgba(colour, 0));
        skirt.addColorStop(0.5, rgba(colour, 0.30));
        skirt.addColorStop(1, rgba(colour, 0));
        ctx.fillStyle = skirt;
        ctx.fillRect(0, 0, W, H);
        /** DASH PITCH 32, NOT 16 — AND SEE THE REPEAT AT THE CALL SITE. Full rationale: docs/galaxy3d-design-notes.md#dash-pitch-32-not-16-and-see-the-repeat-at-the-call-site */
        ctx.fillStyle = rgba(colour, 0.85);
        for (let x = 0; x < W; x += 32) ctx.fillRect(x, H / 2 - 1.5, 18, 3);
        // Registration ticks either side of the line.
        ctx.fillStyle = rgba(colour, 0.4);
        for (let x = 0; x < W; x += 64) {
            ctx.fillRect(x, H / 2 - 7, 2, 4);
            ctx.fillRect(x, H / 2 + 3, 2, 4);
        }
        // NOT cached and NOT shared: the dash density is set per move from the
        // crossing's length, so the move owns this texture and disposes it.
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        return tex;
    }

    // . Full rationale: docs/galaxy3d-design-notes.md#deep-space

    /** The dome carries LOW FREQUENCY ONLY. NOTHING PER-TEXEL. EVER. Full rationale: docs/galaxy3d-design-notes.md#the-dome-carries-low-frequency-only-nothing-per-texel-ever */
    /** PAINTED IN SLICES, BECAUSE IT IS HALF A MILLION TEXELS OF ARITHMETIC. Full rationale: docs/galaxy3d-design-notes.md#painted-in-slices-because-it-is-half-a-million-texels-of-ari */
    const SKY_ROWS_PER_STEP = 72;

    function beginSkyTexture() {
        const W = 1024, H = 512;
        const canvas = canvas2d(W, H);
        const ctx = canvas.getContext('2d');

        // WHERE THE CAMERA ACTUALLY LOOKS. Full rationale: docs/galaxy3d-design-notes.md#where-the-camera-actually-looks
        const scratch = canvas2d(W, H);
        const sctx = scratch.getContext('2d');

        function blob(c, x, y, r, colour, alpha, squash, rot) {
            for (const dx of [-W, 0, W]) {
                c.save();
                c.translate(x + dx, y);
                c.rotate(rot || 0);
                c.scale(1, squash === undefined ? 1 : squash);
                const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
                g.addColorStop(0, rgba(colour, alpha));
                g.addColorStop(0.35, rgba(colour, alpha * 0.6));
                g.addColorStop(0.68, rgba(colour, alpha * 0.2));
                g.addColorStop(1, rgba(colour, 0));
                c.fillStyle = g;
                c.beginPath();
                c.arc(0, 0, r, 0, Math.PI * 2);
                c.fill();
                c.restore();
            }
        }

        sctx.globalCompositeOperation = 'lighter';
        // Two families only — one cold indigo/teal, one bronze — because a sky
        // with five hues reads as a screensaver. Each mass now gets a bright
        // CORE and a pair of smaller satellite knots, so a nebula is a structure
        // with an inside rather than one blurred lobe.
        const masses = [
            [0.60, 0.38, 300, [40, 84, 122], 0.15],
            [0.70, 0.62, 340, [104, 66, 40], 0.13],
            [0.82, 0.44, 280, [116, 74, 42], 0.12],
            [0.90, 0.66, 320, [34, 78, 120], 0.14],
            [0.66, 0.72, 260, [58, 50, 104], 0.11],
            [0.78, 0.30, 300, [44, 72, 110], 0.10]
        ];
        function drawMasses() {
        masses.forEach(([u, v, r, colour, a], i) => {
            const rot = hash2(i, 61, 3) * Math.PI;
            blob(sctx, u * W, v * H, r, colour, a, 0.55 + hash2(i, 67, 4) * 0.5, rot);
            blob(sctx, u * W + 40, v * H - 26, r * 0.5,
                colour.map(c => Math.min(255, c * 1.5)), a * 0.55, 0.75, rot + 0.6);
            for (let k = 0; k < 3; k++) {
                const ang = hash2(i * 7 + k, 71, 12) * Math.PI * 2;
                const rad = r * (0.30 + hash2(i * 7 + k, 73, 13) * 0.55);
                blob(sctx, u * W + Math.cos(ang) * rad, v * H + Math.sin(ang) * rad * 0.6,
                    r * (0.16 + hash2(i * 7 + k, 79, 14) * 0.2),
                    colour.map(c => Math.min(255, c * 1.85)), a * 0.5,
                    0.5 + hash2(i * 7 + k, 83, 15) * 0.7, ang);
            }
        });
        }
        /** THE GRADIENTS ARE BAND-LIMITED BEFORE THEY ARE MAGNIFIED. Full rationale: docs/galaxy3d-design-notes.md#the-gradients-are-band-limited-before-they-are-magnified */
        let neb, img, px, warpF, clumpF, laneF, warmF, absorbF;
        function prepare() {
        neb = boxBlurWrapX(sctx.getImageData(0, 0, W, H).data, W, H, 2);

        // ---- Pass 2: everything else, evaluated per texel.
        img = ctx.createImageData(W, H);
        px = img.data;
        // Multi-octave layers off coarse grids: these vary over a tenth of the
        // sky, so a 1:8 grid with bilinear resampling is exact enough and about
        // sixty times cheaper than a per-texel fbm.
        warpF = coarseField(64, 0.14, 3, 2);
        clumpF = coarseField(128, 0.10, 9, 3);
        laneF = coarseField(128, 0.13, 131, 3);
        warmF = coarseField(64, 0.09, 21, 2);
        // Dark absorption is what the previous sky had none of, and it is the
        // difference between a nebula and an airbrush stripe: cold dust in FRONT
        // of the glow, in filaments rather than blobs.
        absorbF = coarseField(192, 0.20, 907, 3);
        }

        function paintRows(y0, y1) {
        for (let y = y0; y < y1; y++) {
            const t = y / H;
            // A value gradient from deep sky at the top to the lit floor of the
            // galaxy below. The frame needs a RAMP behind the board; a flat fill
            // of any value reads as a hole.
            const ramp = Math.max(0, (t - 0.30) / 0.55);
            const base = 7 + Math.pow(ramp, 1.2) * 24;
            for (let x = 0; x < W; x++) {
                const u = x / W;
                const warp = (warpF(u, 0.35) - 0.5) * 0.075;
                // Centred at 0.60 — low in the visible window, so the plane sits
                // BEHIND AND BELOW the board rather than across it. The board has
                // to stay the brightest thing in the frame, and a bright band
                // through the middle of the screen is the fastest way to lose it.
                const band = Math.exp(-Math.pow((t - (0.60 + warp)) / 0.115, 2));
                const clump = clumpF(u, t);
                const lit = band * (0.55 + clump * 0.75);
                // Dust lanes: the dark clouds in front of the plane. The filament
                // detail these used to carry was a 7-texel noise, i.e. a 105px
                // ripple on screen; the structure now comes from absorbF, which
                // is a coarse field and cannot resolve a grid.
                const lane = laneF(u, t);
                const cut = 1 - Math.max(0, (lane - 0.50) * 1.7) * band * 1.25
                    - Math.max(0, (absorbF(u, t) - 0.54) * 2.4) * (0.35 + band * 0.55) * 0.90;

                const warmth = warmF(u, t);
                const i = (y * W + x) * 4;
                // These coefficients are CALIBRATED, not chosen: a texel here is. Full rationale: docs/galaxy3d-design-notes.md#these-coefficients-are-calibrated-not-chosen-a-texel-here-is
                const na = neb[i + 3] / 255;
                const r = (base * 0.72 + lit * 38 * (0.62 + warmth * 0.6)) * cut + neb[i] * na;
                const g = (base * 0.84 + lit * 36 * (0.66 + warmth * 0.34)) * cut + neb[i + 1] * na;
                const b = (base * 1.24 + lit * 35 * (0.92 - warmth * 0.22)) * cut + neb[i + 2] * na;
                // NO DITHER HERE. It was quantisation noise at the texel grid,
                // which is the one frequency this image may not contain (see
                // above). The 8-bit contouring it was fighting is dithered in
                // SCREEN space now, at the end of the composer, where a level is
                // a pixel instead of a fifteen-pixel diamond.
                px[i] = Math.max(0, Math.min(255, r));
                px[i + 1] = Math.max(0, Math.min(255, g));
                px[i + 2] = Math.max(0, Math.min(255, b));
                px[i + 3] = 255;
            }
        }
        }

        let phase = 0;
        let row = 0;
        return {
            /** One slice. True while there is more to do. */
            step() {
                if (phase === 0) { drawMasses(); phase = 1; return true; }
                if (phase === 1) { prepare(); phase = 2; return true; }
                const end = Math.min(H, row + SKY_ROWS_PER_STEP);
                paintRows(row, end);
                row = end;
                return row < H;
            },
            finish() {
                ctx.putImageData(img, 0, 0);
                const tex = toTex(canvas, THREE.SRGBColorSpace);
                tex.wrapS = THREE.RepeatWrapping;
                return tex;
            }
        };
    }

    /** The whole sky in one call, for any caller that is not being paced. */
    function buildSkyTexture() {
        const job = beginSkyTexture();
        while (job.step()) { /* everything, now */ }
        return job.finish();
    }

    /**
     * The paced version, driven by the boot schedule: one slice a frame until the
     * dome exists. Returns 'again' while there is more, which is what tells
     * runBootStep() to come back to this step rather than move past it.
     */
    let skyJob = null;

    function skyTextureStep() {
        if (state.textures.has('sky')) return undefined;
        if (!skyJob) skyJob = beginSkyTexture();
        if (skyJob.step()) return 'again';
        state.textures.set('sky', skyJob.finish());
        skyJob = null;
        return undefined;
    }

    /** A tiny studio probe for the metal. Full rationale: docs/galaxy3d-design-notes.md#a-tiny-studio-probe-for-the-metal */
    function buildStudioEnvTexture() {
        const W = 256, H = 128;
        const canvas = canvas2d(W, H);
        const ctx = canvas.getContext('2d');
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#20293f');
        sky.addColorStop(0.5, '#0d1220');
        sky.addColorStop(1, '#05070d');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        function lobe(u, v, r, colour, a) {
            const g = ctx.createRadialGradient(u * W, v * H, 0, u * W, v * H, r);
            g.addColorStop(0, rgba(colour, a));
            g.addColorStop(0.5, rgba(colour, a * 0.4));
            g.addColorStop(1, rgba(colour, 0));
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }
        lobe(0.28, 0.18, 82, [255, 236, 202], 0.92);   // warm key
        lobe(0.74, 0.34, 96, [96, 132, 214], 0.44);    // cool fill
        lobe(0.5, 0.92, 120, [30, 40, 60], 0.5);       // ground bounce
        // A HORIZON EDGE. A probe made only of soft lobes reflects as a soft
        // wash, which is what a plastic does; steel wants something with a
        // BOUNDARY in it, so a curved chamfer sweeps a bright band across as it
        // turns. This is the studio's light bar.
        ctx.globalCompositeOperation = 'lighter';
        const bar = ctx.createLinearGradient(0, H * 0.24, 0, H * 0.40);
        bar.addColorStop(0, 'rgba(180,200,236,0)');
        bar.addColorStop(0.45, 'rgba(196,214,246,0.55)');
        bar.addColorStop(0.55, 'rgba(196,214,246,0.55)');
        bar.addColorStop(1, 'rgba(180,200,236,0)');
        ctx.fillStyle = bar;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        const tex = toTex(canvas, THREE.SRGBColorSpace);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        return tex;
    }

    /** One probe for the whole scene: the plates sample it, so do rocks and hulls. */
    function studioEnvTexture() {
        return cachedTexture('studioEnv', buildStudioEnvTexture);
    }

    /** The near dust the board floats in: a world-space sheet under the tiles that. Full rationale: docs/galaxy3d-design-notes.md#the-near-dust-the-board-floats-in-a-world-space-sheet-under- */
    function buildNearNebulaTexture() {
        const S = 384;
        const canvas = canvas2d(S, S);
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(S, S);
        const px = img.data;
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const n = fbm2(x / 52, y / 52, 613, 3);
                const m = fbm2(x / 18 + 11, y / 18 - 7, 811, 2);
                const v = Math.max(0, Math.min(1, (n - 0.30) * 1.9)) * (0.5 + m * 0.72);
                // Two-hue mix: BRONZE where the mass is dense, indigo at the
                // fringe. The previous warm end was (224,176,164) — salmon, which
                // is nowhere in the briefed palette and, since this sheet is what
                // shows through the gaps between plates, it was tinting the whole
                // deck pink.
                const warm = Math.max(0, Math.min(1, (n - 0.5) * 3));
                const i = (y * S + x) * 4;
                px[i] = 60 + warm * 140;
                px[i + 1] = 80 + warm * 76;
                px[i + 2] = 142 - warm * 42;
                px[i + 3] = Math.max(0, Math.min(255, v * 255));
            }
        }
        ctx.putImageData(img, 0, 0);
        const tex = toTex(canvas, THREE.SRGBColorSpace, true);
        // The sheets are nine board-widths across so their own edges never enter
        // the frustum; the pattern repeats to keep the feature scale sane at that
        // size. Both sheets share this transform and still differ on screen,
        // because they sit at different world scales and rotations.
        tex.repeat.set(3.2, 3.2);
        return tex;
    }

    function buildStarPointTexture() {
        return buildRadialTexture('starpoint', [
            [0, [255, 255, 255], 1],
            [0.25, [255, 255, 255], 0.72],
            [0.55, [255, 255, 255], 0.16],
            [1, [255, 255, 255], 0]
        ], 64);
    }

    /** The brightest few dozen stars, with a DIFFRACTION CROSS. Full rationale: docs/galaxy3d-design-notes.md#the-brightest-few-dozen-stars-with-a-diffraction-cross */
    function buildBrightStarTexture() {
        return cachedTexture('brightstar', () => {
            const S = 128, c = S / 2;
            const canvas = canvas2d(S, S);
            const ctx = canvas.getContext('2d');
            ctx.globalCompositeOperation = 'lighter';
            // The spikes: two tapered bars, drawn as gradients so they fade out
            // instead of ending.
            for (const rot of [0, Math.PI / 2]) {
                ctx.save();
                ctx.translate(c, c);
                ctx.rotate(rot);
                const g = ctx.createLinearGradient(-c, 0, c, 0);
                g.addColorStop(0, 'rgba(255,255,255,0)');
                g.addColorStop(0.34, 'rgba(255,255,255,0.10)');
                g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
                g.addColorStop(0.66, 'rgba(255,255,255,0.10)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = g;
                ctx.fillRect(-c, -1.1, S, 2.2);
                ctx.restore();
            }
            // The core.
            const rg = ctx.createRadialGradient(c, c, 0, c, c, c * 0.42);
            rg.addColorStop(0, 'rgba(255,255,255,1)');
            rg.addColorStop(0.24, 'rgba(255,255,255,0.72)');
            rg.addColorStop(0.55, 'rgba(255,255,255,0.16)');
            rg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = rg;
            ctx.fillRect(0, 0, S, S);
            return toTex(canvas, THREE.SRGBColorSpace);
        });
    }

    /** Stars as points, with a real colour-temperature spread and a heavy-tailed. Full rationale: docs/galaxy3d-design-notes.md#stars-as-points-with-a-real-colour-temperature-spread-and-a- */
    function buildStarPoints(count, opts) {
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            if (opts.shell) {
                // Bias toward the lower hemisphere: the camera looks down, so that
                // is where the sky actually shows.
                const u = hash2(i, 2, opts.seed) * 2 - 1;
                const phi = hash2(i, 3, opts.seed) * Math.PI * 2;
                const y = -Math.abs(u) * 0.85 - 0.08;
                const r = Math.sqrt(Math.max(0, 1 - y * y));
                positions[i * 3] = Math.cos(phi) * r * opts.shell;
                positions[i * 3 + 1] = y * opts.shell;
                positions[i * 3 + 2] = Math.sin(phi) * r * opts.shell;
            } else {
                positions[i * 3] = (hash2(i, 5, opts.seed) - 0.5) * opts.spreadX + state.center.x;
                positions[i * 3 + 1] = -6 - hash2(i, 7, opts.seed) * 34;
                positions[i * 3 + 2] = (hash2(i, 11, opts.seed) - 0.5) * opts.spreadZ + state.center.z;
            }
            // COLOUR TEMPERATURE, as a continuum rather than five buckets: a
            // Planckian-ish ramp from 0xbcd4ff (hot B/A) through white to
            // 0xffd9a0 and on to a cool ember, weighted so most of the field is
            // in the warm half exactly as a real magnitude-limited sample is.
            const cls = Math.pow(hash2(i, 13, opts.seed), 1.35);
            const ramp = [
                [1.00, 0.66, 0.48],
                [1.00, 0.85, 0.63],
                [1.00, 0.96, 0.86],
                [0.93, 0.96, 1.00],
                [0.74, 0.83, 1.00]
            ];
            const fi = cls * (ramp.length - 1);
            const i0 = Math.min(ramp.length - 2, fi | 0);
            const ft = fi - i0;
            const colour = [
                ramp[i0][0] + (ramp[i0 + 1][0] - ramp[i0][0]) * ft,
                ramp[i0][1] + (ramp[i0 + 1][1] - ramp[i0][1]) * ft,
                ramp[i0][2] + (ramp[i0 + 1][2] - ramp[i0][2]) * ft
            ];
            const mag = Math.pow(hash2(i, 17, opts.seed), opts.tail || 3.4);
            const lum = (opts.dim || 0.14) + mag * (opts.gain || 1.5);
            colors[i * 3] = colour[0] * lum;
            colors[i * 3 + 1] = colour[1] * lum;
            colors[i * 3 + 2] = colour[2] * lum;
            sizes[i] = (opts.size || 0.2) * (0.45 + mag * 1.9);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Per-point size needs a shader; PointsMaterial only has one global size,
        // and a starfield where every star is the same size is the single loudest
        // "this is procedural" tell there is.
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uMap: { value: opts.bright ? buildBrightStarTexture() : buildStarPointTexture() },
                uScale: { value: 300 },
                uAtten: { value: opts.shell ? 0 : 1 },
                uMin: { value: opts.bright ? 5.0 : 1.7 },
                uMax: { value: opts.bright ? 26.0 : 8.0 }
            },
            vertexShader: [
                'attribute float size;',
                'varying vec3 vColor;',
                'uniform float uScale;',
                'uniform float uAtten;',
                'uniform float uMin;',
                'uniform float uMax;',
                'void main() {',
                '  vColor = color;',
                '  vec4 mv = modelViewMatrix * vec4( position, 1.0 );',
                '  gl_Position = projectionMatrix * mv;',
                '  float atten = mix( 1.0, uScale / max( 1.0, -mv.z ), uAtten );',
                // Floor at 1.7, not 1.0. FXAA runs after tone mapping and treats
                // a lone sub-pixel dot as an edge artefact to be smoothed away —
                // at a one-pixel footprint the entire deep field was being erased
                // by our own anti-aliasing. Clamped above too: a point that drifts
                // near the near plane otherwise inflates into a fifty-pixel
                // smudge, which is the one failure a starfield cannot survive.
                '  gl_PointSize = clamp( size * atten, uMin, uMax );',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D uMap;',
                'varying vec3 vColor;',
                'void main() {',
                // No discard. Additive blending already makes a zero sample
                // invisible, and discard defeats early-z for the whole pass —
                // an expensive way to buy nothing across four thousand sprites.
                '  float a = texture2D( uMap, gl_PointCoord ).a;',
                '  gl_FragColor = vec4( vColor * a, a );',
                '}'
            ].join('\n'),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        });
        const points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        return points;
    }

    function buildBackdrop() {
        const backdrop = new THREE.Group();
        backdrop.renderOrder = -100;

        // Infinitely-distant dome. depthTest off + renderOrder well below
        // everything else so it is unambiguously the backdrop.
        const sky = new THREE.Mesh(
            // 64x48, not 40x24. The dome is magnified about eight times and the
            // texture is interpolated ACROSS the triangles, so at 7.5 degrees per
            // ring the gradient was being reconstructed from three spans over the
            // whole visible height and picked up visible faceting.
            new THREE.SphereGeometry(1, 64, 48),
            new THREE.MeshBasicMaterial({
                map: cachedTexture('sky', buildSkyTexture),
                side: THREE.BackSide,
                depthWrite: false,
                depthTest: false,
                fog: false,
                /** THE SKY MUST CARRY ITS OWN DITHER. Full rationale: docs/galaxy3d-design-notes.md#the-sky-must-carry-its-own-dither */
                dithering: true
            })
        );
        sky.scale.setScalar(400);
        // Tilt the dome by the camera's own fixed pitch so the view centre lands
        // on the dome's EQUATOR instead of two degrees off its pole. Solving
        // R_x(-a) . (0, -0.879, -0.478) for y = 0 gives a = -1.072 rad; the same
        // rig constant (camOffset 0.92/0.5) that fixes the pitch fixes this.
        sky.rotation.x = -1.072;
        sky.renderOrder = -100;
        sky.frustumCulled = false;
        backdrop.add(sky);

        // The stars are POINTS, not painted into the dome: at eight times
        // magnification a painted star is a smudge, and a point sprite is exactly
        // one pixel of core no matter how close the camera gets.
        const deepStars = buildStarPoints(3400, { shell: 340, seed: 5, size: 4.2, dim: 0.16, gain: 2.1 });
        deepStars.renderOrder = -99;
        backdrop.add(deepStars);

        // The heavy tail of the magnitude distribution, as its own layer: ~70
        // stars at three to four times the size, carrying a diffraction cross.
        // A field where every star is the same size has no distribution in it,
        // and these are the anchors the eye uses to believe the rest.
        const brightStars = buildStarPoints(70, {
            shell: 330, seed: 61, size: 15, dim: 0.5, gain: 2.4, tail: 1.5, bright: true
        });
        brightStars.renderOrder = -98;
        backdrop.add(brightStars);

        state.backdrop = { group: backdrop, sky, deepStars, brightStars };
        state.scene.add(backdrop);

        // Near layers live in world space so they parallax when the board is. Full rationale: docs/galaxy3d-design-notes.md#near-layers-live-in-world-space-so-they-parallax-when-the-bo
        const spreadX = state.width * HORIZ * 9;
        const spreadZ = state.height * VERT * 9;

        const nebula = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                map: cachedTexture('nearNebula', buildNearNebulaTexture),
                transparent: true,
                // This is the layer that puts a value under the whole frame, not. Full rationale: docs/galaxy3d-design-notes.md#this-is-the-layer-that-puts-a-value-under-the-whole-frame-no
                opacity: 0.085,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            })
        );
        nebula.rotation.x = -Math.PI / 2;
        nebula.position.set(state.center.x, -9, state.center.z);
        nebula.scale.set(spreadX, spreadZ, 1);
        nebula.renderOrder = -60;
        state.scene.add(nebula);

        // A second sheet, higher, at a different scale and rotation: two layers
        // at different parallax depths is what stops the near dust from reading
        // as one printed backdrop sliding behind the board.
        const nebula2 = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                map: cachedTexture('nearNebula', buildNearNebulaTexture),
                transparent: true,
                opacity: 0.055,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            })
        );
        nebula2.rotation.x = -Math.PI / 2;
        nebula2.rotation.z = 1.1;
        nebula2.position.set(state.center.x - 6, -4.2, state.center.z + 4);
        nebula2.scale.set(spreadX * 0.78, spreadZ * 0.78, 1);
        nebula2.renderOrder = -59;
        state.scene.add(nebula2);

        const dust = buildStarPoints(900, {
            spreadX, spreadZ, seed: 23, size: 0.24, dim: 0.2, gain: 2.0
        });
        dust.renderOrder = -50;
        state.scene.add(dust);

        state.backdrop.nebula = nebula;
        state.backdrop.nebula2 = nebula2;
        state.backdrop.dust = dust;
    }

    // ------------------------------------------------------------------
    // Sector content
    // ------------------------------------------------------------------

    function disposeContent(entry) {
        if (!entry.content) return;
        entry.group.remove(entry.content);
        entry.content.traverse(obj => {
            // An InstancedMesh owns per-instance buffers on top of its (shared)
            // geometry, and only dispose() frees those.
            if (obj.isInstancedMesh) obj.dispose();
            if (obj.geometry && !Object.values(state.sharedGeo).includes(obj.geometry)) obj.geometry.dispose();
            if (obj.material && !obj.material.__shared) {
                if (obj.material.map && !obj.material.map.__shared) obj.material.map.dispose?.();
                obj.material.dispose();
            }
        });
        entry.content = null;
    }

    /** Where a world should be lit FROM: the nearest visible star, else the key light. */
    function lightTargetFor(entry) {
        if (!state.starSectors.length) return null;
        let best = null;
        let bestDist = Infinity;
        const p = entry.group.position;
        for (const star of state.starSectors) {
            const d = (star.x - p.x) * (star.x - p.x) + (star.z - p.z) * (star.z - p.z);
            if (d < bestDist) { bestDist = d; best = star; }
        }
        // Beyond about five tiles a star stops being "this system's sun" and the
        // shading it implies reads as arbitrary.
        return bestDist <= (HORIZ * 5) * (HORIZ * 5) ? best : null;
    }

    function applyPlanetLighting(entry) {
        const world = entry.content && entry.content.userData.world;
        if (!world) return;
        const target = lightTargetFor(entry);
        if (target) {
            world.userData.setLightTarget({ x: target.x, y: 1.2, z: target.z });
        } else {
            world.userData.setLightDirection(0.55, 0.5, 0.67);
        }
    }

    function refreshPlanetLighting() {
        state.sectors.forEach(entry => applyPlanetLighting(entry));
    }

    function buildPlanet(entry) {
        const group = new THREE.Group();
        const type = Math.max(5, Math.min(10, Number(entry.type) || 8));
        const style = PLANET_STYLES[type] || PLANET_STYLES[7];
        // ONE DEFINITION OF WHAT A WORLD OF THIS CLASS IS — worldOptions(). It
        // moved out of this call because the forge thread has to generate with
        // exactly the options the main thread would have used, and two copies of
        // a tuning table is precisely how a forged world and a locally built one
        // end up looking like different planets. Every number in it is annotated
        // there.
        const opts = worldOptions(type, entry.id);
        const radius = opts.radius;
        // The shared generator carries its own key light, terminator, ocean
        // specular, night lights and atmosphere shell — a self-lit body rather
        // than a textured ball under whatever the scene's lights happen to be.
        // Forged on the second thread when its class has been baked there, built
        // here when it has not. Same generator either way.
        const world = makeWorld(type, entry.id, opts);
        /** 0.44, NOT 0.66 — AND THE SPAR BELOW. Full rationale: docs/galaxy3d-design-notes.md#0-44-not-0-66-and-the-spar-below */
        world.position.y = 0.44;
        group.add(world);
        group.userData.world = world;

        /** NO MOUNTING SPAR, DELIBERATELY. Full rationale: docs/galaxy3d-design-notes.md#no-mounting-spar-deliberately */

        /** A CONTACT SHADOW, PROJECTED ALONG THE KEY. Full rationale: docs/galaxy3d-design-notes.md#a-contact-shadow-projected-along-the-key */
        const drop = Math.max(0, world.position.y - TILE_TOP);
        const shadow = new THREE.Mesh(
            state.sharedGeo.shadowQuad,
            new THREE.MeshBasicMaterial({
                map: contactShadowTexture(),
                color: 0x000000,
                transparent: true,
                // The shadow texture's own core is 0.55 alpha, so this is the
                // multiplier on that: at 0.52 the effective core was 0.29 and the
                // world went back to floating. A body this close to a strongly
                // key-lit deck occludes nearly all of the key.
                opacity: 0.85,
                depthWrite: false
            })
        );
        shadow.position.set(
            -(KEY_LIGHT_DIR.x / KEY_LIGHT_DIR.y) * drop * 0.75,
            TILE_TOP + 0.004,
            -(KEY_LIGHT_DIR.z / KEY_LIGHT_DIR.y) * drop * 0.75
        );
        // Major axis along the light's ground bearing; a rotation of phi about. Full rationale: docs/galaxy3d-design-notes.md#major-axis-along-the-light-s-ground-bearing-a-rotation-of-ph
        shadow.scale.set(radius * 2.35, radius * 1.5, 1);
        shadow.rotation.y = Math.atan2(-KEY_LIGHT_DIR.z, KEY_LIGHT_DIR.x);
        shadow.renderOrder = 2;
        group.add(shadow);

        // The homeworld used to carry an additive orbital band here. Seen from the
        // map's fixed 61-degree camera it was never read as a ring — it read as a
        // soft cream disc a third again the size of the planet, i.e. as exactly
        // the wash the art direction rejects, and once the plate was no longer
        // being blown out by bloom it was the last thing still smearing the tile.
        // A homeworld is already marked by its gold plate and its size.

        // Ground light: the world throws a faint pool onto its own plate, which
        // is what stops it from looking pasted on. WIDE AND FAINT — at 0.9 scale
        // and 0.16 it was a cream disc that blew the centre of the plate out and
        // took the brushed grain, the tray and the rivets with it. A pool is a
        // falloff away from the body, not an even lift.
        const pool = new THREE.Mesh(
            state.sharedGeo.decal,
            new THREE.MeshBasicMaterial({
                map: glowTexture(style.atmo || [150, 180, 230]),
                transparent: true,
                opacity: 0.05,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        pool.position.y = TILE_TOP + 0.003;
        pool.scale.setScalar(1.15);
        // BEFORE the contact shadow, not after: the pool is the world's own
        // bounce onto the deck and the shadow is the key being blocked. Drawn in
        // the other order the additive pool washes the shadow back out and the
        // planet goes back to floating.
        pool.renderOrder = 1;
        group.add(pool);
        return group;
    }

    /** A black hole is instant fleet death, so it has to be the most unmistakable. Full rationale: docs/galaxy3d-design-notes.md#a-black-hole-is-instant-fleet-death-so-it-has-to-be-the-most */
    function buildBlackHole(entry) {
        const group = new THREE.Group();
        const y = 0.66;

        // The horizon: opaque black, and it WRITES DEPTH, so the disc behind it
        // is genuinely occluded rather than glowing through.
        const core = new THREE.Mesh(
            state.sharedGeo.sphere,
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        core.scale.setScalar(0.21);
        core.position.y = y;
        core.renderOrder = 3;
        group.add(core);

        // Photon ring: thin, hot, and always a circle from the camera's point of
        // view, which is exactly how the real thing behaves.
        const photon = new THREE.Mesh(
            state.sharedGeo.photonRing,
            new THREE.MeshBasicMaterial({
                color: new THREE.Color(3.2, 2.5, 4.4),
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        photon.position.y = y;
        photon.scale.setScalar(0.235);
        photon.renderOrder = 4;
        photon.userData.billboard = true;
        group.add(photon);

        const disc = new THREE.Mesh(
            state.sharedGeo.disc,
            new THREE.MeshBasicMaterial({
                map: cachedTexture('accretion', buildAccretionTexture),
                transparent: true,
                opacity: 1,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        disc.rotation.x = -Math.PI / 2.5;
        disc.rotation.z = 0.5;
        disc.position.y = y;
        disc.scale.setScalar(0.82);
        disc.userData.spin = -1.1;
        disc.renderOrder = 2;
        group.add(disc);

        // Infalling debris: a second, wider, slower, fainter sheet at a different
        // inclination. Two discs is the difference between "a ring" and "a well".
        const halo = new THREE.Mesh(
            state.sharedGeo.disc,
            new THREE.MeshBasicMaterial({
                map: cachedTexture('accretion', buildAccretionTexture),
                transparent: true,
                opacity: 0.34,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        halo.rotation.x = -Math.PI / 2.05;
        halo.rotation.z = -0.9;
        halo.position.y = y;
        halo.scale.setScalar(1.25);
        halo.userData.spin = -0.55;
        halo.renderOrder = 1;
        group.add(halo);
        group.userData.farOnly = halo;

        // The well: the plate itself is dragged down to nothing under the hole.
        const well = new THREE.Mesh(
            state.sharedGeo.decal,
            new THREE.MeshBasicMaterial({
                map: contactShadowTexture(),
                color: 0x000000,
                transparent: true,
                opacity: 0.95,
                depthWrite: false
            })
        );
        well.position.y = TILE_TOP + 0.004;
        well.scale.setScalar(1);
        well.renderOrder = 2;
        group.add(well);
        return group;
    }

    /** Accretion disc. Painted per-pixel because the three things that make it. Full rationale: docs/galaxy3d-design-notes.md#accretion-disc-painted-per-pixel-because-the-three-things-th */
    function buildAccretionTexture() {
        const S = 384;
        const canvas = canvas2d(S, S);
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(S, S);
        const px = img.data;
        const half = S / 2;
        const inner = 0.30, outer = 0.98;
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const dx = (x - half) / half;
                const dy = (y - half) / half;
                const r = Math.sqrt(dx * dx + dy * dy);
                const i = (y * S + x) * 4;
                if (r < inner || r > outer) { px[i + 3] = 0; continue; }
                const t = (r - inner) / (outer - inner);
                const theta = Math.atan2(dy, dx);
                // Shear: streaks that wind up as they fall inward.
                const wind = theta * 2.4 + (1 - t) * 9;
                const streak = 0.55 + 0.45 * fbm2(Math.cos(wind) * 4 + r * 9, Math.sin(wind) * 4, 71, 2);
                // Relativistic beaming: the limb coming toward the camera is much
                // brighter than the one going away.
                const doppler = 0.28 + 1.5 * Math.pow(Math.max(0, Math.cos(theta - 0.6)), 2.0);
                // Temperature: white-blue at the inner edge, bronze at the rim.
                const hot = Math.pow(1 - t, 2.1);
                const cr = 90 + hot * 165 + (1 - hot) * 120;
                const cg = 40 + hot * 195;
                const cb = 60 + hot * 195;
                // Falls off from the ISCO outward, but slowly: the physically
                // tidy pow(1-t, 1.5) put almost all of the light inside the
                // first tenth of the disc and at map zoom the whole structure
                // collapsed to a bright arc with nothing around it.
                const a = Math.pow(1 - t, 0.85) * streak * doppler;
                const edge = Math.min(1, (r - inner) / 0.05);
                px[i] = Math.min(255, cr * Math.min(1.6, doppler));
                px[i + 1] = Math.min(255, cg * Math.min(1.4, doppler));
                px[i + 2] = Math.min(255, cb);
                px[i + 3] = Math.max(0, Math.min(255, a * 255 * edge));
            }
        }
        ctx.putImageData(img, 0, 0);
        return toTex(canvas, THREE.SRGBColorSpace);
    }

    /**
     * An asteroid belt draws three groups, from these three variants of the
     * sector id. forgeKeysOf() asks the forge for exactly this set, so the two
     * cannot disagree about which maps a belt is waiting on.
     */
    const ROCK_GROUPS = [0, 2, 4];

    /** An asteroid belt, not a decorative ring of grey lumps. Full rationale: docs/galaxy3d-design-notes.md#an-asteroid-belt-not-a-decorative-ring-of-grey-lumps */
    /** One rock material per variant, kept for the life of the page. */
    function rockMaterial(variant) {
        const key = `rock:${variant}`;
        if (!state.materials.has(key)) {
            const v = Math.abs(Number(variant) || 0) % 6;
            const opts = {
                // 1.75, not 1.15. The generator's normal map carries real crater
                // relief and at just over unity it was being applied gently
                // enough that a 30px rock came back as a flat dark lump — the
                // "clumps of coffee grounds" read. Above 1.5 the craters throw
                // their own terminators and the rock has an inside.
                normalScale: 1.75,
                // Rocks sit on a BRONZE plate now, and at their own albedo they
                // read as dark stains on it rather than as solids above it. The
                // tint lifts them off the tile without touching the relief the
                // normal map is doing all the work with. Per variant, so a belt
                // is not six copies of one mineral: two dark carbonaceous, two
                // mid, two pale silicate.
                color: [0x9a9186, 0xd2cabb, 0xb0a898, 0x8e867c, 0xc8bfae, 0xa39a8d][v]
            };
            /**
             * The three maps come from the forge when the forge has them.
             *
             * This is the whole of a belt's cost: paintAsteroid() measured 29-81
             * ms PER VARIANT and a belt draws three of them, so every first belt
             * was a 130-160 ms freeze in a 12 ms budget. The maps are the same
             * maps either way; all that changes is which thread painted them.
             */
            const forged = state.worldBundles.get(rockKey(variant));
            const mat = forged && forged.textures && forged.textures.map
                ? new THREE.MeshStandardMaterial({
                    map: forged.textures.map,
                    normalMap: forged.textures.normal,
                    roughnessMap: forged.textures.orm,
                    color: opts.color
                })
                : createAsteroidMaterial(variant, opts);
            mat.normalScale.set(opts.normalScale, opts.normalScale);
            mat.__shared = true;
            // Roughness VARIANCE. The generator ships a roughness map, but with
            // material.roughness pinned at 1 the map's whole range is compressed
            // into the top of the scale and every rock answers the key light the
            // same way. Spreading the multiplier per variant is what lets a
            // couple of them catch a specular edge and read as fresh fracture
            // against the weathered ones.
            mat.roughness = [1.0, 0.72, 0.88, 1.0, 0.66, 0.82][v];
            mat.metalness = v % 3 === 1 ? 0.16 : 0.05;
            // The rocks are the one place in this scene where an image-based
            // reflection is cheap (a few hundred pixels) and worth it: it is
            // what gives an unlit facet a colour instead of a hole.
            mat.envMapIntensity = 0.8;
            state.materials.set(key, mat);
        }
        return state.materials.get(key);
    }

    /** How far the plate's own surface extends along a bearing. Full rationale: docs/galaxy3d-design-notes.md#how-far-the-plate-s-own-surface-extends-along-a-bearing */
    const HEX_INRADIUS = TILE_R * Math.cos(Math.PI / 6);
    function hexReachAt(theta) {
        const sixth = Math.PI / 3;
        let a = theta % sixth;
        if (a < 0) a += sixth;
        return HEX_INRADIUS / Math.cos(a - sixth / 2);
    }

    function buildAsteroids(entry) {
        const group = new THREE.Group();
        const seed = (Number(entry.id) || 1) * 2654435761 % 2147483647;
        const rand = seededRandom(seed);
        const belt = new THREE.Group();
        const anchors = [];

        // Clumps: real belts are not uniform, and a handful of attractors kills
        // the clock-face read without making the field look staged. They are
        // spaced rather than drawn freely, because three free draws land on top
        // of each other about a third of the time and the belt collapses into
        // one corner of the tile.
        const clumps = [];
        const clumpBase = rand() * Math.PI * 2;
        for (let i = 0; i < 4; i++) {
            clumps.push(clumpBase + (i / 4) * Math.PI * 2 + (rand() - 0.5) * 0.8);
        }

        const GROUPS = ROCK_GROUPS.length;
        const PER_GROUP = 9;
        for (let g = 0; g < GROUPS; g++) {
            // The variants forgeKeysOf() asked the forge for, in the same order.
            const variant = (Number(entry.id) + ROCK_GROUPS[g]) % ASTEROID_VARIANTS;
            const mesh = new THREE.InstancedMesh(
                createAsteroidGeometry(variant),
                rockMaterial(variant),
                PER_GROUP
            );
            mesh.frustumCulled = false;
            const m = new THREE.Matrix4();
            const q = new THREE.Quaternion();
            const e = new THREE.Euler();
            const pos = new THREE.Vector3();
            const scl = new THREE.Vector3();
            for (let i = 0; i < PER_GROUP; i++) {
                let angle;
                if (rand() < 0.66) {
                    angle = clumps[(g * PER_GROUP + i) % clumps.length] + (rand() - 0.5) * 1.3;
                } else {
                    angle = rand() * Math.PI * 2;
                }
                // KEEP THE NAMEPLATE WEDGE CLEAR. The sector code is now a decal
                // lying on the plate at its lower edge (+Z), and the old label
                // was a depth-test-disabled billboard precisely because rocks
                // buried it. Rocks are pushed out of a 50-degree wedge around
                // +Z instead — a belt with a lane through it is what the plate's
                // own stencil already advertises, so this costs nothing.
                const toPlate = Math.atan2(1, 0);
                let delta = angle - toPlate;
                delta = Math.atan2(Math.sin(delta), Math.cos(delta));
                if (Math.abs(delta) < 0.44) angle = toPlate + Math.sign(delta || 1) * 0.44;
                // Radius as a spread about the belt line, not a fixed circle.
                let dist = 0.34 + (rand() + rand() - 1) * 0.18;
                // A LOW disc. At 0.42 the oblique camera threw a contained rock
                // back out over the plate edge through parallax alone; there is
                // no clamp in the ground plane that can survive that, so the
                // field sits close to the plate it belongs to.
                const height = 0.27 + (rand() + rand() - 1) * 0.08 + Math.sin(angle) * 0.035;
                // Power law: mostly gravel, two anchors and two cobbles per
                // group. The anchors are deliberately the first instances so
                // that dropping the tail of the instance list at map zoom never
                // removes a rock that reads. Bigger than before, because at
                // 0.09 of a tile radius the largest body in a belt was 30px on
                // screen and a 30px lump cannot carry crater relief.
                const big = i < 2;
                const size = big
                    ? 0.115 + rand() * 0.062
                    : (i < 4 ? 0.052 + rand() * 0.03 : 0.018 + rand() * 0.03);
                // Containment against the HEXAGON, including the rock's own
                // radius: pull anything that would cross the tray back in along
                // its own bearing rather than dropping it, so the belt keeps its
                // density and only ever loses a little of its outer spread.
                const reach = hexReachAt(angle) * 0.80 - size * 1.15;
                if (dist > reach) dist = Math.max(0.12, reach);
                pos.set(Math.cos(angle) * dist, height, Math.sin(angle) * dist);
                e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28);
                q.setFromEuler(e);
                const sx = size * (0.8 + rand() * 0.5);
                const sy = size * (0.8 + rand() * 0.5);
                const sz = size * (0.8 + rand() * 0.5);
                scl.set(sx, sy, sz);
                m.compose(pos, q, scl);
                mesh.setMatrixAt(i, m);
                if (big) anchors.push({ x: pos.x, y: height, z: pos.z, r: Math.max(sx, sz) });
            }
            mesh.instanceMatrix.needsUpdate = true;
            mesh.userData.fullCount = PER_GROUP;
            mesh.userData.farCount = 4;
            belt.add(mesh);
        }
        belt.userData.spin = 0.12;
        group.add(belt);
        group.userData.belt = belt.children;

        // Dust between the rocks: the haze that makes a belt a hazard rather
        // than a handful of props.
        const haze = new THREE.Mesh(
            state.sharedGeo.decal,
            new THREE.MeshBasicMaterial({
                map: glowTexture([172, 146, 116]),
                transparent: true,
                opacity: 0.13,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        haze.position.y = 0.26;
        haze.scale.setScalar(1.0);
        haze.renderOrder = 2;
        group.add(haze);

        // A wide, faint occlusion base under the whole field. On its own — which
        // is what it was — twenty-seven rocks shared one offset blob and nothing
        // on the tile was grounded; the largest rock on the plate had no shadow
        // anywhere near it. This is now only the ambient darkening.
        const ao = new THREE.Mesh(
            state.sharedGeo.decal,
            new THREE.MeshBasicMaterial({
                map: contactShadowTexture(),
                color: 0x000000,
                transparent: true,
                opacity: 0.2,
                depthWrite: false
            })
        );
        ao.position.set(-0.05, TILE_TOP + 0.003, -0.04);
        ao.scale.setScalar(0.92);
        ao.renderOrder = 1;
        group.add(ao);

        // One shadow per ANCHOR rock, projected along the key light onto the
        // plate: the rock's own contact patch, which is the only thing that makes
        // it read as a solid above a surface rather than a dark cut-out sticker.
        // Higher rocks throw a wider, softer patch, exactly as a real penumbra
        // grows with separation.
        const L = KEY_LIGHT_DIR;
        anchors.forEach(a => {
            const drop = Math.max(0, a.y - TILE_TOP);
            const cast = new THREE.Mesh(
                state.sharedGeo.shadowQuad,
                new THREE.MeshBasicMaterial({
                    map: contactShadowTexture(),
                    color: 0x000000,
                    transparent: true,
                    opacity: Math.max(0.24, 0.66 - drop * 0.9),
                    depthWrite: false
                })
            );
            cast.position.set(
                a.x - (L.x / L.y) * drop,
                TILE_TOP + 0.005,
                a.z - (L.z / L.y) * drop
            );
            // Stretched ALONG the light's ground bearing, not a concentric blob:
            // a body lit from a 63-degree elevation throws an ellipse trailing
            // away from the key, and that asymmetry is what tells the eye the
            // rock is sitting on the tray rather than floating over it.
            const spread = a.r * (2.0 + drop * 1.4);
            cast.scale.set(spread * 1.55, spread, 1);
            cast.rotation.y = Math.atan2(-L.z, L.x);
            cast.renderOrder = 1;
            group.add(cast);
        });
        return group;
    }

    /** A real star: granulated limb-darkened photosphere, corona with streamers. Full rationale: docs/galaxy3d-design-notes.md#a-real-star-granulated-limb-darkened-photosphere-corona-with */
    /** The hot inner core: a tight falloff that is zero well inside the disc. */
    function starCoreTexture() {
        return buildRadialTexture('starcore', [
            [0, [255, 255, 255], 1],
            [0.16, [255, 252, 240], 0.92],
            [0.30, [255, 236, 198], 0.36],
            [0.42, [255, 222, 172], 0.06],
            [0.55, [255, 214, 160], 0],
            [1, [255, 214, 160], 0]
        ], 128);
    }

    /** The inner corona, as a limb-hugging RING rather than a disc. Full rationale: docs/galaxy3d-design-notes.md#the-inner-corona-as-a-limb-hugging-ring-rather-than-a-disc */
    function starLimbTexture() {
        return buildRadialTexture('starlimb', [
            [0, [255, 236, 200], 0.10],
            [0.22, [255, 232, 190], 0.30],
            [0.33, [255, 226, 176], 0.62],
            [0.40, [255, 200, 138], 0.34],
            [0.55, [255, 172, 104], 0.12],
            [0.78, [255, 150, 88], 0.03],
            [0.97, [255, 150, 88], 0],
            [1, [255, 150, 88], 0]
        ], 192);
    }

    /** Prominence loops: arcs of plasma standing off the limb. */
    function prominenceTexture() {
        return cachedTexture('prominence', () => {
            const S = 128;
            const canvas = canvas2d(S, S);
            const ctx = canvas.getContext('2d');
            ctx.globalCompositeOperation = 'lighter';
            /** A FILAMENT HAS A ROOT AND A TIP. IT IS NOT A STROKED ARC. Full rationale: docs/galaxy3d-design-notes.md#a-filament-has-a-root-and-a-tip-it-is-not-a-stroked-arc */
            function filament(scale, alpha, rootW, seed) {
                const cx = S / 2, cy = S * 0.985, base = S * 0.44 * scale;
                const a0 = Math.PI * 1.04, a1 = Math.PI * 1.96, N = 48;
                const outer = [], inner = [];
                for (let i = 0; i <= N; i++) {
                    const t = i / N;
                    const a = a0 + (a1 - a0) * t;
                    // |2t-1| is 1 at the two feet and 0 at the apex.
                    const foot = Math.pow(Math.abs(2 * t - 1), 1.6);
                    const w = rootW * (0.14 + 0.86 * foot) * (0.72 + 0.56 * vnoise(t * 9, seed, 91));
                    const r = base * (1 + (vnoise(t * 5, seed + 3, 51) - 0.5) * 0.12);
                    const nx = Math.cos(a), ny = Math.sin(a);
                    outer.push([cx + nx * (r + w), cy + ny * (r + w)]);
                    inner.push([cx + nx * (r - w), cy + ny * (r - w)]);
                }
                const g = ctx.createLinearGradient(0, S, 0, S * 0.06);
                g.addColorStop(0, `rgba(255,222,166,${alpha})`);
                g.addColorStop(0.42, `rgba(255,152,74,${alpha * 0.74})`);
                g.addColorStop(1, 'rgba(255,96,48,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                outer.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
                for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
                ctx.closePath();
                ctx.fill();
            }
            filament(0.88, 0.50, 5.0, 11);
            filament(0.60, 0.72, 3.4, 29);
            filament(0.35, 0.44, 2.4, 47);
            return toTex(canvas, THREE.SRGBColorSpace);
        });
    }

    /** An additive billboard over one forged star map. */
    function starSprite(map, opacity) {
        const mat = new THREE.SpriteMaterial({
            map,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            opacity
        });
        mat.toneMapped = false;
        return new THREE.Sprite(mat);
    }

    /**
     * The same assembly createStarObject() does — photosphere, glare veil,
     * corona — over maps painted on the forge instead of on this thread.
     *
     * A star was the most expensive single item on the board by a factor of
     * four: 575 ms, effectively all of it inside getStarMaps(). The photosphere
     * IS a ShaderMaterial, so it travels through describe()/forgeMaterial() the
     * way a world's surface already does; the two veils are billboards over one
     * texture each and are rebuilt here.
     */
    function assembleStar(bundle, radius, opts) {
        const group = new THREE.Group();
        const ex = bundle.extra || {};
        const mat = forgeMaterial(bundle.surface, bundle.textures);
        // NOT captured by describe(), and the fragment shader tone-maps itself:
        // without this the star is tone-mapped twice and comes back grey.
        mat.toneMapped = false;
        const core = new THREE.Mesh(state.sharedGeo.worldSphere, mat);
        core.scale.setScalar(radius);
        group.add(core);

        const bloom = starSprite(bundle.textures.bloom,
            opts.bloomOpacity === undefined ? 0.62 : opts.bloomOpacity);
        const bs = radius * (ex.bloomScale || 1);
        bloom.scale.set(bs, bs, 1);
        bloom.renderOrder = 1;
        group.add(bloom);

        const corona = starSprite(bundle.textures.corona,
            opts.opacity === undefined ? 1 : opts.opacity);
        const cs = radius * (ex.coronaScale || 1);
        corona.scale.set(cs, cs, 1);
        corona.renderOrder = 2;
        group.add(corona);

        const spin = opts.spin === undefined ? 0.03 : opts.spin;
        group.userData.core = core;
        group.userData.corona = corona;
        group.userData.bloom = bloom;
        group.userData.palette = ex.palette;
        group.userData.lightColor = ex.palette ? ex.palette.core : opts.rgb;
        group.userData.setTime = function (t) { if (mat.uniforms.uTime) mat.uniforms.uTime.value = t; };
        group.userData.update = function (dt) { core.rotation.y += spin * (dt || 0); };
        return group;
    }

    /** A star body, from the forge if its class has been baked, from here if not. */
    function makeStar(radius, entry) {
        const type = entry.type === 4 ? 4 : 3;
        /** THE EXPOSURE IS SPLIT, which is the whole rework. Full rationale: docs/galaxy3d-design-notes.md#the-exposure-is-split-which-is-the-whole-rework */
        // 0.72 (in starOptions) is the number the whole split-exposure idea
        // turns on: ACES maps it to roughly sRGB 0.83 at disc centre and 0.63 at
        // the limb, which is the only window in which the material's granulation
        // and its limb-darkening law are both VISIBLE. Anything above about 1.1
        // and the disc clips flat again, which is the defect.
        const opts = starOptions(type, entry.id);
        const bundle = state.worldBundles.get(starKey(type, entry.id));
        if (bundle && bundle.kind === 'star' && bundle.surface) {
            try {
                return assembleStar(bundle, radius, opts);
            } catch (err) {
                console.warn('Galaxy3D: forged star would not assemble, generating locally.', err);
                state.worldBundles.delete(starKey(type, entry.id));
                state.bundleFailed.add(starKey(type, entry.id));
            }
        }
        return createStarObject(Object.assign({ radius }, opts));
    }

    function buildStar(entry) {
        // Colour and size come from STAR_CLASS, which is also what the forge is
        // asked for: two definitions of "how big is a class-4 star" is one too
        // many, and the forged photosphere is baked against this palette.
        const cls = STAR_CLASS[entry.type] || STAR_CLASS[3];
        const rgbColour = cls.rgb;
        const radius = cls.radius;
        const group = new THREE.Group();
        const star = makeStar(radius, entry);
        /** THE BODY AND ITS LIGHT HAVE TO LAND IN THE SAME PLACE. Full rationale: docs/galaxy3d-design-notes.md#the-body-and-its-light-have-to-land-in-the-same-place */
        star.position.y = STAR_BODY_Y;
        group.add(star);
        group.userData.star = star;

        // The shared corona is a circular sprite. A circular corona over a
        // circular disc is two concentric circles, which is exactly the
        // "geometric silhouette" problem; stretching and rotating it costs
        // nothing and the streamers it already carries then read as directional.
        if (star.userData.corona) {
            const c = star.userData.corona;
            c.scale.set(c.scale.x * 1.34, c.scale.y * 0.82, 1);
            c.material.rotation = 0.7 + (Number(entry.id) || 0) * 0.31;
            c.material.depthTest = false;
            c.renderOrder = 3;
        }
        if (star.userData.bloom) {
            star.userData.bloom.material.depthTest = false;
            star.userData.bloom.renderOrder = 3;
        }

        // The limb halo: light OUTSIDE the disc, brightest at the silhouette.
        const limb = new THREE.Sprite(new THREE.SpriteMaterial({
            map: starLimbTexture(),
            color: new THREE.Color(0.92, 0.60, 0.31),
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        }));
        limb.scale.set(radius * 6, radius * 6, 1);
        limb.position.y = star.position.y;
        limb.renderOrder = 3;
        group.add(limb);

        // The blow-out, confined to the inner third of the disc.
        // 1.22/1.06/0.80, not 1.75/1.52/1.14. Measured, the core clipped to
        // RGB(251,247,242) and erased the panel structure of the plate under it
        // for most of a tile radius. A star should be the softest thing in the
        // frame, not the eraser: this still sits above the 1.05 bloom threshold,
        // so it is still unambiguously a light source, but the deck survives it.
        const core = new THREE.Sprite(new THREE.SpriteMaterial({
            map: starCoreTexture(),
            color: new THREE.Color(1.22, 1.06, 0.80),
            transparent: true,
            opacity: 1,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        }));
        // The texture reaches zero at 0.55 of its half-width, so a sprite 1.3
        // radii across confines the blow-out to the inner ~36% of the disc —
        // which is what leaves the outer two thirds carrying granulation.
        core.scale.set(radius * 1.3, radius * 1.3, 1);
        core.position.y = star.position.y;
        core.renderOrder = 3;
        group.add(core);

        // Prominences: three loops standing off the limb at fixed bearings, so
        // the outline is never a circle from any angle. They are a NEAR-ONLY
        // detail: at map zoom a star is seventy pixels across and a filament is
        // two, which is where they stopped reading as plasma and started reading
        // as concentric debug circles around the disc. A clean limb beats a ring.
        const proms = [];
        for (let i = 0; i < 3; i++) {
            const a = ((Number(entry.id) || 0) * 0.9) + i * 2.2;
            const s = radius * (0.55 + hash2(i, 3, Number(entry.id) || 1) * 0.4);
            const prom = new THREE.Sprite(new THREE.SpriteMaterial({
                map: prominenceTexture(),
                color: new THREE.Color(1.9, 0.86, 0.44),
                transparent: true,
                opacity: 0.6,
                depthWrite: false,
                depthTest: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false
            }));
            prom.scale.set(s, s, 1);
            // Rooted ON the limb. The loop is painted along the texture's bottom. Full rationale: docs/galaxy3d-design-notes.md#rooted-on-the-limb-the-loop-is-painted-along-the-texture-s-b
            const reach = radius * 1.04 + s * 0.46;
            prom.position.set(Math.cos(a) * reach, star.position.y + Math.sin(a) * reach, 0.02);
            prom.material.rotation = a - Math.PI / 2;
            prom.renderOrder = 3;
            group.add(prom);
            proms.push(prom);
        }
        group.userData.nearOnly = proms;

        /** The star lights its own plate — the one place a tile gets a colour it. Full rationale: docs/galaxy3d-design-notes.md#the-star-lights-its-own-plate-the-one-place-a-tile-gets-a-co */
        const pool = new THREE.Mesh(
            state.sharedGeo.decal,
            new THREE.MeshBasicMaterial({
                map: glowTexture(rgbColour),
                transparent: true,
                opacity: 0.13,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        const lift = STAR_BODY_Y - TILE_TOP;
        pool.position.set(0, TILE_TOP + 0.005, (VIEW_DIR.z / -VIEW_DIR.y) * lift);
        pool.scale.setScalar(0.68);
        pool.renderOrder = 2;
        group.add(pool);
        return group;
    }

    // . Full rationale: docs/galaxy3d-design-notes.md#detail-level

    /** Screen pixels per world unit at the camera's current distance. The canvas. Full rationale: docs/galaxy3d-design-notes.md#screen-pixels-per-world-unit-at-the-camera-s-current-distanc */
    function pixelsPerUnit() {
        if (!state.camera) return 100;
        const h = Math.max(1, state.viewH || 1080);
        const dist = (state.camOffset.length() || 1) * (state.zoom || 1);
        return (h / 2) / (Math.tan(state.camera.fov * Math.PI / 360) * dist);
    }

    /** Diameter, in screen pixels, below which a world loses its extra shells. */
    const SHELL_DETAIL_PX = 120;

    function applyDetail(entry, ppu) {
        const content = entry.content;
        if (!content) return;
        /** THE CLOUD SHELL IS NOT AN LOD CASUALTY. IT IS THE READ. Full rationale: docs/galaxy3d-design-notes.md#the-cloud-shell-is-not-an-lod-casualty-it-is-the-read */
        const world = content.userData.world;
        if (world && world.userData.clouds) world.userData.clouds.visible = state.detail < 3;
        if (content.userData.belt) {
            const near = ppu >= SHELL_DETAIL_PX;
            content.userData.belt.forEach(mesh => {
                mesh.count = near ? mesh.userData.fullCount : mesh.userData.farCount;
            });
        }
        if (content.userData.farOnly) {
            content.userData.farOnly.visible = ppu >= SHELL_DETAIL_PX * 0.7;
        }
        // Detail that only survives when the object is large on screen. A star's
        // prominences at map zoom are two pixels of filament reading as a ring
        // around the disc; below the threshold the limb is left clean.
        if (content.userData.nearOnly) {
            const near = ppu >= SHELL_DETAIL_PX;
            content.userData.nearOnly.forEach(obj => { obj.visible = near; });
        }
    }

    function refreshDetail(force) {
        const ppu = pixelsPerUnit();
        // Only redo the walk when the zoom has actually moved a meaningful
        // amount — this runs off the frame loop and must cost nothing to skip.
        if (!force && state.lastDetailPpu && Math.abs(ppu - state.lastDetailPpu) < 4) return;
        state.lastDetailPpu = ppu;
        state.sectors.forEach(entry => { if (entry.content) applyDetail(entry, ppu); });
    }

    /** The rung-3 sweep, a slice at a time. Sixteen tiles a frame finishes a full. Full rationale: docs/galaxy3d-design-notes.md#the-rung-3-sweep-a-slice-at-a-time-sixteen-tiles-a-frame-fin */
    const DETAIL_SWEEP_PER_FRAME = 16;

    function stepFogConform() {
        if (!state.fogConform || !state.fogConform.length) return;
        conformFogMaterial(state.fogConform.shift());
    }

    function stepDetailSweep() {
        stepFogConform();
        if (state.detailSweep === null || state.detailSweep === undefined) return;
        const ppu = pixelsPerUnit();
        const entries = [];
        state.sectors.forEach(entry => entries.push(entry));
        let i = state.detailSweep;
        const end = Math.min(entries.length, i + DETAIL_SWEEP_PER_FRAME);
        for (; i < end; i++) {
            if (entries[i] && entries[i].content) applyDetail(entries[i], ppu);
        }
        state.detailSweep = i >= entries.length ? null : i;
    }

    // . Full rationale: docs/galaxy3d-design-notes.md#startup-is-staged-and-every-stage-hands-the-page-back

    /**
     * Shared work that is expensive, needed eventually, and needed by nobody in
     * the first frame. Ordered by when the board actually wants it.
     */
    const BOOT_STEPS = [
        // The world forge goes first because it is the only step whose cost is
        // paid by somebody else: it starts two threads and returns. Everything
        // queued behind it is generated while these run.
        () => { startForge(); },
        // The charted plate atlas: needed the moment any sector is charted, which
        // is usually the very next server message, so it goes first among the
        // things this thread has to do itself.
        () => { plateMaps(); },
        /** The sky dome, nebula sheets and dust, in FOUR steps rather than one. Full rationale: docs/galaxy3d-design-notes.md#the-sky-dome-nebula-sheets-and-dust-in-four-steps-rather-tha */
        skyTextureStep,
        () => { cachedTexture('nearNebula', buildNearNebulaTexture); },
        () => { buildStarPointTexture(); buildBrightStarTexture(); },
        () => {
            if (state.starsBuilt || !state.scene) return;
            buildBackdrop();
            state.starsBuilt = true;
        },
        /** Reflection probe for the plates, the belt rocks and the fleet hulls. Full rationale: docs/galaxy3d-design-notes.md#reflection-probe-for-the-plates-the-belt-rocks-and-the-fleet */
        () => {
            if (!state.renderer || state.envProbe) return;
            // Construction builds the LOD planes; a separate step from the
            // shader compile because on an ANGLE backend the pair measured
            // 841 ms together and neither half is worth a frame on its own.
            state.envProbe = new THREE.PMREMGenerator(state.renderer);
        },
        () => { if (state.envProbe) state.envProbe.compileEquirectangularShader(); },
        () => {
            if (!state.scene) return;
            if (!state.envProbe) { state.scene.environment = studioEnvTexture(); return; }
            try {
                const target = state.envProbe.fromEquirectangular(studioEnvTexture());
                state.scene.environment = target.texture;
            } catch (err) {
                state.scene.environment = studioEnvTexture();
            }
            state.envProbe.dispose();
            state.envProbe = null;
        },
        () => { ensureSelectionRing(); }
    ];

    /** Anything on the main thread that took longer than a frame, with a name. Full rationale: docs/galaxy3d-design-notes.md#anything-on-the-main-thread-that-took-longer-than-a-frame-wi */
    const COST_LOG_MS = 60;

    function noteCost(what, ms) {
        if (ms < COST_LOG_MS) return;
        if (!state.costLog) state.costLog = [];
        if (state.costLog.length < 40) {
            state.costLog.push({ what, ms: Math.round(ms), at: Math.round(performance.now()) });
        }
    }

    /** Run at most one boot step. True if there is still work left after it. Full rationale: docs/galaxy3d-design-notes.md#run-at-most-one-boot-step-true-if-there-is-still-work-left-a */
    function runBootStep() {
        const i = state.bootStep || 0;
        if (i >= BOOT_STEPS.length) return false;
        const t0 = performance.now();
        let again = false;
        try {
            again = BOOT_STEPS[i]() === 'again';
        } catch (err) {
            console.warn('Galaxy3D: boot step %d failed', i, err);
        }
        if (!again) state.bootStep = i + 1;
        noteCost(`boot${i}`, performance.now() - t0);
        return state.bootStep < BOOT_STEPS.length;
    }

    // . Full rationale: docs/galaxy3d-design-notes.md#the-world-forge-the-second-thread-that-makes-the-budget-real

    /**
     * The worker, as source. Written as an array of lines rather than a template
     * literal so that nothing in it has to be escaped against this file.
     */
    const FORGE_SOURCE = [
        // planet-texture.js touches exactly one DOM API, and this is it.
        'self.window = self;',
        'self.document = { createElement: function (tag) {',
        '    if (tag === "canvas") return new OffscreenCanvas(1, 1);',
        '    throw new Error("galaxy3d forge: no document." + tag);',
        '} };',
        'let PT = null;',
        '',
        // A material is transportable as its shader source, its defines and its
        // uniform VALUES. Textures are replaced by the name of the bitmap they
        // travel with; everything else is a number, a vector or a colour.
        'function describe(mat, texIndex) {',
        '    if (!mat) return null;',
        '    const u = {};',
        '    for (const name in mat.uniforms) {',
        '        const v = mat.uniforms[name].value;',
        '        if (v && v.isTexture) { const k = texIndex.get(v); if (k) u[name] = { t: "tex", k: k }; }',
        '        else if (v && v.isVector3) u[name] = { t: "v3", v: [v.x, v.y, v.z] };',
        '        else if (v && v.isColor) u[name] = { t: "c", v: [v.r, v.g, v.b] };',
        '        else if (v && v.isVector2) u[name] = { t: "v2", v: [v.x, v.y] };',
        '        else if (typeof v === "number") u[name] = { t: "n", v: v };',
        '    }',
        '    return {',
        '        vertexShader: mat.vertexShader,',
        '        fragmentShader: mat.fragmentShader,',
        '        defines: Object.assign({}, mat.defines),',
        '        transparent: !!mat.transparent,',
        '        depthWrite: !!mat.depthWrite,',
        '        depthTest: !!mat.depthTest,',
        '        blending: mat.blending,',
        '        side: mat.side,',
        '        uniforms: u',
        '    };',
        '}',
        '',
        'self.onmessage = async function (ev) {',
        '    const msg = ev.data || {};',
        '    try {',
        '        if (!PT) PT = await import(msg.src);',
        // "The module is up and I am starting." The main thread restarts this
        // key's deadline here, so a cold import is never mistaken for a wedged
        // worker and never costs the player a duplicate bake on their own thread.
        '        self.postMessage({ id: msg.id, key: msg.key, ack: true });',
        '        const opts = msg.opts || {};',
        // A BELT AND A STAR ARE TEXTURE BAKES TOO.
        //
        // Every one of these used to be painted on the main thread — measured at
        // 154 ms for a belt and 575 ms for a star, essentially all of it inside
        // paintAsteroid()/paintStarSurface(). They are the same kind of work the
        // worlds already come here for, so they take the same road. Rocks need
        // no material description at all (the main thread builds one standard
        // material from three maps); a star's photosphere IS a ShaderMaterial
        // and describe() already transports those.
        '        let named = null;',
        '        let extra = null;',
        '        let surface = null;',
        '        if (msg.kind === "rock") {',
        '            const m = PT.getAsteroidMaps(msg.variant);',
        '            named = [["map", m.map], ["normal", m.normalMap], ["orm", m.roughnessMap]];',
        '        } else if (msg.kind === "star") {',
        '            const s = PT.getStarMaps(opts.rgb, opts.seed);',
        '            named = [["map", s.map], ["corona", s.coronaMap], ["bloom", s.bloomMap]];',
        '            extra = { palette: s.palette, coronaScale: s.coronaScale, bloomScale: s.bloomScale };',
        '        }',
        '        if (named) {',
        '            const ti = new Map();',
        '            for (const pair of named) { if (pair[1] && !ti.has(pair[1])) ti.set(pair[1], pair[0]); }',
        '            const tex = {}; const move = [];',
        '            for (const pair of named) {',
        '                if (!pair[1] || tex[pair[0]] || ti.get(pair[1]) !== pair[0]) continue;',
        '                const b = await createImageBitmap(pair[1].image, { premultiplyAlpha: "none" });',
        '                tex[pair[0]] = { bitmap: b, colorSpace: pair[1].colorSpace, wrapS: pair[1].wrapS,',
        '                                 wrapT: pair[1].wrapT, anisotropy: pair[1].anisotropy };',
        '                move.push(b);',
        '            }',
        '            if (msg.kind === "star") surface = describe(PT.createStarSurfaceMaterial(opts), ti);',
        '            self.postMessage({ id: msg.id, key: msg.key, ok: true, kind: msg.kind,',
        '                               textures: tex, surface: surface, extra: extra }, move);',
        '            return;',
        '        }',
        '        const maps = PT.getPlanetMaps(msg.type, msg.sectorId);',
        '        named = [["map", maps.map], ["normal", maps.normalMap], ["orm", maps.roughnessMap],',
        '                       ["emissive", maps.emissiveMap], ["cloud", maps.cloudMap]];',
        '        const texIndex = new Map();',
        '        for (const pair of named) { if (pair[1] && !texIndex.has(pair[1])) texIndex.set(pair[1], pair[0]); }',
        '        const textures = {};',
        '        const transfer = [];',
        '        for (const pair of named) {',
        '            const key = pair[0]; const tex = pair[1];',
        '            if (!tex || textures[key] || texIndex.get(tex) !== key) continue;',
        // premultiplyAlpha:"none" so the cloud deck's alpha arrives the way
        // three.js expects a canvas texture's to.
        '            const bmp = await createImageBitmap(tex.image, { premultiplyAlpha: "none" });',
        '            textures[key] = { bitmap: bmp, colorSpace: tex.colorSpace, wrapS: tex.wrapS,',
        '                              wrapT: tex.wrapT, anisotropy: tex.anisotropy };',
        '            transfer.push(bmp);',
        '        }',
        '        const ratio = opts.atmosphereRatio || PT.PLANET_RIG.atmosphereRatio;',
        '        const atmoOpts = Object.assign({}, opts, { ratio: ratio });',
        '        self.postMessage({',
        '            id: msg.id, key: msg.key, ok: true, textures: textures,',
        '            surface: describe(PT.createPlanetSurfaceMaterial(msg.type, msg.sectorId, opts), texIndex),',
        '            clouds: describe(PT.createPlanetCloudMaterial(msg.type, msg.sectorId, opts), texIndex),',
        '            atmosphere: describe(PT.createAtmosphereMaterial(msg.type, msg.sectorId, atmoOpts), texIndex)',
        '        }, transfer);',
        '    } catch (err) {',
        '        self.postMessage({ id: msg.id, key: msg.key, ok: false, err: String((err && err.message) || err) });',
        '    }',
        '};'
    ].join('\n');

    /** A bake that never answers must not strand its sector as a stand-in for. Full rationale: docs/galaxy3d-design-notes.md#a-bake-that-never-answers-must-not-strand-its-sector-as-a-st */
    const FORGE_TIMEOUT_MS = 20000;

    function forgeSupported() {
        return typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
            && typeof createImageBitmap === 'function' && typeof Blob === 'function';
    }

    function ensureForge() {
        if (state.forge) return state.forge;
        if (!forgeSupported()) {
            state.forge = { failed: true, workers: [] };
            return state.forge;
        }
        // Declared alive but not STARTED. Requests that arrive before the first
        // frame queue up here rather than spawning threads — see startForge().
        state.forge = { failed: false, workers: [], waiting: [], started: false };
        return state.forge;
    }

    /** Spin the threads up, AFTER the first frame. Full rationale: docs/galaxy3d-design-notes.md#spin-the-threads-up-after-the-first-frame */
    function startForge() {
        const forge = ensureForge();
        if (forge.failed || forge.started) return;
        forge.started = true;
        try {
            const url = URL.createObjectURL(new Blob([FORGE_SOURCE], { type: 'text/javascript' }));
            // Two at most, and only where there are cores to spare. Each one
            // carries its own copy of three.js and of the generator, and on a
            // machine with few cores a second thread does not add throughput —
            // it takes it off the frame the player is holding.
            const cores = Number(navigator.hardwareConcurrency) || 2;
            const count = cores >= 8 ? 2 : 1;
            for (let i = 0; i < count; i++) {
                const w = new Worker(url, { type: 'module' });
                w.onmessage = ev => onForgeResult(w, ev.data);
                w.onerror = ev => {
                    console.warn('Galaxy3D: world forge unavailable, generating on the main thread.',
                        ev && ev.message);
                    failForge();
                };
                w.__busy = null;
                forge.workers.push(w);
            }
            URL.revokeObjectURL(url);
            // Anything charted before the threads existed is waiting in the queue.
            forge.workers.forEach(w => pumpForge(w));
        } catch (err) {
            console.warn('Galaxy3D: world forge could not start, generating on the main thread.', err);
            failForge();
        }
        return state.forge;
    }

    /** True while our own threads are competing with the frame for the CPU. */
    function forgeBusy() {
        return state.bundlePending.size > 0
            || Boolean(state.forge && !state.forge.failed && state.forge.waiting
                && state.forge.waiting.length);
    }

    /** Give up on the second thread entirely; every class goes back to the main one. */
    function failForge() {
        const forge = state.forge;
        if (!forge || forge.failed) return;
        forge.failed = true;
        (forge.workers || []).forEach(w => { try { w.terminate(); } catch (err) { /* gone */ } });
        forge.workers = [];
        // Anything that was waiting on a bake is now buildable the old way.
        state.bundlePending.forEach((_at, key) => state.bundleFailed.add(key));
        state.bundlePending.clear();
    }

    /** Three variants of everything, per class. One definition of "which one". */
    function variantOf(sectorId) {
        return Math.abs(Number(sectorId) || 0) % 3;
    }

    /** Cache key for a world's generated maps: the generator caches per class and variant. */
    function bundleKey(type, sectorId) {
        return `${type}:${variantOf(sectorId)}`;
    }

    /** ...and for the two hazard classes, which are bakes of exactly the same kind. */
    function rockKey(variant) {
        return `r:${((Math.abs(Number(variant) || 0) % ASTEROID_VARIANTS) + ASTEROID_VARIANTS)
            % ASTEROID_VARIANTS}`;
    }

    function starKey(type, sectorId) {
        return `s:${type}:${variantOf(sectorId)}`;
    }

    /** The photosphere colour and size for a star sector's class. ONE definition. */
    const STAR_CLASS = {
        3: { rgb: [255, 148, 72], radius: 0.33 },
        4: { rgb: [255, 108, 44], radius: 0.27 }
    };

    /**
     * Options a star of this class and variant is generated with.
     *
     * THE SEED IS THE VARIANT, NOT THE SECTOR. getStarMaps() caches on
     * `palette:seed`, so a per-sector seed meant every star sector on the board
     * paid for its own three-texture bake and none of them was ever shared. Three
     * variants per class is the same bargain worldOptions() already strikes, and
     * what actually distinguishes two neighbouring stars at map zoom is the
     * corona stretch, its rotation and the prominence bearings — all of which
     * buildStar() still derives from the sector id.
     */
    function starOptions(type, sectorId) {
        const cls = STAR_CLASS[type] || STAR_CLASS[3];
        return {
            rgb: cls.rgb,
            seed: 1337 + variantOf(sectorId),
            // Matched to buildStar()'s own call: the described material carries
            // these baked in, so the two must not drift.
            intensity: 0.72,
            opacity: 0.9,
            bloomOpacity: 0.26,
            spin: 0.05
        };
    }

    /** The class buildPlanet() would give this sector, or null when the sector is. Full rationale: docs/galaxy3d-design-notes.md#the-class-buildplanet-would-give-this-sector-or-null-when-th */
    function worldClassOf(entry) {
        const known = entry.status !== STATUS.UNKNOWN || entry.explored;
        if (!known) return null;
        if (entry.status === STATUS.BLACKHOLE || entry.type === 2) return null;
        if (entry.type === 1 || entry.status === STATUS.HAZARD) return null;
        if (entry.type === 3 || entry.type === 4) return null;
        const isWorld = (entry.type >= 5 && entry.type <= 10)
            || entry.status === STATUS.HOMEWORLD || entry.status === STATUS.OWNED
            || entry.status === STATUS.ENEMY || entry.status === STATUS.COLONIZED;
        if (!isWorld) return null;
        return Math.max(5, Math.min(10, Number(entry.type) || 8));
    }

    /** The options a world of this class is generated with. One definition, two threads. */
    function worldOptions(type, sectorId) {
        return {
            // Richer worlds are visibly bigger, so value reads before you click.
            // The ramp starts at 0.34, not 0.28: a class-6 world at 0.28 is forty
            // pixels across at the map framing and there is no surface generator
            // that can make forty pixels legible — it read as orange mush. The
            // STEP between classes carries the "richer" signal and is intact; the
            // floor is what was wrong.
            radius: type === 10 ? 0.50 : 0.34 + (type - 5) * 0.038,
            spin: 0.06 + ((Number(sectorId) || 0) % 7) * 0.012,
            // The generator's atmosphere is a BACK-SIDE shell whose alpha comes. Full rationale: docs/galaxy3d-design-notes.md#the-generator-s-atmosphere-is-a-back-side-shell-whose-alpha-
            strength: 0.30,
            power: 4.6,
            // Clear of the surface's own limb term, which was drawing a hard gold
            // arc where the two shells met inside the silhouette.
            cloudRatio: 1.038,
            // A hair above the generator's calibrated 0.032. At map zoom a world
            // is seventy pixels across and a night hemisphere falling to pure
            // black flattens it into a lit crescent pasted on the plate; this is
            // the smallest lift that keeps the sphere reading as a SPHERE while
            // the terminator is still the dominant read.
            ambient: 0.052
        };
    }

    /** Hand one baked thing to whichever worker is free, or queue it for one. */
    function requestBundle(key, build) {
        if (!key || state.worldBundles.has(key) || state.bundlePending.has(key)
            || state.bundleStaging.has(key) || state.bundleFailed.has(key)) return;
        // Remembered so a request that has to wait for a worker can be replayed
        // verbatim. Reconstructing it from the key was only ever possible because
        // the world bake happens to ignore everything but the variant.
        if (!state.bundleAsked.has(key)) state.bundleAsked.set(key, build());
        const forge = ensureForge();
        if (forge.failed) { state.bundleFailed.add(key); return; }
        const worker = (forge.workers || []).find(w => !w.__busy);
        if (!worker) { if (!forge.waiting.includes(key)) forge.waiting.push(key); return; }
        worker.__busy = key;
        state.bundlePending.set(key, performance.now());
        worker.postMessage(Object.assign(
            { id: key, key, src: PLANET_TEXTURE_URL }, state.bundleAsked.get(key)));
    }

    function requestWorld(type, sectorId) {
        requestBundle(bundleKey(type, sectorId), () => ({
            kind: 'world', type, sectorId: Number(sectorId) || 0, opts: worldOptions(type, sectorId)
        }));
    }

    function requestRock(variant) {
        requestBundle(rockKey(variant), () => ({ kind: 'rock', variant: Number(variant) || 0 }));
    }

    function requestStar(type, sectorId) {
        requestBundle(starKey(type, sectorId), () => ({
            kind: 'star', type, opts: starOptions(type, sectorId)
        }));
    }

    /** Whichever pending key this worker was carrying is done; give it the next one. */
    function pumpForge(worker) {
        const forge = state.forge;
        worker.__busy = null;
        if (!forge || forge.failed) return;
        while (forge.waiting.length) {
            const key = forge.waiting.shift();
            requestBundle(key, () => state.bundleAsked.get(key));
            if (worker.__busy) return;
        }
    }

    function onForgeResult(worker, msg) {
        if (!msg || !msg.key) return;
        // "Starting now" — restart the clock so the deadline measures the bake
        // rather than the module import that preceded it.
        if (msg.ack) {
            if (state.bundlePending.has(msg.key)) state.bundlePending.set(msg.key, performance.now());
            return;
        }
        state.bundlePending.delete(msg.key);
        if (!msg.ok) {
            console.warn('Galaxy3D: forge could not bake %s (%s) — falling back.', msg.key, msg.err);
            state.bundleFailed.add(msg.key);
        } else {
            try {
                const textures = {};
                const upload = [];
                for (const name in msg.textures) {
                    textures[name] = forgeTexture(msg.textures[name]);
                    upload.push(textures[name]);
                }
                /** NOT AVAILABLE YET — IT STILL HAS TO REACH THE GPU. Full rationale: docs/galaxy3d-design-notes.md#not-available-yet-it-still-has-to-reach-the-gpu */
                state.bundleStaging.set(msg.key, {
                    kind: msg.kind || 'world',
                    bundle: {
                        kind: msg.kind || 'world',
                        textures,
                        surface: msg.surface,
                        clouds: msg.clouds,
                        atmosphere: msg.atmosphere,
                        // Star scales and palette; absent for the other kinds.
                        extra: msg.extra || null
                    },
                    upload
                });
                // Held in `pending` so entryReadiness() keeps answering 'waiting'
                // rather than re-requesting a bake that has already been done.
                state.bundlePending.set(msg.key, performance.now());
            } catch (err) {
                console.warn('Galaxy3D: forged maps could not be uploaded, falling back.', err);
                state.bundleFailed.add(msg.key);
            }
        }
        pumpForge(worker);
        updateLoadingState();
    }

    /**
     * One map to the GPU per frame. renderer.initTexture() does exactly the
     * upload the first draw would have done, at a moment of our choosing. When a
     * bundle's last map has landed the bundle is handed to the board.
     */
    function stepTextureUploads() {
        if (!state.bundleStaging.size || !state.renderer) return 0;
        const t0 = performance.now();
        for (const [key, job] of state.bundleStaging) {
            // A bundle whose program is genuinely being linked in the background
            // is in nobody's way; step over it so the next one keeps moving.
            if (job.warming) continue;
            const tex = job.upload.shift();
            if (tex) {
                try {
                    if (typeof state.renderer.initTexture === 'function') state.renderer.initTexture(tex);
                } catch (err) { /* the first draw will do it */ }
            } else {
                releaseBundle(key, job);
            }
            break;   // one a frame, and the nearest class is whichever finished first
        }
        const ms = performance.now() - t0;
        noteCost('upload', ms);
        return ms;
    }

    /**
     * COMPILEASYNC IS ONLY ASYNCHRONOUS WHERE THE DRIVER SAYS IT IS.
     *
     * three's compileAsync() is, verbatim, `const i = this.compile(e,t,n);
     * return new Promise(...)`. compile() is synchronous and unconditional; the
     * only thing the promise defers is the READINESS POLL, and it only defers
     * that when KHR_parallel_shader_compile is present. Without the extension
     * the call written to keep shader linking off the frame IS the frame — this
     * measured as a 2-4 second dead board, five to seven times per startup, and
     * it was the single worst thing about this map.
     *
     * So ask the driver, once, and where the answer is no do not pre-warm at
     * all: the first draw pays for the program inside render(), which is already
     * inside the frame budget and already attributed by noteCost('render').
     */
    function parallelCompile() {
        if (state.parallelCompile !== undefined) return state.parallelCompile;
        // No context yet — do not memoise "no" for the life of the page.
        if (!state.renderer) return false;
        try {
            state.parallelCompile = Boolean(
                state.renderer.getContext().getExtension('KHR_parallel_shader_compile'));
        } catch (err) {
            state.parallelCompile = false;
        }
        return state.parallelCompile;
    }

    /** How long a genuine background link is given before the class ships anyway. */
    const WARM_DEADLINE_MS = 1500;
    /** ...and at most one link is STARTED per window, so warms cannot stack up. */
    const WARM_GAP_MS = 120;
    /** What the strip calls it while it happens. */
    const WARM_STEP = 'compiling surface shaders';

    /**
     * Hand a staged bundle to the board, linking its program first if that is
     * genuinely free. The bundle is released either way: a class that never
     * leaves staging is a sector that stays a stand-in for the session.
     */
    function releaseBundle(key, job) {
        const t0 = performance.now();
        const finish = () => {
            if (!state.bundleStaging.has(key)) return;
            state.bundleStaging.delete(key);
            state.bundlePending.delete(key);
            state.worldBundles.set(key, job.bundle);
            updateLoadingState();
        };
        const r = state.renderer;
        const free = parallelCompile()
            && !handIsBusy(t0)
            && t0 - (state.lastWarmAt || 0) >= WARM_GAP_MS
            && job.kind === 'world'
            && r && typeof r.compileAsync === 'function' && state.scene && state.camera;
        if (!free) {
            finish();
            noteCost('warmBundle', performance.now() - t0);
            return;
        }
        state.lastWarmAt = t0;
        // Named BEFORE the work, not after it: whatever the last painted frame
        // says has to explain the pause that follows it. Cleared on every exit
        // from here, or the strip sticks on a step that already finished.
        noteSurveyStep(WARM_STEP);
        try {
            const type = Number(key.split(':')[0]) || 8;
            const probe = assembleWorld(job.bundle, type, 0, worldOptions(type, 0));
            const scratch = new THREE.Scene();
            scratch.add(probe);
            // Held so nothing can collect it out from under the program it owns.
            job.bundle.probe = probe;
            const p = r.compileAsync(scratch, state.camera, state.scene);
            if (!p || typeof p.then !== 'function') { clearSurveyStep(WARM_STEP); finish(); return; }
            job.warming = true;
            let settled = false;
            const settle = () => {
                if (settled) return;
                settled = true;
                scratch.remove(probe);
                job.warming = false;
                clearSurveyStep(WARM_STEP);
                finish();
            };
            p.then(settle, settle);
            setTimeout(settle, WARM_DEADLINE_MS);
        } catch (err) {
            clearSurveyStep(WARM_STEP);
            finish();
        }
        noteCost('warmBundle', performance.now() - t0);
    }

    /** An ImageBitmap is an upload; the generation already happened elsewhere. */
    function forgeTexture(spec) {
        const tex = new THREE.Texture(spec.bitmap);
        if (spec.colorSpace) tex.colorSpace = spec.colorSpace;
        if (spec.wrapS) tex.wrapS = spec.wrapS;
        if (spec.wrapT) tex.wrapT = spec.wrapT;
        tex.anisotropy = spec.anisotropy || 8;
        tex.needsUpdate = true;
        // Shared by every world of this class and variant, exactly as the
        // generator's own cache would have shared it. disposeContent() honours
        // the flag, so one sector rebuild cannot free another sector's surface.
        tex.__shared = true;
        return tex;
    }

    /** Re-inflate one transported material. The shader is the generator's, unmodified. */
    function forgeMaterial(desc, textures) {
        if (!desc) return null;
        const uniforms = {};
        for (const name in desc.uniforms) {
            const d = desc.uniforms[name];
            if (d.t === 'tex') uniforms[name] = { value: textures[d.k] || null };
            else if (d.t === 'v3') uniforms[name] = { value: new THREE.Vector3(d.v[0], d.v[1], d.v[2]) };
            else if (d.t === 'v2') uniforms[name] = { value: new THREE.Vector2(d.v[0], d.v[1]) };
            else if (d.t === 'c') uniforms[name] = { value: new THREE.Color(d.v[0], d.v[1], d.v[2]) };
            else uniforms[name] = { value: d.v };
        }
        const mat = new THREE.ShaderMaterial({
            uniforms,
            defines: Object.assign({}, desc.defines),
            vertexShader: desc.vertexShader,
            fragmentShader: desc.fragmentShader,
            transparent: desc.transparent,
            depthWrite: desc.depthWrite,
            depthTest: desc.depthTest,
            blending: desc.blending,
            side: desc.side
        });
        // The two hooks the map drives a world with. They are closures over the
        // uniform objects in the original, so they cannot travel; they are two
        // lines of plumbing, not part of the look.
        mat.userData.uniforms = uniforms;
        mat.userData.setLightDirection = function (x, y, z) {
            if (uniforms.uLightDir) uniforms.uLightDir.value.set(x, y, z).normalize();
        };
        mat.userData.setCloudOffset = function (u) {
            if (uniforms.uCloudOffset) uniforms.uCloudOffset.value = u;
        };
        return mat;
    }

    /** The same assembly createPlanetObject() does — surface, cloud shell. Full rationale: docs/galaxy3d-design-notes.md#the-same-assembly-createplanetobject-does-surface-cloud-shel */
    function assembleWorld(bundle, type, sectorId, opts) {
        const geo = state.sharedGeo.worldSphere;
        const group = new THREE.Group();
        const radius = opts.radius === undefined ? 1 : opts.radius;

        const surfaceMat = forgeMaterial(bundle.surface, bundle.textures);
        const surface = new THREE.Mesh(geo, surfaceMat);
        surface.scale.setScalar(radius);
        group.add(surface);

        let clouds = null;
        const cloudMat = forgeMaterial(bundle.clouds, bundle.textures);
        if (cloudMat) {
            clouds = new THREE.Mesh(geo, cloudMat);
            clouds.scale.setScalar(radius * (opts.cloudRatio || PLANET_RIG.cloudRatio));
            clouds.renderOrder = 1;
            group.add(clouds);
        }

        let atmosphere = null;
        const atmoMat = forgeMaterial(bundle.atmosphere, bundle.textures);
        if (atmoMat) {
            const ratio = opts.atmosphereRatio || PLANET_RIG.atmosphereRatio;
            atmosphere = new THREE.Mesh(geo, atmoMat);
            atmosphere.scale.setScalar(radius * ratio);
            atmosphere.renderOrder = 2;
            group.add(atmosphere);
        }

        const spin = opts.spin === undefined ? 0.12 : opts.spin;
        const cloudDrift = opts.cloudDrift === undefined ? spin * 0.32 : opts.cloudDrift;
        const light = new THREE.Vector3(0.55, 0.5, 0.67).normalize();
        const worldPos = new THREE.Vector3();
        const tmpVec = new THREE.Vector3();

        function pushLight() {
            surfaceMat.userData.setLightDirection(light.x, light.y, light.z);
            if (clouds) clouds.material.userData.setLightDirection(light.x, light.y, light.z);
            if (atmosphere) atmosphere.material.userData.setLightDirection(light.x, light.y, light.z);
        }
        pushLight();

        group.userData.surface = surface;
        group.userData.clouds = clouds;
        group.userData.atmosphere = atmosphere;
        group.userData.radius = radius;
        group.userData.setLightDirection = function (x, y, z) {
            light.set(x, y, z);
            if (light.lengthSq() < 1e-8) light.set(0, 1, 0);
            light.normalize();
            pushLight();
        };
        group.userData.setLightTarget = function (target) {
            group.getWorldPosition(worldPos);
            tmpVec.set(
                (target.x !== undefined ? target.x : target[0]) - worldPos.x,
                (target.y !== undefined ? target.y : target[1]) - worldPos.y,
                (target.z !== undefined ? target.z : target[2]) - worldPos.z
            );
            if (tmpVec.lengthSq() < 1e-8) return;
            group.userData.setLightDirection(tmpVec.x, tmpVec.y, tmpVec.z);
        };
        group.userData.spin = spin;
        group.userData.update = function (dt) {
            if (!clouds) return;
            clouds.rotation.y += cloudDrift * (dt || 0);
            surfaceMat.userData.setCloudOffset(-clouds.rotation.y / (Math.PI * 2));
        };
        return group;
    }

    /**
     * A world, from the forge if its class has been baked, from the main thread
     * if it has not. The caller only ever gets a finished object.
     */
    function makeWorld(type, sectorId, opts) {
        const bundle = state.worldBundles.get(bundleKey(type, sectorId));
        if (bundle) {
            try {
                // The first world of a class is the one whose shaders the driver
                // has never seen. Ask for them to be compiled out of band.
                if (!bundle.warmed) { bundle.warmed = true; state.warmPending = true; }
                return assembleWorld(bundle, type, sectorId, opts);
            } catch (err) {
                console.warn('Galaxy3D: forged world would not assemble, generating locally.', err);
                state.worldBundles.delete(bundleKey(type, sectorId));
                state.bundleFailed.add(bundleKey(type, sectorId));
            }
        }
        return createPlanetObject(type, sectorId, opts);
    }

    /** THE BUDGET IS NOW ENFORCEABLE, WHICH IT PREVIOUSLY WAS NOT. Full rationale: docs/galaxy3d-design-notes.md#the-budget-is-now-enforceable-which-it-previously-was-not */
    const CONTENT_BUDGET_MS = 12;
    /** ...AND ANYTHING THAT STILL CANNOT FIT WAITS FOR THE HAND TO FINISH. Full rationale: docs/galaxy3d-design-notes.md#and-anything-that-still-cannot-fit-waits-for-the-hand-to-fin */
    const CONTENT_SETTLE_MS = 180;   // after a wheel or a released drag
    const CONTENT_HOVER_MS = 90;     // a natural pause between pointer moves

    /** True while the player is in the middle of something a stall would spoil. */
    function handIsBusy(now) {
        if (state.drag) return true;
        if (now - (state.lastGestureAt || 0) < CONTENT_SETTLE_MS) return true;
        if (now - (state.lastInputAt || 0) < CONTENT_HOVER_MS) return true;
        return false;
    }

    /**
     * WHICH KIND OF BAKE THIS TILE'S CONTENT COMES FROM — worlds AND hazards.
     *
     * Kept separate from worldClassOf(), which answers a different question
     * ("is this tile a world?") that installSurveyProxy() and buildPlanet() need
     * answered its own way. One definition, because the two things below —
     * "which keys am I waiting on" and "which bakes do I ask for" — have to
     * agree exactly or a tile waits forever on a key nobody requested.
     *
     * A black hole and empty space are not here: neither costs anything worth
     * moving off this thread.
     */
    function forgeKindOf(entry) {
        if (entry.status === STATUS.UNKNOWN && !entry.explored) return null;
        if (worldClassOf(entry) !== null) return 'world';
        if (entry.type === 3 || entry.type === 4) return 'star';
        if (entry.type === 1 || (entry.status === STATUS.HAZARD && entry.type !== 2)) return 'rock';
        return null;
    }

    function forgeKeysOf(entry) {
        switch (forgeKindOf(entry)) {
            case 'world': return [bundleKey(worldClassOf(entry), entry.id)];
            case 'star': return [starKey(entry.type, entry.id)];
            case 'rock': return ROCK_GROUPS.map(g => rockKey(Number(entry.id) + g));
            default: return null;
        }
    }

    /** Ask for every bake this tile is waiting on. Duplicates are dropped inside. */
    function requestForgeFor(entry) {
        switch (forgeKindOf(entry)) {
            case 'world': requestWorld(worldClassOf(entry), entry.id); break;
            case 'star': requestStar(entry.type, entry.id); break;
            case 'rock': ROCK_GROUPS.forEach(g => requestRock(Number(entry.id) + g)); break;
            default: break;
        }
    }

    function queueContent(entry) {
        // The proxy goes on NOW, queued or not: the point is that the tile is
        // never a bare plate, and a re-queued sector (an owner change, a class
        // reveal) keeps whatever it already has until the real rebuild lands.
        if (!entry.content) installSurveyProxy(entry);
        // Ask the second thread for this tile's maps the instant the sector is
        // charted, which is the earliest moment the answer can be known and the
        // longest possible lead time before the tile is drained.
        requestForgeFor(entry);
        if (entry.contentQueued) return;
        entry.contentQueued = true;
        if (!entry.everQueued) {
            entry.everQueued = true;
            // The denominator the progress strip counts against: how many sectors
            // this session has ever had to survey.
            state.chartedTotal = (state.chartedTotal || 0) + 1;
        }
        state.contentQueue.push(entry);
        updateLoadingState();
    }

    /** What it would cost to finish this tile right now. Full rationale: docs/galaxy3d-design-notes.md#what-it-would-cost-to-finish-this-tile-right-now */
    function entryReadiness(entry) {
        const keys = forgeKeysOf(entry);
        if (!keys || !keys.length) return 'local';
        let waiting = false;
        let failed = false;
        for (const key of keys) {
            if (state.worldBundles.has(key)) continue;
            if (state.bundleFailed.has(key)) { failed = true; continue; }
            const since = state.bundlePending.get(key);
            if (since !== undefined) {
                if (performance.now() - since < FORGE_TIMEOUT_MS) { waiting = true; continue; }
                // Never answered. Take it back rather than leave the sector a
                // stand-in for the rest of the session.
                state.bundlePending.delete(key);
                state.bundleFailed.add(key);
                console.warn('Galaxy3D: forge did not answer for %s in time; generating locally.', key);
                failed = true;
                continue;
            }
            // Not requested yet and the forge is alive — ask, and let it wait one
            // more frame rather than paying for it here.
            if (state.forge && !state.forge.failed) { requestForgeFor(entry); waiting = true; continue; }
            failed = true;
        }
        // A tile only counts as cheap when EVERY map it draws with is already
        // resident: a belt half-forged still pays for the other two variants on
        // this thread, and calling that cheap is what poisons the pacing estimate.
        if (failed) return 'local';
        return waiting ? 'waiting' : 'cheap';
    }

    /** What an over-budget tile is, in words a player already knows. */
    function localStepLabel(entry) {
        if (entry.status === STATUS.BLACKHOLE || entry.type === 2) return 'mapping a black hole';
        if (entry.type === 3 || entry.type === 4) return 'lighting a star';
        if (entry.type === 1 || entry.status === STATUS.HAZARD) return 'plotting an asteroid field';
        return 'painting a world';
    }

    function drainContentQueue() {
        if (!state.contentQueue.length) return 0;
        const start = performance.now();
        const busy = handIsBusy(start);
        let built = 0;
        while (state.contentQueue.length) {
            if (built > 0) {
                // Would starting another one overrun? Then stop — the frame is
                // already carrying work and the player is owed a paint.
                const spent = performance.now() - start;
                if (spent + state.assembleCost > CONTENT_BUDGET_MS) break;
            }
            // Cheap items go through whatever the hand is doing: that is how the
            // board keeps filling in while the player pans across it. Expensive
            // ones wait for the gesture to finish.
            const entry = takeNearestQueued(!busy);
            if (!entry) break;
            entry.contentQueued = false;
            // initialize() can replace the whole grid while items are in flight.
            // Those entries have already been disposed and are not in the scene.
            if (state.sectors.get(entry.id) !== entry) continue;
            const cheap = entryReadiness(entry) === 'cheap';
            /**
             * AN OVER-BUDGET BAKE IS NAMED ON THE FRAME BEFORE IT RUNS.
             *
             * Setting the strip's text and then immediately blocking does not
             * put the text on screen — the paint happens after the block, which
             * is exactly when it stops being useful. So the item goes back in the
             * queue for one frame, the strip is repainted saying what is coming,
             * that frame is presented, and the bake happens on the next one. It
             * costs one 16 ms frame per hazard class and it is the difference
             * between a board that says what it is doing and one that looks hung.
             */
            const label = cheap ? '' : localStepLabel(entry);
            if (label && built === 0 && state.surveyStep !== label
                && state.contentCost >= CONTENT_BUDGET_MS) {
                noteSurveyStep(label);
                entry.contentQueued = true;
                state.contentQueue.push(entry);
                break;
            }
            const t0 = performance.now();
            rebuildContent(entry);
            const cost = performance.now() - t0;
            if (label) clearSurveyStep(label);
            noteCost(`sector${entry.id}:t${entry.type}${cheap ? ':forged' : ':local'}`, cost);
            if (cheap) {
                // Rises immediately, falls slowly. Underestimating costs the
                // player a frame; overestimating costs a world one extra frame as
                // a proxy. Tracked SEPARATELY from the fallback bakes, because
                // one 1.8-second belt used to poison the estimate for the eleven
                // one-millisecond assemblies behind it and hold the whole board
                // to one tile a frame.
                state.assembleCost = cost > state.assembleCost
                    ? cost : state.assembleCost * 0.75 + cost * 0.25;
            } else {
                state.contentCost = cost > state.contentCost
                    ? cost : state.contentCost * 0.75 + cost * 0.25;
                /**
                 * NO PROGRAM PRE-WARM HERE, AND THAT IS MEASURED.
                 *
                 * A belt or a star brings materials the driver has never seen, so
                 * the frame that first DRAWS one pays to compile them. Asking for
                 * those programs on this line — the same compileAsync the forged
                 * classes get in warmBundle() — looked obviously right and did
                 * not pay for itself when it was tried: compileAsync walks the
                 * whole scene, there are a dozen local items on a full board, and
                 * the audit's game median moved the wrong way. The forged classes
                 * are warmed because there are at most six of them and each one is
                 * warmed exactly once, before anything is drawn with it.
                 */
            }
            built++;
            // One over-budget item per frame, full stop.
            if (!cheap && cost >= CONTENT_BUDGET_MS) break;
        }
        if (built) updateLoadingState();
        if (state.warmPending) warmPrograms();
        return performance.now() - start;
    }

    /** COMPILE THE NEW SHADERS BEFORE THE FRAME THAT NEEDS THEM. Full rationale: docs/galaxy3d-design-notes.md#compile-the-new-shaders-before-the-frame-that-needs-them */
    function warmPrograms() {
        state.warmPending = false;
        const r = state.renderer;
        if (!r || !state.scene || !state.camera || typeof r.compileAsync !== 'function') return;
        // Same trap as releaseBundle(): without KHR_parallel_shader_compile this
        // is a SYNCHRONOUS compile of every material in the scene, so the call
        // that exists to move the cost off the frame is the cost. See
        // parallelCompile().
        if (!parallelCompile()) return;
        const t0 = performance.now();
        try {
            const p = r.compileAsync(state.scene, state.camera);
            if (p && typeof p.catch === 'function') p.catch(() => { /* first use will do it */ });
        } catch (err) { /* first use will do it */ }
        noteCost('warm', performance.now() - t0);
    }

    /** NEAREST TO WHAT THE PLAYER IS LOOKING AT, NOT FIRST IN. Full rationale: docs/galaxy3d-design-notes.md#nearest-to-what-the-player-is-looking-at-not-first-in */
    function takeNearestQueued(allowLocal) {
        const queue = state.contentQueue;
        if (!queue.length) return null;
        const target = state.camTarget;
        let best = -1;
        let bestDist = Infinity;
        for (let i = 0; i < queue.length; i++) {
            // A world still waiting on its class's bake is not skipped in
            // disgrace — it is a survey proxy, which is a legible state, and it
            // is passed over so the tiles that CAN be finished are finished now.
            const how = entryReadiness(queue[i]);
            if (how === 'waiting') continue;
            if (how === 'local' && !allowLocal) continue;
            const p = queue[i].group.position;
            const d = (p.x - target.x) * (p.x - target.x) + (p.z - target.z) * (p.z - target.z);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        if (best < 0) return null;
        return queue.splice(best, 1)[0];
    }

    /** THE TILE IS NEVER A HOLE. Full rationale: docs/galaxy3d-design-notes.md#the-tile-is-never-a-hole */
    function surveyProxyMaterial(kind) {
        const key = `proxy:${kind}`;
        if (state.materials.has(key)) return state.materials.get(key);
        const mat = new THREE.MeshPhongMaterial({
            color: new THREE.Color(kind),
            // Deliberately duller than a generated world: the stand-in must not
            // be mistaken for the finished article in a screenshot.
            specular: 0x1a1e26,
            shininess: 8,
            transparent: true,
            opacity: 0.9
        });
        mat.__shared = true;
        state.materials.set(key, mat);
        return mat;
    }

    /** Amber survey ring: this tile is being worked on. Shared geometry and material. */
    function surveyRingMaterial() {
        const key = 'proxy:ring';
        if (state.materials.has(key)) return state.materials.get(key);
        const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0.62, 0.45, 0.20),
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        mat.__shared = true;
        state.materials.set(key, mat);
        return mat;
    }

    /** Rough class hue for a stand-in, taken from the same table the real thing uses. */
    function proxyTone(entry) {
        if (entry.status === STATUS.BLACKHOLE || entry.type === 2) return 0x0a0a12;
        if (entry.type === 1 || entry.status === STATUS.HAZARD) return 0x6b6259;
        if (entry.type === 3) return 0xff944a;
        if (entry.type === 4) return 0xff6c2c;
        const style = PLANET_STYLES[Math.max(5, Math.min(10, Number(entry.type) || 8))];
        const base = style && style.atmo ? style.atmo : [120, 150, 190];
        return (Math.round(base[0] * 0.62) << 16) | (Math.round(base[1] * 0.62) << 8)
            | Math.round(base[2] * 0.62);
    }

    /**
     * Will this sector end up carrying a body at all?
     *
     * A stand-in that invents content is worse than no stand-in. proxyTone()
     * falls through to `Number(entry.type) || 8`, so an EMPTY-SPACE sector —
     * type 0 — was drawn as a type-8 blue planet for as long as it sat in the
     * queue, then vanished. In a game whose whole loop is deciding where to send
     * a fleet from what a sector contains, the opening seconds of the map were
     * showing worlds that are not there.
     *
     * A sector whose class is still unknown (type null) is a different case: it
     * is charted and important, rebuildContent() will give it a generic planet,
     * and a sphere is the honest guess. Only a KNOWN non-body gets the ring
     * alone.
     */
    function proxyIsBody(entry) {
        if (entry.type === null || entry.type === undefined) return true;
        if (entry.status === STATUS.BLACKHOLE || entry.status === STATUS.HAZARD) return true;
        return entry.type >= 1 && entry.type <= 10;
    }

    function installSurveyProxy(entry) {
        if (entry.proxy) return;
        const known = entry.status !== STATUS.UNKNOWN || entry.explored;
        if (!known || !state.sharedGeo.sphere) return;

        const group = new THREE.Group();
        if (proxyIsBody(entry)) {
            const type = Math.max(5, Math.min(10, Number(entry.type) || 8));
            const radius = type === 10 ? 0.50 : 0.34 + (type - 5) * 0.038;
            const body = new THREE.Mesh(state.sharedGeo.sphere, surveyProxyMaterial(proxyTone(entry)));
            body.scale.setScalar(radius);
            body.position.y = 0.44;
            group.add(body);
        }

        // The honest mark on its own: this tile is charted and still being
        // worked on. It is all an empty sector ever gets.
        const ring = new THREE.Mesh(state.sharedGeo.hover, surveyRingMaterial());
        ring.position.y = TILE_TOP + 0.005;
        ring.renderOrder = 1;
        group.add(ring);

        entry.group.add(group);
        entry.proxy = group;
    }

    function clearSurveyProxy(entry) {
        if (!entry.proxy) return;
        entry.group.remove(entry.proxy);
        // Every part of it is shared geometry and a shared material, so there is
        // nothing here to dispose — which is the point of using them.
        entry.proxy = null;
    }

    function rebuildContent(entry) {
        clearSurveyProxy(entry);
        disposeContent(entry);
        /**
         * "THE QUEUE HAS FINISHED WITH THIS TILE", which is not the same as
         * "this tile has content".
         *
         * updateSector() used to re-queue on `!entry.content`, and empty space
         * never gets content — so every server update put every empty sector
         * back in the queue, and with it its survey proxy. The phantom planet
         * was not only a startup artefact; it could flash again all session.
         */
        entry.surveyed = true;
        const known = entry.status !== STATUS.UNKNOWN || entry.explored;
        if (!known) return;

        let content = null;
        if (entry.status === STATUS.BLACKHOLE || entry.type === 2) {
            content = buildBlackHole(entry);
        } else if (entry.type === 1) {
            content = buildAsteroids(entry);
        } else if (entry.type === 3 || entry.type === 4) {
            content = buildStar(entry);
        } else if (entry.type >= 5 && entry.type <= 10) {
            content = buildPlanet(entry);
        } else if (entry.status === STATUS.HOMEWORLD || entry.status === STATUS.OWNED ||
                   entry.status === STATUS.ENEMY || entry.status === STATUS.COLONIZED) {
            // Known important sector but type unknown yet: show a generic planet.
            content = buildPlanet(entry);
        } else if (entry.status === STATUS.HAZARD) {
            content = buildAsteroids(entry);
        }

        if (content) {
            entry.group.add(content);
            entry.content = content;
            applyDetail(entry, pixelsPerUnit());
        }

        // Stars are the light sources every world around them is shaded by, so
        // the register of where they are has to be rebuilt when one appears.
        const wasStar = entry.isStar;
        entry.isStar = Boolean(content && content.userData.star);
        if (wasStar !== entry.isStar) {
            state.starSectors = [];
            state.sectors.forEach(other => {
                if (other.isStar) state.starSectors.push(other.group.position.clone());
            });
            refreshPlanetLighting();
        } else {
            applyPlanetLighting(entry);
        }
    }

    // ------------------------------------------------------------------
    // Tile materials
    // ------------------------------------------------------------------

    /** Shared per (status, live, hover). 112 tiles used to mean 112 unique. Full rationale: docs/galaxy3d-design-notes.md#shared-per-status-live-hover-112-tiles-used-to-mean-112-uniq */
    function tileMaterial(status, live, hovered, tone) {
        const key = `tile:${status}:${live ? 1 : 0}:${hovered ? 1 : 0}:${tone || '-'}`;
        if (state.materials.has(key)) return state.materials.get(key);
        const toned = tone ? HAZARD_TONE[tone] : null;
        const colour = new THREE.Color(
            toned ? toned.color : (STATUS_COLORS[status] ?? STATUS_COLORS[STATUS.UNKNOWN]));
        // Charted but unclaimed. Reusing the UNKNOWN swatch here made "we have
        // been here and there is nothing" darker than "we have never been", which
        // is the wrong way round; a surveyed plate is a LIT plate in plain steel,
        // and it has no faction hue precisely because nobody owns it.
        const empty = status === STATUS.UNKNOWN;
        // Plain steel, and deliberately a rung brighter than the fog plate it has
        // to out-read: "we have been here and there is nothing" is the quietest
        // tile on the board, so it is the one whose separation from unexplored is
        // thinnest and the one that has to be checked when either end moves.
        const base = empty ? new THREE.Color(0x9aa6c0) : colour;
        // HAZARD TILES ARE THE DARKEST CHARTED CLASS. Measured, a belt plate and
        // a plain steel plate came back a 1.03:1 step apart with hue as the only
        // separator — on the read that decides whether a fleet survives. Pairing
        // this with the stencilled hazard hatch gives two non-hue channels.
        const hazardDim = toned ? 0.80 : 1;
        const plate = plateMaps();
        const mat = new THREE.MeshPhongMaterial({
            map: toned ? plateVariantMap(toned.stencil) : plate.map,
            normalMap: plate.normalMap,
            // The plate is dark steel; the status tint is a WASH over it, never
            // the whole colour, or the board turns into a bag of sweets.
            // 0.82 for a remembered tile, not 0.60. Once the fog plates were
            // lifted into readable mid-tone, a memory plate at 0.60 measured
            // level with them and the two states stopped separating — the ladder
            // has to move as a whole, not one rung of it.
            color: base.clone().multiplyScalar((live ? 0.95 : 0.82) * hazardDim)
                .lerp(new THREE.Color(0x4d5870), 0.10),
            // EMISSIVE THROUGH THE ALBEDO, not over it. An untextured constant. Full rationale: docs/galaxy3d-design-notes.md#emissive-through-the-albedo-not-over-it-an-untextured-consta
            emissiveMap: toned ? plateVariantMap(toned.stencil) : plate.map,
            emissive: empty ? new THREE.Color(0x3c4762) : colour,
            // 0.30 rather than the old 0.34 looks like a small change and is not:
            // it is now MULTIPLIED by an albedo whose mean is about 0.18 in
            // linear light, so the emissive term went from half the plate's value
            // to about a seventh of it — and what is left of it follows the frame
            // lip, the rivets and the grain instead of flooding over them.
            emissiveIntensity: 0.30 * (live ? 1 : 0.72) * (toned ? 0.82 : 1) + (hovered ? 0.35 : 0),
            /** THE SPECULAR MODEL IS WHAT MAKES THIS METAL OR WOOD. Full rationale: docs/galaxy3d-design-notes.md#the-specular-model-is-what-makes-this-metal-or-wood */
            specular: 0x8a94a8,
            // 190. The direction called for 220 and the reasoning behind it is
            // right — the point is a lobe narrow enough to collapse the highlight
            // onto the chamfer instead of flooding the face, against the old 34.
            // But a lobe this tight over a normal map with tool marks in it also
            // means isolated texels reach N.H ~ 1 and flash, and on a machine
            // with no MSAA that is a field of white glitter on every plate. 190
            // is still unambiguously metal and it stops sparkling.
            shininess: 190,
            // The plates are the largest fill in the scene by a wide margin, so
            // a cube lookup here is a cube lookup over most of the viewport.
            // Worth it on a GPU; on a CPU rasteriser it is the difference
            // between an interactive map and a slideshow, and the tint-plus-key
            // read survives without it.
            envMap: state.software ? null : studioEnvTexture(),
            combine: THREE.AddOperation,
            // 0.10, MEASURED. At 0.26 the added reflection was most of the
            // plate's value: the bronze belt tile came back at rgb(149,137,131)
            // — neutral grey, brighter than plain steel, with the hazard hue
            // gone entirely. GAMEPLAY SIGNAL IS SACRED, so the reflected term
            // gets whatever is left after the swatch is safe, and no more. What
            // it buys at this weight is still the thing it is for: a moving
            // glint on the chamfers that a directional lobe alone cannot give.
            reflectivity: 0.10,
            // Solid plate = charted and held. Translucent = remembered, or never
            // visited. That is a second, redundant channel for the same read as
            // the tint, and redundancy is what keeps a board legible at a glance.
            transparent: !live,
            opacity: live ? 1 : 0.76
        });
        // 0.62, not 0.42. The normal map now carries the machining pass — the
        // fine tool marks that were moved out of the albedo — and at half
        // strength they did not glint, they just softened. Above about 0.7 the
        // tight specular starts sparkling on them instead.
        mat.normalScale.set(0.55, 0.55);
        mat.__shared = true;
        state.materials.set(key, mat);
        return mat;
    }

    /** Fog plates, in SIX variants. Full rationale: docs/galaxy3d-design-notes.md#fog-plates-in-six-variants */
    const FOG_VARIANTS = 6;
    // Coprime with FOG_VARIANTS on purpose: 7 uv bakes against 6 material
    // transforms is a 42-cell cycle, so the pattern cannot recur inside a screen.
    const FOG_CELL_VARIANTS = 7;

    /** The uv-baked socket geometry this cell uses. See buildFogCellGeometry. */
    function fogCellGeometry(id) {
        const pool = state.sharedGeo.fogCells;
        if (!pool || !pool.length) return state.sharedGeo.fogCell;
        const n = Number(id) || 1;
        const row = Math.floor((n - 1) / Math.max(1, state.width));
        return pool[(((n + row * 2) % pool.length) + pool.length) % pool.length];
    }

    function fogMaterial(id) {
        if (!state.fogMaterials) state.fogMaterials = [];
        const row = Math.floor(((Number(id) || 1) - 1) / Math.max(1, state.width));
        const index = ((((Number(id) || 1) + row * 3) % FOG_VARIANTS) + FOG_VARIANTS) % FOG_VARIANTS;
        if (state.fogMaterials[index]) return state.fogMaterials[index];
        const haze = fogTexture().clone();
        haze.needsUpdate = true;
        haze.center.set(0.5, 0.5);
        haze.rotation = (index / FOG_VARIANTS) * Math.PI * 2 + 0.4;
        haze.repeat.set(1.13 + index * 0.07, 1.07 + index * 0.05);
        haze.__shared = true;
        haze.__baseOffset = { x: hash2(index, 5, 91), y: hash2(index, 9, 137) };
        const mat = new THREE.MeshPhongMaterial({
            // NO PLATE MAP. Not a tuning choice — the whole point of the fog cell. Full rationale: docs/galaxy3d-design-notes.md#no-plate-map-not-a-tuning-choice-the-whole-point-of-the-fog-
            color: 0x0d1120,
            // The haze rides in as EMISSIVE so the socket's own shading survives
            // beneath it and the two can scroll on independent uv transforms. It
            // is the brightest thing inside an otherwise empty cell — a sensor
            // return the instrument cannot resolve is still a return, and about a
            // hundred tiles once vanished entirely when this went to black.
            emissiveMap: haze,
            emissive: 0xffffff,
            // 0.15, not 0.12: the socket's chamfer no longer carries a 3.1x
            // vertex tint (see buildFogCellGeometry) and the depth falloff below
            // takes the far half of the field down by half again, so the haze
            // has to carry more of the cell than it used to or the unexplored
            // region slides back toward the black it once vanished into.
            emissiveIntensity: 0.15,
            // Carries the socket chamfer (see buildFogCellGeometry).
            vertexColors: true,
            specular: 0x1c2434,
            shininess: 24,
            transparent: true,
            opacity: 0.84
        });
        mat.__shared = true;
        mat.__haze = haze;
        /** THE UNEXPLORED FIELD HAS TO RECEDE. Full rationale: docs/galaxy3d-design-notes.md#the-unexplored-field-has-to-recede */
        mat.__depth = { value: new THREE.Vector2(12, 18) };
        mat.onBeforeCompile = shader => {
            shader.uniforms.uFogCellDepth = mat.__depth;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nvarying float vCellDepth;')
                .replace('#include <project_vertex>',
                    '#include <project_vertex>\nvCellDepth = - mvPosition.z;');
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>',
                    '#include <common>\nuniform vec2 uFogCellDepth;\nvarying float vCellDepth;')
                .replace('#include <opaque_fragment>',
                    'outgoingLight *= mix( 1.0, 0.52, smoothstep( uFogCellDepth.x, uFogCellDepth.y, vCellDepth ) );\n#include <opaque_fragment>');
        };
        state.fogMaterials[index] = mat;
        // A grid laid out after the governor has already shed detail must match
        // the one it replaced, not silently start again at full price.
        conformFogMaterial(mat);
        return mat;
    }

    function applyStatusVisual(entry) {
        const explored = entry.explored || entry.status !== STATUS.UNKNOWN;
        entry.tile.visible = true;
        // The GEOMETRY changes, not only the material. An unexplored sector is a
        // hole in the deck; a charted one has a plate bolted into it. Dropping it
        // in Y as well means the unknown region falls away from the charted plane
        // — the one depth cue a flat hex board can have that costs nothing.
        if (!explored) {
            entry.tile.geometry = fogCellGeometry(entry.id);
            entry.group.position.y = -FOG_DROP;
            entry.tile.material = fogMaterial(entry.id);
            return;
        }
        entry.tile.geometry = state.sharedGeo.hex;
        entry.group.position.y = 0;
        entry.tile.material = tileMaterial(
            entry.status, entry.live, state.hovered === entry.id, hazardToneFor(entry));
    }

    /** Roughly how light the finished plate is, 0..1. Used to decide whether the. Full rationale: docs/galaxy3d-design-notes.md#roughly-how-light-the-finished-plate-is-0-1-used-to-decide-w */
    function plateLuminance(entry) {
        const explored = entry.explored || entry.status !== STATUS.UNKNOWN;
        if (!explored) return 0.3;
        const tone = hazardToneFor(entry);
        const c = new THREE.Color(tone
            ? HAZARD_TONE[tone].color
            : (STATUS_COLORS[entry.status] ?? STATUS_COLORS[STATUS.UNKNOWN]));
        const lum = c.r * 0.30 + c.g * 0.59 + c.b * 0.11;
        // The plate albedo averages a little under half, the key light is over
        // unity, and a non-live tile is dimmed and made translucent. Hazard
        // plates carry the extra 20% darkening tileMaterial applies to make them
        // the darkest charted class, and the glyph polarity is measured off the
        // FINISHED plate or it is measuring nothing.
        return lum * 0.62 * (entry.live ? 1.35 : 0.75) * (tone ? 0.80 : 1);
    }

    // ------------------------------------------------------------------
    // Labels and badges. Both are gameplay signal, so both are painted just
    // under the bloom threshold and neither is tone-mapped away.
    // ------------------------------------------------------------------

    /** A STAMPED STEEL TAB, not a hologram pill. Full rationale: docs/galaxy3d-design-notes.md#a-stamped-steel-tab-not-a-hologram-pill */
    function makeBadgeTexture(count, hostile) {
        // 3x the old resolution. At 128x56 magnified onto the plate the emboss
        // rules were a single soft pixel each and the whole thing degenerated
        // into the flat grey chip the review called a bootstrap pill.
        const W = 256, H = 112;
        const canvas = canvas2d(W, H);
        const ctx = canvas.getContext('2d');
        const x0 = 8, y0 = 10, w = W - 16, h = H - 22;
        const ch = 13;   // chamfer depth. ROUNDED CORNERS ARE THE TELL — cut, not filleted.

        /** The tab's outline: a rectangle with its four corners cut off. */
        function tabPath(inset) {
            const a = x0 + inset, b = y0 + inset;
            const ww = w - inset * 2, hh = h - inset * 2;
            const c = Math.max(2, ch - inset);
            ctx.beginPath();
            ctx.moveTo(a + c, b);
            ctx.lineTo(a + ww - c, b);
            ctx.lineTo(a + ww, b + c);
            ctx.lineTo(a + ww, b + hh - c);
            ctx.lineTo(a + ww - c, b + hh);
            ctx.lineTo(a + c, b + hh);
            ctx.lineTo(a, b + hh - c);
            ctx.lineTo(a, b + c);
            ctx.closePath();
        }

        // Drop shadow onto whatever it is bolted to.
        ctx.save();
        ctx.translate(3, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        tabPath(0);
        ctx.fill();
        ctx.restore();

        // Body: brushed steel with a warm or cold cast depending on whose it is.
        const body = ctx.createLinearGradient(0, y0, 0, y0 + h);
        if (hostile) {
            body.addColorStop(0, '#8d4f4a');
            body.addColorStop(0.40, '#5a3230');
            body.addColorStop(0.62, '#48282a');
            body.addColorStop(1, '#2a1618');
        } else {
            body.addColorStop(0, '#828ea2');
            body.addColorStop(0.40, '#4a5568');
            body.addColorStop(0.62, '#3a4454');
            body.addColorStop(1, '#1d2532');
        }
        ctx.save();
        tabPath(0);
        ctx.clip();
        ctx.fillStyle = body;
        ctx.fillRect(0, 0, W, H);
        // Machining grain across the tab, so it is the same steel as the deck.
        ctx.globalAlpha = 0.16;
        for (let y = y0; y < y0 + h; y += 2) {
            const j = hash2(y, 5, 611);
            ctx.fillStyle = j > 0.5 ? '#ffffff' : '#000000';
            ctx.fillRect(x0, y, w, 1);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // THE EMBOSS: a bright top lip over a dark bottom groove, following the
        // chamfer rather than a rectangle — the same two-stroke vocabulary the
        // deck plates use for their frame, at the scale of an installed tab.
        ctx.save();
        tabPath(0);
        ctx.clip();
        ctx.lineJoin = 'miter';
        ctx.strokeStyle = hostile ? 'rgba(250,214,204,0.80)' : 'rgba(222,234,250,0.74)';
        ctx.lineWidth = 5;
        tabPath(1);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(4,6,10,0.88)';
        ctx.lineWidth = 5;
        ctx.save();
        ctx.translate(0, 5);
        tabPath(1);
        ctx.stroke();
        ctx.restore();
        ctx.restore();

        // The mounting rivets, in the chamfered corners where a real tab is
        // bolted through.
        for (const [rx, ry] of [[x0 + 15, y0 + h / 2], [x0 + w - 15, y0 + h / 2]]) {
            ctx.fillStyle = 'rgba(4,6,10,0.55)';
            ctx.beginPath();
            ctx.arc(rx + 1, ry + 1.5, 9, 0, Math.PI * 2);
            ctx.fill();
            const g = ctx.createRadialGradient(rx - 3, ry - 3.4, 0.6, rx, ry, 8.4);
            g.addColorStop(0, 'rgba(240,246,255,0.98)');
            g.addColorStop(0.45, 'rgba(150,158,174,0.86)');
            g.addColorStop(0.86, 'rgba(46,52,64,0.8)');
            g.addColorStop(1, 'rgba(6,8,12,0.85)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(rx, ry, 8.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(10,12,18,0.55)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(rx - 4.6, ry - 1.2);
            ctx.lineTo(rx + 4.6, ry + 1.2);
            ctx.stroke();
        }

        // Hull glyph, painted rather than typed so it cannot fall back to a tofu
        // box on a machine without the dingbat font.
        const ink = hostile ? '#ffdcd4' : '#dfe7f4';
        // THE COUNT IS AMBER ON A STEEL BODY, not white on a tinted one. Whose
        // fleet it is comes from the body value (cold steel vs dark oxide red);
        // the number is the instrument reading, and every other reading on this
        // board is stencilled in the same amber. That also keeps the pair legible
        // for a player who cannot separate the two body hues.
        const digitInk = hostile ? '#ffd2c6' : '#f2c169';
        ctx.fillStyle = 'rgba(4,6,10,0.7)';
        ctx.beginPath();
        ctx.moveTo(x0 + 48, y0 + 21);
        ctx.lineTo(x0 + 72, y0 + h / 2);
        ctx.lineTo(x0 + 48, y0 + h - 21);
        ctx.lineTo(x0 + 56, y0 + h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.translate(-1.5, -1.5);
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.moveTo(x0 + 48, y0 + 21);
        ctx.lineTo(x0 + 72, y0 + h / 2);
        ctx.lineTo(x0 + 48, y0 + h - 21);
        ctx.lineTo(x0 + 56, y0 + h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // The count, stencilled into the tab.
        ctx.font = 'bold 54px "Share Tech Mono", "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(4,6,10,0.92)';
        ctx.strokeText(String(count), x0 + 86, y0 + h / 2 + 2);
        ctx.fillStyle = digitInk;
        ctx.fillText(String(count), x0 + 86, y0 + h / 2 + 2);

        return toTex(canvas, THREE.SRGBColorSpace);
    }

    function updateBadge(entry) {
        if (entry.badge) {
            entry.group.remove(entry.badge);
            entry.badge.material.map.dispose();
            entry.badge.material.dispose();
            entry.badge = null;
        }
        if (entry.fleetSize > 0) {
            const enemyFleet = (entry.flags & 16) !== 0;
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: makeBadgeTexture(entry.fleetSize, enemyFleet),
                transparent: true,
                depthWrite: false,
                /** IT MAY NOT BE EATEN BY THE THING IT ANNOTATES. Full rationale: docs/galaxy3d-design-notes.md#it-may-not-be-eaten-by-the-thing-it-annotates */
                depthTest: false,
                toneMapped: false
            }));
            // ON THE PLATE'S NEAR-RIGHT FRAME, clear of the globe's silhouette. Full rationale: docs/galaxy3d-design-notes.md#on-the-plate-s-near-right-frame-clear-of-the-globe-s-silhoue
            /** BIG ENOUGH TO BE A READ, NOT A DECORATION. Full rationale: docs/galaxy3d-design-notes.md#big-enough-to-be-a-read-not-a-decoration */
            const bw = 0.68, bh = 0.298;
            const bearing = Math.PI / 6;
            // 0.88, and sitting at 0.16 rather than 0.20: the tab is 50% wider
            // than it was, so it is pulled in and down until its lower-right
            // corner — the one the camera's tilt pushes furthest out — is still
            // inside the tile's own hexagon.
            const reach = hexReachAt(bearing) * 0.88 - bw * 0.42;
            sprite.scale.set(bw, bh, 1);
            sprite.position.set(Math.cos(bearing) * reach, 0.16, Math.sin(bearing) * reach);
            sprite.renderOrder = 7;
            entry.group.add(sprite);
            entry.badge = sprite;
        }
    }

    /** THE SECTOR CODE, AS AN INSTALLED NAMEPLATE. Full rationale: docs/galaxy3d-design-notes.md#the-sector-code-as-an-installed-nameplate */
    const ID_PLATE_W = 0.80, ID_PLATE_D = 0.30, ID_PLATE_X = -0.16, ID_PLATE_Z = 0.46;

    function updateIdLabel(entry) {
        if (entry.idLabel) {
            entry.group.remove(entry.idLabel);
            entry.idLabel.material.map.dispose();
            entry.idLabel.material.dispose();
            entry.idLabel = null;
        }
        if (!entry.explored) return;
        const text = entry.indicator ? `${entry.id} ${entry.indicator}` : String(entry.id);
        const W = 256, H = 96;
        const canvas = canvas2d(W, H);
        const ctx = canvas.getContext('2d');
        // The POLARITY comes from the plate, not from whether the tile is live.
        // Light glyphs with a thin dark outline on a near-white gold plate were
        // the lowest-contrast text on the board — worse than the same number on a
        // blue plate — so above a luminance threshold the pair inverts and the
        // number is stencilled dark into the metal instead.
        const dark = plateLuminance(entry) > 0.48;

        const m = 7, ch = 12;
        function bezel(inset) {
            const a = m + inset, b = m + inset;
            const ww = W - 2 * (m + inset), hh = H - 2 * (m + inset);
            const c = Math.max(2, ch - inset);
            ctx.beginPath();
            ctx.moveTo(a + c, b);
            ctx.lineTo(a + ww - c, b);
            ctx.lineTo(a + ww, b + c);
            ctx.lineTo(a + ww, b + hh - c);
            ctx.lineTo(a + ww - c, b + hh);
            ctx.lineTo(a + c, b + hh);
            ctx.lineTo(a, b + hh - c);
            ctx.lineTo(a, b + c);
            ctx.closePath();
        }

        // A RECESS: the far wall of a sunken tray catches the key, the near wall
        // is in its own shadow. Same emboss vocabulary as the deck plates, one
        // scale down.
        ctx.save();
        bezel(0);
        ctx.clip();
        const tray = ctx.createLinearGradient(0, m, 0, H - m);
        tray.addColorStop(0, dark ? 'rgba(24,22,16,0.62)' : 'rgba(10,13,20,0.66)');
        tray.addColorStop(0.5, dark ? 'rgba(46,40,26,0.40)' : 'rgba(18,23,34,0.44)');
        tray.addColorStop(1, dark ? 'rgba(96,84,52,0.34)' : 'rgba(52,62,84,0.36)');
        ctx.fillStyle = tray;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        // The lip: bright along the top and left of the recess where the key
        // strikes the wall, dark along the bottom.
        ctx.save();
        ctx.lineJoin = 'miter';
        ctx.strokeStyle = 'rgba(226,234,250,0.34)';
        ctx.lineWidth = 4;
        bezel(1);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(2,4,8,0.6)';
        ctx.lineWidth = 4;
        ctx.save();
        ctx.translate(0, 4);
        bezel(1);
        ctx.stroke();
        ctx.restore();
        ctx.restore();
        // Two seating rivets, so the plate is bolted on rather than printed.
        for (const rx of [m + 13, W - m - 13]) {
            const g = ctx.createRadialGradient(rx - 1.6, H / 2 - 1.8, 0.4, rx, H / 2, 5.4);
            g.addColorStop(0, 'rgba(236,242,254,0.85)');
            g.addColorStop(0.5, 'rgba(132,140,156,0.7)');
            g.addColorStop(1, 'rgba(6,8,12,0.7)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(rx, H / 2, 5.2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.font = 'bold 54px "Share Tech Mono", "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // A drawn OUTLINE, not a drop shadow — but a THIN one. The old 6px halo
        // existed because the glyphs had to survive landing on arbitrary terrain;
        // sitting on a controlled bezel they only need enough to hold the edge.
        ctx.lineJoin = 'round';
        ctx.lineWidth = 5;
        ctx.strokeStyle = dark ? 'rgba(244,246,255,0.85)' : 'rgba(2,4,10,0.92)';
        ctx.strokeText(text, W / 2, H / 2 + 2);
        // A stop brighter than it was. THE NUMBER IS THE BRIGHTEST MARK ON THE
        // TILE, or the tile's furniture is out-shouting its label — measured,
        // the selection brackets beat the numeral 220 to 192 before this and the
        // eye went to a bracket. Still under the bloom threshold, which is where
        // a label has to stay: a glowing sector code costs legibility.
        ctx.fillStyle = dark
            ? 'rgba(12,10,7,0.98)'
            : (entry.live ? 'rgba(247,250,255,1)' : 'rgba(186,196,220,0.82)');
        ctx.fillText(text, W / 2, H / 2 + 2);

        const mesh = new THREE.Mesh(
            state.sharedGeo.idPlate,
            new THREE.MeshBasicMaterial({
                map: toTex(canvas, THREE.SRGBColorSpace),
                transparent: true,
                depthWrite: false,
                // Depth testing is ON, which is the point: a rock in front of the
                // tile now correctly occludes the code instead of the code
                // punching through the rock. polygonOffset keeps it off the
                // plate's own surface without a z-fighting shimmer.
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4,
                toneMapped: false
            })
        );
        mesh.renderOrder = 4;
        mesh.scale.set(ID_PLATE_W, 1, ID_PLATE_D);
        mesh.position.set(ID_PLATE_X, TILE_TOP + 0.014, ID_PLATE_Z);
        entry.group.add(mesh);
        entry.idLabel = mesh;
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    function initialize(width, height) {
        if (!ensureScene()) return false;
        const w = Number(width) || 14;
        const h = Number(height) || 8;
        if (state.gridBuilt && state.width === w && state.height === h) {
            return true;
        }
        state.width = w;
        state.height = h;

        // Clear previous grid
        state.sectors.forEach(entry => {
            disposeContent(entry);
            state.scene.remove(entry.group);
        });
        state.sectors.clear();
        state.contentQueue.length = 0;
        state.starSectors = [];
        // A new board is a new thing to be ready for, and a new survey to
        // announce, time and estimate from scratch.
        state.boardAnnounced = false;
        state.saidSurveyHalf = false;
        state.surveyStep = '';
        state.surveyDone = -1;
        state.surveyChangedAt = 0;
        state.surveyRates = [];

        const total = w * h;
        state.center.set(((w - 1) * HORIZ) / 2, 0, ((h - 1) * VERT + VERT / 2) / 2);

        for (let id = 1; id <= total; id++) {
            const group = new THREE.Group();
            group.position.copy(sectorPosition(id));
            group.position.y = -FOG_DROP;
            const tile = new THREE.Mesh(fogCellGeometry(id), fogMaterial(id));
            tile.userData.sectorId = id;
            tile.renderOrder = 0;
            group.add(tile);
            state.scene.add(group);
            state.sectors.set(id, {
                id,
                group,
                tile,
                content: null,
                badge: null,
                idLabel: null,
                status: STATUS.UNKNOWN,
                explored: false,
                live: false,
                isStar: false,
                // Whether the content queue has ever finished with this tile.
                // NOT "has content": empty space legitimately has none — see
                // rebuildContent().
                surveyed: false,
                type: null,
                flags: 0,
                indicator: '',
                fleetSize: 0
            });
        }

        // The sky dome, the two nebula sheets and 900 dust points cost 378 ms on
        // the audit harness and NONE of it is gameplay: it is what the board
        // floats in. The boot schedule builds it a frame or two after the grid is
        // already on screen, by which time the player has a board to look at.
        const requestedFocus = state.pendingFocusSector === null
            ? null
            : state.sectors.get(Number(state.pendingFocusSector));
        if (requestedFocus) {
            state.camTarget.set(requestedFocus.group.position.x, 0, requestedFocus.group.position.z);
            state.pendingFocusSector = null;
        } else {
            state.camTarget.copy(state.center);
        }
        fitCamera();
        state.gridBuilt = true;
        return true;
    }

    function updateSector(sectorId, statusNum, details = {}) {
        const entry = state.sectors.get(Number(sectorId));
        if (!entry) return;
        const status = Number(statusNum) || 0;
        const changedStatus = entry.status !== status;
        entry.status = status;
        if (details.live !== undefined) {
            entry.live = Boolean(details.live);
        } else if (status !== STATUS.UNKNOWN) {
            entry.live = true;
        }
        if (status !== STATUS.UNKNOWN || entry.live || details.live === false || details.type !== undefined) {
            entry.explored = true;
        }

        let changedType = false;
        if (details.type !== undefined && details.type !== null && Number.isFinite(Number(details.type))) {
            const t = Number(details.type);
            if (entry.type !== t) {
                entry.type = t;
                changedType = true;
            }
        }

        let changedBadge = false;
        if (details.flags !== undefined) {
            const f = Number(details.flags) || 0;
            if (entry.flags !== f) {
                entry.flags = f;
                changedBadge = true;
            }
        }
        const fleet = Number(details.fleetSize);
        if (Number.isFinite(fleet) && fleet !== entry.fleetSize) {
            entry.fleetSize = fleet;
            changedBadge = true;
        }
        if (changedBadge) updateBadge(entry);

        const indicator = details.indicator !== undefined ? (details.indicator || '') : entry.indicator;
        entry.indicator = indicator;
        // status and type are in the key because the glyph POLARITY is derived
        // from how light the finished plate is, so a tile that changes owner or
        // reveals its class has to repaint its number.
        const labelKey = `${entry.explored}|${entry.live}|${indicator}|${entry.status}|${entry.type}`;
        if (entry.labelKey !== labelKey) {
            entry.labelKey = labelKey;
            updateIdLabel(entry);
        }

        applyStatusVisual(entry);
        if (changedStatus || changedType || !entry.surveyed) {
            queueContent(entry);
        }
    }

    // . Full rationale: docs/galaxy3d-design-notes.md#fleet-movement

    const TRAIL_SEGMENTS = 26;
    /** Cruising height, in hex units above the plate. Clears the largest world. */
    const FLEET_ALTITUDE = 1.25;
    // The plume's footprint, in hull-scale units. See the note where the plume
    // mesh is built: the ship has to win the silhouette, so the thrust is
    // shorter than the hull and narrower than it, and the alpha in the plume
    // texture pulls the visible column in tighter still.
    const PLUME_WIDTH = 0.34;
    const PLUME_LENGTH = 0.62;

    /** A slender six-sided dart, nose along +Z. Full rationale: docs/galaxy3d-design-notes.md#a-slender-six-sided-dart-nose-along-z */
    /** Concatenate non-indexed geometries into one buffer: one draw, one object. Full rationale: docs/galaxy3d-design-notes.md#concatenate-non-indexed-geometries-into-one-buffer-one-draw- */
    function mergeGeometries(parts, withUv) {
        let count = 0;
        parts.forEach(g => { count += g.attributes.position.count; });
        const pos = new Float32Array(count * 3);
        const nrm = new Float32Array(count * 3);
        const uvs = withUv ? new Float32Array(count * 2) : null;
        let o = 0;
        parts.forEach(g => {
            pos.set(g.attributes.position.array, o * 3);
            nrm.set(g.attributes.normal.array, o * 3);
            if (uvs && g.attributes.uv) uvs.set(g.attributes.uv.array, o * 2);
            o += g.attributes.position.count;
            g.dispose();
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        if (uvs) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geo.computeBoundingSphere();
        return geo;
    }

    /** A HULL WITH A SILHOUETTE: a long fuselage flanked by two offset nacelles. Full rationale: docs/galaxy3d-design-notes.md#a-hull-with-a-silhouette-a-long-fuselage-flanked-by-two-offs */
    /** UV LAYOUT FOR THE HULL. Full rationale: docs/galaxy3d-design-notes.md#uv-layout-for-the-hull */
    const PLAIN_UV = { u0: 0.62, v0: 0.06, du: 0.16, dv: 0.16 };

    function remapUv(geo, rect) {
        const uv = geo.attributes.uv;
        if (!uv) return geo;
        for (let i = 0; i < uv.count; i++) {
            uv.setXY(i, rect.u0 + uv.getX(i) * rect.du, rect.v0 + uv.getY(i) * rect.dv);
        }
        uv.needsUpdate = true;
        return geo;
    }

    function buildDartGeometry() {
        const parts = [];

        // rotateX(+PI/2) sends the cylinder's +Y axis to +Z, so the narrow end
        // (radiusTop) becomes the NOSE. The opposite sign points it backwards.
        const fuselage = new THREE.CylinderGeometry(0.07, 0.34, 1.55, 9, 3);
        fuselage.rotateX(Math.PI / 2);
        fuselage.scale(1, 0.62, 1);
        fuselage.translate(0, 0, 0.22);
        parts.push(fuselage.toNonIndexed());

        // The engine bell: a hull without a nozzle has no back. Short, flared,
        // and sunk into the fuselage so it reads as an installed component.
        const nozzle = new THREE.CylinderGeometry(0.30, 0.22, 0.16, 9, 1, true);
        nozzle.rotateX(Math.PI / 2);
        nozzle.scale(1, 0.62, 1);
        nozzle.translate(0, 0, -0.60);
        parts.push(remapUv(nozzle.toNonIndexed(), { u0: 0.62, v0: 0.55, du: 0.16, dv: 0.30 }));

        for (const side of [-1, 1]) {
            // Pods, not spars. Kept SHORT and close in: separated far enough to
            // be their own masses and no further, because three long slender
            // cones spaced apart do not read as one ship — they read as three
            // shards, which is precisely what the first attempt at this drew.
            const nacelle = new THREE.CylinderGeometry(0.11, 0.15, 0.72, 8, 2);
            nacelle.rotateX(Math.PI / 2);
            nacelle.scale(1, 0.85, 1);
            nacelle.translate(side * 0.34, -0.03, -0.26);
            parts.push(nacelle.toNonIndexed());

            // The wing that ties the pod to the hull. This is the piece that
            // turns "spindle plus two lumps" into a silhouette.
            const wing = new THREE.BoxGeometry(0.30, 0.05, 0.46);
            wing.translate(side * 0.19, -0.02, -0.20);
            parts.push(remapUv(wing.toNonIndexed(), PLAIN_UV));

            // GREEBLES. Three small masses per side: a sensor blister forward, a
            // radiator strake along the wing root and an intercooler block under
            // the pod. At map zoom they are two or three pixels each and that is
            // the point — a silhouette with bumps in it reads as machinery, a
            // clean one reads as a primitive.
            const blister = new THREE.BoxGeometry(0.07, 0.055, 0.13);
            blister.translate(side * 0.13, 0.045, 0.30);
            parts.push(remapUv(blister.toNonIndexed(), PLAIN_UV));
            const strake = new THREE.BoxGeometry(0.035, 0.075, 0.30);
            strake.translate(side * 0.30, 0.045, -0.16);
            parts.push(remapUv(strake.toNonIndexed(), PLAIN_UV));
            const cooler = new THREE.BoxGeometry(0.10, 0.05, 0.16);
            cooler.translate(side * 0.34, -0.11, -0.30);
            parts.push(remapUv(cooler.toNonIndexed(), PLAIN_UV));
        }

        // A short dorsal spine, so the ship is not a flat plate when it banks.
        const fin = new THREE.BoxGeometry(0.06, 0.20, 0.44);
        fin.translate(0, 0.12, -0.24);
        parts.push(remapUv(fin.toNonIndexed(), PLAIN_UV));

        // Bridge block: the cockpit is a canopy painted into the emissive map,
        // and a canopy needs something to be set into.
        const bridge = new THREE.BoxGeometry(0.13, 0.07, 0.24);
        bridge.translate(0, 0.085, 0.26);
        parts.push(remapUv(bridge.toNonIndexed(), { u0: 0.30, v0: 0.62, du: 0.18, dv: 0.16 }));

        const geo = mergeGeometries(parts, true);
        geo.scale(0.82, 0.82, 0.82);
        return geo;
    }

    /** THE PLUME IS AN IMAGE, NOT A SOLID. Full rationale: docs/galaxy3d-design-notes.md#the-plume-is-an-image-not-a-solid */
    function buildPlumeGeometry() {
        const positions = [];
        const uvs = [];
        for (let k = 0; k < 3; k++) {
            // A plane and its 180-degree twin are the same plane, so three
            // planes cover the circle at 60-degree spacing.
            const a = (k / 3) * Math.PI;
            const dx = Math.cos(a) * 0.5, dy = Math.sin(a) * 0.5;
            const A = [-dx, -dy, 0], B = [dx, dy, 0], C = [dx, dy, -1], D = [-dx, -dy, -1];
            // u runs across the plume, v runs along it: 1 at the throat, 0 at
            // the tail, which is how the texture below is painted.
            positions.push(...A, ...B, ...C);
            uvs.push(0, 1, 1, 1, 1, 0);
            positions.push(...A, ...C, ...D);
            uvs.push(0, 1, 1, 0, 0, 0);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        return geo;
    }

    /** The painted plume: a hot near-white throat cooling through the fleet's own. Full rationale: docs/galaxy3d-design-notes.md#the-painted-plume-a-hot-near-white-throat-cooling-through-th */
    function plumeTexture(mine) {
        return cachedTexture(`plume:${mine ? 1 : 0}`, () => {
            const W = 64, H = 128;
            const canvas = canvas2d(W, H);
            const ctx = canvas.getContext('2d');
            const img = ctx.createImageData(W, H);
            const px = img.data;
            // Throat, mid and tail, in that order. Friendly is the briefed
            // amber/bronze; hostile is a deep red. See the note at the hot[]
            // table in animateFleetMove for why neither of them is cyan.
            const ramp = mine
                ? [[255, 246, 226], [255, 178, 82], [172, 70, 16]]
                : [[255, 232, 222], [255, 104, 62], [138, 20, 10]];
            for (let y = 0; y < H; y++) {
                // Canvas row 0 is v = 1 (flipY), which is the throat.
                const s = y / (H - 1);
                // The column widens aft, as a free jet does.
                const halfW = 0.16 + 0.80 * Math.pow(s, 0.55);
                const axial = Math.pow(1 - s, 1.55);
                const seg = s < 0.42 ? 0 : 1;
                const f = seg === 0 ? s / 0.42 : (s - 0.42) / 0.58;
                const c0 = ramp[seg], c1 = ramp[seg + 1];
                const r = c0[0] + (c1[0] - c0[0]) * f;
                const g = c0[1] + (c1[1] - c0[1]) * f;
                const b = c0[2] + (c1[2] - c0[2]) * f;
                for (let x = 0; x < W; x++) {
                    const across = Math.abs(x / (W - 1) - 0.5) * 2;
                    const q = across / halfW;
                    const radial = Math.exp(-q * q * 2.3);
                    const i = (y * W + x) * 4;
                    px[i] = r; px[i + 1] = g; px[i + 2] = b;
                    px[i + 3] = Math.max(0, Math.min(255, radial * axial * 255));
                }
            }
            ctx.putImageData(img, 0, 0);
            return toTex(canvas, THREE.SRGBColorSpace);
        });
    }

    /** THE HULL MAPS: albedo, normal, roughness and emissive, painted once. Full rationale: docs/galaxy3d-design-notes.md#the-hull-maps-albedo-normal-roughness-and-emissive-painted-o */
    function buildHullMaps() {
        const W = 512, H = 512;
        const canvas = canvas2d(W, H);
        const ctx = canvas.getContext('2d');

        // Base: a value ramp across u. u=0/1 is the keel, u=0.5 the spine.
        const img = ctx.createImageData(W, H);
        const px = img.data;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const u = x / W;
                // Distance from the dorsal line, 0 at the spine, 1 at the keel.
                const d = Math.abs(u - 0.5) * 2;
                // Dark ventral, mid flanks, light dorsal: the standard warship
                // counter-shade, and the reason a hull has a top and a bottom
                // even before a light hits it.
                const shade = 0.86 - Math.pow(d, 1.5) * 0.46;
                const wear = vnoise(x / 5.5, y / 5.5, 811) * 0.10;
                const blot = fbm2(x / 46, y / 46, 233, 3);
                const v = shade * (0.9 + wear) * (0.86 + blot * 0.28);
                const i = (y * W + x) * 4;
                px[i] = px[i + 1] = px[i + 2] = Math.max(0, Math.min(255, v * 190));
                px[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);

        // Longitudinal panel seams: lines of constant u, i.e. vertical rules.
        for (let k = 0; k < 14; k++) {
            const x = Math.round((k / 14) * W) + 3;
            ctx.fillStyle = 'rgba(10,12,16,0.55)';
            ctx.fillRect(x, 0, 1.6, H);
            ctx.fillStyle = 'rgba(226,232,244,0.20)';
            ctx.fillRect(x + 1.6, 0, 1.2, H);
        }
        // Frame stations across the hull: lines of constant v.
        for (let k = 0; k < 9; k++) {
            const y = Math.round((k / 9) * H) + 7;
            ctx.fillStyle = 'rgba(10,12,16,0.42)';
            ctx.fillRect(0, y, W, 2);
            ctx.fillStyle = 'rgba(226,232,244,0.16)';
            ctx.fillRect(0, y + 2, W, 1.2);
        }
        // Hull plating: staggered rectangles at slightly different values, so
        // the surface is assembled rather than extruded.
        for (let i = 0; i < 90; i++) {
            const x = hash2(i, 3, 71) * W;
            const y = hash2(i, 7, 73) * H;
            const w = 14 + hash2(i, 11, 79) * 44;
            const h = 10 + hash2(i, 13, 83) * 30;
            ctx.fillStyle = `rgba(255,255,255,${0.015 + hash2(i, 17, 89) * 0.05})`;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = 'rgba(6,8,12,0.16)';
            ctx.fillRect(x, y + h - 1.4, w, 1.4);
        }
        // Access hatches and vent grilles: the small dense detail that separates
        // a painted hull from a gradient.
        for (let i = 0; i < 22; i++) {
            const x = 12 + hash2(i, 23, 97) * (W - 40);
            const y = 12 + hash2(i, 29, 101) * (H - 40);
            ctx.fillStyle = 'rgba(8,10,14,0.5)';
            ctx.fillRect(x, y, 16, 11);
            ctx.fillStyle = 'rgba(210,218,232,0.22)';
            for (let s = 0; s < 4; s++) ctx.fillRect(x + 2, y + 1.5 + s * 2.4, 12, 1.1);
        }

        // THE HULL CODE, stencilled on the flanks. Twice, on either side of the
        // dorsal line, so it is readable whichever way the ship banks.
        ctx.font = 'bold 34px "Share Tech Mono", "Courier New", monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        for (const cxp of [0.25, 0.75]) {
            ctx.save();
            ctx.translate(cxp * W, H * 0.42);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = 'rgba(8,10,14,0.55)';
            ctx.fillText('TF-091', 2, 2);
            ctx.fillStyle = 'rgba(224,230,242,0.62)';
            ctx.fillText('TF-091', 0, 0);
            ctx.font = 'bold 18px "Share Tech Mono", "Courier New", monospace';
            ctx.fillStyle = 'rgba(224,230,242,0.34)';
            ctx.fillText('LINE', 0, 34);
            ctx.font = 'bold 34px "Share Tech Mono", "Courier New", monospace';
            ctx.restore();
        }

        const map = toTex(canvas, THREE.SRGBColorSpace, true);

        // ROUGHNESS. The dorsal spine is polished (0.35), the flanks are matte
        // (0.75) and the keel is dirty (0.85). This is what makes the key light
        // TRAVEL along the hull as it banks instead of leaving a flat silhouette
        // — a single scalar roughness cannot do it at any value.
        const rCanvas = canvas2d(W, H);
        const rCtx = rCanvas.getContext('2d');
        const rImg = rCtx.createImageData(W, H);
        const rPx = rImg.data;
        const src = ctx.getImageData(0, 0, W, H).data;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const d = Math.abs(x / W - 0.5) * 2;
                let r = 0.35 + Math.pow(d, 0.85) * 0.50;
                // Seams and hatches are dirtier than the plate around them; the
                // painted luminance is a good enough proxy for where they are.
                const i = (y * W + x) * 4;
                r += (0.5 - src[i] / 255) * 0.22;
                r += (vnoise(x / 9, y / 9, 337) - 0.5) * 0.12;
                const v = Math.max(0, Math.min(255, r * 255));
                rPx[i] = rPx[i + 1] = rPx[i + 2] = v;
                rPx[i + 3] = 255;
            }
        }
        rCtx.putImageData(rImg, 0, 0);

        // NORMAL, by Sobel over the painted luminance: the seams become real
        // grooves and the plating becomes real steps.
        const nCanvas = canvas2d(W, H);
        const nCtx = nCanvas.getContext('2d');
        const nImg = nCtx.createImageData(W, H);
        const nPx = nImg.data;
        const at = (x, y) => src[((((y + H) % H) * W) + ((x + W) % W)) * 4] / 255;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
                         - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
                const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
                         - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
                let nx = -dx * 2.6, ny = -dy * 2.6, nz = 1;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
                const i = (y * W + x) * 4;
                nPx[i] = ((nx / len) * 0.5 + 0.5) * 255;
                nPx[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
                nPx[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
                nPx[i + 3] = 255;
            }
        }
        nCtx.putImageData(nImg, 0, 0);

        /** EMISSIVE: RUNNING LIGHTS ONLY, and that restraint is load-bearing. Full rationale: docs/galaxy3d-design-notes.md#emissive-running-lights-only-and-that-restraint-is-load-bear */
        const eCanvas = canvas2d(W, H);
        const eCtx = eCanvas.getContext('2d');
        eCtx.fillStyle = '#000000';
        eCtx.fillRect(0, 0, W, H);
        for (let k = 0; k < 9; k++) {
            const y = 30 + k * 52;
            for (const x of [W * 0.24, W * 0.76]) {
                const g = eCtx.createRadialGradient(x, y, 0, x, y, 7);
                g.addColorStop(0, 'rgba(255,255,255,0.95)');
                g.addColorStop(0.4, 'rgba(255,255,255,0.30)');
                g.addColorStop(1, 'rgba(255,255,255,0)');
                eCtx.fillStyle = g;
                eCtx.fillRect(x - 8, y - 8, 16, 16);
            }
        }
        // The bridge canopy, kept INSIDE the patch the bridge block was remapped
        // into and small enough that where the fuselage overlaps it, it reads as
        // one more lit port rather than as a glowing panel.
        eCtx.fillStyle = 'rgba(255,255,255,0.8)';
        eCtx.fillRect(W * 0.33, H * 0.66, W * 0.12, H * 0.022);

        return {
            map,
            normalMap: toTex(nCanvas, LINEAR_SPACE, true),
            roughnessMap: toTex(rCanvas, LINEAR_SPACE, true),
            emissiveMap: toTex(eCanvas, THREE.SRGBColorSpace, true)
        };
    }

    function hullMaps() {
        if (!state.hullMaps) state.hullMaps = buildHullMaps();
        return state.hullMaps;
    }

    function shipMaterial(mine) {
        const key = `ship:${mine ? 1 : 0}`;
        if (state.materials.has(key)) return state.materials.get(key);
        const maps = hullMaps();
        /** ONE STEEL FOR BOTH FLEETS. Full rationale: docs/galaxy3d-design-notes.md#one-steel-for-both-fleets */
        const mat = new THREE.MeshStandardMaterial({
            // The briefed steel, lifted a little: at 0x6a7078 against deep space. Full rationale: docs/galaxy3d-design-notes.md#the-briefed-steel-lifted-a-little-at-0x6a7078-against-deep-s
            color: mine ? 0x99a2ad : 0x585e68,
            map: maps.map,
            normalMap: maps.normalMap,
            roughnessMap: maps.roughnessMap,
            emissiveMap: maps.emissiveMap,
            // Running lights. Warm white for yours, deep red for theirs.
            emissive: mine ? new THREE.Color(1.55, 1.20, 0.62) : new THREE.Color(1.9, 0.34, 0.26),
            emissiveIntensity: 1,
            metalness: 0.42,
            roughness: 1,
            envMapIntensity: 0.9
        });
        mat.normalScale.set(1.1, 1.1);
        mat.__shared = true;
        state.materials.set(key, mat);
        return mat;
    }

    /** The ribbon has THREE vertices per rib — left edge, spine, right edge —. Full rationale: docs/galaxy3d-design-notes.md#the-ribbon-has-three-vertices-per-rib-left-edge-spine-right- */
    function buildTrail(colour) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(TRAIL_SEGMENTS * 3 * 3);
        const colors = new Float32Array(TRAIL_SEGMENTS * 3 * 3);
        const indices = [];
        for (let i = 0; i < TRAIL_SEGMENTS - 1; i++) {
            const a = i * 3, b = (i + 1) * 3;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
            indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setIndex(indices);
        geo.setDrawRange(0, indices.length);
        const mat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.userData.colour = colour;
        return mesh;
    }

    const _trailHead = new THREE.Vector3();
    const _ta = new THREE.Vector3();
    const _tb = new THREE.Vector3();
    const _tTangent = new THREE.Vector3();
    const _tToCam = new THREE.Vector3();
    const _tSide = new THREE.Vector3();

    function updateTrail(move) {
        const geo = move.trail.geometry;
        const pos = geo.attributes.position;
        const col = geo.attributes.color;
        const history = move.history;
        const colour = move.trail.userData.colour;
        const view = state.camera.position;
        const a = _ta, b = _tb, tangent = _tTangent, toCam = _tToCam, side = _tSide;
        let minStability = 1;
        for (let i = 0; i < TRAIL_SEGMENTS; i++) {
            const p = history[i];
            const next = history[Math.min(TRAIL_SEGMENTS - 1, i + 1)];
            const prev = history[Math.max(0, i - 1)];
            tangent.set(next.x - prev.x, next.y - prev.y, next.z - prev.z);
            if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
            tangent.normalize();
            toCam.set(view.x - p.x, view.y - p.y, view.z - p.z).normalize();
            side.crossVectors(tangent, toCam);
            // A ribbon whose tangent points at the camera has no well-defined
            // side vector, and a fleet flying toward the viewer is exactly that
            // case — left alone it flips, or splays into a fat translucent
            // wedge. Fall back to the camera's own right vector, and narrow the
            // ribbon as it turns edge-on so the failure has nowhere to show.
            const stability = side.length();
            if (stability < 0.08) {
                side.set(state.camera.matrixWorld.elements[0],
                         state.camera.matrixWorld.elements[1],
                         state.camera.matrixWorld.elements[2]);
            }
            side.normalize();
            // Head is fat and hot, tail tapers to nothing: that gradient IS the
            // direction cue, and it works even in a single still frame.
            const t = i / (TRAIL_SEGMENTS - 1);
            // TO ZERO, not to 35%. A double-sided additive strip held at a third. Full rationale: docs/galaxy3d-design-notes.md#to-zero-not-to-35-a-double-sided-additive-strip-held-at-a-th
            const s = Math.min(1, Math.max(0, (stability - 0.02) / 0.23));
            const edgeOn = s * s * (3 - 2 * s);
            if (edgeOn < minStability) minStability = edgeOn;
            // pow 2.6, not 1.6. The ribbon has to be NARROWER THAN THE HULL
            // everywhere except immediately behind it: at the flatter taper the
            // head was a bright wedge wider and brighter than the ships, so the
            // eye read the trail as the object and the fleet as debris beside it.
            const width = move.width * Math.pow(t, 2.6) * edgeOn;
            a.copy(p).addScaledVector(side, width);
            b.copy(p).addScaledVector(side, -width);
            const base = i * 3;
            pos.setXYZ(base, a.x, a.y, a.z);
            pos.setXYZ(base + 1, p.x, p.y, p.z);
            pos.setXYZ(base + 2, b.x, b.y, b.z);
            // 1.9 at 0.85, not 2.4 at full. The old profile put almost all of
            // the ribbon's value in its last few ribs, so what showed was a
            // short bright sliver with a hard head — reading as an object beside
            // the fleet rather than as the fleet's own wake. This is dimmer at
            // the head and dies over a longer run, which is what a wake does.
            const glow = Math.pow(t, 1.9) * 0.85 * move.fade;
            col.setXYZ(base, 0, 0, 0);
            col.setXYZ(base + 1, colour[0] * glow, colour[1] * glow, colour[2] * glow);
            col.setXYZ(base + 2, 0, 0, 0);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
        move.trail.material.opacity = move.fade * minStability;
    }

    /** True when two crossing endpoints are far enough apart to give a heading. */
    function routeReady(a, b) {
        const dx = b.x - a.x, dz = b.z - a.z;
        return (dx * dx + dz * dz) > 1e-6;
    }

    /** The minimum angle, in radians, between a fleet's ground track and the. Full rationale: docs/galaxy3d-design-notes.md#the-minimum-angle-in-radians-between-a-fleet-s-ground-track- */
    const MIN_TRACK_YAW = 0.58;   // ~33 degrees

    const _headTmp = new THREE.Vector3();
    const _covA = new THREE.Vector3();
    const _covB = new THREE.Vector3();
    const _covC = new THREE.Vector3();

    /** How much of a guarded sector's ID plaque this fleet is currently sitting. Full rationale: docs/galaxy3d-design-notes.md#how-much-of-a-guarded-sector-s-id-plaque-this-fleet-is-curre */
    function plaqueCover(move) {
        if (!move.guard) return 0;
        _covA.copy(move.group.position).project(state.camera);
        let worst = 0;
        for (let i = 0; i < move.guard.length; i++) {
            const entry = state.sectors.get(move.guard[i]);
            if (!entry || !entry.idLabel) continue;
            const p = entry.group.position;
            const y = p.y + TILE_TOP + 0.014;
            _covB.set(p.x + ID_PLATE_X, y, p.z + ID_PLATE_Z).project(state.camera);
            _covC.set(p.x + ID_PLATE_X + ID_PLATE_W * 0.5, y, p.z + ID_PLATE_Z).project(state.camera);
            const halfW = Math.abs(_covC.x - _covB.x) || 0.04;
            const d = Math.max(Math.abs(_covA.x - _covB.x) / halfW,
                               Math.abs(_covA.y - _covB.y) / (halfW * 0.8));
            const c = 1 - Math.min(1, Math.max(0, (d - 0.9) / 1.5));
            if (c > worst) worst = c;
        }
        return worst;
    }

    /** A heading vector for the darts to face: the true ground track, CRABBED. Full rationale: docs/galaxy3d-design-notes.md#a-heading-vector-for-the-darts-to-face-the-true-ground-track */
    function readableHeading(dx, dy, dz) {
        const gl = Math.hypot(dx, dz);
        if (gl < 1e-5) return _headTmp.set(0, 0, 1);
        // atan2(x, z): 0 is straight toward the camera, +/-PI straight away.
        let a = Math.atan2(dx / gl, dz / gl);
        const s = a >= 0 ? 1 : -1;
        if (Math.abs(a) < MIN_TRACK_YAW) a = s * MIN_TRACK_YAW;
        else if (Math.PI - Math.abs(a) < MIN_TRACK_YAW) a = s * (Math.PI - MIN_TRACK_YAW);
        return _headTmp.set(Math.sin(a) * gl, dy, Math.cos(a) * gl);
    }

    /**
     * Animate a fleet moving between two sectors: bronze for your fleets, red
     * for enemy fleets seen inside your sensor range. `count` sizes the formation.
     */
    function animateFleetMove(fromId, toId, opts = {}) {
        const from = state.sectors.get(Number(fromId));
        const to = state.sectors.get(Number(toId));
        if (!from || !to || !state.ready) return;

        const mine = Boolean(opts.mine);
        /** NEITHER FLEET IS CYAN. Full rationale: docs/galaxy3d-design-notes.md#neither-fleet-is-cyan */
        const hot = mine ? [1.35, 0.72, 0.22] : [1.55, 0.24, 0.12];
        const count = Math.max(1, Number(opts.count) || 1);
        const ships = count >= 9 ? 3 : (count >= 3 ? 2 : 1);

        const group = new THREE.Group();
        const darts = [];
        // The hull has to survive its own plume. At 0.13-0.20 against a sprite
        // authored at scale*2.1 the glare was twice the ship and swallowed it
        // whole, so what crossed the board was an airbrushed comet decal with two
        // flat shards poking out of the head. The floor is now 0.22 and the
        // plume is barely wider than the hull that throws it.
        const scale = 0.22 + Math.min(0.09, count * 0.008);
        // Cloned per move, not shared: the hull has to be able to fade when the
        // formation crosses a sector's ID plaque (see plaqueCover), and a shared
        // material would take every other fleet on the board with it. The clone
        // carries no __shared mark, so the move's own teardown disposes it.
        const hullMat = shipMaterial(mine).clone();
        hullMat.transparent = true;
        for (let i = 0; i < ships; i++) {
            const dart = new THREE.Group();
            const hull = new THREE.Mesh(state.sharedGeo.dart, hullMat);
            hull.scale.setScalar(scale);
            dart.add(hull);
            /** THE PLUME IS A CONE OUT OF THE NOZZLE, NOT A BALL BEHIND THE SHIP. Full rationale: docs/galaxy3d-design-notes.md#the-plume-is-a-cone-out-of-the-nozzle-not-a-ball-behind-the- */
            const NOZZLE_Z = -0.492 * scale;
            const plume = new THREE.Mesh(
                state.sharedGeo.plume,
                new THREE.MeshBasicMaterial({
                    map: plumeTexture(mine),
                    // A NEUTRAL gain, not a tint: the hue ramp lives in the map
                    // (see plumeTexture) so the throat can be white-hot while the
                    // column is bronze. This only has to lift the throat over the
                    // 1.05 bloom threshold once the two overlapping planes have
                    // accumulated, and no further.
                    color: new THREE.Color(1.9, 1.9, 1.9),
                    transparent: true,
                    // Narrower than the hull and dimmer than it looks it should
                    // be: the plume is additive over deep space and at 0.9 it
                    // blew to white across a footprint bigger than the ship,
                    // which is the "airbrushed comet decal" failure with a cone
                    // instead of a ball.
                    opacity: 0.40,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    toneMapped: false
                })
            );
            // 0.62 of a hull, not 1.05. THE HULL HAS TO WIN THE SILHOUETTE. The
            // dart is about 0.86 units long at this scale, so the old plume was
            // 1.2 hull lengths of exhaust hanging off 1 hull length of ship and
            // the eye read the thrust as the object. Breathing takes this to at
            // most 0.77 of a hull, which is where it stops competing.
            plume.scale.set(scale * PLUME_WIDTH, scale * PLUME_WIDTH, scale * PLUME_LENGTH);
            plume.position.z = NOZZLE_Z;
            dart.add(plume);

            // A small glare AT the throat, so the nozzle itself is a light
            // source. Deliberately narrower than the hull it is bolted into.
            const engine = new THREE.Sprite(new THREE.SpriteMaterial({
                map: glowTexture(mine ? [255, 208, 138] : [255, 120, 96]),
                color: new THREE.Color(hot[0], hot[1], hot[2]),
                transparent: true,
                opacity: 0.55,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            }));
            engine.scale.set(scale * 0.5, scale * 0.5, 1);
            engine.position.z = NOZZLE_Z;
            dart.add(engine);
            dart.userData.engine = engine;
            dart.userData.plume = plume;
            dart.userData.plumeLength = scale * PLUME_LENGTH;
            // V formation, trailing and offset.
            const lane = i === 0 ? 0 : (i === 1 ? -1 : 1);
            dart.userData.offset = new THREE.Vector3(lane * 0.17, lane === 0 ? 0.03 : -0.02, lane === 0 ? 0.08 : -0.13);
            group.add(dart);
            darts.push(dart);
        }

        // Held UNDER white. The trail is additive over deep space, so anything
        // authored above 1 clips to a flat pastel wedge and takes the hull's
        // silhouette with it. Bronze for your fleets, deep red for theirs — see
        // the hot[] note above for why neither of them is cyan.
        const colour = mine ? [0.62, 0.34, 0.11] : [0.80, 0.19, 0.15];
        const trail = buildTrail(colour);
        state.scene.add(trail);

        // Fleets fly ABOVE the worlds, not through them. At the old altitude a
        // fleet leaving a homeworld spawned inside the planet's own sphere and
        // the first third of the crossing was invisible.
        const start = from.group.position.clone().setY(FLEET_ALTITUDE);
        const end = to.group.position.clone().setY(FLEET_ALTITUDE);
        const history = [];
        for (let i = 0; i < TRAIL_SEGMENTS; i++) history.push(start.clone());

        /** DEPARTURE GLARE, ON THE DECK. Full rationale: docs/galaxy3d-design-notes.md#departure-glare-on-the-deck */
        const flash = new THREE.Mesh(
            state.sharedGeo.decal,
            new THREE.MeshBasicMaterial({
                map: glowTexture(mine ? [255, 214, 152] : [255, 150, 118]),
                transparent: true,
                opacity: 0.34,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        flash.position.set(start.x, TILE_TOP + 0.010, start.z);
        flash.scale.setScalar(0.5);
        flash.renderOrder = 3;
        state.scene.add(flash);

        // THE ROUTE, ON THE BOARD.
        //
        // Without it the fleet floats in the black with no relationship to the
        // sector it left or the one it is heading for — it reads as a decal
        // sliding over the frame rather than as a crossing between two named
        // cells. This is a plotted course laid on the plates themselves: dashed,
        // ticked, and drawn just above the tile tops so it lies ON the table.
        const routeVec = end.clone().sub(start);
        const routeLen = routeVec.length();
        const routeTex = makeRouteTexture(mine ? [236, 176, 96] : [244, 132, 112]);
        // 0.55 per world unit, not 1.4. A one-tile crossing is about 1.7 units
        // and lands roughly 170 pixels long, so this puts a single run of the
        // 128px texture across it — magnified, where its dashes resolve, instead
        // of minified into a solid rule. See makeRouteTexture.
        routeTex.repeat.set(Math.max(1, Math.round(routeLen * 0.55)), 1);
        const route = new THREE.Mesh(
            state.sharedGeo.routeQuad,
            new THREE.MeshBasicMaterial({
                map: routeTex,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            })
        );
        route.position.set((start.x + end.x) / 2, TILE_TOP + 0.012, (start.z + end.z) / 2);
        // The quad's baked local +X runs along the course. A rotation of phi
        // about Y sends local +X to (cos phi, 0, -sin phi), so phi = atan2(-dz, dx).
        route.rotation.y = Math.atan2(-routeVec.z, routeVec.x);
        route.scale.set(routeLen, 1, 0.26);
        route.renderOrder = 3;
        state.scene.add(route);

        // A soft pool of the fleet's own light tracked across the plates it
        // passes over. A real moving light would change NUM_POINT_LIGHTS and
        // recompile every plate material mid-move; this reads the same and costs
        // one additive decal.
        const wash = new THREE.Mesh(
            state.sharedGeo.decal,
            new THREE.MeshBasicMaterial({
                map: glowTexture(mine ? [246, 190, 116] : [244, 118, 96]),
                transparent: true,
                opacity: 0.3,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        wash.position.set(start.x, TILE_TOP + 0.008, start.z);
        wash.scale.setScalar(0.6);
        wash.renderOrder = 3;
        state.scene.add(wash);

        group.position.copy(start);
        // Faced down the ground track from frame ZERO. Without this the first
        // few frames have almost no horizontal delta to steer from, the group
        // keeps its identity rotation, and the formation launches nose-on to the
        // camera — the exact silhouette the damping in the update loop exists to
        // prevent, showing up in the one frame everybody screenshots.
        if (routeReady(start, end)) {
            const head = readableHeading(end.x - start.x, 0, end.z - start.z);
            group.lookAt(start.x + head.x, start.y, start.z + head.z);
        }
        state.scene.add(group);
        state.fleetMoves.push({
            group,
            darts,
            trail,
            flash,
            route,
            wash,
            history,
            hullMat,
            // The only two plaques a crossing can ever cover.
            guard: [Number(fromId), Number(toId)],
            toId: Number(toId),
            from: start,
            to: end,
            width: 0.048 + Math.min(0.032, count * 0.003),
            fade: 1,
            time: 0,
            duration: opts.warp ? 0.7 : 1.4,
            prev: start.clone()
        });
    }

    function setSectorDetail(sectorData) {
        if (!sectorData || sectorData.id === undefined) return;
        const entry = state.sectors.get(Number(sectorData.id));
        if (!entry) return;
        entry.explored = true;
        entry.live = true;
        const t = Number(sectorData.type);
        if (Number.isFinite(t) && entry.type !== t) {
            entry.type = t;
            queueContent(entry);
        }
        setSelected(sectorData.id);
    }

    function setSelected(sectorId) {
        state.selectedSector = Number(sectorId);
        const entry = state.sectors.get(state.selectedSector);
        if (!entry) return;
        // Built here rather than at boot, because it needs the plate atlas. By
        // the time anyone can select a sector the boot schedule has almost always
        // warmed it already; if not, the first selection pays for it once.
        if (!ensureSelectionRing()) return;
        // The marker is a CHILD of the sector group, so it inherits the tile's
        // own transform and cannot drift, overshoot into a neighbour, or hang
        // across the gutter. It is drawn after the plate and before the world.
        entry.group.add(state.selectionRing);
        state.selectionRing.visible = true;
        state.selectionRing.position.set(0, TILE_TOP + 0.001, 0);
    }

    function focusSector(sectorId) {
        const normalizedSectorId = Number(sectorId);
        const entry = state.sectors.get(normalizedSectorId);
        if (!entry) {
            state.pendingFocusSector = normalizedSectorId;
            return;
        }
        state.pendingFocusSector = null;
        state.camTarget.set(entry.group.position.x, 0, entry.group.position.z);
    }

    function highlightSector(sectorId) {
        const id = Number.isFinite(Number(sectorId)) ? Number(sectorId) : parseInt(sectorId, 16);
        const entry = state.sectors.get(id);
        if (!entry) return;
        state.battlePulses.set(id, { time: 0 });
    }

    function clearBattleSector(sectorId) {
        const id = Number.isFinite(Number(sectorId)) ? Number(sectorId) : parseInt(sectorId, 16);
        state.battlePulses.delete(id);
        const entry = state.sectors.get(id);
        if (entry) entry.group.scale.setScalar(1);
    }

    function resize() {
        if (!state.renderer || !state.container) return;
        const rect = state.container.getBoundingClientRect();
        const w = Math.max(1, rect.width);
        const h = Math.max(1, rect.height);
        state.viewH = h;
        state.renderer.setSize(w, h, false);
        if (state.composer) state.composer.setSize(w, h);
        if (state.fxaaPass) {
            const pr = state.renderer.getPixelRatio();
            state.fxaaPass.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
        }
        state.camera.aspect = w / h;
        state.camera.updateProjectionMatrix();
        updateFrameOffset();
    }

    function fitCamera() {
        const gridWidth = state.width * HORIZ + HEX_SIZE;
        const gridDepth = state.height * VERT + HEX_SIZE;
        const fov = state.camera.fov * (Math.PI / 180);
        const aspect = state.camera.aspect || (16 / 9);
        const distForDepth = (gridDepth / 2) / Math.tan(fov / 2);
        const distForWidth = (gridWidth / 2) / (Math.tan(fov / 2) * aspect);
        const dist = Math.max(distForDepth, distForWidth) * 1.02;
        state.camOffset.set(0, dist * 0.92, dist * 0.5);
        state.zoom = 1;
        updateFrameOffset();
    }

    // Largest inset we will honour on any one edge. The build pad and minimap between
    // them cover nearly half the viewport height, and taking that literally would leave
    // a letterbox too thin to frame anything in. They only cover the bottom CORNERS —
    // the middle of the lower canvas stays clear — so cap the correction.
    const MAX_SAFE_INSET_RATIO = 0.22;

    /** The clear rectangle inside the canvas, with per-edge insets capped. */
    function safeRect() {
        const rect = state.container.getBoundingClientRect();
        const w = Math.max(1, rect.width);
        const h = Math.max(1, rect.height);
        const maxX = w * MAX_SAFE_INSET_RATIO;
        const maxY = h * MAX_SAFE_INSET_RATIO;
        const left = Math.min(state.safeInset.left, maxX);
        const right = Math.min(state.safeInset.right, maxX);
        const top = Math.min(state.safeInset.top, maxY);
        const bottom = Math.min(state.safeInset.bottom, maxY);
        return {
            w,
            h,
            left,
            top,
            usableW: Math.max(120, w - left - right),
            usableH: Math.max(120, h - top - bottom)
        };
    }

    /** Work out how far to slide the rendered world so the camera target appears… Full rationale: docs/galaxy3d-design-notes.md#work-out-how-far-to-slide-the-rendered-world-so-the-camera-t */
    function updateFrameOffset() {
        state.frameOffset.set(0, 0, 0);
        if (!state.camera || !state.container) return;
        const { w, h, left, top, usableW, usableH } = safeRect();
        // Where the clear band's centre sits, in -1..1 clip space.
        const ndcX = ((left + usableW / 2) - w / 2) / (w / 2);
        const ndcY = ((top + usableH / 2) - h / 2) / (h / 2);
        if (!ndcX && !ndcY) return;

        const fov = state.camera.fov * (Math.PI / 180);
        const aspect = state.camera.aspect || (w / h);
        const dist = state.camOffset.length() * (state.zoom || 1);
        const halfH = Math.tan(fov / 2) * dist;
        const halfW = halfH * aspect;
        // The ground plane is viewed at an angle, so a screen-vertical step covers more
        // world depth than it would head-on.
        const pitchSin = state.camOffset.length() > 0
            ? state.camOffset.y / state.camOffset.length()
            : 1;
        const halfDepth = halfH / Math.max(0.2, pitchSin);
        state.frameOffset.set(-ndcX * halfW, 0, -ndcY * halfDepth);
    }

    /**
     * Frame a specific set of sectors instead of the whole grid. Early on a commander
     * knows nine tiles out of a hundred and twelve, and fitting the entire galaxy
     * renders their empire as a thumbnail adrift in empty starfield.
     */
    function frameSectors(sectorIds, opts = {}) {
        if (!state.ready || !state.camera) return false;
        const ids = (Array.isArray(sectorIds) ? sectorIds : [])
            .map(Number)
            .filter(id => state.sectors.has(id));
        if (ids.length === 0) return false;

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        ids.forEach(id => {
            const p = state.sectors.get(id).group.position;
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });
        // A padded bounding box. 2.8 hexes, not 2: the closeup shot frames a
        // SINGLE sector, and at two hexes of pad the neighbouring tiles — one of
        // which carries the system's star — were pinned against the frame edge
        // and half clipped. A subject wants air on the side it reads into.
        const pad = HEX_SIZE * (Number(opts.padHexes) || 2.8);
        const spanX = (maxX - minX) + pad * 2;
        const spanZ = (maxZ - minZ) + pad * 2;

        const { w, h, usableW, usableH } = safeRect();

        const fov = state.camera.fov * (Math.PI / 180);
        const aspect = state.camera.aspect || (w / h);
        const pitchSin = Math.max(0.2, state.camOffset.y / (state.camOffset.length() || 1));
        // Distance needed for each axis, corrected for the slice of canvas we can use.
        const distForWidth = (spanX / 2) / (Math.tan(fov / 2) * aspect) * (w / usableW);
        const distForDepth = (spanZ / 2) * pitchSin / Math.tan(fov / 2) * (h / usableH);
        const needed = Math.max(distForWidth, distForDepth);
        const full = state.camOffset.length() || 1;
        // Never zoom out past the whole-galaxy framing, and keep a sane close
        // limit. The floor is 0.42 rather than 0.3 because at 0.3 a one-sector
        // framing put the subject's own neighbours outside the canvas — the
        // composition failure the review flagged as "content crammed into the
        // corner with the star clipped by the frame".
        state.zoom = Math.min(1, Math.max(0.42, needed / full));
        state.camTarget.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
        updateFrameOffset();
        return true;
    }

    function setSafeArea(inset = {}) {
        const next = {
            left: Math.max(0, Number(inset.left) || 0),
            right: Math.max(0, Number(inset.right) || 0),
            top: Math.max(0, Number(inset.top) || 0),
            bottom: Math.max(0, Number(inset.bottom) || 0)
        };
        const current = state.safeInset;
        if (next.left === current.left && next.right === current.right
            && next.top === current.top && next.bottom === current.bottom) {
            return;
        }
        state.safeInset = next;
        // COALESCED, like the window resize: updateFrameOffset() ends in a
        // getBoundingClientRect, and the HUD reports its insets on every panel
        // collapse, breakpoint change and layout settle — several in a row while
        // a player drags the window edge. One measurement per frame is enough,
        // and the camera cannot move faster than a frame anyway.
        state.frameOffsetDirty = true;
    }

    // ------------------------------------------------------------------
    // Scene bootstrap & interaction
    // ------------------------------------------------------------------

    /** True when WebGL is being serviced by a CPU rasteriser (SwiftShader. Full rationale: docs/galaxy3d-design-notes.md#true-when-webgl-is-being-serviced-by-a-cpu-rasteriser-swifts */
    const SOFTWARE_GL = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;

    function contextIsSoftware(gl) {
        try {
            const info = gl.getExtension('WEBGL_debug_renderer_info');
            return info ? SOFTWARE_GL.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))) : false;
        } catch (err) {
            return false;
        }
    }

    // . Full rationale: docs/galaxy3d-design-notes.md#the-map-s-own-loading-state-and-three-honest-signals

    /** Steel, amber, Share Tech Mono. Shared by the plate and the strip. */
    const PLATE_SKIN = [
        // Beveled steel: a light top lip over a dark bottom groove, which is what
        // the rest of the console is made of. Plain neutral border, no accent edge.
        'background:linear-gradient(180deg,#252c38 0%,#1b212b 100%)',
        'border:1px solid #39414f',
        'box-shadow:inset 0 1px 0 rgba(255,255,255,0.10),'
            + 'inset 0 -1px 0 rgba(0,0,0,0.55),0 6px 18px rgba(0,0,0,0.45)',
        "font-family:'Share Tech Mono',monospace",
        'text-transform:uppercase', 'text-align:center',
        // #d9a441 on #1e242e measures 7.4:1 — comfortably past AA for body text,
        // which is what a status line has to be.
        'color:#d9a441'
    ].join(';');

    /** The middle of the band the HUD is NOT covering, as CSS. Full rationale: docs/galaxy3d-design-notes.md#the-middle-of-the-band-the-hud-is-not-covering-as-css */
    function safeCentre() {
        const inset = state.safeInset || { left: 0, right: 0, top: 0, bottom: 0 };
        const dx = Math.round(((inset.left || 0) - (inset.right || 0)) / 2);
        const dy = Math.round(((inset.top || 0) - (inset.bottom || 0)) / 2);
        return [`left:calc(50% + ${dx}px)`, `top:calc(50% + ${dy}px)`];
    }

    function ensureBootPlate() {
        if (state.bootPlate || !state.container) return null;
        const plate = document.createElement('div');
        plate.setAttribute('data-g3d-plate', '');
        // The live region beside it carries this text for assistive tech, and two
        // sources saying the same thing is worse than one. This is not silencing
        // a control — nothing here is operable and nothing here is unique.
        plate.setAttribute('aria-hidden', 'true');
        const line = document.createElement('div');
        line.setAttribute('data-g3d-plate-line', '');
        const sub = document.createElement('div');
        sub.setAttribute('data-g3d-plate-sub', '');
        plate.appendChild(line);
        plate.appendChild(sub);
        state.container.appendChild(plate);
        state.bootPlate = plate;
        return plate;
    }

    /** How many charted sectors are still stand-ins, and how many there are in all. */
    function surveyProgress() {
        const left = state.contentQueue.length;
        const total = Math.max(left, state.chartedTotal || 0);
        return { left, total, done: Math.max(0, total - left) };
    }

    /** A survey that has not advanced for this long owes the player an explanation. */
    const SURVEY_STALL_MS = 3000;

    /**
     * Name the step that is ABOUT to run.
     *
     * The strip's whole job is to prove the map is not stuck, and during a stall
     * it freezes with everything else — so the useful moment is the frame
     * BEFORE. drainContentQueue() names an over-budget bake and hands the frame
     * back; the bake happens on the next one, by which time the player is
     * looking at a line that says what the pause is for.
     */
    function noteSurveyStep(what) {
        if (state.surveyStep === what) return;
        state.surveyStep = what;
        if (state.bootPlateMode === 'strip') paintBootPlate('strip');
    }

    function clearSurveyStep(what) {
        if (!state.surveyStep || (what !== undefined && state.surveyStep !== what)) return;
        state.surveyStep = '';
        if (state.bootPlateMode === 'strip') paintBootPlate('strip');
    }

    /**
     * Seconds left, from the rate the last few sectors actually took.
     *
     * A count that is not moving is only reassuring if the player knows what
     * moving looks like. Three completions is the smallest sample that is not
     * just the first sector's cold caches, and the mean is deliberately over the
     * last three rather than all of them so the estimate tracks a board that
     * speeds up once the forge has cached its classes.
     */
    function surveyRate() {
        const rates = state.surveyRates;
        if (rates.length < 3) return 0;
        return rates.reduce((a, b) => a + b, 0) / rates.length;
    }

    function surveyEta(p) {
        const mean = surveyRate();
        if (!p.left || !mean) return 0;
        return Math.max(1, Math.round((mean * p.left) / 1000));
    }

    /** The one line the strip shows, and the only place its wording is decided. */
    function surveyLine() {
        const p = surveyProgress();
        if (!p.total) return 'Surveying sectors';
        const count = `Surveying ${p.done} / ${p.total} sectors`;
        if (state.surveyStep) return `${count} — ${state.surveyStep}`;
        const eta = surveyEta(p);
        /**
         * The watchdog fires when the wait has beaten the board's OWN recent
         * pace, not on a flat three seconds. A survey that is taking four
         * seconds a sector and says "about 12s left" is informative and moving;
         * replacing that with an apology every time it crosses three seconds
         * would be the loader crying wolf at its own normal speed. What is worth
         * saying is "this is longer than it has been taking" — and, before there
         * is any pace to compare against, a plain three seconds is that.
         */
        const patience = Math.max(SURVEY_STALL_MS, surveyRate() * 2);
        if (state.surveyChangedAt && performance.now() - state.surveyChangedAt > patience) {
            return `${count} — still working, this machine is slow at it`;
        }
        return eta ? `${count} — about ${eta}s left` : count;
    }

    /**
     * Keep the strip honest once a frame: notice progress, learn the rate, and
     * repaint only when the words change.
     */
    function stepSurveyStrip() {
        if (state.bootPlateMode !== 'strip') return;
        const done = surveyProgress().done;
        if (done !== state.surveyDone) {
            const now = performance.now();
            if (state.surveyDone >= 0 && done > state.surveyDone) {
                const per = (now - state.surveyChangedAt) / (done - state.surveyDone);
                state.surveyRates.push(per);
                if (state.surveyRates.length > 3) state.surveyRates.shift();
            }
            state.surveyDone = done;
            state.surveyChangedAt = now;
        }
        paintBootPlate('strip');
    }

    function paintBootPlate(mode) {
        const plate = state.bootPlate || ensureBootPlate();
        if (!plate) return;
        const line = plate.querySelector('[data-g3d-plate-line]');
        const sub = plate.querySelector('[data-g3d-plate-sub]');
        if (mode === 'full') {
            plate.style.cssText = PLATE_SKIN + ';' + [
                'position:absolute', ...safeCentre(),
                'transform:translate(-50%,-50%)', 'pointer-events:none',
                'z-index:2', 'padding:18px 26px', 'font-size:13px', 'letter-spacing:0.16em'
            ].join(';');
            line.textContent = 'Plotting table warming up';
            sub.style.cssText = 'margin-top:7px;font-size:11px;letter-spacing:0.1em;color:#9fb0c8';
            sub.textContent = 'Charted sectors will appear as they are surveyed';
            sub.hidden = false;
        } else {
            /**
             * ALONG THE TOP OF THE CLEAR BAND, not the bottom of it.
             *
             * The bottom was tried first and photographed badly: the build pad
             * makes the bottom inset several hundred pixels tall, so "just above
             * the inset" put the strip halfway up the canvas — straight through
             * the map key at 1600x900. The strip is inside #galaxy3d and the HUD
             * panels are its siblings, so no z-index inside this element can lift
             * it over them; the only reliable answer is to sit somewhere they
             * are not. The band under the status bars is clear at every viewport
             * the responsive suite exercises, and it is also where the eye
             * already goes for status.
             */
            const top = Math.round((state.safeInset.top || 0) + 14);
            const dx = Math.round(((state.safeInset.left || 0) - (state.safeInset.right || 0)) / 2);
            const css = PLATE_SKIN + ';' + [
                'position:absolute', `left:calc(50% + ${dx}px)`, `top:${top}px`,
                'transform:translateX(-50%)', 'pointer-events:none',
                'z-index:2', 'padding:7px 16px', 'font-size:11px', 'letter-spacing:0.16em',
                'white-space:nowrap'
            ].join(';');
            // Repainted every frame now — see stepSurveyStrip() — so a repaint
            // that changes nothing must cost nothing. Assigning cssText is a full
            // style reparse and assigning textContent invalidates layout; both
            // are skipped when the string is the one already there.
            if (state.stripCss !== css) {
                state.stripCss = css;
                plate.style.cssText = css;
            }
            // A count, not a spinner: it says how much is left and it visibly
            // moves, which is the difference between "loading" and "stuck". What
            // follows the count says why, when there is a why — see surveyLine().
            const text = surveyLine();
            if (state.stripText !== text) {
                state.stripText = text;
                line.textContent = text;
            }
            sub.hidden = true;
            sub.textContent = '';
        }
        state.bootPlateMode = mode;
    }

    function showBootPlate() {
        // NO TIMER. A loader that races the thing it is loading loses the race on
        // exactly the machines that need it.
        paintBootPlate('full');
    }

    function hideBootPlate() {
        if (state.bootPlate) {
            state.bootPlate.remove();
            state.bootPlate = null;
        }
        state.bootPlateMode = null;
        // The next plate is a new element: nothing is on it yet, so the
        // repaint-only-on-change guards must not think it already says this.
        state.stripCss = '';
        state.stripText = '';
    }

    /** ONE PERMANENT LIVE REGION, IN THE DOM FROM THE START. Full rationale: docs/galaxy3d-design-notes.md#one-permanent-live-region-in-the-dom-from-the-start */
    function ensureStatusRegion() {
        if (state.statusRegion || !state.container) return state.statusRegion;
        const el = document.createElement('div');
        el.setAttribute('data-g3d-status', '');
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.style.cssText = [
            'position:absolute', 'width:1px', 'height:1px', 'margin:-1px',
            'padding:0', 'overflow:hidden', 'clip:rect(0 0 0 0)',
            'clip-path:inset(50%)', 'white-space:nowrap', 'border:0'
        ].join(';');
        state.container.appendChild(el);
        state.statusRegion = el;
        return el;
    }

    function say(text) {
        const el = ensureStatusRegion();
        if (!el || text === state.statusSaid) return;
        state.statusSaid = text;
        el.textContent = text;
    }

    /**
     * Keep the visible plate and the spoken status in step with the queue.
     * Called whenever the queue changes length — a sector charted, a tile
     * finished, a class arriving from the forge.
     */
    function updateLoadingState() {
        if (state.boardAnnounced || state.contextLost) return;
        const p = surveyProgress();
        if (state.bootPlateMode === 'strip') paintBootPlate('strip');
        if (!p.left) return;
        /**
         * COARSE ON PURPOSE, AND NOW ACTUALLY COARSE.
         *
         * say() dedupes only against the immediately previous string, so a
         * sentence carrying a running count is a fresh polite interruption per
         * sector: 'surveying 8 of 9 sectors', 'surveying 7 of 9 sectors', and so
         * on for the whole survey. The count belongs on the visible strip, where
         * a sighted player reads it at a glance and nobody is interrupted by it.
         *
         * What is worth interrupting for is that the survey started, that it is
         * half done on a board big enough for the middle to be a long way from
         * either end, and that it finished. The start is already announced by
         * initialize() and the end by announceBoardReady(), so all that belongs
         * here is the middle — and it carries no count of its own beyond the
         * total, because both the numerator AND the denominator move as fog
         * lifts. Three announcements at most, at any board size; the latch is
         * what guarantees it.
         */
        if (!state.saidSurveyHalf && p.total >= 12 && p.done * 2 >= p.total) {
            state.saidSurveyHalf = true;
            say(`Galaxy map loading, about half of ${p.total} sectors surveyed`);
        }
    }

    function announceFirstFrame() {
        // DEMOTED, NOT REMOVED. The board exists now, which is worth saying, but
        // it is not finished, which is worth saying too.
        if (state.contentQueue.length) paintBootPlate('strip');
        else hideBootPlate();
        document.dispatchEvent(new CustomEvent('galaxy3d-first-frame'));
    }

    function announceBoardReady() {
        if (state.boardAnnounced || state.contentQueue.length || !state.gridBuilt) return;
        state.boardAnnounced = true;
        hideBootPlate();
        say(`Galaxy map ready, ${state.chartedTotal || 0} sectors charted`);
        document.dispatchEvent(new CustomEvent('galaxy3d-board-ready'));
    }

    /** Build the post chain. ONLY EVER CALLED ON A MACHINE THAT HAS BEEN MEASURED. Full rationale: docs/galaxy3d-design-notes.md#build-the-post-chain-only-ever-called-on-a-machine-that-has- */
    function buildComposer(renderer, w, h) {
        try {
            /** MSAA ON THE SCENE TARGET. Full rationale: docs/galaxy3d-design-notes.md#msaa-on-the-scene-target */
            const pr = renderer.getPixelRatio();
            const target = new THREE.WebGLRenderTarget(
                Math.max(2, Math.round(w * pr)), Math.max(2, Math.round(h * pr)), {
                    type: THREE.HalfFloatType,
                    samples: renderer.capabilities.isWebGL2 ? 4 : 0
                });
            target.texture.name = 'Galaxy3D.scene';
            const composer = new EffectComposer(renderer, target);
            composer.setSize(w, h);
            composer.addPass(new RenderPass(state.scene, state.camera));

            // 0.7 / 0.85, not 0.38 / 0.7. At the old settings nothing on the board
            // ever blew out: a star photosphere authored above white came back as
            // an orange ball with a crisp silhouette, which is a lit sphere, not a
            // light source. The threshold still keeps this off everything that is
            // merely bright — labels and badges are painted under it on purpose.
            const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.85, BLOOM_THRESHOLD);
            // Bloom is a blur: it does not need the canvas resolution, and it is
            // the most expensive thing in the chain. Wrapping setSize keeps the
            // reduction in force through every composer resize.
            const baseSetSize = bloom.setSize.bind(bloom);
            bloom.setSize = function (width, height) {
                baseSetSize(Math.max(2, Math.round(width * BLOOM_SCALE)),
                            Math.max(2, Math.round(height * BLOOM_SCALE)));
            };
            bloom.setSize(w, h);
            composer.addPass(bloom);
            state.bloomPass = bloom;

            composer.addPass(new OutputPass());

            // After OutputPass, because FXAA weights its edge test perceptually
            // and wants sRGB input. It runs on top of the MSAA above: MSAA fixes
            // geometric coverage, FXAA fixes the shader aliasing MSAA never sees
            // (specular sparkle on the chamfers, the star's granulation).
            const fxaa = new ShaderPass(FXAAShader);
            fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
            /** THE OUTPUT DITHER, IN SCREEN SPACE. Full rationale: docs/galaxy3d-design-notes.md#the-output-dither-in-screen-space */
            const FXAA_OUT = 'gl_FragColor = ApplyFXAA( tDiffuse, resolution.xy, vUv );';
            if (fxaa.material.fragmentShader.indexOf(FXAA_OUT) !== -1) {
                fxaa.material.fragmentShader = fxaa.material.fragmentShader.replace(FXAA_OUT, [
                    FXAA_OUT,
                    'float d1 = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );',
                    'float d2 = fract( sin( dot( gl_FragCoord.xy + 41.7, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );',
                    'gl_FragColor.rgb += ( d1 + d2 - 1.0 ) * ( 1.5 / 255.0 );'
                ].join('\n'));
            }
            composer.addPass(fxaa);
            state.fxaaPass = fxaa;
            return composer;
        } catch (err) {
            console.warn('Galaxy3D: post-processing unavailable, rendering direct.', err);
            state.bloomPass = null;
            state.fxaaPass = null;
            return null;
        }
    }

    function ensureScene() {
        if (state.ready) return true;
        const container = document.getElementById('galaxy3d');
        if (!container) return false;

        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({
                // MSAA on the DEFAULT framebuffer. With a composer this does. Full rationale: docs/galaxy3d-design-notes.md#msaa-on-the-default-framebuffer-with-a-composer-this-does
                antialias: true,
                alpha: true,
                // Say out loud which part we want. A laptop with switchable
                // graphics otherwise gets to guess, and it guesses the integrated
                // one for a canvas it has not seen do any work yet. Asked
                // unconditionally now: there is no probe left to tell us in
                // advance that there is no discrete part to ask for, and on a
                // machine with only a software rasteriser the hint is a no-op.
                powerPreference: 'high-performance'
            });
        } catch (err) {
            console.warn('Galaxy3D: WebGL unavailable, keeping classic view.', err);
            return false;
        }

        // Asked of the context that is actually going to draw, and asked here
        // because everything it feeds is settable after construction.
        state.software = contextIsSoftware(renderer.getContext());

        state.container = container;
        state.renderer = renderer;
        // Capped at 1.5, not 2. The map fills the window and is drawn through. Full rationale: docs/galaxy3d-design-notes.md#capped-at-1-5-not-2-the-map-fills-the-window-and-is-drawn-th
        renderer.setPixelRatio(state.software ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
        // ACES plus a proper sRGB output transform, matching the battle theater.
        // Without these the whole scene is authored in a space nothing agrees on
        // and every bright thing clips flat.
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
            renderer.outputColorSpace = THREE.SRGBColorSpace;
        }
        container.appendChild(renderer.domElement);
        // A bare <canvas> is announced as nothing at all. Name it and say where the same
        // information can be read as text, since the map itself is pointer-driven and the
        // selected-sector panel is the readable path through it.
        renderer.domElement.setAttribute('role', 'img');
        renderer.domElement.setAttribute('aria-label',
            'Galaxy map. Sector details for the selected sector are listed in the selected sector panel.');
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.style.display = 'block';
        bindContextLoss(renderer.domElement);

        state.scene = new THREE.Scene();
        // Only ever seen if the sky dome fails to build; even then it should not
        // be a hole.
        state.scene.background = new THREE.Color(0x0a1020);
        /** ATMOSPHERIC PERSPECTIVE. Full rationale: docs/galaxy3d-design-notes.md#atmospheric-perspective */
        state.scene.fog = new THREE.FogExp2(0x0c1424, 0.018);
        state.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 900);
        state.raycaster = new THREE.Raycaster();

        // The rig lights the PLATES and the ROCKS. Worlds and stars carry their. Full rationale: docs/galaxy3d-design-notes.md#the-rig-lights-the-plates-and-the-rocks-worlds-and-stars-car
        state.scene.add(new THREE.AmbientLight(0x8494c8, 0.62));
        // 2.2, not 1.45. THE BOARD MUST BE THE BRIGHTEST THING IN THE FRAME —
        // with deep space lifted out of black, the plates measured DIMMER than
        // the sky behind them, which sends the eye to the negative space. Raising
        // the rig lifts what is lit (the plates and the rocks) without touching
        // the fog's emissive haze or the self-lit worlds, so it widens exactly
        // the gap that had closed.
        const key = new THREE.DirectionalLight(0xfff0d4, 2.4);
        key.position.set(KEY_LIGHT_DIR.x, KEY_LIGHT_DIR.y, KEY_LIGHT_DIR.z);
        state.scene.add(key);
        // 0x6d84bc at 0.55, not 0x5f86ff at 0.9. With the plates on a tight
        // 220-exponent lobe, a saturated blue fill from the upper-left threw a
        // narrow violet specular along every away-key chamfer — the "saturated
        // blue-violet 1px line" that made the bevel read as a glow stroke rather
        // than as lit metal. A fill light is a fill: desaturated and quiet.
        const rim = new THREE.DirectionalLight(0x6d84bc, 0.55);
        rim.position.set(-8, 5, -7);
        state.scene.add(rim);

        // THE HEAVY BAKES ARE NOT HERE ANY MORE. Full rationale: docs/galaxy3d-design-notes.md#the-heavy-bakes-are-not-here-any-more
        state.sharedGeo.hex = buildHexPlateGeometry();
        state.sharedGeo.fogCells = [];
        for (let i = 0; i < FOG_CELL_VARIANTS; i++) state.sharedGeo.fogCells.push(buildFogCellGeometry(i));
        state.sharedGeo.sphere = new THREE.SphereGeometry(1, 24, 16);
        // Worlds get their own, at the generator's own tessellation (48x32), so a
        // forged world and one built by createPlanetObject() have the identical
        // silhouette. Listed in sharedGeo, which is what disposeContent() checks
        // before freeing a geometry.
        state.sharedGeo.worldSphere = new THREE.SphereGeometry(1, 48, 32);
        state.sharedGeo.disc = new THREE.PlaneGeometry(2, 2);
        state.sharedGeo.photonRing = new THREE.RingGeometry(0.92, 1.06, 48);
        state.sharedGeo.decal = buildHexDiscGeometry(1);
        state.sharedGeo.dart = buildDartGeometry();
        state.sharedGeo.plume = buildPlumeGeometry();
        state.sharedGeo.routeQuad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
        // Flat quads lying on the deck. Separate from routeQuad only so intent
        // is readable at the call site; they are the same construction.
        state.sharedGeo.shadowQuad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
        state.sharedGeo.idPlate = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
        state.sharedGeo.selection = buildSelectionClampGeometry();
        state.sharedGeo.hover = buildHexRingGeometry(0.985, 0.945);

        state.hoverRing = new THREE.Mesh(
            state.sharedGeo.hover,
            new THREE.MeshBasicMaterial({
                color: new THREE.Color(0.95, 0.74, 0.36),
                transparent: true,
                opacity: 0.62,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        state.hoverRing.renderOrder = 1;
        state.hoverRing.visible = false;
        state.scene.add(state.hoverRing);

        // NO COMPOSER YET, ON PURPOSE. The first frame is the one the player is
        // waiting for; it goes straight to the canvas. governPost() measures what
        // this machine does with that and adds the chain only if there is room.
        state.composer = null;
        // EVERY machine probes now, including the CPU rasteriser. It will not earn
        // the composer and is not expected to — but a machine that is never
        // measured is a machine the frame governor cannot rescue, and that was the
        // one class demonstrably unable to render this scene. See governDetail().
        state.post = POST_PROBING;

        bindPointerEvents(renderer.domElement);
        // COALESCED. Dragging a window edge fires this at pointer rate, and each
        // one used to force a layout, a renderer resize and — on a machine that
        // earned the post chain — a full composer reallocation: two half-float
        // ping-pong targets and five bloom mip pairs, per event. The flag is
        // cleared by animate(), so the work happens at most once a frame.
        window.addEventListener('resize', () => { state.resizeDirty = true; });
        document.body.classList.add('g3d-active');

        state.ready = true;
        resize();
        // In the DOM before there is anything to announce — that is what makes a
        // live region announce at all.
        ensureStatusRegion();
        showBootPlate();
        say('Galaxy map loading');
        // NOT animate(). Calling it inline runs the whole first frame — shader
        // compilation, texture uploads, the first draw — inside initialize(), so
        // the caller that handed us the board is billed for it and the browser
        // never gets a chance to paint in between. Scheduled, the first render is
        // its own task and the page is answering the player before it starts.
        state.animHandle = requestAnimationFrame(animate);
        return true;
    }

    /** The selection marker, built on first use. Full rationale: docs/galaxy3d-design-notes.md#the-selection-marker-built-on-first-use */
    function ensureSelectionRing() {
        if (state.selectionRing || !state.scene) return state.selectionRing;
        const plate = plateMaps();
        // Selection marker. Same corner array, same centre — there is no second
        // definition of the hexagon for it to disagree with — and the SAME plate
        // maps and the same key light as the tile it is bolted to.
        state.selectionRing = new THREE.Mesh(
            state.sharedGeo.selection,
            new THREE.MeshPhongMaterial({
                map: plate.map,
                normalMap: plate.normalMap,
                // MACHINED STEEL, NOT ABS. The old 0xa9b4c6 with a broad. Full rationale: docs/galaxy3d-design-notes.md#machined-steel-not-abs-the-old-0xa9b4c6-with-a-broad
                color: 0x6d7482,
                emissive: new THREE.Color(0x7a5520),
                emissiveIntensity: 0.3,
                // The SPECULAR is what actually had to come down. Dropping the
                // diffuse alone left the peak untouched, because the brightest
                // pixel on a bracket is a 220-exponent highlight and a probe
                // reflection, neither of which the albedo touches. Measured
                // again after: the numeral has to be the brightest mark on its
                // own tile and now is.
                specular: 0x4c535e,
                shininess: 220,
                envMap: studioEnvTexture(),
                combine: THREE.AddOperation,
                reflectivity: 0.09
            })
        );
        state.selectionRing.material.normalScale.set(0.5, 0.5);
        state.selectionRing.renderOrder = 1;   // after the plate, before the world
        state.selectionRing.visible = false;
        state.scene.add(state.selectionRing);
        return state.selectionRing;
    }

    /** WHEN THE DISPLAY LINK GOES AWAY. Full rationale: docs/galaxy3d-design-notes.md#when-the-display-link-goes-away */
    function bindContextLoss(dom) {
        dom.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            state.contextLost = true;
            if (state.animHandle) cancelAnimationFrame(state.animHandle);
            state.animHandle = null;
            showLostPlate();
            say('Galaxy map display link lost. A control to restore the plotting table is available.');
            console.warn('Galaxy3D: WebGL context lost — holding the board until it is restored.');
        }, false);

        dom.addEventListener('webglcontextrestored', () => {
            state.contextLost = false;
            hideBootPlate();
            // three.js re-initialises its own GL state on this event and re-uploads
            // lazily; what it cannot know is that our composer's render targets are
            // gone. Dropping it lets governPost() build a fresh one if the machine
            // still deserves one.
            if (state.composer) {
                try { state.composer.dispose(); } catch (err) { /* already gone */ }
                state.composer = null;
                state.bloomPass = null;
                state.fxaaPass = null;
                state.post = POST_PROBING;
            }
            state.lastFrameAt = 0;
            state.resizeDirty = true;
            // Every charted sector is re-queued so anything the context took with
            // it is generated again. The proxies go straight back on, so the board
            // reads as "resurveying" rather than as empty.
            state.sectors.forEach(entry => {
                if (entry.content) { disposeContent(entry); }
                queueContent(entry);
            });
            say('Galaxy map restored.');
            if (!state.animHandle) state.animHandle = requestAnimationFrame(animate);
            console.info('Galaxy3D: WebGL context restored — resurveying the board.');
        }, false);
    }

    /** The one plate that is operable: it carries the way out. */
    function showLostPlate() {
        hideBootPlate();
        if (!state.container) return;
        const plate = document.createElement('div');
        plate.setAttribute('data-g3d-plate', '');
        plate.style.cssText = PLATE_SKIN + ';' + [
            'position:absolute', ...safeCentre(),
            'transform:translate(-50%,-50%)', 'z-index:3',
            'padding:18px 26px', 'font-size:13px', 'letter-spacing:0.16em',
            'max-width:min(420px,86%)'
        ].join(';');
        const line = document.createElement('div');
        line.setAttribute('data-g3d-plate-line', '');
        line.textContent = 'Plotting table lost the display link';
        const sub = document.createElement('div');
        sub.setAttribute('data-g3d-plate-sub', '');
        sub.style.cssText = 'margin-top:7px;font-size:11px;letter-spacing:0.1em;color:#9fb0c8';
        sub.textContent = 'The board is waiting for the graphics driver to come back';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Restore the board';
        retry.style.cssText = [
            'margin-top:12px', 'padding:8px 18px', 'cursor:pointer',
            'background:linear-gradient(180deg,#39424f 0%,#252c37 100%)',
            'border:1px solid #566173', 'color:#e6ecf6',
            "font-family:'Share Tech Mono',monospace", 'font-size:11px',
            'letter-spacing:0.14em', 'text-transform:uppercase',
            'box-shadow:inset 0 1px 0 rgba(255,255,255,0.14),inset 0 -1px 0 rgba(0,0,0,0.5)'
        ].join(';');
        // The focus ring is the point: this control has to be reachable and
        // visibly reachable without a pointer.
        retry.addEventListener('focus', () => {
            retry.style.outline = '2px solid #d9a441';
            retry.style.outlineOffset = '2px';
        });
        retry.addEventListener('blur', () => { retry.style.outline = 'none'; });
        retry.addEventListener('click', () => { window.location.reload(); });
        plate.appendChild(line);
        plate.appendChild(sub);
        plate.appendChild(retry);
        state.container.appendChild(plate);
        state.bootPlate = plate;
        state.bootPlateMode = 'lost';
        retry.focus();
    }

    function bindPointerEvents(dom) {
        dom.style.touchAction = 'none';

        // Two stamps, because "the pointer moved" and "the player is doing
        // something" are different facts and the pacer needs both. `lastInputAt`
        // is any contact at all, including a hover; `lastGestureAt` is the end of
        // a drag or a wheel, i.e. the moment it becomes safe to spend time. See
        // handIsBusy().
        const touched = () => { state.lastInputAt = performance.now(); };
        const gestured = () => {
            state.lastInputAt = performance.now();
            state.lastGestureAt = state.lastInputAt;
        };

        dom.addEventListener('pointerdown', event => {
            gestured();
            state.drag = {
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastY: event.clientY,
                moved: false
            };
            dom.setPointerCapture(event.pointerId);
        });

        dom.addEventListener('pointermove', event => {
            touched();
            if (state.drag) {
                const dx = event.clientX - state.drag.lastX;
                const dy = event.clientY - state.drag.lastY;
                if (Math.abs(event.clientX - state.drag.startX) + Math.abs(event.clientY - state.drag.startY) > 6) {
                    state.drag.moved = true;
                }
                if (state.drag.moved) {
                    const scale = (state.camOffset.length() * (state.zoom || 1)) / 700;
                    state.camTarget.x -= dx * scale;
                    state.camTarget.z -= dy * scale;
                }
                state.drag.lastX = event.clientX;
                state.drag.lastY = event.clientY;
            } else {
                // COALESCED TO ONE PICK PER FRAME. Full rationale: docs/galaxy3d-design-notes.md#coalesced-to-one-pick-per-frame
                state.hoverPointer = { clientX: event.clientX, clientY: event.clientY };
            }
        });

        dom.addEventListener('pointerup', event => {
            gestured();
            const wasClick = state.drag && !state.drag.moved;
            state.drag = null;
            // A CLICK IS PICKED IMMEDIATELY, not deferred to the frame. One
            // raycast is a fraction of a millisecond and a selection that waits
            // for a frame is a selection the player feels waiting.
            if (wasClick) handleClick(event);
        });

        dom.addEventListener('pointerleave', () => {
            state.drag = null;
            state.hoverPointer = null;
        });

        dom.addEventListener('wheel', event => {
            gestured();
            event.preventDefault();
            const factor = event.deltaY > 0 ? 1.12 : 0.89;
            state.zoom = Math.min(3.2, Math.max(0.35, (state.zoom || 1) * factor));
            updateFrameOffset();
        }, { passive: false });
    }

    function pickSector(event) {
        const rect = state.renderer.domElement.getBoundingClientRect();
        state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        state.raycaster.setFromCamera(state.pointer, state.camera);
        const tiles = [];
        state.sectors.forEach(entry => tiles.push(entry.tile));
        const hits = state.raycaster.intersectObjects(tiles, false);
        return hits.length ? hits[0].object.userData.sectorId : null;
    }

    function handleClick(event) {
        const sectorId = pickSector(event);
        if (!sectorId) return;
        setSelected(sectorId);
        const token = Number(sectorId).toString(16).toUpperCase();
        if (typeof window.changeSector === 'function') {
            window.changeSector(token);
        }
        if (window.MediaManager?.playSfx) {
            window.MediaManager.playSfx('click');
        }
    }

    /** One pick for however many pointermoves arrived since the last frame. */
    function drainHover() {
        const p = state.hoverPointer;
        if (!p) return;
        state.hoverPointer = null;
        handleHover(p);
    }

    function handleHover(event) {
        const sectorId = pickSector(event);
        if (state.hovered === sectorId) return;
        const prev = state.sectors.get(state.hovered);
        state.hovered = sectorId;
        if (prev) applyStatusVisual(prev);

        const entry = sectorId ? state.sectors.get(sectorId) : null;
        if (entry) {
            applyStatusVisual(entry);
            entry.group.add(state.hoverRing);
            state.hoverRing.position.set(0, TILE_TOP + 0.006, 0);
            state.hoverRing.visible = true;
            state.renderer.domElement.style.cursor = 'pointer';
        } else {
            state.hoverRing.visible = false;
            state.renderer.domElement.style.cursor = 'grab';
        }
    }

    function animate() {
        state.animHandle = requestAnimationFrame(animate);
        // Frozen while the battle theater is on screen (the map is hidden behind it).
        if (state.paused) {
            state.clock.getDelta(); // keep the clock from accumulating a huge delta
            state.lastFrameAt = 0;  // and don't bill the pause to the frame budget
            return;
        }
        // WALL CLOCK, NOT THE SIMULATION DELTA. `dt` below is clamped to 50 ms so
        // that a hitch cannot teleport a fleet across the board — which meant the
        // old governor, fed that same number, recorded a 280 ms frame as 50 ms and
        // could never reach its own "this machine cannot render this at all"
        // threshold of 80 ms. The frame budget has to be measured with a clock
        // that is not allowed to lie about how bad it got.
        const frameStart = performance.now();
        /** BILLED, NOT DISCARDED. Full rationale: docs/galaxy3d-design-notes.md#billed-not-discarded */
        const rawFrameMs = state.lastFrameAt ? frameStart - state.lastFrameAt : 0;
        const frameMs = rawFrameMs
            ? Math.max(0, rawFrameMs - (state.lastWorkMs || 0))
            : 0;
        state.lastWorkMs = 0;
        state.lastFrameAt = frameStart;
        // Frames the loop has RUN, drawn or not. Startup staging is gated on this
        // rather than on frames PAINTED, because a map that opens behind a modal
        // is deliberately not drawn and must still finish booting.
        state.framesRun = (state.framesRun || 0) + 1;
        const dt = Math.min(state.clock.getDelta(), 0.05);
        const t = state.clock.elapsedTime;

        // One layout read and one renderer resize per FRAME, however many resize
        // events the window manager delivered while the player dragged the edge.
        // A detail rung's backing-store change, taken at a moment the player is
        // not in the middle of anything — see applyDetailRung().
        if (state.pendingPixelRatio && !handIsBusy(frameStart) && state.renderer) {
            const pr = state.pendingPixelRatio;
            state.pendingPixelRatio = 0;
            if (state.renderer.getPixelRatio() > pr) {
                const t0 = performance.now();
                state.renderer.setPixelRatio(pr);
                state.resizeDirty = true;   // composer targets and FXAA follow
                noteCost('backingstore', performance.now() - t0);
            }
        }
        if (state.resizeDirty) {
            state.resizeDirty = false;
            state.frameOffsetDirty = false;
            const t0 = performance.now();
            resize();          // ends in updateFrameOffset(), so it covers both
            noteCost('resize', performance.now() - t0);
        } else if (state.frameOffsetDirty) {
            state.frameOffsetDirty = false;
            updateFrameOffset();
        }

        // The player's pointer, before anything else in the frame: whatever they
        // did while the last frame was being drawn is answered on this one.
        drainHover();

        // Smooth camera. viewCentre is what lands in the middle of the canvas; the frame
        // offset pushes it aside so camTarget itself shows up in the un-occluded band.
        const offset = state.camOffset.clone().multiplyScalar(state.zoom || 1);
        const viewCentre = state.camTarget.clone().add(state.frameOffset);
        const desired = viewCentre.clone().add(offset);
        state.camera.position.lerp(desired, 1 - Math.pow(0.0001, dt));
        state.camera.lookAt(viewCentre);

        // The sky is infinitely far away: it rides with the camera so panning
        // never slides it, while the near dust in world space does parallax.
        if (state.backdrop) {
            state.backdrop.group.position.copy(state.camera.position);
        }

        /** STAGED WORK, AND ONLY AFTER THE BOARD HAS BEEN SEEN. Full rationale: docs/galaxy3d-design-notes.md#staged-work-and-only-after-the-board-has-been-seen */
        let workMs = 0;
        if (state.framesRun > 1) {
            if (state.bootStep < BOOT_STEPS.length) {
                const bootStart = performance.now();
                runBootStep();
                workMs += performance.now() - bootStart;
            } else {
                // Maps to the GPU before anything asks to draw with them.
                workMs += stepTextureUploads();
                workMs += drainContentQueue();
                announceBoardReady();
            }
        }

        refreshDetail(false);
        stepDetailSweep();
        // Outside the staged-work block on purpose: the strip has to keep
        // answering while the queue is BLOCKED on the forge, which is exactly
        // the window where it used to freeze on a number for seconds.
        stepSurveyStrip();

        // Spin worlds / discs / asteroid rings. Under reduced motion these hold still at
        // their normal size rather than spinning and breathing.
        state.sectors.forEach(entry => {
            const content = entry.content;
            if (!content) return;
            content.children.forEach(child => {
                if (!reduceMotion) {
                    if (child.userData.spin) child.rotation.y += child.userData.spin * dt;
                    if (child.userData.update) child.userData.update(dt);
                }
                // A photon ring is a circle from wherever you stand; billboarding
                // it is what keeps a black hole from flattening into an ellipse.
                if (child.userData.billboard) child.lookAt(state.camera.position);
            });
        });

        // The clamps are lit steel, so what breathes is the amber in the bolt
        // heads, not the whole marker's opacity. It still marks the selected
        // sector at a steady value when motion is reduced.
        if (state.selectionRing && state.selectionRing.visible) {
            state.selectionRing.material.emissiveIntensity =
                reduceMotion ? 0.30 : 0.26 + Math.sin(t * 2.6) * 0.10;
        }

        if (state.fogMaterials) {
            /** Where the unexplored field starts to recede, in view depth. Full rationale: docs/galaxy3d-design-notes.md#where-the-unexplored-field-starts-to-recede-in-view-depth */
            const camDist = (state.camOffset.length() || 17) * (state.zoom || 1);
            for (let i = 0; i < state.fogMaterials.length; i++) {
                const mat = state.fogMaterials[i];
                if (!mat) continue;
                mat.__depth.value.set(camDist * 0.70, camDist * 1.08);
                // Each variant drifts from its own phase, so the six patterns
                // never fall back into step with one another.
                if (reduceMotion) continue;
                const base = mat.__haze.__baseOffset;
                mat.__haze.offset.x = (base.x + t * (0.010 + i * 0.0012)) % 1;
                mat.__haze.offset.y = (base.y + t * (0.006 + i * 0.0009)) % 1;
            }
        }

        // Fleets under way.
        if (state.fleetMoves.length) {
            state.fleetMoves = state.fleetMoves.filter(move => {
                move.time += dt;
                const progress = Math.min(1, move.time / move.duration);
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                move.group.position.lerpVectors(move.from, move.to, eased);
                move.group.position.y = FLEET_ALTITUDE + Math.sin(progress * Math.PI) * 0.5;

                /** HEADING COMES FROM THE GROUND TRACK, NOT FROM THE ARC. Full rationale: docs/galaxy3d-design-notes.md#heading-comes-from-the-ground-track-not-from-the-arc */
                const delta = move.group.position.clone().sub(move.prev);
                if (delta.lengthSq() > 1e-7) {
                    const head = readableHeading(delta.x, delta.y * 0.18, delta.z);
                    move.group.lookAt(
                        move.group.position.x + head.x,
                        move.group.position.y + head.y,
                        move.group.position.z + head.z);
                }
                move.prev.copy(move.group.position);

                // The fleet gives way to the sector number, not the other way
                // round. Held at a quarter rather than hidden: a fleet that
                // vanishes mid-crossing is its own bug report, and at 0.25 the
                // formation is still plainly there and the code is plainly
                // readable through it.
                const clarity = 1 - 0.75 * plaqueCover(move);
                if (move.hullMat) move.hullMat.opacity = clarity;

                // Formation offsets are applied in the group's local frame, so the
                // wing ships sit beside and behind the leader as it turns.
                move.darts.forEach(dart => {
                    dart.position.copy(dart.userData.offset);
                    if (dart.userData.engine) {
                        const flicker = reduceMotion
                            ? 1 : 0.85 + Math.sin(t * 26 + dart.userData.offset.x * 20) * 0.15;
                        dart.userData.engine.material.opacity = 0.6 * flicker * clarity;
                        if (dart.userData.plume) {
                            // The plume BREATHES along its length, which is what
                            // a throttling engine does; opacity alone reads as a
                            // dimmer, not as thrust.
                            dart.userData.plume.material.opacity = 0.40 * flicker * clarity;
                            dart.userData.plume.scale.z = dart.userData.plumeLength * (0.82 + flicker * 0.24);
                        }
                    }
                });

                /** Trail history: newest at the head, oldest shifted off the tail. Full rationale: docs/galaxy3d-design-notes.md#trail-history-newest-at-the-head-oldest-shifted-off-the-tail */
                for (let i = 0; i < TRAIL_SEGMENTS - 1; i++) move.history[i].copy(move.history[i + 1]);
                const lead = move.darts[0];
                if (lead) {
                    lead.updateWorldMatrix(true, false);
                    _trailHead.set(0, 0, -lead.userData.plumeLength * 0.75);
                    lead.localToWorld(_trailHead);
                    move.history[TRAIL_SEGMENTS - 1].copy(_trailHead);
                } else {
                    move.history[TRAIL_SEGMENTS - 1].copy(move.group.position);
                }
                move.fade = progress > 0.82 ? Math.max(0, 1 - (progress - 0.82) / 0.18) : 1;
                updateTrail(move);

                // The route fades up as the fleet commits and back down as it
                // arrives, so the board carries the crossing without keeping a
                // permanent line drawn across it.
                if (move.route) {
                    // Held well down. It is a plotted heading laid over gameplay
                    // plates and their sector numbers, not a light source; the
                    // labels draw over it (depthTest off, higher renderOrder) but
                    // it still must not compete with them.
                    const rise = Math.min(1, progress / 0.16);
                    move.route.material.opacity = 0.34 * rise * move.fade;
                }
                if (move.wash) {
                    move.wash.position.x = move.group.position.x;
                    move.wash.position.z = move.group.position.z;
                    const lift = Math.sin(Math.min(1, progress) * Math.PI);
                    move.wash.material.opacity = 0.34 * move.fade;
                    const ws = 0.5 + lift * 0.35;
                    move.wash.scale.setScalar(ws);
                }

                // Departure glare blows out and dies in the first fifth of the
                // run, spreading across the plate as it goes.
                if (move.flash) {
                    const f = Math.min(1, move.time / (move.duration * 0.22));
                    move.flash.material.opacity = 0.42 * (1 - f) * (1 - f);
                    move.flash.scale.setScalar(0.5 + f * 0.75);
                    if (f >= 1) {
                        state.scene.remove(move.flash);
                        move.flash.material.dispose();
                        move.flash = null;
                    }
                }

                if (progress >= 1) {
                    state.scene.remove(move.group);
                    state.scene.remove(move.trail);
                    move.trail.geometry.dispose();
                    move.trail.material.dispose();
                    move.group.traverse(child => {
                        if (child.material && !child.material.__shared) child.material.dispose();
                    });
                    if (move.route) {
                        state.scene.remove(move.route);
                        move.route.material.map.dispose();
                        move.route.material.dispose();
                    }
                    if (move.wash) {
                        state.scene.remove(move.wash);
                        move.wash.material.dispose();
                    }
                    if (move.flash) {
                        state.scene.remove(move.flash);
                        move.flash.material.dispose();
                    }
                    // Brief settle on the destination tile so the arrival reads even
                    // if you were looking elsewhere while the fleet flew.
                    if (state.sectors.has(move.toId)) {
                        state.battlePulses.set(move.toId, { time: 0, life: 1.1, amplitude: 0.07, speed: 15 });
                    }
                    return false;
                }
                return true;
            });
        }

        // Battle pulses
        state.battlePulses.forEach((pulse, id) => {
            pulse.time += dt;
            const entry = state.sectors.get(id);
            if (!entry) return;
            const life = pulse.life || 6;
            const amplitude = pulse.amplitude || 0.12;
            const speed = pulse.speed || 9;
            // Ease the amplitude out so the tile settles instead of snapping back.
            const fade = Math.max(0, 1 - pulse.time / life);
            entry.group.scale.setScalar(1 + Math.sin(pulse.time * speed) * amplitude * fade);
            if (pulse.time > life) {
                entry.group.scale.setScalar(1);
                state.battlePulses.delete(id);
            }
        });

        if (mapCovered() && (state.coverSkips || 0) < COVER_MAX_SKIPS) {
            state.coverSkips = (state.coverSkips || 0) + 1;
            // Nothing to say about a map nobody can see. Without this the plate
            // would outlive its own reason for existing on a page that opened
            // with a modal already over the board.
            hideBootPlate();
            // An undrawn frame says nothing about what this machine can render, so
            // it must not be allowed to vote on the render path either way.
            state.lastFrameAt = 0;
            return;
        }
        state.coverSkips = 0;
        // ...and back again when the modal closes, if the board is still filling
        // in. Suppressing the report while nobody can see it is right; leaving it
        // suppressed afterwards would be the bug the plate was written to fix.
        if (!state.bootPlate && !state.boardAnnounced && !state.contextLost
            && state.contentQueue.length && state.framesPresented > 0) {
            paintBootPlate('strip');
        }

        const renderStart = performance.now();
        if (state.composer) {
            state.composer.render(dt);
        } else {
            state.renderer.render(state.scene, state.camera);
        }
        const renderMs = performance.now() - renderStart;
        // A render that takes longer than a frame is almost always a shader
        // being compiled or a texture being uploaded for the first time, and
        // both are attributable — see noteCost().
        noteCost('render', renderMs);
        if (state.framesPresented === 0) announceFirstFrame();
        state.framesPresented++;
        // Carried forward so the NEXT frame's interval can have this frame's
        // staging subtracted from it — see the frameMs calculation above. Every
        // frame votes; none of them votes on work that was not rendering.
        state.lastWorkMs = workMs;
        governDetail(frameMs);
        governPost(frameMs, renderMs);
    }

    // . Full rationale: docs/galaxy3d-design-notes.md#the-render-path-and-how-it-is-chosen
    const POST_OFF = 'off';           // decided, permanently plain
    const POST_PROBING = 'probing';   // plain, still measuring
    const POST_PENDING = 'pending';   // measured good, chain being built
    const POST_ON = 'on';             // composer live
    const POST_DROPPED = 'dropped';   // was on, gave up, never coming back

    // Ignore the opening burst. The first frames of the map carry shader
    // compiles, texture uploads and the tail of page load, and judging the
    // machine on those refuses the glow to hardware that deserves it.
    const POST_WARMUP_MS = 350;
    const POST_PROBE_MS = 400;         // length of one probe window
    const POST_PROBE_MIN_FRAMES = 6;   // ...and it is not a mean under six samples
    const POST_FRAME_BUDGET_MS = 24;   // ~42fps plain, before anything is added
    /** ...and the CPU is not the one rasterising, expressed as a SHARE of the frame. Full rationale: docs/galaxy3d-design-notes.md#and-the-cpu-is-not-the-one-rasterising-expressed-as-a-share- */
    const POST_CPU_SHARE = 0.6;
    const POST_CPU_FLOOR_MS = 3;
    // Total measured frame time to spend looking for a good window before
    // concluding the answer is no. Generous, because a machine can be briefly
    // busy at startup for reasons that have nothing to do with its GPU, and the
    // probe costs two timestamps a frame whether it succeeds or not.
    const POST_PROBE_BUDGET_MS = 6000;

    const GOVERN_WINDOW_MS = 700;
    const DROP_AA_MS = 45;       // under ~22fps sustained
    const DROP_BLOOM_MS = 80;    // under ~12fps sustained — bail out of post entirely

    // . Full rationale: docs/galaxy3d-design-notes.md#don-t-draw-what-nobody-can-see
    /** A 7x5 GRID, NOT FIVE POINTS. Full rationale: docs/galaxy3d-design-notes.md#a-7x5-grid-not-five-points */
    const COVER_SAMPLES = [];
    for (let j = 0; j < 5; j++) {
        for (let i = 0; i < 7; i++) COVER_SAMPLES.push([0.02 + i * 0.16, 0.02 + j * 0.24]);
    }
    const COVER_RECHECK_MS = 200;
    // Insurance, not optimisation. If some element this file has never heard of
    // hit-tests over the whole map, the failure mode must be "the map updates
    // slowly" and not "the map is frozen for the rest of the session". One frame
    // in thirty is ~3% of the work and half a second of staleness at worst.
    const COVER_MAX_SKIPS = 30;

    function mapCovered() {
        if (document.hidden) return true;
        const dom = state.renderer && state.renderer.domElement;
        if (!dom) return false;
        const now = performance.now();
        if (state.coverCheckedAt && now - state.coverCheckedAt < COVER_RECHECK_MS) {
            return Boolean(state.covered);
        }
        state.coverCheckedAt = now;
        const rect = dom.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) {
            state.covered = true;
            return true;
        }
        // A null hit means the point reached nothing at all, which is not evidence
        // of a modal; every ambiguous answer resolves to "draw it".
        const view = state.container || dom;
        let covered = true;
        for (let i = 0; i < COVER_SAMPLES.length; i++) {
            const hit = document.elementFromPoint(
                rect.left + rect.width * COVER_SAMPLES[i][0],
                rect.top + rect.height * COVER_SAMPLES[i][1]);
            if (!hit || hit === view || view.contains(hit)) { covered = false; break; }
        }
        state.covered = covered;
        return covered;
    }

    // . Full rationale: docs/galaxy3d-design-notes.md#the-detail-ladder-the-governor-that-runs-on-every-machine
    const DETAIL_RUNGS = 3;
    const DETAIL_BUDGET_MS = 45;      // ~22 fps sustained: below this, shed nothing
    const DETAIL_WINDOW_MS = 400;     // WALL CLOCK, not a frame count
    const DETAIL_MIN_FRAMES = 3;
    // The first rung wants two windows of agreement, because a single bad window
    // can be somebody else's long task and degradation here is one-way. After
    // that the machine has told us what it is and one window is enough.
    const DETAIL_FIRST_RUNG_WINDOWS = 2;
    const DETAIL_PIXEL_RATIO = [null, 0.8, null, 0.62];

    function applyDetailRung(rung) {
        const renderer = state.renderer;
        if (!renderer) return;
        const pr = DETAIL_PIXEL_RATIO[rung];
        // Never UP: a machine that has been taken down a rung is not asked to
        // climb back, and the ratio is a floor rather than a set point.
        /** THE BACKING STORE IS RESIZED WHEN THE PLAYER'S HAND IS OFF THE MAP. Full rationale: docs/galaxy3d-design-notes.md#the-backing-store-is-resized-when-the-player-s-hand-is-off-t */
        if (pr && renderer.getPixelRatio() > pr) state.pendingPixelRatio = pr;
        // ONE FOG MATERIAL A FRAME, not all of them at once. Dropping the blend
        // sets needsUpdate, and the next draw recompiles that material's program
        // — which on a CPU rasteriser is a JIT of the largest fill in the scene.
        // Seven of them in one frame measured as a 3.1-second render: the rung
        // that exists to make the board responsive, arriving as the worst single
        // frame of the session.
        if (rung >= 2) state.fogConform = (state.fogMaterials || []).slice();
        // The cloud shell is a second shaded sphere per world; applyDetail()
        // reads state.detail, so a walk over every sector is what makes it stick.
        //
        // SPREAD OVER FRAMES, because the rescue must not be the thing that needs
        // rescuing. Done in one pass this measured 728 ms — a governor that
        // arrives as a three-quarter-second stall has handed the player one more
        // stutter in exchange for the stutters it removed.
        if (rung >= 3) state.detailSweep = 0;
        console.info('Galaxy3D: detail rung %d — rendering the board lighter to keep it responsive', rung);
    }

    /** Bring one fog-cell material into line with the current rung. Full rationale: docs/galaxy3d-design-notes.md#bring-one-fog-cell-material-into-line-with-the-current-rung */
    function conformFogMaterial(mat) {
        if (!mat || state.detail < 2 || !mat.transparent) return;
        mat.transparent = false;
        mat.color.multiplyScalar(1.16);
        mat.needsUpdate = true;
    }

    /** THE WINDOW'S WORST FRAME DOES NOT GET A VOTE. Full rationale: docs/galaxy3d-design-notes.md#the-window-s-worst-frame-does-not-get-a-vote */
    function trimmedMean(totalMs, worstMs, frames) {
        if (frames >= 3) return (totalMs - worstMs) / (frames - 1);
        return totalMs / Math.max(1, frames);
    }

    function governDetail(frameMs) {
        /**
         * A FRAME THAT WAS UPLOADING AND LINKING A WORLD IS NOT A VOTE.
         *
         * While bundles are staging, the frame clock is measuring texture
         * uploads and shader links — a startup transient — rather than this
         * machine's ability to draw the board. Judging it here took rung 1 at
         * ~6.5 s in every measured run and left the whole session at rung 3 with
         * pixelRatio 0.62: a permanently soft board bought with a startup
         * artefact, and it bought nothing, because the frames were still 100-180
         * ms afterwards. The ladder already has this precedent for forgeBusy();
         * staging is the same window one stage later.
         */
        if (state.bundleStaging.size > 0) {
            state.detailWinStart = 0;
            return;
        }
        if (state.detail >= DETAIL_RUNGS || frameMs <= 0 || document.hidden) {
            state.detailWinStart = 0;
            return;
        }
        const now = performance.now();
        if (!state.detailWinStart) {
            state.detailWinStart = now;
            state.detailFrames = 0;
            state.detailMs = 0;
            return;
        }
        state.detailFrames++;
        state.detailMs += frameMs;
        state.detailWorst = Math.max(state.detailWorst || 0, frameMs);
        if (now - state.detailWinStart < DETAIL_WINDOW_MS || state.detailFrames < DETAIL_MIN_FRAMES) return;

        const mean = trimmedMean(state.detailMs, state.detailWorst, state.detailFrames);
        state.detailWinStart = now;
        state.detailFrames = 0;
        state.detailMs = 0;
        state.detailWorst = 0;
        if (mean <= DETAIL_BUDGET_MS) {
            state.detailStrikes = 0;
            /** ONE RUNG BACK, ONCE, AND ONLY IF IT WAS TAKEN UNDER PROTEST. Full rationale: docs/galaxy3d-design-notes.md#one-rung-back-once-and-only-if-it-was-taken-under-protest */
            if (state.detailProvisional && !forgeBusy() && mean <= DETAIL_BUDGET_MS * 0.5) {
                state.detailProvisional = false;
                state.detail = Math.max(0, state.detail - 1);
                const pr = state.software ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
                if (state.renderer && state.renderer.getPixelRatio() < pr) {
                    state.renderer.setPixelRatio(pr);
                    resize();
                }
                console.info('Galaxy3D: back up to detail rung %d — that was the startup, not the machine',
                    state.detail);
            }
            return;
        }
        /** MEASURED ON THE FRAME INTERVAL, NOT ON WHAT render() RETURNED IN. Full rationale: docs/galaxy3d-design-notes.md#measured-on-the-frame-interval-not-on-what-render-returned-i */
        if (state.covered) return;
        /** ...AND THE LADDER IS CAPPED WHILE OUR OWN THREADS ARE RUNNING. Full rationale: docs/galaxy3d-design-notes.md#and-the-ladder-is-capped-while-our-own-threads-are-running */
        const transient = forgeBusy();
        if (transient && state.detail >= 1) return;
        state.detailStrikes = (state.detailStrikes || 0) + 1;
        if (state.detail === 0 && state.detailStrikes < DETAIL_FIRST_RUNG_WINDOWS) return;
        state.detailStrikes = 0;
        state.detail++;
        // Marked so the machine can win it back once, if the evidence was our own
        // background threads rather than its hardware.
        //
        // OFFERED TO THE SOFTWARE PATH TOO. It used to be withheld from a
        // renderer that had named itself a CPU rasteriser, on the assumption
        // that one would need the ladder anyway — but the measurements do not
        // support that assumption, and the machines most likely to be judged on
        // a startup artefact were exactly the ones that could never win the rung
        // back. The rung is still only handed back once, and only against a mean
        // at half the budget, so a machine that really cannot hold it simply
        // takes it again.
        if (transient && state.detail === 1) state.detailProvisional = true;
        const t0 = performance.now();
        applyDetailRung(state.detail);
        // A rescue that is itself a stall has not rescued anything — attributed
        // so it cannot hide inside a frame the way it used to.
        noteCost(`rung${state.detail}`, performance.now() - t0);
    }

    function resetPostWindow(now) {
        state.winStart = now;
        state.winFrames = 0;
        state.winFrameMs = 0;
        state.winRenderMs = 0;
        state.winWorstFrame = 0;
        state.winWorstRender = 0;
    }

    /** Build the post chain out of band. Full rationale: docs/galaxy3d-design-notes.md#build-the-post-chain-out-of-band */
    function upgradePost() {
        state.post = POST_PENDING;
        const build = () => {
            if (state.post !== POST_PENDING || !state.renderer || !state.container) return;
            const rect = state.container.getBoundingClientRect();
            const composer = buildComposer(state.renderer,
                Math.max(1, rect.width), Math.max(1, rect.height));
            if (!composer) {
                state.post = POST_OFF;   // buildComposer already warned
                return;
            }
            state.composer = composer;
            state.post = POST_ON;
            resize();                    // exact sizes, FXAA resolution, camera aspect
            resetPostWindow(performance.now());
        };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(build, { timeout: 600 });
        } else {
            setTimeout(build, 0);
        }
    }

    function dropPost(reason, meanFrame) {
        const composer = state.composer;
        state.composer = null;
        state.bloomPass = null;
        state.fxaaPass = null;
        state.post = POST_DROPPED;
        // Two half-float ping-pong targets at canvas resolution, plus bloom's five
        // mip pairs. Dropping the reference without disposing them leaves that
        // resident on the one machine in the product that demonstrably has nothing
        // to spare — the old code did exactly that.
        try { if (composer && composer.dispose) composer.dispose(); } catch (err) { /* best effort */ }
        console.info('Galaxy3D: dropping post-processing (%s) — %dms a frame', reason, Math.round(meanFrame));
    }

    function governPost(frameMs, renderMs) {
        const probing = state.post === POST_PROBING;
        if (!probing && state.post !== POST_ON) return;
        const now = performance.now();
        if (state.winStart === undefined) {
            state.animStart = now;
            resetPostWindow(now);
            return;
        }
        // A hidden tab is throttled to about one frame a second by the browser. Full rationale: docs/galaxy3d-design-notes.md#a-hidden-tab-is-throttled-to-about-one-frame-a-second-by-the
        if (document.hidden || frameMs <= 0 || forgeBusy()
            || now - state.animStart < POST_WARMUP_MS) {
            resetPostWindow(now);
            return;
        }

        state.winFrames++;
        state.winFrameMs += frameMs;
        state.winRenderMs += renderMs;
        state.winWorstFrame = Math.max(state.winWorstFrame || 0, frameMs);
        state.winWorstRender = Math.max(state.winWorstRender || 0, renderMs);
        const span = now - state.winStart;
        const windowMs = probing ? POST_PROBE_MS : GOVERN_WINDOW_MS;
        const minFrames = probing ? POST_PROBE_MIN_FRAMES : 4;
        if (span < windowMs || state.winFrames < minFrames) return;

        // The worst frame in the window does not get a vote — see trimmedMean().
        const meanFrame = trimmedMean(state.winFrameMs, state.winWorstFrame, state.winFrames);
        const meanRender = trimmedMean(state.winRenderMs, state.winWorstRender, state.winFrames);
        const measured = state.winFrameMs;
        resetPostWindow(now);

        if (probing) {
            // A context that has NAMED itself a CPU rasteriser never earns the
            // chain, however well a window happens to measure. It probes only so
            // that governDetail() above gets fed the same frames.
            if (state.software) {
                state.post = POST_OFF;
                return;
            }
            const cpuOk = meanRender <= POST_CPU_FLOOR_MS || meanRender <= meanFrame * POST_CPU_SHARE;
            if (meanFrame <= POST_FRAME_BUDGET_MS && cpuOk) {
                upgradePost();
                return;
            }
            state.probeSpent = (state.probeSpent || 0) + measured;
            if (state.probeSpent >= POST_PROBE_BUDGET_MS) {
                state.post = POST_OFF;
                console.info('Galaxy3D: staying on the plain render path — %dms a frame without it',
                    Math.round(meanFrame));
            }
            return;
        }

        // Catastrophic first: a machine at 80 ms is not going to be rescued by
        // shedding an edge blur, and making it spend another window finding that
        // out is another window of an unplayable board.
        if (meanFrame > DROP_BLOOM_MS) {
            dropPost('frame budget', meanFrame);
        } else if (meanFrame > DROP_AA_MS && state.fxaaPass && state.fxaaPass.enabled) {
            state.fxaaPass.enabled = false;
            console.info('Galaxy3D: dropping FXAA — sustained frame time %dms', Math.round(meanFrame));
        }
    }

    window.Galaxy3D = {
        initialize,
        updateSector,
        setSectorDetail,
        setSelected,
        focusSector,
        frameSectors,
        setSafeArea,
        // Read-only view of the insets the HUD has claimed. Collapsing a panel is supposed
        // to hand its space back to the camera, and the only way to tell that from merely
        // hiding a box is to read what the camera still believes is occluded.
        debugSafeInset: () => ({ ...state.safeInset }),
        /** Which render path this machine ended up on, and why. Full rationale: docs/galaxy3d-design-notes.md#which-render-path-this-machine-ended-up-on-and-why */
        debugRenderPath: () => ({
            post: state.post,
            software: state.software,
            composer: Boolean(state.composer),
            bloom: Boolean(state.bloomPass),
            fxaa: Boolean(state.fxaaPass && state.fxaaPass.enabled),
            pixelRatio: state.renderer ? state.renderer.getPixelRatio() : null,
            // True when a modal is over the whole map and the draw is being
            // skipped. A harness measuring frame times on the shop or the codex
            // needs to know it is measuring a map that is deliberately not being
            // drawn, rather than one that mysteriously got fast.
            covered: Boolean(state.covered),
            queued: state.contentQueue.length,
            // Which sector the pointer is over. Hover, click and drag are the
            // map's entire interaction vocabulary and all three are paced by the
            // frame; a harness that wants to measure how late the feedback lands
            // needs something observable to watch, and this is it.
            hovered: state.hovered === undefined ? null : state.hovered,
            // How far down the detail ladder this machine has been taken, and
            // what it has actually cost. A harness that photographs the board
            // needs to know which rung it photographed.
            detail: state.detail,
            // Whether the world surfaces are being generated on the second
            // thread, and how far that has got. A harness measuring startup needs
            // to know which path it measured — the forged one and the fallback
            // have completely different frame shapes.
            forge: state.forge ? (state.forge.failed ? 'failed' : `${state.forge.workers.length}w`) : 'off',
            forged: state.worldBundles.size,
            forgePending: state.bundlePending.size,
            forgeFallback: state.bundleFailed.size,
            plate: state.bootPlateMode,
            cores: Number(navigator.hardwareConcurrency) || null,
            // The same answer the pre-warm acts on, not a second opinion — see
            // parallelCompile(). false here means shader linking is on the frame
            // by design, and any pre-warm would BE the stall it was avoiding.
            parallelCompile: parallelCompile(),
            // Every main-thread item that cost more than a frame, named. See
            // noteCost(): a hitch you cannot attribute is a hitch you cannot fix.
            costLog: (state.costLog || []).slice(),
            frames: state.framesPresented,
            boot: `${state.bootStep}/${BOOT_STEPS.length}`,
            // Measured cost of generating one sector's contents here. This is the
            // number the content pacing is built on; if it is large, the machine
            // is slow at CANVAS work, which is a different complaint from being
            // slow at rendering.
            contentCostMs: Math.round(state.contentCost * 10) / 10
        }),
        highlightSector,
        clearBattleSector,
        animateFleetMove,
        resize,
        /** THREE DIFFERENT QUESTIONS, BECAUSE THEY HAVE THREE DIFFERENT ANSWERS. Full rationale: docs/galaxy3d-design-notes.md#three-different-questions-because-they-have-three-different- */
        isReady: () => Boolean(state.ready && state.gridBuilt),
        /** A frame has reached the canvas. There is a board on screen. */
        hasPainted: () => state.framesPresented > 0,
        /** Every charted sector's contents are generated; nothing is a stand-in. */
        isBoardReady: () => Boolean(state.boardAnnounced),
        // Battle theater freezes the map render loop while it owns the screen.
        setPaused(paused) { state.paused = !!paused; },
        STATUS
    };

    // Drain any calls queued before the module loaded.
    if (Array.isArray(window.__g3dQueue)) {
        const queue = window.__g3dQueue.splice(0);
        queue.forEach(([method, args]) => {
            try {
                if (typeof window.Galaxy3D[method] === 'function') {
                    window.Galaxy3D[method](...args);
                }
            } catch (err) {
                console.warn('Galaxy3D: queued call failed', method, err);
            }
        });
    }

    // 'THE SCRIPT IS LOADED', NOT 'THE MAP IS READY'. It fires here, at module
    // evaluation, which is roughly a quarter of a second into the page and about
    // four seconds before the first frame. Two files already listen to it and
    // both want exactly this meaning (drain the queued calls, read the safe
    // area), so it keeps it. Anything that wants to take a loader down should
    // listen for 'galaxy3d-first-frame', and anything that wants to say the board
    // is complete should listen for 'galaxy3d-board-ready'.
    document.dispatchEvent(new CustomEvent('galaxy3d-ready'));
})();

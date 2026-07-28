/**
 * galaxy3d.js - Three.js main galaxy map view.
 *
 * Renders the full galaxy as an interactive hex plotting table suspended in a
 * nebula: explored sectors show their contents (worlds, stars, black holes,
 * asteroid belts), unexplored space stays under fog. Clicking a sector selects
 * it through the same flow as the minimap, so all existing UI panels keep
 * working.
 *
 * RENDER PIPELINE
 * ---------------
 * The scene is rendered through an EffectComposer, not straight to the canvas:
 *
 *   RenderPass -> UnrealBloomPass -> OutputPass -> FXAA
 *
 * That ordering is deliberate. Everything before OutputPass works in LINEAR
 * light inside a half-float buffer, which is the only place bloom means
 * anything: a star photosphere is authored at ~2.6x white and a hex tile at
 * ~0.3, so the threshold can sit at 0.9 and pick out light SOURCES rather than
 * smearing every bright pixel. OutputPass then applies ACES and the sRGB
 * transfer once, at the end. FXAA runs after it because it needs perceptual
 * (sRGB) input to weight its edge test — and it is doing the anti-aliasing that
 * `antialias: true` cannot, since with a composer the canvas only ever receives
 * a full-screen quad.
 *
 * Consequences worth knowing before editing:
 *   - Material colours are LINEAR and may exceed 1. That is how something is
 *     made to bloom; do not "brighten" a thing by pushing its opacity.
 *   - HUD-ish sprites (sector numbers, fleet badges) are authored just under
 *     the bloom threshold on purpose. Painting them at pure white makes them
 *     glow and costs legibility, which is the one thing this view may not lose.
 *
 * Exposes window.Galaxy3D with:
 *   initialize(width, height)
 *   updateSector(sectorId, statusNum, { fleetSize, indicator, type })
 *   setSectorDetail(sectorData)          // rich data from sector:: messages
 *   setSelected(sectorId) / focusSector(sectorId)
 *   highlightSector(sectorId)            // battle pulse
 *   clearBattleSector(sectorId)
 *   animateFleetMove(fromId, toId, { mine, count, warp })
 *   frameSectors(ids) / setSafeArea(inset) / resize() / isReady()
 *
 * ui.js queues calls in window.__g3dQueue until this module loads.
 */

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
    createPlanetObject,
    createStarObject,
    createAsteroidGeometry,
    createAsteroidMaterial,
    ASTEROID_VARIANTS,
    seededRandom
} from './planet-texture.js?v=20260728a';

(function () {
    // The landing page, login, race select and lobby all honour this; the game screen —
    // by far the most animated page in the product — did not. Idle decoration (planets
    // spinning, markers pulsing in and out of scale, the selection ring flashing, fog
    // drifting) runs continuously for as long as the map is open, and scale oscillation
    // and flashing are the two kinds of motion people set this preference to avoid.
    //
    // Informational motion is NOT suppressed: a fleet crossing the map, or the camera
    // moving because you asked it to, tells you something. Only the idle loop is stilled,
    // and everything it touches stays VISIBLE at a steady value — the selection ring in
    // particular still marks the selected sector, it just stops pulsing.
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

    /**
     * A star sector and an asteroid belt both arrive as STATUS.HAZARD, and they
     * are wildly different things: a belt is a 25-50% per-hull risk you can
     * SECURE, a star is not something you fly into at all. One swatch for both
     * is a gameplay lie. `entry.type` separates them, so the plate carries two
     * cues that survive independently:
     *   - a hue split inside the bronze family, and
     *   - a STENCIL painted into the plate albedo (a broken ring for a belt, a
     *     radial burst for a star), which still separates them in a monochrome
     *     screenshot and after the dimming applied to non-live tiles.
     */
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

    /**
     * The scene key, as a direction. ONE definition: the DirectionalLight is
     * placed from it and every projected contact shadow is cast along it, so a
     * shadow can never disagree with the light that is supposed to have thrown
     * it. Normalisation is not needed — only the x/y and z/y ratios are used.
     */
    const KEY_LIGHT_DIR = { x: 6, y: 12, z: 4 };

    /**
     * The direction the rig looks, as a ratio. The camera never rotates — it
     * sits at camTarget + (0, d*0.92, d*0.5) and looks back at the target — so
     * this is a constant of the view, and anything that has to be staged where
     * a LIFTED object appears on screen (a star's light pool, a contact
     * shadow's screen-space check) derives its offset from it rather than from
     * a hand-tuned nudge that only holds at one zoom.
     */
    const VIEW_DIR = { x: 0, y: -0.92, z: -0.5 };

    /**
     * How high a star's photosphere floats above the plate it belongs to. This
     * is a registration constant, not a taste one: the deck pool below the body
     * is offset along VIEW_DIR by exactly this lift, so the two land on the same
     * screen pixel. Change one and the star separates from its own light again.
     */
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
    /**
     * Unit hexagon corners, flat-top: vertices on +/-X, flat edges facing +/-Z.
     * Wound CLOCKWISE in (x, z) — which is counter-clockwise seen from above —
     * so every fan and strip built from this array comes out facing +Y and needs
     * no side:DoubleSide rescue on a lit material.
     */
    const HEX_CORNERS = [];
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        HEX_CORNERS.push([Math.cos(a), -Math.sin(a)]);
    }

    // Bloom threshold, in linear light. Anything authored below this does not
    // glow; anything above it is a light source. Sector numbers and fleet badges
    // are painted at ~0.86 sRGB precisely so they land under it.
    // 1.05, not 0.9. With the bloom raised to strength 0.7 so a star can blow
    // out, a threshold of 0.9 also caught the gold homeworld plate — the
    // brightest LIT surface on the board — and smeared a cream wash over the
    // centre of it that took the grain and the rivets with it. A light source is
    // authored ABOVE white; a lit plate never is. This is where that line sits.
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
        composer: null,
        bloomPass: null,
        fxaaPass: null,
        scene: null,
        camera: null,
        raycaster: null,
        pointer: new THREE.Vector2(),
        sectors: new Map(),        // id -> { group, tile, content, badge, status, type, fleetSize }
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
        animHandle: null
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

    /**
     * Separable box blur over RGBA bytes, wrapping in x and clamping in y.
     * Returns a Float32Array in the same layout.
     *
     * This exists for ONE job: killing content finer than (2r+1) texels in an
     * image that is about to be magnified. See the note at its call site in
     * buildSkyTexture — canvas gradients arrive carrying the rasteriser's own
     * ordered dither, and at 7.5 screen pixels per texel that dither is a
     * visible lattice across the whole sky.
     */
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

    function canvas2d(w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        return canvas;
    }

    function toTex(canvas, colorSpace, wrap) {
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = colorSpace || THREE.SRGBColorSpace;
        if (wrap) { tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; }
        // ANISOTROPY. The previous revision turned this off on the theory that a
        // fixed 60-degree tilt is "already correct" for trilinear. It is not:
        // 60 degrees is exactly a 2:1 compression along the view axis, so the
        // trilinear mip selector picks the level that suits the SHORT axis and
        // blurs the long one — which is why rivets in the far half of the board
        // arrived as smears while the near ones were sharp. Every texture here
        // is built once and cached, and the plates are the surface that spends
        // its life at a grazing angle, so this is the cheapest sharpness in the
        // renderer.
        // Not on a CPU rasteriser, where every extra tap is a real loop in the
        // main thread and the plates cover the whole viewport.
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

    // ------------------------------------------------------------------
    // The plotting table: hex plate geometry and its material set.
    //
    // The old tile was a six-sided cylinder with a flat MeshStandardMaterial —
    // no edge, no relief, nothing for the key light to catch, which is exactly
    // why the board read as a debug wireframe fill. This one is a machined
    // plate: recessed top face, chamfered lip, short side wall, flat-shaded so
    // the chamfer reads as a separate facet at every camera angle.
    // ------------------------------------------------------------------

    /**
     * How much of the plate texture the TOP FACE is allowed to use.
     *
     * At 1.0 the hexagon's own corners reach u = 0 and u = 1, so every texel of
     * the image belongs to the top face and the extruded side walls had nowhere
     * to sample but the top face's own UVs — which is precisely the bug that
     * smeared one stretched column of the embossed frame down each wall as a
     * blown-out white band. Shrinking the top face's UV footprint to 0.88 frees
     * a horizontal strip at each end of the image that no top-face fragment can
     * ever reach, and the rim band is painted there. The painted frame, tray and
     * rivets are all authored against the same constant, so nothing moves in
     * world space.
     */
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

    /**
     * THE SELECTION MARKER: four chamfered clamps bolted onto the tile.
     *
     * The previous marker was a thin glowing translucent outline with an additive
     * halo — the holographic look the art direction rejects — and its wash blew
     * the centre of the selected plate out, taking the grain, the rivets and the
     * legibility of the sector number with it. This is hardware: four short
     * beveled steel brackets straddling the tile's four diagonal edges, each with
     * a rivet at either end, built from the SAME unit corner array as the plate
     * so it cannot drift, overshoot a neighbour or hang across the gutter. The
     * two flat edges are deliberately left clear — that is where the register
     * ticks and the sector number live.
     *
     * It is lit by the scene key like everything else on the table, so it reads
     * as installed rather than projected.
     */
    function buildSelectionClampGeometry() {
        const parts = [];

        /**
         * One bracket: a mounting pad bedded onto the plate, a chamfered base
         * slab, a narrower cap and a bolt at each end.
         *
         * The pad matters. Without it the bracket terminated in mid-air on the
         * plate surface with nothing to say how it was attached, which is most of
         * why it read as moulded plastic dropped on the board rather than as
         * machined furniture bolted to it.
         */
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

        /**
         * THE TWO UPPER DIAGONAL EDGES ONLY.
         *
         * There used to be four, ringing the tile, and they were the brightest
         * marks on it — brighter than the sector number, which is the one thing
         * on a plate that carries information. Worse, the lower pair collided
         * with the two other objects that live in that half of the tile: the
         * lower-left bracket overlapped the ID plaque (which spans x -0.56..0.24
         * at z 0.31..0.61) and the lower-right one sat under the fleet badge at
         * bearing 30 degrees. Three UI objects stacked in one corner.
         *
         * Edges [0,1] and [2,3] are the two that face AWAY from the camera, so
         * the marker sits in the empty upper half of the plate and the whole
         * lower half is left to the plaque and the badge. Two brackets read as
         * deliberate; four read as decoration.
         */
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

    /**
     * AN EMPTY SOCKET, NOT A PLATE.
     *
     * The board's biggest readability failure was that an unexplored cell was a
     * fully-built instrument: identical rivets, identical frame emboss, identical
     * tray recess and dashed scribe as a surveyed sector, differing only by a
     * 1.3:1 tonal step. Sixty percent of the viewport was detailed hardware the
     * player had to learn to ignore.
     *
     * So the HARDWARE ITSELF is now the signal. A charted sector has a machined
     * plate installed in it; an unexplored one has the hexagonal hole the plate
     * would go into — a chamfered funnel down to a bare floor, with the sensor
     * haze glowing in the bottom of it and nothing else. Nothing is riveted,
     * nothing is stencilled, nothing is framed. Combined with FOG_DROP below,
     * the unknown region visibly falls away from the charted plane, which is the
     * depth cue the flat board never had.
     */
    const FOG_DROP = 0.13;                   // how far an unexplored cell sits below the deck
    const FOG_RIM_SCALE = 0.995;             // outer lip of the socket
    // 0.925, not 0.80. A chamfer that eats a fifth of the tile is not a chamfer,
    // it is a funnel — and with the rim blown out (see below) that funnel was the
    // loudest thing on an unexplored cell. 7.5% reads as a machined seat.
    const FOG_FLOOR_SCALE = 0.925;           // where the funnel wall reaches the floor
    const FOG_FLOOR_Y = TILE_TOP - 0.115;

    /**
     * @param {number} variant  which slice of the haze texture this cell samples.
     *
     * The uv OFFSET AND ROTATION ARE BAKED PER CELL, which is the fix for the
     * unexplored field reading as one printed wallpaper. The uv used to be a
     * bare function of local tile-space x,z, so every cell in the galaxy sampled
     * exactly the same texel range and the same swirl appeared, pixel for pixel,
     * on every hex; the six material variants rotated the sample but 112 cells
     * over 6 patterns still puts identical neighbours in the same screenful.
     * Seven geometry variants against those six is 42 distinct cells, which is
     * more than are ever on screen at once.
     */
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
            // Funnel wall: rim down to floor. Six flat facets, so the key light
            // separates them and the socket has depth without a single painted
            // pixel of hardware in it.
            //
            // WINDING. HEX_CORNERS is wound clockwise in (x, z), which is
            // counter-clockwise seen from above, so a fan over it faces +Y with
            // no help. A funnel WALL is not a fan: taking the corners in the same
            // order from the outer ring to the inner one produces triangles whose
            // normals point DOWN and outward, which front-face culling then
            // removes entirely — the cell rendered as nothing but its floor, at
            // 80% of the tile, and the missing 20% was also missing from the
            // raycast, so clicking the edge of an unexplored sector did nothing.
            // The wall triangles are therefore wound the other way round.
            //
            // THE WALL IS SHADED PER FACET, NOT BY ONE FLAT CONSTANT.
            //
            // It used to be RIM = 3.1 against FLOOR = 1.0 — a 3.1x vertex tint on
            // every one of the six walls at once. The scene key only reaches one
            // or two of them, so what shipped was a single pale parallelogram
            // blown out of the upper-left edge of every unexplored hex while the
            // other four vanished into the floor value: torn paper, not a socket.
            // Each wall now takes its own orientation to the key, exactly as the
            // plate's chamfer does through paintRimStrip, so all six carry a
            // distinct value and the cell reads as a recess with a lit side and a
            // shadow side.
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

    /**
     * The deck plate: brushed gunmetal with an embossed hexagonal frame, corner
     * rivets and stencilled register ticks. Painted in GREYSCALE so the per-status
     * tint can be applied with material.color without fighting a baked hue.
     *
     * Returns { map, normalMap }. The plates are Blinn-Phong, so roughness and
     * metalness are scalars and there is no third map to pay for.
     */
    /**
     * A low-frequency fbm evaluated on a coarse grid and bilinearly resampled.
     *
     * At 1024x1024 a per-texel three-octave fbm is a million calls and about a
     * third of a second of startup; the layers it is wanted for here vary over
     * hundreds of texels, so sampling them at 96x96 and interpolating is
     * indistinguishable and roughly a hundred times cheaper. The HIGH frequency
     * layers are still evaluated per texel — that is the detail the resolution
     * was raised for.
     */
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

        /**
         * THE MACHINING HEIGHT FIELD, and where it belongs.
         *
         * The old grain was `fbm2(x / 26, y / 3.2)` painted into the ALBEDO: an
         * 8:1 stretch at a 26-texel period, which is the frequency and aspect of
         * WOODGRAIN, and putting it in the albedo meant the scratches only ever
         * darkened. Metal does the opposite — a machining pass is relief, so it
         * catches the key and GLINTS. This is a much finer, much tighter grain
         * (a ~3-texel period at 1024, i.e. genuine tool marks) and it is fed into
         * the normal map only; the albedo keeps just the broad blotchiness of
         * a plate that has been in service.
         */
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
        /**
         * THE RIM BAND GETS A FLAT NORMAL, deliberately.
         *
         * The rim strip is the highest-contrast painting in the image — six
         * per-facet value steps, twelve bolt heads, ribs and wear — and a Sobel
         * over that produces normals that swing most of a hemisphere within a few
         * texels. Under a 220-exponent specular lobe, isolated texels hit
         * N.H ~ 1 and flash to full white: on screen that was a band of blue-white
         * glitter along every up-key chamfer, reading as frost rather than as
         * milled steel. The chamfer and the wall are already SEPARATE GEOMETRIC
         * FACETS with correct normals, so they need nothing from the map, and
         * flattening the band removes the aliasing at its source rather than
         * hiding it behind a softer lobe everywhere else.
         */
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

    /**
     * The machined rim: the chamfer lip, the parting groove and the side wall,
     * painted as ONE horizontal band in the strip of the image the top face's
     * UVs can no longer reach. The wall quads walk this band along u, so each
     * one samples a run of purpose-built rim rather than a stretched column of
     * whatever happened to be under it on the top face.
     */
    /**
     * How strongly hex edge `i`'s outward face turns toward the key light,
     * -1..1. The rim strip's u axis is CUMULATIVE PERIMETER, so edge i owns
     * exactly the u range [i/6, (i+1)/6] — which means the six chamfer facets
     * can each be painted at their own value, and the bevel is then sold by a
     * value step rather than by a hairline.
     */
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

        /**
         * THE CHAMFER IS PAINTED SIX TIMES, ONCE PER EDGE, AT ITS OWN VALUE.
         *
         * The measured failure was that the rim strip and the top face came back
         * at the same luminance (0.23 vs 0.22), so the "chunky beveled" edge was
         * carried by nothing but an aliased hairline. A chamfer is a facet: the
         * one tilted toward the key is brighter than the face it borders and the
         * one tilted away is darker, and that PAIR of value steps is what the eye
         * reads as an edge at thumbnail size. +/-40% about the base, exactly as
         * the direction called for.
         */
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

        /**
         * EXPOSURE FIRST, THEN CONTENT.
         *
         * The chamfer base was 132 with k running to 1.40 — 185 before the
         * status tint, the 2.4-intensity key and ACES all multiply through it.
         * Measured on the shipped frame, the skirts of sectors 10, 11 and 23
         * came back at 199, 215 and 244 luma: on three tiles the untextured side
         * wall was the brightest surface in the picture after the star, which is
         * the grey-box read exactly. 96 with k capped at 1.25 puts the same
         * facet under 200 with the tint still legible on it.
         */
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

        /**
         * A STENCILLED PART CODE, on one facet only.
         *
         * The rim strip is 256 texels of u per edge at this resolution and it
         * carried nothing but gradients, so at any real zoom the sides of every
         * plate were feature-free bands. Three characters on ONE of the six
         * edges is what a machined component actually carries, and putting it on
         * a single facet keeps it from becoming a repeating pattern around the
         * tile. Sprayed dark into the metal, not printed light onto it: this
         * band already had an exposure problem and must not get another.
         */
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

        /**
         * A GRAIN AND WEAR MULTIPLY OVER THE WHOLE STRIP.
         *
         * Everything above is gradients, rules and discs — clean vector work,
         * and clean vector work is exactly what reads as a primitive when it
         * fills a band. This modulates the finished strip by a fine machining
         * noise plus a broad soiling term, so no two texels along the skirt are
         * at the same value and the band has a surface. It runs on the band rows
         * only, which is about a tenth of the image.
         *
         * The rim band is given a FLAT normal further down (see buildPlateMaps),
         * so this is pure albedo and cannot feed the specular sparkle that
         * flattening was introduced to kill.
         */
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

    /**
     * A plate albedo carrying a stencilled hazard code. Composited over the
     * finished base plate so the (expensive) grain pass and Sobel derivation are
     * paid once for the whole board; the stencil is PAINT, so it correctly has
     * no relief and shares the base normal map.
     */
    function plateVariantMap(kind) {
        return cachedTexture(`plate:${kind}`, () => {
            const plate = state.plateMaps;
            const S = plate.size;
            const half = plate.half;
            const K = plate.scale || 1;
            const canvas = canvas2d(S, S);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(plate.base, 0, 0);
            const cx = S / 2;

            /**
             * A SECOND, NON-HUE CHANNEL FOR THE HAZARD READ.
             *
             * Measured, the belt plate and a plain steel plate came back at
             * L=59.4 and L=61.1 — a 1.03:1 step, with hue as the only thing
             * separating "this destroys fleets until you own it" from "this is
             * empty space". That fails on an uncalibrated panel and it fails
             * outright for a red-green deficient player, on the single most
             * gameplay-critical distinction the board draws.
             *
             * So the hazard classes get a stencilled diagonal HATCH at +/-25%
             * value — the same hatch the HUD map key already advertises for
             * "asteroid/star hazard" — painted into the plate albedo. It reads
             * in a greyscale screenshot, it reads at thumbnail size, and it is
             * the pattern the key trained the player to look for. Paired with
             * the ~20% overall darkening applied in tileMaterial, a hazard tile
             * is now the darkest AND the only patterned charted class.
             */
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

    /**
     * Unexplored space. It has to be SEEN — an earlier revision multiplied a fog
     * colour by a near-black tile and about a hundred of the hundred and twelve
     * tiles rendered as literally nothing, so the main map showed the player no
     * galaxy shape at all. This is a luminous sensor-haze, painted bright, and it
     * is layered onto the plate as an EMISSIVE map so the plate relief survives
     * underneath it and the haze can drift on its own uv transform.
     */
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
        /**
         * DASH PITCH 32, NOT 16 — AND SEE THE REPEAT AT THE CALL SITE.
         *
         * A 16px pitch on a 128px texture, repeated two or three times along a
         * crossing that is only ~160 screen pixels long, put roughly 300 texels
         * of dash into 160 pixels. That is a 1.9x MINIFICATION: the dashes fell
         * below Nyquist and the mip chain resolved them into exactly what the
         * review saw — one solid bar of constant width and constant opacity. A
         * dashed line has to be authored for the size it is drawn at, not for
         * the size of its own texture.
         */
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

    // ------------------------------------------------------------------
    // Deep space.
    //
    // Three layers, because one is what makes a starfield look like a debug
    // scatter: an infinitely-distant dome carrying the galactic plane and the
    // nebula masses, a fixed star sphere inside it, and a near dust field in
    // world space that parallaxes against both when the player pans.
    // ------------------------------------------------------------------

    /**
     * The dome carries LOW FREQUENCY ONLY. NOTHING PER-TEXEL. EVER.
     *
     * A 1024-wide equirect map wrapped on a sphere and viewed through a 50-degree
     * lens is magnified about eight times, so anything with an edge in it turns
     * into a blurred blob the size of a hex — which is exactly what the first
     * version of this looked like. Everything that needs to be crisp (the stars)
     * lives in the point layers instead, and the dome does what a distant nebula
     * actually does: a large, soft, dim variation in colour and brightness.
     *
     * WHY THE FINE LAYERS ARE GONE, AND WHY NOTHING MAY PUT THEM BACK.
     *
     * A previous pass added three per-texel terms here — a "starlight grain" at a
     * 3.4-texel period, a filament noise at 7, and a +/-1.5 level triangular
     * dither at 1 — all in the name of texture and anti-banding. Measured on the
     * shipped frame, the visible window is about a sixth of the map's u range
     * across 1920px: ONE TEXEL IS FIFTEEN SCREEN PIXELS. Every one of those terms
     * therefore came back as a 15px bilinear diamond lattice over the entire sky,
     * measurable at residual autocorrelation +0.73 at lag 15 and -0.82 at lag 7.
     * A screen door, in other words, and the most-noticed defect in the frame.
     *
     * The rule this leaves behind: the sky texture may contain nothing whose
     * period is under about six texels (~90px on screen). Anything finer than
     * that is not detail, it is a grid. Screen-space grain and dithering belong
     * in the composer (see buildComposer), where they are 1:1 with pixels.
     */
    function buildSkyTexture() {
        const W = 1024, H = 512;
        const canvas = canvas2d(W, H);
        const ctx = canvas.getContext('2d');

        // WHERE THE CAMERA ACTUALLY LOOKS.
        //
        // NOTE ON THE REWRITE: the previous version painted the base at 256x128
        // and let the canvas bilinearly upscale it to 1024x512, which put a
        // regular grid modulation across the whole void — the base texel lattice
        // resolving on screen, measurable at std 1.4 levels on a mean of 38 and
        // plainly visible at 2x zoom. There is no filter setting that removes
        // that; the fix is to evaluate every texel. The expensive multi-octave
        // layers are sampled off coarse grids (coarseField) and only the layers
        // that need to be crisp are evaluated per texel, so this costs about the
        // same as the version with the artefact in it.
        //
        // THE DOME IS TILTED TO PUT ITS POLE OUT OF FRAME (see buildBackdrop).
        //
        // The rig never rotates: the view direction is fixed at ~61 degrees below
        // the horizon, which on an un-tilted equirect dome aims the camera almost
        // straight at the -Y POLE — where every line of constant latitude
        // collapses into a ring around the centre of the screen. That is why a
        // perfectly reasonable horizontal "galactic plane" band came back as a
        // pale funnel radiating out from behind the board. Tilting the dome by
        // the camera's own pitch puts the view centre on the dome's EQUATOR,
        // where equirect is well behaved and a band painted across the image
        // reads as a band across the frame.
        //
        // Consequence for authoring: the visible window is now v in ~0.36..0.64
        // and a ~0.17-wide run of u centred on 0.75. The ramp and the plane are
        // placed for that window; the noise layers are statistically uniform in
        // u so it does not matter where exactly the window lands.
        //
        // ---- Pass 1: the nebula masses, drawn as canvas gradients into a
        // scratch buffer. They are read back and folded into the per-texel pass
        // below rather than composited on top, so the dither applies to them
        // too — a 400px radial gradient at these alphas is otherwise the single
        // worst source of 8-bit contour banding in the frame.
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
        /**
         * THE GRADIENTS ARE BAND-LIMITED BEFORE THEY ARE MAGNIFIED.
         *
         * This is the actual source of the screen-door lattice that made the
         * frame unshippable, and it took bisecting the scene to find: with the
         * dome removed the sky's residual autocorrelation collapsed from +0.74
         * at lag 15 to nothing, and with the dome's own per-texel noise already
         * deleted the only thing left in it was these canvas gradients.
         *
         * Skia DITHERS gradient fills. It has to — a 300px radial ramp at alpha
         * 0.15 would band otherwise — and it does it with a small ordered matrix
         * at the canvas's own pixel pitch. That is invisible at 1:1 and it is a
         * regular 15px checkerboard once the canvas is wrapped on a dome and
         * magnified seven and a half times, which is what a 1024x512 equirect
         * through a 50-degree lens is. No filter setting removes it: LINEAR
         * magnification of a 2-texel pattern IS the diamond lattice.
         *
         * A five-tap separable box blur takes everything with a period under
         * about five texels — the dither included — to zero, and leaves the
         * masses themselves (radii of 260 to 340 texels) untouched. It wraps in
         * u because the dome does.
         *
         * THE RULE: any canvas gradient that ends up magnified more than ~2x
         * has to be band-limited on the way out. Authoring "no noise" is not
         * enough; the rasteriser adds its own.
         */
        const neb = boxBlurWrapX(sctx.getImageData(0, 0, W, H).data, W, H, 2);

        // ---- Pass 2: everything else, evaluated per texel.
        const img = ctx.createImageData(W, H);
        const px = img.data;
        // Multi-octave layers off coarse grids: these vary over a tenth of the
        // sky, so a 1:8 grid with bilinear resampling is exact enough and about
        // sixty times cheaper than a per-texel fbm.
        const warpF = coarseField(64, 0.14, 3, 2);
        const clumpF = coarseField(128, 0.10, 9, 3);
        const laneF = coarseField(128, 0.13, 131, 3);
        const warmF = coarseField(64, 0.09, 21, 2);
        // Dark absorption is what the previous sky had none of, and it is the
        // difference between a nebula and an airbrush stripe: cold dust in FRONT
        // of the glow, in filaments rather than blobs.
        const absorbF = coarseField(192, 0.20, 907, 3);

        for (let y = 0; y < H; y++) {
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
                // These coefficients are CALIBRATED, not chosen: a texel here is
                // decoded to linear, run through ACES and re-encoded, which maps
                // a value of ~56 to a displayed ~40. The dome has to land in the
                // 25-60 band — dark enough that the board is unambiguously the
                // brightest thing on screen, light enough that the negative space
                // carries an image.
                // getImageData returns UN-premultiplied colour, so a texel a blob
                // barely touched still carries the blob's full RGB with an alpha
                // of two. Adding the raw channels put a bright pale wash over the
                // entire sky that measured L*45-58 — brighter than the plates,
                // which is the one thing the negative space may never be. The
                // alpha weight is not optional.
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
        ctx.putImageData(img, 0, 0);

        const tex = toTex(canvas, THREE.SRGBColorSpace);
        tex.wrapS = THREE.RepeatWrapping;
        return tex;
    }

    /**
     * A tiny studio probe for the metal.
     *
     * The plates are a metal-dominant MeshStandardMaterial, and metal with no
     * environment to reflect renders BLACK — which is most of why the first pass
     * had a board of flat dark polygons. This is a 256x128 equirect with a warm
     * key lobe where the directional key is, a cool fill opposite it, and a
     * horizon gradient; run through PMREM it gives the chamfers something to
     * catch, which is the whole "beveled riveted metal" read.
     */
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

    /**
     * The near dust the board floats in: a world-space sheet under the tiles that
     * parallaxes when the board is panned, and — because it covers the whole
     * frame rather than only the sky above the horizon — it is what actually
     * carries mid-tone into the negative space around the cluster.
     *
     * It contributed nothing before because of an arithmetic bug rather than a
     * choice: the RGB was multiplied by the density AND the alpha was set from
     * the same density, so an additive draw landed at density-SQUARED and a
     * typical texel arrived at about two levels out of 255. Colour is colour;
     * density belongs in alpha, once.
     */
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

    /**
     * The brightest few dozen stars, with a DIFFRACTION CROSS.
     *
     * Every star being the same size and the same white is the loudest
     * "procedural" tell a starfield has. A real field is heavily heavy-tailed:
     * a handful of stars are bright enough that the instrument itself shows —
     * four spikes from the spider vanes — and those anchor points are what make
     * the rest read as a distribution rather than a scatter.
     */
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

    /**
     * Stars as points, with a real colour-temperature spread and a heavy-tailed
     * brightness distribution: many faint, a handful bright enough to clip into
     * the bloom pass. `radiusScale` places them on a shell around the camera
     * (fixed sky) or `spread` scatters them through the board volume (parallax).
     */
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
                fog: false
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

        // Near layers live in world space so they parallax when the board is
        // panned — that motion is the only thing that sells distance on a view
        // with no perspective cues of its own.
        //
        // The sheets must be WIDER than the widest framing or their own straight
        // edge shows up as a hard vertical seam across deep space, which is what
        // happened at 3.2x: at the closeup framing the +X edge of the plane cut
        // the sky in half. At 9x the boundary is outside the frustum at every
        // zoom the wheel allows.
        const spreadX = state.width * HORIZ * 9;
        const spreadZ = state.height * VERT * 9;

        const nebula = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                map: cachedTexture('nearNebula', buildNearNebulaTexture),
                transparent: true,
                // This is the layer that puts a value under the whole frame, not
                // only above the horizon. Bounded HARD by the tile brightness
                // above it: at 0.46 it lifted the whole frame into a flat pale
                // wash that measured brighter than the board itself, which is the
                // same failure as the black one with the sign flipped.
                // 0.085. This sheet is also what shows through the gaps BETWEEN
                // plates, and measured at 0.12 the deck gap came back level with
                // a charted plate — so the empty space between two instruments
                // was as loud as the instruments. It still has to carry a value
                // under the whole frame, so this is as far down as it goes.
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
        // Richer worlds are visibly bigger, so value reads before you click.
        // The ramp starts at 0.34, not 0.28. A class-6 world at 0.28 is forty
        // pixels across at the map framing, and there is no surface generator
        // that can make forty pixels legible — it read as orange mush. The step
        // between classes is what carries the "richer" signal and it is intact;
        // the floor is what was wrong.
        const radius = type === 10 ? 0.50 : 0.34 + (type - 5) * 0.038;
        // The shared generator carries its own key light, terminator, ocean
        // specular, night lights and atmosphere shell — a self-lit body rather
        // than a textured ball under whatever the scene's lights happen to be.
        const world = createPlanetObject(type, entry.id, {
            radius,
            spin: 0.06 + ((Number(entry.id) || 0) % 7) * 0.012,
            // The shared generator's atmosphere is a BACK-SIDE shell whose alpha
            // comes from the view ray's impact parameter against the planet and
            // is weighted by dot(rim, light) — a crescent on the lit limb, which
            // is what an atmosphere is. The sprite halo that used to sit on top
            // of it was a camera-facing ring of constant brightness: equally
            // bright on the night side, and with a rectangle to leak at the quad
            // corner. It is gone; this is turned up to carry the read alone.
            // 0.30/4.6, not 0.38/3.8. At the wider exponent the shell's falloff
            // reached far enough inboard that it lifted the whole limb evenly and
            // came back reading as a hard halo RINGING the silhouette — the exact
            // sprite-halo look it exists to replace. A higher power pins it to
            // the limb, where it belongs, and lets it die on the terminator.
            strength: 0.30,
            power: 4.6,
            // Clear of the surface's own limb term, which was drawing a hard gold
            // arc where the two shells met inside the silhouette.
            cloudRatio: 1.038,
            // A hair above the generator's calibrated 0.032. At map zoom a world
            // is seventy pixels across and the night hemisphere falling to pure
            // black flattens it into a lit crescent pasted on the plate; this is
            // the smallest lift that keeps the sphere reading as a SPHERE while
            // the terminator is still the dominant read.
            ambient: 0.052
        });
        /**
         * 0.44, NOT 0.66 — AND THE SPAR BELOW.
         *
         * At 0.66 with a radius up to 0.50 the sphere projected clear of its own
         * tile at this camera: sector 9's world hung over the unexplored hex
         * above it and sector 25's crossed onto the tile beyond while its own
         * plaque sat at the bottom of the plate, so body and label were not
         * staged as one object. A world overlapping a neutral tile is also an
         * ownership lie — the eye reads the sphere as belonging to whatever it
         * overlaps. The lift is now small enough that the widest body (0.50) at
         * this pitch stays inside the hex's own silhouette.
         */
        world.position.y = 0.44;
        group.add(world);
        group.userData.world = world;

        /**
         * NO MOUNTING SPAR, DELIBERATELY.
         *
         * One was tried here — a short tapered post from the deck to the
         * underside of the sphere, to say the body BELONGS to the plate rather
         * than merely hovering near it. At this lift it is geometry that cannot
         * be seen: a class-5 world's underside sits at y = 0.10 against a deck
         * at 0.07, so the post is three hundredths of a unit tall and entirely
         * swallowed by the body above it; the homeworld's underside is below the
         * deck outright. What actually grounds the worlds is the pair of things
         * around this line — the lift itself, which now puts every body's lower
         * limb into the plate, and the contact shadow below, tightened and
         * darkened to match. Invisible geometry is not a fix, it is weight.
         */

        /**
         * A CONTACT SHADOW, PROJECTED ALONG THE KEY.
         *
         * The worlds had none: what sat under them was a symmetrical additive
         * glow pool, so a body on a strongly key-lit deck threw no directional
         * shadow at all and read as a sticker layered on the tile. This is the
         * body's own shadow, offset along the projected direction of the
         * DirectionalLight and squashed by its elevation — an ellipse trailing
         * away from the light, exactly as the belt's anchor rocks now cast.
         */
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
        // Major axis along the light's ground bearing; a rotation of phi about
        // +Y sends the quad's local +X to (cos phi, 0, -sin phi), so phi is
        // atan2(-L.z, L.x). The minor axis is the elevation squash.
        // Tight. At 4.2 x 2.6 the decal was wider than the tile it sat on, so
        // its falloff dimmed the whole plate evenly instead of drawing an
        // ellipse — a shadow you cannot find the edge of is not a shadow.
        // 2.35 x 1.5, not 2.8 x 1.75: the body sits lower now, and a shadow's
        // size is a function of how far the caster is from the surface. A tight,
        // dark ellipse under a low body is what grounds it; a wide faint one is
        // the "cannot find the edge of it" failure with the sign flipped.
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

    /**
     * A black hole is instant fleet death, so it has to be the most unmistakable
     * object on the board: an event horizon that eats the starfield behind it, a
     * Doppler-brightened accretion disc, and a photon ring that survives being
     * looked at from any angle because it is billboarded.
     */
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

    /**
     * Accretion disc. Painted per-pixel because the three things that make it
     * read — a temperature ramp from the ISCO outward, angular shear streaks,
     * and relativistic beaming that brightens the approaching limb — are all
     * functions of (r, theta) and none of them are expressible as a gradient.
     */
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
     * An asteroid belt, not a decorative ring of grey lumps.
     *
     * Three things were wrong with the old one and all three are fixed here:
     * the rocks were dodecahedra (six flat facets, hexagonal silhouette), they
     * were untextured, and they were spaced at exactly 2*pi/11 which reads as a
     * clock face. These are subdivided, noise-displaced hulls with cratered
     * albedo and derived normals, scattered by a clustered belt model, drawn as
     * three InstancedMeshes so a field of eighteen rocks costs three draw calls.
     */
    /** One rock material per variant, kept for the life of the page. */
    function rockMaterial(variant) {
        const key = `rock:${variant}`;
        if (!state.materials.has(key)) {
            const v = Math.abs(Number(variant) || 0) % 6;
            const mat = createAsteroidMaterial(variant, {
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
            });
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

    /**
     * How far the plate's own surface extends along a bearing.
     *
     * A belt was clamped to a CIRCLE of 0.76 while the plate is a HEXAGON whose
     * inradius is 0.814 and whose tray stops short of that — so along the six
     * flat edges the rocks were outside the tile, hanging over black space, and
     * "which cell is the hazard" stopped being answerable. For a flat-top hex the
     * boundary along theta is the inradius over the cosine of the angle to the
     * nearest edge normal (normals sit every 60 degrees starting at 30).
     */
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

        const GROUPS = 3;
        const PER_GROUP = 9;
        for (let g = 0; g < GROUPS; g++) {
            const variant = (Number(entry.id) + g * 2) % ASTEROID_VARIANTS;
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

    /**
     * A real star: granulated limb-darkened photosphere, corona with streamers,
     * and a wide glare veil, all from the shared generator. The photosphere is
     * authored well above white so the bloom pass has something to find — that
     * is the difference between a light source and an orange circle.
     */
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

    /**
     * The inner corona, as a limb-hugging RING rather than a disc.
     *
     * This is the thing that stops a star having the hardest edge in the frame.
     * A photosphere sphere ends at its silhouette in one pixel no matter how it
     * is shaded; the only way the transition becomes gradual is if there is
     * light OUTSIDE the disc, brightest exactly at the limb and falling away
     * over a couple of radii. Peaks at 1/3 of the sprite's half-width, which is
     * where the disc's edge is placed.
     */
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
            /**
             * A FILAMENT HAS A ROOT AND A TIP. IT IS NOT A STROKED ARC.
             *
             * These were three ctx.arc strokes at constant lineWidth, which is
             * geometrically a circle of uniform thickness — and that is exactly
             * what they read as in the shipped frame: thin concentric rings
             * around the disc at four and eight o'clock, indistinguishable from
             * a debug overlay or a lens artefact. A prominence is thick and
             * bright where it leaves the photosphere and dissipates over the
             * apex, and it wanders. Each loop is therefore built as a FILLED
             * ribbon sampled along the arc, with a width that is fat at both
             * feet and pinched over the top, and a radius that wobbles.
             */
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

    function buildStar(rgbColour, radius, entry) {
        const group = new THREE.Group();
        /**
         * THE EXPOSURE IS SPLIT, which is the whole rework.
         *
         * At intensity 2.2 the photosphere clipped to near-white across ~80% of
         * the disc: the granulation the material computes was still being
         * computed and was simply invisible, so the brightest, highest-attention
         * pixel cluster in the frame carried the LEAST information — a flat
         * white circle with a crisp, stair-stepped edge. A star must have the
         * softest edge in the frame and this one had the hardest.
         *
         * So the shell is authored at 1.3, where ACES still resolves the
         * granulation and the limb-darkening law, and the blow-out is moved to a
         * separate core sprite covering only the inner third of the disc. The
         * bloom pass then blooms a SHAPE — a bright nucleus inside a structured
         * disc — instead of smearing a flat clipped plate. The silhouette is
         * dissolved by the limb halo below, so there is no geometric edge left
         * for the rasteriser to alias.
         */
        const star = createStarObject({
            radius,
            rgb: rgbColour,
            seed: 1337 + (Number(entry.id) || 0),
            // 0.72. This is the number the whole split-exposure idea turns on:
            // ACES maps it to roughly sRGB 0.83 at disc centre and 0.63 at the
            // limb, which is the only window in which the material's granulation
            // and its limb-darkening law are both VISIBLE. Anything above about
            // 1.1 and the disc clips flat again, which is the defect.
            intensity: 0.72,
            opacity: 0.9,
            bloomOpacity: 0.26,
            spin: 0.05
        });
        /**
         * THE BODY AND ITS LIGHT HAVE TO LAND IN THE SAME PLACE.
         *
         * It was 0.94, which at the rig's 61-degree pitch threw the photosphere
         * nearly half a tile UP-SCREEN of the deck it is supposed to be sitting
         * on: the star hung over the corner of sector 23 and spilled onto its
         * neighbour, while the sunburst decal painted into the plate and the
         * additive pool both converged on the plate CENTRE. Two unrelated
         * objects, a full star-radius apart.
         *
         * The height that produced it is vestigial. The comment justifying it
         * cited glare sprites being sliced by neighbouring plate rims — and the
         * fix for that was depthTest:false on the glare layers, which is right
         * here and does the job on its own. 0.50 keeps the sphere entirely clear
         * of the deck (bottom of the disc at 0.17 against a plate top of 0.07)
         * while cutting the screen-space displacement by more than half, and
         * what is left is cancelled by offsetting the pool below.
         */
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
            // Rooted ON the limb. The loop is painted along the texture's bottom
            // edge, so the sprite's centre sits half its own height outboard of
            // the disc and the material rotation turns that edge to face inward:
            // rotating by (a - PI/2) sends the sprite's local down to -(cos a,
            // sin a), which is the direction of the star's centre.
            // Standing OFF the limb, not lying across the disc. At 0.94 the
            // loop's inner half sat inside the photosphere's silhouette, where a
            // nested pair of arcs over a bright disc reads as concentric debug
            // circles rather than as plasma leaving the surface.
            const reach = radius * 1.04 + s * 0.46;
            prom.position.set(Math.cos(a) * reach, star.position.y + Math.sin(a) * reach, 0.02);
            prom.material.rotation = a - Math.PI / 2;
            prom.renderOrder = 3;
            group.add(prom);
            proms.push(prom);
        }
        group.userData.nearOnly = proms;

        /**
         * The star lights its own plate — the one place a tile gets a colour it
         * did not choose, and it is diegetic: it is the sun. Wide and weak, so
         * the plate gets a FALLOFF away from the body rather than a flat lift.
         *
         * IT IS OFFSET, AND IT IS CLIPPED TO THE TILE.
         *
         * The pool sat at the tile's own centre while the body sat 0.87 units
         * above it, and at this camera those are not the same place on screen —
         * so the light pooled where the star was NOT. It is now pushed along the
         * view ray by exactly the amount the body is displaced, which lands it
         * directly under the photosphere. And it was scaled to 1.3 of the tile,
         * i.e. spilling onto sector 9; at 0.68, plus the offset, the whole decal
         * is inside its own hexagon by construction (0.55 + 0.23 < the 0.81
         * inradius), so a star can no longer light a sector it is not in.
         */
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

    // ------------------------------------------------------------------
    // Detail level
    //
    // A world framed for the whole galaxy is about seventy pixels across. At
    // that size its cloud shell and its atmosphere shell are two extra passes
    // of a heavy shader over a sphere whose weather nobody can resolve, and
    // measured on a software rasteriser they were most of the frame. So the
    // shells switch off below a screen size where they contribute anything, and
    // the belts thin out to their anchor rocks. Nothing that carries gameplay
    // signal — class hue, ownership tint, the halo, the badge, the number — is
    // ever a casualty of this; it only ever removes detail the pixel grid
    // cannot show.
    // ------------------------------------------------------------------

    /**
     * Screen pixels per world unit at the camera's current distance. The canvas
     * height comes from the cached value resize() records rather than from
     * getBoundingClientRect: this is called every frame, and a layout read in
     * the frame loop stalls the main thread on every style change the HUD makes.
     */
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
        /**
         * THE CLOUD SHELL IS NOT AN LOD CASUALTY. IT IS THE READ.
         *
         * It used to switch off below SHELL_DETAIL_PX on the reasoning that
         * "clouds are weather nobody can resolve at map zoom" — and what that
         * left was a bare surface at seventy pixels with no broad light/dark
         * structure at all: sectors 24 and 25 came back as out-of-focus orange
         * mush and sector 9 as a green-teal blur. The cloud band is the single
         * highest-contrast BROAD-SCALE feature a world has, and broad-scale
         * value contrast is exactly what makes a small sphere read as a sphere.
         * Removing it did not save detail, it removed the subject.
         *
         * It stays on at every zoom, on every renderer. The measurement that
         * originally justified dropping it was taken when a dozen worlds were
         * spinning their atmosphere shells as well; a handful of explored tiles
         * carrying one extra 70px sphere each is not where this frame's budget
         * goes, and the quality governor already has coarser levers (the bloom
         * pass, the backing-store ratio) for the machines that need them.
         */
        const world = content.userData.world;
        if (world && world.userData.clouds) world.userData.clouds.visible = true;
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

    function rebuildContent(entry) {
        disposeContent(entry);
        const known = entry.status !== STATUS.UNKNOWN || entry.explored;
        if (!known) return;

        let content = null;
        if (entry.status === STATUS.BLACKHOLE || entry.type === 2) {
            content = buildBlackHole(entry);
        } else if (entry.type === 1) {
            content = buildAsteroids(entry);
        } else if (entry.type === 3) {
            content = buildStar([255, 148, 72], 0.33, entry);
        } else if (entry.type === 4) {
            content = buildStar([255, 108, 44], 0.27, entry);
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

    /**
     * Shared per (status, live, hover). 112 tiles used to mean 112 unique
     * materials; there are at most about thirty distinct looks on the board and
     * sharing them keeps uniform churn down.
     *
     * PHONG, NOT STANDARD, and that is a measured decision rather than a
     * stylistic one. The plates cover essentially the whole viewport at every
     * zoom, so they are the largest fill cost in the scene by a wide margin, and
     * a metal-dominant MeshStandardMaterial pays a full GGX evaluation plus a
     * prefiltered-environment lookup on every one of those fragments. Blinn-Phong
     * with a normal map, a tight specular and one flat environment sample gives
     * the same chamfer highlight — the whole point of the bevel — for a fraction
     * of the per-pixel cost. It is also, not coincidentally, the exact lighting
     * model the era this board is styled after actually used.
     */
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
        const plate = state.plateMaps;
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
            // EMISSIVE THROUGH THE ALBEDO, not over it. An untextured constant
            // emissive is a flat flood across the whole face, and on a
            // high-chroma swatch it dominated the map and washed the brushed
            // grain, the stencilled ticks, the tray inset and the rivets out —
            // the two most saturated plates on the board were the two that read
            // as flat coloured polygons, which is exactly backwards. Modulated by
            // the same relief the albedo uses, it lifts the metal instead of
            // painting over it, and it can then be a quarter as strong.
            emissiveMap: toned ? plateVariantMap(toned.stencil) : plate.map,
            emissive: empty ? new THREE.Color(0x3c4762) : colour,
            // 0.30 rather than the old 0.34 looks like a small change and is not:
            // it is now MULTIPLIED by an albedo whose mean is about 0.18 in
            // linear light, so the emissive term went from half the plate's value
            // to about a seventh of it — and what is left of it follows the frame
            // lip, the rivets and the grain instead of flooding over them.
            emissiveIntensity: 0.30 * (live ? 1 : 0.72) * (toned ? 0.82 : 1) + (hovered ? 0.35 : 0),
            /**
             * THE SPECULAR MODEL IS WHAT MAKES THIS METAL OR WOOD.
             *
             * A Blinn-Phong exponent of 34 is a BROAD lobe: the highlight spreads
             * over most of a facet as a soft diffuse wash. That is the response of
             * varnish, and paired with a stretched low-frequency albedo grain it is
             * exactly why the board was read as stained pine and sanded birch.
             * Steel has a TIGHT lobe — 220 collapses the highlight onto the chamfer
             * and the rivet crowns, which is precisely where a bevel needs to be
             * sold, and leaves the flat of the plate to the albedo.
             *
             * And a reflected term, which the previous revision removed on the
             * grounds that it desaturated the status tint. It does — at MIX weight.
             * ADD weight does not: an additive reflection only lifts where the
             * probe is bright, so the chamfer facing the key picks up the warm
             * lobe and the tint elsewhere is untouched. Metal without a reflected
             * term cannot read as metal, and this is a small enough share of the
             * plate's value that the swatch is still the swatch.
             */
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

    /**
     * Fog plates, in SIX variants.
     *
     * One shared material meant one shared uv transform, so all hundred-odd
     * unexplored tiles showed the identical haze pattern and neighbours matched
     * edge to edge — the unknown region read as one blotchy blanket instead of a
     * hundred separate unknown cells. Each variant clones the haze texture (the
     * image is uploaded once; only the transform differs) and gets its own
     * offset and rotation. The variant index is chosen so that both the
     * horizontal neighbour (id +/- 1) and the vertical one (id +/- width) always
     * land on a different pattern.
     */
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
        const haze = state.fogTexture.clone();
        haze.needsUpdate = true;
        haze.center.set(0.5, 0.5);
        haze.rotation = (index / FOG_VARIANTS) * Math.PI * 2 + 0.4;
        haze.repeat.set(1.13 + index * 0.07, 1.07 + index * 0.05);
        haze.__shared = true;
        haze.__baseOffset = { x: hash2(index, 5, 91), y: hash2(index, 9, 137) };
        const mat = new THREE.MeshPhongMaterial({
            // NO PLATE MAP. Not a tuning choice — the whole point of the fog cell
            // is that no instrument has been installed in it, so it carries no
            // rivets, no frame, no tray and no scribe. The socket's six facets and
            // the haze in the bottom of it are the entire image.
            //
            // Measured, the previous fog plate sat at L*42-48 against a charted
            // plate's L*61-74: a 1.3:1 step, less separation than the gap between
            // two tiles. This lands near L*22, so the step is close to 3:1 and
            // "we have surveyed this" is the loudest thing the board says.
            // Measured, not guessed: with the plate map gone the colour IS the
            // albedo, where before it was multiplied by a map averaging 0.32 —
            // so the same hex would have come out three stops BRIGHTER. Sampled
            // off the previous build, a fog plate read L*21 against a charted
            // steel plate at L*39; this lands fog near L*14, which is the ~3:1
            // step the read needs while staying clear of black.
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
        /**
         * THE UNEXPLORED FIELD HAS TO RECEDE.
         *
         * It is the single largest surface in the frame and it was lit flat: a
         * cell at the top of the picture measured the same value as one at the
         * bottom, so half the viewport was wallpaper and the charted cluster had
         * nothing to be the subject OF. The scene's FogExp2 cannot do this job
         * here — its colour (0x0c1424) is within a couple of levels of the fog
         * cell's own albedo, so mixing toward it is very nearly a no-op.
         *
         * This is a straight view-depth falloff on the fog cell and NOTHING
         * else: the plates keep the atmospheric perspective they already have,
         * and no other material in the scene is touched. The range is driven off
         * the camera's own distance every frame so it survives the zoom wheel
         * instead of switching off at the closeup framing.
         */
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

    /**
     * Roughly how light the finished plate is, 0..1. Used to decide whether the
     * sector number should be painted light-on-dark or dark-on-light: on the gold
     * homeworld plate the white glyphs were the lowest-contrast text on the
     * board, which is the one tile you can least afford not to be able to name.
     */
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

    /**
     * A STAMPED STEEL TAB, not a hologram pill.
     *
     * The old badge was a translucent roundRect with a 4px accent stroke — the
     * banned look — and it sat on top of the planet's northern hemisphere. This
     * is a bolted plate in the same palette as the tiles: a dark groove under a
     * bright top lip, a rivet at each end, and mono glyphs stencilled into it.
     */
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
                /**
                 * IT MAY NOT BE EATEN BY THE THING IT ANNOTATES.
                 *
                 * A Sprite depth-tests at its CENTRE, so a tab that overlaps the
                 * world's screen disc is either wholly in front of it or wholly
                 * behind it — and with the worlds now seated lower and wider on
                 * their plates, the near-right corner where this sits is inside
                 * that disc for every colonised tile. It came back half a tab
                 * with the count hidden behind a planet.
                 *
                 * "Is there a fleet in this sector" is a first-class strategy
                 * read and this is an annotation on a tile, not an object in the
                 * scene, so it composites over. The ID plaque keeps depth
                 * testing because it is a decal lying ON the deck and a rock
                 * standing in front of it genuinely should occlude it; a bolted
                 * tab standing above the deck is a different thing.
                 */
                depthTest: false,
                toneMapped: false
            }));
            // ON THE PLATE'S NEAR-RIGHT FRAME, clear of the globe's silhouette
            // and — the part that was wrong — INSIDE the tile's own hexagon. The
            // old placement put the tab's right edge at x=0.63 with a half-width
            // of 0.21, which at this camera angle hung the corner off the rim
            // over the gutter toward the next sector. The anchor is now derived
            // from the hexagon's reach along its own bearing, so the whole
            // footprint is on the plate by construction.
            // 30 degrees: the bearing of a hex EDGE NORMAL, so the tab sits
            // square on the near-right flat rather than crowding a vertex, and
            // clear of the sector nameplate now lying on the tile's lower edge.
            /**
             * BIG ENOUGH TO BE A READ, NOT A DECORATION.
             *
             * It shipped at 0.40 x 0.165, which is about 40 x 16 screen pixels
             * at the map framing — small enough that all the emboss, bolt and
             * stencil work painted into the texture above degenerated into one
             * flat grey chip, and small enough that "is there a fleet in this
             * sector" could not be answered without zooming. This is the same
             * artwork at 1.6x, landing near 26px tall, which is where the tab's
             * own bevel starts to resolve. The aspect matches the 256x112 canvas
             * so nothing is stretched.
             *
             * The anchor keeps the OUTER edge where it was — on the plate's
             * near-right flat, inside the tile's own hexagon by construction —
             * so the tab grows inboard. It has to stay clear of the world's
             * silhouette as well as the rim: a Sprite depth-tests at its centre,
             * so the centre is placed outside the largest body's sphere (0.50)
             * and on the camera side of it, and the whole tab then composites in
             * front of the globe instead of being sliced by it.
             */
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

    /**
     * THE SECTOR CODE, AS AN INSTALLED NAMEPLATE.
     *
     * It used to be a camera-facing Sprite with depthTest OFF and a 6px outline:
     * guaranteed legible, by the cheapest possible means, and with two visible
     * costs. It floated above a tilted board instead of lying on it, which is
     * the opposite of "stencilled codes, framed instruments"; and with depth
     * testing disabled the '11' punched straight through an asteroid that was
     * plainly in front of it — a depth-sorting error the player can see.
     *
     * This is a perspective-correct decal lying on the plate: a recessed
     * nameplate with an emboss lip at the tile's lower edge, with the code
     * stencilled into it. The camera looks down at ~61 degrees, so a horizontal
     * plane is foreshortened by only 12% — the glyphs stay as readable as they
     * were, but they now belong to the tile.
     *
     * The tray is deliberately SEMI-TRANSPARENT so the plate's status tint still
     * reads through it, which is why the polarity flip below is still needed and
     * still measured off the finished plate.
     */
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
        state.starSectors = [];

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
                type: null,
                flags: 0,
                indicator: '',
                fleetSize: 0
            });
        }

        if (!state.starsBuilt) {
            buildBackdrop();
            state.starsBuilt = true;
        }

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
        if (changedStatus || changedType || !entry.content) {
            rebuildContent(entry);
        }
    }

    // ------------------------------------------------------------------
    // Fleet movement
    //
    // The old tracer was a coloured ball with a glow sprite sliding between two
    // tiles. This is a formation of darts under way: they point where they are
    // going, they bank into the turn, their engines run hot enough to bloom,
    // and they drag a tapered ribbon behind them so the eye can read the path
    // after the ships have passed.
    // ------------------------------------------------------------------

    const TRAIL_SEGMENTS = 26;
    /** Cruising height, in hex units above the plate. Clears the largest world. */
    const FLEET_ALTITUDE = 1.25;
    // The plume's footprint, in hull-scale units. See the note where the plume
    // mesh is built: the ship has to win the silhouette, so the thrust is
    // shorter than the hull and narrower than it, and the alpha in the plume
    // texture pulls the visible column in tighter still.
    const PLUME_WIDTH = 0.34;
    const PLUME_LENGTH = 0.62;

    /**
     * A slender six-sided dart, nose along +Z.
     *
     * Four sides and a wide base gave a hull that, seen nose-on — which is what
     * happens every time a fleet flies down the screen toward the camera —
     * silhouetted as a big flat triangle rather than a ship. Six sides and a
     * much longer taper keep a readable silhouette from any bearing.
     */
    /**
     * Concatenate non-indexed geometries into one buffer: one draw, one object.
     *
     * Built from three.js primitives rather than hand-wound triangles, and
     * deliberately so — a hand-built beveled slab whose top face came out wound
     * clockwise was silently back-face culled and the selection marker rendered
     * as four bent wires with a bead on each end. Primitives arrive with correct
     * outward normals and consistent winding; merging preserves both.
     */
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

    /**
     * A HULL WITH A SILHOUETTE: a long fuselage flanked by two offset nacelles,
     * nose along +Z.
     *
     * One squashed six-sided cone has no outline to read at map zoom — at eight
     * or ten pixels it is a smear, and with an engine plume authored at twice its
     * size it disappeared into its own glare entirely. Three separated masses
     * give the eye a shape to resolve at exactly that size: a spine with two
     * things sticking out behind it is a SHIP, in a way that a triangle is not.
     */
    /**
     * UV LAYOUT FOR THE HULL.
     *
     * The cylinders get their natural wrap (u around the hull, v along it) so a
     * longitudinal panel seam is a vertical line in the image and a frame band
     * is a horizontal one. After `rotateX(PI/2)` a cylinder's cross-section sits
     * in world XY with theta=0 pointing at -Y, so u=0 (and u=1) is the VENTRAL
     * keel and u=0.5 is the DORSAL spine. That is what lets a single 1-D ramp
     * along u carry "dark belly, bright back" and "matte flanks, polished spine".
     *
     * The boxes (wings, fin, greebles) would otherwise stretch the whole image —
     * including the hull code — across each 8-pixel face, so their UVs are
     * remapped into PLAIN_UV: a small patch of anonymous panelling.
     */
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

    /**
     * THE PLUME IS AN IMAGE, NOT A SOLID.
     *
     * It used to be a CylinderGeometry drawn additively at a fixed opacity, and
     * a solid rendered at a fixed opacity has one unavoidable property: THE
     * GEOMETRY EDGE IS THE VISUAL EDGE. What crossed the board was a hard-edged,
     * uniformly-filled triangle with a dead-straight silhouette, a hard cut at
     * the tail, wider than the hull it was bolted to and half again its length —
     * a vector arrowhead sliding over a diagram. No amount of tuning the opacity
     * fixes that, because the failure is the shape of the primitive.
     *
     * This is three quads through the plume's own axis at 60-degree intervals,
     * carrying a painted plume in their alpha. The falloff — radial to nothing
     * at the edge, axial to nothing at the tail, and a hot throat that cools
     * along its length — is in the texture, so the plume HAS NO SILHOUETTE OF
     * ITS OWN: it ends where the alpha ends. The crossed planes are what give it
     * a body from any bearing, and their overlap in the middle is what makes the
     * core hotter than the skirt for free.
     *
     * Local frame: throat at the origin, tail at -Z, so it bolts straight onto
     * the nozzle the hull geometry already has.
     */
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

    /**
     * The painted plume: a hot near-white throat cooling through the fleet's own
     * colour to nothing at the tail, with a soft radial falloff across it.
     *
     * The HUE RAMP IS IN THE TEXTURE, not in the material colour, because a
     * greyscale map multiplied by one tint can only ever be that tint at every
     * value — which is how the old plume ended up as a flat sheet of one colour
     * with no thermal structure in it. The material then applies a neutral gain
     * to lift the throat over the bloom threshold without touching the ramp.
     */
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

    /**
     * THE HULL MAPS: albedo, normal, roughness and emissive, painted once.
     *
     * The previous ship was a bare MeshStandardMaterial in salmon
     * (0xa8807e, metalness 0.25, roughness 0.62) with no maps at all, so the
     * merged primitives rendered as raw shaded polygons — three flat wedges. No
     * amount of geometry fixes that; a hull reads as a hull because light
     * travels differently along its length than across it, and that requires a
     * roughness map. All four are greyscale/derived from one painted plate, in
     * the same canvas pipeline as the deck plates.
     */
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

        /**
         * EMISSIVE: RUNNING LIGHTS ONLY, and that restraint is load-bearing.
         *
         * The fuselage and the nacelles sample the FULL 0..1 UV range, so every
         * bright region anywhere in this image lands somewhere on the main hull.
         * A first pass painted a canopy strip and a nozzle-throat block into the
         * patches those small parts were remapped into — and the fuselage picked
         * both up as large glowing rectangles, which with a faction emissive of
         * (1.9, 0.34, 0.26) turned the whole ship salmon-pink again: exactly the
         * defect the steel albedo was introduced to kill.
         *
         * So the only thing in here is a run of small formation lights down each
         * flank. They are dots at hull scale, they carry the faction colour, and
         * nothing on the map can mistake them for the hull's own value.
         */
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
        /**
         * ONE STEEL FOR BOTH FLEETS.
         *
         * The old hull was 0xa8807e — a salmon that appears nowhere in the
         * briefed steel-and-bronze palette and read as a debug proxy colour. Who
         * a fleet belongs to is now carried entirely by the RUNNING LIGHTS and
         * the plume, which is both how warships are actually identified and the
         * only channel that still works when the hull is eight pixels across and
         * silhouetted against a bright plate.
         *
         * Metalness stays low. At 0.7 with a probe and a key at 2.4 the hull
         * clipped to white and the ship became flat spikes; a painted warship is
         * not a mirror. The form now comes from the roughness map, which is
         * where it should have come from all along.
         */
        const mat = new THREE.MeshStandardMaterial({
            // The briefed steel, lifted a little: at 0x6a7078 against deep space,
            // with the albedo map's own mid-grey multiplying through it, the hull
            // silhouetted almost black and the panel work was invisible. Same
            // hue, one stop up.
            //
            // OWNERSHIP IS A VALUE STEP NOW, not a hue. Your hulls are bright
            // steel and read as the friendly, well-kept fleet; theirs are the
            // same steel two stops down and read as a dark shape coming at you.
            // Paired with the warm-vs-red plume that is two independent channels
            // for the same fact, which is what a colour-blind player needs and
            // what the old cyan-vs-salmon pair never gave.
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

    /**
     * The ribbon has THREE vertices per rib — left edge, spine, right edge —
     * not two. With two, the strip has a hard boundary across its width and a
     * fleet flying toward the camera renders as a solid translucent wedge; with
     * a dark left and right and a hot spine the cross-section falls off and it
     * reads as a streak of light at every angle.
     */
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
            // TO ZERO, not to 35%. A double-sided additive strip held at a third
            // of its width while its tangent points at the camera does not
            // dissolve — it renders as hard-edged pale slivers, and in the
            // captured frame three of them lay across a sector plate with one
            // cutting straight through the '1' of its number. A smoothstep takes
            // the ribbon to nothing as it turns edge-on, and the material opacity
            // (below) rides the same factor, so a fleet flying at the viewer
            // fades out instead of shattering.
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

    /**
     * The minimum angle, in radians, between a fleet's ground track and the
     * camera's own ground axis. Below this the hull is presented END-ON and a
     * dart seen down its own axis is a featureless truncated cone with two
     * collars — which is exactly what parked over sector 10's ID plaque and
     * erased the number.
     */
    const MIN_TRACK_YAW = 0.58;   // ~33 degrees

    const _headTmp = new THREE.Vector3();
    const _covA = new THREE.Vector3();
    const _covB = new THREE.Vector3();
    const _covC = new THREE.Vector3();

    /**
     * How much of a guarded sector's ID plaque this fleet is currently sitting
     * on, 0..1, in SCREEN space.
     *
     * THE SECTOR NUMBER IS UNINTERRUPTIBLE. Crabbing the hulls (see
     * readableHeading) stops them presenting end-on, but it cannot help with the
     * geometry of a move that runs toward the viewer: the plaque lies on the
     * tile's NEAR edge, so a fleet leaving that tile toward the camera passes
     * directly over its own sector code about a third of the way through the
     * crossing. Measured on the shipped frame, the '10' was gone entirely and
     * the plaque well was empty — the game's own animation deleting a
     * first-class strategy read.
     *
     * Only the two sectors the crossing touches are ever tested, so this is two
     * projections a frame. The alternative — depthTest:false on the plaque —
     * would put the number back through any asteroid standing in front of it,
     * which is a defect this file has already fixed once.
     */
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

    /**
     * A heading vector for the darts to face: the true ground track, CRABBED
     * away from the camera axis when the track runs straight at or away from
     * the viewer.
     *
     * The rig never rotates and its ground axis is +/-Z (VIEW_DIR.x is zero), so
     * "straight at the camera" is a fixed test, not a per-frame projection. Any
     * move between vertically-adjacent sectors is exactly that case, which is
     * most moves — so without this the common case is the unreadable one. The
     * ships still FLY the true path; they simply hold a banked attitude across
     * it, the way anything with a lifting surface approaches. What it buys is a
     * silhouette that stays a ship at every moment of the crossing.
     */
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
        /**
         * NEITHER FLEET IS CYAN.
         *
         * Friendly was [0.16, 1.05, 1.35] and its route ribbon [126, 226, 244];
         * measured on the shipped frame the pad plume peaked at RGB(179,224,228)
         * — the most saturated, coolest pixel anywhere in the view, dominating
         * the homeworld tile. The brief is steel and amber/bronze, WarCraft II /
         * StarCraft I industrial, explicitly NOT the sleek cool holographic
         * default; the comment that used to sit here rejected pink on exactly
         * that ground while shipping saturated cyan two lines further down.
         *
         * So ownership is carried by VALUE AND SHAPE, which is both how warships
         * are actually told apart and the only channel that still works for a
         * colour-blind player: friendly hulls are bright steel throwing a warm
         * amber plume, hostile hulls are dark steel throwing a deep red one. The
         * cool accent is reserved for the selection ring, where it is functional.
         *
         * These are the LINEAR gains applied to the painted plume ramp and the
         * nozzle glare; they sit just over white so the bloom pass finds the
         * throat, and no higher — a plume authored at 3x swallows the hull.
         */
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
            /**
             * THE PLUME IS A CONE OUT OF THE NOZZLE, NOT A BALL BEHIND THE SHIP.
             *
             * The old engine was a camera-facing glow sprite 1.1 hull-widths
             * across, parked a full hull-length aft of the dart's origin — so
             * what crossed the board was a bright orb with two dark slivers
             * trailing below-left of it, reading as two unrelated sprites rather
             * than one mass under way. This is a tapered cone rooted at the
             * nozzle the hull geometry actually has (z = -0.492 in hull units,
             * see buildDartGeometry), hot at the throat and transparent at the
             * tail, so the thrust is attached to the thing producing it.
             */
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

        /**
         * DEPARTURE GLARE, ON THE DECK.
         *
         * This was a camera-facing sprite positioned at `start` — and `start`
         * has already been lifted to FLEET_ALTITUDE, so the flash the comment
         * called "on the origin plate" actually rendered at cruising height with
         * no hull attached to it: a bright orb floating on the trail while the
         * ship sat well below-left of it, reading as two unrelated sprites
         * rather than one mass under way. It is now a DECAL lying flat on the
         * origin plate, like the `wash`, so it reads as engine light washing the
         * deck at launch.
         */
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
            rebuildContent(entry);
        }
        setSelected(sectorData.id);
    }

    function setSelected(sectorId) {
        state.selectedSector = Number(sectorId);
        const entry = state.sectors.get(state.selectedSector);
        if (!entry || !state.selectionRing) return;
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

    /**
     * Work out how far to slide the rendered world so the camera target appears in the
     * middle of the un-occluded band rather than the middle of the canvas. The camera
     * looks along -Z with a fixed downward tilt, so screen-right is world +X and
     * screen-down is world +Z, stretched by the tilt.
     */
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
        updateFrameOffset();
    }

    // ------------------------------------------------------------------
    // Scene bootstrap & interaction
    // ------------------------------------------------------------------

    /**
     * True when WebGL is being serviced by a CPU rasteriser (SwiftShader,
     * llvmpipe, Mesa's software path). Those have no fill rate to speak of, and
     * asking one for a HiDPI backing store on a view that is always on screen is
     * how a map ends up at four frames a second — at which point the quality
     * governor starts amputating passes and the frame loses its anti-aliasing,
     * which is the one thing a software rasteriser was never the bottleneck for.
     */
    function isSoftwareRenderer(renderer) {
        try {
            const gl = renderer.getContext();
            const info = gl.getExtension('WEBGL_debug_renderer_info');
            const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
            return /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(name);
        } catch (err) {
            return false;
        }
    }

    function buildComposer(renderer, w, h) {
        try {
            /**
             * MSAA ON THE SCENE TARGET.
             *
             * With a composer the canvas only ever receives a fullscreen quad, so
             * `antialias: true` on the renderer does nothing — every silhouette in
             * the scene was rasterised with no coverage sampling at all, and FXAA
             * at the end of the chain is a post-hoc edge blur that cannot
             * reconstruct a stair-stepped one-pixel circle. That is why the star's
             * disc, the plate chamfers and the planet limbs all came back visibly
             * jagged. Allocating the composer's own target with samples: 4 puts
             * real coverage sampling back where the geometry is drawn; FXAA stays
             * on afterwards for the shader-aliasing FXAA is actually good at.
             *
             * EffectComposer clones whatever target it is given for its second
             * ping-pong buffer, and RenderPass/UnrealBloomPass both declare
             * needsSwap = false, so the buffer the scene lands in is covered.
             */
            const pr = renderer.getPixelRatio();
            const target = new THREE.WebGLRenderTarget(
                Math.max(2, Math.round(w * pr)), Math.max(2, Math.round(h * pr)), {
                    type: THREE.HalfFloatType,
                    // Never on a CPU rasteriser: a 4x multisampled half-float
                    // colour buffer at this size is ~60MB with a full resolve
                    // every frame, and measured on SwiftShader it took the map
                    // from interactive to unable to complete a screenshot. Those
                    // machines keep the supersampled backing store and FXAA
                    // instead, which is the same job done where they can afford
                    // it.
                    samples: (renderer.capabilities.isWebGL2 && !state.software) ? 4 : 0
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
            // UnrealBloomPass is five mip levels of separable blur — on the order of
            // a dozen fullscreen passes. A GPU absorbs that; a CPU rasteriser does
            // not, and it was the single largest term in the 302 ms frame measured
            // on SwiftShader. Software machines keep the scene, the tone map and
            // FXAA and lose only the glow, which is the right thing to lose when the
            // alternative is an unplayable board.
            if (!state.software) {
                composer.addPass(bloom);
                state.bloomPass = bloom;
            }

            composer.addPass(new OutputPass());

            // After OutputPass, because FXAA weights its edge test perceptually
            // and wants sRGB input. It runs on top of the MSAA above: MSAA fixes
            // geometric coverage, FXAA fixes the shader aliasing MSAA never sees
            // (specular sparkle on the chamfers, the star's granulation).
            const fxaa = new ShaderPass(FXAAShader);
            fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
            /**
             * THE OUTPUT DITHER, IN SCREEN SPACE.
             *
             * This is the last pass in the chain, so it is where the half-float
             * frame is quantised to the canvas's 8 bits — and the sky is a very
             * smooth gradient over a very small value range that ACES then
             * stretches, which is textbook contouring. A +/-1.5 level triangular
             * PDF (the sum of two uniforms) decorrelates the quantiser where a
             * uniform one leaves residual structure.
             *
             * It is spliced into FXAA rather than added as a pass of its own
             * because the correction is two lines of arithmetic and a whole
             * extra full-screen blit to carry them is not a trade worth making.
             * It also has to live HERE and nowhere else: the same dither
             * authored into the sky texture became the 15px lattice that made
             * the frame unshippable (see buildSkyTexture).
             */
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
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch (err) {
            console.warn('Galaxy3D: WebGL unavailable, keeping classic view.', err);
            return false;
        }

        state.container = container;
        state.renderer = renderer;
        // Capped at 1.5, not 2. The map fills the window and is drawn through
        // four full-screen post passes, so on a HiDPI laptop a ratio of 2 costs
        // 78% more fill than 1.5 for a difference the bloom pass softens away
        // anyway. Every pixel of that is spent on a view that is never off
        // screen, which is exactly where a frame budget goes to die.
        // A CPU rasteriser gets the SMALLEST backing store, not the largest.
        // Supersampling at 1.5 was chosen here as "the only anti-aliasing those
        // machines get once MSAA is refused" — but 1.5 is 2.25x the pixels, and
        // every one of them is shaded on the CPU, through a bloom chain that is
        // itself a dozen fullscreen passes. Measured on SwiftShader that combination
        // ran the map at 302 ms/frame (3 fps) against 17.9 ms (56 fps) before any of
        // this existed. Nothing is anti-aliased at 3 fps because nothing is playable
        // at 3 fps, so these machines take 1.0 and keep FXAA.
        state.software = isSoftwareRenderer(renderer);
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

        state.scene = new THREE.Scene();
        // Only ever seen if the sky dome fails to build; even then it should not
        // be a hole.
        state.scene.background = new THREE.Color(0x0a1020);
        /**
         * ATMOSPHERIC PERSPECTIVE.
         *
         * The board read as a Catan tray photographed from above because nothing
         * receded: far hex rows were the same size, the same value and the same
         * sharpness as near ones, so the frame had no depth cue of any kind.
         * Exponential fog tinted to the sky is the classical fix and the cheapest
         * one — it costs a per-fragment lerp on the plates, which are already the
         * largest fill in the scene, and nothing else. Density is set so the far
         * edge of a fourteen-wide grid loses about a fifth of its contrast: enough
         * to build depth, not enough to grey out gameplay signal.
         */
        state.scene.fog = new THREE.FogExp2(0x0c1424, 0.018);
        state.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 900);
        state.raycaster = new THREE.Raycaster();

        // The rig lights the PLATES and the ROCKS. Worlds and stars carry their
        // own light in-material, so this can be tuned for machined steel without
        // flattening a planet's terminator.
        // 0.5, not 0.34: every plate has facets turned away from both directional
        // lights, and at the old level those were crushed into the bottom fifth
        // of the value scale — the un-keyed side of the board had no image in it
        // at all. Ambient is the cheapest possible fill (no extra light loop) and
        // it is the term that sets the floor of the whole frame.
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

        // Reflection probe for the few remaining physically-shaded surfaces:
        // the belt rocks and the fleet hulls. Handing three.js the raw equirect
        // lets it build the prefiltered probe itself, and because the plates are
        // Phong the expensive image-based path is now paid over a few hundred
        // pixels of rock rather than the whole board.
        state.scene.environment = studioEnvTexture();

        state.plateMaps = buildPlateMaps();
        state.fogTexture = buildFogCloudTexture();

        state.sharedGeo.hex = buildHexPlateGeometry();
        state.sharedGeo.fogCells = [];
        for (let i = 0; i < FOG_CELL_VARIANTS; i++) state.sharedGeo.fogCells.push(buildFogCellGeometry(i));
        state.sharedGeo.sphere = new THREE.SphereGeometry(1, 24, 16);
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

        // Selection marker. Same corner array, same centre — there is no second
        // definition of the hexagon for it to disagree with — and the SAME plate
        // maps and the same key light as the tile it is bolted to.
        state.selectionRing = new THREE.Mesh(
            state.sharedGeo.selection,
            new THREE.MeshPhongMaterial({
                map: state.plateMaps.map,
                normalMap: state.plateMaps.normalMap,
                // MACHINED STEEL, NOT ABS. The old 0xa9b4c6 with a broad
                // 70-exponent lobe sat outside the steel palette entirely and
                // read as chalky moulded plastic; a mid grey under the same
                // tight specular the plates now use makes it obviously the same
                // material as the table, just a newer piece of it. The warm
                // emissive stays — that is the "this one is selected" signal and
                // it has to survive landing on a gold plate as well as a blue one.
                //
                // 0x6d7482, not 0x8f98a8, and the reflection halved. THE SECTOR
                // NUMBER MUST BE THE BRIGHTEST MARK ON ITS OWN TILE. Measured,
                // the brackets peaked at 204 luma against the numeral's 226 on
                // the map framing and beat it outright at the closeup — a piece
                // of furniture out-shouting the one label that carries gameplay.
                // The marker keeps its amber; what it loses is the white.
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

        const rect = container.getBoundingClientRect();
        state.composer = buildComposer(renderer, Math.max(1, rect.width), Math.max(1, rect.height));

        bindPointerEvents(renderer.domElement);
        window.addEventListener('resize', resize);
        document.body.classList.add('g3d-active');

        state.ready = true;
        resize();
        animate();
        return true;
    }

    function bindPointerEvents(dom) {
        dom.style.touchAction = 'none';

        dom.addEventListener('pointerdown', event => {
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
                handleHover(event);
            }
        });

        dom.addEventListener('pointerup', event => {
            const wasClick = state.drag && !state.drag.moved;
            state.drag = null;
            if (wasClick) handleClick(event);
        });

        dom.addEventListener('pointerleave', () => { state.drag = null; });

        dom.addEventListener('wheel', event => {
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
            return;
        }
        const dt = Math.min(state.clock.getDelta(), 0.05);
        const t = state.clock.elapsedTime;

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

        refreshDetail(false);

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
            /**
             * Where the unexplored field starts to recede, in view depth.
             *
             * MEASURED, NOT ASSUMED. The first attempt anchored this at
             * 0.94..1.34 of the camera's distance to its focus, on the reasoning
             * that "beyond the focus" is far — and the board does not work that
             * way. The rig looks DOWN at 61 degrees from behind, so the whole
             * grid lies between about 0.65 and 1.05 of that distance and every
             * single cell landed under the near clamp: the shader ran and did
             * exactly nothing, and the field measured flat to within 2%. The
             * band has to straddle the range the board actually occupies.
             *
             * Normalising by the rig's own distance is still what makes the
             * falloff hold its shape through the zoom wheel.
             */
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

                /**
                 * HEADING COMES FROM THE GROUND TRACK, NOT FROM THE ARC.
                 *
                 * The crossing lifts the formation by sin(progress * PI) * 0.5,
                 * so at both ends of the run the frame-to-frame delta is almost
                 * entirely VERTICAL — and pointing the hull along that put the
                 * darts nose-down, presented end-on to the camera. A dart seen
                 * down its own axis is a featureless truncated cone with two
                 * collars, which is what parked on top of sector 10's ID plaque
                 * and erased the number: the sector code is a first-class
                 * strategy read and the game's own move animation was destroying
                 * it. It also swung the nozzle upward, so the exhaust appeared to
                 * leave the NOSE and painted a false "fleet here" streak across
                 * the neighbouring tile.
                 *
                 * Damping the vertical component keeps the silhouette broadside
                 * for the whole crossing — the climb still reads, because the
                 * formation visibly rises, but it is never read down its axis.
                 * readableHeading() then handles the other half of the same
                 * problem: a track that runs straight at the camera.
                 */
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

                /**
                 * Trail history: newest at the head, oldest shifted off the tail.
                 *
                 * THE HEAD IS THE LEAD DART'S NOZZLE, not the formation's origin.
                 * Those are not the same point — the lead dart sits forward and
                 * above the group centre and the plume runs aft of that again —
                 * and the difference showed as a visible GAP between the streak
                 * and the ships, so the two read as unrelated objects sliding
                 * past each other rather than as one mass under way.
                 */
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

        if (state.composer) {
            state.composer.render(dt);
        } else {
            state.renderer.render(state.scene, state.camera);
        }
        governQuality(dt);
    }

    // ------------------------------------------------------------------
    // Quality floor.
    //
    // Bloom and FXAA are two full-screen passes. On any GPU of the last decade
    // they are free and this never fires. On a machine with no GPU at all —
    // a software rasteriser, a locked-down VM, an ancient integrated part — they
    // are most of the frame, and a map that is always on screen at four frames
    // a second is not a map. The thresholds are deliberately catastrophic
    // rather than merely slow: this is a last resort, not a quality dial, and
    // it never re-enables, because a chain that flickers on and off with the
    // camera is worse than either state.
    // ------------------------------------------------------------------
    const QUALITY_WINDOW = 45;
    // These were 180 ms / 450 ms — i.e. the composer was only ever abandoned below
    // 2.2 fps. A machine sitting at 3 fps therefore dropped FXAA and then kept the
    // full bloom chain forever, which is exactly what a SwiftShader run measured:
    // 302 ms a frame, sustained, with the governor "working". Unplayable is the
    // threshold that matters, not catastrophic. Degrade below ~22 fps and bail out
    // of post-processing entirely below ~12 fps; both are still far worse than any
    // hardware GPU produces, so nobody loses the glow who could afford it.
    const DROP_AA_MS = 45;       // under ~22fps sustained
    const DROP_BLOOM_MS = 80;    // under ~12fps sustained

    function governQuality(dt) {
        if (!state.composer || state.qualityStep >= 2) return;
        state.qualitySamples = (state.qualitySamples || 0) + 1;
        state.qualityTotal = (state.qualityTotal || 0) + dt * 1000;
        if (state.qualitySamples < QUALITY_WINDOW) return;
        const avg = state.qualityTotal / state.qualitySamples;
        state.qualitySamples = 0;
        state.qualityTotal = 0;
        const step = state.qualityStep || 0;
        if (step === 0 && avg > DROP_AA_MS && state.fxaaPass) {
            state.fxaaPass.enabled = false;
            state.qualityStep = 1;
            console.info('Galaxy3D: dropping FXAA — sustained frame time %dms', Math.round(avg));
        } else if (step >= 1 && avg > DROP_BLOOM_MS) {
            state.composer = null;
            state.qualityStep = 2;
            console.info('Galaxy3D: dropping post-processing — sustained frame time %dms', Math.round(avg));
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
        highlightSector,
        clearBattleSector,
        animateFleetMove,
        resize,
        /** True once the renderer exists AND a grid has been laid out. */
        isReady: () => Boolean(state.ready && state.gridBuilt),
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

    document.dispatchEvent(new CustomEvent('galaxy3d-ready'));
})();

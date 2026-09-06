/**
 * planet-texture.js — procedural surfaces for everything a sector can contain:
 * worlds, stars and asteroids.
 *
 * Shared by the galaxy map (galaxy3d.js) and the battle theater (battle3d.js).
 *
 * It grew past planets on purpose. A sector that holds a fully-shaded world next
 * to a flat-filled circle for its star and eleven untextured solids for its belt
 * does not read as one place — the planet stops looking rendered and starts
 * looking like a decal someone pasted onto a diagram. Stars and rocks run the
 * same machinery as the worlds (3D noise on the sphere, measured ranges,
 * curvature shading, derived normals), so all three are made of the same stuff.
 *
 * WHY THIS EXISTS: the shipped `images/planetN.jpg` files are photographs of real
 * planets — a lit disc centred on a black square. Wrapped onto a sphere as an
 * equirectangular map, the black surround becomes most of the globe and the disc
 * smears into an unrecognisable band. The galaxy map was converted to these
 * generated textures; the battle theater was still loading the photographs, so the
 * two views of the same world did not even resemble each other.
 *
 * Keep this the ONLY planet-texture generator. This project already carries one
 * two-divergent-copies wound (media.js vs sound.js each with their own sound table)
 * and it cost real debugging time.
 *
 * ---------------------------------------------------------------------------
 * HOW A WORLD IS BUILT (the short version)
 *
 *  1. NOISE ON THE SPHERE, NOT ON THE RECTANGLE. Every field is sampled with 3D
 *     value-noise at the unit-sphere direction for that texel. A 2D noise field on
 *     an equirectangular rectangle has a visible seam at longitude 0 and pinches
 *     into a pinwheel at both poles. Sampling in 3D removes both problems for free:
 *     the map is seamless because the sphere is, and the poles are ordinary points.
 *
 *  2. RANGES ARE MEASURED, NEVER ASSUMED. Summed value-noise does NOT span 0..1 —
 *     it clusters hard around 0.5 with a standard deviation near 0.1, and ridged
 *     noise is narrower still. This file previously had a sibling bug elsewhere in
 *     the codebase where a hard-coded 0..1 threshold silently produced 0% land and
 *     invisible clouds. So: every field is min/max normalised after generation, and
 *     every threshold that has to mean something (sea level, ice line, cloud
 *     coverage) is solved as an AREA-WEIGHTED QUANTILE of the finished histogram.
 *     "Class 8 is 80% ocean" is therefore true by construction, whatever the noise
 *     happened to do. See normaliseField() and coverageThreshold().
 *
 *  3. ONE HEIGHTFIELD, MANY MAPS. Height + moisture + temperature + slope are
 *     generated once; albedo, normal, roughness/metalness and emissive are all
 *     derived from them, so the coastline in the albedo is the same coastline the
 *     normal map creases and the roughness map makes glossy.
 *
 *  3b. VIEW-DEPENDENT EFFECTS ARE NEVER BAKED. An equirectangular map rotates
 *     with the body, so anything that depends on where the camera or the light
 *     is — limb darkening, the atmospheric rim, the night-side terminator — has
 *     to live in the material, not in the canvas. Baked "lighting" on a spinning
 *     sphere slides across the surface and instantly reads as wrong. What IS
 *     baked is curvature: the darkening of hollows relative to a blurred copy of
 *     the same terrain is a property of the surface, not of the viewer, so
 *     baking it is correct rather than a cheat, and it is what carries the
 *     relief on the legacy single-texture path.
 *
 *  4. HUE IS GAMEPLAY. A player reads planet class by colour at map zoom, where a
 *     world is ~40px across: grey = dead rock (5), orange = marginal (6),
 *     green = temperate (7), blue = ocean (8), violet = exotic (9), warm earthlike
 *     = home (10). Every palette below is chosen so the class still reads as that
 *     hue after all the detail is applied. Do not "improve" a palette across the
 *     hue boundary.
 *
 * ---------------------------------------------------------------------------
 * TEXTURE BUDGET (this runs on laptops)
 *
 *   albedo    1024x512  sRGB     — the one the player actually looks at
 *   normal    1024x512  linear   — derived from the SAME reconstructed height as
 *                                  the albedo, so creases land on coastlines
 *   orm        256x128  linear   — roughness (G) + metalness (B). Broad, low
 *                                  frequency; a bigger map is indistinguishable.
 *                                  One texture object serves both material slots.
 *   emissive   512x256  sRGB     — null for classes with no lights and no glow
 *   cloud     1024x512  sRGB+A   — null for cloudless classes. Full resolution
 *                                  because it is its own SHELL now, read at the
 *                                  same on-screen scale as the surface.
 *
 *   star      1024x512  sRGB     — photosphere, ONE for the whole galaxy
 *   corona     512x512  sRGB+A   — additive sprite, one per star colour
 *   rock       256x128  x3       — albedo + normal + roughness, 6 variants, all
 *                                  shared across every rock in every belt
 *
 * ~6.6 MB per (class, variant) worst case, and only classes actually present in
 * the galaxy are ever generated. Stars add ~2.9 MB total and the whole asteroid
 * pool ~0.8 MB, both paid once for the entire map. Everything is cached and
 * flagged `__shared` so a consumer's material disposal cannot free a texture
 * another planet still uses. Measured end to end in headless SwiftShader:
 * ~4.9 s to build all six classes plus a star and six rocks, i.e. under a
 * second per class on the slowest thing this will ever run on.
 *
 * ---------------------------------------------------------------------------
 * PUBLIC API
 *
 * THE ONE TO USE. Each returns a finished, correctly-lit THREE.Object3D:
 *
 *   createPlanetObject(type, sectorId, o) -> Group: surface + cloud shell +
 *                                            atmosphere, self-lit
 *   createStarObject(o)                   -> Group: photosphere + corona +
 *                                            prominences + glare veil
 *   createAsteroidObject(variant, o)      -> Mesh: jittered silhouette + maps
 *
 * The planet and star carry their OWN light direction. They do not read the
 * scene's lights, which is deliberate: five texture slots handed to a consumer
 * running an ambient-dominant rig produced a flat decal both times it was
 * tried. Point the key with `userData.setLightTarget(starWorldPosition)`.
 *
 * Parts, for a consumer that wants to build its own object:
 *
 *   getPlanetMaps(type, sectorId)      -> {map, normalMap, roughnessMap,
 *                                          metalnessMap, emissiveMap, cloudMap,
 *                                          style}
 *   createPlanetSurfaceMaterial(t,i,o) -> self-lit ShaderMaterial
 *   createPlanetCloudMaterial(t,i,o)   -> self-lit cloud shell, or null
 *   createAtmosphereMaterial(t,i,o)    -> ray-marched limb glow, or null
 *   createPlanetMaterial(type, id, o)  -> MeshStandardMaterial (scene-lit), all
 *                                         slots wired, night emissive + Fresnel
 *   createCloudMaterial(type, id, o)   -> scene-lit cloud shell, or null
 *   getPlanetTexture(type, sectorId)   -> LEGACY single sRGB texture (clouds
 *                                         composited in). Still supported.
 *
 *   getStarMaps(rgb?, seed?)           -> {map, coronaMap, bloomMap, palette,
 *                                          coronaScale, bloomScale}
 *   createStarSurfaceMaterial(o)       -> ShaderMaterial with limb darkening
 *   createStarCoronaMaterial(o)        -> additive SpriteMaterial
 *   createStarBloomMaterial(o)         -> additive SpriteMaterial, wide + faint
 *
 *   getAsteroidMaps(variant)           -> {map, normalMap, roughnessMap}
 *   createAsteroidGeometry(variant)    -> displaced icosahedron, cached
 *   createAsteroidMaterial(variant, o) -> MeshStandardMaterial
 *
 *   PLANET_RIG                         -> the self-lit rig's constants
 *   PLANET_LIGHTING                    -> scene lights for the SCENE-LIT path
 *   applyAtmosphericLimb(mat, rgb, o)  -> Fresnel rim on any standard material
 *   applyNightSideEmissive(mat)        -> city lights only on the dark side
 */

import * as THREE from './vendor/three.module.min.js';

// ---------------------------------------------------------------------------
// Class palettes and physical parameters.
//
// The first eight keys of each entry (deep/mid/high/cap/capSize/clouds/bands/
// blobs/atmo) are the ORIGINAL schema and are kept verbatim: galaxy3d.js and
// battle3d.js both read `style.atmo`, and keeping the rest costs nothing while
// guaranteeing no consumer breaks on a key that quietly vanished.
// ---------------------------------------------------------------------------
export const PLANET_STYLES = {
    // 5: scorched dead rock — airless, cratered, no water, no weather, no life.
    5: {
        deep: [56, 51, 48], mid: [98, 88, 80], high: [146, 132, 118],
        cap: [168, 164, 160], capSize: 0.04, clouds: 0, bands: 0.2, blobs: 36, atmo: null,
        ocean: 0,
        water: [[0, [30, 28, 27]], [1, [58, 54, 50]]],
        land: [[0, [36, 33, 31]], [0.3, [82, 76, 70]], [0.62, [124, 116, 107]], [0.85, [162, 154, 144]], [1, [204, 198, 190]]],
        shore: [66, 62, 58], arid: [112, 104, 96], cold: [150, 152, 156], rock: [176, 170, 162],
        // No atmosphere means no climate: a dead rock has no deserts and no
        // tundra, only regolith, so both biome blends are switched off here.
        aridCover: 0, aridStrength: 0, chillStrength: 0.16,
        // Airless: volatiles survive only in permanently shadowed polar floors, so
        // the snowline barely climbs off the pole.
        capCoverage: 0.012, snowline: 0.22, ridge: 0.42, craters: 130,
        // No air, no water, no rain: nothing carves a channel. Rugged is high
        // because bare rock IS its own high-frequency detail.
        rivers: 0, rugged: 1, riverTint: null,
        lights: 0, cloudCover: 0,
        roughLand: 0.97, roughWater: 0.9, roughIce: 0.62, metal: 0.05,
        // Airless rock is the one class that WANTS harsh relief.
        normalStrength: 1.0,
        bandCount: 4, bandStrength: 0.06
    },
    // 6: marginal rust world — the cheapest colony target, unmistakably arid.
    6: {
        deep: [92, 36, 18], mid: [162, 76, 30], high: [214, 134, 62],
        cap: [232, 214, 190], capSize: 0.08, clouds: 0.06, bands: 0.24, blobs: 32, atmo: [232, 128, 56],
        // "Ocean" here is a dry basin, not water: dark iron-stained playa floor.
        ocean: 0.07, surf: 0.16,
        water: [[0, [72, 44, 30]], [0.6, [108, 66, 40]], [1, [140, 92, 60]]],
        land: [[0, [114, 55, 26]], [0.28, [154, 78, 35]], [0.55, [194, 114, 52]], [0.78, [220, 154, 88]], [1, [240, 204, 162]]],
        shore: [150, 102, 62], arid: [216, 152, 88], cold: [200, 180, 168], rock: [136, 80, 46],
        aridCover: 0.62, aridStrength: 0.5, chillStrength: 0.34,
        capCoverage: 0.01, snowline: 0.42, ridge: 0.5, craters: 26,
        // Outflow channels, not rivers: the water is long gone but the chaos
        // terrain and the valles it cut are the signature of a Mars-type world.
        rivers: 0.5, riverTint: [92, 48, 26], rugged: 0.85,
        lights: 0.32, lightColor: [255, 186, 120],
        cloudCover: 0.09, cloudTint: [255, 226, 198],
        roughLand: 0.94, roughWater: 0.86, roughIce: 0.55, metal: 0.04,
        // Dust-blanketed, not lunar: at full relief strength the ridged terrain
        // threw half the lit hemisphere into black and the world read as a
        // burnt cinder rather than a Mars.
        normalStrength: 0.55,
        bandCount: 6, bandStrength: 0.14
    },
    // 7: temperate — the workhorse colony. Land dominates; the seas are teal, not
    // navy, so the world still reads GREEN at map zoom against class 8's blue.
    7: {
        deep: [30, 76, 52], mid: [72, 132, 56], high: [168, 176, 86],
        cap: [224, 238, 248], capSize: 0.11, clouds: 0.14, bands: 0.1, blobs: 30, atmo: [140, 226, 140],
        ocean: 0.34,
        water: [[0, [10, 46, 56]], [0.45, [16, 78, 88]], [0.8, [30, 118, 118]], [1, [62, 158, 148]]],
        land: [[0, [128, 136, 86]], [0.22, [88, 142, 60]], [0.5, [52, 108, 48]], [0.75, [112, 126, 68]], [1, [154, 150, 128]]],
        shore: [160, 162, 112], arid: [172, 162, 98], cold: [178, 190, 182], rock: [126, 122, 108],
        aridCover: 0.3, aridStrength: 0.62, chillStrength: 0.26,
        capCoverage: 0.042, snowline: 0.55, ridge: 0.72, craters: 6,
        rivers: 1, riverTint: [26, 74, 82], rugged: 0.9,
        lights: 0.6, lightColor: [255, 214, 150],
        cloudCover: 0.19, cloudTint: [255, 255, 255],
        roughLand: 0.92, roughWater: 0.11, roughIce: 0.42, metal: 0.02,
        normalStrength: 0.85,
        bandCount: 5, bandStrength: 0.05
    },
    // 8: ocean garden world — almost landless, bright cyan shallows, heavy weather.
    8: {
        deep: [8, 44, 104], mid: [22, 104, 190], high: [64, 196, 208],
        cap: [234, 246, 255], capSize: 0.16, clouds: 0.5, bands: 0.05, blobs: 18, atmo: [96, 190, 255],
        ocean: 0.8,
        water: [[0, [6, 26, 78]], [0.35, [11, 58, 138]], [0.68, [26, 122, 194]], [0.88, [58, 178, 214]], [1, [122, 226, 222]]],
        land: [[0, [96, 144, 112]], [0.4, [60, 114, 78]], [0.8, [122, 134, 104]], [1, [190, 210, 218]]],
        shore: [148, 204, 198], arid: [132, 142, 108], cold: [206, 226, 238], rock: [108, 118, 126],
        aridCover: 0.15, aridStrength: 0.4, chillStrength: 0.28,
        capCoverage: 0.042, snowline: 0.5, ridge: 0.45, craters: 0,
        rivers: 0.8, riverTint: [20, 66, 92], rugged: 0.7,
        lights: 0.42, lightColor: [214, 236, 255],
        cloudCover: 0.3, cloudTint: [255, 255, 255],
        roughLand: 0.88, roughWater: 0.07, roughIce: 0.38, metal: 0.02,
        normalStrength: 0.8,
        bandCount: 5, bandStrength: 0.04
    },
    // 9: exotic high-yield world — banded, luminous, plainly not natural. This is
    // the gas-giant-styled class: latitude bands dominate the surface entirely.
    9: {
        deep: [58, 22, 96], mid: [144, 48, 186], high: [64, 214, 206],
        cap: [226, 206, 255], capSize: 0.06, clouds: 0.18, bands: 0.55, blobs: 26, atmo: [206, 118, 255],
        ocean: 0,
        water: [[0, [34, 12, 58]], [1, [70, 26, 110]]],
        // Most of the range is violet gradation; the cyan crest sits right at the
        // top so it reads as a rare highlight rather than a stripe of its own.
        land: [[0, [38, 14, 64]], [0.42, [80, 29, 120]], [0.68, [134, 53, 174]], [0.86, [178, 94, 206]], [0.96, [208, 152, 228]], [1, [140, 222, 218]]],
        shore: [96, 40, 148], arid: [176, 82, 210], cold: [214, 198, 246], rock: [120, 52, 168],
        aridCover: 0, aridStrength: 0, chillStrength: 0.07,
        // No ice: a gas envelope has no surface to freeze onto, and a white cap
        // on a banded world reads as a rendering fault. It gets a POLAR HOOD
        // instead — the darker, hazier, less structured cap every banded giant
        // actually has, in its own hue.
        capCoverage: 0, snowline: 0.18, ridge: 0.35, craters: 0,
        rivers: 0, rugged: 0,
        hood: [46, 18, 74], hoodStrength: 0.62,
        lights: 0, glow: [[168, 92, 255], [96, 232, 226]], glowCoverage: 0.1,
        cloudCover: 0.11, cloudTint: [228, 202, 248],
        roughLand: 0.86, roughWater: 0.86, roughIce: 0.5, metal: 0.06,
        // A gas envelope has no rock to catch the light; relief here is cloud-top
        // shear, which is soft.
        normalStrength: 0.42, storms: 3,
        bandCount: 6, bandStrength: 0.88
    },
    // 10: homeworld — earthlike, but warmer and richer than anything else nearby.
    // Big readable continents, a full civilisation's worth of night lights.
    10: {
        deep: [14, 62, 122], mid: [46, 136, 132], high: [126, 190, 84],
        cap: [246, 250, 255], capSize: 0.15, clouds: 0.34, bands: 0.05, blobs: 26, atmo: [255, 206, 128],
        ocean: 0.62,
        water: [[0, [7, 30, 82]], [0.4, [13, 68, 138]], [0.75, [28, 122, 176]], [1, [78, 184, 200]]],
        land: [[0, [176, 158, 112]], [0.2, [112, 152, 70]], [0.45, [60, 114, 54]], [0.68, [128, 126, 78]], [0.85, [144, 134, 118]], [1, [224, 228, 232]]],
        shore: [202, 186, 138], arid: [190, 160, 104], cold: [198, 210, 216], rock: [132, 124, 112],
        aridCover: 0.34, aridStrength: 0.62, chillStrength: 0.26,
        capCoverage: 0.042, snowline: 0.6, ridge: 0.78, craters: 4,
        rivers: 1.15, riverTint: [22, 62, 96], rugged: 1,
        lights: 1, lightColor: [255, 206, 136],
        cloudCover: 0.24, cloudTint: [255, 252, 246],
        roughLand: 0.9, roughWater: 0.08, roughIce: 0.4, metal: 0.02,
        normalStrength: 0.85,
        bandCount: 5, bandStrength: 0.04
    }
};

/**
 * Per-variant modifiers. Three worlds of a class must be recognisably the same
 * class — the hue never moves — but they should not be the same picture. These
 * only ever scale a parameter; they never swap a palette.
 */
const SUBVARIANTS = {
    5: [{ crater: 1 }, { crater: 1.5, ridge: 0.75 }, { crater: 0.55, ridge: 1.35, frost: 0.4 }],
    6: [{}, { ridge: 1.25, ocean: 0.35, cloud: 0.6 }, { lava: 1, ridge: 1.15, cloud: 1.4 }],
    7: [{}, { ocean: 1.45, ridge: 0.85, cloud: 1.2 }, { ocean: 0.5, dry: 0.55, cloud: 0.6, ridge: 1.1 }],
    8: [{}, { cloud: 1.3, storms: 4 }, { cap: 1.5, cloud: 0.8, chill: 0.3 }],
    9: [{}, { bandCount: 1.4, storms: 3, glow: 0.7 }, { band: 0.5, ridge: 1.9, glow: 1.7 }],
    10: [{}, { ocean: 0.86, ridge: 1.2, cloud: 0.85 }, { ocean: 1.12, cloud: 1.25, storms: 2 }]
};

/** Deterministic PRNG so a given world looks the same on every render. */
export function seededRandom(seed) {
    let a = (seed >>> 0) || 1;
    return function next() {
        a += 0x6D2B79F5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------------------
// Noise. 3D value noise on a lattice, hashed — no permutation table to keep in
// sync, no allocation, and identical output for identical seeds forever.
// ---------------------------------------------------------------------------

function mixHash(h) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

/**
 * Value noise with a quintic fade — C2 continuous, so derived normals are smooth.
 *
 * The eight lattice hashes share their y and z terms, and the +1 neighbour of a
 * multiply is the multiply plus the constant in mod-2^32 arithmetic. Folding both
 * facts in takes the per-sample multiply count from 32 to 14, which matters: this
 * function is called roughly twenty million times to build one galaxy's worth of
 * worlds and it is essentially the whole cost of the generator.
 */
function vnoise(x, y, z, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

    const hx0 = Math.imul(ix, 374761393), hx1 = hx0 + 374761393;
    const hy0 = Math.imul(iy, 668265263), hy1 = hy0 + 668265263;
    const hz0 = Math.imul(iz, 1442695041), hz1 = hz0 + 1442695041;
    const s = seed | 0;
    const b00 = hy0 + hz0 + s, b10 = hy1 + hz0 + s;
    const b01 = hy0 + hz1 + s, b11 = hy1 + hz1 + s;

    const c000 = mixHash(hx0 + b00);
    const c100 = mixHash(hx1 + b00);
    const c010 = mixHash(hx0 + b10);
    const c110 = mixHash(hx1 + b10);
    const c001 = mixHash(hx0 + b01);
    const c101 = mixHash(hx1 + b01);
    const c011 = mixHash(hx0 + b11);
    const c111 = mixHash(hx1 + b11);

    const x00 = c000 + (c100 - c000) * u;
    const x10 = c010 + (c110 - c010) * u;
    const x01 = c001 + (c101 - c001) * u;
    const x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * v;
    const y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
}

/**
 * Fractional Brownian motion. The return value is a WEIGHTED AVERAGE of octaves,
 * so it is bounded by 0..1 but in practice occupies roughly 0.28..0.72 — which is
 * exactly why nothing downstream is allowed to threshold it directly.
 */
function fbm(x, y, z, seed, octaves, gain, lacunarity) {
    const g = gain === undefined ? 0.5 : gain;
    const lac = lacunarity === undefined ? 2.017 : lacunarity;
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
        sum += amp * vnoise(x * freq, y * freq, z * freq, seed + i * 1013);
        norm += amp;
        amp *= g;
        freq *= lac;
    }
    return sum / norm;
}

/**
 * Ridged multifractal — the classic erosion stand-in. Folding the noise about its
 * midpoint turns smooth hills into sharp crests, and weighting each octave by the
 * previous one concentrates detail on the ridges instead of spreading it evenly,
 * which is what makes mountain chains look like drainage patterns rather than
 * bumpy noise. Its range is narrow and asymmetric; normalisation handles that.
 */
function ridged(x, y, z, seed, octaves) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0, prev = 1;
    for (let i = 0; i < octaves; i++) {
        let n = 1 - Math.abs(vnoise(x * freq, y * freq, z * freq, seed + i * 7919) * 2 - 1);
        n *= n;
        sum += n * amp * prev;
        prev = 0.35 + n * 0.65;
        norm += amp;
        amp *= 0.52;
        freq *= 2.09;
    }
    return sum / norm;
}

// ---------------------------------------------------------------------------
// Small maths helpers.
// ---------------------------------------------------------------------------

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
function smoothstep(edge0, edge1, x) {
    if (edge0 === edge1) return x < edge0 ? 0 : 1;
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}
function mix(a, b, t) { return a + (b - a) * t; }

/** Sample a colour ramp given as [[stop, [r,g,b]], ...] with stops ascending. */
function rampColour(stops, t, out) {
    const x = clamp01(t);
    let i = 0;
    while (i < stops.length - 2 && x > stops[i + 1][0]) i++;
    const a = stops[i], b = stops[i + 1];
    const span = b[0] - a[0];
    const f = span > 0 ? clamp01((x - a[0]) / span) : 0;
    out[0] = a[1][0] + (b[1][0] - a[1][0]) * f;
    out[1] = a[1][1] + (b[1][1] - a[1][1]) * f;
    out[2] = a[1][2] + (b[1][2] - a[1][2]) * f;
    return out;
}

/**
 * Molten fissure network, shared by the albedo and the emissive pass so the two
 * agree texel for texel.
 *
 * Folding fBm about its own median — 1 - |2n-1| — peaks along the median LEVEL
 * SET, which is a network of thin curves rather than a set of blobs. Thresholding
 * that near its ceiling gives cracks; thresholding the raw noise gives puddles,
 * which is what the first pass did and why half the volcanic world was molten.
 */
function lavaVein(dx, dy, dz, seed, elev) {
    const n = fbm(dx * 9, dy * 9, dz * 9, seed + 5501, 3);
    const crack = 1 - Math.abs(n * 2 - 1);
    return smoothstep(0.965, 0.997, crack) * smoothstep(0.55, 0.1, elev);
}

/**
 * Rescale a field to exactly 0..1 using its MEASURED extremes.
 *
 * This is the guard against the class of bug that has already bitten this
 * codebase once: fBm does not span 0..1, so any constant compared against raw
 * fBm output is a coin flip between "everything" and "nothing".
 */
function normaliseField(field) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < field.length; i++) {
        const v = field[i];
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const span = (max - min) || 1;
    const inv = 1 / span;
    for (let i = 0; i < field.length; i++) field[i] = (field[i] - min) * inv;
    return { min, max, span };
}

/**
 * Solve for the field value above which exactly `fraction` of the SPHERE'S
 * SURFACE AREA lies. Rows are weighted by cos(latitude) because equirectangular
 * rows near the poles cover almost no area — without the weight, a "15% ice cap"
 * request would produce a cap several times too large.
 *
 * Returns +Infinity for fraction<=0 (nothing passes) and -Infinity for >=1.
 */
function coverageThreshold(field, W, H, rowWeight, fraction) {
    if (!(fraction > 0)) return Infinity;
    if (fraction >= 1) return -Infinity;
    const BINS = 1024;
    const hist = new Float64Array(BINS);
    let total = 0;
    for (let y = 0; y < H; y++) {
        const w = rowWeight[y];
        const row = y * W;
        for (let x = 0; x < W; x++) {
            let b = (field[row + x] * BINS) | 0;
            if (b < 0) b = 0; else if (b >= BINS) b = BINS - 1;
            hist[b] += w;
        }
        total += w * W;
    }
    const want = total * fraction;
    let acc = 0;
    for (let b = BINS - 1; b >= 0; b--) {
        const before = acc;
        acc += hist[b];
        if (acc >= want) {
            // Interpolate inside the bin so small coverages stay precise.
            const f = hist[b] > 0 ? (want - before) / hist[b] : 0;
            return (b + 1 - f) / BINS;
        }
    }
    return 0;
}

/**
 * Separable box blur, wrapping in x and clamping in y, via a sliding sum so the
 * cost is independent of radius. Used to get a low-frequency reference surface
 * for curvature shading.
 */
function boxBlur(src, W, H, radius) {
    const tmp = new Float32Array(W * H);
    const out = new Float32Array(W * H);
    const norm = 1 / (radius * 2 + 1);
    for (let y = 0; y < H; y++) {
        const row = y * W;
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += src[row + ((k % W) + W) % W];
        for (let x = 0; x < W; x++) {
            tmp[row + x] = sum * norm;
            sum -= src[row + ((x - radius) % W + W) % W];
            sum += src[row + ((x + radius + 1) % W + W) % W];
        }
    }
    for (let x = 0; x < W; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
            const yy = k < 0 ? 0 : (k > H - 1 ? H - 1 : k);
            sum += tmp[yy * W + x];
        }
        for (let y = 0; y < H; y++) {
            out[y * W + x] = sum * norm;
            const yo = y - radius, yn = y + radius + 1;
            sum -= tmp[(yo < 0 ? 0 : yo) * W + x];
            sum += tmp[(yn > H - 1 ? H - 1 : yn) * W + x];
        }
    }
    return out;
}

/** Bilinear sample of a field, wrapping in x (longitude) and clamping in y. */
function sampleField(field, W, H, fx, fy) {
    let x0 = Math.floor(fx);
    let y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    let x1 = x0 + 1;
    let y1 = y0 + 1;
    x0 = ((x0 % W) + W) % W;
    x1 = ((x1 % W) + W) % W;
    if (y0 < 0) y0 = 0; else if (y0 > H - 1) y0 = H - 1;
    if (y1 < 0) y1 = 0; else if (y1 > H - 1) y1 = H - 1;
    const r0 = y0 * W, r1 = y1 * W;
    const a = field[r0 + x0], b = field[r0 + x1], c = field[r1 + x0], d = field[r1 + x1];
    return mix(mix(a, b, tx), mix(c, d, tx), ty);
}

// ---------------------------------------------------------------------------
// Field generation.
// ---------------------------------------------------------------------------

const FIELD_W = 512;
const FIELD_H = 256;
const ALBEDO_W = 1024;
const ALBEDO_H = 512;
const ORM_W = 256;
const ORM_H = 128;
const AUX_W = 512;   // emissive
const AUX_H = 256;
// Clouds get the albedo's resolution. They are now a separate shell rather than
// a layer composited into the surface, which means they are read at the same
// on-screen scale as the surface and a half-resolution deck shows its texels on
// every cloud edge under inspection.
const CLOUD_W = 1024;
const CLOUD_H = 512;

function styleFor(type) {
    return PLANET_STYLES[type] || PLANET_STYLES[7];
}

function variantFor(type, variant) {
    const table = SUBVARIANTS[type] || SUBVARIANTS[7];
    return table[((variant % table.length) + table.length) % table.length] || {};
}

/**
 * Punch impact craters straight into the heightfield.
 *
 * Craters are rasterised per-crater over their own bounding box rather than
 * tested per-pixel against every crater: an airless world wants ~110 of them and
 * a per-pixel loop over all of them would be 14 million distance tests. Each
 * crater's x radius is divided by cos(latitude) to cancel the equirectangular
 * squeeze, so a crater near a pole is still round on the sphere.
 */
function stampCraters(height, W, H, count, rand, strength) {
    for (let i = 0; i < count; i++) {
        const cx = rand() * W;
        const cy = H * (0.04 + rand() * 0.92);
        const lat = (0.5 - cy / H) * Math.PI;
        const cosLat = Math.max(0.16, Math.cos(lat));
        // Heavily biased small: a few big basins, a lot of pockmarks.
        const t = rand();
        const r = (2.5 + t * t * t * 44) * (0.6 + strength * 0.7);
        const rx = r / cosLat;
        const depth = (0.1 + rand() * 0.22) * strength;
        const rimH = depth * (0.45 + rand() * 0.4);
        // REACH, not 1.0: the ejecta blanket runs out to d = 1.35, and a bounding
        // box sized to the bowl chops it off along a straight line. That produced
        // faint rectangles all over the dead-rock normal map.
        const REACH = 1.36;
        const x0 = Math.floor(cx - rx * REACH) - 1, x1 = Math.ceil(cx + rx * REACH) + 1;
        const y0 = Math.max(0, Math.floor(cy - r * REACH) - 1), y1 = Math.min(H - 1, Math.ceil(cy + r * REACH) + 1);
        for (let y = y0; y <= y1; y++) {
            const dy = (y - cy) / r;
            const row = y * W;
            for (let x = x0; x <= x1; x++) {
                const dx = (x - cx) / rx;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > 1.35) continue;
                let delta;
                if (d < 0.82) {
                    // Bowl: flat-ish floor, steep wall.
                    delta = -depth * (1 - smoothstep(0.4, 0.82, d) * 0.55);
                } else {
                    // Raised rim falling off into the ejecta blanket.
                    delta = rimH * (1 - smoothstep(0.82, 1.35, d)) * smoothstep(0.82, 0.95, d);
                }
                const xi = ((x % W) + W) % W;
                height[row + xi] += delta;
            }
        }
    }
}

/**
 * Stamp anticyclonic storm ovals into a banded world's field.
 *
 * A gas giant without spots is a barcode. Each oval is stretched in longitude
 * (real vortices are wider than they are tall, and equirectangular stretches
 * them further), given a contrasting collar so it reads as a rim rather than a
 * smudge, and rasterised over its own bounding box like the craters are.
 */
function stampStorms(field, W, H, count, rand) {
    for (let i = 0; i < count; i++) {
        const cx = rand() * W;
        const cy = H * (0.16 + rand() * 0.68);
        const lat = (0.5 - cy / H) * Math.PI;
        const cosLat = Math.max(0.2, Math.cos(lat));
        const ry = 7 + rand() * 15;
        const rx = (ry * (2.1 + rand() * 1.8)) / cosLat;
        const amp = (rand() < 0.5 ? -1 : 1) * (0.22 + rand() * 0.26);
        const REACH = 1.3;
        const x0 = Math.floor(cx - rx * REACH) - 1, x1 = Math.ceil(cx + rx * REACH) + 1;
        const y0 = Math.max(0, Math.floor(cy - ry * REACH) - 1);
        const y1 = Math.min(H - 1, Math.ceil(cy + ry * REACH) + 1);
        for (let y = y0; y <= y1; y++) {
            const dy = (y - cy) / ry;
            const row = y * W;
            for (let x = x0; x <= x1; x++) {
                const dx = (x - cx) / rx;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > REACH) continue;
                const core = 1 - smoothstep(0.42, 1, d);
                const collar = smoothstep(0.8, 1, d) * (1 - smoothstep(1, REACH, d));
                const xi = ((x % W) + W) % W;
                field[row + xi] += amp * core - amp * 0.45 * collar;
            }
        }
    }
}

/**
 * Generate every scalar field a world needs, at FIELD_W x FIELD_H.
 * Returns normalised fields plus the thresholds solved from their histograms.
 */
function buildFields(type, variant) {
    const style = styleFor(type);
    const mod = variantFor(type, variant);
    const seed = (type * 7919 + variant * 104729 + 17) | 0;
    const rand = seededRandom(seed ^ 0x5f3a);
    const W = FIELD_W, H = FIELD_H;
    const N = W * H;

    // Per-row / per-column trig, hoisted out of the inner loop. Without this the
    // generator spends most of its time in Math.sin/cos.
    const sinLat = new Float64Array(H);
    const cosLat = new Float64Array(H);
    const rowWeight = new Float64Array(H);
    for (let y = 0; y < H; y++) {
        const lat = (0.5 - (y + 0.5) / H) * Math.PI;
        sinLat[y] = Math.sin(lat);
        cosLat[y] = Math.cos(lat);
        rowWeight[y] = Math.max(1e-4, Math.cos(lat));
    }
    const sinLon = new Float64Array(W);
    const cosLon = new Float64Array(W);
    for (let x = 0; x < W; x++) {
        const lon = ((x + 0.5) / W) * Math.PI * 2;
        sinLon[x] = Math.sin(lon);
        cosLon[x] = Math.cos(lon);
    }

    const base = new Float32Array(N);
    const ridge = new Float32Array(N);
    const moisture = new Float32Array(N);
    const temp = new Float32Array(N);
    const polar = new Float32Array(N);

    const ridgeAmt = (style.ridge || 0) * (mod.ridge === undefined ? 1 : mod.ridge);
    const bandStrength = clamp01((style.bandStrength || 0) * (mod.band === undefined ? 1 : mod.band));
    const bandCount = Math.max(2, Math.round((style.bandCount || 5) * (mod.bandCount || 1)));
    const banded = bandStrength > 0.12;
    const continentScale = 1.55 + rand() * 0.5;

    for (let y = 0; y < H; y++) {
        const sy = sinLat[y];
        const cy = cosLat[y];
        const row = y * W;
        const latN = sy;                     // -1 at south pole, +1 at north
        const absLat = Math.abs(latN);
        for (let x = 0; x < W; x++) {
            const dx = cy * cosLon[x];
            const dy = sy;
            const dz = cy * sinLon[x];

            // --- domain warp -------------------------------------------------
            // Warping the sample point by another noise field is what turns
            // circular fBm blobs into landmasses with peninsulas, bays and
            // stretched shelves. Single-octave lookups are enough here — the
            // warp only has to be smooth and decorrelated, not detailed.
            const wx = vnoise(dx * 1.9 + 11.3, dy * 1.9, dz * 1.9, seed + 331) - 0.5;
            const wy = vnoise(dx * 1.9, dy * 1.9 + 7.7, dz * 1.9, seed + 617) - 0.5;
            const wz = vnoise(dx * 1.9, dy * 1.9, dz * 1.9 + 3.1, seed + 907) - 0.5;
            const warp = 0.68;
            const px = dx * continentScale + wx * warp;
            const py = dy * continentScale + wy * warp;
            const pz = dz * continentScale + wz * warp;

            // --- continents --------------------------------------------------
            let b = fbm(px, py, pz, seed + 5, 5, 0.5, 2.03);
            // A second, much larger-scale term biases where the supercontinents
            // sit so the world does not look like uniform static.
            b = b * 0.72 + fbm(dx * 0.72, dy * 0.72, dz * 0.72, seed + 1201, 2) * 0.28;

            // --- latitude bands ---------------------------------------------
            // Gas-giant striping. The latitude fed to the sine is itself warped
            // by noise, which is what gives the band edges their turbulent,
            // sheared look instead of drawn-on stripes. Only worth its ~9 extra
            // noise lookups when the class is actually banded; the 0.04-0.06
            // "climate hint" the other classes carried was invisible under the
            // biome model and cost a third of the generator's runtime.
            if (banded) {
                const bw = fbm(dx * 2.3, dy * 2.3, dz * 2.3, seed + 4441, 3) - 0.5;
                const shear = vnoise(dx * 5.5, dy * 1.2, dz * 5.5, seed + 8123) - 0.5;
                const latB = latN + bw * 0.14 + shear * 0.045;
                // Band widths come from 1D fBm along the (warped) latitude, not a
                // sine wave. Evenly spaced bands read as corduroy; Jupiter's belts
                // are wide, narrow, wide, and that irregularity is the whole look.
                let band = fbm(latB * bandCount * 0.5 + 37.3, 8.1, 2.7, seed + 551, 3);
                // Push the band field toward its extremes so belts and zones have
                // an EDGE. Without this the 1D fBm is all mid-tone and the world
                // reads as a soft lavender smear.
                band = smoothstep(0.38, 0.62, band);
                // Turbulent festoons chewing at the band edges.
                band += (fbm(dx * 6.5, dy * 3, dz * 6.5, seed + 2213, 3) - 0.5) * 0.44;
                band += (fbm(dx * 14, dy * 5.5, dz * 14, seed + 6421, 3) - 0.5) * 0.2;
                b = mix(b, band, bandStrength);
            }
            base[row + x] = b;

            // --- ridges ------------------------------------------------------
            ridge[row + x] = ridgeAmt > 0.001
                ? ridged(px * 2.6, py * 2.6, pz * 2.6, seed + 77, 4)
                : 0;

            // --- moisture ----------------------------------------------------
            // Two Hadley-ish dry belts near +-28 degrees, wet equator, wet
            // mid-latitudes; noise on top so the belts are not stripes.
            const dryBelt = Math.exp(-Math.pow((absLat - 0.42) * 4.4, 2));
            let m = fbm(dx * 2.4 + 31, dy * 2.4, dz * 2.4, seed + 991, 3);
            m = m - dryBelt * 0.26 + (1 - absLat) * 0.1;
            moisture[row + x] = m;

            // --- temperature -------------------------------------------------
            // Cosine-of-latitude baseline, wobbled by noise so biome edges are
            // ragged, then knocked down by altitude in the second pass. This is
            // the CLIMATE field: it drives deserts, tundra tint and habitability.
            const t = (1 - Math.pow(absLat, 1.35)) + (fbm(dx * 3.1, dy * 3.1, dz * 3.1, seed + 1777, 2) - 0.5) * 0.34;
            temp[row + x] = t;

            // --- polar weight ------------------------------------------------
            // Where permanent ice is ALLOWED to exist, as a function of latitude
            // alone, warped by noise so the cap edge is a ragged coastline of ice
            // rather than a drawn parallel.
            //
            // This is deliberately a separate field from `temp`. Temperature
            // carries a lapse rate strong enough that an equatorial massif reads
            // as cold as a pole, so thresholding coldness put a bright ice sheet
            // in the middle of the disc — the cap read as a smudge of fog rather
            // than as a pole. Ice is gated on latitude here and only *lifted*
            // toward the equator by genuine altitude, below.
            const latWarp = fbm(dx * 2.15, dy * 2.15, dz * 2.15, seed + 3313, 2) - 0.5;
            polar[row + x] = smoothstep(0.16, 0.98, absLat + latWarp * 0.26);
        }
    }

    // Craters and storms go in before normalisation so they are part of the
    // measured range and cannot push anything out of bounds.
    const craterCount = Math.round((style.craters || 0) * (mod.crater === undefined ? 1 : mod.crater));
    if (craterCount > 0) {
        normaliseField(base);
        stampCraters(base, W, H, craterCount, rand, 1);
    }
    if (banded && (style.storms || 0) > 0) {
        normaliseField(base);
        stampStorms(base, W, H, Math.round(style.storms * (mod.storms ? 1.5 : 1)), rand);
    }

    normaliseField(base);
    if (ridgeAmt > 0.001) normaliseField(ridge);
    normaliseField(moisture);
    normaliseField(temp);

    // --- sea level ---------------------------------------------------------
    // Solved as an area-weighted quantile: "class 8 is 80% ocean" is enforced,
    // not hoped for.
    const oceanTarget = clamp01((style.ocean || 0) * (mod.ocean === undefined ? 1 : mod.ocean));
    const hasOcean = oceanTarget > 0;
    const seaLevel = hasOcean ? coverageThreshold(base, W, H, rowWeight, 1 - oceanTarget) : -1;

    // --- elevation, slope, ambient occlusion -------------------------------
    // Ridges are added only ABOVE sea level and ramped in with altitude, so
    // mountain chains grow out of continental interiors rather than sprouting
    // from the seabed.
    //
    // `landBase` is the height that counts as zero elevation. On a world with no
    // sea that is simply 0 — using the sentinel seaLevel of -1 here made every
    // land texel evaluate to (b + 1), i.e. clipped to 1.0 everywhere, which flat-
    // lined the entire elevation ramp on the dead-rock and exotic classes.
    const landBase = hasOcean ? seaLevel : 0;
    const invAbove = 1 / Math.max(1e-3, 1 - landBase);
    const elev = new Float32Array(N);
    let elevMax = 1e-4;
    for (let i = 0; i < N; i++) {
        const b = base[i];
        if (hasOcean && b <= seaLevel) { elev[i] = 0; continue; }
        let e = (b - landBase) * invAbove;
        if (ridgeAmt > 0.001) {
            e += ridgeAmt * 0.55 * (ridge[i] - 0.32) * smoothstep(0, 0.28, e);
        }
        if (e < 0) e = 0;
        if (e > elevMax) elevMax = e;
        elev[i] = e;
    }
    // Rescale rather than clamp, so peaks keep the top of the colour ramp
    // instead of a plateau of clipped white.
    const invElevMax = 1 / elevMax;
    for (let i = 0; i < N; i++) elev[i] *= invElevMax;

    // Altitude lapse rate: high ground is cold ground.
    for (let i = 0; i < N; i++) temp[i] = temp[i] - elev[i] * 0.4;
    normaliseField(temp);
    // Moisture rain-shadow: peaks wring the air dry.
    for (let i = 0; i < N; i++) moisture[i] = moisture[i] - elev[i] * 0.3;
    normaliseField(moisture);

    // --- cryosphere ----------------------------------------------------------
    // The field permanent ice is solved against: a latitude gate plus a snowline
    // term that lets genuinely high ground carry glaciers away from the pole.
    // The exponent on elevation is what keeps the mid-latitudes clean — only the
    // top fifth of the elevation range contributes meaningfully, so ranges get
    // white CRESTS (a line, following terrain) instead of white REGIONS.
    const snowline = style.snowline === undefined ? 0.45 : style.snowline;
    const cryo = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        const e = elev[i];
        cryo[i] = polar[i] + e * e * e * (1.2 + e) * snowline;
    }
    normaliseField(cryo);

    // Slope from the elevation field, corrected for the equirectangular squeeze
    // (a texel of longitude covers cos(lat) as much ground near the poles).
    const slope = new Float32Array(N);
    for (let y = 0; y < H; y++) {
        const row = y * W;
        const inv = 1 / Math.max(0.2, cosLat[y]);
        const rowUp = Math.max(0, y - 1) * W;
        const rowDn = Math.min(H - 1, y + 1) * W;
        for (let x = 0; x < W; x++) {
            const xl = (x + W - 1) % W, xr = (x + 1) % W;
            const gx = (elev[row + xr] - elev[row + xl]) * inv;
            const gy = elev[rowDn + x] - elev[rowUp + x];
            slope[row + x] = Math.sqrt(gx * gx + gy * gy);
        }
    }

    // --- curvature shading ---------------------------------------------------
    // A one-texel cavity test barely moves: neighbouring texels of a smooth
    // heightfield are nearly equal, so the "AO" it produces is ~1 everywhere and
    // the surface stays flat. Comparing each texel against a BLURRED copy of the
    // terrain instead gives multi-texel curvature — valleys and basins darken,
    // ridge lines and crater rims catch light — and it is view-independent, so
    // baking it is correct rather than a cheat. This is also what carries the
    // relief on the legacy single-texture path, which has no normal map at all.
    //
    // Scaled by the same per-class relief budget the normal map uses, so a dusty
    // world and an airless rock stay as different in the colour map as they are
    // under the light. Left at one global constant, class 6 came out looking like
    // cracked ceramic and the gas giant grew rock veins.
    //
    // TWO scales, not one. A single blur radius only sees features of one size:
    // at r=5 the mountain ranges got their creases and the continental basins
    // stayed perfectly flat, which is most of why a world read as a soft blob at
    // map zoom. The fine term picks out ridge lines and crater rims, the coarse
    // term shades whole basins and uplands, and summing them gives the surface a
    // legible silhouette at BOTH the 40px map read and the 200px close-up.
    const ao = new Float32Array(N);
    const fine = boxBlur(elev, W, H, 3);
    const coarse = boxBlur(elev, W, H, 13);
    const curvGain = style.normalStrength === undefined ? 1 : style.normalStrength;
    // The clamp is the relief BUDGET, and it was set too tight: at 0.62..1.30 a
    // whole mountain range spans barely a stop of value and the terrain reads as
    // a tinted blur. Widening it to 0.52..1.38 roughly doubles the contrast the
    // silhouette of a range carries without letting a crater floor go to black.
    const gFine = 2.5 * curvGain, gCoarse = 1.75 * curvGain;
    for (let i = 0; i < N; i++) {
        const e = elev[i];
        const v = 1 + (e - fine[i]) * gFine + (e - coarse[i]) * gCoarse;
        ao[i] = v < 0.52 ? 0.52 : (v > 1.38 ? 1.38 : v);
    }
    // Sea-floor relief. The land curvature above is useless under water because
    // `elev` is clamped to zero there, so an ocean carried no structure at all —
    // on a class-8 world that is most of the visible disc, rendered as one flat
    // gradient. This runs the same two-scale curvature on the RAW height, which
    // still has its bathymetry, and the result is mid-ocean ridges, fracture
    // zones and abyssal plains. Gains are higher because the sub-sea part of the
    // height range is only `seaLevel` units tall.
    const aoSea = new Float32Array(N);
    if (hasOcean) {
        const sFine = boxBlur(base, W, H, 3);
        const sCoarse = boxBlur(base, W, H, 13);
        for (let i = 0; i < N; i++) {
            const b = base[i];
            const v = 1 + (b - sFine[i]) * 4.2 + (b - sCoarse[i]) * 3;
            aoSea[i] = v < 0.74 ? 0.74 : (v > 1.22 ? 1.22 : v);
        }
    } else {
        aoSea.fill(1);
    }

    let maxSlope = 1e-5;
    for (let i = 0; i < N; i++) if (slope[i] > maxSlope) maxSlope = slope[i];
    const invSlope = 1 / maxSlope;
    for (let i = 0; i < N; i++) slope[i] *= invSlope;

    // --- ice line ----------------------------------------------------------
    // An area quantile taken on the CRYOSPHERE field, so "8.2% of this world is
    // under permanent ice" is true by construction and the ice sits where ice
    // belongs. Because cryo carries the elevation term, the cap edge is a ragged
    // line that crawls up mountain ranges instead of cutting a parallel.
    let capTarget = clamp01((style.capCoverage || 0) * (mod.cap === undefined ? 1 : mod.cap));
    if (mod.chill) capTarget = clamp01(capTarget + mod.chill * 0.28);
    if (mod.frost) capTarget = clamp01(capTarget + mod.frost * 0.05);
    //
    // Every consumer compares AGAINST this threshold with `cryo >= t`, in the
    // same orientation it was solved in. The previous field was coldness, and
    // solving on temperature then negating the result — the obvious-looking
    // move — inverts the test and turns a 3.5% frost cap into a 95% snowball.
    let iceThreshold = -Infinity;
    let tundraThreshold = -Infinity;
    if (capTarget > 0) {
        iceThreshold = coverageThreshold(cryo, W, H, rowWeight, capTarget);
        // The tundra ring outside the ice is a coverage target too, so the
        // desaturated polar wash stays a deliberate few percent of the globe
        // instead of bleaching a third of every world — which is precisely what
        // the previous fixed `(0.42 - temperature)` constant did.
        tundraThreshold = coverageThreshold(cryo, W, H, rowWeight,
            Math.min(0.5, capTarget * 2.6 + 0.05));
    }
    // The ice edge is centred ON the quantile so the soft transition costs no
    // coverage: half the blend falls inside the cap and half outside. It is kept
    // TIGHT — a cap is a sheet with a coast, not a haze. A wide blend was most of
    // why the cap read as a soft white blob rather than an ice sheet.
    const iceSoft = 0.02 + capTarget * 0.08;

    // --- desert line ---------------------------------------------------------
    // Same discipline for aridity: "this class is 34% desert" is measured off the
    // dryness histogram rather than guessed against an assumed noise range.
    const aridCover = style.aridCover === undefined ? 0.3 : style.aridCover;
    let aridOnset = Infinity, aridFull = Infinity;
    if (aridCover > 0 && (style.aridStrength || 0) > 0) {
        const dryness = new Float32Array(N);
        for (let i = 0; i < N; i++) dryness[i] = 1 - moisture[i];
        const boost = mod.dry || 0;
        aridOnset = coverageThreshold(dryness, W, H, rowWeight, clamp01(aridCover + boost * 0.3));
        aridFull = coverageThreshold(dryness, W, H, rowWeight, clamp01(aridCover * 0.32 + boost * 0.2));
    }

    return {
        W, H, N, style, mod, seed, rand,
        sinLat, cosLat, sinLon, cosLon, rowWeight,
        base, ridge, elev, moisture, temp, slope, ao, aoSea, cryo,
        seaLevel, iceThreshold, tundraThreshold, iceSoft, aridOnset, aridFull,
        oceanTarget, bandStrength, ridgeAmt
    };
}

// ---------------------------------------------------------------------------
// Albedo + normal. Painted together at 1024x512 from a reconstructed height so
// that the two agree exactly: every crease in the normal map lies on a feature
// you can see in the colour map.
// ---------------------------------------------------------------------------

function paintSurface(f) {
    const style = f.style, mod = f.mod;
    const W = ALBEDO_W, H = ALBEDO_H;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const px = img.data;

    // Reconstructed full-resolution height, kept so the normal pass can use the
    // exact same surface the colour pass shaded.
    const hiHeight = new Float32Array(W * H);

    const sinLat = new Float64Array(H), cosLat = new Float64Array(H);
    for (let y = 0; y < H; y++) {
        const lat = (0.5 - (y + 0.5) / H) * Math.PI;
        sinLat[y] = Math.sin(lat);
        cosLat[y] = Math.cos(lat);
    }
    const sinLon = new Float64Array(W), cosLon = new Float64Array(W);
    for (let x = 0; x < W; x++) {
        const lon = ((x + 0.5) / W) * Math.PI * 2;
        sinLon[x] = Math.sin(lon);
        cosLon[x] = Math.cos(lon);
    }

    const c = [0, 0, 0];
    const tmp = [0, 0, 0];
    const scaleX = f.W / W, scaleY = f.H / H;
    const dryBias = mod.dry || 0;
    const lavaAmt = mod.lava || 0;
    const isBanded = f.bandStrength > 0.5;
    const hasOcean = f.oceanTarget > 0;
    const hasBeach = f.oceanTarget > 0.02;
    const shore = style.shore, arid = style.arid, cold = style.cold, rock = style.rock;
    const capCol = style.cap;
    const shallowest = style.water[style.water.length - 1][1];
    const aridStrength = f.aridOnset === Infinity ? 0 : (style.aridStrength || 0);
    const chillStrength = f.tundraThreshold === -Infinity ? 0 : (style.chillStrength || 0);
    const aridOnset = f.aridOnset, aridFull = f.aridFull;
    const tundraOnset = f.tundraThreshold, iceOnset = f.iceThreshold;
    const hasIce = f.iceThreshold > -Infinity;
    const iceLo = f.iceThreshold - f.iceSoft * 0.5;
    const iceHi = f.iceThreshold + f.iceSoft * 0.5;
    const hood = style.hood || null;
    const hoodStrength = style.hoodStrength === undefined ? 0.5 : style.hoodStrength;
    const needCryo = hasIce || !!hood;
    // Full-resolution relief terms. Both are land-only and both are skipped
    // outright when the class sets them to zero, so a gas giant never pays for
    // mountain texture it cannot have.
    const ruggedAmt = (style.rugged === undefined ? 0.9 : style.rugged)
        * (mod.ridge === undefined ? 1 : Math.min(1.4, mod.ridge));
    const riverAmt = (style.rivers || 0) * (mod.dry ? 0.45 : 1);
    const riverTint = style.riverTint || [24, 60, 84];
    // Foam: the shore colour pushed most of the way to white. The single
    // strongest coastline cue at map zoom is a bright hairline where the water
    // meets the land, because it survives mipmapping as a value spike.
    // Lifted TOWARD white, never to it: forcing the surf to 255 painted a pure
    // white outline around every basin, which on the rust world read as a
    // drawn stroke rather than as breaking water. The class hue has to survive
    // its own coastline.
    const foam = [
        mix(shore[0], 255, 0.42), mix(shore[1], 255, 0.42), mix(shore[2], 255, 0.42)
    ];
    // A dry playa has a salt rim, not surf. Per class, because "is there
    // actually water in that basin" is a property of the class, not of depth.
    const surfStrength = style.surf === undefined ? 0.55 : style.surf;

    // Bilinear fetch, fused. The albedo is a 2x upsample of the field, and six
    // independent sampleField() calls per texel meant recomputing the same four
    // indices and four weights six times over half a million pixels. The indices
    // and weights are computed once per texel and reused across every field.
    const fW = f.W, fH = f.H;
    const fBase = f.base, fElev = f.elev, fMoist = f.moisture;
    const fTemp = f.temp, fSlope = f.slope, fAo = f.ao, fAoSea = f.aoSea, fCryo = f.cryo;

    for (let y = 0; y < H; y++) {
        const fy = (y + 0.5) * scaleY - 0.5;
        let y0 = Math.floor(fy);
        const ty = fy - y0;
        let y1 = y0 + 1;
        if (y0 < 0) y0 = 0; else if (y0 > fH - 1) y0 = fH - 1;
        if (y1 < 0) y1 = 0; else if (y1 > fH - 1) y1 = fH - 1;
        const r0 = y0 * fW, r1 = y1 * fW;
        const sy = sinLat[y], cy = cosLat[y];
        for (let x = 0; x < W; x++) {
            const i = y * W + x;
            const fx = (x + 0.5) * scaleX - 0.5;
            let x0 = Math.floor(fx);
            const tx = fx - x0;
            let x1 = x0 + 1;
            x0 = ((x0 % fW) + fW) % fW;
            x1 = ((x1 % fW) + fW) % fW;
            const i00 = r0 + x0, i01 = r0 + x1, i10 = r1 + x0, i11 = r1 + x1;
            const w01 = tx * (1 - ty), w00 = (1 - ty) - w01;
            const w11 = tx * ty, w10 = ty - w11;

            const dx = cy * cosLon[x], dz = cy * sinLon[x];

            // Fine detail lives only here, at full albedo resolution.
            //
            // BUDGET NOTE: an octave costs 524k noise lookups at this resolution
            // and 4.2M at the field's — a tenth of the price. So every scale of
            // structure the field cannot carry is bought HERE rather than by
            // raising FIELD_W, which is why a 512-wide field still produces a
            // 1024-wide map that holds up under 4x inspection.
            //
            // A banded world gets a different detail basis — coarse in longitude,
            // fine in latitude — because zonal winds smear everything east-west.
            // That anisotropy is what makes cloud-top turbulence read as flow
            // rather than as noise sprinkled on stripes.
            const detail = isBanded
                ? fbm(dx * 8, sy * 44, dz * 8, f.seed + 3301, 3) - 0.5
                : fbm(dx * 26, sy * 26, dz * 26, f.seed + 3301, 3) - 0.5;
            // One scale below `detail` and one above `grain`: this is the band the
            // eye reads as "material" at a 200px close-up, and its absence is most
            // of why a surface dissolves into mush when you zoom in.
            const micro = fbm(dx * 61, sy * 61, dz * 61, f.seed + 9109, 2) - 0.5;
            const grain = vnoise(dx * 78, sy * 78, dz * 78, f.seed + 6607) - 0.5;

            const rawH = fBase[i00] * w00 + fBase[i01] * w01 + fBase[i10] * w10 + fBase[i11] * w11;
            // COASTAL DETAIL BUDGET. The half-resolution field carries continent
            // shapes; the shoreline is where the eye actually looks, so the
            // full-resolution perturbation is concentrated there — six times the
            // amplitude within a shore band, tapering to nothing offshore and
            // inland. That buys bays, spits, fjords and offshore islets at 1024
            // without paying for a 1024-resolution field, and it is the reason a
            // coastline survives the mip chain instead of turning to mush.
            const coastBand = hasOcean
                ? smoothstep(0.13, 0.0, Math.abs(rawH - f.seaLevel))
                : 0;
            const baseH = rawH
                + detail * (isBanded ? 0.085 : 0.022 + coastBand * 0.06)
                // Sub-texel crenulation ON the shoreline only: this is what turns
                // a smooth analytic curve into an edge with headlands, coves and
                // offshore stacks, and it is why the coast still reads as a coast
                // after the mip chain has had it.
                + micro * (0.006 + coastBand * 0.02)
                + grain * coastBand * 0.016;
            const temperature = fTemp[i00] * w00 + fTemp[i01] * w01 + fTemp[i10] * w10 + fTemp[i11] * w11
                + detail * 0.05;
            const cryo = needCryo
                ? fCryo[i00] * w00 + fCryo[i01] * w01 + fCryo[i10] * w10 + fCryo[i11] * w11
                    + detail * 0.018
                : 0;

            const isWater = hasOcean && baseH <= f.seaLevel;
            // Land-only fields are not fetched for ocean texels — on a class-8
            // world that skips four field reads for 80% of the map.
            let elev = 0, moist = 0.5, slope = 0, ao = 1;
            if (!isWater) {
                ao = fAo[i00] * w00 + fAo[i01] * w01 + fAo[i10] * w10 + fAo[i11] * w11;
                if (!isBanded) {
                    elev = clamp01(fElev[i00] * w00 + fElev[i01] * w01 + fElev[i10] * w10 + fElev[i11] * w11
                        + detail * 0.05);
                    moist = clamp01(fMoist[i00] * w00 + fMoist[i01] * w01 + fMoist[i10] * w10 + fMoist[i11] * w11
                        + detail * 0.12 - dryBias * 0.3);
                    slope = clamp01((fSlope[i00] * w00 + fSlope[i01] * w01 + fSlope[i10] * w10 + fSlope[i11] * w11) * 1.15);
                } else {
                    elev = baseH;
                }
            }

            // Relief carved at full resolution, accumulated by the branches below
            // and folded into hiHeight afterwards so the normal map creases along
            // exactly the features the colour map shows.
            let relief = 0;

            if (isWater) {
                // Depth as a 0..1 shore-to-abyss value; the ramp is authored
                // deep-first so the shallow end lands on the coast.
                const depth = clamp01((f.seaLevel - baseH) / Math.max(1e-3, f.seaLevel));
                rampColour(style.water, 1 - depth, c);
                // THREE-STEP COAST. A single wide shelf gradient reads as a soft
                // halo; a shelf, then a dark drop-off, then a bright surf
                // hairline reads as a coastline, because the eye locks onto the
                // value ALTERNATION rather than the ramp.
                //
                // 1. shelf — bright shallow water out to ~9% of the depth range.
                const shelf = smoothstep(0.09, 0.0, depth);
                c[0] = mix(c[0], shallowest[0], shelf * 0.7);
                c[1] = mix(c[1], shallowest[1], shelf * 0.7);
                c[2] = mix(c[2], shallowest[2], shelf * 0.7);
                // 2. shelf break — a narrow darker band just outside it, so the
                //    shallows have an outer edge and the continent has weight.
                const drop = smoothstep(0.07, 0.13, depth) * smoothstep(0.26, 0.15, depth);
                const dim = 1 - drop * 0.24;
                c[0] *= dim; c[1] *= dim; c[2] *= dim;
                // 3. surf — a hairline of foam right against the land.
                const surf = smoothstep(0.02, 0.0, depth) * surfStrength;
                if (surf > 0) {
                    c[0] = mix(c[0], foam[0], surf);
                    c[1] = mix(c[1], foam[1], surf);
                    c[2] = mix(c[2], foam[2], surf);
                }
                // BATHYMETRY. A depth ramp alone gives a smooth gradient from
                // coast to abyss and an ocean world becomes one enormous flat
                // wash — which on a class-8 planet is most of the visible disc.
                // Reusing the curvature term under water puts mid-ocean ridges,
                // fracture zones and abyssal plains in the water the same way it
                // puts ranges and basins on the land, at no extra cost: the
                // field is already built, it was simply skipped for sea texels.
                const floor = fAoSea[i00] * w00 + fAoSea[i01] * w01 + fAoSea[i10] * w10 + fAoSea[i11] * w11;
                const bathy = 1 + (floor - 1) * (0.35 + depth * 0.5) + grain * 0.05;
                c[0] *= bathy; c[1] *= bathy; c[2] *= bathy;
            } else if (isBanded) {
                // Gas-giant class: colour comes straight off the band field, and
                // "elevation" is really band intensity.
                rampColour(style.land, clamp01(baseH * 1.02 - 0.01), c);
                const swirl = 1 + grain * 0.07;
                c[0] *= swirl; c[1] *= swirl; c[2] *= swirl;
                // Polar hood: the zonal jets die out at high latitude, so the
                // banding dissolves into a darker, mottled cap.
                if (hood) {
                    const hoodMix = smoothstep(0.58, 0.99, cryo) * hoodStrength;
                    if (hoodMix > 0) {
                        c[0] = mix(c[0], hood[0], hoodMix);
                        c[1] = mix(c[1], hood[1], hoodMix);
                        c[2] = mix(c[2], hood[2], hoodMix);
                    }
                }
            } else {
                rampColour(style.land, elev, c);

                // --- FULL-RESOLUTION MOUNTAIN TEXTURE ------------------------
                // The field carries where the ranges ARE; this carries what they
                // are MADE of. Ridged noise at 34x sphere frequency puts spurs,
                // gullies and scree between the summits at roughly one feature
                // per three texels, which is the scale that survives a 4x zoom
                // and the scale a 512-wide field physically cannot represent.
                //
                // Weighted by elevation AND slope so lowland plains stay smooth:
                // sprinkling ridged noise uniformly is what makes a procedural
                // world look like sandpaper instead of geology.
                if (ruggedAmt > 0) {
                    const rug = ridged(dx * 26, sy * 26, dz * 26, f.seed + 4177, 3) - 0.42;
                    const where = (0.18 + slope * 0.8) * (0.3 + elev * 0.8);
                    const k = rug * ruggedAmt * where;
                    relief += k * 0.06;
                    // Crests catch light, gullies lose it. Kept in the albedo as
                    // well as the normal because the legacy single-texture path
                    // has no normal map to fall back on. Held to a third of a
                    // stop: past that the terrain reads as corrugated metal
                    // rather than as ground.
                    const tone = 1 + k * 0.3;
                    c[0] *= tone; c[1] *= tone; c[2] *= tone;
                }

                // --- DRAINAGE NETWORK ----------------------------------------
                // Folding fBm about its median and thresholding near the ceiling
                // isolates the median LEVEL SET — a branching web of thin curves,
                // not a field of blobs. That is topologically what a river system
                // is, and it is the same trick lavaVein() uses for fissures.
                //
                // Gated three ways so the network reads as drainage rather than
                // as scribble: downhill only (elevation window), wet only, and
                // strongest in concave ground, where water actually collects.
                if (riverAmt > 0 && elev > 0.03) {
                    const rn = fbm(dx * 12.5 + 4.1, sy * 12.5, dz * 12.5, f.seed + 7331, 3);
                    const chan = 1 - Math.abs(rn * 2 - 1);
                    // Trunk streams are wider than headwaters, so the threshold
                    // widens as the ground drops toward the sea — but it has to
                    // CLOSE again in the last few percent above sea level, or
                    // every coastline grows a continuous dark fringe and the
                    // continents look outlined in ink.
                    const width = 0.988 - (1 - elev) * 0.012;
                    let river = smoothstep(width - 0.016, width + 0.005, chan);
                    river *= smoothstep(0.02, 0.11, elev) * smoothstep(0.9, 0.34, elev)
                        * (0.3 + moist * 0.85);
                    river *= 1 - smoothstep(0.55, 0.95, slope);   // not on cliffs
                    river *= riverAmt;
                    if (river > 0.004) {
                        c[0] = mix(c[0], riverTint[0], river * 0.8);
                        c[1] = mix(c[1], riverTint[1], river * 0.8);
                        c[2] = mix(c[2], riverTint[2], river * 0.8);
                        relief -= river * 0.05;                   // incised valley
                    }
                }

                // Two-axis biome model: dryness pulls toward the arid colour,
                // cold pulls toward the tundra colour. Both edges are the
                // measured coverage quantiles from buildFields, so the deserts
                // and the polar wash each occupy the fraction of the globe the
                // class asked for. Cheap, and it produces latitude-banded biomes
                // without any explicit banding.
                if (aridStrength > 0) {
                    const dry = smoothstep(aridOnset, aridFull, 1 - moist) * aridStrength;
                    c[0] = mix(c[0], arid[0], dry);
                    c[1] = mix(c[1], arid[1], dry);
                    c[2] = mix(c[2], arid[2], dry);
                }
                if (chillStrength > 0) {
                    const chill = smoothstep(tundraOnset, iceOnset, cryo) * chillStrength;
                    c[0] = mix(c[0], cold[0], chill);
                    c[1] = mix(c[1], cold[1], chill);
                    c[2] = mix(c[2], cold[2], chill);
                }

                // Exposed rock on steep ground — cliffs and scarps.
                const bare = smoothstep(0.28, 0.72, slope);
                c[0] = mix(c[0], rock[0], bare * 0.7);
                c[1] = mix(c[1], rock[1], bare * 0.7);
                c[2] = mix(c[2], rock[2], bare * 0.7);

                // Beach line, only where there is actually a sea to have a beach.
                // Narrow: a wide beach reads as a glow around every landmass.
                if (hasBeach) {
                    const beach = smoothstep(0.026, 0.0, elev);
                    c[0] = mix(c[0], shore[0], beach * 0.85);
                    c[1] = mix(c[1], shore[1], beach * 0.85);
                    c[2] = mix(c[2], shore[2], beach * 0.85);
                }
            }

            // Ice. Applies over land AND sea (pack ice). Because the cryosphere
            // field is latitude plus a cubed snowline term, the sheet sits on the
            // pole and sends white FINGERS down the mountain chains, which is the
            // "caps that follow terrain, not a straight line" read.
            if (hasIce) {
                const ice = smoothstep(iceLo, iceHi, cryo + (isWater ? f.iceSoft * 0.5 : 0));
                if (ice > 0) {
                    const icy = ice * (isWater ? 0.94 : 1);
                    // A cap is a SHEET, and a sheet has structure: sastrugi
                    // stripes combed by the katabatic wind, crevasse fields where
                    // the ice flows over relief, and blue exposures in the
                    // crevasse floors. Without them the cap is a white blob and
                    // reads as a rendering fault sitting on the disc rather than
                    // as ice. (This was the single worst-called-out surface in the
                    // last review, on class 10's north cap.)
                    const sastrugi = vnoise(dx * 41, sy * 132, dz * 41, f.seed + 5153) - 0.5;
                    const crevField = 1 - Math.abs(fbm(dx * 21, sy * 21, dz * 21, f.seed + 6047, 3) * 2 - 1);
                    const crev = smoothstep(0.955, 0.997, crevField) * (0.35 + slope * 1.4);
                    const lift = 1 + sastrugi * 0.11 + micro * 0.07 + grain * 0.05;
                    let t0 = capCol[0] * lift, t1 = capCol[1] * lift, t2 = capCol[2] * lift;
                    // Blue ice: deep firn is genuinely cyan, and it is what stops
                    // a cap from clipping to a flat 255 plateau.
                    t0 = mix(t0, t0 * 0.66, crev);
                    t1 = mix(t1, t1 * 0.84, crev);
                    t2 = mix(t2, Math.min(255, t2 * 1.02), crev);
                    c[0] = mix(c[0], t0, icy);
                    c[1] = mix(c[1], t1, icy);
                    c[2] = mix(c[2], t2, icy);
                    // The sheet is DOMED and it is thick — several hundred metres
                    // of relief the underlying terrain does not have. Putting it
                    // in the height is what gives the cap an edge under the light
                    // instead of a painted boundary.
                    relief += icy * 0.055 + sastrugi * icy * 0.02 - crev * icy * 0.03;
                }
            }

            // Lava variant: molten fissures in the deepest fractures. Stays
            // inside the class hue (orange world, orange lava) on purpose.
            if (lavaAmt > 0 && !isWater) {
                const vein = lavaVein(dx, sy, dz, f.seed, elev) * lavaAmt;
                if (vein > 0) {
                    c[0] = mix(c[0], 255, vein * 0.92);
                    c[1] = mix(c[1], 116, vein * 0.88);
                    c[2] = mix(c[2], 40, vein * 0.88);
                }
            }

            // The micro term is deliberately almost absent from the HEIGHT even
            // though it is prominent in the albedo: at ~3 texels per cell it is
            // finer than the normal map can carry without turning the whole
            // surface into crumpled foil. Grain belongs in colour, relief in
            // shape.
            hiHeight[i] = isWater ? 0 : elev + detail * 0.022 + micro * 0.0035 + relief;

            // Baked curvature shading + two grades of grain. `ao` is already a
            // multiplier centred on 1: below it in hollows, above it on crests.
            // The micro term is the material grain — half a stop of variation at
            // the two-texel scale, which is what stops a large flat region (an
            // ocean, a desert, an ice sheet) from reading as a solid fill.
            const shade = ao * (1 + grain * 0.055 + micro * (isWater ? 0.05 : 0.085));
            tmp[0] = c[0] * shade; tmp[1] = c[1] * shade; tmp[2] = c[2] * shade;

            const o = i * 4;
            px[o] = tmp[0] < 0 ? 0 : (tmp[0] > 255 ? 255 : tmp[0]);
            px[o + 1] = tmp[1] < 0 ? 0 : (tmp[1] > 255 ? 255 : tmp[1]);
            px[o + 2] = tmp[2] < 0 ? 0 : (tmp[2] > 255 ? 255 : tmp[2]);
            px[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);

    return { canvas, hiHeight, W, H };
}

/**
 * Height -> tangent-space normal map.
 *
 * The horizontal derivative is divided by cos(latitude) because one texel of
 * longitude covers cos(lat) as much ground: without the correction the poles
 * grow a ring of violently over-lit noise. The divisor is clamped so the last
 * few rows do not explode.
 */
function paintNormal(surface, f) {
    const W = surface.W, H = surface.H;
    const h = surface.hiHeight;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const px = img.data;

    // Relief strength is a per-class art decision, not a constant: a cratered
    // airless rock and a gas envelope want opposite answers, and baking it here
    // means both consumers get the right look without knowing anything.
    // Two numbers set the relief: `strength` scales the gradient and `flat`
    // is the out-of-surface component it is compared against. The pair was
    // (2.6, 1/32), which puts a 0.01-per-texel slope at 40 degrees off vertical
    // — every ridge saturated, and the surface came back as hammered foil once
    // full-resolution detail existed to saturate. (2.1, 1/11) puts the same
    // slope at 12 degrees and lets the big landforms, not the grain, carry the
    // shading.
    const strength = 2.1 * (f.style.normalStrength === undefined ? 1 : f.style.normalStrength);
    const flat = 1 / 11;
    for (let y = 0; y < H; y++) {
        const lat = (0.5 - (y + 0.5) / H) * Math.PI;
        const inv = 1 / Math.max(0.22, Math.cos(lat));
        const row = y * W;
        const rowUp = Math.max(0, y - 1) * W;
        const rowDn = Math.min(H - 1, y + 1) * W;
        for (let x = 0; x < W; x++) {
            const xl = (x + W - 1) % W, xr = (x + 1) % W;
            const gx = (h[row + xr] - h[row + xl]) * 0.5 * inv * strength;
            const gy = (h[rowDn + x] - h[rowUp + x]) * 0.5 * strength;
            // Tangent space: +X right, +Y up in UV, +Z out of the surface.
            let nx = -gx, ny = gy, nz = flat;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= len; ny /= len; nz /= len;
            const o = (row + x) * 4;
            px[o] = (nx * 0.5 + 0.5) * 255;
            px[o + 1] = (ny * 0.5 + 0.5) * 255;
            px[o + 2] = (nz * 0.5 + 0.5) * 255;
            px[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

/**
 * Roughness (G) + metalness (B) in one texture, the standard packed layout. One
 * texture object is handed to both material slots, so the memory is paid once.
 *
 * Water is the point of this map: at roughness ~0.08 a dielectric ocean throws a
 * tight specular glint back at the key light, and the neighbouring land at ~0.92
 * throws nothing. That contrast is most of what separates "a painted ball" from
 * "a world with seas".
 */
function paintOrm(f) {
    const W = ORM_W, H = ORM_H;
    const style = f.style;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const px = img.data;
    const scaleX = f.W / W, scaleY = f.H / H;
    const metal = style.metal === undefined ? 0.02 : style.metal;

    for (let y = 0; y < H; y++) {
        const fy = (y + 0.5) * scaleY - 0.5;
        for (let x = 0; x < W; x++) {
            const fx = (x + 0.5) * scaleX - 0.5;
            const baseH = sampleField(f.base, f.W, f.H, fx, fy);
            const moist = sampleField(f.moisture, f.W, f.H, fx, fy);
            const elev = sampleField(f.elev, f.W, f.H, fx, fy);
            const isWater = f.oceanTarget > 0 && baseH <= f.seaLevel;

            let rough = isWater ? style.roughWater : style.roughLand;
            if (!isWater) {
                // Damp ground is a little glossier than dust; peaks are dustier.
                rough = clamp01(rough - moist * 0.1 + elev * 0.05);
            }
            if (f.iceThreshold > -Infinity) {
                // Same edge the albedo uses, so the glossy-ice band lines up with
                // the white it is meant to explain.
                const cryo = sampleField(f.cryo, f.W, f.H, fx, fy);
                const ice = smoothstep(f.iceThreshold - f.iceSoft * 0.5, f.iceThreshold + f.iceSoft * 0.5, cryo);
                rough = mix(rough, style.roughIce, ice);
            }
            const o = (y * W + x) * 4;
            px[o] = 255;                                  // unused (AO is baked)
            px[o + 1] = clamp01(rough) * 255;             // roughness
            px[o + 2] = clamp01(metal) * 255;             // metalness
            px[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

/**
 * Night-side city lights and surface glow.
 *
 * Cities are not scattered uniformly: a low-frequency "settlement" field decides
 * which regions were colonised at all, habitability decides whether a texel
 * could support anyone, and a coast bonus pulls the result onto shorelines the
 * way every real population map does. The bright cores are drawn as points and a
 * broad low-alpha sky-glow pass underneath keeps them from looking like dust.
 *
 * Returns null when a class has neither lights nor surface glow — no texture, no
 * memory, no wasted shader work.
 */
function paintEmissive(f) {
    const style = f.style, mod = f.mod;
    const lightAmt = (style.lights || 0) * (mod.lights === undefined ? 1 : mod.lights);
    const glowStops = style.glow;
    const glowAmt = glowStops ? (style.glowCoverage || 0.1) * (mod.glow === undefined ? 1 : mod.glow) : 0;
    const lavaAmt = mod.lava || 0;
    if (lightAmt <= 0 && glowAmt <= 0 && lavaAmt <= 0) return null;

    const W = AUX_W, H = AUX_H;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const scaleX = f.W / W, scaleY = f.H / H;

    // Sphere directions, hoisted: Math.sin/cos in the inner loop was the single
    // most expensive thing in this pass.
    const sinLat = new Float64Array(H), cosLat = new Float64Array(H);
    for (let y = 0; y < H; y++) {
        const lat = (0.5 - (y + 0.5) / H) * Math.PI;
        sinLat[y] = Math.sin(lat); cosLat[y] = Math.cos(lat);
    }
    const sinLon = new Float64Array(W), cosLon = new Float64Array(W);
    for (let x = 0; x < W; x++) {
        const lon = ((x + 0.5) / W) * Math.PI * 2;
        sinLon[x] = Math.sin(lon); cosLon[x] = Math.cos(lon);
    }

    // --- surface glow (irradiated bands, lava fissures) --------------------
    if (glowAmt > 0 || lavaAmt > 0) {
        const img = ctx.getImageData(0, 0, W, H);
        const px = img.data;
        for (let y = 0; y < H; y++) {
            const fy = (y + 0.5) * scaleY - 0.5;
            const sy = sinLat[y], cy = cosLat[y];
            for (let x = 0; x < W; x++) {
                const dx = cy * cosLon[x], dz = cy * sinLon[x];
                const fx = (x + 0.5) * scaleX - 0.5;
                const baseH = sampleField(f.base, f.W, f.H, fx, fy);
                const elev = sampleField(f.elev, f.W, f.H, fx, fy);
                let r = 0, g = 0, b = 0;
                if (glowAmt > 0) {
                    // Luminous veins tracking the brightest band crests.
                    const vein = smoothstep(0.68, 0.94, baseH + (fbm(dx * 11, sy * 11, dz * 11, f.seed + 4099, 3) - 0.5) * 0.5);
                    const hueMix = clamp01(fbm(dx * 3.3, sy * 3.3, dz * 3.3, f.seed + 1231, 2) * 1.6 - 0.3);
                    const c0 = glowStops[0], c1 = glowStops[1];
                    const k = vein * clamp01(glowAmt * 6);
                    r += mix(c0[0], c1[0], hueMix) * k;
                    g += mix(c0[1], c1[1], hueMix) * k;
                    b += mix(c0[2], c1[2], hueMix) * k;
                }
                if (lavaAmt > 0) {
                    const k = lavaVein(dx, sy, dz, f.seed, elev) * lavaAmt;
                    r += 255 * k; g += 104 * k; b += 28 * k;
                }
                const o = (y * W + x) * 4;
                px[o] = r > 255 ? 255 : r;
                px[o + 1] = g > 255 ? 255 : g;
                px[o + 2] = b > 255 ? 255 : b;
                px[o + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    // --- city lights -------------------------------------------------------
    if (lightAmt > 0) {
        const lc = style.lightColor || [255, 214, 150];
        const rand = seededRandom(f.seed ^ 0x2c9e);
        ctx.globalCompositeOperation = 'lighter';

        // Pass 1: broad sky glow over settled regions.
        // Pass 2: individual light points inside it.
        const cells = [];
        for (let y = 0; y < H; y++) {
            const cy = cosLat[y], sy = sinLat[y];
            const fy = (y + 0.5) * scaleY - 0.5;
            for (let x = 0; x < W; x++) {
                const fx = (x + 0.5) * scaleX - 0.5;
                const baseH = sampleField(f.base, f.W, f.H, fx, fy);
                if (f.oceanTarget > 0 && baseH <= f.seaLevel) continue;      // no cities at sea
                const elev = sampleField(f.elev, f.W, f.H, fx, fy);
                const temperature = sampleField(f.temp, f.W, f.H, fx, fy);
                const slope = sampleField(f.slope, f.W, f.H, fx, fy);

                // Habitability: low ground, temperate, not a cliff, not iced.
                let hab = smoothstep(0.75, 0.28, elev) * smoothstep(0.2, 0.5, temperature)
                    * smoothstep(0.85, 0.35, slope);
                if (f.iceThreshold > -Infinity) {
                    const cryo = sampleField(f.cryo, f.W, f.H, fx, fy);
                    hab *= 1 - smoothstep(f.iceThreshold - 0.1, f.iceThreshold, cryo);
                }
                if (hab <= 0.02) continue;
                const moist = sampleField(f.moisture, f.W, f.H, fx, fy);
                hab *= 0.45 + moist * 0.55;

                // Which regions got colonised at all.
                const dx = cy * cosLon[x], dz = cy * sinLon[x];
                const region = clamp01((fbm(dx * 2.7, sy * 2.7, dz * 2.7, f.seed + 6151, 3) - 0.42) * 4.2);
                if (region <= 0.02) continue;

                // Coasts win. Every real population map is a coastline map.
                const coast = f.oceanTarget > 0.02 ? smoothstep(0.16, 0.0, elev) : 0;
                const density = clamp01(hab * region * (0.4 + coast * 1.15)) * lightAmt;
                if (density > 0.05) cells.push(x, y, density);
            }
        }

        // Sky glow.
        for (let i = 0; i < cells.length; i += 3) {
            const d = cells[i + 2];
            if (d < 0.3 || rand() > 0.05) continue;
            const x = cells[i], y = cells[i + 1];
            const r = 3 + d * 9;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, `rgba(${lc[0]},${lc[1]},${lc[2]},${0.1 * d})`);
            grad.addColorStop(1, `rgba(${lc[0]},${lc[1]},${lc[2]},0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
            if (x < r) ctx.fillRect(x - r + W, y - r, r * 2, r * 2);
            if (x > W - r) ctx.fillRect(x - r - W, y - r, r * 2, r * 2);
        }

        // Light points. The probability is density-cubed so the bright cores
        // concentrate hard into a few conurbations instead of dusting evenly.
        for (let i = 0; i < cells.length; i += 3) {
            const d = cells[i + 2];
            const p = d * d * d * 0.9;
            if (rand() > p) continue;
            const x = cells[i], y = cells[i + 1];
            const a = 0.35 + d * 0.65;
            ctx.fillStyle = `rgba(${lc[0]},${lc[1]},${lc[2]},${a})`;
            ctx.fillRect(x, y, 1, 1);
            if (rand() < d * 0.35) {
                ctx.fillStyle = `rgba(255,244,220,${a * 0.8})`;
                ctx.fillRect(x + (rand() < 0.5 ? 1 : -1), y, 1, 1);
            }
        }
        ctx.globalCompositeOperation = 'source-over';
    }

    return canvas;
}

/**
 * The cloud deck, as its own RGBA texture so a consumer can put it on a slightly
 * larger sphere and rotate it at a different rate from the surface.
 *
 * Coverage is an area quantile again (a "55% cloudy" world really is 55% covered),
 * the sample point is sheared by latitude to produce the zonal streaking that
 * makes a cloud layer read as weather rather than fog, and a few cyclones are
 * stamped in by rotating the sample point around storm centres.
 */
function paintClouds(f) {
    const style = f.style, mod = f.mod;
    const cover = clamp01((style.cloudCover || 0) * (mod.cloud === undefined ? 1 : mod.cloud));
    if (cover <= 0.005) return null;

    const W = CLOUD_W, H = CLOUD_H;
    const field = new Float32Array(W * H);
    const rowWeight = new Float64Array(H);
    const sinLat = new Float64Array(H), cosLat = new Float64Array(H);
    for (let y = 0; y < H; y++) {
        const lat = (0.5 - (y + 0.5) / H) * Math.PI;
        sinLat[y] = Math.sin(lat); cosLat[y] = Math.cos(lat);
        rowWeight[y] = Math.max(1e-4, Math.cos(lat));
    }
    const sinLon = new Float64Array(W), cosLon = new Float64Array(W);
    for (let x = 0; x < W; x++) {
        const lon = ((x + 0.5) / W) * Math.PI * 2;
        sinLon[x] = Math.sin(lon); cosLon[x] = Math.cos(lon);
    }

    // Storm centres, seeded so they never move between runs.
    const rand = seededRandom(f.seed ^ 0x7ab1);
    const stormCount = mod.storms || (f.bandStrength > 0.5 ? 2 : 1);
    const storms = [];
    for (let i = 0; i < stormCount; i++) {
        const lat = (rand() * 0.7 - 0.35) * Math.PI * (rand() < 0.5 ? 1 : -1) + (rand() - 0.5) * 0.3;
        const lon = rand() * Math.PI * 2;
        const cl = Math.cos(lat);
        storms.push({
            x: cl * Math.cos(lon), y: Math.sin(lat), z: cl * Math.sin(lon),
            r: 0.18 + rand() * 0.16,
            spin: (rand() < 0.5 ? -1 : 1) * (2.4 + rand() * 2.2)
        });
    }

    const seed = f.seed + 20011;
    for (let y = 0; y < H; y++) {
        const sy = sinLat[y], cy = cosLat[y];
        const absLat = Math.abs(sy);
        const row = y * W;
        // Zonal shear: bands of atmosphere slide past each other, which is what
        // stretches clouds into east-west streaks.
        const shear = Math.sin(sy * Math.PI * 2.6) * 0.55;
        for (let x = 0; x < W; x++) {
            let dx = cy * cosLon[x], dy = sy, dz = cy * sinLon[x];

            // Cyclones: rotate the sample point about the storm axis by an angle
            // that decays with distance. A spiral falls out of the shear for free.
            for (let s = 0; s < storms.length; s++) {
                const st = storms[s];
                const dot = dx * st.x + dy * st.y + dz * st.z;
                const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
                if (ang > st.r * 2.4) continue;
                const t = 1 - clamp01(ang / (st.r * 2.4));
                const theta = st.spin * t * t;
                const cA = Math.cos(theta), sA = Math.sin(theta);
                // Rodrigues rotation about the storm axis.
                const kx = st.x, ky = st.y, kz = st.z;
                const kd = kx * dx + ky * dy + kz * dz;
                const crx = ky * dz - kz * dy;
                const cry = kz * dx - kx * dz;
                const crz = kx * dy - ky * dx;
                dx = dx * cA + crx * sA + kx * kd * (1 - cA);
                dy = dy * cA + cry * sA + ky * kd * (1 - cA);
                dz = dz * cA + crz * sA + kz * kd * (1 - cA);
            }

            const sx = dx + shear * 0.35;
            let v = fbm(sx * 2.4, dy * 4.2, dz * 2.4, seed, 5, 0.55);
            v += (fbm(sx * 7.5, dy * 11, dz * 7.5, seed + 71, 3) - 0.5) * 0.42;
            // Cirrus: a thin, much higher-frequency, strongly zonal layer on top
            // of the cumulus mass. Without it the deck is one blob size and reads
            // as cotton wool; with it there are wisps and shredded edges, which
            // is what makes a cloud layer look like weather in motion.
            v += (fbm(sx * 15, dy * 34, dz * 15, seed + 313, 3) - 0.5) * 0.22;
            // One more octave than the deck used to carry, because the deck is
            // now generated at the albedo's resolution and can actually resolve
            // it: this is the scale that shreds a cloud edge into filaments.
            v += (fbm(sx * 33, dy * 70, dz * 33, seed + 4517, 2) - 0.5) * 0.1;
            // Sub-tropical clear belts and a wet equator: real planets are not
            // uniformly cloudy and the contrast makes the sphere read rounder.
            v += (Math.exp(-Math.pow(absLat * 6.5, 2)) * 0.16)
                - (Math.exp(-Math.pow((absLat - 0.44) * 5.2, 2)) * 0.17);
            // Polar thinning. The galaxy map looks DOWN on these worlds, so the
            // north pole sits inside the upper half of the disc rather than on
            // its silhouette — and a cloud deck that stays dense over the cap
            // merges with it into one white mass, which is exactly what made the
            // ice read as a blob floating mid-disc. Cold air is dry anyway.
            v -= smoothstep(0.62, 0.99, absLat) * 0.26;
            field[row + x] = v;
        }
    }

    normaliseField(field);
    const threshold = coverageThreshold(field, W, H, rowWeight, cover);

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const px = img.data;
    const tint = style.cloudTint || [255, 255, 255];
    // Soft edge width scaled to how much headroom is left above the threshold,
    // so a heavily-clouded world does not clip to a hard-edged blanket.
    const soft = Math.max(0.03, (1 - threshold) * 0.34);
    for (let i = 0; i < field.length; i++) {
        const a = smoothstep(threshold - soft * 0.25, threshold + soft, field[i]);
        const o = i * 4;
        // Thicker cloud is brighter as well as more opaque, and the thin ragged
        // margins stay translucent so the surface shows through them.
        const lift = 0.74 + a * 0.26;
        px[o] = tint[0] * lift;
        px[o + 1] = tint[1] * lift;
        px[o + 2] = tint[2] * lift;
        px[o + 3] = a * a * (3 - 2 * a) * 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

// ===========================================================================
// STARS
//
// A star is the most expensive object a sector can contain and it was the
// least rendered thing on the map: one flat fill on a MeshBasicMaterial, on a
// tile only 20% darker than itself. It has to carry three separate techniques
// to read as a self-luminous body rather than a coloured circle:
//
//   1. GRANULATION, baked. Convection cells with dark intergranular lanes,
//      bright faculae along the lane network, a supergranule envelope and a few
//      real spots. Sampled in 3D like every other field here, so it wraps.
//
//   2. LIMB DARKENING, in the shader. This CANNOT be baked: it depends on the
//      angle between the surface normal and the eye, so it has to move when the
//      camera does. pow(mu, 0.9) is the classic grey-atmosphere law (mu is
//      cos of the emergent angle, and pow(1 - r^2, 0.45) is the same thing
//      written in disc coordinates). The edge also shifts hue toward the ember
//      limb colour, because the layers you see obliquely are cooler.
//
//   3. CORONA, as a separate additive sprite with a CONTINUOUS exp() falloff —
//      not colour stops, which band — plus radial spicules and an ordered
//      dither, so a big soft glow has no visible rings in an 8-bit buffer.
// ===========================================================================

/**
 * The default star look, and the tile colour that has to sit under it.
 *
 * `tile` is not used by this module — it is published here so the map agrees
 * with itself. A star disc on a tile of nearly its own colour separates by
 * about 20% luminance and reads as a sticker; against this ember it separates
 * by roughly 250% and reads as a light source.
 */
export const STAR_PALETTE = {
    core: [255, 243, 196],
    mid: [242, 132, 58],
    limb: [196, 61, 26],
    corona: [255, 150, 74],
    tile: [74, 33, 19]
};

const STAR_W = 1024, STAR_H = 512;
const CORONA_SIZE = 512;
/** Sprite half-width, in star radii. The corona is gone well before this. */
const CORONA_REACH = 2.9;
const BLOOM_SIZE = 256;
/** Bloom half-width, in star radii. Wide and very faint — this is the light the
 *  star throws into its own tile, and it is what stops the disc from looking
 *  pasted onto the background. */
const BLOOM_REACH = 9;

/**
 * Derive a full star palette from one base colour, so a map that already
 * assigns per-star colours keeps its variety. Hue and saturation are preserved;
 * only value and the limb shift are synthesised.
 */
export function starPaletteFrom(rgb) {
    if (!rgb) return STAR_PALETTE;
    const r = rgb[0], g = rgb[1], b = rgb[2];
    const mx = Math.max(1, r, g, b);
    const nr = r / mx, ng = g / mx, nb = b / mx;
    return {
        core: [255 * (nr + (1 - nr) * 0.9), 255 * (ng + (1 - ng) * 0.84), 255 * (nb + (1 - nb) * 0.72)],
        mid: [r, g, b],
        // Proportional darkening with a mild warm bias: obliquely-seen layers
        // are cooler, but a blue star must not turn orange at its edge.
        limb: [r * 0.86, g * 0.6, b * 0.52],
        corona: [Math.min(255, r * 1.05), g * 0.92, b * 0.86],
        tile: [r * 0.3, g * 0.25, b * 0.32]
    };
}

/**
 * Photosphere. Granulation is a CELL NETWORK, not blobs: folding value noise
 * about its median and thresholding near zero picks out the median level set,
 * which is the closed web of intergranular lanes between convection cells.
 * Thresholding the raw noise instead gives round patches and the surface reads
 * as camouflage — the same distinction lavaVein() relies on.
 */
function paintStarSurface(palette, seed) {
    const W = STAR_W, H = STAR_H;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const px = img.data;

    const sinLat = new Float64Array(H), cosLat = new Float64Array(H);
    for (let y = 0; y < H; y++) {
        const lat = (0.5 - (y + 0.5) / H) * Math.PI;
        sinLat[y] = Math.sin(lat); cosLat[y] = Math.cos(lat);
    }
    const sinLon = new Float64Array(W), cosLon = new Float64Array(W);
    for (let x = 0; x < W; x++) {
        const lon = ((x + 0.5) / W) * Math.PI * 2;
        sinLon[x] = Math.sin(lon); cosLon[x] = Math.cos(lon);
    }

    // Spots: umbra, penumbra, seeded, biased to the activity latitudes.
    const rand = seededRandom((seed | 0) ^ 0x51a7);
    const spots = [];
    const spotCount = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < spotCount; i++) {
        const lat = (0.12 + rand() * 0.34) * (rand() < 0.5 ? 1 : -1);
        const lon = rand() * Math.PI * 2;
        const cl = Math.cos(lat * Math.PI * 0.5);
        spots.push({
            x: cl * Math.cos(lon), y: Math.sin(lat * Math.PI * 0.5), z: cl * Math.sin(lon),
            r: 0.035 + rand() * 0.055
        });
    }

    const core = palette.core, mid = palette.mid, limb = palette.limb;
    const floorCol = [mid[0] * 0.68 + limb[0] * 0.3, mid[1] * 0.68 + limb[1] * 0.3, mid[2] * 0.68 + limb[2] * 0.3];

    for (let y = 0; y < H; y++) {
        const sy = sinLat[y], cy = cosLat[y];
        for (let x = 0; x < W; x++) {
            const dx = cy * cosLon[x], dz = cy * sinLon[x];

            // Supergranulation: the slow, large-scale brightness envelope.
            const superG = fbm(dx * 3.8, sy * 3.8, dz * 3.8, seed + 11, 3) - 0.5;

            // Granule cells at two scales. `1 - |2n-1|` peaks on the median level
            // set; inverting it makes the cell INTERIORS bright and the lanes
            // between them dark, which is the actual structure of a photosphere.
            const n1 = vnoise(dx * 64, sy * 64, dz * 64, seed + 4441);
            const lane1 = 1 - smoothstep(0.0, 0.24, Math.abs(n1 * 2 - 1));
            const n2 = vnoise(dx * 152, sy * 152, dz * 152, seed + 8887);
            const lane2 = 1 - smoothstep(0.0, 0.3, Math.abs(n2 * 2 - 1));
            const lanes = clamp01(lane1 * 0.8 + lane2 * 0.44);

            // Faculae: the lane network glows brighter than the cells where the
            // magnetic field is strong, which breaks the regularity.
            const active = clamp01((fbm(dx * 6.2, sy * 6.2, dz * 6.2, seed + 2027, 2) - 0.46) * 5);
            const grain = vnoise(dx * 150, sy * 150, dz * 150, seed + 909) - 0.5;

            let bright = clamp01(0.7 + superG * 0.5 - lanes * 0.5 + lanes * active * 0.8 + grain * 0.09);

            // Spots. Umbra ~35% of the local brightness, penumbra a soft collar
            // with a filamentary edge.
            for (let s = 0; s < spots.length; s++) {
                const sp = spots[s];
                const dot = dx * sp.x + sy * sp.y + dz * sp.z;
                if (dot < 0.9) continue;
                const ang = Math.acos(Math.min(1, dot));
                const filament = (vnoise(dx * 44, sy * 44, dz * 44, seed + 3181) - 0.5) * 0.35;
                const d = ang / sp.r + filament;
                if (d > 1.5) continue;
                bright *= mix(1, 0.2, 1 - smoothstep(0.55, 1.35, d));
            }

            // Ramp: floor -> mid -> core as the surface brightens.
            let r, g, b;
            if (bright < 0.5) {
                const t = bright * 2;
                r = mix(floorCol[0], mid[0], t);
                g = mix(floorCol[1], mid[1], t);
                b = mix(floorCol[2], mid[2], t);
            } else {
                const t = (bright - 0.5) * 2;
                r = mix(mid[0], core[0], t);
                g = mix(mid[1], core[1], t);
                b = mix(mid[2], core[2], t);
            }
            const o = (y * W + x) * 4;
            px[o] = r > 255 ? 255 : r;
            px[o + 1] = g > 255 ? 255 : g;
            px[o + 2] = b > 255 ? 255 : b;
            px[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

/**
 * Corona sprite: RGB carries the hue, ALPHA carries the intensity, so an
 * additive sprite contributes colour*alpha exactly once.
 *
 * Why per-pixel rather than a canvas radial gradient: a CanvasGradient with a
 * handful of stops quantises to visible concentric rings in an 8-bit buffer,
 * which is the single most recognisable "this is a CSS radial-gradient" tell.
 * A continuous exp() plus a 4x4 ordered dither of about +-1.5/255 breaks the
 * contour lines below the threshold where the eye assembles them into rings.
 */
function paintCorona(palette, seed) {
    const S = CORONA_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(S, S);
    const px = img.data;
    const half = S / 2;

    // Spicules: a handful of faint radial streamers. Precomputed into an angular
    // LUT because evaluating eight pow() terms per pixel over a quarter of a
    // million pixels is the whole cost of this function otherwise.
    const rand = seededRandom((seed | 0) ^ 0x7c31);
    // Many broad streamers, not a few sharp ones: eight hard rays render as a
    // photographic lens flare, which is exactly the sleek look this art
    // direction rejects. Fourteen soft ones read as a corona.
    const RAYS = 14;
    const phase = [], amp = [], sharp = [];
    for (let i = 0; i < RAYS; i++) {
        // Irregularly spaced, not on a rosette: evenly spread rays read as a
        // lens flare rather than as streamers following a magnetic field.
        phase.push((i / RAYS) * Math.PI * 2 + (rand() - 0.5) * 0.7);
        amp.push(0.12 + rand() * 0.2);
        sharp.push(14 + rand() * 60);
    }
    const LUT = 2048;
    const rayLut = new Float32Array(LUT);
    for (let i = 0; i < LUT; i++) {
        const a = (i / LUT) * Math.PI * 2;
        let v = 0;
        for (let k = 0; k < RAYS; k++) {
            const c = Math.cos(a - phase[k]);
            if (c > 0) v += amp[k] * Math.pow(c, sharp[k]);
        }
        rayLut[i] = v;
    }

    // Ordered dither, centred on zero, +-1.5/255 at full swing.
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

    // Prominences. A star with a smooth corona and nothing else still reads as
    // an airbrushed circle; the loops are what say "this thing is violent".
    // Each is an ARCH — apex at the middle, footpoints anchored on the
    // photosphere — because that is the shape a magnetic flux tube makes, and
    // because a shape with two feet reads as standing off the limb where a blob
    // reads as a smudge on it.
    const proms = [];
    const promCount = 4 + Math.floor(rand() * 3);
    let promReach = 1.02;
    for (let i = 0; i < promCount; i++) {
        const h = 0.08 + rand() * 0.22;
        proms.push({
            a: (i / promCount) * Math.PI * 2 + (rand() - 0.5) * 0.9,
            w: 0.12 + rand() * 0.22,               // angular half-width, radians
            h,
            amp: 0.3 + rand() * 0.34,
            ph: rand() * 6.28
        });
        if (1 + h > promReach) promReach = 1 + h;
    }
    promReach += 0.06;

    const cor = palette.corona || palette.mid;
    const hot = palette.core;
    const emb = palette.limb;
    for (let y = 0; y < S; y++) {
        const dy = (y + 0.5 - half) / half;
        for (let x = 0; x < S; x++) {
            const dx = (x + 0.5 - half) / half;
            const r = Math.sqrt(dx * dx + dy * dy);
            const o = (y * S + x) * 4;
            if (r >= 1) { px[o] = px[o + 1] = px[o + 2] = px[o + 3] = 0; continue; }

            // t is in STAR RADII: 1.0 is exactly the photosphere edge.
            const t = r * CORONA_REACH;

            // Continuous falloff. Held near full out to the limb, then a clean
            // exponential decay — no stops, so no rings.
            let f = Math.exp(-3.6 * Math.max(0, t - 0.97)) * 0.78;
            // Do not blow out the granulation: the sprite is additive, so its
            // contribution over the disc itself has to stay low and only rise
            // into a bright ring as it approaches the limb.
            f *= 0.06 + 0.94 * smoothstep(0.35, 0.99, t);

            // Streamers reach further than the smooth corona does.
            const ang = Math.atan2(dy, dx);
            const li = ((ang / (Math.PI * 2) + 1) * LUT) | 0;
            const ray = rayLut[li % LUT] * Math.exp(-1.9 * Math.max(0, t - 0.9)) * 0.7;
            f = clamp01(f + ray * smoothstep(0.9, 1.35, t));

            // --- prominences -------------------------------------------------
            // A DENSITY, not an outline. The first pass drew the arch as a thin
            // filament and it came back looking like vector wireframe stuck to
            // the limb, so the loop is now a body of plasma: densest at the
            // footpoints, thinning with height, with the arch as its ceiling and
            // 3D noise chopping it into strands.
            let pv = 0;
            if (t > 0.985 && t < promReach) {
                const s = t - 1;
                for (let k = 0; k < proms.length; k++) {
                    const p = proms[k];
                    let da = ang - p.a;
                    if (da > Math.PI) da -= Math.PI * 2;
                    else if (da < -Math.PI) da += Math.PI * 2;
                    const u = da / p.w;
                    if (u < -1 || u > 1) continue;
                    const archH = p.h * Math.cos(u * Math.PI * 0.5)
                        * (1 + 0.16 * Math.sin(u * 5.1 + p.ph));
                    if (s >= archH) continue;
                    const q = s / Math.max(1e-4, archH);           // 0 base, 1 apex
                    // Column density falls off with height; a soft crest rides
                    // the ceiling so the loop still has a defined top edge.
                    let v = (1 - q) * (1 - q) * 0.8 + smoothstep(0.72, 1, q) * (1 - smoothstep(0.94, 1, q)) * 0.34;
                    v *= Math.pow(Math.max(0, Math.cos(u * Math.PI * 0.5)), 1.1);
                    // Strand structure, and a lot of it: without a wide swing the
                    // loop is a solid sail rather than a bundle of filaments.
                    v *= 0.3 + 1.15 * vnoise(u * 5.2 + p.ph, s * 30, p.ph * 3.1, 4177);
                    v *= p.amp;
                    if (v > pv) pv = v;
                }
                f = clamp01(f + pv);
            }

            // Fade to nothing before the sprite's own edge so the quad never
            // shows as a square.
            f *= smoothstep(1.0, 0.82, r);

            const dith = (BAYER[(y & 3) * 4 + (x & 3)] / 15 - 0.5) * (1.5 / 255);
            const a = clamp01(f + dith);

            // Hotter and whiter close in, cooler further out; prominences pull
            // back toward the ember limb colour, because Halpha plasma is red.
            const heat = smoothstep(1.5, 0.92, t);
            const pm = clamp01(pv * 1.1) * 0.7;
            px[o] = mix(mix(cor[0], hot[0], heat * 0.55), mix(cor[0], emb[0], 0.8), pm);
            px[o + 1] = mix(mix(cor[1], hot[1], heat * 0.55), mix(cor[1], emb[1], 0.8), pm);
            px[o + 2] = mix(mix(cor[2], hot[2], heat * 0.55), mix(cor[2], emb[2], 0.8), pm);
            px[o + 3] = a * 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

/**
 * Bloom halo: the wide, very faint veil a bright source throws across whatever
 * it sits on. Two summed exponentials — a tight one for the glare core and a
 * broad one for the veil — because a single falloff either stops too abruptly
 * or fogs the whole tile. Dithered for the same reason the corona is.
 */
function paintStarBloom(palette) {
    const S = BLOOM_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(S, S);
    const px = img.data;
    const half = S / 2;
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const cor = palette.corona || palette.mid;
    const hot = palette.core;
    for (let y = 0; y < S; y++) {
        const dy = (y + 0.5 - half) / half;
        for (let x = 0; x < S; x++) {
            const dx = (x + 0.5 - half) / half;
            const r = Math.sqrt(dx * dx + dy * dy);
            const o = (y * S + x) * 4;
            if (r >= 1) { px[o] = px[o + 1] = px[o + 2] = px[o + 3] = 0; continue; }
            const t = r * BLOOM_REACH;
            let f = Math.exp(-1.9 * t) * 0.46 + Math.exp(-0.55 * t) * 0.06;
            f *= smoothstep(1.0, 0.72, r);
            const dith = (BAYER[(y & 3) * 4 + (x & 3)] / 15 - 0.5) * (1.5 / 255);
            const heat = smoothstep(3.2, 0.6, t);
            px[o] = mix(cor[0], hot[0], heat * 0.7);
            px[o + 1] = mix(cor[1], hot[1], heat * 0.7);
            px[o + 2] = mix(cor[2], hot[2], heat * 0.7);
            px[o + 3] = clamp01(f + dith) * 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

// ===========================================================================
// ASTEROIDS
//
// The rocks were eleven copies of one flat-shaded dodecahedron sharing one grey
// MeshStandardMaterial: hard facets, no texture, no relief, no variation. They
// read as cut gems. This runs the planet pipeline at rock scale — heightfield,
// impact craters, curvature shading, derived normals — so a rock is made of the
// same material as the worlds around it.
// ===========================================================================

const ROCK_W = 256, ROCK_H = 128;
/** Distinct rocks in the pool. A field of 11 never shows a repeat. */
export const ASTEROID_VARIANTS = 6;

function paintAsteroid(variant) {
    const W = ROCK_W, H = ROCK_H, N = W * H;
    const seed = (variant * 26417 + 7919) | 0;
    const rand = seededRandom(seed ^ 0x1f3d);

    const sinLat = new Float64Array(H), cosLat = new Float64Array(H);
    for (let y = 0; y < H; y++) {
        const lat = (0.5 - (y + 0.5) / H) * Math.PI;
        sinLat[y] = Math.sin(lat); cosLat[y] = Math.cos(lat);
    }
    const sinLon = new Float64Array(W), cosLon = new Float64Array(W);
    for (let x = 0; x < W; x++) {
        const lon = ((x + 0.5) / W) * Math.PI * 2;
        sinLon[x] = Math.sin(lon); cosLon[x] = Math.cos(lon);
    }

    // Height: lumpy regolith, then a heavy crater record. A rock this small has
    // been hit far more times per unit area than a planet has.
    const height = new Float32Array(N);
    for (let y = 0; y < H; y++) {
        const sy = sinLat[y], cy = cosLat[y];
        const row = y * W;
        for (let x = 0; x < W; x++) {
            const dx = cy * cosLon[x], dz = cy * sinLon[x];
            height[row + x] = fbm(dx * 2.6, sy * 2.6, dz * 2.6, seed + 5, 4)
                + (fbm(dx * 9, sy * 9, dz * 9, seed + 331, 3) - 0.5) * 0.4;
        }
    }
    normaliseField(height);
    stampCraters(height, W, H, 26 + Math.floor(rand() * 16), rand, 1.15);
    normaliseField(height);

    // Curvature, two scales, exactly as the worlds get: crater floors go dark,
    // rims and ridges catch light, independent of where the camera is.
    const fine = boxBlur(height, W, H, 2);
    const coarse = boxBlur(height, W, H, 7);
    const ao = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        const e = height[i];
        const v = 1 + (e - fine[i]) * 2.6 + (e - coarse[i]) * 1.8;
        ao[i] = v < 0.62 ? 0.62 : (v > 1.22 ? 1.22 : v);
    }

    // Per-rock hue jitter across the carbonaceous-to-silicate range. Every rock
    // is plainly the same material; none is the same rock.
    const tone = rand();
    const jitter = 0.92 + rand() * 0.2;
    const dark = [mix(58, 70, tone) * jitter, mix(49, 58, tone) * jitter, mix(43, 48, tone) * jitter];
    const light = [mix(124, 142, tone) * jitter, mix(108, 122, tone) * jitter, mix(94, 104, tone) * jitter];
    const ramp = [
        [0, [dark[0] * 0.86, dark[1] * 0.86, dark[2] * 0.88]],
        [0.38, dark],
        [0.72, [mix(dark[0], light[0], 0.58), mix(dark[1], light[1], 0.58), mix(dark[2], light[2], 0.58)]],
        [1, light]
    ];

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const px = img.data;
    const c = [0, 0, 0];
    for (let y = 0; y < H; y++) {
        const sy = sinLat[y], cy = cosLat[y];
        const row = y * W;
        for (let x = 0; x < W; x++) {
            const i = row + x;
            const dx = cy * cosLon[x], dz = cy * sinLon[x];
            rampColour(ramp, height[i], c);
            // Two grains: dust patina at mid frequency, regolith speckle at the
            // texel scale, so the surface never looks like a smooth solid.
            const patina = fbm(dx * 16, sy * 16, dz * 16, seed + 617, 2) - 0.5;
            const speck = vnoise(dx * 64, sy * 64, dz * 64, seed + 4099) - 0.5;
            let shade = ao[i] * (1 + patina * 0.18 + speck * 0.1);
            if (shade > 1.3) shade = 1.3;
            const o = i * 4;
            const r = c[0] * shade, g = c[1] * shade, b = c[2] * shade;
            px[o] = r > 255 ? 255 : (r < 0 ? 0 : r);
            px[o + 1] = g > 255 ? 255 : (g < 0 ? 0 : g);
            px[o + 2] = b > 255 ? 255 : (b < 0 ? 0 : b);
            px[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);

    // Normals off the same height the colour was shaded from, so a crater rim
    // that is bright in the albedo is also a crease under the key light.
    const nCanvas = document.createElement('canvas');
    nCanvas.width = W; nCanvas.height = H;
    const nCtx = nCanvas.getContext('2d');
    const nImg = nCtx.createImageData(W, H);
    const nPx = nImg.data;
    for (let y = 0; y < H; y++) {
        const inv = 1 / Math.max(0.24, cosLat[y]);
        const row = y * W;
        const rowUp = Math.max(0, y - 1) * W;
        const rowDn = Math.min(H - 1, y + 1) * W;
        for (let x = 0; x < W; x++) {
            const xl = (x + W - 1) % W, xr = (x + 1) % W;
            // Softer than the airless-planet relief: a rock this small is
            // rendered ~30px across under one hard key light, and at full
            // strength the shading swung from black to blown-out and the
            // surface read as coal streaked with chalk rather than as stone.
            const gx = (height[row + xr] - height[row + xl]) * 0.5 * inv * 1.6;
            const gy = (height[rowDn + x] - height[rowUp + x]) * 0.5 * 1.6;
            let nx = -gx, ny = gy, nz = 1 / 9;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            const o = (row + x) * 4;
            nPx[o] = (nx / len * 0.5 + 0.5) * 255;
            nPx[o + 1] = (ny / len * 0.5 + 0.5) * 255;
            nPx[o + 2] = (nz / len * 0.5 + 0.5) * 255;
            nPx[o + 3] = 255;
        }
    }
    nCtx.putImageData(nImg, 0, 0);

    // Roughness: rock is uniformly matte, but not MATHEMATICALLY uniform —
    // exposed faces are a shade glossier than dust-filled floors.
    const rCanvas = document.createElement('canvas');
    rCanvas.width = W; rCanvas.height = H;
    const rCtx = rCanvas.getContext('2d');
    const rImg = rCtx.createImageData(W, H);
    const rPx = rImg.data;
    for (let i = 0; i < N; i++) {
        const o = i * 4;
        rPx[o] = 255;
        rPx[o + 1] = clamp01(0.98 - height[i] * 0.12) * 255;
        rPx[o + 2] = 10;
        rPx[o + 3] = 255;
    }
    rCtx.putImageData(rImg, 0, 0);

    return { albedo: canvas, normal: nCanvas, orm: rCanvas };
}

// ---------------------------------------------------------------------------
// Texture plumbing.
// ---------------------------------------------------------------------------

const LINEAR_SPACE = ('NoColorSpace' in THREE) ? THREE.NoColorSpace : THREE.LinearSRGBColorSpace;

function toTexture(canvas, colorSpace) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = colorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    // Cached and handed to many meshes. galaxy3d.js disposes `material.map`
    // unless it is flagged shared — without this the first sector rebuild frees
    // a texture every other planet of that class is still pointing at.
    tex.__shared = true;
    return tex;
}

const mapsCache = new Map();
const legacyCache = new Map();

function variantOf(sectorId) {
    return Math.abs(Number(sectorId) || 0) % 3;
}

function buildMaps(type, variant) {
    const f = buildFields(type, variant);
    const surface = paintSurface(f);
    const normalCanvas = paintNormal(surface, f);
    const ormCanvas = paintOrm(f);
    const emissiveCanvas = paintEmissive(f);
    const cloudCanvas = paintClouds(f);

    const orm = toTexture(ormCanvas, LINEAR_SPACE);
    return {
        map: toTexture(surface.canvas, THREE.SRGBColorSpace),
        normalMap: toTexture(normalCanvas, LINEAR_SPACE),
        roughnessMap: orm,
        metalnessMap: orm,
        emissiveMap: emissiveCanvas ? toTexture(emissiveCanvas, THREE.SRGBColorSpace) : null,
        cloudMap: cloudCanvas ? toTexture(cloudCanvas, THREE.SRGBColorSpace) : null,
        style: f.style,
        // Kept so a consumer can composite its own variant of the legacy look.
        _canvases: { surface: surface.canvas, clouds: cloudCanvas }
    };
}

/**
 * FULL MAP SET for a world. Cached per (class, variant); three variants per
 * class, chosen from the sector id, so neighbouring worlds of a kind are not
 * literally the same picture.
 *
 *   const m = getPlanetMaps(7, sectorId);
 *   m.map           THREE.Texture  sRGB    albedo, WITHOUT clouds
 *   m.normalMap     THREE.Texture  linear  tangent-space normals
 *   m.roughnessMap  THREE.Texture  linear  roughness in G
 *   m.metalnessMap  THREE.Texture  linear  metalness in B (same object)
 *   m.emissiveMap   THREE.Texture|null  sRGB  night lights / surface glow
 *   m.cloudMap      THREE.Texture|null  sRGB+alpha  independent cloud deck
 *   m.style         the PLANET_STYLES entry for this class
 *
 * Every texture is flagged `__shared` and must NOT be disposed by a consumer.
 */
export function getPlanetMaps(type, sectorId) {
    const t = PLANET_STYLES[type] ? type : 7;
    const variant = variantOf(sectorId);
    const key = `maps:${t}:${variant}`;
    if (!mapsCache.has(key)) mapsCache.set(key, buildMaps(t, variant));
    return mapsCache.get(key);
}

/**
 * LEGACY single-texture path: albedo with the cloud deck composited on top and
 * its shadow multiplied underneath, i.e. exactly what a consumer that only knows
 * about `material.map` needs. Kept working on purpose so the galaxy map and the
 * battle theater keep rendering while they migrate to getPlanetMaps().
 */
export function getPlanetTexture(type, sectorId) {
    const t = PLANET_STYLES[type] ? type : 7;
    const variant = variantOf(sectorId);
    const key = `planet:${t}:${variant}`;
    if (legacyCache.has(key)) return legacyCache.get(key);

    const maps = getPlanetMaps(t, sectorId);
    const src = maps._canvases.surface;
    const clouds = maps._canvases.clouds;
    let canvas = src;
    if (clouds) {
        canvas = document.createElement('canvas');
        canvas.width = src.width;
        canvas.height = src.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(src, 0, 0);
        // Cloud shadow: the same layer, offset east/south and multiplied in.
        // Stronger than the deck it belongs to and offset further, because a
        // shadow is the only thing that separates the deck from the surface on a
        // path with no second shell — without it the weather looks painted on.
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(clouds, Math.round(canvas.width * 0.016), Math.round(canvas.height * 0.02),
            canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
        // Held well under full strength: on the single-texture path the deck is
        // painted straight onto the surface, and at map zoom an opaque deck
        // washes out the class colour a player reads the world by — the previous
        // 0.86 turned the homeworld into a white ball. The standalone cloudMap
        // handed to getPlanetMaps() is NOT attenuated; it gets its own shell.
        ctx.globalAlpha = 0.66;
        ctx.drawImage(clouds, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
    }
    const tex = toTexture(canvas, THREE.SRGBColorSpace);
    legacyCache.set(key, tex);
    return tex;
}

/**
 * Kept for source compatibility with the previous API. `variant` is the raw
 * 0..2 index rather than a sector id.
 */
export function makePlanetTexture(type, variant) {
    return getPlanetTexture(type, (Number(variant) || 0) * 1);
}

// ---------------------------------------------------------------------------
// Star API.
// ---------------------------------------------------------------------------

const starCache = new Map();

function starKey(palette) {
    const m = palette.mid;
    return `${Math.round(m[0])},${Math.round(m[1])},${Math.round(m[2])}`;
}

/**
 * Texture set for one star.
 *
 *   const s = getStarMaps();                  // the default ember star
 *   const s = getStarMaps([250, 180, 90]);    // keep an existing per-star hue
 *
 *   s.map           THREE.Texture  sRGB        photosphere, granulated
 *   s.coronaMap     THREE.Texture  sRGB+alpha  additive corona sprite, with
 *                                              streamers and prominence loops
 *   s.bloomMap      THREE.Texture  sRGB+alpha  wide additive glare veil
 *   s.palette       {core, mid, limb, corona, tile} as 0-255 triples
 *   s.coronaScale   multiply the star's RADIUS by this for the corona sprite
 *   s.bloomScale    multiply the star's RADIUS by this for the bloom sprite
 *
 * All textures are `__shared` and must not be disposed by a consumer.
 */
export function getStarMaps(rgb, seed) {
    const palette = rgb ? starPaletteFrom(rgb) : STAR_PALETTE;
    const s = seed === undefined ? 1337 : (Number(seed) | 0);
    const key = `${starKey(palette)}:${s}`;
    if (!starCache.has(key)) {
        starCache.set(key, {
            map: toTexture(paintStarSurface(palette, s), THREE.SRGBColorSpace),
            coronaMap: toTexture(paintCorona(palette, s), THREE.SRGBColorSpace),
            bloomMap: toTexture(paintStarBloom(palette), THREE.SRGBColorSpace),
            palette,
            coronaScale: CORONA_REACH * 2,
            bloomScale: BLOOM_REACH * 2
        });
    }
    return starCache.get(key);
}

/**
 * Photosphere material for a sphere mesh.
 *
 * Unlit by construction — a star is not shaded by anything — but NOT flat: the
 * fragment shader applies the limb-darkening law and the ember hue shift, which
 * is what turns a filled circle into a body with an edge. There is also a thin
 * chromosphere fringe just inside the silhouette.
 *
 * options:
 *   rgb        base colour, default the ember palette
 *   seed       granulation seed, default 1337 (fixed: screenshots must repeat)
 *   intensity  overall multiplier, default 1
 *
 * `material.userData.setTime(t)` drifts the granulation. It is OPTIONAL and the
 * default of 0 is deliberate: a time-varying surface makes captures
 * irreproducible, and the sphere's own rotation already sells the motion.
 */
export function createStarSurfaceMaterial(options) {
    const opts = options || {};
    const maps = getStarMaps(opts.rgb, opts.seed);
    const p = maps.palette;
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uMap: { value: maps.map },
            uLimb: { value: new THREE.Color(p.limb[0] / 255, p.limb[1] / 255, p.limb[2] / 255) },
            uCore: { value: new THREE.Color(p.core[0] / 255, p.core[1] / 255, p.core[2] / 255) },
            uTime: { value: 0 },
            uIntensity: { value: opts.intensity === undefined ? 1 : opts.intensity }
        },
        vertexShader: [
            'varying vec2 vUv;',
            'varying vec3 vNormalW;',
            'varying vec3 vViewW;',
            'void main() {',
            '  vUv = uv;',
            '  vec4 world = modelMatrix * vec4( position, 1.0 );',
            '  vNormalW = normalize( mat3( modelMatrix ) * normal );',
            '  vViewW = normalize( cameraPosition - world.xyz );',
            '  gl_Position = projectionMatrix * viewMatrix * world;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform sampler2D uMap;',
            'uniform vec3 uLimb;',
            'uniform vec3 uCore;',
            'uniform float uTime;',
            'uniform float uIntensity;',
            'varying vec2 vUv;',
            'varying vec3 vNormalW;',
            'varying vec3 vViewW;',
            'void main() {',
            // Two counter-drifting samples of the same map: at uTime 0 they are
            // identical and this costs nothing visible, but any consumer that
            // does animate gets convective shear rather than a sliding image.
            '  vec3 a = texture2D( uMap, vUv + vec2( uTime * 0.004, 0.0 ) ).rgb;',
            '  vec3 b = texture2D( uMap, vUv * 1.31 + vec2( -uTime * 0.0026, 0.0 ) ).rgb;',
            '  vec3 tex = mix( a, b, 0.32 );',
            // mu = cos of the emergent angle. pow(1 - r^2, 0.45) in disc
            // coordinates is exactly pow(mu, 0.9) here.
            '  float mu = clamp( dot( normalize( vNormalW ), normalize( vViewW ) ), 0.0, 1.0 );',
            '  float ld = pow( mu, 0.9 );',
            '  vec3 col = mix( uLimb, tex, smoothstep( 0.0, 0.55, mu ) );',
            // Real limb darkening takes the edge to roughly a third of centre in
            // visible light. At the previous 0.62 floor the disc was almost flat
            // and the whole point of the law was lost.
            '  col *= mix( 0.38, 1.0, ld );',
            // Chromosphere: a narrow hot fringe hugging the silhouette.
            '  col += uLimb * smoothstep( 0.42, 0.0, mu ) * 0.34;',
            '  col += uCore * pow( ld, 6.0 ) * 0.16;',
            '  gl_FragColor = vec4( col * uIntensity, 1.0 );',
            '#include <tonemapping_fragment>',
            '#include <colorspace_fragment>',
            '}'
        ].join('\n')
    });
    material.toneMapped = false;
    material.__shared = false;
    material.userData.setTime = function (t) { material.uniforms.uTime.value = t; };
    return material;
}

/**
 * The corona, as a SpriteMaterial for an additive billboard.
 *
 *   const s = getStarMaps();
 *   const sprite = new THREE.Sprite( createStarCoronaMaterial() );
 *   sprite.scale.set( radius * s.coronaScale, radius * s.coronaScale, 1 );
 */
export function createStarCoronaMaterial(options) {
    const opts = options || {};
    const maps = getStarMaps(opts.rgb, opts.seed);
    const material = new THREE.SpriteMaterial({
        map: maps.coronaMap,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: opts.opacity === undefined ? 1 : opts.opacity
    });
    material.toneMapped = false;
    return material;
}

/** The wide glare veil. Additive, very low opacity, drawn under the corona. */
export function createStarBloomMaterial(options) {
    const opts = options || {};
    const maps = getStarMaps(opts.rgb, opts.seed);
    const material = new THREE.SpriteMaterial({
        map: maps.bloomMap,
        transparent: true,
        depthWrite: false,
        depthTest: opts.depthTest !== false,
        blending: THREE.AdditiveBlending,
        opacity: opts.bloomOpacity === undefined ? 0.62 : opts.bloomOpacity
    });
    material.toneMapped = false;
    return material;
}

/**
 * A FINISHED STAR in one call: granulated limb-darkened photosphere, corona
 * with streamers and prominence loops, and a wide glare veil.
 *
 *   const star = createStarObject( { radius: 0.34, rgb: [255,140,66] } );
 *   group.add( star );
 *   // per frame (optional):
 *   star.userData.update( dt );
 *
 * The three layers are separate objects with explicit renderOrder, because the
 * whole reason the previous star read as a `fillStyle` disc is that it WAS one
 * layer. `userData.lightColor` is the colour a consumer should give the scene
 * light it points at this star, so the worlds around it are lit by the thing
 * the player can actually see.
 */
export function createStarObject(options) {
    const opts = options || {};
    const radius = opts.radius === undefined ? 1 : opts.radius;
    const maps = getStarMaps(opts.rgb, opts.seed);
    const group = new THREE.Group();

    const core = new THREE.Mesh(sharedSphere(), createStarSurfaceMaterial(opts));
    core.scale.setScalar(radius);
    group.add(core);

    const bloom = new THREE.Sprite(createStarBloomMaterial(opts));
    const bs = radius * maps.bloomScale;
    bloom.scale.set(bs, bs, 1);
    bloom.renderOrder = 1;
    group.add(bloom);

    const corona = new THREE.Sprite(createStarCoronaMaterial(opts));
    const cs = radius * maps.coronaScale;
    corona.scale.set(cs, cs, 1);
    corona.renderOrder = 2;
    group.add(corona);

    const spin = opts.spin === undefined ? 0.03 : opts.spin;
    group.userData.core = core;
    group.userData.corona = corona;
    group.userData.bloom = bloom;
    group.userData.palette = maps.palette;
    group.userData.lightColor = maps.palette.core;
    group.userData.setTime = function (t) { core.material.userData.setTime(t); };
    group.userData.update = function (dt) { core.rotation.y += spin * (dt || 0); };
    return group;
}

// ---------------------------------------------------------------------------
// Asteroid API.
// ---------------------------------------------------------------------------

const rockCache = new Map();

/**
 * Texture set for one rock.
 *
 *   const r = getAsteroidMaps(i);   // i is any integer; % ASTEROID_VARIANTS
 *   r.map / r.normalMap / r.roughnessMap
 *
 * All `__shared`; do not dispose.
 */
export function getAsteroidMaps(variant) {
    const v = ((Math.abs(Number(variant) || 0) % ASTEROID_VARIANTS) + ASTEROID_VARIANTS) % ASTEROID_VARIANTS;
    if (!rockCache.has(v)) {
        const c = paintAsteroid(v);
        rockCache.set(v, {
            map: toTexture(c.albedo, THREE.SRGBColorSpace),
            normalMap: toTexture(c.normal, LINEAR_SPACE),
            roughnessMap: toTexture(c.orm, LINEAR_SPACE)
        });
    }
    return rockCache.get(v);
}

/**
 * Ready-made rock material. Flagged `__shared` so a sector rebuild cannot free
 * a material every other rock in the belt is still using.
 *
 * The mesh wants SUBDIVISION, not a dodecahedron: a normal map cannot rescue
 * six flat facets, because the silhouette is still a hexagon. An
 * IcosahedronGeometry(1, 2) with its vertices jittered is the right host.
 */
const rockGeoCache = new Map();

/**
 * A rock SHAPE, not a Platonic solid.
 *
 * A normal map cannot rescue a dodecahedron, because the silhouette is still a
 * hexagon and the silhouette is what the eye reads at 30px. This subdivides an
 * icosahedron and displaces it by the same 3D noise the textures use, so the
 * outline is lumpy and every variant is a different lump.
 *
 * Vertices are displaced by a function of POSITION, so the duplicated vertices
 * of the non-indexed geometry move together and no cracks open. Normals are set
 * to the undisplaced direction — smooth, not faceted — because all the surface
 * relief already lives in the normal map.
 */
export function createAsteroidGeometry(variant) {
    const v = ((Math.abs(Number(variant) || 0) % ASTEROID_VARIANTS) + ASTEROID_VARIANTS) % ASTEROID_VARIANTS;
    if (rockGeoCache.has(v)) return rockGeoCache.get(v);
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const pos = geo.attributes.position;
    const n = pos.count;
    const seed = (v * 26417 + 7919) | 0;
    const rand = seededRandom(seed ^ 0x2b71);
    // A per-variant triaxial stretch: most small bodies are markedly non-round,
    // and this is the cheapest thing that makes two rocks read as two rocks.
    const ax = 0.74 + rand() * 0.5, ay = 0.7 + rand() * 0.44, az = 0.76 + rand() * 0.46;
    const normals = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        normals[i * 3] = x; normals[i * 3 + 1] = y; normals[i * 3 + 2] = z;
        const lump = fbm(x * 1.7, y * 1.7, z * 1.7, seed + 11, 3) - 0.5;
        const chip = fbm(x * 5.2, y * 5.2, z * 5.2, seed + 733, 2) - 0.5;
        const r = 1 + lump * 0.46 + chip * 0.16;
        pos.setXYZ(i, x * r * ax, y * r * ay, z * r * az);
    }
    pos.needsUpdate = true;
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.computeBoundingSphere();
    protectGeometry(geo);
    rockGeoCache.set(v, geo);
    return geo;
}

/**
 * A finished rock: jittered silhouette, cratered albedo, derived normals.
 * Geometry and material are both cached and `__shared`; do not dispose either.
 */
export function createAsteroidObject(variant, options) {
    const opts = options || {};
    const mesh = new THREE.Mesh(createAsteroidGeometry(variant), createAsteroidMaterial(variant, opts));
    if (opts.radius !== undefined) mesh.scale.setScalar(opts.radius);
    return mesh;
}

export function createAsteroidMaterial(variant, options) {
    const opts = options || {};
    const maps = getAsteroidMaps(variant);
    const ns = opts.normalScale === undefined ? 1 : opts.normalScale;
    const material = new THREE.MeshStandardMaterial({
        map: maps.map,
        normalMap: maps.normalMap,
        roughnessMap: maps.roughnessMap,
        roughness: 1,
        metalness: 0.04,
        color: opts.color === undefined ? 0xffffff : opts.color
    });
    material.normalScale.set(ns, ns);
    material.__shared = true;
    return material;
}

/**
 * Multiply a material's emissive contribution by how far a texel is from the
 * light, so city lights only burn on the night side and fade through the
 * terminator. MeshStandardMaterial has no such switch, so this patches the
 * emissive line of the standard shader.
 *
 * Safe to call on a material with no emissiveMap (it just does nothing useful),
 * and safe to call twice. Guarded so a shader without directional lights simply
 * keeps the unmodified behaviour.
 */
export function applyNightSideEmissive(material) {
    if (!material || material.__nightSideEmissive) return material;
    material.__nightSideEmissive = true;
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, renderer) {
        if (typeof previous === 'function') previous.call(this, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            [
                '#include <emissivemap_fragment>',
                // NUM_DIR_LIGHTS is a #define'd NUMBER, so `defined( NUM_DIR_LIGHTS )`
                // preprocesses to `defined( 2 )` — invalid, and it takes the whole
                // program down with it. An undefined identifier evaluates to 0 in a
                // #if expression, so the bare comparison is both correct and safe.
                '#if defined( USE_EMISSIVEMAP ) && NUM_DIR_LIGHTS > 0',
                '  float nightFacing = dot( normalize( normal ), normalize( directionalLights[ 0 ].direction ) );',
                '  totalEmissiveRadiance *= smoothstep( 0.16, -0.24, nightFacing );',
                '#endif'
            ].join('\n')
        );
    };
    material.needsUpdate = true;
    return material;
}

/**
 * Atmospheric limb, as a Fresnel term added to the lit result.
 *
 * A world lit by a directional light and rendered with a plain standard
 * material has a hard silhouette: the shading runs right up to the edge of the
 * disc and then stops, which is exactly what makes a sphere read as a circular
 * decal. Real atmospheres scatter along the grazing path, so the limb is
 * BRIGHTER than the terrain just inside it and slightly the wrong colour.
 *
 * pow(1 - dot(N, V), 3) is the standard cheap Fresnel; it is zero facing the
 * camera and rises steeply within a few degrees of the silhouette, so it costs
 * nothing over the body of the planet and does all its work at the edge. The
 * term is modulated by how lit that part of the limb is, so the night side gets
 * a thin cold rim instead of a ring of daylight all the way round.
 *
 * Safe to call twice, and safe on a material with no directional light.
 */
export function applyAtmosphericLimb(material, atmoRgb, options) {
    if (!material || material.__atmoLimb) return material;
    const opts = options || {};
    const rgb = atmoRgb || [150, 190, 255];
    material.__atmoLimb = true;
    const uniforms = {
        uLimbColor: { value: new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255) },
        uLimbStrength: { value: opts.strength === undefined ? 0.55 : opts.strength },
        uLimbPower: { value: opts.power === undefined ? 3 : opts.power }
    };
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, renderer) {
        if (typeof previous === 'function') previous.call(this, shader, renderer);
        shader.uniforms.uLimbColor = uniforms.uLimbColor;
        shader.uniforms.uLimbStrength = uniforms.uLimbStrength;
        shader.uniforms.uLimbPower = uniforms.uLimbPower;
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', [
                'uniform vec3 uLimbColor;',
                'uniform float uLimbStrength;',
                'uniform float uLimbPower;',
                'void main() {'
            ].join('\n'))
            .replace('#include <opaque_fragment>', [
                '{',
                // vViewPosition points from the fragment to the camera, and
                // `normal` is already the shaded view-space normal at this point
                // in the standard shader, so both are free here.
                '  vec3 limbV = normalize( vViewPosition );',
                '  float limbF = pow( 1.0 - clamp( dot( normalize( normal ), limbV ), 0.0, 1.0 ), uLimbPower );',
                '  float limbLit = 0.34;',
                '#if NUM_DIR_LIGHTS > 0',
                '  limbLit = 0.2 + 0.8 * smoothstep( -0.45, 0.35,',
                '      dot( normalize( normal ), normalize( directionalLights[ 0 ].direction ) ) );',
                '#endif',
                '  outgoingLight += uLimbColor * limbF * uLimbStrength * limbLit;',
                '}',
                '#include <opaque_fragment>'
            ].join('\n'));
    };
    material.userData.limbUniforms = uniforms;
    material.needsUpdate = true;
    return material;
}

/**
 * Ready-made surface material. The two consumers can adopt the whole map set in
 * one line each instead of wiring five slots by hand.
 *
 * options:
 *   color              base tint, default 0xffffff (battle3d dims its backdrop)
 *   normalScale        default 1
 *   emissiveIntensity  default 1.5
 *   nightSideEmissive  default true; set false to skip the shader patch
 *   atmosphericLimb    default true; set false to skip the Fresnel rim
 *   limbStrength       default 0.55
 *   envMapIntensity    passed straight through when given
 */
export function createPlanetMaterial(type, sectorId, options) {
    const opts = options || {};
    const maps = getPlanetMaps(type, sectorId);
    const ns = opts.normalScale === undefined ? 1 : opts.normalScale;
    const material = new THREE.MeshStandardMaterial({
        color: opts.color === undefined ? 0xffffff : opts.color,
        map: maps.map,
        normalMap: maps.normalMap,
        // roughness/metalness are MULTIPLIERS against the packed map channels,
        // so they must be 1 for the map to mean what it says.
        roughnessMap: maps.roughnessMap,
        metalnessMap: maps.metalnessMap,
        roughness: 1,
        metalness: 1
    });
    material.normalScale.set(ns, ns);
    if (maps.emissiveMap) {
        material.emissiveMap = maps.emissiveMap;
        material.emissive = new THREE.Color(0xffffff);
        material.emissiveIntensity = opts.emissiveIntensity === undefined ? 1.5 : opts.emissiveIntensity;
        if (opts.nightSideEmissive !== false) applyNightSideEmissive(material);
    }
    if (opts.atmosphericLimb !== false && maps.style && maps.style.atmo) {
        applyAtmosphericLimb(material, maps.style.atmo, { strength: opts.limbStrength });
    }
    if (opts.envMapIntensity !== undefined) material.envMapIntensity = opts.envMapIntensity;
    material.needsUpdate = true;
    return material;
}

/**
 * The lighting these maps are AUTHORED FOR, published so the galaxy map and the
 * battle theater cannot drift apart.
 *
 * This is not a preference. The normal map, the roughness map and the emissive
 * night lights all only exist in the render if there is a terminator to reveal
 * them, and a terminator only exists if the ambient term is a fill rather than
 * the main source. At ambient 0.6 against a key of 1.15 — the rig the galaxy map
 * shipped with — the dark side of every world sits at 65% of full brightness,
 * the relief flattens to nothing, the ocean specular never resolves, and a lit
 * sphere reads as a circular decal. The numbers below put the night side near
 * 12%, which is dark enough to see relief and city lights and light enough to
 * still read the planet class by hue.
 *
 * `keyFrom` is a hint, not a rule: point the key at whatever the scene's actual
 * star is, so the shading agrees with the light source the player can see.
 */
export const PLANET_LIGHTING = {
    ambient: { color: 0xbdc7ff, intensity: 0.2 },
    key: { color: 0xfff2db, intensity: 2.5, keyFrom: 'the star tile, or +X +Y +Z' },
    rim: { color: 0x4c7cff, intensity: 0.3 }
};

/**
 * Free every cached texture. Only for tearing a scene down for good — every
 * texture this module hands out is shared between all worlds of the same class,
 * so a consumer must never dispose one itself (they are flagged `__shared` for
 * exactly that reason). Calling this invalidates any live material.
 */
export function disposePlanetMaps() {
    for (const maps of mapsCache.values()) {
        const seen = new Set();
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'cloudMap']) {
            const tex = maps[key];
            if (tex && !seen.has(tex)) { seen.add(tex); tex.dispose(); }
        }
    }
    for (const tex of legacyCache.values()) tex.dispose();
    for (const s of starCache.values()) { s.map.dispose(); s.coronaMap.dispose(); s.bloomMap.dispose(); }
    for (const r of rockCache.values()) { r.map.dispose(); r.normalMap.dispose(); r.roughnessMap.dispose(); }
    for (const g of rockGeoCache.values()) g.__realDispose();
    if (sphereGeoCache) { sphereGeoCache.__realDispose(); sphereGeoCache = null; }
    mapsCache.clear();
    legacyCache.clear();
    starCache.clear();
    rockCache.clear();
    rockGeoCache.clear();
}

// ===========================================================================
// THE LIT-BODY PATH
//
// Everything above produces MAPS. This section produces a BODY, and it exists
// because handing a consumer five texture slots was not enough: both consumers
// wired the albedo into a MeshStandardMaterial under an ambient-dominant rig
// (ambient 0.6 against a key of 1.15), where every sphere is shaded identically
// on all sides. The result reads as a textured disc — no terminator, no night
// side, no ocean glint — and no amount of texture detail fixes it, because the
// missing thing is the LIGHT, not the surface.
//
// So the light moved into the material. These shaders carry their own key
// direction, their own ambient floor and their own specular, which means a
// planet built with createPlanetObject() is correctly lit no matter what the
// surrounding scene's lights happen to be. The consumer's only obligation is to
// point the light somewhere diegetic — at the system's star tile — via
// setLightTarget(). That is one call, and it cannot be got half-right.
//
// Techniques, in the order they matter:
//
//   TERMINATOR. Wrapped Lambert, clamp((N·L + 0.075)/1.075) ^ 1.3, against an
//   ambient floor near 0.06. The night side lands around 6-8% of full, which is
//   dark enough to read as night and light enough to keep the class hue legible
//   at map zoom — the hue IS the gameplay signal and it may not go black.
//
//   RELIEF. The normal map finally does something, because there is now a
//   direction for it to be relative to. The tangent frame is analytic rather
//   than derivative-based: for an equirectangular sphere, +u is east and +v is
//   north, so T = normalize(cross(worldUp, N)) and B = cross(N, T) exactly.
//   No tangent attribute, no dFdx, no seam.
//
//   SPECULAR. Blinn-Phong with the exponent driven by the roughness map, and
//   the whole lobe weighted by gloss^3 so land (roughness ~0.92) contributes
//   about 0.0005 of it and ocean (~0.08) contributes nearly all of it. This is
//   the single cue that separates "a blue ball" from "a world with seas".
//
//   NIGHT LIGHTS. Masked by the GEOMETRIC normal, not the mapped one, so
//   mountain relief cannot speckle the terminator with stray cities.
//
//   CLOUD SHADOW. The surface samples the cloud deck at an offset along the
//   light direction projected into UV space — dot(L,T) east, dot(L,B) north —
//   so the shadow falls the correct way and tracks the deck's own independent
//   rotation through uCloudOffset.
//
//   ATMOSPHERE. Not a sprite. A back-side shell whose alpha is computed from
//   the view ray's actual impact parameter against the planet, so the glow
//   starts EXACTLY at the silhouette (no gap, no detached donut), falls off as
//   pow(1-t, 3), is weighted toward the day limb like a real crescent, and is
//   dithered to kill 8-bit contour banding.
// ===========================================================================

/** Default key direction, world space, pointing FROM the surface TOWARD the light. */
const DEFAULT_LIGHT = [0.62, 0.42, 0.66];

/**
 * The full lit-body rig, published so both consumers agree. Every field is also
 * an option on createPlanetObject().
 */
export const PLANET_RIG = {
    lightColor: [1.15, 1.1, 1.01],
    // Cool but not BLUE: a heavily tinted fill drags the night side off the
    // class hue, and hue is the gameplay signal.
    ambientColor: [0.58, 0.64, 0.86],
    // Measured, not guessed. The output is sRGB-encoded, so a linear floor of
    // 0.075 against a mid albedo displays at roughly 40% grey and the night
    // side never reads as night — which is exactly what the first pass looked
    // like. 0.032 lands the dark hemisphere near 15% display, dark enough for
    // the terminator to be the dominant read and for city lights to register,
    // light enough that the class colour is still identifiable at map zoom.
    ambient: 0.032,
    // Sun glint. The lobe is narrow and it is NOT allowed to blow out: at 1.25
    // the ocean grew a white hole the size of a continent.
    specular: 0.12,
    emissiveIntensity: 1.45,
    // In-material limb scatter. This stacks with the atmosphere shell, so both
    // have to be modest — the pair is what reads, not either alone.
    rimStrength: 0.16,
    /** Atmosphere shell radius, as a multiple of the planet radius. */
    atmosphereRatio: 1.13,
    /** Cloud shell radius, as a multiple of the planet radius. */
    cloudRatio: 1.022,
    exposure: 1
};

/**
 * Shared geometry, made SAFE TO HAND OUT.
 *
 * galaxy3d.js tears a sector down with
 *   `if (obj.geometry && !Object.values(state.sharedGeo).includes(obj.geometry))
 *        obj.geometry.dispose();`
 * which frees any geometry it does not itself own — and one sector rebuild
 * would therefore delete the sphere every other world in the galaxy is drawn
 * from. Textures are protected from the equivalent hazard by a `__shared` flag
 * the consumer checks; there is no such flag for geometry, so the geometry
 * defends itself instead: `dispose()` is a no-op and only this module's own
 * teardown can really free it. Same reasoning for the rock shapes.
 *
 * 48x32 segments: at the tightest gameplay framing a world is ~230px across, so
 * a 48-sided silhouette has a sagitta of a quarter of a pixel. Three shells per
 * planet means this number is paid three times, and 64x48 was buying nothing.
 */
function protectGeometry(geo) {
    geo.__realDispose = THREE.BufferGeometry.prototype.dispose.bind(geo);
    geo.dispose = function () { /* shared: only disposePlanetMaps() may free it */ };
    return geo;
}

let sphereGeoCache = null;
function sharedSphere() {
    if (!sphereGeoCache) sphereGeoCache = protectGeometry(new THREE.SphereGeometry(1, 48, 32));
    return sphereGeoCache;
}

const V_SPHERE = [
    'varying vec2 vUv;',
    'varying vec3 vNormalW;',
    'varying vec3 vPosW;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 wp = modelMatrix * vec4( position, 1.0 );',
    '  vPosW = wp.xyz;',
    '  vNormalW = normalize( mat3( modelMatrix ) * normal );',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
].join('\n');

/** East/north tangent frame for an equirectangular sphere. Exact, no derivatives. */
const GLSL_FRAME = [
    'void sphereFrame( vec3 N, out vec3 T, out vec3 B ) {',
    '  vec3 t = cross( vec3( 0.0, 1.0, 0.0 ), N );',
    '  float l = length( t );',
    '  T = l > 1e-4 ? t / l : vec3( 1.0, 0.0, 0.0 );',
    '  B = cross( N, T );',
    '}'
].join('\n');

function vec3Uniform(rgb) {
    return new THREE.Vector3(rgb[0], rgb[1], rgb[2]);
}

/**
 * Self-lit planet surface material.
 *
 * options (all optional):
 *   light               [x,y,z] world direction toward the light
 *   lightColor          linear rgb triple, default PLANET_RIG.lightColor
 *   ambient/ambientColor, specular, emissiveIntensity, rimStrength, exposure
 *   normalScale         default 1
 *   cloudShadow         0..1, default 0.42; 0 disables the extra texture read
 *   tint                multiplies the albedo (battle3d dims its backdrop)
 *
 * material.userData.setLightDirection(x, y, z)
 * material.userData.setCloudOffset(u)   — keep in sync with the cloud shell
 */
export function createPlanetSurfaceMaterial(type, sectorId, options) {
    const opts = options || {};
    const maps = getPlanetMaps(type, sectorId);
    const style = maps.style;
    const rim = style && style.atmo ? style.atmo : [150, 190, 255];
    const cloudShadow = maps.cloudMap
        ? (opts.cloudShadow === undefined ? 0.42 : opts.cloudShadow) : 0;

    const uniforms = {
        uMap: { value: maps.map },
        uNormalMap: { value: maps.normalMap },
        uOrm: { value: maps.roughnessMap },
        uEmissive: { value: maps.emissiveMap },
        uCloud: { value: maps.cloudMap },
        uLightDir: { value: vec3Uniform(opts.light || DEFAULT_LIGHT).normalize() },
        uLightColor: { value: vec3Uniform(opts.lightColor || PLANET_RIG.lightColor) },
        uAmbientColor: { value: vec3Uniform(opts.ambientColor || PLANET_RIG.ambientColor) },
        uAmbient: { value: opts.ambient === undefined ? PLANET_RIG.ambient : opts.ambient },
        uNormalScale: { value: opts.normalScale === undefined ? 1 : opts.normalScale },
        uSpecular: { value: opts.specular === undefined ? PLANET_RIG.specular : opts.specular },
        uEmissiveIntensity: {
            value: opts.emissiveIntensity === undefined
                ? PLANET_RIG.emissiveIntensity : opts.emissiveIntensity
        },
        uRimColor: { value: new THREE.Vector3(rim[0] / 255, rim[1] / 255, rim[2] / 255) },
        uRimStrength: { value: opts.rimStrength === undefined ? PLANET_RIG.rimStrength : opts.rimStrength },
        uCloudOffset: { value: 0 },
        uCloudShadow: { value: cloudShadow },
        uTint: { value: vec3Uniform(opts.tint || [1, 1, 1]) },
        uExposure: { value: opts.exposure === undefined ? PLANET_RIG.exposure : opts.exposure }
    };

    const defines = {};
    if (maps.emissiveMap) defines.HAS_EMISSIVE = '';
    if (cloudShadow > 0) defines.HAS_CLOUD = '';

    const material = new THREE.ShaderMaterial({
        uniforms,
        defines,
        vertexShader: V_SPHERE,
        fragmentShader: [
            'uniform sampler2D uMap;',
            'uniform sampler2D uNormalMap;',
            'uniform sampler2D uOrm;',
            '#ifdef HAS_EMISSIVE',
            'uniform sampler2D uEmissive;',
            '#endif',
            '#ifdef HAS_CLOUD',
            'uniform sampler2D uCloud;',
            'uniform float uCloudOffset;',
            'uniform float uCloudShadow;',
            '#endif',
            'uniform vec3 uLightDir;',
            'uniform vec3 uLightColor;',
            'uniform vec3 uAmbientColor;',
            'uniform vec3 uRimColor;',
            'uniform vec3 uTint;',
            'uniform float uAmbient;',
            'uniform float uNormalScale;',
            'uniform float uSpecular;',
            'uniform float uEmissiveIntensity;',
            'uniform float uRimStrength;',
            'uniform float uExposure;',
            'varying vec2 vUv;',
            'varying vec3 vNormalW;',
            'varying vec3 vPosW;',
            GLSL_FRAME,
            'void main() {',
            '  vec3 N = normalize( vNormalW );',
            '  vec3 V = normalize( cameraPosition - vPosW );',
            '  vec3 L = normalize( uLightDir );',
            '  vec3 T, B;',
            '  sphereFrame( N, T, B );',
            // Tangent-space normal, applied in the exact frame paintNormal()
            // authored: R along +u (east), G along +v (north), B out.
            '  vec3 nt = texture2D( uNormalMap, vUv ).xyz * 2.0 - 1.0;',
            '  nt.xy *= uNormalScale;',
            '  vec3 Nw = normalize( T * nt.x + B * nt.y + N * nt.z );',
            '  vec3 albedo = texture2D( uMap, vUv ).rgb * uTint;',
            '  float rough = texture2D( uOrm, vUv ).g;',
            '  float gnl = dot( N, L );',
            '  float nl = dot( Nw, L );',
            // Wrapped Lambert. The wrap is what softens the terminator over a
            // few degrees instead of cutting it with a hard analytic edge.
            '  float lit = clamp( ( nl + 0.075 ) / 1.075, 0.0, 1.0 );',
            '  lit = pow( lit, 1.3 );',
            '  float shadow = 1.0;',
            '#ifdef HAS_CLOUD',
            '  vec2 sOff = vec2( dot( L, T ), dot( L, B ) ) * 0.013;',
            '  float ca = texture2D( uCloud, vec2( vUv.x + uCloudOffset + sOff.x,',
            '      clamp( vUv.y + sOff.y, 0.004, 0.996 ) ) ).a;',
            '  shadow = 1.0 - ca * uCloudShadow;',
            '#endif',
            '  vec3 col = albedo * uLightColor * lit * shadow;',
            // Ambient is a FILL, not the source: a flat floor plus a little
            // sky-bounce that only exists on the day side.
            '  col += albedo * uAmbientColor * ( uAmbient + 0.03 * smoothstep( -0.55, 0.3, gnl ) );',
            // Ocean glint. gloss^3 is the mask: at roughness 0.92 it is 5e-4.
            '  float gloss = 1.0 - rough;',
            '  vec3 H = normalize( L + V );',
            '  float sp = pow( max( dot( Nw, H ), 0.0 ), mix( 24.0, 480.0, gloss * gloss ) );',
            '  sp *= gloss * gloss * gloss * uSpecular * shadow * smoothstep( -0.02, 0.2, nl );',
            '  col += uLightColor * min( sp, 0.12 );',
            '#ifdef HAS_EMISSIVE',
            // Geometric normal on purpose: relief must not punch holes in the
            // night mask.
            '  col += texture2D( uEmissive, vUv ).rgb * uEmissiveIntensity',
            '       * smoothstep( 0.14, -0.16, gnl );',
            '#endif',
            // In-material limb scatter. Because it lives in the surface shader
            // it is masked to the sphere by construction and cannot detach.
            '  float fres = pow( 1.0 - clamp( dot( N, V ), 0.0, 1.0 ), 3.2 );',
            '  col += uRimColor * fres * uRimStrength * ( 0.1 + 0.9 * smoothstep( -0.3, 0.35, gnl ) );',
            '  gl_FragColor = vec4( col * uExposure, 1.0 );',
            '#include <tonemapping_fragment>',
            '#include <colorspace_fragment>',
            '}'
        ].join('\n')
    });
    material.userData.setLightDirection = function (x, y, z) {
        uniforms.uLightDir.value.set(x, y, z).normalize();
    };
    material.userData.setCloudOffset = function (u) { uniforms.uCloudOffset.value = u; };
    material.userData.uniforms = uniforms;
    return material;
}

/**
 * Self-lit cloud shell. Same key as the surface, its own terminator, plus a
 * forward-scattering term so the deck glows where it is between you and the
 * light. Returns null for a class with no weather — skip the mesh entirely.
 */
export function createPlanetCloudMaterial(type, sectorId, options) {
    const opts = options || {};
    const maps = getPlanetMaps(type, sectorId);
    if (!maps.cloudMap) return null;
    const uniforms = {
        uCloud: { value: maps.cloudMap },
        uLightDir: { value: vec3Uniform(opts.light || DEFAULT_LIGHT).normalize() },
        uLightColor: { value: vec3Uniform(opts.lightColor || PLANET_RIG.lightColor) },
        uAmbientColor: { value: vec3Uniform(opts.ambientColor || PLANET_RIG.ambientColor) },
        uAmbient: { value: opts.ambient === undefined ? PLANET_RIG.ambient : opts.ambient },
        uOpacity: { value: opts.opacity === undefined ? 0.94 : opts.opacity },
        uExposure: { value: opts.exposure === undefined ? PLANET_RIG.exposure : opts.exposure }
    };
    const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        vertexShader: V_SPHERE,
        fragmentShader: [
            'uniform sampler2D uCloud;',
            'uniform vec3 uLightDir;',
            'uniform vec3 uLightColor;',
            'uniform vec3 uAmbientColor;',
            'uniform float uAmbient;',
            'uniform float uOpacity;',
            'uniform float uExposure;',
            'varying vec2 vUv;',
            'varying vec3 vNormalW;',
            'varying vec3 vPosW;',
            'void main() {',
            '  vec4 c = texture2D( uCloud, vUv );',
            '  if ( c.a < 0.004 ) discard;',
            '  vec3 N = normalize( vNormalW );',
            '  vec3 L = normalize( uLightDir );',
            '  vec3 V = normalize( cameraPosition - vPosW );',
            '  float nl = dot( N, L );',
            // Only slightly softer than the surface. The first version wrapped by
            // 0.16 with a 0.85 exponent, which put the deck at 18% brightness
            // exactly where the ground was at 3% — the clouds stayed lit for
            // another 80px past the surface terminator and read as a grey lid
            // laid over the night side, undoing the terminator entirely. A cloud
            // top really is lit a little past the ground terminator; a little.
            '  float lit = pow( clamp( ( nl + 0.09 ) / 1.09, 0.0, 1.0 ), 1.15 );',
            '  float fs = pow( max( dot( V, -L ), 0.0 ), 6.0 ) * 0.22;',
            // 0.88, not 1.0: at full strength the day-side deck clipped to pure
            // white and took its own structure with it.
            '  vec3 col = c.rgb * ( uLightColor * ( lit * 0.88 + fs ) + uAmbientColor * uAmbient );',
            // Fade the deck as it approaches its own silhouette, or the shell
            // draws a hard bright ring just outside the planet.
            '  float edge = smoothstep( 0.0, 0.3, dot( N, V ) );',
            '  gl_FragColor = vec4( col * uExposure, c.a * uOpacity * edge );',
            '#include <tonemapping_fragment>',
            '#include <colorspace_fragment>',
            '}'
        ].join('\n')
    });
    material.userData.setLightDirection = function (x, y, z) {
        uniforms.uLightDir.value.set(x, y, z).normalize();
    };
    material.userData.uniforms = uniforms;
    return material;
}

/**
 * Atmospheric limb shell.
 *
 * Put it on a UNIT sphere scaled to planetRadius * ratio, side BackSide,
 * additive, depthWrite false. The alpha is derived from the view ray's impact
 * parameter against the planet, so:
 *   - the glow begins at exactly the silhouette (no gap, ever),
 *   - it falls as pow(1 - t, power) with no colour stops (no contour rings),
 *   - it is weighted toward the lit limb (a crescent, not a donut),
 *   - it is dithered by +-0.8/255 in screen space, which is reproducible.
 */
export function createAtmosphereMaterial(type, sectorId, options) {
    const opts = options || {};
    const maps = getPlanetMaps(type, sectorId);
    const style = maps.style;
    if (!style || !style.atmo) return null;
    const rgb = opts.color || style.atmo;
    const uniforms = {
        uColor: { value: new THREE.Vector3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255) },
        uLightDir: { value: vec3Uniform(opts.light || DEFAULT_LIGHT).normalize() },
        uRatio: { value: opts.ratio === undefined ? PLANET_RIG.atmosphereRatio : opts.ratio },
        uStrength: { value: opts.strength === undefined ? 0.26 : opts.strength },
        uPower: { value: opts.power === undefined ? 4.2 : opts.power },
        uExposure: { value: opts.exposure === undefined ? PLANET_RIG.exposure : opts.exposure }
    };
    const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        vertexShader: [
            'varying vec3 vPosW;',
            'varying vec3 vCenterW;',
            'varying float vScaleW;',
            'void main() {',
            '  vec4 wp = modelMatrix * vec4( position, 1.0 );',
            '  vPosW = wp.xyz;',
            '  vCenterW = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;',
            '  vScaleW = length( modelMatrix[ 0 ].xyz );',
            '  gl_Position = projectionMatrix * viewMatrix * wp;',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform vec3 uColor;',
            'uniform vec3 uLightDir;',
            'uniform float uRatio;',
            'uniform float uStrength;',
            'uniform float uPower;',
            'uniform float uExposure;',
            'varying vec3 vPosW;',
            'varying vec3 vCenterW;',
            'varying float vScaleW;',
            'void main() {',
            '  vec3 rd = normalize( vPosW - cameraPosition );',
            '  vec3 oc = vCenterW - cameraPosition;',
            // Closest approach of the view ray to the planet centre: the impact
            // parameter b IS the screen-space radius, in world units, which is
            // what lets the falloff start exactly on the silhouette.
            '  vec3 closest = cameraPosition + rd * dot( oc, rd );',
            '  float b = length( closest - vCenterW );',
            '  float rPlanet = vScaleW / uRatio;',
            '  float t = clamp( ( b - rPlanet ) / max( 1e-4, vScaleW - rPlanet ), 0.0, 1.0 );',
            '  float a = pow( 1.0 - t, uPower );',
            '  vec3 rim = normalize( closest - vCenterW );',
            '  a *= ( 0.06 + 0.94 * smoothstep( -0.55, 0.35, dot( rim, normalize( uLightDir ) ) ) ) * uStrength;',
            // Screen-space hash dither. Deterministic per pixel, so captures
            // repeat; enough to break the contour steps an 8-bit ramp shows.
            '  float d = fract( sin( dot( floor( gl_FragCoord.xy ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );',
            '  a = clamp( a + ( d - 0.5 ) * ( 1.6 / 255.0 ), 0.0, 1.0 );',
            '  if ( a <= 0.0 ) discard;',
            '  gl_FragColor = vec4( uColor * uExposure, a );',
            '#include <tonemapping_fragment>',
            '#include <colorspace_fragment>',
            '}'
        ].join('\n')
    });
    material.userData.setLightDirection = function (x, y, z) {
        uniforms.uLightDir.value.set(x, y, z).normalize();
    };
    material.userData.uniforms = uniforms;
    return material;
}

/**
 * A FINISHED WORLD: surface + cloud shell + atmosphere, correctly lit, in one
 * call. This is the entry point both consumers should use.
 *
 *   const world = createPlanetObject( type, sectorId, { radius: 0.52 } );
 *   group.add( world );
 *   world.userData.setLightTarget( starWorldPosition );   // diegetic lighting
 *   // per frame:
 *   world.userData.update( dt );
 *
 * options:
 *   radius       world radius, default 1
 *   spin         body rotation, rad/s, default 0.12 — published as
 *                `userData.spin`, which is the convention galaxy3d's frame loop
 *                already applies to every child of a sector, so a consumer that
 *                does nothing new still gets a turning world
 *   cloudDrift   deck rotation RELATIVE to the body, rad/s, default spin*0.32
 *   clouds       default true
 *   atmosphere   default true
 *   light        [x,y,z] initial direction toward the light
 *   ...plus every option of createPlanetSurfaceMaterial
 *
 * userData:
 *   spin                         rad/s for a generic per-child rotation loop
 *   setLightDirection(x, y, z)   world direction TOWARD the light
 *   setLightTarget(vec3Like)     point the key at a world position (the star)
 *   update(dt)                   OPTIONAL: adds the cloud deck's differential
 *                                rotation and keeps the cloud shadow registered
 *   surface / clouds / atmosphere   the meshes, for anything bespoke
 */
export function createPlanetObject(type, sectorId, options) {
    const opts = options || {};
    const radius = opts.radius === undefined ? 1 : opts.radius;
    const geo = sharedSphere();
    const group = new THREE.Group();

    const surfaceMat = createPlanetSurfaceMaterial(type, sectorId, opts);
    const surface = new THREE.Mesh(geo, surfaceMat);
    surface.scale.setScalar(radius);
    group.add(surface);

    let clouds = null;
    if (opts.clouds !== false) {
        const cloudMat = createPlanetCloudMaterial(type, sectorId, opts);
        if (cloudMat) {
            clouds = new THREE.Mesh(geo, cloudMat);
            clouds.scale.setScalar(radius * (opts.cloudRatio || PLANET_RIG.cloudRatio));
            clouds.renderOrder = 1;
            group.add(clouds);
        }
    }

    let atmosphere = null;
    if (opts.atmosphere !== false) {
        const ratio = opts.atmosphereRatio || PLANET_RIG.atmosphereRatio;
        const atmoMat = createAtmosphereMaterial(type, sectorId,
            Object.assign({}, opts, { ratio }));
        if (atmoMat) {
            atmosphere = new THREE.Mesh(geo, atmoMat);
            atmosphere.scale.setScalar(radius * ratio);
            atmosphere.renderOrder = 2;
            group.add(atmosphere);
        }
    }

    const spin = opts.spin === undefined ? 0.12 : opts.spin;
    // The deck's rotation RELATIVE to the body, not its absolute rate. Written
    // this way so the two ways a consumer might drive this object compose
    // instead of fighting: `userData.spin` is the convention galaxy3d's frame
    // loop already applies to every child of a sector, and `update(dt)` only
    // ever adds the differential on top of it. Whichever the consumer uses, the
    // world turns exactly once per its own period.
    const cloudDrift = opts.cloudDrift === undefined ? spin * 0.32 : opts.cloudDrift;
    const light = new THREE.Vector3().fromArray(opts.light || DEFAULT_LIGHT).normalize();
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
    /** Point the key at a world position — normally the system's star tile. */
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
    /** Honoured by galaxy3d's existing per-child rotation loop. */
    group.userData.spin = spin;
    group.userData.update = function (dt) {
        if (!clouds) return;
        clouds.rotation.y += cloudDrift * (dt || 0);
        // Keep the surface's baked cloud shadow registered with where the deck
        // actually is. The shell's LOCAL rotation is the whole difference,
        // because the group carries the body's rotation for both.
        surfaceMat.userData.setCloudOffset(-clouds.rotation.y / (Math.PI * 2));
    };
    return group;
}

/**
 * Material for the independent cloud shell. Put it on a sphere ~1.5% larger than
 * the surface and spin it a little faster; returns null when the class has no
 * weather, in which case skip the mesh entirely.
 *
 * PREFER createPlanetCloudMaterial() — this one is a MeshStandardMaterial and
 * therefore inherits whatever the scene's lights happen to be.
 */
export function createCloudMaterial(type, sectorId, options) {
    const opts = options || {};
    const maps = getPlanetMaps(type, sectorId);
    if (!maps.cloudMap) return null;
    return new THREE.MeshStandardMaterial({
        map: maps.cloudMap,
        transparent: true,
        opacity: opts.opacity === undefined ? 0.95 : opts.opacity,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
        side: THREE.FrontSide
    });
}

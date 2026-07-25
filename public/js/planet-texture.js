/**
 * planet-texture.js — procedural equirectangular planet maps.
 *
 * Shared by the galaxy map (galaxy3d.js) and the battle theater (battle3d.js).
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
 */

import * as THREE from './vendor/three.module.min.js';

// Each grade of world gets a colour identity strong enough to read at map zoom,
// where a planet is only ~40px across. Hue carries the meaning: grey = dead,
// orange = marginal, green = temperate, blue = ocean, violet = exotic.
export const PLANET_STYLES = {
    // 5: scorched dead rock — no atmosphere, no colour, nothing to settle.
    5: { deep: [56, 51, 48], mid: [98, 88, 80], high: [146, 132, 118], cap: [168, 164, 160], capSize: 0.04, clouds: 0, bands: 0.2, blobs: 36, atmo: null },
    // 6: marginal rust world — the cheapest colony target, unmistakably arid.
    6: { deep: [92, 36, 18], mid: [162, 76, 30], high: [214, 134, 62], cap: [232, 214, 190], capSize: 0.08, clouds: 0.06, bands: 0.24, blobs: 32, atmo: [232, 128, 56] },
    // 7: temperate — the workhorse colony. Land dominates; only a little water.
    7: { deep: [30, 76, 52], mid: [72, 132, 56], high: [168, 176, 86], cap: [226, 238, 246], capSize: 0.11, clouds: 0.14, bands: 0.1, blobs: 30, atmo: [140, 226, 140] },
    // 8: ocean garden world — deep blue seas, bright shallows, heavy weather.
    8: { deep: [8, 44, 104], mid: [22, 104, 190], high: [64, 196, 208], cap: [240, 248, 255], capSize: 0.16, clouds: 0.5, bands: 0.05, blobs: 18, atmo: [96, 190, 255] },
    // 9: exotic high-yield world — banded, luminous, plainly not natural.
    9: { deep: [58, 22, 96], mid: [144, 48, 186], high: [64, 214, 206], cap: [226, 206, 255], capSize: 0.06, clouds: 0.18, bands: 0.55, blobs: 26, atmo: [206, 118, 255] },
    // 10: homeworld — earthlike, but warmer and richer than anything else nearby.
    10: { deep: [14, 62, 122], mid: [46, 136, 132], high: [126, 190, 84], cap: [255, 253, 246], capSize: 0.15, clouds: 0.34, bands: 0.05, blobs: 26, atmo: [255, 206, 128] }
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

function rgba(c, alpha) {
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

/**
 * Paint a seamless equirectangular planet map. Blobs are drawn three times
 * (x-512, x, x+512) so the seam matches, and widened towards the poles to cancel
 * the horizontal squeeze equirectangular mapping applies there.
 */
export function makePlanetTexture(type, variant) {
    const style = PLANET_STYLES[type] || PLANET_STYLES[7];
    const W = 512;
    const H = 256;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const rand = seededRandom(type * 7919 + variant * 104729 + 17);

    ctx.fillStyle = rgba(style.deep, 1);
    ctx.fillRect(0, 0, W, H);

    // Latitude banding — gas-giant striping for the exotic worlds, a faint
    // climate gradient for the rest.
    const bandCount = 7 + Math.floor(rand() * 5);
    for (let i = 0; i < bandCount; i++) {
        const y = (i / bandCount) * H;
        const height = (H / bandCount) * (0.5 + rand() * 0.8);
        ctx.fillStyle = rgba(i % 2 ? style.mid : style.high, style.bands * (0.4 + rand() * 0.6));
        ctx.fillRect(0, y, W, height);
    }

    const blob = (cx, cy, r, colour, alpha) => {
        // Near the poles a degree of longitude is a shorter arc, so stretch.
        const lat = (cy / H - 0.5) * Math.PI;
        const stretch = 1 / Math.max(0.22, Math.cos(lat));
        for (const offset of [-W, 0, W]) {
            const grad = ctx.createRadialGradient(cx + offset, cy, 0, cx + offset, cy, r);
            grad.addColorStop(0, rgba(colour, alpha));
            grad.addColorStop(0.62, rgba(colour, alpha * 0.72));
            grad.addColorStop(1, rgba(colour, 0));
            ctx.save();
            ctx.translate(cx + offset, cy);
            ctx.scale(stretch, 1);
            ctx.translate(-(cx + offset), -cy);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx + offset, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    };

    // Continents / terrain masses.
    for (let i = 0; i < style.blobs; i++) {
        const cx = rand() * W;
        const cy = H * (0.12 + rand() * 0.76);
        const r = 14 + rand() * 46;
        blob(cx, cy, r, rand() > 0.45 ? style.mid : style.high, 0.55 + rand() * 0.4);
    }
    // A second, tighter pass adds coastline detail rather than flat shapes.
    for (let i = 0; i < style.blobs; i++) {
        const cx = rand() * W;
        const cy = H * (0.1 + rand() * 0.8);
        blob(cx, cy, 5 + rand() * 16, style.high, 0.25 + rand() * 0.35);
    }

    // Polar caps.
    if (style.capSize > 0) {
        const capH = H * style.capSize;
        [0, 1].forEach(pole => {
            const grad = pole
                ? ctx.createLinearGradient(0, H, 0, H - capH * 1.8)
                : ctx.createLinearGradient(0, 0, 0, capH * 1.8);
            grad.addColorStop(0, rgba(style.cap, 0.95));
            grad.addColorStop(0.45, rgba(style.cap, 0.5));
            grad.addColorStop(1, rgba(style.cap, 0));
            ctx.fillStyle = grad;
            ctx.fillRect(0, pole ? H - capH * 1.8 : 0, W, capH * 1.8);
        });
    }

    // Cloud deck.
    if (style.clouds > 0) {
        const cloudCount = Math.round(30 * style.clouds) + 6;
        for (let i = 0; i < cloudCount; i++) {
            const cx = rand() * W;
            const cy = H * (0.08 + rand() * 0.84);
            blob(cx, cy, 10 + rand() * 34, [255, 255, 255], 0.10 + rand() * 0.22 * style.clouds * 2);
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
}

const textureCache = new Map();

/**
 * Three variants per type: worlds of a kind stay recognisable, but no two
 * neighbours are literally identical. Cached, so a world costs one paint per page.
 */
export function getPlanetTexture(type, sectorId) {
    const variant = Math.abs(Number(sectorId) || 0) % 3;
    const key = `planet:${type}:${variant}`;
    if (!textureCache.has(key)) {
        textureCache.set(key, makePlanetTexture(type, variant));
    }
    return textureCache.get(key);
}

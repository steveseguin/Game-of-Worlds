/* ============================================================
   landing.js — live command-deck hero

   A single Three.js scene behind the fold:
     · procedural world (relief-shaded surface, specular ocean,
       night-side city lights, cloud shell that casts shadows)
     · analytic atmospheric limb (exponential scale height)
     · magnitude/temperature-distributed starfield on a tilted
       galactic plane, over a baked nebula backdrop
     · EffectComposer + UnrealBloom so the sun glint, the day limb
       and the city lights actually bloom

   Everything procedural is driven by a fixed seed so screenshots
   are reproducible frame-for-frame.

   Degrades silently to the CSS starfield if WebGL is unavailable.
   ============================================================ */

import * as THREE from './vendor/three.module.min.js';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from './vendor/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from './vendor/addons/shaders/FXAAShader.js';
import { OutputPass } from './vendor/addons/postprocessing/OutputPass.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- stardate readout ---------- */
(function stardate() {
    const el = document.getElementById('stardate');
    if (!el) return;
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    function tick() {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const doy = Math.floor((now - start) / 86400000);
        el.textContent = `${now.getFullYear()}.${pad(doy, 3)} · ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }
    tick();
    setInterval(tick, 1000);
})();

/* ---------- scroll reveal ----------
   The CSS at rest is VISIBLE (see the REVEAL block in landing.css); `in` only adds
   an entrance animation. So nothing below can hide content — the worst case is a
   section that arrives without its rise. The unconditional timer is still here as a
   belt-and-braces: if an observer callback is starved past 1.2s the class lands
   anyway, and since a finished animation and a never-started one both end at the
   resting state, arming late is free. */
(function reveal() {
    const items = [...document.querySelectorAll('.reveal')];
    if (!items.length) return;
    const arm = el => el.classList.add('in');
    if (!('IntersectionObserver' in window) || reduceMotion) {
        items.forEach(arm);
        return;
    }
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) { arm(e.target); io.unobserve(e.target); }
        });
    }, { rootMargin: '0px 0px -4% 0px', threshold: 0 });
    items.forEach(i => io.observe(i));
    setTimeout(() => items.forEach(arm), 1200);
})();

/* ============================================================
   Seeded randomness
   Nothing in this file may call Math.random(): a screenshot that
   differs run to run cannot be diffed, and a regression hides in
   the noise. Every stochastic choice below draws from mulberry32.
   ============================================================ */
function mulberry32(a) {
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ============================================================
   Page backdrop — a real sky behind the whole document

   Measured on the last capture: the outer 300px of every scrolled frame had a
   mean luminance of 8.2 with a standard deviation of 1.1. That is not a dark
   background, it is a flat fill — 31% of a 1920 store-page screenshot carrying
   literally no information, which reads as "web page in a browser" rather than as
   an instrument you are looking through.

   The hero's starfield is a WebGL scene inside the hero's own canvas and cannot
   be extended down the document. So the same distribution is baked once into a
   tileable PNG and handed to CSS: magnitude follows a power law, colour follows a
   stellar temperature ramp, the brightest few get diffraction spikes. Laid twice
   at two different scales so the repeat period is the LCM of the two rather than
   the tile size, which is what stops a bright star marching down the gutter at a
   visible interval.

   Cheap — about 6ms — and seeded, so the gutters are identical frame to frame and
   a regression there is diffable like anything else.
   ============================================================ */
(function pageSky() {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    if (!g) return () => {};

    const RAMP = [
        [255, 152, 84], [255, 196, 135], [255, 232, 199],
        [255, 255, 247], [222, 235, 255], [179, 207, 255]
    ];
    const rnd = mulberry32(0x5EED17);

    /* Faint gas first, well under the stars: three soft blooms, bronze and indigo
       only, at an opacity where they register as unevenness rather than as clouds. */
    for (let i = 0; i < 3; i++) {
        const x = rnd() * S, y = rnd() * S, r = 150 + rnd() * 200;
        const warm = rnd() < 0.4;
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, warm ? 'rgba(126,86,40,0.045)' : 'rgba(58,78,146,0.05)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        // wrap the bloom so the tile stays seamless
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                g.save(); g.translate(dx * S, dy * S);
                g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
                g.restore();
            }
        }
    }

    /* 44 per tile, not 300. The tile is laid twice at 690px and 447px, so the count
       on a 1920x1080 frame is 44*(2073600/476100) + 44*(2073600/199809) ≈ 650 — a
       sky. At 300 it was six thousand, which is not a starfield, it is noise, and it
       buried the console it was supposed to sit behind. */
    const N = 44;
    for (let i = 0; i < N; i++) {
        const x = rnd() * S, y = rnd() * S;
        const mag = Math.pow(rnd(), 3.2);              // overwhelmingly faint, a few bright
        const temp = clamp01(0.5 + (rnd() + rnd() + rnd() - 1.5) * 0.6);
        const t = temp * (RAMP.length - 1);
        const k = Math.min(RAMP.length - 2, Math.floor(t)), f = t - k;
        const c = [0, 1, 2].map(j => Math.round(RAMP[k][j] + (RAMP[k + 1][j] - RAMP[k][j]) * f));
        const rad = 0.7 + mag * 2.9;
        const a = 0.11 + mag * 0.56;
        const spike = mag > 0.72 ? (mag - 0.72) / 0.28 : 0;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const px = x + dx * S, py = y + dy * S;
                if (px < -12 || px > S + 12 || py < -12 || py > S + 12) continue;
                const rg = g.createRadialGradient(px, py, 0, px, py, rad * 2.6);
                rg.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`);
                rg.addColorStop(0.42, `rgba(${c[0]},${c[1]},${c[2]},${(a * 0.30).toFixed(3)})`);
                rg.addColorStop(1, 'rgba(0,0,0,0)');
                g.fillStyle = rg;
                g.beginPath(); g.arc(px, py, rad * 2.6, 0, Math.PI * 2); g.fill();
                /* BLOOM, NOT A GLYPH.
                   The bright stars used to get a 1px four-ray cross: two hard hairlines
                   at 34% alpha, which at 1:1 is a plus sign drawn on the sky rather than
                   a star that is too bright for the sensor. Real optical bloom on the
                   kind of instrument this page pretends to be is ANAMORPHIC — one soft
                   horizontal streak, brightest at the core, gone within a few pixels —
                   so that is what it gets: a linear gradient, no vertical member, and a
                   soft halo under it. Nothing on this page is a hairline any more. */
                if (spike > 0) {
                    const len = 5 + spike * 13;
                    const sa = a * 0.12 * spike;
                    const lg = g.createLinearGradient(px - len, py, px + len, py);
                    lg.addColorStop(0, 'rgba(0,0,0,0)');
                    lg.addColorStop(0.5, `rgba(${c[0]},${c[1]},${c[2]},${sa.toFixed(3)})`);
                    lg.addColorStop(1, 'rgba(0,0,0,0)');
                    g.fillStyle = lg;
                    g.fillRect(px - len, py - 1.1, len * 2, 2.2);
                    const hg = g.createRadialGradient(px, py, 0, px, py, rad * 5.2);
                    hg.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${(a * 0.16 * spike).toFixed(3)})`);
                    hg.addColorStop(1, 'rgba(0,0,0,0)');
                    g.fillStyle = hg;
                    g.beginPath(); g.arc(px, py, rad * 5.2, 0, Math.PI * 2); g.fill();
                }
            }
        }
    }

    /* A blob URL, not a data URL. The same tile as a base64 data URL is a ~200KB
       string living in a CSS custom property that every style recalculation has to
       carry around; a blob is a 40-character reference to bytes the browser already
       holds. Falls back to a data URL where createObjectURL is unavailable, and to
       the CSS gradients alone if neither works. */
    const install = url => document.documentElement.style.setProperty('--page-sky', `url("${url}")`);
    try {
        if (cv.toBlob && window.URL && URL.createObjectURL) {
            cv.toBlob(b => { if (b) install(URL.createObjectURL(b)); else install(cv.toDataURL('image/png')); }, 'image/png');
        } else {
            install(cv.toDataURL('image/png'));
        }
    } catch (err) { /* tainted or unsupported: the CSS gradients stand alone */ }
})();

/* ---------- tileable value noise ---------- */
function hash(ix, iy) {
    let n = (ix | 0) * 374761393 + (iy | 0) * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, y, period) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const wrap = i => ((i % period) + period) % period;
    const xa = wrap(x0), xb = wrap(x0 + 1);
    const v00 = hash(xa, y0), v10 = hash(xb, y0), v01 = hash(xa, y0 + 1), v11 = hash(xb, y0 + 1);
    const sx = smooth(fx), sy = smooth(fy);
    const a = v00 + (v10 - v00) * sx, b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
}
function fbm(x, y, period, octaves) {
    let amp = 1, freq = 1, sum = 0, norm = 0, per = period;
    for (let i = 0; i < octaves; i++) {
        sum += amp * vnoise(x * freq, y * freq, per);
        norm += amp; amp *= 0.5; freq *= 2; per *= 2;
    }
    return sum / norm;
}
/** Ridged multifractal — the |1-2n| fold turns rounded hills into sharp crests. */
function ridged(x, y, period, octaves) {
    let amp = 1, freq = 1, sum = 0, norm = 0, per = period;
    for (let i = 0; i < octaves; i++) {
        const n = 1 - Math.abs(2 * vnoise(x * freq, y * freq, per) - 1);
        sum += amp * n * n;
        norm += amp; amp *= 0.52; freq *= 2.03; per *= 2;
    }
    return sum / norm;
}
function mix(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smoothstep(e0, e1, x) { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }

/**
 * Pick the value that leaves `fraction` of the field above it.
 *
 * This is the one thing this file has to get right. fbm() averages octaves of
 * value noise, so its output is pulled hard toward the middle of the range —
 * measured, it spans roughly 0.04..0.41 and NEVER reaches the 0.5 that a naive
 * threshold assumes. Earlier revisions hard-coded 0.46 for sea level and 0.5 for
 * cloud cover; both cuts sat above the entire distribution, so the planet was
 * 100% ocean and the cloud shell was 100% transparent. Derive the cut from the
 * histogram of what the noise actually produced and the split holds whatever
 * range it happens to have.
 */
function percentileCut(field, fraction) {
    const BINS = 512;
    const hist = new Uint32Array(BINS);
    for (let i = 0; i < field.length; i++) {
        hist[Math.min(BINS - 1, (field[i] * BINS) | 0)] += 1;
    }
    let remaining = Math.round(field.length * fraction);
    for (let bin = BINS - 1; bin >= 0; bin--) {
        remaining -= hist[bin];
        if (remaining <= 0) return bin / BINS;
    }
    return 0;
}

/** Normalise a field to 0..1 in place and return it. */
function normalise(field) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < field.length; i++) {
        const v = field[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
    }
    const span = (hi - lo) || 1;
    for (let i = 0; i < field.length; i++) field[i] = (field[i] - lo) / span;
    return field;
}

/* ============================================================
   PLATE MATERIAL — the one thing CSS cannot make

   Three art directors looked at this page and all three said the same thing about
   the panels: "no bevel, no relief and no metal in them". They were describing a
   real property, not a taste. Every plate was a linear-gradient, and a
   linear-gradient is a mathematically perfect ramp: measured across the face of a
   card, its luminance standard deviation inside any 8px window is ZERO. Real rolled
   steel never does that. The eye reads a perfect ramp as plastic, and no amount of
   extra gradient stops fixes it, because the missing thing is not shape — it is
   TOOTH.

   So the face of every plate is now a baked material rather than a ramp:

     · a broad mottle, the uneven anneal of a rolled sheet
     · a mid-frequency roughness on top of it
     · anisotropic brush streaks, drawn out along x — this is what makes a flat
       surface read as METAL rather than as stone
     · per-pixel grain, so an 8px window has a standard deviation at all
     · ~170 pits, each a dark hollow with a LIT crown on its up-left rim, because a
       pit is a shape and a shape has to obey the page's lamp
     · a handful of long scratches, bright with a dark trailing edge

   Tileable in both axes, seeded, and handed to CSS as one 512px blob. The vertical
   chamfer, the sheen and the rivets stay in CSS on top of it, so the shading is
   still a function of the plate's actual size while the MATERIAL is the same
   everywhere.

   THE TRAP THIS FILE IS FAMOUS FOR: fbm() does not span 0..1. It averages octaves,
   so it piles up in the middle — measured, roughly 0.04..0.41 — and a hard-coded
   0.5 cut sits above the entire distribution. Nothing below assumes a range;
   every field is normalise()d from its own measured min/max first.

   NOT run at parse time. It is ~150ms of straight-line arithmetic on the main
   thread, and measured under the capture harness's software rasteriser the hero's
   world bake finishes at about 3.8s against a screenshot at 4.3s — half a second of
   margin that this had been spending before the WebGL context was even created. The
   plates carry a correct fallback ramp until the tile lands, and they are below the
   fold. Nothing this file adds is allowed to delay the planet.
   ============================================================ */
const PLATE_TILE = 512;
const bakePlateMetal = (function plateMetal() {
    const S = PLATE_TILE;
    const g = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = S;
        return c.getContext('2d');
    })();
    if (!g) return;

    /* value noise that wraps on BOTH axes — vnoise() above only wraps x, which is
       right for an equirectangular map and wrong for a tile that repeats in a grid */
    const tn = (x, y, p) => {
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const fx = x - x0, fy = y - y0;
        const w = (i, m) => ((i % m) + m) % m;
        const xa = w(x0, p), xb = w(x0 + 1, p), ya = w(y0, p), yb = w(y0 + 1, p);
        const sx = smooth(fx), sy = smooth(fy);
        const a = hash(xa, ya) + (hash(xb, ya) - hash(xa, ya)) * sx;
        const b = hash(xa, yb) + (hash(xb, yb) - hash(xa, yb)) * sx;
        return a + (b - a) * sy;
    };
    const tfbm = (x, y, per, oct) => {
        let amp = 1, f = 1, sum = 0, norm = 0, p = per;
        for (let i = 0; i < oct; i++) { sum += amp * tn(x * f, y * f, p); norm += amp; amp *= 0.5; f *= 2; p *= 2; }
        return sum / norm;
    };

    function build() {
    const N = S * S;
    const broad = new Float32Array(N);     // rolled-sheet unevenness
    const rough = new Float32Array(N);     // mid-frequency tooth
    const brush = new Float32Array(N);     // anisotropic streaks along x
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const i = y * S + x;
            const u = x / S, v = y / S;
            broad[i] = tfbm(u * 3, v * 3, 3, 3);
            rough[i] = tfbm(u * 22, v * 22, 22, 3);
            // 4 cells across, 96 down: cells 24x wider than tall, which IS the streak
            brush[i] = tn(u * 4, v * 96, 4) * 0.6 + tn(u * 8, v * 192, 8) * 0.4;
        }
    }
    // Measure, do not assume. See the note above.
    normalise(broad); normalise(rough); normalise(brush);

    const img = g.createImageData(S, S);
    const px = img.data;
    const rnd = mulberry32(0x9A11ED);
    // Sits a shade above --steel-3 (#1d2433): the CSS chamfer layer that goes over
    // this is subtractive down the lower two thirds, so the material has to carry
    // the value the plate lands on AFTER that, not before it.
    const BASE = [0.141, 0.167, 0.228];
    for (let i = 0, o = 0; i < N; i++, o += 4) {
        const d = (broad[i] - 0.5) * 0.115
                + (rough[i] - 0.5) * 0.055
                + (brush[i] - 0.5) * 0.042
                + (hash(i & 8191, (i >> 13) + 7717) - 0.5) * 0.030;
        // Warmer where it is lit, cooler where it is not: a one-channel offset is a
        // grey wash, and grey is exactly what "flat CSS" looked like.
        px[o]     = Math.max(0, Math.min(255, (BASE[0] + d * 1.06) * 255));
        px[o + 1] = Math.max(0, Math.min(255, (BASE[1] + d * 1.00) * 255));
        px[o + 2] = Math.max(0, Math.min(255, (BASE[2] + d * 0.90) * 255));
        px[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);

    /* Pits and scratches are SHAPES, so they get lit by the page's lamp: highlight
       up-left, shadow down-right. Drawn nine times around the tile so a pit that
       straddles the seam appears on both sides of it. */
    const wrapDraw = (fn) => {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                g.save(); g.translate(dx * S, dy * S); fn(); g.restore();
            }
        }
    };
    /* A PIT IS A HOLLOW, AND A HOLLOW IS LIT BACKWARDS FROM A BUMP. The near rim —
       the up-left one, on the same side as the lamp — slopes away from it and goes
       DARK; the far wall on the down-right is the part that faces the lamp and takes
       the highlight. Getting this the wrong way round is not a subtle error: the
       first pass shaded them like domes and 170 soap bubbles appeared on every
       plate. Dark up-left, bright down-right, and they read as damage. */
    for (let i = 0; i < 130; i++) {
        const x = rnd() * S, y = rnd() * S, r = 0.9 + Math.pow(rnd(), 3.0) * 2.8;
        const deep = 0.22 + rnd() * 0.24;
        wrapDraw(() => {
            const rg = g.createRadialGradient(x - r * 0.26, y - r * 0.26, 0, x, y, r);
            rg.addColorStop(0, `rgba(0,0,0,${deep.toFixed(3)})`);
            rg.addColorStop(0.62, `rgba(0,0,0,${(deep * 0.5).toFixed(3)})`);
            rg.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = rg;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
            g.strokeStyle = `rgba(186,208,242,${(deep * 0.38).toFixed(3)})`;
            g.lineWidth = Math.max(0.6, r * 0.22);
            g.beginPath(); g.arc(x, y, r * 0.72, -Math.PI * 0.22, Math.PI * 0.80); g.stroke();
        });
    }
    for (let i = 0; i < 22; i++) {
        const x = rnd() * S, y = rnd() * S;
        const len = 14 + rnd() * 120;
        const ang = (rnd() - 0.5) * 0.34;               // near-horizontal: the brush direction
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        const a = 0.05 + rnd() * 0.09;
        wrapDraw(() => {
            g.lineWidth = 1;
            g.strokeStyle = `rgba(0,0,0,${(a * 0.9).toFixed(3)})`;
            g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x2, y2 + 1); g.stroke();
            g.strokeStyle = `rgba(206,224,252,${a.toFixed(3)})`;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        });
    }

    const install = url => document.documentElement.style.setProperty('--plate-metal', `url("${url}")`);
    try {
        if (g.canvas.toBlob && window.URL && URL.createObjectURL) {
            g.canvas.toBlob(b => { if (b) install(URL.createObjectURL(b)); }, 'image/png');
        } else {
            install(g.canvas.toDataURL('image/png'));
        }
    } catch (err) { /* the CSS ramp underneath is the fallback and is already correct */ }
    };

    let done = false;
    return () => { if (done) return; done = true; build(); };
})();
// Backstop for the no-WebGL path, where the hero returns before it can arm anything.
// Deliberately later than the world's own bake so it never fires first on a machine
// where the hero is working.
setTimeout(() => bakePlateMetal(), 5000);

/**
 * Upload a packed RGBA buffer as a texture.
 *
 * A DataTexture, NOT a CanvasTexture, and that is load-bearing.
 *
 * A 2D canvas stores its bitmap PREMULTIPLIED. Every one of these maps carries
 * data in the alpha channel — terrain height for the world, nothing at all for
 * the atmosphere — so routing them through a canvas multiplies the RGB by the
 * height field on the way in and divides it back out on the way to the GPU. With
 * land at alpha 0.5..1.0 that cost the albedo a bit of precision quietly. The
 * moment the sea was pinned to alpha 0 — which is the correct packing, because it
 * doubles the codes available to the land — it cost the OCEAN ITS COLOUR
 * ENTIRELY: 0 x colour is 0, and no unpremultiply recovers it. The sea rendered
 * black, which is a rather visible way to be told that a canvas is not a buffer.
 *
 * A DataTexture hands the GPU the exact bytes that were written. It is also one
 * fewer full-surface copy per bake.
 */
function dataTexture(src, w, h) {
    const tex = src instanceof Uint8ClampedArray || src instanceof Uint8Array
        ? new THREE.DataTexture(src, w, h, THREE.RGBAFormat, THREE.UnsignedByteType)
        : new THREE.CanvasTexture(src);
    tex.needsUpdate = true;
    // The rows come out of the bakes top-down, which is the opposite of GL's
    // convention; three.js flips CanvasTexture for you and DataTexture not at all.
    if (tex.isDataTexture) tex.flipY = true;
    // Deliberately NOT SRGBColorSpace: these buffers carry packed data (height in
    // alpha, cloud density in red, city lights in green) alongside colour. A colour
    // space conversion would mangle the data channels, so the shaders decode the
    // albedo themselves (pow 2.2) and read the rest raw.
    tex.colorSpace = THREE.NoColorSpace;
    // u wraps around the equator, v clamps at the poles
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    return tex;
}

/* ============================================================
   Cooperative slicing

   Baking the world costs about a second of straight-line arithmetic. Run as one
   block that is a one-second freeze the instant the hero paints — scrolling
   stalls, the star twinkle stops, and the page feels broken exactly when the
   visitor is deciding whether to stay.

   Every bake below is a generator that yields once per texture row. The driver
   pulls rows until its millisecond budget is spent, then hands the thread back.
   Total wall time is roughly the same; the longest single block is SLICE_MS.
   ============================================================ */
const SLICE_MS = 18;
const now = () => (window.performance && performance.now ? performance.now() : Date.now());

/**
 * Hand the thread back and come straight back.
 *
 * NOT setTimeout(fn, 0): after five levels of nesting the HTML spec clamps timers to
 * 4ms, and a bake that yields every 18ms then waits 4ms is throwing away a fifth of
 * its wall time to the clamp — which is exactly the difference between the world
 * arriving in two seconds and arriving in five. A message task has no clamp and still
 * lets the browser paint between slices.
 */
const nextTask = (() => {
    if (typeof MessageChannel === 'function') {
        const ch = new MessageChannel();
        const queue = [];
        ch.port1.onmessage = () => { const fn = queue.shift(); if (fn) fn(); };
        return fn => { queue.push(fn); ch.port2.postMessage(0); };
    }
    return fn => setTimeout(fn, 0);
})();

function driveSliced(gen, onDone) {
    function tick() {
        const end = now() + SLICE_MS;
        let step;
        try {
            do { step = gen.next(); } while (!step.done && now() < end);
        } catch (err) {
            // Slices run from a task, so a throw here escapes any caller's try/catch and
            // would take the animation loop with it. A missing world is survivable — but
            // it must not be SILENT: swallowing this is what let a broken bake ship as
            // "the planet looks a bit dark today" instead of as an error anyone could see.
            console.error('[landing] bake failed', err);
            return;
        }
        if (step.done) { if (onDone) onDone(step.value); }
        // a task, not rAF: under software WebGL a frame can take 150ms, and pacing the
        // bake to the frame rate would leave the planet missing for ten seconds
        else nextTask(tick);
    }
    nextTask(tick);
}

/* ============================================================
   Surface bake — RGB albedo, A elevation

   RESOLUTION IS NOT A TASTE SETTING HERE. At the hero's framing the globe spans
   about 950 screen pixels, and at the sub-viewer point one unit of u covers
   2*pi*R/(2*pi) = R_px * 2 ~ 2985 screen pixels. A 1024-wide equirect therefore
   magnifies to 2.9 screen pixels per texel dead centre of the disc, and GPU
   bilinear magnification of an edge at 2.9x is a visible quilt: every texel cell
   becomes a flat facet with a crease at its boundary. Worse, the relief shader
   differentiates this map, and the derivative of a bilinear patch is piecewise
   CONSTANT — so the shading, not just the albedo, lands on a hard square grid.
   That is the mosaic that killed the last pass.

   1280 puts the footprint at 2.33 screen px/texel — and the frame is rendered at a
   1.5x supersample, so in the drawing buffer that is 1.55 SAMPLES per texel, which
   is still oversampled rather than magnified.

   2048 was tried and reverted, and the reason is a hard constraint rather than a
   preference: the surface, the atmosphere and the moon are one chain of arithmetic
   on ONE thread, and at 2048 that chain took 6.1 seconds to land. Measured under the
   capture harness the planet was still missing four seconds in, and the frame that
   was actually photographed was an empty starfield with a rim light on it — twice.
   A texture nobody has seen yet has no quality at all.

   The mosaic that 2048 was raised to fix is also no longer a resolution problem: the
   quilt came from a coastline hard-thresholded per texel against a seven-octave
   field, which is fixed at its source now (see the coastline note in bakeWorld). Do
   not raise this without re-measuring how long the whole chain takes to land —
   `window.performance` marks around the three bakes will tell you in one run.
   ============================================================ */
const SURF_W = 1280, SURF_H = 640;

function* bakeWorld() {
    const w = SURF_W, h = SURF_H;
    const P = 7;                     // continent period (tiles in u)
    const LAND_FRACTION = 0.31;

    const elev = new Float32Array(w * h);
    const moist = new Float32Array(w * h);

    for (let py = 0; py < h; py++) {
        const v = py / h;
        const vy = v * P * (h / w) * 2.0;
        for (let px = 0; px < w; px++) {
            const u = px / w;
            const ux = u * P;
            // Domain warp first — straight fbm gives blobby, obviously-noise coastlines.
            // ONE octave each, not two: the warp only has to break the lattice's axis
            // alignment, which the base octave does entirely on its own. The second
            // octave displaced the sample by a fraction of a texel and cost an eighth
            // of the most expensive loop on the page for it.
            const wx = vnoise(ux * 1.7 + 11.3, vy * 1.7 + 4.7, P * 2) - 0.5;
            const wy = vnoise(ux * 1.7 + 31.9, vy * 1.7 + 17.1, P * 2) - 0.5;
            // SIX octaves at 1280. The finest octave has to land near the texel pitch
            // or the map carries no information the resolution can show — but not
            // BELOW it, or the map carries information the resolution cannot show,
            // which is aliasing. Six puts octave six at 5.8 texels here.
            const base = fbm(ux + wx * 1.15, vy + wy * 1.15, P, 6);
            // Three crest octaves, not four: the fourth carries amplitude 0.52^3 ≈ 14%
            // of the total and is then flattened again by normalise(), and at this
            // resolution it lands inside the relief blur anyway.
            const crest = ridged(ux * 2.4 + 5.5, vy * 2.4 + 2.2, P * 2, 3);
            const i = py * w + px;
            elev[i] = base * 0.74 + crest * 0.26;
            // Aridity is the broadest field on the planet — one continent wet, the
            // next dry — so it gets one octave. The second was adding texture to a
            // term that is then run through three smoothsteps.
            moist[i] = vnoise(ux * 1.35 + 61.4, vy * 1.35 + 23.8, P);
        }
        yield;
    }
    normalise(elev);
    normalise(moist);

    /* ---- the coastline is decided on a SMOOTHED field ---------------------------
       Built as a QUARTER-RESOLUTION mip read back bilinearly, not with blurField().
       Measured: a separable box blur of radius 3 over 2048x1024 floats costs 430ms,
       almost all of it in the vertical sweep — that pass strides 8KB per access, so
       every one of its eight million reads is a cache miss. A 4x box-downsample is
       two sequential passes over the same data and a 512KB working set, and its
       bilinear expansion is a tent filter eight texels wide, which is a WIDER and
       smoother low-pass than the blur it replaces. 430ms down to about 30, and half
       a second matters here: the hero has to be on screen before the visitor decides
       whether the page is loading or broken.
   ---------------------------------------------------------------------------- */
    /*
       The land/sea test used to be `elev[i] < sea` on the raw seven-octave field.
       The finest octave lands at ~4.6 texels, so within a couple of codes of sea
       level the contour is not a coastline at all — it is a cloud of individual
       texels flickering across the threshold. Each one that came up became a SAND
       texel (the shore ramp puts anything within 0.045 of sea level at sand), and
       each one that stayed down became deep water, so the entire near-coastal band
       rendered as tan stipple with dark holes in it. At the terminator, where the
       light is grazing and the contrast is highest, it read as JPEG noise across the
       middle of the largest object on the page.

       Two fields, two jobs. `shore` is elev low-passed over ~3 texels and is the only
       thing that decides where the water stops; `elev` keeps every octave and drives
       the ramps — aridity, uplands, rock, snow — which are all broad functions that
       lose nothing to being read off the sharp field. The result is a coastline with
       bays and headlands and no isolated pixels anywhere on it.

       The transition is then SOFT rather than binary: a smoothstep across a band a
       few codes wide, so a coast blends water → shelf → sand over two or three
       texels instead of switching in one. */
    const SW = w >> 2, SH = h >> 2;
    const coarse = new Float32Array(SW * SH);
    for (let py = 0; py < h; py++) {
        const cy = (py >> 2) * SW, row = py * w;
        for (let px = 0; px < w; px++) coarse[cy + (px >> 2)] += elev[row + px];
    }
    for (let i = 0; i < coarse.length; i++) coarse[i] *= 1 / 16;
    yield;
    /* ---- and then the detail is put BACK, at a controlled scale ------------------
       The mip is what stopped the waterline fizzing, but on its own it also removes
       every headland, bay and offshore island the map had: an art director read the
       result exactly right as "hard-edged tan amoebas with no coastline detail". A
       coast is a FRACTAL — its length depends on the ruler — and a low-passed field
       has no fractal left in it at all.

       So one more band goes back on, at a frequency chosen to sit between the two
       failure modes. Two octaves at 63 and 126 cycles across u put the finest
       feature at about ten texels, which is six times the texel pitch (no per-texel
       speckle, which is the artefact the mip exists to kill) and a fifth of the
       smoothed field's own scale (so it bites, and bays and islands appear). The
       ridged fold is deliberate: |1-2n| gives crests rather than rounded hills, and
       run through a threshold that reads as spits and inlets rather than as wobble.
       Amplitude is ~10x the coast blend half-width, which is what decides how deeply
       it cuts. ---------------------------------------------------------------- */
    const COAST_DETAIL = 0.105;
    const shore = new Float32Array(w * h);
    for (let py = 0; py < h; py++) {
        // sample at the mip texel CENTRES, and wrap in u because an equirect is a
        // cylinder — a coastline with a seam down it is a coastline on screen
        const sy = py * 0.25 - 0.5;
        const y0 = Math.floor(sy), fy = sy - y0;
        const ya = Math.min(SH - 1, Math.max(0, y0)) * SW;
        const yb = Math.min(SH - 1, Math.max(0, y0 + 1)) * SW;
        const row = py * w;
        // x spans exactly P*9 as u runs 0..1, and the period is P*9, so the band
        // wraps: a seam here is a seam down the middle of the largest object on the page
        const dvy = (py / h) * P * (h / w) * 2 * 9;
        for (let px = 0; px < w; px++) {
            const sx = px * 0.25 - 0.5;
            const x0 = Math.floor(sx), fx = sx - x0;
            const xa = ((x0 % SW) + SW) % SW, xb = ((x0 + 1) % SW + SW) % SW;
            const t = coarse[ya + xa] + (coarse[ya + xb] - coarse[ya + xa]) * fx;
            const u2 = coarse[yb + xa] + (coarse[yb + xb] - coarse[yb + xa]) * fx;
            const det = ridged((px / w) * P * 9 + 63, dvy + 19, P * 9, 2) - 0.42;
            shore[row + px] = t + (u2 - t) * fy + det * COAST_DETAIL;
        }
        if ((py & 63) === 63) yield;
    }
    const sea = percentileCut(shore, LAND_FRACTION);
    // half-width of the blend, in units of the normalised elevation range
    const COAST_W = 0.011;

    // A raw buffer, not a canvas: see dataTexture(). Alpha carries terrain height,
    // and a canvas would premultiply the albedo by it.
    const d = new Uint8ClampedArray(w * h * 4);
    // Full-precision relief, quantised into alpha only after it has been filtered.
    const relief = new Float32Array(w * h);

    // Muted, steel-friendly world: the page palette is gunmetal + amber, and a
    // saturated tropical green globe fights it. Oceans run cold navy, land runs
    // olive → ochre → bare rock → snow.
    const DEEP = [6, 20, 42], MID = [10, 40, 78], SHELF = [24, 74, 116];
    const SAND = [138, 122, 88], WET = [50, 78, 46], DRY = [124, 104, 62];
    const UP = [96, 90, 70], ROCK = [116, 110, 102], SNOW = [236, 241, 248];
    const ICE = [212, 226, 242];

    for (let py = 0; py < h; py++) {
        const v = py / h;
        const lat = Math.abs(v - 0.5) * 2;             // 0 equator → 1 pole
        /* CLIMATE BANDS, precomputed per row.
           Aridity used to be one noise field with a weak (1-lat) tilt on it, which
           puts deserts wherever the noise happened to be high — so the biome map had
           no structure and the ramp read as "one hard step" rather than as climate.
           A planet's dry belts are at the descending limb of the Hadley cell, around
           25-35 degrees, with a wet equator and wet mid-latitudes either side. Two
           gaussians is the whole model and it is enough to make the bands legible. */
        const dryBelt = Math.exp(-Math.pow((lat - 0.31) / 0.15, 2));
        const wetEq = Math.exp(-Math.pow(lat / 0.13, 2));
        for (let px = 0; px < w; px++) {
            const i = py * w + px;
            const e = elev[i];
            const c = shore[i];
            // 0 = water, 1 = land, with a soft band across sea level
            const lf = smoothstep(sea - COAST_W, sea + COAST_W, c);
            let r, g, b, height;

            /* Both sides are only evaluated inside the blend band, which is two or
               three texels wide — everywhere else exactly one branch runs, the same
               as before the soft coast landed. Evaluating both unconditionally cost
               a quarter of a second of the hero's time to change the colour of one
               texel in four hundred. */
            const wantW = lf < 0.999, wantL = lf > 0.001;
            let wr = 0, wg = 0, wb = 0, lr = 0, lg = 0, lb = 0, land = 0;

            if (wantW) {
                /* Water. Depth is read off the SMOOTH field so the shelf follows the
                   same coast the land does; without that the two disagree by a texel
                   and the disagreement is the speckle again, one indirection down. */
                const dpt = clamp01(c / (sea || 1));    // 0 abyss → 1 coast
                const shelf = smoothstep(0.72, 1.0, dpt);
                const t = smoothstep(0.0, 0.75, dpt);
                wr = mix(mix(DEEP[0], MID[0], t), SHELF[0], shelf);
                wg = mix(mix(DEEP[1], MID[1], t), SHELF[1], shelf);
                wb = mix(mix(DEEP[2], MID[2], t), SHELF[2], shelf);
            }
            if (wantL) {
                /* Land. The elevation ramps run on the SHARP field, so continents keep
                   their ridgelines; only the waterline is smooth. */
                land = clamp01((e - sea) / ((1 - sea) || 1));
                // aridity = the noise field, banded by latitude and dried out by
                // altitude (rain shadow). See dryBelt / wetEq above.
                const arid = clamp01(moist[i] * 1.05 - 0.16 + dryBelt * 0.40 - wetEq * 0.34
                    - smoothstep(0.58, 0.86, lat) * 0.26 - land * 0.14);
                // beach: a real one, read off the smooth field, so it is a band around
                // the coast rather than a scatter of tan texels wherever noise crossed
                const beach = 1 - smoothstep(0.0, 0.028, clamp01((c - sea) / ((1 - sea) || 1)));
                lr = mix(WET[0], DRY[0], arid); lg = mix(WET[1], DRY[1], arid); lb = mix(WET[2], DRY[2], arid);
                lr = mix(lr, SAND[0], beach); lg = mix(lg, SAND[1], beach); lb = mix(lb, SAND[2], beach);
                /* Wider ramps, and they OVERLAP. 0.28→0.62 then 0.55→0.80 gave three
                   biomes with a step between each pair, which is what "no biome
                   transition" was describing. Uplands now come in from the first
                   ground above the shelf and rock keeps climbing through them. */
                const up = smoothstep(0.14, 0.58, land);
                lr = mix(lr, UP[0], up); lg = mix(lg, UP[1], up); lb = mix(lb, UP[2], up);
                const rk = smoothstep(0.44, 0.88, land);
                lr = mix(lr, ROCK[0], rk); lg = mix(lg, ROCK[1], rk); lb = mix(lb, ROCK[2], rk);
                // snow line drops toward the poles
                const sn = smoothstep(0.80 - lat * 0.42, 0.94 - lat * 0.42, land);
                lr = mix(lr, SNOW[0], sn); lg = mix(lg, SNOW[1], sn); lb = mix(lb, SNOW[2], sn);
            }
            r = !wantL ? wr : !wantW ? lr : mix(wr, lr, lf);
            g = !wantL ? wg : !wantW ? lg : mix(wg, lg, lf);
            b = !wantL ? wb : !wantW ? lb : mix(wb, lb, lf);
            // ocean is dead flat; the relief ramps in with the shoreline
            height = land * lf;

            // polar caps, ragged rather than a clean band
            const capNoise = vnoise(px / w * P * 3, py / h * P * 3, P * 3) * 0.10;
            const ice = smoothstep(0.74 + capNoise, 0.90 + capNoise, lat);
            if (ice > 0) {
                r = mix(r, ICE[0], ice); g = mix(g, ICE[1], ice); b = mix(b, ICE[2], ice);
                height = mix(height, 0.18, ice);
            }

            const o = i * 4;
            d[o] = r; d[o + 1] = g; d[o + 2] = b;
            relief[i] = clamp01(height);
        }
        yield;
    }

    /* --- the relief channel, and why it is not simply `height` -------------------
       Alpha is EIGHT BITS. The old packing put ocean at 0.5 and land at 0.5..1.0,
       so the whole land range lived in 127 codes — and the shader then takes a
       central difference of it and multiplies by ~95. One code of rounding error is
       1/255 = 0.0039; times 95 that is a 0.37 tilt of the surface normal, which is
       larger than the tilt any real feature on the map produces. The planet's land
       was therefore shaded almost entirely by ROUNDING NOISE, and it rendered as the
       fizzing per-texel stipple an art director correctly called "aliased chunky
       noise rather than painted detail".

       Two changes, both about signal-to-noise rather than taste:
         1. land occupies the FULL 0..255 range and the sea is pinned to 0 (the
            shader masks the sea out with atm.b anyway, so it needs no code space).
            That doubles the codes per unit of elevation.
         2. a real low-pass over the field before quantising. The finest fbm octave
            lands at ~5.8 texels, and its CONTRIBUTION TO A GRADIENT is proportional
            to its frequency — so it dominates the derivative while carrying almost
            none of the shape. Filtering takes it out of the relief and leaves it in
            the albedo, which is where fine detail belongs: colour variation, not
            shading.
       Together the useful gradient roughly doubles while the noise floor halves.

       A single [1,2,1] pass was not enough. At the terminator the light is grazing,
       so a normal perturbation that is invisible at noon is the difference between
       lit and unlit — and the whole terminator band came back as a dense pepper of
       individual texels, which is precisely what the last review called "a
       high-frequency stipple of tan pixels, sand or JPEG noise, not terrain". A
       three-tap kernel removes the octave at the Nyquist limit and nothing else;
       blurField at radius 2 is two box passes of width five, run twice, which takes
       out everything under about six texels. Continents lose nothing to it — they
       are hundreds of texels across — and it is the SHADING that reads the field. */
    blurField(relief, w, h, 2);

    /* --- RELIEF IN THE ALBEDO, not only in the normal ----------------------------
       The shader lights the height field, which gives the terrain modelling wherever
       the sun is at a useful angle to it — and nothing at all where it is not. Every
       real relief map also carries the slope in its VALUE: steep ground is dark, flat
       ground is not, whichever way the light is coming from. Without it the biome
       colours sit on the land as flat washes and the ramps read as thresholds rather
       than as terrain, which is what "hard-edged tan amoebas with no altitude or
       relief shading" was describing.

       The scale is measured rather than guessed: the mean slope of THIS field decides
       what counts as steep, so the pass lands the same way whatever the noise
       happened to produce. Masked to land — a dark rim traced around every continent
       is the one thing this must not draw. */
    {
        const slope = new Float32Array(w * h);
        let acc = 0;
        for (let py = 0; py < h; py++) {
            const up = py > 0 ? -w : 0, dn = py < h - 1 ? w : 0, row = py * w;
            for (let px = 0; px < w; px++) {
                const i = row + px;
                const gx = relief[i + (px < w - 1 ? 1 : 0)] - relief[i + (px > 0 ? -1 : 0)];
                const gy = relief[i + dn] - relief[i + up];
                const s = Math.sqrt(gx * gx + gy * gy);
                slope[i] = s; acc += s;
            }
            if ((py & 63) === 63) yield;
        }
        const scale = 1 / Math.max((acc / slope.length) * 2.6, 1e-6);
        for (let i = 0; i < slope.length; i++) {
            if (relief[i] < 0.004) continue;                 // sea, and the flat ice cap
            const s = clamp01(slope[i] * scale);
            const k = 1 - 0.44 * s * s;
            const o = i * 4;
            d[o] *= k; d[o + 1] *= k; d[o + 2] *= k;
        }
        yield;
    }

    /* The same +-half-a-code ordered dither the moon's encode uses. The relief is a
       smooth field after the filter above, and a smooth field quantised to 256 codes
       contours; the shader then differentiates those contours into visible terraces.
       Half a code of decorrelated noise costs nothing and removes them. */
    const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let py = 0; py < h; py++) {
        const brow = (py & 3) * 4, row = py * w;
        for (let px = 0; px < w; px++) {
            d[(row + px) * 4 + 3] = relief[row + px] * 255 + (BAYER4[brow + (px & 3)] / 16 - 0.46875);
        }
        if ((py & 63) === 63) yield;
    }

    // moist is deliberately NOT returned: at 2048x1024 it is an 8MB Float32Array that
    // nothing downstream reads, and holding it alive across the atmosphere bake doubles
    // the transient footprint on a laptop for no reason.
    // `shore` goes out rather than `elev` so the atmosphere pass puts its land mask,
    // its cloud shadowing and its city lights on exactly the coastline the albedo
    // drew. Two fields disagreeing by a texel at the waterline is where the stipple
    // came from in the first place.
    return { data: d, elev: shore, sea, coastW: COAST_W };
}

/* ============================================================
   Atmosphere/lights bake — R cloud, G city lights, B land mask
   ============================================================ */
function* bakeAtmos(world) {
    const w = SURF_W, h = SURF_H;
    const P = 6;
    /* STILL 0.26, and the four points that would have restored the alpha the front
       carving costs are not affordable. buildScene() is a SLICED generator: it does
       18ms of work per animation frame, so its wall-clock length is (work / 18ms) x
       frame cost — and the cloud shell is created part-way through it, which means
       every extra non-discarded cloud fragment makes every REMAINING slice's frame
       more expensive. Measured under the capture harness, lifting this to 0.30 moved
       the world's arrival about a second later and the globe was photographed as a
       black disc with a rim on it. Coverage on this planet is a render-budget number,
       not a taste one. */
    const CLOUD_COVER = 0.26;
    const { elev, sea, coastW } = world;
    const CW = coastW || 0.011;

    /* ---- WEATHER, not one smear -------------------------------------------------
       What was here was a single four-octave fbm with a one-axis warp, percentile-cut
       at 34%. Percentile-cutting one fbm gives you the top third of a blob field:
       one continuous mass wherever the field happened to be high — measured on the
       hero, a ~400px unbroken band across the equator with a single hook in it and
       nothing else. It had no structure because there was nothing in the model that
       KNEW about structure.

       Three things go in, and each is answering a specific part of that:
         · a TWO-AXIS domain warp at half the base frequency and a big amplitude.
           A one-axis warp shears; two axes fold, and folding is what turns level
           sets into fronts and spirals rather than lobes.
         · TWO BANDS at 1x and 3x, weighted 0.62 / 0.38, each warped by the same
           field. One band has one scale in it by definition, which is exactly
           "no scale variation".
         · a LATITUDE PROFILE — a wet intertropical band, dry subtropics either side
           of it, and a mid-latitude storm track — added before the cut, so coverage
           varies with latitude the way it does on a planet instead of the cut
           landing wherever the noise felt like it.
       Every x span below is an exact multiple of P so the field still wraps.

       WHAT THE TWO BANDS COULD NOT DO. Percentile-cutting the sum of two smooth
       fields still gives one super-level set per high region: measured on the hero,
       one deck 405px across carrying ninety per cent of the cloud texels on screen,
       and the bloom pass (threshold 0.90, radius 0.52) then welds its bright tops
       into a single glowing bar. Two things break that up, and NEITHER of them is
       allowed to cost a noise evaluation — see the budget note below.

         · the FRONTS are the 3x band FOLDED — 1 - |2*cell-1| — and they MULTIPLY the
           mass rather than adding to anything: 0.44 + 1.05*front. A fold turns a
           field's mid-level set into a filament, and a filament running through a
           deck is what a front looks like from orbit. Multiplying CARVES the deck,
           and the range matters: at 0.44 the mass is more than halved, so where the
           fold is at its minimum the field drops through the percentile cut and an
           actual hole opens. Measured on the disc that takes the largest deck from
           358px wide to 151 and its share of all cloud texels from 50% to 40%, and
           it evens out the longitudes too — worst-to-best coverage 6.5:1 down to
           4.3:1, which is what stops one face of the planet being bald. Adding a
           third band instead would only lay more cloud on top and would narrow the
           field's histogram, which is the failure documented in the budget note.
         · FOUR LOWS. Weather on a rotating planet is not isotropic noise: it has
           centres. Each low rotates the sampling frame around itself by an angle
           that decays with radius (a swirl warp, not an added decal), so the decks
           and their fronts wind INTO the centre and are made of the same material as
           everything else. Cyclonic sense follows the hemisphere. The fine bands get
           only 40% of the displacement: a rotation applied at full strength to a 3x
           band smears its detail into arcs that read as motion blur.

       THE BUDGET, which is the hard constraint on everything above. This generator
       is driven in 18ms slices ahead of the planet's 620ms reveal, and the reveal has
       to finish before the page is worth looking at. A version of this pass that
       added ONE more two-octave fbm per texel — seven noise evaluations to nine, on
       819,200 texels — pushed the world's arrival far enough back that the globe
       rendered as a black disc with a rim on it. The fold above therefore reuses a
       band that had already been sampled, and the lows read their rotation out of a
       64-entry table built once per low rather than calling exp/cos/sin per texel.
       Anything added here must be free in the same way.
       ---- */
    const cloud = new Float32Array(w * h);
    /* Placed in the storm-track latitudes both sides of the equator, which is where a
       planet puts them, and seeded so the hero is the same planet on every load. */
    const LOW_LUT = 64, LOW_REACH = 2.2;
    const lowRnd = mulberry32(0x2F6E2B1);
    const LOWS = [];
    for (let k = 0; k < 4; k++) {
        const hemi = k % 2 ? 1 : -1;
        const cv = 0.5 + hemi * (0.12 + lowRnd() * 0.16);
        const spin = hemi * 0.95 * (0.82 + lowRnd() * 0.40);
        /* phi(r) = spin * exp(-0.62 r^2), tabulated over 0..2.2R in 64 steps and
           stored as its cosine and sine. Three transcendentals per texel over a
           130k-texel footprint is not affordable here (see the budget note); two
           array reads are. */
        const cs = new Float32Array(LOW_LUT + 1), sn = new Float32Array(LOW_LUT + 1);
        for (let j = 0; j <= LOW_LUT; j++) {
            const rr = (j / LOW_LUT) * LOW_REACH;
            const phi = spin * Math.exp(-rr * rr * 0.62);
            cs[j] = Math.cos(phi); sn[j] = Math.sin(phi);
        }
        LOWS.push({
            cv, cu: lowRnd(),
            R: 0.105 + lowRnd() * 0.045,
            cs, sn,
            cosLat: Math.max(0.3, Math.cos((0.5 - cv) * Math.PI))
        });
    }
    for (let py = 0; py < h; py++) {
        const v = py / h;
        const vy = v * P * (h / w) * 2;
        const lat = Math.abs(v - 0.5) * 2;
        // Only the lows whose footprint reaches this row can do anything on it.
        const near = LOWS.filter(L => Math.abs(v - L.cv) * 2 < LOW_REACH * L.R);
        /* The bands are WEAK, and they are modulated by the mass field below rather
           than added flat. A flat +0.30 at the equator does not produce an
           intertropical convergence zone, it produces a painted stripe: every texel
           in the band clears the percentile cut at once and the planet comes back
           with one unbroken white belt round its middle, which is precisely the
           "~400px white smear across the equator" this pass exists to remove.
           Weather is banded in PROBABILITY, not in fact. */
        const band =
            0.12 * Math.exp(-Math.pow((lat - 0.05) / 0.11, 2))     // ITCZ
            - 0.15 * Math.exp(-Math.pow((lat - 0.33) / 0.14, 2))   // subtropical high
            + 0.11 * Math.exp(-Math.pow((lat - 0.66) / 0.17, 2));  // storm track
        for (let px = 0; px < w; px++) {
            const ux = (px / w) * P;
            /* The lows, as a displacement in ux/vy units. Rotating the offset vector
               by phi(r) and taking the difference is the whole cyclone: at the centre
               the frame is turned by up to ~0.9 rad, at 2R it is turned by nothing,
               and everything the noise draws in between arrives wound around it. */
            let sx = 0, sy = 0;
            for (let k = 0; k < near.length; k++) {
                const L = near[k];
                let du = px / w - L.cu; du -= Math.round(du);      // shortest way round
                const ax = du * L.cosLat, ay = (v - L.cv) * 2;
                const rr = Math.sqrt(ax * ax + ay * ay) / L.R;
                if (rr >= LOW_REACH) continue;
                const j = (rr * (LOW_LUT / LOW_REACH)) | 0;
                const cs = L.cs[j], sn = L.sn[j];
                sx += (ax * cs - ay * sn - ax) * P;
                sy += (ax * sn + ay * cs - ay) * 2 * P;
            }
            const gx = ux + sx, gy = vy + sy;
            const fx = ux + sx * 0.4, fy = vy + sy * 0.4;
            /* Period P*0.5, not P. The warp spans half a period across the texture,
               so wrapping it at P put a different value either side of longitude
               zero and the whole cloud field stepped across the seam. */
            const wx = vnoise(gx * 0.5 + 3.1, gy * 0.5 + 9.2, P * 0.5) - 0.5;
            const wy = vnoise(gx * 0.5 + 27.7, gy * 0.5 + 41.3, P * 0.5) - 0.5;
            const mass = fbm(gx + wx * 2.6, gy * 1.2 + wy * 1.7, P, 3);
            const cell = fbm(fx * 3 + wx * 4.2, fy * 3.4 + wy * 2.4, P * 3, 2);
            const front = 1 - Math.abs(2 * cell - 1);
            cloud[py * w + px] = (mass * 0.62 + cell * 0.38) * (0.44 + 1.05 * front)
                               + band * (0.25 + 1.5 * mass);
        }
        yield;
    }
    normalise(cloud);
    const cut = percentileCut(cloud, CLOUD_COVER);

    // Settlement density field. It gets the same treatment as every other noise field in
    // this file, and for the same reason: measured, a two-octave fbm here spans 0.007..0.465,
    // so the "obvious" 0.38 cut lit 2,678 of 163,692 land texels and the night side came out
    // black. Normalise, then cut by percentile.
    const pop = new Float32Array(w * h);
    for (let py = 0; py < h; py++) {
        const vy = (py / h) * P * (h / w) * 2;
        for (let px = 0; px < w; px++) {
            pop[py * w + px] = vnoise(px / w * P * 1.9 + 41.7, vy * 1.9 + 5.3, P * 2);
        }
        yield;
    }
    normalise(pop);
    // 0.58, not 0.44. See the note on the lights below: the mask was qualifying most
    // of every temperate continent, so the speckle that turns it into points of light
    // was being painted across a band rather than into settlements.
    const popCut = 0.58;

    const rnd = mulberry32(0x51c1f7);
    const speckle = new Float32Array(4096);
    for (let i = 0; i < speckle.length; i++) speckle[i] = rnd();

    const d = new Uint8ClampedArray(w * h * 4);

    for (let py = 0; py < h; py++) {
        const v = py / h;
        const lat = Math.abs(v - 0.5) * 2;
        const vy = v * P * (h / w) * 2;
        for (let px = 0; px < w; px++) {
            const i = py * w + px;
            const e = elev[i];
            /* SOFT, matched to the albedo's own waterline (see bakeWorld). The shader
               multiplies its relief term by this and takes (1 - land) as its specular
               ocean mask, so a binary mask meant the bump and the sun glint both
               switched on inside one texel at the coast — a hard edge running along
               every shoreline, worst exactly where the light is grazing. */
            const landF = smoothstep(sea - CW, sea + CW, e);
            const land = landF > 0.5 ? 1 : 0;

            // Ramp UP from the cut, not down: (c-cut)/(1-cut) leaves nearly every texel
            // close to zero because the cut sits high in the distribution, and a cloud
            // shell whose modal alpha is 0.05 is a shell you cannot see. The 0.62 exponent
            // pushes the mass toward opaque while keeping edges soft.
            // Multiplier deliberately near 1: pushing it higher saturates the deck interiors
            // to solid white and the shell reads as one airbrushed blob instead of weather.
            // 1.06, not 0.85: the exponent decides how fast a deck goes opaque once it
            // clears the cut, and below 1 it does so almost immediately — so every deck
            // had a solid white core and only its outermost texels carried any structure.
            const c = Math.pow(clamp01((cloud[i] - cut) / ((1 - cut) || 1)) * 1.02, 1.06);

            /* CITY LIGHTS, and the single worst artefact this page has shipped.
               A reviewer read the terminator as "a high-frequency stipple of
               individual tan pixels ... sand or JPEG noise, not terrain, plainly
               visible at 100% as a speckled band across the middle of the planet".
               It was diagnosed as the land mask. It was not. It was THIS: a warm
               (1.0, 0.63, 0.28) emissive multiplied by a PER-TEXEL random hash,
               covering most of every temperate continent, and gated to appear
               exactly in the twilight band where the terrain is still half lit. Salt
               and pepper at one texel, in the one place on the disc the eye goes.

               Three changes, all about making this read as settlement:
                 · the population cut is far higher and its ramp far steeper, so
                   lights are in a handful of regions rather than everywhere land is
                   temperate,
                 · SEVEN PER CENT of the texels inside those regions light at all.
                   The old rule lit a third at full and another third at 0.42, with a
                   0.12 floor under nearly all the rest — which is not a scatter of
                   cities, it is a fill with noise in it.
               A 2x2 block hash was tried in between and is worse: at this framing a
               texel is 2.3 screen pixels, so a block is a 5px SQUARE and the night
               side reads as digital confetti. A point of light has to be a point.
               The shader also narrows the dusk ramp so none of this appears until the
               ground under it is genuinely dark. */
            let lights = 0;
            if (land) {
                const alt = clamp01((e - sea) / ((1 - sea) || 1));
                const pp = pop[i];
                const temperate = smoothstep(0.04, 0.24, lat) * (1 - smoothstep(0.62, 0.88, lat));
                const lowland = 1 - smoothstep(0.20, 0.66, alt);
                const coastal = 1 - smoothstep(0.0, 0.16, alt);
                let m = clamp01((pp - popCut) * 5.0) * temperate * (0.30 + 0.70 * lowland);
                m = clamp01(m + coastal * temperate * 0.26 * clamp01((pp - popCut + 0.04) * 4.5));
                if (m > 0.04) {
                    const s = speckle[((px * 73856093) ^ (py * 19349663)) & 4095];
                    lights = m * (s < 0.045 ? 1.0 : s < 0.075 ? 0.40 : 0.0);
                }
            }

            const o = i * 4;
            d[o] = Math.round(clamp01(c) * 255);
            d[o + 1] = Math.round(clamp01(lights) * 255);
            d[o + 2] = Math.round(landF * 255);
            d[o + 3] = 255;
        }
        yield;
    }
    return d;
}

/* ============================================================
   Moon bake — grey albedo in RGB, elevation in A

   Rewritten. The old bake mixed a ridged multifractal into the height at eleven
   cycles across the map, which at the size this body is drawn resolved as diagonal
   scratches, and its crater population started at 0.012 of the map — a tenth of a
   pixel on screen, so the whole field aliased into a grey smear with two hard rings
   in it that read, unmistakably, as a face.

   What a moon actually looks like is three things, and none of them is a fractal
   ridge: dark flood-basalt maria against bright highlands (an ALBEDO feature, not a
   height one), craters with a raised rampart and a sunken bowl, and bright ejecta
   thrown around the young ones. Those are what this bakes, at radii that survive
   being resolved.
   ============================================================ */
function* bakeMoon() {
    /* 1024x512, and that is a measured choice rather than a default. The body draws
       at ~152px across and the visible hemisphere is half the map's width, so at 1024
       one screen pixel is 3.4 texels. Baking at 2048 was tried and reverted: it does
       NOT make anything sharper — a rampart scaled to stay the same fraction of the
       body lands at the same 1.4 screen pixels either way — it only doubles the
       gradient precision, which the ordered dither below buys far more cheaply. What
       it did cost was 1.4 seconds of main thread, which pushed the whole hero past
       the point where a visitor has decided the page is broken.

       What was actually wrong with this surface was never resolution. It was three
       passes conflated into one, because they are three different
       physical things and the last bake conflated them:
         RELIEF  regolith undulation, crater ramparts, bowls, central peaks, basin
                 subsidence. Height only. This is what the shader lights.
         ALBEDO  highland regolith against dark mare basalt, plus the bright ejecta
                 blankets and ray systems of the young craters. Colour only.
         RAYS    the ejecta pattern, which is an albedo feature and NOT a height one —
                 painting it into the height is what gave the old bake its "peeled
                 onion" concentric terraces.
       Nothing paints a dark disc into the albedo to fake a crater floor any more. A
       floor is dark because it is in shadow, and shadow is the lighting's job. */
    const w = 1024, h = 512, P = 4;
    // A raw RGBA buffer, uploaded straight to the GPU — see dataTexture().
    const d = new Uint8ClampedArray(w * h * 4);

    const rnd = mulberry32(0x30AC71);
    /* A real crater population is a power law truncated from below at whatever the
       mipmap chain will still carry. A crater of radius r (in u) subtends 2r of the
       body's 0.5-of-map visible hemisphere, so on a 152px disc it draws about 600*r
       pixels across: r = 0.008 is a 5px crater, which is the smallest worth baking,
       and r = 0.068 is a 41px basin, which is as large as a body this size can carry
       without reading as a bite out of it. 168 across that band is a SURFACE. The
       previous bake had 52, which is a scatter of features on a blank ball. */
    const craters = [];
    for (let i = 0; i < 168; i++) {
        const big = i < 11;
        craters.push({
            u: rnd(), v: 0.06 + rnd() * 0.88,
            r: big ? 0.038 + rnd() * 0.030 : 0.008 + Math.pow(rnd(), 2.0) * 0.026,
            d: 0.58 + rnd() * 0.42,
            fresh: Math.pow(rnd(), 1.5),
            peak: big && rnd() < 0.55 ? 1 : 0,
            rays: rnd(),
            spin: rnd() * 6.2832
        });
    }

    /* Maria are BASINS, not a noise field: a circular impact basin flooded with dark
       basalt, a few hundred kilometres across, with a ragged but definite shoreline,
       and only a handful of them, all on one hemisphere. Three, and shallow in
       albedo — the previous bake dropped the tone from 178 to 96 across a blob half
       the body wide, which is what turned the lit hemisphere into two grey smears. */
    const maria = [];
    for (let i = 0; i < 4; i++) {
        maria.push({
            // u 0.34..0.64 is the hemisphere that faces the camera in this scene: the
            // mesh carries no rotation, so the sub-viewer point sits at u = 0.5.
            u: 0.34 + rnd() * 0.30,
            v: 0.30 + rnd() * 0.38,
            // 0.042..0.086: at the previous 0.060..0.115 a single basin covered a
            // third of the visible disc, which at 150px is not a mare, it is a smear
            r: 0.042 + rnd() * 0.044,
            warp: 7 + rnd() * 5
        });
    }

    const relief = new Float32Array(w * h);
    const mare = new Float32Array(w * h);
    const bright = new Float32Array(w * h);   // ejecta blankets, ray systems, rim frost

    /* ---- pass 1: regolith ----
       Gentle undulation under everything, so the highlands are never a flat plate
       between craters. */
    for (let py = 0; py < h; py++) {
        const vy = (py / h) * P * (h / w) * 2;
        const row = py * w;
        for (let px = 0; px < w; px++) {
            const u = px / w;
            relief[row + px] = fbm(u * P, vy, P, 4) * 0.28;
        }
        if ((py & 15) === 15) yield;
    }

    /* ---- pass 2: craters, SCATTERED ----
       This used to be a gather: every texel walked a list of nearby craters. Even
       with per-row buckets that is about 25 candidate tests per texel across half a
       million texels — twelve million rejects to draw a feature set whose total area
       is one and a half maps. Measured in the browser it cost 1.4 SECONDS, more per
       texel than the planet's entire six-octave terrain, and it was the single
       reason the hero was not finished before the page was judged.

       A crater knows exactly which texels it touches, so it writes them. For each
       row the profile crosses, the half-width in u is sqrt(reach^2 - dv^2) — the
       chord of the circle at that latitude — divided by the cos(lat) squash. Total
       work becomes the area actually covered. Same output, an order of magnitude
       less arithmetic. */
    for (let k = 0; k < craters.length; k++) {
        const c = craters[k];
        const reach = c.r * 2.1;
        const invR = 1 / c.r;
        // dv = (v - c.v) * 0.5, so the reach measured in v is 2 * reach
        const vSpan = reach * 2;
        const y0 = Math.max(0, Math.ceil((c.v - vSpan) * h));
        const y1 = Math.min(h - 1, Math.floor((c.v + vSpan) * h));
        for (let py = y0; py <= y1; py++) {
            const v = py / h;
            const dv = (v - c.v) * 0.5;
            const rem = reach * reach - dv * dv;
            if (rem <= 0) continue;
            const latSquash = Math.max(0.25, Math.sin(v * Math.PI));
            // the chord half-width in u at this latitude
            const halfU = Math.sqrt(rem) / latSquash;
            const xa = Math.ceil((c.u - halfU) * w), xb = Math.floor((c.u + halfU) * w);
            const row = py * w;
            for (let x = xa; x <= xb; x++) {
                const px = ((x % w) + w) % w;
                const du = ((x / w) - c.u) * latSquash;
                const q = Math.sqrt(du * du + dv * dv) * invR;
                if (q > 2.1) continue;

                /* The profile a crater actually has, from the middle out:
                     a flat floor, a terraced inner wall climbing steeply, a NARROW
                     raised rampart right at q=1, then an ejecta blanket falling away
                     outside it.
                   The rim is four times tighter than the bowl, and that ratio is the
                   whole reason a crater reads as a crater under a raking light. A
                   gaussian bowl plus a gaussian rim of similar width sums to a
                   dimple, which is what the last two attempts produced. */
                const floor = 1 - smoothstep(0.26, 0.80, q);          // flat pan
                const wall = smoothstep(0.38, 0.96, q) * (1 - smoothstep(0.96, 1.0, q));
                /* At 1024 a rampart at exponent 6 spans ~5 texels, which is the
                   narrowest thing that survives a 3.4x minification into the mipmap.
                   Math.pow(x, 2) rather than x*x is a real cost here, not a style
                   point: a non-integer-exponent pow is a full transcendental call,
                   and there are two of them for every texel of every crater. */
                const rq = (q - 1.0) * 6.0;
                const aq = (q - 1.24) * 2.2;
                const rampart = Math.exp(-rq * rq);
                const apron = Math.exp(-aq * aq) * 0.30;
                // deep enough that the bowl can hold a shadow
                let dh = (rampart * 0.26 + apron * 0.08 + wall * 0.07 - floor * 0.34) * c.d;
                if (c.peak && q < 0.32) dh += (1 - smoothstep(0.0, 0.32, q)) * 0.17 * c.d;
                relief[row + px] += dh;

                /* Young craters are bright — fresh rim frost, and rays thrown
                   outward. Both are ALBEDO. A bright ring around every crater is a
                   cartoon, so the halo is gated on the crater's freshness while the
                   rim itself fades more gently, which is what separates a young
                   crater from an old one at a glance. */
                const rimLight = rampart * 0.34 + (1 - smoothstep(0.95, 1.6, q)) * 0.12 * c.fresh;
                let ray = 0;
                if (c.rays > 0.62 && q > 0.95) {
                    const ang = Math.atan2(dv, du) + c.spin;
                    // a fixed spoke pattern rotated per crater; seeded, so it diffs.
                    // Integer powers by multiplication — Math.pow with a literal 7 is
                    // still the slow path, and this runs on 80% of every crater disc.
                    const a1 = Math.max(0, Math.cos(ang * 4.5));
                    const a2 = Math.max(0, Math.cos(ang * 9.0));
                    const s2 = a1 * a1, s4 = s2 * s2, t2 = a2 * a2;
                    const spoke = s4 * s2 * a1 * (0.55 + 0.45 * t2 * t2);
                    ray = spoke * (1 - smoothstep(0.95, 2.1, q)) * 0.52 * (c.rays - 0.62) * 2.6;
                }
                bright[row + px] += (rimLight + ray) * c.d * c.fresh;
            }
        }
        if ((k & 7) === 7) yield;
    }

    /* ---- pass 3: basins, scattered on the same principle ----
       A circular impact basin flooded with dark basalt, with a shoreline made ragged
       by noise. The flooded floor also sits BELOW the highlands it cut into, which is
       a height fact and belongs in the relief rather than only in the tone. */
    for (let k = 0; k < maria.length; k++) {
        const b = maria[k];
        const reach = b.r * 1.35;
        const y0 = Math.max(0, Math.ceil((b.v - reach * 2) * h));
        const y1 = Math.min(h - 1, Math.floor((b.v + reach * 2) * h));
        for (let py = y0; py <= y1; py++) {
            const v = py / h;
            const vy = v * P * (h / w) * 2;
            const dv = (v - b.v) * 0.5;
            const rem = reach * reach - dv * dv;
            if (rem <= 0) continue;
            const latSquash = Math.max(0.25, Math.sin(v * Math.PI));
            const halfU = Math.sqrt(rem) / latSquash;
            const xa = Math.ceil((b.u - halfU) * w), xb = Math.floor((b.u + halfU) * w);
            const row = py * w;
            for (let x = xa; x <= xb; x++) {
                const px = ((x % w) + w) % w;
                const u = x / w;
                const du = (u - b.u) * latSquash;
                const q2 = Math.sqrt(du * du + dv * dv) / b.r;
                if (q2 > 1.35) continue;
                // ISOTROPIC noise: u runs 0..1 over 360 degrees while vy already carries
                // the (h/w)*2 aspect factor, so scaling both by the same number is what
                // keeps the shoreline ragged rather than combed into horizontal streaks.
                const ragged = q2 + (fbm(u * b.warp + k * 13.7, vy * (b.warp * 0.25) + k * 7.1, P * 2, 2) - 0.24) * 0.85;
                const m = 1 - smoothstep(0.80, 1.02, ragged);
                if (m > mare[row + px]) {
                    relief[row + px] -= (m - mare[row + px]) * 0.09;
                    mare[row + px] = m;
                }
            }
        }
        yield;
    }
    normalise(relief);
    /* Low-pass the height BEFORE it becomes a normal map.
       The shader differentiates this channel, so any feature only a texel or two
       wide arrives as an enormous gradient — enough to pin the tilt clamp, which
       renders as hard-edged terraces with no surface between them. Two texels costs
       the ramparts nothing — they are five wide by construction — and puts the whole
       field inside the shader's tilt clamp. */
    blurField(relief, w, h, 2);

    /* ---- the 8-bit encode, DITHERED ------------------------------------------
       The last bake wrote `Math.round(tone)` straight into the buffer. Both the
       mare term and the limb-darkening term vary smoothly with LATITUDE, so their
       rounding error changes at a fixed v — and a rounding error that changes at a
       fixed v is a horizontal stripe. There were about forty of them across the
       disc, one code apart, and at 6x they were the first thing the eye found.
       A 4x4 ordered dither of +-0.5 of a code turns that staircase into a
       spatially decorrelated pattern at half a code of amplitude, which the 7x
       minification into the mipmap then averages away completely. It costs one
       array lookup per texel. */
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

    for (let py = 0; py < h; py++) {
        const brow = (py & 3) * 4;
        for (let px = 0; px < w; px++) {
            const i = py * w + px;
            const dith = BAYER[brow + (px & 3)] / 16 - 0.46875;
            const m = mare[i];
            /* Height and albedo are only loosely coupled on an airless body — tying
               tone to elevation is what made an older bake read as an embossed grey
               blob. Highland 176, mare 118: a real contrast, but nothing like the
               178->96 that turned the lit hemisphere into two smears. */
            /* 158, not 176. Highland regolith at 176 encodes to a linear albedo of
               0.44 which, times the 1.82 sun, lands at 0.80 — near white, with the
               whole crater field crushed into the last fifth of the range and
               nothing left for the ejecta to be brighter than. A mid-grey body has
               somewhere to put its relief. */
            let tone = mix(158, 108, m);
            tone += Math.min(52, bright[i] * 48);
            // a whisper of elevation tint, no more: high ground is dustier
            tone *= 0.975 + relief[i] * 0.05;
            const o = i * 4;
            d[o] = tone * 1.035 + dith;
            d[o + 1] = tone + dith;
            d[o + 2] = tone * 0.945 + dith;
            /* The full 0..255 for height. The bakes no longer go through a
               premultiplying canvas (see dataTexture), so the channel is free to use
               every code it has, and the same dither keeps a smooth slope from
               terracing into the normal map. */
            d[o + 3] = clamp01(relief[i]) * 255 + dith;
        }
        if ((py & 63) === 63) yield;
    }
    return d;
}

/* ============================================================
   Nebula backdrop bake
   Low resolution on purpose: real nebulae are almost entirely low
   frequency, so 512x256 stretched over the sky reads as gas rather
   than as a blurry texture, and costs a fifth of a surface bake.
   ============================================================ */
function* bakeNebula() {
    const w = 512, h = 256, P = 4;
    // A raw RGBA buffer, uploaded straight to the GPU — see dataTexture().
    const d = new Uint8ClampedArray(w * h * 4);

    const warm = new Float32Array(w * h);
    const cool = new Float32Array(w * h);
    const dust = new Float32Array(w * h);
    for (let py = 0; py < h; py++) {
        const v = py / h;
        const vy = v * P * (h / w) * 2;
        for (let px = 0; px < w; px++) {
            const u = px / w, ux = u * P, i = py * w + px;
            warm[i] = fbm(ux + 13.7, vy + 2.9, P, 4);
            cool[i] = fbm(ux * 1.3 + 71.2, vy * 1.3 + 44.5, P, 4);
            dust[i] = fbm(ux * 2.6 + 5.1, vy * 2.6 + 88.3, P * 2, 3);
        }
        yield;
    }
    normalise(warm); normalise(cool); normalise(dust);

    for (let py = 0; py < h; py++) {
        const v = py / h;
        // galactic plane sits on the texture equator; the backdrop mesh is rotated so it
        // cuts the frame diagonally
        const band = Math.exp(-Math.pow((v - 0.5) / 0.125, 2));
        const wide = Math.exp(-Math.pow((v - 0.5) / 0.30, 2));
        for (let px = 0; px < w; px++) {
            const i = py * w + px;
            const lane = 1 - smoothstep(0.44, 0.78, dust[i]) * 0.90 * wide;
            // High threshold + steep power keeps the gas as discrete wisps. A gentle curve
            // spreads it into a flat brown fog over the whole sky, which reads as a broken
            // gradient rather than as a nebula.
            const wm = Math.pow(clamp01(warm[i] * 1.45 - 0.46), 2.1) * (0.35 + 0.65 * wide);
            const cl = Math.pow(clamp01(cool[i] * 1.50 - 0.52), 2.1) * (0.30 + 0.70 * band);
            const haze = band * 0.42 + wide * 0.10;

            // bronze + indigo, deliberately dim: this is ground, not subject
            // Indigo carries it; bronze is an accent. Pushing the warm channel hard turns
            // the whole upper sky into a sepia fog that reads as a dirty lens, not as gas.
            const r = (haze * 13 + wm * 62 + cl * 20) * lane;
            const g = (haze * 17 + wm * 38 + cl * 40) * lane;
            const b = (haze * 42 + wm * 22 + cl * 152) * lane;

            const o = i * 4;
            d[o] = Math.min(255, r); d[o + 1] = Math.min(255, g); d[o + 2] = Math.min(255, b); d[o + 3] = 255;
        }
        yield;
    }
    return d;
}

/* ============================================================
   BAKED INSTRUMENT ART — the pillar thumbnails

   Three of the six doctrine cards have no photographable subject, and they used
   to carry CSS primitives: two concentric rings with a stick hand for TEMPO, a
   wireframe box with two stubs for AI CORE, and three 25px sprites upscaled past
   their native resolution for ECONOMY. Next to the rendered black hole they read
   as missing assets, because they were.

   These are baked instead, with the same discipline as the planet. Each object is
   painted with the ordinary 2D canvas API into five separate layers —

       HEIGHT     greyscale, how far the surface stands off the backplate
       ALBEDO     colour, authored in sRGB
       GLOSS      R = specular strength, G = specular exponent
       EMISSIVE   additive light the object makes itself
       OCCLUSION  painted cast shadows, white = fully lit

   — and then the height field is BLURRED. That single step is what makes this
   look fabricated rather than drawn: every hard-edged fill grows a bevelled
   shoulder of exactly the blur radius, so a filled circle becomes a domed rivet
   and a filled ring becomes a chamfered bezel, all at one consistent bevel width.
   Differentiating the blurred height gives a normal, and one fixed key/fill/rim
   rig shades the lot.

   The consequence is the point: all three thumbs share one light direction (the
   same top-left key the CSS plates use), one material response and one bevel
   width, so they look like they came out of the same shop as the hardware around
   them. Everything stochastic draws from mulberry32 — a thumbnail that differs
   run to run cannot be diffed.
   ============================================================ */

const THUMB_W = 688, THUMB_H = 276;      // ~1.75x the 394x158 art viewport

/* The shared lighting rig. Nothing below is allowed its own light direction. */
const KEY_DIR   = [-0.4565, -0.5955, 0.6605];   // up-left, in front of the plate
const HALF_DIR  = [-0.2515, -0.3283, 0.9104];   // normalize(KEY + view)
const FILL_DIR  = [0.5199, 0.4599, 0.7198];     // dim cool bounce, down-right
const KEY_XY    = [-0.6079, -0.7930];           // KEY_DIR.xy, renormalised
const KEY_COL   = [1.00, 0.945, 0.855];
const FILL_COL  = [0.30, 0.40, 0.60];
const AMB_COL   = [0.070, 0.092, 0.132];
const RIM_COL   = [1.00, 0.86, 0.62];

const SRGB2LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) SRGB2LIN[i] = Math.pow(i / 255, 2.2);
/* ---- linear -> sRGB, INTERPOLATED and DITHERED -----------------------------
   This was a 1024-entry Uint8 LUT indexed by a truncated linear value, which
   quantises twice: once into 1024 linear buckets, and again to 256 output codes.
   The first of those is savage in the shadows — bucket 1 of 1024 already encodes to
   sRGB 9.9, so everything between linear 0.001 and 0.002 landed on the same output
   code — and the second lays a contour wherever a smooth ramp crosses a code
   boundary. On the wordmark's chamfer walls and across the baked thumbnails those
   contours are visible 1px bands, which is exactly the artefact the last review
   found on the moon.

   Now: a 4096-entry float table read with linear interpolation (so the encode is
   continuous), plus an 8x8 ordered dither of +-half a code applied in the OUTPUT
   domain immediately before the Uint8ClampedArray rounds. Half a code of structured
   noise is below the visual threshold on its own and it turns every contour into a
   gradient. Costs one extra multiply and one array read per channel. */
const ENC_N = 4096;
const ENC_F = new Float32Array(ENC_N + 1);
for (let i = 0; i <= ENC_N; i++) ENC_F[i] = Math.pow(i / ENC_N, 1 / 2.2) * 255;
function enc(v) {
    if (!(v > 0)) return 0;
    if (v >= 1) return 255;
    const t = v * ENC_N, i = t | 0;
    return ENC_F[i] + (ENC_F[i + 1] - ENC_F[i]) * (t - i);
}
const DITHER8 = (() => {
    const B = [
        0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
        12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
        3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
        15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21
    ];
    const f = new Float32Array(64);
    for (let i = 0; i < 64; i++) f[i] = B[i] / 64 - 0.4921875;
    return f;
})();
const encD = (v, x, y) => enc(v) + DITHER8[((y & 7) << 3) | (x & 7)];

/**
 * A 2D context that will be READ BACK, not just drawn to.
 *
 * `willReadFrequently` is worth more than every other optimisation in this file put
 * together. Without it Chromium backs the canvas with a GPU texture; every
 * getImageData is then a synchronous readback across the driver, and under a
 * software GL backend that is hundreds of milliseconds each. shadeThumb performs
 * five reads per thumbnail, so six thumbnails cost 4.5 SECONDS of stalled main
 * thread — measured — during which the scroll-reveal observer cannot even fire and
 * the page sits half-painted. With the hint the same six bake in well under a
 * second, because the pixels never leave system memory.
 */
function ctx2d(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c.getContext('2d', { willReadFrequently: true });
}

/** Separable box blur over a Float32Array; two passes is close enough to a gaussian. */
function blurField(f, w, h, r) {
    if (r < 1) return f;
    const tmp = new Float32Array(f.length);
    const win = r * 2 + 1;
    const cx = i => (i < 0 ? 0 : i > w - 1 ? w - 1 : i);
    const cy = i => (i < 0 ? 0 : i > h - 1 ? h - 1 : i);
    for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < h; y++) {
            const row = y * w;
            let sum = 0;
            for (let i = -r; i <= r; i++) sum += f[row + cx(i)];
            for (let x = 0; x < w; x++) {
                tmp[row + x] = sum / win;
                sum += f[row + cx(x + r + 1)] - f[row + cx(x - r)];
            }
        }
        for (let x = 0; x < w; x++) {
            let sum = 0;
            for (let i = -r; i <= r; i++) sum += tmp[cy(i) * w + x];
            for (let y = 0; y < h; y++) {
                f[y * w + x] = sum / win;
                sum += tmp[cy(y + r + 1) * w + x] - tmp[cy(y - r) * w + x];
            }
        }
    }
    return f;
}

function channelField(ctx, w, h, offset, scale) {
    const d = ctx.getImageData(0, 0, w, h).data;
    const f = new Float32Array(w * h);
    for (let i = 0, o = offset; i < f.length; i++, o += 4) f[i] = d[o] * scale;
    return f;
}

/* ---------- 2D path helpers ---------- */
function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); }

/**
 * One shading pass over the five layers.
 *
 * A generator, for the same reason every other bake in this file is one: three of
 * these back to back is a quarter-second of straight-line arithmetic, and a
 * quarter-second freeze while the visitor is scrolling reads as a broken page.
 */
function* shadeThumb(dest, L, w, h, cfg) {
    const hf = blurField(channelField(L.H, w, h, 0, 1 / 255), w, h, cfg.bevel || 3);
    const occ = blurField(channelField(L.O, w, h, 0, 1 / 255), w, h, cfg.shadowSoft || 6);
    const alb = L.A.getImageData(0, 0, w, h).data;
    const gls = L.G.getImageData(0, 0, w, h).data;
    const emiD = L.E.getImageData(0, 0, w, h).data;
    yield;

    // Premultiply the emissive and blur a copy of it: there is no post-processing
    // on a 2D canvas, so the glow that sells a lit lamp has to be baked in.
    const eR = new Float32Array(w * h), eG = new Float32Array(w * h), eB = new Float32Array(w * h);
    for (let i = 0, o = 0; i < eR.length; i++, o += 4) {
        const a = emiD[o + 3] / 255;
        eR[i] = SRGB2LIN[emiD[o]] * a; eG[i] = SRGB2LIN[emiD[o + 1]] * a; eB[i] = SRGB2LIN[emiD[o + 2]] * a;
    }
    yield;
    const gR = blurField(eR.slice(), w, h, 11), gG = blurField(eG.slice(), w, h, 11), gB = blurField(eB.slice(), w, h, 11);
    yield;

    const bump = cfg.bump || 3.4;
    const rimAmt = cfg.rim === undefined ? 0.42 : cfg.rim;
    const emiGain = cfg.emissive === undefined ? 1.15 : cfg.emissive;
    const glowGain = cfg.glow === undefined ? 0.85 : cfg.glow;
    const out = dest.createImageData(w, h);
    const px = out.data;

    for (let y = 0; y < h; y++) {
        const up = y > 0 ? -w : 0, dn = y < h - 1 ? w : 0;
        for (let x = 0; x < w; x++) {
            const i = y * w + x, o = i * 4;
            const lf = x > 0 ? -1 : 0, rt = x < w - 1 ? 1 : 0;
            let nx = (hf[i + lf] - hf[i + rt]) * bump;
            let ny = (hf[i + up] - hf[i + dn]) * bump;
            const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
            nx *= inv; ny *= inv;
            const nz = inv;

            const sh = occ[i];
            const ndl = Math.max(0, nx * KEY_DIR[0] + ny * KEY_DIR[1] + nz * KEY_DIR[2]) * sh;
            const ndf = Math.max(0, nx * FILL_DIR[0] + ny * FILL_DIR[1] + nz * FILL_DIR[2]) * 0.34;

            const specStr = gls[o] / 255 * 2.3;
            let spec = 0;
            if (specStr > 0.004) {
                const ndh = nx * HALF_DIR[0] + ny * HALF_DIR[1] + nz * HALF_DIR[2];
                if (ndh > 0) spec = Math.pow(ndh, 5 + gls[o + 1] * 1.55) * specStr * sh;
            }

            const slope = Math.sqrt(nx * nx + ny * ny);
            let rim = 0;
            if (slope > 0.02) {
                const face = (nx * KEY_XY[0] + ny * KEY_XY[1]) / slope;
                if (face > 0) rim = Math.pow(slope, 2.2) * face * rimAmt;
            }

            const ar = SRGB2LIN[alb[o]], ag = SRGB2LIN[alb[o + 1]], ab = SRGB2LIN[alb[o + 2]];
            let r = ar * (KEY_COL[0] * ndl + FILL_COL[0] * ndf + AMB_COL[0]) + KEY_COL[0] * spec + RIM_COL[0] * rim;
            let g = ag * (KEY_COL[1] * ndl + FILL_COL[1] * ndf + AMB_COL[1]) + KEY_COL[1] * spec + RIM_COL[1] * rim;
            let b = ab * (KEY_COL[2] * ndl + FILL_COL[2] * ndf + AMB_COL[2]) + KEY_COL[2] * spec + RIM_COL[2] * rim;

            r += eR[i] * emiGain + gR[i] * glowGain;
            g += eG[i] * emiGain + gG[i] * glowGain;
            b += eB[i] * emiGain + gB[i] * glowGain;

            px[o] = encD(r, x, y); px[o + 1] = encD(g, x, y); px[o + 2] = encD(b, x, y); px[o + 3] = 255;
        }
        if ((y & 31) === 31) yield;
    }
    dest.putImageData(out, 0, 0);
}

/** The five layers, plus the backplate every thumb is built on. */
function thumbLayers(w, h, tone) {
    const L = { A: ctx2d(w, h), H: ctx2d(w, h), G: ctx2d(w, h), E: ctx2d(w, h), O: ctx2d(w, h) };
    L.O.fillStyle = '#fff'; L.O.fillRect(0, 0, w, h);
    L.H.fillStyle = '#2b2b2b'; L.H.fillRect(0, 0, w, h);
    L.G.fillStyle = '#0f2200'; L.G.fillRect(0, 0, w, h);

    // Deliberately near-black: these plates sit in a six-card grid beside two
    // full-bleed hazard photographs whose viewports run #0a1322 -> #04060b, and a
    // thumbnail a stop brighter than its neighbours breaks the row before anyone
    // looks at what is drawn on it.
    const g = L.A.createLinearGradient(0, 0, w * 0.8, h);
    g.addColorStop(0, (tone && tone[0]) || '#111827');
    g.addColorStop(0.55, (tone && tone[1]) || '#090f1b');
    g.addColorStop(1, (tone && tone[2]) || '#04060c');
    L.A.fillStyle = g; L.A.fillRect(0, 0, w, h);

    // The CSS viewport carries a 17px scan grid behind its image. Bake the same grid
    // in at 2x so a full-bleed plate keeps the family resemblance.
    // 0.032, not 0.09. At full strength this ruled a visible debug grid straight
    // across the artwork on all six cards — the one layer in the frame that
    // announced "placeholder". A third of the strength still ties the plate to the
    // CSS well it sits in, and reads as glass rather than as graph paper.
    L.A.strokeStyle = 'rgba(104,148,205,0.032)';
    L.A.lineWidth = 2;
    L.A.beginPath();
    for (let x = 34; x < w; x += 34) { L.A.moveTo(x, 0); L.A.lineTo(x, h); }
    for (let y = 34; y < h; y += 34) { L.A.moveTo(0, y); L.A.lineTo(w, y); }
    L.A.stroke();
    return L;
}

/* ------------------------------------------------------------
   DOC-01 · HAZARD — a black hole

   The one card in the doctrine grid that is still drawn rather than painted, and
   deliberately so. Every other thumbnail is a lit SURFACE, which is the one thing a
   2D canvas cannot fake convincingly — those five carry library paintings now (see
   .pillar__plate). A black hole has no lit surface at all: its height field is flat,
   the key contributes nothing, and every photon in the frame comes out of the
   emissive layer and the blurred copy of it that shadeThumb adds on top. That is
   also why it can carry a genuinely bright value without breaking the row — the
   light comes from inside the image rather than from the page's lamp.
   ------------------------------------------------------------ */
function paintHole(L, w, h) {
    const cx = w * 0.5, cy = h * 0.52;
    const rnd = mulberry32(0xB1AC17);
    const Rs = 40;                        // shadow radius
    const DISC_A = 232, DISC_B = 52;      // accretion disc semi-axes (shallow inclination)

    /* ---- lensed starfield ----
       A star far from the lens is a POINT with a magnitude and a colour temperature;
       one close in is smeared into an arc along the Einstein ring. Both used to be
       drawn as one round-capped stroke of constant width and constant blue-white,
       which is why a reviewer read the near ones as "debris streaks ... literally
       round-cap line segments": a capsule of uniform width has no head and no tail,
       so it reads as a drawn dash rather than as a stretched image of a star.
       Each arc is now cut into eight sub-segments whose width and alpha fall off
       from the centre — an arc with a bright core and two faded ends — and the
       colour runs on the same M-to-B ramp the hero's star shell uses. */
    const STAR_TEMP = [[1.00, 0.72, 0.50], [1.00, 0.89, 0.76], [1.00, 0.98, 0.94], [0.84, 0.90, 1.00]];
    for (let i = 0; i < 150; i++) {
        const a = rnd() * Math.PI * 2;
        const d = Rs * 1.5 + Math.pow(rnd(), 0.7) * 330;
        const sx = cx + Math.cos(a) * d, sy = cy + Math.sin(a) * d * 0.62;
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
        const stretch = clamp01(1 - (d - Rs) / 260);
        // steep magnitude law: a real field is mostly faint with a few bright ones
        const mag = Math.pow(rnd(), 2.4);
        const t = STAR_TEMP[(rnd() * STAR_TEMP.length) | 0];
        const peak = (0.10 + mag * 0.62) * (0.34 + 0.66 * stretch);
        const wide = (0.9 + mag * 1.5) * (1 + stretch * 1.5);

        if (stretch < 0.06) {
            // far field: a point, not a dash
            L.E.fillStyle = `rgba(${(t[0] * 255) | 0},${(t[1] * 255) | 0},${(t[2] * 255) | 0},${peak.toFixed(3)})`;
            disc(L.E, sx, sy, wide * 0.5); L.E.fill();
            continue;
        }
        // lensed: an arc that tapers to nothing at both ends
        const len = 2 + stretch * stretch * 30;
        const half = len / (d * 2);
        const N = 8;
        L.E.lineCap = 'butt';
        for (let k = 0; k < N; k++) {
            const u0 = k / N, u1 = (k + 1) / N;
            const fall = 1 - Math.abs((u0 + u1) - 1);         // 0 at the ends, 1 at the core
            const f = fall * fall;
            L.E.strokeStyle = `rgba(${(t[0] * 255) | 0},${(t[1] * 255) | 0},${(t[2] * 255) | 0},${(peak * f).toFixed(3)})`;
            L.E.lineWidth = Math.max(0.6, wide * (0.35 + 0.65 * f));
            L.E.beginPath();
            L.E.arc(cx, cy, d, a - half + 2 * half * u0, a - half + 2 * half * u1);
            L.E.stroke();
        }
    }

    /* ---- the disc's FAR side, bent up over the top of the shadow ----
       Light leaving the far side of the disc is deflected around the hole and
       arrives above it, which is why a black hole photographs with a halo rather
       than a ring lying flat. Drawn first so the near side occludes it. */
    function discBand(ctx, tint, a, b, from, to, widthScale) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
            const t = from + (to - from) * (i / 64);
            ctx.lineTo(cx + Math.cos(t) * a, cy + Math.sin(t) * b * widthScale);
        }
        ctx.strokeStyle = tint;
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    }
    // the arch above the shadow
    for (let k = 0; k < 5; k++) {
        const s = 1 - k * 0.13;
        const alpha = 0.11 + k * 0.05;
        L.E.strokeStyle = `rgba(255,196,116,${alpha.toFixed(3)})`;
        L.E.lineWidth = 22 - k * 3.2;
        L.E.beginPath();
        L.E.ellipse(cx, cy - Rs * 0.30, Rs * (2.05 - k * 0.10), Rs * (1.28 - k * 0.09) * s, 0, Math.PI * 1.02, Math.PI * 1.98);
        L.E.stroke();
    }

    /* ---- the disc proper ----
       Doppler beaming: material sweeping toward the viewer is boosted to white,
       material receding is dimmed to bronze. One side of a real accretion disc is
       several times brighter than the other and it is the detail that makes the
       object read as spinning rather than as a painted ring. */
    const RING = 34;
    for (let i = 0; i < RING; i++) {
        const t = i / (RING - 1);
        const a = DISC_A * (0.36 + 0.64 * t);
        const b = DISC_B * (0.36 + 0.64 * t);
        const heat = 1 - t;                                  // hotter toward the hole
        for (let side = 0; side < 2; side++) {
            const approaching = side === 0;                  // left limb comes at us
            const boost = approaching ? 1.0 : 0.30;
            const r = Math.round((190 + 65 * heat) * boost + 30);
            const g = Math.round((120 + 120 * heat) * boost + 12);
            const bl = Math.round((44 + 170 * heat * heat) * boost + 4);
            const al = (0.055 + 0.30 * heat * heat) * (approaching ? 1 : 0.62);
            L.E.strokeStyle = `rgba(${r},${g},${bl},${al.toFixed(3)})`;
            L.E.lineWidth = 4.5 + heat * 5;
            L.E.beginPath();
            L.E.ellipse(cx, cy, a, b, 0,
                approaching ? Math.PI * 0.5 : Math.PI * 1.5,
                approaching ? Math.PI * 1.5 : Math.PI * 2.5);
            L.E.stroke();
        }
    }
    // clumpy in-falling matter: the disc is not a smooth annulus
    for (let i = 0; i < 130; i++) {
        const t = Math.pow(rnd(), 1.5);
        const a0 = rnd() * Math.PI * 2;
        const a = DISC_A * (0.36 + 0.64 * t) * (0.96 + rnd() * 0.08);
        const b = DISC_B * (0.36 + 0.64 * t) * (0.96 + rnd() * 0.08);
        const x = cx + Math.cos(a0) * a, y = cy + Math.sin(a0) * b;
        const approaching = Math.cos(a0) < 0;
        const heat = (1 - t) * (approaching ? 1 : 0.34);
        L.E.strokeStyle = `rgba(255,${Math.round(150 + 90 * heat)},${Math.round(60 + 150 * heat)},${(0.05 + heat * 0.30).toFixed(3)})`;
        L.E.lineWidth = 1 + heat * 2.6;
        L.E.beginPath();
        L.E.ellipse(cx, cy, a, b, 0, a0 - 0.09 - rnd() * 0.16, a0 + 0.09);
        L.E.stroke();
    }

    /* ---- the shadow, and the photon ring hard against it ---- */
    // black through every layer: nothing about this is a surface
    L.A.fillStyle = '#000'; disc(L.A, cx, cy, Rs + 2); L.A.fill();
    L.E.globalCompositeOperation = 'destination-out';
    L.E.fillStyle = '#000'; disc(L.E, cx, cy, Rs); L.E.fill();
    L.E.globalCompositeOperation = 'source-over';

    // the photon sphere: a knife-thin ring at 1.5 Schwarzschild radii
    L.E.strokeStyle = 'rgba(255,238,206,0.95)';
    L.E.lineWidth = 2.2; disc(L.E, cx, cy, Rs + 1.2); L.E.stroke();
    L.E.strokeStyle = 'rgba(255,190,110,0.34)';
    L.E.lineWidth = 7; disc(L.E, cx, cy, Rs + 3.5); L.E.stroke();

    /* ---- polar jet: one faint column, on brief for a hazard card ---- */
    const jet = L.E.createLinearGradient(cx, cy - Rs, cx, 0);
    jet.addColorStop(0, 'rgba(255,236,206,0.26)');
    jet.addColorStop(1, 'rgba(226,180,120,0)');
    L.E.fillStyle = jet;
    L.E.beginPath();
    L.E.moveTo(cx - 5, cy - Rs); L.E.lineTo(cx + 5, cy - Rs);
    L.E.lineTo(cx + 20, 0); L.E.lineTo(cx - 20, 0);
    L.E.closePath(); L.E.fill();
}

/* ============================================================
   THE WORDMARK — a struck logotype, not type with a drop shadow

   The verdict this replaces: "untreated drop-shadowed text over scanline banding".
   Correct. A stack of text-shadow offsets can only ever produce a hard extrusion in
   one direction; it cannot produce a CHAMFER, because there is no way to make a
   shadow follow the contour of a glyph. So the two lines are cast, the way a badge
   would be:

     height   the glyph filled at mid, the glyph ERODED filled at full, blurred
              once. Two steps under a small blur is a flat top with a real chamfer
              wall around it — not a dome, which is what a single blurred mask gives
              and which reads as gel.
     albedo   brushed steel on GAME OF, oxidised bronze on WORLDS, both with the
              brush drawn out along x, grain, and wear collecting down-right.
     gloss    an anisotropic specular map: the brush streaks are in the SPEC, which
              is what makes a metal read as rolled rather than as painted.
     light    the page's one lamp — the same KEY/FILL/RIM constants the doctrine
              plates use, so the wordmark is lit by the same fixture as the hardware
              underneath it and not by a private sun.

   Then a graded extrusion wall below the face and one cast shadow, so the lockup
   sits ON the planet rather than in front of it.

   The DOM keeps the real <h1> text — it just goes transparent once the bake lands.
   Search engines and screen readers read the heading; the canvas is decoration and
   says so. If anything here fails, the CSS treatment underneath is untouched.
   ============================================================ */
/* Eight samples, not fourteen. Every one of these is a full-canvas composite and the
   wordmark performs about forty of them; measured under the capture harness that was
   the difference between the logotype landing before the shutter and after it. At the
   radii this runs at — two to three device pixels per erosion step — an octagonal
   kernel and a circular one differ by less than the antialiasing on the glyph. */
const MORPH_N = 8;

function erodeMask(src, w, h, r) {
    const t = ctx2d(w, h);
    t.drawImage(src, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    // the intersection of the mask with all of its own offsets IS an erosion by a disc
    for (let i = 0; i < MORPH_N; i++) {
        const a = (i / MORPH_N) * Math.PI * 2;
        t.drawImage(src, Math.cos(a) * r, Math.sin(a) * r);
    }
    t.globalCompositeOperation = 'source-over';
    return t.canvas;
}

/** The union of the mask with its own offsets — a dilation by a disc. */
function dilateMask(src, w, h, r) {
    const t = ctx2d(w, h);
    for (let i = 0; i < MORPH_N; i++) {
        const a = (i / MORPH_N) * Math.PI * 2;
        t.drawImage(src, Math.cos(a) * r, Math.sin(a) * r);
    }
    t.drawImage(src, 0, 0);
    return t.canvas;
}

/** A seeded RGBA tile used as a canvas pattern. `shape(x,y,j)` returns -1..1. */
function noiseTile(size, seed, shape, gain) {
    const c = ctx2d(size, size);
    const img = c.createImageData(size, size);
    const p = img.data;
    const rnd = mulberry32(seed);
    const jitter = new Float32Array(size * size);
    for (let i = 0; i < jitter.length; i++) jitter[i] = rnd();
    for (let y = 0, i = 0, o = 0; y < size; y++) {
        for (let x = 0; x < size; x++, i++, o += 4) {
            const v = shape(x, y, jitter[i]);
            const a = Math.min(1, Math.abs(v) * gain);
            const lit = v > 0 ? 255 : 0;
            p[o] = lit; p[o + 1] = lit; p[o + 2] = lit; p[o + 3] = a * 255;
        }
    }
    c.putImageData(img, 0, 0);
    return c.canvas;
}

/** One lighting pass over a glyph block. Same maths as shadeThumb, but it keeps alpha. */
function* shadeWordmark(dest, L, w, h, cfg) {
    const hf = blurField(channelField(L.H, w, h, 0, 1 / 255), w, h, cfg.bevel);
    const alb = L.A.getImageData(0, 0, w, h).data;
    const gls = L.G.getImageData(0, 0, w, h).data;
    yield;

    const bump = cfg.bump, rimAmt = cfg.rim;
    const out = dest.createImageData(w, h);
    const px = out.data;

    for (let y = 0; y < h; y++) {
        const up = y > 0 ? -w : 0, dn = y < h - 1 ? w : 0;
        for (let x = 0; x < w; x++) {
            const i = y * w + x, o = i * 4;
            const cov = alb[o + 3];
            if (cov < 2) { px[o + 3] = 0; continue; }

            const lf = x > 0 ? -1 : 0, rt = x < w - 1 ? 1 : 0;
            let nx = (hf[i + lf] - hf[i + rt]) * bump;
            let ny = (hf[i + up] - hf[i + dn]) * bump;
            const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
            nx *= inv; ny *= inv;
            const nz = inv;

            /* Fill and ambient are held DELIBERATELY low, and this is the difference
               between a chamfer and a pillow. A chamfer reads because its shadowed
               wall is nearly black while its lit wall is nearly white; the key is
               clamped off the down-right wall already, so whatever fill and ambient
               add there IS the wall's value. At 0.40 fill and 1.9x ambient the wall
               landed at sRGB 112 against a face at 178 — a soft, cool, plastic
               roll-off. At 0.16 and 0.55 it lands near 60, the face barely moves, and
               the bevel snaps. */
            const ndl = Math.max(0, nx * KEY_DIR[0] + ny * KEY_DIR[1] + nz * KEY_DIR[2]);
            const ndf = Math.max(0, nx * FILL_DIR[0] + ny * FILL_DIR[1] + nz * FILL_DIR[2]) * 0.16;

            /* Tight and weak, deliberately. The first pass ran 2.6x strength at an
               exponent of 6, and every interior corner of every glyph grew a blown
               white teardrop — the counters of O, D and R each carried what looked
               like a water droplet. A logotype reads as metal through its CHAMFER,
               which is a diffuse term; the specular is a garnish and the moment it is
               large enough to be seen as a shape it reads as plastic. */
            const specStr = gls[o] / 255 * 0.92;
            let spec = 0;
            if (specStr > 0.004) {
                const ndh = nx * HALF_DIR[0] + ny * HALF_DIR[1] + nz * HALF_DIR[2];
                if (ndh > 0) spec = Math.pow(ndh, 18 + gls[o + 1] * 0.16) * specStr;
            }

            // Edge light along the chamfer that faces the lamp. On a logotype this is
            // the single most valuable term: it is the thin hot line along the top-left
            // of every glyph that says "this was cast", and text-shadow cannot make it.
            const slope = Math.sqrt(nx * nx + ny * ny);
            let rim = 0;
            if (slope > 0.02) {
                const face = (nx * KEY_XY[0] + ny * KEY_XY[1]) / slope;
                if (face > 0) rim = Math.pow(slope, 1.9) * face * rimAmt;
            }

            const ar = SRGB2LIN[alb[o]], ag = SRGB2LIN[alb[o + 1]], ab = SRGB2LIN[alb[o + 2]];
            const r = ar * (KEY_COL[0] * ndl + FILL_COL[0] * ndf + AMB_COL[0] * 0.55) + KEY_COL[0] * spec + RIM_COL[0] * rim;
            const g = ag * (KEY_COL[1] * ndl + FILL_COL[1] * ndf + AMB_COL[1] * 0.55) + KEY_COL[1] * spec + RIM_COL[1] * rim;
            const b = ab * (KEY_COL[2] * ndl + FILL_COL[2] * ndf + AMB_COL[2] * 0.55) + KEY_COL[2] * spec + RIM_COL[2] * rim;

            px[o] = encD(r, x, y); px[o + 1] = encD(g, x, y); px[o + 2] = encD(b, x, y); px[o + 3] = cov;
        }
        if ((y & 31) === 31) yield;
    }
    dest.putImageData(out, 0, 0);
}

const bakeWordmark = (function wordmark() {
    const h1 = document.querySelector('.hero__title');
    const canvas = h1 && h1.querySelector('.hero__title__bake');
    if (!canvas || !canvas.getContext) return () => {};

    /* Material per line. Deliberately NOT the CSS colours: those are flat fills, and
       these are the range a lit metal has to move through between its chamfer and its
       shadowed foot. */
    const STEEL = {
        /* Nearly FLAT between 0.18 and 0.82. Measured on the last bake, a ramp spread
           across the whole cap height put 100 levels of luminance down the face of
           every glyph, so each letter read as a chrome tube with a gradient in it
           rather than as a flat plate with chamfers on its edges. A struck badge has
           one face value; all of the relief belongs to the four walls. */
        stops: [[0, '#e4edfb'], [0.17, '#adbbd3'], [0.82, '#9dabc4'], [1, '#8593ad']],
        spec: 118, tight: 132
    };
    const BRONZE = {
        // The amber line is the one saturated thing in the lockup, so it carries the
        // wider value range: a hot struck top, a full-chroma body, an oxidised foot.
        // The foot stops at a readable bronze rather than at brown: the shading
        // multiplies this, so an albedo that already reads dark lands at black.
        stops: [[0, '#ffeec2'], [0.17, '#efa532'], [0.82, '#e09527'], [1, '#bd7d1c']],
        spec: 134, tight: 150
    };

    /* Brushed streaks — PER ROW, not per pixel.
       The first pass modulated a sine in v, which at a 96-cycle period on a 256 tile
       laid a perfectly regular 1.3px stripe across the wordmark: a moiré, not a
       brush. What a wheel actually leaves is rows of slightly different value with no
       period at all, so the row value is a hash of y and the only thing that varies
       along x is how strongly the streak shows. */
    const BRUSH = noiseTile(256, 0x51EE17, (x, y, j) => {
        const row = (hash(3, y) - 0.5) * 1.55 + (hash(11, y >> 1) - 0.5) * 0.55;
        const along = 0.42 + 0.58 * hash(x >> 5, 29);
        return (row * along + (j - 0.5) * 0.30);
    }, 0.36);
    /* Per-pixel tooth. Nothing structural — it exists so that an 8px window anywhere
       on the face has a standard deviation, which a gradient never does. */
    const GRAIN = noiseTile(128, 0x6C0FFE, (x, y, j) => (j - 0.5) * 2, 0.5);
    /* MOTTLE — the frequency between the brush and the sweep, and the one the last
       bake had none of. Two octaves of smoothed value noise at 20 and 60 pixels, so
       one letter is never the same value as the letter beside it and no band can run
       across the lockup at a constant height. */
    const MOTTLE = noiseTile(192, 0x2B7C0D, (x, y) => {
        const n = (a, b, p) => {
            const x0 = Math.floor(a), y0 = Math.floor(b);
            const fx = smooth(a - x0), fy = smooth(b - y0);
            const wp = i => ((i % p) + p) % p;
            const xa = wp(x0), xb = wp(x0 + 1), ya = wp(y0), yb = wp(y0 + 1);
            const t = hash(xa, ya) + (hash(xb, ya) - hash(xa, ya)) * fx;
            const u = hash(xa, yb) + (hash(xb, yb) - hash(xa, yb)) * fx;
            return t + (u - t) * fy;
        };
        // the divisors are exact so both octaves close on the 192px tile boundary —
        // an octave that does not wrap turns a mottle into a visible grid
        return (n(x * (10 / 192), y * (10 / 192), 10) * 0.68
              + n(x * (28 / 192), y * (28 / 192), 28) * 0.32 - 0.5) * 2;
    }, 0.62);

    let last = '';
    let running = false;

    function* bake() {
        const cs = getComputedStyle(h1);
        const span = h1.querySelector('span');
        const fs = parseFloat(cs.fontSize) || 48;
        const lh = parseFloat(cs.lineHeight) || fs * 0.96;
        const font = `${cs.fontStyle} ${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
        const lines = [
            { text: (h1.childNodes[0] && h1.childNodes[0].textContent || 'GAME OF').trim(), mat: STEEL },
            { text: (span ? span.textContent : 'WORLDS').trim(), mat: BRONZE }
        ];
        yield;

        const probe = ctx2d(4, 4);
        probe.font = font;
        /* ---- THE LOCKUP ------------------------------------------------------
           A logotype is not two lines of type that happen to sit on top of each
           other; it is a shape. The two lines are set FLUSH — the shorter one is
           tracked out until both measure the same width — so the mark reads as one
           rectangular block with a left edge and a right edge, which is what makes
           it a designed lockup rather than a heading in a display face.
           canvas letterSpacing is Chromium 99+/Safari 17+/Firefox 127+; where it is
           missing the lines simply set at their natural widths, which is what
           shipped before. */
        const canTrack = 'letterSpacing' in probe;
        probe.letterSpacing = '0px';
        const natural = lines.map(l => probe.measureText(l.text).width);
        const target = Math.max(...natural);
        lines.forEach((l, i) => {
            // tracking is distributed between the glyphs, so n-1 gaps carry the slack
            const gaps = Math.max(1, l.text.length - 1);
            l.track = canTrack ? (target - natural[i]) / gaps : 0;
        });
        const setFace = (ctx, px) => {
            ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${px}px ${cs.fontFamily}`;
        };
        const measure = (l, px) => {
            setFace(probe, px);
            if (canTrack) probe.letterSpacing = (l.track * px / fs).toFixed(3) + 'px';
            const m = probe.measureText(l.text);
            if (canTrack) probe.letterSpacing = '0px';
            return m;
        };
        const metrics = lines.map(l => measure(l, fs));
        const blockW = Math.ceil(Math.max(...metrics.map(m => m.width)));
        const blockH = Math.ceil(lh * lines.length);
        // Room for the extrusion, the keyline and the cast shadow, and no more: the
        // padded band is shaded like everything else, so every extra pixel of it is
        // paid for in every composite the bake performs.
        const PAD = Math.round(fs * 0.24);
        const cssW = blockW + PAD * 2, cssH = blockH + PAD * 2;
        // 2x always: even on a 1x display, shading at 2x and letting the browser
        // downsample is worth more than any AA setting available on a canvas.
        const SS = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)));
        const w = Math.round(cssW * SS), h = Math.round(cssH * SS);
        if (w < 8 || h < 8 || w > 4200 || h > 2200) return;

        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        canvas.style.left = -PAD + 'px';
        canvas.style.top = -PAD + 'px';
        canvas.width = w; canvas.height = h;

        const place = lines.map((l, i) => {
            const cap = metrics[i].actualBoundingBoxAscent || fs * 0.72;
            // centre the caps in their own line box, so the leading is even and does
            // not depend on the font's descender metrics
            return { x: PAD * SS, y: (PAD + i * lh + (lh + cap) / 2) * SS, cap: cap * SS };
        });
        yield;

        /* ---- masks ---- */
        const glyphs = lines.map((l, i) => {
            const m = ctx2d(w, h);
            setFace(m, fs * SS);
            if (canTrack) m.letterSpacing = (l.track * SS).toFixed(3) + 'px';
            m.textBaseline = 'alphabetic'; m.fillStyle = '#fff';
            m.fillText(l.text, place[i].x, place[i].y);
            return m.canvas;
        });

        /* ---- the cross-member -------------------------------------------------
           A logotype in this idiom is a nameplate, and a nameplate is bolted to
           something. The two lines are locked together by a machined bar running the
           full width of the block with a bolt head at each end — the same part
           language as the rails and the instrument bars below the fold, at the same
           scale as the type's own chamfer. It is drawn into the SAME mask as the
           glyphs, so it takes the same keyline, the same extrusion and the same one
           lamp: it is part of the casting, not an overlay on it. */
        const barY = Math.round((place[0].y + (place[1].y - place[1].cap)) / 2);
        // 0.115 of the font size, not 0.052: at the thinner setting the member read
        // as a stray hairline with two specks on it rather than as a machined bar
        // holding two castings together. The leading between the lines is 0.24 of the
        // font size, so this fills half of it and leaves a quarter clear either side.
        const barH = Math.max(6, Math.round(fs * SS * 0.115));
        const barPad = Math.round(fs * SS * 0.15);
        const bolt = barH * 0.72;
        const rule = (() => {
            const m = ctx2d(w, h);
            m.fillStyle = '#fff';
            const x0 = PAD * SS + barPad, x1 = PAD * SS + blockW * SS - barPad;
            m.fillRect(x0, barY - barH / 2, x1 - x0, barH);
            // a bolt head at each end, standing slightly proud of the bar
            m.beginPath(); m.arc(x0, barY, bolt, 0, Math.PI * 2); m.fill();
            m.beginPath(); m.arc(x1, barY, bolt, 0, Math.PI * 2); m.fill();
            return m.canvas;
        })();

        const all = ctx2d(w, h);
        glyphs.forEach(gc => all.drawImage(gc, 0, 0));
        all.drawImage(rule, 0, 0);
        yield;

        /* One scratch buffer for every "take this mask and paint it in X" step below.
           There are DEPTH+4 of them and each is a megapixel; allocating a canvas per
           step is how a bake ends up costing more in GC than in arithmetic. */
        const scratch = ctx2d(w, h);
        const paint = (mask, style) => {
            scratch.globalCompositeOperation = 'source-over';
            scratch.clearRect(0, 0, w, h);
            scratch.drawImage(mask, 0, 0);
            scratch.globalCompositeOperation = 'source-in';
            scratch.fillStyle = style;
            scratch.fillRect(0, 0, w, h);
            scratch.globalCompositeOperation = 'source-over';
            return scratch.canvas;
        };

        /* ---- height: a LINEAR ramp across the chamfer, not a step ----

           A two-level height (glyph at mid, eroded core at full) under a blur is a
           smooth curve, and a smooth curve is a ROLL: every previous bake here came
           out looking like a gold bar with rounded edges. A chamfer is a flat facet,
           which means the height has to rise at a CONSTANT rate across the band so
           its second derivative — and therefore the surface normal — is constant.

           Five successive erosions give five levels across the band. Blurred by 2px
           the staircase disappears but the slope stays constant, so the wall reads as
           one plane with a hard break at the top of it and a hard break at the outer
           edge. That break is the entire difference between "beveled" and "cast". */
        const CHAMFER = Math.max(2, Math.round(fs * SS * 0.050));
        const STEPS = 4;
        const L = { H: ctx2d(w, h), A: ctx2d(w, h), G: ctx2d(w, h) };
        L.H.fillStyle = '#000'; L.H.fillRect(0, 0, w, h);
        // a small base so the outermost pixel of the wall already has slope
        L.H.drawImage(paint(all.canvas, '#141414'), 0, 0);
        let shrunk = all.canvas;
        for (let k = 1; k <= STEPS; k++) {
            shrunk = erodeMask(shrunk, w, h, CHAMFER / STEPS);
            const v = Math.round(20 + (255 - 20) * (k / STEPS));
            L.H.drawImage(paint(shrunk, `rgb(${v},${v},${v})`), 0, 0);
            yield;
        }

        /* ---- albedo + gloss ---- */
        for (let i = 0; i < lines.length; i++) {
            const mat = lines[i].mat;
            const top = place[i].y - place[i].cap;
            const bot = place[i].y + (metrics[i].actualBoundingBoxDescent || fs * 0.06) * SS;
            const grad = L.A.createLinearGradient(0, top, 0, bot);
            for (const [t, c] of mat.stops) grad.addColorStop(t, c);
            L.A.drawImage(paint(glyphs[i], grad), 0, 0);
            L.G.drawImage(paint(glyphs[i], `rgb(${mat.spec},${mat.tight},0)`), 0, 0);
        }
        // the cross-member is gunmetal — one value below the steel line, so it reads
        // as the part the type is bolted TO rather than as a third word
        {
            const grad = L.A.createLinearGradient(0, barY - barH, 0, barY + barH);
            grad.addColorStop(0, '#b9c6da'); grad.addColorStop(0.34, '#7e8ca4');
            grad.addColorStop(1, '#5a6580');
            L.A.drawImage(paint(rule, grad), 0, 0);
            L.G.drawImage(paint(rule, 'rgb(126,150,0)'), 0, 0);
        }
        yield;

        /* ---- material: brush, grain, WEAR AND DAMAGE ----
           The last review's words were "no metal, no scratches, no rivets, no
           specular variation, and every letter carries the identical inner gradient
           so a hard band cuts across all of WORLDS at the same height". Three of
           those four are one problem: every glyph was painted from the same vertical
           gradient with the same two tiling noises over it, so the lockup had no
           low-frequency variation at all and every letter was a copy of its
           neighbour with different outlines.
           What follows adds the frequencies that were missing — a broad specular
           sweep across the whole block (so the left of the mark is lit differently
           from the right), a mottle at glyph scale, and then real DAMAGE: scratches
           with a dark trailing edge and pits with a lit rim, both clipped to the
           casting. */
        L.A.globalCompositeOperation = 'source-atop';
        L.A.globalAlpha = 0.20;
        L.A.fillStyle = L.A.createPattern(BRUSH, 'repeat');
        L.A.fillRect(0, 0, w, h);
        L.A.globalAlpha = 0.15;
        L.A.fillStyle = L.A.createPattern(GRAIN, 'repeat');
        L.A.fillRect(0, 0, w, h);
        L.A.globalAlpha = 0.30;
        L.A.fillStyle = L.A.createPattern(MOTTLE, 'repeat');
        L.A.fillRect(0, 0, w, h);
        L.A.globalAlpha = 1;

        /* THE SWEEP. One broad specular roll from the page's lamp, up-left, across
           the entire lockup — this is the layer that stops eight letters reading as
           eight copies of one letter. */
        const sweep = L.A.createRadialGradient(w * 0.10, -h * 0.35, 0, w * 0.10, -h * 0.35, w * 1.15);
        sweep.addColorStop(0, 'rgba(255,255,255,0.20)');
        sweep.addColorStop(0.34, 'rgba(255,255,255,0.06)');
        sweep.addColorStop(0.72, 'rgba(0,0,0,0.05)');
        sweep.addColorStop(1, 'rgba(0,0,0,0.16)');
        L.A.fillStyle = sweep; L.A.fillRect(0, 0, w, h);

        /* SCRATCHES and PITS, seeded so the mark is identical frame to frame. A
           scratch is a bright stroke with a dark one trailing it, because it is a
           groove: one wall faces the lamp and the other does not. */
        {
            const rnd = mulberry32(0x4A17ED);
            L.A.lineCap = 'round';
            const n = Math.max(10, Math.round(w / 90));
            for (let i = 0; i < n; i++) {
                const x0 = rnd() * w, y0 = rnd() * h;
                const len = (0.05 + rnd() * 0.28) * w;
                const ang = (rnd() - 0.5) * 0.30;
                const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
                const a = 0.07 + rnd() * 0.13;
                L.A.lineWidth = Math.max(1, SS * (0.6 + rnd() * 0.9));
                L.A.strokeStyle = `rgba(0,0,0,${(a * 0.85).toFixed(3)})`;
                L.A.beginPath(); L.A.moveTo(x0, y0 + SS); L.A.lineTo(x1, y1 + SS); L.A.stroke();
                L.A.strokeStyle = `rgba(255,252,244,${a.toFixed(3)})`;
                L.A.beginPath(); L.A.moveTo(x0, y0); L.A.lineTo(x1, y1); L.A.stroke();
            }
            // pits: a hollow is lit BACKWARDS from a bump — dark up-left, bright
            // down-right — which is what makes them read as damage rather than as
            // bubbles. Same rule the plate material follows.
            const pits = Math.max(24, Math.round(w / 22));
            for (let i = 0; i < pits; i++) {
                const x = rnd() * w, y = rnd() * h;
                const r = SS * (0.7 + Math.pow(rnd(), 2.4) * 3.4);
                const deep = 0.13 + rnd() * 0.20;
                const rg = L.A.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
                rg.addColorStop(0, `rgba(0,0,0,${deep.toFixed(3)})`);
                rg.addColorStop(0.6, `rgba(0,0,0,${(deep * 0.45).toFixed(3)})`);
                rg.addColorStop(1, 'rgba(0,0,0,0)');
                L.A.fillStyle = rg;
                L.A.beginPath(); L.A.arc(x, y, r, 0, Math.PI * 2); L.A.fill();
                L.A.strokeStyle = `rgba(226,240,255,${(deep * 0.5).toFixed(3)})`;
                L.A.lineWidth = Math.max(0.7, r * 0.24);
                L.A.beginPath(); L.A.arc(x, y, r * 0.72, -Math.PI * 0.2, Math.PI * 0.82); L.A.stroke();
            }
        }
        // grime collects where the lamp does not reach
        const wear = L.A.createLinearGradient(0, 0, w * 0.7, h);
        wear.addColorStop(0, 'rgba(255,255,255,0.05)');
        wear.addColorStop(0.45, 'rgba(0,0,0,0)');
        wear.addColorStop(1, 'rgba(0,0,0,0.13)');
        L.A.fillStyle = wear; L.A.fillRect(0, 0, w, h);
        L.A.globalCompositeOperation = 'source-over';

        // anisotropy: the brush goes into the SPECULAR too, and so does the mottle —
        // a specular that is constant across a surface is a varnish, not a metal
        L.G.globalCompositeOperation = 'source-atop';
        L.G.globalAlpha = 0.42;
        L.G.fillStyle = L.G.createPattern(BRUSH, 'repeat');
        L.G.fillRect(0, 0, w, h);
        L.G.globalAlpha = 0.34;
        L.G.fillStyle = L.G.createPattern(MOTTLE, 'repeat');
        L.G.fillRect(0, 0, w, h);
        L.G.globalAlpha = 1;
        L.G.globalCompositeOperation = 'source-over';
        yield;

        /* ---- destination: shadow, then extrusion wall, then the lit face ---- */
        const dest = canvas.getContext('2d');
        dest.clearRect(0, 0, w, h);

        /* KEYLINE. The thing that separates a struck badge from bevelled text is a
           dark rule all the way round the shape: it terminates the chamfer against a
           hard edge instead of letting it dissolve into whatever is behind, and it is
           what lets the lockup sit over a lit planet limb without the light side of
           the world eating the light side of the letters. This is the WarCraft II /
           StarCraft I idiom exactly, and it is one dilation. */
        const KEY_W = Math.max(2, Math.round(fs * SS * 0.026));
        const shell = dilateMask(all.canvas, w, h, KEY_W);

        // The lockup sits over a lit planet, so it needs its own ground.
        const BLUR = Math.round(fs * SS * 0.16);
        dest.save();
        if (typeof dest.filter === 'string') {
            dest.filter = `blur(${BLUR}px)`;
            dest.globalAlpha = 0.82;
            dest.drawImage(paint(shell, '#000'), 0, Math.round(fs * SS * 0.13));
            dest.filter = 'none';
        } else {
            dest.globalAlpha = 0.18;
            const flat = paint(shell, '#000');
            for (let k = 1; k <= 5; k++) dest.drawImage(flat, 0, k * BLUR * 0.4);
        }
        dest.restore();

        /* The extrusion wall, drawn bottom-up so the step nearest the face lands last.
           Off the DILATED shape, so the wall is flush with the keyline rather than
           inset from it by the keyline's own width. The wall is not one flat ink: it
           lightens toward the top because it catches the same bounce the plates below
           the hero catch, and a wall that does that is the difference between a cast
           badge and a text-shadow. */
        const DEPTH = Math.max(3, Math.round(fs * SS * 0.062));
        // FOUR bands, not one re-tint per pixel of depth. paint() is three full-canvas
        // operations, and at DEPTH 12 that was 36 megapixel passes for a five-CSS-pixel
        // wall whose grading nobody can resolve past four steps. Descending, so the
        // step nearest the face is drawn last and wins.
        const BANDS = 4, PER = Math.ceil(DEPTH / BANDS);
        for (let bnd = BANDS - 1; bnd >= 0; bnd--) {
            const t = (bnd + 0.5) / BANDS;
            const v = Math.round(mix(44, 4, t));
            const wall = paint(shell, `rgb(${Math.round(v * 0.78)},${Math.round(v * 0.86)},${v})`);
            for (let d = Math.min(DEPTH, (bnd + 1) * PER); d > bnd * PER; d--) dest.drawImage(wall, 0, d);
            yield;
        }
        dest.drawImage(paint(shell, '#080b12'), 0, 0);
        yield;

        /* bevel is now only the amount needed to hide the five-step staircase — 2px.
           Anything larger re-rounds the facet the staircase was built to keep flat.
           bump 6.4 puts the wall's normal near 45 degrees: the central difference is
           over two pixels, so nx = 2 * (dh/dx) * bump, and dh/dx across the band is
           about 0.08 per pixel. */
        yield* shadeWordmark(dest, L, w, h, { bevel: 2, bump: 6.4, rim: 0.44 });
        h1.classList.add('is-baked');
    }

    function run() {
        if (running) return;
        running = true;
        const go = () => {
            const cs = getComputedStyle(h1);
            // Key on the measured face and box: the clamp() only moves at certain
            // widths, so a drag across a breakpoint re-casts once and a drag within
            // one costs nothing.
            const key = `${cs.fontSize}|${cs.fontFamily}|${Math.round(h1.clientWidth)}`;
            if (key === last) { running = false; return; }
            last = key;
            driveSliced(bake(), () => { running = false; });
        };
        // Casting Russo One before the face has arrived produces a struck Segoe UI.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(go).catch(go);
        else go();
    }
    return run;
})();

/* ============================================================
   Shared GLSL
   ============================================================ */
const GLSL_SPHERE_VERT = /* glsl */`
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vT;
    varying vec3 vB;
    varying vec3 vView;
    varying float vSinLat;
    void main() {
        vUv = uv;
        vec3 nObj = normalize(normal);
        vec3 tObj = cross(vec3(0.0, 1.0, 0.0), nObj);
        float s = length(tObj);
        vSinLat = s;
        tObj = s > 1e-4 ? tObj / s : vec3(1.0, 0.0, 0.0);
        vec3 bObj = cross(nObj, tObj);
        mat3 M = mat3(modelMatrix);
        vN = normalize(M * nObj);
        vT = normalize(M * tObj);
        vB = normalize(M * bObj);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

/* ============================================================
   Hero scene
   ============================================================ */
(function hero() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
        if (!renderer.getContext()) return;
    } catch (err) {
        return; // CSS fallback remains
    }
    renderer.setClearColor(0x03050b, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;

    /* How much larger than the CSS box the drawing buffer runs. See resize().
       A software rasteriser pays the whole supersample in CPU time — measured, 1.5x
       on SwiftShader takes a 1920x1080 frame from 10 to 28 seconds to read back —
       so it gets the smallest factor that still visibly closes a coastline, and
       real hardware, where the extra fill is free, gets the full 1.6. */
    const SUPERSAMPLE = (() => {
        try {
            const gl = renderer.getContext();
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
            return /swiftshader|software|llvmpipe|basic render|microsoft basic/i.test(name) ? 1.25 : 1.6;
        } catch (err) { return 1.25; }
    })();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const CAM_HOME = new THREE.Vector3(0, 0, 3.45);
    camera.position.copy(CAM_HOME);

    const root = new THREE.Group();
    scene.add(root);

    // The world sits right of centre so the HUD copy lands on the shadowed limb.
    const world = new THREE.Group();
    world.position.set(0.76, 0.02, 0);
    world.scale.setScalar(0.95);
    root.add(world);

    /* ---------- sun ---------- */
    // Raked hard from the right so the globe turns away into a real terminator.
    // A head-on key light gives a sphere no day/night edge, and without that edge it
    // reads as a flat disc however good the texture is.
    const SUN_DIR = new THREE.Vector3(0.92, 0.34, 0.20).normalize();
    const SUN_COLOR = new THREE.Color(1.0, 0.945, 0.865);

    /* ---------- nebula backdrop ----------
       Starts on a 1x1 placeholder so the starfield can render on the very first frame;
       the baked gas is swapped in a few slices later. */
    const GALACTIC = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.30, 0.85, -0.52, 'XYZ'));
    const blank = document.createElement('canvas');
    blank.width = blank.height = 1;
    blank.getContext('2d').fillStyle = '#000';
    blank.getContext('2d').fillRect(0, 0, 1, 1);
    const nebulaTex = dataTexture(blank);
    const backdrop = new THREE.Mesh(
        new THREE.SphereGeometry(90, 32, 20),
        new THREE.ShaderMaterial({
            uniforms: { uMap: { value: nebulaTex }, uGain: { value: 0.85 } },
            vertexShader: /* glsl */`
                varying vec2 vUv;
                void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
            `,
            fragmentShader: /* glsl */`
                uniform sampler2D uMap; uniform float uGain;
                varying vec2 vUv;
                void main() {
                    vec3 c = texture2D(uMap, vUv).rgb;
                    c = pow(c, vec3(1.55)) * uGain;
                    gl_FragColor = vec4(c + vec3(0.005, 0.006, 0.012), 1.0);
                }
            `,
            side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false
        })
    );
    backdrop.quaternion.copy(GALACTIC);
    backdrop.renderOrder = -100;
    backdrop.frustumCulled = false;
    scene.add(backdrop);

    /* ---------- starfield ---------- */
    const STAR_RAMP = [
        [1.00, 0.60, 0.33],  // M — cool red dwarf
        [1.00, 0.77, 0.53],  // K
        [1.00, 0.91, 0.78],  // G
        [1.00, 1.00, 0.97],  // F
        [0.87, 0.92, 1.00],  // A
        [0.70, 0.81, 1.00]   // B — hot blue
    ];
    function starColor(t) {
        const x = clamp01(t) * (STAR_RAMP.length - 1);
        const i = Math.min(STAR_RAMP.length - 2, Math.floor(x));
        const f = x - i;
        const a = STAR_RAMP[i], b = STAR_RAMP[i + 1];
        return [mix(a[0], b[0], f), mix(a[1], b[1], f), mix(a[2], b[2], f)];
    }

    const STAR_N = 3400;
    const sPos = new Float32Array(STAR_N * 3);
    const sCol = new Float32Array(STAR_N * 3);
    const sSize = new Float32Array(STAR_N);
    const sTw = new Float32Array(STAR_N);
    const sPhase = new Float32Array(STAR_N);
    const sSpeed = new Float32Array(STAR_N);
    const sSpike = new Float32Array(STAR_N);
    {
        const rnd = mulberry32(0x51A2B0);
        const dir = new THREE.Vector3();
        for (let i = 0; i < STAR_N; i++) {
            // 44% of the sky's stars are pulled into the galactic disc; the rest are
            // isotropic. Without the disc a starfield reads as a uniform dot screen.
            if (rnd() < 0.44) {
                const phi = rnd() * Math.PI * 2;
                const gy = (rnd() + rnd() + rnd() - 1.5) * 0.21;
                const gr = Math.sqrt(Math.max(0, 1 - gy * gy));
                dir.set(gr * Math.cos(phi), gy, gr * Math.sin(phi)).applyQuaternion(GALACTIC);
            } else {
                const th = rnd() * Math.PI * 2;
                const ph = Math.acos(2 * rnd() - 1);
                dir.set(Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph));
            }
            const r = 16 + rnd() * 46;
            sPos[i * 3] = dir.x * r;
            sPos[i * 3 + 1] = dir.y * r;
            sPos[i * 3 + 2] = dir.z * r;

            // Magnitude follows a steep power law — a real sky is overwhelmingly faint
            // stars with a handful of bright ones. Uniform brightness is what makes a
            // procedural starfield look like confetti.
            const mag = Math.pow(rnd(), 2.9);
            const temp = clamp01(0.5 + (rnd() + rnd() + rnd() - 1.5) * 0.62);
            const c = starColor(temp);
            const lum = 0.16 + mag * 3.1;
            sCol[i * 3] = c[0] * lum; sCol[i * 3 + 1] = c[1] * lum; sCol[i * 3 + 2] = c[2] * lum;
            sSize[i] = 1.5 + mag * 5.4;
            sSpike[i] = smoothstep(0.62, 1.0, mag);
            sTw[i] = rnd() < 0.42 ? 0.18 + rnd() * 0.38 : 0.0;
            sPhase[i] = rnd() * Math.PI * 2;
            sSpeed[i] = 0.30 + rnd() * 0.95;
        }
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
    starGeo.setAttribute('aTw', new THREE.BufferAttribute(sTw, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPhase, 1));
    starGeo.setAttribute('aSpeed', new THREE.BufferAttribute(sSpeed, 1));
    starGeo.setAttribute('aSpike', new THREE.BufferAttribute(sSpike, 1));
    starGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 70);

    const starMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
        vertexShader: /* glsl */`
            attribute vec3 aColor; attribute float aSize; attribute float aTw;
            attribute float aPhase; attribute float aSpeed; attribute float aSpike;
            uniform float uTime; uniform float uScale;
            varying vec3 vCol; varying float vSpike;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mv;
                float tw = 1.0 - aTw * (0.5 + 0.5 * sin(uTime * aSpeed + aPhase));
                vCol = aColor * tw;
                vSpike = aSpike;
                gl_PointSize = clamp(aSize * uScale, 1.0, 22.0);
            }
        `,
        fragmentShader: /* glsl */`
            varying vec3 vCol; varying float vSpike;
            void main() {
                vec2 p = gl_PointCoord * 2.0 - 1.0;
                float r2 = dot(p, p);
                if (r2 > 1.0) discard;
                float core = exp(-r2 * 8.5);
                float halo = exp(-sqrt(r2) * 3.1) * 0.20;
                float ax = abs(p.x), ay = abs(p.y);
                float spike = (exp(-ax * 15.0) * exp(-ay * 2.6) + exp(-ay * 15.0) * exp(-ax * 2.6)) * vSpike * 0.42;
                float a = core + halo + spike;
                gl_FragColor = vec4(vCol, a);
            }
        `,
        // depthTest stays ON: the star shell sits 16-62 units out and the globe 3.5, so the
        // depth buffer is what stops stars painting straight over the planet's disc.
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.renderOrder = -90;
    stars.frustumCulled = false;
    scene.add(stars);

    /* ---------- atmospheric limb ----------
       Analytic rather than a fresnel shell. A fresnel term on a back-side sphere peaks at
       the SHELL's silhouette, which is the wrong place: the glow has to peak exactly at
       the planet's limb and fall off outward with a scale height, the way an atmosphere
       does. Ray/sphere impact parameter gives that for free and, as a bonus, lets the
       terminator be dead accurate. */
    const limbUniforms = {
        uCenter: { value: new THREE.Vector3() },
        uRadius: { value: 0.9 },
        uSun: { value: SUN_DIR.clone() },
        uDayColor: { value: new THREE.Color(0.34, 0.60, 1.0) },
        uDuskColor: { value: new THREE.Color(1.0, 0.54, 0.26) },
        uStrength: { value: 0.58 }
    };
    const limb = new THREE.Mesh(
        new THREE.SphereGeometry(1.55, 48, 32),
        new THREE.ShaderMaterial({
            uniforms: limbUniforms,
            vertexShader: /* glsl */`
                varying vec3 vWorld;
                void main() {
                    vec4 wp = modelMatrix * vec4(position, 1.0);
                    vWorld = wp.xyz;
                    gl_Position = projectionMatrix * viewMatrix * wp;
                }
            `,
            fragmentShader: /* glsl */`
                uniform vec3 uCenter; uniform float uRadius; uniform vec3 uSun;
                uniform vec3 uDayColor; uniform vec3 uDuskColor; uniform float uStrength;
                varying vec3 vWorld;
                void main() {
                    vec3 ro = cameraPosition;
                    vec3 rd = normalize(vWorld - ro);
                    vec3 oc = uCenter - ro;
                    float t = dot(oc, rd);
                    float b = sqrt(max(dot(oc, oc) - t * t, 0.0)) / uRadius;   // 1.0 at the limb
                    if (b < 0.998) discard;                                    // inside the disc: handled by the surface shader
                    vec3 nrm = normalize((ro + rd * t) - uCenter);
                    float sun = dot(nrm, uSun);

                    float x = b - 1.0;
                    float inner = exp(-x * 42.0);            // tight bright rim
                    float outer = exp(-x * 11.0) * 0.17;     // wide scattered halo
                    float glow = (inner + outer) * smoothstep(-0.34, 0.26, sun);
                    vec3 col = mix(uDuskColor, uDayColor, smoothstep(-0.04, 0.28, sun));
                    gl_FragColor = vec4(col * glow * uStrength, 1.0);
                }
            `,
            side: THREE.FrontSide, transparent: true, blending: THREE.AdditiveBlending,
            depthWrite: false, toneMapped: false
        })
    );
    limb.renderOrder = 10;
    world.add(limb);

    /* ---------- placeholders filled in once the textures are baked ---------- */
    let planet = null, clouds = null, moonGroup = null, moon = null;
    let planetUniforms = null, cloudUniforms = null, moonUniforms = null;
    let revealT = 0;                 // wall-clock ms at which the world landed

    /**
     * Bakes every texture and installs every mesh, yielding once per texture row so the
     * driver can hand the thread back. Ordering is deliberate: the backdrop first (it is
     * the cheapest and fills the frame), then the world, then the moon.
     */
    function* buildScene() {
        // Swap in a freshly built texture rather than mutating the placeholder's image:
        // re-pointing .image on an already-uploaded 1x1 CanvasTexture does not reliably
        // reallocate the GPU storage, and the gas silently never appears.
        const neb = dataTexture(yield* bakeNebula(), 512, 256);
        backdrop.material.uniforms.uMap.value = neb;
        nebulaTex.dispose();

        const worldBake = yield* bakeWorld();
        const atmosData = yield* bakeAtmos(worldBake);
        /* The moon's SURFACE is baked here, before either body exists in the scene,
           and its mesh is built at the bottom of this function.
           This ordering is a performance decision, not a tidiness one. The render
           loop runs throttled but not stopped while a bake is in progress, and a
           frame that contains the planet costs several times a frame that contains
           only the starfield — so baking the moon after the planet had been added
           meant the moon's own arithmetic was competing with full-scene software
           renders and it landed three seconds late. Measured under the capture
           harness, the moon was still missing at 4.5s and present by 9s. Baked in
           this window it lands with everything else. */
        const moonData = yield* bakeMoon();
        const surfaceTex = dataTexture(worldBake.data, SURF_W, SURF_H);
        const atmosTex = dataTexture(atmosData, SURF_W, SURF_H);
        // The globe is a sphere: everything within ~25 degrees of the limb is sampled at a
        // grazing angle where the u footprint is many times the v footprint, and that is
        // exactly the band a viewer studies. Trilinear alone picks a mip for the LONG axis
        // and smears the short one; anisotropy is what keeps the coastline sharp all the
        // way round. Take everything the driver offers, up to 16.
        const maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
        surfaceTex.anisotropy = maxAniso;
        atmosTex.anisotropy = maxAniso;

        planetUniforms = {
            uSurface: { value: surfaceTex },
            uAtmos: { value: atmosTex },
            uTexel: { value: new THREE.Vector2(1 / SURF_W, 1 / SURF_H) },
            uSun: { value: SUN_DIR.clone() },
            uSunColor: { value: new THREE.Color().copy(SUN_COLOR).multiplyScalar(3.4) },
            uCloudShift: { value: 0.0 },
            // The gradient is measured in normalised height units across two texels, so it
            // is on the order of 0.005 — a "sensible looking" multiplier of 2 perturbs the
            // normal by one part in a hundred and produces a completely flat planet. The
            // scale that actually tilts a normal is two orders of magnitude larger.
            //
            // 95 was calibrated against the OLD packing, where land occupied alpha
            // 0.5..1.0. The bake now gives land the full 0..1 (see bakeWorld) so every
            // difference read here is twice as large, and the difference is taken across
            // three texels rather than one, which triples it again. Six times the signal
            // wants a sixth of the multiplier: 95 / 6 ≈ 16.
            // 12, not 16: the map is 1536 wide rather than 2048, so the same 1.5-texel
            // step now spans 1.33x as much of the sphere and reads 1.33x the difference.
            //
            // 6.5, not 12. At 12 the ridged octaves in the height field pushed the
            // gradient past the clamp on ordinary hillsides, so land shaded to a hard
            // BLACK on the anti-sun face of every ridge — the continents photographed
            // as green blotches with holes punched in them rather than as terrain. The
            // slope pass in bakeWorld now carries the relief in the albedo, where it
            // is legible whatever the light is doing, and the bump only has to model
            // it. Half the gain and a much tighter clamp, and the modelling is a
            // gradient again instead of a switch.
            uBump: { value: 6.5 },
            uReveal: { value: 0.0 }
        };

        planet = new THREE.Mesh(
            new THREE.SphereGeometry(1, 128, 96),
            new THREE.ShaderMaterial({
                uniforms: planetUniforms,
                vertexShader: GLSL_SPHERE_VERT,
                fragmentShader: /* glsl */`
                    uniform sampler2D uSurface;
                    uniform sampler2D uAtmos;
                    uniform vec2 uTexel;
                    uniform vec3 uSun;
                    uniform vec3 uSunColor;
                    uniform float uCloudShift;
                    uniform float uBump;
                    uniform float uReveal;
                    varying vec2 vUv; varying vec3 vN; varying vec3 vT; varying vec3 vB;
                    varying vec3 vView; varying float vSinLat;

                    void main() {
                        vec4 surf = texture2D(uSurface, vUv);
                        vec3 albedo = pow(surf.rgb, vec3(2.2));
                        vec3 atm = texture2D(uAtmos, vUv).rgb;
                        float land = atm.b;

                        vec3 N = normalize(vN);
                        vec3 T = normalize(vT);
                        vec3 B = normalize(vB);
                        vec3 V = normalize(vView);
                        vec3 L = normalize(uSun);

                        /* --- relief from the baked height field ---------------------
                           Four taps of the alpha channel give the surface gradient. The
                           u metric shrinks with cos(latitude), so dh/du is rescaled by
                           1/sin(theta) — clamped, or the poles blow up. Ocean height is
                           pinned flat in the bake, so land masks the whole term and the
                           sea keeps a mirror normal. */
                        /* The step is 1.5 texels, not 1. A one-texel central difference
                           of an 8-bit field has a noise floor of one quantisation code
                           whatever the feature is; widening the step scales the SIGNAL
                           with the step while the noise floor stays put, and the
                           fractional offset makes the hardware's bilinear tap average
                           two texels for free. Both halves of that are why the land
                           stopped fizzing. */
                        vec2 st = uTexel * 1.5;
                        float hL = texture2D(uSurface, vUv - vec2(st.x, 0.0)).a;
                        float hR = texture2D(uSurface, vUv + vec2(st.x, 0.0)).a;
                        float hD = texture2D(uSurface, vUv - vec2(0.0, st.y)).a;
                        float hU = texture2D(uSurface, vUv + vec2(0.0, st.y)).a;
                        float uScale = 1.0 / max(vSinLat, 0.28);
                        float poleFade = smoothstep(0.06, 0.34, vSinLat);
                        float ndlGeo = dot(N, L);
                        /* --- relief owns the DAY SIDE, geometry owns the TERMINATOR ---
                           This is the fix for the defect a reviewer described as "a
                           high-frequency stipple of individual tan pixels ... sand or
                           JPEG noise, not terrain" across the middle of the planet.

                           The mechanism is not the land mask, it is grazing light. At
                           noon a 0.1 tilt of the normal changes N·L by a percent and
                           is invisible; three degrees from the terminator the same
                           tilt is the entire difference between lit and unlit, so
                           every texel of relief detail becomes a binary black dot.
                           No amount of filtering the height field fixes that, because
                           the amplification is unbounded as N·L approaches zero.

                           Ramping the bump in with N·L bounds it: at the terminator
                           the surface is shaded by its geometric normal and the
                           day/night boundary is a clean ellipse; a few degrees into
                           the day the relief is at full strength and the terrain has
                           all of its modelling. */
                        float relW = smoothstep(0.0, 0.30, ndlGeo);
                        vec3 grad = (T * (hR - hL) * uScale + B * (hU - hD)) * uBump * land * poleFade * relW;
                        // Cap the tilt: a mountain wall can push the gradient far enough to
                        // flip the normal, which reads as black speckle. 0.42, not 0.85 —
                        // a 0.85 tilt is 40 degrees, which on the anti-sun face of a ridge
                        // takes N.L to zero and the ground with it.
                        float gl = length(grad);
                        if (gl > 0.42) grad *= 0.42 / gl;
                        vec3 Nb = normalize(N - grad);

                        float ndl = dot(Nb, L);
                        float day = smoothstep(-0.14, 0.24, ndlGeo);

                        /* --- cloud shadow ------------------------------------------
                           Sample the cloud channel offset toward the sun in tangent
                           space: shadows land on the anti-sun side of each deck. */
                        vec2 sunUv = vec2(dot(L, T), dot(L, B)) * 0.016;
                        float shadow = texture2D(uAtmos, vUv + vec2(uCloudShift, 0.0) + sunUv).r;
                        float lit = clamp(ndl, 0.0, 1.0);
                        lit *= 1.0 - 0.62 * shadow * day;

                        /* --- sunset extinction at the terminator ----------------------
                           Narrow on purpose. Ramping this over the first 0.46 of N.L tints
                           two thirds of the visible disc orange and the whole planet reads
                           as a desert world; real atmospheric extinction only bites within
                           a few degrees of the terminator. */
                        vec3 sunTint = mix(vec3(1.0, 0.52, 0.26), vec3(1.0), smoothstep(0.0, 0.15, ndlGeo));
                        vec3 sun = uSunColor * sunTint;

                        vec3 col = albedo * sun * lit;

                        /* --- specular ocean -----------------------------------------
                           A tight lobe on the (flat) sea gives a real sun glint; the
                           fresnel term is what makes the glint run out along the limb
                           instead of sitting as a blob. */
                        vec3 H = normalize(L + V);
                        float sea = 1.0 - land;
                        float fres = 0.024 + 0.976 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
                        float tight = pow(max(dot(N, H), 0.0), 900.0);
                        float sheen = pow(max(dot(N, H), 0.0), 90.0) * 0.022;
                        col += sun * sea * day * fres * (tight * 3.2 + sheen) * (1.0 - 0.75 * shadow);

                        /* --- Rayleigh haze over the day side -------------------------
                           Driven by the SAME N·L the terrain is, and squared, so the
                           haze dies exactly where the ground does. The previous
                           (0.35 + 0.65·ndl) floor kept a third of the rim alight all
                           the way around the disc, which put a lit atmosphere on a limb
                           the terminator had already turned away from the sun — a ring
                           of light with no light source. An atmosphere is lit by the
                           star or it is not lit. */
                        float ndv = dot(N, V);
                        float rim = pow(1.0 - max(ndv, 0.0), 3.8);
                        float dayLit = day * clamp(ndlGeo, 0.0, 1.0);
                        col += vec3(0.20, 0.40, 0.86) * rim * dayLit * 0.44;

                        /* --- SKYLIGHT ------------------------------------------------
                           A ground-level fill from the sky itself. Without it the only
                           light on the day side is the sun, so anything the relief turns
                           away from it goes to absolute black — and a shaded hillside
                           that is BLACK reads as a hole in the map, not as a hillside.
                           A real overcast-free daylight sky is a couple of per cent of
                           the sun and cold; that is what this is. */
                        col += albedo * vec3(0.052, 0.072, 0.124) * dayLit;

                        /* --- night side ---------------------------------------------
                           The lights mask runs on its own, wider ramp than the day term:
                           cities are already visible in deep twilight, and gating them on
                           (1 - day) confines them to a sliver too thin to notice. */
                        float night = 1.0 - day;
                        /* The dusk ramp used to reach 0.16 of N·L — a band where the
                           ground is still 40% lit — so an emissive built from a
                           per-texel hash was being added ON TOP of half-lit terrain.
                           That is what produced the speckled band across the middle
                           of the disc. Lights now come up only where the ground has
                           actually gone dark, which is also the only place a city is
                           visible from orbit. */
                        float dusk = 1.0 - smoothstep(-0.17, 0.03, ndlGeo);
                        float lights = atm.g * dusk * (1.0 - 0.85 * shadow);
                        col += vec3(1.0, 0.63, 0.28) * lights * 2.6;
                        col += albedo * vec3(0.026, 0.040, 0.076) * night;

                        /* --- the silhouette ------------------------------------------
                           Same analytic feather the moon carries. dot(N,V) crosses zero
                           exactly at the limb, so fwidth() of it is one pixel measured
                           in the same units: a one-pixel alpha ramp that costs two
                           instructions and is right at every zoom. This is the edge with
                           nothing behind it to hide a staircase, and on the largest
                           object on the page a staircase is the first thing seen. */
                        float edge = smoothstep(0.0, fwidth(ndv) * 1.7, ndv);
                        col *= uReveal;
                        gl_FragColor = vec4(col, edge);
                    }
                `,
                // transparent purely so the feather above has an alpha channel to write
                // into; depthWrite stays on because this is a solid body. renderOrder is
                // set explicitly below — a transparent planet and a transparent cloud
                // shell share a centre, so distance sorting cannot separate them.
                transparent: true, depthWrite: true, toneMapped: false
            })
        );
        planet.renderOrder = 0;
        // Fixed starting longitude, not a random one: it decides which continent is sitting
        // on the night side (and therefore whether the city lights are in frame) at the
        // moment a screenshot is taken.
        planet.rotation.set(0, 0.0, 0.16);
        world.add(planet);

        cloudUniforms = {
            uAtmos: { value: atmosTex },
            uSun: { value: SUN_DIR.clone() },
            // 1.52, not 1.85. This material is toneMapped:false, so 1.85 against a
            // near-1.0 deck albedo clips to flat white and every deck loses its
            // self-shadowing at the same moment — which is what turned the whole
            // equatorial band into one featureless mass.
            uSunColor: { value: new THREE.Color().copy(SUN_COLOR).multiplyScalar(1.52) },
            uReveal: { value: 0.0 }
        };
        clouds = new THREE.Mesh(
            new THREE.SphereGeometry(1.014, 96, 64),
            new THREE.ShaderMaterial({
                uniforms: cloudUniforms,
                vertexShader: GLSL_SPHERE_VERT,
                fragmentShader: /* glsl */`
                    uniform sampler2D uAtmos; uniform vec3 uSun; uniform vec3 uSunColor; uniform float uReveal;
                    varying vec2 vUv; varying vec3 vN; varying vec3 vT; varying vec3 vB;
                    varying vec3 vView; varying float vSinLat;
                    void main() {
                        float a = texture2D(uAtmos, vUv).r;
                        if (a <= 0.004) discard;
                        vec3 N = normalize(vN); vec3 V = normalize(vView); vec3 L = normalize(uSun);
                        vec3 T = normalize(vT); vec3 B = normalize(vB);
                        float ndl = dot(N, L);
                        float day = smoothstep(-0.20, 0.26, ndl);

                        /* --- self-shadowing ------------------------------------------
                           Sample the density one step toward the sun. Where the deck is
                           thickening sunward this texel is behind a wall of vapour, so it
                           darkens. Two texture taps buy the whole cloud layer its volume;
                           without it a cloud shell is a flat white decal. */
                        vec2 sunUv = vec2(dot(L, T), dot(L, B)) * 0.011;
                        float ahead = texture2D(uAtmos, vUv + sunUv).r;
                        float shade = clamp(1.0 - (ahead - a) * 2.6, 0.34, 1.15);

                        // wrap lighting: cloud decks are thick scatterers, not lambertian plates
                        float wrap = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
                        vec3 sunTint = mix(vec3(1.0, 0.50, 0.24), vec3(1.0), smoothstep(0.0, 0.22, ndl));
                        vec3 lit = uSunColor * sunTint * (0.20 + 0.92 * wrap) * shade;
                        vec3 col = mix(vec3(0.020, 0.030, 0.052), lit, day);
                        // silver lining: forward scatter brightens the deck edges near the limb
                        float edge = pow(1.0 - max(dot(N, V), 0.0), 3.4);
                        col += uSunColor * edge * day * 0.07;
                        float alpha = clamp(a * 1.02, 0.0, 1.0) * (0.28 + 0.72 * day) * uReveal;
                        gl_FragColor = vec4(col, alpha * 0.80);
                    }
                `,
                transparent: true, depthWrite: false, toneMapped: false
            })
        );
        clouds.rotation.set(0, 0.0, 0.16);
        clouds.renderOrder = 1;
        world.add(clouds);

        /* ---------- moon ---------- */
        const moonTex = dataTexture(moonData, 1024, 512);
        moonTex.anisotropy = maxAniso;
        moonUniforms = {
            uSurface: { value: moonTex },
            uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 512) },
            // THE SAME OBJECT the planet's terminator is computed from, not a copy of the
            // same numbers. Two bodies in one frame lit from two directions is the single
            // fastest way to tell a viewer that a scene was assembled rather than lit, and
            // the only way to guarantee they never drift is to share the uniform.
            uSun: planetUniforms.uSun,
            // 2.6 against a 0.79-linear highland albedo clips to flat white, and this
            // material is toneMapped:false so there is nothing to roll the shoulder off.
            // 1.55 keeps the brightest regolith just under 1.0 and leaves the craters
            // somewhere to be.
            uSunColor: { value: new THREE.Color().copy(SUN_COLOR).multiplyScalar(1.82) },
            uReveal: { value: 0.0 }
        };
        moonGroup = new THREE.Group();
        moon = new THREE.Mesh(
            // 48x32 put a facet every 7.5 degrees, which at this size is a visible
            // staircase right where the terminator crosses it — the one place on a
            // sphere where a facet edge cannot hide.
            new THREE.SphereGeometry(1, 96, 64),
            new THREE.ShaderMaterial({
                uniforms: moonUniforms,
                vertexShader: GLSL_SPHERE_VERT,
                fragmentShader: /* glsl */`
                    uniform sampler2D uSurface; uniform vec2 uTexel; uniform vec3 uSun;
                    uniform vec3 uSunColor; uniform float uReveal;
                    varying vec2 vUv; varying vec3 vN; varying vec3 vT; varying vec3 vB;
                    varying vec3 vView; varying float vSinLat;
                    void main() {
                        vec4 s = texture2D(uSurface, vUv);
                        vec3 albedo = pow(s.rgb, vec3(2.2));
                        vec3 N = normalize(vN), T = normalize(vT), B = normalize(vB), L = normalize(uSun);
                        vec3 V = normalize(vView);
                        float hL = texture2D(uSurface, vUv - vec2(uTexel.x, 0.0)).a;
                        float hR = texture2D(uSurface, vUv + vec2(uTexel.x, 0.0)).a;
                        float hD = texture2D(uSurface, vUv - vec2(0.0, uTexel.y)).a;
                        float hU = texture2D(uSurface, vUv + vec2(0.0, uTexel.y)).a;
                        // 26 was tuned against the OLD height field, whose features were
                        // sub-pixel noise with tiny gradients. The rewritten bake has real
                        // crater walls — a tenth of the height range across six texels — so
                        // the same multiplier drove every wall past the clamp and punched
                        // black gouges through the body. The gradient got fifteen times
                        // bigger, so the multiplier gets three times smaller.
                        // 0.62, not 0.45: the 1/sin(colatitude) rescale is geometrically
                        // right but it amplifies the gradient by up to 2.2x in the polar
                        // caps, which is where it least earns it and most aliases.
                        float uScale = 1.0 / max(vSinLat, 0.62);
                        float poleFade = smoothstep(0.10, 0.40, vSinLat);
                        /* 13, up from 9.75. Relief is now the ONLY thing that draws a
                           crater — the albedo no longer paints a dark disc where the
                           floor is, because a floor is dark by being in shadow — so
                           the bump has to carry work it was previously only garnishing.
                           The bowls are also half again as deep as the last profile's.
                           The clamp rises with it: at 0.34 every rampart on the body
                           pinned, and a pinned tilt renders as a hard terrace. */
                        vec3 g = (T * (hR - hL) * uScale + B * (hU - hD)) * 13.0 * poleFade;
                        float gl2 = length(g); if (gl2 > 0.58) g *= 0.58 / gl2;
                        vec3 Nb = normalize(N - g);
                        float ndlGeo = dot(N, L);
                        /* Relief owns the DAY SIDE; geometry owns the TERMINATOR.
                           Shading everywhere off the bumped normal let a crater wall
                           drive N·L negative and chew the day/night boundary into the
                           mush the last review described — a body whose outline reads
                           as torn rather than as a sphere. Weighting the bump by how
                           far into the day a texel is gives crater floors real cast
                           shadow where there is light to cast it, and leaves the
                           crescent's edge a clean ellipse where there is not. */
                        float relW = smoothstep(0.0, 0.34, ndlGeo) * 0.88;
                        float lit = clamp(mix(ndlGeo, dot(Nb, L), relW), 0.0, 1.0);
                        // Airless bodies are retro-reflective: the regolith backscatters, so a
                        // moon stays bright almost to the terminator and then falls off fast.
                        // A plain lambert rolls off gently and reads as a soft grey ball.
                        // 0.74, not 0.62: at 0.62 the curve is flat enough across the
                        // whole day side that the crater relief it is multiplying has
                        // nowhere left to show.
                        lit = pow(lit, 0.74);
                        // The terminator ramp is deliberately the SAME width as the planet's
                        // (-0.14 .. 0.24). A hard-edged moon beside a soft-edged world reads
                        // as two different lights however carefully the vectors agree; matching
                        // the falloff is what makes a viewer see one lamp.
                        float day = smoothstep(-0.14, 0.24, ndlGeo);
                        // Airless bodies redden hard in the last few degrees before the
                        // terminator, for the same reason a lunar eclipse is red: the grazing
                        // path is long. Narrow, or the whole crescent goes sepia.
                        vec3 sunTint = mix(vec3(1.0, 0.72, 0.47), vec3(1.0), smoothstep(-0.02, 0.20, ndlGeo));
                        // Planetshine. The geometry puts this body past quarter phase, so it is
                        // a fat crescent — correct, and the right image next to a lit world. But
                        // with the night side at pure black a crescent has no body: it reads as
                        // a torn shape rather than as a sphere. The planet it orbits is an
                        // enormous blue light source a moon-diameter away, and lighting the dark
                        // side with it is both what happens and what makes the object read.
                        // 0.055, not 0.20. Planetshine is what stops a crescent reading as
                        // a torn shape — but at a fifth of sunlight it stops being shine and
                        // starts being a second key, and the body renders as a translucent
                        // blue glass ball with a cream sliver stuck to one side. It has to
                        // be just enough to carry the sphere's silhouette in the dark.
                        vec3 shine = vec3(0.40, 0.48, 0.62) * 0.055 * (1.0 - day);
                        vec3 col = albedo * uSunColor * sunTint * lit * day
                                 + albedo * (shine + vec3(0.008, 0.010, 0.016));

                        /* --- the silhouette ------------------------------------------
                           A sphere's outline against the sky is the one edge in this scene
                           with nothing behind it to hide a staircase, and at this size the
                           staircase was visible from 4 to 7 o'clock. dot(N,V) crosses zero
                           exactly at the silhouette, so fwidth() of it is the width of one
                           pixel measured in the same units — an analytic one-pixel feather
                           that costs two instructions and is correct at every zoom. */
                        float ndv = dot(N, V);
                        float edge = smoothstep(0.0, fwidth(ndv) * 1.6, ndv);
                        // limb darkening: regolith at a grazing view angle is dimmer
                        col *= 0.80 + 0.20 * smoothstep(0.0, 0.42, ndv);
                        gl_FragColor = vec4(col * uReveal, edge);
                    }
                `,
                // transparent purely so the analytic silhouette feather above has an alpha
                // channel to write into. depthWrite stays on — this is a solid body, and it
                // has to occlude anything that ends up behind it.
                transparent: true, depthWrite: true, toneMapped: false
            })
        );
        /* Size and station are one decision, and it is a framing decision.
           At 0.24 and z = -1.3 the disc spanned 158px with its top edge at y = 98 on a
           1080 frame — under the command rail's veil, so the body arrived at the very
           corner of the viewport with a bite out of it, which reads as an accident
           rather than as a composition. The constraint is a triangle: the moon has to
           clear the rail at the top, the frame at the right, and the planet's limb at
           the lower left, and the planet's disc is 900px across. 0.22 at z = -1.10 is
           the largest body that fits all three with margin. */
        moon.scale.setScalar(0.22);
        moonGroup.add(moon);
        root.add(moonGroup);
    }

    /* ---------- post-processing ----------
       NO MSAA, deliberately. `antialias: true` on the renderer is a lie once a
       composer is attached — nothing is ever drawn to the default framebuffer — and
       an explicitly multisampled composer target does work, but measured, four
       half-float samples at 1920x1080 tripled the cost of a frame on a software
       rasteriser and starved the world bake of the thread for five extra seconds.

       What this frame gets instead is a modest supersample (see resize(): the
       drawing buffer runs 1.5x the CSS box on a 1x display) plus FXAA. The two
       cover different failures and both are needed: supersampling averages the
       high-frequency shading noise on the terrain, which no edge filter can touch,
       and FXAA cleans the long near-horizontal coastline edges that survive a 1.5x
       box filter. MSAA would have fixed neither — it only ever samples geometry
       edges, and this frame's staircases are almost all inside the silhouette. */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // Threshold sits above the lit-land value on purpose: only the sun glint, the city
    // lights, the star cores and the thin day limb are meant to bloom. A low threshold
    // blooms the whole globe and the frame turns to milk.
    /* 0.90, not 0.95. At 0.95 the only thing over the threshold was the sun glint
       itself, so the day limb and all but the top handful of stars contributed
       nothing and the frame's light came entirely from the albedo. 0.90 lets the
       thin lit limb, the brightest cloud tops and the star cores in; the lit LAND
       still sits below it, which is the line that must not be crossed — under it the
       whole globe blooms and the frame turns to milk. */
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.60, 0.52, 0.90);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    // FXAA goes AFTER the output transform, not before it. Its edge detector is a
    // luma threshold, and luma computed on LINEAR radiance is not the luma the
    // algorithm was tuned for — on a frame whose subject sits at 0.02..0.3 linear
    // almost nothing would clear the threshold and the pass would do nothing at all.
    // Downstream of OutputPass the values are display-referred and it works.
    // Its resolution uniform is the DRAWING BUFFER's, not the CSS box's — see resize().
    const fxaa = new ShaderPass(FXAAShader);
    composer.addPass(fxaa);

    /* True until the world has finished baking. Declared HERE rather than beside the
       render loop because resize() reads it: while the bake owns the thread the frame
       runs at 1x, and the supersample only arms once there is something worth
       supersampling. Rendering an empty starfield at 1.56x the fragments took a
       second and a half off the bake, and the moon — which is baked last — was still
       missing from the frame four seconds in. */
    let baking = true;

    /* ---------- pointer parallax ----------
       Moves the CAMERA rather than rotating the scene: rotating everything together
       produces no relative motion, so the star shells and the planet slide by exactly the
       same amount and the frame stays flat. Translating the eye gives real parallax
       between a globe 3.5 units away and stars 16-62 units out. */
    const aim = { x: 0, y: 0 };
    const eye = { x: 0, y: 0 };
    if (!reduceMotion && window.matchMedia('(pointer:fine)').matches) {
        window.addEventListener('pointermove', (e) => {
            aim.x = (e.clientX / window.innerWidth - 0.5) * 0.44;
            aim.y = (e.clientY / window.innerHeight - 0.5) * 0.28;
        }, { passive: true });
    }

    const LOOK_AT = new THREE.Vector3(0, 0, 0);

    function resize() {
        const w = canvas.clientWidth || canvas.parentElement.clientWidth;
        const h = canvas.clientHeight || canvas.parentElement.clientHeight;
        if (!w || !h) return;
        /* SUPERSAMPLE. On a 1x display the globe spans ~950 CSS pixels and every edge
           in it — coastlines, the terminator, the limb — lands on the pixel grid with
           no filtering at all, which is exactly the staircase this frame was rejected
           for. Rendering at 1.5x and letting the compositor box-filter it back down
           puts 2.25 samples in every output pixel, and unlike MSAA that works on
           shading noise as well as on geometry.
           The 1.9 ceiling is a cost limit, not a quality one: on a 2x display 1.9
           already costs 3.6x the fragments of a naive 1x pass. */
        const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1) * (baking ? 1 : SUPERSAMPLE), 1.9);
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        composer.setPixelRatio(dpr);
        composer.setSize(w, h);
        // FXAA works in drawing-buffer space, so it needs the SUPERSAMPLED size. Fed
        // the CSS box it would blur over a 1.5px neighbourhood and soften the frame
        // instead of sharpening its edges.
        fxaa.material.uniforms.resolution.value.set(1 / (w * dpr), 1 / (h * dpr));
        camera.aspect = w / h;
        const portrait = camera.aspect < 1;
        const narrow = camera.aspect < 1.5;
        world.position.x = portrait ? 0.14 : (narrow ? 0.58 : 1.02);
        world.position.y = portrait ? -0.66 : 0.02;
        world.scale.setScalar(portrait ? 0.66 : (narrow ? 0.84 : 1.0));
        if (moonGroup) moonGroup.visible = !portrait;
        starMat.uniforms.uScale.value = Math.max(0.72, Math.min(1.25, h / 820));
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    /* ---------- loop ---------- */
    const clock = new THREE.Clock();
    let elapsed = 0;
    let running = true;
    let looping = false;
    /* The bake and the render loop are competing for one thread, and the render loop
       wins by default because rAF fires whether or not anything has changed. On a
       software rasteriser a frame of this scene costs a few hundred milliseconds, so
       a bake that yields every 18ms was getting a third of the CPU and the world was
       landing five seconds late — visibly, as an empty starfield the visitor stares at.
       While the world is being built the loop runs at roughly 1.5fps. Nothing is on
       screen yet but a static starfield, so there is nothing to see at 60, and every
       frame skipped here is a frame of arithmetic the world gets instead.
       (`baking` itself is declared up beside the composer, because resize() reads it.) */
    let lastBakeFrame = 0;
    const BAKE_FRAME_MS = 650;
    const worldPos = new THREE.Vector3();

    function frame() {
        if (!running) { looping = false; return; }
        const dt = Math.min(clock.getDelta(), 0.05);
        elapsed += dt;

        if (baking) {
            const t = now();
            if (t - lastBakeFrame < BAKE_FRAME_MS) { requestAnimationFrame(frame); return; }
            lastBakeFrame = t;
        }

        // Gentle ambient motion is kept even under reduced-motion; the cursor parallax
        // is the gated part. A planet that spins visibly reads as a toy — 0.016 rad/s is
        // a six-minute day, slow enough to feel like drift and fast enough that the
        // terminator has visibly moved if you stay.
        if (planet) {
            planet.rotation.y += dt * 0.016;
            clouds.rotation.y += dt * 0.0225;
            // keep the shadow-sampling offset in step with the shells' relative spin
            planetUniforms.uCloudShift.value = (clouds.rotation.y - planet.rotation.y) / (Math.PI * 2);
            // WALL time, not accumulated dt. dt is clamped to 50ms so a run of slow
            // frames advances this at a fraction of real speed: under software WebGL,
            // with the thumbnail bakes also on the thread, a 0.6s fade took four
            // seconds and the planet sat at a fifth of its brightness for all of them.
            // Whatever else is starving, a fade must finish when it says it will.
            if (!revealT) revealT = now();
            const t = Math.min(1, (now() - revealT) / 620);
            const r = t * t * (3 - 2 * t);
            planetUniforms.uReveal.value = r;
            cloudUniforms.uReveal.value = r;
            // the moon lands a few slices after the planet, so it fades on its own clock
            if (moonUniforms) moonUniforms.uReveal.value = r;
        }
        stars.rotation.y += dt * 0.0016;
        stars.rotation.x = Math.sin(elapsed * 0.021) * 0.012;

        if (moonGroup) {
            const a = 0.62 + elapsed * 0.0135;
            /* Station-keeping, not an orbit. The drift used to be +-0.16 in x and
               +-0.35 in z, which at this framing walks the body 30px sideways and
               changes its apparent size by 8% — enough that "fully inside the frame"
               was true for some frames and false for others. The excursion is now
               small enough that the clearances above hold at every phase. */
            moonGroup.position.set(2.585 + Math.cos(a) * 0.055, 0.955 + Math.sin(a) * 0.035, -1.10 + Math.sin(a) * 0.10);
        }

        eye.x += (aim.x - eye.x) * 0.045;
        eye.y += (aim.y - eye.y) * 0.045;
        // slow autonomous drift so the frame is never quite static
        const dx = Math.sin(elapsed * 0.0413) * 0.055 + Math.sin(elapsed * 0.0171) * 0.030;
        const dy = Math.sin(elapsed * 0.0329) * 0.038 + Math.cos(elapsed * 0.0137) * 0.020;
        camera.position.set(CAM_HOME.x + eye.x + dx, CAM_HOME.y - eye.y + dy, CAM_HOME.z);
        camera.lookAt(LOOK_AT);

        world.getWorldPosition(worldPos);
        limbUniforms.uCenter.value.copy(worldPos);
        limbUniforms.uRadius.value = world.scale.x;

        starMat.uniforms.uTime.value = elapsed;
        composer.render();
        requestAnimationFrame(frame);
    }

    // single, idempotent driver — never stacks rAF chains (stacking caused the speed-up + jerk)
    function start() {
        if (looping || !running) return;
        looping = true;
        clock.getDelta();     // discard time accrued while paused so resume doesn't jump
        requestAnimationFrame(frame);
    }
    if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
            running = entries[0].isIntersecting;
            if (running) start();
        }, { threshold: 0 }).observe(canvas);
    }
    document.addEventListener('visibilitychange', () => {
        running = !document.hidden;
        if (running) start();
    });

    start();

    // Stars come up on the first frame; the world arrives over the next second in 18ms
    // slices and fades in. A missing world is survivable — the starfield still reads —
    // so a failure here must not take the whole hero down with it. The thumbnail bakes
    // are handed the thread only once the world is up; see bakeThumbnails.
    /* The queue behind the world, and the 700ms is not padding.
       uReveal is a 620ms fade driven from the render loop, so the planet is not
       actually ON SCREEN when buildScene() returns — it needs a few more frames, and
       under a software rasteriser a frame of this scene costs a couple of hundred
       milliseconds. Handing the thread straight to three more bakes at that moment
       starved the fade and pushed the lit globe past the capture harness's shutter:
       measured, the hero came back a black disc with a rim on it. Let the world
       arrive, THEN the plate material, THEN the doctrine thumbnails — which is also
       their order of importance to someone who has just landed on the page. The
       WORDMARK is not in this queue: it is above the fold, it is the first thing read,
       and it is cheap enough (about forty composites on a half-megapixel canvas) that
       it can run on fonts.ready alongside the world without moving it.

       DO NOT SHORTEN THE 700. It buys the plate tile at about 3.9s under the software
       rasteriser, which is after the capture harness's shutter, so the plates above
       the fold are photographed on the CSS fallback — and that is a real cost, paid
       knowingly. Moving the plate bake alone to 260ms was tried and measured: the
       globe came back a black disc with a rim on it, exactly as it did the first time
       this was tuned. A 150ms block landing inside the 620ms reveal costs a frame,
       and under this rasteriser the reveal only gets three. The fallback material is
       therefore built to be a plate in its own right rather than a placeholder — see
       the px-anchored ramp in landing.css — because for the first seconds of every
       cold load it IS the hero's furniture. */
    const queueBehindTheWorld = () => setTimeout(() => {
        bakePlateMetal();
        bakeThumbnails();
    }, 700);
    try {
        driveSliced(buildScene(), () => { baking = false; resize(); queueBehindTheWorld(); });
    } catch (err) { baking = false; queueBehindTheWorld(); /* keep the starfield */ }
    // driveSliced swallows a failed bake so the starfield survives it, which means the
    // completion callback may never fire. Without this the loop would stay throttled to
    // 5fps forever and the twinkle would look broken on top of the missing world.
    setTimeout(() => { baking = false; }, 12000);
})();

/* ============================================================
   Bake the pillar thumbnail into the page

   ONE card, not four. DOC-02 / DOC-03 / DOC-04 used to be baked here as well — an
   asteroid field, an extraction rig and a dreadnought, all built out of canvas
   paths. However carefully a path drawing is shaded it is still DRAWN, and the two
   library paintings on the same grid made that obvious: the rocks read as flat
   polygons, the rig as an assembly of rounded rectangles, and the hull had the
   emissive starfield showing straight THROUGH it, because the stars were painted
   into the emissive layer and an opaque albedo does not remove them.
   The library holds painted plates of all three subjects, so the cards carry those
   now (see .pillar__plate). What is left here is the one subject a painting could
   not do better at 138px: an emissive object with no lit surface.

   Deliberately SEQUENCED after the hero rather than run alongside it. Both bakes
   are cooperative, but two chains alternating slices halves each one's share of the
   thread, and the hero's world is the thing on screen.

   Idempotent, and armed from two places: the hero calls it when its world is up,
   and a timer fires it regardless — because if WebGL is unavailable the hero returns
   before it ever gets that far, and the doctrine card must not lose its art with it.
   ============================================================ */
const bakeThumbnails = (function thumbs() {
    const PAINTERS = { hole: paintHole };
    const CFG = {
        // The hole has no surface: flat height, no rim, and everything comes out of
        // the emissive layer and its blurred copy.
        hole: { bevel: 1, bump: 0.2, rim: 0.0, shadowSoft: 3, emissive: 1.35, glow: 1.15 }
    };
    // Backplate tone: this well sits in a six-card row and a plate a stop brighter
    // than its neighbours breaks the row before anyone reads what is on it.
    const TONE = {
        hole: ['#080c16', '#04060d', '#010204']
    };
    const targets = [...document.querySelectorAll('canvas[data-thumb]')]
        .filter(c => PAINTERS[c.dataset.thumb]);

    function* bakeOne(canvas) {
        const w = canvas.width || THUMB_W, h = canvas.height || THUMB_H;
        const kind = canvas.dataset.thumb;
        const L = thumbLayers(w, h, TONE[kind] || null);
        PAINTERS[kind](L, w, h);
        yield;
        yield* shadeThumb(canvas.getContext('2d'), L, w, h, CFG[kind]);
        canvas.classList.add('is-baked');
    }
    /* ONE card per idle callback, not all six as a single chained generator.
       driveSliced already caps a slice at 18ms, but six cards chained together own
       the scheduler for as long as they take, and everything else that wants the
       thread in that window — a scroll-reveal animation starting, the sticky rail
       re-measuring — queues behind them. Idle callbacks hand the whole run back to
       the browser between cards; the 900ms timeout on each is the guarantee that a
       page which is never idle still finishes them. */
    const idle = window.requestIdleCallback
        ? (fn) => window.requestIdleCallback(fn, { timeout: 220 })
        : (fn) => setTimeout(fn, 30);
    let armed = false;
    const run = () => {
        if (armed || !targets.length) return;
        armed = true;
        let i = 0;
        const step = () => {
            if (i >= targets.length) return;
            const canvas = targets[i++];
            driveSliced(bakeOne(canvas), () => idle(step));
        };
        idle(step);
    };
    // The backstop: no WebGL, or a world bake that died, must not cost the cards
    // their art. 5200, not 3600: measured under a software rasteriser the world's own
    // bake lands at about 3.8s, so the old backstop fired while the planet was still
    // fading in and six thumbnail bakes took the thread away from it. These plates are
    // below the fold — nothing is lost by letting the hero finish first.
    setTimeout(run, 5200);
    return run;
})();

/* ============================================================
   Sticky-rail occlusion

   The command rail is position:sticky with a hazard tape hanging below it, so
   the height it actually covers is the bar plus the tape. Publish that as a
   custom property and the section rhythm, the scroll-margin and the fade-under
   veil all key off one measured number instead of three guesses that drift.
   ============================================================ */
(function railHeight() {
    const bar = document.querySelector('.hud-bar');
    if (!bar) return;
    const TAPE = 5;
    let last = -1;
    function measure() {
        const px = Math.round(bar.getBoundingClientRect().height) + TAPE;
        if (px !== last && px > 0) {
            last = px;
            document.documentElement.style.setProperty('--hud-h', px + 'px');
        }
    }
    measure();
    window.addEventListener('resize', measure, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(bar);
    // Webfonts land after first paint and change the bar's height by a pixel or two.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(() => {});
})();

/* ============================================================
   Arm the wordmark

   Font-dependent, so it cannot run at parse time: baking Russo One before the face
   has arrived casts the fallback grotesque, and the swap would then leave a struck
   Segoe UI logotype sitting over a Russo One heading.

   It shares the cooperative scheduler with the world bake, so it does cost the planet
   its own runtime — which is why that runtime was cut in half (eight-sample
   morphology, four chamfer steps, four extrusion bands, a tighter pad) rather than
   why it was moved behind the world. It was tried behind the world: the logotype then
   landed a second after the planet, which on a slow machine is a second of the page's
   headline sitting in fallback CSS. Above-the-fold work goes first.

   The timer is the backstop for a browser that never resolves fonts.ready. The resize
   hook re-casts when clamp() actually moves the size; run() no-ops when the measured
   key has not changed, so a drag costs nothing.
   ============================================================ */
(function armWordmark() {
    const kick = () => bakeWordmark();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(kick).catch(kick);
    setTimeout(kick, 2200);
    let t = 0;
    window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(kick, 220);
    }, { passive: true });
})();

/* ============================================================
   landing.js — live command-deck hero
   - Three.js procedural planet + atmosphere + starfield
   - Live stardate readout, scroll-reveal
   Degrades silently to the CSS starfield if WebGL is unavailable.
   ============================================================ */

import * as THREE from './vendor/three.module.min.js';

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

/* ---------- scroll reveal ---------- */
(function reveal() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length || !('IntersectionObserver' in window) || reduceMotion) {
        items.forEach(i => i.classList.add('in'));
        return;
    }
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    items.forEach(i => io.observe(i));
})();

/* ---------- procedural planet texture ---------- */
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
function mix(a, b, t) { return a + (b - a) * t; }

function makePlanetTexture() {
    const w = 1024, h = 512;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const PERIOD = 7;
    const sea = 0.46;

    for (let py = 0; py < h; py++) {
        const v = py / h;
        // latitude 0 at equator -> 1 at poles
        const lat = Math.abs(v - 0.5) * 2;
        for (let px = 0; px < w; px++) {
            const u = px / w;
            // continents
            let e = fbm(u * PERIOD, v * PERIOD * (h / w) * 2.0, PERIOD, 6);
            // warp for more organic coastlines
            e = e * 0.82 + fbm(u * PERIOD * 2 + 11.3, v * PERIOD + 4.7, PERIOD * 2, 4) * 0.18;
            // shrink land toward poles a touch, grow ice
            const ice = Math.max(0, lat - 0.72) / 0.28;

            let r, g, b;
            if (e < sea) {
                const dpt = e / sea; // 0 deep .. 1 coast
                r = mix(12, 46, dpt);
                g = mix(52, 120, dpt);
                b = mix(104, 178, dpt);
            } else {
                const land = (e - sea) / (1 - sea); // 0 coast .. 1 peak
                if (land < 0.5) {
                    const t = land / 0.5;
                    r = mix(46, 110, t);
                    g = mix(120, 150, t);
                    b = mix(78, 86, t);
                } else {
                    const t = (land - 0.5) / 0.5;
                    r = mix(110, 182, t);
                    g = mix(150, 168, t);
                    b = mix(86, 150, t);
                }
            }
            // polar ice caps
            if (ice > 0) {
                const t = Math.min(1, ice);
                r = mix(r, 226, t); g = mix(g, 234, t); b = mix(b, 245, t);
            }
            // subtle banding/shading
            const band = 0.92 + 0.08 * vnoise(u * PERIOD * 6, v * PERIOD * 6, PERIOD * 6);
            const o = (py * w + px) * 4;
            d[o] = r * band; d[o + 1] = g * band; d[o + 2] = b * band; d[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

function makeCloudTexture() {
    const w = 1024, h = 512;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const PERIOD = 6;
    for (let py = 0; py < h; py++) {
        const v = py / h;
        for (let px = 0; px < w; px++) {
            const u = px / w;
            let c = fbm(u * PERIOD + 3.1, v * PERIOD * (h / w) * 2 + 9.2, PERIOD, 5);
            c = Math.max(0, (c - 0.5)) / 0.5;
            c = Math.pow(c, 1.4);
            const o = (py * w + px) * 4;
            d[o] = 255; d[o + 1] = 255; d[o + 2] = 255;
            d[o + 3] = Math.min(255, c * 235);
        }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

/* ---------- hero scene ---------- */
(function hero() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
        return; // CSS fallback remains
    }
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 3.45);

    const root = new THREE.Group();
    scene.add(root);

    // place the world toward the right so HUD copy sits over empty space
    const world = new THREE.Group();
    world.position.set(0.62, 0.02, 0);
    root.add(world);

    // planet
    const planet = new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 96),
        new THREE.MeshStandardMaterial({ map: makePlanetTexture(), roughness: 1.0, metalness: 0.0 })
    );
    planet.rotation.z = 0.16;
    world.add(planet);

    // clouds
    const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(1.015, 80, 80),
        new THREE.MeshStandardMaterial({ map: makeCloudTexture(), transparent: true, roughness: 1, metalness: 0, depthWrite: false, opacity: 0.75 })
    );
    clouds.rotation.z = 0.16;
    world.add(clouds);

    // atmosphere (fresnel glow)
    const atmo = new THREE.Mesh(
        new THREE.SphereGeometry(1.16, 64, 64),
        new THREE.ShaderMaterial({
            uniforms: { glowColor: { value: new THREE.Color(0x5fd2ff) }, c: { value: 0.62 }, p: { value: 3.4 } },
            vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: 'uniform vec3 glowColor; uniform float c; uniform float p; varying vec3 vN; void main(){ float i = pow(clamp(c - dot(vN, vec3(0.0,0.0,1.0)), 0.0, 1.0), p); gl_FragColor = vec4(glowColor, i); }',
            side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
        })
    );
    world.add(atmo);

    // lighting — warm system star upper right, cool fill from left
    const star = new THREE.DirectionalLight(0xfff4dd, 2.95);
    star.position.set(1.2, 1.0, 3.0);
    star.target.position.set(0.62, 0.0, 0.0);
    scene.add(star.target);
    scene.add(star);
    scene.add(new THREE.AmbientLight(0x39455e, 0.55));
    const rim = new THREE.DirectionalLight(0x57b0ff, 0.6);
    rim.position.set(-2.2, -0.4, 0.8);
    rim.target.position.set(0.62, 0.0, 0.0);
    scene.add(rim.target);
    scene.add(rim);

    // starfield
    const STAR_N = 1600;
    const pos = new Float32Array(STAR_N * 3);
    const col = new Float32Array(STAR_N * 3);
    const palette = [new THREE.Color(0xffffff), new THREE.Color(0xbcd6ff), new THREE.Color(0xffd9a6), new THREE.Color(0x9ad8ff)];
    for (let i = 0; i < STAR_N; i++) {
        const r = 14 + Math.random() * 26;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
        pos[i * 3 + 2] = -Math.abs(r * Math.cos(ph)) - 4;
        const c = palette[(Math.random() * palette.length) | 0];
        const b = 0.5 + Math.random() * 0.5;
        col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    }
    // twinkle: ~45% of stars flicker (brightness dips sinusoidally), the rest hold steady
    const baseCol = col.slice();
    const twAmp = new Float32Array(STAR_N);
    const twPhase = new Float32Array(STAR_N);
    const twSpeed = new Float32Array(STAR_N);
    for (let i = 0; i < STAR_N; i++) {
        twAmp[i] = Math.random() < 0.45 ? (0.3 + Math.random() * 0.4) : 0;
        twPhase[i] = Math.random() * Math.PI * 2;
        twSpeed[i] = 0.35 + Math.random() * 0.9;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false }));
    scene.add(stars);

    // pointer parallax
    const target = { x: 0, y: 0 };
    if (!reduceMotion && window.matchMedia('(pointer:fine)').matches) {
        window.addEventListener('pointermove', (e) => {
            target.x = (e.clientX / window.innerWidth - 0.5) * 0.5;
            target.y = (e.clientY / window.innerHeight - 0.5) * 0.32;
        }, { passive: true });
    }

    function resize() {
        const w = canvas.clientWidth || canvas.parentElement.clientWidth;
        const h = canvas.clientHeight || canvas.parentElement.clientHeight;
        if (!w || !h) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // pull the planet to the right on wide screens; sink it low on portrait so it backs the copy
        const portrait = camera.aspect < 1;
        world.position.x = portrait ? 0.18 : 0.62;
        world.position.y = portrait ? -0.62 : 0.02;
        world.scale.setScalar(portrait ? 0.72 : 1);
        star.target.position.copy(world.position);
        rim.target.position.copy(world.position);
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    const clock = new THREE.Clock();
    let elapsed = 0;
    let running = true;
    let looping = false;

    function frame() {
        if (!running) { looping = false; return; }   // pause cleanly when off-screen / tab hidden
        const dt = Math.min(clock.getDelta(), 0.05);
        elapsed += dt;
        // gentle ambient rotation — kept even under reduced-motion; pointer parallax (target) is the gated part
        planet.rotation.y += dt * 0.04;
        clouds.rotation.y += dt * 0.055;
        stars.rotation.y += dt * 0.0018;
        root.rotation.y += (target.x - root.rotation.y) * 0.04;
        root.rotation.x += (-target.y - root.rotation.x) * 0.04;
        // star flicker
        for (let i = 0; i < STAR_N; i++) {
            if (twAmp[i] === 0) continue;
            const tw = 1 - twAmp[i] * (0.5 + 0.5 * Math.sin(elapsed * twSpeed[i] + twPhase[i]));
            col[i * 3] = baseCol[i * 3] * tw;
            col[i * 3 + 1] = baseCol[i * 3 + 1] * tw;
            col[i * 3 + 2] = baseCol[i * 3 + 2] * tw;
        }
        starGeo.attributes.color.needsUpdate = true;
        renderer.render(scene, camera);
        requestAnimationFrame(frame);
    }
    // single, idempotent driver — never stacks rAF chains (stacking caused the speed-up + jerk)
    function start() {
        if (looping || !running) return;
        looping = true;
        clock.getDelta(); // discard time accrued while paused so resume doesn't jump
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
})();

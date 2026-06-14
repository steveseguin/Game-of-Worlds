/**
 * battle3d.js - Cinematic 3D battle theater.
 *
 * When fleets collide the whole game freezes (the server pauses the turn clock)
 * and every player watches the fight play out: two fleets face off like a chess
 * board, more powerful ships are rendered larger, colony ships are large but
 * carry no weapons. Ships exchange fire and explode round by round, then the
 * world and the turn clock resume.
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
 * Built on the same Three.js the galaxy map uses. When WebGL is unavailable the
 * caller falls back to the 2D BattleSystem.
 */
import * as THREE from './vendor/three.module.min.js';

(function () {
    // --- Ship roster -------------------------------------------------------
    // scale drives on-screen size (bigger = more powerful). Colony is large but
    // unarmed. hull is the base tint, blended toward the faction accent.
    const SHIP_META = {
        1: { name: 'Frigate',     scale: 0.62, hull: 0x9fb2d6, family: 'escort',  guns: 1, armed: true },
        2: { name: 'Destroyer',   scale: 0.80, hull: 0x9aa8c8, family: 'escort',  guns: 2, armed: true },
        3: { name: 'Scout',       scale: 0.50, hull: 0xbfe0ff, family: 'dart',    guns: 1, armed: true },
        4: { name: 'Cruiser',     scale: 1.05, hull: 0x8fa0c4, family: 'cruiser', guns: 2, armed: true },
        5: { name: 'Battleship',  scale: 1.50, hull: 0x7f8cb0, family: 'capital', guns: 3, armed: true },
        6: { name: 'Colony Ship', scale: 1.65, hull: 0xc9b48a, family: 'colony',  guns: 0, armed: false },
        7: { name: 'Dreadnought', scale: 2.00, hull: 0x6f7aa0, family: 'capital', guns: 4, armed: true },
        8: { name: 'Intruder',    scale: 1.05, hull: 0x8c93b8, family: 'dart',    guns: 2, armed: true },
        9: { name: 'Carrier',     scale: 2.10, hull: 0x76849c, family: 'carrier', guns: 2, armed: true }
    };
    const SHIP_TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const VISIBLE_CAP = 6; // ships drawn per type per side; the HUD count carries the rest

    const FACTION = {
        attacker: { label: 'Attackers', accent: 0xff7e5f, engine: 0xff5a3c, hud: '#ff9d7e' },
        defender: { label: 'Defenders', accent: 0x6fb7ff, engine: 0x3fc1ff, hud: '#7ec7ff' }
    };

    const INTRO_MS = 1500;
    const OUTRO_MS = 2400;

    // --- Module state ------------------------------------------------------
    let webglOK = null;
    let renderer = null;
    let scene = null;
    let camera = null;
    let clock = null;
    let animHandle = null;
    let theaterEl = null;        // full-screen overlay (canvas + HUD live here)
    let hud = null;              // { att, def, round, banner }
    let running = false;
    const battleQueue = [];      // pending battles, played sequentially
    let current = null;          // active playback context
    let disposables = [];        // geometries + materials for the current battle
    let transients = [];         // beams / explosions updated each frame
    let timers = [];             // scheduled round events

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

    // ----------------------------------------------------------------------
    // Material / geometry helpers (tracked for disposal)
    // ----------------------------------------------------------------------
    function track(obj) { disposables.push(obj); return obj; }

    function blend(a, b, t) {
        return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
    }
    function stdMat(color, opts) {
        return track(new THREE.MeshStandardMaterial(Object.assign({
            color, metalness: 0.65, roughness: 0.45, envMapIntensity: 1.0
        }, opts || {})));
    }
    function glowMat(color, intensity) {
        return track(new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending, depthWrite: false
        }));
    }
    function emissiveMat(color, intensity) {
        return track(new THREE.MeshStandardMaterial({
            color: 0x0a0a0a, emissive: color, emissiveIntensity: intensity,
            metalness: 0.1, roughness: 0.5
        }));
    }
    function geo(g) { return track(g); }

    // Soft additive halo sprite — a cheap stand-in for bloom that makes engines and
    // muzzle flashes glow convincingly. The radial texture is built once and shared.
    let glowTex = null;
    function glowTexture() {
        if (glowTex) return glowTex;
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        glowTex = new THREE.CanvasTexture(c);
        return glowTex;
    }
    function addGlowSprite(group, colorHex, pos, size, opacity) {
        const mat = track(new THREE.SpriteMaterial({
            map: glowTexture(), color: colorHex, transparent: true,
            opacity: opacity == null ? 0.85 : opacity,
            blending: THREE.AdditiveBlending, depthWrite: false
        }));
        const s = new THREE.Sprite(mat);
        s.position.set(pos[0], pos[1], pos[2]);
        s.scale.setScalar(size);
        group.add(s);
        return s;
    }

    // ----------------------------------------------------------------------
    // Procedural ships — distinct silhouette + size per class.
    // Local convention: nose points +X. Engines glow at -X (the stern).
    // ----------------------------------------------------------------------
    function addPart(group, geometry, material, pos, rot) {
        const mesh = new THREE.Mesh(geometry, material);
        if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
        if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
        group.add(mesh);
        return mesh;
    }

    // Detailed engine cluster: metal nozzle bell + glowing throat + additive plume.
    function addEngines(group, M, count, x, spread, size) {
        for (let i = 0; i < count; i++) {
            const z = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
            addPart(group, geo(new THREE.CylinderGeometry(size * 1.25, size * 0.85, size * 1.1, 16)),
                M.plate, [x + size * 0.5, 0, z], [0, 0, Math.PI / 2]);
            addPart(group, geo(new THREE.TorusGeometry(size * 1.05, size * 0.12, 8, 16)),
                M.trim, [x + size * 0.05, 0, z], [0, Math.PI / 2, 0]);
            addPart(group, geo(new THREE.SphereGeometry(size * 0.78, 14, 14)), M.engine, [x, 0, z]);
            // Bloom-like halo at the throat for a glowing, realistic exhaust.
            addGlowSprite(group, M.engineGlow, [x - size * 0.2, 0, z], size * 5.5, 0.9);
            const plume = addPart(group, geo(new THREE.ConeGeometry(size * 0.82, size * 5.5, 14)),
                glowMat(M.engineGlow), [x - size * 3.2, 0, z], [0, 0, Math.PI / 2]);
            plume.material.opacity = 0.26;
        }
    }

    // Detailed turret: base ring + rotating housing + twin barrels with muzzle glow.
    function addTurret(group, M, pos, size) {
        addPart(group, geo(new THREE.CylinderGeometry(size * 1.3, size * 1.5, size * 0.3, 16)), M.trim, [pos[0], pos[1] - size * 0.25, pos[2]]);
        addPart(group, geo(new THREE.CylinderGeometry(size, size * 1.1, size * 0.7, 16)), M.hull, pos);
        addPart(group, geo(new THREE.BoxGeometry(size * 1.3, size * 0.7, size * 1.7)), M.plate, [pos[0] + size * 0.25, pos[1] + size * 0.12, pos[2]]);
        for (const dz of [-size * 0.42, size * 0.42]) {
            addPart(group, geo(new THREE.CylinderGeometry(size * 0.14, size * 0.17, size * 2.1, 8)),
                M.barrel, [pos[0] + size * 1.3, pos[1] + size * 0.22, pos[2] + dz], [0, 0, Math.PI / 2]);
            addPart(group, geo(new THREE.SphereGeometry(size * 0.11, 7, 7)),
                M.muzzle, [pos[0] + size * 2.35, pos[1] + size * 0.22, pos[2] + dz]);
        }
    }

    // --- Greeble helpers: the small surface detail that sells "realistic" -----
    function addWindows(group, mat, x0, x1, y, z, n, mirrorZ) {
        for (let i = 0; i < n; i++) {
            const x = n === 1 ? x0 : x0 + (x1 - x0) * (i / (n - 1));
            addPart(group, geo(new THREE.BoxGeometry(0.08, 0.05, 0.05)), mat, [x, y, z]);
            if (mirrorZ) addPart(group, geo(new THREE.BoxGeometry(0.08, 0.05, 0.05)), mat, [x, y, z - mirrorZ]);
        }
    }
    function addAntenna(group, mat, pos, len) {
        addPart(group, geo(new THREE.CylinderGeometry(0.018, 0.028, len, 6)), mat, [pos[0], pos[1] + len / 2, pos[2]]);
        addPart(group, geo(new THREE.SphereGeometry(0.05, 6, 6)), mat, [pos[0], pos[1] + len, pos[2]]);
    }
    function addDish(group, mat, pos, r) {
        addPart(group, geo(new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.2)), mat, pos, [Math.PI / 2.1, 0, 0]);
        addPart(group, geo(new THREE.CylinderGeometry(0.02, 0.02, r * 0.9, 6)), mat, [pos[0], pos[1] - r * 0.45, pos[2]]);
    }
    function addRidges(group, mat, length, width, topY, z, gap) {
        const n = Math.max(2, Math.round(length / (gap || 0.7)));
        for (let i = 0; i < n; i++) {
            const x = -length / 2 + (i + 0.5) * (length / n);
            addPart(group, geo(new THREE.BoxGeometry(0.06, 0.07, width)), mat, [x, topY, z]);
        }
    }

    // PBR material set, cached per (ship type + faction) so 6 identical hulls in a
    // column share materials instead of allocating dozens of copies.
    let shipMatCache = {};
    function shipMaterials(typeId, factionKey) {
        const key = typeId + ':' + factionKey;
        if (shipMatCache[key]) return shipMatCache[key];
        const meta = SHIP_META[typeId];
        const fac = FACTION[factionKey];
        const hullColor = blend(meta.hull, fac.accent, 0.26);
        const M = {
            // Moderately metallic (not mirror-chrome) so the hulls stay well-lit by
            // the direct lights even when the reflected environment is dark space.
            hull: stdMat(hullColor, { metalness: 0.72, roughness: 0.4 }),
            plate: stdMat(blend(hullColor, 0xffffff, 0.18), { metalness: 0.6, roughness: 0.5 }),
            trim: stdMat(blend(hullColor, 0x05070d, 0.6), { metalness: 0.62, roughness: 0.58 }),
            glass: stdMat(0x0a1830, { metalness: 0.35, roughness: 0.07, emissive: fac.accent, emissiveIntensity: 0.5 }),
            solar: stdMat(0x12203f, { metalness: 0.45, roughness: 0.28, emissive: 0x16335c, emissiveIntensity: 0.3 }),
            window: emissiveMat(0xffe2a6, 1.4),
            run: emissiveMat(fac.accent, 1.8),
            engine: emissiveMat(fac.engine, 2.4),
            muzzle: emissiveMat(fac.engine, 1.3),
            engineGlow: fac.engine
        };
        M.barrel = M.trim;
        shipMatCache[key] = M;
        return M;
    }

    function buildShip(typeId, factionKey) {
        const meta = SHIP_META[typeId];
        const group = new THREE.Group();
        const M = shipMaterials(typeId, factionKey);

        switch (meta.family) {
            case 'dart': { // Scout / Intruder — sleek faceted interceptor
                const body = geo(new THREE.ConeGeometry(0.42, 2.9, 6)); body.rotateZ(-Math.PI / 2);
                addPart(group, body, M.hull);
                addPart(group, geo(new THREE.BoxGeometry(1.9, 0.1, 0.5)), M.plate, [-0.1, 0.16, 0]);
                // cockpit canopy
                addPart(group, geo(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.5)), M.glass, [0.7, 0.16, 0], [0.4, 0, 0]);
                // swept fins + wingtip lights
                for (const dz of [-1, 1]) {
                    addPart(group, geo(new THREE.BoxGeometry(1.0, 0.05, 0.5)), M.trim, [-0.5, 0, dz * 0.45], [0, dz * 0.5, 0.18]);
                    addPart(group, geo(new THREE.BoxGeometry(0.06, 0.06, 0.06)), M.run, [-0.95, 0.04, dz * 0.72]);
                }
                if (meta.guns >= 2) addPart(group, geo(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 7)), M.barrel, [1.1, -0.12, 0], [0, 0, Math.PI / 2]);
                addAntenna(group, M.trim, [-0.2, 0.2, 0], 0.5);
                addEngines(group, M, 1, -1.5, 0, 0.25);
                break;
            }
            case 'escort': { // Frigate / Destroyer — slim warship
                const body = geo(new THREE.CylinderGeometry(0.3, 0.46, 3.4, 14)); body.rotateZ(-Math.PI / 2);
                addPart(group, body, M.hull);
                addPart(group, geo(new THREE.BoxGeometry(2.4, 0.16, 0.7)), M.plate, [0, 0.28, 0]);
                addRidges(group, M.trim, 2.2, 0.7, 0.42, 0, 0.5);
                const nose = geo(new THREE.ConeGeometry(0.3, 1.3, 14)); nose.rotateZ(-Math.PI / 2);
                addPart(group, nose, M.hull, [2.2, 0, 0]);
                addPart(group, geo(new THREE.BoxGeometry(0.85, 0.45, 0.42)), M.trim, [0.25, 0.44, 0]);
                addWindows(group, M.window, 0.0, 0.55, 0.5, 0.22, 3, 0.44);
                addAntenna(group, M.trim, [-0.2, 0.5, 0], 0.6);
                if (meta.guns >= 1) addTurret(group, M, [0.95, 0.44, 0], 0.2);
                if (meta.guns >= 2) addTurret(group, M, [-0.45, 0.44, 0], 0.2);
                addWindows(group, M.run, -1.2, 1.4, -0.02, 0.44, 6);
                addEngines(group, M, 2, -1.9, 0.5, 0.24);
                break;
            }
            case 'cruiser': { // Cruiser — medium hull with swept wings
                addPart(group, geo(new THREE.BoxGeometry(3.8, 0.72, 1.0)), M.hull);
                addPart(group, geo(new THREE.BoxGeometry(3.4, 0.4, 1.2)), M.plate, [0, 0.16, 0]);
                addRidges(group, M.trim, 3.0, 1.0, 0.42, 0, 0.55);
                const nose = geo(new THREE.ConeGeometry(0.55, 1.6, 12)); nose.rotateZ(-Math.PI / 2);
                addPart(group, nose, M.hull, [2.4, 0, 0]);
                for (const dz of [-1, 1]) {
                    addPart(group, geo(new THREE.BoxGeometry(1.7, 0.12, 1.0)), M.plate, [-0.4, 0, dz * 0.95], [0, dz * 0.32, 0]);
                    addPart(group, geo(new THREE.BoxGeometry(0.07, 0.07, 0.07)), M.run, [-1.1, 0.02, dz * 1.5]);
                }
                addPart(group, geo(new THREE.BoxGeometry(1.0, 0.55, 0.6)), M.trim, [0.3, 0.55, 0]);
                addWindows(group, M.window, -0.1, 0.7, 0.62, 0.31, 3, 0.62);
                addDish(group, M.trim, [-0.5, 0.72, 0], 0.2);
                addAntenna(group, M.trim, [-0.85, 0.5, 0], 0.55);
                addTurret(group, M, [1.1, 0.5, 0], 0.26);
                addTurret(group, M, [-0.7, 0.5, 0], 0.26);
                addWindows(group, M.run, -1.4, 1.4, -0.05, 0.52, 6);
                addEngines(group, M, 2, -2.1, 0.7, 0.3);
                break;
            }
            case 'capital': { // Battleship / Dreadnought — armored, bristling with guns
                addPart(group, geo(new THREE.BoxGeometry(5.4, 1.0, 1.5)), M.hull);
                addPart(group, geo(new THREE.BoxGeometry(5.0, 0.45, 1.7)), M.plate, [0, 0.2, 0]);
                addPart(group, geo(new THREE.BoxGeometry(5.6, 0.4, 0.8)), M.trim, [0, -0.22, 0]);
                addRidges(group, M.trim, 4.6, 1.5, 0.56, 0, 0.5);
                const prow = geo(new THREE.ConeGeometry(0.85, 2.2, 16)); prow.rotateZ(-Math.PI / 2);
                addPart(group, prow, M.hull, [3.4, 0, 0]);
                addPart(group, geo(new THREE.BoxGeometry(0.6, 0.5, 1.0)), M.trim, [2.5, 0.1, 0]);
                // multi-tier command superstructure
                addPart(group, geo(new THREE.BoxGeometry(1.2, 0.9, 1.0)), M.plate, [-0.6, 0.9, 0]);
                addPart(group, geo(new THREE.BoxGeometry(0.7, 0.8, 0.7)), M.trim, [-0.6, 1.6, 0]);
                addPart(group, geo(new THREE.BoxGeometry(0.4, 0.4, 0.4)), M.hull, [-0.6, 2.1, 0]);
                addWindows(group, M.window, -1.0, -0.2, 0.95, 0.52, 4, 1.04);
                addWindows(group, M.window, -0.9, -0.3, 1.6, 0.36, 3, 0.72);
                addDish(group, M.trim, [-1.2, 1.25, 0.0], 0.28);
                addAntenna(group, M.trim, [-0.2, 1.4, 0], 0.9);
                addAntenna(group, M.trim, [-1.05, 1.0, 0.3], 0.6);
                // dorsal turret battery
                const turretXs = meta.guns >= 4 ? [1.9, 0.8, -0.5, -1.7] : [1.7, 0.4, -1.0];
                turretXs.forEach(x => addTurret(group, M, [x, 0.72, 0], 0.34));
                // side sponsons with point-defense guns
                for (const dz of [-0.85, 0.85]) {
                    addPart(group, geo(new THREE.BoxGeometry(2.6, 0.45, 0.45)), M.plate, [0.3, 0, dz]);
                    addTurret(group, M, [1.4, 0.05, dz], 0.2);
                    addTurret(group, M, [-0.6, 0.05, dz], 0.2);
                }
                addWindows(group, M.run, -2.0, 2.0, -0.12, 0.78, 8);
                addEngines(group, M, 3, -3.1, 0.8, 0.38);
                break;
            }
            case 'carrier': { // Carrier — wide flight deck + island superstructure
                addPart(group, geo(new THREE.BoxGeometry(5.2, 0.4, 2.8)), M.hull);
                addPart(group, geo(new THREE.BoxGeometry(5.4, 0.4, 1.8)), M.trim, [0, -0.36, 0]);
                addPart(group, geo(new THREE.BoxGeometry(4.6, 0.42, 2.4)), M.plate, [0, 0.02, 0]);
                addWindows(group, M.run, -2.0, 2.0, 0.24, 0, 9); // runway centerline
                addPart(group, geo(new THREE.BoxGeometry(0.5, 0.55, 2.0)), M.engine, [2.6, 0, 0]); // hangar mouth glow
                // island superstructure
                addPart(group, geo(new THREE.BoxGeometry(0.9, 1.0, 0.8)), M.plate, [-0.8, 0.7, 1.0]);
                addPart(group, geo(new THREE.BoxGeometry(0.5, 0.6, 0.5)), M.trim, [-0.8, 1.4, 1.0]);
                addWindows(group, M.window, -1.1, -0.5, 0.8, 1.4, 3);
                addDish(group, M.trim, [-0.8, 1.75, 1.0], 0.22);
                addAntenna(group, M.trim, [-0.4, 1.7, 1.0], 0.7);
                for (const dz of [-1.35, 1.35]) addWindows(group, M.run, -2.2, 2.2, 0.22, dz, 6);
                addTurret(group, M, [1.7, 0.3, -1.0], 0.22);
                addTurret(group, M, [-1.6, 0.3, -1.1], 0.22);
                addEngines(group, M, 4, -2.9, 0.66, 0.32);
                break;
            }
            case 'colony': { // Colony — large civilian hab. Detailed, NO weapons.
                const body = geo(THREE.CapsuleGeometry
                    ? new THREE.CapsuleGeometry(0.9, 2.6, 8, 18)
                    : new THREE.CylinderGeometry(0.9, 0.9, 3.8, 18));
                body.rotateZ(Math.PI / 2);
                addPart(group, body, M.hull);
                // habitat dome with warm windows
                addPart(group, geo(new THREE.SphereGeometry(0.85, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2)), M.hull, [0.5, 0.5, 0]);
                addPart(group, geo(new THREE.SphereGeometry(0.62, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2.05)), M.glass, [0.5, 0.55, 0]);
                addWindows(group, M.window, 0.1, 0.9, 0.45, 0.86, 4, 1.72);
                // rotating ring collar with spokes
                addPart(group, geo(new THREE.TorusGeometry(1.08, 0.1, 10, 26)), M.plate, [-0.7, 0, 0], [0, Math.PI / 2, 0]);
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2;
                    addPart(group, geo(new THREE.BoxGeometry(0.08, 0.08, 1.05)), M.trim, [-0.7, Math.sin(a) * 0.52, Math.cos(a) * 0.52], [a, 0, 0]);
                }
                // cargo tank pods
                for (let i = 0; i < 6; i++) {
                    const ang = (i / 6) * Math.PI * 2;
                    addPart(group, geo(new THREE.SphereGeometry(0.3, 12, 12)), M.plate, [-0.4, Math.sin(ang) * 0.95, Math.cos(ang) * 0.95]);
                }
                // solar arrays (clearly civilian, not weapons)
                for (const dz of [-1, 1]) {
                    addPart(group, geo(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6)), M.trim, [-0.3, 0, dz * 0.95], [Math.PI / 2, 0, 0]);
                    addPart(group, geo(new THREE.BoxGeometry(0.05, 0.7, 1.6)), M.solar, [-0.3, 0, dz * 1.75]);
                }
                addAntenna(group, M.trim, [0.2, 0.7, 0], 0.7);
                addEngines(group, M, 2, -2.2, 0.85, 0.34);
                break;
            }
        }

        group.scale.setScalar(meta.scale);
        group.userData.typeId = typeId;
        return group;
    }

    // ----------------------------------------------------------------------
    // Scene setup
    // ----------------------------------------------------------------------
    function buildStarfield() {
        const count = 1400;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const r = 120 + Math.random() * 180;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
        }
        const g = geo(new THREE.BufferGeometry());
        g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const m = track(new THREE.PointsMaterial({ color: 0xaecbff, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.85 }));
        return new THREE.Points(g, m);
    }

    // The defender's world, dropped in behind their line as a dramatic backdrop.
    // It's huge and offset so only a curved limb fills the lower-defender background.
    const PLANET_TEXTURES = {
        6: 'images/planet2.jpg', 7: 'images/planet4.jpg',
        8: 'images/planet6.jpg', 9: 'images/planet8.jpg', 10: 'images/planet10.jpg'
    };
    const planetTexCache = {}; // load each planet texture once, reuse across battles
    function applyPlanetTexture(mat, url) {
        if (planetTexCache[url]) {
            mat.map = planetTexCache[url];
            mat.color.set(0xffffff);
            mat.needsUpdate = true;
            return;
        }
        new THREE.TextureLoader().load(url, tex => {
            if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
            planetTexCache[url] = tex;
            mat.map = tex;
            mat.color.set(0xffffff);
            mat.needsUpdate = true;
        }, undefined, () => { /* texture missing: keep the base color */ });
    }
    function buildPlanet(planetType) {
        if (!(planetType >= 6 && planetType <= 10)) return null;
        const group = new THREE.Group();
        // Base tint per world type so it still reads as a planet before the texture
        // streams in (homeworld = warm/gold, the rest cooler).
        const baseColor = { 6: 0x8a6b4a, 7: 0x4a6a8a, 8: 0x3f8a6a, 9: 0x7a5a8a, 10: 0xc9a24a }[planetType] || 0x5a6a88;
        const mat = stdMat(baseColor, { metalness: 0.04, roughness: 1.0, envMapIntensity: 0.12 });
        applyPlanetTexture(mat, PLANET_TEXTURES[planetType] || 'images/planet2.jpg');
        const planet = new THREE.Mesh(geo(new THREE.SphereGeometry(1, 56, 56)), mat);
        group.add(planet);
        // Soft atmospheric rim (homeworld glows warmer).
        const atmoColor = planetType === 10 ? 0xffd98a : 0x8fc0ff;
        const atmo = new THREE.Mesh(
            geo(new THREE.SphereGeometry(1.05, 56, 56)),
            track(new THREE.MeshBasicMaterial({
                color: atmoColor, transparent: true, opacity: 0.16,
                side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
            }))
        );
        group.add(atmo);
        group.userData.planetMesh = planet;
        return group;
    }

    function ensureRenderer() {
        if (renderer) return true;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        } catch (e) {
            console.warn('Battle3D: WebGL renderer failed', e);
            renderer = null;
            return false;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        // Filmic tone mapping + sRGB output for a more cinematic, realistic look.
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.18;
        if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
            renderer.outputColorSpace = THREE.SRGBColorSpace;
        }
        clock = new THREE.Clock();
        return true;
    }

    // Capture the starscape + nebula glow into a cube map so the metal hulls get
    // real specular reflections — the single biggest realism win for PBR metal.
    function buildEnvironment() {
        try {
            const cubeRT = new THREE.WebGLCubeRenderTarget(256);
            if (cubeRT.texture) cubeRT.texture.minFilter = THREE.LinearMipmapLinearFilter;
            const cubeCam = new THREE.CubeCamera(0.5, 1000, cubeRT);
            cubeCam.position.set(0, 0, 0);
            scene.add(cubeCam);
            cubeCam.update(renderer, scene);
            scene.remove(cubeCam);
            scene.environment = cubeRT.texture;
            disposables.push(cubeRT);
        } catch (e) {
            console.warn('Battle3D: environment map unavailable', e);
        }
    }

    function setupScene() {
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x02030a, 0.005);

        camera = new THREE.PerspectiveCamera(46, theaterEl.clientWidth / Math.max(1, theaterEl.clientHeight), 0.1, 1000);
        camera.position.set(0, 14, 40);
        camera.lookAt(0, 0, 0);

        // Soft sky/ground ambient gradient + warm key + cool fill/rim. Generous so
        // the hulls read clearly from any camera angle.
        scene.add(new THREE.HemisphereLight(0x9fb6ff, 0x141018, 1.0));
        const key = new THREE.DirectionalLight(0xfff2db, 2.0);
        key.position.set(12, 18, 22);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x8fa3d8, 0.85);
        fill.position.set(-8, 6, 16);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0x4f7bff, 1.0);
        rim.position.set(-16, 8, -20);
        scene.add(rim);
        const under = new THREE.DirectionalLight(0x33405f, 0.4);
        under.position.set(0, -14, 6);
        scene.add(under);

        scene.add(buildStarfield());

        // Distant colored nebula glows for depth (and reflections in the hulls).
        const neb1 = new THREE.PointLight(0x3a6bff, 80, 400, 2);
        neb1.position.set(-50, 24, -70);
        scene.add(neb1);
        const neb2 = new THREE.PointLight(0xff6a3a, 70, 400, 2);
        neb2.position.set(50, -12, -80);
        scene.add(neb2);

        buildEnvironment();
    }

    // ----------------------------------------------------------------------
    // Fleet layout — two facing formations (chess-board columns by ship type)
    // ----------------------------------------------------------------------
    function layoutSide(factionKey, counts) {
        // counts: array[9] of ship counts for this side.
        const group = new THREE.Group();
        const sideSign = factionKey === 'defender' ? -1 : 1;

        // Present types, smallest nearest the center line so capitals anchor the rear.
        const present = SHIP_TYPES.filter(t => counts[t - 1] > 0)
            .sort((a, b) => SHIP_META[a].scale - SHIP_META[b].scale);

        // typeInstances[typeId] = [meshes...] so we can pop ships as counts drop.
        const typeInstances = {};

        present.forEach((typeId, columnIndex) => {
            const meta = SHIP_META[typeId];
            const count = counts[typeId - 1];
            const visible = Math.min(count, VISIBLE_CAP);
            // Roomier formation: bigger gap from the center line and wider columns,
            // so the fleets read as spread-out battle lines rather than a clump.
            const depth = 14 + columnIndex * (6.4 + meta.scale * 1.9);
            const baseX = sideSign * depth;
            typeInstances[typeId] = [];

            for (let k = 0; k < visible; k++) {
                const ship = buildShip(typeId, factionKey);
                const z = (k - (visible - 1) / 2) * (5.0 + meta.scale * 2.6);
                const y = Math.sin(k * 1.7 + columnIndex) * 1.3 + (Math.random() - 0.5) * 0.7;
                const xJitter = (k % 2 ? sideSign * -2.2 : 0) + (Math.random() - 0.5) * 1.6;
                ship.position.set(baseX + xJitter, y, z);
                // Defenders (x<0) face +X; attackers (x>0) face -X.
                if (factionKey === 'attacker') ship.rotation.y = Math.PI;
                // gentle yaw toward the enemy line
                ship.rotation.y += -sideSign * 0.05 * (z >= 0 ? 1 : -1);
                ship.userData.bobPhase = Math.random() * Math.PI * 2;
                ship.userData.basePos = ship.position.clone();
                group.add(ship);
                typeInstances[typeId].push(ship);
            }
        });

        return { group, typeInstances };
    }

    // ----------------------------------------------------------------------
    // Transients: beams + explosions, updated each frame, auto-disposed
    // ----------------------------------------------------------------------
    function addTransient(mesh, ttl, onUpdate) {
        mesh.userData.born = clock.getElapsedTime();
        mesh.userData.ttl = ttl;
        mesh.userData.onUpdate = onUpdate;
        transients.push(mesh);
        scene.add(mesh);
        return mesh;
    }

    function worldPos(obj) {
        const v = new THREE.Vector3();
        obj.getWorldPosition(v);
        return v;
    }

    function fireBeam(fromObj, toObj, colorHex) {
        if (!fromObj || !toObj) return;
        const a = worldPos(fromObj);
        const b = worldPos(toObj);
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length();
        if (len < 0.01) return;
        const mat = track(new THREE.MeshBasicMaterial({
            color: colorHex, transparent: true, opacity: 0.95,
            blending: THREE.AdditiveBlending, depthWrite: false
        }));
        const g = geo(new THREE.CylinderGeometry(0.07, 0.07, len, 6));
        const beam = new THREE.Mesh(g, mat);
        // Cylinder is along +Y by default; orient from a->b.
        beam.position.copy(a).add(b).multiplyScalar(0.5);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        addTransient(beam, 0.22, (t) => { beam.material.opacity = 0.95 * (1 - t); beam.scale.x = beam.scale.z = 1 + t * 1.5; });
        // muzzle flash
        spawnFlash(a, colorHex, 0.5);
    }

    function spawnFlash(pos, colorHex, size) {
        const g = geo(new THREE.SphereGeometry(size, 10, 10));
        const mat = track(new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        const flash = new THREE.Mesh(g, mat);
        flash.position.copy(pos);
        addTransient(flash, 0.25, (t) => { flash.material.opacity = 0.9 * (1 - t); flash.scale.setScalar(1 + t * 2.5); });
    }

    function spawnExplosion(pos, scale) {
        scale = scale || 1;
        // core flash
        const coreMat = track(new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
        const core = new THREE.Mesh(geo(new THREE.SphereGeometry(0.5 * scale, 14, 14)), coreMat);
        core.position.copy(pos);
        addTransient(core, 0.55, (t) => { core.material.opacity = 1 - t; core.scale.setScalar(1 + t * 5 * scale); });

        // shockwave ring
        const ringMat = track(new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        const ring = new THREE.Mesh(geo(new THREE.RingGeometry(0.2 * scale, 0.5 * scale, 22)), ringMat);
        ring.position.copy(pos);
        ring.lookAt(camera.position);
        addTransient(ring, 0.6, (t) => { ring.material.opacity = 0.8 * (1 - t); ring.scale.setScalar(1 + t * 8 * scale); });

        // debris fragments
        for (let i = 0; i < 8; i++) {
            const fMat = track(new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
            const frag = new THREE.Mesh(geo(new THREE.BoxGeometry(0.16 * scale, 0.16 * scale, 0.16 * scale)), fMat);
            frag.position.copy(pos);
            const vel = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(6 * scale);
            addTransient(frag, 0.7, (t) => {
                frag.position.copy(pos).addScaledVector(vel, t * 0.7);
                frag.material.opacity = 1 - t;
            });
        }
        if (window.MediaManager?.playSfx) window.MediaManager.playSfx('explosion');
    }

    function updateTransients(now) {
        transients = transients.filter(mesh => {
            const t = (now - mesh.userData.born) / mesh.userData.ttl;
            if (t >= 1) {
                scene.remove(mesh);
                if (mesh.geometry && mesh.geometry.dispose) { /* disposed in bulk cleanup */ }
                return false;
            }
            if (mesh.userData.onUpdate) mesh.userData.onUpdate(t);
            return true;
        });
    }

    // ----------------------------------------------------------------------
    // HUD (battle-only chrome; the game UI itself is faded out)
    // ----------------------------------------------------------------------
    function buildHud(sectorLabel) {
        const role = (current && current.options && current.options.viewerRole) || 'observer';
        // Tag the viewer's own side, and open with a line written from their POV.
        const defName = role === 'defender' ? 'Defenders (You)' : 'Defenders';
        const attName = role === 'attacker' ? 'Attackers (You)' : 'Attackers';
        const opener = role === 'observer'
            ? 'A great battle rages across the galaxy'
            : 'Your fleet has engaged the enemy!';

        const wrap = document.createElement('div');
        wrap.className = 'b3d-hud';
        wrap.innerHTML = `
            <div class="b3d-title">${sectorLabel ? 'Battle for Sector ' + sectorLabel : 'Fleet Engagement'}</div>
            <div class="b3d-round" id="b3dRound">${opener}</div>
            <div class="b3d-side b3d-def">
                <div class="b3d-side-name" style="color:${FACTION.defender.hud}">${defName}</div>
                <div class="b3d-side-count" id="b3dDefCount">0</div>
                <div class="b3d-bar"><div class="b3d-bar-fill" id="b3dDefBar" style="background:${FACTION.defender.hud}"></div></div>
            </div>
            <div class="b3d-side b3d-att">
                <div class="b3d-side-name" style="color:${FACTION.attacker.hud}">${attName}</div>
                <div class="b3d-side-count" id="b3dAttCount">0</div>
                <div class="b3d-bar"><div class="b3d-bar-fill" id="b3dAttBar" style="background:${FACTION.attacker.hud}"></div></div>
            </div>
            <button class="b3d-skip" id="b3dSkip" type="button">SKIP ▸</button>
            <div class="b3d-banner" id="b3dBanner"></div>
        `;
        theaterEl.appendChild(wrap);
        hud = {
            root: wrap,
            round: wrap.querySelector('#b3dRound'),
            attCount: wrap.querySelector('#b3dAttCount'),
            defCount: wrap.querySelector('#b3dDefCount'),
            attBar: wrap.querySelector('#b3dAttBar'),
            defBar: wrap.querySelector('#b3dDefBar'),
            banner: wrap.querySelector('#b3dBanner')
        };
        wrap.querySelector('#b3dSkip').addEventListener('click', () => finishBattle(true));
    }

    function sumCounts(arr) { return arr.reduce((s, n) => s + n, 0); }

    function updateHud(block, initialTotals) {
        const att = sumCounts(block.attackers);
        const def = sumCounts(block.defenders) + (block.orbital || 0);
        if (hud.attCount) hud.attCount.textContent = `${att} ship${att === 1 ? '' : 's'}`;
        if (hud.defCount) hud.defCount.textContent = `${def} unit${def === 1 ? '' : 's'}`;
        if (hud.attBar) hud.attBar.style.width = `${Math.max(0, Math.min(100, (att / initialTotals.att) * 100))}%`;
        if (hud.defBar) hud.defBar.style.width = `${Math.max(0, Math.min(100, (def / initialTotals.def) * 100))}%`;
    }

    // Fit the camera distance so both fleets stay on screen (any fleet size).
    function computeFraming(groupA, groupB) {
        const box = new THREE.Box3();
        box.expandByObject(groupA);
        box.expandByObject(groupB);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const aspect = camera.aspect || 1.7;
        const vfov = (camera.fov * Math.PI) / 180;
        const fitH = (size.y / 2) / Math.tan(vfov / 2);
        const fitW = (size.x / 2) / (Math.tan(vfov / 2) * aspect);
        const dist = Math.max(fitH, fitW) + size.z / 2;
        // Tighter base framing than before so the ships read large and detailed;
        // the animate() loop pushes in further over the course of the battle.
        return { center, dist: Math.max(20, dist * 1.0) };
    }

    // ----------------------------------------------------------------------
    // Render loop + camera
    // ----------------------------------------------------------------------
    function animate() {
        animHandle = requestAnimationFrame(animate);
        if (!current) return;
        const now = clock.getElapsedTime();
        const dt = Math.min(clock.getDelta(), 0.05);

        // Cinematic camera: establish wide, then slowly push in toward the clash
        // for a close, detailed view; gentle orbit + bob keep it alive.
        const c = current.frameCenter;
        const dist = current.frameDist;
        const elapsed = now - current.startedAt;
        const intro = Math.min(1, elapsed / (INTRO_MS / 1000));
        const ease = intro < 1 ? (1 - Math.pow(1 - intro, 3)) : 1;
        const progress = current.durationSec ? Math.min(1, elapsed / current.durationSec) : 0;
        const zoom = 1.05 - progress * 0.26;                 // push in over the battle
        const orbit = Math.sin(now * 0.07) * 0.4;            // slow lateral orbit
        // Stay high enough that the overhead key light sculpts the hull tops.
        camera.position.x = c.x + Math.sin(orbit) * dist * 0.32;
        camera.position.y = c.y + dist * (0.34 - progress * 0.04) + (1 - ease) * dist * 0.12;
        camera.position.z = c.z + dist * zoom;
        camera.lookAt(c.x, c.y, c.z);

        // Slow planet rotation in the background.
        if (current.planet && current.planet.userData.planetMesh) {
            current.planet.userData.planetMesh.rotation.y += dt * 0.02;
        }

        // Idle bob for living ships.
        [current.attacker, current.defender].forEach(side => {
            Object.values(side.typeInstances).forEach(list => {
                list.forEach(ship => {
                    if (!ship.visible || ship.userData.dead) return;
                    ship.position.y = ship.userData.basePos.y + Math.sin(now * 1.3 + ship.userData.bobPhase) * 0.25;
                    ship.rotation.z = Math.sin(now * 0.8 + ship.userData.bobPhase) * 0.04;
                });
            });
        });

        updateTransients(now);
        renderer.render(scene, camera);
    }

    // ----------------------------------------------------------------------
    // Round scheduling
    // ----------------------------------------------------------------------
    function livingShips(side) {
        const out = [];
        Object.values(side.typeInstances).forEach(list => list.forEach(s => {
            if (s.visible && !s.userData.dead) out.push(s);
        }));
        return out;
    }
    function livingArmedShips(side) {
        return livingShips(side).filter(s => SHIP_META[s.userData.typeId].armed);
    }

    function killShipsToMatch(side, counts) {
        // Reduce visible ships of each type to match the round's count.
        SHIP_TYPES.forEach(typeId => {
            const list = side.typeInstances[typeId];
            if (!list) return;
            const target = Math.min(counts[typeId - 1], VISIBLE_CAP);
            const aliveNow = list.filter(s => !s.userData.dead).length;
            let toKill = aliveNow - target;
            for (let i = list.length - 1; i >= 0 && toKill > 0; i--) {
                const ship = list[i];
                if (ship.userData.dead) continue;
                ship.userData.dead = true;
                toKill--;
                const pos = worldPos(ship);
                const scale = SHIP_META[typeId].scale;
                // stagger explosions slightly within the round
                const delay = Math.random() * 600;
                const tmr = setTimeout(() => {
                    spawnExplosion(pos, 0.8 + scale * 0.6);
                    ship.visible = false;
                }, delay);
                timers.push(tmr);
            }
        });
    }

    function playRound(roundIndex) {
        const timeline = current.timeline;
        const block = timeline[roundIndex];
        const prev = timeline[roundIndex - 1] || timeline[0];

        if (hud.round) hud.round.textContent = `Round ${roundIndex}`;

        // Volley of fire from each side at the other (unarmed colonies never fire).
        const attackers = livingArmedShips(current.attacker);
        const defenders = livingArmedShips(current.defender);
        const allDef = livingShips(current.defender);
        const allAtt = livingShips(current.attacker);
        const volleys = Math.min(10, Math.max(4, Math.floor((attackers.length + defenders.length) / 2)));
        for (let v = 0; v < volleys; v++) {
            const tmr = setTimeout(() => {
                const fromAtt = Math.random() > 0.5;
                const src = fromAtt ? attackers : defenders;
                const dst = fromAtt ? allDef : allAtt;
                if (src.length && dst.length) {
                    const s = src[Math.floor(Math.random() * src.length)];
                    const d = dst[Math.floor(Math.random() * dst.length)];
                    fireBeam(s, d, fromAtt ? FACTION.attacker.engine : FACTION.defender.engine);
                }
            }, Math.random() * (current.perRoundMs * 0.55));
            timers.push(tmr);
        }
        if (window.MediaManager?.playSfx) window.MediaManager.playSfx('laserFire');

        // Apply this round's losses partway through, after some beams have flown.
        const killTimer = setTimeout(() => {
            killShipsToMatch(current.attacker, block.attackers);
            killShipsToMatch(current.defender, block.defenders);
            updateHud(block, current.initialTotals);
        }, current.perRoundMs * 0.45);
        timers.push(killTimer);
    }

    function scheduleRounds() {
        const timeline = current.timeline;
        const totalRounds = timeline.length - 1; // block 0 is the initial state
        let t = INTRO_MS;
        for (let r = 1; r <= totalRounds; r++) {
            const roundIndex = r;
            const tmr = setTimeout(() => playRound(roundIndex), t);
            timers.push(tmr);
            t += current.perRoundMs;
        }
        // Result banner, then close.
        const bannerTimer = setTimeout(showBanner, t + 200);
        timers.push(bannerTimer);
        const closeTimer = setTimeout(() => finishBattle(false), t + OUTRO_MS);
        timers.push(closeTimer);
    }

    function showBanner() {
        const opts = current.options || {};
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
                const last = current.timeline[current.timeline.length - 1];
                const att = sumCounts(last.attackers);
                const def = sumCounts(last.defenders) + (last.orbital || 0);
                text = (att > 0 && def === 0) ? 'Attackers Prevail'
                    : (def > 0 && att === 0) ? 'Defense Holds'
                    : (att >= def) ? 'Attackers Prevail' : 'Defense Holds';
            }
            tone = 'neutral';
        }
        if (hud.banner) {
            hud.banner.textContent = text;
            hud.banner.classList.add('show', 'b3d-banner-' + tone);
        }
        if (window.MediaManager?.playSfx) window.MediaManager.playSfx('shipDestroyed');
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

    function startBattle(entry) {
        running = true;
        ensureTheaterEl();
        if (!renderer) {
            ensureRenderer();
            theaterEl.appendChild(renderer.domElement);
        }
        // size
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h);

        setupScene();
        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        const timeline = entry.timeline;
        const initial = timeline[0];

        // Fresh material cache: last battle's cached materials were disposed.
        shipMatCache = {};
        const defender = layoutSide('defender', initial.defenders);
        const attacker = layoutSide('attacker', initial.attackers);
        scene.add(defender.group);
        scene.add(attacker.group);

        // Auto-frame the camera so both fleets fit, whatever their size.
        const frame = computeFraming(defender.group, attacker.group);

        const totalRounds = Math.max(1, timeline.length - 1);
        const budget = Math.max(4000, (entry.durationMs || (INTRO_MS + OUTRO_MS + totalRounds * 1500)));
        const perRoundMs = Math.max(650, (budget - INTRO_MS - OUTRO_MS) / totalRounds);

        current = {
            timeline,
            attacker,
            defender,
            perRoundMs,
            startedAt: clock.getElapsedTime(),
            durationSec: budget / 1000,
            frameCenter: frame.center,
            frameDist: frame.dist,
            initialTotals: {
                att: Math.max(1, sumCounts(initial.attackers)),
                def: Math.max(1, sumCounts(initial.defenders) + (initial.orbital || 0))
            },
            options: entry.options || {}
        };

        // Drop the defender's world into the background (huge, low, behind their
        // line) so it reads as "the planet they're defending."
        const planetGroup = buildPlanet((entry.options && entry.options.planetType) || 0);
        if (planetGroup) {
            const d = frame.dist;
            planetGroup.position.set(
                frame.center.x - d * 0.92, // far on the defender (−x) side
                frame.center.y - d * 0.52, // dipped below frame
                frame.center.z - d * 0.65  // pushed behind the fleets
            );
            planetGroup.scale.setScalar(d * 0.72);
            scene.add(planetGroup);
            current.planet = planetGroup;
        }

        buildHud(entry.options && entry.options.sectorLabel);
        updateHud(initial, current.initialTotals);

        // Fade the world out and freeze the map render loop.
        document.body.classList.add('battle-theater-active');
        if (window.Galaxy3D?.setPaused) window.Galaxy3D.setPaused(true);
        requestAnimationFrame(() => theaterEl.classList.add('on'));

        if (!animHandle) animate();
        scheduleRounds();
    }

    function clearTimers() {
        timers.forEach(t => clearTimeout(t));
        timers = [];
    }

    function disposeScene() {
        transients.forEach(m => scene && scene.remove(m));
        transients = [];
        if (scene) {
            scene.traverse(obj => {
                if (obj.isMesh || obj.isPoints) {
                    if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
                    if (obj.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach(m => m.dispose && m.dispose());
                    }
                }
            });
        }
        disposables.forEach(d => { if (d && d.dispose) d.dispose(); });
        disposables = [];
        shipMatCache = {};
        scene = null;
    }

    function finishBattle(skipped) {
        if (!current) return;
        clearTimers();
        const opts = current.options || {};

        // Fade the theater out, then tear down.
        if (theaterEl) theaterEl.classList.remove('on');
        document.body.classList.remove('battle-theater-active');

        const sectorId = opts.sectorId;
        const onComplete = opts.onComplete;

        const teardown = () => {
            if (hud && hud.root && hud.root.parentNode) hud.root.parentNode.removeChild(hud.root);
            hud = null;
            disposeScene();
            current = null;
            running = false;

            if (window.Galaxy3D?.setPaused) window.Galaxy3D.setPaused(false);
            if (sectorId && window.GalaxyMap?.clearBattleSector) window.GalaxyMap.clearBattleSector(sectorId);
            if (window.GameScreen?.restoreTitle) window.GameScreen.restoreTitle();
            if (typeof onComplete === 'function') onComplete();

            // Play the next queued battle, if any.
            if (battleQueue.length > 0) {
                const next = battleQueue.shift();
                setTimeout(() => startBattle(next), 200);
            }
        };

        // Allow the CSS fade (0.5s) to play before removing the DOM/scene.
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
        disposeScene();
        current = null;
        running = false;
        if (window.Galaxy3D?.setPaused) window.Galaxy3D.setPaused(false);
    }

    function onResize() {
        if (!renderer || !camera || !theaterEl) return;
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', onResize);

    // NOTE: we deliberately do NOT tear the battle down on tab-hide. The server
    // keeps the whole game frozen for the full playback window, so destroying the
    // theater when a player briefly alt-tabs would desync them (frozen clock, no
    // battle). The scheduled timers finish the battle on their own regardless.

    // ----------------------------------------------------------------------
    // Styles
    // ----------------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('battle3d-styles')) return;
        const style = document.createElement('style');
        style.id = 'battle3d-styles';
        style.textContent = `
        #battleTheater {
            position: fixed; inset: 0; z-index: 5000;
            background: radial-gradient(ellipse at 50% 40%, #0a1022 0%, #02030a 70%);
            opacity: 0; pointer-events: none; transition: opacity 0.5s ease;
        }
        #battleTheater.on { opacity: 1; pointer-events: auto; }
        #battleTheater canvas { display:block; width:100%!important; height:100%!important; }

        /* Fade ALL game chrome while the theater owns the screen. */
        body.battle-theater-active > *:not(#battleTheater):not(script):not(style) {
            opacity: 0 !important; pointer-events: none !important;
            transition: opacity 0.5s ease;
        }

        .b3d-hud { position:absolute; inset:0; z-index:2; pointer-events:none; font-family:'Segoe UI',system-ui,sans-serif; }
        .b3d-title {
            position:absolute; top:3%; left:50%; transform:translateX(-50%);
            color:#ffd166; font-weight:800; letter-spacing:3px; font-size:22px;
            text-transform:uppercase; text-shadow:0 2px 14px rgba(0,0,0,0.85);
        }
        .b3d-round {
            position:absolute; top:9%; left:50%; transform:translateX(-50%);
            color:#cfd7ff; font-weight:700; letter-spacing:2px; font-size:14px;
            text-transform:uppercase; text-shadow:0 1px 8px rgba(0,0,0,0.85);
        }
        .b3d-side {
            position:absolute; top:14%; min-width:150px; padding:10px 14px;
            background:rgba(8,12,24,0.72); border:1px solid rgba(255,255,255,0.12);
            border-radius:10px; color:#e8ecff;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.5);
        }
        .b3d-def { left:3%; text-align:left; }
        .b3d-att { right:3%; text-align:right; }
        .b3d-side-name { font-weight:800; letter-spacing:1.5px; text-transform:uppercase; font-size:13px; }
        .b3d-side-count { font-size:20px; font-weight:800; margin-top:2px; }
        .b3d-bar { height:6px; margin-top:6px; border-radius:3px; background:rgba(255,255,255,0.14); overflow:hidden; }
        .b3d-bar-fill { height:100%; width:100%; transition:width 0.6s ease; }
        .b3d-skip {
            position:absolute; top:4%; right:3%; z-index:4; pointer-events:auto;
            background:rgba(20,26,44,0.9); color:#cfd7ff; border:1px solid rgba(255,255,255,0.18);
            border-radius:8px; padding:7px 14px; font-weight:800; letter-spacing:1px;
            font-size:12px; cursor:pointer; text-transform:uppercase;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.4);
        }
        .b3d-skip:hover { background:rgba(40,50,80,0.95); color:#fff; }
        .b3d-banner {
            position:absolute; top:44%; left:50%; transform:translateX(-50%) scale(0.6);
            color:#fff; font-weight:900; letter-spacing:6px; font-size:48px; text-transform:uppercase;
            text-shadow:0 0 28px rgba(255,150,70,0.9); opacity:0;
            transition:transform 0.45s cubic-bezier(.2,1.3,.4,1), opacity 0.45s ease;
        }
        .b3d-banner.show { opacity:1; transform:translateX(-50%) scale(1); }
        .b3d-banner-win { color:#ffe9a6; text-shadow:0 0 30px rgba(120,245,170,0.9), 0 0 14px rgba(255,210,90,0.8); }
        .b3d-banner-loss { color:#ffb4b4; text-shadow:0 0 30px rgba(255,70,70,0.9); }
        .b3d-banner-neutral { color:#ffffff; text-shadow:0 0 28px rgba(150,180,255,0.85); }

        @media (max-width: 720px) {
            .b3d-title { font-size:16px; }
            .b3d-banner { font-size:30px; letter-spacing:3px; }
            .b3d-side { min-width:96px; padding:7px 9px; }
            .b3d-side-count { font-size:15px; }
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

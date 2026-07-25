/**
 * galaxy3d.js - Three.js main galaxy map view.
 *
 * Renders the full galaxy as an interactive 3D hex starfield: explored sectors
 * show their contents (planets, black holes, asteroid fields), unexplored space
 * stays under fog. Clicking a sector selects it through the same flow as the
 * minimap, so all existing UI panels keep working.
 *
 * Exposes window.Galaxy3D with:
 *   initialize(width, height)
 *   updateSector(sectorId, statusNum, { fleetSize, indicator, type })
 *   setSectorDetail(sectorData)          // rich data from sector:: messages
 *   setSelected(sectorId) / focusSector(sectorId)
 *   highlightSector(sectorId)            // battle pulse
 *   clearBattleSector(sectorId)
 *   resize()
 *
 * ui.js queues calls in window.__g3dQueue until this module loads.
 */

import * as THREE from './vendor/three.module.min.js';
// The planet generator is shared with the battle theater so the same world looks
// the same in both views. See planet-texture.js for why the shipped jpgs are unusable.
import { PLANET_STYLES, getPlanetTexture } from './planet-texture.js?v=20260725a';

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

    const STATUS_COLORS = {
        [STATUS.UNKNOWN]: 0x2a3040,
        [STATUS.OWNED]: 0x37b24d,
        [STATUS.ENEMY]: 0xe03131,
        [STATUS.HAZARD]: 0xd9822b,
        [STATUS.BLACKHOLE]: 0x15151c,
        [STATUS.COLONIZED]: 0x2bb5a0,
        [STATUS.HOMEWORLD]: 0xffc04d,
        [STATUS.WARPGATE]: 0x9b59d0,
        [STATUS.ARTIFACT]: 0x3fc6ff,
        [STATUS.FLEET]: 0x3fc1c9
    };

    const HEX_SIZE = 1;
    const HORIZ = HEX_SIZE * 1.5;
    const VERT = HEX_SIZE * Math.sqrt(3);

    const state = {
        ready: false,
        width: 14,
        height: 8,
        container: null,
        renderer: null,
        scene: null,
        camera: null,
        raycaster: null,
        pointer: new THREE.Vector2(),
        sectors: new Map(),        // id -> { group, tile, content, badge, status, type, fleetSize }
        textures: new Map(),
        sharedGeo: {},
        selectionRing: null,
        selectedSector: null,
        pendingFocusSector: null,
        battlePulses: new Map(),
        fleetMoves: [],
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

    /**
     * Fleet-strength pill: a drawn ship chevron plus the count. The glyph is painted
     * rather than typed so it cannot fall back to a tofu box on a machine without the
     * dingbat font.
     */
    function makeBadgeTexture(count, hostile) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const accent = hostile ? 'rgba(255,110,110,0.95)' : 'rgba(120,200,255,0.95)';

        ctx.fillStyle = hostile ? 'rgba(38,12,16,0.88)' : 'rgba(10,18,34,0.88)';
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(4, 8, 120, 48, 16);
        ctx.fill();
        ctx.stroke();

        // Ship chevron.
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(30, 20);
        ctx.lineTo(44, 32);
        ctx.lineTo(30, 44);
        ctx.lineTo(35, 32);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = hostile ? '#ffd9d9' : '#e4efff';
        ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(count), 56, 33);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    // ------------------------------------------------------------------
    // Procedural worlds
    //
    // The shipped planet JPEGs are photographs on black backgrounds. Wrapped onto a
    // sphere as an equirectangular map, the black surround becomes most of the globe —
    // which is why "temperate" worlds rendered as unreadable dark blobs next to empty
    // space. These generators paint proper seamless equirectangular maps instead, and
    // give each sector type a colour identity a player can read at a glance.
    // ------------------------------------------------------------------

    function rgba(c, alpha) {
        return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
    }

    /** Soft limb glow: clear at the centre so the planet shows through, bright at the rim. */
    function getAtmosphereTexture(colour) {
        const key = `atmo:${colour.join(',')}`;
        if (state.textures.has(key)) return state.textures.get(key);
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.16, size / 2, size / 2, size / 2);
        grad.addColorStop(0, rgba(colour, 0));
        grad.addColorStop(0.62, rgba(colour, 0.02));
        grad.addColorStop(0.78, rgba(colour, 0.42));
        grad.addColorStop(0.87, rgba(colour, 0.20));
        grad.addColorStop(1, rgba(colour, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        state.textures.set(key, tex);
        return tex;
    }


    function makeSwirlTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const cx = 128;
        ctx.translate(cx, cx);
        for (let arm = 0; arm < 4; arm++) {
            ctx.rotate((Math.PI * 2) / 4);
            for (let i = 0; i < 60; i++) {
                const t = i / 60;
                const angle = t * Math.PI * 2.2;
                const radius = 20 + t * 100;
                const px = Math.cos(angle) * radius;
                const py = Math.sin(angle) * radius;
                // A black hole annihilates any fleet that enters it, so it has to be the
                // most unmistakable thing on the board. The old accretion disc was a
                // faint dotted ring — a black circle on a dark tile, easy to read as
                // empty space at map zoom. Hotter, denser, and brighter towards the core.
                ctx.fillStyle = `rgba(${205 + t * 50}, ${140 + t * 80}, 255, ${0.85 * (1 - t * 0.75)})`;
                ctx.beginPath();
                ctx.arc(px, py, 7 * (1 - t) + 1.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function makeFogTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 192;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(96, 96, 14, 96, 96, 96);
        // Unexplored space still has to be SEEN. These stops were dark enough that,
        // multiplied by a near-black tile colour over a near-black starfield, ~100 of
        // the 112 tiles rendered as literally nothing — the main map showed the player
        // no galaxy shape at all and pushed them to read the tiny minimap instead.
        gradient.addColorStop(0, 'rgba(150, 170, 220, 0.62)');
        gradient.addColorStop(0.55, 'rgba(96, 116, 168, 0.5)');
        gradient.addColorStop(1, 'rgba(44, 58, 96, 0.3)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 192, 192);

        for (let i = 0; i < 240; i++) {
            const alpha = 0.06 + Math.random() * 0.2;
            const radius = 1 + Math.random() * 8;
            ctx.fillStyle = `rgba(190, 210, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(Math.random() * 192, Math.random() * 192, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function buildStarfield() {
        const starCount = 2400;
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const spreadX = state.width * HORIZ * 4;
        const spreadZ = state.height * VERT * 4;
        for (let i = 0; i < starCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * spreadX + state.center.x;
            positions[i * 3 + 1] = -14 - Math.random() * 30;
            positions[i * 3 + 2] = (Math.random() - 0.5) * spreadZ + state.center.z;
            const tint = 0.55 + Math.random() * 0.45;
            const blue = Math.random() > 0.7;
            colors[i * 3] = tint * (blue ? 0.75 : 1);
            colors[i * 3 + 1] = tint * 0.9;
            colors[i * 3 + 2] = tint;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, sizeAttenuation: true, depthWrite: false });
        const stars = new THREE.Points(geo, mat);
        stars.renderOrder = -10;
        state.scene.add(stars);
    }

    function disposeContent(entry) {
        if (!entry.content) return;
        entry.group.remove(entry.content);
        entry.content.traverse(obj => {
            if (obj.geometry && !Object.values(state.sharedGeo).includes(obj.geometry)) obj.geometry.dispose();
            if (obj.material && !obj.material.__shared) {
                if (obj.material.map && !obj.material.map.__shared) obj.material.map.dispose?.();
                obj.material.dispose();
            }
        });
        entry.content = null;
    }

    function buildPlanet(entry) {
        const group = new THREE.Group();
        const type = Math.max(5, Math.min(10, Number(entry.type) || 8));
        const style = PLANET_STYLES[type] || PLANET_STYLES[7];
        // Richer worlds are visibly bigger, so value reads before you click.
        const radius = type === 10 ? 0.52 : 0.3 + (type - 5) * 0.05;
        const sphere = new THREE.Mesh(
            state.sharedGeo.planet,
            new THREE.MeshStandardMaterial({
                map: getPlanetTexture(type, entry.id),
                roughness: 0.82,
                metalness: 0.04
            })
        );
        sphere.scale.setScalar(radius);
        sphere.position.y = 0.55;
        sphere.userData.spin = 0.1 + ((Number(entry.id) || 0) % 7) * 0.02;
        group.add(sphere);

        // Atmospheric rim. A back-face shell alone reads as a flat grey bubble because
        // every point of the far hemisphere is lit the same; a radial sprite that is
        // transparent in the middle and bright at the limb gives an actual halo.
        if (style.atmo) {
            const atmosphere = new THREE.Sprite(new THREE.SpriteMaterial({
                map: getAtmosphereTexture(style.atmo),
                transparent: true,
                opacity: 0.55,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            }));
            const halo = radius * 3.1;
            atmosphere.scale.set(halo, halo, 1);
            atmosphere.position.y = 0.55;
            group.add(atmosphere);
        }

        if (entry.status === STATUS.HOMEWORLD) {
            // A slim orbital band, not a wide disc: the tile is already gold and the
            // selection ring sits on top of it, so this only needs to whisper.
            const halo = new THREE.Mesh(
                state.sharedGeo.ring,
                new THREE.MeshBasicMaterial({ color: 0xffc04d, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false })
            );
            halo.rotation.x = -Math.PI / 2.6;
            halo.position.y = 0.55;
            halo.scale.setScalar(radius * 1.7);
            group.add(halo);
        }
        return group;
    }

    function buildBlackHole() {
        const group = new THREE.Group();
        const core = new THREE.Mesh(
            state.sharedGeo.planet,
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );
        core.scale.setScalar(0.3);
        core.position.y = 0.55;
        group.add(core);

        const disc = new THREE.Mesh(
            state.sharedGeo.disc,
            new THREE.MeshBasicMaterial({
                map: state.swirlTexture,
                transparent: true,
                opacity: 0.95,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        disc.rotation.x = -Math.PI / 2.25;
        disc.position.y = 0.55;
        disc.scale.setScalar(1.25);
        disc.userData.spin = -1.4;
        group.add(disc);
        return group;
    }

    function buildAsteroids() {
        const group = new THREE.Group();
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a7b6a, roughness: 1 });
        rockMat.__shared = true;
        const ring = new THREE.Group();
        for (let i = 0; i < 11; i++) {
            const rock = new THREE.Mesh(state.sharedGeo.rock, rockMat);
            const angle = (i / 11) * Math.PI * 2 + Math.random() * 0.4;
            const dist = 0.45 + Math.random() * 0.25;
            rock.position.set(Math.cos(angle) * dist, 0.45 + (Math.random() - 0.5) * 0.18, Math.sin(angle) * dist);
            rock.scale.setScalar(0.05 + Math.random() * 0.07);
            rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
            ring.add(rock);
        }
        ring.userData.spin = 0.25;
        group.add(ring);
        return group;
    }

    function buildStar(colorHex, rgbColour) {
        const group = new THREE.Group();
        const star = new THREE.Mesh(
            state.sharedGeo.planet,
            new THREE.MeshBasicMaterial({ color: colorHex })
        );
        star.scale.setScalar(0.34);
        star.position.y = 0.55;
        star.userData.pulse = true;
        group.add(star);
        // A star should bloom, not sit inside a flat torus. Same limb-glow sprite the
        // habitable worlds use, tuned brighter and wider.
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: getStarGlowTexture(rgbColour),
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        glow.scale.set(1.7, 1.7, 1);
        glow.position.y = 0.55;
        group.add(glow);
        return group;
    }

    /** Bright core falling off to nothing — a corona rather than a ring. */
    function getStarGlowTexture(colour) {
        const key = `star:${colour.join(',')}`;
        if (state.textures.has(key)) return state.textures.get(key);
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, rgba(colour, 0.55));
        grad.addColorStop(0.28, rgba(colour, 0.34));
        grad.addColorStop(0.58, rgba(colour, 0.12));
        grad.addColorStop(1, rgba(colour, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        state.textures.set(key, tex);
        return tex;
    }

    function rebuildContent(entry) {
        disposeContent(entry);
        const known = entry.status !== STATUS.UNKNOWN || entry.explored;
        if (!known) return;

        let content = null;
        if (entry.status === STATUS.BLACKHOLE || entry.type === 2) {
            content = buildBlackHole();
        } else if (entry.type === 1) {
            content = buildAsteroids();
        } else if (entry.type === 3) {
            content = buildStar(0xff8c42, [255, 140, 66]);
        } else if (entry.type === 4) {
            content = buildStar(0xd8802f, [216, 128, 47]);
        } else if (entry.type >= 5 && entry.type <= 10) {
            content = buildPlanet(entry);
        } else if (entry.status === STATUS.HOMEWORLD || entry.status === STATUS.OWNED ||
                   entry.status === STATUS.ENEMY || entry.status === STATUS.COLONIZED) {
            // Known important sector but type unknown yet: show a generic planet.
            content = buildPlanet(entry);
        } else if (entry.status === STATUS.HAZARD) {
            content = buildAsteroids();
        }

        if (content) {
            entry.group.add(content);
            entry.content = content;
        }
    }

    function applyStatusVisual(entry) {
        const explored = entry.explored || entry.status !== STATUS.UNKNOWN;
        const color = STATUS_COLORS[entry.status] ?? STATUS_COLORS[STATUS.UNKNOWN];

        if (!explored) {
            // Fog of war: visible static/fog surface, no contents.
            entry.tile.material = state.fogMaterial;
            entry.tile.visible = true;
            return;
        }

        if (!entry.tileMaterial) {
            entry.tileMaterial = new THREE.MeshStandardMaterial({
                // Explored space must never read as dimmer than fog. Brightening the
                // fog earlier inverted that: a known-but-empty sector at 0x10131f sat
                // darker than the unexplored tiles around it, so the map implied you
                // knew less about the places you had actually been.
                color: 0x232a45,
                roughness: 0.85,
                metalness: 0.15,
                transparent: true,
                opacity: 0.92
            });
        }
        entry.tileMaterial.emissive = new THREE.Color(color);
        // Explored-but-unclaimed tiles carried almost no emissive lift, which is what
        // let them fall behind the fog. They stay quieter than owned space, but present.
        entry.tileMaterial.emissiveIntensity = entry.status === STATUS.UNKNOWN ? 0.3 : 0.4;
        entry.tileMaterial.opacity = entry.live ? 0.92 : 0.5;
        entry.tile.material = entry.tileMaterial;
        entry.tile.visible = true;
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
                depthWrite: false
            }));
            // Upper-right of this tile's own footprint. The old badge floated a full hex
            // above the planet and printed itself across the neighbour to the north.
            sprite.scale.set(0.56, 0.28, 1);
            sprite.position.set(0.46, 0.52, -0.22);
            sprite.renderOrder = 6;
            sprite.material.depthTest = false;
            entry.group.add(sprite);
            entry.badge = sprite;
        }
    }

    // Small decimal sector number (plus marker letters) so map tiles match the
    // sector numbers used in messages and the sector panel.
    function updateIdLabel(entry) {
        if (entry.idLabel) {
            entry.group.remove(entry.idLabel);
            entry.idLabel.material.map.dispose();
            entry.idLabel.material.dispose();
            entry.idLabel = null;
        }
        if (!entry.explored) return;
        const text = entry.indicator ? `${entry.id} ${entry.indicator}` : String(entry.id);
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = entry.live ? 'rgba(225,233,255,0.95)' : 'rgba(160,170,200,0.6)';
        ctx.font = 'bold 26px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;
        ctx.fillText(text, 64, 24);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            // Sector numbers must stay readable. Without this, asteroid rocks and the
            // planet itself bury the label for exactly the tiles you most want to name.
            depthTest: false
        }));
        sprite.renderOrder = 5;
        sprite.scale.set(0.95, 0.36, 1);
        sprite.position.set(0, 0.22, 0.55);
        entry.group.add(sprite);
        entry.idLabel = sprite;
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

        const total = w * h;
        state.center.set(((w - 1) * HORIZ) / 2, 0, ((h - 1) * VERT + VERT / 2) / 2);

        for (let id = 1; id <= total; id++) {
            const group = new THREE.Group();
            group.position.copy(sectorPosition(id));
            const tile = new THREE.Mesh(state.sharedGeo.hex, state.fogMaterial);
            tile.rotation.y = Math.PI / 6; // flat-top orientation
            tile.userData.sectorId = id;
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
                type: null,
                flags: 0,
                indicator: '',
                fleetSize: 0,
                tileMaterial: null
            });
        }

        if (!state.starsBuilt) {
            buildStarfield();
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
        const labelKey = `${entry.explored}|${entry.live}|${indicator}`;
        if (entry.labelKey !== labelKey) {
            entry.labelKey = labelKey;
            updateIdLabel(entry);
        }

        applyStatusVisual(entry);
        if (changedStatus || changedType || !entry.content) {
            rebuildContent(entry);
        }
    }

    /**
     * Animate a fleet moving between two sectors: a glowing tracer that arcs
     * from the source tile to the destination, teal for your fleets and red
     * for enemy fleets seen inside your sensor range.
     */
    function animateFleetMove(fromId, toId, opts = {}) {
        const from = state.sectors.get(Number(fromId));
        const to = state.sectors.get(Number(toId));
        if (!from || !to || !state.ready) return;
        const color = opts.mine ? 0x4dd8e0 : 0xff5f5f;
        const group = new THREE.Group();
        const dot = new THREE.Mesh(
            state.sharedGeo.planet,
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
        );
        dot.scale.setScalar(0.14);
        group.add(dot);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: state.swirlTexture,
            color,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        }));
        glow.scale.set(0.7, 0.7, 1);
        group.add(glow);
        group.position.copy(from.group.position).setY(0.6);
        state.scene.add(group);
        state.fleetMoves.push({
            group,
            toId: Number(toId),
            from: from.group.position.clone().setY(0.6),
            to: to.group.position.clone().setY(0.6),
            time: 0,
            duration: opts.warp ? 0.7 : 1.4
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
        state.selectionRing.visible = true;
        state.selectionRing.position.set(entry.group.position.x, 0.06, entry.group.position.z);
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
        state.renderer.setSize(w, h, false);
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
        // A padded bounding box: one hex of breathing room on every side.
        const pad = HEX_SIZE * (Number(opts.padHexes) || 2);
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
        // Never zoom out past the whole-galaxy framing, and keep a sane close limit.
        state.zoom = Math.min(1, Math.max(0.3, needed / full));
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
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
        state.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500);
        state.raycaster = new THREE.Raycaster();

        state.scene.add(new THREE.AmbientLight(0xbdc7ff, 0.6));
        const key = new THREE.DirectionalLight(0xfff2db, 1.15);
        key.position.set(6, 12, 4);
        state.scene.add(key);
        const rim = new THREE.DirectionalLight(0x4c7cff, 0.35);
        rim.position.set(-8, 6, -6);
        state.scene.add(rim);

        state.sharedGeo.hex = new THREE.CylinderGeometry(HEX_SIZE * 0.94, HEX_SIZE * 0.94, 0.08, 6);
        state.sharedGeo.planet = new THREE.SphereGeometry(1, 28, 20);
        state.sharedGeo.ring = new THREE.RingGeometry(0.62, 0.78, 40);
        state.sharedGeo.disc = new THREE.CircleGeometry(0.85, 40);
        state.sharedGeo.rock = new THREE.DodecahedronGeometry(1, 0);
        state.swirlTexture = makeSwirlTexture();
        state.fogTexture = makeFogTexture();

        state.fogMaterial = new THREE.MeshBasicMaterial({
            // A dim slate blue rather than near-black: the tile colour multiplies the
            // fog texture, so 0x0c1020 drove the result to zero regardless of alpha.
            color: 0x39456b,
            map: state.fogTexture,
            transparent: true,
            opacity: 0.62,
            depthWrite: false
        });
        state.fogMaterial.__shared = true;

        // Selection ring
        const ringGeo = new THREE.RingGeometry(HEX_SIZE * 0.82, HEX_SIZE * 0.97, 6);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
        state.selectionRing = new THREE.Mesh(ringGeo, ringMat);
        state.selectionRing.rotation.x = -Math.PI / 2;
        state.selectionRing.rotation.z = Math.PI / 6;
        state.selectionRing.visible = false;
        state.scene.add(state.selectionRing);

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
        if (state.hovered && state.hovered !== sectorId) {
            const prev = state.sectors.get(state.hovered);
            if (prev && prev.tileMaterial) prev.tileMaterial.emissiveIntensity = prev.status === STATUS.UNKNOWN ? 0.12 : 0.4;
        }
        state.hovered = sectorId;
        if (sectorId) {
            const entry = state.sectors.get(sectorId);
            if (entry && entry.tileMaterial && entry.explored) {
                entry.tileMaterial.emissiveIntensity = 0.75;
            }
            state.renderer.domElement.style.cursor = 'pointer';
        } else {
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

        // Spin planets / discs / asteroid rings. Under reduced motion these hold still at
        // their normal size rather than spinning and breathing.
        state.sectors.forEach(entry => {
            if (entry.content) {
                entry.content.children.forEach(child => {
                    if (child.userData.spin && !reduceMotion) child.rotation.y += child.userData.spin * dt;
                    if (child.userData.pulse) {
                        const s = reduceMotion ? 1 : 1 + Math.sin(t * 2.4) * 0.08;
                        child.scale.setScalar(0.34 * s);
                    }
                });
            }
        });

        // Selection ring shimmer. It still marks the selected sector when motion is
        // reduced — it just sits at a steady opacity instead of flashing.
        if (state.selectionRing && state.selectionRing.visible) {
            state.selectionRing.material.opacity = reduceMotion ? 0.8 : 0.65 + Math.sin(t * 4) * 0.3;
        }

        if (state.fogTexture && !reduceMotion) {
            state.fogTexture.offset.x = (t * 0.015) % 1;
            state.fogTexture.offset.y = (t * 0.009) % 1;
        }

        // Fleet movement tracers
        if (state.fleetMoves.length) {
            state.fleetMoves = state.fleetMoves.filter(move => {
                move.time += dt;
                const progress = Math.min(1, move.time / move.duration);
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                move.group.position.lerpVectors(move.from, move.to, eased);
                move.group.position.y = 0.6 + Math.sin(progress * Math.PI) * 0.9;
                if (progress >= 1) {
                    state.scene.remove(move.group);
                    move.group.children.forEach(child => {
                        if (child.material && !child.material.__shared) child.material.dispose();
                    });
                    // Brief settle on the destination tile so the arrival reads even
                    // if you were looking elsewhere while the tracer flew.
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

        state.renderer.render(state.scene, state.camera);
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

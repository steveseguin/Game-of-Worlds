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

(function () {
    const STATUS = {
        UNKNOWN: 0,
        OWNED: 1,
        ENEMY: 2,
        HAZARD: 3,
        BLACKHOLE: 4,
        COLONIZED: 5,
        HOMEWORLD: 6,
        WARPGATE: 7,
        ARTIFACT: 8
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
        [STATUS.ARTIFACT]: 0x3fc6ff
    };

    // Sector type → planet texture (public/images/planetN.jpg).
    const TYPE_TEXTURES = {
        5: 'images/planet1.jpg',
        6: 'images/planet2.jpg',
        7: 'images/planet4.jpg',
        8: 'images/planet6.jpg',
        9: 'images/planet8.jpg',
        10: 'images/planet10.jpg'
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
        battlePulses: new Map(),
        center: new THREE.Vector3(),
        camTarget: new THREE.Vector3(),
        camOffset: new THREE.Vector3(),
        drag: null,
        clock: new THREE.Clock(),
        animHandle: null,
        textureLoader: new THREE.TextureLoader()
    };

    function sectorPosition(id) {
        const index = Number(id) - 1;
        const gx = index % state.width;
        const gy = Math.floor(index / state.width);
        const x = gx * HORIZ;
        const z = gy * VERT + (gx % 2 === 1 ? VERT / 2 : 0);
        return new THREE.Vector3(x, 0, z);
    }

    function getTexture(path) {
        if (!state.textures.has(path)) {
            const tex = state.textureLoader.load(path);
            tex.colorSpace = THREE.SRGBColorSpace;
            state.textures.set(path, tex);
        }
        return state.textures.get(path);
    }

    function makeBadgeTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(10,14,28,0.85)';
        ctx.strokeStyle = 'rgba(120,180,255,0.9)';
        ctx.lineWidth = 4;
        const r = 18;
        ctx.beginPath();
        ctx.roundRect(4, 4, 120, 56, r);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#dce6ff';
        ctx.font = 'bold 30px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 34);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function makeSwirlTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const cx = 128;
        ctx.translate(cx, cx);
        for (let arm = 0; arm < 3; arm++) {
            ctx.rotate((Math.PI * 2) / 3);
            for (let i = 0; i < 60; i++) {
                const t = i / 60;
                const angle = t * Math.PI * 2.2;
                const radius = 20 + t * 100;
                const px = Math.cos(angle) * radius;
                const py = Math.sin(angle) * radius;
                ctx.fillStyle = `rgba(${150 + t * 105}, ${120 + t * 60}, 255, ${0.5 * (1 - t)})`;
                ctx.beginPath();
                ctx.arc(px, py, 5 * (1 - t) + 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
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
        const texPath = TYPE_TEXTURES[entry.type] || TYPE_TEXTURES[8];
        const radius = entry.type === 10 ? 0.52 : 0.3 + (Math.max(5, Math.min(10, entry.type || 8)) - 5) * 0.05;
        const sphere = new THREE.Mesh(
            state.sharedGeo.planet,
            new THREE.MeshStandardMaterial({ map: getTexture(texPath), roughness: 0.9, metalness: 0.05 })
        );
        sphere.scale.setScalar(radius);
        sphere.position.y = 0.55;
        sphere.userData.spin = 0.12 + Math.random() * 0.12;
        group.add(sphere);

        if (entry.status === STATUS.HOMEWORLD) {
            const halo = new THREE.Mesh(
                state.sharedGeo.ring,
                new THREE.MeshBasicMaterial({ color: 0xffc04d, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
            );
            halo.rotation.x = -Math.PI / 2;
            halo.position.y = 0.55;
            halo.scale.setScalar(radius * 2.1);
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

    function buildStar(color) {
        const group = new THREE.Group();
        const star = new THREE.Mesh(
            state.sharedGeo.planet,
            new THREE.MeshBasicMaterial({ color })
        );
        star.scale.setScalar(0.34);
        star.position.y = 0.55;
        star.userData.pulse = true;
        group.add(star);
        const glow = new THREE.Mesh(
            state.sharedGeo.ring,
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.55;
        glow.scale.setScalar(0.9);
        group.add(glow);
        return group;
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
            content = buildStar(0xff8c42);
        } else if (entry.type === 4) {
            content = buildStar(0xb5651d);
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
            // Fog of war: barely-there outline, no contents.
            entry.tile.material = state.fogMaterial;
            entry.tile.visible = true;
            return;
        }

        if (!entry.tileMaterial) {
            entry.tileMaterial = new THREE.MeshStandardMaterial({
                color: 0x10131f,
                roughness: 0.85,
                metalness: 0.15,
                transparent: true,
                opacity: 0.92
            });
        }
        entry.tileMaterial.emissive = new THREE.Color(color);
        entry.tileMaterial.emissiveIntensity = entry.status === STATUS.UNKNOWN ? 0.12 : 0.4;
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
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: makeBadgeTexture(`⚔ ${entry.fleetSize}`),
                transparent: true,
                depthWrite: false
            }));
            sprite.scale.set(0.9, 0.45, 1);
            sprite.position.set(0, 1.35, 0);
            entry.group.add(sprite);
            entry.badge = sprite;
        }
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
                status: STATUS.UNKNOWN,
                explored: false,
                type: null,
                fleetSize: 0,
                tileMaterial: null
            });
        }

        if (!state.starsBuilt) {
            buildStarfield();
            state.starsBuilt = true;
        }

        state.camTarget.copy(state.center);
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
        if (status !== STATUS.UNKNOWN) entry.explored = true;

        let changedType = false;
        if (details.type !== undefined && details.type !== null && Number.isFinite(Number(details.type))) {
            const t = Number(details.type);
            if (entry.type !== t) {
                entry.type = t;
                changedType = true;
            }
        }

        const fleet = Number(details.fleetSize);
        if (Number.isFinite(fleet) && fleet !== entry.fleetSize) {
            entry.fleetSize = fleet;
            updateBadge(entry);
        }

        applyStatusVisual(entry);
        if (changedStatus || changedType || !entry.content) {
            rebuildContent(entry);
        }
    }

    function setSectorDetail(sectorData) {
        if (!sectorData || sectorData.id === undefined) return;
        const entry = state.sectors.get(Number(sectorData.id));
        if (!entry) return;
        entry.explored = true;
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
        const entry = state.sectors.get(Number(sectorId));
        if (!entry) return;
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

        state.fogMaterial = new THREE.MeshBasicMaterial({
            color: 0x0c1020,
            transparent: true,
            opacity: 0.28
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
        const dt = Math.min(state.clock.getDelta(), 0.05);
        const t = state.clock.elapsedTime;

        // Smooth camera
        const offset = state.camOffset.clone().multiplyScalar(state.zoom || 1);
        const desired = state.camTarget.clone().add(offset);
        state.camera.position.lerp(desired, 1 - Math.pow(0.0001, dt));
        state.camera.lookAt(state.camTarget);

        // Spin planets / discs / asteroid rings
        state.sectors.forEach(entry => {
            if (entry.content) {
                entry.content.children.forEach(child => {
                    if (child.userData.spin) child.rotation.y += child.userData.spin * dt;
                    if (child.userData.pulse) {
                        const s = 1 + Math.sin(t * 2.4) * 0.08;
                        child.scale.setScalar(0.34 * s);
                    }
                });
            }
        });

        // Selection ring shimmer
        if (state.selectionRing && state.selectionRing.visible) {
            state.selectionRing.material.opacity = 0.65 + Math.sin(t * 4) * 0.3;
        }

        // Battle pulses
        state.battlePulses.forEach((pulse, id) => {
            pulse.time += dt;
            const entry = state.sectors.get(id);
            if (!entry) return;
            const s = 1 + Math.sin(pulse.time * 9) * 0.12;
            entry.group.scale.setScalar(s);
            if (pulse.time > 6) {
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
        highlightSector,
        clearBattleSector,
        resize,
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

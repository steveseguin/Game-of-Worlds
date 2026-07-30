// media.js - handles game audio (SFX + music)
(function() {
    const sounds = {
        click: 'sounds/click.mp3',
        hover: 'sounds/hover.mp3',
        notification: 'sounds/notification.mp3',
        explosion: 'sounds/explosion.mp3',
        shipDestroyed: 'sounds/ship-destroyed.mp3',
        warp: 'sounds/warp-jump.mp3',
        // These shipped as files and were referenced by callers, but were never
        // registered here — so every call to them was a silent no-op.
        error: 'sounds/error.mp3',
        success: 'sounds/success.mp3',
        buildComplete: 'sounds/build-complete.mp3',
        researchComplete: 'sounds/research-complete.mp3',
        shipLaunch: 'sounds/ship-launch.mp3',
        laserFire: 'sounds/laser-fire.mp3',
        missileLaunch: 'sounds/missile-launch.mp3',
        shieldHit: 'sounds/shield-hit.mp3',
        battleAmbient: 'sounds/battle-ambient.mp3',
        spaceAmbient: 'sounds/space-ambient.mp3',
        victory: 'music/victory-theme.mp3',
        defeat: 'music/defeat-theme.mp3'
    };

    const audio = {};
    let sfxEnabled = true;
    let musicEnabled = true;
    let ambientTrack = null;
    let lastHover = 0;

    function init() {
        try {
            sfxEnabled = localStorage.getItem('gow-sfx') !== 'off';
            musicEnabled = localStorage.getItem('gow-music') !== 'off';
            if (localStorage.getItem('gow-muted') === 'on') {
                sfxEnabled = false;
                musicEnabled = false;
            }
        } catch (_) {}

        // Only the short effects are worth fetching up front. The two end-game
        // themes and the two ambient beds are 188 KB and 126 KB each — 628 KB of
        // audio that was being pulled down before the player had done anything,
        // on a page that already ships 3.4 MB. Victory and defeat cannot play
        // until a match ENDS, and the ambients start on a scene change, so all
        // four load on demand instead; the effects that fire on a click stay
        // eager because a late click sound is a felt defect.
        const DEFERRED = new Set(['victory', 'defeat', 'battleAmbient', 'spaceAmbient']);

        Object.entries(sounds).forEach(([key, src]) => {
            const el = new Audio(src);
            el.preload = DEFERRED.has(key) ? 'none' : 'auto';
            if (key === 'battleAmbient' || key === 'spaceAmbient') {
                el.loop = true;
                el.volume = 0.35;
            } else if (key === 'victory' || key === 'defeat') {
                el.volume = 0.8;
            } else if (key === 'error' || key === 'success' || key === 'buildComplete'
                       || key === 'researchComplete' || key === 'shipLaunch') {
                // Order acknowledgements fire on almost every click; keep them under
                // the combat effects so they read as confirmation, not drama.
                el.volume = 0.38;
            } else {
                el.volume = 0.6;
            }
            audio[key] = el;
        });
        startAmbient();
        window.MediaManager = {
            playSfx,
            playMusic,
            toggleSfx,
            toggleMusic,
            setMuted,
            isSfxEnabled: () => sfxEnabled,
            isMusicEnabled: () => musicEnabled,
            isMuted: () => !sfxEnabled && !musicEnabled
        };
    }

    function playSoundSystemMusic(name) {
        if (!window.SoundSystem) return false;

        const contexts = {
            battleAmbient: 'battle',
            spaceAmbient: 'game',
            victory: 'victory',
            defeat: 'defeat'
        };

        if (contexts[name]) {
            window.SoundSystem.playContextualMusic(contexts[name]);
        } else {
            window.SoundSystem.playMusic(name);
        }
        return true;
    }

    function startAmbient() {
        if (!musicEnabled) return;
        if (playSoundSystemMusic('spaceAmbient')) return;

        ambientTrack = audio.spaceAmbient;
        if (ambientTrack && ambientTrack.paused) {
            ambientTrack.currentTime = 0;
            ambientTrack.play().catch(() => {});
        }
    }

    // Cap on simultaneous copies of one layered effect. A battle round fires up to ten
    // volleys; letting every one spawn an element unbounded would stack a wall of noise
    // and leak audio nodes if a round ever ran long.
    const OVERLAP_LIMIT = 4;
    const overlapping = {};

    /**
     * playSfx(name)                  — restart the shared element (UI clicks, one-shots)
     * playSfx(name, { overlap: true }) — play a fresh copy that layers over the others
     *
     * There is ONE <audio> element per sound, so the default path restarts it. That is
     * right for a click, but wrong for weapons fire: a round schedules its volleys on
     * staggered timers, and restarting a single element per beam produces a stutter
     * rather than a battle. Layered plays clone the element and let it expire.
     */
    function playSfx(name, options) {
        if (!sfxEnabled) return;
        window.SoundSystem?.ensureMusicContinuity?.();
        const el = audio[name];
        if (!el) return;

        if (options && options.overlap) {
            const live = overlapping[name] || 0;
            if (live >= OVERLAP_LIMIT) return;
            const copy = el.cloneNode();
            // Each layer is quieter than the single shot would be, so ten beams read as
            // a barrage instead of clipping.
            copy.volume = el.volume * 0.55;
            overlapping[name] = live + 1;
            const done = () => { overlapping[name] = Math.max(0, (overlapping[name] || 1) - 1); };
            copy.addEventListener('ended', done, { once: true });
            copy.play().catch(done);
            return;
        }

        el.currentTime = 0;
        el.play().catch(() => {}).finally(() => {
            window.SoundSystem?.ensureMusicContinuity?.();
        });
    }

    function playMusic(name) {
        if (!musicEnabled) return;
        if (playSoundSystemMusic(name)) return;

        const el = audio[name];
        if (el) {
            el.currentTime = 0;
            el.play().catch(() => {});
        }
    }

    function toggleSfx() {
        sfxEnabled = !sfxEnabled;
        try { localStorage.setItem('gow-sfx', sfxEnabled ? 'on' : 'off'); } catch (_) {}
        return sfxEnabled;
    }

    function toggleMusic() {
        musicEnabled = !musicEnabled;
        try { localStorage.setItem('gow-music', musicEnabled ? 'on' : 'off'); } catch (_) {}
        if (!musicEnabled && window.SoundSystem) window.SoundSystem.stopMusic(false);
        if (!musicEnabled && ambientTrack) ambientTrack.pause();
        if (musicEnabled) startAmbient();
        return musicEnabled;
    }

    function setMuted(muted) {
        const enabled = !muted;
        sfxEnabled = enabled;
        musicEnabled = enabled;
        try {
            localStorage.setItem('gow-muted', muted ? 'on' : 'off');
            localStorage.setItem('gow-sfx', enabled ? 'on' : 'off');
            localStorage.setItem('gow-music', enabled ? 'on' : 'off');
        } catch (_) {}

        if (muted) {
            Object.values(audio).forEach(el => {
                if (el && typeof el.pause === 'function') {
                    el.pause();
                }
            });
            if (window.SoundSystem?.stopMusic) {
                window.SoundSystem.stopMusic(false);
            }
            return false;
        }

        startAmbient();
        return true;
    }

    document.addEventListener('DOMContentLoaded', init);
})();

// media.js - handles game audio (SFX + music)
(function() {
    const tracks = {
        click: { src: 'sounds/click.mp3', volume: 0.6, type: 'sfx' },
        hover: { src: 'sounds/hover.mp3', volume: 0.5, type: 'sfx' },
        notification: { src: 'sounds/notification.mp3', volume: 0.6, type: 'sfx' },
        explosion: { src: 'sounds/explosion.mp3', volume: 0.7, type: 'sfx' },
        shipDestroyed: { src: 'sounds/ship-destroyed.mp3', volume: 0.7, type: 'sfx' },
        warp: { src: 'sounds/warp-jump.mp3', volume: 0.6, type: 'sfx' },
        battleAmbient: { src: 'sounds/battle-ambient.mp3', volume: 0.35, type: 'music', loop: true },
        spaceAmbient: { src: 'sounds/space-ambient.mp3', volume: 0.35, type: 'music', loop: true },
        victory: { src: 'music/victory-theme.mp3', volume: 0.8, type: 'music' },
        defeat: { src: 'music/defeat-theme.mp3', volume: 0.8, type: 'music' }
    };

    const audio = {};
    const fadeTimers = new WeakMap();
    const MUSIC_FADE_MS = 900;
    const HOVER_DEBOUNCE_MS = 80;
    let sfxEnabled = true;
    let musicEnabled = true;
    let ambientTrack = null;
    let activeMusic = null;
    let pendingAmbientResume = null;
    let lastHover = 0;

    function clampVolume(value) {
        return Math.max(0, Math.min(1, Number(value) || 0));
    }

    function isMusicTrack(name) {
        return tracks[name] && tracks[name].type === 'music';
    }

    function getTrackVolume(name) {
        const def = tracks[name];
        return clampVolume(def ? def.volume : 0.6);
    }

    function trackNameForElement(el) {
        const names = Object.keys(audio);
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            if (audio[name] === el) return name;
        }
        return null;
    }

    function safePlay(el) {
        if (!el) return;
        el.play().catch(() => {});
    }

    function clearFade(el) {
        const timerId = fadeTimers.get(el);
        if (timerId) {
            clearInterval(timerId);
            fadeTimers.delete(el);
        }
    }

    function fadeTo(el, target, durationMs, onDone) {
        if (!el) return;
        clearFade(el);

        const start = clampVolume(el.volume);
        const end = clampVolume(target);
        if (durationMs <= 0 || start === end) {
            el.volume = end;
            if (onDone) onDone();
            return;
        }

        const stepMs = 30;
        const steps = Math.max(1, Math.round(durationMs / stepMs));
        let currentStep = 0;

        const timerId = setInterval(() => {
            currentStep += 1;
            const progress = Math.min(currentStep / steps, 1);
            el.volume = start + (end - start) * progress;
            if (progress >= 1) {
                clearFade(el);
                if (onDone) onDone();
            }
        }, stepMs);

        fadeTimers.set(el, timerId);
    }

    function stopAllMusic(resetPosition) {
        Object.keys(tracks).forEach(name => {
            if (!isMusicTrack(name)) return;
            const el = audio[name];
            if (!el) return;
            clearFade(el);
            el.pause();
            if (resetPosition) {
                el.currentTime = 0;
            }
            el.volume = getTrackVolume(name);
        });
        activeMusic = null;
    }

    function crossfadeToTrack(name, options = {}) {
        if (!musicEnabled || !isMusicTrack(name)) return;
        const next = audio[name];
        if (!next) return;

        if (pendingAmbientResume) {
            clearTimeout(pendingAmbientResume);
            pendingAmbientResume = null;
        }

        const restart = options.restart !== false;
        const fadeMs = typeof options.fadeMs === 'number' ? Math.max(0, options.fadeMs) : MUSIC_FADE_MS;
        const targetVolume = getTrackVolume(name);

        if (activeMusic === next) {
            if (restart) {
                next.currentTime = 0;
            }
            if (next.paused) {
                safePlay(next);
            }
            fadeTo(next, targetVolume, Math.min(250, fadeMs));
            return;
        }

        const previous = activeMusic;
        activeMusic = next;

        if (restart || next.ended) {
            next.currentTime = 0;
        }
        next.volume = 0;
        safePlay(next);
        fadeTo(next, targetVolume, fadeMs);

        if (previous && previous !== next) {
            fadeTo(previous, 0, fadeMs, () => {
                previous.pause();
                previous.currentTime = 0;
                const previousName = trackNameForElement(previous);
                if (previousName) {
                    previous.volume = getTrackVolume(previousName);
                }
            });
        }
    }

    function queueAmbientResume() {
        if (pendingAmbientResume) {
            clearTimeout(pendingAmbientResume);
        }
        pendingAmbientResume = setTimeout(() => {
            if (musicEnabled) {
                startAmbient();
            }
            pendingAmbientResume = null;
        }, 120);
    }

    function init() {
        try {
            sfxEnabled = localStorage.getItem('gow-sfx') !== 'off';
            musicEnabled = localStorage.getItem('gow-music') !== 'off';
        } catch (_) {}

        Object.entries(tracks).forEach(([key, def]) => {
            const el = new Audio(def.src);
            el.preload = 'auto';
            el.loop = Boolean(def.loop);
            el.volume = getTrackVolume(key);
            audio[key] = el;
        });

        ambientTrack = audio.spaceAmbient;
        startAmbient();

        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('pointerdown', unlockOnGesture, true);
        document.addEventListener('keydown', unlockOnGesture, true);

        window.MediaManager = {
            playSfx,
            playMusic,
            stopMusic,
            toggleSfx,
            toggleMusic,
            isSfxEnabled: () => sfxEnabled,
            isMusicEnabled: () => musicEnabled
        };
    }

    function unlockOnGesture() {
        document.removeEventListener('pointerdown', unlockOnGesture, true);
        document.removeEventListener('keydown', unlockOnGesture, true);
        if (musicEnabled && activeMusic && activeMusic.paused) {
            safePlay(activeMusic);
        }
    }

    function handleVisibilityChange() {
        if (!activeMusic) return;
        if (document.hidden) {
            activeMusic.pause();
            return;
        }
        if (musicEnabled && activeMusic.paused) {
            safePlay(activeMusic);
        }
    }

    function startAmbient() {
        if (!musicEnabled || !ambientTrack) return;
        crossfadeToTrack('spaceAmbient', { restart: false, fadeMs: 1000 });
    }

    function playSfx(name) {
        if (!sfxEnabled || !tracks[name] || isMusicTrack(name)) return;

        if (name === 'hover') {
            const now = Date.now();
            if (now - lastHover < HOVER_DEBOUNCE_MS) {
                return;
            }
            lastHover = now;
        }

        const base = audio[name];
        if (!base) return;
        const instance = base.cloneNode(true);
        instance.volume = getTrackVolume(name);
        instance.currentTime = 0;
        safePlay(instance);
    }

    function playMusic(name) {
        if (!musicEnabled || !tracks[name] || !isMusicTrack(name)) return;
        const def = tracks[name];
        const el = audio[name];
        if (!el) return;

        crossfadeToTrack(name, { restart: true, fadeMs: MUSIC_FADE_MS });

        if (!def.loop) {
            el.onended = () => {
                el.onended = null;
                queueAmbientResume();
            };
        }
    }

    function stopMusic() {
        if (!activeMusic) return;
        const current = activeMusic;
        fadeTo(current, 0, 250, () => {
            current.pause();
            current.currentTime = 0;
            const name = trackNameForElement(current);
            if (name) {
                current.volume = getTrackVolume(name);
            }
            if (activeMusic === current) {
                activeMusic = null;
            }
        });
    }

    function toggleSfx() {
        sfxEnabled = !sfxEnabled;
        try {
            localStorage.setItem('gow-sfx', sfxEnabled ? 'on' : 'off');
        } catch (_) {}
        return sfxEnabled;
    }

    function toggleMusic() {
        musicEnabled = !musicEnabled;
        try {
            localStorage.setItem('gow-music', musicEnabled ? 'on' : 'off');
        } catch (_) {}

        if (!musicEnabled) {
            if (pendingAmbientResume) {
                clearTimeout(pendingAmbientResume);
                pendingAmbientResume = null;
            }
            stopAllMusic(false);
            return musicEnabled;
        }

        startAmbient();
        return musicEnabled;
    }

    document.addEventListener('DOMContentLoaded', init);
})();

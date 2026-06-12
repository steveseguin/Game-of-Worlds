// media.js - handles game audio (SFX + music)
(function() {
    const sounds = {
        click: 'sounds/click.mp3',
        hover: 'sounds/hover.mp3',
        notification: 'sounds/notification.mp3',
        explosion: 'sounds/explosion.mp3',
        shipDestroyed: 'sounds/ship-destroyed.mp3',
        warp: 'sounds/warp-jump.mp3',
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

        Object.entries(sounds).forEach(([key, src]) => {
            const el = new Audio(src);
            el.preload = 'auto';
            if (key === 'battleAmbient' || key === 'spaceAmbient') {
                el.loop = true;
                el.volume = 0.35;
            } else if (key === 'victory' || key === 'defeat') {
                el.volume = 0.8;
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

    function playSfx(name) {
        if (!sfxEnabled) return;
        const el = audio[name];
        if (el) {
            el.currentTime = 0;
            el.play().catch(() => {});
        }
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

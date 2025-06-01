/**
 * sound.js - Client-side sound and music system
 * 
 * Manages game sounds, music, and audio effects.
 * Provides volume controls and sound preferences.
 */

const SoundSystem = (function() {
    // Audio context for Web Audio API
    let audioContext = null;
    let masterVolume = 0.7;
    let musicVolume = 0.5;
    let effectsVolume = 0.8;
    let enabled = true;
    
    // Sound library
    const sounds = {
        // UI sounds
        click: { url: 'sounds/click.mp3', volume: 0.5 },
        hover: { url: 'sounds/hover.mp3', volume: 0.3 },
        error: { url: 'sounds/error.mp3', volume: 0.6 },
        success: { url: 'sounds/success.mp3', volume: 0.5 },
        notification: { url: 'sounds/notification.mp3', volume: 0.7 },
        
        // Game sounds
        buildComplete: { url: 'sounds/build-complete.mp3', volume: 0.6 },
        researchComplete: { url: 'sounds/research-complete.mp3', volume: 0.6 },
        shipLaunch: { url: 'sounds/ship-launch.mp3', volume: 0.5 },
        warpJump: { url: 'sounds/warp-jump.mp3', volume: 0.7 },
        
        // Combat sounds
        laserFire: { url: 'sounds/laser-fire.mp3', volume: 0.4 },
        missilelaunch: { url: 'sounds/missile-launch.mp3', volume: 0.5 },
        explosion: { url: 'sounds/explosion.mp3', volume: 0.6 },
        shieldHit: { url: 'sounds/shield-hit.mp3', volume: 0.4 },
        shipDestroyed: { url: 'sounds/ship-destroyed.mp3', volume: 0.7 },
        
        // Ambient sounds
        spaceAmbient: { url: 'sounds/space-ambient.mp3', volume: 0.3, loop: true },
        battleAmbient: { url: 'sounds/battle-ambient.mp3', volume: 0.4, loop: true }
    };
    
    // Music tracks
    const music = {
        menu: { url: 'music/menu-theme.mp3', volume: 0.5 },
        peace: { url: 'music/peace-theme.mp3', volume: 0.4 },
        building: { url: 'music/building-theme.mp3', volume: 0.4 },
        battle: { url: 'music/battle-theme.mp3', volume: 0.6 },
        victory: { url: 'music/victory-theme.mp3', volume: 0.7 },
        defeat: { url: 'music/defeat-theme.mp3', volume: 0.5 }
    };
    
    // Currently playing music
    let currentMusic = null;
    let currentMusicName = null;
    
    // Audio buffer cache
    const audioBuffers = new Map();
    const audioElements = new Map();
    
    // Initialize the sound system
    function initialize() {
        // Create audio context
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
            enabled = false;
            return;
        }
        
        // Load saved preferences
        loadPreferences();
        
        // Preload common sounds
        preloadSounds([
            'click', 'hover', 'notification',
            'buildComplete', 'shipLaunch'
        ]);
        
        // Handle page visibility for pausing audio
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Create UI controls
        createVolumeControls();
    }
    
    // Load saved preferences
    function loadPreferences() {
        const prefs = localStorage.getItem('soundPreferences');
        if (prefs) {
            try {
                const parsed = JSON.parse(prefs);
                masterVolume = parsed.master || 0.7;
                musicVolume = parsed.music || 0.5;
                effectsVolume = parsed.effects || 0.8;
                enabled = parsed.enabled !== false;
            } catch (e) {
                console.error('Error loading sound preferences:', e);
            }
        }
    }
    
    // Save preferences
    function savePreferences() {
        localStorage.setItem('soundPreferences', JSON.stringify({
            master: masterVolume,
            music: musicVolume,
            effects: effectsVolume,
            enabled: enabled
        }));
    }
    
    // Preload sounds
    function preloadSounds(soundNames) {
        soundNames.forEach(name => {
            if (sounds[name]) {
                loadSound(name, sounds[name].url);
            }
        });
    }
    
    // Load a sound file
    function loadSound(name, url) {
        // For simplicity, use Audio elements instead of Web Audio buffers
        const audio = new Audio(url);
        audio.preload = 'auto';
        audioElements.set(name, audio);
        
        // Handle load error
        audio.onerror = () => {
            console.warn(`Failed to load sound: ${name} from ${url}`);
            // Create a placeholder silent sound
            audioElements.set(name, { play: () => {}, pause: () => {} });
        };
    }
    
    // Play a sound effect
    function playSound(soundName, options = {}) {
        if (!enabled || !sounds[soundName]) return;
        
        let audio = audioElements.get(soundName);
        
        // Load if not cached
        if (!audio) {
            loadSound(soundName, sounds[soundName].url);
            // For immediate playback, create temporary audio
            audio = new Audio(sounds[soundName].url);
        } else {
            // Clone audio for concurrent playback
            audio = audio.cloneNode();
        }
        
        // Set volume
        const soundDef = sounds[soundName];
        const volume = (soundDef.volume || 1) * effectsVolume * masterVolume;
        audio.volume = Math.max(0, Math.min(1, volume));
        
        // Set loop if needed
        if (soundDef.loop || options.loop) {
            audio.loop = true;
        }
        
        // Play
        audio.play().catch(e => {
            // Ignore autoplay errors
            if (e.name !== 'NotAllowedError') {
                console.error('Error playing sound:', e);
            }
        });
        
        return audio;
    }
    
    // Play music
    function playMusic(trackName, fadeIn = true) {
        if (!enabled || !music[trackName]) return;
        
        // Stop current music
        if (currentMusic) {
            stopMusic(true);
        }
        
        const track = music[trackName];
        currentMusic = new Audio(track.url);
        currentMusic.loop = true;
        currentMusic.volume = 0;
        currentMusicName = trackName;
        
        // Fade in
        if (fadeIn) {
            let targetVolume = (track.volume || 0.5) * musicVolume * masterVolume;
            fadeAudio(currentMusic, targetVolume, 2000);
        } else {
            currentMusic.volume = (track.volume || 0.5) * musicVolume * masterVolume;
        }
        
        currentMusic.play().catch(e => {
            if (e.name !== 'NotAllowedError') {
                console.error('Error playing music:', e);
            }
        });
    }
    
    // Stop music
    function stopMusic(fadeOut = true) {
        if (!currentMusic) return;
        
        if (fadeOut) {
            fadeAudio(currentMusic, 0, 1000, () => {
                currentMusic.pause();
                currentMusic = null;
                currentMusicName = null;
            });
        } else {
            currentMusic.pause();
            currentMusic = null;
            currentMusicName = null;
        }
    }
    
    // Fade audio volume
    function fadeAudio(audio, targetVolume, duration, callback) {
        const startVolume = audio.volume;
        const startTime = Date.now();
        
        const fade = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            audio.volume = startVolume + (targetVolume - startVolume) * progress;
            
            if (progress < 1) {
                requestAnimationFrame(fade);
            } else if (callback) {
                callback();
            }
        };
        
        fade();
    }
    
    // Set master volume
    function setMasterVolume(volume) {
        masterVolume = Math.max(0, Math.min(1, volume));
        updateAllVolumes();
        savePreferences();
    }
    
    // Set music volume
    function setMusicVolume(volume) {
        musicVolume = Math.max(0, Math.min(1, volume));
        if (currentMusic) {
            const track = music[currentMusicName];
            currentMusic.volume = (track.volume || 0.5) * musicVolume * masterVolume;
        }
        savePreferences();
    }
    
    // Set effects volume
    function setEffectsVolume(volume) {
        effectsVolume = Math.max(0, Math.min(1, volume));
        savePreferences();
    }
    
    // Update all playing audio volumes
    function updateAllVolumes() {
        if (currentMusic && currentMusicName) {
            const track = music[currentMusicName];
            currentMusic.volume = (track.volume || 0.5) * musicVolume * masterVolume;
        }
    }
    
    // Toggle sound on/off
    function toggle() {
        enabled = !enabled;
        if (!enabled) {
            stopMusic(false);
        }
        savePreferences();
        return enabled;
    }
    
    // Handle page visibility change
    function handleVisibilityChange() {
        if (document.hidden) {
            // Pause music when tab is hidden
            if (currentMusic && !currentMusic.paused) {
                currentMusic.pause();
            }
        } else {
            // Resume music when tab is visible
            if (currentMusic && currentMusic.paused && enabled) {
                currentMusic.play().catch(() => {});
            }
        }
    }
    
    // Create volume control UI
    function createVolumeControls() {
        // This would create the actual UI elements
        // For now, just expose the API
    }
    
    // Play contextual music based on game state
    function playContextualMusic(context) {
        switch (context) {
            case 'menu':
                playMusic('menu');
                break;
            case 'game':
                playMusic('peace');
                break;
            case 'battle':
                playMusic('battle');
                break;
            case 'building':
                playMusic('building');
                break;
            case 'victory':
                playMusic('victory');
                break;
            case 'defeat':
                playMusic('defeat');
                break;
        }
    }
    
    // Placeholder sound generation (for missing audio files)
    function generatePlaceholderSound(type) {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Different sound types
        switch (type) {
            case 'click':
                oscillator.frequency.value = 800;
                oscillator.type = 'square';
                gainNode.gain.value = 0.1 * effectsVolume * masterVolume;
                break;
            case 'error':
                oscillator.frequency.value = 200;
                oscillator.type = 'sawtooth';
                gainNode.gain.value = 0.2 * effectsVolume * masterVolume;
                break;
            case 'success':
                oscillator.frequency.value = 1200;
                oscillator.type = 'sine';
                gainNode.gain.value = 0.15 * effectsVolume * masterVolume;
                break;
            default:
                oscillator.frequency.value = 440;
                oscillator.type = 'sine';
                gainNode.gain.value = 0.1 * effectsVolume * masterVolume;
        }
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
        
        // Fade out
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    }
    
    return {
        initialize,
        playSound,
        playMusic,
        stopMusic,
        playContextualMusic,
        setMasterVolume,
        setMusicVolume,
        setEffectsVolume,
        toggle,
        enabled: () => enabled
    };
})();

// Initialize when ready
document.addEventListener('DOMContentLoaded', () => {
    SoundSystem.initialize();
});

// Export for use
window.SoundSystem = SoundSystem;
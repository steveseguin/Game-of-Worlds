// epic-music.js - original MIDI-inspired tension playlist for the game view.
(function() {
    const STEPS_PER_BAR = 16;
    const LOOKAHEAD_SECONDS = 0.42;
    const TICK_MS = 55;
    const SILENCE = 0.0001;

    const playlists = {
        campaign: ['ionStormRun', 'orbitalSiege', 'starlanceOverture', 'forgeOfStars'],
        battle: ['orbitalSiege', 'ionStormRun', 'starlanceOverture'],
        building: ['forgeOfStars', 'borderMarch', 'starlanceOverture'],
        victory: ['victoryBurn'],
        defeat: ['lastSignal']
    };

    const tracks = {
        starlanceOverture: {
            tempo: 164,
            bars: 16,
            color: 'heroic',
            chords: [
                ['A3', 'C4', 'E4', 'G4'],
                ['F3', 'A3', 'C4', 'E4'],
                ['C3', 'E3', 'G3', 'B3'],
                ['G3', 'B3', 'D4', 'F4']
            ],
            lead: [
                'E5', null, 'A5', 'C6', 'B5', null, 'A5', 'E5',
                'G5', null, 'B5', 'D6', 'C6', 'B5', 'A5', null,
                'C6', null, 'E6', 'D6', 'C6', 'A5', null, 'G5',
                'B5', null, 'D6', 'C6', 'A5', 'G5', 'E5', null
            ],
            bass: ['root', null, null, 'root', null, 'root', null, null, 'root', null, 'fifth', null, 'root', null, null, 'fifth'],
            accents: [0, 6, 8, 14],
            arpEvery: 2
        },
        ionStormRun: {
            tempo: 168,
            bars: 16,
            color: 'bright',
            chords: [
                ['D3', 'F4', 'A4', 'C5'],
                ['Bb2', 'F3', 'A3', 'D4'],
                ['F3', 'A3', 'C4', 'E4'],
                ['C3', 'G3', 'Bb3', 'D4']
            ],
            lead: [
                'D5', null, 'F5', 'A5', null, 'C6', 'A5', 'F5',
                'G5', null, 'A5', 'D6', 'C6', null, 'A5', 'G5',
                'F5', 'A5', null, 'C6', 'D6', null, 'C6', 'A5',
                'G5', null, 'F5', 'D5', 'F5', 'G5', 'A5', null
            ],
            bass: ['root', null, 'root', null, 'fifth', null, null, 'root', 'root', null, 'fifth', null, 'root', null, null, 'fifth'],
            accents: [0, 4, 10, 14],
            arpEvery: 1
        },
        forgeOfStars: {
            tempo: 154,
            bars: 16,
            color: 'industrial',
            chords: [
                ['E3', 'G3', 'B3', 'D4'],
                ['C3', 'G3', 'B3', 'E4'],
                ['G2', 'D3', 'F3', 'B3'],
                ['D3', 'F3', 'A3', 'C4']
            ],
            lead: [
                'B4', null, 'E5', null, 'G5', 'B5', null, 'A5',
                'G5', null, 'E5', 'G5', 'A5', null, 'B5', null,
                'D6', null, 'B5', 'A5', 'G5', null, 'E5', null,
                'F5', 'G5', null, 'A5', 'B5', null, 'G5', null
            ],
            bass: ['root', null, null, null, 'root', null, 'fifth', null, 'root', null, null, 'fifth', 'root', null, null, null],
            accents: [0, 7, 8, 15],
            arpEvery: 2
        },
        borderMarch: {
            tempo: 158,
            bars: 16,
            color: 'wide',
            chords: [
                ['B2', 'F#3', 'A3', 'D4'],
                ['G2', 'D3', 'F#3', 'B3'],
                ['D3', 'A3', 'C4', 'F#4'],
                ['A2', 'E3', 'G3', 'C#4']
            ],
            lead: [
                'F#5', null, 'B5', null, 'D6', 'C#6', 'B5', null,
                'A5', null, 'D6', null, 'F#6', 'E6', 'D6', null,
                'C#6', null, 'A5', 'B5', 'D6', null, 'C#6', 'A5',
                'B5', null, 'D6', 'E6', 'F#6', null, 'D6', null
            ],
            bass: ['root', null, 'fifth', null, 'root', null, null, 'fifth', 'root', null, 'fifth', null, 'root', null, 'fifth', null],
            accents: [0, 4, 8, 12],
            arpEvery: 2
        },
        orbitalSiege: {
            tempo: 176,
            bars: 16,
            color: 'battle',
            chords: [
                ['C3', 'Eb3', 'G3', 'Bb3'],
                ['Ab2', 'Eb3', 'G3', 'C4'],
                ['Eb3', 'G3', 'Bb3', 'D4'],
                ['Bb2', 'F3', 'Ab3', 'D4']
            ],
            lead: [
                'G5', null, 'C6', 'Eb6', 'D6', null, 'C6', 'G5',
                'Bb5', null, 'D6', 'F6', 'Eb6', 'D6', 'C6', null,
                'Eb6', null, 'G6', 'F6', 'Eb6', 'C6', 'Bb5', null,
                'D6', null, 'F6', 'Eb6', 'C6', 'Bb5', 'G5', null
            ],
            bass: ['root', 'root', null, 'root', 'fifth', null, 'root', null, 'root', null, 'fifth', null, 'root', null, 'root', 'fifth'],
            accents: [0, 3, 8, 11, 14],
            arpEvery: 1
        },
        victoryBurn: {
            tempo: 166,
            bars: 8,
            color: 'heroic',
            chords: [
                ['C3', 'E3', 'G3', 'B3'],
                ['G2', 'D3', 'G3', 'B3'],
                ['A2', 'E3', 'A3', 'C4'],
                ['F2', 'C3', 'A3', 'C4']
            ],
            lead: [
                'G5', null, 'C6', 'E6', 'G6', null, 'E6', 'C6',
                'D6', null, 'G6', 'B6', 'A6', 'G6', 'E6', null
            ],
            bass: ['root', null, null, 'fifth', 'root', null, 'fifth', null, 'root', null, null, 'fifth', 'root', null, 'fifth', null],
            accents: [0, 4, 8, 12],
            arpEvery: 1
        },
        lastSignal: {
            tempo: 112,
            bars: 8,
            color: 'dark',
            chords: [
                ['E3', 'G3', 'B3', 'D4'],
                ['C3', 'E3', 'G3', 'B3'],
                ['A2', 'E3', 'G3', 'C4'],
                ['B2', 'F#3', 'A3', 'D4']
            ],
            lead: [
                'B4', null, null, 'E5', null, 'G5', null, null,
                'D5', null, null, 'B4', null, 'A4', null, null
            ],
            bass: ['root', null, null, null, null, null, 'fifth', null, 'root', null, null, null, 'fifth', null, null, null],
            accents: [0, 8],
            arpEvery: 4
        }
    };

    function midiToFrequency(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    function noteToMidi(note) {
        const match = /^([A-G])([#b]?)(-?\d+)$/.exec(note);
        if (!match) return null;

        const offsets = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        let offset = offsets[match[1]];
        if (match[2] === '#') offset += 1;
        if (match[2] === 'b') offset -= 1;
        const octave = Number(match[3]);
        return (octave + 1) * 12 + offset;
    }

    function noteToFrequency(note) {
        const midi = noteToMidi(note);
        return midi === null ? null : midiToFrequency(midi);
    }

    function transpose(note, semitones) {
        const midi = noteToMidi(note);
        if (midi === null) return note;

        const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        const next = midi + semitones;
        const name = names[((next % 12) + 12) % 12];
        const octave = Math.floor(next / 12) - 1;
        return `${name}${octave}`;
    }

    function resolveBassNote(kind, chord) {
        if (!kind) return null;
        if (kind === 'root') return transpose(chord[0], -12);
        if (kind === 'fifth') return transpose(chord[2] || chord[0], -12);
        return kind;
    }

    function connectWithDelay(engine, sourceGain, sendLevel) {
        sourceGain.connect(engine.masterGain);
        if (sendLevel > 0) {
            const send = engine.ctx.createGain();
            send.gain.value = sendLevel;
            sourceGain.connect(send);
            send.connect(engine.delaySend);
        }
    }

    function scheduleOsc(engine, note, time, duration, options) {
        const ctx = engine.ctx;
        const frequency = noteToFrequency(note);
        if (!frequency) return;

        const output = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const attack = options.attack || 0.012;
        const release = options.release || 0.08;
        const sustain = options.sustain || 0.68;
        const peak = Math.max(SILENCE, options.gain || 0.08);
        const end = Math.max(time + attack + release + 0.01, time + duration);

        filter.type = options.filterType || 'lowpass';
        filter.frequency.setValueAtTime(options.cutoff || 5200, time);
        filter.Q.setValueAtTime(options.q || 0.8, time);

        output.gain.setValueAtTime(SILENCE, time);
        output.gain.exponentialRampToValueAtTime(peak, time + attack);
        output.gain.setValueAtTime(peak * sustain, Math.max(time + attack, end - release));
        output.gain.exponentialRampToValueAtTime(SILENCE, end);

        const detunes = options.detunes || [0];
        detunes.forEach(detune => {
            const osc = ctx.createOscillator();
            osc.type = options.wave || 'sawtooth';
            osc.frequency.setValueAtTime(frequency, time);
            osc.detune.setValueAtTime(detune, time);
            osc.connect(filter);
            osc.start(time);
            osc.stop(end + 0.04);
        });

        filter.connect(output);
        connectWithDelay(engine, output, options.delay || 0);
    }

    function scheduleChord(engine, chord, time, duration, intensity) {
        chord.forEach((note, index) => {
            scheduleOsc(engine, note, time + index * 0.012, duration, {
                wave: 'sawtooth',
                detunes: [-7, 5],
                gain: intensity * 0.02,
                attack: 0.035,
                sustain: 0.44,
                release: 0.28,
                cutoff: 2600,
                q: 0.9,
                delay: 0.08
            });
        });
    }

    function scheduleBrass(engine, chord, time, duration, intensity) {
        chord.forEach(note => {
            scheduleOsc(engine, transpose(note, 12), time, duration, {
                wave: 'square',
                detunes: [-4, 4],
                gain: intensity * 0.018,
                attack: 0.018,
                sustain: 0.45,
                release: 0.16,
                cutoff: 1800,
                q: 1.6,
                delay: 0.12
            });
        });
    }

    function scheduleLead(engine, note, time, stepSeconds, track) {
        const tone = track.color === 'dark' ? 'triangle' : 'sawtooth';
        scheduleOsc(engine, note, time, stepSeconds * 1.05, {
            wave: tone,
            detunes: track.color === 'bright' ? [-8, 0, 7] : [-5, 4],
            gain: track.color === 'battle' ? 0.052 : 0.047,
            attack: 0.01,
            sustain: 0.62,
            release: 0.11,
            cutoff: track.color === 'dark' ? 1800 : 4200,
            q: 1.1,
            delay: 0.1
        });
    }

    function scheduleArp(engine, note, time, stepSeconds, track) {
        scheduleOsc(engine, note, time, stepSeconds * 0.72, {
            wave: track.color === 'industrial' ? 'square' : 'triangle',
            gain: 0.026,
            attack: 0.006,
            sustain: 0.38,
            release: 0.06,
            cutoff: 3600,
            q: 0.7,
            delay: 0.12
        });
    }

    function scheduleBass(engine, note, time, stepSeconds, color) {
        scheduleOsc(engine, note, time, stepSeconds * 1.1, {
            wave: color === 'industrial' ? 'square' : 'sawtooth',
            detunes: [-3, 3],
            gain: 0.078,
            attack: 0.008,
            sustain: 0.5,
            release: 0.09,
            cutoff: 950,
            q: 0.9,
            delay: 0
        });
    }

    function scheduleKick(engine, time, strength) {
        const ctx = engine.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, time);
        osc.frequency.exponentialRampToValueAtTime(42, time + 0.13);
        gain.gain.setValueAtTime(SILENCE, time);
        gain.gain.exponentialRampToValueAtTime(0.18 * strength, time + 0.008);
        gain.gain.exponentialRampToValueAtTime(SILENCE, time + 0.22);
        osc.connect(gain);
        gain.connect(engine.masterGain);
        osc.start(time);
        osc.stop(time + 0.24);
    }

    function getNoiseBuffer(engine) {
        if (engine.noiseBuffer) return engine.noiseBuffer;

        const ctx = engine.ctx;
        const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        engine.noiseBuffer = buffer;
        return buffer;
    }

    function scheduleNoise(engine, time, duration, options) {
        const ctx = engine.ctx;
        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        source.buffer = getNoiseBuffer(engine);
        filter.type = options.filterType || 'highpass';
        filter.frequency.setValueAtTime(options.cutoff || 5000, time);
        filter.Q.setValueAtTime(options.q || 0.7, time);
        gain.gain.setValueAtTime(SILENCE, time);
        gain.gain.exponentialRampToValueAtTime(options.gain || 0.05, time + 0.006);
        gain.gain.exponentialRampToValueAtTime(SILENCE, time + duration);

        source.connect(filter);
        filter.connect(gain);
        connectWithDelay(engine, gain, options.delay || 0);
        source.start(time);
        source.stop(time + duration + 0.02);
    }

    function scheduleSnare(engine, time) {
        scheduleNoise(engine, time, 0.18, {
            gain: 0.07,
            cutoff: 1800,
            filterType: 'highpass',
            delay: 0.05
        });
        scheduleOsc(engine, 'D3', time, 0.09, {
            wave: 'triangle',
            gain: 0.035,
            attack: 0.004,
            sustain: 0.25,
            release: 0.08,
            cutoff: 700,
            delay: 0
        });
    }

    function scheduleHat(engine, time, open) {
        scheduleNoise(engine, time, open ? 0.18 : 0.055, {
            gain: open ? 0.04 : 0.025,
            cutoff: open ? 6200 : 7800,
            filterType: 'highpass',
            delay: open ? 0.08 : 0
        });
    }

    function scheduleImpact(engine, time) {
        scheduleKick(engine, time, 1.25);
        scheduleNoise(engine, time, 0.52, {
            gain: 0.05,
            cutoff: 3200,
            filterType: 'highpass',
            delay: 0.16
        });
    }

    function EpicMusicEngine(audioContext) {
        this.ctx = audioContext;
        this.masterGain = audioContext.createGain();
        this.masterGain.gain.value = 0;

        this.compressor = audioContext.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 24;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.004;
        this.compressor.release.value = 0.18;

        this.delaySend = audioContext.createGain();
        this.delaySend.gain.value = 0.55;
        this.delay = audioContext.createDelay(0.8);
        this.delay.delayTime.value = 0.24;
        this.feedback = audioContext.createGain();
        this.feedback.gain.value = 0.22;

        this.masterGain.connect(this.compressor);
        this.compressor.connect(audioContext.destination);
        this.delaySend.connect(this.delay);
        this.delay.connect(this.feedback);
        this.feedback.connect(this.delay);
        this.delay.connect(this.masterGain);

        this.currentTrackIds = [];
        this.currentPreset = null;
        this.currentTrackIndex = 0;
        this.currentStep = 0;
        this.nextStepTime = 0;
        this.targetVolume = 0.25;
        this.timer = null;
        this.playId = 0;
        this.isPlaying = false;
        this.oneShot = false;
        this.noiseBuffer = null;
    }

    EpicMusicEngine.prototype.start = function(presetName, options = {}) {
        const requestedTracks = Array.isArray(presetName) ? presetName : playlists[presetName] || [presetName];
        const trackIds = requestedTracks.filter(id => tracks[id]);
        if (!trackIds.length) return false;

        const shouldRestart = options.restart !== false || this.currentPreset !== presetName;
        this.targetVolume = Math.max(0, Math.min(1, options.volume ?? this.targetVolume));

        if (this.isPlaying && !shouldRestart) {
            this.setVolume(this.targetVolume, options.fadeIn === false ? 0 : 0.35);
            return true;
        }

        this.stop(false);
        this.playId += 1;
        this.currentPreset = presetName;
        this.currentTrackIds = trackIds;
        this.currentTrackIndex = 0;
        this.currentStep = 0;
        this.oneShot = Boolean(options.oneShot);
        this.nextStepTime = this.ctx.currentTime + 0.08;
        this.isPlaying = true;

        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        if (options.fadeIn === false) {
            this.masterGain.gain.setValueAtTime(this.targetVolume, now);
        } else {
            this.masterGain.gain.setValueAtTime(SILENCE, now);
            this.masterGain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, this.targetVolume), now + 1.2);
        }

        const token = this.playId;
        this.timer = setInterval(() => this.scheduler(token), TICK_MS);
        this.scheduler(token);
        return true;
    };

    EpicMusicEngine.prototype.stop = function(fadeOut = true) {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.isPlaying = false;
        this.playId += 1;

        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        if (fadeOut) {
            this.masterGain.gain.setValueAtTime(Math.max(SILENCE, this.masterGain.gain.value), now);
            this.masterGain.gain.exponentialRampToValueAtTime(SILENCE, now + 0.8);
        } else {
            this.masterGain.gain.setValueAtTime(0, now);
        }
    };

    EpicMusicEngine.prototype.pause = function() {
        if (!this.isPlaying) return;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isPlaying = false;
        const resumeVolume = this.targetVolume;
        this.setVolume(0, 0.25);
        this.targetVolume = resumeVolume;
    };

    EpicMusicEngine.prototype.resume = function() {
        if (this.isPlaying || !this.currentTrackIds.length) return;
        this.playId += 1;
        this.isPlaying = true;
        this.nextStepTime = this.ctx.currentTime + 0.08;
        this.setVolume(this.targetVolume, 0.45);
        const token = this.playId;
        this.timer = setInterval(() => this.scheduler(token), TICK_MS);
        this.scheduler(token);
    };

    EpicMusicEngine.prototype.setVolume = function(volume, rampSeconds = 0.2) {
        this.targetVolume = Math.max(0, Math.min(1, volume));
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        if (rampSeconds <= 0) {
            this.masterGain.gain.setValueAtTime(this.targetVolume, now);
        } else {
            this.masterGain.gain.setValueAtTime(Math.max(SILENCE, this.masterGain.gain.value), now);
            this.masterGain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, this.targetVolume), now + rampSeconds);
        }
    };

    EpicMusicEngine.prototype.scheduler = function(token) {
        if (!this.isPlaying || token !== this.playId) return;

        while (this.nextStepTime < this.ctx.currentTime + LOOKAHEAD_SECONDS) {
            const track = tracks[this.currentTrackIds[this.currentTrackIndex]];
            const stepSeconds = 60 / track.tempo / 4;
            this.scheduleStep(track, this.currentStep, this.nextStepTime, stepSeconds);

            this.currentStep += 1;
            this.nextStepTime += stepSeconds;

            if (this.currentStep >= track.bars * STEPS_PER_BAR) {
                this.currentStep = 0;
                this.currentTrackIndex += 1;
                if (this.currentTrackIndex >= this.currentTrackIds.length) {
                    if (this.oneShot) {
                        this.stop(true);
                        return;
                    }
                    this.currentTrackIndex = 0;
                }
            }
        }
    };

    EpicMusicEngine.prototype.scheduleStep = function(track, step, time, stepSeconds) {
        const stepInBar = step % STEPS_PER_BAR;
        const bar = Math.floor(step / STEPS_PER_BAR);
        const chord = track.chords[bar % track.chords.length];
        const barSeconds = stepSeconds * STEPS_PER_BAR;
        const intensity = track.color === 'battle' ? 1.2 : 1;

        if (stepInBar === 0) {
            scheduleChord(this, chord, time, barSeconds * 0.72, intensity);
            if (bar % 4 === 0) {
                scheduleImpact(this, time);
            }
        }

        if (track.accents.includes(stepInBar)) {
            scheduleBrass(this, chord, time, stepSeconds * 1.35, intensity);
        }

        const bassNote = resolveBassNote(track.bass[stepInBar], chord);
        if (bassNote) {
            scheduleBass(this, bassNote, time, stepSeconds, track.color);
        }

        if ([0, 6, 8, 14].includes(stepInBar) || (track.color === 'battle' && (stepInBar === 3 || stepInBar === 11))) {
            scheduleKick(this, time, track.color === 'battle' ? 1.1 : 0.95);
        }
        if (stepInBar === 4 || stepInBar === 12) {
            scheduleSnare(this, time);
        }
        if (track.color === 'battle' || stepInBar % 2 === 0) {
            scheduleHat(this, time, false);
        }
        if (stepInBar === 15 && track.color !== 'dark') {
            scheduleHat(this, time, true);
        }

        if (track.arpEvery && stepInBar % track.arpEvery === 0) {
            const arpNote = transpose(chord[(step + bar) % chord.length], 12);
            scheduleArp(this, arpNote, time, stepSeconds, track);
        }

        const leadNote = track.lead[step % track.lead.length];
        if (leadNote) {
            scheduleLead(this, leadNote, time, stepSeconds, track);
        }
    };

    EpicMusicEngine.playlists = playlists;
    EpicMusicEngine.tracks = tracks;
    window.EpicMusicEngine = EpicMusicEngine;
})();

const test = require('node:test');
const assert = require('node:assert/strict');

const { EpicMusicEngine, calculateUrgencyTempo } = require('../public/js/epic-music.js');

test('music urgency begins only in the final ten seconds of a quick turn', () => {
    assert.equal(calculateUrgencyTempo(120, 180), 1);
    assert.equal(calculateUrgencyTempo(11, 180), 1);
    assert.equal(calculateUrgencyTempo(10, 180), 1);
    assert.ok(calculateUrgencyTempo(9, 180) > 1);
    assert.ok(calculateUrgencyTempo(5, 180) > calculateUrgencyTempo(10, 180));
    assert.equal(calculateUrgencyTempo(0, 180), 1.06);
});

test('long turns cap the music urgency window at ten seconds', () => {
    assert.equal(calculateUrgencyTempo(61, 86400), 1);
    assert.equal(calculateUrgencyTempo(10, 86400), 1);
    assert.ok(calculateUrgencyTempo(9, 86400) > 1);
    assert.equal(calculateUrgencyTempo(0, 86400), 1.06);
});

test('short test turns use their final twenty percent', () => {
    assert.equal(calculateUrgencyTempo(7, 30), 1);
    assert.equal(calculateUrgencyTempo(6, 30), 1);
    assert.ok(calculateUrgencyTempo(3, 30) > 1);
});

test('scheduler drops missed wall-clock beats instead of replaying a fast backlog', () => {
    const engine = Object.create(EpicMusicEngine.prototype);
    engine.ctx = { currentTime: 100 };
    engine.isPlaying = true;
    engine.playId = 4;
    engine.nextStepTime = 95;
    engine.currentTrackIds = ['ionStormRun'];
    engine.currentTrackIndex = 0;
    engine.currentStep = 0;
    engine.tempoMultiplier = 1;
    engine.oneShot = false;
    engine.scheduleStep = () => {};

    engine.scheduler(4);

    assert.ok(engine.nextStepTime > engine.ctx.currentTime);
    assert.ok(engine.currentStep < 20, 'a delayed callback must not replay seconds of missed steps');
});

test('music contexts provide distinct multi-track playlists with gentler lobby pacing', () => {
    const { playlists, tracks } = EpicMusicEngine;
    ['lobby', 'launch', 'campaign', 'building', 'battle'].forEach(context => {
        assert.ok(playlists[context].length >= 2, `${context} should have multiple tracks`);
        assert.equal(new Set(playlists[context]).size, playlists[context].length);
    });
    const averageTempo = context => playlists[context]
        .reduce((sum, id) => sum + tracks[id].tempo, 0) / playlists[context].length;
    assert.ok(averageTempo('lobby') < averageTempo('campaign'));
    assert.ok(averageTempo('campaign') < averageTempo('battle'));
    playlists.campaign.forEach(id => {
        assert.ok(tracks[id].tempo >= 110 && tracks[id].tempo <= 120, `${id} should keep a stable exploration pace`);
        assert.ok(tracks[id].arpEvery >= 4, `${id} should not chatter on eighth-note arpeggios`);
    });
});

test('a failed procedural track advances to the next healthy track with a fade', () => {
    const gainEvents = [];
    const gain = {
        cancelScheduledValues: time => gainEvents.push(['cancel', time]),
        setValueAtTime: (value, time) => gainEvents.push(['set', value, time]),
        exponentialRampToValueAtTime: (value, time) => gainEvents.push(['ramp', value, time])
    };
    const engine = Object.create(EpicMusicEngine.prototype);
    Object.assign(engine, {
        ctx: { currentTime: 20 },
        masterGain: { gain },
        targetVolume: 0.25,
        isPlaying: true,
        playId: 8,
        nextStepTime: 20.05,
        currentTrackIds: ['missing-track', 'quietOrbit'],
        currentTrackIndex: 0,
        currentStep: 0,
        tempoMultiplier: 1,
        oneShot: false,
        failedTrackIds: new Set(),
        scheduleStep() {}
    });

    engine.scheduler(8);

    assert.equal(engine.currentTrackIndex, 1);
    assert.equal(engine.failedTrackIds.has('missing-track'), true);
    const ramps = gainEvents.filter(event => event[0] === 'ramp').map(event => event[1]);
    assert.ok(ramps.length > 0);
    assert.ok(Math.min(...ramps) >= engine.targetVolume * 0.75, 'track changes must not fade close to silence');
});

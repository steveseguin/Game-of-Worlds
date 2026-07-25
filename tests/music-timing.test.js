const test = require('node:test');
const assert = require('node:assert/strict');

const { EpicMusicEngine, calculateUrgencyTempo } = require('../public/js/epic-music.js');

// The urgency ramp exists so a player FEELS the turn ending while there is still time to
// spend metal or move a fleet. An earlier shape opened at 30s but eased quadratically, so
// two thirds of the window was inaudible and the whole lift arrived in the last few
// seconds — by then the information is useless. These tests pin the replacement: a 45s
// window that has moved perceptibly by the time a third of it has gone.

test('urgency is silent until the final forty-five seconds of a quick turn', () => {
    assert.equal(calculateUrgencyTempo(120, 180), 1);
    assert.equal(calculateUrgencyTempo(46, 180), 1);
    assert.equal(calculateUrgencyTempo(45, 180), 1);
    assert.ok(calculateUrgencyTempo(44, 180) > 1);
    assert.ok(calculateUrgencyTempo(5, 180) > calculateUrgencyTempo(20, 180),
        'the build must be monotonic - later is always more urgent');
    assert.equal(Number(calculateUrgencyTempo(0, 180).toFixed(4)), 1.12);
});

test('the build is audible while there is still time to act on it', () => {
    // This is the whole point of the change, so it is asserted rather than assumed.
    // At 30s remaining a Quick turn still has real decisions left in it; the music has
    // to have started moving by then, which the old quadratic-over-30s shape did not.
    const lift = seconds => calculateUrgencyTempo(seconds, 180) - 1;
    const total = lift(0);
    assert.ok(lift(30) > total * 0.1,
        'a third of the way in should be perceptible, not inaudible');
    assert.ok(lift(30) < total * 0.35,
        '...but still clearly a build rather than the destination');
    assert.ok(lift(15) > total * 0.45, 'past halfway the build should dominate');
    assert.ok(lift(2) > total * 0.85, 'the final breath should be near the ceiling');
});

test('urgency still accelerates rather than ramping flat', () => {
    // A straight line would reach the ceiling too early and sit there. Each successive
    // stretch of the window must contribute more lift than the one before it.
    const lift = seconds => calculateUrgencyTempo(seconds, 180) - 1;
    const firstThird = lift(30) - lift(45);
    const middleThird = lift(15) - lift(30);
    const finalThird = lift(0) - lift(15);
    assert.ok(middleThird > firstThird, 'the middle of the window should out-build the opening');
    assert.ok(finalThird > middleThird, 'the closing seconds should out-build the middle');
});

test('long turns cap the urgency window rather than crescendoing for hours', () => {
    // An Epic turn is a day long; 25% of it would be a six-hour build.
    assert.equal(calculateUrgencyTempo(46, 86400), 1);
    assert.equal(calculateUrgencyTempo(45, 86400), 1);
    assert.ok(calculateUrgencyTempo(44, 86400) > 1);
    assert.equal(Number(calculateUrgencyTempo(0, 86400).toFixed(4)), 1.12);
});

test('short test turns use a proportional window, not the full forty-five seconds', () => {
    // A 30s turn would otherwise spend its entire length in countdown. 25% of 30 is 7.5s.
    assert.equal(calculateUrgencyTempo(8, 30), 1);
    assert.equal(calculateUrgencyTempo(7.5, 30), 1);
    assert.ok(calculateUrgencyTempo(7, 30) > 1);
    assert.ok(calculateUrgencyTempo(30, 30) === 1, 'the start of a turn is never urgent');
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

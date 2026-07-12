const test = require('node:test');
const assert = require('node:assert/strict');

const { EpicMusicEngine, calculateUrgencyTempo } = require('../public/js/epic-music.js');

test('music urgency begins only in the final 20 percent of a quick turn', () => {
    assert.equal(calculateUrgencyTempo(120, 180), 1);
    assert.equal(calculateUrgencyTempo(37, 180), 1);
    assert.equal(calculateUrgencyTempo(36, 180), 1);
    assert.ok(calculateUrgencyTempo(30, 180) > 1);
    assert.ok(calculateUrgencyTempo(10, 180) > calculateUrgencyTempo(30, 180));
    assert.equal(calculateUrgencyTempo(0, 180), 1.12);
});

test('long turns cap the music urgency window at sixty seconds', () => {
    assert.equal(calculateUrgencyTempo(61, 86400), 1);
    assert.equal(calculateUrgencyTempo(60, 86400), 1);
    assert.ok(calculateUrgencyTempo(30, 86400) > 1);
    assert.equal(calculateUrgencyTempo(0, 86400), 1.12);
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

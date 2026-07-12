const test = require('node:test');
const assert = require('node:assert/strict');

const hazards = require('../server/lib/movement/hazards');

test('probe hazard messages use the target sector id when provided', async () => {
    const messages = [];
    const connection = {
        sendUTF(message) {
            messages.push(message);
        }
    };

    const result = await new Promise(resolve => {
        hazards.checkProbeHazard(
            1,
            hazards.SECTOR_TYPES.BLACK_HOLE,
            31,
            connection,
            resolve
        );
    });

    assert.deepEqual(result, { destroyed: true, hazardType: 'black_hole' });
    assert.equal(messages.length, 1);
    assert.match(messages[0], /sector 1F/i);
    assert.doesNotMatch(messages[0], /black hole|asteroid/i);
});

test('probe hazard legacy signature remains supported', async () => {
    const result = await new Promise(resolve => {
        hazards.checkProbeHazard(
            1,
            hazards.SECTOR_TYPES.EMPTY_SPACE,
            { sendUTF() {} },
            resolve
        );
    });

    assert.deepEqual(result, { destroyed: false });
});

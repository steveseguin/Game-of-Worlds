const test = require('node:test');
const assert = require('node:assert/strict');

const mapSystem = require('../server/lib/map');

test('seeded map generation is reproducible without changing production randomness', () => {
    const build = seed => mapSystem.generateMap(
        8,
        5,
        2,
        mapSystem.createSeededRandom(`${seed}:8:5:2`)
    );
    const first = build('game-of-worlds-e2e-v1');
    const repeat = build('game-of-worlds-e2e-v1');
    const different = build('another-seed');

    assert.deepEqual(repeat, first);
    assert.notDeepEqual(different.sectors, first.sectors);
    assert.equal(first.homeworlds.length, 2);
    assert.ok(first.sectors.some(sector => sector.sectortype === mapSystem.SECTOR_TYPES.ASTEROID_BELT.id));
    // A small map may legitimately contain no rare black hole.
});


test('large seeded maps have open maneuvering space and rare black holes', () => {
    const { sectors } = mapSystem.generateMap(60,60,2,mapSystem.createSeededRandom('open-routes'));
    const share = pred => sectors.filter(pred).length / sectors.length;
    assert.ok(share(s=>s.sectortype===0)>0.30);
    assert.ok(share(s=>s.sectortype===0)<0.40);
    assert.ok(share(s=>s.sectortype===1)>0.10);
    assert.ok(share(s=>s.sectortype===2)>0.005);
    assert.ok(share(s=>s.sectortype===2)<0.035);
    assert.ok(share(s=>s.sectortype>=6)<0.46);
});


test('each home has an adjacent first colony without a terraforming gate',()=>{
    for(let seed=0;seed<25;seed++) {
        const {sectors,homeworlds}=mapSystem.generateMap(14,8,6,mapSystem.createSeededRandom('starter-'+seed));
        for(const id of homeworlds) {
            const home=sectors[id-1];
            assert.ok(sectors.some(s=>s.sectorid!==id&&[6,7].includes(s.sectortype)&&s.terraformlvl===0
                &&Math.max(Math.abs(s.x-home.x),Math.abs(s.y-home.y))===1));
        }
    }
});

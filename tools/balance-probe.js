#!/usr/bin/env node
/**
 * tools/balance-probe.js — how far can an empire actually expand?
 *
 * The victory thresholds (75% of colonisable worlds for domination, and the per-mode
 * turn limits) were set against an arithmetic expansion model. That model swung by 5x
 * on two equally defensible guesses, and it only counted colonisation while real
 * domination comes substantially from taking rivals' worlds. So: run the actual engine
 * instead. Four AI empires, a real generated map, real income, real combat, and report
 * who holds what over time.
 *
 *   node tools/balance-probe.js [turns] [--seed=N]
 *
 * Pass a seed to make the run reproducible. Without one every run draws a different map,
 * and map-to-map variance is larger than most changes being measured: two runs of the
 * same build came out at 25.9% and 11.3% peak share. Comparing a change against an
 * unseeded baseline therefore measures the dice, not the change. With a seed, run the
 * same seed before and after and the difference is the change:
 *
 *   for s in 1 2 3 4 5; do node tools/balance-probe.js 90 --seed=$s | tail -3; done
 */

process.env.USE_MOCK_DB = '1';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Seed BEFORE anything else is required: map generation reads Math.random at require
// time in some paths, and a late swap would leave those already drawn.
const seedArg = process.argv.find(a => a.startsWith('--seed='));
if (seedArg) {
    // mulberry32 — small, fast, and good enough that map generation does not visibly
    // pattern. The exact generator does not matter; reproducibility does.
    let state = (Number(seedArg.slice(7)) || 1) >>> 0;
    Math.random = function seededRandom() {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const { MockDatabase } = require('../server/lib/mock-db');
const serverLogic = require('../server/server');
const victory = require('../server/lib/victory');

const TURNS = Number(process.argv[2]) || 90;
const GAME_ID = 1;
const AI_COUNT = 4;

const db = new MockDatabase();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

function stubConnection(userId) {
    return { name: String(userId), gameid: GAME_ID, sendUTF() {} };
}

async function main() {
    serverLogic.setDatabase(db);

    await query(`CREATE TABLE IF NOT EXISTS map${GAME_ID} (sectorid INT)`);
    await query(`CREATE TABLE IF NOT EXISTS players${GAME_ID} (userid INT)`);
    await query(`CREATE TABLE IF NOT EXISTS ships${GAME_ID} (id INT)`);
    await query(`CREATE TABLE IF NOT EXISTS buildings${GAME_ID} (id INT)`);
    await query(`CREATE TABLE IF NOT EXISTS explored_sectors${GAME_ID} (playerid INT)`);

    // Player 1 is flagged human with a live socket: a game with no connected humans is
    // treated as abandoned and processTurn refuses to run, which reads as "nobody can
    // expand" when in fact no turn ever happened.
    for (let i = 1; i <= AI_COUNT; i++) {
        await query(
            `INSERT INTO players${GAME_ID} (userid, race_id, metal, crystal, research, is_ai, ai_difficulty, ai_strategy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [i, 1, 300, 400, 100, i === 1 ? 0 : 1, 'aggressive', i % 2 ? 'aggressive' : 'balanced']
        );
    }
    const humanSocket = stubConnection(1);
    serverLogic.gameState.clients.push(humanSocket);

    serverLogic.gameState.turns[GAME_ID] = 1;
    await serverLogic.initializeGame(GAME_ID, humanSocket, { id: GAME_ID, maxplayers: AI_COUNT, mode: 'quick' });
    await sleep(400);
    const active = serverLogic.gameState.activeGames[GAME_ID] || {};
    active.mode = 'quick';
    active.lastHumanActivityTurn = 1;
    active.lastHumanActivityAt = Date.now();

    const map = await query(`SELECT * FROM map${GAME_ID}`);
    const colonisable = map.filter(s => Number(s.type) >= 6 && Number(s.type) <= 10).length;
    if (!map.length) {
        console.log('Map generation produced nothing — probe cannot run.');
        process.exit(1);
    }

    const dominationPct = Number(process.env.VICTORY_DOMINATION_PERCENT) || 75;
    const needed = Math.ceil(colonisable * dominationPct / 100);
    console.log(`map ${map.length} sectors, ${colonisable} colonisable`);
    console.log(`domination needs ${needed} worlds (${dominationPct}%)\n`);
    const colonyCost = require('../server/lib/combat').SHIP_TYPES.COLONY_SHIP.cost.metal;
    console.log(`a colony ship costs ${colonyCost} metal\n`);
    console.log('turn |  best empire | all held | share | metal per AI (colony ships)');

    let peak = 0;
    let endedOnTurn = 0;
    // The turn limit is read up front: once the game ends, victory cleanup removes the
    // activeGames entry and timeVictoryTurnLimit falls back to its default, so asking
    // afterwards reports the wrong number.
    const turnLimit = victory.timeVictoryTurnLimit(GAME_ID, serverLogic.gameState);
    for (let turn = 1; turn <= TURNS; turn++) {
        // A finished game keeps accepting processTurn calls but does nothing, so the
        // table would repeat the final row and read as "expansion plateaued" when in
        // fact the match was over. Stop at the real end and say which turn it was.
        if (!serverLogic.gameState.activeGames[GAME_ID]) {
            endedOnTurn = turn - 1;
            console.log(`\n[game ended on turn ${endedOnTurn} — not simulating further]`);
            break;
        }
        // processTurn, not triggerAiTurn: the latter runs AI orders but skips the
        // income phase, so empires spend their starting metal once and never earn
        // again — which reads as "expansion is impossible" when it is just a broke AI.
        // Battle playback freezes the clock, so wait it out rather than losing turns.
        for (let guard = 0; guard < 200 && serverLogic.isBattlePauseActive(GAME_ID); guard++) {
            await sleep(25);
        }
        const st = serverLogic.gameState.activeGames[GAME_ID];
        if (st) { st.lastHumanActivityTurn = turn; st.lastHumanActivityAt = Date.now(); }
        await serverLogic.processTurn(GAME_ID);
        await sleep(20);

        if (turn % 10 === 0 || turn === TURNS) {
            const rows = await query(`SELECT * FROM map${GAME_ID}`);
            const held = {};
            rows.forEach(s => {
                const owner = Number(s.owner);
                const type = Number(s.type);
                if (owner > 0 && type >= 6 && type <= 10) held[owner] = (held[owner] || 0) + 1;
            });
            const counts = Object.values(held);
            const best = counts.length ? Math.max(...counts) : 0;
            const total = counts.reduce((a, b) => a + b, 0);
            peak = Math.max(peak, best);
            const share = colonisable ? ((best / colonisable) * 100).toFixed(1) : '0';
            // Metal alongside holdings: a stalled empire that is broke needs a different
            // fix from one that is rich and simply has nowhere left it can settle.
            const pRows = await query(`SELECT * FROM players${GAME_ID}`);
            const shipRows = await query(`SELECT * FROM ships${GAME_ID}`).catch(() => []);
            const purse = pRows.filter(p => Number(p.userid) !== 1).map(p => {
                const colonies = (shipRows || []).filter(s =>
                    Number(s.owner) === Number(p.userid) && Number(s.type) === 6).length;
                return `${Math.floor(Number(p.metal) || 0)}${colonies ? `(${colonies})` : ''}`;
            }).join(' ');
            console.log(
                String(turn).padStart(4) + ' | ' +
                String(best).padStart(12) + ' | ' +
                String(total).padStart(8) + ' | ' + share.padStart(5) + '% | ' + purse
            );
        }
    }

    // Why did expansion stop? Report the state that gates it.
    const players = await query(`SELECT * FROM players${GAME_ID}`);
    const ships = await query(`SELECT sectorid, owner, type, COUNT(*) as count FROM ships${GAME_ID} GROUP BY sectorid, owner, type`).catch(() => []);
    const mapNow = await query(`SELECT * FROM map${GAME_ID}`);
    const unclaimed = mapNow.filter(r => !r.owner && Number(r.type) >= 6 && Number(r.type) <= 9);
    const byTerraform = {};
    unclaimed.forEach(r => { const t = Number(r.terraformlvl) || 0; byTerraform[t] = (byTerraform[t] || 0) + 1; });
    console.log('');
    console.log('--- why expansion stopped ---');
    players.forEach(p => {
        const colonies = ships.filter(sh => Number(sh.owner) === Number(p.userid) && Number(sh.type) === 6)
            .reduce((a, b) => a + (Number(b.count) || 0), 0);
        console.log(`  player ${p.userid}: metal ${Math.floor(p.metal)}, tech "${p.tech || ''}", colony ships ${colonies}`);
    });
    console.log('  unclaimed settleable worlds by terraform requirement:', JSON.stringify(byTerraform));

    // What the ECONOMY allows, independent of how well anyone plays. Every coin goes to
    // colony ships, travel is instant, nothing is spent on defence, buildings or
    // research, and no rival ever takes a world back. Reality is strictly worse than
    // this, so a threshold above the ceiling cannot be reached by anyone, ever — and
    // unlike an average-case model there is no optimistic assumption to argue about.
    const yieldByType = { 6: 10, 7: 16, 8: 22, 9: 30, 10: 35 };
    const settleable = mapNow.filter(r => {
        const t = Number(r.type);
        return t >= 6 && t <= 9;
    });
    const avgYield = settleable.length
        ? settleable.reduce((sum, r) => sum + (yieldByType[Number(r.type)] || 0), 0) / settleable.length
        : 19.5;

    function expansionCeiling(turnLimit) {
        let metal = 0;
        let worlds = 1;
        for (let t = 1; t <= turnLimit; t++) {
            metal += 5 + yieldByType[10] + (worlds - 1) * avgYield; // BASE_INCOME + holdings
            while (metal >= colonyCost && worlds < colonisable) {
                metal -= colonyCost;
                worlds += 1;
            }
        }
        return worlds;
    }

    const measuredTurns = endedOnTurn || TURNS;
    const ceiling = expansionCeiling(turnLimit);
    console.log();
    console.log('--- what the economy allows (perfect play, colonisation only) ---');
    console.log(`  a colony ship costs ${colonyCost} metal; the average settleable world yields ${avgYield.toFixed(1)}/turn`);
    console.log(`  ceiling in ${turnLimit} turns: ${ceiling} worlds of ${colonisable}` +
        ` — domination needs ${needed}, so it is ${ceiling >= needed ? 'reachable' : 'UNREACHABLE by any player'}`);
    if (ceiling < needed) {
        // Which lever, and how far it has to move. The ceiling is very sensitive to the
        // colony price and barely sensitive to anything else.
        const affordable = [];
        [0.7, 0.5, 0.35, 0.25].forEach(f => {
            const cost = Math.round(colonyCost * f);
            let metal = 0;
            let worlds = 1;
            for (let t = 1; t <= turnLimit; t++) {
                metal += 5 + yieldByType[10] + (worlds - 1) * avgYield;
                while (metal >= cost && worlds < colonisable) { metal -= cost; worlds += 1; }
            }
            affordable.push(`${cost}→${worlds}`);
        });
        console.log(`  colony cost vs worlds reached: ${affordable.join('  ')}`);
        console.log(`  (either the colony price comes down, or the threshold comes down to meet ${ceiling}-ish)`);
    }
    console.log();
    console.log(`peak single empire: ${peak} worlds of ${colonisable} (${((peak / colonisable) * 100).toFixed(1)}%)`);
    console.log(`domination threshold: ${needed} worlds — ${peak >= needed ? 'REACHED' : 'NOT reached'} in ${measuredTurns} turns`);
    console.log(`quick-mode time limit is ${turnLimit} turns`);
    if (endedOnTurn) {
        console.log(`the match ended on turn ${endedOnTurn}, so that is the whole window a player gets`);
    } else if (TURNS > turnLimit) {
        console.log(`NOTE: asked for ${TURNS} turns but the mode ends at ${turnLimit} — the tail is not real play`);
    }
    process.exit(0);
}

main().catch(error => {
    console.error('probe failed:', error && error.message);
    process.exit(1);
});

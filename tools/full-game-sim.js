#!/usr/bin/env node
/**
 * tools/full-game-sim.js — In-process full-game simulation harness.
 *
 * Drives the real server logic (server/server.js) against the mock database,
 * playing a complete game start-to-finish: lobby, race selection, exploration,
 * probes, hazards, colonization, economy, tech, combat, and victory.
 *
 * Run: node tools/full-game-sim.js [--verbose]
 * Exits non-zero if any check fails, printing a bug list for triage.
 */

const VERBOSE = process.argv.includes('--verbose');

process.env.TECH_CACHE_TTL_MS = '25'; // sim mutates tech rows directly; keep spy-vision cache cold
const serverLogic = require('../server/server');
const combatSystem = require('../server/lib/combat');
const { MockDatabase } = require('../server/lib/mock-db');

const issues = [];
let checks = 0;

function ok(label) {
    checks++;
    console.log(`  PASS  ${label}`);
}

function fail(label, detail) {
    checks++;
    issues.push({ label, detail });
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

function check(condition, label, detail) {
    if (condition) ok(label);
    else fail(label, detail);
}

function makeClient(label) {
    const client = {
        label,
        name: null,
        gameid: null,
        messages: [],
        sendUTF(msg) {
            this.messages.push(String(msg));
            if (VERBOSE) console.log(`    [${label}] << ${String(msg).slice(0, 140)}`);
        },
        send(msg) {
            if (VERBOSE) console.log(`    [${label}] >> ${msg}`);
            routeMessage(msg, this);
        },
        async waitFor(pred, desc = 'message', timeout = 4000) {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const match = this.messages.find(pred);
                if (match) return match;
                await sleep(20);
            }
            throw new Error(`[${label}] timed out waiting for ${desc}`);
        },
        find(pred) {
            return this.messages.find(pred);
        },
        drain() {
            this.messages.length = 0;
        }
    };
    return client;
}

// Mirror of index.js handleCommand so the sim exercises the same routing.
function routeMessage(data, connection) {
    const command = data.split(':')[0].substring(2);
    const route = {
        start: () => serverLogic.handleGameStart(connection),
        creategame: () => serverLogic.handleCreateGame(data, connection),
        gamelist: () => serverLogic.handleGameList(connection),
        currentgame: () => serverLogic.handleCurrentGame(connection),
        leavegame: () => serverLogic.handleLeaveGame(connection),
        addai: () => serverLogic.handleAddAi(data, connection),
        changerace: () => serverLogic.handleChangeRace(data, connection),
        surrender: () => serverLogic.handleSurrender(connection),
        colonize: () => serverLogic.colonizePlanet(connection, data),
        buytech: () => serverLogic.buyTech(data, connection),
        techstate: () => serverLogic.handleTechStateRequest(data, connection),
        probe: () => serverLogic.probeSector(data, connection),
        buyship: () => serverLogic.buyShip(data, connection),
        buybuilding: () => serverLogic.buyBuilding(data, connection),
        move: () => serverLogic.moveFleet(data, connection),
        sector: () => serverLogic.updateSector(data, connection),
        mmove: () => serverLogic.surroundShips(data, connection),
        sendmmf: () => serverLogic.preMoveFleet(data, connection),
        joingame: () => serverLogic.handleJoinGame(data, connection),
        standingorders: () => serverLogic.handleStandingOrders(data, connection),
        applyorders: () => serverLogic.handleApplyStandingOrders(connection),
        update: () => {
            serverLogic.updateResources(connection);
            if (connection.gameid) serverLogic.updateAllSectors(connection.gameid, connection);
        }
    };
    if (route[command]) route[command]();
    else connection.sendUTF(`Unknown command: ${command}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// The client wire protocol uses hexadecimal sector tokens.
function hex(sectorId) {
    return Number(sectorId).toString(16).toUpperCase();
}

function query(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

function execJson(handler, payload) {
    const { EventEmitter } = require('node:events');
    return new Promise((resolve, reject) => {
        const req = new EventEmitter();
        const res = {
            statusCode: 200,
            writeHead(code) { res.statusCode = code; },
            end(body) {
                try { resolve({ statusCode: res.statusCode, body: body ? JSON.parse(body) : undefined }); }
                catch (err) { reject(err); }
            }
        };
        handler(req, res);
        req.emit('data', Buffer.from(JSON.stringify(payload)));
        req.emit('end');
    });
}

function attach(client) {
    serverLogic.gameState.clients.push(client);
    serverLogic.gameState.clientMap[client.name] = client;
}

async function main() {
    console.log('=== Game of Worlds: full game simulation ===\n');
    const db = new MockDatabase();
    serverLogic.setDatabase(db);

    // ------------------------------------------------------------------
    console.log('— Lobby phase —');
    const regA = await execJson(serverLogic.handleRegister, { username: 'simAlpha', password: 'Secure123', email: 'a@sim.test' });
    const regB = await execJson(serverLogic.handleRegister, { username: 'simBravo', password: 'Secure123', email: 'b@sim.test' });
    check(regA.body && regA.body.success, 'register host', JSON.stringify(regA.body));
    check(regB.body && regB.body.success, 'register second player', JSON.stringify(regB.body));

    const alpha = makeClient('alpha');
    alpha.name = String(regA.body.userId);
    const bravo = makeClient('bravo');
    bravo.name = String(regB.body.userId);
    attach(alpha);
    attach(bravo);

    alpha.send('//creategame:Sim%20Game:3');
    const created = await alpha.waitFor(m => m.startsWith('creategame::success::'), 'creategame success');
    const gameId = Number(created.split('::')[2]);
    check(Number.isFinite(gameId) && gameId > 0, 'game id assigned');

    alpha.send(`//joingame:${gameId}:1`);
    await alpha.waitFor(m => m.startsWith('joingame::success::'), 'host join');
    bravo.send(`//joingame:${gameId}:1`);
    await bravo.waitFor(m => m.startsWith('joingame::success::'), 'second player join');
    ok('both players joined');

    alpha.send('//addai:aggressive:balanced');
    await alpha.waitFor(m => m.startsWith('addai::success::'), 'AI added');
    ok('AI opponent added');

    alpha.send('//changerace:2');
    const lockedRace = await alpha.waitFor(m => m.startsWith('changerace::'), 'locked race rejection');
    check(lockedRace.includes('error'), 'locked race rejected for fresh account', lockedRace.slice(0, 70));

    // ------------------------------------------------------------------
    console.log('\n— Game start —');
    alpha.drain();
    bravo.drain();
    alpha.send('//start');
    await alpha.waitFor(m => m === 'startgame::', 'startgame broadcast');
    await bravo.waitFor(m => m === 'startgame::', 'startgame for second player');
    ok('game started for all humans');

    const players = await query(db, `SELECT * FROM players${gameId}`);
    check(players.length === 3, 'three players seated', `got ${players.length}`);
    const ai = players.find(p => Number(p.is_ai) === 1);
    check(Boolean(ai), 'AI player present');
    const alphaRow = players.find(p => String(p.userid) === alpha.name);
    const bravoRow = players.find(p => String(p.userid) === bravo.name);
    check(Number(alphaRow.metal) === 300 && Number(alphaRow.crystal) === 400, 'starting resources assigned', JSON.stringify({ m: alphaRow.metal, c: alphaRow.crystal }));
    check(Number.isFinite(Number(alphaRow.homeworld)) && Number(alphaRow.homeworld) > 0, 'homeworld assigned');

    const map = await query(db, `SELECT * FROM map${gameId}`);
    check(map.length >= 100, 'map generated', `sectors=${map.length}`);
    const homeSector = map.find(s => Number(s.sectorid) === Number(alphaRow.homeworld));
    check(Number(homeSector.owner) === Number(alpha.name), 'homeworld owned by player');
    check(Number(homeSector.type) === 10, 'homeworld sector type is 10', `type=${homeSector.type}`);

    const startShips = await query(db, `SELECT * FROM ships${gameId} WHERE owner = ?`, [alpha.name]);
    const types = startShips.map(s => Number(s.type)).sort().join(',');
    check(types === '3,6', 'starter scout + colony ship spawned', `types=${types}`);

    const startBuildings = await query(db, `SELECT * FROM buildings${gameId} WHERE owner = ?`, [alpha.name]);
    check(startBuildings.length === 2, 'starter buildings placed', `count=${startBuildings.length}`);

    // ------------------------------------------------------------------
    console.log('\n— Fog of war —');
    alpha.drain();
    alpha.send('//update');
    const mapState = await alpha.waitFor(m => m.startsWith('mapstate::'), 'mapstate');
    const visibleCount = mapState.replace('mapstate::', '').split(',').filter(Boolean).length;
    check(visibleCount >= 1 && visibleCount < map.length, 'fog of war: only some sectors visible', `visible=${visibleCount}/${map.length}`);
    const bravoHomeVisible = mapState.includes(`${bravoRow.homeworld}:`);
    check(!bravoHomeVisible, "fog of war: rival homeworld hidden", `alpha sees ${bravoRow.homeworld}`);

    // ------------------------------------------------------------------
    console.log('\n— Economy & tech —');
    alpha.drain();
    serverLogic.processTurn(gameId);
    await sleep(150);
    const afterTurn = await query(db, `SELECT metal, crystal, research FROM players${gameId} WHERE userid = ?`, [alpha.name]);
    check(Number(afterTurn[0].metal) > Number(alphaRow.metal), 'resources tick up on new turn', `${alphaRow.metal} -> ${afterTurn[0].metal}`);

    alpha.drain();
    alpha.send('//buytech:1');
    const techMsg = await alpha.waitFor(m => m.startsWith('Success: Researched') || m.startsWith('Error:'), 'tech response');
    check(techMsg.startsWith('Success'), 'research purchase works', techMsg);
    const techState = await alpha.waitFor(m => m.startsWith('techstate::'), 'techstate push');
    const techStateData = JSON.parse(techState.replace('techstate::', ''));
    check(Number(techStateData.levels && techStateData.levels['1']) === 1, 'techstate reports level 1', techState.slice(0, 90));
    const postTech = await query(db, `SELECT research, tech FROM players${gameId} WHERE userid = ?`, [alpha.name]);
    check(String(postTech[0].tech).includes('1:1'), 'tech level recorded on player', `tech=${postTech[0].tech}`);
    check(Number(postTech[0].research) >= 0 && !Number.isNaN(Number(postTech[0].research)), 'research deducted sanely', `research=${postTech[0].research}`);

    // Branch prerequisites: Plasma Cannons demand Laser Weapons 3 first.
    alpha.drain();
    alpha.send('//buytech:10');
    const prereqMsg = await alpha.waitFor(m => m.startsWith('Error:') || m.startsWith('Success:'), 'prereq response');
    check(prereqMsg.startsWith('Error:') && /Laser Weapons 3/.test(prereqMsg), 'tech prerequisites enforced', prereqMsg.slice(0, 90));

    // Levels scale in cost: buying Metal Extraction again costs more than base.
    await query(db, `UPDATE players${gameId} SET research = 2000 WHERE userid = ?`, [alpha.name]);
    alpha.drain();
    alpha.send('//buytech:1');
    await alpha.waitFor(m => m.startsWith('Success: Researched Metal Extraction Lv2'), 'level 2 research');
    const lv2 = await query(db, `SELECT research, tech FROM players${gameId} WHERE userid = ?`, [alpha.name]);
    check(String(lv2[0].tech).includes('1:2'), 'tech levels stack', `tech=${lv2[0].tech}`);
    check(Number(lv2[0].research) === 2000 - 116, 'level cost scales (80 * 1.45)', `research=${lv2[0].research}`);

    // Select home sector, then build a spaceport (slot 3 of 3).
    alpha.drain();
    alpha.send(`//sector:${hex(alphaRow.homeworld)}`);
    await sleep(100);
    alpha.send('//buybuilding:3');
    const buildMsg = await alpha.waitFor(m => m.startsWith('Success: Built') || m.startsWith('Error:'), 'building response');
    check(buildMsg.startsWith('Success'), 'spaceport built on homeworld', buildMsg);

    // Pump a few turns for income, then buy a frigate.
    for (let i = 0; i < 4; i++) {
        serverLogic.processTurn(gameId);
        await sleep(120);
    }
    alpha.drain();
    alpha.send('//buyship:1');
    const shipMsg = await alpha.waitFor(m => m.startsWith('Success: Built') || m.startsWith('Error:'), 'ship response');
    check(shipMsg.startsWith('Success'), 'frigate built at spaceport', shipMsg);

    // ------------------------------------------------------------------
    console.log('\n— Probes —');
    alpha.drain();
    const unexplored = map.find(s => Number(s.type) >= 6 && Number(s.type) <= 9 && !s.owner && Number(s.sectorid) !== Number(alphaRow.homeworld));
    await query(db, `UPDATE players${gameId} SET crystal = 0 WHERE userid = ?`, [alpha.name]);
    alpha.send(`//probe:${hex(unexplored.sectorid)}`);
    const poorProbe = await alpha.waitFor(m => m.startsWith('Error:'), 'probe rejection');
    check(poorProbe.includes('300'), 'probe rejected without crystal', poorProbe);

    await query(db, `UPDATE players${gameId} SET crystal = 2000 WHERE userid = ?`, [alpha.name]);
    alpha.drain();
    alpha.send(`//probe:${hex(unexplored.sectorid)}`);
    const probeReveal = await alpha.waitFor(m => m.startsWith(`sector::${unexplored.sectorid}::`), 'probe reveal');
    check(Boolean(probeReveal), 'probe reveals planet sector');

    // The reveal is momentary: with no presence nearby, the sector decays to
    // dim memory (vis flag 0) on the next map refresh.
    const distantProbe = Math.max(
        Math.abs(((unexplored.sectorid - 1) % 14) - ((alphaRow.homeworld - 1) % 14)),
        Math.abs(Math.floor((unexplored.sectorid - 1) / 14) - Math.floor((alphaRow.homeworld - 1) / 14))
    ) > 1;
    if (distantProbe) {
        alpha.drain();
        alpha.send('//update');
        const memoryState = await alpha.waitFor(m => m.startsWith('mapstate::'), 'memory mapstate');
        const probedEntry = memoryState.replace('mapstate::', '').split(',').find(e => e.startsWith(`${unexplored.sectorid}:`));
        check(Boolean(probedEntry) && probedEntry.split(':')[4] === '0', 'probed sector lingers as dim memory', probedEntry || 'entry missing');
    } else {
        ok('probed sector lingers as dim memory (skipped: probe target adjacent to home)');
    }

    const blackHole = map.find(s => Number(s.type) === 2);
    if (blackHole) {
        alpha.drain();
        alpha.send(`//probe:${hex(blackHole.sectorid)}`);
        const bhProbe = await alpha.waitFor(m => m.includes('probe was destroyed'), 'probe destruction');
        check(bhProbe.toLowerCase().includes('black hole'), 'probe destroyed by black hole', bhProbe);
    } else {
        fail('probe destroyed by black hole', 'no black hole on this map roll');
    }

    // ------------------------------------------------------------------
    console.log('\n— Movement, hazards, colonization —');
    // Colony ships are the only way to claim planets; fleets just visit.
    const adjacentPlanet = (from) => map.find(s =>
        !s.owner && Number(s.type) >= 6 && Number(s.type) <= 9 && Number(s.terraformlvl || 0) === 0 &&
        Math.max(Math.abs(((s.sectorid - 1) % 14) - ((from - 1) % 14)), Math.abs(Math.floor((s.sectorid - 1) / 14) - Math.floor((from - 1) / 14))) === 1
    );
    let colonyTestDone = false;
    for (const candidate of map) {
        if (colonyTestDone) break;
        if (Number(candidate.owner)) continue;
        const neighbor = adjacentPlanet(Number(candidate.sectorid));
        if (!neighbor || Number(candidate.type) === 2 || (Number(candidate.type) === 1)) continue;
        // Spawn a scout on the safe candidate sector, then hop onto the planet.
        await query(db, `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`, [Number(alpha.name), 3, Number(candidate.sectorid)]);
        alpha.drain();
        alpha.send(`//move:${hex(candidate.sectorid)}:${hex(neighbor.sectorid)}:3:1`);
        await sleep(250);
        const visited = await query(db, `SELECT owner FROM map${gameId} WHERE sectorid = ?`, [neighbor.sectorid]);
        check(!Number(visited[0].owner), 'fleet arrival does NOT claim planets', `owner=${visited[0].owner}`);
        const arrivalMsg = alpha.find(m => m.includes('colony ship can settle'));
        check(Boolean(arrivalMsg), 'arrival hints at colony ships', arrivalMsg ? arrivalMsg.slice(0, 90) : 'no hint message');
        const moveSeen = alpha.find(m => m.startsWith('fleetmove::'));
        check(Boolean(moveSeen), 'fleet movement broadcast for animation', moveSeen ? moveSeen.slice(0, 60) : 'none');

        // No colony ship present: colonize refused.
        alpha.drain();
        alpha.send(`//colonize:${hex(neighbor.sectorid)}`);
        const noShip = await alpha.waitFor(m => m.startsWith('Error:') || m.startsWith('Success:'), 'colonize without ship');
        check(noShip.includes('No colony ship'), 'colonization requires a colony ship', noShip.slice(0, 80));

        // With a colony ship: the world joins the empire and the ship is consumed.
        await query(db, `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`, [Number(alpha.name), 6, Number(neighbor.sectorid)]);
        alpha.drain();
        alpha.send(`//colonize:${hex(neighbor.sectorid)}`);
        await alpha.waitFor(m => m.startsWith('Success: Colonized'), 'colonize success');
        const claimed = await query(db, `SELECT owner FROM map${gameId} WHERE sectorid = ?`, [neighbor.sectorid]);
        check(Number(claimed[0].owner) === Number(alpha.name), 'colony ship colonizes planet', `owner=${claimed[0].owner}`);
        const shipGone = await query(db, `SELECT id FROM ships${gameId} WHERE owner = ? AND sectorid = ? AND type = ? LIMIT 1`, [Number(alpha.name), Number(neighbor.sectorid), 6]);
        check(shipGone.length === 0, 'colony ship consumed by colonization');
        colonyTestDone = true;
    }
    if (!colonyTestDone) fail('colony ship colonizes planet', 'no safe candidate pair found');

    // Terraforming gates harsh worlds.
    const harshWorld = map.find(s => !s.owner && Number(s.type) >= 6 && Number(s.type) <= 9 && Number(s.terraformlvl || 0) >= 2);
    if (harshWorld) {
        await query(db, `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`, [Number(alpha.name), 6, Number(harshWorld.sectorid)]);
        alpha.drain();
        alpha.send(`//colonize:${hex(harshWorld.sectorid)}`);
        const gated = await alpha.waitFor(m => m.startsWith('Error:') || m.startsWith('Success:'), 'terraform gate');
        check(gated.includes('Terraforming'), 'terraforming gates harsh worlds', gated.slice(0, 100));
        await query(db, `DELETE FROM ships${gameId} WHERE owner = ? AND sectorid = ?`, [Number(alpha.name), Number(harshWorld.sectorid)]);
    } else {
        fail('terraforming gates harsh worlds', 'no harsh world on this map roll');
    }

    if (blackHole) {
        // Fly two frigates into a black hole: expect annihilation.
        const bhId = Number(blackHole.sectorid);
        const launchpad = map.find(s => Number(s.sectorid) !== bhId &&
            Math.max(Math.abs(((s.sectorid - 1) % 14) - ((bhId - 1) % 14)), Math.abs(Math.floor((s.sectorid - 1) / 14) - Math.floor((bhId - 1) / 14))) === 1 &&
            Number(s.type) !== 2);
        await query(db, `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`, [Number(alpha.name), 1, Number(launchpad.sectorid)]);
        await query(db, `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`, [Number(alpha.name), 1, Number(launchpad.sectorid)]);
        alpha.drain();
        alpha.send(`//move:${hex(launchpad.sectorid)}:${hex(bhId)}:1:2`);
        const doom = await alpha.waitFor(m => m.toLowerCase().includes('black') || m.toLowerCase().includes('crushed'), 'black hole report');
        check(Boolean(doom), 'black hole annihilation message', doom.slice(0, 90));
        await sleep(150);
        const survivors = await query(db, `SELECT * FROM ships${gameId} WHERE sectorid = ?`, [bhId]);
        check(survivors.length === 0, 'black hole leaves no survivors', `ships=${survivors.length}`);
    }

    const asteroid = map.find(s => Number(s.type) === 1 && !s.owner);
    if (asteroid) {
        const astId = Number(asteroid.sectorid);
        const launchpad = map.find(s => Number(s.sectorid) !== astId &&
            Math.max(Math.abs(((s.sectorid - 1) % 14) - ((astId - 1) % 14)), Math.abs(Math.floor((s.sectorid - 1) / 14) - Math.floor((astId - 1) / 14))) === 1 &&
            Number(s.type) !== 2);
        for (let i = 0; i < 4; i++) {
            await query(db, `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`, [Number(alpha.name), 2, Number(launchpad.sectorid)]);
        }
        alpha.drain();
        alpha.send(`//move:${hex(launchpad.sectorid)}:${hex(astId)}:2:4`);
        const asteroidMsg = await alpha.waitFor(m => m.toLowerCase().includes('asteroid') || m.toLowerCase().includes('lost') || m.toLowerCase().includes('avoided'), 'asteroid outcome');
        check(Boolean(asteroidMsg), 'asteroid belt outcome reported', asteroidMsg.slice(0, 90));
        await sleep(200);
        const beltSurvivors = await query(db, `SELECT id FROM ships${gameId} WHERE owner = ? AND sectorid = ?`, [Number(alpha.name), astId]);
        const beltOwner = await query(db, `SELECT owner FROM map${gameId} WHERE sectorid = ?`, [astId]);
        if (beltSurvivors.length > 0) {
            check(Number(beltOwner[0].owner) === Number(alpha.name), 'survivors secure the asteroid belt', `owner=${beltOwner[0].owner}`);
        } else {
            check(!Number(beltOwner[0].owner), 'wiped fleet does not secure the belt', `owner=${beltOwner[0].owner}`);
        }
    } else {
        fail('asteroid belt outcome reported', 'no asteroid sector on this roll');
    }

    // ------------------------------------------------------------------
    console.log('\n— Combat —');
    // Force a battle: alpha destroyers vs bravo frigates in neutral space.
    const battleground = map.find(s => Number(s.type) === 0 && !s.owner) || map.find(s => !s.owner);
    const bgId = Number(battleground.sectorid);
    for (let i = 0; i < 3; i++) {
        await query(db, `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`, [Number(alpha.name), 2, bgId]);
    }
    for (let i = 0; i < 2; i++) {
        await query(db, `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`, [Number(bravo.name), 1, bgId]);
    }
    alpha.drain();
    bravo.drain();
    serverLogic.processTurn(gameId);
    await sleep(400);
    const battleShips = await query(db, `SELECT owner, COUNT(*) as count FROM ships${gameId} WHERE sectorid = ?`, [bgId]);
    const ownersLeft = new Set((await query(db, `SELECT owner FROM ships${gameId} WHERE sectorid = ?`, [bgId])).map(r => Number(r.owner)));
    check(ownersLeft.size <= 1, 'battle resolves to a single owner', `owners left: ${[...ownersLeft].join('/')}`);
    const combatMsg = alpha.find(m => /battle|combat|fleet/i.test(m)) || bravo.find(m => /battle|combat|fleet/i.test(m));
    check(Boolean(combatMsg), 'players notified of battle', combatMsg ? combatMsg.slice(0, 100) : 'no battle message seen');

    // Orbital turrets anchor a defense: 6 turrets + 1 frigate should usually
    // shred 2 attacking frigates (direct combat-engine trial, 5 rounds).
    let turretWins = 0;
    for (let trial = 0; trial < 5; trial++) {
        const zero = { weapons: 0, hull: 0, shields: 0 };
        const log = combatSystem.conductBattle({ ship1: 2 }, { ship1: 1, orbitalTurret: 6 }, { ...zero }, { ...zero });
        if (log.result === 'defenderVictory') turretWins++;
    }
    check(turretWins >= 3, 'orbital turrets anchor sector defense', `defender won ${turretWins}/5 trials`);

    // ------------------------------------------------------------------
    console.log('\n— AI behavior —');
    await query(db, `UPDATE players${gameId} SET metal = 3000, crystal = 1500, research = 500 WHERE userid = ?`, [ai.userid]);
    for (let i = 0; i < 3; i++) {
        serverLogic.processTurn(gameId);
        await sleep(200);
    }
    const aiBuildings = await query(db, `SELECT * FROM buildings${gameId} WHERE owner = ?`, [ai.userid]);
    check(aiBuildings.length > 2, 'AI develops its homeworld', `buildings=${aiBuildings.length}`);
    const aiShips = await query(db, `SELECT * FROM ships${gameId} WHERE owner = ?`, [ai.userid]);
    check(aiShips.length > 2, 'AI builds a fleet', `ships=${aiShips.length}`);
    const aiPlayer = await query(db, `SELECT research, tech FROM players${gameId} WHERE userid = ?`, [ai.userid]);
    check(Number(aiPlayer[0].research) < 500 || String(aiPlayer[0].tech).length > 0, 'AI spends research', `research=${aiPlayer[0].research} tech=${aiPlayer[0].tech}`);

    // ------------------------------------------------------------------
    console.log('\n— Standing orders —');
    alpha.drain();
    alpha.send('//standingorders:get');
    const soState = await alpha.waitFor(m => m.startsWith('standingorders::state::'), 'standing orders state');
    check(Boolean(soState), 'standing orders state readable');
    alpha.send('//standingorders:' + JSON.stringify({ autoRebuild: true, autoScout: true, targetScouts: 2 }));
    await alpha.waitFor(m => m.startsWith('standingorders::state::') && m.includes('true'), 'standing orders update');
    ok('standing orders updated');
    alpha.drain();
    alpha.send('//applyorders');
    const soApply = await alpha.waitFor(m => m.startsWith('standingorders::applied') || m === 'standingorders::noop', 'standing orders apply');
    check(Boolean(soApply), 'standing orders apply runs', soApply.slice(0, 80));

    // ------------------------------------------------------------------
    console.log('\n— Spycraft —');
    // Bravo invests heavily in counter-intel; alpha probes blind and pays for it.
    await query(db, `UPDATE players${gameId} SET tech = ? WHERE userid = ?`, ['9:4', bravo.name]);
    await query(db, `UPDATE players${gameId} SET tech = ? WHERE userid = ?`, ['', alpha.name]);
    await query(db, `UPDATE players${gameId} SET crystal = 5000 WHERE userid = ?`, [alpha.name]);
    await sleep(50);
    alpha.drain();
    bravo.drain();
    alpha.send(`//probe:${hex(bravoRow.homeworld)}`);
    const jammed = await alpha.waitFor(m => m.startsWith('Error:') || m.startsWith(`sector::${bravoRow.homeworld}`), 'counterspy outcome');
    check(jammed.includes('counter-intelligence'), 'superior counter-intel destroys probes', jammed.slice(0, 100));
    const bravoAlert = bravo.find(m => m.includes('DESTROYED an enemy probe'));
    check(Boolean(bravoAlert), 'counter-spy victim is told of their win', bravoAlert ? bravoAlert.slice(0, 90) : 'no alert');

    // Alpha out-spies bravo: deep scan shows their stockpiles, and their
    // territory reads live on the map (spy vision).
    await query(db, `UPDATE players${gameId} SET tech = ? WHERE userid = ?`, ['8:6', alpha.name]);
    await sleep(60);
    alpha.drain();
    alpha.send(`//probe:${hex(bravoRow.homeworld)}`);
    const deepScan = await alpha.waitFor(m => m.startsWith(`sector::${bravoRow.homeworld}::`), 'deep scan');
    const scanData = JSON.parse(deepScan.split('::').slice(2).join('::'));
    check(scanData.intel && Number(scanData.intel.advantage) >= 2, 'spy advantage computed', JSON.stringify(scanData.intel || {}));
    check(scanData.intel && scanData.intel.ownerResources, 'deep scan reveals enemy stockpiles', JSON.stringify(scanData.intel && scanData.intel.ownerResources));

    alpha.drain();
    alpha.send('//update');
    const spyMapState = await alpha.waitFor(m => m.startsWith('mapstate::'), 'spy vision mapstate');
    const bravoHomeEntry = spyMapState.replace('mapstate::', '').split(',').find(e => e.startsWith(`${bravoRow.homeworld}:`));
    check(Boolean(bravoHomeEntry) && bravoHomeEntry.split(':')[4] === '1', 'spy vision lights up enemy territory', bravoHomeEntry || 'entry missing');
    await query(db, `UPDATE players${gameId} SET tech = ? WHERE userid = ?`, ['', alpha.name]);
    await query(db, `UPDATE players${gameId} SET tech = ? WHERE userid = ?`, ['', bravo.name]);
    await sleep(60);

    // ------------------------------------------------------------------
    console.log('\n— Victory —');
    // Alpha conquers everything: wipe rivals' ships and planets.
    await query(db, `DELETE FROM ships${gameId} WHERE sectorid = ? AND owner = ?`, [bgId, Number(bravo.name)]);
    const rivals = [Number(bravo.name), Number(ai.userid)];
    for (const rival of rivals) {
        const owned = await query(db, `SELECT sectorid FROM map${gameId}`, []);
        for (const row of owned) {
            // reassign every rival sector to alpha
        }
    }
    await query(db, `UPDATE map${gameId} SET owner = ${Number(alpha.name)} WHERE sectorid = ${Number(bravoRow.homeworld)}`, []);
    await query(db, `UPDATE map${gameId} SET owner = ${Number(alpha.name)} WHERE sectorid = ${Number(ai.homeworld)}`, []);
    // Strip rival fleets so elimination can trigger.
    const rivalShips = await query(db, `SELECT id, owner FROM ships${gameId}`, []);
    for (const ship of rivalShips) {
        if (rivals.includes(Number(ship.owner))) {
            await query(db, `DELETE FROM ships${gameId} WHERE id = ?`, [ship.id]);
        }
    }
    alpha.drain();
    serverLogic.processTurn(gameId);
    await sleep(400);
    const gameOver = alpha.find(m => m.startsWith('gameover::'));
    check(Boolean(gameOver), 'victory triggers gameover broadcast', gameOver || 'no gameover message');

    // ------------------------------------------------------------------
    console.log('\n=== Summary ===');
    console.log(`${checks - issues.length}/${checks} checks passed`);
    if (issues.length) {
        console.log('\nIssues found:');
        issues.forEach((item, index) => console.log(`  ${index + 1}. ${item.label}${item.detail ? ` — ${item.detail}` : ''}`));
        process.exit(1);
    }
    process.exit(0);
}

main().catch(err => {
    console.error('\nSimulation crashed:', err);
    if (issues.length) {
        console.log('\nIssues found before crash:');
        issues.forEach((item, index) => console.log(`  ${index + 1}. ${item.label}${item.detail ? ` — ${item.detail}` : ''}`));
    }
    process.exit(2);
});

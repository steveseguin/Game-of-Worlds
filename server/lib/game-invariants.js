/**
 * Read-only integrity checks for a persisted game snapshot. These checks never
 * repair state: callers can fail tests or raise an operational alert without
 * introducing a second mutation path beside the game engine.
 */

const BUILDING_SLOTS_BY_TYPE = Object.freeze({ 1: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6 });
const { gameTables, requireGameId } = require('./game-tables');

function numericId(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function addIssue(collection, code, message, context = {}) {
    collection.push({ code, message, ...context });
}

function evaluateGameState(snapshot, runtime = {}) {
    const game = snapshot?.game || {};
    const players = Array.isArray(snapshot?.players) ? snapshot.players : [];
    const sectors = Array.isArray(snapshot?.sectors) ? snapshot.sectors : [];
    const ships = Array.isArray(snapshot?.ships) ? snapshot.ships : [];
    const buildings = Array.isArray(snapshot?.buildings) ? snapshot.buildings : [];
    const errors = [];
    const warnings = [];

    const playerIds = new Set();
    players.forEach(player => {
        const playerId = numericId(player.userid);
        if (!playerId) {
            addIssue(errors, 'INVALID_PLAYER_ID', 'Player has an invalid user id', { value: player.userid });
            return;
        }
        if (playerIds.has(playerId)) {
            addIssue(errors, 'DUPLICATE_PLAYER', 'Player appears more than once', { playerId });
        }
        playerIds.add(playerId);
        ['metal', 'crystal', 'research'].forEach(resource => {
            const amount = Number(player[resource]);
            if (!Number.isFinite(amount) || amount < 0) {
                addIssue(errors, 'INVALID_RESOURCE', `${resource} must be a finite non-negative value`, {
                    playerId, resource, value: player[resource]
                });
            }
        });
        [
            ['last_automation_turn', 'INVALID_AUTOMATION_TURN'],
            ['last_income_turn', 'INVALID_INCOME_TURN']
        ].forEach(([field, code]) => {
            if (player[field] === undefined || player[field] === null) return;
            const markerTurn = Number(player[field]);
            if (!Number.isSafeInteger(markerTurn) || markerTurn < 0) {
                addIssue(errors, code, `${field} must be a non-negative integer`, {
                    playerId, value: player[field]
                });
            }
        });
    });

    const sectorIds = new Set();
    const sectorById = new Map();
    sectors.forEach(sector => {
        const sectorId = numericId(sector.sectorid);
        const type = Number(sector.type ?? sector.sectortype);
        if (!sectorId) {
            addIssue(errors, 'INVALID_SECTOR_ID', 'Sector has an invalid id', { value: sector.sectorid });
            return;
        }
        if (sectorIds.has(sectorId)) {
            addIssue(errors, 'DUPLICATE_SECTOR', 'Sector appears more than once', { sectorId });
        }
        sectorIds.add(sectorId);
        sectorById.set(sectorId, sector);
        if (!Number.isInteger(type) || type < 0 || type > 10) {
            addIssue(errors, 'INVALID_SECTOR_TYPE', 'Sector type is outside the supported range', { sectorId, type });
        }
        const owner = sector.owner === null || sector.owner === undefined ? null : numericId(sector.owner);
        if (sector.owner !== null && sector.owner !== undefined && !owner) {
            addIssue(errors, 'INVALID_SECTOR_OWNER', 'Sector owner is invalid', { sectorId, value: sector.owner });
        } else if (owner && !playerIds.has(owner)) {
            addIssue(errors, 'ORPHAN_SECTOR_OWNER', 'Sector is owned by a non-player', { sectorId, owner });
        }
    });

    players.forEach(player => {
        const playerId = numericId(player.userid);
        ['homeworld', 'currentsector'].forEach(field => {
            const value = player[field];
            if (value === null || value === undefined || Number(value) === 0) return;
            const sectorId = numericId(value);
            if (!sectorId || !sectorIds.has(sectorId)) {
                addIssue(errors, 'INVALID_PLAYER_SECTOR', `${field} does not reference a live sector`, {
                    playerId, field, value
                });
            }
        });
    });

    const shipIds = new Set();
    ships.forEach(ship => {
        const shipId = numericId(ship.id);
        const owner = numericId(ship.owner);
        const sectorId = numericId(ship.sectorid);
        const type = Number(ship.type);
        if (!shipId) addIssue(errors, 'INVALID_SHIP_ID', 'Ship has an invalid id', { value: ship.id });
        else if (shipIds.has(shipId)) addIssue(errors, 'DUPLICATE_SHIP', 'Ship appears more than once', { shipId });
        else shipIds.add(shipId);
        if (!owner || !playerIds.has(owner)) addIssue(errors, 'ORPHAN_SHIP_OWNER', 'Ship owner is not a player', { shipId, owner: ship.owner });
        if (!sectorId || !sectorIds.has(sectorId)) addIssue(errors, 'ORPHAN_SHIP_SECTOR', 'Ship sector does not exist', { shipId, sectorId: ship.sectorid });
        if (!Number.isInteger(type) || type < 1 || type > 9) addIssue(errors, 'INVALID_SHIP_TYPE', 'Ship type is invalid', { shipId, type });
    });

    const buildingIds = new Set();
    const buildingCountBySector = new Map();
    buildings.forEach(building => {
        const buildingId = numericId(building.id);
        const owner = numericId(building.owner);
        const sectorId = numericId(building.sectorid);
        const type = Number(building.type);
        if (!buildingId) addIssue(errors, 'INVALID_BUILDING_ID', 'Building has an invalid id', { value: building.id });
        else if (buildingIds.has(buildingId)) addIssue(errors, 'DUPLICATE_BUILDING', 'Building appears more than once', { buildingId });
        else buildingIds.add(buildingId);
        if (!owner || !playerIds.has(owner)) addIssue(errors, 'ORPHAN_BUILDING_OWNER', 'Building owner is not a player', { buildingId, owner: building.owner });
        if (!sectorId || !sectorIds.has(sectorId)) {
            addIssue(errors, 'ORPHAN_BUILDING_SECTOR', 'Building sector does not exist', { buildingId, sectorId: building.sectorid });
        } else {
            buildingCountBySector.set(sectorId, (buildingCountBySector.get(sectorId) || 0) + 1);
            const sectorOwner = numericId(sectorById.get(sectorId)?.owner);
            if (owner && sectorOwner !== owner) {
                addIssue(errors, 'BUILDING_OWNER_MISMATCH', 'Building owner does not own its sector', {
                    buildingId, sectorId, owner, sectorOwner
                });
            }
        }
        if (!Number.isInteger(type) || type < 0 || type > 5) addIssue(errors, 'INVALID_BUILDING_TYPE', 'Building type is invalid', { buildingId, type });
    });

    buildingCountBySector.forEach((count, sectorId) => {
        const sectorType = Number(sectorById.get(sectorId)?.type ?? sectorById.get(sectorId)?.sectortype);
        const limit = BUILDING_SLOTS_BY_TYPE[sectorType] || 0;
        if (count > limit) {
            addIssue(errors, 'BUILDING_CAPACITY_EXCEEDED', 'Sector exceeds its building capacity', {
                sectorId, sectorType, count, limit
            });
        }
    });

    const started = Number(game.started) === 1 || String(game.status || '').toLowerCase() === 'in-progress';
    const persistedTurn = Number(game.turn);
    if (started && players.length === 0) addIssue(errors, 'STARTED_WITHOUT_PLAYERS', 'Started game has no players');
    if (started && sectors.length === 0) addIssue(errors, 'STARTED_WITHOUT_MAP', 'Started game has no sectors');
    if (started) {
        players.forEach(player => {
            const playerId = numericId(player.userid);
            ['homeworld', 'currentsector'].forEach(field => {
                if (!numericId(player[field])) {
                    addIssue(errors, 'MISSING_PLAYER_SECTOR', `Started player has no ${field}`, { playerId, field });
                }
            });
        });
    }
    if (started && (!Number.isSafeInteger(persistedTurn) || persistedTurn < 1)) {
        addIssue(errors, 'INVALID_GAME_TURN', 'Started game has an invalid persisted turn', { value: game.turn });
    }
    players.forEach(player => {
        [
            ['last_automation_turn', 'AUTOMATION_TURN_AHEAD', 'automationTurn'],
            ['last_income_turn', 'INCOME_TURN_AHEAD', 'incomeTurn']
        ].forEach(([field, code, contextKey]) => {
            const markerTurn = Number(player[field]);
            if (Number.isSafeInteger(markerTurn) && Number.isSafeInteger(persistedTurn) && markerTurn > persistedTurn) {
                addIssue(errors, code, `Player ${field} marker is ahead of the persisted game turn`, {
                    playerId: numericId(player.userid), [contextKey]: markerTurn, persistedTurn
                });
            }
        });
    });
    const persistedPhase = game.turn_phase === null || game.turn_phase === undefined
        ? ''
        : String(game.turn_phase).toLowerCase();
    if (persistedPhase && !['automation', 'income', 'battles', 'victory'].includes(persistedPhase)) {
        addIssue(errors, 'INVALID_TURN_PHASE', 'Persisted turn phase is not recognized', { phase: game.turn_phase });
    }
    if (runtime.turnResolution && !persistedPhase) {
        addIssue(warnings, 'RUNTIME_PHASE_WITHOUT_PERSISTENCE', 'Runtime is resolving a turn without a persisted phase marker');
    }
    if (runtime.turn !== undefined && Number.isSafeInteger(persistedTurn) && Number(runtime.turn) !== persistedTurn) {
        addIssue(warnings, 'RUNTIME_TURN_MISMATCH', 'Runtime and persisted turn differ', {
            runtimeTurn: Number(runtime.turn), persistedTurn
        });
    }
    const status = String(game.status || '').toLowerCase();
    const terminal = status === 'completed' || status === 'abandoned';
    if (terminal && runtime.active === true) {
        addIssue(errors, 'TERMINAL_RUNTIME_ACTIVE', 'Terminal game still has active runtime state', { status });
    }
    if (terminal && runtime.hasTimer === true) {
        addIssue(errors, 'TERMINAL_TIMER_ACTIVE', 'Terminal game still has a turn timer', { status });
    }
    if (terminal && runtime.battlePaused === true) {
        addIssue(errors, 'TERMINAL_BATTLE_PAUSE', 'Terminal game still has a battle pause', { status });
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        counts: {
            players: players.length,
            sectors: sectors.length,
            ships: ships.length,
            buildings: buildings.length
        }
    };
}

function query(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => err ? reject(err) : resolve(Array.isArray(rows) ? rows : []));
    });
}

async function auditGameState(db, gameId, runtime = {}) {
    let parsedGameId;
    try {
        parsedGameId = requireGameId(gameId);
    } catch (_error) {
        throw new Error('Invalid game id');
    }
    const tables = gameTables(parsedGameId);
    const [games, players, sectors, ships, buildings] = await Promise.all([
        query(db, 'SELECT * FROM games WHERE id = ? LIMIT 1', [parsedGameId]),
        query(db, `SELECT * FROM ${tables.players}`),
        query(db, `SELECT * FROM ${tables.map}`),
        query(db, `SELECT * FROM ${tables.ships}`),
        query(db, `SELECT * FROM ${tables.buildings}`)
    ]);
    if (!games[0]) throw new Error('Game not found');
    return evaluateGameState({ game: games[0], players, sectors, ships, buildings }, runtime);
}

module.exports = { BUILDING_SLOTS_BY_TYPE, evaluateGameState, auditGameState };

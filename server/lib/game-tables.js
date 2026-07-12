const TABLE_BASES = Object.freeze([
    'map',
    'players',
    'ships',
    'buildings',
    'diplomacy',
    'wonders',
    'explored_sectors',
    'game_snapshots'
]);

const TABLE_BASE_SET = new Set(TABLE_BASES);

function requireGameId(value) {
    const gameId = Number(value);
    if (!Number.isSafeInteger(gameId) || gameId <= 0) {
        throw new TypeError('Game id must be a positive safe integer');
    }
    return gameId;
}

function gameTable(base, gameId) {
    if (!TABLE_BASE_SET.has(base)) {
        throw new TypeError(`Unsupported per-game table: ${base}`);
    }
    return `${base}${requireGameId(gameId)}`;
}

function gameTables(gameId) {
    const normalized = requireGameId(gameId);
    return Object.freeze(Object.fromEntries(
        TABLE_BASES.map(base => [base, `${base}${normalized}`])
    ));
}

module.exports = { TABLE_BASES, requireGameId, gameTable, gameTables };

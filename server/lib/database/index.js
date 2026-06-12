// ============================================================================
// DATABASE OPERATIONS
// Centralized database query helpers and operations
// ============================================================================

let db = null;

function setDatabase(database) {
    db = database;
}

// ============================================================================
// GENERIC QUERY HELPER
// ============================================================================

function queryDb(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!db || !db.query) {
            reject(new Error('Database not initialized'));
            return;
        }

        db.query(sql, params, (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
}

// ============================================================================
// PLAYER OPERATIONS
// ============================================================================

function getPlayerData(gameId, playerId) {
    return queryDb(
        `SELECT * FROM players${gameId} WHERE userid = ?`,
        [playerId]
    );
}

function updatePlayerResources(gameId, playerId, metal, crystal, research) {
    return queryDb(
        `UPDATE players${gameId} SET metal = ?, crystal = ?, research = ? WHERE userid = ?`,
        [metal, crystal, research, playerId]
    );
}

// ============================================================================
// SHIP OPERATIONS
// ============================================================================

function getShipsInSector(gameId, sectorId) {
    return queryDb(
        `SELECT owner, type, COUNT(*) as count FROM ships${gameId}
         WHERE sectorid = ? GROUP BY owner, type`,
        [sectorId]
    );
}

function getPlayerShips(gameId, playerId) {
    return queryDb(
        `SELECT sectorid, type, COUNT(*) as count FROM ships${gameId}
         WHERE owner = ? GROUP BY sectorid, type`,
        [playerId]
    );
}

function moveShips(gameId, shipIds, toSectorId) {
    const idList = shipIds.join(',');
    return queryDb(
        `UPDATE ships${gameId} SET sectorid = ? WHERE id IN (${idList})`,
        [toSectorId]
    );
}

function createShip(gameId, playerId, shipType, sectorId) {
    return queryDb(
        `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`,
        [playerId, shipType, sectorId]
    );
}

function deleteShips(gameId, shipIds) {
    if (shipIds.length === 0) return Promise.resolve();
    const idList = shipIds.join(',');
    return queryDb(`DELETE FROM ships${gameId} WHERE id IN (${idList})`);
}

// ============================================================================
// BUILDING OPERATIONS
// ============================================================================

function getBuildingsInSector(gameId, sectorId) {
    return queryDb(
        `SELECT type FROM buildings${gameId} WHERE sectorid = ?`,
        [sectorId]
    );
}

function getPlayerBuildings(gameId, playerId) {
    return queryDb(
        `SELECT sectorid, type FROM buildings${gameId} WHERE sectorid IN
         (SELECT sectorid FROM map${gameId} WHERE owner = ?)`,
        [playerId]
    );
}

// ============================================================================
// SECTOR OPERATIONS
// ============================================================================

function getSector(gameId, sectorId) {
    return queryDb(
        `SELECT * FROM map${gameId} WHERE sectorid = ?`,
        [sectorId]
    );
}

function updateSectorOwner(gameId, sectorId, playerId) {
    return queryDb(
        `UPDATE map${gameId} SET owner = ? WHERE sectorid = ?`,
        [playerId, sectorId]
    );
}

// ============================================================================
// EXPLORATION TRACKING
// ============================================================================

function isExplored(gameId, playerId, sectorId) {
    return queryDb(
        `SELECT sectorid FROM explored_sectors${gameId}
         WHERE playerid = ? AND sectorid = ?`,
        [playerId, sectorId]
    ).then(results => results && results.length > 0);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    setDatabase,
    queryDb,

    // Player operations
    getPlayerData,
    updatePlayerResources,

    // Ship operations
    getShipsInSector,
    getPlayerShips,
    moveShips,
    createShip,
    deleteShips,

    // Building operations
    getBuildingsInSector,
    getPlayerBuildings,

    // Sector operations
    getSector,
    updateSectorOwner,

    // Exploration
    isExplored
};

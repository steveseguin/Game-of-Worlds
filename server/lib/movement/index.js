// ============================================================================
// MOVEMENT & EXPLORATION SYSTEM
// This module handles fleet movement, sector exploration, and visibility.
// Hazard mechanics (black holes, asteroid belts, probe destruction) are
// implemented in hazards.js to keep all risk/reward mechanics in one place.
// ============================================================================

const utils = require('../utils');
const hazards = require('./hazards');

let db = null;
let gameState = null;

function setDependencies(database, gs) {
    db = database;
    gameState = gs;
    hazards.setDependencies(database, gs);
}

// ============================================================================
// ADJACENT SECTOR UTILITIES
// ============================================================================

function areAdjacentSectors(sector1, sector2, width = 14) {
    const x1 = sector1 % width;
    const y1 = Math.floor(sector1 / width);
    const x2 = sector2 % width;
    const y2 = Math.floor(sector2 / width);

    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);

    // Check if adjacent (including diagonals)
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
}

// ============================================================================
// VISIBILITY & EXPLORATION TRACKING
// ============================================================================

function canPlayerSeeSector(gameId, playerId, sectorId, callback) {
    // Player can see a sector if:
    // 1. They own it
    // 2. They have explored it
    // 3. They have a ship in it
    // 4. It's an allied sector

    db.query(
        `SELECT owner FROM map${gameId} WHERE sectorid = ?`,
        [sectorId],
        (err, sectors) => {
            if (err || !sectors.length) return callback(false);

            const sector = sectors[0];

            // Own it
            if (sector.owner === playerId) return callback(true);

            // Check if explored
            db.query(
                `SELECT sectorid FROM explored_sectors${gameId} WHERE playerid = ? AND sectorid = ?`,
                [playerId, sectorId],
                (err, explored) => {
                    if (!err && explored && explored.length > 0) return callback(true);

                    // Check if has ships there
                    db.query(
                        `SELECT id FROM ships${gameId} WHERE owner = ? AND sectorid = ? LIMIT 1`,
                        [playerId, sectorId],
                        (err, ships) => {
                            callback(!err && ships && ships.length > 0);
                        }
                    );
                }
            );
        }
    );
}

function markSectorExplored(gameId, playerId, sectorId) {
    // Mark sector as explored by player (ignore if already explored)
    db.query(
        `INSERT IGNORE INTO explored_sectors${gameId} (playerid, sectorid) VALUES (?, ?)`,
        [playerId, sectorId],
        (err) => {
            if (err) console.error('Error marking sector explored:', err);
        }
    );
}

// ============================================================================
// SECTOR UPDATES & BROADCASTING
// ============================================================================

function updateSector2(gameId, sectorId) {
    // Get sector data
    db.query(
        `SELECT * FROM map${gameId} WHERE sectorid = ?`,
        [sectorId],
        (err, sector) => {
            if (err || sector.length === 0) return;

            // Get ships in sector
            db.query(
                `SELECT owner, type, COUNT(*) as count
                 FROM ships${gameId}
                 WHERE sectorid = ?
                 GROUP BY owner, type`,
                [sectorId],
                (err, ships) => {
                    if (err) ships = [];

                    // Get buildings in sector
                    db.query(
                        `SELECT type FROM buildings${gameId} WHERE sectorid = ?`,
                        [sectorId],
                        (err, buildings) => {
                            if (err) buildings = [];

                            const sectorData = {
                                sector: sector[0],
                                ships: ships,
                                buildings: buildings
                            };

                            // Send sector data to each player who can see it
                            gameState.clients.forEach(client => {
                                if (client.gameid === gameId) {
                                    const playerId = Number(client.name);
                                    canPlayerSeeSector(gameId, playerId, sectorId, (canSee) => {
                                        if (canSee) {
                                            client.sendUTF(`sector::${sectorId}::${JSON.stringify(sectorData)}`);
                                        }
                                    });
                                }
                            });
                        }
                    );
                }
            );
        }
    );
}

function updateSector(data, connection) {
    const parts = data.split(":");
    const sectorId = utils.parseSectorToken(parts[1]);
    const gameId = connection.gameid;

    if (!Number.isFinite(sectorId)) {
        connection.sendUTF("Error: Invalid sector");
        return;
    }

    updateSector2(gameId, sectorId);
    sendMultiMoveOptions(connection, gameId, sectorId);
}

// ============================================================================
// PROBE SECTOR (EXPLORATION WITH HAZARD RISK)
// Probes can be destroyed by hazards
// ============================================================================

function probeSector(data, connection) {
    const parts = data.split(":");
    const targetSector = parseInt(parts[1]);
    const playerId = connection.name;
    const gameId = connection.gameid;

    // Check if player has probe technology
    db.query(
        `SELECT tech FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (err, results) => {
            if (err || results.length === 0) {
                connection.sendUTF("Error: Could not get player data");
                return;
            }

            const playerTech = results[0].tech ? results[0].tech.split(',').map(Number) : [];
            if (!playerTech.includes(15)) { // Probe Scanner tech ID
                connection.sendUTF("Error: Probe Scanner technology required");
                return;
            }

            // Get sector information
            db.query(
                `SELECT * FROM map${gameId} WHERE sectorid = ?`,
                [targetSector],
                (err, sector) => {
                    if (err || sector.length === 0) {
                        connection.sendUTF("Error: Invalid sector");
                        return;
                    }

                    const sectorType = sector[0].type;

                    // Check if probe will be destroyed by hazards
                    hazards.checkProbeHazard(gameId, sectorType, connection, (result) => {
                        if (result.destroyed) {
                            // Probe destroyed - don't reveal sector, don't mark as explored
                            return;
                        }

                        // Probe survives - reveal sector information
                        // Mark sector as explored
                        markSectorExplored(gameId, playerId, targetSector);

                        // Get ships in sector
                        db.query(
                            `SELECT owner, type, COUNT(*) as count
                             FROM ships${gameId}
                             WHERE sectorid = ?
                             GROUP BY owner, type`,
                            [targetSector],
                            (err, ships) => {
                                if (err) ships = [];

                                const probeData = {
                                    sector: sector[0],
                                    ships: ships
                                };

                                connection.sendUTF(`probe::${targetSector}::${JSON.stringify(probeData)}`);
                                // Broadcast sector update to all players who can now see it
                                updateSector2(gameId, targetSector);
                            }
                        );
                    });
                }
            );
        }
    );
}

// ============================================================================
// FLEET MOVEMENT WITH HAZARD CHECKING
// ============================================================================

function moveFleet(data, connection) {
    const parts = data.split(":");
    const fromSector = utils.parseSectorToken(parts[1]);
    const toSector = utils.parseSectorToken(parts[2]);
    const shipTypes = parts[3].split(",").map(Number);
    const shipCounts = parts[4].split(",").map(Number);
    const playerId = connection.name;
    const gameId = connection.gameid;

    // Validate movement
    if (!areAdjacentSectors(fromSector, toSector)) {
        connection.sendUTF("Error: Sectors are not adjacent");
        return;
    }

    // Check crystal cost (1 crystal per ship)
    const totalShips = shipCounts.reduce((a, b) => a + b, 0);

    db.query(
        `SELECT crystal FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (err, results) => {
            if (err || results.length === 0) {
                connection.sendUTF("Error: Could not get player data");
                return;
            }

            if (results[0].crystal < totalShips) {
                connection.sendUTF("Error: Not enough crystal for movement");
                return;
            }

            // Get destination sector info for hazard checking
            db.query(
                `SELECT type FROM map${gameId} WHERE sectorid = ?`,
                [toSector],
                (sectorErr, sectorRows) => {
                    if (sectorErr || !sectorRows.length) {
                        connection.sendUTF("Error: Destination sector not found");
                        return;
                    }

                    const destSectorType = sectorRows[0].type;

                    // Move ships
                    let moved = 0;
                    const allShipIds = [];
                    shipTypes.forEach((type, index) => {
                        const count = shipCounts[index];
                        if (count > 0) {
                            // Get ships to move
                            db.query(
                                `SELECT id FROM ships${gameId}
                                 WHERE owner = ? AND sectorid = ? AND type = ?
                                 LIMIT ?`,
                                [playerId, fromSector, type, count],
                                (err, ships) => {
                                    if (!err && ships.length > 0) {
                                        const shipIds = ships.map(s => s.id);
                                        allShipIds.push(...shipIds);
                                        const shipIdStr = shipIds.join(',');
                                        db.query(
                                            `UPDATE ships${gameId} SET sectorid = ? WHERE id IN (${shipIdStr})`,
                                            [toSector],
                                            (err) => {
                                                if (!err) {
                                                    moved += ships.length;

                                                    // If all ships moved, deduct crystal and process hazards
                                                    if (moved === totalShips) {
                                                        db.query(
                                                            `UPDATE players${gameId} SET crystal = crystal - ? WHERE userid = ?`,
                                                            [totalShips, playerId]
                                                        );

                                                        // Process hazards if sector has them
                                                        processMovementHazards(gameId, playerId, toSector, destSectorType, allShipIds, connection, () => {
                                                            // Mark destination sector as explored
                                                            markSectorExplored(gameId, playerId, toSector);

                                                            // Try auto-colonization
                                                            hazards.handleAutoColonization(gameId, playerId, toSector, () => {
                                                                connection.sendUTF("Success: Fleet moved");
                                                                // These need to be provided by caller
                                                                if (connection.updateResources) connection.updateResources(connection);
                                                                updateSector2(gameId, fromSector);
                                                                updateSector2(gameId, toSector);
                                                            });
                                                        });
                                                    }
                                                }
                                            }
                                        );
                                    }
                                }
                            );
                        }
                    });
                }
            );
        }
    );
}

function processMovementHazards(gameId, playerId, sectorId, sectorType, shipIds, connection, callback) {
    // Check for hazards
    if (sectorType === hazards.SECTOR_TYPES.BLACK_HOLE) {
        hazards.handleBlackHoleArrival(gameId, playerId, sectorId, shipIds, connection, callback);
        return;
    }

    if (sectorType === hazards.SECTOR_TYPES.ASTEROID_BELT) {
        hazards.handleAsteroidBeltArrival(gameId, playerId, sectorId, shipIds, connection, callback);
        return;
    }

    // No hazards
    callback();
}

// ============================================================================
// MULTI-MOVE OPTIONS
// ============================================================================

function sendMultiMoveOptions(connection, gameId, targetSector) {
    const playerId = Number(connection.name);
    const adjacentIds = utils.getAdjacentSectorIds(targetSector);
    if (!Number.isFinite(playerId) || adjacentIds.length === 0) {
        return;
    }

    db.query(
        `SELECT owner FROM map${gameId} WHERE sectorid = ?`,
        [targetSector],
        (sectorErr, sectorRows) => {
            if (sectorErr || !sectorRows || sectorRows.length === 0) {
                return;
            }

            db.query(
                `SELECT sectorid, type, COUNT(*) as count FROM ships${gameId} WHERE owner = ? GROUP BY sectorid, type`,
                [playerId],
                (shipsErr, shipRows) => {
                    if (shipsErr || !Array.isArray(shipRows) || shipRows.length === 0) {
                        return;
                    }

                    const bySector = new Map();
                    shipRows.forEach(row => {
                        const sectorId = Number(row.sectorid);
                        const type = Number(row.type);
                        const count = Number(row.count) || 0;
                        if (!adjacentIds.includes(sectorId) || count <= 0 || type < 1 || type > 9) {
                            return;
                        }

                        if (!bySector.has(sectorId)) {
                            bySector.set(sectorId, new Array(9).fill(0));
                        }
                        bySector.get(sectorId)[type - 1] += count;
                    });

                    if (bySector.size === 0) {
                        return;
                    }

                    const payload = ['mmoptions', utils.formatSectorToken(targetSector)];
                    Array.from(bySector.entries())
                        .sort((a, b) => a[0] - b[0])
                        .forEach(([sectorId, counts]) => {
                            payload.push(utils.formatSectorToken(sectorId));
                            counts.forEach(count => payload.push(String(count)));
                        });

                    connection.sendUTF(payload.join(':'));
                }
            );
        }
    );
}

function preMoveFleet(data, connection) {
    const parts = data.split(":");
    const playerId = Number(connection.name);
    const gameId = connection.gameid;
    const targetSector = utils.parseSectorToken(parts[1]);

    if (!Number.isFinite(playerId) || !gameId || !Number.isFinite(targetSector)) {
        connection.sendUTF("Error: Invalid fleet order");
        return;
    }

    const requestedMoves = new Map();
    for (let i = 2; i + 2 < parts.length; i += 3) {
        const sourceSector = utils.parseSectorToken(parts[i]);
        const shipType = Number.parseInt(parts[i + 1], 10);
        if (!Number.isFinite(sourceSector) || !Number.isFinite(shipType) || shipType < 1 || shipType > 9) {
            continue;
        }

        const key = `${sourceSector}:${shipType}`;
        requestedMoves.set(key, (requestedMoves.get(key) || 0) + 1);
    }

    if (requestedMoves.size === 0) {
        connection.sendUTF("Error: No ships selected");
        return;
    }

    const moveEntries = Array.from(requestedMoves.entries()).map(([key, count]) => {
        const [sourceSector, shipType] = key.split(':').map(Number);
        return { sourceSector, shipType, count };
    });

    for (const entry of moveEntries) {
        if (!areAdjacentSectors(entry.sourceSector, targetSector)) {
            connection.sendUTF(`Error: Source sector ${utils.formatSectorToken(entry.sourceSector)} is not adjacent to target`);
            return;
        }
    }

    // TODO: Implement actual multi-move logic
    connection.sendUTF("Error: Multi-move not yet implemented");
}

function surroundShips(data, connection) {
    connection.sendUTF("Error: Surround feature not yet implemented");
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    setDependencies,

    // Sector utilities
    areAdjacentSectors,

    // Visibility & exploration
    canPlayerSeeSector,
    markSectorExplored,

    // Sector updates
    updateSector2,
    updateSector,

    // Probing
    probeSector,

    // Movement
    moveFleet,
    preMoveFleet,
    surroundShips,

    // Multi-move options
    sendMultiMoveOptions
};

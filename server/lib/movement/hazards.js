// ============================================================================
// HAZARD MECHANICS - RESTORE ORIGINAL GAME PERSONALITY
// This module implements the risk/reward exploration mechanics from the original
// 2012 PHP version, restoring the tension and meaning to player decisions.
//
// Key Mechanics:
// - Black holes: Instant fleet annihilation (sectortype 2)
// - Asteroid belts: Random damage on entry, safe if owned (sectortype 1)
// - Probe risk: Probes destroyed when probing dangerous sectors
// - Auto-colonization: Fleets take control of unowned sectors on arrival
// ============================================================================

const utils = require('../utils');

let db = null;
let gameState = null;

function setDependencies(database, gs) {
    db = database;
    gameState = gs;
}

// ============================================================================
// SECTOR TYPE DEFINITIONS
// ============================================================================

const SECTOR_TYPES = {
    EMPTY_SPACE: 0,      // Safe, no resources, not colonizable
    ASTEROID_BELT: 1,    // Hazard: random damage, safe if owned
    BLACK_HOLE: 2,       // Hazard: instant fleet annihilation
    HAZARD_3: 3,         // Reserved for future hazards
    HAZARD_4: 4,         // Reserved for future hazards
    HAZARD_5: 5,         // Reserved for future hazards
    PLANET_1: 6,         // Colonizable planet (low resources)
    PLANET_2: 7,         // Colonizable planet (medium resources)
    PLANET_3: 8,         // Colonizable planet (high resources)
    PLANET_4: 9,         // Colonizable planet (very high resources)
    HOMEWORLD: 10        // Player's starting sector (always safe)
};

const HAZARD_TYPES = {
    [SECTOR_TYPES.ASTEROID_BELT]: 'asteroid_belt',
    [SECTOR_TYPES.BLACK_HOLE]: 'black_hole'
};

// ============================================================================
// HAZARD DETECTION
// ============================================================================

function isHazardousSector(sectorType) {
    return sectorType === SECTOR_TYPES.ASTEROID_BELT || sectorType === SECTOR_TYPES.BLACK_HOLE;
}

function getHazardType(sectorType) {
    return HAZARD_TYPES[sectorType] || null;
}

// ============================================================================
// BLACK HOLE MECHANICS
// Black holes destroy ALL fleets that enter them
// ============================================================================

function handleBlackHoleArrival(gameId, playerId, sectorId, shipIds, connection, callback) {
    // Get sector details
    db.query(
        `SELECT * FROM map${gameId} WHERE sectorid = ?`,
        [sectorId],
        (err, sectors) => {
            if (err || !sectors.length) {
                callback(false);
                return;
            }

            const sector = sectors[0];

            // Verify this is actually a black hole
            if (sector.type !== SECTOR_TYPES.BLACK_HOLE) {
                callback(false);
                return;
            }

            // Get ship details for narrative message
            db.query(
                `SELECT type, COUNT(*) as count FROM ships${gameId}
                 WHERE id IN (${shipIds.join(',')})
                 GROUP BY type`,
                (err, ships) => {
                    // Delete all ships
                    db.query(
                        `DELETE FROM ships${gameId} WHERE id IN (${shipIds.join(',')})`,
                        (err) => {
                            if (err) {
                                console.error('Error destroying ships in black hole:', err);
                                callback(false);
                                return;
                            }

                            // Send narrative message to player
                            const shipCount = shipIds.length;
                            const message = generateBlackHoleMessage(shipCount, sectorId);

                            if (connection) {
                                connection.sendUTF(message);
                            }

                            // Notify all players about the destroyed fleet
                            broadcastFleetDestruction(gameId, playerId, sectorId, 'black_hole');

                            callback(true);
                        }
                    );
                }
            );
        }
    );
}

function generateBlackHoleMessage(shipCount, sectorId) {
    const sectorToken = utils.formatSectorToken(sectorId);
    const messages = [
        `DISTRESS CALL: Fleet arrived in sector ${sectorToken}... but the sector contained a BLACK HOLE! UH-OH! Our fleet was crushed by the immense gravity! ${shipCount} ships destroyed!`,
        `TRAGEDY: Our expedition to sector ${sectorToken} ended in disaster. The gravitational anomaly was catastrophic. All ${shipCount} vessels lost.`,
        `ALERT: Sector ${sectorToken} is not what our instruments predicted. The black hole's event horizon consumed our entire fleet. ${shipCount} ships annihilated.`
    ];

    const msg = messages[Math.floor(Math.random() * messages.length)];
    return `systemalert::${msg}`;
}

// ============================================================================
// ASTEROID BELT MECHANICS
// Asteroid belts deal random damage on entry, but are safe if you own them
// ============================================================================

function handleAsteroidBeltArrival(gameId, playerId, sectorId, shipIds, connection, callback) {
    // Get sector details
    db.query(
        `SELECT owner FROM map${gameId} WHERE sectorid = ?`,
        [sectorId],
        (err, sectors) => {
            if (err || !sectors.length) {
                callback(false);
                return;
            }

            const sector = sectors[0];

            // Check if player owns this sector - if so, it's safe
            if (sector.owner === playerId) {
                // No damage, but still mark sector as explored
                callback(false); // No hazard damage
                return;
            }

            // Random damage: ~50% chance per ship
            const survivors = shipIds.filter(() => Math.random() > 0.5);
            const lost = shipIds.length - survivors.length;

            if (lost === 0) {
                // Lucky escape
                sendAsteroidBeltMessage(connection, sectorId, 'escape', 0, shipIds.length);
                callback(false); // No hazard occurred
                return;
            }

            if (lost === shipIds.length) {
                // Total loss
                db.query(
                    `DELETE FROM ships${gameId} WHERE id IN (${shipIds.join(',')})`,
                    (err) => {
                        sendAsteroidBeltMessage(connection, sectorId, 'total_loss', lost, shipIds.length);
                        broadcastFleetDestruction(gameId, playerId, sectorId, 'asteroid_belt');
                        callback(true);
                    }
                );
                return;
            }

            // Partial loss
            const shipIdsToRemove = shipIds.slice(0, lost);
            db.query(
                `DELETE FROM ships${gameId} WHERE id IN (${shipIdsToRemove.join(',')})`,
                (err) => {
                    sendAsteroidBeltMessage(connection, sectorId, 'partial_loss', lost, shipIds.length);
                    broadcastFleetDamage(gameId, playerId, sectorId, lost, shipIds.length);
                    callback(true);
                }
            );
        }
    );
}

function sendAsteroidBeltMessage(connection, sectorId, outcome, lost, total) {
    const sectorToken = utils.formatSectorToken(sectorId);
    let msg = '';

    switch (outcome) {
        case 'escape':
            msg = `We avoided being hit in sector ${sectorToken}. Whew! That was close. All ${total} ships survived the asteroid field.`;
            break;
        case 'total_loss':
            msg = `DISASTER: Our fleet entered the asteroid belt in sector ${sectorToken} and took catastrophic damage. We lost our entire fleet! All ${total} ships destroyed!`;
            break;
        case 'partial_loss':
            msg = `WARNING: Our fleet hit asteroids in sector ${sectorToken}. We lost ${lost} ships, but ${total - lost} made it through. If we can control the sector though, that won't happen again.`;
            break;
    }

    if (connection) {
        connection.sendUTF(`systemalert::${msg}`);
    }
}

// ============================================================================
// PROBE MECHANICS
// Probes are destroyed if sent to hazardous sectors
// ============================================================================

function checkProbeHazard(gameId, sectorType, sectorIdOrConnection, connectionOrCallback, maybeCallback) {
    const hasSectorId = Number.isFinite(Number(sectorIdOrConnection));
    const sectorId = hasSectorId ? Number(sectorIdOrConnection) : null;
    const connection = hasSectorId ? connectionOrCallback : sectorIdOrConnection;
    const callback = hasSectorId ? maybeCallback : connectionOrCallback;

    // Check if sector is hazardous
    if (!isHazardousSector(sectorType)) {
        // Safe sector - probe succeeds
        if (typeof callback === 'function') {
            callback({ destroyed: false });
        }
        return;
    }

    // Probe destroyed
    const hazardType = getHazardType(sectorType);
    const sectorToken = utils.formatSectorToken(sectorId || sectorType);

    let msg = '';
    if (hazardType === 'black_hole') {
        msg = `Our probe was destroyed in sector ${sectorToken} - there's a BLACK HOLE there!`;
    } else if (hazardType === 'asteroid_belt') {
        msg = `Our probe was destroyed in sector ${sectorToken} - dangerous asteroid field!`;
    } else {
        msg = `Our probe was destroyed in sector ${sectorToken} - unknown hazard!`;
    }

    if (connection) {
        connection.sendUTF(`systemalert::${msg}`);
    }

    if (typeof callback === 'function') {
        callback({ destroyed: true, hazardType });
    }
}

// ============================================================================
// AUTO-COLONIZATION
// Fleets automatically take control of unowned sectors they move to
// ============================================================================

function handleAutoColonization(gameId, playerId, sectorId, callback) {
    // Check if sector is colonizable and unowned
    db.query(
        `SELECT owner, type FROM map${gameId} WHERE sectorid = ?`,
        [sectorId],
        (err, sectors) => {
            if (err || !sectors.length) {
                callback(false);
                return;
            }

            const sector = sectors[0];

            // Check if unowned and colonizable (type 6-9 are planets)
            if (sector.owner !== null || sector.type < 6 || sector.type > 9) {
                callback(false);
                return;
            }

            // Auto-colonize: take ownership
            db.query(
                `UPDATE map${gameId} SET owner = ? WHERE sectorid = ?`,
                [playerId, sectorId],
                (err) => {
                    if (err) {
                        console.error('Error auto-colonizing sector:', err);
                        callback(false);
                        return;
                    }

                    callback(true);
                }
            );
        }
    );
}

// ============================================================================
// BROADCASTING & NOTIFICATIONS
// ============================================================================

function broadcastFleetDestruction(gameId, playerId, sectorId, hazardType) {
    const sectorToken = utils.formatSectorToken(sectorId);
    const hazardName = hazardType === 'black_hole' ? 'a black hole' : 'asteroids';
    const msg = `A player's fleet was destroyed by ${hazardName} in sector ${sectorToken}!`;

    if (gameState && gameState.clients) {
        gameState.clients.forEach(client => {
            if (Number(client.gameid) === Number(gameId) && Number(client.name) !== playerId) {
                client.sendUTF(`systemalert::${msg}`);
            }
        });
    }
}

function broadcastFleetDamage(gameId, playerId, sectorId, lost, total) {
    const sectorToken = utils.formatSectorToken(sectorId);
    const msg = `A player lost ${lost} ships to asteroids in sector ${sectorToken}!`;

    if (gameState && gameState.clients) {
        gameState.clients.forEach(client => {
            if (Number(client.gameid) === Number(gameId) && Number(client.name) !== playerId) {
                client.sendUTF(`systemalert::${msg}`);
            }
        });
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    setDependencies,

    // Constants
    SECTOR_TYPES,
    HAZARD_TYPES,

    // Hazard detection
    isHazardousSector,
    getHazardType,

    // Black hole mechanics
    handleBlackHoleArrival,
    generateBlackHoleMessage,

    // Asteroid belt mechanics
    handleAsteroidBeltArrival,
    sendAsteroidBeltMessage,

    // Probe mechanics
    checkProbeHazard,

    // Auto-colonization
    handleAutoColonization,

    // Broadcasting
    broadcastFleetDestruction,
    broadcastFleetDamage
};

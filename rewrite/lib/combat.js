/**
 * Combat Mechanics for Galaxy Conquest
 * Handles battle calculations between fleets
 */

// Ship type definitions with base stats
const SHIP_TYPES = {
    FRIGATE: {
        id: 1,
        name: "Frigate",
        attack: 1,
        hull: 1,
        shields: 1,
        movement: 2,
        cost: { metal: 300, crystal: 0 },
        buildSlots: 3,
        movementCost: 200
    },
    DESTROYER: {
        id: 2,
        name: "Destroyer",
        attack: 2,
        hull: 2,
        shields: 1,
        movement: 3,
        cost: { metal: 500, crystal: 0 },
        buildSlots: 5,
        movementCost: 300
    },
    SCOUT: {
        id: 3,
        name: "Scout",
        attack: 0,
        hull: 1,
        shields: 0,
        movement: 1,
        cost: { metal: 200, crystal: 0 },
        buildSlots: 1,
        movementCost: 100
    },
    CRUISER: {
        id: 4,
        name: "Cruiser",
        attack: 1,
        hull: 2,
        shields: 1,
        movement: 2,
        cost: { metal: 900, crystal: 0 },
        buildSlots: 8,
        movementCost: 200
    },
    BATTLESHIP: {
        id: 5,
        name: "Battleship",
        attack: 3,
        hull: 3,
        shields: 2,
        movement: 3,
        cost: { metal: 1600, crystal: 0 },
        buildSlots: 12,
        movementCost: 300
    },
    COLONY_SHIP: {
        id: 6,
        name: "Colony Ship",
        attack: 0,
        hull: 1,
        shields: 1,
        movement: 2,
        cost: { metal: 1000, crystal: 0 },
        buildSlots: 7,
        movementCost: 200
    },
    DREADNOUGHT: {
        id: 7,
        name: "Dreadnought",
        attack: 16,
        hull: 16,
        shields: 5,
        movement: 5,
        cost: { metal: 4400, crystal: 0 },
        buildSlots: 20,
        movementCost: 500
    },
    INTRUDER: {
        id: 8,
        name: "Intruder",
        attack: 8,
        hull: 1,
        shields: 10,
        movement: 2,
        cost: { metal: 1200, crystal: 0 },
        buildSlots: 5,
        movementCost: 200
    },
    CARRIER: {
        id: 9,
        name: "Carrier",
        attack: 4,
        hull: 8,
        shields: 3,
        movement: 3,
        cost: { metal: 3000, crystal: 0 },
        buildSlots: 15,
        movementCost: 300,
        requiresWarpGate: true
    }
};

/**
 * Creates ships for a fleet with appropriate hull points based on tech levels
 * @param {number} count - Number of ships
 * @param {object} shipType - Ship type from SHIP_TYPES
 * @param {number} techLevel - Hull tech level of the player
 * @return {Array} - Array of ship objects
 */
function createShips(count, shipType, techLevel) {
    const ships = [];
    const hullBonus = Math.pow(1.1, techLevel);
    
    for (let i = 0; i < count; i++) {
        ships.push({
            type: shipType.id,
            name: shipType.name,
            attack: shipType.attack,
            hull: shipType.hull * hullBonus,
            maxHull: shipType.hull * hullBonus,
            shields: shipType.shields,
            destroyed: false
        });
    }
    
    return ships;
}

/**
 * Calculate chance to hit based on shield tech
 * @param {number} shieldTech - Shield tech level
 * @return {number} - Hit chance (0.0 to 1.0)
 */
function calculateHitChance(shieldTech) {
    // Base hit chance is 90%, reduced by 5% per shield tech level
    return 0.9 * Math.pow(0.95, shieldTech);
}

/**
 * Calculate damage based on weapon tech
 * @param {number} baseAttack - Base attack value of the ship
 * @param {number} weaponTech - Weapon tech level
 * @return {number} - Damage value
 */
function calculateDamage(baseAttack, weaponTech) {
    // Damage increases by 10% per weapon tech level
    return baseAttack * Math.pow(1.1, weaponTech);
}

/**
 * Determines if a shot hits based on shield tech
 * @param {number} shieldTech - Shield tech level of the target
 * @return {boolean} - Whether the shot hits
 */
function shotHits(shieldTech) {
    return Math.random() < calculateHitChance(shieldTech);
}

/**
 * Conduct combat between two fleets
 * @param {object} attackerFleet - Attacking fleet data
 * @param {object} defenderFleet - Defending fleet data
 * @param {object} attackerTech - Attacker's tech levels
 * @param {object} defenderTech - Defender's tech levels
 * @return {object} - Battle results
 */
function conductBattle(attackerFleet, defenderFleet, attackerTech, defenderTech) {
    // Convert fleet data into ship arrays
    const attackers = [];
    const defenders = [];
    
    // Create attacker ships
    Object.values(SHIP_TYPES).forEach(shipType => {
        const count = attackerFleet[`ship${shipType.id}`] || 0;
        if (count > 0) {
            attackers.push(...createShips(count, shipType, attackerTech.hull));
        }
    });
    
    // Create defender ships
    Object.values(SHIP_TYPES).forEach(shipType => {
        const count = defenderFleet[`ship${shipType.id}`] || 0;
        if (count > 0) {
            defenders.push(...createShips(count, shipType, defenderTech.hull));
        }
    });
    
    // Get orbital turrets and ground defenses
    const orbitalTurrets = defenderFleet.orbitalTurret || 0;
    const groundTurrets = defenderFleet.groundTurret || 0;
    
    // Battle round counter
    let round = 0;
    const maxRounds = 20; // Prevent infinite battles
    
    // Battle log for display
    const battleLog = {
        initial: {
            attackers: JSON.parse(JSON.stringify(attackers.map(ship => ({
                type: ship.type,
                hull: ship.hull
            })))),
            defenders: JSON.parse(JSON.stringify(defenders.map(ship => ({
                type: ship.type,
                hull: ship.hull
            })))),
            orbitalTurrets,
            groundTurrets
        },
        rounds: [],
        result: null
    };
    
    // Battle continues until one side is destroyed or max rounds reached
    while (
        attackers.some(ship => !ship.destroyed) && 
        (defenders.some(ship => !ship.destroyed) || orbitalTurrets > 0 || groundTurrets > 0) && 
        round < maxRounds
    ) {
        round++;
        const roundResult = {
            round,
            attackerDamage: 0,
            defenderDamage: 0,
            attackersDestroyed: 0,
            defendersDestroyed: 0,
            turretsDestroyed: 0
        };
        
        // Attackers fire
        if (attackers.some(ship => !ship.destroyed && ship.attack > 0)) {
            // Calculate total attack shots
            const attackShots = attackers
                .filter(ship => !ship.destroyed && ship.attack > 0)
                .reduce((total, ship) => total + ship.attack, 0);
            
            let shotsRemaining = attackShots;
            
            // First target enemy ships in order of combat priority
            const targetOrder = [
                SHIP_TYPES.BATTLESHIP.id,
                SHIP_TYPES.DESTROYER.id,
                SHIP_TYPES.CRUISER.id,
                SHIP_TYPES.FRIGATE.id,
                SHIP_TYPES.CARRIER.id,
                SHIP_TYPES.INTRUDER.id,
                SHIP_TYPES.SCOUT.id,
                SHIP_TYPES.COLONY_SHIP.id,
                SHIP_TYPES.DREADNOUGHT.id,
            ];
            
            // Target enemy ships in priority order
            for (const targetTypeId of targetOrder) {
                const targets = defenders.filter(ship => !ship.destroyed && ship.type === targetTypeId);
                
                while (shotsRemaining > 0 && targets.length > 0) {
                    const target = targets[0]; // Target first ship of this type
                    
                    if (shotHits(defenderTech.shields)) {
                        const damage = calculateDamage(1, attackerTech.weapons);
                        target.hull -= damage;
                        roundResult.defenderDamage += damage;
                        
                        if (target.hull <= 0) {
                            target.destroyed = true;
                            roundResult.defendersDestroyed++;
                            targets.shift(); // Remove destroyed ship from targets
                        }
                    }
                    
                    shotsRemaining--;
                }
                
                if (shotsRemaining <= 0) break;
            }
            
            // If there are shots remaining and all ships are destroyed, target ground defenses
            if (shotsRemaining > 0 && groundTurrets > 0) {
                while (shotsRemaining > 0 && groundTurrets > 0) {
                    if (shotHits(defenderTech.shields)) {
                        const damage = calculateDamage(1, attackerTech.weapons);
                        groundTurrets -= 1; // Each turret has 1 HP
                        roundResult.turretsDestroyed += 1;
                    }
                    shotsRemaining--;
                }
            }
            
            // If there are still shots and ground turrets are gone, target orbital turrets
            if (shotsRemaining > 0 && orbitalTurrets > 0 && groundTurrets <= 0) {
                while (shotsRemaining > 0 && orbitalTurrets > 0) {
                    if (shotHits(defenderTech.shields)) {
                        const damage = calculateDamage(1, attackerTech.weapons);
                        orbitalTurrets -= 1; // Each turret has 1 HP
                        roundResult.turretsDestroyed += 1;
                    }
                    shotsRemaining--;
                }
            }
        }
        
        // Check if defenders are all destroyed
        if (!defenders.some(ship => !ship.destroyed) && orbitalTurrets <= 0 && groundTurrets <= 0) {
            battleLog.result = "attackerVictory";
            break;
        }
        
        // Defenders fire
        if (defenders.some(ship => !ship.destroyed && ship.attack > 0) || orbitalTurrets > 0) {
            // Calculate total attack shots from ships
            const defenseShots = defenders
                .filter(ship => !ship.destroyed && ship.attack > 0)
                .reduce((total, ship) => total + ship.attack, 0);
            
            // Add shots from orbital turrets (each turret fires 1 shot)
            const totalDefenseShots = defenseShots + orbitalTurrets;
            let shotsRemaining = totalDefenseShots;
            
            // Target attackers in priority order
            const targetOrder = [
                SHIP_TYPES.BATTLESHIP.id,
                SHIP_TYPES.DREADNOUGHT.id,
                SHIP_TYPES.CARRIER.id,
                SHIP_TYPES.CRUISER.id,
                SHIP_TYPES.DESTROYER.id,
                SHIP_TYPES.FRIGATE.id,
                SHIP_TYPES.INTRUDER.id,
                SHIP_TYPES.SCOUT.id,
                SHIP_TYPES.COLONY_SHIP.id,
            ];
            
            for (const targetTypeId of targetOrder) {
                const targets = attackers.filter(ship => !ship.destroyed && ship.type === targetTypeId);
                
                while (shotsRemaining > 0 && targets.length > 0) {
                    const target = targets[0];
                    
                    if (shotHits(attackerTech.shields)) {
                        // Orbital turrets do fixed damage, ships do damage based on defender tech
                        const damage = calculateDamage(1, defenderTech.weapons);
                        target.hull -= damage;
                        roundResult.attackerDamage += damage;
                        
                        if (target.hull <= 0) {
                            target.destroyed = true;
                            roundResult.attackersDestroyed++;
                            targets.shift(); // Remove destroyed ship
                        }
                    }
                    
                    shotsRemaining--;
                }
                
                if (shotsRemaining <= 0) break;
            }
        }
        
        // Check if attackers are all destroyed
        if (!attackers.some(ship => !ship.destroyed)) {
            battleLog.result = "defenderVictory";
            break;
        }
        
        // Record this round's result
        battleLog.rounds.push(roundResult);
    }
    
    // If max rounds reached without conclusion, defender wins (stalemate favors defender)
    if (round >= maxRounds && !battleLog.result) {
        battleLog.result = "defenderVictory";
    }
    
    // Calculate remaining ships for both sides
    const remainingAttackers = {};
    const remainingDefenders = {};
    
    // Count remaining attackers by type
    attackers.forEach(ship => {
        if (!ship.destroyed) {
            remainingAttackers[ship.type] = (remainingAttackers[ship.type] || 0) + 1;
        }
    });
    
    // Count remaining defenders by type
    defenders.forEach(ship => {
        if (!ship.destroyed) {
            remainingDefenders[ship.type] = (remainingDefenders[ship.type] || 0) + 1;
        }
    });
    
    // Add remaining count to battle log
    battleLog.final = {
        attackers: remainingAttackers,
        defenders: remainingDefenders,
        orbitalTurrets,
        groundTurrets
    };
    
    return battleLog;
}

/**
 * Format battle result for sending to clients
 * @param {object} battleLog - Battle result from conductBattle()
 * @return {string} - Formatted battle message for client
 */
function formatBattleMessage(battleLog) {
    let message = "battle:";
    
    // Add initial fleet counts
    const initialAttackerCounts = countShipsByType(battleLog.initial.attackers);
    const initialDefenderCounts = countShipsByType(battleLog.initial.defenders);
    
    // Add initial attacker counts
    for (let i = 1; i <= 9; i++) {
        message += `${initialAttackerCounts[i] || 0}:`;
    }
    
    // Add initial defender counts
    for (let i = 1; i <= 9; i++) {
        message += `${initialDefenderCounts[i] || 0}:`;
    }
    
    // Add initial defense counts
    message += `${battleLog.initial.groundTurrets}:${battleLog.initial.orbitalTurrets}:`;
    
    // Add final counts if we have them
    if (battleLog.final) {
        // Add final attacker counts
        for (let i = 1; i <= 9; i++) {
            message += `${battleLog.final.attackers[i] || 0}:`;
        }
        
        // Add final defender counts
        for (let i = 1; i <= 9; i++) {
            message += `${battleLog.final.defenders[i] || 0}:`;
        }
        
        // Add final defense counts
        message += `${battleLog.final.groundTurrets}:${battleLog.final.orbitalTurrets}`;
    }
    
    return message;
}

/**
 * Helper function to count ships by type from battle log
 * @param {Array} ships - Array of ship objects from battle log
 * @return {object} - Counts by ship type
 */
function countShipsByType(ships) {
    const counts = {};
    
    ships.forEach(ship => {
        counts[ship.type] = (counts[ship.type] || 0) + 1;
    });
    
    return counts;
}

/**
 * Processes the result of a battle, updating the database and notifying players
 * @param {object} battleLog - Battle result from conductBattle()
 * @param {object} gameData - Game data including database connection
 * @param {number} attackerId - ID of attacking player
 * @param {number} defenderId - ID of defending player
 * @param {number} sectorId - ID of sector where battle took place
 * @param {number} gameId - ID of the game
 */
function processBattleResult(battleLog, gameData, attackerId, defenderId, sectorId, gameId) {
    const { db, clients, clientMap } = gameData;
    const battleMessage = formatBattleMessage(battleLog);
    
    // Update database based on battle result
    if (battleLog.result === "attackerVictory") {
        // Get remaining ship counts
        const remainingShips = battleLog.final.attackers;
        
        // Update database - attacker takes control
        db.query(`UPDATE map${gameId} SET 
            totalship1 = ?, totalship2 = ?, totalship3 = ?, 
            totalship4 = ?, totalship5 = ?, totalship6 = ?,
            totalship7 = ?, totalship8 = ?, totalship9 = ?,
            ownerid = ?, colonized = 0, groundturret = 0,
            orbitalturret = 0, warpgate = 0, academylvl = 0, 
            shipyardlvl = 0, metallvl = 0, crystallvl = 0,
            totship1build = 0, totship2build = 0, totship3build = 0,
            totship4build = 0, totship5build = 0, totship6build = 0,
            totship7build = 0, totship8build = 0, totship9build = 0
            WHERE sectorid = ?`, 
            [
                remainingShips[1] || 0, remainingShips[2] || 0, remainingShips[3] || 0,
                remainingShips[4] || 0, remainingShips[5] || 0, remainingShips[6] || 0,
                remainingShips[7] || 0, remainingShips[8] || 0, remainingShips[9] || 0,
                attackerId, sectorId
            ]
        );
        
        // Notify attacker of victory
        if (clientMap[attackerId]) {
            clientMap[attackerId].sendUTF('We captured the sector.');
            clientMap[attackerId].sendUTF(battleMessage);
            
            // Update attacker's view
            updateClientSectors(clientMap[attackerId], gameId);
        }
        
        // Notify defender of defeat
        if (clientMap[defenderId]) {
            clientMap[defenderId].sendUTF(`We were just attacked in sector ${sectorId.toString(16).toUpperCase()} and we lost the battle.`);
            clientMap[defenderId].sendUTF(battleMessage);
            
            // Update defender's view
            updateClientSectors(clientMap[defenderId], gameId);
        }
    } else {
        // Defender victory - update defender's ships
        const remainingShips = battleLog.final.defenders;
        
        db.query(`UPDATE map${gameId} SET 
            totalship1 = ?, totalship2 = ?, totalship3 = ?, 
            totalship4 = ?, totalship5 = ?, totalship6 = ?,
            totalship7 = ?, totalship8 = ?, totalship9 = ?,
            groundturret = ?, orbitalturret = ?
            WHERE sectorid = ?`, 
            [
                remainingShips[1] || 0, remainingShips[2] || 0, remainingShips[3] || 0,
                remainingShips[4] || 0, remainingShips[5] || 0, remainingShips[6] || 0,
                remainingShips[7] || 0, remainingShips[8] || 0, remainingShips[9] || 0,
                battleLog.final.groundTurrets, battleLog.final.orbitalTurrets,
                sectorId
            ]
        );
        
        // Notify attacker of defeat
        if (clientMap[attackerId]) {
            clientMap[attackerId].sendUTF('All our ships were destroyed. We lost the battle.');
            clientMap[attackerId].sendUTF(battleMessage);
        }
        
        // Notify defender of victory
        if (clientMap[defenderId]) {
            clientMap[defenderId].sendUTF(`We were just attacked in sector ${sectorId.toString(16).toUpperCase()}, yet we won the battle.`);
            clientMap[defenderId].sendUTF(battleMessage);
        }
    }
    
    // Notify other players about the battle
    clients.forEach(client => {
        if (client.gameid === gameId && client.name !== attackerId && client.name !== defenderId) {
            client.sendUTF("Somewhere in the universe, a great battle just took place.");
        }
    });
}

/**
 * Helper function to update client's sector view
 */
function updateClientSectors(client, gameId) {
    // These functions should be defined in the server code
    if (typeof global.updateAllSectors === 'function') {
        global.updateAllSectors(gameId, client);
    }
    if (typeof global.updateResources === 'function') {
        global.updateResources(client);
    }
    if (client.sectorid && typeof global.updateSector2 === 'function') {
        global.updateSector2(client.sectorid, client);
    }
}

// Export the module's functions
module.exports = {
    SHIP_TYPES,
    conductBattle,
    formatBattleMessage,
    processBattleResult
};
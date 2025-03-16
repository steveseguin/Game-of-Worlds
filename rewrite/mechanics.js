// Battle mechanics for Galaxy Conquest
// This handles combat between fleets

/**
 * Ship type definitions with base stats
 */
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
        movement: 2,
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
        attack: 3,
        hull: 3,
        shields: 2,
        movement: 2,
        cost: { metal: 900, crystal: 0 },
        buildSlots: 8,
        movementCost: 200
    },
    BATTLESHIP: {
        id: 5,
        name: "Battleship",
        attack: 6,
        hull: 5,
        shields: 3,
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
    Object.entries(SHIP_TYPES).forEach(([_, shipType]) => {
        const count = attackerFleet[`ship${shipType.id}`] || 0;
        if (count > 0) {
            attackers.push(...createShips(count, shipType, attackerTech.hull));
        }
    });
    
    // Create defender ships
    Object.entries(SHIP_TYPES).forEach(([_, shipType]) => {
        const count = defenderFleet[`ship${shipType.id}`] || 0;
        if (count > 0) {
            defenders.push(...createShips(count, shipType, defenderTech.hull));
        }
    });
    
    // Add planetary defenses to defenders if applicable
    const orbitalTurrets = defenderFleet.orbitalTurret || 0;
    
    // Battle round counter
    let round = 0;
    const maxRounds = 20; // Prevent infinite battles
    
    // Battle log for display
    const battleLog = {
        initial: {
            attackers: JSON.parse(JSON.stringify(attackers)),
            defenders: JSON.parse(JSON.stringify(defenders)),
            orbitalTurrets
        },
        rounds: [],
        result: null
    };
    
    // Battle continues until one side is destroyed or max rounds reached
    while (
        attackers.some(ship => !ship.destroyed) && 
        (defenders.some(ship => !ship.destroyed) || orbitalTurrets > 0) && 
        round < maxRounds
    ) {
        round++;
        const roundResult = {
            round,
            attackerDamage: 0,
            defenderDamage: 0,
            attackersDestroyed: 0,
            defendersDestroyed: 0,
            turretsDamaged: 0
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
            
            // If there are shots remaining and all ships are destroyed, target orbital turrets
            if (shotsRemaining > 0 && orbitalTurrets > 0) {
                while (shotsRemaining > 0 && orbitalTurrets > 0) {
                    if (shotHits(defenderTech.shields)) {
                        const damage = calculateDamage(1, attackerTech.weapons);
                        orbitalTurrets -= 1; // Each turret has 1 HP
                        roundResult.turretsDamaged += 1;
                    }
                    shotsRemaining--;
                }
            }
        }
        
        // Check if defenders are all destroyed
        if (!defenders.some(ship => !ship.destroyed) && orbitalTurrets <= 0) {
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
                        // Orbital turrets do fixed damage, ships do damage based on attacker tech
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
    
    // Count remaining attackers
    attackers.forEach(ship => {
        if (!ship.destroyed) {
            remainingAttackers[ship.type] = (remainingAttackers[ship.type] || 0) + 1;
        }
    });
    
    // Count remaining defenders
    defenders.forEach(ship => {
        if (!ship.destroyed) {
            remainingDefenders[ship.type] = (remainingDefenders[ship.type] || 0) + 1;
        }
    });
    
    // Add remaining count to battle log
    battleLog.final = {
        attackers: remainingAttackers,
        defenders: remainingDefenders,
        orbitalTurrets
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
    const initialAttackers = battleLog.initial.attackers;
    const initialDefenders = battleLog.initial.defenders;
    
    // Count initial ships by type
    const initialAttackerCounts = {};
    const initialDefenderCounts = {};
    
    initialAttackers.forEach(ship => {
        initialAttackerCounts[ship.type] = (initialAttackerCounts[ship.type] || 0) + 1;
    });
    
    initialDefenders.forEach(ship => {
        initialDefenderCounts[ship.type] = (initialDefenderCounts[ship.type] || 0) + 1;
    });
    
    // Add initial attacker counts
    for (let i = 1; i <= 9; i++) {
        message += `${initialAttackerCounts[i] || 0}:`;
    }
    
    // Add initial defender counts
    for (let i = 1; i <= 9; i++) {
        message += `${initialDefenderCounts[i] || 0}:`;
    }
    
    // Add orbital turrets
    message += `${battleLog.initial.orbitalTurrets}:`;
    
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
        
        // Add final orbital turrets
        message += `${battleLog.final.orbitalTurrets}`;
    }
    
    return message;
}

/**
 * Processes the result of a battle, updating the database and notifying players
 * @param {object} battleLog - Battle result from conductBattle()
 * @param {object} gameData - Game data including database connection
 * @param {number} attackerId - ID of attacking player
 * @param {number} defenderId - ID of defending player
 * @param {number} sectorId - ID of sector where battle took place
 */
function processBattleResult(battleResult, gameId, attackerId, defenderId, sectorId) {
    // Format battle message for clients
    const battleMessage = formatBattleMessage(battleResult);
    
    // Update database based on battle result
    if (battleResult.result === "attackerVictory") {
        // Get remaining ship counts
        const remainingShips = battleResult.final.attackers;
        
        // Begin transaction
        db.beginTransaction(err => {
            if (err) {
                console.error("Battle transaction error:", err);
                return;
            }
            
            // Update database - attacker takes control
            const updateQuery = `
                UPDATE map${gameId} 
                SET 
                    totalship1 = ?,
                    totalship2 = ?,
                    totalship3 = ?,
                    totalship4 = ?,
                    totalship5 = ?,
                    totalship6 = ?,
                    totalship7 = ?,
                    totalship8 = ?,
                    totalship9 = ?,
                    ownerid = ?,
                    colonized = 0,
                    groundturret = 0,
                    orbitalturret = 0
                WHERE sectorid = ?
            `;
            
            db.query(updateQuery, [
                remainingShips[1] || 0,
                remainingShips[2] || 0,
                remainingShips[3] || 0,
                remainingShips[4] || 0,
                remainingShips[5] || 0,
                remainingShips[6] || 0,
                remainingShips[7] || 0,
                remainingShips[8] || 0,
                remainingShips[9] || 0,
                attackerId,
                sectorId
            ], err => {
                if (err) {
                    return db.rollback(() => {
                        console.error("Error updating sector after battle:", err);
                    });
                }
                
                // Record battle in history
                db.query(`
                    INSERT INTO battle_history (
                        game_id, sector_id, attacker_id, defender_id, 
                        outcome, attacker_ships_lost, defender_ships_lost
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    gameId, 
                    sectorId, 
                    attackerId, 
                    defenderId,
                    'attacker_victory',
                    battleResult.initial.attackers.length - Object.values(remainingShips).reduce((a, b) => a + b, 0),
                    battleResult.initial.defenders.length
                ], err => {
                    if (err) {
                        console.error("Error recording battle history:", err);
                    }
                    
                    db.commit(err => {
                        if (err) {
                            return db.rollback(() => {
                                console.error("Error committing battle transaction:", err);
                            });
                        }
                        
                        // Notify players
                        const attackerClient = clientMap[attackerId];
                        const defenderClient = clientMap[defenderId];
                        
                        if (attackerClient) {
                            attackerClient.sendUTF(battleMessage);
                            attackerClient.sendUTF(`Victory! Your forces have captured sector ${sectorId.toString(16).toUpperCase()}.`);
                            updateSector2(sectorId, attackerClient);
                        }
                        
                        if (defenderClient) {
                            defenderClient.sendUTF(battleMessage);
                            defenderClient.sendUTF(`Defeat! Your forces lost control of sector ${sectorId.toString(16).toUpperCase()}.`);
                        }
                    });
                });
            });
        });
    } else {
        // Defender victory - update defender's ships
        const remainingShips = battleLog.final.defenders;
        
        const updateQuery = `
            UPDATE map${gameId} 
            SET 
                totalship1 = ?,
                totalship2 = ?,
                totalship3 = ?,
                totalship4 = ?,
                totalship5 = ?,
                totalship6 = ?,
                totalship7 = ?,
                totalship8 = ?,
                totalship9 = ?,
                orbitalturret = ?
            WHERE sectorid = ?
        `;
        
        db.query(updateQuery, [
            remainingShips[1] || 0,
            remainingShips[2] || 0,
            remainingShips[3] || 0,
            remainingShips[4] || 0,
            remainingShips[5] || 0,
            remainingShips[6] || 0,
            remainingShips[7] || 0,
            remainingShips[8] || 0,
            remainingShips[9] || 0,
            battleLog.final.orbitalTurrets,
            sectorId
        ]);
        
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

// Export functions for use in server.js
module.exports = {
    SHIP_TYPES,
    conductBattle,
    formatBattleMessage,
    processBattleResult
};
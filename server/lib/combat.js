/**
 * lib/combat.js - Server-side combat system
 * 
 * Implements the combat mechanics for battles between fleets.
 * Handles calculations for ship damage, hit chances, and battle outcomes.
 * Provides functions for conducting battles and processing results.
 * 
 * This module is server-side and has access to the database for battle results.
 * It's a core game mechanic module used by the server.
 * 
 * Dependencies:
 * - Used by server.js for processing combat
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
        cost: { metal: 430, crystal: 0 },
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
        cost: { metal: 780, crystal: 0 },
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
        cost: { metal: 980, crystal: 120 },
        buildSlots: 8,
        movementCost: 200
    },
    BATTLESHIP: {
        id: 5,
        name: "Battleship",
        attack: 5,
        hull: 6,
        shields: 3,
        movement: 3,
        cost: { metal: 1650, crystal: 220 },
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
        attack: 11,
        hull: 16,
        shields: 5,
        movement: 4,
        cost: { metal: 3200, crystal: 450 },
        buildSlots: 24,
        movementCost: 650
    },
    INTRUDER: {
        id: 8,
        name: "Intruder",
        attack: 5,
        hull: 4,
        shields: 4,
        movement: 2,
        cost: { metal: 1950, crystal: 133 },
        buildSlots: 7,
        movementCost: 240
    },
    CARRIER: {
        id: 9,
        name: "Carrier",
        attack: 6,
        hull: 12,
        shields: 5,
        movement: 3,
        cost: { metal: 3000, crystal: 80 },
        buildSlots: 16,
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
    const effectiveHull = (shipType.hull + (shipType.shields * 0.85)) * hullBonus;
    
    for (let i = 0; i < count; i++) {
        ships.push({
            type: shipType.id,
            name: shipType.name,
            attack: shipType.attack,
            hull: effectiveHull,
            maxHull: effectiveHull,
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
    // Slightly lower baseline hit chance produces longer, less swingy combats.
    return Math.max(0.4, 0.85 * Math.pow(0.96, shieldTech));
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

const COMBAT_TARGET_PRIORITY = Object.freeze([
    SHIP_TYPES.FRIGATE.id,
    SHIP_TYPES.DESTROYER.id,
    SHIP_TYPES.CRUISER.id,
    SHIP_TYPES.INTRUDER.id,
    SHIP_TYPES.CARRIER.id,
    SHIP_TYPES.BATTLESHIP.id,
    SHIP_TYPES.DREADNOUGHT.id,
    SHIP_TYPES.SCOUT.id,
    SHIP_TYPES.COLONY_SHIP.id
]);

const SHIP_CLASSES = Object.freeze({
    LIGHT: 'light',
    MEDIUM: 'medium',
    HEAVY: 'heavy'
});

const SHIP_CLASS_BY_TYPE = Object.freeze({
    [SHIP_TYPES.FRIGATE.id]: SHIP_CLASSES.LIGHT,
    [SHIP_TYPES.DESTROYER.id]: SHIP_CLASSES.LIGHT,
    [SHIP_TYPES.SCOUT.id]: SHIP_CLASSES.LIGHT,
    [SHIP_TYPES.COLONY_SHIP.id]: SHIP_CLASSES.LIGHT,
    [SHIP_TYPES.CRUISER.id]: SHIP_CLASSES.MEDIUM,
    [SHIP_TYPES.INTRUDER.id]: SHIP_CLASSES.HEAVY,
    [SHIP_TYPES.BATTLESHIP.id]: SHIP_CLASSES.HEAVY,
    [SHIP_TYPES.DREADNOUGHT.id]: SHIP_CLASSES.HEAVY,
    [SHIP_TYPES.CARRIER.id]: SHIP_CLASSES.HEAVY
});

const SHIP_TYPE_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);

const DAMAGE_MATRIX = Object.freeze({
    [SHIP_CLASSES.LIGHT]: Object.freeze({
        [SHIP_CLASSES.LIGHT]: 1.0,
        [SHIP_CLASSES.MEDIUM]: 0.93,
        [SHIP_CLASSES.HEAVY]: 0.75
    }),
    [SHIP_CLASSES.MEDIUM]: Object.freeze({
        [SHIP_CLASSES.LIGHT]: 1.1,
        [SHIP_CLASSES.MEDIUM]: 1.0,
        [SHIP_CLASSES.HEAVY]: 0.98
    }),
    [SHIP_CLASSES.HEAVY]: Object.freeze({
        [SHIP_CLASSES.LIGHT]: 1.2,
        [SHIP_CLASSES.MEDIUM]: 1.06,
        [SHIP_CLASSES.HEAVY]: 1.0
    })
});

const TARGET_PRIORITY_BY_CLASS = Object.freeze({
    [SHIP_CLASSES.LIGHT]: Object.freeze([
        SHIP_TYPES.DREADNOUGHT.id,
        SHIP_TYPES.BATTLESHIP.id,
        SHIP_TYPES.CARRIER.id,
        SHIP_TYPES.INTRUDER.id,
        SHIP_TYPES.CRUISER.id,
        SHIP_TYPES.DESTROYER.id,
        SHIP_TYPES.FRIGATE.id,
        SHIP_TYPES.SCOUT.id,
        SHIP_TYPES.COLONY_SHIP.id
    ]),
    [SHIP_CLASSES.MEDIUM]: Object.freeze([
        SHIP_TYPES.CRUISER.id,
        SHIP_TYPES.DESTROYER.id,
        SHIP_TYPES.FRIGATE.id,
        SHIP_TYPES.BATTLESHIP.id,
        SHIP_TYPES.INTRUDER.id,
        SHIP_TYPES.CARRIER.id,
        SHIP_TYPES.DREADNOUGHT.id,
        SHIP_TYPES.SCOUT.id,
        SHIP_TYPES.COLONY_SHIP.id
    ]),
    [SHIP_CLASSES.HEAVY]: Object.freeze([
        SHIP_TYPES.CRUISER.id,
        SHIP_TYPES.FRIGATE.id,
        SHIP_TYPES.DESTROYER.id,
        SHIP_TYPES.SCOUT.id,
        SHIP_TYPES.INTRUDER.id,
        SHIP_TYPES.CARRIER.id,
        SHIP_TYPES.BATTLESHIP.id,
        SHIP_TYPES.DREADNOUGHT.id,
        SHIP_TYPES.COLONY_SHIP.id
    ])
});

const TARGET_PRIORITY_BY_TYPE = Object.freeze({
    [SHIP_TYPES.CARRIER.id]: Object.freeze([
        SHIP_TYPES.DREADNOUGHT.id,
        SHIP_TYPES.BATTLESHIP.id,
        SHIP_TYPES.CARRIER.id,
        SHIP_TYPES.INTRUDER.id,
        SHIP_TYPES.CRUISER.id,
        SHIP_TYPES.DESTROYER.id,
        SHIP_TYPES.FRIGATE.id,
        SHIP_TYPES.SCOUT.id,
        SHIP_TYPES.COLONY_SHIP.id
    ]),
    [SHIP_TYPES.INTRUDER.id]: Object.freeze([
        SHIP_TYPES.CRUISER.id,
        SHIP_TYPES.INTRUDER.id,
        SHIP_TYPES.DESTROYER.id,
        SHIP_TYPES.FRIGATE.id,
        SHIP_TYPES.BATTLESHIP.id,
        SHIP_TYPES.CARRIER.id,
        SHIP_TYPES.DREADNOUGHT.id,
        SHIP_TYPES.SCOUT.id,
        SHIP_TYPES.COLONY_SHIP.id
    ])
});

function getAliveShips(ships) {
    return ships.filter(ship => !ship.destroyed);
}

// Snapshot of how many ships of each type are still alive — used to serialize a
// faithful per-round timeline for the battle theater (client plays each round out).
function countAliveByType(ships) {
    const counts = createEmptyTypeStatMap();
    ships.forEach(ship => {
        if (!ship.destroyed) {
            counts[ship.type] = (counts[ship.type] || 0) + 1;
        }
    });
    return counts;
}

function createEmptyTypeStatMap() {
    const map = {};
    SHIP_TYPE_IDS.forEach(typeId => {
        map[typeId] = 0;
    });
    return map;
}

function createSideTelemetry(deployedByType = null) {
    return {
        deployedByType: deployedByType ? { ...deployedByType } : createEmptyTypeStatMap(),
        survivorsByType: createEmptyTypeStatMap(),
        lossesByType: createEmptyTypeStatMap(),
        shotsByType: createEmptyTypeStatMap(),
        hitsByType: createEmptyTypeStatMap(),
        damageByType: createEmptyTypeStatMap(),
        killCreditsByType: createEmptyTypeStatMap(),
        orbitalTurretShots: 0,
        orbitalTurretHits: 0,
        orbitalTurretDamage: 0,
        orbitalTurretKillCredits: 0
    };
}

function normalizeFleetCountsByType(fleetData) {
    const normalized = createEmptyTypeStatMap();
    SHIP_TYPE_IDS.forEach(typeId => {
        const count = Number(fleetData && fleetData[`ship${typeId}`]) || 0;
        normalized[typeId] = Math.max(0, Math.floor(count));
    });
    return normalized;
}

function countFleetShots(ships) {
    return ships.reduce((total, ship) => total + Math.max(0, Number(ship.attack) || 0), 0);
}

function getShipClass(typeId) {
    return SHIP_CLASS_BY_TYPE[typeId] || SHIP_CLASSES.MEDIUM;
}

function getDamageMultiplier(attackerTypeId, targetTypeId) {
    const attackerClass = getShipClass(attackerTypeId);
    const targetClass = getShipClass(targetTypeId);
    const row = DAMAGE_MATRIX[attackerClass];
    if (!row) {
        return 1.0;
    }
    return row[targetClass] || 1.0;
}

function getTargetPriorityForAttackerType(attackerTypeId, fallbackPriority) {
    const typePriority = TARGET_PRIORITY_BY_TYPE[attackerTypeId];
    if (typePriority) {
        return typePriority;
    }
    const attackerClass = getShipClass(attackerTypeId);
    const classPriority = TARGET_PRIORITY_BY_CLASS[attackerClass];
    return classPriority || fallbackPriority || COMBAT_TARGET_PRIORITY;
}

function mergeDamageMaps(baseMap, additionalMap) {
    additionalMap.forEach((damage, target) => {
        baseMap.set(target, (baseMap.get(target) || 0) + damage);
    });
}

function mergeContributionByTarget(baseMap, additionalMap) {
    additionalMap.forEach((contribMap, target) => {
        let currentMap = baseMap.get(target);
        if (!currentMap) {
            currentMap = new Map();
            baseMap.set(target, currentMap);
        }

        contribMap.forEach((damage, attackerTypeId) => {
            currentMap.set(attackerTypeId, (currentMap.get(attackerTypeId) || 0) + damage);
        });
    });
}

function createTargetQueue(targetShips, targetOrder) {
    const orderedTargets = [];
    targetOrder.forEach(targetTypeId => {
        const typeTargets = targetShips.filter(ship => ship.type === targetTypeId);
        orderedTargets.push(...typeTargets);
    });
    return orderedTargets;
}

function getNextPriorityTarget(targetShips, virtualHull, targetOrder) {
    const orderedTargets = createTargetQueue(targetShips, targetOrder);
    for (const target of orderedTargets) {
        if ((virtualHull.get(target) || 0) > 0) {
            return target;
        }
    }
    return null;
}

function queueVolleyDamage({ firingShips, weaponTech, targetShieldTech, targetShips, targetOrder, telemetry }) {
    const pendingDamage = new Map();
    const contributionByTarget = new Map();
    const virtualHull = new Map();
    const totalShots = countFleetShots(firingShips);
    let shotsSpentOnShips = 0;

    targetShips.forEach(ship => {
        virtualHull.set(ship, ship.hull);
    });
    let totalDamage = 0;

    for (const attacker of firingShips) {
        let attackerShots = Math.max(0, Number(attacker.attack) || 0);
        const attackerPriority = getTargetPriorityForAttackerType(attacker.type, targetOrder);

        while (attackerShots > 0) {
            const target = getNextPriorityTarget(targetShips, virtualHull, attackerPriority);
            if (!target) {
                return {
                    pendingDamage,
                    totalDamage,
                    shotsRemaining: Math.max(0, totalShots - shotsSpentOnShips)
                };
            }

            attackerShots -= 1;
            shotsSpentOnShips += 1;
            if (telemetry && telemetry.shotsByType) {
                telemetry.shotsByType[attacker.type] = (telemetry.shotsByType[attacker.type] || 0) + 1;
            }

            // Ship-class shield values contribute to evasion in addition to global tech.
            if (!shotHits(targetShieldTech + (target.shields * 0.5))) {
                continue;
            }

            const damage = calculateDamage(1, weaponTech) * getDamageMultiplier(attacker.type, target.type);
            totalDamage += damage;
            pendingDamage.set(target, (pendingDamage.get(target) || 0) + damage);
            if (telemetry && telemetry.hitsByType && telemetry.damageByType) {
                telemetry.hitsByType[attacker.type] = (telemetry.hitsByType[attacker.type] || 0) + 1;
                telemetry.damageByType[attacker.type] = (telemetry.damageByType[attacker.type] || 0) + damage;
            }
            let targetContrib = contributionByTarget.get(target);
            if (!targetContrib) {
                targetContrib = new Map();
                contributionByTarget.set(target, targetContrib);
            }
            targetContrib.set(attacker.type, (targetContrib.get(attacker.type) || 0) + damage);

            const remainingHull = (virtualHull.get(target) || 0) - damage;
            virtualHull.set(target, remainingHull);
        }
    }

    return {
        pendingDamage,
        contributionByTarget,
        totalDamage,
        shotsRemaining: Math.max(0, totalShots - shotsSpentOnShips)
    };
}

function queueOrbitalTurretVolley({ shots, weaponTech, targetShieldTech, targetShips, targetOrder, telemetry }) {
    const pendingDamage = new Map();
    const contributionByTarget = new Map();
    const virtualHull = new Map();
    const orderedTargets = createTargetQueue(targetShips, targetOrder);
    let shotsRemaining = Math.max(0, Number(shots) || 0);
    let targetIndex = 0;
    let totalDamage = 0;

    targetShips.forEach(ship => {
        virtualHull.set(ship, ship.hull);
    });

    while (shotsRemaining > 0 && targetIndex < orderedTargets.length) {
        shotsRemaining -= 1;
        if (telemetry) {
            telemetry.orbitalTurretShots += 1;
        }
        const target = orderedTargets[targetIndex];

        if (!shotHits(targetShieldTech + (target.shields * 0.5))) {
            continue;
        }

        const damage = calculateDamage(1, weaponTech);
        totalDamage += damage;
        pendingDamage.set(target, (pendingDamage.get(target) || 0) + damage);
        if (telemetry) {
            telemetry.orbitalTurretHits += 1;
            telemetry.orbitalTurretDamage += damage;
        }
        let targetContrib = contributionByTarget.get(target);
        if (!targetContrib) {
            targetContrib = new Map();
            contributionByTarget.set(target, targetContrib);
        }
        targetContrib.set(0, (targetContrib.get(0) || 0) + damage);

        const remainingHull = (virtualHull.get(target) || 0) - damage;
        virtualHull.set(target, remainingHull);
        if (remainingHull <= 0) {
            targetIndex += 1;
        }
    }

    return {
        pendingDamage,
        contributionByTarget,
        totalDamage,
        shotsRemaining
    };
}

function queueTurretDamage({ shots, targetShieldTech, groundTurrets, orbitalTurrets }) {
    let shotsRemaining = Math.max(0, Number(shots) || 0);
    let groundLoss = 0;
    let orbitalLoss = 0;

    while (shotsRemaining > 0 && (groundTurrets - groundLoss) > 0) {
        shotsRemaining -= 1;
        if (shotHits(targetShieldTech)) {
            groundLoss += 1;
        }
    }

    while (shotsRemaining > 0 && (groundTurrets - groundLoss) <= 0 && (orbitalTurrets - orbitalLoss) > 0) {
        shotsRemaining -= 1;
        if (shotHits(targetShieldTech)) {
            orbitalLoss += 1;
        }
    }

    return {
        shotsRemaining,
        groundLoss,
        orbitalLoss,
        turretsDestroyed: groundLoss + orbitalLoss
    };
}

function applyQueuedDamage(targetShips, pendingDamage, contributionByTarget, telemetry) {
    let destroyed = 0;

    targetShips.forEach(ship => {
        if (ship.destroyed) {
            return;
        }

        const damage = pendingDamage.get(ship) || 0;
        if (damage <= 0) {
            return;
        }

        ship.hull -= damage;
        if (ship.hull <= 0) {
            ship.destroyed = true;
            destroyed += 1;

            if (contributionByTarget && telemetry && telemetry.killCreditsByType) {
                const contributionMap = contributionByTarget.get(ship);
                if (contributionMap && contributionMap.size > 0) {
                    let totalContrib = 0;
                    contributionMap.forEach(value => {
                        totalContrib += Number(value) || 0;
                    });

                    if (totalContrib > 0) {
                        contributionMap.forEach((value, attackerTypeId) => {
                            const fraction = (Number(value) || 0) / totalContrib;
                            if (!Number.isFinite(fraction) || fraction <= 0) {
                                return;
                            }

                            if (attackerTypeId >= 1 && attackerTypeId <= 9) {
                                telemetry.killCreditsByType[attackerTypeId] = (telemetry.killCreditsByType[attackerTypeId] || 0) + fraction;
                            } else if (attackerTypeId === 0) {
                                telemetry.orbitalTurretKillCredits += fraction;
                            }
                        });
                    }
                }
            }
        }
    });

    return destroyed;
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
    let orbitalTurrets = defenderFleet.orbitalTurret || 0;
    let groundTurrets = defenderFleet.groundTurret || 0;
    
    // Battle round counter
    let round = 0;
    const maxRounds = 20; // Prevent infinite battles
    
    // Battle log for display
    const attackerDeployedByType = normalizeFleetCountsByType(attackerFleet);
    const defenderDeployedByType = normalizeFleetCountsByType(defenderFleet);
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
        result: null,
        telemetry: {
            attacker: createSideTelemetry(attackerDeployedByType),
            defender: createSideTelemetry(defenderDeployedByType)
        }
    };
    
    // Simultaneous-volley rounds avoid heavy first-strike bias and produce fairer fights.
    while (round < maxRounds) {
        const liveAttackers = getAliveShips(attackers);
        const liveDefenders = getAliveShips(defenders);
        const hasAttackers = liveAttackers.length > 0;
        const hasDefenses = liveDefenders.length > 0 || orbitalTurrets > 0 || groundTurrets > 0;

        if (!hasAttackers) {
            battleLog.result = "defenderVictory";
            break;
        }
        if (!hasDefenses) {
            battleLog.result = "attackerVictory";
            break;
        }

        round++;
        const roundResult = {
            round,
            attackerDamage: 0,
            defenderDamage: 0,
            attackersDestroyed: 0,
            defendersDestroyed: 0,
            turretsDestroyed: 0
        };
        const attackerVolley = queueVolleyDamage({
            firingShips: liveAttackers,
            weaponTech: attackerTech.weapons,
            targetShieldTech: defenderTech.shields,
            targetShips: liveDefenders,
            targetOrder: COMBAT_TARGET_PRIORITY,
            telemetry: battleLog.telemetry.attacker
        });

        let turretResult = {
            shotsRemaining: attackerVolley.shotsRemaining,
            groundLoss: 0,
            orbitalLoss: 0,
            turretsDestroyed: 0
        };
        if (attackerVolley.shotsRemaining > 0 && (groundTurrets > 0 || orbitalTurrets > 0)) {
            turretResult = queueTurretDamage({
                shots: attackerVolley.shotsRemaining,
                targetShieldTech: defenderTech.shields,
                groundTurrets,
                orbitalTurrets
            });
        }

        const defenderVolley = queueVolleyDamage({
            firingShips: liveDefenders,
            weaponTech: defenderTech.weapons,
            targetShieldTech: attackerTech.shields,
            targetShips: liveAttackers,
            targetOrder: COMBAT_TARGET_PRIORITY,
            telemetry: battleLog.telemetry.defender
        });

        let orbitalVolley = {
            pendingDamage: new Map(),
            contributionByTarget: new Map(),
            totalDamage: 0,
            shotsRemaining: 0
        };
        if (orbitalTurrets > 0 && liveAttackers.length > 0) {
            orbitalVolley = queueOrbitalTurretVolley({
                shots: orbitalTurrets,
                weaponTech: defenderTech.weapons,
                targetShieldTech: attackerTech.shields,
                targetShips: liveAttackers,
                targetOrder: COMBAT_TARGET_PRIORITY,
                telemetry: battleLog.telemetry.defender
            });
        }

        roundResult.defenderDamage = attackerVolley.totalDamage;
        roundResult.attackerDamage = defenderVolley.totalDamage + orbitalVolley.totalDamage;
        roundResult.defendersDestroyed = applyQueuedDamage(
            liveDefenders,
            attackerVolley.pendingDamage,
            attackerVolley.contributionByTarget,
            battleLog.telemetry.attacker
        );
        mergeDamageMaps(defenderVolley.pendingDamage, orbitalVolley.pendingDamage);
        mergeContributionByTarget(defenderVolley.contributionByTarget, orbitalVolley.contributionByTarget);
        roundResult.attackersDestroyed = applyQueuedDamage(
            liveAttackers,
            defenderVolley.pendingDamage,
            defenderVolley.contributionByTarget,
            battleLog.telemetry.defender
        );
        roundResult.turretsDestroyed = turretResult.turretsDestroyed;

        groundTurrets = Math.max(0, groundTurrets - turretResult.groundLoss);
        orbitalTurrets = Math.max(0, orbitalTurrets - turretResult.orbitalLoss);

        // Post-round survivor snapshot (end-of-round state) for the battle timeline.
        roundResult.attackerCounts = countAliveByType(attackers);
        roundResult.defenderCounts = countAliveByType(defenders);
        roundResult.orbitalTurrets = orbitalTurrets;
        roundResult.groundTurrets = groundTurrets;

        battleLog.rounds.push(roundResult);

        const attackersStillAlive = getAliveShips(attackers).length > 0;
        const defendersStillAlive = getAliveShips(defenders).length > 0 || orbitalTurrets > 0 || groundTurrets > 0;
        if (!attackersStillAlive) {
            battleLog.result = "defenderVictory";
            break;
        }
        if (!defendersStillAlive) {
            battleLog.result = "attackerVictory";
            break;
        }
    }
    
    // If max rounds reached without conclusion, defender wins (stalemate favors defender)
    if (!battleLog.result) {
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

    SHIP_TYPE_IDS.forEach(typeId => {
        const attackerSurvivors = Number(remainingAttackers[typeId]) || 0;
        const defenderSurvivors = Number(remainingDefenders[typeId]) || 0;

        battleLog.telemetry.attacker.survivorsByType[typeId] = attackerSurvivors;
        battleLog.telemetry.defender.survivorsByType[typeId] = defenderSurvivors;

        const attackerDeployed = Number(attackerDeployedByType[typeId]) || 0;
        const defenderDeployed = Number(defenderDeployedByType[typeId]) || 0;
        battleLog.telemetry.attacker.lossesByType[typeId] = Math.max(0, attackerDeployed - attackerSurvivors);
        battleLog.telemetry.defender.lossesByType[typeId] = Math.max(0, defenderDeployed - defenderSurvivors);
    });
    
    return battleLog;
}

/**
 * Format battle result for sending to clients
 * @param {object} battleLog - Battle result from conductBattle()
 * @return {string} - Formatted battle message for client
 */
// Wire format consumed by the client battle theater. Each "block" is 20 fields:
//   [9 attacker counts][9 defender counts][groundTurrets][orbitalTurrets]
// Block 0 is the initial state; every following block is the END-OF-ROUND state
// for one combat round, so the client can play the fight out volley by volley.
// The last block always equals battleLog.final. When per-round snapshots are
// absent (older/synthetic logs) we fall back to a single final block, which
// reproduces the legacy initial->final "pop".
function formatBattleMessage(battleLog) {
    const fields = [];

    const pushBlock = (attackerCounts, defenderCounts, ground, orbital) => {
        for (let i = 1; i <= 9; i++) fields.push((attackerCounts && attackerCounts[i]) || 0);
        for (let i = 1; i <= 9; i++) fields.push((defenderCounts && defenderCounts[i]) || 0);
        fields.push(Number(ground) || 0);
        fields.push(Number(orbital) || 0);
    };

    // Block 0: initial state.
    pushBlock(
        countShipsByType(battleLog.initial.attackers),
        countShipsByType(battleLog.initial.defenders),
        battleLog.initial.groundTurrets,
        battleLog.initial.orbitalTurrets
    );

    const rounds = Array.isArray(battleLog.rounds) ? battleLog.rounds : [];
    const hasRoundSnapshots = rounds.length > 0 && rounds[0] && rounds[0].attackerCounts;

    if (hasRoundSnapshots) {
        // One block per round; the final round's snapshot equals battleLog.final.
        rounds.forEach(round => {
            pushBlock(round.attackerCounts, round.defenderCounts, round.groundTurrets, round.orbitalTurrets);
        });
    } else if (battleLog.final) {
        // Back-compat: single final block.
        pushBlock(
            battleLog.final.attackers,
            battleLog.final.defenders,
            battleLog.final.groundTurrets,
            battleLog.final.orbitalTurrets
        );
    }

    return 'battle:' + fields.join(':');
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
// Fix the combat calculation in processBattleResult function
function processBattleResult(battleLog, gameData, attackerId, defenderId, sectorId, gameId) {
    const { db, clients, clientMap } = gameData;
    
    // Send battle notification to both players
    const battleMessage = formatBattleMessage(battleLog);
    if (clientMap[attackerId]) clientMap[attackerId].sendUTF(battleMessage);
    if (clientMap[defenderId]) clientMap[defenderId].sendUTF(battleMessage);
    
    // Process outcome based on victor
    if (battleLog.result === "attackerVictory") {
        // Attacker takes control of sector
        const remainingShips = battleLog.final.attackers;
        
        // Update sector ownership
        let updateQuery = `UPDATE map${gameId} SET `;
        
        // Update ship counts
        for (let i = 1; i <= 9; i++) {
            updateQuery += `totalship${i} = ${remainingShips[i] || 0}, `;
        }
        
        // Change ownership
        updateQuery += `ownerid = '${attackerId}', `;
        updateQuery += `colonized = 0, `;
        updateQuery += `orbitalturret = 0, groundturret = 0 `;
        updateQuery += `WHERE sectorid = ${sectorId}`;
        
        db.query(updateQuery);
        
        // Notify players
        if (clientMap[attackerId]) {
            clientMap[attackerId].sendUTF(`Victory! You captured sector ${sectorId.toString(16).toUpperCase()}`);
        }
        
        if (clientMap[defenderId]) {
            clientMap[defenderId].sendUTF(`Defeat! You lost control of sector ${sectorId.toString(16).toUpperCase()}`);
        }
    } else {
        // Defender maintains control
        const remainingShips = battleLog.final.defenders;
        
        // Update sector with remaining ships
        let updateQuery = `UPDATE map${gameId} SET `;
        
        // Update ship counts
        for (let i = 1; i <= 9; i++) {
            updateQuery += `totalship${i} = ${remainingShips[i] || 0}, `;
        }
        
        // Update defenses
        updateQuery += `orbitalturret = ${battleLog.final.orbitalTurrets || 0}, `;
        updateQuery += `groundturret = 0 `;
        updateQuery += `WHERE sectorid = ${sectorId}`;
        
        db.query(updateQuery);
        
        // Notify players
        if (clientMap[attackerId]) {
            clientMap[attackerId].sendUTF(`Defeat! Your attack on sector ${sectorId.toString(16).toUpperCase()} was repelled`);
        }
        
        if (clientMap[defenderId]) {
            clientMap[defenderId].sendUTF(`Victory! You successfully defended sector ${sectorId.toString(16).toUpperCase()}`);
        }
    }
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
    resolveCombat: conductBattle, // Alias for compatibility
    formatBattleMessage,
    processBattleResult
};

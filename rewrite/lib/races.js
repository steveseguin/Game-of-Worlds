/**
 * lib/races.js - Race definitions and unlock system
 * 
 * Defines the 12 playable races with their unique characteristics,
 * tech trees, unit modifications, and unlock requirements.
 */

const RACE_TYPES = {
    // Starter race (always unlocked)
    TERRAN: {
        id: 1,
        name: "Terran Empire",
        description: "Balanced human faction with versatile units and steady growth",
        unlockType: "starter",
        unlockRequirement: null,
        bonuses: {
            metalProduction: 1.0,
            crystalProduction: 1.0,
            researchSpeed: 1.0,
            shipCost: 1.0,
            shipSpeed: 1.0,
            shipAttack: 1.0,
            shipDefense: 1.0
        },
        specialAbility: "Adaptable - 10% faster building construction",
        techTreeModifiers: {},
        unitModifiers: {}
    },
    
    // Achievement unlock races
    SILICON: {
        id: 2,
        name: "Silicon Collective",
        description: "AI race with enhanced research and efficient resource usage",
        unlockType: "achievement",
        unlockRequirement: { type: "wins", count: 3 },
        bonuses: {
            metalProduction: 0.9,
            crystalProduction: 1.1,
            researchSpeed: 1.3,
            shipCost: 0.9,
            shipSpeed: 1.0,
            shipAttack: 0.95,
            shipDefense: 1.05
        },
        specialAbility: "Neural Network - Research costs 20% less",
        techTreeModifiers: {
            "advancedAI": { cost: 0.8, prereq: null }
        },
        unitModifiers: {
            "scout": { speed: 1.2, vision: 1.5 }
        }
    },
    
    HIVE: {
        id: 3,
        name: "Zephyr Swarm",
        description: "Hive mind species with rapid expansion and swarm tactics",
        unlockType: "achievement",
        unlockRequirement: { type: "planets_colonized", count: 20 },
        bonuses: {
            metalProduction: 1.2,
            crystalProduction: 0.8,
            researchSpeed: 0.8,
            shipCost: 0.7,
            shipSpeed: 1.1,
            shipAttack: 0.8,
            shipDefense: 0.9
        },
        specialAbility: "Swarm - Ships cost 30% less but are 20% weaker",
        techTreeModifiers: {
            "swarmTactics": { cost: 0.5, unlocked: true }
        },
        unitModifiers: {
            "frigate": { cost: 0.6, attack: 0.8, count: 1.5 },
            "destroyer": { cost: 0.6, attack: 0.8, count: 1.5 }
        }
    },
    
    CRYSTAL: {
        id: 4,
        name: "Crystalline Entity",
        description: "Energy beings with superior crystal technology",
        unlockType: "achievement",
        unlockRequirement: { type: "total_crystal", count: 50000 },
        bonuses: {
            metalProduction: 0.7,
            crystalProduction: 1.5,
            researchSpeed: 1.1,
            shipCost: 1.2,
            shipSpeed: 0.9,
            shipAttack: 1.2,
            shipDefense: 1.3
        },
        specialAbility: "Crystal Matrix - Ships have +30% shields",
        techTreeModifiers: {
            "crystalTech": { unlocked: true, cost: 0.7 }
        },
        unitModifiers: {
            "all": { shields: 1.3, cost_crystal: 1.5 }
        }
    },
    
    VOID: {
        id: 5,
        name: "Void Walkers",
        description: "Ancient race with mastery over space and time",
        unlockType: "achievement",
        unlockRequirement: { type: "games_played", count: 25 },
        bonuses: {
            metalProduction: 0.9,
            crystalProduction: 0.9,
            researchSpeed: 1.2,
            shipCost: 1.1,
            shipSpeed: 1.5,
            shipAttack: 1.0,
            shipDefense: 0.9
        },
        specialAbility: "Phase Shift - Ships move 50% faster",
        techTreeModifiers: {
            "warpTech": { cost: 0.5, unlocked: true }
        },
        unitModifiers: {
            "all": { speed: 1.5, warpRange: 2 }
        }
    },
    
    MECH: {
        id: 6,
        name: "Mechanicus",
        description: "Robotic civilization with self-repairing ships",
        unlockType: "achievement",
        unlockRequirement: { type: "ships_built", count: 500 },
        bonuses: {
            metalProduction: 1.3,
            crystalProduction: 0.9,
            researchSpeed: 0.9,
            shipCost: 1.2,
            shipSpeed: 0.8,
            shipAttack: 1.1,
            shipDefense: 1.4
        },
        specialAbility: "Auto-Repair - Ships regenerate 5% hull per turn",
        techTreeModifiers: {
            "nanotech": { cost: 0.8, unlocked: true }
        },
        unitModifiers: {
            "battleship": { defense: 1.5, repair: 0.05 },
            "dreadnought": { defense: 1.5, repair: 0.05 }
        }
    },
    
    ORGANIC: {
        id: 7,
        name: "Bioform Collective",
        description: "Living ships that grow stronger over time",
        unlockType: "achievement",
        unlockRequirement: { type: "battles_won", count: 50 },
        bonuses: {
            metalProduction: 0.8,
            crystalProduction: 1.2,
            researchSpeed: 1.0,
            shipCost: 0.9,
            shipSpeed: 1.0,
            shipAttack: 1.0,
            shipDefense: 1.0
        },
        specialAbility: "Evolution - Ships gain +2% stats per turn survived",
        techTreeModifiers: {
            "bioEngineering": { cost: 0.9, unlocked: true }
        },
        unitModifiers: {
            "all": { growth: 0.02, organic: true }
        }
    },
    
    NOMAD: {
        id: 8,
        name: "Star Nomads",
        description: "Fleet-based civilization with mobile bases",
        unlockType: "achievement",
        unlockRequirement: { type: "sectors_explored", count: 100 },
        bonuses: {
            metalProduction: 0.8,
            crystalProduction: 1.1,
            researchSpeed: 1.0,
            shipCost: 0.8,
            shipSpeed: 1.3,
            shipAttack: 1.1,
            shipDefense: 0.9
        },
        specialAbility: "Nomadic - No building requirements for ships",
        techTreeModifiers: {
            "mobileBase": { unlocked: true }
        },
        unitModifiers: {
            "colony": { speed: 1.5, mobile_base: true }
        }
    },
    
    ANCIENT: {
        id: 9,
        name: "The Ancients",
        description: "Precursor race with advanced but expensive technology",
        unlockType: "referral",
        unlockRequirement: { type: "referrals", count: 3 },
        bonuses: {
            metalProduction: 0.8,
            crystalProduction: 0.8,
            researchSpeed: 1.5,
            shipCost: 1.5,
            shipSpeed: 1.0,
            shipAttack: 1.5,
            shipDefense: 1.5
        },
        specialAbility: "Precursor Tech - All techs unlocked but cost 50% more",
        techTreeModifiers: {
            "all": { unlocked: true, cost: 1.5 }
        },
        unitModifiers: {
            "all": { attack: 1.5, defense: 1.5, cost: 1.5 }
        }
    },
    
    // Premium races (Stripe payment required)
    QUANTUM: {
        id: 10,
        name: "Quantum Entities",
        description: "Beings of pure energy with reality-bending abilities",
        unlockType: "premium",
        unlockRequirement: { type: "payment", amount: 4.99 },
        bonuses: {
            metalProduction: 1.0,
            crystalProduction: 1.3,
            researchSpeed: 1.4,
            shipCost: 1.3,
            shipSpeed: 1.2,
            shipAttack: 1.3,
            shipDefense: 1.1
        },
        specialAbility: "Quantum Entanglement - Can teleport ships once per 5 turns",
        techTreeModifiers: {
            "quantumPhysics": { unlocked: true, exclusive: true }
        },
        unitModifiers: {
            "all": { teleport: true, phase: 0.2 }
        }
    },
    
    TITAN: {
        id: 11,
        name: "Titan Lords",
        description: "Giants who build massive, powerful ships",
        unlockType: "premium",
        unlockRequirement: { type: "payment", amount: 4.99 },
        bonuses: {
            metalProduction: 1.4,
            crystalProduction: 0.8,
            researchSpeed: 0.7,
            shipCost: 2.0,
            shipSpeed: 0.6,
            shipAttack: 2.0,
            shipDefense: 2.0
        },
        specialAbility: "Colossal - Ships are 2x stronger but 2x more expensive",
        techTreeModifiers: {
            "titanEngineering": { unlocked: true, exclusive: true }
        },
        unitModifiers: {
            "all": { size: 2.0, attack: 2.0, defense: 2.0, cost: 2.0, speed: 0.6 }
        }
    },
    
    SHADOW: {
        id: 12,
        name: "Shadow Realm",
        description: "Masters of stealth and subterfuge",
        unlockType: "premium",
        unlockRequirement: { type: "payment", amount: 4.99 },
        bonuses: {
            metalProduction: 0.9,
            crystalProduction: 1.2,
            researchSpeed: 1.1,
            shipCost: 1.1,
            shipSpeed: 1.2,
            shipAttack: 1.2,
            shipDefense: 0.8
        },
        specialAbility: "Cloak - All ships have 30% chance to avoid detection",
        techTreeModifiers: {
            "stealthTech": { unlocked: true, exclusive: true }
        },
        unitModifiers: {
            "scout": { stealth: 0.5 },
            "intruder": { stealth: 0.8, attack_bonus_stealth: 1.5 },
            "all": { stealth: 0.3 }
        }
    }
};

// Check if a race is unlocked for a user
function isRaceUnlocked(userId, raceId, userStats, db, callback) {
    const race = Object.values(RACE_TYPES).find(r => r.id === raceId);
    if (!race) {
        callback(false);
        return;
    }
    
    switch (race.unlockType) {
        case 'starter':
            callback(true);
            break;
            
        case 'achievement':
            checkAchievementUnlock(userId, race.unlockRequirement, userStats, callback);
            break;
            
        case 'referral':
            checkReferralUnlock(userId, race.unlockRequirement, db, callback);
            break;
            
        case 'premium':
            checkPremiumUnlock(userId, raceId, db, callback);
            break;
            
        default:
            callback(false);
    }
}

// Check achievement-based unlocks
function checkAchievementUnlock(userId, requirement, userStats, callback) {
    switch (requirement.type) {
        case 'wins':
            callback(userStats.wins >= requirement.count);
            break;
        case 'games_played':
            callback(userStats.games_played >= requirement.count);
            break;
        case 'planets_colonized':
            callback(userStats.total_planets_colonized >= requirement.count);
            break;
        case 'total_crystal':
            callback(userStats.total_crystal_earned >= requirement.count);
            break;
        case 'ships_built':
            callback(userStats.total_ships_built >= requirement.count);
            break;
        case 'battles_won':
            callback(userStats.total_battles_won >= requirement.count);
            break;
        case 'sectors_explored':
            callback(userStats.total_sectors_explored >= requirement.count);
            break;
        default:
            callback(false);
    }
}

// Check referral-based unlocks
function checkReferralUnlock(userId, requirement, db, callback) {
    db.query(
        'SELECT COUNT(*) as count FROM users WHERE referred_by = ?',
        [userId],
        (err, results) => {
            if (err) {
                callback(false);
            } else {
                callback(results[0].count >= requirement.count);
            }
        }
    );
}

// Check premium unlocks
function checkPremiumUnlock(userId, raceId, db, callback) {
    db.query(
        'SELECT * FROM premium_purchases WHERE user_id = ? AND race_id = ? AND status = "completed"',
        [userId, raceId],
        (err, results) => {
            callback(!err && results.length > 0);
        }
    );
}

// Get all unlocked races for a user
function getUnlockedRaces(userId, db, callback) {
    // First get user stats
    db.query(
        'SELECT * FROM user_stats WHERE user_id = ?',
        [userId],
        (err, statsResults) => {
            if (err) {
                callback(err, null);
                return;
            }
            
            const userStats = statsResults[0] || {
                wins: 0,
                games_played: 0,
                total_planets_colonized: 0,
                total_crystal_earned: 0,
                total_ships_built: 0,
                total_battles_won: 0,
                total_sectors_explored: 0
            };
            
            const races = Object.values(RACE_TYPES);
            const unlockedRaces = [];
            let processed = 0;
            
            races.forEach(race => {
                isRaceUnlocked(userId, race.id, userStats, db, (unlocked) => {
                    if (unlocked) {
                        unlockedRaces.push(race);
                    }
                    processed++;
                    
                    if (processed === races.length) {
                        callback(null, unlockedRaces);
                    }
                });
            });
        }
    );
}

// Apply race modifiers to game stats
function applyRaceModifiers(raceId, baseStats) {
    const race = Object.values(RACE_TYPES).find(r => r.id === raceId);
    if (!race) return baseStats;
    
    const modifiedStats = { ...baseStats };
    
    // Apply production bonuses
    modifiedStats.metalProduction = Math.floor(baseStats.metalProduction * race.bonuses.metalProduction);
    modifiedStats.crystalProduction = Math.floor(baseStats.crystalProduction * race.bonuses.crystalProduction);
    modifiedStats.researchSpeed = Math.floor(baseStats.researchSpeed * race.bonuses.researchSpeed);
    
    return modifiedStats;
}

// Apply race modifiers to ship stats
function applyShipModifiers(raceId, shipType, baseStats) {
    const race = Object.values(RACE_TYPES).find(r => r.id === raceId);
    if (!race) return baseStats;
    
    const modifiedStats = { ...baseStats };
    
    // Apply general race bonuses
    modifiedStats.cost.metal = Math.floor(baseStats.cost.metal * race.bonuses.shipCost);
    modifiedStats.cost.crystal = Math.floor(baseStats.cost.crystal * race.bonuses.shipCost);
    modifiedStats.speed = baseStats.speed * race.bonuses.shipSpeed;
    modifiedStats.attack = baseStats.attack * race.bonuses.shipAttack;
    modifiedStats.defense = baseStats.defense * race.bonuses.shipDefense;
    
    // Apply specific unit modifiers
    const unitMod = race.unitModifiers[shipType] || race.unitModifiers.all || {};
    
    Object.keys(unitMod).forEach(key => {
        if (key === 'cost') {
            modifiedStats.cost.metal = Math.floor(modifiedStats.cost.metal * unitMod[key]);
            modifiedStats.cost.crystal = Math.floor(modifiedStats.cost.crystal * unitMod[key]);
        } else if (modifiedStats[key] !== undefined) {
            modifiedStats[key] = modifiedStats[key] * unitMod[key];
        } else {
            // Add new properties (like stealth, teleport, etc.)
            modifiedStats[key] = unitMod[key];
        }
    });
    
    return modifiedStats;
}

module.exports = {
    RACE_TYPES,
    isRaceUnlocked,
    getUnlockedRaces,
    applyRaceModifiers,
    applyShipModifiers
};
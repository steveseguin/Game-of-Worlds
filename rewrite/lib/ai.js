/**
 * lib/ai.js - AI opponent system
 * 
 * Implements AI players with different difficulty levels and strategies.
 * AI players can build, research, expand, and engage in combat.
 */

const AI_DIFFICULTIES = {
    EASY: {
        id: 1,
        name: 'Easy',
        reactionTime: 10000, // 10 seconds
        efficiency: 0.5,
        aggression: 0.2,
        expansion: 0.3,
        research: 0.2,
        mistakes: 0.3
    },
    MEDIUM: {
        id: 2,
        name: 'Medium',
        reactionTime: 5000, // 5 seconds
        efficiency: 0.75,
        aggression: 0.4,
        expansion: 0.5,
        research: 0.4,
        mistakes: 0.1
    },
    HARD: {
        id: 3,
        name: 'Hard',
        reactionTime: 2000, // 2 seconds
        efficiency: 0.9,
        aggression: 0.6,
        expansion: 0.7,
        research: 0.6,
        mistakes: 0.05
    },
    INSANE: {
        id: 4,
        name: 'Insane',
        reactionTime: 1000, // 1 second
        efficiency: 1.0,
        aggression: 0.8,
        expansion: 0.9,
        research: 0.8,
        mistakes: 0,
        resourceBonus: 1.5 // Cheats a bit
    }
};

const AI_STRATEGIES = {
    AGGRESSIVE: {
        name: 'Aggressive',
        priorities: {
            military: 0.6,
            economy: 0.2,
            research: 0.1,
            expansion: 0.1
        }
    },
    ECONOMIC: {
        name: 'Economic',
        priorities: {
            military: 0.1,
            economy: 0.6,
            research: 0.2,
            expansion: 0.1
        }
    },
    EXPANSIONIST: {
        name: 'Expansionist',
        priorities: {
            military: 0.2,
            economy: 0.2,
            research: 0.1,
            expansion: 0.5
        }
    },
    SCIENTIFIC: {
        name: 'Scientific',
        priorities: {
            military: 0.1,
            economy: 0.2,
            research: 0.6,
            expansion: 0.1
        }
    },
    BALANCED: {
        name: 'Balanced',
        priorities: {
            military: 0.25,
            economy: 0.25,
            research: 0.25,
            expansion: 0.25
        }
    }
};

class AIPlayer {
    constructor(playerId, gameId, difficulty = AI_DIFFICULTIES.MEDIUM, strategy = AI_STRATEGIES.BALANCED) {
        this.playerId = playerId;
        this.gameId = gameId;
        this.difficulty = difficulty;
        this.strategy = strategy;
        this.memory = {
            threats: new Map(),
            targets: new Map(),
            allies: new Set(),
            enemies: new Set()
        };
        this.active = true;
    }
    
    // Main AI decision loop
    async makeDecisions(gameState, db) {
        if (!this.active) return;
        
        try {
            // Get current game state
            const state = await this.analyzeGameState(db);
            
            // Make mistake chance
            if (Math.random() < this.difficulty.mistakes) {
                return; // Skip turn due to "mistake"
            }
            
            // Prioritize actions based on strategy
            const actions = this.prioritizeActions(state);
            
            // Execute actions with timing
            for (const action of actions) {
                await this.executeAction(action, state, db);
                await this.wait(this.difficulty.reactionTime / actions.length);
            }
        } catch (err) {
            console.error(`AI ${this.playerId} error:`, err);
        }
    }
    
    // Analyze current game state
    async analyzeGameState(db) {
        const state = {
            resources: await this.getResources(db),
            ownedSectors: await this.getOwnedSectors(db),
            fleets: await this.getFleets(db),
            enemyFleets: await this.getEnemyFleets(db),
            availableTechs: await this.getAvailableTechs(db),
            nearbyEnemies: await this.getNearbyEnemies(db),
            expansionTargets: await this.getExpansionTargets(db)
        };
        
        return state;
    }
    
    // Get AI's resources
    getResources(db) {
        return new Promise((resolve, reject) => {
            db.query(
                `SELECT metal, crystal, research FROM players${this.gameId} WHERE userid = ?`,
                [this.playerId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0] || { metal: 0, crystal: 0, research: 0 });
                }
            );
        });
    }
    
    // Get owned sectors
    getOwnedSectors(db) {
        return new Promise((resolve, reject) => {
            db.query(
                `SELECT sectorid, type FROM map${this.gameId} WHERE owner = ?`,
                [this.playerId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });
    }
    
    // Get fleet information
    getFleets(db) {
        return new Promise((resolve, reject) => {
            db.query(
                `SELECT sectorid, type, COUNT(*) as count 
                 FROM ships${this.gameId} 
                 WHERE owner = ? 
                 GROUP BY sectorid, type`,
                [this.playerId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });
    }
    
    // Get enemy fleets
    getEnemyFleets(db) {
        return new Promise((resolve, reject) => {
            db.query(
                `SELECT s.sectorid, s.owner, s.type, COUNT(*) as count 
                 FROM ships${this.gameId} s
                 WHERE s.owner != ? 
                 GROUP BY s.sectorid, s.owner, s.type`,
                [this.playerId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });
    }
    
    // Get available technologies
    getAvailableTechs(db) {
        return new Promise((resolve, reject) => {
            db.query(
                `SELECT tech, research FROM players${this.gameId} WHERE userid = ?`,
                [this.playerId],
                (err, results) => {
                    if (err) reject(err);
                    else {
                        const player = results[0];
                        const ownedTechs = player.tech ? player.tech.split(',').map(Number) : [];
                        const availableTechs = [];
                        
                        // Simple tech availability check
                        for (let i = 1; i <= 20; i++) {
                            if (!ownedTechs.includes(i)) {
                                availableTechs.push(i);
                            }
                        }
                        
                        resolve({
                            available: availableTechs,
                            research: player.research
                        });
                    }
                }
            );
        });
    }
    
    // Get nearby enemies
    getNearbyEnemies(db) {
        return new Promise((resolve, reject) => {
            db.query(
                `SELECT DISTINCT m2.sectorid, m2.owner
                 FROM map${this.gameId} m1
                 JOIN map${this.gameId} m2 ON ABS(m1.x - m2.x) <= 2 AND ABS(m1.y - m2.y) <= 2
                 WHERE m1.owner = ? AND m2.owner IS NOT NULL AND m2.owner != ?`,
                [this.playerId, this.playerId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });
    }
    
    // Get expansion targets
    getExpansionTargets(db) {
        return new Promise((resolve, reject) => {
            db.query(
                `SELECT m2.sectorid, m2.type
                 FROM map${this.gameId} m1
                 JOIN map${this.gameId} m2 ON ABS(m1.x - m2.x) <= 2 AND ABS(m1.y - m2.y) <= 2
                 WHERE m1.owner = ? AND m2.owner IS NULL AND m2.type BETWEEN 5 AND 10`,
                [this.playerId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });
    }
    
    // Prioritize actions based on strategy
    prioritizeActions(state) {
        const actions = [];
        const priorities = this.strategy.priorities;
        
        // Military actions
        if (priorities.military > 0 && state.nearbyEnemies.length > 0) {
            if (Math.random() < priorities.military) {
                actions.push({ type: 'military', priority: priorities.military });
            }
        }
        
        // Economic actions
        if (priorities.economy > 0) {
            if (Math.random() < priorities.economy) {
                actions.push({ type: 'economy', priority: priorities.economy });
            }
        }
        
        // Research actions
        if (priorities.research > 0 && state.availableTechs.available.length > 0) {
            if (Math.random() < priorities.research) {
                actions.push({ type: 'research', priority: priorities.research });
            }
        }
        
        // Expansion actions
        if (priorities.expansion > 0 && state.expansionTargets.length > 0) {
            if (Math.random() < priorities.expansion) {
                actions.push({ type: 'expansion', priority: priorities.expansion });
            }
        }
        
        // Sort by priority
        return actions.sort((a, b) => b.priority - a.priority);
    }
    
    // Execute an action
    async executeAction(action, state, db) {
        switch (action.type) {
            case 'military':
                await this.executeMilitaryAction(state, db);
                break;
            case 'economy':
                await this.executeEconomicAction(state, db);
                break;
            case 'research':
                await this.executeResearchAction(state, db);
                break;
            case 'expansion':
                await this.executeExpansionAction(state, db);
                break;
        }
    }
    
    // Execute military action
    async executeMilitaryAction(state, db) {
        // Build military ships if we have resources
        if (state.resources.metal >= 500) {
            const homeworld = state.ownedSectors[0];
            if (homeworld) {
                // Build a destroyer
                await this.buildShip(2, homeworld.sectorid, db);
            }
        }
        
        // Attack nearby enemies if we have superior forces
        if (state.nearbyEnemies.length > 0 && Math.random() < this.difficulty.aggression) {
            const target = state.nearbyEnemies[0];
            await this.attackSector(target.sectorid, db);
        }
    }
    
    // Execute economic action
    async executeEconomicAction(state, db) {
        // Build economic buildings
        const colonizedSectors = state.ownedSectors.filter(s => s.type >= 5);
        
        for (const sector of colonizedSectors) {
            if (state.resources.metal >= 50) {
                // Build metal extractor
                await this.buildBuilding(0, sector.sectorid, db);
                break;
            }
        }
    }
    
    // Execute research action
    async executeResearchAction(state, db) {
        if (state.availableTechs.available.length > 0 && state.resources.research >= 100) {
            // Research a random available tech
            const techId = state.availableTechs.available[0];
            await this.researchTech(techId, db);
        }
    }
    
    // Execute expansion action
    async executeExpansionAction(state, db) {
        if (state.expansionTargets.length > 0 && state.resources.metal >= 1000) {
            // Build colony ship
            const homeworld = state.ownedSectors[0];
            if (homeworld) {
                await this.buildShip(5, homeworld.sectorid, db);
            }
        }
    }
    
    // Helper methods for actions
    async buildShip(shipType, sectorId, db) {
        // Simulate ship purchase
        console.log(`AI ${this.playerId} building ship type ${shipType} at sector ${sectorId}`);
    }
    
    async buildBuilding(buildingType, sectorId, db) {
        // Simulate building construction
        console.log(`AI ${this.playerId} building type ${buildingType} at sector ${sectorId}`);
    }
    
    async researchTech(techId, db) {
        // Simulate tech research
        console.log(`AI ${this.playerId} researching tech ${techId}`);
    }
    
    async attackSector(targetSector, db) {
        // Simulate attack
        console.log(`AI ${this.playerId} attacking sector ${targetSector}`);
    }
    
    // Utility function to wait
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Stop AI
    stop() {
        this.active = false;
    }
}

// AI Manager to handle multiple AI players
class AIManager {
    constructor() {
        this.aiPlayers = new Map();
        this.updateInterval = null;
    }
    
    // Add AI player to game
    addAIPlayer(playerId, gameId, difficulty, strategy) {
        const ai = new AIPlayer(playerId, gameId, difficulty, strategy);
        this.aiPlayers.set(`${gameId}:${playerId}`, ai);
        return ai;
    }
    
    // Remove AI player
    removeAIPlayer(gameId, playerId) {
        const key = `${gameId}:${playerId}`;
        const ai = this.aiPlayers.get(key);
        if (ai) {
            ai.stop();
            this.aiPlayers.delete(key);
        }
    }
    
    // Start AI update loop
    start(gameState, db) {
        if (this.updateInterval) return;
        
        this.updateInterval = setInterval(() => {
            this.aiPlayers.forEach(ai => {
                ai.makeDecisions(gameState, db);
            });
        }, 5000); // Update every 5 seconds
    }
    
    // Stop all AI players
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        this.aiPlayers.forEach(ai => ai.stop());
        this.aiPlayers.clear();
    }
}

module.exports = {
    AI_DIFFICULTIES,
    AI_STRATEGIES,
    AIPlayer,
    AIManager
};
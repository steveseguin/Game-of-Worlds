/**
 * lib/sync.js - Game state synchronization system
 * 
 * Ensures game state consistency between server and clients.
 * Handles state updates, conflict resolution, and recovery.
 */

const crypto = require('crypto');

class GameStateSync {
    constructor(gameId, db) {
        this.gameId = gameId;
        this.db = db;
        this.stateVersion = 0;
        this.stateHash = null;
        this.pendingUpdates = new Map();
        this.clientStates = new Map();
    }
    
    // Generate hash of current game state
    async generateStateHash() {
        const state = await this.getFullGameState();
        const stateString = JSON.stringify(state, Object.keys(state).sort());
        return crypto.createHash('sha256').update(stateString).digest('hex');
    }
    
    // Get full game state
    async getFullGameState() {
        const state = {
            version: this.stateVersion,
            timestamp: Date.now(),
            players: await this.getPlayersState(),
            map: await this.getMapState(),
            ships: await this.getShipsState(),
            buildings: await this.getBuildingsState(),
            turn: await this.getTurnState()
        };
        
        return state;
    }
    
    // Get players state
    getPlayersState() {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT userid, race_id, metal, crystal, research, tech, currentsector 
                 FROM players${this.gameId}`,
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });
    }
    
    // Get map state
    getMapState() {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT sectorid, owner, type FROM map${this.gameId}`,
                (err, results) => {
                    if (err) reject(err);
                    else {
                        // Convert to more efficient format
                        const mapState = {};
                        results.forEach(sector => {
                            if (sector.owner) {
                                mapState[sector.sectorid] = {
                                    o: sector.owner,
                                    t: sector.type
                                };
                            }
                        });
                        resolve(mapState);
                    }
                }
            );
        });
    }
    
    // Get ships state
    getShipsState() {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT owner, type, sectorid, COUNT(*) as count 
                 FROM ships${this.gameId} 
                 GROUP BY owner, type, sectorid`,
                (err, results) => {
                    if (err) reject(err);
                    else {
                        // Group by sector for efficiency
                        const shipsState = {};
                        results.forEach(group => {
                            const key = `${group.sectorid}`;
                            if (!shipsState[key]) {
                                shipsState[key] = {};
                            }
                            if (!shipsState[key][group.owner]) {
                                shipsState[key][group.owner] = {};
                            }
                            shipsState[key][group.owner][group.type] = group.count;
                        });
                        resolve(shipsState);
                    }
                }
            );
        });
    }
    
    // Get buildings state
    getBuildingsState() {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT sectorid, type, owner FROM buildings${this.gameId}`,
                (err, results) => {
                    if (err) reject(err);
                    else {
                        // Group by sector
                        const buildingsState = {};
                        results.forEach(building => {
                            const key = `${building.sectorid}`;
                            if (!buildingsState[key]) {
                                buildingsState[key] = [];
                            }
                            buildingsState[key].push({
                                t: building.type,
                                o: building.owner
                            });
                        });
                        resolve(buildingsState);
                    }
                }
            );
        });
    }
    
    // Get turn state
    getTurnState() {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT turn FROM games WHERE id = ?`,
                [this.gameId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]?.turn || 0);
                }
            );
        });
    }
    
    // Create state snapshot
    async createSnapshot() {
        const state = await this.getFullGameState();
        const hash = await this.generateStateHash();
        
        this.stateVersion++;
        this.stateHash = hash;
        
        // Store snapshot in database
        await this.storeSnapshot(state, hash);
        
        return {
            version: this.stateVersion,
            hash: hash,
            timestamp: Date.now()
        };
    }
    
    // Store snapshot in database
    storeSnapshot(state, hash) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `INSERT INTO game_snapshots 
                 (game_id, version, hash, state, created_at) 
                 VALUES (?, ?, ?, ?, NOW())`,
                [this.gameId, this.stateVersion, hash, JSON.stringify(state)],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
    
    // Verify client state
    verifyClientState(clientId, clientVersion, clientHash) {
        const lastKnownState = this.clientStates.get(clientId);
        
        if (!lastKnownState) {
            // New client, needs full sync
            return { valid: false, needsFullSync: true };
        }
        
        if (clientVersion < this.stateVersion) {
            // Client is behind, needs update
            return { valid: false, needsDelta: true, fromVersion: clientVersion };
        }
        
        if (clientHash !== this.stateHash) {
            // State mismatch, needs resync
            return { valid: false, needsFullSync: true };
        }
        
        return { valid: true };
    }
    
    // Get state delta between versions
    async getStateDelta(fromVersion, toVersion) {
        // In a real implementation, this would calculate the actual changes
        // For now, return simplified delta
        const currentState = await this.getFullGameState();
        
        return {
            fromVersion,
            toVersion,
            changes: {
                players: currentState.players,
                map: currentState.map,
                ships: currentState.ships,
                buildings: currentState.buildings
            }
        };
    }
    
    // Apply state update from client
    async applyClientUpdate(clientId, update) {
        // Validate update
        if (!this.validateUpdate(update)) {
            return { success: false, error: 'Invalid update format' };
        }
        
        // Check for conflicts
        const conflicts = await this.checkConflicts(update);
        if (conflicts.length > 0) {
            return { success: false, conflicts };
        }
        
        // Apply update
        try {
            await this.applyUpdate(update);
            this.stateVersion++;
            
            // Broadcast to other clients
            this.broadcastUpdate(update, clientId);
            
            return { success: true, newVersion: this.stateVersion };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
    
    // Validate update format
    validateUpdate(update) {
        return update && 
               update.type && 
               update.playerId && 
               update.data &&
               update.timestamp;
    }
    
    // Check for conflicts
    async checkConflicts(update) {
        const conflicts = [];
        
        // Check if action is still valid
        switch (update.type) {
            case 'move':
                // Check if ships still exist and sector is valid
                const moveValid = await this.validateMove(update.data);
                if (!moveValid) {
                    conflicts.push({ type: 'invalid_move', reason: 'Ships or sector no longer valid' });
                }
                break;
                
            case 'build':
                // Check if resources are sufficient and sector is owned
                const buildValid = await this.validateBuild(update.data);
                if (!buildValid) {
                    conflicts.push({ type: 'invalid_build', reason: 'Insufficient resources or invalid sector' });
                }
                break;
                
            case 'attack':
                // Check if combat is still possible
                const attackValid = await this.validateAttack(update.data);
                if (!attackValid) {
                    conflicts.push({ type: 'invalid_attack', reason: 'Target no longer valid' });
                }
                break;
        }
        
        return conflicts;
    }
    
    // Validate move action
    async validateMove(moveData) {
        // Check if player owns ships in source sector
        // Check if destination is adjacent
        // This is simplified - real implementation would be more thorough
        return true;
    }
    
    // Validate build action
    async validateBuild(buildData) {
        // Check resources
        // Check sector ownership
        // Check building limits
        return true;
    }
    
    // Validate attack action
    async validateAttack(attackData) {
        // Check if ships exist
        // Check if target has enemy ships
        // Check diplomatic status
        return true;
    }
    
    // Apply validated update
    async applyUpdate(update) {
        // This would apply the actual game state change
        // For now, just log it
        console.log(`Applying update: ${update.type} from player ${update.playerId}`);
    }
    
    // Broadcast update to clients
    broadcastUpdate(update, excludeClientId) {
        // This would send the update to all connected clients except the sender
        // Implementation depends on the websocket system
    }
    
    // Handle client disconnect
    handleClientDisconnect(clientId) {
        this.clientStates.delete(clientId);
        
        // Clean up any pending updates from this client
        for (const [key, update] of this.pendingUpdates) {
            if (update.clientId === clientId) {
                this.pendingUpdates.delete(key);
            }
        }
    }
    
    // Recover from desync
    async recoverFromDesync(clientId) {
        // Get full state
        const fullState = await this.getFullGameState();
        const hash = await this.generateStateHash();
        
        // Update client state tracking
        this.clientStates.set(clientId, {
            version: this.stateVersion,
            hash: hash,
            lastSync: Date.now()
        });
        
        return {
            version: this.stateVersion,
            hash: hash,
            state: fullState
        };
    }
    
    // Periodic state validation
    async validateGameState() {
        try {
            // Check for orphaned ships
            await this.checkOrphanedShips();
            
            // Check for invalid ownership
            await this.checkInvalidOwnership();
            
            // Check resource consistency
            await this.checkResourceConsistency();
            
            // Check for stuck games
            await this.checkStuckGames();
            
            return { valid: true };
        } catch (err) {
            console.error(`State validation error for game ${this.gameId}:`, err);
            return { valid: false, error: err.message };
        }
    }
    
    // Check for orphaned ships
    checkOrphanedShips() {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT s.* FROM ships${this.gameId} s
                 LEFT JOIN players${this.gameId} p ON s.owner = p.userid
                 WHERE p.userid IS NULL`,
                (err, results) => {
                    if (err) {
                        reject(err);
                    } else if (results.length > 0) {
                        // Remove orphaned ships
                        this.db.query(
                            `DELETE s FROM ships${this.gameId} s
                             LEFT JOIN players${this.gameId} p ON s.owner = p.userid
                             WHERE p.userid IS NULL`,
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    } else {
                        resolve();
                    }
                }
            );
        });
    }
    
    // Check for invalid sector ownership
    checkInvalidOwnership() {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT m.* FROM map${this.gameId} m
                 LEFT JOIN players${this.gameId} p ON m.owner = p.userid
                 WHERE m.owner IS NOT NULL AND p.userid IS NULL`,
                (err, results) => {
                    if (err) {
                        reject(err);
                    } else if (results.length > 0) {
                        // Clear invalid ownership
                        this.db.query(
                            `UPDATE map${this.gameId} m
                             LEFT JOIN players${this.gameId} p ON m.owner = p.userid
                             SET m.owner = NULL
                             WHERE m.owner IS NOT NULL AND p.userid IS NULL`,
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    } else {
                        resolve();
                    }
                }
            );
        });
    }
    
    // Check resource consistency
    checkResourceConsistency() {
        return new Promise((resolve, reject) => {
            // Ensure no negative resources
            this.db.query(
                `UPDATE players${this.gameId} 
                 SET metal = GREATEST(metal, 0),
                     crystal = GREATEST(crystal, 0),
                     research = GREATEST(research, 0)
                 WHERE metal < 0 OR crystal < 0 OR research < 0`,
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
    
    // Check for stuck games
    checkStuckGames() {
        // This would check if a game hasn't progressed in a long time
        // and potentially force a turn advancement
        return Promise.resolve();
    }
}

// Create sync manager for all games
class SyncManager {
    constructor(db) {
        this.db = db;
        this.gameSyncs = new Map();
    }
    
    // Get or create sync for game
    getGameSync(gameId) {
        if (!this.gameSyncs.has(gameId)) {
            this.gameSyncs.set(gameId, new GameStateSync(gameId, this.db));
        }
        return this.gameSyncs.get(gameId);
    }
    
    // Remove game sync
    removeGameSync(gameId) {
        this.gameSyncs.delete(gameId);
    }
    
    // Periodic validation of all games
    async validateAllGames() {
        const validations = [];
        
        for (const [gameId, sync] of this.gameSyncs) {
            validations.push(
                sync.validateGameState()
                    .then(result => ({ gameId, ...result }))
            );
        }
        
        return Promise.all(validations);
    }
}

module.exports = {
    GameStateSync,
    SyncManager
};
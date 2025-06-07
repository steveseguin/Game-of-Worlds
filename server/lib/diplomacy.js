/**
 * lib/diplomacy.js - Diplomacy and alliance system
 * 
 * Manages diplomatic relations, alliances, trade agreements, and treaties
 * between players in the game.
 */

const DIPLOMATIC_STATES = {
    NEUTRAL: { id: 0, name: 'Neutral', canTrade: true, canAttack: true },
    WAR: { id: 1, name: 'War', canTrade: false, canAttack: true },
    PEACE: { id: 2, name: 'Peace', canTrade: true, canAttack: false },
    ALLIANCE: { id: 3, name: 'Alliance', canTrade: true, canAttack: false, shareVision: true },
    TRADE_AGREEMENT: { id: 4, name: 'Trade Agreement', canTrade: true, canAttack: true, tradeBonus: 0.1 }
};

const TREATY_TYPES = {
    NON_AGGRESSION: {
        id: 1,
        name: 'Non-Aggression Pact',
        duration: 10, // turns
        effects: {
            canAttack: false
        }
    },
    TRADE: {
        id: 2,
        name: 'Trade Agreement',
        duration: 20,
        effects: {
            tradeBonus: 0.15,
            resourceShare: 0.05
        }
    },
    RESEARCH: {
        id: 3,
        name: 'Research Agreement',
        duration: 15,
        effects: {
            researchBonus: 0.2,
            techShare: true
        }
    },
    MILITARY: {
        id: 4,
        name: 'Military Alliance',
        duration: 30,
        effects: {
            canAttack: false,
            sharedVision: true,
            mutualDefense: true
        }
    },
    RESOURCE: {
        id: 5,
        name: 'Resource Sharing',
        duration: 10,
        effects: {
            metalShare: 0.1,
            crystalShare: 0.1
        }
    }
};

class DiplomacyManager {
    constructor(gameId, db) {
        this.gameId = gameId;
        this.db = db;
    }
    
    // Create diplomacy tables for a game
    static async createTables(gameId, db) {
        return new Promise((resolve, reject) => {
            // Diplomatic relations table
            db.query(`
                CREATE TABLE IF NOT EXISTS diplomacy${gameId} (
                    player1 INT NOT NULL,
                    player2 INT NOT NULL,
                    state INT DEFAULT 0,
                    reputation INT DEFAULT 0,
                    last_action TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (player1, player2),
                    FOREIGN KEY (player1) REFERENCES users(id),
                    FOREIGN KEY (player2) REFERENCES users(id)
                )
            `, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Treaties table
                db.query(`
                    CREATE TABLE IF NOT EXISTS treaties${gameId} (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        type INT NOT NULL,
                        player1 INT NOT NULL,
                        player2 INT NOT NULL,
                        status VARCHAR(20) DEFAULT 'proposed',
                        proposed_turn INT NOT NULL,
                        accepted_turn INT,
                        expires_turn INT,
                        terms JSON,
                        FOREIGN KEY (player1) REFERENCES users(id),
                        FOREIGN KEY (player2) REFERENCES users(id)
                    )
                `, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    // Trade routes table
                    db.query(`
                        CREATE TABLE IF NOT EXISTS trade_routes${gameId} (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            from_player INT NOT NULL,
                            to_player INT NOT NULL,
                            from_sector INT NOT NULL,
                            to_sector INT NOT NULL,
                            resource_type VARCHAR(20),
                            amount INT DEFAULT 0,
                            established_turn INT NOT NULL,
                            FOREIGN KEY (from_player) REFERENCES users(id),
                            FOREIGN KEY (to_player) REFERENCES users(id)
                        )
                    `, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            });
        });
    }
    
    // Get diplomatic state between two players
    getDiplomaticState(player1, player2) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT state, reputation FROM diplomacy${this.gameId} 
                 WHERE (player1 = ? AND player2 = ?) OR (player1 = ? AND player2 = ?)`,
                [player1, player2, player2, player1],
                (err, results) => {
                    if (err) {
                        reject(err);
                    } else if (results.length === 0) {
                        resolve({ state: DIPLOMATIC_STATES.NEUTRAL, reputation: 0 });
                    } else {
                        const state = Object.values(DIPLOMATIC_STATES).find(s => s.id === results[0].state);
                        resolve({ state, reputation: results[0].reputation });
                    }
                }
            );
        });
    }
    
    // Set diplomatic state
    setDiplomaticState(player1, player2, stateId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `INSERT INTO diplomacy${this.gameId} (player1, player2, state) 
                 VALUES (?, ?, ?) 
                 ON DUPLICATE KEY UPDATE state = ?, last_action = NOW()`,
                [player1, player2, stateId, stateId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
    
    // Propose treaty
    proposeTreaty(proposer, recipient, treatyType, terms = {}) {
        return new Promise((resolve, reject) => {
            const treaty = TREATY_TYPES[treatyType];
            if (!treaty) {
                reject(new Error('Invalid treaty type'));
                return;
            }
            
            this.db.query(
                `INSERT INTO treaties${this.gameId} 
                 (type, player1, player2, proposed_turn, terms) 
                 VALUES (?, ?, ?, ?, ?)`,
                [treaty.id, proposer, recipient, 0, JSON.stringify(terms)], // Current turn should be passed
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result.insertId);
                }
            );
        });
    }
    
    // Accept treaty
    acceptTreaty(treatyId, currentTurn) {
        return new Promise((resolve, reject) => {
            // First get treaty details
            this.db.query(
                `SELECT * FROM treaties${this.gameId} WHERE id = ? AND status = 'proposed'`,
                [treatyId],
                (err, results) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (results.length === 0) {
                        reject(new Error('Treaty not found or already processed'));
                        return;
                    }
                    
                    const treaty = results[0];
                    const treatyType = Object.values(TREATY_TYPES).find(t => t.id === treaty.type);
                    const expiresTurn = currentTurn + treatyType.duration;
                    
                    // Update treaty status
                    this.db.query(
                        `UPDATE treaties${this.gameId} 
                         SET status = 'active', accepted_turn = ?, expires_turn = ? 
                         WHERE id = ?`,
                        [currentTurn, expiresTurn, treatyId],
                        (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                // Apply treaty effects
                                this.applyTreatyEffects(treaty, treatyType);
                                resolve();
                            }
                        }
                    );
                }
            );
        });
    }
    
    // Reject treaty
    rejectTreaty(treatyId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `UPDATE treaties${this.gameId} 
                 SET status = 'rejected' 
                 WHERE id = ? AND status = 'proposed'`,
                [treatyId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
    
    // Cancel treaty
    cancelTreaty(treatyId, playerId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `UPDATE treaties${this.gameId} 
                 SET status = 'cancelled' 
                 WHERE id = ? AND status = 'active' 
                 AND (player1 = ? OR player2 = ?)`,
                [treatyId, playerId, playerId],
                (err, result) => {
                    if (err) {
                        reject(err);
                    } else if (result.affectedRows === 0) {
                        reject(new Error('Cannot cancel treaty'));
                    } else {
                        // Apply reputation penalty for breaking treaty
                        this.adjustReputation(playerId, -10);
                        resolve();
                    }
                }
            );
        });
    }
    
    // Get active treaties for a player
    getActiveTreaties(playerId, currentTurn) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT t.*, u1.username as player1_name, u2.username as player2_name
                 FROM treaties${this.gameId} t
                 JOIN users u1 ON t.player1 = u1.id
                 JOIN users u2 ON t.player2 = u2.id
                 WHERE (t.player1 = ? OR t.player2 = ?) 
                 AND t.status = 'active' 
                 AND t.expires_turn > ?`,
                [playerId, playerId, currentTurn],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });
    }
    
    // Establish trade route
    establishTradeRoute(fromPlayer, toPlayer, fromSector, toSector, resourceType, amount) {
        return new Promise((resolve, reject) => {
            // Verify sectors are owned by respective players
            this.verifySectorOwnership(fromSector, fromPlayer)
                .then(() => this.verifySectorOwnership(toSector, toPlayer))
                .then(() => {
                    // Create trade route
                    this.db.query(
                        `INSERT INTO trade_routes${this.gameId} 
                         (from_player, to_player, from_sector, to_sector, resource_type, amount, established_turn) 
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [fromPlayer, toPlayer, fromSector, toSector, resourceType, amount, 0], // Current turn
                        (err, result) => {
                            if (err) reject(err);
                            else resolve(result.insertId);
                        }
                    );
                })
                .catch(reject);
        });
    }
    
    // Process trade routes (called each turn)
    processTradeRoutes(currentTurn) {
        return new Promise((resolve, reject) => {
            // Get all active trade routes
            this.db.query(
                `SELECT * FROM trade_routes${this.gameId}`,
                (err, routes) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    const transfers = [];
                    
                    routes.forEach(route => {
                        // Check if route is still valid
                        Promise.all([
                            this.verifySectorOwnership(route.from_sector, route.from_player),
                            this.verifySectorOwnership(route.to_sector, route.to_player)
                        ]).then(() => {
                            // Transfer resources
                            transfers.push(this.transferResources(
                                route.from_player,
                                route.to_player,
                                route.resource_type,
                                route.amount
                            ));
                        }).catch(() => {
                            // Route no longer valid, remove it
                            this.db.query(
                                `DELETE FROM trade_routes${this.gameId} WHERE id = ?`,
                                [route.id]
                            );
                        });
                    });
                    
                    Promise.all(transfers)
                        .then(() => resolve())
                        .catch(reject);
                }
            );
        });
    }
    
    // Transfer resources between players
    transferResources(fromPlayer, toPlayer, resourceType, amount) {
        return new Promise((resolve, reject) => {
            // Whitelist validation for resourceType
            const allowedResourceTypes = ['metal', 'crystal', 'research'];
            if (!allowedResourceTypes.includes(resourceType)) {
                reject(new Error('Invalid resource type'));
                return;
            }

            this.db.beginTransaction((err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Deduct from sender
                this.db.query(
                    `UPDATE players${this.gameId} 
                     SET ${resourceType} = ${resourceType} - ? 
                     WHERE userid = ? AND ${resourceType} >= ?`,
                    [amount, fromPlayer, amount],
                    (err, result) => {
                        if (err || result.affectedRows === 0) {
                            this.db.rollback();
                            reject(new Error('Insufficient resources'));
                            return;
                        }
                        
                        // Add to recipient
                        this.db.query(
                            `UPDATE players${this.gameId} 
                             SET ${resourceType} = ${resourceType} + ? 
                             WHERE userid = ?`,
                            [amount, toPlayer],
                            (err) => {
                                if (err) {
                                    this.db.rollback();
                                    reject(err);
                                } else {
                                    this.db.commit();
                                    resolve();
                                }
                            }
                        );
                    }
                );
            });
        });
    }
    
    // Verify sector ownership
    verifySectorOwnership(sectorId, playerId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT owner FROM map${this.gameId} WHERE sectorid = ?`,
                [sectorId],
                (err, results) => {
                    if (err) {
                        reject(err);
                    } else if (results.length === 0 || results[0].owner !== playerId) {
                        reject(new Error('Sector not owned by player'));
                    } else {
                        resolve();
                    }
                }
            );
        });
    }
    
    // Adjust player reputation
    adjustReputation(playerId, amount) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `UPDATE diplomacy${this.gameId} 
                 SET reputation = reputation + ? 
                 WHERE player1 = ? OR player2 = ?`,
                [amount, playerId, playerId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
    
    // Apply treaty effects
    applyTreatyEffects(treaty, treatyType) {
        // This would be expanded to actually apply the effects
        // For now, it's a placeholder
        console.log(`Applying treaty effects for ${treatyType.name} between ${treaty.player1} and ${treaty.player2}`);
    }
    
    // Check if players can attack each other
    canAttack(attacker, defender) {
        return new Promise((resolve, reject) => {
            // Check diplomatic state
            this.getDiplomaticState(attacker, defender)
                .then(state => {
                    if (!state.state.canAttack) {
                        resolve(false);
                        return;
                    }
                    
                    // Check active treaties
                    return this.getActiveTreaties(attacker, 0); // Current turn should be passed
                })
                .then(treaties => {
                    if (!treaties) {
                        resolve(true);
                        return;
                    }
                    
                    // Check if any treaty prevents attack
                    const preventingTreaty = treaties.find(t => 
                        (t.player1 === defender || t.player2 === defender) &&
                        t.type === TREATY_TYPES.NON_AGGRESSION.id
                    );
                    
                    resolve(!preventingTreaty);
                })
                .catch(reject);
        });
    }
    
    // Get diplomatic overview for a player
    getDiplomaticOverview(playerId) {
        return new Promise((resolve, reject) => {
            const overview = {
                relations: [],
                treaties: [],
                tradeRoutes: []
            };
            
            // Get all diplomatic relations
            this.db.query(
                `SELECT d.*, u.username 
                 FROM diplomacy${this.gameId} d
                 JOIN users u ON (
                     CASE 
                         WHEN d.player1 = ? THEN d.player2 = u.id
                         ELSE d.player1 = u.id
                     END
                 )
                 WHERE d.player1 = ? OR d.player2 = ?`,
                [playerId, playerId, playerId],
                (err, relations) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    overview.relations = relations;
                    
                    // Get treaties
                    this.getActiveTreaties(playerId, 0) // Current turn
                        .then(treaties => {
                            overview.treaties = treaties;
                            
                            // Get trade routes
                            return new Promise((res, rej) => {
                                this.db.query(
                                    `SELECT * FROM trade_routes${this.gameId} 
                                     WHERE from_player = ? OR to_player = ?`,
                                    [playerId, playerId],
                                    (err, routes) => {
                                        if (err) rej(err);
                                        else res(routes);
                                    }
                                );
                            });
                        })
                        .then(routes => {
                            overview.tradeRoutes = routes;
                            resolve(overview);
                        })
                        .catch(reject);
                }
            );
        });
    }
}

module.exports = {
    DIPLOMATIC_STATES,
    TREATY_TYPES,
    DiplomacyManager
};
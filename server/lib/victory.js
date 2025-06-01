/**
 * lib/victory.js - Victory conditions and game ending logic
 * 
 * Defines various victory conditions and checks for game completion.
 * Handles game ending, winner determination, and stat updates.
 */

const VICTORY_CONDITIONS = {
    DOMINATION: {
        id: 1,
        name: 'Domination Victory',
        description: 'Control 75% of all colonizable planets',
        check: function(gameId, playerId, gameState, db, callback) {
            // Count total colonizable planets and player's planets
            db.query(
                `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN owner = ? THEN 1 ELSE 0 END) as owned
                 FROM map${gameId}
                 WHERE type BETWEEN 5 AND 10`,
                [playerId],
                (err, results) => {
                    if (err) {
                        callback(false, 0);
                        return;
                    }
                    
                    const { total, owned } = results[0];
                    const percentage = total > 0 ? (owned / total) * 100 : 0;
                    callback(percentage >= 75, percentage);
                }
            );
        }
    },
    
    ELIMINATION: {
        id: 2,
        name: 'Elimination Victory',
        description: 'Be the last player with planets',
        check: function(gameId, playerId, gameState, db, callback) {
            // Check if other players have any planets
            db.query(
                `SELECT DISTINCT owner 
                 FROM map${gameId} 
                 WHERE owner IS NOT NULL AND owner != ?`,
                [playerId],
                (err, results) => {
                    if (err) {
                        callback(false, 0);
                        return;
                    }
                    
                    // Victory if no other players have planets
                    callback(results.length === 0, results.length === 0 ? 100 : 0);
                }
            );
        }
    },
    
    ECONOMIC: {
        id: 3,
        name: 'Economic Victory',
        description: 'Accumulate 100,000 total resources',
        check: function(gameId, playerId, gameState, db, callback) {
            db.query(
                `SELECT metal + crystal + research as total
                 FROM players${gameId}
                 WHERE userid = ?`,
                [playerId],
                (err, results) => {
                    if (err || results.length === 0) {
                        callback(false, 0);
                        return;
                    }
                    
                    const total = results[0].total;
                    const percentage = Math.min((total / 100000) * 100, 100);
                    callback(total >= 100000, percentage);
                }
            );
        }
    },
    
    SCIENTIFIC: {
        id: 4,
        name: 'Scientific Victory',
        description: 'Research all technologies',
        check: function(gameId, playerId, gameState, db, callback) {
            db.query(
                `SELECT tech FROM players${gameId} WHERE userid = ?`,
                [playerId],
                (err, results) => {
                    if (err || results.length === 0) {
                        callback(false, 0);
                        return;
                    }
                    
                    const playerTech = results[0].tech ? results[0].tech.split(',').map(Number) : [];
                    const totalTechs = 20; // Adjust based on actual tech tree
                    const percentage = (playerTech.length / totalTechs) * 100;
                    callback(playerTech.length >= totalTechs, percentage);
                }
            );
        }
    },
    
    WONDER: {
        id: 5,
        name: 'Wonder Victory',
        description: 'Build and protect the Galactic Wonder for 10 turns',
        check: function(gameId, playerId, gameState, db, callback) {
            // Check if player has built the wonder
            db.query(
                `SELECT turn_built 
                 FROM wonders${gameId} 
                 WHERE owner = ? AND type = 'galactic'`,
                [playerId],
                (err, results) => {
                    if (err || results.length === 0) {
                        callback(false, 0);
                        return;
                    }
                    
                    const turnBuilt = results[0].turn_built;
                    const currentTurn = gameState.turns[gameId] || 0;
                    const turnsHeld = currentTurn - turnBuilt;
                    const percentage = Math.min((turnsHeld / 10) * 100, 100);
                    callback(turnsHeld >= 10, percentage);
                }
            );
        }
    },
    
    ALLIANCE: {
        id: 6,
        name: 'Alliance Victory',
        description: 'Form an alliance controlling 90% of the galaxy',
        check: function(gameId, playerId, gameState, db, callback) {
            // Get player's alliance
            db.query(
                `SELECT alliance_id FROM players${gameId} WHERE userid = ?`,
                [playerId],
                (err, results) => {
                    if (err || results.length === 0 || !results[0].alliance_id) {
                        callback(false, 0);
                        return;
                    }
                    
                    const allianceId = results[0].alliance_id;
                    
                    // Count alliance control
                    db.query(
                        `SELECT 
                            COUNT(*) as total,
                            SUM(CASE WHEN p.alliance_id = ? THEN 1 ELSE 0 END) as controlled
                         FROM map${gameId} m
                         LEFT JOIN players${gameId} p ON m.owner = p.userid
                         WHERE m.type BETWEEN 5 AND 10`,
                        [allianceId],
                        (err, results) => {
                            if (err) {
                                callback(false, 0);
                                return;
                            }
                            
                            const { total, controlled } = results[0];
                            const percentage = total > 0 ? (controlled / total) * 100 : 0;
                            callback(percentage >= 90, percentage);
                        }
                    );
                }
            );
        }
    },
    
    TIME: {
        id: 7,
        name: 'Time Victory',
        description: 'Have the highest score after 300 turns',
        check: function(gameId, playerId, gameState, db, callback) {
            const currentTurn = gameState.turns[gameId] || 0;
            
            if (currentTurn < 300) {
                callback(false, (currentTurn / 300) * 100);
                return;
            }
            
            // Calculate scores and determine winner
            calculateScores(gameId, db, (err, scores) => {
                if (err) {
                    callback(false, 100);
                    return;
                }
                
                const highestScore = Math.max(...scores.map(s => s.score));
                const playerScore = scores.find(s => s.playerId === playerId);
                
                callback(
                    playerScore && playerScore.score === highestScore,
                    100
                );
            });
        }
    }
};

// Calculate player scores
function calculateScores(gameId, db, callback) {
    db.query(
        `SELECT 
            p.userid as playerId,
            p.metal + p.crystal + p.research as resources,
            COUNT(DISTINCT m.sectorid) as planets,
            COUNT(DISTINCT s.id) as ships,
            COUNT(DISTINCT b.id) as buildings,
            LENGTH(p.tech) - LENGTH(REPLACE(p.tech, ',', '')) + 1 as techs
         FROM players${gameId} p
         LEFT JOIN map${gameId} m ON m.owner = p.userid
         LEFT JOIN ships${gameId} s ON s.owner = p.userid
         LEFT JOIN buildings${gameId} b ON b.owner = p.userid
         GROUP BY p.userid`,
        (err, results) => {
            if (err) {
                callback(err, null);
                return;
            }
            
            const scores = results.map(player => ({
                playerId: player.playerId,
                score: player.resources + 
                       (player.planets * 1000) +
                       (player.ships * 100) +
                       (player.buildings * 500) +
                       (player.techs * 2000)
            }));
            
            callback(null, scores);
        }
    );
}

// Check all victory conditions for a player
function checkVictoryConditions(gameId, playerId, gameState, db, callback) {
    const conditions = Object.values(VICTORY_CONDITIONS);
    const results = [];
    let checked = 0;
    
    conditions.forEach(condition => {
        condition.check(gameId, playerId, gameState, db, (achieved, progress) => {
            results.push({
                condition: condition.name,
                achieved,
                progress
            });
            
            checked++;
            if (checked === conditions.length) {
                // Check if any victory condition is met
                const victory = results.find(r => r.achieved);
                callback(victory || null, results);
            }
        });
    });
}

// Check all players for victory
function checkAllPlayersForVictory(gameId, gameState, db, callback) {
    db.query(
        `SELECT userid FROM players${gameId}`,
        (err, players) => {
            if (err) {
                callback(err);
                return;
            }
            
            let checked = 0;
            let winner = null;
            
            players.forEach(player => {
                checkVictoryConditions(gameId, player.userid, gameState, db, (victory, progress) => {
                    if (victory && !winner) {
                        winner = {
                            playerId: player.userid,
                            condition: victory.condition
                        };
                    }
                    
                    checked++;
                    if (checked === players.length) {
                        callback(null, winner);
                    }
                });
            });
        }
    );
}

// End the game and record results
function endGame(gameId, winnerId, winCondition, gameState, db, callback) {
    // Update game status
    db.query(
        'UPDATE games SET status = "completed", winner = ? WHERE id = ?',
        [winnerId, gameId],
        (err) => {
            if (err) {
                callback(err);
                return;
            }
            
            // Calculate final scores
            calculateScores(gameId, db, (err, scores) => {
                if (err) {
                    callback(err);
                    return;
                }
                
                // Record game history
                const duration = gameState.turns[gameId] || 0;
                const playerCount = scores.length;
                
                db.query(
                    `INSERT INTO game_history 
                     (game_id, winner_id, end_reason, duration, player_count) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [gameId, winnerId, winCondition, duration, playerCount],
                    (err) => {
                        if (err) {
                            callback(err);
                            return;
                        }
                        
                        // Update player stats
                        updatePlayerStats(gameId, winnerId, scores, db, (err) => {
                            if (err) {
                                callback(err);
                                return;
                            }
                            
                            // Clean up game state
                            cleanupGame(gameId, gameState);
                            
                            callback(null, {
                                winner: winnerId,
                                condition: winCondition,
                                scores: scores
                            });
                        });
                    }
                );
            });
        }
    );
}

// Update player statistics after game ends
function updatePlayerStats(gameId, winnerId, scores, db, callback) {
    const updates = [];
    
    scores.forEach(score => {
        const isWinner = score.playerId === winnerId;
        
        updates.push(new Promise((resolve, reject) => {
            db.query(
                `UPDATE user_stats SET 
                 games_played = games_played + 1,
                 wins = wins + ?,
                 losses = losses + ?,
                 last_active = NOW()
                 WHERE user_id = ?`,
                [isWinner ? 1 : 0, isWinner ? 0 : 1, score.playerId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        }));
    });
    
    Promise.all(updates)
        .then(() => callback(null))
        .catch(err => callback(err));
}

// Clean up game resources
function cleanupGame(gameId, gameState) {
    // Stop turn timer
    if (gameState.gameTimer[gameId]) {
        clearInterval(gameState.gameTimer[gameId]);
        delete gameState.gameTimer[gameId];
    }
    
    // Remove from active games
    delete gameState.activeGames[gameId];
    delete gameState.turns[gameId];
    
    // Disconnect players from this game
    gameState.clients.forEach(client => {
        if (client.gameid === gameId) {
            client.gameid = null;
            client.sendUTF('gameover::' + gameId);
        }
    });
}

// Get victory progress for all conditions
function getVictoryProgress(gameId, playerId, gameState, db, callback) {
    const conditions = Object.values(VICTORY_CONDITIONS);
    const progress = {};
    let checked = 0;
    
    conditions.forEach(condition => {
        condition.check(gameId, playerId, gameState, db, (achieved, percent) => {
            progress[condition.name] = {
                description: condition.description,
                progress: percent,
                achieved
            };
            
            checked++;
            if (checked === conditions.length) {
                callback(null, progress);
            }
        });
    });
}

module.exports = {
    VICTORY_CONDITIONS,
    checkVictoryConditions,
    checkAllPlayersForVictory,
    endGame,
    calculateScores,
    getVictoryProgress
};
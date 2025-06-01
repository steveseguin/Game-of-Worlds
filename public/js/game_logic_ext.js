// rewrite/game_logic_ext.js

// Define Win Conditions
const WIN_CONDITIONS = {
    CONQUEST: { percentage: 80, description: "Controlling majority of the galaxy" },
    ELIMINATION: { description: "Eliminating all opponents" },
    TECHNOLOGY: { techCount: 20, description: "Achieving technological superiority" },
    TIME_LIMIT: { turns: 50, description: "Having most territory when time limit is reached" }
};

// --- Game End Functions ---

// endGame now takes dependencies as an argument
function endGame(gameId, winnerId, reasonDescription, dependencies) {
    const { db, clients, activeGames, gameTimer, turns } = dependencies;

    if (activeGames[gameId] && activeGames[gameId].status === 'completed') {
        console.log(`Game ${gameId} has already been ended. Skipping duplicate endGame call.`);
        return;
    }

    if (activeGames[gameId]) {
        activeGames[gameId].status = 'completed';
    } else {
        activeGames[gameId] = { status: 'completed' }; // Initialize if not present
    }

    console.log(`Ending game ${gameId}. Winner: ${winnerId || 'None (Draw)'}. Reason: ${reasonDescription}`);

    db.query(`UPDATE games SET status = 'completed', winner = ? WHERE id = ?`,
        [winnerId, gameId], (err) => {
            if (err) {
                console.error(`Error updating game status for game ${gameId} to completed:`, err);
            }
        });

    if (gameTimer[gameId]) {
        clearInterval(gameTimer[gameId]);
        delete gameTimer[gameId];
        console.log(`Game timer cleared for game ${gameId}.`);
    }

    const baseMessage = winnerId
        ? `Player ${winnerId} has won! Reason: ${reasonDescription}.`
        : `Game has ended. Reason: ${reasonDescription}.`;

    clients.forEach(client => {
        if (client.gameid === gameId) {
            if (winnerId && client.name === winnerId) {
                client.sendUTF(`VICTORY! You have won the game! Reason: ${reasonDescription}`);
            } else {
                client.sendUTF(`Game over! ${baseMessage}`);
            }
        }
    });

    if (turns && turns[gameId]) { // Ensure turns object and gameId entry exist
        delete turns[gameId];
    }
    console.log(`Game ${gameId} processing finished in endGame function (external).`);
}


// --- Individual Win Condition Checkers ---
// These checkers will call the passed endGameRef function with dependencies

function checkConquestVictory(gameId, dependencies) {
    const { db, activeGames, endGameRef } = dependencies;
    if (!activeGames[gameId] || activeGames[gameId].status === 'completed') return;

    db.query(`SELECT COUNT(*) as totalSectors FROM map${gameId} WHERE sectortype > 5`, (err, totalResults) => {
        if (err || totalResults.length === 0 || totalResults[0].totalSectors === 0) {
            if(err) console.error(`Conquest Check: Error getting total sectors for game ${gameId}:`, err);
            return;
        }
        const totalSectors = totalResults[0].totalSectors;

        db.query(`SELECT ownerid, COUNT(*) as sectorCount FROM map${gameId} WHERE ownerid != '0' AND colonized = 1 GROUP BY ownerid`, (err, playerSectorCounts) => {
            if (err) {
                console.error(`Conquest Check: Error getting player sector counts for game ${gameId}:`, err);
                return;
            }
            playerSectorCounts.forEach(player => {
                if (!activeGames[gameId] || activeGames[gameId].status === 'completed') return;
                const percentageOwned = (player.sectorCount / totalSectors) * 100;
                if (percentageOwned >= WIN_CONDITIONS.CONQUEST.percentage) {
                    endGameRef(gameId, player.ownerid, WIN_CONDITIONS.CONQUEST.description, dependencies);
                }
            });
        });
    });
}

function checkEliminationVictory(gameId, dependencies) {
    const { db, activeGames, endGameRef } = dependencies;
    if (!activeGames[gameId] || activeGames[gameId].status === 'completed') return;

    db.query(`SELECT DISTINCT ownerid FROM map${gameId} WHERE ownerid != '0' AND colonized = 1`, (err, results) => {
        if (err) {
            console.error(`Elimination Check: Error getting active players for game ${gameId}:`, err);
            return;
        }
        if (!activeGames[gameId] || activeGames[gameId].status === 'completed') return;

        db.query(`SELECT COUNT(*) as totalPlayers FROM players${gameId}`, (playerErr, playerCountResults) => {
            if (playerErr || playerCountResults.length === 0) {
                if(playerErr) console.error(`Elimination Check: Error getting total player count for game ${gameId}:`, playerErr);
                return;
            }
            const totalPlayersInGame = playerCountResults[0].totalPlayers;

            if (results.length === 1 && totalPlayersInGame > 1) {
                endGameRef(gameId, results[0].ownerid, WIN_CONDITIONS.ELIMINATION.description, dependencies);
            } else if (results.length === 0 && totalPlayersInGame > 0) {
                console.log(`Elimination Check: No players own any colonized sectors in game ${gameId}, or all eliminated.`);
            }
        });
    });
}

function checkTechnologyVictory(gameId, dependencies) {
    const { db, activeGames, endGameRef } = dependencies;
    if (!activeGames[gameId] || activeGames[gameId].status === 'completed') return;

    db.query(`SELECT playerid, tech_levels FROM players${gameId}`, (err, playersData) => {
        if (err) {
            console.error(`Technology Check: Error getting player tech levels for game ${gameId}:`, err);
            return;
        }

        playersData.forEach(player => {
            if (!activeGames[gameId] || activeGames[gameId].status === 'completed') return;

            let researchedTechCount = 0;
            if (player.tech_levels) {
                try {
                    const techs = JSON.parse(player.tech_levels);
                    for (const techKey in techs) {
                        if (techs.hasOwnProperty(techKey) && techs[techKey] >= 1) {
                            researchedTechCount++;
                        }
                    }
                } catch (e) {
                    console.error(`Technology Check: Error parsing tech_levels JSON for player ${player.playerid} in game ${gameId}:`, e, "Tech Levels String:", player.tech_levels);
                    return;
                }
            }

            if (researchedTechCount >= WIN_CONDITIONS.TECHNOLOGY.techCount) {
                if (!activeGames[gameId] || activeGames[gameId].status === 'completed') return;
                endGameRef(gameId, player.playerid, WIN_CONDITIONS.TECHNOLOGY.description, dependencies);
            }
        });
    });
}

function checkTimeLimitVictory(gameId, dependencies) {
    const { db, activeGames, endGameRef } = dependencies;
    if (!activeGames[gameId] || activeGames[gameId].status === 'completed') return;

    db.query('SELECT turn FROM games WHERE id = ? LIMIT 1', [gameId], (err, gameResults) => {
        if (err || gameResults.length === 0) {
            if(err) console.error(`Time Limit Check: Error getting current turn for game ${gameId}:`, err);
            return;
        }
        const currentTurn = gameResults[0].turn;

        if (currentTurn >= WIN_CONDITIONS.TIME_LIMIT.turns) {
            db.query(`SELECT ownerid, COUNT(*) as sectorCount FROM map${gameId} WHERE ownerid != '0' AND colonized = 1 GROUP BY ownerid ORDER BY sectorCount DESC LIMIT 1`, (err, results) => {
                if (!activeGames[gameId] || activeGames[gameId].status === 'completed') return;
                if (err) {
                    console.error(`Time Limit Check: Error determining player with most territory for game ${gameId}:`, err);
                    return;
                }
                if (results.length > 0 && results[0].ownerid) {
                    endGameRef(gameId, results[0].ownerid, WIN_CONDITIONS.TIME_LIMIT.description, dependencies);
                } else {
                    console.log(`Time Limit Check: No player owns territory in game ${gameId} at turn limit.`);
                    endGameRef(gameId, null, "Time limit reached, but no player controls territory. Game is a draw.", dependencies);
                }
            });
        }
    });
}

// Main function to check all game end conditions
function checkGameEndConditions(gameId, dependencies) {
    const { activeGames } = dependencies;
    if (!activeGames[gameId] || activeGames[gameId].status === 'completed') {
        return;
    }

    const extendedDependencies = { ...dependencies, endGameRef: module.exports.endGame };

    checkConquestVictory(gameId, extendedDependencies);

    if (activeGames[gameId] && activeGames[gameId].status !== 'completed') {
        checkEliminationVictory(gameId, extendedDependencies);
    }
    if (activeGames[gameId] && activeGames[gameId].status !== 'completed') {
        checkTechnologyVictory(gameId, extendedDependencies);
    }
    if (activeGames[gameId] && activeGames[gameId].status !== 'completed') {
        checkTimeLimitVictory(gameId, extendedDependencies);
    }
}

// --- Fleet Movement Logic ---
function moveFleetTransactional(db, gameId, playerId, sourceSectorId, targetSectorId, shipsToMove, movementCost, callback) {
    db.beginTransaction(transactionErr => {
        if (transactionErr) {
            console.error(`${new Date()} Transaction Start Error for game ${gameId}, player ${playerId}:`, transactionErr);
            return callback(transactionErr);
        }

        // 1. Check and Debit Crystal
        db.query(`SELECT crystal FROM players${gameId} WHERE playerid = ? FOR UPDATE`, [playerId], (selectErr, results) => {
            if (selectErr) {
                console.error(`${new Date()} Error selecting crystal for player ${playerId} in game ${gameId}:`, selectErr);
                return db.rollback(() => callback(selectErr));
            }
            if (results.length === 0) {
                return db.rollback(() => callback(new Error(`Player ${playerId} not found in game ${gameId}`)));
            }

            const currentCrystal = results[0].crystal;
            if (currentCrystal < movementCost) {
                return db.rollback(() => callback(new Error(`Player ${playerId} has insufficient crystal (${currentCrystal}) for movement cost (${movementCost})`)));
            }

            db.query(`UPDATE players${gameId} SET crystal = crystal - ? WHERE playerid = ?`, [movementCost, playerId], updateCrystalErr => {
                if (updateCrystalErr) {
                    console.error(`${new Date()} Error debiting crystal for player ${playerId} in game ${gameId}:`, updateCrystalErr);
                    return db.rollback(() => callback(updateCrystalErr));
                }

                // Process each ship type sequentially
                let shipIndex = 0;
                function processNextShip() {
                    if (shipIndex >= shipsToMove.length) {
                        // All ships processed, commit transaction
                        db.commit(commitErr => {
                            if (commitErr) {
                                console.error(`${new Date()} Transaction Commit Error for game ${gameId}, player ${playerId}:`, commitErr);
                                return db.rollback(() => callback(commitErr));
                            }
                            console.log(`${new Date()} Fleet movement transaction successful for player ${playerId} in game ${gameId}.`);
                            callback(null, "Fleet dispatched successfully and resources/source sector updated.");
                        });
                        return;
                    }

                    const ship = shipsToMove[shipIndex];
                    const shipColumnName = `total${ship.type}`; // e.g., totalship1
                    const shipComingColumnName = `tot${ship.type}coming`; // e.g., totship1coming

                    // 2. Decrement ships from source sector
                    // Check if sourceSectorId is valid (e.g., not undefined or null)
                    if (sourceSectorId === undefined || sourceSectorId === null) {
                        console.error(`${new Date()} Invalid sourceSectorId for game ${gameId}, player ${playerId}.`);
                        return db.rollback(() => callback(new Error('Invalid source sector ID.')));
                    }

                    db.query(`UPDATE map${gameId} SET ${shipColumnName} = ${shipColumnName} - ? WHERE sectorid = ? AND ${shipColumnName} >= ?`,
                        [ship.count, sourceSectorId, ship.count],
                        (sourceUpdateErr, sourceResult) => {
                            if (sourceUpdateErr) {
                                console.error(`${new Date()} Error updating source sector ${sourceSectorId} for ${shipColumnName}, player ${playerId}:`, sourceUpdateErr);
                                return db.rollback(() => callback(sourceUpdateErr));
                            }
                            if (sourceResult.affectedRows === 0) {
                                return db.rollback(() => callback(new Error(`Insufficient ${shipColumnName} in source sector ${sourceSectorId} or sector not found.`)));
                            }

                            // 3. Increment ships in target sector (incoming)
                            // Check if targetSectorId is valid
                             if (targetSectorId === undefined || targetSectorId === null) {
                                console.error(`${new Date()} Invalid targetSectorId for game ${gameId}, player ${playerId}.`);
                                return db.rollback(() => callback(new Error('Invalid target sector ID.')));
                            }

                            db.query(`UPDATE map${gameId} SET ${shipComingColumnName} = ${shipComingColumnName} + ? WHERE sectorid = ?`,
                                [ship.count, targetSectorId],
                                targetUpdateErr => {
                                    if (targetUpdateErr) {
                                        console.error(`${new Date()} Error updating target sector ${targetSectorId} for ${shipComingColumnName}, player ${playerId}:`, targetUpdateErr);
                                        return db.rollback(() => callback(targetUpdateErr));
                                    }
                                    shipIndex++;
                                    processNextShip();
                                }
                            );
                        }
                    );
                }
                processNextShip(); // Start processing the first ship
            });
        });
    });
}


module.exports = {
    WIN_CONDITIONS,
    endGame,
    checkGameEndConditions,
    moveFleetTransactional, // Added new function
    // Individual checkers are not typically called directly from server.js but are exported for completeness/testing
    checkConquestVictory,
    checkEliminationVictory,
    checkTechnologyVictory,
    checkTimeLimitVictory
};

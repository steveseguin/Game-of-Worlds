// In server.js or a new events.js file
const EventEmitter = require('events');
const gameEvents = new EventEmitter();

// Listen for sector updates
gameEvents.on('sectorUpdate', (gameId, sectorId) => {
    // Notify all players in the game about the sector update
    clients.forEach(client => {
        if (client.gameid === gameId) {
            updateSector2(sectorId, client);
        }
    });
});

// Listen for resource updates
gameEvents.on('resourceUpdate', (gameId, playerId) => {
    // Update the specific player
    const client = clientMap[playerId];
    if (client) {
        updateResources(client);
    }
});

// Listen for battle events
gameEvents.on('battle', (gameId, sectorId, attackerId, defenderId, battleData) => {
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
        battleData.result,
        battleData.attackerLosses,
        battleData.defenderLosses
    ]);
    
    // Notify players
    const battleMessage = formatBattleMessage(battleData);
    
    clients.forEach(client => {
        if (client.gameid === gameId && 
            (client.name === attackerId || client.name === defenderId)) {
            client.sendUTF(battleMessage);
        }
    });
});

// Trigger events
function updateSector(gameId, sectorId) {
    // Database update code...
    
    // After update, trigger event
    gameEvents.emit('sectorUpdate', gameId, sectorId);
}
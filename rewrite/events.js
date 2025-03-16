/**
 * events.js - Server-side event system
 * 
 * Provides an event-based communication system for server components.
 * Handles sector updates, resource updates, and battle events notification
 * to relevant players.
 * 
 * This module is server-side and has access to database connections
 * and server-side game state. It uses the EventEmitter pattern to allow
 * loose coupling between game systems.
 * 
 * Dependencies:
 * - Used by server.js for server-side event management
 */
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
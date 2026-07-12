// ============================================================================
// BROADCAST & NOTIFICATION SYSTEM
// Handles sending messages to players and broadcasts within games
// ============================================================================

const { gameTables } = require('../game-tables');

let gameState = null;

function setGameState(gs) {
    gameState = gs;
}

// ============================================================================
// BROADCASTING TO GAMES
// ============================================================================

function broadcastToGame(gameId, message) {
    if (!gameState || !gameState.clients) {
        return;
    }

    gameState.clients.forEach(client => {
        if (client.gameid === gameId) {
            client.sendUTF(message);
        }
    });
}

function broadcastPlayerList(gameId) {
    const db = global.db;
    if (!db) return;
    let playersTable;
    try {
        playersTable = gameTables(gameId).players;
    } catch (_error) {
        return;
    }

    db.query(
        `SELECT userid, race_id FROM ${playersTable} ORDER BY userid`,
        (err, players) => {
            if (err || !players) return;

            const playerList = players.map(p => `${p.userid}:${p.race_id}`).join(',');
            broadcastToGame(gameId, `playerlist::${playerList}`);
        }
    );
}

// ============================================================================
// PLAYER NOTIFICATIONS
// ============================================================================

function notifyPlayer(playerId, message) {
    if (!gameState || !gameState.clients) {
        return;
    }

    gameState.clients.forEach(client => {
        if (Number(client.name) === Number(playerId)) {
            client.sendUTF(message);
        }
    });
}

function sendJoinSuccess(connection, game, raceId, playerCount) {
    const response = {
        gameId: game.id,
        gameMode: game.mode || 'quick',
        playerCount: playerCount,
        maxPlayers: game.maxPlayers || 4,
        raceId: raceId,
        status: 'joined'
    };
    connection.sendUTF(`joinsuccess::${JSON.stringify(response)}`);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    setGameState,
    broadcastToGame,
    broadcastPlayerList,
    notifyPlayer,
    sendJoinSuccess
};

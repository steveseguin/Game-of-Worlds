/**
 * lib/database.js - Server-side in-memory database interface
 * 
 * Provides an in-memory database implementation for development and testing.
 * Handles game data storage and retrieval including games, users, maps, and players.
 * 
 * This module is server-side and has access to server-side game state.
 * It's a simplified database for development purposes.
 * 
 * Dependencies:
 * - Used by server.js and other server-side modules for data storage
 */
 const InMemoryDB = {
    games: {},
    users: {},
    maps: {},
    players: {},
    
    createGame(gameId, settings) {
        this.games[gameId] = {
            id: gameId,
            settings,
            created: new Date(),
            status: 'waiting',
            turn: 0
        };
        this.maps[gameId] = {};
        this.players[gameId] = {};
        return this.games[gameId];
    },
    
    addUser(userId, data) {
        this.users[userId] = {
            id: userId,
            ...data
        };
        return this.users[userId];
    },
    
    addPlayerToGame(gameId, userId) {
        if (!this.games[gameId]) return null;
        this.players[gameId][userId] = {
            id: userId,
            resources: {
                metal: 1000,
                crystal: 500,
                research: 0
            },
            techLevels: {},
            homeworld: null
        };
        return this.players[gameId][userId];
    },
    
    getSector(gameId, sectorId) {
        if (!this.maps[gameId] || !this.maps[gameId][sectorId]) return null;
        return this.maps[gameId][sectorId];
    },
    
    updateSector(gameId, sectorId, data) {
        if (!this.maps[gameId]) this.maps[gameId] = {};
        this.maps[gameId][sectorId] = {
            ...this.maps[gameId][sectorId],
            ...data
        };
        return this.maps[gameId][sectorId];
    },
    
    getPlayer(gameId, userId) {
        if (!this.players[gameId] || !this.players[gameId][userId]) return null;
        return this.players[gameId][userId];
    },
    
    updatePlayer(gameId, userId, data) {
        if (!this.players[gameId] || !this.players[gameId][userId]) return null;
        this.players[gameId][userId] = {
            ...this.players[gameId][userId],
            ...data
        };
        return this.players[gameId][userId];
    }
};

module.exports = InMemoryDB;
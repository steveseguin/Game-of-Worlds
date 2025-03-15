const InMemoryDB = require('./lib/database');
const MapSystem = require('./lib/map');

// Create initial game
const gameId = 1;
const game = InMemoryDB.createGame(gameId, {
    mapWidth: 14,
    mapHeight: 8,
    maxPlayers: 4
});

// Generate map
const { sectors, homeworlds } = MapSystem.generateGameMap(
    game.settings.mapWidth, 
    game.settings.mapHeight, 
    game.settings.maxPlayers
);

// Add sectors to database
sectors.forEach(sector => {
    InMemoryDB.updateSector(gameId, sector.sectorid, sector);
});

// Create test players
const testPlayers = [
    { id: 'player1', name: 'Player 1' },
    { id: 'player2', name: 'Player 2' }
];

testPlayers.forEach((player, index) => {
    // Add user
    InMemoryDB.addUser(player.id, {
        name: player.name,
        currentGame: gameId
    });
    
    // Add player to game
    InMemoryDB.addPlayerToGame(gameId, player.id);
    
    // Assign homeworld
    if (index < homeworlds.length) {
        const homeworldId = homeworlds[index];
        InMemoryDB.updateSector(gameId, homeworldId, {
            ownerid: player.id,
            colonized: 1
        });
        
        // Update player record with homeworld
        InMemoryDB.updatePlayer(gameId, player.id, {
            homeworld: homeworldId
        });
    }
});

console.log(`Game ${gameId} created with ${sectors.length} sectors and ${homeworlds.length} homeworlds`);
console.log('Test players:', testPlayers.map(p => p.id).join(', '));
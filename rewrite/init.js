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

function initializeGame(gameId, mapWidth, mapHeight, playerCount) {
    console.log(`Initializing game ${gameId} with map size ${mapWidth}x${mapHeight} for ${playerCount} players`);
    
    // Create map
    const { sectors, homeworlds } = MapSystem.generateGameMap(mapWidth, mapHeight, playerCount);
    
    // Store sectors in database
    const sectorValues = sectors.map(sector => [
        sector.sectorid,
        sector.sectortype,
        sector.ownerid,
        sector.colonized,
        sector.artifact,
        sector.metalbonus,
        sector.crystalbonus,
        sector.terraformlvl
    ]);
    
    const insertQuery = `INSERT INTO map${gameId} 
        (sectorid, sectortype, ownerid, colonized, artifact, metalbonus, crystalbonus, terraformlvl) 
        VALUES ?`;
    
    db.query(insertQuery, [sectorValues], err => {
        if (err) {
            console.error(`Error inserting sectors for game ${gameId}:`, err);
            return;
        }
        
        console.log(`${sectors.length} sectors created for game ${gameId}`);
        
        // Configure homeworlds
        homeworlds.forEach((sectorId, index) => {
            // Set as homeworld
            db.query(`UPDATE map${gameId} SET 
                sectortype = 10, 
                terraformlvl = 0, 
                colonized = 1,
                metallvl = 1,
                crystallvl = 1,
                academylvl = 1,
                shipyardlvl = 1
                WHERE sectorid = ?`, [sectorId]
            );
        });
        
        console.log(`${homeworlds.length} homeworlds configured for game ${gameId}`);
    });
    
    return { sectors, homeworlds };
}

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
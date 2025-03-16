// Create new file: rewrite/setup.js

const mysql = require('mysql');
const readline = require('readline');

// Configuration
const config = {
    host: '127.0.0.1',
    user: 'root',
    password: 'bitnami'
};

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Create connection
const connection = mysql.createConnection(config);

// Create database and tables
connection.connect(err => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        process.exit(1);
    }
    
    console.log('Connected to MySQL');
    
    // Create database
    connection.query('CREATE DATABASE IF NOT EXISTS game', err => {
        if (err) {
            console.error('Error creating database:', err);
            process.exit(1);
        }
        
        console.log('Database created or already exists');
        
        // Use the database
        connection.query('USE game', err => {
            if (err) {
                console.error('Error selecting database:', err);
                process.exit(1);
            }
            
            // Create users table
            connection.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR(32) PRIMARY KEY,
                    password VARCHAR(255) NOT NULL,
                    username VARCHAR(64) NOT NULL,
                    currentgame INT,
                    tempkey VARCHAR(64),
                    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `, err => {
                if (err) {
                    console.error('Error creating users table:', err);
                    process.exit(1);
                }
                
                console.log('Users table created or already exists');
                
                // Create games table
                connection.query(`
                    CREATE TABLE IF NOT EXISTS games (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(64) NOT NULL,
                        mapwidth INT DEFAULT 14,
                        mapheight INT DEFAULT 8,
                        turn INT DEFAULT 0,
                        status VARCHAR(32) DEFAULT 'waiting',
                        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `, err => {
                    if (err) {
                        console.error('Error creating games table:', err);
                        process.exit(1);
                    }
                    
                    console.log('Games table created or already exists');
                    
                    // Ask if user wants to create a new game
                    rl.question('Do you want to create a new game? (y/n): ', answer => {
                        if (answer.toLowerCase() === 'y') {
                            createNewGame();
                        } else {
                            rl.close();
                            connection.end();
                        }
                    });
                });
            });
        });
    });
});

// Function to create a new game
function createNewGame() {
    rl.question('Enter game name: ', gameName => {
        // Insert game record
        connection.query('INSERT INTO games (name) VALUES (?)', [gameName], (err, result) => {
            if (err) {
                console.error('Error creating game:', err);
                rl.close();
                connection.end();
                return;
            }
            
            const gameId = result.insertId;
            console.log(`Game created with ID: ${gameId}`);
            
            // Create map table for this game
            connection.query(`
                CREATE TABLE map${gameId} (
                    sectorid INT PRIMARY KEY,
                    sectortype INT DEFAULT 0,
                    ownerid VARCHAR(32) DEFAULT '0',
                    colonized TINYINT DEFAULT 0,
                    artifact INT DEFAULT 0,
                    metalbonus FLOAT DEFAULT 100,
                    crystalbonus FLOAT DEFAULT 100,
                    terraformlvl INT DEFAULT 0,
                    orbitalturret INT DEFAULT 0,
                    groundturret INT DEFAULT 0,
                    warpgate TINYINT DEFAULT 0,
                    academylvl INT DEFAULT 0,
                    shipyardlvl INT DEFAULT 0,
                    metallvl INT DEFAULT 0,
                    crystallvl INT DEFAULT 0,
                    totalship1 INT DEFAULT 0,
                    totalship2 INT DEFAULT 0,
                    totalship3 INT DEFAULT 0,
                    totalship4 INT DEFAULT 0,
                    totalship5 INT DEFAULT 0,
                    totalship6 INT DEFAULT 0,
                    totalship7 INT DEFAULT 0,
                    totalship8 INT DEFAULT 0,
                    totalship9 INT DEFAULT 0,
                    totship1build INT DEFAULT 0,
                    totship2build INT DEFAULT 0,
                    totship3build INT DEFAULT 0,
                    totship4build INT DEFAULT 0,
                    totship5build INT DEFAULT 0,
                    totship6build INT DEFAULT 0,
                    totship7build INT DEFAULT 0,
                    totship8build INT DEFAULT 0,
                    totship9build INT DEFAULT 0,
                    totship1coming INT DEFAULT 0,
                    totship2coming INT DEFAULT 0,
                    totship3coming INT DEFAULT 0,
                    totship4coming INT DEFAULT 0,
                    totship5coming INT DEFAULT 0,
                    totship6coming INT DEFAULT 0,
                    totship7coming INT DEFAULT 0,
                    totship8coming INT DEFAULT 0,
                    totship9coming INT DEFAULT 0
                )
            `, err => {
                if (err) {
                    console.error(`Error creating map${gameId} table:`, err);
                    rl.close();
                    connection.end();
                    return;
                }
                
                console.log(`Map table for game ${gameId} created`);
                
                // Create players table for this game
                connection.query(`
                    CREATE TABLE players${gameId} (
                        playerid VARCHAR(32) PRIMARY KEY,
                        metal INT DEFAULT 1000,
                        crystal INT DEFAULT 500,
                        research INT DEFAULT 0,
                        tech1 INT DEFAULT 0,
                        tech2 INT DEFAULT 0,
                        tech3 INT DEFAULT 0,
                        tech4 INT DEFAULT 0,
                        tech5 INT DEFAULT 0,
                        tech6 INT DEFAULT 0,
                        tech7 INT DEFAULT 0,
                        tech8 INT DEFAULT 0,
                        tech9 INT DEFAULT 0,
                        homeworld INT DEFAULT 0
                    )
                `, err => {
                    if (err) {
                        console.error(`Error creating players${gameId} table:`, err);
                        rl.close();
                        connection.end();
                        return;
                    }
                    
                    console.log(`Players table for game ${gameId} created`);
                    
                    // Generate map sectors
                    generateMap(gameId);
                });
            });
        });
    });
}

// Function to generate map sectors
function generateMap(gameId) {
    // Get game dimensions
    connection.query('SELECT mapwidth, mapheight FROM games WHERE id = ?', [gameId], (err, results) => {
        if (err || results.length === 0) {
            console.error('Error retrieving game dimensions:', err);
            rl.close();
            connection.end();
            return;
        }
        
        const { mapwidth, mapheight } = results[0];
        const totalSectors = mapwidth * mapheight;
        
        console.log(`Generating map with ${mapwidth}x${mapheight} dimensions (${totalSectors} sectors)`);
        
        // Generate sectors
        const sectors = [];
        
        for (let i = 1; i <= totalSectors; i++) {
            // Randomize sector type
            let sectorType;
            const roll = Math.random();
            
            if (roll < 0.05) {
                // 5% chance of black hole
                sectorType = 2;
            } else if (roll < 0.15) {
                // 10% chance of asteroid belt
                sectorType = 1;
            } else if (roll < 0.20) {
                // 5% chance of unstable star
                sectorType = 3;
            } else if (roll < 0.25) {
                // 5% chance of brown dwarf
                sectorType = 4;
            } else if (roll < 0.30) {
                // 5% chance of small moon
                sectorType = 5;
            } else if (roll < 0.45) {
                // 15% chance of micro planet
                sectorType = 6;
            } else if (roll < 0.65) {
                // 20% chance of small planet
                sectorType = 7;
            } else if (roll < 0.80) {
                // 15% chance of medium planet
                sectorType = 8;
            } else if (roll < 0.90) {
                // 10% chance of large planet
                sectorType = 9;
            } else {
                // 10% chance of empty space
                sectorType = 0;
            }
            
            // Generate mineral and crystal bonuses
            const metalBonus = Math.floor(Math.random() * 200 + 50); // 50-250%
            const crystalBonus = Math.floor(Math.random() * 200 + 50); // 50-250%
            
            // Generate terraform level (0-5)
            let terraformLevel = 0;
            if (sectorType >= 6 && sectorType <= 9) {
                terraformLevel = Math.floor(Math.random() * 6);
            }
            
            // Insert sector
            sectors.push([i, sectorType, '0', 0, 0, metalBonus, crystalBonus, terraformLevel]);
        }
        
        // Bulk insert sectors
        const insertQuery = `INSERT INTO map${gameId} 
            (sectorid, sectortype, ownerid, colonized, artifact, metalbonus, crystalbonus, terraformlvl) 
            VALUES ?`;
        
        connection.query(insertQuery, [sectors], err => {
            if (err) {
                console.error('Error inserting map sectors:', err);
                rl.close();
                connection.end();
                return;
            }
            
            console.log(`${totalSectors} map sectors generated for game ${gameId}`);
            
            // Generate homeworlds
            rl.question('How many players for this game? ', playerCount => {
                const count = parseInt(playerCount);
                if (isNaN(count) || count <= 0) {
                    console.error('Invalid player count');
                    rl.close();
                    connection.end();
                    return;
                }
                
                setupHomeworlds(gameId, count, mapwidth, mapheight);
            });
        });
    });
}

function assignPlayersToHomeworlds(gameId, playerIds) {
    // Get available homeworlds
    db.query(`SELECT sectorid FROM map${gameId} WHERE sectortype = 10 ORDER BY RAND()`, 
        (err, sectors) => {
            if (err || sectors.length < playerIds.length) {
                console.error("Not enough homeworlds for players");
                return;
            }
            
            // Assign players to homeworlds with starting resources
            playerIds.forEach((playerId, index) => {
                if (index >= sectors.length) return;
                
                const homeworldId = sectors[index].sectorid;
                
                // Assign homeworld
                db.query(`UPDATE map${gameId} SET 
                    ownerid = ?, 
                    colonized = 1,
                    metallvl = 1,
                    crystallvl = 1,
                    academylvl = 1,
                    shipyardlvl = 2,
                    totalship1 = 5,
                    totalship3 = 2
                    WHERE sectorid = ?`, [playerId, homeworldId]);
                
                // Add player to game
                db.query(`INSERT INTO players${gameId} 
                    (playerid, metal, crystal, research) 
                    VALUES (?, 1000, 500, 0)`, [playerId]);
                
                // Update user's current game
                db.query(`UPDATE users SET currentgame = ? WHERE id = ?`, 
                    [gameId, playerId]);
            });
            
            console.log(`Players assigned to homeworlds in game ${gameId}`);
        });
}

// Function to set up homeworlds
function setupHomeworlds(gameId, playerCount, mapWidth, mapHeight) {
    console.log(`Setting up ${playerCount} homeworlds`);
    
    // Get habitable planets
    connection.query(`SELECT sectorid FROM map${gameId} WHERE sectortype >= 6 ORDER BY RAND() LIMIT ?`, 
        [playerCount], (err, results) => {
            if (err || results.length < playerCount) {
                console.error('Error selecting homeworld planets:', err);
                rl.close();
                connection.end();
                return;
            }
            
            const homeworldSectors = results.map(row => row.sectorid);
            console.log(`Selected homeworld sectors: ${homeworldSectors.join(', ')}`);
            
            // Update sectors to homeworlds
            const updatePromises = homeworldSectors.map((sectorId, index) => {
                return new Promise((resolve, reject) => {
                    // Make it a homeworld (type 10)
                    connection.query(`UPDATE map${gameId} SET 
                        sectortype = 10, 
                        terraformlvl = 0,
                        metalbonus = 100,
                        crystalbonus = 100
                        WHERE sectorid = ?`, 
                        [sectorId], err => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            resolve();
                        }
                    );
                });
            });
            
            Promise.all(updatePromises)
                .then(() => {
                    console.log('Homeworlds configured');
                    console.log('\nSetup complete! Your game is ready.');
                    console.log(`Game ID: ${gameId}`);
                    console.log('To add players to this game:');
                    console.log(`1. Create user accounts`);
                    console.log(`2. Set their currentgame field to ${gameId}`);
                    console.log(`3. Add them to the players${gameId} table`);
                    console.log(`4. Assign them to a homeworld sector`);
                    rl.close();
                    connection.end();
                })
                .catch(err => {
                    console.error('Error configuring homeworlds:', err);
                    rl.close();
                    connection.end();
                });
        }
    );
}
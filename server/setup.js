/**
 * setup.js - Server-side database and game setup
 * 
 * Handles initial database setup, table creation, and game initialization.
 * Provides a command-line interface for creating new games and generating maps.
 * 
 * This module is server-side and has full access to database connections.
 * It's primarily used during server deployment and game creation.
 * 
 * Dependencies:
 * - Requires MySQL database connection
 */
// Load environment variables
require('dotenv').config();

const mysql2 = require('mysql2');
const readline = require('readline');

// Configuration
const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
};

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Create connection
const connection = mysql2.createConnection(config);

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
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(64) NOT NULL UNIQUE,
                    password VARCHAR(255) NOT NULL,
                    salt VARCHAR(64) NOT NULL,
                    email VARCHAR(255),
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
                        creator INT,
                        mapwidth INT DEFAULT 14,
                        mapheight INT DEFAULT 8,
                        maxplayers INT DEFAULT 4,
                        started TINYINT DEFAULT 0,
                        turn INT DEFAULT 0,
                        winner INT DEFAULT NULL,
                        status VARCHAR(32) DEFAULT 'waiting',
                        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (creator) REFERENCES users(id)
                    )
                `, err => {
                    if (err) {
                        console.error('Error creating games table:', err);
                        process.exit(1);
                    }
                    
                    console.log('Games table created or already exists');
                    
                    // Add game_history table
                    connection.query(`
                        CREATE TABLE IF NOT EXISTS game_history (
                            id INT AUTO_INCREMENT PRIMARY KEY,
                            game_id INT,
                            winner_id INT,
                            end_reason VARCHAR(32),
                            duration INT,
                            player_count INT,
                            end_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (game_id) REFERENCES games(id),
                            FOREIGN KEY (winner_id) REFERENCES users(id)
                        )
                    `, err => {
                        if (err) {
                            console.error('Error creating game_history table:', err);
                            process.exit(1);
                        }
                        
                        // Add user_stats table with extended tracking
                        connection.query(`
                            CREATE TABLE IF NOT EXISTS user_stats (
                                user_id INT PRIMARY KEY,
                                games_played INT DEFAULT 0,
                                wins INT DEFAULT 0,
                                losses INT DEFAULT 0,
                                total_planets_colonized INT DEFAULT 0,
                                total_crystal_earned INT DEFAULT 0,
                                total_ships_built INT DEFAULT 0,
                                total_battles_won INT DEFAULT 0,
                                total_sectors_explored INT DEFAULT 0,
                                last_active TIMESTAMP,
                                FOREIGN KEY (user_id) REFERENCES users(id)
                            )
                        `, err => {
                            if (err) {
                                console.error('Error creating user_stats table:', err);
                                process.exit(1);
                            }
                            
                            // Add premium_purchases table
                            connection.query(`
                                CREATE TABLE IF NOT EXISTS premium_purchases (
                                    id INT AUTO_INCREMENT PRIMARY KEY,
                                    user_id INT NOT NULL,
                                    race_id INT NOT NULL,
                                    amount DECIMAL(10,2) NOT NULL,
                                    stripe_payment_id VARCHAR(255),
                                    status VARCHAR(32) DEFAULT 'pending',
                                    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                    FOREIGN KEY (user_id) REFERENCES users(id),
                                    UNIQUE KEY unique_user_race (user_id, race_id)
                                )
                            `, err => {
                                if (err) {
                                    console.error('Error creating premium_purchases table:', err);
                                    process.exit(1);
                                }
                                
                                // Add referral tracking to users table
                                connection.query(`
                                    ALTER TABLE users 
                                    ADD COLUMN IF NOT EXISTS referred_by INT DEFAULT NULL,
                                    ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32) UNIQUE,
                                    ADD FOREIGN KEY (referred_by) REFERENCES users(id)
                                `, err => {
                                    if (err && !err.message.includes('Duplicate column name')) {
                                        console.error('Error adding referral columns:', err);
                                        process.exit(1);
                                    }
                                    
                                    console.log('All tables created successfully!');
                                    
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
            });
        });
    });
});

// Function to create a new game
function createNewGame() {
    rl.question('Enter game name: ', gameName => {
        rl.question('Enter creator user ID: ', creatorId => {
            // Insert game record
            connection.query('INSERT INTO games (name, creator) VALUES (?, ?)', [gameName, creatorId], (err, result) => {
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
                        x INT NOT NULL,
                        y INT NOT NULL,
                        sectortype INT DEFAULT 0,
                        ownerid INT DEFAULT NULL,
                        colonized INT DEFAULT 0,
                        artifact INT DEFAULT 0,
                        metalbonus INT DEFAULT 100,
                        crystalbonus INT DEFAULT 100,
                        orbitalturret INT DEFAULT 0,
                        groundturret INT DEFAULT 0,
                        warpgate INT DEFAULT 0,
                        academylvl INT DEFAULT 0,
                        shipyardlvl INT DEFAULT 0,
                        metallvl INT DEFAULT 0,
                        crystallvl INT DEFAULT 0,
                        terraformlvl INT DEFAULT 0,
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
                        totship9coming INT DEFAULT 0,
                        FOREIGN KEY (ownerid) REFERENCES users(id)
                    )
                `, err => {
                    if (err) {
                        console.error(`Error creating map${gameId} table:`, err);
                        rl.close();
                        connection.end();
                        return;
                    }
                    
                    console.log(`Map table for game ${gameId} created`);
                    
                    // Create players table for this game with race support
                    connection.query(`
                        CREATE TABLE players${gameId} (
                            userid INT PRIMARY KEY,
                            race_id INT DEFAULT 1,
                            alliance_id INT DEFAULT NULL,
                            metal INT DEFAULT 100,
                            crystal INT DEFAULT 100,
                            research INT DEFAULT 50,
                            tech VARCHAR(255) DEFAULT '',
                            homeworld INT DEFAULT NULL,
                            currentsector INT DEFAULT NULL,
                            FOREIGN KEY (userid) REFERENCES users(id)
                        )
                    `, err => {
                        if (err) {
                            console.error(`Error creating players${gameId} table:`, err);
                            rl.close();
                            connection.end();
                            return;
                        }
                        
                        console.log(`Players table for game ${gameId} created`);
                        
                        // Create ships table for this game
                        connection.query(`
                            CREATE TABLE ships${gameId} (
                                id INT AUTO_INCREMENT PRIMARY KEY,
                                owner INT NOT NULL,
                                type INT NOT NULL,
                                sectorid INT NOT NULL,
                                FOREIGN KEY (owner) REFERENCES users(id)
                            )
                        `, err => {
                            if (err) {
                                console.error(`Error creating ships${gameId} table:`, err);
                                rl.close();
                                connection.end();
                                return;
                            }
                            
                            console.log(`Ships table for game ${gameId} created`);
                            
                            // Create buildings table for this game
                            connection.query(`
                                CREATE TABLE buildings${gameId} (
                                    id INT AUTO_INCREMENT PRIMARY KEY,
                                    sectorid INT NOT NULL,
                                    type INT NOT NULL,
                                    owner INT NOT NULL,
                                    FOREIGN KEY (owner) REFERENCES users(id)
                                )
                            `, err => {
                                if (err) {
                                    console.error(`Error creating buildings${gameId} table:`, err);
                                    rl.close();
                                    connection.end();
                                    return;
                                }
                                
                                console.log(`Buildings table for game ${gameId} created`);
                                
                                // All tables created successfully
                                console.log(`\nAll tables for game ${gameId} created successfully!`);
                                console.log('\nNext steps:');
                                console.log('1. Have players register accounts');
                                console.log('2. Players can join this game using the game ID');
                                console.log('3. Once all players have joined, the creator can start the game');
                                
                                rl.close();
                                connection.end();
                            });
                        });
                    });
                });
            });
        });
    });
}
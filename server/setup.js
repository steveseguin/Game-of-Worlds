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

function parseDbPort(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 3306;
}

const databaseName = process.env.DB_NAME || 'game';

// Configuration
const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseDbPort(process.env.DB_PORT),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
};

const escapedDbName = mysql2.escapeId(databaseName);

function ensureColumn(conn, table, column, definition, callback) {
    conn.query('SHOW COLUMNS FROM ?? LIKE ?', [table, column], (err, results) => {
        if (err) {
            return callback(err);
        }
        if (results.length > 0) {
            return callback();
        }
        const sql = `ALTER TABLE ${mysql2.escapeId(table)} ADD COLUMN ${mysql2.escapeId(column)} ${definition}`;
        conn.query(sql, callback);
    });
}

function ensureUniqueKey(conn, table, indexName, column, callback) {
    conn.query('SHOW INDEX FROM ?? WHERE Column_name = ?', [table, column], (err, results) => {
        if (err) {
            return callback(err);
        }
        const hasUnique = results.some(row => row.Non_unique === 0);
        if (hasUnique) {
            return callback();
        }
        const sql = `ALTER TABLE ${mysql2.escapeId(table)} ADD CONSTRAINT ${mysql2.escapeId(indexName)} UNIQUE (${mysql2.escapeId(column)})`;
        conn.query(sql, callback);
    });
}

function ensureForeignKey(conn, table, constraintName, column, referencedTable, referencedColumn, options, callback) {
    const opts = options || {};
    conn.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME = ? AND REFERENCED_COLUMN_NAME = ?`,
        [databaseName, table, column, referencedTable, referencedColumn],
        (err, results) => {
            if (err) {
                return callback(err);
            }
            if (results.length > 0) {
                return callback();
            }
            const onDelete = opts.onDelete ? ` ON DELETE ${opts.onDelete}` : '';
            const onUpdate = opts.onUpdate ? ` ON UPDATE ${opts.onUpdate}` : '';
            const sql = `ALTER TABLE ${mysql2.escapeId(table)} ADD CONSTRAINT ${mysql2.escapeId(constraintName)} FOREIGN KEY (${mysql2.escapeId(column)}) REFERENCES ${mysql2.escapeId(referencedTable)} (${mysql2.escapeId(referencedColumn)})${onDelete}${onUpdate}`;
            conn.query(sql, callback);
        }
    );
}

function ensureReferralSchema(conn, callback) {
    ensureColumn(conn, 'users', 'referred_by', 'INT DEFAULT NULL', err => {
        if (err) {
            return callback(err);
        }
        ensureForeignKey(conn, 'users', 'fk_users_referred_by', 'referred_by', 'users', 'id', { onDelete: 'SET NULL' }, err => {
            if (err) {
                return callback(err);
            }
            ensureColumn(conn, 'users', 'referral_code', 'VARCHAR(32)', err => {
                if (err) {
                    return callback(err);
                }
                ensureUniqueKey(conn, 'users', 'users_referral_code_unique', 'referral_code', callback);
            });
        });
    });
}

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
    console.log(`Using database ${databaseName}`);
    
    // Create database
    connection.query(`CREATE DATABASE IF NOT EXISTS ${escapedDbName}`, err => {
        if (err) {
            console.error('Error creating database:', err);
            process.exit(1);
        }
        
        console.log('Database created or already exists');
        
        // Use the database
        connection.query(`USE ${escapedDbName}`, err => {
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
                                ensureReferralSchema(connection, err => {
                                    if (err) {
                                        console.error('Error configuring referral columns:', err);
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
                                
                                // Create diplomacy table for this game
                                connection.query(`
                                    CREATE TABLE diplomacy${gameId} (
                                        id INT AUTO_INCREMENT PRIMARY KEY,
                                        player1_id INT NOT NULL,
                                        player2_id INT NOT NULL,
                                        status VARCHAR(32) DEFAULT 'neutral',
                                        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                        updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                        FOREIGN KEY (player1_id) REFERENCES users(id),
                                        FOREIGN KEY (player2_id) REFERENCES users(id),
                                        UNIQUE KEY unique_relationship (player1_id, player2_id)
                                    )
                                `, err => {
                                    if (err) {
                                        console.error(`Error creating diplomacy${gameId} table:`, err);
                                        rl.close();
                                        connection.end();
                                        return;
                                    }
                                    
                                    console.log(`Diplomacy table for game ${gameId} created`);
                                    
                                    // Create wonders table for this game
                                    connection.query(`
                                        CREATE TABLE wonders${gameId} (
                                            id INT AUTO_INCREMENT PRIMARY KEY,
                                            owner_id INT NOT NULL,
                                            wonder_type VARCHAR(64) NOT NULL,
                                            level INT DEFAULT 1,
                                            sector_id INT NOT NULL,
                                            completed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                            FOREIGN KEY (owner_id) REFERENCES users(id)
                                        )
                                    `, err => {
                                        if (err) {
                                            console.error(`Error creating wonders${gameId} table:`, err);
                                            rl.close();
                                            connection.end();
                                            return;
                                        }
                                        
                                        console.log(`Wonders table for game ${gameId} created`);
                                        
                                        // Create game_snapshots table for this game
                                        connection.query(`
                                            CREATE TABLE game_snapshots${gameId} (
                                                id INT AUTO_INCREMENT PRIMARY KEY,
                                                turn INT NOT NULL,
                                                snapshot_data JSON,
                                                created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                                INDEX idx_turn (turn)
                                            )
                                        `, err => {
                                            if (err) {
                                                console.error(`Error creating game_snapshots${gameId} table:`, err);
                                                rl.close();
                                                connection.end();
                                                return;
                                            }
                                            
                                            console.log(`Game snapshots table for game ${gameId} created`);
                                            
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
            });
        });
    });
}

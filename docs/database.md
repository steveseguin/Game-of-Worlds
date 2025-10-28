# Game of Words Database and Code Analysis

## Database Structure Overview

### Current Tables
1. **users**
   - `id` (VARCHAR, Primary Key)
   - `password` (VARCHAR)
   - `username` (VARCHAR)
   - `currentgame` (INT) - References the game ID the user is currently in
   - `tempkey` (VARCHAR) - Used for authentication
   - `created` (TIMESTAMP)

2. **games**
   - `id` (INT, Primary Key, Auto Increment)
   - `name` (VARCHAR)
   - `mapwidth` (INT, Default 14)
   - `mapheight` (INT, Default 8)
   - `turn` (INT, Default 0)
   - `status` (VARCHAR, Default "waiting")
   - `created` (TIMESTAMP)
   - `winner` (VARCHAR) - Added in code but missing in schema

3. **map{gameId}** (Dynamic per game)
   - `sectorid` (INT, Primary Key)
   - `sectortype` (INT)
   - `ownerid` (VARCHAR)
   - `colonized` (TINYINT)
   - `artifact` (INT)
   - `metalbonus`, `crystalbonus` (FLOAT)
   - `terraformlvl` (INT)
   - Various building levels (`metallvl`, `crystallvl`, etc.)
   - Various ship counts (`totalship1`-`totalship9`)
   - Ships under construction (`totship1build`-`totship9build`)
   - Ships in transit (`totship1coming`-`totship9coming`)

4. **players{gameId}** (Dynamic per game)
   - `playerid` (VARCHAR, Primary Key)
   - Resources: `metal`, `crystal`, `research` (INT)
   - Technology levels: `tech1`-`tech9` (INT)
   - `homeworld` (INT)

## Missing Database Elements

1. **Game History**
   - No table for tracking game history, winners, or statistics

2. **Battle History**
   - No persistent record of battles or game events

3. **User Profile/Stats**
   - No table for tracking user statistics, wins/losses, etc.

4. **Messaging/Diplomacy**
   - No database structure for player-to-player diplomacy or messaging

## Database Operations Analysis

### Key Functions That Handle Database Operations

1. **Authentication/User Management**
   - `authUser()` in `server.js` - Handles user authentication
   - Missing proper user registration in database schema

2. **Game Creation/Management**
   - `createNewGame()` in `setup.js` - Creates game record and tables
   - `startGame()` in `server.js` - Initializes game state and assigns homeworlds
   - `nextTurn()` - Advances game turns and updates database

3. **Resource Management**
   - `gameMechanics()` in `server.js` - Handles resource production
   - Missing comprehensive transaction logging

4. **Ship/Building Construction**
   - `buyBuilding()`, `buyShip()` in `server.js` - Handles construction requests
   - `updateBuildings()`, `updateFleet()` - Updates UI with database data

5. **Technology Research**
   - `buyTech()` in `server.js` - Handles technology research
   - Tech system is well-defined in `tech.js` but database integration is incomplete

6. **Combat & Movement**
   - `moveFleet()`, `preMoveFleet()` in `server.js` - Handles fleet movement
   - `endTravel()` - Processes fleet arrival and potential combat
   - Combat resolution functions lack proper database integration for battle history

## Missing Code Components

1. **Data Consistency**
   - Lack of transaction handling for complex operations involving multiple tables
   - Missing proper error handling for database operations

2. **Game Completion Logic**
   - `endGame()` exists but win conditions are not fully implemented
   - Missing proper game cleanup and resource release

3. **User Experience Flows**
   - Incomplete registration/authentication flow
   - Missing password hashing for security
   - No account recovery mechanism

4. **Game State Management**
   - Incomplete handling of disconnected players
   - No session management or reconnection logic

5. **Database Initialization**
   - Missing automated database setup scripts for first-time installation

## Recommended Improvements

### Database Enhancements

1. **Add Game History Table**
```sql
CREATE TABLE game_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT,
    winner_id VARCHAR(32),
    end_reason VARCHAR(32),
    duration INT,
    player_count INT,
    end_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id)
);
```

2. **Add User Stats Table**
```sql
CREATE TABLE user_stats (
    user_id VARCHAR(32) PRIMARY KEY,
    games_played INT DEFAULT 0,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    planets_colonized INT DEFAULT 0,
    ships_built INT DEFAULT 0,
    ships_destroyed INT DEFAULT 0,
    last_active TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

3. **Add Battle History Table**
```sql
CREATE TABLE battle_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT,
    sector_id INT,
    attacker_id VARCHAR(32),
    defender_id VARCHAR(32),
    outcome VARCHAR(32),
    attacker_ships_lost INT,
    defender_ships_lost INT,
    battle_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

4. **Add Diplomacy Table**
```sql
CREATE TABLE diplomacy (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT,
    from_player_id VARCHAR(32),
    to_player_id VARCHAR(32),
    type ENUM('PEACE', 'WAR', 'ALLIANCE', 'TRADE'),
    status ENUM('PENDING', 'ACCEPTED', 'REJECTED'),
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id)
);
```

### Code Improvements

1. **Authentication**
   - Add proper password hashing in `login.js` before storing passwords
   - Implement token-based authentication with proper expiration

2. **Database Transactions**
   - Wrap critical operations in transactions to ensure data integrity:

```javascript
// Example transaction for fleet movement
db.beginTransaction(err => {
    if (err) return handleError(err);
    
    // Update source sector
    db.query(sourceUpdateQuery, sourceParams, err => {
        if (err) return db.rollback(() => handleError(err));
        
        // Update target sector
        db.query(targetUpdateQuery, targetParams, err => {
            if (err) return db.rollback(() => handleError(err));
            
            // Update player resources
            db.query(playerUpdateQuery, playerParams, err => {
                if (err) return db.rollback(() => handleError(err));
                
                db.commit(err => {
                    if (err) return db.rollback(() => handleError(err));
                    // Success - notify clients
                });
            });
        });
    });
});
```

3. **Game Completion Logic**
   - Enhance `endGame()` to properly clean up resources and record game history:

```javascript
function endGame(gameId, winnerId, reason) {
    // Update game status
    db.query(`UPDATE games SET status = 'completed', winner = ? WHERE id = ?`, 
        [winnerId, gameId]);
    
    // Record game history
    db.query(`INSERT INTO game_history (game_id, winner_id, end_reason) VALUES (?, ?, ?)`,
        [gameId, winnerId, reason]);
    
    // Update player stats
    db.query(`SELECT playerid FROM players${gameId}`, (err, players) => {
        if (err) return console.error(err);
        
        players.forEach(player => {
            const isWinner = player.playerid === winnerId;
            db.query(`UPDATE user_stats SET 
                games_played = games_played + 1,
                wins = wins + ${isWinner ? 1 : 0},
                losses = losses + ${isWinner ? 0 : 1}
                WHERE user_id = ?`, [player.playerid]);
        });
    });
    
    // Stop the turn timer
    clearInterval(gameTimer[gameId]);
    
    // Notify all players
    notifyGameEnd(gameId, winnerId, reason);
    
    // Clean up game resources
    delete activeGames[gameId];
    delete turns[gameId];
}
```

4. **Reconnection & Session Management**
   - Implement proper reconnection handling:

```javascript
function handleReconnection(userId, connection) {
    // Find player's current game
    db.query('SELECT currentgame FROM users WHERE id = ?', [userId], (err, results) => {
        if (err || !results.length) return;
        
        const gameId = results[0].currentgame;
        if (!gameId) return;
        
        // Associate connection with player
        connection.name = userId;
        connection.gameid = gameId;
        clientMap[userId] = connection;
        
        // Restore player's last known state
        db.query(`SELECT sectorid FROM map${gameId} WHERE ownerid = ? LIMIT 1`, 
            [userId], (err, sectorResults) => {
                if (!err && sectorResults.length > 0) {
                    connection.sectorid = sectorResults[0].sectorid;
                }
                
                // Update client with current game state
                updateResources(connection);
                updateAllSectors(gameId, connection);
                connection.sendUTF("You have reconnected to your game.");
            });
    });
}
```

## Conclusion

The Game of Words game has a solid foundation with a working database schema and essential gameplay functions. However, several critical components need to be addressed to create a complete user experience:

1. **Data Integrity**: Implement transactions for complex operations
2. **Game History**: Add tables and logic to track game outcomes and player statistics
3. **User Management**: Enhance authentication with secure password handling
4. **Reconnection Handling**: Improve session management for dropped connections
5. **Game Completion**: Strengthen win condition detection and end-game processing

With these improvements, Game of Words will offer a more robust multiplayer experience with proper data persistence, tracking player achievements, and ensuring smooth gameplay from start to finish.
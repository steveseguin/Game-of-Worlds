// ============================================================================
// GAME INITIALIZATION & LIFECYCLE MANAGEMENT
// ============================================================================

let db = null;
let hasEnsuredGameModeColumn = false;

// Set database connection for this module
function setDatabase(database) {
    db = database;
    if (database && !database.isOffline) {
        ensureGamesModeColumn();
    }
}

function ensureGamesModeColumn() {
    if (hasEnsuredGameModeColumn || !db || db.isOffline || typeof db.query !== 'function') {
        return;
    }

    hasEnsuredGameModeColumn = true;

    if (db.isMock) {
        return;
    }

    db.query("SHOW COLUMNS FROM games LIKE 'mode'", (showErr, rows) => {
        if (showErr) {
            console.warn('Unable to verify games.mode column:', showErr.message || showErr);
            return;
        }

        if (Array.isArray(rows) && rows.length > 0) {
            return;
        }

        db.query("ALTER TABLE games ADD COLUMN mode VARCHAR(16) DEFAULT 'quick'", alterErr => {
            if (alterErr && alterErr.code !== 'ER_DUP_FIELDNAME') {
                console.warn('Unable to ensure games.mode column:', alterErr.message || alterErr);
            }
        });
    });
}

function createGameTables(gameId, callback) {
    const statements = [
        `CREATE TABLE IF NOT EXISTS map${gameId} (
            sectorid INT PRIMARY KEY,
            x INT NOT NULL,
            y INT NOT NULL,
            type INT DEFAULT 0,
            owner INT DEFAULT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS players${gameId} (
            userid INT PRIMARY KEY,
            race_id INT DEFAULT 1,
            is_ai TINYINT DEFAULT 0,
            ai_difficulty VARCHAR(16) DEFAULT 'medium',
            ai_strategy VARCHAR(16) DEFAULT 'balanced',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            alliance_id INT DEFAULT NULL,
            metal INT DEFAULT 100,
            crystal INT DEFAULT 100,
            research INT DEFAULT 50,
            tech VARCHAR(255) DEFAULT '',
            homeworld INT DEFAULT NULL,
            currentsector INT DEFAULT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS ships${gameId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner INT NOT NULL,
            type INT NOT NULL,
            sectorid INT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS buildings${gameId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sectorid INT NOT NULL,
            type INT NOT NULL,
            owner INT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS wonders${gameId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner INT NOT NULL,
            type VARCHAR(64) NOT NULL,
            turn_built INT DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS explored_sectors${gameId} (
            playerid INT NOT NULL,
            sectorid INT NOT NULL,
            discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (playerid, sectorid)
        )`
    ];

    let index = 0;
    const runNext = () => {
        if (index >= statements.length) {
            callback(null);
            return;
        }

        const sql = statements[index++];
        db.query(sql, err => {
            if (err) {
                callback(err);
                return;
            }
            runNext();
        });
    };

    runNext();
}

function ensurePlayerTableColumns(gameId, callback) {
    const requiredColumns = [
        { name: 'joined_at', sql: `ALTER TABLE players${gameId} ADD COLUMN joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` },
        { name: 'is_ai', sql: `ALTER TABLE players${gameId} ADD COLUMN is_ai TINYINT DEFAULT 0` },
        { name: 'ai_difficulty', sql: `ALTER TABLE players${gameId} ADD COLUMN ai_difficulty VARCHAR(16) DEFAULT 'medium'` },
        { name: 'ai_strategy', sql: `ALTER TABLE players${gameId} ADD COLUMN ai_strategy VARCHAR(16) DEFAULT 'balanced'` }
    ];

    let idx = 0;
    const ensureNext = () => {
        if (idx >= requiredColumns.length) {
            callback(null);
            return;
        }

        const column = requiredColumns[idx++];
        db.query(`SHOW COLUMNS FROM players${gameId} LIKE '${column.name}'`, (showErr, rows) => {
            if (showErr) {
                callback(showErr);
                return;
            }

            if (rows && rows.length > 0) {
                ensureNext();
                return;
            }

            db.query(column.sql, alterErr => {
                if (alterErr) {
                    callback(alterErr);
                    return;
                }
                ensureNext();
            });
        });
    };

    ensureNext();
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    setDatabase,
    ensureGamesModeColumn,
    createGameTables,
    ensurePlayerTableColumns
};

const { setImmediate: scheduleImmediate } = require('node:timers');

function toLower(value) {
    return typeof value === 'string' ? value.toLowerCase() : value;
}

class MockDatabase {
    constructor() {
        this.isOffline = false;
        this.isMock = true;
        this._users = new Map();
        this._usernames = new Map();
        this._userStats = new Map();
        this._games = new Map();
        this._playerTables = new Map();
        this._maps = new Map();
        this._ships = new Map();
        this._buildings = new Map();
        this._paymentTransactions = new Map();
        this._premiumPurchases = [];
        this._userCosmetics = [];
        this._exploredSectors = new Map();
        this._shipIds = new Map();
        this._buildingIds = new Map();
        this._nextPaymentTransactionId = 1;
        this._nextPremiumPurchaseId = 1;
        this._nextUserId = 1;
        this._nextGameId = 1;
    }

    get users() {
        return Array.from(this._users.values());
    }

    get games() {
        return Array.from(this._games.values());
    }

    query(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }

        const normalized = sql.replace(/\s+/g, ' ').trim();

        try {
            if (/^SELECT id FROM users WHERE username = \?/i.test(normalized)) {
                const username = toLower(params[0]);
                const user = this._usernames.get(username);
                return this._async(callback, null, user ? [{ id: user.id }] : []);
            }

            if (/^SELECT \* FROM users WHERE username = \?/i.test(normalized)) {
                const username = toLower(params[0]);
                const user = this._usernames.get(username);
                return this._async(
                    callback,
                    null,
                    user ? [{ ...user }] : []
                );
            }

            if (/^SELECT id, username, email, created FROM users WHERE id = \?( AND active = 1)?/i.test(normalized)) {
                const user = this._users.get(Number(params[0]));
                return this._async(
                    callback,
                    null,
                    user ? [{
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        created: user.created || null
                    }] : []
                );
            }

            if (/^SELECT \* FROM users WHERE guest_token_hash = \? AND is_guest = 1 LIMIT 1/i.test(normalized)) {
                const tokenHash = params[0];
                const user = Array.from(this._users.values()).find(
                    row => row.guest_token_hash === tokenHash && Number(row.is_guest) === 1
                );
                return this._async(callback, null, user ? [{ ...user }] : []);
            }

            if (/^SELECT \* FROM users WHERE id = \?(\s+LIMIT 1)?/i.test(normalized)) {
                const user = this._users.get(Number(params[0]));
                return this._async(
                    callback,
                    null,
                    user ? [{ ...user }] : []
                );
            }

            if (/^SELECT id, is_guest FROM users WHERE id = \? LIMIT 1/i.test(normalized)) {
                const user = this._users.get(Number(params[0]));
                return this._async(
                    callback,
                    null,
                    user ? [{ id: user.id, is_guest: user.is_guest || 0 }] : []
                );
            }

            if (/^INSERT INTO users/i.test(normalized)) {
                const columnsMatch = normalized.match(/^INSERT INTO users\s*\(([^)]+)\)/i);
                const values = {};
                if (columnsMatch) {
                    columnsMatch[1].split(',').map(col => col.trim().toLowerCase()).forEach((column, index) => {
                        values[column] = params[index];
                    });
                }
                const username = values.username ?? params[0];
                const password = values.password ?? params[1];
                const salt = values.salt ?? params[2];
                const email = Object.prototype.hasOwnProperty.call(values, 'email') ? values.email : params[3];
                const tempkey = values.tempkey ?? params[4];
                const key = toLower(username);
                const id = this._nextUserId++;
                const user = {
                    id,
                    username,
                    password,
                    salt,
                    email,
                    tempkey,
                    is_guest: Number(values.is_guest || 0),
                    guest_token_hash: values.guest_token_hash || null,
                    currentgame: null,
                    referred_by: null
                };
                this._users.set(id, user);
                this._usernames.set(key, user);
                return this._async(callback, null, { insertId: id });
            }

            if (/^UPDATE users SET tempkey = \? WHERE id = \?/i.test(normalized)) {
                const [tempKey, userId] = params;
                const user = this._users.get(Number(userId));
                if (user) {
                    user.tempkey = tempKey;
                }
                return this._async(callback, null, { affectedRows: user ? 1 : 0 });
            }

            if (/^UPDATE users SET username = \?, password = \?, salt = \?, email = \?, tempkey = \?, is_guest = 0, guest_token_hash = NULL WHERE id = \?/i.test(normalized)) {
                const [username, password, salt, email, tempKey, userId] = params;
                const user = this._users.get(Number(userId));
                if (user) {
                    this._usernames.delete(toLower(user.username));
                    user.username = username;
                    user.password = password;
                    user.salt = salt;
                    user.email = email;
                    user.tempkey = tempKey;
                    user.is_guest = 0;
                    user.guest_token_hash = null;
                    this._usernames.set(toLower(username), user);
                }
                return this._async(callback, null, { affectedRows: user ? 1 : 0 });
            }

            if (/^SELECT tempkey FROM users WHERE id = \?/i.test(normalized)) {
                const user = this._users.get(Number(params[0]));
                return this._async(
                    callback,
                    null,
                    user ? [{ tempkey: user.tempkey }] : []
                );
            }

            if (/^UPDATE users SET currentgame = \? WHERE id = \?/i.test(normalized)) {
                const [gameId, userId] = params;
                const user = this._users.get(Number(userId));
                if (user) {
                    user.currentgame = gameId;
                }
                return this._async(callback, null, { affectedRows: user ? 1 : 0 });
            }

            if (/^UPDATE users SET currentgame = NULL WHERE id = \? AND currentgame = \?/i.test(normalized)) {
                const [userId, gameId] = params;
                const user = this._users.get(Number(userId));
                if (user && user.currentgame === gameId) {
                    user.currentgame = null;
                    return this._async(callback, null, { affectedRows: 1 });
                }
                return this._async(callback, null, { affectedRows: 0 });
            }

            if (/^SELECT currentgame FROM users WHERE id = \? LIMIT 1/i.test(normalized)) {
                const user = this._users.get(Number(params[0]));
                return this._async(
                    callback,
                    null,
                    user ? [{ currentgame: user.currentgame }] : []
                );
            }

            if (/^SELECT currentgame AS gameId, COUNT\(\*\) AS count FROM users WHERE currentgame IS NOT NULL GROUP BY currentgame/i.test(normalized)) {
                const counts = {};
                this._users.forEach(user => {
                    if (user.currentgame !== null && user.currentgame !== undefined) {
                        counts[user.currentgame] = (counts[user.currentgame] || 0) + 1;
                    }
                });
                const rows = Object.entries(counts).map(([gameId, count]) => ({
                    gameId: Number(gameId),
                    count
                }));
                return this._async(callback, null, rows);
            }

            if (/^SELECT COUNT\(\*\) as count FROM users WHERE referred_by = \?/i.test(normalized)) {
                const target = params[0];
                const count = Array.from(this._users.values()).filter(
                    user => user.referred_by === target
                ).length;
                return this._async(callback, null, [{ count }]);
            }

            if (/^INSERT INTO games \(name, creator, maxplayers, status/i.test(normalized)) {
                const columnsMatch = normalized.match(/^INSERT INTO games\s*\(([^)]+)\)/i);
                const values = {};
                if (columnsMatch) {
                    columnsMatch[1].split(',').map(col => col.trim().toLowerCase()).forEach((column, index) => {
                        values[column] = params[index];
                    });
                }
                const name = values.name ?? params[0];
                const creator = values.creator ?? params[1];
                const maxPlayers = values.maxplayers ?? params[2];
                const status = values.status ?? params[3];
                const modeParam = values.mode ?? params[4];
                const mode = typeof modeParam === 'string' ? modeParam : 'quick';
                const id = this._nextGameId++;
                const game = {
                    id,
                    name,
                    creator,
                    maxplayers: maxPlayers,
                    status,
                    mode,
                    registered_only: Number(values.registered_only || 0),
                    min_level: Number(values.min_level || 0),
                    started: 0,
                    turn: 0,
                    mapwidth: 14,
                    mapheight: 8,
                    winner: null,
                    created: Date.now()
                };
                this._games.set(id, game);
                return this._async(callback, null, { insertId: id });
            }

            if (/^SELECT id, name, maxplayers, started, status(, mode)?(, registered_only, min_level)? FROM games WHERE started = 0 ORDER BY created DESC LIMIT \?/i.test(normalized)) {
                const limit = Number(params[0]) || this._games.size;
                const games = Array.from(this._games.values())
                    .filter(game => game.started === 0)
                    .sort((a, b) => b.created - a.created)
                    .slice(0, limit)
                    .map(game => ({
                        id: game.id,
                        name: game.name,
                        maxplayers: game.maxplayers,
                        started: game.started,
                        status: game.status,
                        mode: game.mode || 'quick',
                        registered_only: game.registered_only || 0,
                        min_level: game.min_level || 0
                    }));
                return this._async(callback, null, games);
            }

            if (/^SELECT id, name, maxplayers, started, creator(, mode)?(, registered_only, min_level)? FROM games WHERE id = \? AND started = 0/i.test(normalized)) {
                const game = this._games.get(Number(params[0]));
                if (game && game.started === 0) {
                    return this._async(callback, null, [{ ...game }]);
                }
                return this._async(callback, null, []);
            }

            if (/^SELECT creator, maxplayers, started(, mode)? FROM games WHERE id = \? LIMIT 1/i.test(normalized)
                || /^SELECT id, creator, started(, mode)? FROM games WHERE id = \? LIMIT 1/i.test(normalized)
                || /^SELECT id, creator, maxplayers, started, turn, mode, status, mapwidth, mapheight FROM games WHERE id = \? LIMIT 1/i.test(normalized)
                || /^SELECT \* FROM games WHERE id = \?/i.test(normalized)) {
                const game = this._games.get(Number(params[0]));
                return this._async(callback, null, game ? [{ ...game }] : []);
            }

            if (/^SELECT mode FROM games WHERE id = \?/i.test(normalized)) {
                const game = this._games.get(Number(params[0]));
                return this._async(callback, null, game ? [{ mode: game.mode || 'quick' }] : []);
            }

            if (/^UPDATE games SET creator = \? WHERE id = \?/i.test(normalized)) {
                const [creator, gameId] = params.map(Number);
                const game = this._games.get(gameId);
                if (game) {
                    game.creator = creator;
                }
                return this._async(callback, null, { affectedRows: game ? 1 : 0 });
            }

            if (/^UPDATE games SET started = 1 WHERE id = \?/i.test(normalized)) {
                const game = this._games.get(Number(params[0]));
                if (game) {
                    game.started = 1;
                }
                return this._async(callback, null, { affectedRows: game ? 1 : 0 });
            }

            if (/^UPDATE games SET started = 1, status = \?, turn = \?, mode = \?, mapwidth = \?, mapheight = \? WHERE id = \?/i.test(normalized)) {
                const [status, turn, mode, mapwidth, mapheight, gameId] = params;
                const game = this._games.get(Number(gameId));
                if (game) {
                    game.started = 1;
                    game.status = status;
                    game.turn = Number(turn) || 1;
                    game.mode = mode || 'quick';
                    game.mapwidth = Number(mapwidth) || 14;
                    game.mapheight = Number(mapheight) || 8;
                }
                return this._async(callback, null, { affectedRows: game ? 1 : 0 });
            }

            if (/^UPDATE games SET turn = \? WHERE id = \?/i.test(normalized)) {
                const [turn, gameId] = params;
                const game = this._games.get(Number(gameId));
                if (game) {
                    game.turn = Number(turn) || game.turn || 1;
                }
                return this._async(callback, null, { affectedRows: game ? 1 : 0 });
            }

            if (/^UPDATE games SET status = \? WHERE id = \?/i.test(normalized)) {
                const [status, gameId] = params;
                const game = this._games.get(Number(gameId));
                if (game) {
                    game.status = status;
                }
                return this._async(callback, null, { affectedRows: game ? 1 : 0 });
            }

            if (/^UPDATE games SET status = \?, winner = NULL WHERE id = \?/i.test(normalized)) {
                const [status, gameId] = params;
                const game = this._games.get(Number(gameId));
                if (game) {
                    game.status = status;
                    game.winner = null;
                }
                return this._async(callback, null, { affectedRows: game ? 1 : 0 });
            }

            if (/^UPDATE games SET status = "completed", winner = \? WHERE id = \?/i.test(normalized)) {
                const [winner, gameId] = params;
                const game = this._games.get(Number(gameId));
                if (game) {
                    game.status = 'completed';
                    game.winner = winner === null || winner === undefined || winner === ''
                        ? null
                        : Number(winner);
                }
                return this._async(callback, null, { affectedRows: game ? 1 : 0 });
            }

            if (/^SELECT id, creator, maxplayers, started, turn, mode, status, mapwidth, mapheight FROM games WHERE started = 1/i.test(normalized)) {
                const rows = Array.from(this._games.values())
                    .filter(game => game.started === 1 && game.status !== 'completed' && game.status !== 'abandoned')
                    .map(game => ({ ...game }));
                return this._async(callback, null, rows);
            }

            if (/^INSERT INTO game_history/i.test(normalized)) {
                return this._async(callback, null, { insertId: 1, affectedRows: 1 });
            }

            if (/FROM wonders\d+/i.test(normalized)) {
                return this._async(callback, null, []);
            }

            if (/^UPDATE user_stats SET/i.test(normalized)) {
                return this._async(callback, null, { affectedRows: 1 });
            }

            if (/^UPDATE users SET currentgame = NULL WHERE currentgame = \?/i.test(normalized)) {
                const gameId = Number(params[0]);
                let affected = 0;
                this._users.forEach(user => {
                    if (Number(user.currentgame) === gameId) {
                        user.currentgame = null;
                        affected++;
                    }
                });
                return this._async(callback, null, { affectedRows: affected });
            }

            if (/^DELETE FROM games WHERE id = \?/i.test(normalized)) {
                const gameId = Number(params[0]);
                const existed = this._games.delete(gameId);
                this._playerTables.delete(gameId);
                this._maps.delete(gameId);
                this._ships.delete(gameId);
                this._buildings.delete(gameId);
                this._exploredSectors.delete(gameId);
                return this._async(callback, null, { affectedRows: existed ? 1 : 0 });
            }

            if (/^SELECT \* FROM players\d+ WHERE userid = \? LIMIT 1/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const player = players ? players.get(Number(params[0])) : null;
                return this._async(callback, null, player ? [{ ...player }] : []);
            }

            if (/^SELECT COUNT\(\*\) AS count FROM players\d+/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const count = players ? players.size : 0;
                return this._async(callback, null, [{ count }]);
            }

            if (/^INSERT INTO `?players\d+`?/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const numericParams = params.map(p => (typeof p === 'number' ? p : Number(p)));
                const [userId, raceId, metal, crystal, research] = numericParams;
                const hasIsAiLiteral = /is_ai/i.test(normalized);
                let isAi = numericParams.length >= 6
                    ? Number(numericParams[5])
                    : (hasIsAiLiteral ? 1 : 0);
                if (Number.isNaN(isAi) && hasIsAiLiteral) {
                    isAi = 1;
                }
                const aiDifficulty = params[6] || 'medium';
                const aiStrategy = params[7] || 'balanced';
                const players = this._ensurePlayerTable(gameId);
                players.set(userId, {
                    userid: userId,
                    race_id: raceId,
                    metal,
                    crystal,
                    research,
                    tech: '',
                    is_ai: isAi,
                    ai_difficulty: aiDifficulty,
                    ai_strategy: aiStrategy,
                    joined_at: new Date(),
                    alliance_id: null,
                    homeworld: null,
                    currentsector: null
                });
                return this._async(callback, null, { affectedRows: 1 });
            }

            if (/^UPDATE `?players\d+`? SET/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                if (!players) {
                    return this._async(callback, null, { affectedRows: 0 });
                }

                // Params are ordered: SET clause params first, then WHERE clause params
                const paramsCopy = Array.isArray(params) ? [...params] : [];

                const setClause = normalized
                    .replace(/^UPDATE `?players\d+`? SET /i, '')
                    .split(' WHERE ')[0];
                const assignments = setClause.split(',').map(part => part.trim());

                // Count SET clause placeholders (count all ? in SET clause)
                let setParamCount = 0;
                assignments.forEach(assignment => {
                    const matches = assignment.match(/\?/g);
                    if (matches) setParamCount += matches.length;
                });

                // Extract SET params and WHERE params
                const setParams = paramsCopy.slice(0, setParamCount);
                const whereParams = paramsCopy.slice(setParamCount);

                // Parse WHERE clause to find userid and conditions
                const whereMatch = normalized.match(/WHERE (.+)$/i);
                const whereClause = whereMatch ? whereMatch[1] : '';
                const conditions = whereClause.split(/\s+AND\s+/i);

                let userId = null;
                const conditionalChecks = [];
                let whereParamIdx = 0;

                conditions.forEach(cond => {
                    if (/userid = \?/i.test(cond)) {
                        userId = Number(whereParams[whereParamIdx++]);
                        return;
                    }

                    const gteMatch = cond.match(/([a-z_]+) >= \?/i);
                    if (gteMatch) {
                        conditionalChecks.push({ field: gteMatch[1], op: '>=', value: Number(whereParams[whereParamIdx++]) });
                        return;
                    }

                    const gtMatch = cond.match(/([a-z_]+) > \?/i);
                    if (gtMatch) {
                        conditionalChecks.push({ field: gtMatch[1], op: '>', value: Number(whereParams[whereParamIdx++]) });
                        return;
                    }

                    const eqMatch = cond.match(/([a-z_]+) = \?/i);
                    if (eqMatch) {
                        conditionalChecks.push({ field: eqMatch[1], op: '=', value: whereParams[whereParamIdx++] });
                    }
                });

                // Fallback for simple WHERE userid = ?
                if (userId === null && whereParams.length > 0) {
                    userId = Number(whereParams[0]);
                }

                const player = players.get(userId);
                if (!player) {
                    return this._async(callback, null, { affectedRows: 0 });
                }

                // Check conditional WHERE clauses
                for (const check of conditionalChecks) {
                    const fieldValue = Number(player[check.field] || 0);
                    if (check.op === '>=' && fieldValue < check.value) {
                        return this._async(callback, null, { affectedRows: 0 });
                    }
                    if (check.op === '>' && fieldValue <= check.value) {
                        return this._async(callback, null, { affectedRows: 0 });
                    }
                    if (check.op === '=' && String(player[check.field] ?? '') !== String(check.value ?? '')) {
                        return this._async(callback, null, { affectedRows: 0 });
                    }
                }

                // Apply SET clause assignments
                let setParamIdx = 0;
                assignments.forEach(assignment => {
                    const directMatch = assignment.match(/^([a-z_]+) = \?/i);
                    if (directMatch) {
                        const field = directMatch[1];
                        player[field] = setParams[setParamIdx++];
                        return;
                    }

                    const literalMatch = assignment.match(/^([a-z_]+) = ([0-9]+)/i);
                    if (literalMatch) {
                        const field = literalMatch[1];
                        player[field] = Number(literalMatch[2]);
                        return;
                    }

                    const selfAddMatch = assignment.match(/^([a-z_]+) = ([a-z_]+) \+ \?/i);
                    if (selfAddMatch) {
                        const field = selfAddMatch[1];
                        const source = selfAddMatch[2];
                        const delta = Number(setParams[setParamIdx++]);
                        player[field] = Number(player[source] || 0) + delta;
                        return;
                    }

                    const selfSubMatch = assignment.match(/^([a-z_]+) = ([a-z_]+) - \?/i);
                    if (selfSubMatch) {
                        const field = selfSubMatch[1];
                        const source = selfSubMatch[2];
                        const delta = Number(setParams[setParamIdx++]);
                        player[field] = Number(player[source] || 0) - delta;
                        return;
                    }

                    const nullMatch = assignment.match(/^([a-z_]+) = NULL/i);
                    if (nullMatch) {
                        const field = nullMatch[1];
                        player[field] = null;
                        return;
                    }
                });

                return this._async(callback, null, { affectedRows: 1 });
            }

            if (/^DELETE FROM `?players\d+`? WHERE userid = \?/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const userId = Number(params[0]);
                const removed = players ? players.delete(userId) : false;
                return this._async(callback, null, { affectedRows: removed ? 1 : 0 });
            }

            if (/^SELECT userid, race_id, joined_at FROM `?players\d+`? ORDER BY/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const rows = players
                    ? Array.from(players.values())
                        .map(player => ({
                            userid: player.userid,
                            race_id: player.race_id,
                            joined_at: player.joined_at
                        }))
                        .sort((a, b) => {
                            const timeDiff = new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
                            if (timeDiff !== 0) {
                                return timeDiff;
                            }
                            return a.userid - b.userid;
                        })
                    : [];
                return this._async(callback, null, rows);
            }

            if (/^SELECT p\.userid, p\.is_ai, p\.race_id, p\.ai_difficulty, p\.ai_strategy, u\.username/i.test(normalized)
                && /FROM `?players\d+`? p LEFT JOIN users u ON u\.id = p\.userid/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const rows = players
                    ? Array.from(players.values()).map(player => {
                        const user = this._users.get(Number(player.userid));
                        const stats = this._userStats.get(Number(player.userid)) || {};
                        return {
                            userid: player.userid,
                            is_ai: player.is_ai || 0,
                            race_id: player.race_id || 0,
                            ai_difficulty: player.ai_difficulty || 'medium',
                            ai_strategy: player.ai_strategy || 'balanced',
                            username: user ? user.username : null,
                            is_guest: user ? user.is_guest || 0 : 0,
                            games_played: stats.games_played || 0,
                            wins: stats.wins || 0,
                            total_battles_won: stats.total_battles_won || 0,
                            total_sectors_explored: stats.total_sectors_explored || 0
                        };
                    })
                    : [];
                return this._async(callback, null, rows);
            }

            if (/^SELECT userid, is_ai FROM `?players\d+`?/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const rows = players
                    ? Array.from(players.values())
                        .sort((a, b) => {
                            const timeDiff = new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
                            if (timeDiff !== 0) {
                                return timeDiff;
                            }
                            return a.userid - b.userid;
                        })
                        .map(player => ({ userid: player.userid, is_ai: player.is_ai || 0 }))
                    : [];
                return this._async(callback, null, rows);
            }

            if (/^SELECT userid FROM `?players\d+`?/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const rows = players
                    ? Array.from(players.values())
                        .sort((a, b) => {
                            const timeDiff = new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
                            if (timeDiff !== 0) {
                                return timeDiff;
                            }
                            return a.userid - b.userid;
                        })
                        .map(player => ({ userid: player.userid }))
                    : [];
                return this._async(callback, null, rows);
            }

            if (/^SELECT p\.userid as playerId,/i.test(normalized) && /FROM `?players\d+`? p/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const map = this._ensureMap(gameId);
                const ships = this._ensureShips(gameId);
                const buildings = this._ensureBuildings(gameId);
                const rows = players
                    ? Array.from(players.values()).map(player => {
                        const playerId = Number(player.userid);
                        return {
                            playerId,
                            resources: (Number(player.metal) || 0) + (Number(player.crystal) || 0) + (Number(player.research) || 0),
                            tech: player.tech || '',
                            planets: Array.from(map.values()).filter(sector => Number(sector.owner) === playerId).length,
                            ships: ships.filter(ship => Number(ship.owner) === playerId).length,
                            buildings: buildings.filter(building => Number(building.owner) === playerId).length
                        };
                    })
                    : [];
                return this._async(callback, null, rows);
            }

            if (/^SELECT COUNT\(\*\) AS count FROM `?players\d+`?/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const count = players ? players.size : 0;
                return this._async(callback, null, [{ count }]);
            }

            if (/^SELECT COUNT\(\*\) AS c FROM `?players\d+`?/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const count = players ? players.size : 0;
                return this._async(callback, null, [{ c: count }]);
            }

            if (/^SELECT metal \+ crystal \+ research as total FROM `?players\d+`? WHERE userid = \?/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const player = players ? players.get(Number(params[0])) : null;
                const total = player
                    ? (Number(player.metal) || 0) + (Number(player.crystal) || 0) + (Number(player.research) || 0)
                    : 0;
                return this._async(callback, null, player ? [{ total }] : []);
            }

            if (/^SELECT \* FROM `?players\d+`?/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const rows = players ? Array.from(players.values()).map(player => ({ ...player })) : [];
                return this._async(callback, null, rows);
            }

            if (/^SELECT .* FROM `?players\d+`?/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                let rows = players ? Array.from(players.values()).map(player => ({ ...player })) : [];
                if (/WHERE userid = \?/i.test(normalized) && Array.isArray(params) && params.length > 0) {
                    const targetId = Number(params[0]);
                    rows = rows.filter(r => r.userid === targetId);
                }
                return this._async(callback, null, rows);
            }

            // Building table operations (for per-game tables)
            const buildingMatch = normalized.match(/`?buildings(\d+)`?/i);
            if (buildingMatch) {
                const gameId = Number(buildingMatch[1]);
                const buildings = this._ensureBuildings(gameId);
                const map = this._ensureMap(gameId);

                if (/^INSERT INTO `?buildings\d+`?/i.test(normalized)) {
                    const [sectorid, type, owner] = (params || []).map(Number);
                    const id = this._nextBuildingId(gameId);
                    buildings.push({ id, sectorid, type, owner });
                    return this._async(callback, null, { insertId: id, affectedRows: 1 });
                }

                if (/^SELECT COUNT\(\*\) as count FROM `?buildings\d+`? WHERE sectorid = \?/i.test(normalized)) {
                    const sectorid = Number(params[0]);
                    const count = buildings.filter(b => b.sectorid === sectorid).length;
                    return this._async(callback, null, [{ count }]);
                }

                if (/^SELECT sectorid, type, COUNT\(\*\) as count FROM `?buildings\d+`? WHERE owner = \? GROUP BY sectorid, type/i.test(normalized)) {
                    const owner = Number(params[0]);
                    const counts = {};
                    buildings.forEach(b => {
                        if (b.owner === owner) {
                            const key = `${b.sectorid}:${b.type}`;
                            counts[key] = (counts[key] || 0) + 1;
                        }
                    });
                    const rows = Object.entries(counts).map(([key, count]) => {
                        const [sectorid, type] = key.split(':').map(Number);
                        return { sectorid, type, count };
                    });
                    return this._async(callback, null, rows);
                }

                if (/^SELECT \* FROM `?buildings\d+`? WHERE owner = \?/i.test(normalized)) {
                    const owner = Number(params[0]);
                    return this._async(callback, null, buildings.filter(b => b.owner === owner).map(b => ({ ...b })));
                }

                if (/^SELECT type, COUNT\(\*\) as count FROM `?buildings\d+`? WHERE sectorid = \? AND owner = \? GROUP BY type/i.test(normalized)) {
                    const [sectorid, owner] = (params || []).map(Number);
                    const counts = {};
                    buildings.forEach(b => {
                        if (b.sectorid === sectorid && b.owner === owner) {
                            counts[b.type] = (counts[b.type] || 0) + 1;
                        }
                    });
                    const rows = Object.entries(counts).map(([type, count]) => ({ type: Number(type), count }));
                    return this._async(callback, null, rows);
                }

                if (/^SELECT COUNT\(\*\) as count FROM `?buildings\d+`? WHERE owner = \? AND sectorid = \? AND type = (\?|[0-9]+)/i.test(normalized)) {
                    const [owner, sectorid, typeRaw] = (params || []).map(Number);
                    const explicitType = Number.isFinite(typeRaw) ? typeRaw : Number((normalized.match(/type = (\d+)/i) || [])[1]);
                    const count = buildings.filter(b => b.owner === owner && b.sectorid === sectorid && b.type === explicitType).length;
                    return this._async(callback, null, [{ count }]);
                }

                if (/^SELECT id FROM `?buildings\d+`? b JOIN/i.test(normalized)) {
                    const [owner, sectorid] = (params || []).map(Number);
                    const match = buildings.find(b => b.owner === owner && b.sectorid === sectorid && b.type === 3);
                    return this._async(callback, null, match ? [{ id: match.id }] : []);
                }

                if (/^SELECT b\.type, COUNT\(\*\) as count FROM `?buildings\d+`?/i.test(normalized)) {
                    const owner = Number(params[0]);
                    const ownedSectors = new Set(Array.from(map.values()).filter(s => s.owner === owner).map(s => s.sectorid));
                    const counts = {};
                    buildings.forEach(b => {
                        if (ownedSectors.has(b.sectorid)) {
                            counts[b.type] = (counts[b.type] || 0) + 1;
                        }
                    });
                    const rows = Object.entries(counts).map(([type, count]) => ({ type: Number(type), count }));
                    return this._async(callback, null, rows);
                }

                if (/^SELECT type FROM `?buildings\d+`? WHERE sectorid = \?/i.test(normalized)) {
                    const sectorid = Number(params[0]);
                    const rows = buildings.filter(b => b.sectorid === sectorid).map(b => ({ type: b.type }));
                    return this._async(callback, null, rows);
                }

                if (/^SELECT id FROM `?buildings\d+`? WHERE sectorid = \? AND type = (\?|\d+) AND owner = \?/i.test(normalized)) {
                    const literalType = normalized.match(/type = (\d+)/i);
                    const values = (params || []).map(Number);
                    const sectorid = values[0];
                    const type = literalType ? Number(literalType[1]) : values[1];
                    const owner = literalType ? values[1] : values[2];
                    const rows = buildings
                        .filter(b => b.sectorid === sectorid && b.type === type && b.owner === owner)
                        .map(b => ({ id: b.id }));
                    return this._async(callback, null, rows);
                }

                if (/^DELETE FROM `?buildings\d+`? WHERE id IN \(/i.test(normalized)) {
                    const listMatch = normalized.match(/id IN \(([^)]+)\)/i);
                    const ids = listMatch
                        ? listMatch[1].split(',').map(v => Number(v.trim())).filter(Number.isFinite)
                        : [];
                    let removed = 0;
                    for (let i = buildings.length - 1; i >= 0; i--) {
                        if (ids.includes(buildings[i].id)) {
                            buildings.splice(i, 1);
                            removed++;
                        }
                    }
                    return this._async(callback, null, { affectedRows: removed });
                }

                if (/^DELETE FROM `?buildings\d+`? WHERE sectorid = \?/i.test(normalized)) {
                    const sectorid = Number(params[0]);
                    const before = buildings.length;
                    for (let i = buildings.length - 1; i >= 0; i--) {
                        if (buildings[i].sectorid === sectorid) {
                            buildings.splice(i, 1);
                        }
                    }
                    return this._async(callback, null, { affectedRows: before - buildings.length });
                }

                if (/^DELETE FROM `?buildings\d+`? WHERE owner = \?/i.test(normalized)) {
                    const owner = Number(params[0]);
                    const before = buildings.length;
                    for (let i = buildings.length - 1; i >= 0; i--) {
                        if (buildings[i].owner === owner) {
                            buildings.splice(i, 1);
                        }
                    }
                    return this._async(callback, null, { affectedRows: before - buildings.length });
                }

                if (/^SELECT \* FROM `?buildings\d+`?/i.test(normalized)) {
                    let filtered = [...buildings];
                    if (/WHERE owner = \?/i.test(normalized)) {
                        const owner = Number(params[0]);
                        filtered = filtered.filter(b => b.owner === owner);
                    } else if (/WHERE sectorid = \?/i.test(normalized)) {
                        const sectorid = Number(params[0]);
                        filtered = filtered.filter(b => b.sectorid === sectorid);
                    }
                    return this._async(callback, null, filtered.map(b => ({ ...b })));
                }
            }

            // Map operations
            const mapMatch = normalized.match(/`?map(\d+)`?/i);
            if (mapMatch) {
                const gameId = Number(mapMatch[1]);
                const map = this._ensureMap(gameId);

                if (/^INSERT INTO `?map\d+`?/i.test(normalized)) {
                    const columnsMatch = normalized.match(/^INSERT INTO `?map\d+`?\s*\(([^)]+)\)/i);
                    if (columnsMatch && Array.isArray(params) && params.length >= 4) {
                        const columns = columnsMatch[1].split(',').map(col => col.trim().toLowerCase());
                        const values = {};
                        columns.forEach((col, index) => { values[col] = params[index]; });
                        const sectorid = Number(values.sectorid);
                        const row = this._buildMapRow(
                            sectorid,
                            Number(values.x),
                            Number(values.y),
                            Number(values.type) || 0,
                            Number.isFinite(Number(values.sectortype)) ? Number(values.sectortype) : (Number(values.type) || 0)
                        );
                        ['metalbonus', 'crystalbonus', 'terraformlvl', 'artifact'].forEach(col => {
                            if (values[col] !== undefined) row[col] = Number(values[col]);
                        });
                        map.set(sectorid, row);
                    } else if (Array.isArray(params) && params.length >= 4) {
                        const numericParams = params.map(Number);
                        const sectorid = Number(numericParams[0]);
                        const x = Number(numericParams[1]);
                        const y = Number(numericParams[2]);
                        const type = Number(numericParams[3]) || 0;
                        const sectortype = Number.isFinite(numericParams[4]) ? Number(numericParams[4]) : type;
                        map.set(sectorid, this._buildMapRow(sectorid, x, y, type, sectortype));
                    } else {
                        const [, valuesPart] = normalized.split(/VALUES/i);
                        if (valuesPart) {
                            const tuples = valuesPart.split('),').map(t => t.replace(/[();]/g, '').trim()).filter(Boolean);
                            tuples.forEach(tuple => {
                                const parts = tuple.split(',').map(x => x.trim());
                                const sectorid = Number(parts[0]);
                                const x = Number(parts[1]);
                                const y = Number(parts[2]);
                                const type = Number(parts[3]) || 0;
                                const sectortype = Number(parts[4]) || type;
                                map.set(sectorid, this._buildMapRow(sectorid, x, y, type, sectortype));
                            });
                        }
                    }
                    return this._async(callback, null, { affectedRows: 1 });
                }

                if (/^UPDATE `?map\d+`? SET/i.test(normalized)) {
                    const paramsCopy = Array.isArray(params) ? [...params] : [];
                    const assignments = normalized
                        .replace(/^UPDATE `?map\d+`? SET /i, '')
                        .split(' WHERE ')[0]
                        .split(',')
                        .map(part => part.trim());
                    const setParamCount = assignments.reduce(
                        (count, assignment) => count + ((assignment.match(/\?/g) || []).length),
                        0
                    );
                    const setParams = paramsCopy.slice(0, setParamCount);
                    const whereParams = paramsCopy.slice(setParamCount);
                    const whereClause = (normalized.match(/ WHERE (.+)$/i) || [])[1] || '';
                    const conditions = whereClause.split(/\s+AND\s+/i);
                    let whereParamIndex = 0;
                    let sectorId = null;
                    let ownerFilter = null;
                    conditions.forEach(condition => {
                        if (/sectorid = \?/i.test(condition)) {
                            sectorId = Number(whereParams[whereParamIndex++]);
                            return;
                        }
                        if (/owner = \?/i.test(condition)) {
                            ownerFilter = Number(whereParams[whereParamIndex++]);
                        }
                    });
                    let targets = sectorId !== null && sectorId !== undefined ? [sectorId] : Array.from(map.keys());
                    if (ownerFilter !== null && ownerFilter !== undefined) {
                        targets = targets.filter(id => Number((map.get(id) || {}).owner) === ownerFilter);
                    }
                    if (/owner IS NULL/i.test(normalized)) {
                        targets = targets.filter(id => {
                            const owner = (map.get(id) || {}).owner;
                            return owner === null || owner === undefined;
                        });
                    }
                    targets.forEach(id => {
                        const entry = map.get(id) || this._buildMapRow(id);
                        let setParamIndex = 0;
                        assignments.forEach(assignment => {
                            const qMatch = assignment.match(/^([a-z_]+) = \?/i);
                            if (qMatch) {
                                entry[qMatch[1]] = setParams[setParamIndex++];
                                return;
                            }
                            const literalMatch = assignment.match(/^([a-z_]+) = ([0-9]+)/i);
                            if (literalMatch) {
                                entry[literalMatch[1]] = Number(literalMatch[2]);
                                return;
                            }
                            const nullMatch = assignment.match(/^([a-z_]+) = NULL/i);
                            if (nullMatch) {
                                entry[nullMatch[1]] = null;
                            }
                        });
                        map.set(id, entry);
                    });
                    return this._async(callback, null, { affectedRows: targets.length });
                }

                if (/^SELECT COUNT\(\*\) as total, SUM\(CASE WHEN owner = \? THEN 1 ELSE 0 END\) as owned FROM `?map\d+`? WHERE type BETWEEN \d+ AND \d+/i.test(normalized)) {
                    const owner = Number(params[0]);
                    const range = normalized.match(/type BETWEEN (\d+) AND (\d+)/i);
                    const lo = Number(range[1]);
                    const hi = Number(range[2]);
                    const rows = Array.from(map.values()).filter(r => Number(r.type) >= lo && Number(r.type) <= hi);
                    const owned = rows.filter(r => Number(r.owner) === owner).length;
                    return this._async(callback, null, [{ total: rows.length, owned }]);
                }

                if (/^SELECT DISTINCT owner FROM `?map\d+`? WHERE owner IS NOT NULL AND owner != \?/i.test(normalized)) {
                    const exclude = Number(params[0]);
                    const betweenMatch = normalized.match(/type BETWEEN (\d+) AND (\d+)/i);
                    const owners = [...new Set(
                        Array.from(map.values())
                            .filter(r => {
                                if (!betweenMatch) return true;
                                const type = Number(r.type);
                                return type >= Number(betweenMatch[1]) && type <= Number(betweenMatch[2]);
                            })
                            .map(r => r.owner)
                            .filter(o => o !== null && o !== undefined && Number(o) !== exclude)
                            .map(Number)
                    )];
                    return this._async(callback, null, owners.map(owner => ({ owner })));
                }

                if (/^SELECT .* FROM `?map\d+`? WHERE sectorid IN \(/i.test(normalized)) {
                    let ids = (params || []).map(Number).filter(Number.isFinite);
                    if (ids.length === 0) {
                        const listMatch = normalized.match(/sectorid IN \(([^)]+)\)/i);
                        if (listMatch) {
                            ids = listMatch[1].split(',').map(v => Number(v.trim())).filter(Number.isFinite);
                        }
                    }
                    let rows = ids.map(id => map.get(id)).filter(Boolean).map(r => ({ ...r }));
                    if (/AND owner IS NOT NULL/i.test(normalized)) {
                        rows = rows.filter(r => r.owner !== null && r.owner !== undefined);
                    }
                    return this._async(callback, null, rows);
                }

                if (/^SELECT .* FROM `?map\d+`? WHERE owner = \?/i.test(normalized)) {
                    const owner = Number(params[0]);
                    const rows = Array.from(map.values())
                        .filter(r => Number(r.owner) === owner)
                        .map(r => ({ ...r }));
                    return this._async(callback, null, rows);
                }

                if (/^SELECT DISTINCT m2\.sectorid, m2\.owner FROM/i.test(normalized)) {
                    const owner = Number(params[0]);
                    const exclude = Number(params[1]);
                    const rows = [];
                    const owned = Array.from(map.values()).filter(s => s.owner === owner);
                    const all = Array.from(map.values());
                    owned.forEach(src => {
                        all.forEach(target => {
                            if (target.owner && target.owner !== exclude && Math.abs(src.x - target.x) <= 2 && Math.abs(src.y - target.y) <= 2) {
                                if (!rows.find(r => r.sectorid === target.sectorid)) {
                                    rows.push({ sectorid: target.sectorid, owner: target.owner });
                                }
                            }
                        });
                    });
                    return this._async(callback, null, rows);
                }

                if (/^SELECT sectorid FROM `?map\d+`? WHERE owner IS NULL AND type BETWEEN 1 AND 10/i.test(normalized)) {
                    const rows = Array.from(map.values()).filter(r => r.owner === null || r.owner === undefined);
                    return this._async(callback, null, rows.slice(0, 25).map(r => ({ sectorid: r.sectorid })));
                }

                if (/^SELECT sectorid, owner FROM `?map\d+`? WHERE owner IS NOT NULL/i.test(normalized)) {
                    const ownerParam = Number(params[0]);
                    const rows = Array.from(map.values()).filter(r => r.owner !== null && r.owner !== undefined && (Number.isNaN(ownerParam) || r.owner !== ownerParam));
                    return this._async(callback, null, rows.slice(0, 50).map(r => ({ sectorid: r.sectorid, owner: r.owner })));
                }

                if (/^SELECT sectorid, type(?:, terraformlvl)? FROM `?map\d+`? WHERE owner IS NULL/i.test(normalized)) {
                    let rows = Array.from(map.values()).filter(r => r.owner === null || r.owner === undefined);
                    const betweenMatch = normalized.match(/type BETWEEN (\d+) AND (\d+)/i);
                    if (betweenMatch) {
                        const lo = Number(betweenMatch[1]);
                        const hi = Number(betweenMatch[2]);
                        rows = rows.filter(r => Number(r.type) >= lo && Number(r.type) <= hi);
                    }
                    return this._async(callback, null, rows.map(r => ({ sectorid: r.sectorid, type: r.type, terraformlvl: r.terraformlvl || 0 })));
                }

                if (/^SELECT sectorid, type, x, y, owner(?:, terraformlvl)? FROM `?map\d+`?/i.test(normalized)) {
                    const rows = Array.from(map.values()).map(r => ({
                        sectorid: r.sectorid,
                        type: r.type,
                        x: r.x,
                        y: r.y,
                        owner: r.owner,
                        terraformlvl: r.terraformlvl || 0
                    }));
                    return this._async(callback, null, rows);
                }

                if (/^SELECT sectorid, owner FROM `?map\d+`?/i.test(normalized)) {
                    const rows = Array.from(map.values()).map(r => ({ sectorid: r.sectorid, owner: r.owner }));
                    return this._async(callback, null, rows);
                }

                if (/^SELECT sectorid FROM `?map\d+`?/i.test(normalized)) {
                    const rows = Array.from(map.values()).map(r => ({ sectorid: r.sectorid }));
                    return this._async(callback, null, rows);
                }

                if (/^SELECT .* FROM `?map\d+`? WHERE sectorid = \?/i.test(normalized)) {
                    const sectorid = Number(params[0]);
                    const entry = map.get(sectorid);
                    return this._async(callback, null, entry ? [{ ...entry }] : []);
                }

                if (/^SELECT owner FROM `?map\d+`? WHERE sectorid IN \(\?\)/i.test(normalized)) {
                    const sectorList = Array.isArray(params[0]) ? params[0] : String(params[0] || '').split(',').map(Number);
                    const excludeOwner = Number(params[1]);
                    const found = sectorList
                        .map(id => map.get(Number(id)))
                        .filter(r => r && r.owner !== null && r.owner !== undefined && r.owner !== excludeOwner);
                    return this._async(callback, null, found.length > 0 ? [{ owner: found[0].owner }] : []);
                }

                if (/^SELECT \* FROM `?map\d+`?/i.test(normalized)) {
                    return this._async(callback, null, Array.from(map.values()).map(r => ({ ...r })));
                }
            }

            // Ship operations
            const shipMatch = normalized.match(/`?ships(\d+)`?/i);
            if (shipMatch) {
                const gameId = Number(shipMatch[1]);
                const ships = this._ensureShips(gameId);

                if (/^INSERT INTO `?ships\d+`?/i.test(normalized)) {
                    const [owner, type, sectorid] = (params || []).map(Number);
                    const id = this._nextShipId(gameId);
                    ships.push({ owner, type, sectorid, id });
                    return this._async(callback, null, { insertId: id });
                }

                if (/^SELECT id FROM `?ships\d+`? WHERE owner = \? AND sectorid = \? AND type = \? LIMIT 1/i.test(normalized)) {
                    const [owner, sectorid, type] = (params || []).map(Number);
                    const found = ships.find(s => s.owner === owner && s.sectorid === sectorid && s.type === type);
                    return this._async(callback, null, found ? [{ id: found.id }] : []);
                }

                if (/^SELECT COUNT\(\*\) as count FROM `?ships\d+`? WHERE owner = \? AND type = \?/i.test(normalized)) {
                    const [owner, type] = (params || []).map(Number);
                    const count = ships.filter(s => s.owner === owner && s.type === type).length;
                    return this._async(callback, null, [{ count }]);
                }

                if (/^SELECT sectorid, id FROM `?ships\d+`? WHERE owner = \? AND type = 5 LIMIT 1/i.test(normalized)) {
                    const owner = Number(params[0]);
                    const found = ships.find(s => s.owner === owner && s.type === 5);
                    return this._async(callback, null, found ? [{ sectorid: found.sectorid, id: found.id }] : []);
                }

                if (/^SELECT DISTINCT owner FROM `?ships\d+`? WHERE sectorid IN \(/i.test(normalized)) {
                    const listMatch = normalized.match(/sectorid IN \(([^)]+)\)/i);
                    const ids = listMatch
                        ? listMatch[1].split(',').map(v => Number(v.trim())).filter(Number.isFinite)
                        : (params || []).map(Number).filter(Number.isFinite);
                    const owners = [...new Set(ships.filter(s => ids.includes(Number(s.sectorid))).map(s => Number(s.owner)))];
                    return this._async(callback, null, owners.map(owner => ({ owner })));
                }

                if (/^SELECT sectorid, owner, type, COUNT\(\*\) as count FROM `?ships\d+`? GROUP BY sectorid, owner, type/i.test(normalized)) {
                    const counts = {};
                    ships.forEach(s => {
                        const key = `${s.sectorid}:${s.owner}:${s.type}`;
                        counts[key] = (counts[key] || 0) + 1;
                    });
                    const rows = Object.entries(counts).map(([key, count]) => {
                        const [sectorid, owner, type] = key.split(':').map(Number);
                        return { sectorid, owner, type, count };
                    });
                    return this._async(callback, null, rows);
                }

                if (/^SELECT sectorid, type, COUNT\(\*\) as count FROM `?ships\d+`? WHERE owner = \? GROUP BY sectorid, type/i.test(normalized)) {
                    const owner = Number(params[0]);
                    const counts = {};
                    ships.filter(s => s.owner === owner).forEach(s => {
                        const key = `${s.sectorid}:${s.type}`;
                        counts[key] = (counts[key] || 0) + 1;
                    });
                    const rows = Object.entries(counts).map(([key, count]) => {
                        const [sectorid, type] = key.split(':').map(Number);
                        return { sectorid, type, count };
                    });
                    return this._async(callback, null, rows);
                }

                if (/^SELECT sectorid, COUNT\(\*\) as count FROM `?ships\d+`? WHERE owner = \? GROUP BY sectorid/i.test(normalized)) {
                    const owner = Number(params[0]);
                    const counts = {};
                    ships.filter(s => s.owner === owner).forEach(s => {
                        counts[s.sectorid] = (counts[s.sectorid] || 0) + 1;
                    });
                    const rows = Object.entries(counts).map(([sectorid, count]) => ({ sectorid: Number(sectorid), count }));
                    return this._async(callback, null, rows);
                }

                if (/^SELECT owner, type, COUNT\(\*\) as count FROM `?ships\d+`? WHERE sectorid = \? GROUP BY owner, type/i.test(normalized)) {
                    const sectorid = Number(params[0]);
                    const counts = {};
                    ships.filter(s => s.sectorid === sectorid).forEach(s => {
                        const key = `${s.owner}:${s.type}`;
                        counts[key] = (counts[key] || 0) + 1;
                    });
                    const rows = Object.entries(counts).map(([key, count]) => {
                        const [owner, type] = key.split(':').map(Number);
                        return { owner, type, count };
                    });
                    return this._async(callback, null, rows);
                }

                if (/^SELECT type, COUNT\(\*\) as count FROM `?ships\d+`? WHERE sectorid = \? AND owner = \? GROUP BY type/i.test(normalized)) {
                    const [sectorid, owner] = (params || []).map(Number);
                    const counts = {};
                    ships.filter(s => s.sectorid === sectorid && s.owner === owner).forEach(s => {
                        counts[s.type] = (counts[s.type] || 0) + 1;
                    });
                    const rows = Object.entries(counts).map(([type, count]) => ({ type: Number(type), count }));
                    return this._async(callback, null, rows);
                }

                if (/GROUP_CONCAT\(DISTINCT owner\)/i.test(normalized)) {
                    const grouped = {};
                    ships.forEach(s => {
                        grouped[s.sectorid] = grouped[s.sectorid] || new Set();
                        grouped[s.sectorid].add(s.owner);
                    });
                    const rows = Object.entries(grouped)
                        .map(([sectorid, owners]) => ({ sectorid: Number(sectorid), owners: Array.from(owners).join(',') }))
                        .filter(row => row.owners.split(',').filter(Boolean).length > 1);
                    return this._async(callback, null, rows);
                }

                if (/^SELECT s\.sectorid, s\.owner, s\.type, COUNT\(\*\) as count FROM `?ships\d+`? s WHERE s\.owner != \?/i.test(normalized)) {
                    const excludeOwner = Number(params[0]);
                    const counts = {};
                    ships.filter(s => s.owner !== excludeOwner).forEach(s => {
                        const key = `${s.sectorid}:${s.owner}:${s.type}`;
                        counts[key] = (counts[key] || 0) + 1;
                    });
                    const rows = Object.entries(counts).map(([key, count]) => {
                        const [sectorid, owner, type] = key.split(':').map(Number);
                        return { sectorid, owner, type, count };
                    });
                    return this._async(callback, null, rows);
                }

                if (/^UPDATE `?ships\d+`? SET sectorid = \?/i.test(normalized)) {
                    const sectorid = Number(params[0]);
                    const idListMatch = normalized.match(/id IN \(([^)]+)\)/i);
                    let affectedRows = 0;
                    if (idListMatch) {
                        const idTokens = idListMatch[1].split(',').map(value => value.trim());
                        const ids = idTokens.every(value => value === '?')
                            ? params.slice(1, 1 + idTokens.length).map(Number).filter(Number.isFinite)
                            : idTokens.map(Number).filter(Number.isFinite);
                        const ownerParamIndex = 1 + (idTokens.every(value => value === '?') ? idTokens.length : 0);
                        const owner = /owner = \?/i.test(normalized) ? Number(params[ownerParamIndex]) : null;
                        const source = /sectorid = \?/i.test(normalized.substring(normalized.indexOf('WHERE')))
                            ? Number(params[ownerParamIndex + (owner !== null ? 1 : 0)])
                            : null;
                        ships.forEach(ship => {
                            if (
                                ids.includes(ship.id) &&
                                (owner === null || ship.owner === owner) &&
                                (source === null || ship.sectorid === source)
                            ) {
                                ship.sectorid = sectorid;
                                affectedRows++;
                            }
                        });
                    } else if (/WHERE id = \?/i.test(normalized)) {
                        const id = Number(params[1]);
                        const ship = ships.find(s => s.id === id);
                        const owner = /owner = \?/i.test(normalized) ? Number(params[2]) : null;
                        const source = /sectorid = \?/i.test(normalized.substring(normalized.indexOf('WHERE')))
                            ? Number(params[owner !== null ? 3 : 2])
                            : null;
                        if (
                            ship &&
                            (owner === null || ship.owner === owner) &&
                            (source === null || ship.sectorid === source)
                        ) {
                            ship.sectorid = sectorid;
                            affectedRows = 1;
                        }
                    }
                    return this._async(callback, null, { affectedRows });
                }

                if (/^DELETE FROM `?ships\d+`?/i.test(normalized)) {
                    let removed = 0;
                    const idListMatch = normalized.match(/id IN \(([^)]+)\)/i);
                    if (idListMatch) {
                        const ids = idListMatch[1].split(',').map(v => Number(v.trim())).filter(Number.isFinite);
                        for (let i = ships.length - 1; i >= 0; i--) {
                            if (ids.includes(ships[i].id)) {
                                ships.splice(i, 1);
                                removed++;
                            }
                        }
                    } else if (/WHERE id = \?/i.test(normalized)) {
                        const id = Number(params[0]);
                        const idx = ships.findIndex(s => s.id === id);
                        if (idx >= 0) {
                            ships.splice(idx, 1);
                            removed = 1;
                        }
                    } else if (/WHERE sectorid = \? AND owner = \?/i.test(normalized)) {
                        const [sectorid, owner] = (params || []).map(Number);
                        for (let i = ships.length - 1; i >= 0; i--) {
                            if (ships[i].sectorid === sectorid && ships[i].owner === owner) {
                                ships.splice(i, 1);
                                removed++;
                            }
                        }
                    } else if (/WHERE owner = \? AND sectorid = \?/i.test(normalized)) {
                        const [owner, sectorid] = (params || []).map(Number);
                        for (let i = ships.length - 1; i >= 0; i--) {
                            if (ships[i].sectorid === sectorid && ships[i].owner === owner) {
                                ships.splice(i, 1);
                                removed++;
                            }
                        }
                    } else if (/WHERE owner = \?/i.test(normalized)) {
                        const owner = Number(params[0]);
                        for (let i = ships.length - 1; i >= 0; i--) {
                            if (ships[i].owner === owner) {
                                ships.splice(i, 1);
                                removed++;
                            }
                        }
                    } else if (/WHERE sectorid = \?/i.test(normalized)) {
                        const sectorid = Number(params[0]);
                        for (let i = ships.length - 1; i >= 0; i--) {
                            if (ships[i].sectorid === sectorid) {
                                ships.splice(i, 1);
                                removed++;
                            }
                        }
                    }
                    return this._async(callback, null, { affectedRows: removed });
                }

                if (/^SELECT .* FROM `?ships\d+`?/i.test(normalized)) {
                    let filtered = [...ships];
                    let paramIndex = 0;
                    const hasOwnerEq = /owner = \?/i.test(normalized);
                    const hasOwnerNe = /owner != \?/i.test(normalized);
                    const hasSector = /sectorid = \?/i.test(normalized);
                    const hasType = /type = \?/i.test(normalized);

                    const ownerEq = hasOwnerEq ? Number(params[paramIndex++]) : undefined;
                    const sectorid = hasSector ? Number(params[paramIndex++]) : undefined;
                    const type = hasType ? Number(params[paramIndex++]) : undefined;
                    const ownerNe = hasOwnerNe ? Number(params[paramIndex++]) : undefined;

                    if (hasOwnerEq) filtered = filtered.filter(s => s.owner === ownerEq);
                    if (hasOwnerNe) filtered = filtered.filter(s => s.owner !== ownerNe);
                    if (hasSector) filtered = filtered.filter(s => s.sectorid === sectorid);
                    if (hasType) filtered = filtered.filter(s => s.type === type);

                    if (/LIMIT 1/i.test(normalized)) {
                        filtered = filtered.slice(0, 1);
                    }
                    return this._async(callback, null, filtered.map(s => ({ ...s })));
                }
            }

            const exploredMatch = normalized.match(/`?explored_sectors(\d+)`?/i);
            if (exploredMatch) {
                const gameId = Number(exploredMatch[1]);
                const explored = this._ensureExploredSectors(gameId);

                if (/^INSERT IGNORE INTO `?explored_sectors\d+`? \(playerid, sectorid\) VALUES \(\?, \?\)/i.test(normalized)) {
                    const [playerId, sectorId] = params.map(Number);
                    explored.set(`${playerId}:${sectorId}`, { playerid: playerId, sectorid: sectorId });
                    return this._async(callback, null, { affectedRows: 1 });
                }

                if (/^SELECT sectorid FROM `?explored_sectors\d+`? WHERE playerid = \? AND sectorid = \?/i.test(normalized)) {
                    const [playerId, sectorId] = params.map(Number);
                    const row = explored.get(`${playerId}:${sectorId}`);
                    return this._async(callback, null, row ? [{ sectorid: row.sectorid }] : []);
                }

                if (/^SELECT sectorid FROM `?explored_sectors\d+`? WHERE playerid = \?/i.test(normalized)) {
                    const playerId = Number(params[0]);
                    const rows = Array.from(explored.values())
                        .filter(row => row.playerid === playerId)
                        .map(row => ({ sectorid: row.sectorid }));
                    return this._async(callback, null, rows);
                }
            }

            if (/^SHOW COLUMNS FROM `?players\d+`? LIKE 'joined_at'/i.test(normalized)) {
                return this._async(callback, null, [{ Field: 'joined_at' }]);
            }

            if (/^ALTER TABLE `?players\d+`? ADD COLUMN joined_at/i.test(normalized)) {
                return this._async(callback, null, { affectedRows: 0 });
            }

            if (/^SHOW COLUMNS FROM `?players\d+`? LIKE 'is_ai'/i.test(normalized)) {
                return this._async(callback, null, []);
            }

            if (/^ALTER TABLE `?players\d+`? ADD COLUMN is_ai/i.test(normalized)) {
                return this._async(callback, null, { affectedRows: 0 });
            }

            if (/^SHOW COLUMNS FROM `?players\d+`? LIKE 'ai_difficulty'/i.test(normalized)) {
                return this._async(callback, null, []);
            }

            if (/^ALTER TABLE `?players\d+`? ADD COLUMN ai_difficulty/i.test(normalized)) {
                return this._async(callback, null, { affectedRows: 0 });
            }

            if (/^SHOW COLUMNS FROM `?players\d+`? LIKE 'ai_strategy'/i.test(normalized)) {
                return this._async(callback, null, []);
            }

            if (/^ALTER TABLE `?players\d+`? ADD COLUMN ai_strategy/i.test(normalized)) {
                return this._async(callback, null, { affectedRows: 0 });
            }

            if (/^(CREATE TABLE|DROP TABLE|ALTER TABLE map|CREATE INDEX)/i.test(normalized)) {
                return this._async(callback, null, { affectedRows: 0 });
            }

            if (/^SELECT premium_crystals FROM user_currencies WHERE user_id = \?/i.test(normalized)) {
                return this._async(callback, null, [{ premium_crystals: 0 }]);
            }

            if (/^INSERT INTO payment_transactions/i.test(normalized)) {
                const [userId, productId, stripeId, amount, currency, status] = params;
                let transaction = this._paymentTransactions.get(stripeId);
                if (!transaction) {
                    transaction = {
                        id: this._nextPaymentTransactionId++,
                        user_id: Number(userId),
                        product_id: productId,
                        stripe_id: stripeId,
                        amount,
                        currency,
                        status,
                        created_at: new Date(),
                        updated_at: new Date()
                    };
                    this._paymentTransactions.set(stripeId, transaction);
                    return this._async(callback, null, { insertId: transaction.id, affectedRows: 1 });
                }
                transaction.status = status;
                transaction.updated_at = new Date();
                return this._async(callback, null, { insertId: 0, affectedRows: 2 });
            }

            if (/^SELECT \* FROM payment_transactions WHERE stripe_id = \? LIMIT 1/i.test(normalized)) {
                const transaction = this._paymentTransactions.get(params[0]);
                return this._async(callback, null, transaction ? [{ ...transaction }] : []);
            }

            if (/^UPDATE payment_transactions SET status = \? WHERE stripe_id = \?/i.test(normalized)) {
                const [status, stripeId] = params;
                const transaction = this._paymentTransactions.get(stripeId);
                if (transaction) {
                    transaction.status = status;
                    transaction.updated_at = new Date();
                }
                return this._async(callback, null, { affectedRows: transaction ? 1 : 0 });
            }

            if (/^SELECT \* FROM payment_transactions WHERE user_id = \? AND created_at > \? ORDER BY created_at DESC/i.test(normalized)) {
                const userId = Number(params[0]);
                const rows = Array.from(this._paymentTransactions.values())
                    .filter(row => Number(row.user_id) === userId)
                    .sort((a, b) => Number(b.created_at) - Number(a.created_at));
                return this._async(callback, null, rows.map(row => ({ ...row })));
            }

            if (/^SELECT \* FROM payment_disputes WHERE user_id = \?/i.test(normalized)) {
                return this._async(callback, null, []);
            }

            if (/^INSERT INTO payment_logs/i.test(normalized)) {
                return this._async(callback, null, { insertId: 1 });
            }

            if (/FROM vip_memberships WHERE user_id = \?/i.test(normalized)) {
                return this._async(callback, null, []);
            }

            if (/FROM user_boosters WHERE user_id = \?/i.test(normalized)) {
                return this._async(callback, null, []);
            }

            if (/^SELECT \* FROM user_stats WHERE user_id = \?/i.test(normalized)) {
                const stats = this._userStats.get(Number(params[0]));
                return this._async(callback, null, stats ? [{ ...stats }] : []);
            }

            if (/^INSERT INTO user_stats \(user_id\) VALUES \(\?\)/i.test(normalized)) {
                const userId = Number(params[0]);
                if (!this._userStats.has(userId)) {
                    this._userStats.set(userId, {
                        user_id: userId,
                        games_played: 0,
                        wins: 0,
                        losses: 0,
                        total_planets_colonized: 0,
                        total_crystal_earned: 0,
                        total_ships_built: 0,
                        total_battles_won: 0,
                        total_sectors_explored: 0
                    });
                }
                return this._async(callback, null, { insertId: 0 });
            }

            if (/^SELECT \* FROM premium_purchases WHERE user_id = \? AND race_id = \? AND status = "completed"/i.test(normalized)) {
                return this._async(callback, null, []);
            }

            if (/^SELECT id FROM premium_purchases WHERE user_id = \? AND product_id = \? AND status = 'completed'/i.test(normalized)) {
                const [userId, productId] = params;
                const rows = this._premiumPurchases.filter(row =>
                    Number(row.user_id) === Number(userId) &&
                    row.product_id === productId &&
                    row.status === 'completed'
                );
                return this._async(callback, null, rows.map(row => ({ id: row.id })));
            }

            if (/^SELECT id FROM premium_purchases WHERE user_id = \? AND race_id = \? AND status = 'completed'/i.test(normalized)) {
                const [userId, raceId] = params;
                const rows = this._premiumPurchases.filter(row =>
                    Number(row.user_id) === Number(userId) &&
                    Number(row.race_id) === Number(raceId) &&
                    row.status === 'completed'
                );
                return this._async(callback, null, rows.map(row => ({ id: row.id })));
            }

            if (/^SELECT id FROM premium_purchases WHERE stripe_payment_id = \? LIMIT 1/i.test(normalized)) {
                const row = this._premiumPurchases.find(purchase => purchase.stripe_payment_id === params[0]);
                return this._async(callback, null, row ? [{ id: row.id }] : []);
            }

            if (/^INSERT INTO premium_purchases/i.test(normalized)) {
                let values = {};
                if (/VALUES \(\?, NULL, \?, \?, \?, 'completed'\)/i.test(normalized)) {
                    values = {
                        user_id: params[0],
                        race_id: null,
                        product_id: params[1],
                        amount: params[2],
                        stripe_payment_id: params[3],
                        status: 'completed'
                    };
                } else {
                    const columnsMatch = normalized.match(/^INSERT INTO premium_purchases\s*\(([^)]+)\)/i);
                    if (columnsMatch) {
                    columnsMatch[1].split(',').map(col => col.trim().toLowerCase()).forEach((column, index) => {
                        values[column] = params[index];
                    });
                    }
                }

                const existingRace = values.race_id !== null && values.race_id !== undefined
                    ? this._premiumPurchases.find(row =>
                        Number(row.user_id) === Number(values.user_id) &&
                        Number(row.race_id) === Number(values.race_id)
                    )
                    : null;
                if (existingRace) {
                    existingRace.product_id = values.product_id;
                    existingRace.amount = values.amount;
                    existingRace.stripe_payment_id = values.stripe_payment_id;
                    existingRace.status = 'completed';
                    return this._async(callback, null, { insertId: 0, affectedRows: 2 });
                }

                const purchase = {
                    id: this._nextPremiumPurchaseId++,
                    user_id: Number(values.user_id),
                    race_id: values.race_id === undefined ? null : values.race_id,
                    product_id: values.product_id || null,
                    amount: values.amount || 0,
                    stripe_payment_id: values.stripe_payment_id || null,
                    status: 'completed',
                    created_at: new Date()
                };
                this._premiumPurchases.push(purchase);
                return this._async(callback, null, { insertId: purchase.id, affectedRows: 1 });
            }

            if (/^INSERT IGNORE INTO user_cosmetics/i.test(normalized)) {
                const [userId, itemId] = params;
                const exists = this._userCosmetics.some(row => Number(row.user_id) === Number(userId) && row.item_id === itemId);
                if (!exists) {
                    this._userCosmetics.push({ user_id: Number(userId), item_id: itemId });
                }
                return this._async(callback, null, { affectedRows: exists ? 0 : 1 });
            }

            if (/^SELECT DISTINCT product_id FROM premium_purchases WHERE user_id = \? AND status = 'completed' UNION SELECT CONCAT\('race_', race_id\) as product_id FROM premium_purchases WHERE user_id = \? AND status = 'completed'/i.test(normalized)) {
                const userId = Number(params[0]);
                const rows = [];
                this._premiumPurchases
                    .filter(row => Number(row.user_id) === userId && row.status === 'completed')
                    .forEach(row => {
                        if (row.product_id) {
                            rows.push({ product_id: row.product_id });
                        }
                        if (row.race_id) {
                            rows.push({ product_id: `race_${row.race_id}` });
                        }
                    });
                return this._async(callback, null, rows);
            }

            if (/FROM payment_transactions pt LEFT JOIN product_catalog pp ON pt\.product_id = pp\.id WHERE pt\.user_id = \? ORDER BY pt\.created_at DESC LIMIT \?/i.test(normalized)) {
                return this._async(callback, null, []);
            }

            return this._async(
                callback,
                new Error(`Unhandled query in MockDatabase: ${normalized}`)
            );
        } catch (error) {
            return this._async(callback, error);
        }
    }

    _async(callback, err, result) {
        const cb = typeof callback === 'function' ? callback : () => {};
        scheduleImmediate(() => cb(err, result));
    }

    _ensurePlayerTable(gameId) {
        if (!this._playerTables.has(gameId)) {
            this._playerTables.set(gameId, new Map());
        }
        return this._playerTables.get(gameId);
    }

    _extractPlayerTable(sql) {
        const match = sql.match(/`?players(\d+)`?/i);
        if (!match) {
            throw new Error(`Unable to extract player table id from query: ${sql}`);
        }
        return { gameId: Number(match[1]) };
    }

    _buildMapRow(sectorid, x, y, type, sectortype) {
        const width = 14;
        const sector = Number(sectorid);
        const zeroBased = Math.max(0, sector - 1);
        const resolvedX = Number.isFinite(x) ? Number(x) : zeroBased % width;
        const resolvedY = Number.isFinite(y) ? Number(y) : Math.floor(zeroBased / width);
        const resolvedType = Number.isFinite(sectortype) ? Number(sectortype) : (Number.isFinite(type) ? Number(type) : 0);
        return {
            sectorid: sector,
            x: resolvedX,
            y: resolvedY,
            type: resolvedType,
            sectortype: resolvedType,
            owner: null,
            ownerid: null,
            colonized: 0,
            artifact: 0,
            metalbonus: 100,
            crystalbonus: 100,
            terraformlvl: 0
        };
    }

    _ensureMap(gameId) {
        const width = 14;
        const height = 8;
        if (!this._maps.has(gameId)) {
            const map = new Map();
            for (let i = 1; i <= width * height; i++) {
                const zeroBased = i - 1;
                map.set(i, this._buildMapRow(i, zeroBased % width, Math.floor(zeroBased / width), (i % 5) + 1, (i % 5) + 1));
            }
            this._maps.set(gameId, map);
        }
        return this._maps.get(gameId);
    }

    _ensureShips(gameId) {
        if (!this._ships.has(gameId)) {
            this._ships.set(gameId, []);
            this._shipIds.set(gameId, 1);
        }
        if (!this._shipIds.has(gameId)) {
            this._shipIds.set(gameId, this._ships.get(gameId).length + 1);
        }
        return this._ships.get(gameId);
    }

    _nextShipId(gameId) {
        const next = this._shipIds.get(gameId) || 1;
        this._shipIds.set(gameId, next + 1);
        return next;
    }

    _ensureBuildings(gameId) {
        if (!this._buildings.has(gameId)) {
            this._buildings.set(gameId, []);
            this._buildingIds.set(gameId, 1);
        }
        if (!this._buildingIds.has(gameId)) {
            this._buildingIds.set(gameId, this._buildings.get(gameId).length + 1);
        }
        return this._buildings.get(gameId);
    }

    _ensureExploredSectors(gameId) {
        if (!this._exploredSectors.has(gameId)) {
            this._exploredSectors.set(gameId, new Map());
        }
        return this._exploredSectors.get(gameId);
    }

    _nextBuildingId(gameId) {
        const next = this._buildingIds.get(gameId) || 1;
        this._buildingIds.set(gameId, next + 1);
        return next;
    }
}

function createMockDatabase() {
    return new MockDatabase();
}

module.exports = {
    MockDatabase,
    createMockDatabase
};

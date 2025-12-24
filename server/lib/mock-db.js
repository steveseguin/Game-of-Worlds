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
        this._shipIds = new Map();
        this._buildingIds = new Map();
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

            if (/^SELECT \* FROM users WHERE id = \?(\s+LIMIT 1)?/i.test(normalized)) {
                const user = this._users.get(Number(params[0]));
                return this._async(
                    callback,
                    null,
                    user ? [{ ...user }] : []
                );
            }

            if (/^INSERT INTO users/i.test(normalized)) {
                const [username, password, salt, email, tempkey] = params;
                const key = toLower(username);
                const id = this._nextUserId++;
                const user = {
                    id,
                    username,
                    password,
                    salt,
                    email,
                    tempkey,
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
                const [name, creator, maxPlayers, status, modeParam] = params;
                const mode = typeof modeParam === 'string' ? modeParam : 'quick';
                const id = this._nextGameId++;
                const game = {
                    id,
                    name,
                    creator,
                    maxplayers: maxPlayers,
                    status,
                    mode,
                    started: 0,
                    created: Date.now()
                };
                this._games.set(id, game);
                return this._async(callback, null, { insertId: id });
            }

            if (/^SELECT id, name, maxplayers, started, status(, mode)? FROM games WHERE started = 0 ORDER BY created DESC LIMIT \?/i.test(normalized)) {
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
                        mode: game.mode || 'quick'
                    }));
                return this._async(callback, null, games);
            }

            if (/^SELECT id, name, maxplayers, started, creator FROM games WHERE id = \? AND started = 0/i.test(normalized)) {
                const game = this._games.get(Number(params[0]));
                if (game && game.started === 0) {
                    return this._async(callback, null, [{ ...game }]);
                }
                return this._async(callback, null, []);
            }

            if (/^SELECT creator, maxplayers, started(, mode)? FROM games WHERE id = \? LIMIT 1/i.test(normalized)
                || /^SELECT id, creator, started(, mode)? FROM games WHERE id = \? LIMIT 1/i.test(normalized)
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

            if (/^UPDATE games SET status = \? WHERE id = \?/i.test(normalized)) {
                const [status, gameId] = params;
                const game = this._games.get(Number(gameId));
                if (game) {
                    game.status = status;
                }
                return this._async(callback, null, { affectedRows: game ? 1 : 0 });
            }

            if (/^DELETE FROM games WHERE id = \?/i.test(normalized)) {
                const gameId = Number(params[0]);
                const existed = this._games.delete(gameId);
                this._playerTables.delete(gameId);
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

                const paramsCopy = Array.isArray(params) ? [...params] : [];
                const whereValue = typeof paramsCopy[paramsCopy.length - 1] === 'number'
                    ? paramsCopy.pop()
                    : Number(paramsCopy.pop());
                const player = players.get(Number(whereValue));
                if (!player) {
                    return this._async(callback, null, { affectedRows: 0 });
                }

                const setClause = normalized
                    .replace(/^UPDATE `?players\d+`? SET /i, '')
                    .split(' WHERE ')[0];
                const assignments = setClause.split(',').map(part => part.trim());

                assignments.forEach(assignment => {
                    const directMatch = assignment.match(/^([a-z_]+) = \?/i);
                    if (directMatch) {
                        const field = directMatch[1];
                        player[field] = paramsCopy.shift();
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
                        const delta = Number(paramsCopy.shift());
                        player[field] = Number(player[source] || 0) + delta;
                        return;
                    }

                    const selfSubMatch = assignment.match(/^([a-z_]+) = ([a-z_]+) - \?/i);
                    if (selfSubMatch) {
                        const field = selfSubMatch[1];
                        const source = selfSubMatch[2];
                        const delta = Number(paramsCopy.shift());
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

            if (/^SELECT p\.userid, p\.is_ai, p\.race_id, p\.ai_difficulty, p\.ai_strategy, u\.username FROM `?players\d+`? p LEFT JOIN users u ON u\.id = p\.userid/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const rows = players
                    ? Array.from(players.values()).map(player => {
                        const user = this._users.get(Number(player.userid));
                        return {
                            userid: player.userid,
                            is_ai: player.is_ai || 0,
                            race_id: player.race_id || 0,
                            ai_difficulty: player.ai_difficulty || 'medium',
                            ai_strategy: player.ai_strategy || 'balanced',
                            username: user ? user.username : null
                        };
                    })
                    : [];
                return this._async(callback, null, rows);
            }

            if (/^SELECT userid FROM `?players\d+`?/i.test(normalized)) {
                const { gameId } = this._extractPlayerTable(normalized);
                const players = this._playerTables.get(gameId);
                const rows = players
                    ? Array.from(players.values()).map(player => ({ userid: player.userid }))
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

                if (/^SELECT \* FROM `?buildings\d+`?/i.test(normalized)) {
                    return this._async(callback, null, buildings.map(b => ({ ...b })));
                }
            }

            // Map operations
            const mapMatch = normalized.match(/`?map(\d+)`?/i);
            if (mapMatch) {
                const gameId = Number(mapMatch[1]);
                const map = this._ensureMap(gameId);

                if (/^INSERT INTO `?map\d+`?/i.test(normalized)) {
                    if (Array.isArray(params) && params.length >= 5) {
                        const [sectorid, x, y, type, sectortype] = params.map(Number);
                        map.set(Number(sectorid), this._buildMapRow(sectorid, x, y, type, sectortype));
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
                    const sectorId = /WHERE sectorid = \?/i.test(normalized)
                        ? Number(paramsCopy.pop())
                        : null;
                    const assignments = normalized
                        .replace(/^UPDATE `?map\d+`? SET /i, '')
                        .split(' WHERE ')[0]
                        .split(',')
                        .map(part => part.trim());
                    const targets = sectorId !== null && sectorId !== undefined ? [sectorId] : Array.from(map.keys());
                    targets.forEach(id => {
                        const entry = map.get(id) || this._buildMapRow(id);
                        assignments.forEach(assignment => {
                            const qMatch = assignment.match(/^([a-z_]+) = \?/i);
                            if (qMatch) {
                                entry[qMatch[1]] = paramsCopy.shift();
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

                if (/^SELECT sectorid, type FROM `?map\d+`? WHERE owner IS NULL/i.test(normalized)) {
                    const rows = Array.from(map.values()).filter(r => r.owner === null || r.owner === undefined);
                    return this._async(callback, null, rows.map(r => ({ sectorid: r.sectorid, type: r.type })));
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

                if (/^SELECT owner FROM `?map\d+`? WHERE sectorid IN \\(\\?\\)/i.test(normalized)) {
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
                    const idListMatch = normalized.match(/id IN \\(([^)]+)\\)/i);
                    let affectedRows = 0;
                    if (idListMatch) {
                        const ids = idListMatch[1].split(',').map(v => Number(v.trim())).filter(Number.isFinite);
                        ships.forEach(ship => {
                            if (ids.includes(ship.id)) {
                                ship.sectorid = sectorid;
                                affectedRows++;
                            }
                        });
                    } else if (/WHERE id = \?/i.test(normalized)) {
                        const id = Number(params[1]);
                        const ship = ships.find(s => s.id === id);
                        if (ship) {
                            ship.sectorid = sectorid;
                            affectedRows = 1;
                        }
                    }
                    return this._async(callback, null, { affectedRows });
                }

                if (/^DELETE FROM `?ships\d+`?/i.test(normalized)) {
                    let removed = 0;
                    if (/WHERE id = \?/i.test(normalized)) {
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
        const resolvedX = Number.isFinite(x) ? Number(x) : sector % width;
        const resolvedY = Number.isFinite(y) ? Number(y) : Math.floor(sector / width);
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
            crystalbonus: 100
        };
    }

    _ensureMap(gameId) {
        const width = 14;
        const height = 8;
        if (!this._maps.has(gameId)) {
            const map = new Map();
            for (let i = 0; i < width * height; i++) {
                map.set(i, this._buildMapRow(i, i % width, Math.floor(i / width), (i % 5) + 1, (i % 5) + 1));
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

// Bounded in-memory combat statistics and player-scoped analytics snapshots.
const combatSystem = require('./combat');
const { getRaceById } = require('./races');
const { SHIP_TYPE_IDS, COMBAT_TELEMETRY_RECENT_BATTLES, COMBAT_TELEMETRY_MAX_GAMES } = require('./config/constants');

const SHIP_TYPE_NAME_BY_ID = Object.freeze(
    Object.values(combatSystem.SHIP_TYPES).reduce((acc, ship) => {
        if (ship && ship.id) {
            acc[ship.id] = ship.name || `Ship ${ship.id}`;
        }
        return acc;
    }, {})
);
const combatTelemetryStore = new Map();

function createPlayerTelemetryRecord(playerId, raceId) {
    const byType = {};
    SHIP_TYPE_IDS.forEach(typeId => {
        byType[typeId] = {
            typeId,
            name: SHIP_TYPE_NAME_BY_ID[typeId] || `Ship ${typeId}`,
            deployed: 0,
            survivors: 0,
            losses: 0,
            kills: 0,
            shots: 0,
            hits: 0,
            damage: 0,
            battles: 0
        };
    });

    return {
        playerId: Number(playerId),
        raceId: Number(raceId) || 1,
        byType,
        orbitalTurret: {
            shots: 0,
            hits: 0,
            damage: 0,
            kills: 0
        },
        battles: 0,
        updatedAt: null
    };
}

function getOrCreateGameTelemetryRecord(gameId) {
    const normalizedGameId = Number(gameId);
    if (!combatTelemetryStore.has(normalizedGameId)) {
        if (combatTelemetryStore.size >= COMBAT_TELEMETRY_MAX_GAMES) {
            const oldestKey = combatTelemetryStore.keys().next().value;
            if (oldestKey !== undefined) {
                combatTelemetryStore.delete(oldestKey);
            }
        }

        combatTelemetryStore.set(normalizedGameId, {
            gameId: normalizedGameId,
            battles: 0,
            updatedAt: null,
            players: {},
            recentBattles: []
        });
    }

    return combatTelemetryStore.get(normalizedGameId);
}

function getOrCreatePlayerTelemetryRecord(gameTelemetry, playerId, raceId) {
    const normalizedPlayerId = Number(playerId);
    if (!gameTelemetry.players[normalizedPlayerId]) {
        gameTelemetry.players[normalizedPlayerId] = createPlayerTelemetryRecord(normalizedPlayerId, raceId);
    }

    const playerTelemetry = gameTelemetry.players[normalizedPlayerId];
    if (raceId) {
        playerTelemetry.raceId = Number(raceId) || playerTelemetry.raceId;
    }
    return playerTelemetry;
}

function getTypeMetric(counterMap, typeId) {
    return Number(counterMap && counterMap[typeId]) || 0;
}

function addSideTelemetryToPlayerRecord(playerTelemetry, sideTelemetry) {
    if (!playerTelemetry || !sideTelemetry) {
        return;
    }

    let touchedThisBattle = false;

    SHIP_TYPE_IDS.forEach(typeId => {
        const stat = playerTelemetry.byType[typeId];
        const deployed = getTypeMetric(sideTelemetry.deployedByType, typeId);
        const survivors = getTypeMetric(sideTelemetry.survivorsByType, typeId);
        const losses = getTypeMetric(sideTelemetry.lossesByType, typeId);
        const kills = getTypeMetric(sideTelemetry.killCreditsByType, typeId);
        const shots = getTypeMetric(sideTelemetry.shotsByType, typeId);
        const hits = getTypeMetric(sideTelemetry.hitsByType, typeId);
        const damage = getTypeMetric(sideTelemetry.damageByType, typeId);

        stat.deployed += deployed;
        stat.survivors += survivors;
        stat.losses += losses;
        stat.kills += kills;
        stat.shots += shots;
        stat.hits += hits;
        stat.damage += damage;

        if (deployed > 0 || shots > 0 || hits > 0 || damage > 0 || kills > 0 || losses > 0) {
            stat.battles += 1;
            touchedThisBattle = true;
        }
    });

    playerTelemetry.orbitalTurret.shots += Number(sideTelemetry.orbitalTurretShots) || 0;
    playerTelemetry.orbitalTurret.hits += Number(sideTelemetry.orbitalTurretHits) || 0;
    playerTelemetry.orbitalTurret.damage += Number(sideTelemetry.orbitalTurretDamage) || 0;
    playerTelemetry.orbitalTurret.kills += Number(sideTelemetry.orbitalTurretKillCredits) || 0;

    if ((Number(sideTelemetry.orbitalTurretShots) || 0) > 0) {
        touchedThisBattle = true;
    }

    if (touchedThisBattle) {
        playerTelemetry.battles += 1;
    }
    playerTelemetry.updatedAt = new Date().toISOString();
}

function deriveTopShipTelemetry(sideTelemetry) {
    if (!sideTelemetry) {
        return null;
    }

    let best = null;
    SHIP_TYPE_IDS.forEach(typeId => {
        const kills = getTypeMetric(sideTelemetry.killCreditsByType, typeId);
        const damage = getTypeMetric(sideTelemetry.damageByType, typeId);
        const losses = getTypeMetric(sideTelemetry.lossesByType, typeId);
        const shots = getTypeMetric(sideTelemetry.shotsByType, typeId);
        const hits = getTypeMetric(sideTelemetry.hitsByType, typeId);
        const deployed = getTypeMetric(sideTelemetry.deployedByType, typeId);

        if (deployed <= 0 && shots <= 0 && kills <= 0 && damage <= 0 && losses <= 0) {
            return;
        }

        const score = (kills * 100) + damage + (hits * 2);
        if (!best || score > best.score) {
            best = {
                typeId,
                shipName: SHIP_TYPE_NAME_BY_ID[typeId] || `Ship ${typeId}`,
                kills,
                losses,
                shots,
                hits,
                damage,
                score
            };
        }
    });

    if (!best) {
        return null;
    }

    const hitRate = best.shots > 0 ? best.hits / best.shots : 0;
    const killPerLoss = best.losses > 0 ? best.kills / best.losses : null;

    return {
        typeId: best.typeId,
        shipName: best.shipName,
        kills: Number(best.kills.toFixed(3)),
        losses: Number(best.losses.toFixed(3)),
        shots: best.shots,
        hits: best.hits,
        damage: Number(best.damage.toFixed(3)),
        hitRate: Number(hitRate.toFixed(3)),
        killPerLoss: killPerLoss === null ? null : Number(killPerLoss.toFixed(3))
    };
}

function formatShipTelemetryHint(sideTelemetry, prefix = 'Telemetry') {
    const topShip = deriveTopShipTelemetry(sideTelemetry);
    if (!topShip) {
        return `${prefix}: no ship telemetry available for this battle.`;
    }

    const killPerLossText = topShip.killPerLoss === null
        ? (topShip.kills > 0 ? `${topShip.kills.toFixed(2)}/0` : '0.00')
        : topShip.killPerLoss.toFixed(2);
    const hitRatePct = (topShip.hitRate * 100).toFixed(0);

    return `${prefix}: ${topShip.shipName} led your fleet (K/L ${killPerLossText}, hit ${hitRatePct}%, dmg ${topShip.damage.toFixed(1)}).`;
}

function recordCombatTelemetry({
    gameId,
    sectorId,
    attackerId,
    defenderId,
    attackerRaceId,
    defenderRaceId,
    winnerId,
    attackerLosses,
    defenderLosses,
    battleLog
}) {
    if (!battleLog || !battleLog.telemetry) {
        return;
    }

    const gameTelemetry = getOrCreateGameTelemetryRecord(gameId);
    const attackerTelemetry = getOrCreatePlayerTelemetryRecord(gameTelemetry, attackerId, attackerRaceId);
    const defenderTelemetry = getOrCreatePlayerTelemetryRecord(gameTelemetry, defenderId, defenderRaceId);

    addSideTelemetryToPlayerRecord(attackerTelemetry, battleLog.telemetry.attacker);
    addSideTelemetryToPlayerRecord(defenderTelemetry, battleLog.telemetry.defender);

    gameTelemetry.battles += 1;
    gameTelemetry.updatedAt = new Date().toISOString();

    const recentEntry = {
        timestamp: gameTelemetry.updatedAt,
        sector: Number(sectorId).toString(16).toUpperCase(),
        attackerId: Number(attackerId),
        defenderId: Number(defenderId),
        winnerId: Number(winnerId),
        attackerLosses: Number(attackerLosses) || 0,
        defenderLosses: Number(defenderLosses) || 0,
        attackerTopShip: deriveTopShipTelemetry(battleLog.telemetry.attacker),
        defenderTopShip: deriveTopShipTelemetry(battleLog.telemetry.defender),
        result: battleLog.result || 'unknown'
    };

    gameTelemetry.recentBattles.push(recentEntry);
    if (gameTelemetry.recentBattles.length > COMBAT_TELEMETRY_RECENT_BATTLES) {
        gameTelemetry.recentBattles.splice(0, gameTelemetry.recentBattles.length - COMBAT_TELEMETRY_RECENT_BATTLES);
    }

    const attackerTop = recentEntry.attackerTopShip ? recentEntry.attackerTopShip.shipName : 'n/a';
    const defenderTop = recentEntry.defenderTopShip ? recentEntry.defenderTopShip.shipName : 'n/a';
    console.log(
        `[CombatTelemetry] game=${gameId} sector=${recentEntry.sector} winner=P${winnerId} losses(A:${recentEntry.attackerLosses},D:${recentEntry.defenderLosses}) top(A:${attackerTop},D:${defenderTop})`
    );
}

function buildShipTelemetryView(stat) {
    const hitRate = stat.shots > 0 ? stat.hits / stat.shots : 0;
    const damagePerShot = stat.shots > 0 ? stat.damage / stat.shots : 0;
    const killPerLoss = stat.losses > 0 ? stat.kills / stat.losses : null;

    return {
        shipTypeId: stat.typeId,
        shipName: stat.name,
        deployed: stat.deployed,
        survivors: stat.survivors,
        losses: stat.losses,
        kills: Number(stat.kills.toFixed(3)),
        shots: stat.shots,
        hits: stat.hits,
        damage: Number(stat.damage.toFixed(3)),
        battles: stat.battles,
        hitRate: Number(hitRate.toFixed(3)),
        damagePerShot: Number(damagePerShot.toFixed(3)),
        killPerLoss: killPerLoss === null ? null : Number(killPerLoss.toFixed(3))
    };
}

function getCombatTelemetrySnapshot(gameId, viewerId) {
    const normalizedGameId = Number(gameId);
    const gameTelemetry = combatTelemetryStore.get(normalizedGameId);
    if (!gameTelemetry) {
        return {
            gameId: normalizedGameId,
            battles: 0,
            updatedAt: null,
            recentBattles: [],
            players: []
        };
    }

    const normalizedViewerId = Number(viewerId);
    const players = Object.values(gameTelemetry.players)
        .filter(player => player.playerId === normalizedViewerId)
        .sort((a, b) => a.playerId - b.playerId)
        .map(player => {
            const shipStats = SHIP_TYPE_IDS
                .map(typeId => buildShipTelemetryView(player.byType[typeId]))
                .filter(stat => stat.deployed > 0 || stat.shots > 0 || stat.kills > 0 || stat.losses > 0);

            return {
                playerId: player.playerId,
                raceId: player.raceId,
                raceName: getRaceById(player.raceId).name,
                battles: player.battles,
                orbitalTurret: {
                    shots: player.orbitalTurret.shots,
                    hits: player.orbitalTurret.hits,
                    damage: Number(player.orbitalTurret.damage.toFixed(3)),
                    kills: Number(player.orbitalTurret.kills.toFixed(3)),
                    hitRate: player.orbitalTurret.shots > 0
                        ? Number((player.orbitalTurret.hits / player.orbitalTurret.shots).toFixed(3))
                        : 0
                },
                shipStats
            };
        });

    const recentBattles = gameTelemetry.recentBattles
        .filter(battle => battle.attackerId === normalizedViewerId || battle.defenderId === normalizedViewerId)
        .slice(-25);
    const viewerRecord = gameTelemetry.players[normalizedViewerId];
    return {
        gameId: gameTelemetry.gameId,
        battles: viewerRecord ? viewerRecord.battles : 0,
        updatedAt: gameTelemetry.updatedAt,
        recentBattles,
        players
    };
}

module.exports = { recordCombatTelemetry, getCombatTelemetrySnapshot, formatShipTelemetryHint };

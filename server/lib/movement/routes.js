'use strict';

function sectorToPoint(sectorId, width) {
    const index = Number(sectorId) - 1;
    return { x: index % width, y: Math.floor(index / width) };
}

function pointToSector(x, y, width) {
    return (y * width) + x + 1;
}

/**
 * Trace the grid cells crossed by a straight flight from sector-center to
 * sector-center. The source is omitted and the destination is included.
 * Basic Bresenham keeps exact diagonal flights diagonal instead of charging
 * both cells that merely touch at a corner.
 */
function traceDirectRoute(fromSector, toSector, width, height) {
    const from = Number(fromSector);
    const to = Number(toSector);
    const mapWidth = Number(width);
    const mapHeight = Number(height);
    if (![from, to, mapWidth, mapHeight].every(Number.isSafeInteger)
        || from <= 0 || to <= 0 || mapWidth <= 0 || mapHeight <= 0
        || from > mapWidth * mapHeight || to > mapWidth * mapHeight
        || from === to) return [];

    const start = sectorToPoint(from, mapWidth);
    const end = sectorToPoint(to, mapWidth);
    let x = start.x;
    let y = start.y;
    const dx = Math.abs(end.x - start.x);
    const sx = start.x < end.x ? 1 : -1;
    const dy = -Math.abs(end.y - start.y);
    const sy = start.y < end.y ? 1 : -1;
    let error = dx + dy;
    const route = [];

    while (x !== end.x || y !== end.y) {
        const doubled = 2 * error;
        if (doubled >= dy) {
            error += dy;
            x += sx;
        }
        if (doubled <= dx) {
            error += dx;
            y += sy;
        }
        route.push(pointToSector(x, y, mapWidth));
    }
    return route;
}

function summarizeKnownRoute(route, knownSectors, playerId) {
    const known = knownSectors instanceof Map ? knownSectors : new Map();
    const summary = { unknown: 0, asteroids: [], blackHoles: [] };
    (route || []).forEach(sectorId => {
        const sector = known.get(Number(sectorId));
        if (!sector) {
            summary.unknown += 1;
            return;
        }
        const type = Number(sector.type);
        if (type === 2) summary.blackHoles.push(Number(sectorId));
        if (type === 1 && Number(sector.owner) !== Number(playerId)) {
            summary.asteroids.push(Number(sectorId));
        }
    });
    return summary;
}

module.exports = { traceDirectRoute, summarizeKnownRoute };

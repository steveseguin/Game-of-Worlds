const crypto = require('crypto');
const raceSystem = require('../races');

// ============================================================================
// PARSING & CONVERSION UTILITIES
// ============================================================================

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSectorToken(value) {
    if (value === undefined || value === null) {
        return NaN;
    }
    const raw = String(value).trim();
    if (!raw) {
        return NaN;
    }
    const parsedHex = Number.parseInt(raw, 16);
    return Number.isFinite(parsedHex) ? parsedHex : NaN;
}

function formatSectorToken(sectorId) {
    return Number(sectorId).toString(16).toUpperCase();
}

function safeDecodeURIComponent(value, fallback = '') {
    if (typeof value !== 'string') {
        return fallback;
    }
    try {
        return decodeURIComponent(value);
    } catch (error) {
        return fallback;
    }
}

// ============================================================================
// NORMALIZATION UTILITIES
// ============================================================================

function normalizeMode(mode) {
    return mode === 'epic' ? 'epic' : 'quick';
}

function normalizeAiDifficulty(raw) {
    const AI_DIFFICULTIES = new Set(['chill', 'medium', 'aggressive']);
    const value = (raw || '').toLowerCase();
    return AI_DIFFICULTIES.has(value) ? value : 'medium';
}

function normalizeAiStrategy(raw) {
    const AI_STRATEGIES = new Set(['balanced', 'aggressive', 'economic']);
    const value = (raw || '').toLowerCase();
    return AI_STRATEGIES.has(value) ? value : 'balanced';
}

// ============================================================================
// RACE UTILITIES
// ============================================================================

function getRaceById(raceId) {
    return Object.values(raceSystem.RACE_TYPES).find(race => race.id === raceId) || raceSystem.RACE_TYPES.TERRAN;
}

// ============================================================================
// CRYPTOGRAPHY UTILITIES
// ============================================================================

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function generateTempKey() {
    return crypto.randomBytes(32).toString('hex');
}

// ============================================================================
// GRID/MAP UTILITIES
// ============================================================================

function getAdjacentSectorIds(sectorId, width = 14, height = 8) {
    const id = Number(sectorId);
    if (!Number.isFinite(id) || id < 0 || id >= width * height) {
        return [];
    }

    const x = id % width;
    const y = Math.floor(id / width);
    const adjacent = [];

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            adjacent.push((ny * width) + nx);
        }
    }

    return adjacent;
}

function areAdjacentSectors(sector1, sector2, width = 14) {
    const adjacentIds = getAdjacentSectorIds(sector1, width);
    return adjacentIds.includes(sector2);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Parsing
    parsePositiveInt,
    parseSectorToken,
    formatSectorToken,
    safeDecodeURIComponent,

    // Normalization
    normalizeMode,
    normalizeAiDifficulty,
    normalizeAiStrategy,

    // Races
    getRaceById,

    // Cryptography
    hashPassword,
    generateSalt,
    generateTempKey,

    // Grid/Map
    getAdjacentSectorIds,
    areAdjacentSectors
};

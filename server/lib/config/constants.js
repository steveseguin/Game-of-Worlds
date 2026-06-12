// ============================================================================
// GAME CONSTANTS & CONFIGURATION
// ============================================================================

const VALID_LOBBY_PLAYER_COUNTS = new Set([2, 3, 4, 6, 8, 12, 25, 50, 100, 250, 500, 1000]);
const DEFAULT_MAX_PLAYERS = 4;
const MAX_LOBBY_PLAYERS = 1000;
const GAME_LIST_LIMIT = 25;
const LOBBY_LIST_LIMIT = 200;
const DEFAULT_CREATOR_RACE_ID = 1;
const MIN_PLAYERS_TO_START = 1;

const TURN_SPEEDS_MS = {
    quick: Number(process.env.TURN_INTERVAL_QUICK_MS) || 180000, // 3 minutes
    epic: Number(process.env.TURN_INTERVAL_EPIC_MS) || 86400000 // 24 hours
};

const DEFAULT_GAME_MODE = 'quick';
const EPIC_RESOURCE_MULTIPLIER = Number(process.env.EPIC_RESOURCE_MULTIPLIER) || 12;
const EPIC_AUTO_BUILD_ENABLED = String(process.env.EPIC_AUTO_BUILD || 'true').toLowerCase() !== 'false';

const BUILDING_COSTS = {
    0: { name: "Metal Extractor", metal: 50, crystal: 20 },
    1: { name: "Crystal Refinery", metal: 40, crystal: 30 },
    2: { name: "Research Academy", metal: 60, crystal: 40 },
    3: { name: "Spaceport", metal: 100, crystal: 50 },
    4: { name: "Orbital Turret", metal: 80, crystal: 60 },
    5: { name: "Warp Gate", metal: 200, crystal: 150 }
};

const DEFAULT_STANDING_ORDERS = {
    autoRebuild: false,
    autoScout: false
};

const GAME_TABLE_SUFFIXES = [
    'map',
    'players',
    'ships',
    'buildings',
    'diplomacy',
    'wonders',
    'game_snapshots'
];

const AI_DIFFICULTIES = new Set(['chill', 'medium', 'aggressive']);
const AI_STRATEGIES = new Set(['balanced', 'aggressive', 'economic']);

const BATTLE_VISIBILITY_CONFIG = Object.freeze({
    OVERWHELMING_FORCE_RATIO: 4.5,
    OVERWHELMING_MIN_SHIPS: 8,
    STEALTH_CONCEALMENT_THRESHOLD: 0.45
});

const SHIP_TYPE_MODIFIER_KEYS = Object.freeze({
    1: 'frigate',
    2: 'destroyer',
    3: 'scout',
    4: 'cruiser',
    5: 'battleship',
    6: 'colony',
    7: 'dreadnought',
    8: 'intruder',
    9: 'carrier'
});

const SHIP_TYPE_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);

const COMBAT_TELEMETRY_RECENT_BATTLES = 120;
const COMBAT_TELEMETRY_MAX_GAMES = 64;

const SCOUT_SHIP_ID = 3; // Usually configured from combat system

const MAP_DIMENSIONS = {
    width: 14,
    height: 8
};

module.exports = {
    VALID_LOBBY_PLAYER_COUNTS,
    DEFAULT_MAX_PLAYERS,
    MAX_LOBBY_PLAYERS,
    GAME_LIST_LIMIT,
    LOBBY_LIST_LIMIT,
    DEFAULT_CREATOR_RACE_ID,
    MIN_PLAYERS_TO_START,
    TURN_SPEEDS_MS,
    DEFAULT_GAME_MODE,
    EPIC_RESOURCE_MULTIPLIER,
    EPIC_AUTO_BUILD_ENABLED,
    BUILDING_COSTS,
    DEFAULT_STANDING_ORDERS,
    GAME_TABLE_SUFFIXES,
    AI_DIFFICULTIES,
    AI_STRATEGIES,
    BATTLE_VISIBILITY_CONFIG,
    SHIP_TYPE_MODIFIER_KEYS,
    SHIP_TYPE_IDS,
    COMBAT_TELEMETRY_RECENT_BATTLES,
    COMBAT_TELEMETRY_MAX_GAMES,
    SCOUT_SHIP_ID,
    MAP_DIMENSIONS
};

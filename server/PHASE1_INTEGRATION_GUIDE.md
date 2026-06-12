# Phase 1 Integration Guide
## Connecting Extracted Modules Back to server.js

## Overview

Phase 1 has created a complete folder structure with extracted modules. This guide explains how to integrate these modules back into server.js with ZERO logic changes.

## Module Import Structure

### Step 1: Add Imports at Top of server.js

```javascript
// After existing requires, add:
const utilsModule = require('./lib/utils');
const gameModule = require('./lib/game');
const movementModule = require('./lib/movement');
const broadcastModule = require('./lib/broadcast');
const databaseModule = require('./lib/database');
const configConstants = require('./lib/config/constants');
```

### Step 2: Initialize Module Dependencies

After database is ready (in setDatabase function):

```javascript
function setDatabase(database) {
    db = database;
    
    // Initialize all modules with dependencies
    gameModule.setDatabase(database);
    movementModule.setDependencies(database, gameState);
    broadcastModule.setGameState(gameState);
    databaseModule.setDatabase(database);
    
    // ... rest of setDatabase
}
```

### Step 3: Replace Function Calls Throughout server.js

#### Utility Functions
```javascript
// BEFORE:
const parsed = parsePositiveInt(value, fallback);
const sector = parseSectorToken(parts[1]);
const token = formatSectorToken(sectorId);
const adjacent = getAdjacentSectorIds(targetSector);
const isAdjacent = areAdjacentSectors(sector1, sector2);
const mode = normalizeMode(data);
const difficulty = normalizeAiDifficulty(raw);
const strategy = normalizeAiStrategy(raw);
const race = getRaceById(raceId);
const hashed = hashPassword(password, salt);
const salt = generateSalt();
const key = generateTempKey();

// AFTER:
const parsed = utilsModule.parsePositiveInt(value, fallback);
const sector = utilsModule.parseSectorToken(parts[1]);
const token = utilsModule.formatSectorToken(sectorId);
const adjacent = utilsModule.getAdjacentSectorIds(targetSector);
const isAdjacent = utilsModule.areAdjacentSectors(sector1, sector2);
const mode = utilsModule.normalizeMode(data);
const difficulty = utilsModule.normalizeAiDifficulty(raw);
const strategy = utilsModule.normalizeAiStrategy(raw);
const race = utilsModule.getRaceById(raceId);
const hashed = utilsModule.hashPassword(password, salt);
const salt = utilsModule.generateSalt();
const key = utilsModule.generateTempKey();
```

#### Game Module
```javascript
// BEFORE:
createGameTables(gameId, callback);
ensurePlayerTableColumns(gameId, callback);
ensureGamesModeColumn();

// AFTER:
gameModule.createGameTables(gameId, callback);
gameModule.ensurePlayerTableColumns(gameId, callback);
gameModule.ensureGamesModeColumn();
```

#### Movement Module
```javascript
// BEFORE:
canPlayerSeeSector(gameId, playerId, sectorId, callback);
markSectorExplored(gameId, playerId, sectorId);
updateSector2(gameId, sectorId);
probeSector(data, connection);
moveFleet(data, connection);
preMoveFleet(data, connection);
sendMultiMoveOptions(connection, gameId, targetSector);

// AFTER:
movementModule.canPlayerSeeSector(gameId, playerId, sectorId, callback);
movementModule.markSectorExplored(gameId, playerId, sectorId);
movementModule.updateSector2(gameId, sectorId);
movementModule.probeSector(data, connection);
movementModule.moveFleet(data, connection);
movementModule.preMoveFleet(data, connection);
movementModule.sendMultiMoveOptions(connection, gameId, targetSector);
```

#### Broadcast Module
```javascript
// BEFORE:
broadcastToGame(gameId, message);
broadcastPlayerList(gameId);
notifyPlayer(playerId, message);
sendJoinSuccess(connection, game, raceId, playerCount);

// AFTER:
broadcastModule.broadcastToGame(gameId, message);
broadcastModule.broadcastPlayerList(gameId);
broadcastModule.notifyPlayer(playerId, message);
broadcastModule.sendJoinSuccess(connection, game, raceId, playerCount);
```

#### Database Module
```javascript
// BEFORE:
queryDb(sql, params);
getPlayerData(gameId, playerId);
updatePlayerResources(gameId, playerId, metal, crystal, research);
getShipsInSector(gameId, sectorId);
getPlayerShips(gameId, playerId);
moveShips(gameId, shipIds, toSectorId);
createShip(gameId, playerId, shipType, sectorId);

// AFTER:
databaseModule.queryDb(sql, params);
databaseModule.getPlayerData(gameId, playerId);
databaseModule.updatePlayerResources(gameId, playerId, metal, crystal, research);
databaseModule.getShipsInSector(gameId, sectorId);
databaseModule.getPlayerShips(gameId, playerId);
databaseModule.moveShips(gameId, shipIds, toSectorId);
databaseModule.createShip(gameId, playerId, shipType, sectorId);
```

#### Config Constants
```javascript
// BEFORE:
const limit = GAME_LIST_LIMIT;
const costs = BUILDING_COSTS;
const speeds = TURN_SPEEDS_MS;

// AFTER:
const limit = configConstants.GAME_LIST_LIMIT;
const costs = configConstants.BUILDING_COSTS;
const speeds = configConstants.TURN_SPEEDS_MS;
```

## Implementation Strategy

### Approach A: Big Bang (Riskier)
Replace all function calls at once. This is faster but harder to debug if something breaks.

### Approach B: Gradual (Safer - RECOMMENDED)
1. Start with utility functions (lowest risk)
2. Test with `npm test`
3. Then game module
4. Test again
5. Then movement module
6. Test again
7. Continue with other modules
8. Full test suite before deployment

## Validation Checklist

After each module integration:
- [ ] No syntax errors when starting server
- [ ] Server connects to database
- [ ] WebSocket connections work
- [ ] Test suite passes: `npm test`
- [ ] Can create a game
- [ ] Can join a game
- [ ] Can move fleets
- [ ] Can see sector updates

## Rollback Plan

If integration breaks something:

1. **If syntax error**: Check the specific function call format
2. **If runtime error**: Verify module dependencies are initialized
3. **If test failure**: The test error will show which module has the issue

To rollback completely, simply remove all the module requires and re-add the functions inline to server.js. The extracted functions are identical, so no logic changes were made.

## Notes

- Module functions are 100% identical to original implementations
- All dependencies are injected during initialization
- Database connection is shared via setDatabase calls
- gameState is passed explicitly to modules that need it
- No circular dependencies
- No global state modifications beyond what server.js already does

## Success Criteria

Phase 1 is complete when:
- [x] All modules created with extracted functions
- [ ] All modules integrated into server.js
- [ ] Full test suite passes
- [ ] No functional changes verified
- [ ] Code deployed to production successfully
- [ ] Zero user-facing changes

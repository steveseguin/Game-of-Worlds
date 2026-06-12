# Phase 1 Migration Checklist
# Code Reorganization - Safe Folder Structure

## Status: IN PROGRESS

This checklist tracks the code reorganization work. Each module is created as a stub and functions are extracted from server.js with zero logic changes.

## Created Modules ✓

### Core Modules
- [x] `lib/utils/index.js` - Parsing, normalization, crypto, grid utilities
- [x] `lib/game/index.js` - Game initialization and lifecycle
- [x] `lib/movement/index.js` - Fleet movement, exploration, visibility
- [x] `lib/broadcast/index.js` - Notifications and game broadcasts
- [x] `lib/database/index.js` - Database operation helpers
- [x] `lib/config/constants.js` - Game configuration constants

### In Progress
- [ ] `lib/handlers/index.js` - WebSocket message handlers (stub created)
- [ ] `lib/player/index.js` - Player actions and AI management

### To Create
- [ ] `lib/map/operations.js` - Map-specific operations
- [ ] `lib/combat/telemetry.js` - Combat telemetry extraction

## Function Migration Status

### lib/utils/index.js ✓
- [x] parsePositiveInt
- [x] parseSectorToken
- [x] formatSectorToken
- [x] safeDecodeURIComponent
- [x] normalizeMode
- [x] normalizeAiDifficulty
- [x] normalizeAiStrategy
- [x] getRaceById
- [x] hashPassword
- [x] generateSalt
- [x] generateTempKey
- [x] getAdjacentSectorIds
- [x] areAdjacentSectors

### lib/game/index.js ✓
- [x] setDatabase
- [x] ensureGamesModeColumn
- [x] createGameTables
- [x] ensurePlayerTableColumns

### lib/movement/index.js ✓
- [x] areAdjacentSectors
- [x] canPlayerSeeSector
- [x] markSectorExplored
- [x] updateSector2
- [x] updateSector
- [x] probeSector
- [x] moveFleet
- [x] preMoveFleet
- [x] surroundShips
- [x] sendMultiMoveOptions

### lib/broadcast/index.js ✓
- [x] broadcastToGame
- [x] broadcastPlayerList
- [x] notifyPlayer
- [x] sendJoinSuccess

### lib/database/index.js ✓
- [x] queryDb
- [x] getPlayerData
- [x] updatePlayerResources
- [x] getShipsInSector
- [x] getPlayerShips
- [x] moveShips
- [x] createShip
- [x] deleteShips
- [x] getBuildingsInSector
- [x] getPlayerBuildings
- [x] getSector
- [x] updateSectorOwner
- [x] isExplored

### lib/handlers/index.js - TODO
- [ ] handleCreateGame
- [ ] handleGameList
- [ ] handleGameStart
- [ ] handleJoinGame
- [ ] handleChangeRace
- [ ] handleLeaveGame
- [ ] handleAddAi
- [ ] handleSurrender
- [ ] handleGetCombatTelemetry
- [ ] handleGetUnlockedRaces
- [ ] handleGetCurrentGame
- [ ] handleLogin
- [ ] handleRegister

### lib/player/index.js - TODO
- [ ] buyShip
- [ ] buyBuilding
- [ ] buyTech
- [ ] colonizePlanet
- [ ] createAiUser
- [ ] getUserStats

### Combat Telemetry - TODO
- [ ] createEmptyShipTypeCounterMap
- [ ] createPlayerTelemetryRecord
- [ ] getOrCreateGameTelemetryRecord
- [ ] getOrCreatePlayerTelemetryRecord
- [ ] getTypeMetric
- [ ] addSideTelemetryToPlayerRecord
- [ ] deriveTopShipTelemetry
- [ ] formatShipTelemetryHint
- [ ] recordCombatTelemetry
- [ ] buildShipTelemetryView
- [ ] getCombatTelemetrySnapshot
- [ ] getPlayerBattleProfile

### Turn Management - TODO
- [ ] startTurnTimer
- [ ] processTurn
- [ ] updateResources
- [ ] updateAllSectors

## Next Steps

1. **Create lib/handlers/index.js** - Extract all WebSocket message handlers
2. **Create lib/player/index.js** - Extract player action handlers
3. **Update server.js imports** - Replace inline function calls with module imports
4. **Run full test suite** - Ensure zero functional changes
5. **Deploy to production** - Test on live server
6. **Commit to git** - Save this reorganization as a baseline

## Key Architectural Notes

- All modules use dependency injection (setDependencies, setDatabase, setGameState)
- No circular dependencies
- Each module is self-contained but can access shared dependencies
- Test infrastructure remains unchanged
- Zero logic changes in Phase 1

## Risk Assessment: MINIMAL

- Pure code movement - no logic changes
- All existing tests should pass
- If any function breaks, it's a simple syntax issue in the migration
- Can easily revert by removing module imports and going back to inline functions

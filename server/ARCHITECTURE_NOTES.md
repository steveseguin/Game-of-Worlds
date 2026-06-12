# Game of Worlds - Architecture & Organization

## Current Status

**server.js** is a monolithic 3,053-line file with 82 functions handling 11 different domains.

### Problems
- Hard to locate code (82 functions in one file!)
- Difficult to add new mechanics (must modify huge file)
- Cannot test individual features in isolation
- Self-referential dependencies scattered throughout
- Adding hazard mechanics requires navigating huge file

### Target State
- Clear separation of concerns (one domain = one module)
- Hazard mechanics centralized in `movement/hazards.js`
- Easy to test, modify, and extend
- Self-documenting architecture

## Proposed Structure

See CODE_ORGANIZATION_ANALYSIS.md for detailed structure.

### Key Insight
The folder structure should mirror the game design:
- Player wants to move fleet? Look in `movement/`
- Hazard destroyed fleet? Look in `movement/hazards.js`
- Want to build ships? Look in `player/construction.js`
- Want to explore? Look in `movement/exploration.js`

## Implementation Phases

### Phase 1: Safe Reorganization (Code movement only)
- Create new folder structure
- Move functions (ZERO logic changes)
- Update imports
- Run full test suite
- Commit and deploy

### Phase 2: Hazard Mechanics (Add original personality)
- Create `movement/hazards.js`
- Implement black hole destruction
- Implement asteroid belt damage
- Implement probe destruction mechanics
- Restore narrative messaging

### Phase 3: Cleanup (Extract handlers and utilities)
- Extract WebSocket handlers to `handlers/`
- Extract database layer to `database/`
- Extract utilities to `utils/`
- Reduce server.js to routing layer only

## Risk Mitigation

- Phase 1 has ZERO functional risk (pure code movement)
- Each phase can be tested independently
- Easy to rollback if issues arise
- Existing lib modules remain unchanged
- Run full test suite after each phase

## Benefits

1. **Maintainability**: Know where each piece lives
2. **Testability**: Can test hazards without full game context
3. **Scalability**: Easy to add new mechanics
4. **Documentation**: Structure documents itself
5. **Personality**: Hazard mechanics grouped together, making original design obvious


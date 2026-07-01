# Turn Engine

Primary source: `server/server.js`.

## Start Path

```mermaid
flowchart TD
  StartCmd[//start] --> HandleStart[handleGameStart]
  HandleStart --> LoadGame[Load game row and validate creator]
  LoadGame --> Initialize[initializeGame]
  Initialize --> Map[Generate/remember map size]
  Initialize --> Players[Create player starts and homeworlds]
  Initialize --> Buildings[Add starting buildings]
  Initialize --> Timer[startTurnTimer]
  Timer --> Broadcast[startgame + newturn + state sync]
```

## Timer Path

`startTurnTimer(gameId)` stores an interval in `gameState.gameTimer[gameId]`. The interval calls `processTurn(gameId)` on the cadence for the game mode:

- `quick`: default 3 minutes.
- `epic`: default 24 hours.
- `test`: default 30 seconds when test mode is enabled.

## Process Turn

High-level turn flow:

1. Skip/return if a battle pause is active.
2. Confirm the game should continue with `shouldProcessTurn()`.
3. Increment and persist the turn.
4. Compute and write income for each player.
5. Apply standing orders.
6. Trigger AI actions.
7. Process battles.
8. Check victory.
9. Broadcast `newturn::<turn>` and refreshed player state.

## Battle Pause

Battles are resolved server-side, but playback needs time on clients. The server:

1. Computes playback duration with `computeBattlePlaybackMs()`.
2. Broadcasts `battlepause::<freezeMs>::<playbackMs>`.
3. Stores `gameState.battlePause[gameId]`.
4. Suspends turn progression while `isBattlePauseActive(gameId)` is true.
5. Restarts normal cadence after the pause.

## Movement And Arrival

Movement path:

```mermaid
flowchart TD
  Move[//move or //sendmmf] --> Validate[Validate sector tokens, adjacency/warp, fleet counts]
  Validate --> Cost[Calculate crystal movement cost]
  Cost --> MoveRows[Update ships sectorid]
  MoveRows --> Arrival[applyArrivalEffects]
  Arrival --> Hazards[Black hole / asteroid / ownership / terraform]
  Hazards --> Battle[processBattles]
  Battle --> Sync[updateSector2 + fleetmove + alerts]
```

Important arrival rules:

- Black hole sector type `2`: destroys all entering ships.
- Asteroid sector type `1`: random damage unless player owns the sector.
- Unowned asteroid can be secured by surviving ships.
- Unowned colonizable worlds require colony ship and terraform level.
- Enemy co-location triggers battle resolution.

## AI And Standing Orders

- AI profiles are tracked in `activeGames[gameId].aiProfiles`.
- `triggerAiTurn()` loads AI players and calls `runAiActions()`.
- AI behavior covers basic economy, scout/colony production, expansion, aggressive harassment, research, and defense.
- Standing orders are per player in runtime state and can auto-rebuild economy/scouts.

## Failure Modes To Watch

- Timer leaks when games are abandoned or completed.
- State divergence between `users.currentgame`, `connection.gameid`, and `players<gameId>`.
- Dynamic SQL table suffixes built from unvalidated game ids.
- Client parser missing a new server message prefix.
- Battle pause failing to resume the timer.

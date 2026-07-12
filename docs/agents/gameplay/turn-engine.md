# Turn Engine

Primary source: `server/server.js`.

For the detailed code-order map, including async boundaries and terminal cleanup requirements, see `turn-resolution-flow.md`.

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

It also records `activeGames[gameId].turnEndsAt` and publishes `turnclock::<turn>::<endsAt>::<durationSeconds>`. The client counts down from the epoch deadline instead of decrementing an assumed 180-second value, so epic/test games, background tabs, reconnects, and battle-clock restarts show server time.

`processingTurns` coalesces a timer tick and an all-humans-ready trigger for the whole resolution window. If the player table cannot be read, the turn pauses instead of incrementing runtime state without persistence. Mutating commands are rejected while resolution is active, and clients render the `turnphase::` freeze instead of offering orders against a half-resolved turn.

## Process Turn

High-level turn flow:

1. Skip/return if a battle pause is active.
2. Confirm the game should continue with `shouldProcessTurn()`.
3. Increment and persist the turn.
4. Clear manual "done early" readiness flags.
5. Trigger AI actions.
6. Apply standing orders.
7. Await income calculations and guarded resource writes for every player.
8. Await all detected battle resolutions.
9. Await victory checks and terminal bookkeeping when a winner exists.
10. Clear the persisted resolution marker.
11. Broadcast `newturn::<turn>` only for a still-active game.
12. Publish the next authoritative `turnclock::` deadline.

`games.turn_phase` and `games.turn_phase_turn` record recoverable phase boundaries. `playersN.last_automation_turn` reserves each player's automation before it runs, preventing AI or standing orders from spending twice after a restart. This is intentionally at-most-once: a hard crash after reservation can skip the rest of that player's automation for one turn, which is safer than duplicating purchases or moves. `playersN.last_income_turn` makes income idempotent, so an income retry or process restart cannot pay the same player twice. A failed phase sends `turnphase::failed`, keeps orders frozen, and retries the recorded phase. Completed phases are not replayed during an in-process retry.

## Manual End Turn

Players can end a turn early with the `//start` command while already in an active game. The server records readiness in `activeGames[gameId].turnReady` and broadcasts:

```text
turnready::<readyHumanCount>::<humanCount>
```

When all human players are ready, `processTurn(gameId)` runs immediately instead of waiting for the interval.

## Continue/Abandon Checks

`shouldProcessTurn(gameId)` prevents runaway games:

- Abandons games with no player rows.
- Abandons games with no human players.
- Abandons stale active games after the configured no-human-activity turn count.
- Abandons solo sandbox/test games at the configured max turn.
- Skips active games whose battle pause is still running.

## Battle Pause

Battles are resolved server-side, but playback needs time on clients. The server:

1. Computes playback duration with `computeBattlePlaybackMs()`.
2. Broadcasts `battlepause::<freezeMs>::<playbackMs>`.
3. Stores `gameState.battlePause[gameId]`.
4. Suspends turn progression while `isBattlePauseActive(gameId)` is true.
5. Restarts normal cadence after the pause.

Completed and abandoned games must clear `gameState.battlePause[gameId]` immediately, not wait for the pause timeout to expire.

## Movement And Arrival

Movement path:

```mermaid
flowchart TD
  Move[//move or //sendmmf] --> Validate[Validate sector tokens, adjacency/warp, fleet counts]
  Validate --> Cost[Calculate crystal movement cost]
  Cost --> Charge[Guarded crystal deduction]
  Charge --> MoveRows[Guarded full-fleet update]
  MoveRows -->|stale/partial| Rollback[Restore ships + refund]
  MoveRows -->|complete| Arrival[applyArrivalEffects]
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
- Economic/resource victory timing changing because income writes are asynchronous.
- A hard process loss in the middle of one battle's multi-query survivor replacement is still not a database transaction; the persisted phase lets startup revisit conflicts, but this is not equivalent to atomic combat persistence.

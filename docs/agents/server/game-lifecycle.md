# Game Lifecycle And Cleanup

Primary sources: `server/index.js`, `server/server.js`, `server/lib/victory.js`.

This document tracks the server-side transitions that attach a user to a game, detach them, or terminate the game. Keep it in sync with `users.currentgame`, `connection.gameid`, and `gameState.activeGames` behavior.

## Connection Ownership

```mermaid
flowchart TD
  Socket[WebSocket accepted] --> Unknown[connection.name = unknown]
  Unknown --> Auth[//auth:userId:tempKey]
  Auth --> Map[clientMap[userId] = connection]
  Map --> Current{users.currentgame?}
  Current -->|yes| Snapshot[handleCurrentGame]
  Current -->|no| Lobby[lobby:: + gamelist::]
  Snapshot --> Started[restore runtime if started]
  Snapshot --> State[connection.gameid + raceid set]
```

`clientMap` is a last-writer-wins pointer to the current socket for a user id. Closing an older socket must not delete a newer reconnect's map entry. The close handler therefore only clears `clientMap[connection.name]` when it still points to that exact socket.

## Current Game Snapshot

`handleCurrentGame()` sends either:

```text
currentgame::null
```

or:

```json
{
  "gameId": 1,
  "gameName": "Room name",
  "maxPlayers": 4,
  "playerCount": 2,
  "creatorId": 10,
  "raceId": 1,
  "raceName": "Terran",
  "mode": "quick",
  "registeredOnly": false,
  "minLevel": 0,
  "turn": 1,
  "turnEndsAt": 1770000000000,
  "turnSeconds": 142,
  "battlePauseUntil": null,
  "started": true,
  "status": "in-progress"
}
```

If `users.currentgame` points at a missing game or a game where the user no longer has a `players<gameId>` row, the server clears the stale pointer and returns `currentgame::null`.

For started games, `sendCurrentGameSnapshot()` calls `restoreStartedGameRuntime()` before returning the payload. This rehydrates `activeGames`, turn counters, map size, AI profiles, standing orders, and timers if needed.

## Waiting Game Lifecycle

```mermaid
flowchart TD
  Create[//creategame] --> GameRow[games row]
  GameRow --> Tables[createGameTables]
  Tables --> Created[creategame::success::gameId]
  Created --> HostJoin[creator sends //joingame]
  HostJoin --> Join[players/AI join]
  Join --> Leave[//leavegame before start]
  Leave --> Empty{no players left?}
  Empty -->|yes| Delete[deleteWaitingGame]
  Delete --> Drop[drop per-game tables + delete games row]
  Empty -->|no| Reassign[reassign creator if needed]
  Join --> Start[creator //start]
```

`//creategame` creates the room row and per-game tables but does not seat the creator. The creator joins through the same `//joingame:<gameId>:<raceId>` path as everyone else; this keeps race unlock and seat-count logic centralized.

Pending human joins and AI additions reserve lobby seats before their `playersN` insert is visible. The creator cannot start while one of these lobby mutations is still in flight. This prevents over-capacity rooms and ensures every accepted player is included in homeworld assignment.

Waiting games are disposable. If the last seated player leaves before start, the server drops per-game tables and deletes the `games` row.

## Active Leave And Surrender

Active `//leavegame` and active `//surrender` are intentionally different:

| Action | Server behavior |
| --- | --- |
| `//leavegame` in an active game | Removes the player row, clears `users.currentgame`, deletes that player's ships/buildings/sector ownership, and keeps the game running if any human remains. |
| `//surrender` with one remaining human | Broadcasts `gameover::<winnerId>::Surrender`, marks the game completed, records history/stats, clears runtime state and reconnect pointers. |
| `//surrender` with multiple remaining players | Removes only the surrendering player and their empire, sends that player `gameover::::Surrendered`, reassigns creator if needed, and broadcasts player/map updates to remaining players. |
| `//surrender` with no remaining humans | Removes the player, sends no-human feedback, and abandons the game. |

Surrender removes the player's id from `activeGames[gameId].turnReady` so a removed player cannot block or accidentally satisfy manual end-turn readiness.

The active game screen deliberately labels its navigation action **Lobby** and only changes pages. It preserves the player row, empire, current-game pointer, and ability to resume. Destructive departure is exposed in the lobby as the confirmed **Resign** action, which sends `//surrender`. Do not reconnect the game-screen navigation button to `//leavegame`.

## Terminal States

Completed games use `victorySystem.endGame()`:

1. Mark runtime status completed.
2. Update `games.status = "completed"` and `games.winner`.
3. Calculate scores.
4. Insert `game_history`.
5. Update `user_stats`.
6. Run `cleanupGame()`.

`cleanupGame()` stops the timer, clears any `battlePause` timeout/entry, deletes `activeGames[gameId]` and `turns[gameId]`, clears `users.currentgame` for the game, and detaches connected clients from the game. The caller sends `gameover::` before cleanup.

Abandoned games use `abandonGame()`:

1. Stop runtime with `stopGameRuntime()`; this clears turn timers, battle-pause timers, turns, and active runtime state.
2. Set `games.status = "abandoned"` and `winner = NULL`.
3. Clear `users.currentgame`.
4. Send `gameover::::<reason>` to connected clients in that game.
5. Clear each affected connection's `gameid` and `raceid`.

## Contributor Checks

- Every path that removes a player from an active game should clear `users.currentgame`, `connection.gameid`, and `connection.raceid`.
- Every path that removes an active player's empire should call `removePlayerEmpire()` or an equivalent cleanup.
- Terminal game paths must stop timers, clear `battlePause[gameId]`, and delete `activeGames[gameId]`.
- Reconnect changes must preserve the `clientMap[userId] === connection` close-guard invariant.
- Any new game-over path should state whether it is completed, abandoned, or a player-only exit.

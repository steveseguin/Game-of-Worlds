# State Model

Primary source: `server/server.js` `gameState` plus MySQL tables.

## Runtime State

`server/server.js` exports and shares:

```js
const gameState = {
  clients: [],
  clientMap: {},
  gameTimer: {},
  turns: {},
  activeGames: {},
  battlePause: {}
};
```

| Field | Owner | Meaning |
| --- | --- | --- |
| `clients` | WebSocket layer | All connected WebSocket connections. |
| `clientMap` | Auth layer | User id -> current connection. |
| `gameTimer` | Turn engine | Game id -> interval handle. |
| `turns` | Turn engine | Game id -> current turn number. |
| `activeGames` | Lobby/turn engine | Runtime metadata: mode, status, creator, AI profiles, standing orders, readiness, map size. |
| `battlePause` | Combat/turn engine | Game id -> pause timer while battle playback is shown. |

Runtime state is reconstructed on process start by `resumeActiveGamesFromDatabase()`, which loads started games and restarts turn timers when human players remain.

See `docs/agents/server/persistence.md` for table schema and lifecycle details.

## Persistent State

Core global tables:

| Table | Purpose |
| --- | --- |
| `users` | Account, guest identity, tempKey, current game. |
| `user_stats` | Progression and unlock stats. |
| `games` | Lobby/game row, creator, max players, status, started flag, mode, map size, turn. |
| payment tables | Premium purchases, transactions, subscriptions, crystal balance. |

Per-game tables are suffixed with the numeric game id:

| Table Pattern | Purpose |
| --- | --- |
| `players<gameId>` | Player resources, race, tech CSV, homeworld/current sector, AI flags. |
| `map<gameId>` | Sector type, owner, resources, terraform requirement, artifacts. |
| `ships<gameId>` | Individual ships by owner, type, sector. |
| `buildings<gameId>` | Buildings by owner, sector, type. |
| `explored_sectors<gameId>` | Fog-of-war memory per player. |
| `wonders<gameId>` | Victory/achievement structures. |

## Client State

The client stores local rendering and selection state in `public/js/connect.js`, `GUI.js`, and related game UI modules. Server remains authoritative for resources, sector ownership, ships, buildings, tech, victory, and turns. Sector ownership is broader than world ownership: empty routes and secured asteroids can have `map<gameId>.owner`, but elimination requires the candidate to own at least one sector type `6-10` and every opponent to own none.

## State Transitions

```mermaid
stateDiagram-v2
  [*] --> GuestOrRegistered
  GuestOrRegistered --> Lobby: login + WebSocket auth
  Lobby --> WaitingGame: create or join
  WaitingGame --> ActiveGame: creator starts
  ActiveGame --> BattlePaused: battle resolves and playback starts
  BattlePaused --> ActiveGame: pause expires
  ActiveGame --> Completed: victory condition
  ActiveGame --> Abandoned: no humans or stale solo game
  WaitingGame --> Lobby: leave or room deleted
  Completed --> Lobby
  Abandoned --> Lobby
```

## Invariants To Preserve

- A WebSocket connection must authenticate before any command handler can mutate game state.
- Dynamic table names must only use server-validated numeric game ids.
- `users.currentgame` and `connection.gameid` should agree after join/reconnect and be cleared on leave/abandon where possible.
- A game timer should exist for each active started game, except during shutdown or immediate abandonment.
- Battle playback pauses the turn clock by using `battlePause`; do not advance turns while `isBattlePauseActive(gameId)` is true.
- Fog-of-war writes to `explored_sectors<gameId>` and should prevent hidden sectors from leaking through `sector::` or `mapstate::`.
- Production `/status.deploy.dirty` should be `false`; a dirty deploy indicates generated/tracked files or wrong checkout state in CI.
- `activeGames[gameId].turnReady` must be cleared after each processed turn.
- `activeGames[gameId].lastHumanActivityTurn` should advance when humans send authenticated game commands, otherwise stale-game abandonment can fire too aggressively.

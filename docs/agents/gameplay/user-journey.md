# User Journey

Primary sources: `public/js/lobby.js`, `public/js/connect.js`, `server/index.js`, `server/server.js`.

## New Or Returning Player

1. Browser loads `/landing.html` or `/login.html`.
2. Player registers, logs in, or continues as guest.
3. HTTP auth returns `userId`, `username`, `tempKey`, and guest metadata.
4. Browser stores auth cookies/local state and opens WebSocket.
5. First WebSocket message is `//auth:<userId>:<tempKey>`.
6. Server verifies `users.tempkey`.
7. If `users.currentgame` exists, server sends `currentgame::...`; otherwise it sends `lobby::` and `gamelist::...`.

## Lobby Flow

```mermaid
sequenceDiagram
  participant Player
  participant Lobby as public/js/lobby.js
  participant Server as server/server.js
  Player->>Lobby: Create game
  Lobby->>Server: //creategame:name:max:mode:registeredOnly:minLevel
  Server-->>Lobby: creategame::success::gameId
  Player->>Lobby: Join/select race
  Lobby->>Server: //joingame:gameId:raceId
  Server-->>Lobby: joingame::success::{...}
  Player->>Lobby: Add AI if wanted
  Lobby->>Server: //addai:difficulty:strategy
  Lobby->>Server: //start
  Server->>Server: initializeGame()
  Server-->>Lobby: startgame::
```

Lobby guardrails:

- Creating a room does not seat the creator; the host must still join via `//joingame`.
- Guests cannot create registered-only rooms.
- Non-creators cannot bypass registered-only or minimum-level gates.
- AI seats can only be added by the creator before game start.
- Race selection is checked against unlocks before join/change.

## Active Game Flow

1. `initializeGame()` creates/updates map, homeworlds, starting buildings, starting resources, and ships.
2. Server sends:
   - `startgame::`
   - `newturn::<turn>`
   - `mapconfig::<width>::<height>`
   - `mapstate::...`
   - `resources::...`
   - `techstate::...`
   - `empire::...`
   - `victoryprogress::...`
3. Player explores, probes, buys tech/buildings/ships, moves fleets, colonizes, and fights.
4. Each turn, `processTurn()` validates the game should continue, increments the turn, clears early-ready flags, triggers AI and standing orders, schedules income writes, processes battles, checks victory, and broadcasts `newturn::`.

## Exploration Decisions

The intended core personality is risk/reward:

- Probe first: costs 300 crystal and can be destroyed by dangerous sectors or counter-intel, but avoids fleet risk.
- Move blind: faster and sometimes necessary, but black holes destroy fleets and unowned asteroid belts damage ships.
- Secure routes: owned asteroid belts become safe transit points.
- Colonize: colony ships settle unowned worlds if terraform requirements are met.

## End States

Games can end by:

- Victory condition from `server/lib/victory.js`.
- Surrender or elimination.
- No human players remain.
- Solo sandbox or stale-human limits.

End-state cleanup should stop timers, update `games.status`, notify clients, and clear current-game pointers where appropriate.

## Contributor Journey

For local development on Windows, macOS, or Linux:

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Use `USE_MOCK_DB=true` for local development without MySQL.
4. Run `npm run dev:mock`.
5. Open `http://localhost:3000/login.html`.
6. Run `npm test`, `npm run test:integration`, and targeted `npm run test:e2e -- <spec>` before changing shared gameplay flow.

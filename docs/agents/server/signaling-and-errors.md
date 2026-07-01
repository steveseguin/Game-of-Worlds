# Signaling And Errors

Primary sources:

- `server/index.js` WebSocket request/auth/dispatch
- `server/server.js` command handlers
- `public/js/lobby.js` lobby parser
- `public/js/connect.js` game parser

## Dispatch Contract

Every WebSocket connection starts unauthenticated:

1. Server accepts the socket and sets `connection.name = 'unknown'`.
2. First client message must be `//auth:<userId>:<tempKey>`.
3. `authUser()` loads `users.tempkey` and timing-safe compares it with the cookie/local credential.
4. On success, the server sets `connection.name`, `connection.gameid`, updates `clientMap`, and sends either lobby or active-game bootstrap messages.
5. After auth, messages beginning with `//` route through `handleCommand()`.
6. Messages not beginning with `//` are treated as chat and broadcast to the sender's current game.

Unknown commands return:

```text
Unknown command: <command>
```

Handlers mostly return user-facing strings instead of structured JSON over WebSocket. Client code treats many plain `Error:` and `Success:` strings as chat/status feed messages, so do not change those prefixes casually.

## HTTP Error Shape

Auth HTTP handlers return JSON:

| Condition | Status | Body |
| --- | --- | --- |
| Malformed JSON | `400` | `{ "error": "Invalid request" }` |
| JSON body over 16 KB | `413` | `{ "error": "Request body too large" }` |
| Validation failure | `400` | `{ "error": "<specific validation message>" }` |
| Bad login | `401` | `{ "error": "Invalid username or password" }` |
| DB failure | `500` | `{ "error": "Database error" }` |

Payment endpoints are JSON HTTP APIs and should fail closed with explicit errors when payments are disabled.

## WebSocket Error Families

| Family | Examples | Client behavior |
| --- | --- | --- |
| Plain `Error:` | `Error: Not enough resources`, `Error: Invalid sector` | Game client shows status/chat/advisor feedback; lobby client shows toast. |
| Plain `Success:` | `Success: Built Scout`, `Success: Colonized sector 8` | Game feed/advisor text; often followed by resource/map refresh. |
| Structured lobby errors | `creategame::error::...`, `joingame::error::...`, `changerace::error::...`, `addai::error::...` | Lobby toast and UI recovery. |
| Standing orders | `standingorders::error::...`, `standingorders::noop` | Game order feed or notification. |
| Game end | `gameover::<winnerId>::<reason>` or `gameover::::<reason>` | Opens game-over modal and clears/returns state. |

## Bootstrap Message Sets

After successful auth with no current game:

```text
lobby::
gamelist::<rows>
```

After reconnecting to an active game:

```text
currentgame::<json>
resources::<metal>::<crystal>::<research>
techstate::<json>
empire::<json>
victoryprogress::<json>
mapconfig::<width>::<height>
mapstate::<csv>
```

If the reconnect pointer is stale, the server sends `currentgame::null`, clears `users.currentgame`, and returns the player to lobby/game-list flow.

After game start:

```text
The game has started!
startgame::
newturn::<turn>
```

Clients then request `//update` and `//victoryprogress` for full state.

## Message Prefix Inventory

Keep this list in sync when touching server sends or client parsers.

| Prefix | Current purpose |
| --- | --- |
| `$^$` | Connected socket count. |
| `countdown::` | Start countdown and cancellation. |
| `lobby::` | Client should render/return to lobby. |
| `gamelist::` | Waiting game rows. |
| `currentgame::` | Current game snapshot or `null`. |
| `creategame::success::`, `creategame::error::` | Create-game result. |
| `joingame::success::`, `joingame::error::` | Join result. |
| `changerace::success::`, `changerace::error::` | Race-selection result. |
| `addai::success::`, `addai::error::` | AI seat result. |
| `races::` | Unlocked race data. |
| `pl:` | Player list payload. |
| `startgame::` | Move to active game UI. |
| `turnready::` | Manual end-turn readiness count. |
| `newturn::` | Turn advanced. |
| `resources::` | Player resource totals. |
| `techstate::` | Canonical tech state. |
| `empire::` | Economy/world/fleet summary. |
| `victoryprogress::` | Active victory progress. |
| `mapconfig::` | Map dimensions. |
| `mapstate::` | Fog-aware map state rows. |
| `sector::` | Sector detail payload. |
| `probeonly:` | Client may offer probe action for hidden/stale sector. |
| `mmoptions:` | Multi-source fleet move choices. |
| `fleetmove::` | Movement animation/event. |
| `battlepause::` | Battle playback freeze budget. |
| `battle::`, `battle:` | Full battle playback payload. |
| `battlereport::`, `battle_summary::` | Combat summary/limited intel. |
| `standingorders::state::`, `standingorders::applied::`, `standingorders::error::`, `standingorders::noop` | Standing-order state and feedback. |
| `systemalert::` | High-priority narrative/system notice. |
| `gameover::` | Completed/abandoned game. |
| `maxbuild::`, `ownsector:`, `fleet:`, `tech:`, `ub:`, `info:` | Legacy/current compatibility messages still parsed by `connect.js`. |

## Contributor Rules

- Prefer adding structured `prefix::json` messages for new behavior.
- Keep old prefixes stable until both lobby and game clients stop parsing them.
- Add a test or E2E assertion whenever a new message prefix controls navigation, resources, combat, or victory.
- Include clear negative feedback for user actions. A no-op command should explain why it did nothing.

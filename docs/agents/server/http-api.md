# HTTP API

Primary source: `server/index.js` routes to handlers in `server/server.js`.

## Public And Runtime Endpoints

| Method | Path | Handler | Purpose |
| --- | --- | --- | --- |
| `GET`/`HEAD` | `/health` | `server/index.js` | Machine health check. Returns runtime, DB, game counts, deploy metadata. |
| `GET`/`HEAD` | `/status` | `server/index.js` | Same payload as `/health`; intended for human/remote deployed-version checks. |
| `GET`/`HEAD` | `/api/status` | `server/index.js` | Alias for status payload. |
| `GET`/`HEAD` | `/debug/deploy` | `server/index.js` | Alias for status payload with deploy metadata included. |
| `GET` | `/config.js` | `server/index.js` | Browser JS globals for Stripe publishable key and feature flags. |
| `GET` | `/api/config` | `server/index.js` | JSON version of public config flags. |
| `GET` | `/js/shop.js` | `server/index.js` | Disabled legacy route. Returns `410`; use `shop-enhanced.js`. |
| `GET` | `/race-selection.js` | `server/index.js` | Legacy compatibility shim for `public/js/race-selection.js`. |

Status payload shape:

```json
{
  "ok": true,
  "status": "ok",
  "service": "game-of-worlds",
  "startedAt": "ISO timestamp",
  "uptimeSeconds": 123,
  "environment": "production",
  "port": 3000,
  "database": {
    "status": "connected",
    "reconnectScheduled": false
  },
  "game": {
    "clients": 0,
    "activeGames": 0,
    "timers": 0,
    "trackedTurns": 0
  },
  "deploy": {
    "source": "github-actions",
    "branch": "master",
    "commit": "full sha",
    "shortCommit": "12-char sha",
    "runId": "GitHub Actions run id",
    "dirty": false
  }
}
```

Health endpoints intentionally return HTTP `200` when the process is alive, even if DB status is `offline`; the JSON `status` becomes `degraded`.

## Auth Endpoints

All auth endpoints accept JSON request bodies capped at 16 KB.

| Method | Path | Handler | Request | Response |
| --- | --- | --- | --- | --- |
| `POST` | `/login` | `handleLogin` | `{ "username": "...", "password": "..." }` | `{ success, userId, username, tempKey, isGuest }` |
| `POST` | `/guest-login` | `handleGuestLogin` | `{ "guestToken"?: "...", "username"?: "..." }` | `{ success, userId, username, tempKey, guestToken, isGuest: true }` |
| `POST` | `/register` | `handleRegister` | `{ "username": "...", "password": "...", "email": "...", "guestToken"?: "..." }` | Creates or upgrades a guest user. |

`tempKey` is the short-lived credential the browser uses in the first WebSocket message: `//auth:<userId>:<tempKey>`.

## User And Game Query Endpoints

| Method | Path | Handler | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/user/:id/current-game` | `handleGetCurrentGame` | Returns current game snapshot for a user id. |
| `GET` | `/api/game/:id/combat-telemetry` | `handleGetCombatTelemetry` | Recent battle/ship telemetry for the game. |
| `GET` | `/api/game/:id/test-map-terrain` | `handleGetTestMapTerrain` | Test/debug terrain output. |

## Payment Endpoints

Payment handlers are routed through `server/lib/payment-endpoints.js` and return `503` when payment manager setup is unavailable.

| Method | Path |
| --- | --- |
| `POST` | `/api/payment/create-intent` |
| `POST` | `/api/payment/create-subscription` |
| `POST` | `/api/payment/webhook` |
| `POST` | `/api/payment/confirm-test` |
| `POST` | `/api/payment/spend-crystals` |
| `GET` | `/api/user/:id/balance` |
| `GET` | `/api/user/:id/owned-items` |
| `GET` | `/api/user/:id/purchase-history` |

## Static And Protected Pages

- `/` serves `public/landing.html`.
- `/index.html` redirects to `/landing.html`.
- `/game.html`, `/lobby.html`, and `/purchase-race.html` require `userId` and `tempKey` cookies that match `users.tempkey`.
- Protected-page and WebSocket tempKey checks use timing-safe comparison.
- All static serving is rooted under `public/` and checks for path traversal before reading files.
- `GET` and `HEAD` static requests share the same file-serving path; `HEAD` returns headers only.

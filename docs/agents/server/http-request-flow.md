# HTTP Request Flow

Primary source: `server/index.js`.

This document maps HTTP request routing before requests reach WebSocket/gameplay handlers.

## Dispatch Order

```mermaid
flowchart TD
  Request[HTTP request] --> Status{GET/HEAD status path?}
  Status -- yes --> StatusPayload[send status JSON]
  Status -- no --> Auth{POST auth path?}
  Auth -- yes --> AuthHandlers[login, guest-login, register]
  Auth -- no --> Payment{payment API path?}
  Payment -- yes --> PaymentHandlers[payment endpoints]
  Payment -- no --> Config{config/generated route?}
  Config -- yes --> MethodGuard[GET/HEAD only]
  MethodGuard --> ConfigResponse[config.js, api/config, legacy shims]
  Config -- no --> GameApi{game/user API path?}
  GameApi -- yes --> ApiHandlers[current-game, telemetry, test terrain]
  GameApi -- no --> StaticMethod{GET/HEAD?}
  StaticMethod -- no --> Method405[405 Allow: GET, HEAD]
  StaticMethod -- yes --> Protected{protected page?}
  Protected -- yes --> CookieCheck[verify userId/tempKey cookies]
  CookieCheck --> ServeProtected[serve or redirect login]
  Protected -- no --> ServeStatic[serve public file]
```

## Generated And Legacy Routes

| Route | Notes |
| --- | --- |
| `/config.js` | Emits browser globals for Stripe publishable key and feature flags. No cache. |
| `/api/config` | JSON version of the same public config. No cache. |
| `/js/shop.js` | Deliberately disabled legacy script; returns `410`. |
| `/race-selection.js` | Compatibility alias for `public/js/race-selection.js`. |

These routes are not ordinary files at their URL path. Keep method handling explicit and test both `GET` and `HEAD` behavior when changing them.

## Static Method Contract

Only `GET` and `HEAD` should serve browser/static content. A non-API `POST` to a static path should return:

```text
405 Method Not Allowed
Allow: GET, HEAD
```

This keeps form/API mistakes from silently receiving HTML or generated JavaScript.

## Protected Page Contract

Protected pages:

- `/game.html`
- `/lobby.html`
- `/purchase-race.html`

The server checks `userId` and `tempKey` cookies against `users.tempkey` with timing-safe comparison. Invalid or missing credentials redirect to `/login.html`. This is not a full session system; the WebSocket still authenticates independently with `//auth:<userId>:<tempKey>`.

## Contributor Checks

- New JSON APIs should be placed before the static method guard.
- New generated browser routes should explicitly handle `GET` and `HEAD`.
- New protected pages should be added to the protected-page list and tested for unauthenticated redirects.
- Keep `server/test-server.js` smoke checks in sync with this dispatch map.

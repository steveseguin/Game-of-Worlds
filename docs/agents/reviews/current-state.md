# Current App And Service State

Last code review update: 2026-07-11. Runtime status must still be verified through production `/health` and `/status` after every release.

Production verification on 2026-07-11 reported service `ok`, database `connected`, a clean checkout, and deployed app commit `1a4fb415c4ee`. Startup also warned that `STRIPE_SECRET_KEY` is configured while `STRIPE_WEBHOOK_SECRET` is missing; core gameplay is healthy, but verified Stripe webhook handling is not production-ready until that secret is supplied.

## Product Shape

Game of Words is a browser-based, simultaneous turn strategy game. The frontend is vanilla JavaScript with a tactical map and WebSocket session. Node owns lobby/game rules; MySQL owns accounts, room rows, per-game map/player/ship/building state, history, and progression. A mock database supports local integration and Playwright journeys.

The current gameplay loop is usable end-to-end: authenticate, create/join, choose race, add AI, start, explore under fog, probe or risk fleets, build, research, colonize, fight, satisfy victory/end conditions, return/resume, or explicitly resign.

## Mode And Runtime Contract

| Area | Current behavior |
| --- | --- |
| Quick | 3-minute default turn cadence. |
| Epic | 24-hour default cadence, larger income multiplier, automation defaults. |
| Test | 30-second default cadence and smaller map when enabled; intended for functional verification. |
| Turn authority | Server timer plus `activeGames.turnEndsAt`; browser renders epoch deadline. |
| Persistence recovery | Started games restore runtime/timers from `games` plus per-game tables after process restart. A restarted timer begins a new full cadence because deadline itself is runtime-only. |
| Battle | Server resolves/persists; clients receive scoped playback or summary; game clock pauses and restarts. |
| Disconnect | Socket loss does not resign. Current-game snapshot restores lobby/game context. |

Environment variables can override turn intervals and mode multipliers; do not hard-code UI assumptions.

## Feature Health

| Surface | State | Evidence/notes |
| --- | --- | --- |
| Login/register/guest/upgrade | Implemented | HTTP validation/rate limits plus E2E guest upgrade/access-gate coverage. |
| Lobby and capacity | Implemented | In-process seat reservations prevent concurrent overfill/start overlap. |
| AI sandbox | Implemented | UI waits for confirmed seats; functional E2E covers fill-and-start. |
| Fog/exploration/hazards | Implemented | Server visibility; probe, asteroid, and black-hole mechanics covered by focused tests/E2E. |
| Movement/warp | Implemented | Whole-order validation, guarded spend, rollback/refund, visible movement events. |
| Economy/build/research | Implemented | Guarded balances/state; construction controls mirror server prerequisites and race cost. |
| Colonization | Implemented | Terraform and colony-ship checks with conditional ownership claim. |
| Combat/theater | Implemented | Race/tech/turret resolution, visibility-scoped reports, clock pause, E2E combat paths. |
| Victory/surrender/cleanup | Implemented | Victory module, explicit resignation, abandonment rules, runtime cleanup tests. |
| Payments | Optional | Stripe-disabled behavior must remain isolated; production availability depends on secrets/webhook configuration. |
| Deploy/observability | Implemented | CI, SSH deployment helper, `/health`, `/status`, deploy commit/dirty metadata verifier. |
| Gameplay integrity oracle | Implemented for tests | Read-only whole-game checks run inside full expansion/combat/victory journeys; no automatic repair path changes gameplay. |

## Test Layers

- `npm test`: Node tests for mechanics, handlers, integrity races, security, runtime, victory, and protocol-supporting behavior.
- `npm run test:integration`: mock HTTP/WebSocket smoke against the actual server entry point.
- `npm run test:e2e`: serial Playwright journeys using the actual browser client and mock server.
- `tests/e2e/gameplay-controls.spec.js`: clock truth/reconnect, construction progression, and AI sandbox coordination.
- `tests/e2e/hostile-workflows.spec.js`: route/auth gates, guest upgrade, safe active-game navigation/resume, explicit resignation.
- `tests/game-invariants.test.js`: deliberately corrupts resources, references, ownership, types, capacity, and terminal runtime to prove detection.
- `tests/shared-rules-sync.test.js`: prevents server/client technology drift and accidental activation of the stale client combat simulator.

## Known Material Risks

1. Turn resolution mixes callbacks and promises; `newturn::` can precede income/combat/victory side effects.
2. Dynamic per-game table names demand validated numeric ids everywhere.
3. The monolithic `server/server.js` increases cross-feature regression risk.
4. Server/client tech definitions are duplicated.
5. TempKey cookies remain bearer-style rather than HTTP-only signed sessions.

The canonical detail and suggested next work live in [risk-register.md](risk-register.md).

## Release Acceptance

A gameplay change is ready only after relevant focused tests, full unit suite, mock integration, and affected E2E journeys pass; documentation/protocol maps match; changes are pushed to a deploy branch; the immediate deployment completes; and public `/health` plus `/status` report a healthy database, clean deploy, and expected commit.

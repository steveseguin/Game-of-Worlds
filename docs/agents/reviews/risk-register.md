# Risk Register

This file records review findings that matter for future work. Keep entries concrete and tied to code paths.

## Fixed In This Pass

| Area | Issue | Change |
| --- | --- | --- |
| Auth body parsing | `/login` and `/register` read unbounded JSON bodies while `/guest-login` had a limit. | Added shared 16 KB JSON body parser and 413 responses for auth endpoints. |
| Security helpers | `validateInteger()` accepted partial strings like `12abc`. | Switched to strict whole-integer parsing and safe-integer checks. |
| Token checks | Session signature compare used normal string equality; CSRF verification could throw on length mismatch. | Added length-safe `crypto.timingSafeEqual()` wrapper. |
| Legacy hazard module | `checkProbeHazard()` formatted `sectorType` as the sector id in messages. | Added optional target sector id and regression tests. |
| Deploy metadata | Manual deploys could report the workflow ref SHA instead of the checked-out deploy ref. | Workflow now captures `git rev-parse HEAD`; deploy metadata uses `DEPLOY_COMMIT`. |
| Action feedback | Server Deploy used bare `curl` checks and minimal failure context. | Added deploy target summary, secret preflight, structured production verifier, and failure summaries. |
| TempKey compare | Protected-page and WebSocket auth compared bearer tempKey strings with direct equality. | Exported and reused timing-safe string comparison. |
| Elimination victory | Elimination treated any owned sector as a surviving planet and did not prove the candidate still owned a world. | Victory checks now require the candidate to own a world type `6-10` and opponents to own none; route markers and secured asteroids do not keep players alive. |
| Reconnect client map | Closing an older socket after reconnect could delete `clientMap[userId]` for the newer socket. | WebSocket close cleanup now removes the map entry only when it still points at the closing connection. |

## Active Risks To Revisit

| Area | Risk | Why It Matters | Suggested Next Move |
| --- | --- | --- | --- |
| `server/server.js` size | Main engine is a large monolith. | Small changes can accidentally affect unrelated gameplay paths. | Extract one bounded area at a time only when tests cover the behavior. |
| Dynamic table names | Per-game SQL tables use `players${gameId}`, `map${gameId}`, etc. | SQL placeholders cannot protect table names, so game ids must stay server-validated integers. | Add helper for validated table names before future persistence work. |
| WebSocket protocol | String prefixes and delimiter parsing are duplicated client/server. | New messages can silently fail if only one parser is updated. | Maintain `docs/agents/server/websocket-protocol.md` and add tests for new prefixes. |
| Auth cookies | Protected pages check `userId` and `tempKey` cookies directly. | It works with current model, but tempKey is bearer-style and not an HTTP-only signed session cookie. | Consider signed session cookies once gameplay flow stabilizes. |
| Legacy docs | Several root deployment docs predate current CI/CD. | Contributors and agents may follow stale deployment instructions. | Gradually archive or rewrite old deployment docs to point at `docs/agents/operations/ci-cd.md`. |
| Tech definitions | Tech tree is duplicated in `server/lib/tech.js` and `public/js/tech.js`. | Divergence can create client/server disagreement. | Add a sync check or generate the client copy from server definitions. |
| Payment surface | Payment endpoints are present but optional. | Stripe config gaps should not break non-payment gameplay. | Keep payment tests isolated and ensure `503` behavior remains explicit when disabled. |
| Turn sequencing | Income writes, standing orders, AI, battle, and victory are mixed callback/async flows in `processTurnUnchecked()`. | Economic-victory and combat-victory timing can be hard to reason about, and broad refactors risk regressions. | Add focused turn sequencing tests before changing this order; eventually make turn processing explicitly awaited. |

## Review Checklist For Gameplay Changes

- Does the change alter a WebSocket command or server message prefix?
- Does it mutate persistent tables and runtime `gameState` consistently?
- Does it require a client parser/UI update?
- Does it preserve fog-of-war and hidden-sector rules?
- Does it affect turn timing, battle pause, or timer cleanup?
- Does it change race, tech, ship, or building balance?
- Does it need a mock DB test and an E2E/harness test?
- Does production `/status` still identify the deployed commit after release?

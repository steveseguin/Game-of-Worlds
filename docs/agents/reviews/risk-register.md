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
| Movement command validation | Partial hex sector tokens, sector `0`, missing move fields, and over-requested ship counts could enter movement/probe paths inconsistently. | Movement/probe validation now rejects malformed sectors before resource writes, documents the CSV/triplet protocols, and verifies the whole requested fleet before moving ships. |
| Terminal battle pause cleanup | Completed or abandoned games could leave a `battlePause` timeout/entry alive until the pause expired. | Terminal cleanup now clears battle-pause timers immediately for both completed and abandoned games. |
| HTTP static method handling | Generated/static browser routes could answer non-GET methods like normal file requests. | Static/generated browser routes now allow only `GET`/`HEAD`; other methods return `405` with `Allow: GET, HEAD`, and smoke tests cover the contract. |
| User/game JSON API authorization | User-id and game-id HTTP APIs returned data when callers guessed ids. | User-scoped APIs now require matching `userId`/`tempKey` cookies; game-scoped APIs require valid cookies plus `playersN` membership. |
| Payment user spoofing | Payment write APIs accepted `userId` from JSON bodies without proving it matched the browser session. | Non-webhook payment APIs now require body/path `userId` to match authenticated cookies and cap JSON bodies at 16 KB. |
| Chat DOM injection hardening | Chat rendered pre-escaped strings with `innerHTML`, making safety depend on caller discipline. | Chat input is bounded/normalized server-side, rate-limited, and rendered with text nodes client-side. |
| Notification DOM injection hardening | Notification and combat-report templates interpolated dynamic strings into `innerHTML`. | Notification text slots now HTML-escape values; combat report labels, sector, and summary lines are escaped before rich modal rendering. |
| Password policy | New accounts could be created with very short passwords. | Registration now requires 8-128 chars with at least one letter and one number; login keeps legacy password compatibility while capping input size. |
| Login brute-force hardening | Login failures could be repeated without endpoint-level throttling, and password hashes used normal string equality. | Login is now rate-limited by client address plus username target, and stored password hashes are verified with timing-safe comparison. |
| Shop purchase-history rendering | Purchase history rendered server-provided product/status fields through `innerHTML`. | History rows now escape product names, dates, and statuses; status CSS class tokens are sanitized. |
| Shop checkout/balance rendering | Checkout and balance UI expected local catalog and numeric server values before inserting rich markup. | Checkout fields now escape names/descriptions, constrain image paths to local assets, sanitize currency codes, and numeric-format balance/amount values. |
| Economy write races | Ship/building/research handlers trusted balances and tech state loaded by an earlier query, so simultaneous actions could overspend or pay twice; failed inserts could also consume resources. | Resource deductions now use guarded conditional updates, research also compares the prior tech state, and failed ship/building inserts refund the spend. |
| Probe charge ordering | Probing a syntactically valid but nonexistent sector deducted 300 crystal before discovering the target was invalid. | Probe targets are now proven to exist before the guarded crystal deduction. |
| Colonization race | Two players could both see an unowned world, consume colony ships, and race unconditional owner writes. | World claims now use `owner IS NULL`, losers keep their colony ship, and failed ship settlement rolls the ownership claim back. |
| Lobby seat races | Concurrent joins/AI additions could all observe the last open seat, and game start could overlap a join that had not reached `playersN` yet. | In-process seat reservations cap pending inserts, lobby mutations block start until settled, and failed user-state writes roll player/AI rows back. |
| Fleet movement write ordering | Fleet positions were written before crystal was deducted, so a failed charge could leave a free or partially applied move. | Single- and multi-source movement now guard the crystal and source-sector writes; stale/partial moves are rolled back and the charge is refunded. |
| Active-game navigation | The game-screen **Leave** button sent destructive `//leavegame` despite a separate surrender flow. | Renamed it **Lobby** and made it navigation-only; confirmed resignation remains in the lobby. |
| Turn-clock drift | The browser assumed every turn was 180 seconds, including test/epic games and reconnects. | Server now publishes an epoch deadline and mode duration through snapshots and `turnclock::`; the client derives remaining time from the deadline. |
| Construction controls | Legacy client logic modeled a nonexistent ship build queue and omitted real spaceport/resource checks. | Controls now mirror instant construction, sector ownership/slots, Spaceport, tech, doctrine, resources, and server-provided race-adjusted ship costs. |
| AI sandbox launch race | The one-click sandbox used a fixed 400 ms delay before start, racing asynchronous AI seat creation. | Start now waits until player-list confirmation reaches the requested seat target. |
| Auth network feedback | Login/registration network failures were console-only and submits could be repeated. | Forms disable during requests and display actionable retry feedback on transport failure. |
| Expired WebSocket session | Invalid tempKey responses closed the socket and clients immediately reconnected with the same stale cookies. | Lobby/game clients now clear terminal credentials and return to login instead of looping. |
| Building slot concurrency | Slot count and insert were separate and simultaneous orders could both observe the last slot. | Construction is serialized per player/game through the insert/refund completion; a concurrent order is rejected before counting capacity. |
| Partial game start | `games.started` was written before map/player initialization and concurrent starts had no dedicated lock. | MySQL initialization now uses one connection/transaction, publishes `started` last, rolls back failure, and rejects a second in-process start. |
| Battle reconnect/order freeze | Reconnecting clients did not recover an active battle pause, and hidden/direct controls could still mutate the world during playback. | Snapshot now carries `battlePauseUntil`; the client restores the freeze and the command dispatcher rejects mutating orders until combat completes. |
| Combat analytics visibility | The member-authorized endpoint exposed aggregate telemetry for every commander, including battles outside the viewer's normal intel. | Responses now contain only the viewer's aggregate record and recent battles involving that viewer; two-client E2E asserts both scopes. |
| Duplicate probe charge | Two concurrent clicks could both charge 300 crystal for the same player/sector scan. | In-flight scans are coalesced per game/player/sector before lookup/charge; later intentional scans remain possible. |
| Turn trigger race | Timer expiry and all-ready completion could validate/schedule the same turn together. | A per-game scheduling lock coalesces simultaneous triggers, with a regression test proving one persisted and broadcast turn. |
| Persistence outage turn drift | A failed player-table read previously allowed turn processing to continue. | Turn advancement now pauses on the read error instead of incrementing runtime without authoritative player state. |
| Silent state corruption | There was no non-mutating whole-game consistency oracle for functional journeys. | Added a read-only invariant evaluator and test-only member endpoint covering resources, references, ownership, types, capacity, turn state, and terminal runtime cleanup. |
| Shared tech drift | Server/client tech files depended on a comment telling contributors to update both. | Unit coverage now requires normalized files to remain byte-for-byte identical. |
| Turn sequencing | `newturn::` could outrun AI, standing orders, income, battle, and victory callbacks. | Resolution now awaits phases in the established order, freezes mutations through `turnphase::`, and broadcasts only after authoritative writes complete. |
| Turn failure/restart recovery | A failed or interrupted turn could skip remaining work or replay automation/income. | Persisted phase markers resume the failed phase; `last_automation_turn` makes automation at-most-once and `last_income_turn` makes payout retry idempotent; failure/reconnect/restart tests cover boundaries. A crash immediately after automation reservation may skip the unfinished automation for that player rather than replay it. |
| Dynamic table construction | Per-game table suffixes lacked one fail-closed constructor. | Added validated table helpers, migrated creation/drop/turn/audit/AI/sync/broadcast boundaries, and injection-shaped-id tests. |
| WebSocket contract drift | Dispatch commands, browser prefixes, and protocol docs could diverge silently. | Added shared registries plus contract tests against server dispatch, browser parsing, and documentation. |
| Sector-selection response races | Delayed sector and move-option messages could replace the panel/options after the player selected a different tile. | Selection is now client-local and response handlers apply detail/options only to the still-selected target; the server no longer persists UI clicks through `players.currentsector`. |
| Passive sensor over-disclosure | One-tile sensors exposed resources, buildings, terraform requirements, and exact fleets, removing much of the probe-versus-move decision. | Added a limited `sectorcontact::` tier for terrain/controller/total presence; direct ownership/presence retains full live detail and probes persist dated full snapshots. |
| Probe memory loss | A successful scan was reduced to generic explored terrain after refresh or loss of coverage. | Probe intel now stores source, level, scan time/turn, and JSON detail per player/sector and returns it as explicitly stale memory without authorizing actions. |
| Duplicate existence facilities | Repeated Spaceports or Warp Gates spent resources and slots without adding an effect. | Warp Gate duplicates are rejected. The unique Spaceport control now performs a guarded tier upgrade instead of inserting a duplicate row. |
| Reconnect sector query fan-out | Reconnect requested full detail for every known sector, creating per-sector query amplification and unnecessary disclosure pressure. | Reconnect now sends one batched map state plus the home-sector detail; selected sectors are loaded on demand. |
| Defeated defender retained sector | The active battle resolver replaced survivors but did not transfer sector or building control after an attacking victory. | A surviving attacking victor now captures the sector and remaining infrastructure; captured Spaceports lose one tier and reset their local production ledger. |
| Flat local ship production | Any Spaceport could immediately produce every researched hull without local capacity. | Added four persisted Spaceport tiers, dual research/facility gates, and guarded per-turn local capacity using each hull's existing `buildSlots` weight. |

## Active Risks To Revisit

| Area | Risk | Why It Matters | Suggested Next Move |
| --- | --- | --- | --- |
| `server/server.js` size | Main engine is a large monolith. | Small changes can accidentally affect unrelated gameplay paths. | Extract one bounded area at a time only when tests cover the behavior. |
| Legacy dynamic table call sites | Some older internal SQL still interpolates server-derived game ids directly. | SQL placeholders cannot protect table names, and future call paths could weaken the origin assumption. | Migrate a bounded module to `game-tables.js` whenever that module is otherwise changed. |
| Auth cookies | Protected pages and JSON APIs check `userId` and `tempKey` cookies directly. | It works with current model, but tempKey is bearer-style and not an HTTP-only signed session cookie. | Consider signed session cookies once gameplay flow stabilizes. |
| Legacy docs | Several root deployment docs predate current CI/CD. | Contributors and agents may follow stale deployment instructions. | Gradually archive or rewrite old deployment docs to point at `docs/agents/operations/ci-cd.md`. |
| Tech definitions | Tech tree is duplicated in `server/lib/tech.js` and `public/js/tech.js`. | Divergence can create client/server disagreement. | Byte-sync tests now fail on drift; eventually generate the client copy when packaging changes are safe. |
| Payment surface | Payment endpoints are present but optional. | Stripe config gaps should not break non-payment gameplay. | Keep payment tests isolated and ensure `503` behavior remains explicit when disabled. |
| Production Stripe webhook | Production has `STRIPE_SECRET_KEY` but currently reports missing `STRIPE_WEBHOOK_SECRET`. | Incoming payment events cannot be signature-verified, so webhook-driven fulfillment is not production-ready even though gameplay is unaffected. | Configure the matching endpoint signing secret, restart, and confirm the startup warning is gone with a signed webhook test. |
| Mid-battle process loss | Ship/turret survivor replacement spans multiple queries inside a persisted `battles` phase. | Startup can revisit the conflict, but a hard kill between survivor writes is not fully atomic. | Add a per-battle transaction/idempotency record before attempting broader combat persistence changes. |

## Review Checklist For Gameplay Changes

- Does the change alter a WebSocket command or server message prefix?
- Does it mutate persistent tables and runtime `gameState` consistently?
- Does it require a client parser/UI update?
- Does it preserve fog-of-war and hidden-sector rules?
- Does it affect turn timing, battle pause, or timer cleanup?
- Does it change race, tech, ship, or building balance?
- Does it need a mock DB test and an E2E/harness test?
- Does production `/status` still identify the deployed commit after release?

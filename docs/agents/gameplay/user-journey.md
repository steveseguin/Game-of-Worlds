# User Journey And Experience Contract

The public, player-facing companion to this implementation map is `/docs/` (`public/docs/index.html`). When gameplay rules, victory conditions, exploration knowledge, construction scope, or turn behavior change, update that field manual alongside this document.

Primary sources: `public/js/login.js`, `public/js/lobby.js`, `public/js/connect.js`, `public/js/build.js`, `server/index.js`, and `server/server.js`.

This is both a flow map and a review checklist. A feature is not healthy merely because its endpoint succeeds: at each moment the player needs a clear next action, truthful state, visible feedback, safe recovery, and protection against an accidental destructive action.

## 1. Arrival, Identity, And Recovery

1. `/landing.html` introduces the game; `/login.html` offers registered login, registration, and guest play.
2. Auth endpoints return `userId`, `username`, `tempKey`, and guest metadata. The browser stores cookies plus local guest-upgrade state.
3. Login/register/guest controls lock while their request is in flight. Validation and network failures appear beside the initiating form; transport errors must never be console-only.
4. Protected lobby/game pages redirect to login when cookies are absent.
5. The lobby opens one WebSocket, authenticates with `//auth:<userId>:<tempKey>`, and only enables mutations after authenticated state arrives. Reconnect scheduling is single-owner so stale socket close events cannot create parallel connections.
6. Terminal WebSocket auth failures clear stale cookies and return to login instead of reconnecting forever.
7. `users.currentgame` determines recovery: the player sees either a waiting room, an active-game resume card, or the public game list.

Review moments: invalid credentials, server unavailable, double submit, expired cookies, guest return, guest upgrade, refresh during every later stage, and an older socket closing after a newer reconnect.

## 2. Discovering, Creating, And Joining A Room

The public list communicates occupancy, mode, access requirements, and joinability. Create validates name, supported capacity, mode, guest restrictions, registered-only policy, and minimum level.

Creating a room creates its database row/tables but does not bypass joining: the host chooses a race and enters through the normal `//joingame` path. This keeps unlock and capacity checks consistent for host and guests.

Pending human/AI joins reserve seats before their `playersN` rows become visible. Start is rejected while a lobby mutation remains in flight. A one-click **Fill with AI & Start** sends the required additions and waits for the player-list target; it does not guess readiness with a fixed delay.

Review moments: empty/encoded room names, full room, simultaneous last-seat joins, locked race, registered/level gate, creator/non-creator controls, AI failure, invite URL, creator departure, and refresh before start.

## 3. Starting And First Orientation

`initializeGame()` creates the map, homeworld assignments, initial resources, starter Scout/Colony Ship, and starting Metal Extractor/Orbital Turret. The player then receives `startgame::`, `newturn::`, `turnclock::`, map configuration/state, resources, tech, empire, victory progress, and focused sector detail.

The first useful loop should be legible without trial-and-error:

- The selected homeworld shows ownership, buildings, fleet, yields, and available building slots.
- Ship controls explain that a Spaceport is required; building one immediately unlocks otherwise legal affordable hulls.
- Advanced/race-forbidden hulls remain disabled with the exact doctrine or Military Shipyards reason.
- Construction is immediate. There is no client-side queue or weighted ship build capacity.
- Orders attempted before authenticated synchronization fail visibly instead of throwing or silently disappearing.
- First-run guidance can be dismissed without blocking the board or returning on every normal interaction.

## 4. Turn Rhythm And Planning

Modes default to quick (180 seconds), epic (24 hours), and test (30 seconds, when enabled), subject to environment overrides. Server runtime stores `turnEndsAt`; snapshot and `turnclock::<turn>::<endsAt>::<duration>` keep the browser authoritative across mode, tab throttling, reconnect, and battle clock restart.

**End Turn** reuses `//start` in active games. It marks the human ready and shows `turnready::<ready>::<humans>`. The turn advances only when every current human is ready or the server clock expires. Removing a player must also remove their readiness entry.

At turn advance the server sends `turnphase::resolving`, freezes new mutations, and shows **Resolving** on the turn control. AI, standing orders, income, battles, and victory are awaited in order. `newturn::` is sent only after authoritative writes finish. Reconnect snapshots include the active phase; failures remain frozen and retry the same phase without duplicating completed income.

The soundtrack uses separate multi-track playlists for the gentle lobby, launch countdown, normal campaign, building, and high-intensity battle contexts. Procedural track boundaries fade between compositions; a failed composition skips to the next healthy track. The MP3 compatibility path likewise advances on track end or asset failure and fades in the replacement. Normal campaign tempo holds until the final 20% of the authoritative turn, capped to the final 60 seconds for long-form modes, then rises gradually to a modest 12% maximum at expiry. Battle pauses freeze the countdown rather than advancing urgency. Scheduler stalls discard missed beats instead of replaying them as a fast burst.

## 5. Exploration: Every Decision Has A Cost

Unknown sectors create the core risk/reward choice:

- Probe: costs 300 crystal and can be destroyed by hazards/counter-intelligence, but avoids fleet exposure.
- Move blind: retains strategic tempo but risks asteroid losses or total black-hole annihilation.
- Scout known space: adjacency is normal; paired Warp Gates permit long movement.
- Secure an asteroid: surviving entry claims it, making later transit safe for that owner.

The player always gets a stable left-side **Selected Sector** context without losing the central 3D galaxy view. Selection first clears stale values, then shows one of four honest states: direct live detail, limited sensor contact, dated probe memory, or unknown fields. Ownership or a fleet grants passive sensors exactly one tile outward, including diagonals; the map highlights that ring. Passive contact reveals terrain, controller, and total presence, not economic values, buildings, terraform requirements, or ship composition. A successful probe records those specifics as a dated snapshot that survives refresh and is explicitly labeled stale when no longer live. Outside known space, the inline warning offers **Send Probe**, **Move Ships**, and **Dismiss**. Movement is requested only after **Move Ships** is chosen. The move console can draw from fleets elsewhere in the empire and shows a progressively disclosed direct-route preflight: known hazards are named, while unmapped route sectors remain unknown. An empty fleet result is explicit rather than silent.

The server enforces fog of war. Hidden detail must not leak through sector, map, tooltip, battle, or empire messages. Stale remembered intel should be distinguishable from live visibility. Movement validates the entire fleet and cost before arrival effects; failed partial writes are rolled back and refunded.

Two simultaneous clicks for the same player/sector probe are coalesced before charging, preventing an accidental duplicate scan. A later intentional probe remains allowed.

Review moments: malformed/zero sector, unaffordable probe/move, missing ships, simultaneous orders, blind black hole, three asteroid outcomes, owned asteroid transit, warp endpoints, stale intel, visibility after fleet departure, and refresh during an order.

## 6. Expansion, Economy, Research, And Construction

Fleets may hold empty routes, secure asteroids, or occupy worlds, but colonizable planets require a colony ship and sufficient terraform capability. An atomic `owner IS NULL` claim prevents two players consuming ships for the same planet.

Income combines base yield, owned sector types/bonuses, buildings, tech, race modifiers, and mode multiplier. Tech purchases enforce cost, prerequisites, and race caps. Ship/building/resource controls are advisory mirrors; guarded server writes remain authoritative and refund on failed dependent inserts.

The local/global boundary is part of the experience contract:

- Buildings, building slots, resource improvements, defenses, Warp Gates, Spaceports, fleets, and newly built ships belong to a specific sector. Spaceports and Warp Gates are unique per sector; duplicate attempts are disabled in the browser and rejected by the server before payment.
- Metal/crystal/research balances, race doctrine, and researched technologies belong to the empire.
- The Build tab names the selected destination and sends it with each construction order. A server must re-check ownership and local prerequisites for that destination; it may not trust an earlier UI selection.
- Today a local Spaceport enables immediate ship construction while empire-wide Military Shipyards research unlocks heavier hull knowledge. A future local yard-tier and build-capacity system is desirable, but is not live until its persistence, queue, refund, AI, and reconnect rules are designed and tested.

Review moments: last building slot, duplicate fast clicks, race discounts, branch cap, exact-balance spend, failed insert/refund, competing colony claims, newly colonized UI refresh, and victory progress after economy changes.

## 7. Combat And Consequences

Enemy co-location resolves server-side. Sector owner defends, race/tech modifiers apply, and orbital turrets contribute to defense. Visibility determines full versus summary telemetry.

`battlepause::<freezeMs>::<playbackMs>` freezes mutating orders and the turn clock while the theater plays. The server rejects bypassed controls, reconnect snapshots restore the remaining freeze, and a fresh clock is published afterward. Terminal cleanup must cancel both turn and battle-pause timers.

Review moments: attacker/defender identity, multiple queued battles, hidden battle summary, zero survivors, turret loss, animation failure/fallback report, reconnect mid-battle, and game victory during combat callbacks.

## 8. Leaving, Resuming, Resigning, And Game Over

These actions must remain unambiguous:

| Player action | Meaning |
| --- | --- |
| **Lobby** in active game | Safe navigation only. Empire and `currentgame` remain; lobby offers resume. |
| **Leave game** in a waiting room | Remove seat; delete an empty room or reassign creator. |
| **Resign** in active lobby card | Confirmed destructive surrender through `//surrender`. |
| Disconnect/close tab | Preserve active membership for reconnect. |

Victory, surrender, no-human abandonment, stale-game cleanup, and solo sandbox expiry must stop timers, notify clients, update persistent status/stats as appropriate, and clear current-game pointers so a new room can be joined.

## Functional Coverage Baseline

- HTTP/integration: auth limits, protected routes/APIs, service health/status, static method behavior, and WebSocket smoke.
- Multiplayer E2E: create/join/race/start, refresh/reconnect, manual turns, exploration/movement/colonization, construction/research, combat, surrender, and terminal cleanup.
- Hostile/recovery E2E: access gates, guest upgrade, malformed or rejected actions, safe Lobby/resume, and explicit resignation.
- Gameplay-controls E2E: authoritative mode clock/reconnect, limited passive contact, persisted probe memory, explicit movement choice, Spaceport-to-ship progression, advanced hull lock reason, and confirmed AI-seat launch.
- Full-game and live-combat E2E: read-only invariant audits after real mutations; the complete harness also confirms terminal runtime cleanup after victory.
- Turn recovery tests: phase ordering, delayed writes, reconnect during resolution, persistence/income/battle/victory failures, idempotent retry, restart recovery, and battle-pause restart.
- Test-mode map journeys use `TEST_MAP_SEED` for reproducible hazards/routes; production map generation remains random.

When a user-facing rule changes, prefer a browser journey that proves the state before action, feedback during it, authoritative result afterward, and refresh/reconnect recovery—not only a direct handler unit test.

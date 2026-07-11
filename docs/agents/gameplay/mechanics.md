# Gameplay Mechanics

Primary sources: `server/server.js`, `server/lib/combat.js`, `server/lib/tech.js`, `server/lib/races.js`, `server/lib/victory.js`.

## Sector Types

| Type | Meaning | Live behavior |
| --- | --- | --- |
| `0` | Empty space | Safe transit. A fleet can hold it for route/vision purposes, but it has no yield/build slots and does not count as a world. |
| `1` | Asteroid belt | Damages entering fleets unless owned; surviving fleet can secure it. |
| `2` | Black hole | Destroys entering fleet. Probes are destroyed. |
| `3-5` | Other hazards/non-colonizable | Used by map/fog rendering; avoid assuming colonizable. |
| `6-9` | Colonizable planets | Require colony ship and sufficient terraform tech. |
| `10` | Homeworld | Starting owned sector with initial buildings/ships. |

## Exploration

The intended loop is risk/reward:

1. `//sector:<sectorHex>` requests detail.
2. If not visible, server replies `probeonly:<sectorHex>`.
3. `//probe:<sectorHex>` costs 300 crystal.
4. Probe can be destroyed by black holes, asteroid hazards, or enemy counter-intelligence.
5. Successful probe marks the sector explored and returns `sector::<id>::<json>`.
6. Moving blind may reveal or punish the fleet through arrival effects.

Fog-of-war is server-enforced through `canPlayerSeeSector()`, `markSectorExplored()`, `sendVisibleMapState()`, and `updateSector()`.

## Movement And Arrival

Movement commands:

- `//move:<fromHex>:<toHex>:<shipTypeCsv>:<countCsv>` for single-source movement; type/count CSVs are positive decimal integers and must line up one-to-one.
- `//sendmmf:<targetHex>:<sourceHex>:<shipType>:<ordinal>...` through the multi-move UI; every selected ship option adds a source/type/positive-ordinal triplet.
- `//mmove:<sectorHex>` to ask for source options

Rules:

- Sector tokens are whole hexadecimal, one-based ids. Malformed tokens and sector `0` are rejected before DB/resource writes.
- Normal movement requires adjacency.
- Warp movement is allowed when both endpoints have warp gates.
- Movement costs crystal based on moved ship hull classes and propulsion tech discounts.
- The server verifies resource balance and the full requested fleet before moving ships.
- Crystal is conditionally deducted first, then the complete requested fleet is moved. A stale/partial fleet write is rolled back and refunded before `applyArrivalEffects()` resolves hazards or ownership.
- `fleetmove::` broadcasts visible movement animation/event.

Arrival effects:

- Black hole: all entering ships are deleted and the owner receives a destructive narrative error.
- Unowned asteroid: random losses; survivors secure the belt for future safe transit.
- Owned asteroid: safe.
- Empty space: a surviving fleet can hold the sector, but it is not a colonized world.
- Unowned colonizable world: fleet can hold position; colony ship must run colonize command to settle.
- Enemy co-location: `processBattles()` resolves battle.

## Economy

Income is computed from:

- Base income.
- Owned sectors and sector type yields.
- Per-sector `metalbonus` and `crystalbonus`.
- Buildings on each sector.
- Empire-wide tech multipliers.
- Race production/research modifiers.
- Game mode multiplier (`test`, `quick`, `epic`).

The live turn implementation schedules income updates asynchronously for each player. When debugging victory/resource timing, confirm whether a resource change has already landed in `players<gameId>`.

## Buildings

Building ids:

| Id | Building | Notes |
| --- | --- | --- |
| `0` | Metal Extractor | Improves local metal output. |
| `1` | Crystal Refinery | Improves local crystal output. |
| `2` | Research Academy | Improves local research output. |
| `3` | Spaceport | Required for ship construction. |
| `4` | Orbital Turret | Adds defensive battle strength when owner defends that sector. |
| `5` | Warp Gate | Requires Orbital Engineering 1; enables long movement when both endpoints have gates. |

Slot limits depend on sector type. Black holes and empty/non-colonizable hazards should not accept normal buildings.
The server owns the slot table, includes `buildingSlotLimit` in live sector detail, and shares the same table with the read-only invariant auditor. Client fallback values exist only for compatibility before authoritative detail arrives.

## Ships

Ship ids are defined in `server/lib/combat.js`. The current UI/server ship families include Scout, Frigate, Destroyer, Cruiser, Battleship, Colony Ship, Dreadnought, Intruder, and Carrier.

Construction checks:

- Valid ship id.
- Race doctrine permits the hull, except colony ships remain generally available.
- Enough metal/crystal.
- Spaceport exists in current sector.
- Shipyard tech is high enough for advanced hulls.

Ship construction is immediate; there is no shipyard queue or weighted build-slot capacity. `techstate::` includes race-adjusted `shipCosts` and shipyard requirements so the browser can explain the same rules the server enforces.

## Combat

Battle trigger:

1. `processBattles()` finds sectors with ships from multiple owners.
2. `resolveBattle()` chooses attacker/defender. Sector owner defends when involved.
3. Race and tech modifiers are applied.
4. Defender orbital turrets are folded into the defender fleet.
5. `combatSystem.conductBattle()` returns battle log and survivors.
6. Ships/building losses are persisted.
7. `battlepause::` freezes the turn clock.
8. Players receive full or summary battle telemetry depending on visibility/stealth rules.
9. `battlereport::`, plain battle reports, and map refreshes follow.

The Analytics tab is scoped to the authenticated player's own aggregate combat record. Recent entries are limited to battles involving that player; it must not become a fog-of-war bypass for other commanders' hidden combat.

## Technology

Tech lives in both server and client definitions. Server is authoritative for cost/prerequisite/race-cap enforcement; client renders and previews.

Do not update `server/lib/tech.js` without checking `public/js/tech.js` and related E2E coverage.

## Victory And End States

Victory conditions are checked in `server/lib/victory.js`:

- Time
- Domination
- Elimination: the candidate must own at least one type `6-10` world and every opponent must own none; empty route sectors and secured asteroids do not keep a player alive.
- Economic
- Scientific

Other end paths:

- Player surrender.
- No human players remain.
- Stale-human active game.
- Solo sandbox expiry.

All end paths should stop timers and clear reconnect state enough that players can return to the lobby cleanly.

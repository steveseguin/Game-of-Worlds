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
5. Successful probe stores a dated full-intel snapshot and returns `sector::<id>::<json>`.
6. Moving blind may reveal or punish the fleet through arrival effects.

Fog-of-war is server-enforced through `canPlayerSeeSector()`, `markSectorExplored()`, `sendVisibleMapState()`, and `updateSector()`.

### Visibility and intel states

The modern map deliberately adds a **one-tile passive sensor ring** around every sector the player owns or occupies with a fleet. This is the complete range rule; distance from the homeworld by itself does nothing.

| UI state | What caused it | What the player can rely on |
| --- | --- | --- |
| Unknown/fog | Outside passive sensors and never explored | Sector id only. Probe or move blind. |
| Direct live detail | Player owns the sector or has a fleet there | Current terrain, owner, yields, terraform requirement, buildings, and fleet composition. |
| Sensor contact | One tile adjacent (including diagonals) to an owned/occupied sector | Current terrain, controller, and total fleet presence only. Yields, buildings, terraform requirement, and ship composition remain unknown. |
| Terrain memory | Previously seen without a full probe and no longer in sensor range | Terrain classification only; current control and presence are not implied. |
| Probe memory | Successful probe, now outside direct coverage | The dated snapshot from scan time. It can be useful, but every mutable field is explicitly stale until observed again. |
| Probe result | Successful probe | Full detail at scan time; it later becomes memory when no live coverage remains. |

Selecting a tile is inspection, not movement. It updates the left **Selected Sector** panel. Unknown and remembered fields must say `Unknown` or `Not currently visible`; they must never silently retain details from the previously selected sector. The unknown-sector panel offers both explicit actions: **Send Probe** and **Move Ships**.

## Movement And Arrival

Movement commands:

- `//move:<fromHex>:<toHex>:<shipTypeCsv>:<countCsv>` for single-source movement; type/count CSVs are positive decimal integers and must line up one-to-one.
- `//sendmmf:<targetHex>:<sourceHex>:<shipType>:<ordinal>...` through the multi-move UI; every selected ship option adds a source/type/positive-ordinal triplet.
- `//mmove:<sectorHex>` to ask for source options
- `//moveoptions:<targetHex>` to request eligible ships across the empire plus a route preflight. The server returns known hazards and an unknown-sector count without leaking unmapped terrain.

Rules:

- Sector tokens are whole hexadecimal, one-based ids. Malformed tokens and sector `0` are rejected before DB/resource writes.
- Normal movement follows a direct sector-center-to-sector-center route. Every crossed sector is resolved in travel order; the route is not automatically bent around obstacles.
- Paired owned Warp Gates bypass normal-space route hazards.
- Movement costs crystal based on hull class, plotted route length, and propulsion tech discounts.
- The server verifies resource balance and the full requested fleet before moving ships.
- Crystal is conditionally deducted first, then the complete requested fleet is moved. A stale/partial fleet write is rolled back and refunded before intermediate route hazards and destination arrival resolve.
- `fleetmove::` broadcasts visible movement animation/event.

Arrival effects:

- Intermediate known or unknown black hole: every affected ship is destroyed before reaching the destination.
- Intermediate unsecured asteroid: every transiting ship receives its own independent destruction roll; flying through does not secure the belt.
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

Spaceports and Warp Gates are existence-based local facilities, so each is unique per sector. A duplicate is rejected before spending resources or consuming a slot. Extractors, Refineries, Academies, and Orbital Turrets may be repeated because each row has an additive effect.

Construction commands include the selected sector token. Ownership, slot capacity, uniqueness, and prerequisites are validated against that explicit destination; the server no longer writes selection changes to `players.currentsector`. Legacy commands may still fall back to that old cursor, but modern UI selection is client-local and cannot race another sector-detail response.

### Local versus empire-wide state

| Local to selected sector | Empire-wide |
| --- | --- |
| Sector owner and terrain | Metal, crystal, and research balances |
| Resource/terraform modifiers | Researched technology and race doctrine |
| Building slots and every building | Technology production/combat multipliers |
| Orbital defense and Warp Gate endpoint | Victory progress and diplomacy |
| Ships present and the sector where a new ship appears | Hull knowledge unlocked by Military Shipyards research |

The Build tab always acts on the selected owned sector. Research remains empire-wide. Changing selection must refresh local building/fleet counts and disabled reasons before an order can be sent.

## Ships

Ship ids are defined in `server/lib/combat.js`. The current UI/server ship families include Scout, Frigate, Destroyer, Cruiser, Battleship, Colony Ship, Dreadnought, Intruder, and Carrier.

Construction checks:

- Valid ship id.
- Race doctrine permits the hull, except colony ships remain generally available.
- Enough metal/crystal.
- Spaceport exists in the explicitly selected build sector.
- Empire-wide Military Shipyards research is high enough for advanced hulls.

Ship construction is immediate; there is no shipyard queue or weighted build-slot capacity. `techstate::` includes race-adjusted `shipCosts` and shipyard requirements so the browser can explain the same rules the server enforces.

The longer-term shipyard direction is local capacity without discarding the existing research tree: Military Shipyards research represents empire knowledge; a local Spaceport/shipyard tier would determine which known hulls that world can produce and how much simultaneous tonnage it can handle. That queue/tier system is **not implemented yet** and must not be implied by the UI. Introduce it only with persisted per-sector levels, migration/reconnect behavior, queue cancellation/refunds, AI support, and functional tests. Existing Spaceports are uniqueness-based facilities, not implicit levels.

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
- Scientific: research every canonical technology the selected race is permitted to enter; race-locked branches do not make this victory impossible.

Other end paths:

- Player surrender.
- No human players remain.
- Stale-human active game.
- Solo sandbox expiry.

All end paths should stop timers and clear reconnect state enough that players can return to the lobby cleanly.

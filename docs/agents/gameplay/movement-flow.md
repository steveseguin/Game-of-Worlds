# Movement Flow

Primary source: `server/server.js` movement functions:

- `moveFleet()` and `moveFleetExecute()` for single-source orders.
- `surroundShips()`, `sendMultiMoveOptions()`, and `preMoveFleet()` for multi-source orders.
- `applyArrivalEffects()` for hazards, route control, and colonization prompts.

## Command Shapes

| Command | Meaning |
| --- | --- |
| `//sector:<sectorHex>` | Select/request a sector. If hidden, server returns `probeonly:<sectorHex>`. |
| `//moveoptions:<targetHex>` | Request ships across the empire plus route summaries for the selected destination. |
| `//mmove:<targetHex>` | Legacy helper that is rewritten to `//sendmmf:<targetHex>` server-side. |
| `//move:<fromHex>:<toHex>:<shipTypeCsv>:<countCsv>` | Move one fleet stack from one source sector. Type and count CSVs must align. |
| `//sendmmf:<targetHex>:<sourceHex>:<shipType>:<ordinal>...` | Move selected ships from one or more sources into one target on direct plotted routes. |

Sector tokens are whole hexadecimal, one-based ids. `0`, blank tokens, prefixed values such as `0x10`, and partial parses such as `1zz` are invalid.

## Single-Source Flow

```mermaid
flowchart TD
  Command[//move] --> Parse[Parse hex sectors and CSV ship selection]
  Parse --> Invalid{Valid player, game, sectors, types, counts?}
  Invalid -- no --> ErrorOrder[Error: Invalid fleet order]
  Invalid -- yes --> Warp{Owned warp gate at both endpoints?}
  Warp -- no --> Route[Trace direct route through crossed sectors]
  Warp -- yes --> Resources[Load player crystal and tech]
  Route --> Resources
  Resources --> Cost{Enough crystal?}
  Cost -- no --> ErrorCrystal[Error: Not enough crystal]
  Cost -- yes --> Verify[Load ships in source sector]
  Verify --> Enough{Full requested fleet exists?}
  Enough -- no --> ErrorFleet[Error: Not enough ships]
  Enough -- yes --> Deduct[Guarded crystal deduction]
  Deduct --> UpdateShips[Guarded update of all selected ship ids still in the source]
  UpdateShips -- stale or failed --> Refund[Refund crystal; do not resolve arrival]
  UpdateShips -- all moved --> Hazards[Resolve intermediate black holes and asteroids]
  Hazards --> Arrival[Resolve destination hazard, control, and colonization state]
```

Key invariant: the single-source path verifies the complete requested fleet, conditionally charges crystal, and only moves ids that still belong to the player in the expected source sector. A stale fleet write refunds the charge and does not resolve arrival effects.

## Multi-Source Flow

1. Selecting a tile sends `//sector:<targetHex>` for intel only. It does not open movement by itself.
2. The player chooses **Move Ships** in the selected-sector panel; the client sends `//moveoptions:<targetHex>`.
3. Server sends `mmoptionsv2::<json>` with every eligible source, route length, crossed sector ids, known hazards, and an unknown-sector count. Only previously explored terrain is classified.
4. Client renders one option per available ship. Each option value is `<sourceHex>:<shipType>:<ordinal>`, where ordinal is the one-based ship number within that source/type option list.
5. `//sendmmf` sends selected option triplets.
6. Server counts triplets by source/type, traces each direct route, verifies resources and ships, then charges distance-adjusted crystal and moves each selected id only from its expected source.
7. If any selected id is stale or fails to move, successful writes are returned to their source sectors and the crystal charge is refunded. Arrival effects run only after every selected ship moves.

## Arrival Effects

Route and arrival resolution is shared by both movement paths:

- Intermediate black holes destroy every ship whose line crosses them.
- Intermediate unsecured asteroids roll destruction independently for every transiting ship and are not secured by a fly-through.
- Black hole sectors delete the entering fleet.
- Unowned asteroid belts apply random losses; survivors secure the belt.
- Owned asteroid belts are safe.
- Empty sectors can be held as route/vision territory.
- Unowned planets require explicit `//colonize` with a colony ship.
- Enemy co-location is later resolved by `processBattles()`.

## Contributor Checks

- Add or update tests when changing command delimiters, sector token parsing, movement cost, or arrival effects.
- Use `tests/movement-validation.test.js` for malformed protocol and all-or-nothing movement checks.
- Use E2E tests when changing `mmoptionsv2::` parsing, `fleetmove::`, route confirmation, or visible movement UI behavior. Keep legacy `mmoptions:` parsing only as an explicit compatibility path.

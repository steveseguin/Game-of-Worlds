# Movement Flow

Primary source: `server/server.js` movement functions:

- `moveFleet()` and `moveFleetExecute()` for single-source orders.
- `surroundShips()`, `sendMultiMoveOptions()`, and `preMoveFleet()` for multi-source orders.
- `applyArrivalEffects()` for hazards, route control, and colonization prompts.

## Command Shapes

| Command | Meaning |
| --- | --- |
| `//sector:<sectorHex>` | Select/request a sector. If hidden, server returns `probeonly:<sectorHex>`. |
| `//moveoptions:<targetHex>` | Explicitly request ships in adjacent sectors that can move to the selected destination. |
| `//mmove:<targetHex>` | Legacy helper that is rewritten to `//sendmmf:<targetHex>` server-side. |
| `//move:<fromHex>:<toHex>:<shipTypeCsv>:<countCsv>` | Move one fleet stack from one source sector. Type and count CSVs must align. |
| `//sendmmf:<targetHex>:<sourceHex>:<shipType>:<ordinal>...` | Move selected ships from adjacent source sectors into one target sector. Ship type and ordinal are positive decimal tokens. |

Sector tokens are whole hexadecimal, one-based ids. `0`, blank tokens, prefixed values such as `0x10`, and partial parses such as `1zz` are invalid.

## Single-Source Flow

```mermaid
flowchart TD
  Command[//move] --> Parse[Parse hex sectors and CSV ship selection]
  Parse --> Invalid{Valid player, game, sectors, types, counts?}
  Invalid -- no --> ErrorOrder[Error: Invalid fleet order]
  Invalid -- yes --> Adjacent{Adjacent sectors?}
  Adjacent -- no --> Warp{Owned warp gate at both endpoints?}
  Warp -- no --> ErrorAdjacent[Error: Sectors are not adjacent]
  Adjacent -- yes --> Resources[Load player crystal and tech]
  Warp -- yes --> Resources
  Resources --> Cost{Enough crystal?}
  Cost -- no --> ErrorCrystal[Error: Not enough crystal]
  Cost -- yes --> Verify[Load ships in source sector]
  Verify --> Enough{Full requested fleet exists?}
  Enough -- no --> ErrorFleet[Error: Not enough ships]
  Enough -- yes --> Deduct[Guarded crystal deduction]
  Deduct --> UpdateShips[Guarded update of all selected ship ids still in the source]
  UpdateShips -- stale or failed --> Refund[Refund crystal; do not resolve arrival]
  UpdateShips -- all moved --> Arrival[Mark explored, broadcast fleetmove, apply arrival effects]
```

Key invariant: the single-source path verifies the complete requested fleet, conditionally charges crystal, and only moves ids that still belong to the player in the expected source sector. A stale fleet write refunds the charge and does not resolve arrival effects.

## Multi-Source Flow

1. Selecting a tile sends `//sector:<targetHex>` for intel only. It does not open movement by itself.
2. The player chooses **Move Ships** in the selected-sector panel; the client sends `//moveoptions:<targetHex>`.
3. Server always sends `mmoptions:<targetHex>[:<sourceHex>:<count1>...<count9>...]`. An empty payload is a valid “no adjacent ships” result, not silence.
4. Client renders one option per available ship. Each option value is `<sourceHex>:<shipType>:<ordinal>`, where ordinal is the one-based ship number within that source/type option list.
5. `//sendmmf` sends selected option triplets.
6. Server counts triplets by source/type, validates all source sectors are adjacent, verifies resources and available ships, then conditionally charges crystal and moves each selected id only from its expected source sector.
7. If any selected id is stale or fails to move, successful writes are returned to their source sectors and the crystal charge is refunded. Arrival effects run only after every selected ship moves.

## Arrival Effects

Arrival is shared by both movement paths:

- Black hole sectors delete the entering fleet.
- Unowned asteroid belts apply random losses; survivors secure the belt.
- Owned asteroid belts are safe.
- Empty sectors can be held as route/vision territory.
- Unowned planets require explicit `//colonize` with a colony ship.
- Enemy co-location is later resolved by `processBattles()`.

## Contributor Checks

- Add or update tests when changing command delimiters, sector token parsing, movement cost, or arrival effects.
- Use `tests/movement-validation.test.js` for malformed protocol and all-or-nothing movement checks.
- Use E2E tests when changing client `mmoptions`, `fleetmove::`, or visible movement UI behavior.

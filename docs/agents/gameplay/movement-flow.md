# Movement Flow

Primary source: `server/server.js` movement functions:

- `moveFleet()` and `moveFleetExecute()` for single-source orders.
- `surroundShips()`, `sendMultiMoveOptions()`, and `preMoveFleet()` for multi-source orders.
- `applyArrivalEffects()` for hazards, route control, and colonization prompts.

## Command Shapes

| Command | Meaning |
| --- | --- |
| `//sector:<sectorHex>` | Select/request a sector. If hidden, server returns `probeonly:<sectorHex>`. |
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
  Enough -- yes --> UpdateShips[Update all selected ship ids]
  UpdateShips --> Deduct[Deduct movement crystal]
  Deduct --> Arrival[Mark explored, broadcast fleetmove, apply arrival effects]
```

Key invariant: the single-source path must verify the complete requested fleet before updating any ship rows. Otherwise an over-requested move can partially move ships without cost or hazard resolution.

## Multi-Source Flow

1. `//sector:<targetHex>` calls `updateSector()`.
2. Server sends `mmoptions:<targetHex>:<sourceHex>:<count1>...<count9>...` when adjacent owned ships can reach the target.
3. Client renders one option per available ship. Each option value is `<sourceHex>:<shipType>:<ordinal>`, where ordinal is the one-based ship number within that source/type option list.
4. `//sendmmf` sends selected option triplets.
5. Server counts triplets by source/type, validates all source sectors are adjacent, verifies resources and available ships, updates selected ids, deducts crystal, then calls `applyArrivalEffects()`.

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

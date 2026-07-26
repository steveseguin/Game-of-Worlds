# Colonies and Building

Eight events. These are the only unambiguously good news in the feed, and the discipline is to let them
*be* good news — no shadow, no cost, no foreboding. If everything in the game is grave then nothing is.

---

## 1 · Colony founded

**Current:** `Success: Colonized sector ${sectorId}`

- **a** — `Success: Colony confirmed, ${sectorId}. First permanent structure. Somebody will be born there.`
- **b** — `Success: ${sectorId} is settled. It is on the chart as a place now, not a crossing.`
- **c** — `Success: Colony at ${sectorId}. In nine years nobody there will remember what it cost to reach.`

## 2 · Building constructed

**Current:** `Success: Built ${building.name} in sector ${buildSector}`

- **a** — `Success: ${building.name} up at ${buildSector}. Filed and operational.`
- **b** — `Success: ${building.name}, ${buildSector}. Good. That is one more thing out there that is ours whether anybody is looking or not.`
- **c** — `Success: ${building.name} complete at ${buildSector}.`

## 3 · Ship built

**Current:** `Success: Built ${shipData.name} in sector ${buildSector} (${productionCost} production)`

- **a** — `Success: ${shipData.name} off the slip at ${buildSector}. ${productionCost} production. She has a crew now.`
- **b** — `Success: ${shipData.name} commissioned, ${buildSector}, ${productionCost} production. Logged with a hull number and a name.`
- **c** — `Success: ${shipData.name} built at ${buildSector} for ${productionCost}. Yards are keeping up.`

## 4 · Spaceport upgraded

**Current:** `Success: Upgraded Spaceport to level ${nextLevel} in sector ${buildSector}`

- **a** — `Success: Spaceport ${buildSector} is now level ${nextLevel}. More capacity, which means more hulls, which means more manifests. I am not complaining.`
- **b** — `Success: ${buildSector} port at level ${nextLevel}. That is a real yard now.`
- **c** — `Success: Spaceport level ${nextLevel}, ${buildSector}. Concord standard was six. We will get there.`

## 5 · Building slots full

**Current:** `Error: Building limit reached (${slotLimit} slots here)`

- **a** — `Error: ${slotLimit} slots at that sector and all ${slotLimit} are used. It is a world, not a warehouse.`
- **b** — `Error: No slots left — ${slotLimit} is the ground it has. We would need another world, and there are several.`
- **c** — `Error: That sector is built out at ${slotLimit} slots.`

## 6 · Duplicate building

**Current:** `Error: This sector already has a ${building.name}`

- **a** — `Error: There is already a ${building.name} there. It is working. I checked.`
- **b** — `Error: One ${building.name} per sector, and that sector has its one.`
- **c** — `Error: ${building.name} already present. Two would not produce twice as much; we have tried it as an empire and it is in the literature.`

## 7 · Production capacity exceeded

**Current:** `Error: Spaceport ${spaceportLevel} lacks ${productionCost} production capacity this turn`

- **a** — `Error: The yard cannot take it this turn — level ${spaceportLevel} port, ${productionCost} production needed. Next turn, or a bigger port.`
- **b** — `Error: ${productionCost} production against a level ${spaceportLevel} port. The slip is full. Nobody is idle; there is simply no room.`
- **c** — `Error: Level ${spaceportLevel} port is at capacity. ${productionCost} will have to wait a turn.`

## 8 · Terraforming insufficient

**Current:** `Error: This world needs Terraforming ${required} (you have ${techFx.terraform}). Research it in the Terraforming branch`

- **a** — `Error: That world needs Terraforming ${required} and we have ${techFx.terraform}. It is not a hostile world. It is a world nobody would have settled if they had a choice, and we will need three generations of work before we can.`
- **b** — `Error: Terraforming ${required} required, ${techFx.terraform} held. The Terraforming branch, and it is slow, and it is supposed to be.`
- **c** — `Error: We cannot live there yet. Terraforming ${required}; we have ${techFx.terraform}.`

---

## Craft notes

**Event 1a is the only sentimental line Rell is allowed in the whole feed.** *Somebody will be born
there.* It fires on colony founding, which is the single most positive act in the game, and it is the one
place the register is permitted to open. Every other good-news line stays professional.

**Events 2, 3 and 4 are deliberately plain.** A feed where every entry is a small poem is exhausting, and
it also destroys the moments that should land. Roughly half the lines in the whole script should be
nearly transparent, and this is where those live.

**Event 8 carries the terraforming fiction** — that a terraform level is somebody's grandchildren, and
that these are not hostile worlds but worlds nobody would have chosen. Variant **a** does the work;
variants **b** and **c** exist so it is not said every time.

**Nothing in this file mentions loss.** That is deliberate and it should be defended. The Sweeping is
working, and this is the file where the player is allowed to feel it.

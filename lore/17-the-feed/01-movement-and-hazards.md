# Movement and Hazards

Twelve events. This is the game, and it is where most of the emotional return of the whole `lore/` folder
is available for the least work.

---

## 1 · Clean arrival

**Current:** `Success: Fleet moved into sector ${sectorId}`

- **a** — `Success: Fleet arrived, ${sectorId}. All hulls. That was a clean crossing.`
- **b** — `Success: Fleet arrived, ${sectorId}. Nothing to report, which is the report I like.`
- **c** — `Success: Fleet arrived, ${sectorId}. All hulls accounted for. Logged.`

## 2 · Fleet holds a sector

**Current:** `Success: Fleet holds sector ${sectorId}.`

- **a** — `Success: We hold ${sectorId}. It is ours until somebody spends more than we did.`
- **b** — `Success: ${sectorId} held. Filed as ours, with the date.`
- **c** — `Success: We hold ${sectorId}. Nobody will have to pay for that crossing again.`

## 3 · Arrival at an unclaimed world

**Current:** `Success: Fleet arrived at an unclaimed world in sector ${sectorId} (terraform requirement ${needed}). A colony ship can settle it.`

- **a** — `Success: Unclaimed world, ${sectorId}. Terraforming ${needed}. Send a colony ship and somebody will be born there.`
- **b** — `Success: World at ${sectorId}, nobody's. Terraforming ${needed}. It has been sitting there the whole time.`
- **c** — `Success: Unclaimed world, ${sectorId}, terraform requirement ${needed}. A colony ship settles it. A fleet only visits.`

## 4 · Belt survived, no loss

**Current:** `Success: We navigated the asteroid belt in sector ${sectorId} and avoided being hit. Whew!`

- **a** — `Success: Shoal at ${sectorId}. Nothing was hit. I have seen that go the other way more often than not.`
- **b** — `Success: Shoal at ${sectorId} crossed clean. Do not read anything into it — the odds have not changed.`
- **c** — `Success: Through the shoal at ${sectorId}, all hulls. Good crews. Not good luck; there is no such thing out there.`

## 5 · Belt, partial loss — **the most important line in the game**

**Current:** `Error: We lost ${destroyedCount} ships to asteroids in sector ${sectorId}. If we can control the sector though, that won't happen again.`

- **a** — `Error: Fleet arrived, ${sectorId}. ${destroyedCount} did not. There is a shoal at ${sectorId} and it is on the chart now — hold it and sweep it, and we will not pay for that crossing twice.`
- **b** — `Error: Shoal at ${sectorId}. ${destroyedCount} hulls lost, crews did not arrive. Recommend we take the sector. A swept shoal is a road.`
- **c** — `Error: ${destroyedCount} lost to the shoal at ${sectorId}. That is what the sector cost to learn. It only costs it once, if we hold it.`

## 6 · Belt, total loss — **one line only**

**Current:** `Error: Asteroids in sector ${sectorId} destroyed our entire fleet! We lost everything!`

> `Error: Nothing arrived at ${sectorId}. I have the manifest. I will file it.`

*No variants. No exclamation. This event must never feel randomised, and the flatness is the whole line.*

## 7 · Black hole — **one line only**

**Current:** `Error: Fleet arrived in sector ${sectorId}... but the sector contained a BLACK HOLE! UH-OH! Our fleet was crushed by the immense gravity!`

> `Error: There is a mouth at ${sectorId}. I know because nothing came back from ${sectorId}. That is the only way anyone has ever known.`

*No variants. This is the setting's thesis and it fires perhaps twice a game.*

## 8 · Belt secured

**Current:** `Success: We secured the asteroid belt in sector ${sectorId} - our fleets can pass safely now.`

- **a** — `Success: Shoal at ${sectorId} swept. Charted, cleared, corridored. It is a road now and it will stay one.`
- **b** — `Success: ${sectorId} is swept. Free transit, and it will yield ore. That is the first thing this galaxy has given us instead of charged us for.`
- **c** — `Success: Shoal ${sectorId} secured. Somebody paid for that. It is worth knowing who — the manifest is in the log.`

## 9 · Belt loss during turn resolution

**Current:** `Error: Asteroids in sector ${report.sectorId} destroyed ${report.count} ship${report.count === 1 ? '' : 's'} during t...`

- **a** — `Error: Overnight, ${report.sectorId}: the shoal took ${report.count} hull${report.count === 1 ? '' : 's'}. Crews did not arrive. It is on the chart.`
- **b** — `Error: Turn resolution, ${report.sectorId}. ${report.count} hull${report.count === 1 ? '' : 's'} lost crossing the shoal. Recommend a route around it or a fleet on it.`
- **c** — `Error: ${report.count} hull${report.count === 1 ? '' : 's'} did not clear the shoal at ${report.sectorId}. Filed.`

## 10 · Black hole during turn resolution

**Current:** `Error: Fleet contact was lost in sector ${report.sectorId}. A black hole annihilated ${report.count} ship${report.count === 1 ? '' : 's'}...`

- **a** — `Error: Contact lost, ${report.sectorId}. ${report.count} hull${report.count === 1 ? '' : 's'}. There is a mouth there. Marking it.`
- **b** — `Error: Nothing reported from ${report.sectorId}. ${report.count} hull${report.count === 1 ? '' : 's'} did not arrive. A mouth is now on the chart at ${report.sectorId} and it is on the chart because of them.`
- **c** — `Error: ${report.sectorId} has a mouth in it. ${report.count} hull${report.count === 1 ? '' : 's'}. I am notifying next of kin per standing order.`

## 11 · Enemy fleet loses hulls to a belt

**Current:** `Error: An enemy fleet lost ${destroyedCount} ships to asteroids in sector ${sectorId}!`

- **a** — `Success: An enemy fleet lost ${destroyedCount} hulls to the shoal at ${sectorId}. They did not know it was there. Now we know they did not.`
- **b** — `Success: ${destroyedCount} enemy hulls lost to the shoal at ${sectorId}. Their chart is worse than ours. That is worth more than the hulls.`
- **c** — `Success: The shoal at ${sectorId} took ${destroyedCount} of theirs. Somebody over there is writing to families this evening.`

*Note the severity flip to `Success:` — this is good news, and the current string marks it as an error.*

## 12 · Enemy fleet lost to a black hole

**Current:** `Error: An enemy fleet was destroyed by the black hole in sector ${sectorId}!`

> `Success: An enemy fleet did not come out of ${sectorId}. They found the mouth the way everyone finds one.`

*One line. Severity flipped to `Success:`. Rell does not gloat, and the phrasing is identical to the one
used for our own losses, which is the point.*

---

## Craft notes

**Event 5 is the line that matters.** It fires more than any other in a normal game, it is the one that
teaches the sweep loop, and its current text ends on an optimistic dependent clause. All three variants
keep the mechanical instruction — *hold it and sweep it* — because the copy has to teach, and add the cost
in front of it, because the copy has to mean something.

**Events 6, 7 and 12 have one line each.** Rare heavy events must not rotate; a randomised catastrophe
reads as a slot machine. Event 7 in particular is the only place the game states its own premise, and it
should be word-for-word identical every single time a player sees it.

**Event 11 and 12 flip severity.** An enemy losing hulls is currently prefixed `Error:`, which colours it
as bad news. That is a bug in the copy, not in the engine.

**The tic appears in events 5b, 6, 9a, 10b, 10c.** Five of twelve. Do not add more here — it needs the
rest of the feed to dilute it, or the player notices the device instead of the meaning.

# Wonders, Signature Technologies, and Signature Hulls

Status: **DESIGN PROPOSAL**, not lore. Everything here needs a mechanics conversation and a cost
estimate before it becomes canon. The fiction is solid; the numbers are placeholders and are marked
as such.

The engine already has the hook: `VICTORY_CONDITIONS.WONDER` exists in `server/lib/victory.js` and is
disabled with the note *"Disabled until Galactic Wonder construction is implemented."* This folder is
what would go in it.

---

## The spine

Twelve Wonders, and they are not twelve unrelated trinkets. **Each one is that race's answer to the
dark, taken to its absolute conclusion** — a different attempt to end the Dimming, built out of that
civilisation's single deepest conviction.

Which means the set does thematic work no individual Wonder could:

> **Eleven of the twelve reopen the road. One makes the road unnecessary, and it is far too slow for
> anyone to choose. And one closes the road forever, and the people who would build it have to spend
> themselves to do it.**

| # | Race | Wonder | Their answer, taken to the end |
|---|---|---|---|
| 1 | Terran | **The Concord Lamp** | We wrote it down, so we can rebuild it |
| 2 | Silicon | **The Solved Sky** | If you cannot see it, compute it — all of it |
| 3 | Zephyr | **The Ten Thousand Mouths** | Do not survive the dark. Outbreed it |
| 4 | Crystalline | **The First Thickness** | We are made of the same substance. One of us can *be* a Lamp |
| 5 | Void Walkers | **The Whole Recitation** | Write it down. All of it. Break the only law we have |
| 6 | Mechanicus | **The Endless Yard** | Do not look, do not stop, and never finish |
| 7 | Bioform | **The Mother Grove** | Do not relight the road. Make it unnecessary |
| 8 | Star Nomads | **The Reconciled Schedule** | Finish the count. Every name, every route |
| 9 | Ancients | **The Closing** | We did it once badly. Do it properly, and end ourselves doing it |
| 10 | Quantum | **The Unresolved Lane** | Decline to have needed a road |
| 11 | Titan Lords | **The Weight of Ages** | Be so large the dark is weather |
| 12 | Shadow Realm | **The Assembled Frame** | Buy back all eleven fragments and finally read them |

---

## Shared rules — enforced, and the same for everyone

The point of a rule set is that a Wonder is a *commitment*, not a prize.

**1. One per empire per game.** You build your own or none. You cannot capture and operate another
race's Wonder — you can only destroy it. Wonders are not loot.

**2. It requires the race's third signature technology.** Each race's unique tech line ends in a
capstone that is the Wonder's prerequisite, and nothing else. No shortcuts, no purchase, no trade.

**3. It occupies one held sector and it cannot be hidden.** Construction is visible to any empire
that can see the sector, from the first turn of work. There is exactly one exception — the Shadow
Realm's, which has no site — and that exception is the whole point of the Shadow Realm.

**4. Maintenance is mandatory, per-turn, and it hurts.** Every Wonder has an upkeep, and every
upkeep is denominated in the thing that empire can least afford. Miss it and the Wonder goes
**dormant** — effects off, work preserved. Stay dormant too long and it is **lost**, and the
investment goes with it.

**5. It can be attacked, and it is the highest-value military objective in the game.** A Wonder
sector should be the thing whole wars are fought over. Nothing about a Wonder makes its owner safe.

**6. It does not win by existing.** A Wonder makes a victory condition *reachable* — it is an
accelerant, not an autowin. A player with a finished Wonder and no army still loses.

**7. Every Wonder has a stated danger, and the danger is narrative, not a debuff.** It is what
happens to the galaxy if this is the one that gets finished. The campaign uses these. Skirmish play
never has to mention them.

---

## Signature technologies — shared rules

Three per race, and they sit **inside branches that race is good at**, never in a locked one. They
are not extra levels of existing techs; they are exclusive capstones nobody else can research, and
the third is always the Wonder prerequisite.

- Each obeys `../11-laws-of-the-world.md` without exception. Nothing here lets anyone see into a
  sector, survive a collapsar, shield a shoal, or move faster than blind.
- Each is expensive enough to be a real choice against the ordinary tree, not a free bonus.
- Each is named the way that race would name it. The Mechanicus do not have a *Doctrine*; they have
  a *Standing Order*.

## Signature hulls and weapons — shared rules

Three per race. Ship type ids 1–9 are taken in `combat.js`, so these are **new exclusive hulls or
weapon fits** and they need engine work — this is the most expensive part of this folder and it
should be the last thing built, if ever.

- A signature hull must **not** hand a race the capability its access profile denies it. The
  Mechanicus signature hulls contain no scout and no intruder. The Titans' contain nothing small.
  The Swarm's contain no capital. **The refusals hold** — a Wonder pass is exactly where a setting
  usually breaks its own rules, and we are not doing that.
- Each should be recognisable in silhouette per that race's art notes.
- Weapons are fits, not hulls, where that is the more honest description.

---

## What this costs to build, honestly

In rough order of expense:

1. **The fiction** — done, in these files. Free.
2. **Wonder construction as a building type** with a multi-turn progress track, a per-turn upkeep
   check, dormancy, and a destruction path. Moderate: it is a building with a state machine.
3. **Twelve Wonder effects.** Highly variable. Some are near-trivial (a production multiplier, a
   movement discount). Some are substantial (Silicon's map reveal, Bioform's hazard conversion,
   Mechanicus's autonomous expansion). **Three or four of the twelve would carry most of the value** —
   see the recommendation below.
4. **Thirty-six signature technologies.** Cheap individually — the tech system is data-driven, and
   these are new entries with `raceExclusive` and new effect slots.
5. **Thirty-six signature hulls.** Expensive. New ship ids, new art, new balance surface, and a
   combat system that already has nine hulls to keep honest.

**Recommendation: build four Wonders first.** The Concord Lamp (the canonical one, and the campaign's
mission 9), the Mother Grove (the thematic keystone — the correct answer nobody will wait for), the
Endless Yard (the horror beat), and the Solved Sky (the cleanest mechanical effect: fog of war ends).
Those four prove the system, cover the four most distinct effect types, and carry the entire story.
The other eight are content, and content can wait.

# The Encyclopedia

A condensed reference: the core facts of this universe, in one place, in alphabetical order.

**What this is for.** `lore/` is 150,000 words across 26 documents. This file is the version you can read
in ten minutes and the version you check before writing anything. Every entry is short, and every entry
that has a number carries the number.

**Precedence.** Where this disagrees with code, the code wins. Where it disagrees with another lore file,
this file and `20-master-timeline.md` win. Figures marked ✓ are pinned by
`tests/lore-constants-match-code.test.js` or `tests/lore-sector-types-match-code.test.js` and will fail a
build if the code moves.

---

## A

**Ancients, the** — Not a nation; an order with a job. They **maintained** the Trellis and did not build
it. They began shutting it down in BU 61 and warned everybody in BU 8, which is **fifty-three years of
silence**. Homeworld never visited, possibly nonexistent. No Ancient body has ever been seen. Research
×1.5, attack ×1.5, durability ×1.5, everything costs ×1.5, economy ×0.8 — a civilisation spending an
inheritance.

**Artifact** — A field on every map sector. `lib/map.js` rolls **1–5 on 25% of all colonizable worlds**
and persists it, one value per world. **Nothing reads it yet** — the field is live, the mechanic is not.
Canon as of Q10: this is where a **relic** lies. See `27-the-unattributed.md`; `08-open-questions.md` Q10
is the authority. A Wonder needs **five relics**, every relic is unique, and the 1–5 value is an
identity axis for flavour rather than a grade or a kind (Q10b). A standard map carries about 17 relic
worlds, so at most three Wonders can ever be built on one.

**Asteroid Belt** *(sector type 1)* ✓ — A **shoal**. `dangerLevel 0.5`. Lethal to cross, survivable to
enter, and permanently safe once swept. Yields **4 crystal and 8 metal a turn** once secured. The only
hazard in the game that becomes an asset.

**AU / BU** — *After / Before the Unarriving.* The only calendar all twelve empires share, because it is
the only event all twelve witnessed. **The present is AU 74.** BU counts *down*: BU 61 is earlier than
BU 8.

## B

**Black Hole** *(sector type 2)* ✓ — A **mouth**. `dangerLevel 1.0`. No roll, no partial loss, no report.
Every mouth on every chart was placed there because a fleet was sent and none came back. Can be held; can
never be made safe.

**Brown Dwarf** *(sector type 4)* ✓ — *"A failed star with no planets."* Not colonizable, not hazardous,
**5% of every map**. The galaxy's navigational anchors: too dim to fight over, bright enough to fix a
position by, permanent.

**Building costs** ✓ — Metal Extractor 50/20 · Crystal Refinery 40/30 · Research Academy 60/40 · Spaceport
100/50 · Orbital Turret 80/60 · Warp Gate 200/150. *(metal/crystal)*

## C

**Cluster** — What a match is. The map is 14×8 sectors: a pocket of contested space, **not the galaxy**.
Domination is 75% of *this cluster's* worlds. See `19-canon-and-variance.md`.

**Colony Ship** ✓ — 500 metal, **zero crystal**, no armament. Carries about nine hundred people who are
not coming back. The only hull a rival will sometimes let pass, and nobody has ever written that down.

**Concord, the** — The high period, roughly BU 900 to BU 60. Lit transit made the galaxy one place, so
every race over-specialised, safely. **Every capped tech branch and forbidden hull in the game is a
Concord-era decision that was correct at the time.**

**Crystal** ✓ — What you burn to know where you are. Refined it is called **reckoning** and it is
*consumed*, never recovered. Runs at roughly half of metal everywhere. Spent on probes (300), fleet
movement, spycraft, structures, and every hull from Cruiser upward. **Scout, Frigate, Destroyer and
Colony Ship cost none.** Blue-to-cyan, faceted spire, cold to the touch, rings when struck, and there is
a white core inside it that nobody will explain. Full treatment in `25-crystal.md`.

## D

**Deceleration** — A ship arriving at a hazard is slowing and gets a few seconds of sight, which is why
**arrival is 25% loss per hull and transit is 50%** ✓. Buys seconds, never minutes. Codified as Void
Walker doctrine, named after a courier who was disciplined for it.

**Departure** — Leaving a shoal you already hold is never rolled. There is no code for it. Do not add
any.

**Dimming, the** — The era after the Lamps went out. The present. Seventy-four years and counting.

## E

**Endless Yard, the** — The Mechanicus Wonder: a work order with **no completion condition**. Advances,
occupies, annotates, continues, and cannot be cancelled because there is no office that could cancel it.
It is the galaxy's clock — see **Escalation** below.

**Escalation, the galaxy's one piece of rising pressure** — AU 12: four heavy Mechanicus hulls enter
sector 9-D, nothing returns, annotation reads *requires heavier hull, revisit*, **with a review
interval**. AU 68: the Ancients' watch logs seven patched hulls passing at one sector, on a schedule,
nobody dispatched. AU 74: the annotation comes due **this decade**. 9-D is adjacent to the origin
coordinate.

## F

**FTL is blind** ✓ — Law 1, absolute, no exceptions for any race or tech level. A ship above light speed
receives no information about what is ahead; the information arrives with the ship. **Everything else in
the setting is a consequence of this.**

## H

**Hazard cannot be shielded** ✓ — Law 4. Deflectors make *aimed* shots miss. Gravel at closing speed is
not aimed. The best-shielded hull in the galaxy rolls the same odds as a frigate. Only two sector types
are `hazardous`, at 0.5 and 1.0.

**Homeworld** *(sector type 10)* ✓ — Where you were standing when the Lamps went out. **Nobody chose their
capital.** Yields 35 metal / 18 crystal / 5 research. *"The world we were left on"* is an idiom, not
poetry.

## L

**Lamps, the** — Beacons that gave a ship at superluminal speed advance knowledge of the space ahead. A
lit lane was safe. Nobody knows how they worked. **Nobody can build one** ✓ — completing the tech tree
reaches the threshold, which is what Scientific Victory means, and the Galactic Wonder is a Lamp.

**Long File, the** — *Registry Series 9.* Twelve testimonies about the nine days, collected over forty
years by Chart-Warden Ilsa Rell, who died in AU 68 with it unfinished. Each carries one fact; together
they spell out the quarantine. **No character in the world has read them together.**

## M

**Metal** — Bulk. Hulls, structures, ordnance. Deliberately unmysterious. Roughly twice as plentiful as
crystal at every sector grade.

**Mouth** — See **Black Hole**. Navigator's word, and the only one anybody uses.

**Move discount cap** ✓ — Propulsion research reduces movement cost by 8% a level, capped at **60%**.
Below that the cost stops being reckoning and becomes hull fatigue and crew, which no research reduces.

## P

**Probe** ✓ — **300 crystal.** No crew, no armament, no return. Takes the *arrival* roll, so 25% at an
unswept shoal. Thirty-three turns of a small planet's crystal for one sector's truth, and it is still the
cheap option.

## Q

**Quarantine, the** — Canon: the Trellis was shut down deliberately, from the inside, by the Ancients,
because the lanes ran both ways and something was using them. The shell has been propagating since BU 61,
will complete in about nine hundred years, and **cannot be stopped**. There is still-lit space outside
it, receding faster than anyone can travel.

**What is behind it is never designed, named, or shown** ✓ — Law 25. We show effects: a docking schedule
with a gap in it.

## R

**Reckoning** — Refined crystal. Mass noun: *"we are out of reckoning."* The double meaning is
deliberate and never pointed at.

**Registry, the** — Terra's archive. Sets the galactic standard for mass, distance, hull class and
casualty reporting, with no authority to do so, because during the Shortening it was the only institution
still publishing. **The race list players see is a Registry document, and it is incomplete.**

**Relic** — A piece of an Unattributed mechanism, buried on a world. It does nothing alone, cannot be
manufactured, and cannot be reverse-engineered: it is the component the old documentation assumed you
already had. Found through *development* rather than time, at most one per world, and it **transfers with
the ground** — so a relic world is worth defending. Bring enough together and you can build a Galactic
Wonder. Canon as of Q10; unbuilt. The word replaced an earlier coinage, *a leaving*, which collided with
the Void Walkers' form language.

## S

**Sector types** ✓ — 0 Empty Space · 1 Asteroid Belt · 2 Black Hole · 3 Unstable Star · 4 Brown Dwarf ·
5 Small Moon · 6 Micro Planet · 7 Small Planet · 8 Medium Planet · 9 Large Planet · 10 Homeworld.
Colonizable is **6–10** ✓ (`victory.js` queries `BETWEEN 6 AND 10`). Generation: black hole 5%, belt 10%,
unstable star 5%, brown dwarf 5%, small moon 5%, micro 15%, small 20%, medium 15%, large 10%, empty 10%.

**Shortening, the** — AU 0–30. The logistical collapse. **Killed far more people than the Unarriving
did**, and nobody memorialises it, because famine has no enemy in it.

**Small Moon** *(sector type 5)* ✓ — *"A small moon without an atmosphere."* Not colonizable, not
hazardous, 5% of every map. Worthless as ground and decisive as a position: a rock at a junction of four
traces is a door.

**Spaceport tiers** ✓ — Capacity 12 / 20 / 32 / 48. Cumulative cost to tier four: **2,850 metal and 900
crystal**, gated on Military Shipyards levels 1, 2 and 3.

**Sweeping, the** — AU 30 to now. The era of buying safe space one sector at a time, in hulls. The game's
present tense, and the only positive-sum act in it.

## T

**Terraforming** ✓ — Five levels, max 5. Per Law 16 it takes **generations**: the ladder makes a world
*reachable*, not habitable. Every level is somebody's grandchildren. There are four level-fives within
reach of anybody and all four were finished before the Lamps went out.

**There is no build time** ✓ — Hulls and buildings complete the moment you pay for them. The gate is
**production capacity**, not elapsed turns. Documented in `races.js`; guarded by test.

**Trace** — A route somebody has flown and survived. The most valuable object in the galaxy. Property:
inherited, sold, stolen, forged. A **clean trace** has been flown with no loss. Traces **decay**, because
gravel drifts; a twenty-year-old trace is a rumour with paperwork.

**Trellis, the** — The ancient network of surveyed, swept, lit lanes. Nobody alive built it. Twelve
species grew on it the way vines grow on a frame and discovered, when it was removed, that they could not
stand.

## U

**Unarriving, the** — **AU 0.** Nine days in which every ship in superluminal transit failed to arrive.
No signal, no flash — an absence in a docking schedule. **The number lost is not known, because the count
was kept by the Trellis.** Formal, written term; in speech people say *the nine days* or *when the Lamps
went out*.

**Unstable Star** *(sector type 3)* ✓ — *"An unstable star that emits dangerous radiation."* Not
colonizable, **5% of every map**, and currently carries **no hazard flag** — the danger is fiction the
engine does not enforce. Flagged as an open question.

## V

**Victory conditions** — Five active. **Domination** 75% of colonizable worlds · **Elimination** last with
a world · **Economic** 100,000 total resources · **Scientific** every technology available to your race ·
**Time** most ground at turn 90 (Quick) or 120 (Epic). Two are disabled in code: Galactic Wonder and
Alliance. Q10 revives the Wonder condition — build it from relics, hold it, win — but it is still
`enabled: false` today, and do not switch it on before reading `STATUS.md` decision 3b: its clock is
computed from the turn the Wonder was *built* while the row is found by current owner, so a captor would
inherit the elapsed time and win instantly.

**Scientific Victory is the mistake.** Completing the tree means you can relight the lanes. The game's
own win screen is the story's climax.

## W

**Whisper, the** ✓ — The surviving Trellis relay layer. Carries **voice and text instantly, anywhere**;
carries **no cargo, no people, no sight, and cannot guide a ship**. This is why twelve empires can
negotiate while unable to reach each other, and why players have a chat channel and still cannot see
enemy space. Families separated in AU 0 have been talking for seventy-four years and have never met.

**Wonder** — A civilisation's entire answer to the dark, made physical. One per empire ever; cannot be
captured, only destroyed; maintenance denominated in what that empire can least afford; **never wins by
existing.** Eleven of the twelve reopen the road. One makes the road unnecessary and is far too slow for
anyone to choose. One closes it forever at the cost of the people who build it.

---

## The twelve, in one line each

| Race | Their answer to the dark | What they refuse |
|---|---|---|
| **Terran Empire** | Write everything down | To specialise in anything |
| **Silicon Collective** | Compute it | Ordnance you cannot recall |
| **Zephyr Swarm** | Arithmetic — send enough that some arrive | Any hull that could be mourned |
| **Crystalline Entity** | Endure it | Weapons that are not part of the body |
| **Void Walkers** | Outrun it | Armour, as an admission of slowness |
| **Mechanicus** | Don't look | Reconnaissance, entirely |
| **Bioform Collective** | Grow into it | Fortification, and the Trellis itself |
| **Star Nomads** | Never stop | To want a planet |
| **The Ancients** | We remember when it was light | To explain themselves |
| **Quantum Entities** | Decline to have crossed it | Being definitely anywhere |
| **Titan Lords** | Be too large for it to matter | Haste, and smallness |
| **Shadow Realm** | The dark suits us | To be counted |

## The five things that are never explained

How a Lamp worked · Who built the Trellis · What is behind the quarantine · What Courier Wren saw in the
lane · What the Ancients eat.

## Where to look for more

| For | Read |
|---|---|
| Current canon and delivery status | `STATUS.md` |
| Hard rules and what is impossible | `11-laws-of-the-world.md` |
| Any date, sequence or number | `20-master-timeline.md` |
| What is fixed versus what a match decides | `19-canon-and-variance.md` |
| What a thing is called | `07-glossary.md` |
| The twelve places | `12-civilisations/` |
| The twelve peoples | `14-peoples/` |
| Why one race beats another | `21-matchups-and-mysteries.md` |
| Stories about every object in the game | `24-anthology/` |

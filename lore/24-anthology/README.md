# The Anthology

Status: **PROPOSED**. Production-bound: every piece here is sized and shaped to be a codex entry, a
loading-screen read, or a tooltip's long form. This is content for the game, not reference for writers.

**The purpose.** Every object in this game — nine hulls, six buildings, nineteen technologies, eleven
sector types, twelve Wonders — is currently a number with a name. This folder gives each one a story
in which somebody uses it, loses it, or is killed by it. A player who has read a hundred of these does
not learn *lore*; they learn that a Reinforced Hull is the reason a specific woman came home.

**And it is remediation.** The report card grades **Agency C** — *"nearly every piece of fiction is a
report of something already finished"* — **Emotional range C**, and **Sensory concreteness A−**
(*"described in a bible, never experienced in a scene"*). A hundred short pieces in which things happen
to named people is the direct answer to all three, which is why this is the right work to do at length.

---

## The form

**150–250 words. No exceptions.** Long enough for a turn, short enough for a loading screen, and short
enough that a hundred of them is achievable at quality rather than at volume.

Every piece obeys these:

1. **One named person, and they do something.** Not a witness recounting. A person acting, now, and
   paying for it. This is the whole point of the folder.
2. **One object.** The piece is *about* a hull, a tech level, a building, a sector type. If you could
   swap the object out and the story survived, it is not doing its job.
3. **It ends on a turn or an image.** Never a summary, never a moral, never "and that is why."
4. **Canon is load-bearing.** FTL is blind. Shoals are 50% crossing and 25% arriving. A mouth is never
   a dice roll. Crystal is what you burn to know where you are. Nothing here may contradict
   `11-laws-of-the-world.md` or `20-master-timeline.md`.
5. **Humour never touches a loss** (`17-the-feed/06-refusals.md`). Comedy lives at tables, in markets,
   in paperwork.
6. **Both sides get one.** Where a piece is about a weapon that destroyed a fleet, somewhere there is
   a piece from inside that fleet. Named pairs are marked **↔**.

## What is deliberately not here

No piece explains the Trellis. No piece names what is behind the quarantine. A player assembling the
setting from these should end up curious, not briefed.

---

## Index

| File | Subject | Pieces |
|---|---|---|
| `01-sectors.md` | Every sector type, including mouths, shoals and unstable suns | 9 |
| `02-hulls.md` | The nine hull classes | 9 |
| `03-armour-and-shields.md` | Armour and shields, by level, from both ends | 8 |
| `04-weapons.md` | Lasers, plasma, antimatter, rocketry, Hyper-V | 8 |
| `05-buildings.md` | The six structures | 6 |
| `06-probes-and-colony-ships.md` | The two hulls that are not warships | 5 |
| `07-colonists.md` | Arriving, and what it costs | 6 |
| `08-terraforming.md` | Three generations of work | 5 |
| `09-travel.md` | Running dark, traces, warp gates | 6 |
| `10-spying.md` | Espionage, counter-intelligence, salting | 5 |
| `11-battle.md` | Fleet actions, from both sides | 7 |
| `12-leadership.md` | From the top, and from the ranks | 7 |
| `13-wonders.md` | The twelve Wonders, in myth form | 12 |
| `14-race-weapons.md` | The signature weapons, as their own people tell them | 12 |

**104 pieces, all fourteen files complete.** Each file states its own count in its header.

*(The index above says 9 for `01-sectors.md`; it has 8 headings covering 9 sector types, because the four
colonizable grades are one piece. Nine types, eight pieces, no gap.)*

### Research coverage — deliberately distributed, not a separate file

The nineteen technologies in `tech.js` do not get their own file, because a technology is only interesting
where somebody uses it. They are covered where they bite:

| Branch | Where |
|---|---|
| Armor, Shields | `03-armour-and-shields.md` — Reinforced Lv1 and Lv5, Reactive Lv3, Adaptive Lv3, Deflector Lv1, Phase Lv4 |
| Weapons, Missiles | `04-weapons.md` — Laser Lv1 and Lv5, Plasma Lv3, Antimatter Lv3, Rocketry Lv1, Hyper-V Lv3 |
| Economy | `05-buildings.md` — extraction, refining and research as the buildings that embody them |
| Propulsion | `09-travel.md` — Ion Lv3, Warp Lv3, and why the discount caps |
| Shipyards | `02-hulls.md` — each hull states the level it needs |
| Orbital | `05-buildings.md` — the turret and the Warp Gate |
| Terraforming | `08-terraforming.md` — Lv1, Lv3, Lv5, and two races' refusals |
| Intel | `10-spying.md` — Espionage Lv2 and Lv6, Counter-Intel Lv4 |

---

## Known defect, disclosed rather than hidden

**The numbers "nine" and "eleven" appear 192 times across 104 pieces, and only 24 of those are
canon-locked** (*nine days*, *eleven thousand berths*, *thirty-one names*, *forty-one times*, *nine hundred
years*). The remaining ~168 are arbitrary, which is a visible authorial tic: a reader who gets through
twenty of these will start noticing that the writer has two favourite numbers.

**Why it is not fixed in this pass.** Many arbitrary instances are load-bearing *across* pieces — nine
hundred Zephyr hulls in `04-weapons.md` pairs with three hundred and forty losses in the piece beside it,
and the sector designations, crew counts and tallies cross-reference between files. A mechanical
find-and-replace would break those quietly, and Internal consistency is a grade this folder has worked hard
for. A careless style fix is not worth a real continuity regression.

**The remediation** is a per-piece editorial pass with the cross-references checked by hand, which is a
separate job and is logged as one. Until then: **when adding a piece, do not reach for nine or eleven.**

## Two conventions

**↔ marks a pair.** The same engagement from both ends, in two different files. A weapon story and its
victim. Read either alone and it works; read both and one of them becomes worse.

**Names are reused deliberately.** The same crews, ships and officers recur across files — Sesse,
Halloway, the *Diligence*, Yard Nine, Berth-Keeper Onn. A hundred stories about a hundred strangers is
an encyclopaedia. A hundred stories about forty people is a place.

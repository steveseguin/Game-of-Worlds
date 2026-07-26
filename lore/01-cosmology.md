# Cosmology — How the Galaxy Works

Status: **PROPOSED**. Every mechanical claim in this document is **LOCKED** by shipped code;
only the explanations are mine.

The purpose of this document is to make sure that every piece of copy we ever write — a
tooltip, a bark, a mission briefing — is describing the same physical universe. When a
Titan Lord and a tutorial hint disagree about what a shoal is, the world stops existing.

---

## 1. Flight

There are two ways to cross between stars, and the difference between them is the setting.

### Lit transit — how it was done

The Trellis was a surveyed network of lanes, each one swept clear and marked at intervals by
beacons called **Lamps**. A Lamp did one thing: it gave a ship travelling at superluminal
speed advance knowledge of the space in front of it. Nobody now can say how. The working
theory in every surviving admiralty is that the Lamps did not observe the lane so much as
*hold it open* — that a lit lane was a slightly different piece of physics from the dark
between stars.

Lit transit was safe, fast, and so ordinary that no civilisation kept careful records of it,
the way no one records the location of their own staircase.

### Running dark — how it is done now

A ship that leaves a star system now accelerates to relativistic speed and **cannot see where
it is going.** Not "has poor sensors." Cannot. At that speed the information about what lies
ahead arrives at the same moment the ship does.

Everything else follows from this:

- **A gravel bank is ordnance.** A pebble met at a meaningful fraction of light speed does
  what a warhead does. This is why asteroid belts — *shoals*, in navigator speech — destroy
  ships. There is nothing exotic about it. It is kinetic arithmetic.
- **Deceleration buys sight.** A ship whose destination *is* the shoal is slowing as it
  approaches. It gets a few seconds. Some hulls use them. This is why arriving at a belt is
  materially safer than crossing one, and it is the only mercy in the system.
  *(Code: `BELT_LOSS_CHANCE_TRANSIT` 0.5, `BELT_LOSS_CHANCE_ARRIVAL` 0.25.)*
- **Leaving is free.** A ship departing a shoal it already occupies is accelerating away
  through space it has already charted. It is never rolled. *(Code has no path for it, by
  design. Do not add one.)*
- **Every hull rolls alone.** A shoal does not eat fleets; it eats ships. Four hulls cross,
  and any two of them can die. There is no formation that helps.
- **Knowing does not help. Owning does.** Seeing a shoal on your chart does not improve your
  odds one point — it lets you plot a route *around* it. But a shoal you have taken and hold
  has been swept: surveyed, cleared, and threaded with a marked corridor. Yours is safe
  forever, and it yields ore.

That final rule is the strategic soul of the game, and its meaning in the fiction is worth
saying plainly: **the galaxy is not being conquered. It is being made survivable, at a
price, by people who will not see the benefit.** A swept shoal is a monument to the fleet that
died learning it.

### Mouths

A collapsed star is not a hazard. It is an **absence**.

A ship running dark into the gravity well of a collapsar does not fight, does not signal, does
not partially survive. It does not arrive. There is no roll in the code and there is no roll
in the world.

Nobody has ever mapped a mouth by observing one. Every mouth on every chart in the galaxy was
placed there because a fleet was sent through that sector and no fleet came out. The formal
term is *collapsar*; every navigator in twelve languages calls it a mouth, and the phrase
"there is a mouth at Anselm" always means the same thing: *we sent people to find out.*

**A note on ownership.** A player can hold a mouth sector — and it stays lethal. This is
correct and should never be softened. Sovereignty is knowledge, and there is nothing to know
about a mouth except that it is there. You can put a flag on the edge of it. You cannot make
it safe. It is the one place in the setting where the game's central promise — *pay, and the
dark becomes yours* — does not apply.

---

## 2. Charts

The most valuable object in the galaxy is a **trace**: a route from one star to another that
somebody has flown and survived. *(The code has called them this all along —
`traceDirectRoute()`.)*

Traces are property. They are inherited, stolen, forged, sold, and used as dowries. A **clean
trace** is one that has been flown at least once with no loss. A trace's value is not in the
distance it covers but in the mouths and shoals it *misses*, which is why a long trace is
often worth more than a short one, and why the shortest route between two stars is usually the
one that killed somebody.

This is what the Intel branch of the tech tree actually is:

- **Espionage Networks** — reading someone else's charts. You are not learning their plans;
  you are learning their *routes*, which is worse, because a route is a truth that cost them
  hulls and it will cost you nothing.
- **Counter-Intelligence** — poisoning yours. At sufficient advantage, an enemy probe over
  your territory is destroyed. It is not shot down. It is *given a false trace* and it flies
  where the trace says. The engine calls this "probes destroyed outright." In-world it is
  called **salting**, and it is considered by most admiralties to be within the laws of war,
  and by the Star Nomads to be the single most obscene act one civilisation can commit
  against another.

Write this down, because it is the best flavour hook in the game: **the Nomads have a funeral
rite for a salted probe.** Nobody else does.

---

## 3. Crystal, and the thing nobody says out loud

The game has two materials. One is boring on purpose and one is the whole theme.

**Metal** is bulk. Hulls, girders, extractors, ordnance. It is dug, smelted, and spent, and
nothing about it is mysterious. Metal builds the ship.

**Crystal** is the substance that lets a ship compute a blind jump. Raw, it is mined; refined,
it is called **reckoning**, and it is consumed by exactly three things — probes, fleet
movement, and spycraft. Look at that list. Those are not three systems. They are one system:
*crystal is what you burn to know where you are.*

And here is the fact the setting is built on, which no empire's public history mentions:

> **The Trellis was made of it. So were the Lamps.**

Every crystal refinery in the galaxy is processing the same material the old network was grown
from. Some of the richest deposits are, on inspection, not deposits. Nobody has proved this.
Everybody suspects it. Three of the twelve races have made it doctrine, and one of them —
the Crystalline Entity — is *made of the stuff*, which turns the galactic reckoning market
into a question that polite empires have agreed not to ask in front of them.

So the image at the centre of the world is this: twelve civilisations, groping through a dark
they did not make, funding every step by mining the corpse of the thing that used to keep
them safe.

That is the game. Everything else is detail.

---

## 4. A sector

The map is a grid of sectors. A sector is one star system or one span of open space — call it
a few light-years, and never be more precise than that in copy, because precision here buys
nothing and can only trip us later.

| Type | Name in code | What it is in the world |
|---|---|---|
| 0 | Empty Space | Open dark. Nothing to hold, nothing to fear, nothing to gain. |
| 1 | Asteroid Belt | A **shoal**. Lethal to cross, survivable to enter, safe once swept. |
| 2 | Black Hole | A **mouth**. Absolute, permanent, unownable in any real sense. |
| 3–5 | *(other hazards)* | **OPEN** — unassigned. See `08-open-questions.md`; there are three free slots here and I have candidates. |
| 6–9 | Colonizable Planets | Worlds, in ascending order of what they will give and what they demand. |
| 10 | Homeworld | Where you were standing when the Lamps went out. |

**Homeworlds deserve a line of their own.** No empire chose its capital. Every homeworld in
the galaxy is simply the planet its people happened to be standing on when lit transit ended —
which is why so many of them are badly sited, why the Star Nomads are ruined, and why the
phrase "the world we were left on" is a common idiom rather than a poetic one.

Terraforming is the ladder that makes harsher worlds reachable (`TERRAFORMING` levels 1–5).
In-world it is not gardening. It is the slow, expensive, multi-generational work of making a
place habitable that nobody would have settled if they'd had a choice, and the races with
capped terraforming are not technically backward — they have decided, for reasons that are
always specific to them, that they will not do it.

---

## 5. Time and scale

- A **turn** is a campaign season: long enough for a fleet to cross several sectors, a colony
  to be founded, and a research programme to conclude. Never state a number of days.
- Match lengths (90 turns Quick, 120 Epic) are the span of **one war**, not one lifetime.
  A commander who begins a game finishes it.
- The **present day** is roughly three generations after the Lamps went out. This is the
  single most important number in the timeline and it is chosen deliberately: long enough
  that nobody in the game remembers lit transit personally, short enough that everybody knew
  someone who did. Grief at one remove. It is the most useful emotional distance there is —
  the characters are not mourning, they are *inheriting* a mourning, which is a much more
  interesting thing to play.

---

## 6. What we do not explain

Some things must stay dark. Listed here so no one accidentally fills them in:

- How a Lamp worked.
- Who built the Trellis. *(The Ancients maintained it. That is not the same claim, and the
  distinction is a campaign beat — see `06-campaign.md`.)*
- Whether the twelve races are related. Convergent history is stranger and more interesting
  than a common ancestor, and a common ancestor is the single most overused move in the genre.
- What is on the other side of the quarantine. **The campaign shows its effects and never
  shows it.** If we ever design it in full, we have lost.

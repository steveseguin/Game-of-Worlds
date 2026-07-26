# Crystal

Status: **PROPOSED** fiction over **LOCKED** mechanics. Every number below is quoted from the code and
pinned by `tests/lore-constants-match-code.test.js`. Where the code and this document disagree, the code
is right.

---

## Part 1 — What the code says crystal is

Read the mechanics first and the fiction almost writes itself.

### Where it comes from

`SECTOR_YIELDS` in `server.js`, per turn, before bonuses:

| Sector | Metal | **Crystal** | Research |
|---|---|---|---|
| Asteroid belt *(only once secured)* | 8 | **4** | 0 |
| Micro planet | 10 | **6** | 1 |
| Small planet | 16 | **9** | 1 |
| Medium planet | 22 | **12** | 2 |
| Large planet | 30 | **16** | 2 |
| Homeworld | 35 | **18** | 5 |

Plus `BASE_INCOME` of 5 crystal a turn regardless of holdings, and a per-sector `crystalbonus` rolled at
**50–250%** when the map is generated.

Three things fall out of that table and all three are load-bearing:

1. **Crystal runs at roughly half of metal, everywhere.** Not rare — *scarce*. It is a commodity you are
   always slightly short of, not a treasure you hunt.
2. **A secured asteroid belt yields crystal.** The engine pays you 4 a turn for a swept shoal, which is
   the mechanical confirmation of the setting's central loop: the thing that killed your fleet becomes a
   mine. The fiction has always said "and a small mine." The number is 4.
3. **A homeworld out-produces a large planet by only 2.** Crystal does not scale with grandeur. It scales
   with *ground*.

### Where it goes

Crystal is the only resource in the game spent on all four of these:

- **Probes — 300.** At a small planet's 9 a turn that is thirty-three turns of output for one sector's
  truth.
- **Fleet movement.** `SHIP_MOVE_COST` is derived per hull from `movementCost / 100`, so moving anything
  costs crystal and moving a dreadnought costs a great deal of it.
- **Spycraft.** The Intel branch runs on it.
- **Structures and the heavier hulls.** Buildings take 20–150; spaceport upgrades 100, 250, 500.

And the detail that explains what crystal actually *is*:

| Hull | Metal | **Crystal** |
|---|---|---|
| Scout | 200 | **0** |
| Frigate | 430 | **0** |
| Colony Ship | 500 | **0** |
| Destroyer | 780 | **0** |
| Cruiser | 980 | **120** |
| Intruder | 1,950 | **133** |
| Battleship | 1,650 | **220** |
| Carrier | 3,000 | **80** |
| Dreadnought | 3,200 | **450** |

**Four hulls need no crystal at all.** A scout, a frigate, a destroyer and a colony ship are metal and
crew. Everything from a cruiser up needs it, the dreadnought needs the most by a wide margin, and the
Intruder needs an unreasonable amount for its tonnage.

That is not a balance quirk. That is a description of the substance.

---

## Part 2 — What it is

**Crystal is what you burn to know where you are.**

Raw, it is mined. Refined, it is called **reckoning**, and it is consumed — not stored, not recovered,
*spent*. It goes into three things and they are the same thing:

**A nav-core.** A hull above light speed is blind (Law 1) and cannot be flown on instinct beyond a certain
mass. A frigate is thrown; her crew feel her out and she is small enough to be wrong about. A dreadnought
of three thousand two hundred tonnes cannot be *felt*, and every blind crossing she makes is a computed
solution — burning reckoning to hold a course nobody can see. **That is why the crystal cost tracks
sophistication rather than size**, and why the Intruder pays 133 for signature suppression that is also
computation, and why the Carrier pays only 80 because a hangar is just volume.

**A probe.** Three hundred, which is the whole vehicle: the reckoning is the probe. What you are buying is
not a hull, it is a *computation performed at a distance and reported back*.

**An agent's paper.** Charts, forged traces, salted routes. Reckoning is the medium in which position is
recorded, so it is also the medium in which position is falsified.

### The thing nobody says out loud

The Trellis was made of it. So were the Lamps.

Unproven. Universally suspected. The Crystalline Entity is made of it too, and every refinery in the
galaxy is processing the same material the old network was grown from — which means twelve civilisations
are funding every step through the dark by mining the corpse of the thing that used to keep them safe.

`01-cosmology.md` holds the full statement. It is never confirmed on screen.

---

## Part 3 — What it looks like

Taken from the shipped art, not invented: `public/images/crystalline-icon.svg` and the resource-bar SVG
in `game.html`.

**Colour.** A vertical gradient from **deep indigo (#2f3a88)** at the crown to **bright cyan (#7be8ff)** at
the base, edged in near-white ice (**#d5faff**). The treasury icon uses the same family — a blue prism,
**#5aa8e8** body, **#bfe4ff** top facet, **#3d86c4** in shadow — lit from above.

**Form.** Not a lump and not a gem. A **faceted spire**: one main blade with two shorter blades flanking
it and a distinct inner column running up the middle. It grows in clusters that share a base.

**And the detail that matters most, because it is in the file and nobody put it there by accident:** at
the centre of the icon there is **a white core, at 0.9 opacity**. Something inside a crystal is brighter
than the crystal.

Refiners will tell you the core is an artefact of lattice alignment and that it means the specimen is
sound. Elder Sarn of the Standing, asked about it once, took four months to answer and then said: *"You
have noticed the light. Good. We have never been able to decide whether to tell anybody."*

**Sensory.** Cold to hold — genuinely cold, several degrees below ambient, and refiners wear gloves not for
safety but because a raw spire pulls heat out of a palm. It rings when struck, a long thin note that dies
slowly. Cut faces smell faintly of ozone. And a refinery floor at night has no lamps on it, because the
stock provides enough light to work by.

---

## Part 4 — How it is obtained

Four ways, in ascending order of what they cost.

**Ordinary extraction.** A Crystal Refinery, 40 metal and 30 crystal, on any world you hold. This is
ninety per cent of all crystal in the galaxy and nobody finds it interesting. Silicate strata, a shaft, a
cracking floor, a canister.

**Belt working.** A swept shoal yields 4 a turn. Lower grade, awkward to work, and it comes with the
grim satisfaction of being paid a small dividend by the thing that killed your crews.

**Yielding-grade.** From Sarn's World, quarried out of regions the Standing has determined to be **inert**
— no longer anyone. The highest grade anybody has ever refined, and the reason eleven empires conduct one
particular trade very politely and never say the second sentence. See
`15-series-twelve/04-crystalline.md`: Elder Tessen made a determination in AU 31 and has spent forty years
unable to find out whether it was right, because the answer is in eleven fleets and has been burned.

**And the fourth, which the engine generates and nothing uses.** See Part 6.

---

## Part 5 — Stories

### "The Cracking Floor"

Refiner Tanu has run the floor at Vail Gate for nineteen years and starts every tour the same way: she
turns the lights off.

"People expect a foundry. Heat, noise, somebody shouting. It is not that. It is cold and it is quiet and
you can read by the stock."

Raw spires come in on pallets, blue-black at the crown and turning to cyan at the base where they were
cut from the cluster. The floor does two things to them: aligns and reduces. What comes out is powder in a
canister, and the canister is the thing every empire actually spends.

"They ask me what refining *is*. I tell them it is making the lattice agree with itself. A raw spire is
about eleven per cent useful. Aligned, it is nearly all useful. Nothing is added. We take out the
disagreement."

Then she does the demonstration she has done four hundred times: two canisters on a bench.

"That one is a probe. Not the parts of a probe — *that is a probe*, three hundred of it, the entire cost.
And that one" — smaller — "is one fleet moving one sector."

Somebody always asks where it comes from. She always tells them, and it always changes the room.

### "Sixty Below"

Apprentice Deshan took his gloves off on his second day, to feel one.

"Everybody does it once. They tell you not to and they know you will."

Cold does not describe it. A raw spire at working temperature will take the heat out of a palm faster than
skin can replace it, and the pain arrives about four seconds after the contact, by which point the hand
has stopped being useful for a while.

He has the mark still — a pale patch across three fingers that does not tan.

"The floor master looked at it and said *now you know why we log the stock temperature*, and went back to
work. That was the entire lesson and it was the right length."

What he did not expect was the second thing.

"It *rang*. When I dropped it. A long thin note, and it kept going after it stopped rolling, and everybody
on the floor looked up. Not because of the noise. Because dropping one is a hundred crystal on the
concrete and they wanted to see whose it was."

### "What Nine Hundred Looks Like"

Quartermaster Tanu — no relation to the refiner, and tired of it — keeps the reckoning ledger at Ordel
Gate, and she is the only person there who thinks about crystal as a *rate*.

"Fleet commanders think about it as a wall. Do I have enough. I think about it as a river."

Her board: a small planet yields 9 a turn. A probe is 300. So one small world funds one probe every
thirty-three turns, and a Gate with eleven worlds funds one about every three.

"Which means that when somebody senior says *send a probe first*, what they are actually saying is
**spend a third of a turn's worth of the entire Gate's crystal**. And when they say *send the fleet and
find out*, they are saying spend hulls instead, because hulls are metal and metal is twice as easy."

She has watched officers make that trade badly for nine years.

"Nobody is wrong about the arithmetic. They are wrong about which resource they are short of, which is a
different mistake, and it is always crystal, and it is always crystal because crystal is the only thing
you cannot dig faster."

### "The Line Item"

There is a line on every empire's quarterly accounts and it is worded differently in each of them.

Terra: *Reckoning stock, Yielding-grade, acquired.* The Silicon Collective: *Inert silicate, sourced,
Sarn's World.* The Star Nomads, who are the only ones who have never softened it, write **purchases from
the Standing**.

Berth-Keeper Onn buys the least of anybody and asks the most questions.

"Every load has a determination behind it. Three elders weighed a region and decided it was nobody, and
then it was quarried, and now it is in my nav-cores. So I ask which determination. I ask the date. I ask
who weighed it."

Nobody else asks. Onn has been told, gently, by two admiralties, that asking is unhelpful.

"It is the only question in the transaction. Everything else is tonnage."

It is also why Elder Sarn will receive a Nomad broker and has kept nine other empires waiting for
decades.

---

## Part 6 — The artifact field, and an honest gap

**A real dangling mechanic, found by reading the generator rather than the documents.**

`server/lib/map.js`, in `generateGameMap`:

```
if (sectorType >= SECTOR_TYPES.MICRO_PLANET.id && random() < 0.25) {
    artifact = Math.floor(random() * 5) + 1;
}
```

So **twenty-five per cent of every colonizable world** — micro through homeworld — carries an `artifact`
value of **1 to 5**. It is written into the map table on creation. There is a column for it in both
schemas.

**Nothing reads it.** Not the income calculation, not combat, not victory, not the client. It is
generated, persisted, and inert, and no document in `lore/` has ever mentioned it in 150,000 words.

### The fiction it is asking for

I am not going to write pieces claiming artifacts *do* something, because they do not, and that is the
exact error that put a Wreck Field into two sector slots that were already occupied. What follows is a
**proposal**, marked as one.

The obvious and best reading is that the artifact field is where the **Trellis remnant** sits on the map.

A world with artifact 1 has a fragment — a hand-sized piece of something that is not metal and is not
crystal and has no seam. A world with artifact 5 has a **structure**: nine kilometres of it, dark,
intact, and unreadable, of the kind Deputy Warden Halloway once stood under and came away understanding
that eleven empires are illiterate.

That reading costs nothing, uses a field that already exists at a distribution that already works, and
gives every Lamp programme in the galaxy a physical reason to want particular worlds. It also explains why
the highest-grade reckoning and the oldest ruins are the same substance.

**What it needs before it is canon:** a decision about whether artifacts do anything mechanically. If they
never will, the field should be documented as decorative and the fiction should stay quiet. If they
should, this is the cheapest story-per-line-of-code available anywhere in the game — the distribution and
the storage already exist. Logged in `08-open-questions.md`.

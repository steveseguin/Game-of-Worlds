# The Twelve — Roster

Status: **PROPOSED**. Registry names, stat lines, capped branches and locked hulls are all
**LOCKED** by `server/lib/races.js`.

---

## The frame: one question, twelve answers

A faction roster is weak when each race is a different flavour, and strong when each race is a
different **answer to the same question.** The question this galaxy asks is:

> *How do you cross a dark you cannot see into?*

Twelve civilisations have twelve answers, and every one of them is *committed* — which is why
each race's locked tech branches and forbidden hull classes are not balance compromises but
statements of belief. Read the table with that in mind:

| Registry name | Their answer to the dark | What they refuse |
|---|---|---|
| Terran Empire | *Write everything down.* | To specialise in anything |
| Silicon Collective | *Compute it.* | Ordnance you cannot recall |
| Zephyr Swarm | *Arithmetic.* | Any hull that could be mourned |
| Crystalline Entity | *Endure it.* | Weapons that are not part of the body |
| Void Walkers | *Outrun it.* | Armour, as an admission of slowness |
| Mechanicus | *Don't look.* | Reconnaissance, entirely |
| Bioform Collective | *Grow into it.* | Fortification, and the Trellis itself |
| Star Nomads | *Never stop.* | To want a planet |
| The Ancients | *We remember when it was light.* | To explain themselves |
| Quantum Entities | *Decline to have crossed it.* | Being definitely anywhere |
| Titan Lords | *Be too large for it to matter.* | Haste, and smallness |
| Shadow Realm | *The dark suits us.* | To be counted |

None of these twelve is wrong. Each one worked, once, under the Trellis. That is the tragedy
of the roster: **they are all optimised for a galaxy that no longer exists,** and the war is
between twelve obsolete doctrines, each of which is confident.

---

## Two names each

Every race has a **Registry name** — the label in the Terran archive, and the string the game
already ships — and an **endonym**, what they call themselves. The gap between them is often
the fastest characterisation available. "Mechanicus" is a Terran surveyor's Latin joke about a
civilisation that has never once used the word.

**A note on the Registry, which is diegetic and useful.** The list of twelve is not a fact of
nature; it is a *document*, maintained by the Terran Empire, and it is incomplete. This is why
the game's unlock system works the way it does — the Registry only lists what a commander has
personally encountered. A race you have not unlocked is not absent from the galaxy. It is
absent from your paperwork.

- The Ancients are unlocked by **referral** — you have to bring others into the galaxy before
  they will speak to you. That is exactly in character and we should lean into it.
- The three premium races (Quantum, Titan, Shadow) are the ones the Registry lists as
  *unverified*, which is a gift: they can be treated in-fiction as rumour made real.

---

## The identity cards

Full bibles come in Pass 3. Two exemplars exist now — `01-terran-empire.md` and
`06-mechanicus.md` — to show the target depth. Everything below is the seed.

---

### 1 · Terran Empire
**Endonym:** *the Concord Registry* — they still use the Concord's name for themselves,
which everyone else finds either touching or insufferable.
**Answer to the dark:** write it all down.

Terra survived the Unarriving because it was the largest junction on the Trellis, and the
largest junction is the last place to run out of everything. It was not strength. It was
*inventory*, and every Terran alive knows it. What they inherited was not genius but the
**archive**: the Concord's standards, measures, ship plans, and traces, filed and cross-indexed
and complete.

This is why they alone have no capped branch and no forbidden hull. They can build anything
because somebody wrote down how. It is also why they are nobody's favourite: the Registry
decides what things are called, whose trace is legitimate, and how many died in the Unarriving,
and eleven other empires have to argue with a filing system.

Their weakness is having no edge, and they experience that as *responsibility*.

**Voice:** institutional passive, file references, scrupulous fairness.
> Sector 6-B logged, trace provisional pending a second crossing. Four hulls did not arrive;
> next of kin notified per standing order. Recommend we sweep before we settle.

**Mechanics:** every bonus exactly 1.0. Full tech tree, all nine hulls. Starter race.
**Full bible:** `01-terran-empire.md`

---

### 2 · Silicon Collective
**Endonym:** *the Solved.*
**Answer to the dark:** if you cannot see ahead, predict ahead.

An artificial civilisation that treats navigation as a problem in inference. They do not chart
by flying; they chart by *deduction* — stellar drift, debris scatter, the statistical shape of
a system's history — and their scouts are the best in the galaxy because a Collective scout is
mostly an instrument. They approach the Unarriving the same way, and they are the only power
that has publicly stated it was not an accident. They published the analysis. Nobody read it.

Their refusal is the interesting part: **they will not build missiles.** Not cannot — will
not. A warhead is ordnance that goes where it was aimed instead of where it should go, and a
mind that models every outcome cannot tolerate a weapon it is unable to recall. Armour is
capped for a related reason: to a Collective, plating is an admission the model failed.

**Voice:** first-person plural, probabilities in ordinary conversation, no rhetorical flourish.
> The shoal at 6-B was likely. Ninety-one per cent likely. We told the Registry in AU 51 and
> the Registry filed it. Four hulls did not arrive. We would like that noted.

**Mechanics:** research ×1.3, hulls 10% cheaper, metal ×0.9, attack ×0.95. Missiles **locked**,
armour capped at 3, no Dreadnought. Scouts +20% speed.
**Unlock:** 3 wins.

---

### 3 · Zephyr Swarm
**Endonym:** untranslatable; the Registry named them for a wind.
**Answer to the dark:** send ten thousand. The survivors are the chart.

A hive intelligence with a metal-rich homeworld and no concept of an individual vessel. The
Swarm's expansion method is the most efficient and most horrifying in the galaxy: saturate a
sector with cheap hulls, accept whatever the shoal takes, and read the map off the ones that
report. What every other empire calls an unacceptable loss, the Swarm calls a measurement.

**They cannot build a capital ship** — and it is not for lack of metal, because they have more
metal than almost anyone. It is that a hull which matters is a hull which can be *mourned*, and
the Swarm has no word for that and no use for the concept. Their research is slow for the
saddest reason on the roster: nothing in the Swarm lives long enough to remember what it
learned, so everything must be learned again.

**Voice:** first person plural, always. No singular pronoun exists. Cheerful about losses,
which is the most alien thing about them.
> We went to 6-B. Some of we did not come back from 6-B. Now we know 6-B. It was a good
> price. We will go to 6-C.

**Mechanics:** hulls 30% cheaper and 20% weaker, metal ×1.2, crystal ×0.8, research ×0.8.
Weapons capped 3, armour 2, shields 1, shipyards 1 — **no Battleship, Dreadnought, Intruder or
Carrier.** Light hulls only.
**Unlock:** colonise 20 planets.

---

### 4 · Crystalline Entity
**Endonym:** *the Standing.*
**Answer to the dark:** let it hit us.

They do not dodge shoals; they cross them and let the gravel do what gravel does. Crystalline
hulls are the most survivable objects in the galaxy — +30% shields, ×1.3 durability — and they
are grown, not built, which is why the Entity's metal output is the worst on the roster. They
have no real industry. They have *orchards*.

And here is the fact that makes them the most politically explosive race in the setting: the
Entity is made of reckoning-crystal. The same substance as the Lamps. The same substance as
the Trellis. Every other empire's ability to navigate depends on a mineral market in the
material of a living people, and the eleven-power consensus is to conduct that trade very
politely and never say the second sentence out loud.

Their weapons are capped at level 2 and they cannot build missiles at all, because a
Crystalline weapon is not manufactured — it is part of the body, formidable and
unimprovable. They have never had the concept of an armament separate from a self.

**Voice:** slow. Measures in durations, not dates. Treats seventy-four years as *recent*.
> The lanes were lit. Then they were not. That was recent. You are in a hurry because you are
> brief.

**Mechanics:** crystal ×1.5, metal ×0.7, shields +30%, durability ×1.3, hulls 20% dearer,
speed ×0.9. Weapons capped 2, armour 2, missiles **locked**, no Carrier.
**Unlock:** earn 50,000 crystal.

---

### 5 · Void Walkers
**Endonym:** *those who never stopped.*
**Answer to the dark:** be through it before it can act.

Under the Concord, the Void Walkers were the Trellis's couriers — the pilots who flew the
longest lanes, held the deepest route-knowledge, and were paid extravagantly to be somewhere
in an hour. Their fleets are still the fastest in the galaxy by half again, and their doctrine
is unchanged: a shoal cannot hurt what has already gone past.

They are the setting's quiet tragedy. **The Walkers are a library that is running away.**
They carry, in living memory and in nothing else, route-knowledge from the lit era that no
archive holds — and their culture forbids writing it down, because a written trace can be
stolen and a courier's value is that she is the only copy. Every Walker who dies takes lanes
with her.

Armour is capped at 2 because armour is a confession that you were not fast enough, and there
is no Void Walker word for a Dreadnought that is not an insult.

**Voice:** clipped. States transit times, never distances. Visibly impatient with meetings.
> Six-B is forty minutes. Was forty minutes. I have not flown it since the Lamps, so now it
> is a guess, and I do not deal in guesses. Get out of my way.

**Mechanics:** speed ×1.5, research ×1.2, durability ×0.9, hulls 10% dearer.
Armour capped 2, weapons 3, no Dreadnought.
**Unlock:** 25 games played.

---

### 6 · Mechanicus
**Endonym:** *the Second Shift.*
**Answer to the dark:** don't look at it.

The most striking civilisation on the roster, and it comes entirely from one line in the code:
**Mechanicus cannot build a Scout, and cannot build an Intruder.** They have no reconnaissance
arm. They do not spy. They have not sent a scout anywhere in eleven hundred years.

Their doctrine is that reconnaissance is a *failure of engineering*. If your hull is adequate,
you do not need to know what is in front of it. So they build the heaviest armour and the best
metal industry in the galaxy, and they advance into unmapped sectors at three-quarters speed,
and they come out dented, and they keep the sector, and they file the damage as maintenance.

They hold more ground than anyone and understand less of it than anyone. And it works.

**Voice:** work orders. Damage reported as scheduled labour. No adjectives whatsoever.
> Sector taken. Twelve hulls returned for reshaping. Shoal present; it is ours now. Continue.

**Live mechanics:** metal ×1.3 (best on the roster), durability ×1.4, an additional ×1.5
defence modifier on Battleships and Dreadnoughts, speed ×0.8, hulls 20% dearer. Shields capped
1, missiles 2, **no Scout, no Intruder.** Field repair remains fiction and visual language until
the engine persists damage on individual ships.
**Unlock:** build 500 ships. **Full bible:** `06-mechanicus.md`

---

### 7 · Bioform Collective
**Endonym:** *the Long Season.*
**Answer to the dark:** grow into it.

Living hulls, grown rather than built, 10% cheaper than anyone else's. The fiction treats older
hulls as mature animals and replacement as a decade-long loss. The live engine does not yet persist
ship age, so it must not claim a per-turn veteran bonus until that state exists.

**They cannot build orbital defences of any kind, and they can never build a Warp Gate.** This
is the most thematically important lock in the game and it should never be balanced away. The
Collective does not hold ground; it *spreads*, and it regards a fixed emplacement as a form of
death. More: they are the only power in the galaxy with **no Lamp programme.** They do not
want the Trellis back. They have said, courteously, for seventy-four years, that the galaxy is
better as it is, and everyone assumes they are being obtuse, and the campaign should eventually
suggest that they are the only ones who guessed right.

**Voice:** patient, agricultural, unsettlingly kind. Talks in seasons.
> You lost four at 6-B. That is how a place becomes known. Plant something there and in nine
> seasons the shoal will be a garden and nobody will remember the price. We are not in a
> hurry, and neither, truly, are you.

**Live mechanics:** crystal ×1.2, metal ×0.8, hulls 10% cheaper. Shields capped 2,
**orbital locked**, no Carrier. The +2% growth-per-turn rule is a future design target, not a
shipped modifier.
**Unlock:** win 50 battles.

---

### 8 · Star Nomads
**Endonym:** *the Fleet*, which is also their word for *home*.
**Answer to the dark:** never stop, and it can't have you.

The Concord's traders, and therefore the Unarriving's principal victims. When the Lamps went
out, the Nomads were the one civilisation with almost nobody at home, because home was a
schedule. They lost more of their population in nine days than any other power lost in the
whole Shortening, and they have never once been offered a figure they consider honest.

Now they are the galaxy's fastest cheap fleet, the best colony-ship handlers, and a culture
that treats every convoy as home — and they will not seriously terraform, because wanting a planet is the thing
that killed everyone they knew. They have full access to every hull class in the game and the
worst possible reason to use it.

They are also the setting's best source of side-content: **Nomads sell traces.** A Nomad
convoy is a market in verified routes, and a market in verified routes is a mission-giver, a
temptation, and a moral hazard all at once. They have a funeral rite for a salted probe. They
are the only ones who do.

**Voice:** warm, mercantile, sentimental about routes the way other people are about houses.
> Six-B? I can sell you six-B. My mother's cousin flew it in sixty-eight and came back with
> nine of twelve, and that nine bought this chart, so mind what you offer me for it.

**Mechanics:** speed ×1.3, hulls 20% cheaper, attack ×1.1, metal ×0.8, durability ×0.9.
Colony ships +50% speed. Orbital capped 1, terraforming 2. **All nine hulls.** Mobile
settlements remain a future Wonder concept, not a live colony-ship action.
**Unlock:** explore 100 sectors.

---

### 9 · The Ancients
**Endonym:** none. They refer to themselves the way an institution does — in the third person,
by function.
**Answer to the dark:** we remember when it was light.

They did not build the Trellis. They **maintained** it, for longer than any other
civilisation's recorded history, and the distinction is the campaign's central revelation.
Their research is the fastest in the galaxy and their hulls the deadliest, and they can afford
almost none of it: every ship costs half again and their economy is among the weakest. An
Ancient fleet is small, magnificent, and irreplaceable, and they fight like people who know
exactly how many they have left.

In the Quiet Decade they asked every empire to reduce transit volume. Four sentences, no
explanation. They were ignored. They have said essentially nothing since.

**They know why the Lamps went out.** They know because they were the ones who did it. That
is the plot, and they should never confirm it until the campaign forces the moment.

**Voice:** elegiac, and uses the past tense for present things — the single most efficient
characterisation choice available for them, and it should be absolutely consistent.
> There was a lane at six-B. It was very fine. You will not find it, and when you do you will
> wish you had asked us first, and we will tell you that you did not ask.

**Mechanics:** research ×1.5, attack ×1.5, durability ×1.5, everything costs ×1.5, economy
×0.8. Full tech tree, all hulls.
**Unlock:** 3 referrals — *they come to a galaxy you have invited others into.*

---

### 10 · Quantum Entities
**Endonym:** *the Not-Yet.*
**Answer to the dark:** decline to have crossed it.

They do not solve blind transit; they refuse the premise. A Quantum hull phases, teleports, and
in the Registry's careful phrasing "does not maintain a continuous position history." Their
research and firepower are excellent and everything they build costs 30% more, because
manufacturing an object that is only conditionally present is expensive.

Their refusal is elegant: **armour capped, no Dreadnought.** A thing that definitely exists in
one place can be definitely destroyed. So they never build one. The Entities have no flagship,
no capital, and — this is the good part — **no agreed account of the Unarriving,** because a
meaningful fraction of them maintain it has not happened to them yet.

**Voice:** conditional and subjunctive throughout, which is maddening and should be, but keep
their lines short or it becomes unreadable.
> Had we gone to six-B, we would have lost four. We may have. Ask us again and the answer will
> have been different.

**Mechanics:** research ×1.4, crystal ×1.3, attack ×1.3, speed ×1.2, hulls 30% dearer.
Armour capped 2, no Dreadnought. Their discontinuous-motion language is fiction, not a teleport action.
**Unlock:** premium. Listed by the Registry as *unverified*, which they find funny.

---

### 11 · Titan Lords
**Endonym:** *the Weight.*
**Answer to the dark:** be too large for it to matter.

Everything they build is twice as strong, twice as expensive, and moves at three-fifths speed.
A shoal is weather to a Titan hull. They cannot build a Frigate, a Destroyer, a Scout or an
Intruder — not from doctrine like the Mechanicus, but because **nothing they make is small
enough to be one.** The Titan shipwright's art has no small form. They arrive late to every
war and win every battle they reach.

Their refusal is a slow suicide and they know it: propulsion capped at 1, research ×0.7. They
have got heavier, slower and less curious for four centuries, and their own historians describe
this as maturity. The Titan Lords are the roster's argument that a doctrine can be *correct*
and still be a dead end.

**Voice:** formal, aristocratic, long sentences, open contempt for haste. Never uses
contractions.
> You will forgive us for not attending to six-B in the season you would prefer. We will
> arrive when we arrive, and when we arrive there will be no further question of six-B.

**Mechanics:** metal ×1.4, attack and durability ×2.0, cost ×2.0, speed ×0.6, research ×0.7.
Propulsion capped 1. **Capital hulls only** — Cruiser, Battleship, Dreadnought, Carrier, Colony.
**Unlock:** premium.

---

### 12 · Shadow Realm
**Endonym:** *the Unlisted.*
**Answer to the dark:** it suits us.

The only power in the galaxy that is *better off* since the Lamps went out, and everybody has
noticed. Shadow fleets carry a stealth signature that prevents an enemy from seeing what they
are actually made of — an enemy who loses the sensor contest gets a battle summary instead of
the telemetry — and their whole strategic posture is built on nobody knowing the size of the
thing they are dealing with.

They are also, inevitably, the prime suspect for the Unarriving. They cannot prove they didn't.
They have chosen, with what looks a great deal like enjoyment, not to try. And the truth is
worse than the accusation: they had nothing to do with it, they *have* worked out roughly what
did, and they are keeping it as leverage.

Their defence is the worst on the roster at ×0.8. Armour is capped, no Dreadnought, no
Carrier. **The Shadow Realm is a bluff that has never been called at scale**, and the day
somebody counts them properly is the day the Realm ends.

**Voice:** courteous, warm, and never answers the question that was asked.
> Six-B. Yes. What a good question. You have four hulls fewer than you had, and I have some
> sympathy, and I notice you did not ask me how many I have. Shall we discuss what I would
> like?

**Mechanics:** stealth signature (hides fleet composition), crystal ×1.2, attack ×1.2, speed
×1.2, durability ×0.8. Armour capped 2, no Dreadnought, no Carrier.
**Unlock:** premium.

---

## Relationship map — Pass 3 work, seeded here

The three axes that will generate every diplomatic story we ever need:

1. **The Registry question.** Terra decides what things are called and how many died. Silicon
   published a contradicting analysis; the Nomads dispute the casualty figure; the Ancients
   are the only ones who could settle it and won't.
2. **The reckoning market.** Everyone needs crystal. The Crystalline Entity *is* crystal. This
   is politely unspoken and it is the largest unexploded device in galactic politics.
3. **The Relighting.** Eleven empires want the Trellis back. The Bioform Collective does not,
   and says so, and is patronised for it. When the campaign reveals why they're right, that
   relationship inverts — which is exactly the kind of payoff that makes a roster feel written
   rather than assembled.

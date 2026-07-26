# Matchups and Mysteries

Status: **CANON** for the reasons; **derived** for the matchups. Every advantage below is read off the stat
lines and `RACE_ACCESS` in `races.js` — none of it invents a mechanic. Where a matchup is already
implemented in the engine it is marked **[shipped]**.

Two questions this answers: *why does one race have power over another*, and *which races are opaque to
which*.

---

## Part 1 — The three kinds of advantage

Not all advantages are the same shape, and the difference is the interesting part.

**A hard counter makes the other empire's whole doctrine irrelevant.** Not weaker — *pointless*. These are
rare, they are the best thing in the design, and they should never be balanced away.

**A soft edge is an ordinary numerical favour.** One fleet beats another. Fine, and forgettable.

**A doctrine collision is when both empires' strengths are real and neither can be applied.** Two
civilisations that cannot get at each other. These produce the longest and strangest wars.

---

## Part 2 — The defining matchups

### Hard counters

**Mechanicus over Shadow Realm** **[shipped]**
The Realm's signature hides fleet *composition* from an enemy whose sensors it beats — `getRaceStealthScore()`
against detection in `resolveBattle`. The Second Shift has **no Scout and no Intruder** and no intelligence
on anyone, including itself. You cannot hide what you have from somebody who never knew what you had. A
Shadow player has spent the entire game on a toolkit that does nothing here.
*Eleven hundred years of refusing to look, meeting six hundred years of refusing to be seen.*

**Mechanicus over Quantum Entities**
Same mechanism, different victim. Quantum positional uncertainty is bounded and it is fundamentally an
*intelligence* effect — the enemy cannot determine where you are. The Second Shift was not determining that
anyway. They advance on a filed schedule into space they have not surveyed, and a fleet whose position is
ambiguous is still in the way.

**Void Walkers over Titan Lords**
Speed ×1.5 against speed ×0.6, and `PROPULSION: 1` against warp range +2. The Titans win every battle they
reach and the Walkers never let them reach one. This is the cleanest asymmetry on the roster and both
peoples know it: Titan strategists have written it down, said so publicly, and changed nothing, because the
alternative is building something that does not last.

**Zephyr Swarm over Crystalline Entity**
The Standing has `WEAPONS: 2` and `MISSILES: 0` — the worst offensive ceiling in the galaxy — against
durability ×1.3 and +30% shields. They win every exchange and cannot *finish* anything. The Swarm's hulls
are 20% weaker and 30% cheaper and there are tens of thousands of them. Crystalline shields regenerate
between rounds; the Swarm does not care, because it is not trying to win rounds.
*A people who cannot conceive of a weapon that is not part of the body, against a people who have no word
for a hull that matters.*

**Crystalline Entity over Void Walkers**
And the loop closes. `ARMOR: 2`, `WEAPONS: 3`, durability ×0.9 — the Walkers are built on the premise that
being hit is a failure of speed, so they have no answer at all to something that simply stands there. A Void
Walker fleet against a Terrace is the fastest force in the galaxy unable to hurt anything.

**Titan Lords over Zephyr Swarm**
Attack and durability ×2.0 against hulls at 0.8. Saturation only works if the hulls do damage; a Titan line
in a Zephyr cloud is a threshing machine. And the Swarm cannot answer with capitals, ever, because of BU 400.

### Doctrine collisions

**Silicon Collective vs Zephyr Swarm**
The finest predictive engine in the galaxy against an enemy with **no strategy to model.** The Swarm's
decisions are made where its population is densest, and its population follows the tectonics of a world that
will not hold still. Swarm foreign policy is a function of geology. Terra's standing guidance is one line —
*establish where they are* — and the Collective, which can model anything with a cause, is facing something
whose cause is a fault line.

**Silicon Collective over Mechanicus**
The inverse, and it is the most satisfying pairing in the set. The Second Shift is the *most predictable*
enemy in the galaxy: no feints, no raids, no reconnaissance, no first strike, no deception, and an advance
that is literally a filed work order proceeding on schedule at three-quarters speed. A civilisation that
cannot be deceived is also a civilisation that cannot deceive, and Sill can read them like a timetable.

**Bioform Collective vs everyone, in two directions at once**
`ORBITAL: 0` — no turrets, no Warp Gates, ever. **They cannot hold a chokepoint, a Wonder site, or a
frontier.** Any empire that can force a siege beats them.
And their hulls *grow* at +2% a turn. Ten turns in, a Bioform veteran is better than anybody's new
construction, and replacing one takes nine years with no possibility of a surge. **They lose every short
war and win every long one**, and every opponent's correct strategy against them is to hurry.

**Ancients vs everyone**
Attack and durability ×1.5, full tree, every hull — and cost ×1.5 against economy ×0.8, with an inventory
that only goes down. Tactically the strongest force in the game; strategically the weakest. They win every
engagement they choose and cannot afford a war of attrition against anyone, and they fight like people who
know to the unit how many they have left, because they do.

**Terran Empire vs everyone**
The only empire with no numerical edge anywhere and no capped branch or forbidden hull. They lose every
straight fight they pick — outrun by Walkers, outlasted by the Works, outnumbered by the Swarm,
out-massed by the Weight. They win by **arriving in the right sector with an adequate fleet**, which
requires knowing the map better than the enemy, which is the one thing they do better than anyone.
*A Terran caught in an unswept sector has already been out-generalled.*

### Soft edges worth naming

**Shadow Realm over Terran Empire.** Terra's whole doctrine is foreknowledge and certified traces. The Realm
steals traces and falsifies them, and it works best precisely against the empire that has organised itself
around knowing.

**Star Nomads over Bioform Collective.** Hulls at −20% cost and speed ×1.3 against a production line that
cannot be surged. The Fleet can replace losses in a season; the Collective cannot replace them in a decade.

**Anyone over Void Walkers, once caught.** Durability ×0.9 and `ARMOR: 2`. They die easily. Their entire
doctrine is not being there when it happens.

---

## Part 3 — Opacity: who is mysterious to whom

The interesting finding is that opacity comes in **three completely different kinds**, and they are not
interchangeable.

### Opaque by concealment — the Shadow Realm
No population figure has ever been given. No insignia on any hull, uniform, document or building. An
unlisted hierarchy whose senior Keeper voice is a *title* held by three individuals since AU 0 with no
outside power noticing the transitions. Cities that cannot be counted from orbit and never could, on a world
with a radio-opaque sky. The Registry's population estimate carries an error bar of a factor of six.

This is chosen, maintained, and their entire deterrent — and it is also their founding anxiety, because a
power that cannot be counted also cannot demonstrate its strength, and the day somebody counts them properly
is the day the Realm ends.

### Opaque in principle — the Quantum Entities
Not chosen. Their settlements have statistical edges; two competent Registry surveys eleven years apart
returned population figures differing by a factor of three and **both were correct.** They do not sign
things, because a signature asserts a specific maker. They cannot be counted even when entirely willing to be.

### Opaque by absence — the Ancients
The deepest, and the only one that is a canon *gap* rather than a described property. No homeworld has ever
been visited and there may not be one. Two hundred catalogued installations, all facilities, none of them
anywhere anybody was born. No food, no supply runs, no consumption ever observed. **Nobody has seen an
Ancient body** — the Registry file holds nine mutually incompatible descriptions taken by competent officers,
with no explanation and no follow-up, because asking felt discourteous.

*Do not resolve any of it.*

### And the far end of the spectrum: transparent and useless

**The Mechanicus are the most transparent power in the galaxy and it tells you nothing.** They have never
made a false statement about another empire's strength in eleven hundred years — not from integrity, but
because they have no data to lie with. Ask Liaison Fourth your fleet strength and it will tell you
truthfully that nobody has counted it, because no work order required the number.

**The Zephyr Swarm answer every question and cannot be understood.** They tell the Shadow Realm their exact
strength whenever asked. The Realm does not believe them. They tell them again. It is the only relationship
in the galaxy where the Unlisted are the ones being deceived, and they are wrong about it.

**The Crystalline Entity are transparent and unverifiable.** They have told everyone the truth about AU 0 for
seventy-four years and what they are offering is a *feeling*, and there is no box on the intake form for a
feeling.

**Terra is transparent to a fault.** They publish everything, including a casualty figure they know is wrong,
because the alternative is twelve empires inventing twelve.

---

## Part 4 — Who knows what about the quarantine

Canon is fixed: it was a deliberate shutdown, begun BU 61, to seal something out. **Almost nobody in the
galaxy knows this.** Five tiers:

**Tier 0 — knows.** The Ancients. Only the Ancients. They have said nothing for seventy-four years, for two
reasons: an explanation is a message and a message can be read, and the shell is still propagating and cannot
be stopped, so telling anyone improves nothing.

**Tier 1 — has inferred it and will not say.** The **Silicon Collective** hold the sequence, the origin
coordinate, and 91% confidence that it was the Ancients — and have never said so publicly, because
ninety-one per cent is not enough to accuse anyone of the largest act in history. The **Shadow Realm** have
worked out roughly what happened, hold the only imagery of the Ancients building it, cannot read it, and are
retailing it a frame at a time.

**Tier 2 — is correct without knowing why.** The **Crystalline Entity** believe it was deliberate because
they *felt* it — *an accident has no manners* — and have turned it into a faith. The **Bioform Collective**
knew forty years early by husbandry, do not want the lanes relit, and have no idea why they are right. The
**Quantum Entities** hold the clearest physical account anyone has produced — the Lamps never failed;
something was put across the road and *then* the lights went out — delivered by the least credible witnesses
in the galaxy.

**Tier 3 — holds a decisive document and does not know what it is.** **Terra** has the four sentences in
cabinet forty-one and cannot read them. The **Titan Lords** have the only interior record of the event, and
Terra filed it as instrument error. The **Star Nomads** have a hull that went into the dark on the fourth day
and came back thirty-one years later, undamaged and empty, in a berth they will not name.

**Tier 4 — holds a decisive fact and cannot use it.** The **Zephyr Swarm** have ten thousand simultaneous
observations of the moment and no grammar for a single thing: *there was one of it.* The **Void Walkers** had
one second of borrowed sight down an occupied lane, and Wren died in AU 71 with it, on purpose. The
**Mechanicus** have a stamped plate on a sector adjacent to Silicon's origin coordinate, reading *requires
heavier hull, revisit*, and nobody has ever put the two documents side by side.

> **Nobody in the galaxy has read the Long File in one sitting except Rell — and Rell was looking for
> something else.**

---

## Part 5 — Rules for keeping this honest

1. **A hard counter must be derivable from `races.js`.** If you cannot point at the cap, the lock, or the
   stat, it is not a matchup, it is a preference.
2. **Never balance away a hard counter.** The Shadow-versus-Mechanicus dead end is the best asymmetry in the
   design and it will read to a balance pass as a bug.
3. **Opacity is not a stat.** Only the Shadow Realm's is mechanical. The Ancients' and the Quantum's are
   *canon properties*, and turning either into a gameplay effect would cheapen both.
4. **No race gains a tier of knowledge in a match.** A player discovering the truth is a *campaign* event.
   Canon's distribution is fixed at turn 1.
5. **Every counter has a counter-story.** The Titans know they will never catch a Void Walker and have
   written it down. The Realm knows its stealth is inert against the Works and Fourth told them so politely.
   A civilisation that does not know its own weakness is a civilisation nobody has written properly.

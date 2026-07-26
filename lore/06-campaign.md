# The Single-Player Campaign

Status: **PROPOSED**. Structure is mine; every mechanic referenced already exists in the engine.

**LOCKED** 2026-07-25: the player is **always Terran**, and **Rell is the only voice in the campaign** (multiplayer uses faction registers in text  Q4) — every
other character reaches the player through Rell reading their messages aloud (`05-characters.md`).
Both decisions apply to every mission below.

---

## The design constraint I have held to

**The campaign must be buildable out of what the game already does.** That means a campaign
mission is: a hand-authored map, a set of victory and failure objectives, one or more existing
AI opponents with a chosen race, and a small script of narrative beats fired on triggers
(turn number, sector explored, fleet lost, tech researched, colony founded).

That is it. No new combat system, no cutscene engine, no branching dialogue tree, no new unit
types. Everything below can be built on the hex map, the hazard rules, the tech tree, the
existing `lib/ai.js`, and Rell's event feed.

If a mission idea requires a new system, it does not go in the campaign. It goes in `08-open-questions.md`
as a proposal with a cost attached. This rule is the difference between a campaign that ships
and a campaign that is a document.

---

## How the campaign teaches

Every mission teaches exactly one mechanic, and it teaches it by **making the player pay for
it**, not by explaining it. The engine's hazard rules are already perfect teaching tools
because they are probabilistic and legible: you lose four hulls in a shoal, you understand
shoals, and no popup was involved.

The pedagogy order is derived from what actually confuses new players in this game:

1. Blind movement is dangerous → **hazards**
2. Information can be bought → **probes**
3. Ownership converts danger into infrastructure → **sweeping**
4. Production gates everything → **spaceports, colony ships, economy**
5. You cannot fight everything → **fleet composition and tech branches**
6. Enemies lie to you → **intel, counter-intel, salting**
7. Some things cannot be solved → **mouths**
8. Endgame projects change the map → **Warp Gates, and then the Lamp**

Narrative revelation is paced against that ladder, so mechanical mastery and story
understanding arrive together. That alignment is the whole trick of good campaign design and
it is the thing most strategy campaigns get wrong.

---

## Act I — The Sweeping *(missions 1–3)*
**The player learns: the galaxy is dangerous, and knowing costs.**
No history is explained in Act I. None. The player should finish it with a sense of unease they
cannot yet name.

### 1 · "The Lamps Are Out"
**Teaches:** movement, blind transit, that losses are normal.
**Opponent:** none.
**Objective:** reach and colonise a designated world four sectors away.
**The design:** there is no safe route. Both paths cross an unswept shoal. The mission cannot be
completed without losing ships, and it is not a failure state — it is the game's opening
statement.
**Opening beat:** Rell, reading a manifest, not looking up. "Three routes out of this system.
Two of them killed somebody last year. Pick."
**Closing beat:** colony confirmed. Rell notes the total cost in hulls, and files it, and says
"someone will be born there." First and last sentimental line for several hours.

### 2 · "Sweep"
**Teaches:** probes, and that a held shoal becomes safe.
**Opponent:** none.
**Objective:** secure two shoals and establish a clean trace between two clusters.
**The design:** the player is given exactly enough crystal for two probes and four crossings.
The arithmetic only works if they probe first. Then they hold a shoal, watch it turn safe, and
cross it for free — the single most satisfying moment in the game's mechanics, and it currently
has no fanfare at all.
**Closing beat:** the swept shoal yields its first ore. Rell: "That is the first thing this
galaxy has given us instead of charged us for."

### 3 · "Anything That Floats"
**Teaches:** economy, spaceport tiers, colony ships, fleet capacity.
**Opponent:** **Zephyr Swarm** — chosen deliberately as the first enemy. Cheap, endless, no
capital ships, no cleverness. A player who has just learned that losses hurt now meets a
civilisation for whom they don't.
**Objective:** out-expand the Swarm across a contested cluster.
**The turn:** the player cannot beat the Swarm's expansion rate, and the mission is designed so
they discover that. They win by *taking the shoals* — the Swarm floods through unswept sectors
and bleeds, and once the player owns the crossings, the arithmetic inverts. First strategic
insight of the campaign, arrived at rather than told.

---

## Act II — Overlap *(missions 4–8)*
**The player learns: the galaxy used to be safe.**
Delivered entirely as texture. Ruins, idioms, old charts with lanes drawn on them going places
nobody can reach. Nobody sits the player down and explains the Trellis. By the end of Act II
they should have assembled it themselves.

### 4 · "The Mouth at Anselm"
**Teaches:** black holes; that some sectors are not solvable.
**Opponent:** light — a rival survey force, race **OPEN**.
**Objective:** chart a cluster containing an unmarked mouth.
**The design:** the mission gives the player a captured chart with one sector left blank, and a
choice: probe it for 300 crystal, or send the fleet and save the crystal for the fight coming
later. This is the game's central question posed as a single decision, at the exact point the
player understands it well enough for it to hurt.
**Plot:** in the sector adjacent to the mouth is a **Trellis relay** — intact, dead, and
*deliberately sited* to be looked at from a place nobody could survive. Whoever built it did not
want it found by accident. First hard evidence that the network was engineered rather than
natural.
**Closing beat:** Rell reads the manifest of the fleet that found the mouth. It is the first
time the "did not arrive" phrasing is used about a large number.

### 5 · "Salvage Rights"
**Teaches:** diplomacy, trace value, that information is tradeable property.
**Opponent:** **Star Nomads**, as an antagonist you are not supposed to want to fight.
**Objective:** reach a distant cluster. The Nomads have a clean trace. It is for sale.
**The choice:** pay Keth's price (a large chunk of your economy, plus archive access), or spend
the hulls yourself. Both are viable. Buying it costs you the mission's economic margin and gives
the Nomads something Terra has never given anyone. Flying it yourself costs crews.
**Why it matters:** this is the first mission where the *right* answer depends on what kind of
empire the player wants to be, and the campaign remembers the answer.

### 6 · "What the Works Took"
**Teaches:** attrition warfare, fleet composition, that your intel toolkit has limits.
**Opponent:** **Mechanicus.**
**Objective:** hold a cluster against an advance that does not stop.
**The design:** the Mechanicus arrive through unswept sectors the player has no trace for, at
three-quarters speed, absorbing hazard losses they simply accept. There is no ambush to spring
and no supply line to cut. Every conventional counter fails, and the player has to actually
out-build them for four rounds.
**The shock, saved for a player who has been enjoying the intel game:** stealth and false traces
do nothing. The Second Shift never knew what you had. Liaison Fourth explains this in the most
polite possible terms and it is genuinely unnerving.

### 7 · "The Unlisted"
**Teaches:** Espionage, Counter-Intelligence, salting.
**Opponent:** **Shadow Realm.**
**Objective:** identify the size of a force you cannot see.
**The design:** the player's intelligence reports are wrong, and they are wrong in a way the
player can detect if they cross-reference two sources. Teaches the Intel branch by making it
necessary rather than optional.
**Plot:** the Realm is being framed for the Unarriving by evidence that is *too good*. They did
not do it. They have, however, worked out roughly what did, and they will trade it — for
something the player should not give them.
**Beat to protect:** the Nomad funeral rite for a salted probe. Show it once, without comment,
after the player salts their first one.

### 8 · "Four Sentences"
**Teaches:** endgame research, Warp Gates, defence of a fixed asset.
**Opponent:** two, simultaneously — **OPEN** which.
**Objective:** defend the Registry archive.
**Plot:** the Ancients' request from BU 8 surfaces. Four sentences, no explanation, asking every
empire to reduce transit volume, filed under routine shipping enquiries for eighty-two years.
Registrar Vance has had it the whole time. Once its existence is known, the archive stops being
a filing system and becomes a military objective, and the mission is the consequence.
**Act break:** the Emissary requests an audience. They have spoken eleven times since AU 3.
This is the twelfth.

---

## Act III — The Relighting *(missions 9–11)*
**The player learns: it was deliberate. And they are most of the way through doing it again.**

### 9 · "Relight"
**Teaches:** the Galactic Wonder — the currently-disabled victory condition, whose identity was
always a **Lamp**.
**Opponent:** everyone. The other powers understand exactly what a working Lamp is worth.
**Objective:** complete the Wonder while under general assault.
**The design:** a long, expensive, fixed-position build under pressure — mechanically the most
demanding mission in the campaign, and the payoff for eight missions of economy.
**The beat that matters:** it works. One lane lights. A fleet crosses it and arrives with no
losses at all, and Rell reports a clean crossing at a scale nobody has heard reported in three
generations, and it is the best moment in the game.

### 10 · "The Second Unarriving"
**Teaches:** nothing. Act III mission 10 is the one place the campaign is allowed to be about
story rather than mechanics.
**The design:** the lit lane works for one mission. Then ships stop arriving on it — and only on
it. Not a shoal, not an enemy. The same administrative horror as AU 0, at a scale of one lane,
and the player has the manifests this time.
**The Emissary speaks.** The Trellis did not fail. It was shut down, from the inside, by the
people who maintained it, at a cost they have carried for seventy-four years, because the roads
ran both ways and something was using them. There was no message left because a message can be
read.
**Rell's slip.** Somewhere in this mission, once, Rell says "destroyed." No one remarks on it.

### 11 · "The Long Watch" — finale
**The choice.** Three endings, and the third must be earned.

**A · Relight.** Restore the Trellis. The galaxy becomes one place again — trade, reach,
prosperity, the end of the dark. And the thing the quarantine held comes back down the roads,
and the campaign's final scene is the first docking schedule with a gap in it.
*Available to everyone. The player is not punished for choosing it; they are shown it.*

**B · Seal.** Finish what the Ancients started, permanently. No Lamp can ever be built again by
anyone. Every empire is confined forever to what it has swept — including yours. The galaxy
stays small, dark, and safe, and the cost is every route anyone has ever paid for and every
reunion anyone was still hoping for. Keth's people never get their figure. The Nomads never go
home.
*Available to everyone. It is the correct decision and it should feel terrible.*

**C · The Long Watch.** Relight one lane, under permanent guard, with a shutdown you control —
and station a watch on it in perpetuity, which is a commitment your empire makes on behalf of
people who do not exist yet. The compromise, and it is fragile, and the epilogue is honest
about the fact that watches get abandoned.
*Requires the player to have done the optional work across the campaign: read the four
sentences, kept Fourth alive, corrected the Registry count, refused Ito's trade. Four small
decisions across twenty hours, none of them flagged as important. **This** is how you make a
player feel their choices were real.*

---

## Practical recommendation: build three, not eleven

Eleven missions is a real project — probably the largest single body of work in this repo's
future. The way it fails is by being half-built.

**Build missions 1, 2, and 4 first, and ship them as a tutorial-plus-prologue.** They require
zero new systems, they cover the mechanics new players most reliably bounce off, they contain
the Trellis relay discovery (so the story has a hook in the water), and together they prove or
disprove the entire scenario format — objectives, triggers, and Rell's scripted beats — before
anyone commits to Act II.

If those three are good, the rest is production. If they are not, we have lost three missions
instead of eleven.

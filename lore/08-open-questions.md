# Decisions and Open Questions

This is the decision record, not the current backlog. Q1–Q4 and Q6–Q9 are decided; Q5 was withdrawn
after its premise proved false. The remaining decisions are the Unstable Star's mechanical truth,
the inert `artifact` field, and whether the Concord flashback merits an engine mode. Start with
`STATUS.md` for current delivery state and priorities, then use this file for the reasoning.

---

# Part 1 — Decided

## Q1 · Why did the Lamps go out? → **QUARANTINE. LOCKED.**

The Trellis did not fail. It was shut down from the inside by the Ancients, who maintained it,
because the lanes ran both ways and something was using them. No message was left, because a
message can be read by the thing you are sealing out. The cost was the Unarriving, the
Shortening, and seventy-four years of dark, and the Ancients have carried it in silence since.

**Why this and not the others.** It is the only option in which the game's existing victory
screen becomes the story's climax. `SCIENTIFIC: 'Research every technology available to your
race'` already means *you have reconstructed enough of the old science to relight the lanes* —
so with no mechanical change at all, the thing the game rewards becomes the thing the story
fears. Strategy campaigns almost never get their win condition and their theme to be the same
object. This one gets it for free.

- *Entropy* was warmer and more humane, and had no ending in it. It also left the Ancients with
  no reason to exist, and they are the best-designed race on the roster.
- *Theft* produced a clean antagonist, which this setting is stronger without, and it collapsed
  the Shadow Realm from "accused and innocent, and profiting" — a genuinely interesting
  position — into ordinary guilt.

**The discipline this obliges us to keep:** the thing behind the quarantine is never designed,
never named, never shown. We show its *effects* — a docking schedule with a gap in it — and
nothing else. The moment it acquires a shape it becomes a monster, and a monster is much less
frightening than an absence. This constraint is not a limitation to work around. It is the
whole effect.

## Q2 · Tone register → **WEATHERED PROFESSIONAL. LOCKED.**

Competent people doing dangerous work in a haunted place. Naval logbook plus well-run disaster.
Specific, dry, no adjectives, occasionally beautiful by accident. Full rules in `03-themes.md`.

**Why.** The art direction already decided this and nobody had noticed: `docs/art-direction/`
specifies a 1990s command-briefing station, physical and industrial and *installed*. That is a
working space, and nobody monologues in a room with a maintenance panel. Writing elegiac or pulp
would mean fighting our own established visual language.

It is also the only register that survives twenty hours. The load-bearing element is not the
grief — it is that **these people are good at their jobs**, and competence is a comfort. Get
that right and you have the emotional register of the good submarine films; get it wrong and you
have grimdark, which is a different and much cheaper thing.

**The one licensed exception:** the Star Nomads and Liaison Fourth are allowed to be warm and
funny. A register needs relief or it stops registering.

## Q3 · Campaign point of view → **ALWAYS TERRAN. LOCKED.**

One protagonist empire, one narrator, one continuous relationship with Chart-Warden Rell across
the whole campaign. Eleven races appear as opponents and interlocutors only.

**The elegance we get from this:** the Terran doctrine and the player's doctrine are the same
doctrine. *Write everything down. Never lose a fact twice. Expand only onto ground you
understand.* The player is not roleplaying Terran values; they are being taught them by the
mechanics, which is what good campaign design is.

## Q4 · Voice-over scope → **ONE VOICE. RELL ONLY. LOCKED.**

Originally estimated at 400–600 short lines; the engine audit reduced the written baseline to roughly
200–250 event, briefing, and campaign lines. One performer remains the locked campaign baseline.
The twelve faction text registers that later shipped in multiplayer create a channel decision, not an
automatic twelve-performer commitment; see `STATUS.md`.

**The craft consequence, which matters more than the budget:** if Rell is the only voice, then
**every other character is quoted by Rell.** Vance, Ito, Keth, Fourth and the Emissary all reach
the player through their adjutant reading their messages aloud — *"Registrar's office asks after
you. That means they have started counting."*

That is not a compromise. It is a stronger device than voicing them, for three reasons: it keeps
Rell the entire narrative surface, so the relationship deepens instead of diluting; it lets the
player hear Rell's *opinion* of everyone through what they choose to read out and how; and it is
how radio drama has always done this. Written into `05-characters.md` as a rule.

---

# Part 2 — Withdrawn, decided, and the questions that remain

## Q5 · **WITHDRAWN — the premise was false.** Types 3, 4 and 5 were never free

This question asked what to put in three empty sector slots. **There were no empty slots**, and there
never had been. `server/lib/map.js` defines `UNSTABLE_STAR` (3), `BROWN_DWARF` (4) and `SMALL_MOON` (5)
with names and descriptions, `generateGameMap` rolls each at **5% of every sector on every map**, and
`connect.js` and `GUI.js` have both been printing their names to players since the game shipped.

Six passes of this folder asserted otherwise, and an anthology file was eventually written inventing
three types to fill slots that were already occupied. The rule at the top of the lore README is *"the
code wins"*; it was published and then not followed, because nobody opened `lib/map.js`.

**The real types are now documented** in `01-cosmology.md` and given fiction in
`24-anthology/01-sectors.md`, and `tests/lore-sector-types-match-code.test.js` fails if the prose and
`SECTOR_TYPES` ever disagree again.

**One genuine open question survives**, and it is much narrower than the original: **type 3 is described
as emitting dangerous radiation and carries no `hazardous` flag or `dangerLevel`.** The fiction says it is
dangerous; the engine says it is inert. Either the flag should exist or the description should be
softened. That needs a mechanics decision.

### The two cut ideas, kept as candidates rather than descriptions

These were written as types 4 and 5 before the error was found. They are good and they describe nothing
that exists. If a **new** sector type is ever added, start here.

- **Wreck Field.** Debris of an Unarriving convoy, still in loose formation. Hazardous like a shoal, and
  sweeping it yields a salvaged **trace** — turning the setting's central theme into a mechanic.
- **Dead Lamp.** A dark beacon. Safe, yields nothing, and holding one contributes to a Lamp programme,
  making it the most fought-over worthless real estate in the galaxy.

---

## Q5d · **NEW — the `artifact` field is generated and inert**

Found by reading `lib/map.js` rather than the documents, which is now the third time that has produced a
finding.

`generateGameMap` rolls **`artifact = 1–5` on 25% of every colonizable world** — micro planet through
homeworld — and writes it to the map table. There is a column for it in the live schema. **Nothing reads
it**: not income, not combat, not victory, not the client. No lore document mentioned it in 150,000 words.

**The question is one of two things, and it needs an answer before any fiction commits:**

1. **Is it decorative?** If artifacts will never do anything, the field should be documented as vestigial
   and the fiction should stay quiet about it.
2. **Should it do something?** If so, this is the cheapest story-per-line-of-code in the game, because the
   distribution and the storage already exist and work.

**The proposal, marked as one** (`25-crystal.md` Part 6): the artifact field is where **Trellis remnant**
sits on the map. Artifact 1 is a fragment; artifact 5 is nine kilometres of intact, dark, unreadable
structure. It uses a working distribution, gives every Lamp programme a physical reason to want particular
worlds, and explains why the oldest ruins and the highest-grade reckoning are the same substance.

**No pieces have been written claiming artifacts do anything**, deliberately. Writing fiction for a
mechanic that does not exist is exactly the error that put a Wreck Field into an occupied sector slot.

---

## Q5c · A third cut idea, kept with the other two

- **A drift.** A sector whose hazard is displacement rather than damage: transits through it emerge
  somewhere else. Mechanically cheap, strategically horrible, and it would make the map feel unsafe
  rather than merely lethal.

*The original wording of Q5 is deliberately **not** retained here. It asserted that three occupied sector
types were free, and a labelled false claim is still a false claim sitting in a folder — which is precisely
how this one reached six documents and an anthology. The description of the error above is more useful than
the error, and `tests/lore-sector-types-match-code.test.js` will not permit the phrasing back.*

## Q6 · Vocabulary → **decided, and locked, with one refinement**

You gave me these, so: **the Trellis**, **the Unarriving**, **reckoning**, **a mouth**,
**salting**, **Chart-Warden** all stand. Reasoning where it wasn't obvious:

- **the Unarriving** was the one I was unsure of, and I have kept it for a reason worth
  recording. Survivors really do name atrocities by nominalising an absence — *the Disappeared*,
  *the Troubles*. It being slightly hard to say is correct; people stumble over these words.
  **The refinement:** it is the *formal, written* term. In speech, characters mostly say "the
  nine days" or "when the Lamps went out." Formal and domestic names for the same event is how
  real vocabulary works, and it means an actor rarely has to say the difficult one.
- **salting** stays because it already means this: salting a mine is planting false ore to
  defraud an inspection. Salting a probe defrauds a navigator. The word was waiting for us.
- **a mouth** stays *because* it is plain. Navigators do not get poetic about the thing that eats
  their friends.

## Q7 · The game's own name → **GAME OF WORLDS. LOCKED.**

Settled 2026-07-25 and applied: 32 occurrences of "Game of Words" across 21 files were renamed
in docs, code comments, `package.json`, the command-station prototype's title, and
`create-placeholders.js`. `README.md` no longer says *"formerly Game of Worlds"* — there is no
formerly. Every shipped player-facing page already said Game of Worlds, so nothing the player
sees changed.

One residue worth knowing about: `server/create-placeholders.js` generates `title.jpg` /
`title.png` with the name burned in. The generator is fixed; if those placeholder images were
ever generated and committed, they still read *Words* and need regenerating or replacing.

## Q8 · Premium races in the fiction → **decided. LOCKED.**

The Registry is an in-world **document**, maintained by Terra, and it is incomplete. A race you
have not unlocked is not absent from the galaxy — it is absent from your paperwork. Quantum,
Titan and Shadow are listed as *unverified*; the Ancients are unlocked by referral because they
only come to a galaxy you have invited others into.

Monetisation becomes worldbuilding rather than fighting it, and no player is ever told a race
"doesn't exist yet."

## Q9 · Smaller things, now decided

- **Does the Bioform Collective know it is right about the Trellis?** **No.** Instinct, not
  knowledge. Nobody in the galaxy has the answer except the Ancients, which keeps the mystery
  tight — and a *faith* that turns out to be correct is far more moving than smugness.
- **Are the twelve races related?** **No.** Convergent history, twelve separate ascents, all of
  which found the roads already swept. A shared ancestor is the single most overused move in the
  genre and its absence is a real choice. It also makes the Trellis stranger: it was not built
  for anyone.
- **How much does the player's own government appear?** Through Rell's mouth only — see Q4. No
  second voice, no override mechanic.
- **Do we ever show the Concord?** Still **open**, and still the single most effective piece of
  storytelling available to us: one playable mission on lit lanes, where transit is free and
  nothing can hurt you, played *before* the player knows what they are looking at. It needs an
  engine flag that disables hazard rolls, which does not exist. If that flag is ever cheap,
  build this mission.

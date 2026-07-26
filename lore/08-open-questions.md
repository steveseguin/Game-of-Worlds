# Decisions and Open Questions

This is the decision record, not the current backlog. Q1–Q4, Q6–Q9 and Q10 are decided; Q5 was
withdrawn after its premise proved false; Q5d was answered by Q10. The remaining decisions are the
Unstable Star's mechanical truth, whether the Concord flashback merits an engine mode, and the two
forks Q10 left open — what a **siteless Wonder announces**, and whether a finished Wonder wins outright
or must then be held. Start with `STATUS.md` for current delivery state and priorities, then use this
file for the reasoning.

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

## Q5d · The `artifact` field is generated and inert → **ANSWERED by Q10. It becomes a system.**

*Superseded 2026-07-26. See Q10 below, which is the authority. The record of the question is kept because
it is the third finding that came from reading the engine rather than the documents, and that pattern is
worth preserving.*


Found by reading `lib/map.js` rather than the documents, which is now the third time that has produced a
finding.

`generateGameMap` rolls **`artifact = 1–5` on 25% of every colonizable world** — micro planet through
homeworld — and writes it to the map table. There is a column for it in the live schema. **Nothing reads
it**: not income, not combat, not victory, not the client. No lore document mentioned it in 150,000 words.

**The question was one of two things, and Q10 chose the second:**

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

---

## Q10 · Relics, the Unattributed, and the Wonder victory → **DECIDED. LOCKED.**

Answered directly by the project owner, 2026-07-26, in five questions plus two follow-ups. This
supersedes the recommendations in `27-the-unattributed.md`, several of which were overruled in favour
of better ones. It resolves `STATUS.md` decision 3 ("Does `artifact` become a system?"): **yes.**

### Q10a · What connects the buried things to the Unarriving? → **a relic was used by someone who did not understand it**

The trigger was **ignorance, not malice**. Somebody dug up a relic and operated it, and that is how
the lanes came to be running both ways.

**This refines Q1; it does not replace it, and Q1 stands unchanged.** The shutdown remains what Q1
says it is — deliberate, informed, from the inside, by the Ancients, with no message left. What is now
accidental is the **breach**, not the response. The Ancients did not fire the gun. They shut the doors
afterwards, on purpose, and have said nothing for seventy-four years.

**Who used it is never specified.** Possibly one of the twelve, possibly somebody long before them.
Naming them would create the villain Q1 deliberately declined, and Law 25's discipline applies to the
cause as much as to the thing itself.

**Why this is the strongest version.** It makes the relic mechanic the direct cause of the setting's
catastrophe rather than a decoration on it. A player who digs up a relic and bolts it into a Wonder is
not doing something *like* the original mistake — they are doing the original mistake, with better
funding. It also explains, at last, why the Ancients say nothing when you find one: they know what one
did. And it costs no rewriting.

**The Ancients' character is unchanged and must stay unchanged:** grim custodians who made an appalling
correct choice and cannot explain it. Not the people who broke the galaxy by accident. That second
version was considered and rejected precisely because it makes them pitiable instead of unknowable.

### Q10b · How does discovery pay out? → **fragments, and they are objects on the board**

This is the answer that changed the design most, and the owner's version is materially better than the
one proposed. The proposal had a per-empire fragment counter, which made map luck a private misfortune
requiring a trade mechanic to soften. Instead:

- A fragment is a **physical thing on a world**, like a building — not a number in a player's ledger.
- **One per world at most**, and most worlds have none.
- Discovery odds stay **small even under heavy development**, so a fragment world rewards sustained
  investment rather than a lucky first turn.
- **It transfers with the ground.** Lose the planet and the invader has your fragment.
- Therefore **a planet becomes worth defending** — something this game has never had. Until now every
  world was interchangeable and you defended whichever was cheapest.
- And an unlucky empire needs **an army, not a consolation mechanic**. The trade-as-mitigation
  argument in `27-the-unattributed.md` is withdrawn; conquest does that work better.

**Reading `artifact = 1–5` as five kinds of part, not five quantities.** Proposed, not locked. It makes
"hold five fragments" mean one of each, which turns the victory condition into literally assembling the
mechanism. It also uses the shipped generator exactly as it already behaves.

### Q10c · Can a fragment be moved? → **yes, by a dedicated hull available to every race**

Moving one requires a purpose-built transport. Checking "Carrier-class or larger" against
`RACE_ACCESS` found that **the Zephyr Swarm and the Shadow Realm can field neither a Carrier nor a
Dreadnought**, which would have locked two of twelve races out of an entire mechanic by accident.

So: a dedicated lifter, **exempt from race doctrine exactly as the Colony Ship already is**
(`races.js`: *"Colony (6) is always allowed"*). Expensive, slow, and defenceless, so committing one is
a real decision and losing one in transit is a disaster.

### Q10d · Do fragments appear anywhere but worlds? → **colonizable worlds only**

Matches the shipped generator, needs no map change, and needs no second discovery mechanism for ground
nobody can develop. It also protects Q10b's whole point: the thing worth defending is a *planet*.

The shoal and small-moon versions were judged better fiction and deferred on scope — a fragment on a
rock the Codex already calls *"worthless as ground, decisive as a position"* is a good later extension,
not a launch requirement.

### Q10e · Naming → **the Unattributed** for the builders, **relic** for the object

- **The Unattributed** stands. The Registry files them under an administrative negative because
  seventy-four years of scholarship produced nothing better, and a galaxy that cannot name them is
  worth more than any name would be. Load-bearing: they must never be called *the Ancients*, who are
  race 9, playable, present tense, and whose entire distinction is that **maintainers are not makers**.
- **Relic** for the object. My proposed coinage *a leaving* is **withdrawn**. Relic is instantly legible
  to anyone who has played a 4X, and the setting has already spent its coinage budget on *shoal*,
  *mouth*, *trace*, *reckoning* and *the Whisper* — one more invented noun on the object players click
  most is a tax that word did not earn. Its fantasy connotations are a real cost and were accepted.

### Q10f · The Wonder is how a relic collection wins → **build time IS hold time**

The owner's proposal, and it turns a dead code path back on rather than adding anything.
`server/lib/victory.js` has carried a **WONDER victory since launch with `enabled: false`** and the
comment *"Disabled until Galactic Wonder construction is implemented"*. Its check is already
build-it-and-hold-it-ten-turns.

- A Wonder costs **resources plus relics** and takes **multiple turns**.
- **Building it and holding it are the same clock.** There is no separate hold phase after completion;
  the construction period *is* the vulnerable window.
- **Construction is announced to every player when it starts, including the sector.** The fiction does
  this for free and no intelligence has to leak: a Wonder is a Lamp being relit. It is a light.
- **Taking the sector mid-build destroys the works.** The relics transfer with the ground, so the
  attacker gains the parts and starts over. Inheriting progress would let a rival snipe turn nine and
  *steal* the win, rewarding nine turns of inactivity; destroying it means the snipe *denies* the win,
  which is the intended tension. Recorded as the writer's call, open to veto.
- This also removes a latent bug: the dormant check computes `turnsHeld = currentTurn - turnBuilt` while
  selecting on `WHERE owner = ?`, so a captor would inherit the full elapsed clock and win instantly on
  taking a ten-turn-old Wonder. Under build-is-hold the clock resets with the ground and the bug cannot
  occur.

### What the code already provides, verified rather than assumed

| Already there | State |
|---|---|
| `lib/map.js` rolls `artifact = 1–5` on 25% of colonizable worlds, one per world, persisted | works, read by nothing |
| `SECTOR_STATUS.ARTIFACT` in `public/js/ui.js`, cyan `#40C0FF` | defined, never used |
| `wonders` table — `owner`, `type`, `turn_built` | created for every game, written by nothing; needs a sector column |
| `WONDER` victory in `victory.js`, build-and-hold-ten-turns | present, `enabled: false` |
| `production_turn` / `production_used` per-turn production budget | live; can express "multiple turns" without inventing a timer |
| `systemalert::` broadcast to all players | live, two emissions |

**One notable first:** nothing in this game currently has a build time. Everything completes on payment,
gated by production capacity. A Wonder would be the first object with a duration — an acceptable place
to introduce one, since it is a single object, once per game, and the production budget can carry it.

### Three conflicts this created in `13-wonders/README.md`, found on review and reconciled there

Q10 was written without checking the Wonder rule set, and it contradicted three of its seven rules.
`13-wonders/README.md` has been amended; the substance is here so the decision record is complete.

1. **Rule 2 said the research capstone was the prerequisite "and nothing else. No shortcuts, no
   purchase, no trade."** Q10 adds a relic gate, and relics can be given — by conquest, and physically
   by lifter. So the prerequisite is now partly purchasable. That is a genuine departure from the
   original intent, accepted deliberately, because a prerequisite you can be *helped* towards is what
   keeps bad map luck answerable.
2. **Rule 3 said construction is visible to any empire that can see the sector.** Q10f is stronger: it
   is announced to everybody with its sector. **And it left the one exception broken.** The Shadow
   Realm's Assembled Frame **has no site**, which `13-wonders/README.md` calls the whole point of the
   Shadow Realm. A universal sector announcement has nothing to announce for them. **This is now
   open:** decide what a siteless Wonder tells the galaxy before implementing the announcement, because
   the obvious implementation deletes the best-designed exception on the roster.
3. **Rule 6 said a Wonder "does not win by existing — an accelerant, not an autowin. A player with a
   finished Wonder and no army still loses."** Q10f makes a finished Wonder the victory. The rule's
   *intent* survives — construction is long and publicly advertised, so finishing means surviving a
   siege, and an army is still required — but the letter of it is wrong, and it was written when the
   two clocks were separate. If the trade is unwanted, the fix is to require holding the *completed*
   Wonder for a further N turns, which restores Rule 6 and gives up the simplification Q10f was chosen
   for. Recorded as a live choice.

### Still open after this

- **What the Shadow Realm's siteless Wonder announces.** Newly open, see above. Blocks the
  announcement.
- Whether `artifact = 1–5` means five kinds or five grades (Q10b, proposed).
- Whether a finished Wonder wins outright or must then be held (conflict 3 above).
- Every number: discovery odds, relic count per Wonder, build duration, lifter cost.
- Whether the lifter needs art before it can ship.

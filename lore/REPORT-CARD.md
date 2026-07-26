# Report Card

A standing, honest assessment of `lore/` and the shipped game against a rubric derived from story
craft, worldbuilding theory, tabletop design, comics serial structure, and empirical work on
narrative engagement.

**Current-use note (2026-07-26).** This file is an audit history: each revision records what was
believed and verified at that time. Use `STATUS.md` for the current backlog and `README.md` for
authority and navigation. Later review found three defects in R10's first implementation — an
incorrect turn source, repeat choices inside the grace window, and chart identity missing from compact
map snapshots. They are now fixed and guarded; the historical R10 text below remains as the record of
that pass.

**Rules for this document.** Grades go up only when something material changed, and the change must be
verifiable by someone who did not make it. A grade may be **lowered** on review if an earlier pass
claimed credit it did not earn. Optimism about our own work is the failure mode this file exists to
prevent.

**Revision 11 — 2026-07-26.** A review pass rather than an improvement pass. It found a **live
map-breaking bug** on the deployed branch, three conflicts between one-day-old canon and existing canon,
and a documented wire payload that never existed. **Internal consistency comes down, A− → B+**, and the
reason is structural rather than incidental. Detail in R11.

**Revision 10 — 2026-07-26.** Target: *Co-authorship (D)*, the lowest grade on the card and unmoved
since R2. The naming picker is built and the map shows what the player chose. One grade moves. Detail
in R10.

**Revision 9 — 2026-07-26.** Target: the Delivery block, which had been the four lowest grades for six
revisions and was the one section no amount of writing could move. Three grades move, two are held
down, and for the first time a grade moved on evidence from **production** rather than from the
repository. Detail in R9.

**Revision 6 — 2026-07-26.** `24-anthology/` — **104 short pieces, ~21,000 words**, one per hull,
building, technology level, sector type, Wonder and signature weapon, plus colonists, terraforming,
travel, spying, battle from both sides, and leadership from the top and the ranks. Three grades move;
one is held down by a defect in the work itself. Detail in R6.

**Revision 5 — 2026-07-26.** Target: every criterion that does **not** require a code change. Seven
moved, one section grade corrected downward as bad arithmetic. Detail in R5.

**Revision 4 — 2026-07-26.** Target: *Co-authorship (D)*. **No grade moved.** See R4 — the work was
real and it did not cross any criterion's threshold, and saying so is the point of this file.

---

## Grades

| | Criterion | R1 | R3 | R6 | R10 | R11 | |
|---|---|:---:|:---:|:---:|:---:|:---:|---|
| **A. World** | Limitation over power | A | A | A | A | **A** | — |
| | Material logic | A | A | A | A | **A** | — |
| | Internal consistency | A− | A− | A− | A− | **B+** | ▼ again — new canon contradicted old canon in three places. Every guard checks prose against *code*; nothing checks prose against *prose* |
| | Causal history | A− | A− | A− | A− | **A−** | — |
| | Sensory concreteness | A− | A− | A | A | **A** | ▲ in R6 — things are handled now, in 104 places |
| | Restraint *(means, not end)* | D | B− | B− | B− | **B−** | held twice — the corpus still grows faster than the delivered fraction |
| **B. Character** | Distinct voice | A | A | A | A | **A** | con retired; not inflating to A+ on three scenes |
| | Contradiction / flaw-as-strength | A− | A− | A | A | **A** | ▲ in R6 — Zephyr and Quantum fixed |
| | Want, obstacle, cost | B− | B− | B | B | **B** | ▲ in R6 — ~40 people want something and pay for it |
| | Change within the story | C | C | C+ | C+ | **C+** | Rell and Sesse develop *within* the story |
| | Agency | D+ | D+ | B− | B− | **B−** | ▲ in R6 — 104 pieces in which somebody does something |
| **C. Story** | Theme carried by structure | A | A | A | A | **A** | — |
| | Setup and payoff | A− | A− | A | A | **A** | ▲ in R6 — some of it now pays off to a *player* |
| | Causality *(therefore / but)* | B | B | B+ | B+ | **B+** | Act One chains therefore/but explicitly |
| | Escalation | C+ | C+ | B− | B− | **B−** | the galaxy finally has a clock |
| | Emotional range | D | D+ | C+ | C+ | **C+** | range across 104 pieces; still short on comedy |
| **D. Delivery** | Redundant discovery paths | B− | C | C | B− | **B−** | ▲ in R9 — the core conceit is learnable three ways |
| | Legibility to a newcomer | C− | B− | B− | B+ | **B+** | ▲ in R9 — the tooltip names the sector; the panel states the premise |
| | Co-authorship | C | D | D | D | **C+** | ▲ the player names the shoals they sweep, and the map shows it |
| | Contact with the audience | F | B− | B− | B | **B** | ▲ in R9 — verified live on gameofworlds.com, byte-identical |

**Sections — World A− · Character B+ · Story B+ · Delivery B− · Overall B**

*Computed, not felt: World **3.62** (was 3.68 — Internal consistency lowered in R11), Character 3.20,
Story 3.26, Delivery **2.83** (was 2.10 at R6), overall **3.26**. **Twelve of twenty criteria are still
below A.** Delivery has gone from the section that could not move to the section that moved most, and it
is no longer last by a wide margin. The lowest grades are Change within the story, Emotional range and
Co-authorship, all at C+ — and the one that just fell is the one worth watching, because it fell for a
missing guarantee rather than a specific mistake.*

---

## R11 — a review pass, and a grade that has to come down

No new writing. The instruction was to review everything, make sense of it, and correct what was wrong.
Four things were wrong, and one of them was live in front of players.

### The live bug

Chart names were added to the `mapstate::` snapshot as three extra fields. An unnamed sector encodes an
empty chart name, which puts a literal `::` **inside its own record**:

```
mapstate::19:1:0:10:1:1::0:0,20:1:0:9:1:0::0:0,13:2:0:6:0:0::0:0
                       ^^                 ^^                 ^^
```

The client derived its payload with `message.split('::')` and took element 1, so **every snapshot was
truncated at the first unnamed sector** — and almost every sector is unnamed. A whole-galaxy update
collapsed to one tile. Nothing threw. Probed sectors stayed fogged, ownership stopped updating, and the
only symptom was a map that would not change.

Fixed by stripping the known prefix instead of splitting on a delimiter that occurs inside the payload,
which also means future field additions cannot reintroduce it. Guarded by
`tests/mapstate-delimiter.test.js`, which pins the **hazard** rather than the fix: it asserts the encoder
still produces `::` for unnamed sectors, so anyone tidying the parser back into a split fails with the
reason. Writing that guard turned up a third record shape nobody had accounted for — the probe-loss
marker is six fields, not nine, and survives only on the parser's destructure defaults, now also pinned.

**The comment above the bug claimed the opposite.** It read *"Empty trailing fields preserve
compatibility for unnamed sectors"* — describing, as a safety property, the exact thing that was breaking
the map. A confident comment on top of a silent failure is worse than no comment.

**How it was caught matters.** An end-to-end probe assertion found it: the harness probes sector 13 and
asserts the tile leaves fog. That is an expensive way to find a string bug, and it only worked because
the suite exercises a real game. No unit test could have seen it, and no amount of reading did.

### Internal consistency A− → **B+**, and why

Q10 was written yesterday and **contradicted three of the seven rules in `13-wonders/README.md`**:

- Rule 2 said the research capstone was the prerequisite *"and nothing else. No shortcuts, no purchase,
  no trade."* Relics are now also required, and relics can be given.
- Rule 3 said construction is visible to whoever can see the sector. Q10 announces it to everybody with
  its location — **and left the one exception broken.** The Shadow Realm's Wonder *has no site*, which
  that file calls the whole point of the race, so a sector announcement has nothing to announce for them.
- Rule 6 said a Wonder *"does not win by existing — an accelerant, not an autowin."* Q10 makes a finished
  Wonder the victory.

All three are reconciled and recorded. The grade still has to fall, because **the failure was structural,
not careless.** Every canon guard built in this project checks prose against **code**. Nothing checks
prose against **prose**. Q10 versus `13-wonders/` is precisely that gap, and it is the second time canon
has contradicted canon without anything noticing — the first was the sector-types error in R7.

Precedent applies: R7 lowered this grade for an unguarded consistency failure and R8 restored it once
tests, not reading, did the checking. The same standard says B+ until prose-versus-prose has a guard, and
it does not yet.

**Being clear about what is and is not claimed:** the conflicts are fixed and the world is coherent
today. What is missing is any reason to believe it will still be coherent after the next decision, and
that is what the grade measures.

### A payload documented that never existed

`websocket-protocol.md` described `namechoice::` as carrying `{sector, chosen, candidates, turn,
deadline}`. There is no `deadline`, and the field it omitted — `cost` — is the one the prompt actually
renders, and the whole emotional point of the feature. My error, written before the field was named and
never revisited.

The contract test checked that every prefix was registered, parsed, and *mentioned* in the docs. It never
looked inside a payload. It does now, for the one prefix whose documentation spells out a key list, and
it also asserts the client reads no key the server does not send.

### Smaller corrections

- `26-encyclopedia.md` — the "start here for facts" file — still called the relic reading *"not canon
  until a mechanics decision is made"* after that decision was made. It also gained a `Relic` entry,
  which I first filed under **A**, in an A–Z index. Both fixed.
- `08-open-questions.md`'s own header still listed the artifact field among the open decisions.
- One `13-wonders/` amendment records a genuine loss rather than a tidy-up: the relic gate makes a Wonder
  prerequisite partly purchasable, which Rule 2 explicitly forbade. That was accepted deliberately, and
  saying so is better than quietly deleting the old sentence.
- A commit that should have been 12 lines was 65, because an edit normalised 55 pre-existing bare-LF
  lines in a CRLF file. Redone byte-preserving. This is the fourth time that trap has been hit.

### What did not move, and why

Nothing else. This pass found and fixed problems; it did not deliver anything to a player or write
anything new, so **Restraint, Contact, Legibility, Co-authorship and discovery paths all hold.** Fixing a
regression restores a grade's existing basis rather than earning more.

### The next thing this card needs

A prose-versus-prose guard, because that is now the only unguarded class of error left in a folder this
size. It does not have to be clever: for each file that claims to be the authority on something, assert
that no other file states a contradicting rule about the same named object. Even a narrow version —
Wonder rules, victory conditions, hazard odds — would have caught all three of today's conflicts.

---

## R10 — the player writes on the map

`lore/18-naming-the-dark.md` had sat as a design proposal for five revisions with a note saying it was
the only item from the craft audit needing engine work. R4 built its foundations —
`server/lib/sector-names.js`, the three schema columns, the deterministic candidate generator — and
then honestly refused to raise the grade, because the server still picked the name and the player had
no say. That was the right call and it left the work half-finished for six revisions.

### What shipped

**The player names the shoals they sweep.** On a successful sweep the server sends `namechoice::` to
the one player entitled to name the place, with six candidates and *what the crossing cost*. The prompt
leads with the cost — **"4 hulls did not arrive at C8"** — which is the beat the whole proposal was
built around: you are asked to name a place after what it took, at the instant you learn it was worth
it. A clean sweep gets its own line rather than "0 hulls", because nothing lost is a different thing
and not a smaller one.

**The map shows it.** This is the half that decides whether the feature is real. The client had been
receiving `sectorname`, `namedby` and `namedturn` on every sector detail since R4 and reading none of
them, so a player would have chosen a name and then never seen it again. The tooltip now leads with the
chart name, keeps the type as its classification, and credits the namer and the turn: *"the Vail Shoal
— sector C8, Asteroid Belt / named by you, turn 12"*. Charting also gets its own feed icon and the only
distinct hue in the palette, because it is the one event that leaves something permanent behind.

**Nothing a player types can reach another player's map.** The wire carries an index into a
server-generated list, never a name, so there is no moderation surface — which is the only reason a
permanent shared label was shippable at all. The `UPDATE` is fenced by `namedby`, so a conqueror
inherits the name the people who paid for it gave it. That was the best detail in the proposal and it
is now enforced by SQL rather than intention.

### Co-authorship — D → **C+**

Before this pass the player added nothing to the world, ever, in any form. Now they make one permanent,
visible, credited mark, at the emotional climax of the game's signature mechanic, and it outlives their
empire. That is a categorical change and it is worth two and a half steps.

**Why not B−, honestly.** Three real limits, and none of them is small:

1. **It is gated behind an act a player may never perform.** Asteroid belts are 10% of the map. A
   player who never sweeps one co-authors nothing all game, and the grade has to describe that player
   too.
2. **Choosing one of six is a small creative act.** The proposal said *"you name it"*, which reads as
   free text; what shipped is a menu. That was a deliberate trade for shippability and it is still less
   than the proposal promised.
3. **Rule 5 is unbuilt, and it was the pervasive half.** *"After twenty turns the player's own event
   log is written in their own vocabulary"* — the feed uses the chart name in the naming confirmation
   and nowhere else. Every other message still prints a hex token. That is where this feature stops
   being a moment and becomes the texture of a game, and it is the highest-value thing left on this
   card.

The first implementation had a narrower delivery defect: the tooltip only knew a name after focused
`sector::` detail arrived because compact `mapstate::` omitted chart identity. The map snapshot now
carries the URI-encoded name, namer and turn for both live and remembered sectors.

### Two defects found on the way, both pre-existing

**The sweep announced a name that was not on the chart.** The confirmation printed the freshly generated
default while the three `COALESCE` clauses beside it could have kept an older one — reachable when a
sector's owner is cleared and it is swept again. Harmless while the default was the only name a sector
could have, and a lie the moment players started choosing. It now reads the name back out of the table.

**A code comment had gone stale in the opposite direction.** The note explaining Quick Help's colonize
line said it had been corrected *to* the Build tab; commit `ee361ab` then moved ship production into
Fleet and made the explanation wrong. Verified against `git log -L` rather than from memory before
rewriting — the line has now been wrong in both directions, which is what the comment says.

### On the guards

Ten handler tests, eight schema tests, two browser tests. Two things are worth noting because they are
the kind of thing that makes a suite worth having rather than just long:

- The schema guard **failed on this change and was right to**. It asserted exactly one statement writes
  `sectorname`; there are now two. Rather than relax the count, it now finds both and holds each to its
  own rule — the sweep must use `COALESCE` and never overwrite, the picker must not use it and must
  therefore be fenced by `namedby` instead. A third writer still fails.
- One of my own tests was a **race, not a test**: it waited 5ms for an async callback, passed in
  isolation, and failed inside the full suite where a dozen processes compete. It now waits for the
  reply, which is the actual completion signal. Three consecutive full runs at 268/268.

---

## R9 — the setting reaches a player

Every previous revision improved the writing. This one changed **who can read it.** For six revisions
the four lowest grades on this card were all in Delivery and every one carried the same note — *needs
code* — while the corpus grew to ~159,000 words that no player could reach by any means. That was the
real defect, and it was not a writing defect.

### What shipped

**1. The map tooltip names the sector.** `SECTOR_LORE` in `public/js/ui.js` — eleven entries, each a
code-verified type name plus one line of under 24 words. Before this the hover panel showed a sector
number and its yields and **never once said what kind of place it was.** A player could hover a black
hole and a large planet and read the same shape of box. This was the largest single legibility hole in
the product and it had nothing to do with lore: the game was failing to name its own terrain.

**2. A codex, in the panel that already existed.** `public/js/codex.js` — four tabs (The Galaxy,
Sectors, The Twelve, Words), ~740 words, added to the help overlay that was already built, already
styled and already wired to a button. Quick Help stays the default tab, so the new-player path is
unchanged. The Galaxy tab states the premise in five short paragraphs; Sectors explains all eleven
terrain types; Words is the ten terms a player will meet in the feed and cannot otherwise decode.

**3. It is verified as a player, not as a file.** `tests/e2e/codex.spec.js` drives a real browser into
a real game, clicks the `?` button, switches every tab, and reads what a player would read — including
that Quick Help is default, that going back works, that reopening does not duplicate the tab bar, that
nothing overflows the panel horizontally, and that **Law 25 holds on the delivered surface** (no
*quarantine*, no *sealed*, no *containment*). Proven to bite: pointing the script tag at a filename
that does not exist takes the spec from 5 tabs to 0. The two unit assertions added alongside it
(`lore-sector-types-match-code.test.js`) would both still have passed against that broken build, which
is exactly why the spec exists.

### Contact with the audience — B− → **B**

This is the first grade on this card ever moved on production evidence. All ten client files from
commit `93fe06e` were fetched from `https://gameofworlds.com` and compared to local: **ten of ten
byte-identical**, `codex.js` 11,623 bytes matching on md5, and the live `ui.js` containing
`SECTOR_LORE` and naming Unstable Star, Brown Dwarf and Small Moon. The writing is in front of players
now.

**Why not higher.** Exposure is not response. There is no telemetry on the help panel, so the honest
claim is *a player can reach it*, not *a player read it*. And what they can reach is 740 words of
roughly 159,000 — the anthology, the twelve race bibles, the Wonders and the timeline remain
unreachable by any route. B is "it arrives"; A would need evidence it landed.

### Legibility to a newcomer — B− → **B+**

Someone who has never read a word of `lore/` can now open one button and learn the premise, and can
learn what any square on the map is by pointing at it. Those are the two questions a new player
actually has, and until this pass the product answered neither.

**Why not A−.** The Twelve tab chooses voice over information: *"Decline to have crossed it"* is a good
line and it does not teach anybody what the Quantum Entities do. Nothing in the panel explains Wonders,
the Emissary, the clock, or why the twelve are at each other's throats. And there is no path from the
panel to the corpus — a player whose interest the codex successfully catches has nowhere to go next.
That last one is the cheapest remaining improvement on this whole card.

### Redundant discovery paths — C → **B−**

The load-bearing conceit of the setting — *FTL is blind, which is why a gravel bank kills you* — is now
learnable three independent ways: from the feed at the moment it happens to you, from the tooltip on
the sector before it happens, and from the codex if you go looking. Two of the three are player-pulled
rather than pushed past you in a scrolling log.

**Why not B.** Only the core conceit is genuinely redundant. Everything else is still single-path or
no-path. A player can complete a game without encountering a Wonder, a race's doctrine, or the
Unarriving as anything but a phrase.

### Restraint — held at **B−**, and the reason is uncomfortable

This pass delivered 740 words to players and wrote roughly 2,500 new ones for the folder
(`27-the-unattributed.md`). The ratio the con has always described — enormous corpus, tiny delivered
fraction — is essentially unchanged, and rounding it up because delivery finally started would be
exactly the inflation this document exists to prevent.

One real win to bank, though: Law 25 used to be a rule I intended to follow. On the delivered surface
it is now a test that fails if I do not.

### Co-authorship — held at **D**

Unmoved since R2, still the lowest grade on the card, and still blocked on the same thing: the server
picks sector names and the player has no say. Nothing in this pass touched it.

### One defect found and fixed, in code rather than canon

The inline comment on Quick Help's instruction list described the colonize line's tab as having been
corrected *to* Build — which commit `ee361ab` then made wrong by moving ship production into Fleet. The
player-facing text was correct (the user's commit updated it); my comment explaining it was stale and
would have misled the next reader into "fixing" a correct line. Verified against
`git log -L` before rewriting rather than from memory: the line has now been wrong in both directions,
which the comment says. The user's own `tests/build-and-fleet-tabs.test.js` guards the text.

---

## R8 — a real consistency audit, and two more errors

R7 lowered Internal consistency to B+ because an external check found a six-pass falsehood on its first
try. This pass did the audit properly: **extract every load-bearing number from the code and check the
prose against it**, rather than reading and hoping.

### Verified correct

Hazard odds (0.5 transit / 0.25 arrival), probe cost (300), move-discount cap (0.6), colony ship (500
metal), all six building costs quoted as piece *titles*, spaceport capacities (12/20/32/48), all nine
shipyard requirements, and **all seventeen tech max levels** the folder cites. Those were right.

### Two errors found, both in freshly written canon

**1. A dreadnought "four turns to build."** This game has **no build time at all** — hulls complete when
you pay, gated by production capacity (documented in `races.js`). The piece now quotes the real gate:
3,200 metal, 450 crystal, and a slip with capacity to take it in one turn.

My first sweep for this class of error *missed it*, because I wrote a case-sensitive grep and the phrase
began with a capital letter and wrapped a line break. **My audit was as sloppy as the thing it was
auditing.** The guard now flattens newlines and matches case-insensitively.

**2. A tier-four spaceport costed at 1,600 metal / 500 crystal** — the price of its *last upgrade step*,
not the cumulative total.

**And the fix was also wrong.** I corrected it to 2,750 / 850, forgetting the base Spaceport's own 100 /
50. The real figure is **2,850 / 900**. This was caught because the guard was strengthened mid-pass to
read the *prose* rather than only assert the constant — asserting a constant against a hard-coded
expectation only proves the code has not moved and says nothing about whether the lore agrees. Both
errors this test exists for were in the lore, so the lore is what it has to read.

### Internal consistency B+ → **A−**, and why not higher

*Pro:* the load-bearing numbers are now pinned by `tests/lore-constants-match-code.test.js` (8
assertions) and `tests/lore-sector-types-match-code.test.js` (5). Sector types, hazard odds, every
building cost, every shipyard level, every tech ceiling, the no-build-time rule, and the cumulative
spaceport figure are all checked by something that is not me. **251/251 pass.**

*Con, and it is why this is not an A:* the guards cover the numbers that are *quoted as figures*. They do
not and cannot cover the much larger surface of narrative consistency — whether a character's age works,
whether two pieces describe the same engagement compatibly, whether a race's voice holds. Three of the
errors found across R5–R8 were of that kind (Marn double-booked, Wren's age, the shoal at the
destination) and every one was found by hand. **That surface is still ungoverned.**

---

## R7 — a six-pass canon error, and the guard for it

**Internal consistency lowered A− → B+.** Not because new work was sloppy, but because looking for
improvements surfaced a falsehood that had been in the folder since Pass 1 and had propagated into six
documents and an anthology file.

**The error.** Every version of this folder asserted that sector types 3, 4 and 5 were *"OPEN —
unassigned,"* *"three free slots,"* *"nothing uses them."* They were never free. `server/lib/map.js`
defines `UNSTABLE_STAR`, `BROWN_DWARF` and `SMALL_MOON` with names and descriptions;
`generateGameMap` rolls **each at 5% of every sector on every map**, so fifteen per cent of the galaxy is
made of them; and `connect.js` and `GUI.js` have both been printing their names to players since the game
shipped.

An hour before finding this, I wrote anthology fiction inventing a **Wreck Field** and a **Dead Lamp** for
those slots. Both are cut. They describe nothing that exists.

**Why this is the most useful finding of the session.** Rule one of `lore/README.md` is *"the code wins."*
I published that rule, enforced it on other people's work, built a precedence order around it — **and never
opened `lib/map.js` across 150,000 words.** The failure was not carelessness in one file; it was trusting a
document's summary of the code instead of the code, six times in a row.

**The fix is not the correction, it is the guard.** `tests/lore-sector-types-match-code.test.js`, five
assertions:
- the generator still produces eleven types with the three real names;
- **no lore file claims 3–5 are unassigned** — the exact phrasing that propagated;
- the anthology heads pieces with the real types, not the invented ones;
- exactly two types are `hazardous`, at 0.5 and 1.0 (Law 4 and the whole shoal/mouth vocabulary rest on it);
- colonizable is still 6–10 (`victory.js` queries `BETWEEN 6 AND 10`).

It caught two files I had not yet fixed, and then caught a "retained so the error is legible" section I had
written — correctly. A labelled false claim is still a false claim in a folder, which is precisely how this
one spread. The original wording is now deleted rather than archived.

**243/243 pass.**

**What this says about the other grades.** Every criterion in this document except the four Delivery ones is
graded on prose I wrote and checked myself. This is the first time an external check — a test reading the
actual code — was pointed at the canon, and it failed on the first try. That is not an argument for
despair; it is an argument that **the remaining confidence in this report card should come from guards, not
from my own reading.**

---

## R6 — the anthology

`24-anthology/`: **104 pieces, ~21,000 words**, 150–250 words each, one per object in the game. Nine
hulls, six buildings, twelve technology levels, nine sector types, twelve Wonders, twelve signature
weapons, plus colonists across forty years, terraforming across three generations, travel, spying,
battle from both ends, and leadership from the top and from inside the mass.

**Three sector types were claimed on the way.** Types 3–5 had been reserved as *"other non-colonizable
hazards"* and unused since the game shipped. The fiction now claims all three — an **Unstable Sun**
(the only hazard that can be *learned* rather than bought, because its flare rhythm is forty-one minutes
and nobody had ever sat still long enough to notice), a **Wreck Field** whose salvage is *charts*, and a
**Dead Lamp**, which is worthless by every measure on the assessment form and has cost four empires two
thousand three hundred hulls. Mechanics stay PROPOSED and uncosted.

### Agency D+ → **B−**

*Pro:* this was the folder's worst structural defect for five revisions — *"twenty-four stories and not
one shows a character doing the thing while you watch."* There are now 104 in which somebody does
something: a gunner counting nine hundred and forty punctures in a hull with a grease pencil because no
form wants the number; a pipefitter pumping water uphill in four stages for fourteen months; an officer
holding station for two hours over an unarmed colony ship because he *"did not want to be the officer who
had made that decision quickly."*

*Con:* still unbuilt, still unreachable by a player, and codex text is the weakest possible delivery for
agency — a player *reads* these rather than acting. **B−, not B.**

### Sensory concreteness A− → **A**

The stated con was *"described in a bible, never experienced in a scene."* Now: a bulkhead that glows
like a stove element for six minutes while forty people watch it; reactive plate going off down a flank
*"like somebody running a stick along railings"*; the grey film plasma leaves on a far bulkhead that a
damage-control chief scrapes himself rather than roster to a nineteen-year-old.

### Want, obstacle, cost B− → **B**, Emotional range D+ → **C+**

Roughly forty named people now want something and pay for it. And range genuinely widened — but
**Emotional range stops at C+** because the comedy is still thin: three interludes and a market scene
against 149,000 words, and I have removed more jokes from the shipped game than I have put back.

### A defect in this work, disclosed

**"Nine" and "eleven" appear 192 times across 104 pieces, and only 24 are canon-locked.** That is a
visible authorial tic — a reader who gets through twenty pieces will notice the writer has two favourite
numbers.

It is **not** fixed in this pass, on purpose. Many arbitrary instances are load-bearing across pieces:
nine hundred Zephyr hulls in one file pairs with three hundred and forty losses in the piece beside it,
and crew counts and tallies cross-reference between files. A find-and-replace would break those quietly,
and Internal consistency is a grade this folder has worked for. Logged as a per-piece editorial pass with
cross-references checked by hand.

**Restraint holds at B−** and arguably should not have. This is 21,000 more words, and although it is
codex-shaped and production-bound, the ratio of written-to-shipped got *worse*, not better. It is held
rather than lowered because the pieces are sized and formatted to drop into the game as-is — but if the
next pass is also writing, this should go down.

### Test state at R5, honestly

`npm test` is **231/232**. The single failure is `no-dead-dom-targets.test.js` complaining that
`crystal-balance` now exists in `public/js/shop-enhanced.js` — **not mine.** I never edited the shop, and
my own `game.html` diff shows a second changed line I did not write (somebody bumped the shop
cache-buster while I was working). The 58 tests covering everything I did change are **58/58**.

This is the concurrent-editing caveat from R3 showing up concretely rather than theoretically. I have
left the shop failure alone: it belongs to work in flight, and "fixing" it would mean editing somebody
else's absent-list mid-change.

*R3 recorded Delivery as C+. Recomputing it honestly — C, B−, D, B− — gives **C**. Corrected, with no
change to any underlying grade. That is the second arithmetic flattery this document has caught in
itself, which suggests section averages should be computed rather than felt.*

---

## What changed in R3

**The feed copy is installed.** 23 player-facing strings in `server/server.js` replaced with the copy
from `17-the-feed/` — all twelve movement and hazard events, both probe events, colony, research, and
four refusals. The black hole now reads *"There is a mouth at 9D. I know because nothing came back from
9D. That is the only way anyone has ever known."*

**Both consumers of that text were repaired rather than worked around.** Message text drives two
systems, and both are prose-coupled by construction:
- `connect.js` icon classifier: added the `shoal|mouth` vocabulary, and fixed `coloniz` → `colon`
  (the feed says *Colony confirmed*, which contains neither the z nor the i — my own error, caught by
  the test).
- `advisor.js` observers: five patterns had gone dead. Rewritten to match a distinctive phrase per
  message rather than incidental nouns, with the mouth check ordered before the shoal check.

**Two latent bugs fixed on the way**, neither mine:
- The colonisation observer put its alternation *inside* the capture group, so a colonisation only ever
  reported its sector on the branch the server does not send. Sector suffixes had been silently missing.
- The enemy-hazard observer matched `was destroyed|lost` and the black-hole variant says *did not come
  out of*, so half that event never fired.

**`shoalSwept` added — a beat the narrator had never had.** Sweeping a shoal is the one positive-sum
act in the game and the advisor said nothing about it. Now all twelve voices have a line, tone-routed
as a success. 227 lines across 17 events per race.

**Three prose-coupled tests rewritten to assert intent.** They pinned exact sentences as a proxy for
behaviour. They now assert the discrimination that matters — that a *locked* branch names no level
while a *cap* does, that a doctrine refusal names the hull, that a crystal rejection sends exactly one
message and names the shortfall. That is a stronger test than the sentence was, and it means the next
copy pass will not break them.

### Verification

- `npm test` **216/216 pass**, every file individually green, full glob green.
- All three edited sources parse; the server boots under `USE_MOCK_DB`.
- Ten sample feed messages traced end to end: every one lands a meaningful icon, **none** falls to the
  generic dot, and observers fire with sector capture working.
- Diff hygiene clean on all six files — raw and whitespace-ignoring diffs identical.

### Two honest caveats on that verification

1. **This repo is being edited concurrently.** I received multiple "file was modified" notices during
   the session, and `tests/race-modifiers-are-consumed.test.js` is untracked and changed contents
   between two of my runs. **The green suite is a snapshot, not a guarantee.**
2. **I mis-attributed a failure in R2.** I reported a `unitModifiers` test failure as "pre-existing" on
   the basis of a single run taken while I had `server.js` stashed. The test containing that assertion
   is not in the working tree now. The claim was unverified and I withdraw it.

---

## Pros and cons — the grades that moved

### Contact with the audience — C → **B−**

*Pro:* both narration channels now carry canon. The advisor speaks in twelve distinct registers; the
event feed uses the written copy; icons and observers are correct and test-guarded. A player who never
opens a codex now learns from play that a shoal is worth holding, that a mouth is known only by what
fails to return, and that a probe buys one fact with three hundred of reckoning.

*Con, and it is why this is not an A:*
- **Nothing is deployed.** All local. No player has seen a word of it.
- Turn and victory copy unshipped — `17-the-feed/07` needs a UI decision on narrator silence.
- Variant rotation not implemented; variant **a** ships everywhere, so lines will repeat audibly.
- No codex, no campaign, no naming feature. The Long File remains unreachable.

### Restraint — C− → **B−**

*Pro:* the folder is now demonstrably a means. `14-peoples/` supplied registers, `17-the-feed/` supplied
copy and a charter, `21-matchups-and-mysteries.md` supplied a test comment. Three lore documents turned
into shipped code, two bug fixes and eleven tests.

*Con:* still a few hundred lines converted out of ~119,000 words. The ratio remains the single most
damning fact about this folder.

### Legibility to a newcomer — C+ → **B−**

*Pro:* the *core loop* now explains itself in play. The hazard, probe and sweep messages teach the
central trade without a tutorial, in the player's own race's register.

*Con:* still only the parts of the setting that touch the loop. Nothing conveys the Trellis, the
Unarriving, or why anyone is fighting. A newcomer learns the mechanics' meaning, not the world's.

### Emotional range — **held at D+**

Deliberately not raised. The four refusals I shipped carry the only humour in the game
(*"I can show you the ledger or you can take my word for it, and the ledger is duller"*), and register
variety is now real in play. But I still removed more jokes than I added, comedy remains close to
absent, and one dry line per refusal is not range. Raising this would be flattery.

---

## Remediation log

**R1 → R2.** Rewrote `advisor.js` to canon: 3 non-canon voices → 12 registers. Removed shipped
violations (levity over mass casualties, quippy register, collapsed race mapping). Added
`tests/advisor-voice-canon.test.js`, proven to fail against the old file. Bumped the cache-buster.
Contact F→C, Restraint D→C−, Legibility C−→C+, Emotional range D→D+. Lowered discovery paths B−→C and
co-authorship C→D as inflated.

**R2 → R3.** Installed 23 feed strings into `server.js`. Repaired both prose consumers. Fixed two
latent observer bugs. Added `shoalSwept` across twelve voices. Rewrote three tests to assert intent.
216/216. Contact C→B−, Restraint C−→B−, Legibility C+→B−. Corrected an R2 mis-attribution.

**R8 → R9.** Named the sector type in the map tooltip (`SECTOR_LORE`, eleven entries) and added a
four-tab codex to the existing help overlay. Verified in a real browser by `tests/e2e/codex.spec.js`,
with a negative control, plus two unit assertions. Confirmed live on `gameofworlds.com` — ten of ten
client files from `93fe06e` byte-identical. Fixed a stale code comment that `ee361ab` had invalidated.
Indexed `27-the-unattributed.md`. Contact B−→B, Legibility B−→B+, discovery paths C→B−. Held Restraint
at B− and co-authorship at D.

**R9 → R10.** Built the naming picker: `nameSector` in server.js, `public/js/name-picker.js`, the
`namechoice::` / `//namesector` pair, and the chart name on the map tooltip with its namer and turn.
Added a `chart` event kind. Fixed the sweep announcing a name `COALESCE` had not written, and a stale
comment `ee361ab` had invalidated. Strengthened the schema guard from one name-writer to two, each with
its own rule. 268/268 units across three consecutive runs; e2e with a proven negative control.
Co-authorship D→C+. Everything else held.

**R10 → R11.** Review pass, no new writing. Fixed a live bug that collapsed the whole map snapshot to one
sector whenever any sector was unnamed — `mapstate::` records contain `::` and the parser split the
message on it. Guarded the hazard, not the fix, and found a third six-field record shape while doing it.
Corrected a documented `namechoice::` field that never existed and taught the contract test to look inside
one payload. Reconciled three conflicts between Q10 and `13-wonders/README.md`, and recorded a new open
question Q10 had broken without noticing: what a **siteless Wonder announces**. Fixed a stale "not canon"
status in the encyclopedia and a misfiled A–Z entry. Redid one commit byte-preserving after an edit
normalised 55 bare-LF lines. **Internal consistency A−→B+**, because every guard in this project checks
prose against code and nothing checks prose against prose. Everything else held.

---

## R4 — the foundation of naming, and an honest non-result

**Target was Co-authorship (D). It stays D.** What shipped is the machinery, not the feature:

- `server/lib/sector-names.js` — a deterministic, curated name generator using the charting
  vocabulary from `07-glossary.md`. Swept shoals now become *Vaun's Reach*, *the Sable Narrows*,
  *Ilsa's Crossing* — named after people in the setting, which is exactly the canon rule that every
  named place is named after somebody's expensive mistake.
- Three columns on `map${gameId}`, in the live `CREATE TABLE` **and** in a new
  `ensureMapTableColumns` migration so pre-existing games get them too.
- The sweep writes the name with `COALESCE`, so a name is permanent and **survives conquest** —
  whoever takes the sector inherits the name the people who paid for it gave it.
- `tests/sector-names.test.js` (7) and `tests/map-naming-schema.test.js` (6). **229/229 pass.**

**Why the grade does not move.** The criterion is about the *audience* filling in, naming and
claiming. The server chooses the name. A player cannot pick, cannot propose, cannot override. That is
history on the map — genuinely nice, and not co-authorship. Grading it up would be precisely the
self-flattery this document exists to catch.

**What it did buy:** the remaining work is now only the picker. `candidates()` and `nameByIndex()`
exist and are tested, and the design is better than this file originally specified — **the server
offers six names and the client returns an index, so no player-authored text ever crosses the wire
and the moderation surface is zero.** That deletes the whole "never ship instantly-public free text"
problem rather than managing it.

**Two things found on the way, neither cosmetic:**
- A real coercion bug in my own `nameByIndex`: `Number(null)`, `Number('')` and `Number(false)` are
  all `0`, so a missing or malformed wire index silently resolved to candidate zero and would have
  stamped a name nobody chose. Caught by its own test, fixed with an explicit type check.
- `18-naming-the-dark.md` instructed a future implementer to add the columns to both `server.js` and
  `setup.js` "which must be changed together." Wrong: they declare **different tables** (`type`/`owner`
  versus `sectortype`/`ownerid`) and `setup.js`'s map schema is dead. The doc is corrected.

**Also worth recording:** *no test exercises the sweep code path at all* — `moveFleet`'s hazard
resolution is too deep to reach from a unit test — so "229/229 pass" is not evidence the naming works
at runtime. The schema tests are a substitute that checks the statement against the declared schema
rather than executing it. Honest confidence here is moderate, not high.

---

## R5 — everything that did not need code

One artifact, `22-act-one.md`: Act One as three **playable** mission scripts. Every beat fires through
machinery that already exists — the feed, the advisor, a briefing screen, the map. No new systems, so
this is production-bound writing rather than another bible chapter, which is why Restraint does not
regress. Plus targeted edits to `20-master-timeline.md` and two `14-peoples/` files.

### Agency D+ → **C**

*Pro:* people act, on the page, in present tense, and their choices cause what follows. Navigator
Sesse decelerates inside an unswept crossing against standing orders, on two seconds of sight, and
brings back three of four where the plot said two — and is correctly reprimanded for it by somebody who
knows she was right. Keth refuses to sell a chart that would kill the buyer. A Swarm element is severed
live and its own people cannot perceive that it happened.

*Con:* one act of three missions, against twenty-four testimonies and a folder that remains
overwhelmingly recollection. And it is unbuilt. **C is the ceiling for a defect addressed in one place.**

### Escalation C+ → **B−**

*Pro:* the stated con was *"nothing is coming."* Something is, and it is now countable: the AU 12
annotation with a review interval → the Ancients' watch logging seven patched hulls at one sector in
AU 68, on a schedule, with nobody dispatched → due this decade → arrival at 9-D, which is adjacent to
the origin. A player first reads the clock in mission 3 as a stamped plate bolted to a rock. It is also
the right *kind* of pressure for this setting: not a villain, **a work order with no completion
condition, arriving on time.**

*Con:* document-only, and the clock has no in-game representation yet.

### Contradiction A− → **A**

The con named exactly two failures and both are fixed. The Swarm's contradiction is now that its
strength *manufactures* its wound — saturation works because nothing is individuated, so the better it
works the more often a piece is severed, and every severed piece lands in the one category the Swarm
has no apparatus to notice. The Not-Yet purchase total flexibility with **one irrevocable vow each**,
chosen at nineteen, never amendable: the least committed people in the galaxy, each carrying the only
certainty they will ever have.

### Emotional range D+ → **C**

*Pro:* the con had named three missing scenes for four revisions —
`17-the-feed/06-refusals.md` specified them and then did not write them. `23-interludes.md` writes all
three. **Four Hours at Ordel Deep**: a Void Walker who measures her life in transit times trapped at a
Titan table where business is not discussed for two hours, and it turns warm in the last four lines.
**What Is A Scout For**: eleven empires' answers to Fourth's thirty-six-year question, each
characterising a civilisation in one line, with a machine's deadpan marginalia — the Shadow Realm's
entire response is *"What a good question,"* being a four-day diplomatic incident the liaison enjoyed.
**Complaint Regarding the Absence of Kitchens**: a Registry form about three worlds that have no food
culture, which turns out to be a love letter. Plus the trace-market scene in Act One.

*Con:* still a handful of scenes against ~120,000 words, and it is codex material rather than something
a player meets in the flow of play. And **I have removed more jokes from the shipped game than I have
put back** — the advisor lost its levity and only the four refusals replaced it. **C, not C+.**

### Causality B → **B+**, Change C → **C+**, Setup and payoff A− → **A**

Act One chains explicitly — a reprimanded survivor **therefore** buy knowledge instead of hulls, **but**
the good chart is not for sale, **therefore** sweep your own crossings, **but** those are the crossings
the Swarm will flood. Rell changes across three missions and Sesse has a complete arc, which is the
"development *within* the story" the neuroimaging work identifies. And the margin motif now runs
Halloway → Yard Nine → Rell, with the standing-order payoff — the trace survived because a dying officer
transmitted it four minutes before she stopped existing.

### Two errors I introduced and caught before they shipped

Recorded because the Internal consistency grade is about whether this happens, not whether it is
embarrassing:

1. **I put the shoal at the destination.** A shoal that *is* the destination already takes the 25%
   arrival roll, because the fleet is decelerating anyway — which would make Sesse's choice meaningless
   and inverted my own arithmetic. Moved to a transit crossing at 50%, and the trap is documented in the
   file so the next writer does not repeat it.
2. **Marn was double-booked.** Already a Void Walker courier who died giving Sten her lanes
   (`15-series-twelve/05`). I had also made her a Terran ship. Replaced with the *Diligence*, which is
   canon-Terran — and which turned out to be a better choice, because a Diligence-class cutter exists
   precisely so trace knowledge outlives the fleet.

**Internal consistency stays A−.** Two errors introduced and two removed is net zero, and finding faults
in brand-new content is not the same as the artefact being clean.

### Next target

**Co-authorship (D)** is a bounded piece of work: a `namesector` command
(`CLIENT_COMMANDS` + the `index.js` dispatch switch + `docs/agents/server/websocket-protocol.md`, all
enforced by `websocket-protocol-contract.test.js`), a `sectornames::` prefix, and a picker. The picker
is the real cost — there is no generic modal helper in `public/js/`, so it is custom UI and CSS.

**Agency (D+)** is the lowest grade in the writing and cannot be fixed by shipping anything. It needs
fiction in which somebody does something while the reader watches. The risk to manage is that writing
more prose pushes Restraint back down, so it should be production-bound — a playable mission script
rather than another bible chapter.

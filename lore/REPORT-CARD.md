# Report Card

A standing, honest assessment of `lore/` and the shipped game against a rubric derived from story
craft, worldbuilding theory, tabletop design, comics serial structure, and empirical work on
narrative engagement.

**Rules for this document.** Grades go up only when something material changed, and the change must be
verifiable by someone who did not make it. A grade may be **lowered** on review if an earlier pass
claimed credit it did not earn. Optimism about our own work is the failure mode this file exists to
prevent.

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

| | Criterion | R1 | R3 | R6 | |
|---|---|:---:|:---:|:---:|---|
| **A. World** | Limitation over power | A | A | **A** | — |
| | Material logic | A | A | **A** | — |
| | Internal consistency | A− | A− | **A−** | ▼B+ in R7, ▲back to A− in R8 — now guarded by tests, not by reading |
| | Causal history | A− | A− | **A−** | — |
| | Sensory concreteness | A− | A− | **A** | ▲ things are handled now, in 104 places |
| | Restraint *(means, not end)* | D | B− | **B−** | held — 2,960 more words, ratio unchanged |
| **B. Character** | Distinct voice | A | A | **A** | con retired; not inflating to A+ on three scenes |
| | Contradiction / flaw-as-strength | A− | A− | **A** | ▲ Zephyr and Quantum fixed — the exact stated con |
| | Want, obstacle, cost | B− | B− | **B** | ▲ ~40 people now want something and pay for it |
| | Change within the story | C | C | **C+** | ▲ Rell and Sesse now develop *within* the story |
| | Agency | D+ | D+ | **B−** | ▲ 104 pieces in which somebody does something |
| **C. Story** | Theme carried by structure | A | A | **A** | — |
| | Setup and payoff | A− | A− | **A** | ▲ new planting, and some pays off to a *player* |
| | Causality *(therefore / but)* | B | B | **B+** | ▲ Act One chains therefore/but explicitly |
| | Escalation | C+ | C+ | **B−** | ▲ the galaxy finally has a clock |
| | Emotional range | D | D+ | **C+** | ▲ range across 104 pieces; still short on comedy |
| **D. Delivery** | Redundant discovery paths | B− | C | **C** | needs code |
| | Legibility to a newcomer | C− | B− | **B−** | needs code |
| | Co-authorship | C | D | **D** | needs code (the picker) |
| | Contact with the audience | F | B− | **B−** | needs code (deploy) |

**Sections — World A− · Character B+ · Story B+ · Delivery C · Overall B**

*Computed, not felt: World 3.68, Character 3.20, Story 3.26, Delivery 2.10, overall 3.14. **Thirteen of
twenty criteria are still below A**, and every one of the four lowest is in Delivery, which no amount of
writing can move.*

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

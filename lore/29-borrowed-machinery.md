# Borrowed machinery — what the best of this stuff does, and what we should take

Status: **REFERENCE** for the audit half, **DESIGN** for the proposals. Nothing here is canon and nothing
here is costed.

**Method, honestly.** The named works and their devices are from my own reading; I verified the two
consensus claims I most wanted to lean on rather than assert them — the received view of *Planescape*'s
arc words and *Disco Elysium*'s micro-reactivity, and what specifically makes *Curse of Strahd*'s Tarokka
reading work. Sources at the end. The mapping onto this game is mine and is arguable.

**The rule I applied.** A borrowable device is *structural* — it survives being stripped of its skin. A
trope is not. "A mentor who withholds information" is structure. "A wise old wizard" is a skin. Every
entry below is the first kind, and the ones I rejected are mostly the second.

---

## Part 1 — What we already do, so this reads as an audit and not a wishlist

Six of the strongest devices in the field are already load-bearing here. Anybody proposing to "add more
story" should read this part first, because the answer is usually that we have the device and are
under-delivering it.

| Work | Its device | Ours |
|---|---|---|
| **Hyperion** (Simmons) | Canterbury Tales frame: pilgrims each tell one story; together they assemble a mystery none of them can see | **The Long File.** Twelve witnesses, one fact each, and each race can only notice its own fact *because of its doctrine*. This is as good as ours gets and it was built before I looked at Simmons |
| **Dark Souls** | History lives in item descriptions; there is no narrator and no exposition | **`24-anthology/`.** One piece per hull, building, tech level, sector type. 106 of them |
| **Blindsight** (Watts) · **Solaris** (Lem) | First contact that stays incomprehensible, on purpose, forever | **Law 25** and the Consideration line (T1). We characterise it only through manners |
| **Roadside Picnic** (Strugatsky) | Artifacts that work, cannot be understood, and cannot be made | **Relics**, near-exactly. *"Research recovers the documentation. A relic supplies the assumption"* |
| **The Three-Body Problem** (Liu) | The dark forest: you cannot see, so silence and pre-emption become rational | **Law 1.** Blind FTL is the dark forest as a *movement rule* rather than a debate |
| **Dune** (Herbert) | The hero's victory is the catastrophe | **Scientific victory.** Completing the tree means you can relight the lanes, and Q1 makes that the thing the story fears |

**What that list means.** We are not short of good machinery. We are short of *delivery* (Restraint has
been B− for five revisions) and short of **reactivity** — which is what Part 2 is mostly about.

---

## Part 2 — The borrows worth making, ranked

**Build state, 2026-07-26.** B1, B2, B3, B4 and B7 are **built**. B5 and B6 are not, and are honestly
scoped rather than half-done — both are real features and the notes below say what they would cost.
What shipped is recorded in `../lore/REPORT-CARD.md` R13 and each section carries a build note.

### B1 · The Reading — *Curse of Strahd*, and it solves a problem we actually have · **BUILT**

**The device.** A 54-card Tarokka deck is drawn at the start of the campaign and determines where the key
artifact, the ally and the enemy are. Nothing about the plot changes; *everything* about the run does. The
received account of why it works is worth quoting because it is our exact problem: it *"solves a
fundamental problem in adventure design: how to create a compelling, replayable experience that feels
personalised and meaningful rather than predetermined."*

**Why it fits us better than it fits D&D.** This game is *primarily multiplayer with many end states* —
that is the sentence that started this whole folder, and it is why `19-canon-and-variance.md` exists.
Canon has to survive a thousand matches that all end differently. A per-match reading is the only device
in the field that makes a randomised match feel *authored*.

**The reskin.** At game start the Registry issues a **Standing Advisory** for this cluster — three or four
lines, drawn deterministically, that frame the match without changing a rule:

> *Advisory, this cluster: the northern margin is old survey and the amendments are ninety years stale.
> Two mouths are charted and a third is inferred from an absence. Reckoning is scarce here; the last
> office to hold it did not say why.*

- **It costs almost nothing and the precedent is shipped.** `server/lib/sector-names.js` already derives
  permanent names deterministically from `(gameId, sectorId)` so a reconnect cannot change them. A
  reading is the same trick at cluster scale: `seedFrom(gameId)` picking from curated text.
- **It is honest.** The advisory describes what the generator actually rolled — how many mouths, how many
  shoals, whether crystal is thin — so it is *true*, and a player who learns to read it gains a real
  edge. That converts flavour into information, which is the only kind of flavour this setting respects.
- **And it gives the anthology somewhere to go.** 106 pieces are unreachable. An advisory is the natural
  hook for one of them per match.

**Cost:** small. Text plus a deterministic draw. This is the highest value-per-line item in this document.

**BUILT.** `server/lib/standing-advisory.js`, broadcast as four `advisory::` lines at game start — its own
wire prefix, not `systemalert::`, so the feed icon is chosen by the sender: three of the four lines
mention mouths, shoals or a fleet and the text classifier was correctly reading them as fleet movements.
Every figure is counted off the map array that was just written to the table, so it cannot contradict the
board; the phrasing is a hash of the game id, so a reconnect reads the same advisory back. It names no
positions and never mentions relics. `tests/standing-advisory.test.js` (5) checks all of that — and caught
a real defect on its first run: the poor-yield thresholds were set at `< 95` while real maps run 130–167,
so two of three branches were **dead code** and every advisory ended on the same line. Thresholds are now
measured, and a test fails if a generator change makes them unreachable again.

---

### B2 · Arc words — *Planescape: Torment* · **BUILT**

**The device.** One question, asked over and over, answered differently by every companion, and finally by
the player: *what can change the nature of a man?* The received reading is that the player's answers are a
reflection of the player, not the protagonist.

**We already have the question and have never used it as arc words.** It is sitting in the shipped Codex,
in the Twelve tab: **"how do you cross a dark you cannot see into?"** Every locked branch and forbidden
hull in `races.js` is one of the twelve answering it, and paying for the answer.

**The reskin.** Promote it from a tab heading to the folder's spine and make it audible:

- Every race's entry in `12-civilisations/` and `14-peoples/` states its answer *in the race's own
  grammar*, once, and never explains it. Several already do this by accident.
- Rell asks it of witnesses in Series 12 and the answers are the accounts.
- And the player answers it **mechanically**, every match, without being asked: probe or send a fleet;
  sweep or route around; hold the shoal or take the planet. That is the Planescape trick exactly — the
  answer is the player's, and it is made of their decisions rather than their dialogue choices.

**Cost:** zero. Editorial. This is a pass over existing files, not new writing.

**BUILT** as a charter section in `03-themes.md` with three rules: never print it as a thesis, every race
answers in its own grammar once and never explains, and the player answers it mechanically and is never
asked. The editorial pass over `12-civilisations/` and `14-peoples/` is still to do.

---

### B3 · Micro-reactivity — *Disco Elysium* · **BUILT, in part**

**The device.** The game remembers trivial things and responds to them. The consensus account is that this
is what elevates the writing, and that ZA/UM could afford it *because the critical path is linear* —
extravagance everywhere else, one spine.

**Why this is our biggest missing thing.** `public/js/advisor.js` ships twelve faction registers across 17
event keys, and it is **stateless**. It reacts to *what happened*; it never reacts to *what has been
happening to you*. Those are different games.

*Checked rather than assumed: the only mutable state in that file is `let raceId = 1` and the local
`let line = pick(lines)`. Every apparent reference to counting is dialogue text. The advisor knows which
race you are and nothing else about you.*

**The reskin — the advisor gets a memory, and it is cheap:**

| The advisor could know | Because the server already has it |
|---|---|
| *"Third shoal this season. You are getting a reputation as somebody who pays."* | count of swept sectors this match |
| *"Nine turns without losing a hull. I have stopped writing the preamble."* | last turn a ship was destroyed |
| *"This is the sector where we lost the Kestrel."* | the sector a named loss occurred in |
| *"You have never sent a probe. I am not going to keep offering."* | probes purchased |
| *"That is the fourth time you have routed around it. It is cheaper to own it."* | transits through an unswept belt |

None of that needs new state that is not already in the tables, and every line is a fact about *this*
player. It is also the single strongest answer to the report card's **Change within the story (C+)**,
because the person who changes can be the player.

**The Disco caveat, and we should respect it.** They could be extravagant because the spine was linear.
Multiplayer has no spine, so reactivity has to be *cheap per line* and never load-bearing. Advisory
colour, never information a player needs.

**Cost:** medium. A per-player counter block plus lines. Highest emotional return of anything in Part 2.

**BUILT, in part, and the scope reduction is deliberate.** The memory lives in `advisor.js` client-side
and per-session, not in the schema: the players table has no history columns, the advisor already sees
every event, and a remark does not justify a migration. It resets on reload, which is the price.

Two situations only — the third shoal secured, and twelve turns without a loss — because rarity is the
whole effect.

**And it nearly shipped broken in the exact way this module was rewritten to fix.** The first version
returned ONE shared set of recall lines, which would have had a Bioform tender saying *"I have stopped
writing the preamble"* — a Terran Registry sentence. It passed `advisor-voice-canon.test.js` because every
assertion there inspects `VOICES` and knew nothing about the new table. Recall is now twelve registers,
and that test has an eighth assertion covering it. A guard only ever covers the structure it was told
about.

---

### B4 · Failure is content — *Disco Elysium*, and it is a two-line change here · **BUILT**

**The device.** A failed roll in Disco produces *writing*, not a wall. Failure is where the game gets
interesting.

**Our shipped naming feature is exactly half-built in this respect.** A player who **survives** a shoal
names it, permanently, and the name outlives their empire. A player whose fleet **dies** there gets a feed
line and nothing else. The worst moment in the game produces less content than the good one.

*Checked: `server/server.js` gates the whole naming write on `if (survivors > 0 && !sectorOwner)`. Total
loss falls straight through to the feed message and nothing is recorded on the map. That single condition
is the feature this proposal is about.*

**The reskin: a shoal that kills a fleet is named too, and it is a memorial.**

- Same curated candidate list, same index-only protocol, same permanence — so there is no new moderation
  surface and almost no new code.
- The chart records it as **unswept and named**, which is a status that does not currently exist and is
  the most evocative thing on any map: *a place with a name that nobody holds.*
- Every other player sees it. They do not know whose it was. They only know somebody paid here and did
  not get the ground.
- And it makes T7 symmetrical: the bet that pays leaves a road, and **the bet that fails leaves a name.**

**Cost:** small, and it is the best value in this document after B1. It also raises **Co-authorship**,
currently C+, because it doubles the occasions on which a player writes on the shared map.

**BUILT.** One condition changed from `survivors > 0` to `!sectorOwner && totalShips > 0`, and ownership
is now written as `owner = COALESCE(?, owner)` so a total loss passes null and names the sector without
claiming it. The prompt reads differently — *"Nothing arrived at C8. The shoal is on the chart and it is
not ours"* — and the heading changes from *Name the shoal* to *Enter it on the chart*.

The safety property is guarded, because it is one character wide: with a bare `owner = ?` a total wipe
would **hand the player the sector**, which is both an exploit and the exact opposite of the intended
feeling. `tests/map-naming-schema.test.js` fails if that reverts, proven by reverting it.

---

### B5 · The Registry of your own crossings — *Outer Wilds* · **NOT BUILT**

**The device.** Nothing in Outer Wilds levels up. The only thing that progresses is *the player's
knowledge*, and the ship's log is the interface for it. The received account stresses show-don't-tell and
using the log to lay breadcrumbs.

**We have the theme and not the interface.** Knowledge is already the only real currency here — traces,
charts, probes. But when a match ends, everything the player learned evaporates.

**The reskin: the player gets their own Long File.** A persistent, personal record across matches — every
shoal they have swept and what it cost, every mouth they charted by losing something to it, the names they
chose. Their grandmother's cabinet, except it is theirs.

That is Ilsa's device turned on the player, which is thematically exact: *the person the file is about is
the only person not in it.* And it is the one thing that would make a *second* match feel like a
continuation rather than a reset.

**Cost:** medium-high — it is persistence across games, which the schema does not currently do per-player
in this shape. Worth scoping before promising.

---

### B6 · Correspondents, not companions — *Mass Effect* loyalty arcs, constrained by Law 11 · **NOT BUILT**

**The device.** A small cast who talk to you between missions, have their own wants, and whose regard
changes. It is the most reliably beloved structure in modern RPGs.

**We cannot have companions and should not try.** Law 11: the Whisper carries voice instantly and **no
cargo, no people, no sight.** Nobody can travel with you. That looks like a limitation and is actually a
gift, because it forces the better version:

**One named counterpart per race who writes to you across a match, and never arrives.** Keth brokering.
Tessen assessing. Fourth being courteous about something appalling. Ossa declining to explain. Their tone
shifts with the diplomatic state the engine already tracks, and you never see any of them, ever — which is
the whole texture of this setting: *twelve civilisations that have argued daily for seventy-four years and
never stood in a room* (24 · 15).

**Cost:** medium, text only. It would also give `17-the-feed/`'s 108 unused variants a home.

---

### B7 · The calendar — *Harry Potter*, and it is the least obvious one · **BUILT**

**The device.** The school year. It is not the magic that makes those books work structurally — it is that
a repeating annual frame lets the same beats recur and escalate: term, sport, exams, summer. Recurrence is
what makes escalation legible.

**We have turns and no seasons**, so nothing can recur, so nothing can escalate except the clock in T2.

**The reskin.** A short in-world year with three or four named divisions — my own new piece already dates
itself *"the eleventh of Third"* without a calendar existing to support it. Give the Registry filing
seasons and the Nomads their rites, and you get anniversaries, deadlines, and the ability for the advisory
in B1 to say *"third quarter and the amendments are still not in."*

**Cost:** small to define, and it unlocks a lot of small things. Genuinely optional.

**BUILT** as a calendar section in `07-glossary.md`: four quarters, *the return*, and *arrears* — which
is retroactively what killed Halloway’s fourteen crews. One constraint recorded with it: turns are the
engine’s time and the calendar is the fiction’s, so a piece may date itself and nothing may require the
player to track a quarter.

---

## Part 3 — What would be a mistake to borrow, and why

Being specific about the rejections is most of the value of a document like this.

- **A villain with a face — Strahd.** Strahd works because Barovia is *closed* and he can walk into a room.
  Our antagonist is behind a quarantine and **Law 25 forbids a shape.** Borrow his *presence* — the sense
  of being noticed and handled, which is T1 — and never his body. This is the mistake I would most expect
  a future pass to make, because it is the most fun one.
- **A chosen one, or a prophecy that means it — Dune, Potter.** Theme 1 is *knowledge is bought and
  somebody else always paid for it*, and 24 · 16's thesis is that a road can be driven by somebody who is
  not good. A chosen one deletes both. Osk's future tense is as close as we go, and she is the least
  credible witness in the galaxy on purpose.
- **Companions who travel with you.** See B6. Breaks Law 11 for a lesser version of the same feeling.
- **A time loop — Outer Wilds.** We have turns and a 4X economy; a loop fights both. Take the *knowledge
  progression* (B5), leave the loop.
- **A tone shift toward wonder as the default register.** `03-themes.md` licenses exactly one elevation and
  the ratio — one piece in a hundred and six — is why it lands. B1–B7 are all machinery, not register.
- **More lore volume.** Restraint is B− five revisions running. **Every item above is a delivery mechanism
  for prose that already exists.** That is deliberate and it is the point.

---

## Part 4 — If only one thing gets built

**B4, then B1, then B3.**

B4 because it is nearly free, it doubles the player's authorship, and *a named sector nobody holds* is the
best single image available to this game. B1 because it makes every match feel authored for the cost of a
text table and a hash. B3 because a narrator who remembers you is the difference between copy and a
character, and ours already exists and is stateless.

B5 and B6 are better ideas and much larger. B7 is a small enabling change. B2 costs nothing and can be
done in an afternoon by whoever next edits `12-civilisations/`.

---

## Sources for the three claims I checked rather than asserted

- [Why Planescape: Torment Remains the Peak of RPG Storytelling — CBR](https://www.cbr.com/planescape-torment-rpg-storytelling-dnd/)
- [Understanding the meaningless, micro-reactive, and marvellous writing of Disco Elysium — Game Developer](https://www.gamedeveloper.com/business/understanding-the-meaningless-micro-reactive-and-marvellous-writing-of-i-disco-elysium-i-)
- [Explaining the value of show don't tell storytelling in Outer Wilds — Game Developer](https://www.gamedeveloper.com/business/explaining-the-value-of-show-don-t-tell-storytelling-in-i-outer-wilds-i-)
- [Curse of Strahd Review — Roll20](https://pages.roll20.net/dnd/reviews/curse-of-strahd)
- [Dungeons & Dragons "Curse of Strahd" Tarokka Deck — The World of Playing Cards](https://www.wopc.co.uk/tarot/dungeons-and-dragons-curse-of-strahd-tarokka-deck)

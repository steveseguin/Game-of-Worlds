# Canon and Variance — what is fixed, and what every match decides

Status: **CANON.** Read with `20-master-timeline.md`, which holds the dates.

This is a multiplayer game with five victory conditions and no fixed ending. That is not a problem for
canon; it is a problem for *where canon stops*. This document draws the line.

---

## The line

> **Canon runs from before records to AU 74. It ends on turn 1.**
>
> **Everything after turn 1 is the match, and no match ever becomes canon.**

Every fact in `lore/` describes the galaxy as it stands the moment a player is handed an empire. The
history is settled, the personalities are fixed, the physics is a constitution, the twelve civilisations
are what they are and why. Nothing a player does can reach backwards and change any of it.

### And the reason it works: **a match is one cluster, not the galaxy.**

The map is fourteen sectors by eight. That is a cluster — a pocket of swept and half-swept space with a
handful of empires' frontiers overlapping in it. It is not a galaxy, and the galaxy has many of them.

Which resolves the whole problem cleanly and needs no meta-framing, no simulation conceit, no "it was all
a Registry war game":

- **Domination** is three-quarters of *this cluster's* colonisable worlds. Not the galaxy's.
- **Elimination** is the last empire with a world *in this cluster*. The others went home.
- **Time victory** is whoever holds the most ground when this particular war runs out of season.
- A **Wonder** built in a match is built in that cluster — and since **nobody in canon has ever completed
  one**, the first cluster to finish one is a genuine galactic first, and that stays true no matter how many
  matches are played.

Twelve empires, many clusters, many wars, one settled backstory. Every match is a real war with real
stakes and none of them is *the* war, because there isn't one.

---

## What is fixed

**The physics.** All 25 laws in `11-laws-of-the-world.md`. FTL is blind, kinetic hazard cannot be
shielded, a collapsar is survivable by nothing, death is permanent, no one can build a Lamp yet, and what
is behind the quarantine is never designed, named or shown. These cannot be varied by a match, a mission,
or a later pass.

**The history.** Everything in `20-master-timeline.md`. The Trellis existed. The Ancients maintained it
and did not build it. The shutdown began BU 61 and the warning came BU 8 — fifty-three years of silence.
Nine days in AU 0. The count was kept by the Trellis and is not known.

**The twelve civilisations.** Geography, economy, currency, government, faith, rituals, aesthetic,
personality — and, critically, **every capped branch and forbidden hull is a conviction with a stated
reason.** The Mechanicus have not built a scout since BU 1100. The Zephyr have not laid down a capital hull
since BU 400. The Titan shipwright's art has no small form because structural minimums scale at 1.9g.
Those are not balance numbers with a story bolted on; they are the story, and `races.js` is its citation.

**The cast, and what has already happened to them.** Ames filed the letter. Wren decelerated and died with
what she saw. Vaun's log says instrument error. Tessen made the Ashgate determination. Ilsa asked
thirty-one times and died six years before the answer. Ysse chose Aven at nineteen.

**The truth about the Lamps.** It was a quarantine. This is fixed even though almost nobody in the galaxy
knows it — see `21-matchups-and-mysteries.md`.

## What every match decides

Who wins, and how. Who allies and who betrays. Which Wonder — if any — gets finished, and what it costs.
Which shoals get swept and which stay lethal. Who is eliminated. Which sectors are named and by whom
(`18-naming-the-dark.md`). Whether the cluster ends up lit, sealed, or simply exhausted.

**None of it is retroactive.** A Terran player winning does not make Terra canonically ascendant. A
Crystalline player completing the First Thickness does not settle what the Trellis was made of. The
Bioform being wiped out in a match does not mean the Long Season was wrong.

---

## Why a Wonder is a Wonder

This was the sharpest question asked of this folder, and the answer is the reason the set works:

> **A Wonder is not a large building. It is a civilisation's entire answer to the dark, made physical.**

Every race has spent seventy-four years answering one question — *how do you cross a dark you cannot see
into?* — and each answer is a conviction they have paid for in capped branches and forbidden hulls. A Wonder
is that conviction taken to its absolute conclusion and built at scale.

Which is why the rules are the rules:

- **One per empire, ever.** You do not get two answers. You have one, and you have had it for four
  centuries, and it is what your locked tech branches *are*.
- **You cannot capture another race's Wonder — only destroy it.** It is not equipment. A Concord Lamp in
  Zephyr hands is meaningless; the Swarm has no archive to read it from and no concept of a road worth
  relighting.
- **The maintenance is always denominated in what that empire can least afford**, because a conviction you
  can carry cheaply is not a conviction.
- **It cannot be hidden** — except the Shadow Realm's, which has no site, because *not being locatable* is
  their answer.
- **It never wins by existing.** It makes a victory reachable. A finished Wonder and no fleet still loses.

And the thing that makes twelve Wonders one design rather than twelve trinkets: **eleven of them reopen the
road.** The Mother Grove makes the road unnecessary and is far too slow for anyone to choose. The Closing
seals it forever and costs the Ancients everything they have left. The game's own victory screen is the
mistake, and it has been since `victory.js` shipped with `SCIENTIFIC: research every technology available to
your race` — which has always meant *you can relight the lanes now.*

---

## Why a race has power over another race

Short answer: **because their answers to the dark are incompatible in specific, stateable ways**, and one
answer sometimes makes another answer irrelevant rather than merely weaker.

Full matchup grid, with the lore reason for each, in `21-matchups-and-mysteries.md`. The single cleanest
example, which is already implemented in the engine: **the Shadow Realm's stealth is worthless against the
Mechanicus.** Their signature hides fleet *composition* from an enemy whose sensors it beats — and the
Second Shift has no scouts, no intruders, and no intelligence on anyone including themselves. You cannot
hide what you have from somebody who never knew what you had. A Shadow player has spent their whole game
on a toolkit that does nothing.

That is not a balance quirk. It is eleven hundred years of one civilisation refusing to look, meeting six
hundred years of another civilisation refusing to be seen.

---

## Can a character be a single-player mission?

Asked, and left open. Here is a decisive answer.

**No — but every mission should be owned by a character.**

One mission per character, starring that character, would fragment the one thing the campaign has locked:
Rell is the only voice, and everybody else is quoted by Rell (`05-characters.md`). Twelve missions with
twelve leads means twelve introductions and no relationship.

**The structure that works instead:**

- Each mission has **one opponent race** and therefore **one character of record**. You fight the
  Mechanicus in mission 6 and Liaison Fourth talks to you throughout it — polite, literal, and explaining
  that stealth does nothing here.
- That mission **unlocks that race's two testimonies** in the codex. Series 9 (their witness to the nine
  days) and Series 12 (their practitioner, now). Two 400-word documents, already written, and they arrive
  exactly when the player has a reason to care.
- The character's **arc runs across the campaign in fragments**, not in a mission of their own. Fourth
  begins asking questions in mission 6 and files an unauthorised variance in mission 10. That is two lines
  and one document, not a mission.
- **Rell's own arc is the only continuous one** (`16-rell.md`), because there can only be one.

Cost: zero new systems. Twelve missions, twelve opponents, twenty-four codex unlocks that already exist,
and one narrator.

---

## What canon is for

The user's requirement was that the canon be *enjoyable on its own* and *generative* — a source of artwork,
item types, and mechanics. Both are testable, so here is where it stands.

**Enjoyable on its own:** twenty-four character stories, each in a distinct voice, that collectively encode
a mystery no character in the world has solved. The reading order is the archive's filing order, which is
not the useful order, and assembling it is the reader's job.

**Generative — already delivered, from canon alone:**

| Canon fact | What it produced |
|---|---|
| Blind FTL + drifting shoals | The entire hazard model, and Halloway's uncodable section four |
| Crystal is what you burn to know where you are | The reckoning market, and a living people sold as navigation stock |
| The Trellis had two layers and only one failed | **The Whisper** — why players can negotiate but not see |
| Named places are named after who first survived them | `18-naming-the-dark.md` — the only co-authorship hook in the game |
| Twelve doctrines, each with a refusal | Twelve Wonders, 36 signature technologies, 36 signature hulls |
| The Titans are slow | The keystone document of the whole mystery is in their hands *because* of it |
| Nobody has seen an Ancient body | An art direction: maintained newness, no patina, proportions slightly wrong for anyone alive |

**And the honest limit.** Canon is now large enough that the binding constraint is no longer invention, it
is **contact with the player.** Nothing in this folder has reached one yet. `17-the-feed/` is 118 lines of
finished copy that would take an afternoon to install, and until it is installed, every further pass is
worldbuilding for its own sake.

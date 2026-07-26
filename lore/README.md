# Game of Worlds — Story World

This folder is the narrative bible for Game of Worlds. It is **not** code, and nothing here
is implemented yet. It exists so that when we do write mission scripts, briefing text, event
copy, race blurbs, and voice-over lines, they all come out of one coherent world instead of
twelve improvisations.

Read `00-premise.md` first. It is two pages and it contains the whole world in miniature.

---

## How to use this folder

| File | What it is |
|---|---|
| `00-premise.md` | The pitch. Logline, paragraph, one-pager, and the dramatic question. |
| `01-cosmology.md` | How the galaxy physically works, and why the game's rules are the way they are. |
| `02-timeline.md` | Historical lineage. Eras, the catastrophe, and the present day. |
| `03-themes.md` | What the game is *about*. Tone rules. The writing checklist. |
| `04-factions/` | The twelve races. Roster at a glance, plus full bibles. |
| `05-characters.md` | The cast. Starting with the one voice the player hears all game. |
| `06-campaign.md` | Shape of the single-player campaign: acts, missions, the final choice. |
| `07-glossary.md` | Every in-world term, defined once. Naming conventions. |
| `08-open-questions.md` | Decisions that need you, ranked by how much they block. |
| `09-production.md` | Honest scope for artwork and voice-over. What a thing actually costs. |
| `10-the-long-file/` | **Twelve testimonies, one per race.** A character from each species telling their story. The most useful writing in the folder — and collectively, the mystery. |
| `11-laws-of-the-world.md` | **The constitution.** Hard physical rules and what is impossible. Wins every conflict. Read before writing anything. |
| `12-civilisations/` | **Twelve worlds in full.** Geography, economy, currency, politics, faith, food, architecture, history — each built geography-first, each explaining its own stat line. |
| `13-wonders/` | **Twelve Wonders, 36 signature technologies, 36 signature hulls.** Endgame content. Marked DESIGN PROPOSAL — the fiction is solid, the numbers are placeholders. |
| `14-peoples/` | **The twelve peoples.** Aesthetic, personality, current leadership by name, beliefs, four rituals each, and how each regards the other eleven. Pure lore — no mechanics anywhere. |
| `15-series-twelve/` | **Twelve more stories.** Rell's own collection, AU 71–74 — *practitioners* rather than witnesses, the Sweeping rather than the nine days, and everyone in it is still alive and mid-sentence. |
| `16-rell.md` | **The protagonist.** Rell's want, the escalating price of it, four scenes, and the change. Fixes the folder's worst structural gap. |
| `17-the-feed/` | **★ Rell's event script.** ~108 lines keyed to the 36 events `server.js` actually emits. **The only part of `lore/` a player would ever see, and the only part that is ready to use.** |
| `18-naming-the-dark.md` | **Co-authorship proposal.** Let players name the shoals they sweep. The one audit fix that needs engine work. |
| `19-canon-and-variance.md` | **★ Where canon stops.** Canon runs to AU 74 and ends on turn 1; a match is one cluster, not the galaxy, and no match ever becomes canon. Also: why a Wonder is a Wonder, and the answer on characters-as-missions. |
| `20-master-timeline.md` | **★ CANON — outranks every other file on any date.** One chronology, all twelve races, plus the continuity audit. |
| `21-matchups-and-mysteries.md` | Why one race has power over another, derived from `races.js`. Plus the three kinds of opacity, and the five tiers of who knows what about the quarantine. |
| `22-act-one.md` | **Act One, playable.** Three mission scripts with on-page scenes; every beat fires through machinery that already exists. |
| `23-interludes.md` | **The funny ones.** Three comic scenes the tone charter had specified and never written. |
| `24-anthology/` | **104 short pieces.** One per hull, building, tech level, sector type, Wonder and signature weapon — plus colonists, terraforming, travel, spying, battle from both sides, leadership from top and ranks. Codex-shaped. |
| `25-crystal.md` | **Crystal in full.** What the code says it is, what it looks like (from the shipped art), how it is obtained, four stories, and the inert `artifact` field. |
| `26-encyclopedia.md` | **★ START HERE for facts.** The ten-minute version: 50 A–Z entries, 23 figures verified against code. Read this before writing anything. |

---

## The precedence order

When two files disagree, resolve in this order and fix the loser:

1. **The code.** `races.js`, `tech.js`, `server.js`, `victory.js`. Always.
2. **`20-master-timeline.md`** — any question of date, sequence, or number.
3. **`11-laws-of-the-world.md`** — any question of what is physically possible.
4. **`19-canon-and-variance.md`** — any question of what is fixed versus what a match decides.
5. **`07-glossary.md`** — any question of what a thing is called.
6. Everything else.

---

## Canon status labels

Every claim in these documents carries one of three labels. This matters more than it looks:
it is the difference between iterating and rewriting.

- **LOCKED** — agreed, or dictated by shipped code. Build on it freely. Changing it costs work.
- **PROPOSED** — my recommendation. Written as if true so you can judge it in context. One
  word from you turns it LOCKED or throws it out.
- **OPEN** — a real fork. Listed in `08-open-questions.md`. Do not build on it.

If a document does not say, assume PROPOSED.

---

## The five rules I am writing by

You said you're new to this. These are the rules that separate a world that feels real from
a world that feels like a wiki. I'll hold to them; hold me to them.

**1. Fiction serves mechanics. Never the reverse.**
The game already decided that asteroid belts kill half your hulls in transit but only a
quarter on arrival. That is a fact about how light-speed travel works, and the fiction has to
explain it rather than decorate around it. Where the code and the story disagree, the code
wins and I rewrite the story. This is also why the world came together fast: the mechanics
were already saying something coherent, and nobody had listened yet.

**2. A faction's weakness is its personality. Its strength is just its stat line.**
The Mechanicus cannot build a scout ship. That is not a balance concession to apologise for
— it is the most interesting fact about them, and everything else about that civilisation
descends from it. Twelve races with twelve strengths is a spreadsheet. Twelve races with
twelve *refusals* is a cast.

**3. Specific beats epic.**
"The galaxy trembled" is worth nothing. "Twelve hulls returned for reshaping" is worth
everything. If a line could appear in any space game, cut it. Concrete nouns, real numbers,
small human details. Scale is conveyed by precision, not by adjectives.

**4. Mystery is a resource. Spend it slowly.**
The reason the Lamps went out should not be in the trailer, the tutorial, or the wiki. It
should be discoverable, and the discovery should reframe something the player has been doing
for twenty hours. A world that answers all its own questions on the box has nothing left to
give.

**5. Name a thing once, then use that name everywhere.**
Consistent vocabulary does more for the feeling of a real place than any amount of invented
history. If asteroid belts are "shoals," they are shoals in the tutorial, in the event feed,
in a Titan Lord's dialogue and in the marketing copy. `07-glossary.md` is the authority.
When a word starts appearing in two spellings, the world starts feeling fake.

---

## The pass plan

We build this in layers, widest first. Each pass should be reviewable in one sitting.

- **Pass 1 — the spine.** *(done)* Premise, cosmology, timeline, themes, all twelve races at
  identity-card depth, two full race bibles as exemplars, the narrator character, campaign shape,
  glossary, production scope.
- **Pass 2 — lock the forks.** *(done, 2026-07-25)* Four load-bearing decisions locked: the
  Lamps were shut down as a **quarantine**; the register is **weathered professional**; the
  campaign is **always Terran**; the voice is **Rell only, and every other character is quoted by
  Rell**. Reasoning and rejected alternatives in `08-open-questions.md`. Sector types 3–5, the
  game's own name, and the Concord flashback mission remain open.
- **Pass 3 — twelve characters, twelve stories.** *(done, 2026-07-25)* `10-the-long-file/` — one
  named witness per race, each telling their own account of the nine days in their own grammar.
  Replaced the planned "twelve race bibles," and it was the better idea: a character telling a
  story reveals a civilisation in a way a bible cannot, and each testimony is a finished
  deliverable (codex entry, loading-screen read, VO block) rather than reference material.
  Collectively the twelve *are* the mystery — each carries one fact, and only its own doctrine let
  it notice that fact.
- **Pass 4 — the laws, and twelve worlds.** *(done, 2026-07-25)* `11-laws-of-the-world.md` fixes the
  physics as a set of hard limits, including the one addition the setting needed: **the Whisper**, the
  surviving relay net that carries voice but not cargo, sight, or guidance — which is why twelve
  empires can negotiate while being unable to reach each other. Then `12-civilisations/` builds each
  race geography-first, so that terrain produces cities, cities produce the economy, the economy
  produces the politics, and every chain ends by explaining the numbers already in `races.js`.
- **Pass 5 — Wonders and signatures.** *(done, 2026-07-25)* `13-wonders/` — one Wonder, three exclusive
  technologies and three exclusive hulls per race. The design spine: **every Wonder is that race's
  answer to the dark taken to its conclusion**, so eleven of the twelve reopen the road, one makes the
  road unnecessary and is far too slow for anyone to choose, and one closes it forever at the cost of
  the people who build it. Fills the disabled `VICTORY_CONDITIONS.WONDER` hook in `lib/victory.js`.
  **Marked DESIGN PROPOSAL** — every number is a placeholder and the 36 hulls are the most expensive
  thing in this folder.
- **Pass 6 — the peoples.** *(done, 2026-07-26)* `14-peoples/` — where `12-civilisations/` describes the
  twelve *places*, this describes the twelve *peoples*: form language and palette, temperament with a
  named virtue and vice, who holds authority in AU 74 by name, beliefs about death and the Unarriving,
  four rituals each (daily, coming-of-age, death, war), and **eleven one-line readings of the other
  eleven races** — the attitude map that nothing else in the folder had. Strictly lore; no mechanics.
- **Pass 7 — the second character set.** *(done, 2026-07-26)* `15-series-twelve/` — a second story per
  race, and deliberately the inverse of `10-the-long-file/`: **practitioners instead of witnesses, the
  Sweeping instead of the nine days, and nobody in it is finished.** Every account ends with the witness
  going back to work. Collected by Rell rather than Ilsa, AU 71–74, which completes the narrator's arc:
  her grandmother gathered accounts of an ending, and Rell — asking the same questions of the
  living — accidentally assembles the proof that the Sweeping is working.
- **Pass 8 — the craft audit, and acting on it.** *(done, 2026-07-26)* The folder was audited against story
  craft, worldbuilding theory, tabletop design and comics serial structure. It scored well on constraint,
  causality, consistency and specificity — and failed on three things, all now addressed:
  - **No protagonist who wanted something and changed.** → `16-rell.md`. Rell wants to close three
    entries in a manifest; the price turns out to be their own empire's authority; they end by writing
    *unreconciled* in their own hand and choosing to keep the file rather than finish it.
  - **Nothing had ever touched a player.** → `17-the-feed/`. The engine emits 36 events, not the 400 I
    kept estimating. ~108 lines of copy, drop-in, no engine change. **Do this one first.**
  - **No co-authorship — nothing for the player to name or claim.** → `18-naming-the-dark.md`.
  Three defects were logged and *not* fixed, and they are the honest backlog: the folder is formally
  monotonous (24 stories, all filed testimony), almost nothing happens on-page, and there is far too
  little humour. `16-rell.md` puts four scenes on the page and `17-the-feed/06-refusals.md` rations five
  jokes; both are down-payments rather than repairs.
- **Pass 8b — military doctrine bibles.** `04-factions/` still holds only two (`01-terran-empire.md`,
  `06-mechanicus.md`) at the how-they-fight depth. Lowest priority left, and honestly: **stop writing lore
  until `17-the-feed/` is in the game.** M. John Harrison's charge — that worldbuilding stops being a means
  and starts being an end — is fair comment on this folder at 100k words with nothing shipped.
- **Pass 4 — the campaign, mission by mission.** Objectives, opening and closing beats,
  briefing text, the mechanic each mission teaches, which AI opponent and why.
- **Pass 5 — the script.** Actual lines. Narrator barks for every event the engine already
  emits. Briefing monologues. Race hails. This is the voice-over recording script.
- **Pass 6 — the art bible.** Race silhouettes, crests, portrait states, briefing stills.
  Written as a brief an artist could work from without asking questions.
- **Pass 7 — implementation handoff.** Only now does any of this become code: a campaign
  scenario format, a dialogue table, an asset manifest.

**Where we are:** Passes 1 and 2 are done and the spine is locked. Read `00-premise.md` — it is
two pages and it contains the world — then `08-open-questions.md` Part 1, which records the four
decisions and *what was rejected and why*, so you can overturn any of them on purpose rather than
by accident.

**Two candidates for Pass 3**, and they are different kinds of work:

- **The ten remaining race bibles.** Widens the world. Uses the template and the two exemplars.
  Nothing depends on it, so it can happen any time.
- **Rell's event-feed script** (Pass 5's core, pulled forward). ~400 lines of narrator copy
  written against the events the engine already emits. It needs no art, no audio, and no engine
  work — and it improves the *shipped game today*, silently, as better event text. It is the
  highest return per hour in this entire plan, and it is the only pass that pays for itself
  even if the campaign is never built.

My recommendation is the script first.

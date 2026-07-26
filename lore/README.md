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

- **Pass 1 — the spine.** *(this pass, done)* Premise, cosmology, timeline, themes, all twelve
  races at identity-card depth, two full race bibles as exemplars, the narrator character,
  campaign shape, glossary, production scope.
- **Pass 2 — lock the forks.** Answer `08-open-questions.md`. Rewrite anything the answers
  invalidate. This is cheap now and expensive later; it is the most valuable pass.
- **Pass 3 — the twelve bibles.** Each race to the depth of `04-factions/01-terran-empire.md`:
  history, current leadership, how they speak, how they fight, what they want, who they hate,
  and three story hooks each.
- **Pass 4 — the campaign, mission by mission.** Objectives, opening and closing beats,
  briefing text, the mechanic each mission teaches, which AI opponent and why.
- **Pass 5 — the script.** Actual lines. Narrator barks for every event the engine already
  emits. Briefing monologues. Race hails. This is the voice-over recording script.
- **Pass 6 — the art bible.** Race silhouettes, crests, portrait states, briefing stills.
  Written as a brief an artist could work from without asking questions.
- **Pass 7 — implementation handoff.** Only now does any of this become code: a campaign
  scenario format, a dialogue table, an asset manifest.

We are at the end of Pass 1. The most useful thing you can do next is read `00-premise.md`
and `08-open-questions.md` and tell me where I guessed wrong.

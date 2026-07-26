# Game of Worlds — Lore and Narrative System

This folder is the source system for the setting: canon, design proposals, fiction, production copy,
and continuity audits. It is no longer only a speculative story bible. Parts of it now reach players
through the advisor, event text, map tooltips, the in-game Codex, and the shoal-naming flow.

The central intent is simple:

**Make the original game's risk-and-reward mechanics feel like facts about a wounded galaxy.**

Blind travel, lethal exploration, probes, scarce crystal, race restrictions, and permanent swept
routes are not obstacles for the fiction to explain away. They are the setting. The lore should make
each decision more legible and consequential, then give the player's actions a permanent place in
the world.

See `STATUS.md` for the current state, unresolved conflicts, and next priorities. `REPORT-CARD.md` is
the historical audit log, not the current backlog.

---

## Where to start

| Need | Read |
|---|---|
| Ten-minute factual orientation | `26-encyclopedia.md` |
| The whole premise in miniature | `00-premise.md` |
| Write or review canon | `11-laws-of-the-world.md`, `20-master-timeline.md`, `19-canon-and-variance.md`, `07-glossary.md`, then `03-themes.md` |
| Understand the twelve races | `04-factions/README.md`, then `12-civilisations/` and `14-peoples/` |
| Brief or review visual art | `visual-reference/`, then `../docs/art-direction/` |
| Work on player-facing narrative | `17-the-feed/`, `18-naming-the-dark.md`, `22-act-one.md`, and `24-anthology/` |
| Make a decision | `STATUS.md`, then the relevant entry in `08-open-questions.md` |
| Review production cost | `09-production.md` |

Do not begin with `REPORT-CARD.md`. It records how the work evolved and deliberately preserves old
assessments; it is poor navigation for the current world.

---

## Authority and status are different

The folder previously mixed approval state, source authority, and implementation state into one
label. Use two axes from now on.

### Canon state

- **LOCKED** — approved or dictated by shipped mechanics. A change requires an explicit decision
  and a continuity pass.
- **PROPOSED** — a recommendation written as if true so it can be judged in context.
- **OPEN** — a genuine unresolved fork. Do not build dependent canon on it.

If a claim has no label, treat it as **PROPOSED**.

### Delivery state

- **SHIPPED** — present in the running game.
- **READY** — production-shaped copy or design that can be implemented without a new creative pass.
- **REFERENCE** — supports writing and review; it is not itself a player-facing deliverable.
- **DESIGN** — proposes mechanics, UI, assets, or scope and still needs approval or costing.
- **HISTORY** — an audit snapshot retained for reasoning, not current instruction.

A file may be `LOCKED + REFERENCE`, `PROPOSED + READY`, or `PROPOSED + DESIGN`. “Canon” does not mean
“implemented,” and “shipped” does not automatically make every line good canon.

### Precedence

When two claims conflict, resolve them in this order and fix the loser:

1. **Shipped code and live data contracts.** Start with `server/lib/races.js`,
   `server/lib/map.js`, `server/lib/tech.js`, `server/server.js`, and
   `server/lib/victory.js`.
2. **`20-master-timeline.md`** for dates, sequence, and historical numbers.
3. **`11-laws-of-the-world.md`** for physical possibility and hard limits.
4. **`19-canon-and-variance.md`** for what is fixed before a match and what players decide.
5. **`07-glossary.md`** for vocabulary and spelling.
6. **`00-premise.md` and `03-themes.md`** for dramatic intent and tone.
7. Derived reference, fiction, proposals, and audit history.

`26-encyclopedia.md` is the best browseable summary, but it is a cache of higher authorities, not a
new authority. `02-timeline.md` is the readable era overview; `20-master-timeline.md` wins on facts.

---

## The folder by function

### Canon spine and writing rules

| Path | Role |
|---|---|
| `00-premise.md` | Logline, dramatic question, and one-page world. |
| `01-cosmology.md` | Fictional explanation of the engine's travel, charts, crystal, sectors, and scale. |
| `02-timeline.md` | Short, readable lineage of the eras. |
| `03-themes.md` | Tone, specificity, naming, and the writing checklist. |
| `07-glossary.md` | Naming authority. |
| `11-laws-of-the-world.md` | Constitution of hard limits. |
| `19-canon-and-variance.md` | Boundary between fixed canon and match outcomes. |
| `20-master-timeline.md` | Date and continuity authority. |
| `26-encyclopedia.md` | Fast A–Z reference derived from the authorities above. |

### The twelve races

| Path | Boundary |
|---|---|
| `04-factions/` | Roster, gameplay doctrine, military behaviour, and faction-bible template. Only Terran and Mechanicus have full doctrine bibles so far. |
| `12-civilisations/` | Places and material systems: geography, economy, government, food, architecture, and why the stat line exists. |
| `14-peoples/` | People and culture: temperament, leaders, beliefs, rituals, aesthetics, and attitudes toward the other eleven. |
| `21-matchups-and-mysteries.md` | Derived strategic asymmetries and who can know what. |

Keep those boundaries. Do not solve missing military doctrine in `14-peoples/`, or repeat cultural
rituals in `04-factions/`.

### Characters, campaign, and fiction

| Path | Role |
|---|---|
| `05-characters.md` | Rell and the seed cast. |
| `06-campaign.md` | Proposed single-player campaign shape. |
| `10-the-long-file/` | Twelve retrospective testimonies about the Unarriving. |
| `15-series-twelve/` | Twelve present-tense accounts of the Sweeping. |
| `16-rell.md` | Rell's protagonist arc and on-page scenes. |
| `22-act-one.md` | Three production-shaped mission scripts. |
| `23-interludes.md` | Three comic scenes that broaden the emotional register. |
| `24-anthology/` | 104 Codex-shaped pieces tied to game objects and systems. |
| `28-through-lines.md` | **Read before adding or editing any story piece.** The six lines that run across the whole folder, each plant in order and where it lands — so a new piece joins a line instead of starting a new loose one. Payoffs are test-guarded. |

The two testimony series are finished forms, not race-reference authorities. When a story disagrees
with the spine, repair the story.

### Visual reference

| Path | Role |
|---|---|
| `visual-reference/` | Generated reference boards for all twelve races, seed characters, standard ships, homeworlds, battles, hazards, crystal, relics, exploration hardware, weapons, and proposed Wonders. Includes a canon source map, current-art reconciliation, and prompt ledger. **REFERENCE**, not shipped art. |
| `../docs/art-direction/` | Shared UI composition, rendering, motion, and command-station direction. |

Visual reference follows the same authority rules as prose. An attractive image does not make an
unapproved anatomy, technology, Wonder, or emblem canon.

### Player-facing copy and co-authorship

| Path | Delivery |
|---|---|
| `17-the-feed/` | Source script for Rell-style event copy. Partially reflected in shipped server/advisor text; not integrated as a complete variant system. |
| `18-naming-the-dark.md` | Shoal naming. Curated player choice, persistence, map credit, and protocol are shipped; pervasive use of chart names in later feed messages remains. |
| `public/js/codex.js` | Shipped compact introduction to the galaxy, sectors, races, and vocabulary. |
| `public/js/advisor.js` | Shipped event reactions in twelve faction registers. This currently conflicts with the Rell-only narrative rule; see `STATUS.md`. |

### Mechanics and production proposals

| Path | Role |
|---|---|
| `09-production.md` | Art and voice scope. Needs reconciliation with current shipped text before recording. |
| `13-wonders/` | Proposed Wonders, technologies, hulls, and placeholder balance numbers. |
| `25-crystal.md` | Locked mechanical facts plus proposed interpretation and stories. |
| `27-the-unattributed.md` | Relics, the builders, and the Wonder victory. Canon **locked** (`08-open-questions.md` Q10); mechanics unbuilt, every number a placeholder. |

No Wonder or artifact proposal is implemented merely because its fiction is complete.

### Decisions and audits

| Path | Role |
|---|---|
| `08-open-questions.md` | Decision record containing resolved, withdrawn, and genuinely open questions. |
| `STATUS.md` | Current dashboard and prioritized issue list. |
| `REPORT-CARD.md` | Historical revision ledger and rubric. Preserve old sections as snapshots. |

---

## Working rules

1. **Verify the engine before extending the world.** The false “empty sector types 3–5” claim
   propagated through six passes because nobody opened `server/lib/map.js`.
2. **Change the authority first.** Then update summaries, fiction, production copy, and tests in that
   order.
3. **Distinguish fact from explanation.** A cost or probability copied from code can be locked while
   the fictional reason for it remains proposed.
4. **Prefer delivery over another reference layer.** This folder is already roughly 160,000 words.
   New prose should normally have a named player-facing destination.
5. **Keep mechanics honest.** Do not describe a harmless sector as damaging, an inert field as a
   discovery system, or a proposed Wonder as available play.
6. **Test duplicated constants and vocabulary.** Client copies cannot import every server module; when
   duplication is unavoidable, add a guard.
7. **Update `STATUS.md` after material decisions.** Add to `REPORT-CARD.md` only when a rubric outcome
   genuinely changes; do not use it as a running to-do list.

The numbered paths record the order the world grew. Do not physically reshuffle 114 files merely to
make the numbers prettier: links, tests, and production references depend on them. This index provides
the stable conceptual organization; a future physical migration should use machine-readable document
IDs and a link checker first.

# Production Visual Assets

Status: **PRODUCTION REFERENCE**. These are purpose-built, final-aspect-ratio assets and named
derivatives. They are ready to wire into a game surface, but they are not shipped merely because
they exist here. Runtime assets move to `public/images/` only when an implemented screen consumes
them.

The painted sources were generated with the built-in image-generation workflow. Deterministic crops,
sizes, cards, overlays, diagrams, and animated SVGs are rebuilt by:

```bash
python tools/build-lore-production-assets.py
```

The machine-readable inventory is [catalog.json](catalog.json). The condensed generation ledger is
[PROMPTS.md](PROMPTS.md).

## What is here

| Group | Deliverables |
|---|---|
| [Commander Rell](commander/) | Four-state source atlas; idle, speaking, alert, and signal-lost at 512×512 and 768×1024 |
| [Registry race glyphs](crests/) | Twelve UI identification glyphs at 32, 64, 128, and 512px |
| [Sector tiles](sectors/) | All eleven live sector types at 256 and 512px |
| [Map states](map-states/) | Fog, remembered, probe intel, owned, contested, and hazardous SVG overlays |
| [Race fleets](fleets/) | Twelve three-hull language sheets plus 36 individual 512px anchor silhouettes |
| [Battle effects](effects/) | Laser, plasma, missile, shield, explosion, wreckage, retreat, and warning sweep |
| [Event cards](events/) | Probe loss, shoal damage, collapsar annihilation, colony, victory, and defeat |
| [Construction](construction/) | Scaffolding, upgrading, damaged, disabled, and completed states |
| [Relics](relics/) | Five unique relic cards/icons, a world marker, and the universal Relic Lifter |
| [Console life](console/) | Animated scanlines, radar, warning lamp, waveform, static, sparks, cable, and steam SVGs |
| [Homeworlds](homeworlds/) | Twelve 960×540 final-ratio backdrops |
| [Campaign stills](campaign/) | Nine canonical narrative moments at briefing-screen ratio |
| [Inspiration posters](posters/) | Three text-free portrait key-art compositions |
| [Supporting UI](supporting/) | Diplomacy frames, victories, achievements, resources, fleet orders, tutorials, race cards, and landing hero |

The derivative builder currently records **223 named production derivatives**. Source atlases,
campaign stills, posters, and fleet sheets remain beside them so an artist can inspect context rather
than treating a crop as the only authority.

## Fleet language and actual access

The three anchors are not a promise that every race builds Scout / Colony / Dreadnought.
They follow `server/lib/races.js`:

| Race | Light anchor | Colony/support | Heavy anchor |
|---|---|---|---|
| Terran | Scout | Colony Ship | Dreadnought |
| Silicon | Scout | Colony processor | Carrier-battleship; no Dreadnought |
| Zephyr | Frigate swarm | Migration cluster | Cruiser mass; no capital hull |
| Crystalline | Scout shard | Colony lattice | Dreadnought |
| Void Walkers | Courier scout | Route-holder | Carrier; no Dreadnought |
| Mechanicus | Frigate; no Scout | Work vessel | Dreadnought |
| Bioform | Scout organism | Seed vessel | Dreadnought organism |
| Star Nomads | Trace scout | Colony caravan | Dreadnought |
| Ancients | Scout instrument | Hidden-volume colony vessel | Dreadnought |
| Quantum | Phase scout | State-anchor | Carrier-battleship; no Dreadnought |
| Titan Lords | Cruiser; no light hulls | Infrastructure colony ship | Dreadnought |
| Shadow Realm | Stealth scout | Nested colony vessel | Intruder-battleship; no Dreadnought/Carrier |

This is the intended production shortcut: derive the standard hull classes from each race's three
anchors instead of commissioning 108 unrelated concepts.

## Race glyphs are not twelve invented flags

Several civilizations canonically have no official insignia. The glyphs are the Terran Registry/game
interface's way of identifying a race:

- Zephyr, Crystalline, Bioform, Ancients, Quantum, and Shadow Realm do **not** suddenly carry these
  marks on their ships or buildings.
- the Star Nomad glyph is an interface abstraction of a convoy mark; real marks differ by hull;
- the Void Walker route stroke is vermilion, not the conflicting legacy purple;
- the Shadow glyph is a negative-space breach, never the conflicting purple eye.

At 32px, use the exports in `crests/32/`; do not downsample the atlas in CSS.

## Story review and selected visual spine

The corpus is strongest when a rule becomes a decision made by someone under pressure. The stills
therefore favor actions and physical evidence over encyclopedic spectacle.

| Still | Source | Why it earns an image |
|---|---|---|
| [Sesse's two seconds](campaign/01-sesses-two-seconds.png) | `22-act-one.md`, Mission 1 | Blind transit becomes a visible choice: doctrine broken, one hull saved |
| [Sesse's Crossing](campaign/02-sesses-crossing.png) | `22-act-one.md`, Mission 2 | The setting's grand idea lands as one person writing in a margin |
| [The schedule](campaign/03-the-schedule.png) | `22-act-one.md`, Mission 3; `28-through-lines.md` T2 | Rising pressure without a villain: a work order arriving on time |
| [Ninefold Patience](campaign/04-ninefold-patience.png) | `10-the-long-file/08-star-nomads.md` | The central mystery is physical evidence with not a mark on the paint |
| [Wren sideways](campaign/05-wren-sideways.png) | `10-the-long-file/05-void-walkers.md` | The one wager that paid, while refusing to give the unseen a shape |
| [They Could Not Be Moved](campaign/06-they-could-not-be-moved.png) | `24-anthology/15-they-could-not-be-moved.md` | The epic-scale battle is told through moons, mass, and a fixed gun |
| [Four hundred alone](campaign/07-four-hundred-alone.png) | `22-act-one.md`, Mission 3 | Zephyr's contradiction becomes geometry: suffering their law cannot perceive |
| [Three cards](campaign/08-three-cards.png) | `16-rell.md` | Rell's climax is a refusal performed through work, not a speech |
| [The trace market](campaign/09-trace-market.png) | `22-act-one.md`, Mission 2 | Warmth and comedy appear where nobody has died, while teaching trace decay |

The three posters carry the setting at increasing scale:

1. [The Lamps Are Out](posters/01-the-lamps-are-out.png) — the galaxy becomes blind.
2. [Every Map Is Written in Wrecks](posters/02-every-map-is-written-in-wrecks.png) — the player buys a
   route with reckoning and hulls.
3. [Roads Run Both Ways](posters/03-roads-run-both-ways.png) — rebuilding the road is also reopening
   the quarantine.

## Canon guardrails

- Never depict, silhouette, reflect, or name what is beyond the quarantine.
- The Ancients remain unseen; show instruments, installations, gaps, and consequences.
- A collapsar is primarily absence, not a fiery fantasy portal.
- A destroyed probe reports where telemetry ended, not what killed it.
- Relics have no readable seams or obvious construction method.
- Rell's alert state is quieter and more intent, not louder.
- “Production reference” is not “implemented.” Campaign, relic, and Wonder imagery must not imply
  those systems are already playable.

## Promotion into the game

When a screen is implemented:

1. copy only the consumed derivative into a named subfolder under `public/images/`;
2. keep its production path and lore source in the code review;
3. test it in the actual game/webview at the final display size;
4. leave the source atlas and unused variants here.

Do not copy the broad `../assets/` boards into the runtime. This folder is the bridge that was missing.


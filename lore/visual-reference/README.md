# Visual Reference Library

Status: **REFERENCE**. These images support writing, art direction, UI exploration, and future asset
briefs. They are not shipped game art, and an image never overrides the canon hierarchy in
`../README.md`.

This first library turns the written setting into one coherent visual vocabulary:

- fixed-camera, painterly 2D science fiction rather than glossy 3D concept art;
- dark command-station blacks, iron, bone, ochre, oxidized red, and crystal cyan;
- practical surfaces, old repairs, readable silhouettes, and restrained emissive light;
- species shown through their own material culture rather than the same human body in different
  costumes;
- hazards that feel dangerous before the interface explains them;
- no text, logos, or invented insignia inside the art. The mappings below are authoritative.

The boards are deliberately broad. They establish shared visual grammar before production commits to
hundreds of individual sprites, portraits, and race-by-hull variants.

For gameplay-scale assets, [icon-system/](icon-system/) contains a complete mapped set of 142
individual icons: every current research level, building state, standard ship type, and core action.
Each has an evocative alias plus its canonical mechanic.

## Asset index

All grids read left-to-right, then top-to-bottom.

| Board | Contents |
|---|---|
| [01-races-terran-to-crystalline.png](assets/01-races-terran-to-crystalline.png) | Terran; Silicon Collective; Zephyr Swarm; Crystalline |
| [02-races-void-to-nomads.png](assets/02-races-void-to-nomads.png) | Void Walkers; Mechanicus; Bioform; Star Nomads |
| [03-races-ancients-to-shadow.png](assets/03-races-ancients-to-shadow.png) | Ancients; Quantum; Titan Lords; Shadow Realm |
| [04-characters-terran.png](assets/04-characters-terran.png) | Ilsa Rell; Commander Vance; Dr. Mira Ito; Pilot Sesse |
| [05-characters-non-terran.png](assets/05-characters-non-terran.png) | Liaison Fourth; Keth; Analyst Nine; the Emissary |
| [06-ship-classes.png](assets/06-ship-classes.png) | Frigate; Destroyer; Scout; Cruiser; Battleship; Colony Ship; Dreadnought; Intruder; Carrier |
| [07-homeworlds.png](assets/07-homeworlds.png) | Terra; Sill; Churn; Sarn's World; Bell; Works; Ossa's Delta; Kettering; an Ancient installation; Osk's Flux; Ordel Deep; Sable's Dark |
| [08-battles-and-hazards.png](assets/08-battles-and-hazards.png) | Shoal crossing; collapsar arrival; Zephyr saturation attack; missiles bypassing a Crystalline shield |
| [09-crystal-relics-and-exploration.png](assets/09-crystal-relics-and-exploration.png) | Refined reckoning crystal; raw crystal; handheld relic; structural relic; probe; universal relic lifter |
| [10-weapons.png](assets/10-weapons.png) | Laser; plasma projector; basic rocket; Hyper-V missile; antimatter warhead; Crystalline Ringer |
| [11-wonders.png](assets/11-wonders.png) | Concord Lamp; Solved Sky; Ten Thousand Mouths; First Thickness; Whole Recitation; Endless Yard; Mother Grove; Reconciled Schedule; Closing; Unresolved Lane; Weight of Ages; Assembled Frame |
| [Gameplay icon system](icon-system/) | 108 research levels; 9 building states; 9 ship types; 16 player actions; aliases, canonical labels, source atlases, prompt ledger, and individual 256×256 PNGs |

## What is visually locked

These rules are supported by both the lore and the current art direction:

1. **Terran is repaired, procedural, and human-scale.** Paper, tape, handwriting, worn uniforms, and
   serial marks matter more than heroic polish.
2. **Silicon is not a metal person.** Its presence is read through heat management, machinery,
   light, and computation. Do not give it a human face.
3. **Zephyr is population and motion.** One individual is not a useful emblem for the Swarm. Use
   ochre, rust, dense silhouettes, and structures that feel occupied everywhere at once.
4. **Crystalline is lit geology.** Facets, internal stress, refraction, and mineral mass replace
   clothes and conventional anatomy.
5. **Void Walker identity is recitation and accumulated record.** Dust, bone, layered surfaces, and
   written continuity dominate; saturated colour is reserved for a route or a singular remembered
   fact.
6. **Mechanicus is work without theatre.** Repeated tools, gantries, maintenance marks, and
   production logic matter more than a central robot character.
7. **Bioform is living infrastructure.** Architecture, vessel, food, and organism should feel like
   related tissues, not a green coat applied to normal technology.
8. **Star Nomads are schedules made physical.** Modular habitats, route cords, repair layers, and
   inherited practical objects should outweigh sleek spacecraft glamour.
9. **The Ancients remain unseen.** Show consequences, installations, gaps, and impossible engineering.
   Do not invent an Ancient body, face, costume, or portrait.
10. **Quantum is conditional rather than ghostly.** Use doubled edges, mutually exclusive states,
    precise instruments, and restrained spectral colour without turning the culture into magic.
11. **Titan scale is infrastructure scale.** A hand, joint, chamber, or ship section may be more honest
    than fitting a whole Titan into frame.
12. **Shadow Realm is warm-dark and deliberately uncountable.** Short sightlines, overlapping rooms,
    market traces, and negative space are preferred. No official insignia should make the Realm tidy.

## Source map

The visual boards were checked against these authorities and implementation references:

| Subject | Primary written source | Runtime or production reference |
|---|---|---|
| Race bodies, clothing, colour, and cultural surfaces | `../14-peoples/01-terran.md` through `../14-peoples/12-shadow-realm.md` | `../../server/lib/races.js`, `../../public/images/races/` |
| Homeworlds, cities, environments, and material systems | `../12-civilisations/01-terra.md` through `../12-civilisations/12-shadow-realm.md` | `../../server/lib/map.js`, legacy planet/sector sprites in `../../public/images/` |
| Rell and the seed cast | `../05-characters.md`, `../16-rell.md`, `../22-act-one.md` | command-station commander panel and prototype portrait |
| Standard ship roles | `../24-anthology/02-hulls.md` | `../../server/lib/combat.js`, legacy ship sprites |
| Battles and hazards | `../01-cosmology.md`, `../11-laws-of-the-world.md`, `../24-anthology/01-sectors.md` | map hazard definitions and current sensor-map prototypes |
| Crystal | `../25-crystal.md`, `../24-anthology/04-weapons.md` | `../../public/images/crystal.png`, resource economy in the server |
| Relics and lifter | `../27-the-unattributed.md`, `../08-open-questions.md` Q10 | proposed mechanics only; no shipped art |
| Weapons | `../24-anthology/04-weapons.md`, `../24-anthology/14-race-weapons.md` | weapon and combat definitions in `../../server/lib/` |
| Wonders | `../13-wonders/README.md` and the twelve race files there | **DESIGN PROPOSAL** only; the victory hook is disabled |
| Shared rendering language | `../../docs/art-direction/` | `../../public/command-station-demo.html`, `../../public/images/command-station/` |

## Reconciliation with current in-game art

The current game contains art from several eras. It is useful evidence for gameplay readability, but
it is not a single coherent style authority.

| Existing art | Finding | Direction used here |
|---|---|---|
| Command-station shell, sensor map, and commander feed | Strong alignment with the fixed 2D, painterly, embedded-display direction | Preserved as the overall rendering grammar |
| Legacy ship sprites | Clearly separate hull classes, but use a shared generic fleet language and do not express race-specific silhouette rules | Board 06 establishes a coherent Terran/neutral baseline; race-specific fleets remain a later production pass |
| Legacy planets and sector images | Useful as compact map tokens, but too abstract to define inhabited worlds | Board 07 derives environments from civilisation files while retaining strong colour and silhouette separation |
| Existing crystal icon | Correctly makes crystal cyan and immediately legible, but does not distinguish raw material from precision-cut reckoning crystal | Board 09 separates raw and refined forms |
| Existing commander prototype | Fits the command-station mood but is not an authoritative portrait of Rell | Board 04 follows Rell's age, fatigue, ambiguity, uniform, and paper-based working habits |
| Silicon, Crystalline, Mechanicus, Bioform, Ancient, Quantum, and Titan faction marks | Several broadly support their material themes | Treated as symbols only, never proof of anatomy |
| Zephyr faction mark | Green palette conflicts with the written ochre/rust population aesthetic | Written lore wins |
| Void Walker faction mark | Saturated purple conflicts with the dust/bone palette and its rule that colour marks a singular route or memory | Written lore wins |
| Shadow Realm faction mark | Purple eye/insignia implies a unified official identity the lore rejects | Written lore wins; warm darkness, short sightlines, and absence replace the emblem |
| Legacy Star Nomad mark | Generic imported spacecraft art does not express schedules, repair culture, or modular habitation | Written lore wins |
| Legacy black-hole image | Readable as a hazard, but its photographic colour treatment does not match the command-station sensor language | Board 08 uses a severe red/orange tactical distortion and certain fleet loss |

## Production use

- Use a whole board to brief an illustrator, then use the panel mapping above to crop working
  references. Keep the original board beside any crop so its context is not lost.
- New player-facing art should be purpose-built at its final aspect ratio. Do not silently move these
  reference boards into `public/images/`.
- Race-specific ships should combine the hull role in board 06 with that race's material and
  silhouette rules. Board 06 is not permission to make every fleet Terran.
- Wonder art must remain labelled **DESIGN** until its mechanic is approved and implemented.
- Relics must remain seamless and unreadable. The corrected board intentionally removes panel seams
  or obvious joins that would imply an assembly method.
- Any future Ancient image must obey the no-body rule.
- If later canon changes, update this index first, then replace the affected board rather than
  allowing an old image to become accidental authority.

The generation specification and correction history are preserved in
[PROMPTS.md](PROMPTS.md).
